# Data Reality Check — What We Have vs What We Need

## What the platform SHOULD show (your requirements):

### SUPPLY SIDE (3 layers)
1. **Available workers looking for jobs** (unemployed/job seekers) — by occupation, region, nationality, gender
2. **Currently employed** — by occupation, region, nationality, gender
3. **Future supply** (students who will graduate) — by program, institution, timeline

### DEMAND SIDE (2 layers)
1. **Currently open positions** — by occupation, region, industry
2. **Future demand** (forecasted job openings) — ML prediction + news/trend analysis

---

## What we ACTUALLY have (honest assessment):

### SUPPLY — Real Data Available

| What | Source | Status | Covers |
|------|--------|--------|--------|
| **Unemployment RATE by age + gender** | Bayanat CSV | NOT LOADED — file exists | 2016 only, UAE-wide |
| **Unemployment RATE by nationality + age + gender** | Bayanat CSV | NOT LOADED | 2016 only, Citizen vs Non-Citizen |
| **Unemployed count by education + gender** | Bayanat CSV | NOT LOADED | 2016, Abu Dhabi only |
| **Unemployed count by age + gender** | Bayanat CSV | NOT LOADED | 2016, Abu Dhabi only |
| **Labour force by status + citizenship** | Bayanat CSV | NOT LOADED | 2001-2011, Employed/Unemployed/Labour Force counts |
| **Labour force participation by emirate** | Bayanat CSV | NOT LOADED | 1975-recent, all emirates, by nationality + gender |
| **Currently employed** (headcounts) | Bayanat_MOHRE + Activity | IN DB (842K rows) | Per emirate, gender, age group. **NOT per occupation** (occupation_id is mapped but coarse) |
| **Enrollment** (future graduates) | Bayanat + estimates | IN DB (668 rows) | 2002-2024, by emirate. Some estimated. |
| **Graduate counts** | Bayanat | IN DB (4,230 rows) | 2010-2024, by institution, discipline |
| **Courses + Skills** | University catalogs | IN DB (19K courses, 25K skill maps) | 100+ institutions |

### DEMAND — Real Data Available

| What | Source | Status | Covers |
|------|--------|--------|--------|
| **Job postings** (1 per row) | LinkedIn scrape | IN DB (36,880 rows) | 2024-2025, all emirates, demand_count=1 each |
| **Job postings** | JSearch API | IN DB (248 rows) | Small sample, 4 emirates |
| **Work permits** (NOT vacancies) | MOHRE | IN DB (252 rows) | Per emirate, values up to 148K. **These are permits issued, NOT open positions** |
| **Future demand** | None | NOT AVAILABLE | No forecasting data loaded |

---

## What's WRONG in the current DB

### fact_supply_talent_agg — PROBLEMS:
1. **`supply_count` is misleading** — it's employment headcount, NOT available workers
2. **GLMM/MOHRE rows (315 rows) inflate totals** — single rows with 500K+ values (total emirate workforce) mixed with granular Bayanat rows (value 1-100)
3. **No unemployment data loaded** — the CSV files exist but were never ingested
4. **No occupation-level granularity for most rows** — Bayanat data is by age/gender/emirate, NOT by specific occupation

### fact_demand_vacancies_agg — PROBLEMS:
1. **MOHRE_permits (252 rows, 4.9M total) are NOT job vacancies** — they're work permits issued. Mixing them with LinkedIn postings is wrong
2. **LinkedIn is a snapshot** (2024-2025 scrape) — NOT live "currently open" positions
3. **No time series for demand** — LinkedIn dates are posting dates, not "currently open" indicator

---

## Honest Fix Plan

### Step 1: Separate the data into correct categories

**New table structure:**
```
fact_employed          — Currently employed workers (from Bayanat_MOHRE + Bayanat_Activity)
fact_unemployed        — Unemployed / job seekers (from Bayanat unemployment CSVs)
fact_labour_force      — Total labour force (employed + unemployed)
fact_job_postings      — Individual job listings (LinkedIn + JSearch, demand_count=1)
fact_work_permits      — MOHRE permits (separate from job postings)
fact_enrollment        — Current students (future supply pipeline)
fact_graduates         — Annual graduate output
```

### Step 2: Load unemployment data (REAL — from your Bayanat CSVs)
Files to load:
- `unemployment_rate_by_age_group_and_gender.csv` → unemployment rates
- `unemployment_rate_by_nationality_age_and_gender.csv` → by citizenship
- `labour_force_by_economically_active_status_and_citizenship_census_years_persons.csv` → actual counts
- `percentage_of_population_participation_in_labor_force_15_years_and_over_by_emira.csv` → by emirate

### Step 3: Remove MOHRE_permits from demand table
Move 252 MOHRE rows to a separate `fact_work_permits` table. They should NEVER be summed with LinkedIn job postings.

### Step 4: Remove GLMM mega-aggregates from supply table
Move the 315 rows (GLMM_MOHRE, GLMM_MOHRE_2023, MOHRE_2024) to a separate reference table. They're total workforce numbers, not per-occupation supply.

### Step 5: Forecasting
- **Future supply**: enrollment × historical graduation rate × years until graduation
- **Future demand**: Time series forecasting (ETS/Linear) on LinkedIn monthly volume
- **Both clearly labeled as FORECASTED, not real**

### Step 6: Fix all labels in the UI
- "Total Supply" → "Total Employed Workers (Bayanat Census)"
- "Total Demand" → "Job Postings (LinkedIn 2024-2025)"
- "Gap" → "Difference (employment headcount minus job postings — NOT a direct measure of shortage)"
- Add prominent disclaimers where data types are mixed

---

## What We CANNOT Get (honest limitations)

| What | Why |
|------|-----|
| **Real-time open vacancies across UAE** | No unified UAE job vacancy API. LinkedIn is a scrape snapshot. |
| **Unemployed by specific occupation** | Bayanat only has unemployment by age/gender/education, NOT by ISCO occupation |
| **Future demand by occupation** | Need sustained time series data per occupation to forecast. Currently only aggregate monthly LinkedIn counts. |
| **Graduate employment outcomes** | Only ZU/HCT report employment rates. No national tracking system. |

These gaps would need:
- MOHRE to open a real-time vacancy API
- A national graduate tracking survey
- Sustained monthly job scraping for 12+ months per occupation
