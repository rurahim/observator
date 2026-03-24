# Observator — Golden Dataset & Multi-Agent Testing Guide

> A developer's guide to understanding, using, and extending the golden dataset
> for testing the Observator multi-agent system.

---

## What is the Golden Dataset?

The golden dataset is a collection of **71 pre-verified test cases** with known correct answers.
Think of it as an **answer key** — when any agent returns a result, we compare it against
these verified numbers to confirm correctness.

```
Agent receives question → Produces answer → Compare with golden answer → PASS or FAIL
```

**Every golden answer was computed directly from the actual CSV files using Python/pandas — not assumed or estimated.**

---

## File Structure

```
tests/golden_dataset/
├── GUIDE.md                          ← You are here
├── golden_tests.jsonl                ← 71 test cases (one JSON per line)
├── ground_truth_demand.json          ← LinkedIn job postings verified numbers
├── ground_truth_supply.json          ← FCSC/MOHRE/Education verified numbers
├── ground_truth_taxonomy.json        ← ESCO/O*NET/AI Impact verified numbers
├── ground_truth_bayanat_scad.json    ← Bayanat + SCAD Abu Dhabi verified numbers
├── ground_truth_complete.json        ← All folders: file counts + row counts
└── verify_ground_truth.py            ← Verification script (run to check)
```

---

## Test Case Format

Each test in `golden_tests.jsonl` looks like this:

```json
{
  "test_id": "DEM-001",
  "agent": "DemandAnalyzerAgent",
  "category": "basic",
  "difficulty": "easy",
  "question": "How many total job postings are in the LinkedIn UAE dataset?",
  "expected_answer": 36923,
  "answer_type": "integer",
  "tolerance": 0,
  "source_files": ["linkedin_uae_job_postings_2024_2025.csv"],
  "verification": "exact_match"
}
```

| Field | Meaning |
|-------|---------|
| `test_id` | Unique ID. Prefix = agent category (DEM, SUP, TAX, ESCO, AII, SGC, BYN, SCAD, EDGE) |
| `agent` | Which agent should answer this question |
| `category` | Test type: basic, distribution, ranking, skill_lookup, temporal, cross_file, edge_case |
| `difficulty` | easy (lookup), medium (filter+aggregate), hard (cross-file join) |
| `question` | Natural language question the agent should answer |
| `expected_answer` | The verified correct answer (integer, float, dict, or list) |
| `answer_type` | Data type of answer |
| `tolerance` | Acceptable error margin (0 = exact match, 0.1 = ±0.1 allowed) |
| `source_files` | Which CSV file(s) contain the answer |
| `verification` | How to compare: exact_match, tolerance, set_match |

---

## Test Categories (71 tests)

| Prefix | Agent | Tests | What it validates |
|--------|-------|-------|-------------------|
| **DEM** | DemandAnalyzerAgent | 15 | LinkedIn job postings: counts, distributions, top employers, monthly trends |
| **SUP** | SupplyAnalyzerAgent | 15 | Education: programs, courses, institutions, FCSC workforce stats |
| **TAX** | NormalizationAgent | 11 | ESCO/O*NET: occupation counts, skill mappings, hot technologies |
| **ESCO** | NormalizationAgent | 4 | ESCO bilingual: Arabic label coverage |
| **AII** | AIImpactAssessorAgent | 6 | AI exposure scores, risk levels, categories |
| **SGC** | SkillGapCalculatorAgent | 3 | Cross-file: demand vs supply, skill gaps |
| **BYN** | Multiple | 8 | Bayanat.ae data: employment, education, population, economic |
| **SCAD** | SupplyAnalyzerAgent | 4 | SCAD Abu Dhabi: file counts, row counts |
| **EDGE** | Multiple | 5 | Edge cases: missing data, empty fields, boundary conditions |

---

## How to Run Tests

### Quick verification (no database needed):

```bash
cd observator-backend
python tests/golden_dataset/verify_ground_truth.py
```

Output:
```
Loaded 71 test cases
[PASS] DEM-001 (easy) — How many total job postings...
[PASS] DEM-002 (easy) — How many unique job titles...
...
RESULTS: 69 PASSED | 0 FAILED | 2 SKIPPED | 71 TOTAL
Pass rate: 100.0%
```

### Full agent testing (database required):

```bash
# 1. Start services
docker-compose up -d

# 2. Load real data
python scripts/seed_real_data.py

# 3. Start API
uvicorn src.main:app --reload

# 4. Run agent tests (in another terminal)
python tests/test_agents_golden.py
```

---

## Multi-Agent System Architecture

### How Data Flows Through the System

```
                    ┌─────────────────────────────────────────────┐
                    │         DATA LAYER (Layer 1 — LOCAL)        │
                    │                                             │
                    │  781 CSV files → seed_real_data.py          │
                    │       ↓                                     │
                    │  PostgreSQL (dim_* + fact_* tables)         │
                    │       ↓                                     │
                    │  6 Materialized Views (vw_*)                │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │           API LAYER (FastAPI)                │
                    │                                             │
                    │  /api/skill-gap     → vw_gap_cube           │
                    │  /api/ai-impact     → vw_ai_impact          │
                    │  /api/dashboards    → vw_supply + vw_demand  │
                    │  /api/university    → vw_supply_education    │
                    │  /api/forecasts     → vw_forecast_demand     │
                    │  /api/query         → any whitelisted view   │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │         AGENT LAYER (LangGraph)              │
                    │                                             │
                    │  User asks question                         │
                    │       ↓                                     │
                    │  OrchestratorAgent decides which agent       │
                    │       ↓                                     │
                    │  ┌─────────────────────────────────┐        │
                    │  │ DemandAnalyzerAgent              │        │
                    │  │   → queries vw_demand_jobs       │        │
                    │  │   → returns: counts, trends      │        │
                    │  ├─────────────────────────────────┤        │
                    │  │ SupplyAnalyzerAgent              │        │
                    │  │   → queries vw_supply_talent     │        │
                    │  │   → returns: workforce stats     │        │
                    │  ├─────────────────────────────────┤        │
                    │  │ SkillGapCalculatorAgent          │        │
                    │  │   → queries vw_gap_cube          │        │
                    │  │   → returns: SGI scores          │        │
                    │  ├─────────────────────────────────┤        │
                    │  │ AIImpactAssessorAgent            │        │
                    │  │   → queries vw_ai_impact         │        │
                    │  │   → returns: exposure scores     │        │
                    │  ├─────────────────────────────────┤        │
                    │  │ NormalizationAgent               │        │
                    │  │   → queries dim_occupation/skill  │        │
                    │  │   → maps job titles → ISCO codes │        │
                    │  ├─────────────────────────────────┤        │
                    │  │ PolicyAdvisorAgent               │        │
                    │  │   → combines all agent outputs    │        │
                    │  │   → generates recommendations    │        │
                    │  └─────────────────────────────────┘        │
                    │       ↓                                     │
                    │  Evidence stored (evidence_store table)      │
                    │       ↓                                     │
                    │  Response with citations                    │
                    └──────────────────┬──────────────────────────┘
                                       │
                    ┌──────────────────▼──────────────────────────┐
                    │         FRONTEND (React)                     │
                    │                                             │
                    │  DashboardPage  → supply/demand charts       │
                    │  SkillGapPage   → SGI heatmap + table       │
                    │  AIImpactPage   → exposure bubble chart     │
                    │  ForecastPage   → trend lines + confidence  │
                    │  ChatPage       → conversational AI         │
                    └─────────────────────────────────────────────┘
```

---

## Where Golden Dataset Fits in This Architecture

```
Golden Dataset validates at THREE levels:

Level 1: DATA INTEGRITY
  "Is the right data in the database?"

  Example: DEM-001
  Question: "Total LinkedIn job postings?"
  Expected: 36,923
  Check: SELECT COUNT(*) FROM fact_demand_vacancies_agg WHERE source='LinkedIn'
  If mismatch → seed_real_data.py has a bug

Level 2: API CORRECTNESS
  "Does the API return correct numbers?"

  Example: TAX-008
  Question: "Total Hot Technologies in O*NET?"
  Expected: 5,247
  Check: GET /api/query with view=vw_ai_impact
  If mismatch → API query or view SQL has a bug

Level 3: AGENT REASONING
  "Does the agent interpret data correctly?"

  Example: SGC-001
  Question: "ESCO essential skills for software developer + UAE AI/ML courses?"
  Expected: {esco_skills: 24, uae_courses: 25}
  Check: Agent must query BOTH esco_occupation_skill_map AND caa_program_courses
  If mismatch → Agent tool selection or reasoning has a bug
```

---

## How to Add New Test Cases

### Step 1: Compute the ground truth from actual data

```python
import pandas as pd

# Example: Count programs by degree level
df = pd.read_csv('_master_tables/2_supply_education/caa_program_outlines_summary.csv')
result = df['degree_level'].value_counts().to_dict()
print(result)  # {'Bachelor': 167, 'Master': 13, ...}
```

### Step 2: Add test to golden_tests.jsonl

```json
{
  "test_id": "SUP-NEW",
  "agent": "SupplyAnalyzerAgent",
  "category": "distribution",
  "difficulty": "easy",
  "question": "Programs by degree level?",
  "expected_answer": {"Bachelor": 167, "Master": 13, "Applied Bachelor": 6, "Doctorate": 4},
  "answer_type": "dict",
  "tolerance": 0,
  "source_files": ["caa_program_outlines_summary.csv"],
  "verification": "exact_match"
}
```

### Step 3: Run verification

```bash
python tests/golden_dataset/verify_ground_truth.py
```

### Rules for adding tests:
1. **ALWAYS compute answer from actual CSV** — never assume or estimate
2. **Include source_files** — so anyone can verify independently
3. **Use appropriate tolerance** — 0 for counts, 0.1 for percentages, 0.5 for ratios
4. **Test edge cases** — empty fields, missing data, zero values

---

## Data Sources Quick Reference

| Folder | Files | Rows | What's Inside |
|--------|-------|------|---------------|
| 1_supply_workforce | 4 | 3,042 | FCSC employment + MOHRE KPIs (2019-2024) |
| 2_supply_education | 3 | 6,529 | 190 programs, 6,188 courses, 151 institutions |
| 3_demand_jobs | 1 | 36,923 | LinkedIn UAE job postings (Sept 2024-Dec 2025) |
| 4_taxonomy_esco | 6 | 159,756 | ESCO occupations + skills (EN+AR bilingual) |
| 5_taxonomy_onet | 8 | 250,500 | O*NET occupations, skills, knowledge, technology |
| 6_ai_impact | 2 | 1,548 | AIOE + AI risk scores |
| 7_crosswalks | 1 | 1,126 | ISCO-SOC code mapping |
| 8_bayanat_employment | 127 | 188,814 | Private sector by activity/occupation (geocoded) |
| 10_bayanat_education | 394 | 76,260 | HE enrollment, graduates, schools |
| 11_bayanat_population | 91 | 11,215 | UAE population (1975-2019) |
| 12_bayanat_economic | 11 | 465 | Employer distribution, industry |
| 14_scad_abu_dhabi | 133 | 10,127 | Abu Dhabi census, education, CPI |
| **TOTAL** | **781** | **746,305** | |

---

## Database Tables Quick Reference

### Dimension Tables (reference data — seeded once)

| Table | Source | Key Columns |
|-------|--------|-------------|
| dim_occupation | ESCO occupations | code_isco, title_en, title_ar |
| dim_skill | ESCO skills | uri_esco, label_en, label_ar, skill_type |
| dim_institution | UAE HE institutions | name_en, name_ar, emirate |
| dim_sector | ISIC Rev.4 sectors | label_en, code_isic |
| dim_region | 7 UAE emirates | region_code (AUH/DXB/SHJ...) |
| dim_time | 2015-2035 daily | year, month, quarter |
| crosswalk_soc_isco | BLS crosswalk | soc_code ↔ isco_code |

### Fact Tables (actual data — loaded from CSVs)

| Table | Source CSVs | Key Metric |
|-------|-----------|------------|
| fact_supply_talent_agg | FCSC + Bayanat + SCAD | supply_count per occupation/region/time |
| fact_demand_vacancies_agg | LinkedIn jobs | demand_count per occupation/region/time |
| fact_supply_graduates | Education data | graduates_count per institution/discipline |
| fact_ai_exposure_occupation | AIOE + Frey-Osborne + GPTs | exposure_z, automation_probability |
| fact_occupation_skills | ESCO map (126K rows) | occupation ↔ skill (essential/optional) |
| fact_forecast | Generated by forecasting engine | predicted_demand/supply/gap |

### Materialized Views (API queries these)

| View | Formula | Frontend Page |
|------|---------|---------------|
| vw_gap_cube | supply - demand = gap, gap/demand*100 = SGI | SkillGapPage |
| vw_supply_talent | SUM(supply_count) grouped by dimensions | DashboardPage |
| vw_demand_jobs | SUM(demand_count) grouped by dimensions | DashboardPage |
| vw_ai_impact | exposure scores joined with occupations | AIImpactPage |
| vw_supply_education | graduates grouped by institution/discipline | UniversityPage |
| vw_forecast_demand | predicted values with confidence intervals | ForecastPage |

---

## SGI (Skill Gap Index) Formula

The most important calculation in the system:

```
SGI = (supply_count - demand_count) / demand_count × 100
```

| SGI Value | Color | Meaning |
|-----------|-------|---------|
| > +20% | Red | Critical oversupply — too many workers, not enough jobs |
| +5% to +20% | Amber | Moderate oversupply |
| -5% to +5% | Green | Balanced — supply meets demand |
| -20% to -5% | Blue | Moderate undersupply — more jobs than workers |
| < -20% | Dark Red | Critical undersupply — urgent skill shortage |

### How to verify SGI with golden dataset:

```python
# From golden test SGC-002:
demand = 36923   # LinkedIn postings (DEM-001)
supply = 190     # University programs (SUP-001)
ratio = demand / supply  # 194.3 — meaning 194 job postings per program
# This tells us: massive undersupply of graduates relative to demand
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Golden test FAILS after code change | Query or view SQL changed | Check git diff, fix the regression |
| Golden test FAILS after data reload | CSV file updated or corrupted | Re-verify ground truth from CSV |
| Agent returns different number | Agent querying wrong view or wrong filters | Check agent tool calls in Langfuse traces |
| All tests PASS but graph looks wrong | Frontend formatting issue, not data issue | Check frontend component, not backend |
| SKIP tests | Require runtime calculation | Implement in test_agents_golden.py |

---

## For New Developers

1. **Start here:** Read this guide
2. **Run tests:** `python tests/golden_dataset/verify_ground_truth.py`
3. **Understand data:** Look at `ground_truth_*.json` files
4. **Trace a question:** Pick any test case → find its source CSV → verify the number manually
5. **Add your own test:** Follow the "How to Add New Test Cases" section
6. **When in doubt:** The CSV files are the source of truth, not the database
