import pytest


@pytest.mark.asyncio
async def test_health_endpoint_exists(client):
    """Health endpoint should return 200 even if services are unavailable."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "version" in data
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_health_response_shape(client):
    """Health response should include all service statuses."""
    response = await client.get("/api/health")
    data = response.json()
    for key in ["db", "minio", "qdrant", "redis"]:
        assert key in data
        assert data[key] in ("ok", "error")
