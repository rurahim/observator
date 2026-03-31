# FULL DATA AUDIT — Every Table, Every Issue

## CRITICAL ISSUES (must fix)

### 1. Supply and Demand have ZERO overlapping years
- **Supply years**: 2015, 2016, 2017, 2018, 2019
- **Demand years**: 2024, 2025, 2026
- **Impact**: The gap cube compares 2019 employment headcounts with 2024-2025 job postings. **This is comparing apples to oranges across a 5-year gap.**
- **Fix needed**: Either get 2024 employment data, or acknowledge the comparison is across different time periods.

### 2. Bayanat_Activity dates are WRONG
- **CSV value**: `201112` (means "2011-2012 academic year")
- **What seed script stored**: `time_id=31` which maps to `Jan 31, 2015`
- **Why**: Script parsed `201112` as a date number, not a year range
- **Impact**: 342,124 rows have incorrect dates
- **Fix needed**: Re-map time_ids: `201112` → year 2011, `201213` → year 2012, etc.

### 3. Bayanat_Activity has max supply_count = 92,121
- **What it means**: One row says 92,121 workers in a single emirate/sector/age/gender combination
- **Is this reasonable?**: Possibly — Dubai private sector "Trade and repair services" for males aged 25-29 could have tens of thousands of workers. But needs verification against source.
- **Risk**: If these are subtotals rather than detailed counts, they'd inflate the supply side.

### 4. Supply/Demand scales are incomparable
- **Supply**: Employment headcount (values: 1 to 92,121 per row)
- **Demand**: Individual job postings (value: always 1 per row)
- **Impact**: Gap cube compares "170,000 employed workers" with "200 job postings" — meaningless
- **Fix needed**: Either normalize to the same scale, or stop showing them as a direct gap

### 5. Only ~54 occupations have BOTH supply AND demand
- **Gap cube**: 2,672 total rows, but most have data on only ONE side
- **Impact**: True supply-demand comparison only works for a handful of occupations
- **Root cause**: Supply uses old ISCO occupation codes, demand uses ESCO-mapped codes — different classification systems

---

## WARNING ISSUES (data quality)

### 6. Five columns in supply table are 100% empty
- `education_level`: 0% filled
- `nationality`: 0% filled
- `experience_band`: 0% filled
- `wage_band`: 0% filled
- `sector_id`: 40.6% filled (only Bayanat_Activity has it)

### 7. Demand sector_id only 35.7% filled
- Only 13,273 of 37,128 LinkedIn jobs have a sector_id mapped
- Rest have NULL — LinkedIn industry wasn't mapped during seed

### 8. dim_course program_name only 8% filled
- 19,196 courses but only 1,537 have a program_name
- Impact: Can't link most courses to specific programs

### 9. Unemployment data is very limited
- Only 2016-2018 coverage (mostly 2016)
- Only Abu Dhabi has education-level breakdown
- Labour force participation goes back to 1975 but only for Abu Dhabi
- **No national unemployment data by occupation**

### 10. 1 orphan demand→occupation FK
- One demand row references an occupation_id not in dim_occupation

---

## TABLE-BY-TABLE STATUS

| Table | Rows | Time Range | Key Issue |
|-------|------|-----------|-----------|
| fact_supply_talent_agg | 842,216 | 2015-2019 | Dates wrong for Bayanat_Activity. supply_count = employed headcount, NOT available workers |
| fact_demand_vacancies_agg | 37,128 | 2024-2026 | Clean after MOHRE removal. Each row = 1 LinkedIn posting |
| fact_unemployed | 510 | 1975-2018 | Very limited. Mostly rates not counts. Only Abu Dhabi detail |
| fact_work_permits | 252 | — | Correctly separated. NOT job vacancies |
| fact_workforce_totals | 315 | — | Correctly separated. Reference only |
| fact_job_skills | 3,062,708 | — | Generated: inherited from ESCO. Valid but inflated |
| fact_course_skills | 24,799 | — | Generated: token matched. ~60-70% accuracy |
| fact_supply_graduates | 4,230 | 2010-2024 | Real Bayanat data. Good quality |
| fact_program_enrollment | 668 | 2002-2024 | Mix of actual + estimated. 14 rows estimated |
| fact_graduate_outcomes | 4,134 | — | Real but employment rates only for ZU/HCT |
| dim_time | 4,748 | 2015-2027 | Trimmed. No future garbage |
| dim_occupation | 3,897 | — | ESCO + AI-mapped. Good |
| dim_skill | 21,574 | — | ESCO + O*NET. Good |
| dim_course | 19,196 | — | From catalogs. 8% have program linkage |
| dim_institution | 168 | — | CAA + Bayanat. Good |
| dim_program | 3,902 | — | CAA + scrape + catalogs. Good |
| dim_region | 7 | — | 7 emirates. Good |
| dim_sector | 71 | — | ISIC + LinkedIn additions. Good |

---

## WHAT THE DATA ACTUALLY MEANS (honest dictionary)

| Column/Field | What People THINK It Means | What It ACTUALLY Means |
|-------------|--------------------------|----------------------|
| supply_count | Available workers for hire | Number of people ALREADY EMPLOYED in this category (Bayanat/MOHRE census) |
| demand_count | Open job vacancies right now | 1 = one LinkedIn/JSearch job posting scraped in 2024-2025 |
| gap (supply - demand) | Talent shortage/surplus | Employed headcount minus job posting count — NOT a meaningful comparison |
| unemployment_rate | % of workers without jobs | % of LABOUR FORCE that is unemployed (Bayanat survey, 2016 only) |
| time_id → date | When this measurement was taken | Mapped from CSV date field — BUT Bayanat_Activity dates are WRONG (201112 ≠ Jan 2015) |
| occupation_id | Specific job role | Mapped via ISCO major group digit — COARSE (all "Managers" get same ID) |
| skill match | Skills employers need vs teach | ESCO inheritance (all skills for an occupation assigned to all its jobs) — INFLATED |

---

## HONEST SUMMARY

**What we CAN reliably say:**
- UAE had X employed workers in 2015-2019 by emirate, gender, age (from Bayanat census)
- LinkedIn had Y job postings in 2024-2025 by emirate, industry, experience
- ESCO maps Z skills to each occupation (academic taxonomy, not employer-verified)
- Universities offer W courses across 100+ institutions (from catalog parsing)

**What we CANNOT reliably say:**
- "The gap between supply and demand is X" (different time periods, different scales)
- "18% of skills match" (inflated by ESCO inheritance — every job gets 80 skills)
- "These skills are in critical shortage" (based on mismatched supply/demand comparison)
- "X people are unemployed in occupation Y" (no occupation-level unemployment data exists)
