# Observator — DevOps Deployment Guide

## Platform Overview

UAE Labour Market Intelligence Platform — 5M+ rows, 50 tables, real-time analytics.

| Component | Tech | Port |
|-----------|------|------|
| Frontend | React 18 + Vite + Tailwind | 80 (Nginx) |
| Backend | Python 3.12 + FastAPI + SQLAlchemy async | 8000 |
| Database | PostgreSQL 16 | 5432 |
| Cache | Redis 7 | 6379 |
| Vector DB | Qdrant (optional) | 6333 |
| Storage | MinIO / Azure Blob (optional) | 9000 |

---

## Option A: Supabase + Vercel + Railway (Fastest, ~$30-45/month)

### 1. Database — Supabase

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name: `observator`, Region: pick closest (no UAE region available)
3. Note the password you set
4. Go to **Settings → Database → Connection string → URI**
5. Copy: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`

**Restore the dump:**
```bash
# Install pg tools if needed: brew install postgresql
pg_restore \
  --no-owner --no-acl \
  -h aws-0-<region>.pooler.supabase.com \
  -p 6543 \
  -U postgres.<ref> \
  -d postgres \
  observator_db.dump
```

**Verify:**
```sql
-- In Supabase SQL Editor
SELECT count(*) FROM fact_supply_talent_agg;  -- Should be ~842K
SELECT count(*) FROM dim_course;               -- Should be ~19K
SELECT count(*) FROM fact_job_skills;           -- Should be ~3M
```

### 2. Backend — Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Connect repo: `MuhammadAbdullah95/observator`
3. Set **Root Directory**: `observator-backend`
4. Set **Start Command**: `uvicorn src.main:create_app --factory --host 0.0.0.0 --port 8000`

**Environment variables (Railway → Variables):**
```env
DATABASE_URL=postgresql+asyncpg://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
SECRET_KEY=<generate: openssl rand -hex 32>
OPENAI_API_KEY=<your-openai-key>
OPENAI_MODEL=gpt-4o
TAVILY_API_KEY=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
REDIS_URL=redis://default:<password>@<railway-redis-host>:6379
ALLOWED_ORIGINS=https://observator.vercel.app,https://your-domain.com
UV_HTTP_TIMEOUT=120
```

**Add Redis** in Railway: New Service → Redis

### 3. Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) → Import Git Repository
2. Connect: `MuhammadAbdullah95/observator`
3. Set **Root Directory**: `uae-labour-pulse`
4. Set **Build Command**: `npm run build`
5. Set **Output Directory**: `dist`
6. Set **Framework Preset**: Vite

**Environment variable (Vercel → Settings → Environment Variables):**
```env
VITE_API_URL=https://<railway-backend-url>/api
```

### 4. Verify
- Frontend: `https://observator.vercel.app`
- Backend: `https://<railway-url>/api/health`
- Login: `admin@observator.ae` / `admin123`

---

## Option B: Azure UAE North (Production, data sovereignty, ~$85-115/month)

### 1. Prerequisites
```bash
brew install azure-cli
az login
az account set --subscription "<subscription-id>"
```

### 2. Create Resources
```bash
# Resource group
az group create --name observator-rg --location uaenorth

# PostgreSQL Flexible Server
az postgres flexible-server create \
  --resource-group observator-rg \
  --name observator-db \
  --location uaenorth \
  --admin-user observator \
  --admin-password '<STRONG_PASSWORD>' \
  --sku-name Standard_B2s \
  --storage-size 64 \
  --version 16

# Allow connections
az postgres flexible-server firewall-rule create \
  --resource-group observator-rg \
  --name observator-db \
  --rule-name AllowAll \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 255.255.255.255

# Container Registry
az acr create --resource-group observator-rg --name observatoracr --sku Basic

# VM for containers
az vm create \
  --resource-group observator-rg \
  --name observator-vm \
  --location uaenorth \
  --image Ubuntu2204 \
  --size Standard_B2s \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard
```

### 3. Restore Database
```bash
# From local machine
pg_restore \
  --no-owner --no-acl \
  -h observator-db.postgres.database.azure.com \
  -U observator \
  -d observator \
  observator_db.dump
```

### 4. Deploy on VM
```bash
# SSH into VM
ssh azureuser@<vm-ip>

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker azureuser

# Clone repo
git clone https://github.com/MuhammadAbdullah95/observator.git
cd observator

# Create .env
cat > observator-backend/.env << 'EOF'
DATABASE_URL=postgresql+asyncpg://observator:<PASSWORD>@observator-db.postgres.database.azure.com:5432/observator
SECRET_KEY=<generate: openssl rand -hex 32>
OPENAI_API_KEY=<key>
OPENAI_MODEL=gpt-4o
TAVILY_API_KEY=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
REDIS_URL=redis://redis:6379
ALLOWED_ORIGINS=https://your-domain.com
EOF

# Deploy
docker compose -f docker-compose.prod.yml up -d
```

### 5. Open Ports
```bash
az vm open-port --resource-group observator-rg --name observator-vm --port 80 --priority 100
az vm open-port --resource-group observator-rg --name observator-vm --port 443 --priority 101
```

---

## Database Details

### Size
| Metric | Value |
|--------|-------|
| Dump file | 31 MB (compressed) |
| Uncompressed | ~200 MB |
| Total rows | ~5M |
| Tables | 50 (43 tables + 7 materialized views) |
| Largest table | fact_job_skills (3M rows) |

### Key Tables
| Table | Rows | What |
|-------|------|------|
| fact_supply_talent_agg | 842K | UAE workforce by emirate/gender/age |
| fact_demand_vacancies_agg | 37K | LinkedIn job postings |
| fact_job_skills | 3M | Skills per job (ESCO mapped) |
| fact_course_skills | 24.8K | Skills per university course |
| fact_occupation_skills | 322K | ESCO occupation-skill taxonomy |
| dim_course | 19.2K | University courses (100+ unis) |
| dim_occupation | 3.9K | ESCO occupations |
| dim_skill | 21.5K | ESCO skills |
| dim_institution | 168 | UAE universities |
| dim_program | 3.9K | Degree programs |
| vw_gap_cube | 2.7K | Supply vs demand per occupation |
| vw_skill_gap | 13K | Supply vs demand per skill |

### Materialized Views (auto-refresh every 6h)
Views are created during app startup. If they don't exist after restore:
```sql
-- Run from observator-backend/scripts/create_views.sql
\i scripts/create_views.sql
```

### Default Admin Account
- Email: `admin@observator.ae`
- Password: `admin123`
- Role: ADMIN

**CHANGE THIS IN PRODUCTION.**

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| DB restore fails with FK errors | Use `--no-owner --no-acl` flags |
| Views missing after restore | Run `create_views.sql` manually |
| Frontend shows "Offline" | Check `VITE_API_URL` points to backend |
| 401 on all APIs | Login expired. Token TTL = 24h |
| Redis connection refused | Ensure Redis is running, check `REDIS_URL` |
| Slow queries | Run `REFRESH MATERIALIZED VIEW vw_gap_cube;` |
| bcrypt error | Use `bcrypt` directly, NOT `passlib` |
| Docker build timeout | Set `ENV UV_HTTP_TIMEOUT=120` in Dockerfile |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                   USERS                      │
│         (Browser → HTTPS → Nginx)            │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Frontend (React SPA)                        │
│  Vercel / Nginx on VM                        │
│  Port 80/443                                 │
│  Static files from: npm run build → dist/    │
└──────────────────┬──────────────────────────┘
                   │ /api/*
┌──────────────────▼──────────────────────────┐
│  Backend (FastAPI)                            │
│  Railway / Docker on VM                      │
│  Port 8000                                   │
│  uvicorn src.main:create_app --factory       │
├──────────────────────────────────────────────┤
│  Key API Routes:                             │
│  /api/health           → health check        │
│  /api/login            → JWT auth            │
│  /api/dashboards/*     → dashboard data      │
│  /api/supply-dashboard → supply metrics      │
│  /api/demand-insights  → demand analytics    │
│  /api/skill-matching/* → skill gap analysis  │
│  /api/explorer/*       → drill-down filters  │
│  /api/ai-impact/*      → AI exposure data    │
│  /api/knowledge-base/* → table browser       │
│  /api/chat             → AI research agent   │
└─────┬────────────┬───────────────────────────┘
      │            │
┌─────▼────┐  ┌────▼─────┐
│ PostgreSQL│  │  Redis   │
│ Supabase  │  │  Cache   │
│ or Azure  │  │  6379    │
│ 5432      │  └──────────┘
│ 50 tables │
│ 5M rows   │
└───────────┘
```
