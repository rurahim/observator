# Observator — User Guide

> UAE Labour Market Intelligence Platform — 5 sections, real data, zero mock.

## Quick Start

```bash
# Terminal 1 — Backend
cd observator-backend
docker compose up -d          # Postgres:5433, Redis:6379, Qdrant:6333, MinIO:9000
uv run uvicorn src.main:create_app --factory --port 8000 --reload

# Terminal 2 — Frontend
cd uae-labour-pulse
npm install && npm run dev    # http://localhost:8080
```

**Login**: `admin@observator.ae` / `admin123`

---

## 1. Supply Side (`/`)

What you see when you land. The entire education-to-workforce pipeline.

| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **KPI Cards** | Institutions (93), Programs (855), Enrolled, Graduates | Bayanat + CAA + Web Scrape |
| **Enrollment Trend** | 2002-2025 area chart (gold dots = estimated, navy = actual) | Bayanat Education (397 CSVs) |
| **Education Funnel** | Enrolled > Graduated > Employed conversion | Bayanat + MOHRE |
| **By Emirate** | Enrollment distribution across 7 emirates | Bayanat HE Stats |
| **Gender Split** | Male/Female donut chart | Bayanat Education |
| **Degree Levels** | Bachelor/Master/PhD/Diploma bar chart | CAA + Web Scrape (20 unis) |
| **Specialization Treemap** | Top fields by enrollment size | Bayanat + SCAD |
| **STEM Ring** | STEM vs Non-STEM animated ring | Derived from program classification |
| **Graduate Trend** | Annual graduates over time | Bayanat Graduates |
| **Institution Ranking** | Table: programs, graduates, emirate | CAA + Bayanat (93 institutions) |
| **Workforce Alignment** | Supply vs Demand per occupation with gap status | MOHRE + LinkedIn |
| **Data Sources** | Expandable panel with row counts per source | All sources |

---

## 2. Demand Side (`/demand`)

Job market — who's hiring, where, what skills.

| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **KPI Cards** | Total postings, companies, sectors, monthly growth | LinkedIn UAE (37K jobs) |
| **Monthly Volume** | Job posting trend area chart | LinkedIn 2024-2025 |
| **Top Industries** | Horizontal bar chart — top 10 sectors | LinkedIn industry tags |
| **UAE Heatmap** | SVG map colored by demand per emirate | LinkedIn + MOHRE |
| **Experience Levels** | Entry/Mid/Senior/Executive donut | LinkedIn experience field |
| **Employment Types** | Full-time/Part-time/Contract/Remote bars | LinkedIn job type |
| **Top Companies** | Ranked list with job counts | LinkedIn company data |
| **ISCO Distribution** | Treemap of occupation major groups | ISCO-08 mapped from LinkedIn |
| **Salary Benchmarks** | Table with min/median/max + visual range bar | JSearch API + LinkedIn |
| **Top Occupations** | Supply vs Demand side-by-side bars with gap badge | Gap Cube (vw_gap_cube) |
| **Data Quality** | Missing %, standardization %, duplicates | Automated pipeline stats |

---

## 3. Analytics & Forecasting (`/analytics`)

Three tabs — gap analysis, forecasting, scenario planning.

### Tab: Gap Analysis
| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **5 KPIs** | Supply, Demand, Gap, SGI%, Critical Shortages | vw_gap_cube (materialized view) |
| **SGI Trend** | Monthly SGI % line with 20% critical threshold | vw_gap_cube time series |
| **Supply vs Demand** | Dual area chart showing gap as shaded region | vw_supply_talent + vw_demand_jobs |
| **Diverging Bars** | Top 15 occupations — red=shortage, blue=surplus | Analytics Engine SGI formula |
| **Sector Donut** | Sector distribution pie chart | vw_demand_jobs |
| **Emirate Comparison** | Grouped bars + SGI line per emirate | vw_gap_cube by region |
| **Occupation Table** | Searchable table: supply, demand, gap, SGI, status | vw_gap_cube (50 rows) |

**SGI Formula**: `(demand - supply) / demand * 100` — Status: >20% Critical, 5-20% Moderate, +/-5% Balanced, <-5% Surplus.

### Tab: Forecasting
| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **Controls** | Model (Auto/Linear/ETS), Horizon (6-36mo) | User selection |
| **Forecast Chart** | Historical + predicted + confidence band | fact_forecast + ETS/Linear models |
| **Metrics** | MAPE, RMSE accuracy | Model evaluation |

### Tab: Scenarios
| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **5 Presets** | Baseline, Optimistic, Pessimistic, Emiratisation Push, AI Disruption | Scenario engine |
| **Overlay Chart** | All active scenarios on one chart | Scenario multipliers on baseline |
| **Radar Comparison** | Impact dimensions across scenarios | Scenario parameters |

---

## 4. Knowledge Base (`/knowledge-base`)

Browse every table in the database. 28 tables across 6 categories.

### Categories
| Category | Tables | What's Inside |
|----------|--------|---------------|
| **Dimensions** | dim_time, dim_region, dim_occupation, dim_skill, dim_sector, dim_discipline, dim_institution, dim_program | Reference data — 7 emirates, 1000+ occupations, 14K skills, 93 institutions, 855 programs |
| **Facts - Labour** | fact_supply_talent_agg, fact_demand_vacancies_agg | Supply/demand counts by region, sector, gender, nationality, age |
| **Facts - Education** | fact_supply_graduates, fact_program_enrollment, fact_graduate_outcomes, fact_education_stats, fact_population_stats, fact_wage_hours | Graduates, enrollment, wages, population by demographics |
| **Facts - AI & Skills** | fact_ai_exposure_occupation, fact_occupation_skills, fact_course_skills, fact_forecast | AI exposure scores, ESCO skill mappings, demand forecasts |
| **O\*NET** | onet_occupation, onet_skill, onet_knowledge, onet_technology_skill, onet_alternate_title, onet_task_statement, onet_emerging_task, onet_related_occupation | US occupation taxonomy — 1K occupations, 62K skills, 32K technologies, 18K tasks |
| **System** | dataset_registry, evidence_store | Pipeline metadata and AI citation evidence |

### How to Use
1. Click a **category** in the left sidebar to filter
2. Click a **table card** to open the data browser
3. **Search** across text columns, **sort** by clicking headers
4. **Paginate** through large tables (50 rows/page)
5. Click **back arrow** to return to table list

---

## 5. AI Impact (`/ai-impact`)

How AI/automation affects UAE occupations. Four tabs.

### Tab: Overview
| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **5 KPIs** | Assessed occupations, High Risk %, Avg Exposure, Hot Technologies, Emerging Tasks | AIOE + O*NET v30.2 |
| **Risk Donut** | High/Moderate/Low distribution (click to filter) | AIOE composite score |
| **Radar** | Top 6 occupations on 3 axes: Exposure, Automation, LLM | AIOE + Frey-Osborne + GPTs-are-GPTs |
| **Sector Bars** | Exposure per sector with 50% reference line | AIOE aggregated by ISIC |

### Tab: Sector Analysis
| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **Sector Cards** | Per-sector: avg exposure, occupation count, high-risk count | AIOE by sector |

### Tab: Skills & Technology
| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **Vulnerability Heatmap** | Color grid of skills by exposure level | ESCO skills x AIOE scores |
| **Hot Technologies** | Animated tag cloud sized by adoption | O*NET Hot Technology list |
| **Emerging Tasks** | New tasks appearing in occupations | O*NET Emerging Tasks DB |
| **O\*NET Stats** | 8-stat summary of entire O*NET database | O*NET v30.2 |

### Tab: Deep Dive
| Section | What It Shows | Data Source |
|---------|--------------|-------------|
| **Occupation Cards** | Click any to see 3 exposure bars + expand details | AIOE + Frey-Osborne |
| **Skill Profile** | ESCO essential/optional skills + O*NET levels | ESCO + O*NET |
| **Career Transitions** | Where workers can move to/from | O*NET Related Occupations |
| **Full Table** | Sortable, filterable, 50 occupations | All AI sources combined |

---

## Data Sources Summary

| Source | Records | Category |
|--------|---------|----------|
| **LinkedIn UAE** | ~37,000 jobs | Demand |
| **Bayanat (FCSA)** | ~179,000 rows | Supply + Education + Population |
| **ESCO Taxonomy** | 6K occupations, 14K skills, 126K mappings | Taxonomy |
| **O\*NET v30.2** | 1K occupations, 62K skills, 32K tech | Taxonomy + AI |
| **AIOE/Frey-Osborne** | ~1,500 exposure scores | AI Impact |
| **CAA (Accreditation)** | 500+ programs, 6K courses | Education |
| **SCAD Abu Dhabi** | 101 files | Regional stats |
| **MOHRE** | Workforce snapshots | Labour market |
| **Web Scrape** | 20 university websites, 855 programs | Education |

**Total**: ~575,000 rows across 9 materialized views and 28 tables.

---

## Tips

- **Gold dots** on charts = estimated data, **navy dots** = actual
- **Click any chart** section's source badge to see where the data came from
- **SGI badges**: Red = Critical Shortage, Amber = Moderate, Green = Balanced, Blue = Surplus
- **Risk badges**: Red = High AI risk, Amber = Moderate, Green = Low
- All pages are **bilingual** (EN/AR) — toggle in the top bar
- Knowledge Base lets you explore **raw data** behind any visualization
