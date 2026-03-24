# Observator — UAE Labour Market Intelligence Platform

> **RULE: Keep this file updated.** After every significant change, update the relevant sections. This is the single source of truth for future Claude sessions.

## 1. Project Overview

UAE Labour Market Intelligence Platform — real-time analytics, AI insights, skill gap analysis, AI impact assessment, demand forecasting. Bilingual AR/EN. B2G for UAE government.

**Monorepo layout**: `uae-labour-pulse/` (PRIMARY React frontend), `observator-backend/` (FastAPI), `terraform/`, `scripts/`, `.github/workflows/`. Note: `frontend/` is LEGACY — ignore it.

## 2. Tech Stack

### Backend (`observator-backend/`)
Python 3.12 | FastAPI + SQLAlchemy async + asyncpg | PostgreSQL 16 + PostGIS | Redis (6379) | Qdrant (6333) | MinIO (9000)
- **Package Manager**: `uv` (NEVER pip)
- **Auth**: JWT via python-jose + bcrypt (NOT passlib)
- **AI/Agent**: LangGraph 1.1 ReAct with **OpenAI** (NOT Anthropic), model: `gpt-5.4`
- **Observability**: Langfuse 4.0 (optional, graceful fallback)
- **Key deps**: langgraph>=1.1.0, langchain-openai>=1.1.11, openai>=2.26.0, langfuse>=4.0.0, statsmodels

### Frontend (`uae-labour-pulse/`)
React 18.3.1 + TypeScript 5.8.3 | Vite 5.4.19 | Tailwind 3.4.17 + Shadcn/UI | Recharts | Framer Motion | React Router 6 | TanStack React Query | Sonner
- **Path alias**: `@` → `./src` | **Dev port**: 8080
- **API base**: `import.meta.env.VITE_API_URL || "/api"` (must use `||` not `??` — Docker sets empty string)

## 3. Key Backend Structure (`observator-backend/src/`)

```
src/
├── main.py / config.py / dependencies.py   # App factory, settings, DI
├── services/analytics_engine.py             # Single source of truth for ALL formulas
├── services/cache.py                        # Redis cache (1h TTL, auto-invalidation)
├── api/                    # 15 routers: auth, dashboard, chat, chat_stream, skill_gap,
│                           #   ai_impact, forecast, query, filters, evidence, reports,
│                           #   university, admin, files, health
├── models/                 # SQLAlchemy: base, dim, fact, auth, dashboard, evidence, audit
├── schemas/                # Pydantic request/response
├── agent/                  # LangGraph ReAct (agent_node → should_continue → tools → loop)
├── query_compiler/         # JSON → SQL (whitelisted views, parameterized queries)
├── evidence/               # Qdrant semantic search + SQL fallback + citations
├── forecasting/            # Linear trend + ETS, 5 scenarios, batch support
├── ingestion/              # GenericLoader + MappingRegistry (14 configs), PII scrubber
│   ├── transforms.py       # 18 reusable transform functions
│   ├── mappings.py          # 14 source mapping configs
│   └── scheduler.py         # APScheduler for view refresh
└── reporting/              # WeasyPrint + Jinja2 PDF (4 templates), email delivery
```

### Frontend Pages (13 routes, all lazy-loaded except Dashboard)
`/login` `/` `/skill-gap` `/ai-impact` `/forecast` `/chat` `/knowledge-base` `/reports` `/university` `/agents` `/admin` `/settings`

## 4. Development Setup

```bash
# Backend
cd G:/Observer-agent/observator-backend
docker compose up -d                    # postgres:5433, redis:6379, qdrant:6333, minio:9000
uv sync
uv run python scripts/init_db.py       # Fresh DB: creates tables + constraints + stamps Alembic
uv run python scripts/seed_master_tables.py  # Seeds all data in dependency order
uv run uvicorn src.main:create_app --factory --port 8000 --reload

# Frontend
cd G:/Observer-agent/uae-labour-pulse
npm install && npm run dev              # http://localhost:8080
```

**Required env vars**: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SECRET_KEY`
**Optional**: `LANGFUSE_*`, `REDIS_URL`, `QDRANT_URL`, `MINIO_*`

## 5. AWS Deployment (Testing)

- **EC2** t3.medium us-east-1 | **ID**: i-03da75ccf77e64fc3 | **IP**: 52.3.74.70
- **Profile**: `products-account` | **Access**: SSM (preferred) or SSH key `observator-testing`
- **S3 bucket**: `observator-deploy-063477643083`
- **Admin**: admin@observator.ae / admin123

Deploy via `docker-compose.prod.yml` (frontend/nginx, api, postgres, redis, qdrant, minio).
Scripts: `deploy-testing.sh`, `quick-deploy.sh`, `health-check-testing.sh`, `rollback.sh`

## 6. Architecture Decisions

### Analytics Engine (`services/analytics_engine.py`) — SINGLE SOURCE OF TRUTH
- SGI: `(demand - supply) / demand * 100` | Status: Critical(>20%), Moderate(5-20%), Balanced(-5..5%), Surplus
- AI composite: task_auto=0.40, adoption=0.25, market=0.20, replacement=0.15
- Frontend uses backend `status` field directly — no re-derivation

### Agent (LangGraph)
- OpenAI via ReAct pattern | Tools: `query_warehouse`, `list_available_views`, `get_view_schema`
- Internet search: toggleable, DuckDuckGo fallback | SSE streaming via `/api/chat/stream`
- AsyncPostgresSaver (prod) / AsyncSqliteSaver (Windows dev)

### QueryPlan Compiler
- Whitelisted views only | Filter operators: `__gte`, `__lte`, `__like`
- SQL injection prevention: regex identifier validation + parameterized queries

### Caching
- Redis: 6h TTL web search, 1h TTL analytics (auto-invalidated after view refresh)
- Graceful fallback: all endpoints work without Redis

### Pipeline
- Async via `asyncio.create_task()` — NEVER synchronous (blocks API + exhausts DB pool)
- Frontend polls `/api/pipeline/status/{run_id}` every 2s

## 7. API Endpoints (`/api/` prefix)

**Auth**: `POST login/register/logout`
**Dashboard**: `GET dashboards/summary`, `GET/POST dashboards`
**Analytics**: `GET skill-gap`, `GET ai-impact`, `GET forecasts`, `POST forecasts/generate|batch`
**Agent**: `POST chat`, `POST chat/stream`
**Data**: `POST query`, `GET filters`, `GET/POST evidence/*`, `POST files/upload`
**Reports**: `POST reports` (JSON or PDF)
**Admin**: `GET admin/users|audit|datasources`, `POST admin/datasources/refresh`
**Pipeline**: `POST pipeline/run`, `GET pipeline/status/{id}|runs|data-preview/{id}`
**Notifications**: `GET notifications|count`, `POST notifications/{id}/read|read-all`
**Scheduler**: `GET scheduler/sources`, `POST scheduler/sources/{type}/toggle|run-now`
**Other**: `GET university`, `GET/PUT settings`, `GET health`

## 8. Design System

- **Colors**: Navy `#003366`, Gold `#C9A84C`, Teal `#007DB5` — **light theme only**
- **SGI colors**: Critical `#DE350B`, Shortage `#FFAB00`, Balanced `#00875A`, Surplus `#0052CC`
- **Typography**: Inter (EN), Tajawal (AR) | **Bilingual**: `t(ar, en)` via LanguageContext
- **Conventions**: `uv` only, React Query for server state, Context for UI state, Error Boundary on all pages, lazy loading all pages except Dashboard

## 9. Common Issues (Active)

| Issue | Fix |
|-------|-----|
| Docker build timeout | `ENV UV_HTTP_TIMEOUT=120` in Dockerfile |
| bcrypt/passlib error | Use `bcrypt` directly, NOT `passlib` |
| DuckDuckGo wrong lang in Docker | Set `region="wt-wt"` (container IP geo-locates to China) |
| `VITE_API_URL` empty in Docker | Use `\|\|` not `??` |
| Fresh DB with Alembic FK errors | Use `scripts/init_db.py` (not raw Alembic) |
| Views not created | Run `create_views.sql` via psql (Python SQL splitter broken for DDL) |
| Alembic detects PostGIS tiger tables | `include_object` filter in `env.py` excludes them |
| Langfuse connection failure | Graceful fallback — agent works without it |
| psycopg v3 async on Windows | Use AsyncSqliteSaver, not AsyncPostgresSaver |
| Vite proxy buffers SSE | Use `VITE_API_URL=http://127.0.0.1:8000/api` for direct connection |
| Seed scripts: `No module named 'src'` | Add `sys.path.insert(0, str(Path(__file__).resolve().parents[1]))` |
| SSM commands fail with f-strings | Use S3 upload → `docker cp` → `docker exec` approach |

## 10. Deployment Rules

1. **Fresh DB**: `init_db.py` → `purge_all_data.py` → `seed_master_tables.py` (phases A-I in order)
2. **Deploy via S3+SSM**, not SSH — SSH key can be lost
3. **Always Elastic IP** — dynamic IPs change on reboot
4. **Always IAM role with SSM** — prevents lockout
5. **Seed dims before facts** — FK constraints
6. **Never pipeline sync** — always `asyncio.create_task()`
7. **Docker scripts**: Dockerfile now copies scripts, but verify after rebuild
8. **AL2023 curl conflict**: `dnf install -y --allowerasing`

## 11. Materialized Views (9 total)

`vw_supply_talent` `vw_demand_jobs` `vw_supply_education` `vw_ai_impact` `vw_gap_cube` `vw_forecast_demand` `vw_skills_taxonomy` `vw_education_pipeline` `vw_population_demographics`

These are the ONLY data sources the LangGraph agent can query (via QueryPlan compiler).

## 12. Production Infrastructure (Future)

Dev: Docker for all services. Production: RDS PostgreSQL 16 (Multi-AZ), ElastiCache Redis, S3 (not MinIO).
Azure UAE North for data sovereignty (not yet built). Pipeline at scale: Celery + SQS replaces asyncio tasks.

## 13. Completion Status (~85% of PRD)

**Production** (deployed 2026-03-18): 575K rows, 9 views, 41K demand jobs, 114K supply records, ZERO mock data.

**Complete**: Auth/RBAC, 16 routers/40+ endpoints, 13 pages, LangGraph agent + SSE, analytics engine, skill gap, AI impact, forecasting, evidence/citations, bilingual UI, PDF reports, 18-agent pipeline, notifications, scheduler, data quality, PII scrubbing, university alignment, settings persistence, real ESCO/AIOE/LinkedIn/FCSC/Bayanat data.

**Not built**: UAE PASS SSO, Azure UAE North, visual dashboard builder, mobile app, WCAG 2.1 AA, RTL-first Arabic.

**Next priorities**: (1) UAE PASS SSO (2) Azure migration (3) Dashboard builder UI

## 14. Data Seeding (14 mappings via GenericLoader)

Config-driven: `ingestion/mappings.py` (14 configs) → `ingestion/generic_loader.py` → DB.
Key sources: ESCO taxonomy (6K occ, 28K skills, 126K relations), LinkedIn jobs (37K), FCSC workforce (3K), Bayanat employment (179K), AIOE scores (1.5K), HE institutions (151).
Scripts: `seed_master_tables.py` (orchestrator), `purge_all_data.py` (TRUNCATE).
