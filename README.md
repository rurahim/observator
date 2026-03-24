# Observator — UAE Labour Market Intelligence Platform

> Real-time analytics, AI insights, skill gap analysis, AI impact assessment, and demand forecasting for the UAE labour market. Bilingual AR/EN. B2G platform for UAE government.

## Quick Start

```bash
# 1. Backend
cd observator-backend
cp .env.example .env          # Add your OPENAI_API_KEY
docker compose up -d           # PostgreSQL, Redis, MinIO, Qdrant
uv sync                        # Install Python deps
uv run python scripts/init_db.py  # Create tables + constraints
# Restore clean data:
docker cp observator_clean_dump.backup observator-backend-postgres-1:/tmp/
docker exec observator-backend-postgres-1 bash /tmp/restore_backup.sh /tmp/clean_dump.backup
uv run python scripts/fix_users_after_restore.py
uv run python scripts/generate_forecasts_only.py
uv run uvicorn src.main:create_app --factory --port 8000 --reload

# 2. Frontend
cd uae-labour-pulse
npm install
npm run dev                    # http://localhost:8080

# 3. Login
# admin@observator.ae / admin123
```

## Architecture

```
observator/
├── observator-backend/      # FastAPI + PostgreSQL + LangGraph
│   ├── src/
│   │   ├── api/             # 25 REST endpoints
│   │   ├── agent/           # LangGraph ReAct agent (GPT-5.4)
│   │   ├── pipeline/        # 18-agent data processing pipeline
│   │   ├── models/          # SQLAlchemy ORM (38 tables)
│   │   ├── services/        # Analytics engine, cache, profiler
│   │   └── ingestion/       # GenericLoader, transforms, mappings
│   ├── scripts/             # Seed, migrate, analyze, deploy
│   └── tests/               # Golden dataset, API tests
├── uae-labour-pulse/        # React + TypeScript + Vite
│   ├── src/
│   │   ├── pages/           # 14 pages (Dashboard, SkillGap, AI Impact...)
│   │   ├── components/      # Shared UI, charts, visualizations
│   │   ├── api/             # Hooks, types, client
│   │   └── contexts/        # Auth, Filter, Language
├── docker/                  # Dockerfiles (backend, frontend, nginx)
├── docker-compose.prod.yml  # Production deployment
├── CLAUDE.md                # AI assistant instructions
└── AUDIT_REPORT.md          # Page-by-page audit with issues
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy async, asyncpg |
| Database | PostgreSQL 16 + PostGIS |
| AI Agent | LangGraph 1.1, OpenAI GPT-5.4, langchain-openai |
| Cache | Redis 7.4 |
| Storage | MinIO (S3-compatible) |
| Vector DB | Qdrant |
| Frontend | React 18, TypeScript 5.8, Vite 5, Tailwind, Shadcn/UI |
| Charts | Recharts, Framer Motion |
| Deploy | Docker Compose, AWS EC2, S3+SSM |

## Database (1.24M rows)

| Table | Rows | Source |
|-------|------|--------|
| fact_supply_talent_agg | 842,531 | Bayanat MOHRE, GLMM |
| fact_occupation_skills | 321,806 | ESCO taxonomy |
| fact_demand_vacancies_agg | 37,380 | LinkedIn, MOHRE, JSearch |
| dim_skill | 21,574 | ESCO |
| dim_occupation | 4,059 | ESCO |
| fact_supply_graduates | 4,230 | Bayanat education |
| fact_ai_exposure_occupation | 2,218 | AIOE, FreyOsborne, GPTs |
| fact_salary_benchmark | 71 | Glassdoor |

## Key Features

- **Executive Dashboard** — KPIs, supply/demand trends, emirate map, sector donut
- **Skill Gap Analysis** — occupation-level SGI, trend chart, critical shortages
- **AI Impact Explorer** — 2,218 occupations scored, sector radar, skill clusters
- **Forecasts** — 768 forecast points, linear trend + ETS models
- **AI Query (Chat)** — LangGraph agent queries DB + searches internet
- **18-Agent Pipeline** — file upload → schema detect → normalize → load → refresh views
- **Data Explorer** — browse all 9 materialized views with pagination
- **University Alignment** — program coverage, missing skills, recommendations
- **Bilingual** — Arabic/English via LanguageContext

## Production Deployment

```bash
# EC2 instance: i-03da75ccf77e64fc3, IP: 52.3.74.70
./scripts/deploy-prod-real-data.sh
```

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | AI assistant context (tech stack, conventions, issues) |
| `AUDIT_REPORT.md` | Page-by-page audit with all known issues |
| `observator-backend/scripts/init_db.py` | Authoritative DB initialization |
| `observator-backend/scripts/fix_users_after_restore.py` | Post-restore fixes |
| `observator-backend/scripts/create_views.sql` | All materialized view definitions |
| `observator-backend/observator_clean_dump.backup` | Clean database dump (9.2MB) |

## Credentials

- **Admin**: admin@observator.ae / admin123
- **Analyst**: analyst@observator.ae / test123
- **Executive**: executive@observator.ae / test123
