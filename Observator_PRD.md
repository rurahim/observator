# Observator — Product Requirements Document (PRD)
### Version 1.0 | March 2026 | CONFIDENTIAL — UAE Government B2G Product

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Mission](#2-product-vision--mission)
3. [Problem Statement](#3-problem-statement)
4. [Target Users & Personas](#4-target-users--personas)
5. [Product Goals & Success Metrics](#5-product-goals--success-metrics)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [UI/UX Design Specifications](#8-uiux-design-specifications)
9. [User Journey Maps](#9-user-journey-maps)
10. [MVP Scope vs Phase 2](#10-mvp-scope-vs-phase-2)
11. [Assumptions & Constraints](#11-assumptions--constraints)
12. [Risks & Mitigations](#12-risks--mitigations)

---

## 1. Executive Summary

**Observator** is a UAE national AI-powered Labour Market & Skills Intelligence Observatory — a B2G (Business-to-Government) SaaS platform built for the UAE Federal Government. It functions as a "Digital FTE" that continuously monitors, measures, and forecasts the UAE labour market 24/7 using a 18-agent AI pipeline.

| Attribute | Detail |
|---|---|
| **Product Name** | Observator |
| **Product Type** | B2G SaaS — Government Intelligence Platform |
| **Primary Client** | UAE Ministry of Human Resources & Emiratisation (MOHRE) |
| **Secondary Clients** | FCSC, MOHESR, UAE Cabinet / National AI Office |
| **Core Value** | Continuous, AI-driven skill gap intelligence for national policy decisions |
| **MVP Timeline** | 8 Weeks |
| **Technology** | Multi-agent AI (LangGraph), FastAPI, React 18, Azure UAE North |
| **Language Support** | Arabic (primary) + English (bilingual) |
| **Data Sovereignty** | 100% UAE-region — no data leaves UAE |

---

## 2. Product Vision & Mission

### Vision
> "To be the definitive intelligence layer between UAE's education system and its labour market — so that no Emirati graduates into a job that no longer exists, and no strategic sector goes understaffed."

### Mission
Provide UAE policymakers with **real-time, explainable, actionable** skill gap intelligence — bridging the gap between education supply and market demand through a continuously learning multi-agent AI system.

### Core Formula
```
SKILL GAP = DEMAND − SUPPLY

SUPPLY  = Registered job seekers (MOHRE)
        + Fresh graduates (MOHESR/CHEDS)
        + Reskilling programme completions (Nafis/ETCC)

DEMAND  = Active job vacancies (Bayt.com + Naukrigulf + GulfTalent)
        + Strategic project manpower needs (UAE Vision 2031 projects)
        + Historical trend baseline (TimescaleDB 24-month rolling)

GAP     = CRITICAL SHORTAGE (>20%) | MODERATE SHORTAGE (5–20%)
        | BALANCED (±5%) | SURPLUS (<-5%)
```

---

## 3. Problem Statement

### The UAE Labour Market Intelligence Gap

| Problem | Current Reality | Observator Solution |
|---|---|---|
| **Fragmented data silos** | MOHRE, FCSC, MOHESR, job boards — all separate, never connected | Single unified intelligence pipeline |
| **Reactive policy cycles** | New roles (AI Engineer, Prompt Engineer) appear 2–3 years before policy catches up | Real-time monitoring — policy can respond in weeks |
| **No skill-level granularity** | Government knows "Technology sector is short" but not which skills, at what level | ESCO taxonomy — 13,890 skills granularity |
| **Free zone blind spot** | 200,000–500,000 free zone workers excluded from MOHRE statistics | Free zone authority data integration |
| **No AI impact visibility** | Which UAE jobs are at automation risk? Nobody knows officially | AIImpactModellingAgent with occupation-level risk scores |
| **Slow reporting cycles** | Annual reports with 12–18 month lag | Daily skill gap index updates |
| **No explainability** | Charts with no data lineage — "where did this number come from?" | Full audit trail, data lineage, source citations |

---

## 4. Target Users & Personas

### Persona 1: Minister / Ministry Executive
**Name:** H.E. Dr. Abdulla (Composite)
**Role:** Undersecretary, MOHRE
**Goals:**
- Understand national skill shortage/surplus at a glance
- Get early warning on emerging skill crises (30–90 day ahead signal)
- Cite evidence-backed numbers in policy announcements and Cabinet briefings
- Monitor Emiratisation quota achievement across sectors

**Pain Points:**
- Gets dashboards built weeks after data collected — too stale for fast decisions
- Cannot drill down behind a headline number to understand "why"
- Needs Arabic-first, not translated-from-English interface

**Key Features Used:**
- Executive Dashboard (KPI cards, top shortage alerts)
- Monthly trend charts
- One-click PDF report generation in Arabic + English
- Mobile app for on-the-go checks

---

### Persona 2: Government Analyst
**Name:** Fatima Al Hashimi (Composite)
**Role:** Senior Labour Market Analyst, FCSC
**Goals:**
- Run deep-dive analysis on specific occupation-sector combinations
- Model policy scenarios: "If we fund X training seats, what happens to gap in 12 months?"
- Export clean datasets for further analysis in Excel/R
- Validate data sources and track data quality

**Pain Points:**
- Has to manually combine MOHRE Excel + FCSC SDMX API + job board scrapes
- Scenario modelling takes weeks in spreadsheets
- Arabic NLP tools for job description analysis are poor quality

**Key Features Used:**
- Advanced Analytics module
- Scenario Simulator
- Natural language query ("Show me all occupations with >15% shortage in Dubai in 2024")
- Data export (CSV/Excel)
- Data source audit trail

---

### Persona 3: University Dean / Training Director
**Name:** Prof. Mohammed Khalid (Composite)
**Role:** Dean of Engineering, Federal University
**Goals:**
- Know how well his programs align with market demand
- Identify emerging skills his curriculum should add
- Benchmark his graduates' employment outcomes vs other universities
- Justify curriculum changes with data to Ministry of Education

**Pain Points:**
- No reliable data on whether graduates find jobs in their field
- No visibility into which skills employers actually want vs what's taught
- MOHESR reports are annual and aggregated — no program-level insight

**Key Features Used:**
- University Alignment Module
- Curriculum Gap Report (skills taught vs skills demanded)
- Graduate Employment Outcome tracker
- ESCO skill mapping of course catalogs

---

### Persona 4: System Administrator
**Name:** Omar Al Suwaidi (Composite)
**Role:** IT Manager, MOHRE
**Goals:**
- Manage user accounts and role assignments
- Monitor system health and data pipeline status
- Configure data source connections and refresh schedules
- Audit agent activity and system logs

**Key Features Used:**
- Admin Dashboard
- User Management
- Data Source Configuration
- Agent Run Logs
- System Health Monitor

---

## 5. Product Goals & Success Metrics

### Business Goals

| Goal | Metric | Target (12 months) |
|---|---|---|
| Adoption by MOHRE | Active monthly users | 50+ ministry users |
| Policy decisions supported | Reports cited in Cabinet briefings | 12+ per year |
| Data coverage | % of UAE workforce represented in SUPPLY data | >85% |
| Demand coverage | % of UAE job postings captured | >70% |
| Data freshness | Average age of displayed data | <48 hours |
| Arabic NLP accuracy | Skill extraction accuracy (Arabic job posts) | >85% F1 score |

### Technical Goals

| Goal | Metric | Target |
|---|---|---|
| System availability | Uptime | 99.5% |
| Dashboard load time | Page load (p95) | <3 seconds |
| Query response time | NL query to result | <10 seconds |
| Agent pipeline throughput | Job postings processed per hour | 10,000+ |
| Data sovereignty | % of data processed in UAE region | 100% |

### User Experience Goals

| Goal | Metric | Target |
|---|---|---|
| Arabic usability | Arabic user satisfaction (1–5) | ≥4.2 |
| Task completion | % of core tasks completed without help | >90% |
| Mobile satisfaction | Mobile NPS score | >40 |

---

## 6. Functional Requirements

### Module 1: Authentication & Access Control

**FR-AUTH-001:** Users must authenticate via JWT tokens with 8-hour expiry
**FR-AUTH-002:** Three roles must be supported: Admin, Analyst, Executive
**FR-AUTH-003:** UAE PASS integration must be provided as primary SSO option
**FR-AUTH-004:** All login events must be logged with timestamp, IP, user agent
**FR-AUTH-005:** Failed login attempts must trigger lockout after 5 failures (15-minute timeout)
**FR-AUTH-006:** Role-based access: Executive = read-only; Analyst = read + export + NL query; Admin = full access

---

### Module 2: Data Ingestion

**FR-ING-001:** System must accept Excel file uploads (.xlsx, .xls) up to 500MB
**FR-ING-002:** Large Excel files must be processed in chunks of 10,000 rows with progress indicator
**FR-ING-003:** System must connect to and poll FCSC SDMX API on configurable schedule (default: daily)
**FR-ING-004:** System must connect to and poll Bayanat.ae CKAN API on configurable schedule (default: daily)
**FR-ING-005:** System must support web scraping from Bayt.com, Naukrigulf (configurable targets)
**FR-ING-006:** All ingestion events must create an `ingestion_batch` record with status tracking
**FR-ING-007:** Failed ingestion must trigger alert to Admin; partial success must be logged
**FR-ING-008:** PDF documents must be parseable via Unstructured.io self-hosted pipeline
**FR-ING-009:** System must support manual CSV/Excel upload by Analyst role
**FR-ING-010:** Ingestion status must be visible in real-time via WebSocket progress indicator

---

### Module 3: Data Processing Pipeline (18 Agents)

**FR-PROC-001:** All ingested data must pass through PIIScrubbingAgent before any cloud LLM call
**FR-PROC-002:** PIIScrubbingAgent must strip: Emirates ID, passport numbers, personal phone/email, full names + employment data combinations
**FR-PROC-003:** OccupationNormalizationAgent must map raw job titles to ISCO-08 4-digit codes
**FR-PROC-004:** SkillNormalizationAgent must map extracted skills to ESCO v1.2 skill URIs
**FR-PROC-005:** JobDescriptionParserAgent must extract required skills from Arabic and English job posts
**FR-PROC-006:** CVParserAgent must extract skills from uploaded CV files (PDF, Word, plain text)
**FR-PROC-007:** CourseSkillMapperAgent must map university course titles to ESCO skill outcomes
**FR-PROC-008:** SkillGapCalculatorAgent must produce a Skill Gap Index (SGI) per ISCO code per emirate
**FR-PROC-009:** TrendForecastingAgent must produce 6-month and 12-month occupation demand forecasts
**FR-PROC-010:** AIImpactModellingAgent must assign an automation risk score (0–1) to each ISCO occupation
**FR-PROC-011:** PolicyRecommendationAgent must generate structured policy brief for top 10 shortage occupations
**FR-PROC-012:** All agent runs must be logged in Langfuse (self-hosted) with: agent name, duration, tokens used, success/fail
**FR-PROC-013:** Failed agent runs must enter retry queue (3 retries with exponential backoff)
**FR-PROC-014:** Agent pipeline must support pause/resume via human-in-the-loop checkpoints

---

### Module 4: Skill Gap Analytics

**FR-ANA-001:** Dashboard must show national Skill Gap Index across all occupations (updated daily)
**FR-ANA-002:** Gaps must be filterable by: Emirate, Sector, ISCO Major Group, Gender, Nationality Group, Date Range
**FR-ANA-003:** System must display top 10 critical shortages and top 5 critical surpluses
**FR-ANA-004:** Emiratisation Gap metric must be calculated and displayed per sector
**FR-ANA-005:** AI Automation Risk must be shown per occupation with 5-year outlook
**FR-ANA-006:** Supply breakdown must show: job seekers + graduates + reskilling completions
**FR-ANA-007:** Demand breakdown must show: live vacancies + strategic project needs + trend baseline
**FR-ANA-008:** All metrics must display data lineage: "Source: MOHRE WPS Register, updated Jan 15 2024"

---

### Module 5: Forecasting & Scenario Simulation

**FR-FORE-001:** System must provide 6-month and 12-month occupation demand forecasts
**FR-FORE-002:** Analyst must be able to run "What If" scenarios: "Add X training seats in Y occupation — what happens to gap?"
**FR-FORE-003:** Seasonal adjustments must account for UAE Ramadan period and summer workforce changes
**FR-FORE-004:** Strategic project pipeline must feed into demand forecast (government project headcount needs)
**FR-FORE-005:** Forecast confidence intervals must be displayed (±1.5 standard deviations)
**FR-FORE-006:** Forecast results must be exportable as PDF, Excel, CSV

---

### Module 6: Natural Language Query (AI Chat)

**FR-NLQ-001:** Analyst must be able to type questions in Arabic or English and receive data-backed answers
**FR-NLQ-002:** System must translate NL questions to SQL/DuckDB queries using GPT-4o-mini
**FR-NLQ-003:** NL query results must include source citation ("Based on MOHRE data, 12,450 registered job seekers in Dubai in Q4 2024...")
**FR-NLQ-004:** All NL queries must be logged (query text, user ID, response, query-to-SQL translation) for audit
**FR-NLQ-005:** System must refuse queries that would expose individual-level PII ("Show me John's salary" → blocked)
**FR-NLQ-006:** PII guard must run on EVERY NL query before execution — no exceptions
**FR-NLQ-007:** Query history must be available to user for current session
**FR-NLQ-008:** Complex queries taking >10 seconds must show progress indicator

---

### Module 7: Reporting

**FR-RPT-001:** System must generate Executive Summary PDF report (Arabic + English) on demand
**FR-RPT-002:** Reports must include: national skill gap summary, top 10 shortages, Emiratisation status, AI risk outlook, policy recommendations
**FR-RPT-003:** Reports must use official UAE government visual identity (navy + gold, bilingual headers)
**FR-RPT-004:** System must support scheduled report generation (weekly/monthly auto-email to executives)
**FR-RPT-005:** Reports must be downloadable as: PDF (Arabic), PDF (English), PPTX (executive deck), Excel (data)
**FR-RPT-006:** Report generation must complete within 60 seconds for standard report

---

### Module 8: University Alignment Module

**FR-UNI-001:** System must allow upload of university course catalogs (PDF/Excel)
**FR-UNI-002:** CourseSkillMapperAgent must map each course to ESCO skill outcomes
**FR-UNI-003:** Dashboard must show: "Your courses cover X% of skills demanded by market"
**FR-UNI-004:** Gap report must list: "Top 10 skills demanded by employers that your programs do not cover"
**FR-UNI-005:** System must support comparison across universities (Admin can enable/disable per institution)

---

### Module 9: Administration

**FR-ADM-001:** Admin must be able to create, edit, deactivate user accounts
**FR-ADM-002:** Admin must be able to assign roles (Admin/Analyst/Executive) per user
**FR-ADM-003:** Admin must be able to view all agent run logs with filters (date, agent, status)
**FR-ADM-004:** Admin must be able to trigger manual data refresh per source
**FR-ADM-005:** Admin must be able to configure data source URLs, API keys, refresh schedules
**FR-ADM-006:** System must send email alerts for: failed data source, agent errors >3 consecutive failures, disk space >80%
**FR-ADM-007:** Admin must be able to see system health dashboard: CPU, memory, queue depth, active agents

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Requirement | Specification |
|---|---|
| Dashboard page load | p95 < 3 seconds on 10Mbps connection |
| NL query response | p95 < 10 seconds end-to-end |
| Excel upload processing | 100,000 rows < 5 minutes |
| Report generation | Standard report < 60 seconds |
| Concurrent users | Support 200 simultaneous users without degradation |
| API throughput | 1,000 API requests/minute sustained |
| Agent pipeline | 10,000 job postings processed per hour |
| Database query | Analytical queries < 5 seconds (DuckDB + Qdrant) |

### 7.2 Availability & Reliability

| Requirement | Specification |
|---|---|
| System uptime | 99.5% monthly (maximum 3.6 hours downtime/month) |
| Planned maintenance | Announced 48 hours ahead; Fridays 2–6 AM UAE time |
| Data pipeline uptime | 99% (agents can have planned downtime) |
| Disaster recovery RPO | 4 hours (data loss tolerance) |
| Disaster recovery RTO | 8 hours (recovery time objective) |
| Database backup | Daily automated backup, 90-day retention, Azure UAE North |

### 7.3 Security

| Requirement | Specification |
|---|---|
| Data in transit | TLS 1.3 minimum |
| Data at rest | AES-256 encryption (Azure UAE North managed keys) |
| Authentication | JWT RS256 tokens, 8-hour expiry |
| API rate limiting | 100 req/min per user; 1000 req/min per IP |
| PII handling | Emirates ID, passport, salary data — on-prem only, never to cloud LLM |
| Penetration testing | Annual third-party pentest required |
| Vulnerability scanning | Weekly automated scan via Azure Security Center |
| Access logging | All data access logged with user + timestamp + query |
| PDPL compliance | All data classified as public/internal/confidential/restricted |

### 7.4 Scalability

| Requirement | Specification |
|---|---|
| Horizontal scaling | All services containerized (Docker) on AKS (Kubernetes) |
| Auto-scaling | CPU >70% → scale out; CPU <30% for 10min → scale in |
| Data volume | Support up to 50 million records in PostgreSQL |
| Storage | Support up to 10TB in MinIO object storage |
| Agent workers | Scale from 2 to 20 agent worker pods based on queue depth |

### 7.5 Data Sovereignty (Critical — Non-Negotiable)

| Requirement | Specification |
|---|---|
| Cloud provider | Azure UAE North ONLY (Microsoft + G42/Core42 sovereign deal) |
| LLM routing — Claude | AWS Bedrock me-central-1 (Abu Dhabi) ONLY — never api.anthropic.com |
| LLM routing — GPT | Azure OpenAI UAE North endpoint ONLY — never api.openai.com |
| PII processing | Llama 3.3 70B via vLLM on-premises — never to any cloud |
| Observability | Langfuse self-hosted on-premises — never LangSmith SaaS |
| Data residency | Zero data stored outside UAE territory |
| Government audit | All agent actions produce auditable data lineage records |

### 7.6 Accessibility & Internationalisation

| Requirement | Specification |
|---|---|
| Accessibility standard | WCAG 2.1 Level AA minimum (TDRA mandate for federal portals) |
| Language support | Arabic (primary RTL) + English (secondary LTR) — full bilingual parity |
| Arabic font rendering | Noto Sans Arabic / Tajawal — both fallback supported |
| Number format | Western numerals (123) in both languages — UAE government standard |
| Currency format | `AED 1,250.00` — Western format in both languages |
| Date format | DD/MM/YYYY in both languages |
| Screen readers | NVDA, JAWS, VoiceOver (macOS/iOS) — tested bilingual |
| Keyboard navigation | Full keyboard navigation, visible focus indicators |
| Color contrast | Minimum 4.5:1 for normal text, 3:1 for large text |

### 7.7 Maintainability

| Requirement | Specification |
|---|---|
| Code coverage | Minimum 80% unit test coverage |
| Documentation | All APIs documented in OpenAPI/Swagger |
| Deployment | Zero-downtime blue/green deployments via AKS |
| Monitoring | Prometheus + Grafana for infrastructure; Langfuse for AI pipeline |
| Logging | Structured JSON logs, 90-day retention |
| Configuration | All configuration via environment variables — no hardcoded values |

---

## 8. UI/UX Design Specifications

### 8.1 Design Philosophy

Observator's UI follows **UAE Government Digital Design Standards** — authoritative, bilingual, data-forward, and mobile-responsive. The design signals legitimacy and trust through consistent use of UAE national identity elements.

**Core Principles:**
1. **Authority through colour** — Deep Navy + Gold signals UAE government trust
2. **Bilingual parity** — Arabic and English have equal visual weight
3. **RTL-native** — Arabic layout built first; English is the variant
4. **Data-forward** — KPI cards top, charts middle, tables bottom
5. **Accessibility-first** — WCAG 2.1 AA, keyboard navigable
6. **Mobile-first** — 375px design base, enhanced for desktop

---

### 8.2 Colour System

```css
:root {
  /* ── UAE National Identity ── */
  --color-uae-red:       #EF3340;   /* Flag red — alerts, critical */
  --color-uae-green:     #009A44;   /* Flag green — success, positive */
  --color-uae-black:     #000000;   /* Flag black — primary text */
  --color-uae-white:     #FFFFFF;   /* Flag white — backgrounds */

  /* ── Primary Palette ── */
  --color-primary:       #003366;   /* UAE Federal Navy — headers, nav */
  --color-primary-dark:  #002147;   /* Hover state */
  --color-primary-light: #1A5276;   /* Active state */
  --color-gold:          #C9A84C;   /* Heritage gold — accents, KPI highlights */
  --color-gold-light:    #F0C040;   /* Lighter gold for backgrounds */

  /* ── Secondary Palette ── */
  --color-teal:          #007DB5;   /* Digital services, links */
  --color-green-gov:     #006838;   /* Emirati green — positive actions */
  --color-red-gov:       #C0272D;   /* Alert red — national identity */

  /* ── Neutral Scale ── */
  --color-gray-900:      #1A202C;   /* Primary text */
  --color-gray-700:      #4A5568;   /* Secondary text, labels */
  --color-gray-500:      #718096;   /* Placeholder text */
  --color-gray-300:      #CBD5E0;   /* Borders, dividers */
  --color-gray-100:      #F7FAFC;   /* Section backgrounds */
  --color-gray-50:       #F2F5F9;   /* Card backgrounds */
  --color-white:         #FFFFFF;   /* Page background */

  /* ── Semantic / Status ── */
  --color-success:       #00875A;   /* Balanced / achieved */
  --color-warning:       #FFAB00;   /* Moderate shortage / warning */
  --color-error:         #DE350B;   /* Critical shortage / error */
  --color-info:          #0052CC;   /* Info / in progress */

  /* ── Data Visualisation Series ── */
  --chart-series-1:      #003F72;   /* Primary series — demand */
  --chart-series-2:      #009A44;   /* Secondary series — supply */
  --chart-series-3:      #C9A84C;   /* Tertiary — gap */
  --chart-series-4:      #E74C3C;   /* Quaternary — risk */
  --chart-series-5:      #00B4D8;   /* Quinary — forecast */

  /* ── Skill Gap Index Colours ── */
  --sgi-critical-shortage:  #DE350B;   /* SGI > 20% */
  --sgi-moderate-shortage:  #FFAB00;   /* SGI 5–20% */
  --sgi-balanced:           #00875A;   /* SGI ±5% */
  --sgi-moderate-surplus:   #0052CC;   /* SGI -5 to -20% */
  --sgi-critical-surplus:   #7B1F2C;   /* SGI < -20% */
}
```

---

### 8.3 Typography

```css
/* Arabic (Primary) */
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700&family=Cairo:wght@400;600;700&display=swap');

/* English (Secondary) */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

/* Bilingual Display (UAE government-aligned) */
@import url('https://fonts.googleapis.com/css2?family=Dubai:wght@400;500;700&display=swap');

/* Type Scale */
/* H1 — Page titles */
  Arabic: Tajawal Bold 36px / line-height: 1.3
  English: Inter Bold 36px / line-height: 1.3

/* H2 — Section headers */
  Arabic: Tajawal SemiBold 24px
  English: Inter SemiBold 24px

/* H3 — Card titles */
  Arabic: Tajawal Medium 18px
  English: Inter Medium 18px

/* KPI Numbers — Hero values */
  Font: Inter Bold 48px / Dubai Bold 48px
  Color: --color-primary or --color-gold

/* Body — Content */
  Arabic: Tajawal Regular 16px / line-height: 1.8
  English: Inter Regular 15px / line-height: 1.6

/* Data Labels — Chart labels */
  Arabic: Tajawal Regular 12px
  English: Inter Regular 12px

/* Caption */
  Both: 12px Regular, --color-gray-500
```

---

### 8.4 Layout System

#### Desktop Layout (1440px reference)
```
┌────────────────────────────────────────────────────────────────┐
│  TOPBAR: [Logo] [System Name AR] [System Name EN] [AR|EN] [👤] │
│          Navy #003366 background | Gold text accents            │
├──────────────────┬─────────────────────────────────────────────┤
│  SIDEBAR (240px) │  MAIN CONTENT AREA                          │
│  Navy background │  White background                           │
│                  │  ┌──────────────────────────────────────┐  │
│  [🏠 Dashboard]  │  │ BREADCRUMB + PAGE TITLE (bilingual)  │  │
│  [📊 Analytics]  │  │ FILTER BAR (Emirate, Sector, Date)   │  │
│  [🔮 Forecast]   │  ├──────────────────────────────────────┤  │
│  [💬 AI Query]   │  │ KPI ROW (4 cards): 25% each          │  │
│  [📋 Reports]    │  │ [SGI National][Critical Count]        │  │
│  [🎓 University] │  │ [Emiratisation%][AI Risk%]            │  │
│  [⚙️ Admin]      │  ├──────────────────────────────────────┤  │
│                  │  │ CHART ROW                             │  │
│  ─────────────── │  │ [SGI by Sector 60%] [Map 40%]         │  │
│  System Status   │  ├──────────────────────────────────────┤  │
│  ● 18/18 agents  │  │ [Trend Chart — 12 months — full]     │  │
│  ● Data fresh    │  ├──────────────────────────────────────┤  │
│  ● 3 alerts      │  │ TOP SHORTAGES TABLE (paginated)      │  │
└──────────────────┴─────────────────────────────────────────────┘
```

#### RTL (Arabic) — Sidebar moves to right side:
```
┌────────────────────────────────────────────────────────────────┐
│  TOPBAR: [👤] [EN|AR] [اسم النظام EN] [اسم النظام AR] [Logo]  │
│          (reading order right-to-left)                          │
├─────────────────────────────────────────────┬──────────────────┤
│            MAIN CONTENT (RTL)               │  SIDEBAR (Right) │
│  [كيبيآي] [كيبيآي] [كيبيآي] [كيبيآي]      │  [القائمة]       │
```

#### Mobile Layout (375px)
- Bottom navigation bar: Dashboard / Analytics / Query / Reports / More
- Full-width KPI cards (stacked vertically)
- Collapsible filter drawer
- Swipeable chart cards
- Floating action button for NL query

---

### 8.5 Component Specifications

#### KPI Card
```
┌────────────────────────────────┐
│ [Left accent bar: 4px]         │
│ [Icon 24px]  LABEL (Arabic)    │
│              label (English)   │
│                                │
│  [VALUE — 48px Bold]           │
│  [Change: ▲ 2.3% vs last month]│
│  [Trend sparkline]             │
└────────────────────────────────┘

States:
  Critical: border-left: 4px solid #DE350B, bg: #FFF5F5
  Warning:  border-left: 4px solid #FFAB00, bg: #FFFBF0
  Good:     border-left: 4px solid #00875A, bg: #F0FFF4
  Info:     border-left: 4px solid #0052CC, bg: #EBF4FF

RTL adjustment: border-right instead of border-left
```

#### Skill Gap Heatmap Table
```
Columns: Occupation | ISCO | SGI% | Demand | Supply | Gap | Trend | Risk
Row colours: red gradient → green gradient based on SGI value
Filter chips above: Emirate | Sector | Date | Education Level
Export button: top-right (Excel / PDF)
```

#### NL Query Interface
```
┌──────────────────────────────────────────────────────┐
│ 💬  Type your question in Arabic or English...        │
│     مثال: ما هي أكثر 5 وظائف نقصاً في دبي؟            │
│     Example: Show top shortages in Healthcare Dubai   │
│                                          [→ Send]     │
└──────────────────────────────────────────────────────┘

Response format:
  [Chart or table showing results]
  [Narrative explanation — bilingual]
  [Source citation — MOHRE data, updated Jan 2024]
  [SQL query used — collapsible for Analysts]
  [Export results button]
```

---

### 8.6 Dashboard Pages Map

| Page | Role Access | Key Components |
|---|---|---|
| **Executive Dashboard** | All | 4 KPIs, national heatmap, top shortages, AI risk summary |
| **Skill Gap Deep Dive** | Admin, Analyst | Full heatmap table, filters, historical trends |
| **Forecast & Scenarios** | Admin, Analyst | 12-month forecast charts, scenario simulator |
| **AI Impact Analysis** | All | Occupation risk score grid, sector automation outlook |
| **NL Query (Chat)** | Admin, Analyst | Chat interface, query history, export |
| **Reports** | All | Report generator, scheduled reports, archive |
| **University Alignment** | All | Course coverage %, skill gap vs curriculum |
| **Data Sources** | Admin | Source status, last refresh, quality scores |
| **Agent Monitor** | Admin | 18-agent run status, queue depth, logs |
| **User Management** | Admin | User CRUD, role assignment, access logs |

---

## 9. User Journey Maps

### Journey 1: Minister Gets Skill Gap Alert

```
TRIGGER: Morning email — "Critical shortage alert: AI Engineers in Abu Dhabi"
    ↓
Opens Observator app on mobile (UAE PASS login → biometric)
    ↓
Executive Dashboard: Sees alert card — "AI Engineers: 43% shortage, Abu Dhabi"
    ↓
Taps card → Drill down: Supply vs Demand chart, trend, root cause
    ↓
One-tap: "Generate Cabinet Brief (PDF Arabic)"
    ↓
PDF downloaded in 45 seconds — bilingual, charts, policy recommendation
    ↓
Minister forwards to advisor → policy action initiated

TOTAL TIME: Under 5 minutes
```

### Journey 2: Analyst Runs Scenario Model

```
Analyst opens Observator desktop
    ↓
Navigates to Forecast & Scenarios
    ↓
Selects: Occupation = "Software Developer", Emirate = "Dubai"
    ↓
Sets scenario: "Add 5,000 training seats in Data Science, Q4 2024"
    ↓
System runs TrendForecastingAgent + SkillGapCalculatorAgent (~8 seconds)
    ↓
Result: "Gap reduces from 34% to 18% by Q2 2025 — Moderate shortage remains"
    ↓
Analyst adjusts: "What if we add 8,000 seats?"
    ↓
Result: "Gap reduces to 7% — Near-balanced by Q3 2025"
    ↓
Analyst exports comparison to Excel + adds to weekly report

TOTAL TIME: Under 15 minutes for full scenario analysis
```

### Journey 3: University Dean Reviews Curriculum Alignment

```
University Dean logs in (Analyst role access)
    ↓
Navigates to University Alignment
    ↓
Uploads course catalog (PDF, 45 pages)
    ↓
CourseSkillMapperAgent processes it (~3 minutes, progress bar shown)
    ↓
Results: "Your programs cover 67% of demanded skills in Engineering sector"
    ↓
Gap Report: "Top 5 missing skills: Machine Learning, Docker, Cloud Architecture, Arabic NLP, Cybersecurity"
    ↓
Dean exports report → submits to MOHESR for curriculum revision

TOTAL TIME: Under 10 minutes
```

---

## 10. MVP Scope vs Phase 2

### Week-by-Week MVP (8 Weeks)

| Week | Deliverable |
|---|---|
| **Week 1** | Project skeleton: FastAPI + React + PostgreSQL + Langfuse setup; User auth; 3 roles |
| **Week 2** | FileIngestionAgent (Excel upload); PIIScrubbingAgent (Llama on-prem); Storage zones |
| **Week 3** | JobDescriptionParserAgent (GPT-4o-mini); SkillNormalizationAgent (Qdrant + ESCO) |
| **Week 4** | OccupationNormalizationAgent; SkillGapCalculatorAgent (DuckDB); Basic dashboard KPIs |
| **Week 5** | WebScraperAgent (Bayt.com); APIConnectorAgent (FCSC SDMX); Data source management |
| **Week 6** | TrendForecastingAgent (TimescaleDB); NLQueryAgent (GPT-4o-mini + text-to-SQL) |
| **Week 7** | PolicyRecommendationAgent; ReportGenerationAgent; PDF export (Arabic + English) |
| **Week 8** | Executive Dashboard polish; Mobile responsive; Full bilingual; QA + security audit |

### MVP Inclusions
- ✅ Excel file upload + processing (up to 100K rows)
- ✅ ESCO skill normalization
- ✅ Basic skill gap calculation (supply vs demand)
- ✅ Bayt.com job scraping
- ✅ FCSC SDMX API integration
- ✅ NL query (Arabic + English)
- ✅ 3-role access (Admin/Analyst/Executive)
- ✅ Executive dashboard + KPIs
- ✅ PDF report generation
- ✅ Langfuse observability (self-hosted)
- ✅ UAE PASS SSO
- ✅ Bilingual (Arabic + English)

### Phase 2 (Post-MVP)
- ⏳ AIImpactModellingAgent (Claude 3.7 Opus — complex reasoning)
- ⏳ Scenario Simulator (full What-If modelling)
- ⏳ University Alignment module
- ⏳ Free zone data integration (DIFC, ADGM, JAFZA)
- ⏳ MOHESR/CHEDS graduate data pipeline
- ⏳ LinkedIn Talent Insights integration (if partnership secured)
- ⏳ Neo4j skill relationship graph
- ⏳ Naukrigulf + GulfTalent scrapers
- ⏳ Mobile app (iOS + Android) via React Native
- ⏳ Scheduled automated reports (email delivery)
- ⏳ Dagster pipeline with full audit lineage UI

---

## 11. Assumptions & Constraints

### Assumptions
- MOHRE will provide access to aggregated WPS data (not individual-level) under a formal data sharing agreement
- FCSC SDMX API remains publicly accessible and stable
- Bayt.com scraping is technically feasible (robots.txt allows, rate limits are manageable)
- Azure UAE North capacity is available for initial deployment
- ESCO v1.2 Arabic labels are sufficient quality for MVP (manual QA sample tested)
- Users have modern browsers (Chrome 100+, Safari 16+, Edge 100+)
- Internet bandwidth at government offices ≥ 10 Mbps

### Constraints
- **No direct OpenAI/Anthropic API** — must use Azure UAE North / Bedrock me-central-1
- **No LangSmith** — data sovereignty, must use Langfuse self-hosted
- **8-week MVP deadline** — scope must be ruthlessly prioritised
- **Budget**: GPT-4o-mini for MVP (cost constraint) — upgrade to GPT-4o / Claude 3.7 in Phase 2
- **Arabic NLP quality**: Current ESCO Arabic labels are auto-translated; some occupations have lower quality Arabic — accept for MVP, improve in Phase 2

---

## 12. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| MOHRE data access delayed | Medium | High | Use dummy data for MVP; parallel MOU negotiation |
| Bayt.com changes scraping protection | Medium | High | Negotiate bulk data feed; fallback to Naukrigulf |
| ESCO Arabic quality insufficient | Low | Medium | Manual curation team + community contribution |
| Azure UAE North capacity shortage | Low | High | Pre-provision reserved capacity; secondary region on-prem |
| LLM API costs exceed budget | Medium | Medium | GPT-4o-mini for all MVP tasks; Claude only for complex reasoning |
| Arabic NLP accuracy below 85% | Medium | High | CAMeL-Tools + human reviewer loop for low-confidence extractions |
| UAE PASS integration delays | Low | Medium | Username/password auth as fallback; UAE PASS in Phase 1.1 |
| Free zone data never accessible | High | Medium | Document as known gap; model as "mainland adjustment factor" |
| Government procurement cycle delays | High | Medium | Build MVP with internal dummy data; demo to stakeholders in week 8 |

---

*Document prepared for: Observator Project Team*
*Classification: INTERNAL — Not for external distribution*
*Next review: After Week 4 MVP sprint*
