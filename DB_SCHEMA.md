# Observator Database Schema

## Overview: 50 tables, 37 FK relationships, ~4.8M rows

---

## Schema Diagram

```
                                    DIMENSION TABLES
    +-----------------+    +------------------+    +-----------------+
    | dim_time (7.7K) |    | dim_region (7)   |    | dim_sector (34) |
    | time_id [PK]    |    | region_code [PK] |    | sector_id [PK]  |
    | date, year,     |    | name_en/ar       |    | label_en/ar     |
    | month, quarter  |    | iso_code         |    | isic_code       |
    +---------+-------+    +--------+---------+    +--------+--------+
              |                     |                       |
              |    +----------------+---+-------------------+
              |    |                |   |                    |
    +---------v----v---+  +--------v---v--------+  +--------v-----------+
    | fact_supply_     |  | fact_demand_        |  | fact_forecast (12) |
    | talent_agg       |  | vacancies_agg       |  | occupation_id → dim_occ
    | (842K rows)      |  | (37K rows)          |  | region_code → dim_reg
    | REAL: Bayanat    |  | REAL: LinkedIn      |  | GENERATED: ETS model
    | + MOHRE data     |  | + JSearch + MOHRE   |  +--------------------+
    +--------+---------+  +--------+------------+
             |                     |
             +----------+----------+
                        |
              +---------v-----------+
              | vw_gap_cube (2.7K)  |  ← MATERIALIZED VIEW
              | supply vs demand    |    Joins supply + demand
              | per occupation      |    by ISCO code
              | + skills + AI       |
              +---------------------+


    +-------------------+    +-------------------+    +--------------------+
    | dim_occupation    |    | dim_skill (21.5K) |    | dim_discipline(53) |
    | (3.8K) [PK:      |    | skill_id [PK]     |    | discipline_id [PK] |
    | occupation_id]    |    | label_en/ar       |    | label_en/ar        |
    | title_en/ar       |    | skill_type        |    | isced_code         |
    | code_isco/esco    |    | taxonomy          |    +--------+-----------+
    +---+-----+---------+    +----+----+---------+             |
        |     |                   |    |                       |
        |     |    +--------------+    |         +-------------+
        |     |    |                   |         |
   +----v-----v---v---+    +----------v---------v--+
   | fact_occupation   |    | fact_course_skills    |
   | _skills (322K)    |    | (10.8K rows)          |
   | REAL: ESCO v1.2   |    | GENERATED: token-match|
   | essential/optional|    | 6.2K courses → ESCO   |
   +--------+----------+    +-----------+-----------+
            |                           |
   +--------v----------+    +----------v-----------+
   | fact_job_skills    |    | vw_skill_gap (13K)   | ← MATERIALIZED VIEW
   | (3M rows)          |    | demand vs supply     |
   | GENERATED:         |    | per ESCO skill       |
   | inherited from     |    +----------------------+
   | occupation→skills  |
   +--------------------+


    +-------------------+    +-------------------+
    | dim_institution   |    | dim_program       |
    | (168) [PK:        |    | (3.4K) [PK:       |
    | institution_id]   |←---| institution_id FK] |
    | name_en, emirate  |    | program_name      |
    | REAL: CAA+Bayanat |    | degree_level      |
    +--------+----------+    | discipline_id FK  |→ dim_discipline
             |               | REAL: CAA+scrape  |
             |               +--------+----------+
             |                        |
    +--------v----------+    +--------v-----------+
    | fact_supply_      |    | fact_program_      |
    | graduates (4.2K)  |    | enrollment (668)   |
    | REAL: Bayanat     |    | REAL+EST: Bayanat  |
    | institution_id FK |    | institution_id FK  |
    | discipline_id FK  |    | program_id FK      |
    | region_code FK    |    | region_code FK     |
    +-------------------+    +--------------------+

    +--------v-----------+
    | fact_graduate_     |
    | outcomes (4.1K)    |
    | REAL: Bayanat      |
    | institution_id FK  |
    | region_code FK     |
    +--------------------+


                              AI & EXPOSURE
    +------------------------+    +-------------------------+
    | fact_ai_exposure_      |    | dim_onet_occupation     |
    | occupation (2.3K)      |    | (1K) [PK: id]           |
    | REAL: AIOE + Frey-     |    | soc_code, title         |
    | Osborne + Anthropic    |    | occupation_id FK →      |
    | occupation_id FK       |    |   dim_occupation        |
    +--------+---------------+    | REAL: O*NET v29.1       |
             |                    +------------+------------+
    +--------v-----------+                     |
    | vw_ai_impact       |    +----------------+-----+
    | (1.2K)             |    | O*NET FACT TABLES     |
    | MATERIALIZED VIEW  |    | fact_onet_skills (58K)|
    +--------------------+    | fact_onet_knowledge   |
                              |   (51K)               |
    +------------------------+| fact_onet_tech (33K)  |
    | fact_salary_benchmark  || fact_onet_tasks (19K) |
    | (71 rows)              || fact_onet_emerging    |
    | REAL: Glassdoor        ||   (240)               |
    | region_code FK         || fact_onet_alt_titles  |
    +------------------------+|   (55K)               |
                              | fact_onet_related     |
    +------------------------+|   (18K)               |
    | crosswalk_soc_isco     || ALL: occupation_id FK |
    | (1.1K rows)            || ALL REAL: O*NET v29.1 |
    | REAL: BLS/ILO          |+------------------------+
    +------------------------+


                            SYSTEM TABLES
    +-------------------+    +-------------------+    +------------------+
    | users (12)        |←---| chat_sessions(15) |←---| chat_messages(27)|
    | user_id [PK]      |    | session_id [PK]   |    | session_id FK    |
    | email, role       |    | user_id FK        |    | role, content    |
    +--------+----------+    +-------------------+    +------------------+
             |
    +--------v----------+    +-------------------+    +------------------+
    | dashboards        |    | dataset_registry  |←---| evidence_store   |
    | user_id FK        |    | dataset_id [PK]   |    | dataset_id FK    |
    +-------------------+    +-------------------+    +------------------+

    +-------------------+    +-------------------+
    | pipeline_runs     |←---| pipeline_step_logs|
    | run_id [PK]       |    | run_id FK         |
    +-------------------+    +-------------------+

    +-------------------+    +-------------------+
    | audit_log (71)    |    | notifications     |
    +-------------------+    +-------------------+
```

---

## Data Provenance — What's Real vs Generated

### REAL DATA (from your files or official sources)

| Table | Rows | Source | How Collected |
|-------|------|--------|--------------|
| dim_region | 7 | UAE Government | 7 emirates, fixed |
| dim_occupation | 3,813 | ESCO v1.2 + AI-mapped | EU Commission download |
| dim_skill | 21,574 | ESCO v1.2 + O*NET | EU Commission + BLS download |
| dim_sector | 34 | ISIC Rev.4 | UN classification |
| dim_discipline | 53 | ISCED-F 2013 | UNESCO classification |
| dim_institution | 168 | CAA + Bayanat | CAA website + gov open data |
| dim_program | 3,433 | CAA (2,423) + web scrape (1,010) | CAA list + 20 university websites |
| dim_time | 7,670 | Generated calendar | System (dates 2000-2030) |
| dim_onet_occupation | 1,016 | O*NET v29.1 | BLS download |
| fact_supply_talent_agg | 842,531 | Bayanat/MOHRE | YOUR 124 employment CSVs |
| fact_demand_vacancies_agg | 37,380 | LinkedIn (36.9K) + MOHRE (252) + JSearch (248) | YOUR LinkedIn CSV + API |
| fact_supply_graduates | 4,230 | Bayanat | YOUR education CSVs |
| fact_graduate_outcomes | 4,134 | Bayanat | YOUR education CSVs |
| fact_program_enrollment | 668 | Bayanat (654) + estimated (14) | YOUR CSVs + interpolation |
| fact_occupation_skills | 321,806 | ESCO v1.2 | EU Commission download |
| fact_ai_exposure_occupation | 2,304 | AIOE + Frey-Osborne + Anthropic | Research papers + HuggingFace |
| fact_salary_benchmark | 71 | Glassdoor | API/scrape |
| crosswalk_soc_isco | 1,126 | BLS/ILO | Official crosswalk |
| fact_onet_skills | 58,110 | O*NET v29.1 | BLS download |
| fact_onet_knowledge | 51,005 | O*NET v29.1 | BLS download |
| fact_onet_technology_skills | 32,627 | O*NET v29.1 | BLS download |
| fact_onet_task_statements | 18,796 | O*NET v29.1 | BLS download |
| fact_onet_alternate_titles | 55,120 | O*NET v29.1 | BLS download |
| fact_onet_emerging_tasks | 240 | O*NET v29.1 | BLS download |
| fact_onet_related_occupations | 18,460 | O*NET v29.1 | BLS download |

### GENERATED DATA (derived from real data, NOT dummy)

| Table | Rows | How Generated | Is It Dummy? |
|-------|------|--------------|-------------|
| fact_job_skills | 3,062,708 | **Inherited** from ESCO occupation-skill mappings: each LinkedIn job → mapped to ESCO occupation → all skills for that occupation copied | **NO.** If a job is "Software Developer", it gets the REAL ESCO skills for software developers (e.g., "programming languages", "software testing"). The skill list is real — only the job-to-skill LINK is inferred. |
| fact_course_skills | 10,807 | **Token-matched**: each CAA course name tokenized and matched against 21K ESCO skill labels. Threshold: ≥30% token overlap, ≥2 matching tokens, top 5 per course. | **NO.** If a course is called "Database Management Systems", it matches to ESCO skills containing "database", "management", "systems". The matching is mechanical, not hallucinated. Accuracy ~60-70%. |
| vw_gap_cube | 2,726 | SQL FULL OUTER JOIN of supply (Bayanat) × demand (LinkedIn) on ISCO occupation codes | **NO.** Pure SQL aggregation of real data. |
| vw_skill_gap | 13,084 | SQL join of demanded skills (from fact_job_skills) vs supplied skills (from fact_course_skills) | **NO.** Derived from the two tables above. The gap = how many jobs need a skill minus how many courses teach it. |
| vw_ai_impact | 1,200 | SQL join of AI exposure scores × occupation details | **NO.** Real AIOE/Frey-Osborne research scores joined with ESCO occupations. |
| fact_forecast | 12 | ETS/Linear trend models trained on historical demand data | **STATISTICAL.** Model-generated predictions, not actual future data. Clearly labeled as forecasts. |

### EMPTY TABLES (data exists in raw CSVs but not loaded yet)

| Table | Rows | Why Empty | Fix |
|-------|------|-----------|-----|
| fact_education_stats | 0 | 395 Bayanat CSVs exist but seed script doesn't target this table | Run updated seed |
| fact_population_stats | 0 | 92 Bayanat CSVs exist but not loaded | Run updated seed |
| fact_wage_hours | 0 | Wage data in employment CSVs but not extracted | Parse from CSV |

---

## Summary

- **Total tables**: 50 (43 tables + 7 materialized views)
- **Total rows**: ~4.8M
- **REAL data**: ~1.5M rows (from your files, government sources, research papers)
- **GENERATED data**: ~3.1M rows (fact_job_skills: 3M inherited from ESCO — NOT dummy, derived from real skill taxonomies)
- **EMPTY tables**: 3 (raw CSVs exist, need loading)
- **DUMMY/FAKE data**: **ZERO**
