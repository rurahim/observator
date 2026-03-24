"""Vector store for semantic evidence search via Qdrant.

Indexes evidence summaries as embeddings for semantic retrieval.
Uses OpenAI text-embedding-3-small for cloud-hosted embeddings.
Falls back to SQL-based search when Qdrant is unavailable.
"""
import logging
from uuid import UUID

logger = logging.getLogger(__name__)

COLLECTION_NAME = "evidence"
VECTOR_DIM = 1536  # OpenAI text-embedding-3-small output dimension


async def ensure_collection() -> bool:
    """Ensure the Qdrant collection exists. Returns True if available."""
    try:
        from qdrant_client.models import Distance, VectorParams
        from src.dependencies import get_qdrant

        client = get_qdrant()
        collections = client.get_collections().collections
        names = {c.name for c in collections}

        if COLLECTION_NAME not in names:
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
            )
            logger.info(f"Created Qdrant collection '{COLLECTION_NAME}'")

        return True
    except Exception as e:
        logger.warning(f"Qdrant unavailable: {e}")
        return False


async def index_evidence(
    evidence_id: str,
    text: str,
    metadata: dict | None = None,
) -> bool:
    """Index an evidence entry in Qdrant for semantic search."""
    try:
        from qdrant_client.models import PointStruct
        from src.dependencies import get_qdrant

        embedding = await _get_embedding(text)
        if embedding is None:
            return False

        client = get_qdrant()
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=evidence_id,
                    vector=embedding,
                    payload={
                        "text": text[:1000],
                        **(metadata or {}),
                    },
                )
            ],
        )
        return True
    except Exception as e:
        logger.warning(f"Failed to index evidence {evidence_id}: {e}")
        return False


async def search_similar(
    query: str,
    k: int = 5,
    file_ids: list[str] | None = None,
) -> list[dict]:
    """Search for semantically similar evidence."""
    try:
        from qdrant_client.models import FieldCondition, Filter, MatchAny
        from src.dependencies import get_qdrant

        embedding = await _get_embedding(query)
        if embedding is None:
            return []

        search_filter = None
        if file_ids:
            search_filter = Filter(
                must=[FieldCondition(key="dataset_id", match=MatchAny(any=file_ids))]
            )

        client = get_qdrant()
        results = client.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            limit=k,
            query_filter=search_filter,
        )

        return [
            {
                "evidence_id": str(r.id),
                "score": r.score,
                "text": r.payload.get("text", ""),
                "metadata": {k: v for k, v in r.payload.items() if k != "text"},
            }
            for r in results
        ]
    except Exception as e:
        logger.warning(f"Qdrant search failed: {e}")
        return []


# --- Embedding helper (OpenAI cloud-hosted) ---

_client = None


async def _get_embedding(text: str) -> list[float] | None:
    """Get embedding vector using OpenAI text-embedding-3-small.

    Cloud-hosted — no local GPU or PyTorch needed.
    """
    global _client
    try:
        if _client is None:
            from openai import OpenAI
            from src.config import settings
            _client = OpenAI(api_key=settings.OPENAI_API_KEY)
            logger.info("Initialized OpenAI embeddings client (text-embedding-3-small)")

        response = _client.embeddings.create(
            input=text[:8000],  # API limit
            model="text-embedding-3-small",
        )
        return response.data[0].embedding
    except ImportError:
        logger.warning("openai package not installed, skipping embedding")
        return None
    except Exception as e:
        logger.error(f"OpenAI embedding failed: {e}")
        return None
