/**
 * Methodology & Transparency Registry
 * ====================================
 * Aligned with: OECD OURdata, ILO Convention 160, Eurostat SIMS v2.0,
 * UK ONS Code of Practice, US BLS Handbook of Methods, UAE TDRA/FCSC.
 *
 * Every view/chart in Observator links to this registry so users can
 * trace any number back to its source, understand how it was calculated,
 * and know what is NOT included.
 */

/* ── Data status labels (UK ONS standard) ──────────────────────────── */
export type DataStatus = 'final' | 'provisional' | 'preliminary' | 'experimental';

export const DATA_STATUS_META: Record<DataStatus, { label: string; labelAr: string; color: string; description: string }> = {
  final:        { label: 'Final',        labelAr: 'نهائي',     color: '#16a34a', description: 'Verified and unlikely to be revised' },
  provisional:  { label: 'Provisional',  labelAr: 'مؤقت',      color: '#d97706', description: 'Subject to revision within 3 months' },
  preliminary:  { label: 'Preliminary',  labelAr: 'أولي',      color: '#dc2626', description: 'First estimate — may change significantly' },
  experimental: { label: 'Experimental', labelAr: 'تجريبي',    color: '#7c3aed', description: 'New data source or methodology under evaluation' },
};

/* ── Confidence tier (BLS / Eurostat standard) ─────────────────────── */
export interface ConfidenceInfo {
  level: '90%' | '95%' | 'N/A';
  marginOfError?: string;
  note: string;
}

/* ── Coverage & limitations (ILO / ONS standard) ──────────────────── */
export interface CoverageInfo {
  geographic: string;
  population: string;
  sectors: string;
  temporalRange: string;
  exclusions: string[];
  knownLimitations: string[];
}

/* ── Revision policy (ONS Code of Practice) ───────────────────────── */
export interface RevisionPolicy {
  schedule: string;
  lastRevised?: string;
  nextRevision?: string;
  revisionNote?: string;
}

/* ── Full methodology entry ────────────────────────────────────────── */
export interface ViewMethodology {
  sources: string[];
  aggregation: string;
  formula: string;
  measurement: string;
  updateFrequency: string;
  /* New transparency fields — aligned with international standards */
  dataStatus: DataStatus;
  confidence: ConfidenceInfo;
  coverage: CoverageInfo;
  revision: RevisionPolicy;
}

export const VIEW_METHODOLOGY: Record<string, ViewMethodology> = {
  /* ─────────────────── SKILL GAP CUBE ─────────────────── */
  vw_gap_cube: {
    sources: ['Bayanat Employment Data (2015-2019)', 'GLMM/MOHRE Private Sector (2020-2024)', 'LinkedIn Job Postings (2024-2025)', 'MOHRE Work Permits (2020-2023)'],
    aggregation: 'Grouped by occupation (ISCO-08 via ESCO taxonomy), emirate, sector, time period',
    formula:
      'gap_abs = demand_count - supply_count\nSGI = supply / demand\ngap_ratio = (demand - supply) / demand × 100',
    measurement:
      'Positive gap = shortage (demand > supply). SGI < 1 = shortage. Values are headcount-based.',
    updateFrequency: 'Supply: quarterly from MOHRE | Demand: monthly from job platforms',
    dataStatus: 'provisional',
    confidence: {
      level: 'N/A',
      marginOfError: '±15-25% on occupation-level gaps due to ISCO proportional distribution',
      note: 'Supply is census/register data (low error). Demand is web-scraped job ads (higher uncertainty). Gap inherits demand-side uncertainty.',
    },
    coverage: {
      geographic: 'All 7 UAE emirates (Abu Dhabi, Dubai, Sharjah, Ajman, RAK, Fujairah, UAQ)',
      population: 'Private sector workers registered with MOHRE. Supply 2015-2019 includes all sectors (Bayanat). Supply 2020-2024 is private sector only (GLMM/MOHRE).',
      sectors: 'All ISIC Rev 4 economic activities for private sector. Government sector partially covered (2015-2019 only).',
      temporalRange: 'Supply: 2015-2024 | Demand: 2020-2026',
      exclusions: [
        'Informal/unregistered workers (estimated 5-10% of workforce)',
        'Domestic workers and housemaids',
        'Free zone workers not registered with MOHRE (varies by free zone)',
        'Military and security forces personnel',
        'Self-employed individuals without trade licenses',
        'Workers under age 15',
      ],
      knownLimitations: [
        'Supply definition changes between periods: 2015-2019 = all sectors (Bayanat), 2020-2024 = private sector only (GLMM/MOHRE)',
        'Demand 2020-2023 uses MOHRE work permits as proxy (volume of hiring, not unfilled positions)',
        'Demand 2024+ uses LinkedIn job ads (individual postings, not hiring volume) — scales differ by ~100x',
        'Occupation matching: LinkedIn titles fuzzy-matched to ESCO at ~80% confidence',
        'Bayanat data only has 1-digit ISCO codes — proportionally distributed to 4-digit using LinkedIn demand weights',
      ],
    },
    revision: {
      schedule: 'Quarterly — supply data revised when MOHRE publishes official figures. Demand revised monthly as new job postings are scraped.',
      revisionNote: 'Preliminary estimates published within 30 days. Final figures after MOHRE official release (~90 days).',
    },
  },

  /* ─────────────────── AI IMPACT ─────────────────── */
  vw_ai_impact: {
    sources: ['OECD AI Occupational Exposure (AIOE) Index 2023', 'Felten et al. (2023) AI Exposure Scores', 'OpenAI GPTs-are-GPTs Study'],
    aggregation: 'Per occupation ISCO-08 code, aggregated by sector and skill cluster',
    formula:
      'exposure_score = weighted avg of (routine_cognitive × 0.35 + routine_manual × 0.25 + llm_exposure × 0.40)\nrisk_level = High if score ≥ 60, Moderate if ≥ 30, Low otherwise',
    measurement:
      'Score range 0–100. Higher = more exposed to AI automation. Based on task-level analysis of 831 occupations.',
    updateFrequency: 'Annually — AIOE scores updated when OECD publishes new index',
    dataStatus: 'final',
    confidence: {
      level: 'N/A',
      note: 'AI exposure scores are expert-assessed indices (not statistical estimates). No sampling error applies. Scores reflect research consensus as of 2023.',
    },
    coverage: {
      geographic: 'Global methodology applied to UAE context. Scores are occupation-generic, not UAE-specific.',
      population: '831 occupations assessed (AIOE raw) + 25 occupations (Felten-2023). Mapped to ESCO via ISCO crosswalk.',
      sectors: 'All sectors with ISCO-coded occupations. Coverage: ~60% of UAE workforce by occupation title.',
      temporalRange: 'Scores reflect 2023 AI capabilities. Not forward-looking.',
      exclusions: [
        'Occupations without ISCO codes (unclassified roles)',
        'Newly emerging occupations not yet in OECD taxonomy',
        'UAE-specific occupations with no international equivalent (e.g., PRO/typing center roles)',
      ],
      knownLimitations: [
        'Scores are based on GLOBAL task analysis — UAE-specific automation adoption rates may differ',
        'Does not account for regulatory barriers to AI adoption in UAE (e.g., healthcare, legal)',
        'Binary risk levels (High/Moderate/Low) simplify a continuous spectrum',
        'LLM exposure weights (0.40) may underestimate non-LLM AI (robotics, computer vision)',
      ],
    },
    revision: {
      schedule: 'Annually — when OECD releases updated AIOE scores',
      lastRevised: '2024-01 (AIOE v2.0)',
      revisionNote: 'Scores stable between annual OECD updates. Methodology weights may change with new research.',
    },
  },

  /* ─────────────────── SUPPLY (TALENT) ─────────────────── */
  vw_supply_talent: {
    sources: ['Bayanat Open Data Portal (2015-2019)', 'GLMM/MOHRE Exact Headcounts (2020-2022)', 'GLMM/MOHRE Labour Force Estimates (2023)', 'MOHRE Official Statistics (2024)'],
    aggregation: 'By ISCO occupation (1-digit from Bayanat, 4-digit estimated), emirate, sector, year',
    formula: 'supply_count = registered_workers per occupation/emirate/year\n2015-2019: Bayanat_MOHRE (by emirate) + Bayanat_Activity (by economic sector)\n2020-2024: GLMM/MOHRE private sector headcounts',
    measurement: 'Headcount of workers. 2015-2019 = all sectors. 2020-2024 = private sector only.',
    updateFrequency: 'Annually from official statistics, gap-filled with GLMM research data',
    dataStatus: 'provisional',
    confidence: {
      level: 'N/A',
      marginOfError: 'Register/census data — no sampling error. Occupation distribution estimated from 1-digit ISCO (±20% at 4-digit level).',
      note: 'Bayanat and MOHRE are administrative registers (complete enumeration). However, 4-digit ISCO breakdown for 2015-2019 is ESTIMATED using LinkedIn demand proportions.',
    },
    coverage: {
      geographic: '5 of 7 emirates for 2015-2019 (Bayanat: DXB, AUH, SHJ, AJM, RAK — Fujairah and UAQ partial). All 7 emirates for 2020-2024 (GLMM/MOHRE).',
      population: '2015-2019: All registered workers (public + private). 2020-2024: Private sector workers only.',
      sectors: 'All ISIC sectors for 2015-2019. Private sector only for 2020-2024.',
      temporalRange: '2015-2024 (10 years)',
      exclusions: [
        'Informal/unregistered workers',
        'Domestic workers (2020-2024)',
        'Government sector workers (2020-2024)',
        'Free zone workers not in MOHRE system',
      ],
      knownLimitations: [
        'CRITICAL: Supply definition changes at 2020 boundary — totals drop from ~9.7M to ~4.8M due to excluding government sector, not workforce shrinkage',
        'Bayanat provides only 1-digit ISCO — proportional distribution to 4-digit introduces estimation error',
        'Fujairah and UAQ have limited Bayanat coverage for 2015-2019',
      ],
    },
    revision: {
      schedule: 'Annually when MOHRE publishes official yearbook',
      revisionNote: '2020-2022 data sourced from GLMM research (not official MOHRE). Will be replaced when MOHRE releases official 2020-2022 figures.',
    },
  },

  /* ─────────────────── DEMAND (JOBS) ─────────────────── */
  vw_demand_jobs: {
    sources: ['LinkedIn UAE Job Postings (2024-2025)', 'MOHRE Work Permits Issued (2020-2023)', 'JSearch API (RapidAPI — on-demand)'],
    aggregation: 'By ESCO occupation (fuzzy-matched from job titles), emirate, sector, month',
    formula: 'demand_count = job_postings (LinkedIn/JSearch) OR work_permits_issued (MOHRE)\nNote: These measure DIFFERENT things — see limitations.',
    measurement:
      'Job postings = advertised vacancies (may not be filled). Work permits = actual hires approved. NOT directly comparable.',
    updateFrequency: 'LinkedIn: monthly snapshot | JSearch: on-demand API | MOHRE permits: annual release',
    dataStatus: 'provisional',
    confidence: {
      level: '90%',
      marginOfError: 'LinkedIn: ±15% (web scrape coverage). MOHRE permits: ±2% (administrative data).',
      note: 'LinkedIn captures ~60-70% of formal UAE job market. SMEs and Arabic-language postings underrepresented. MOHRE permits are near-complete for regulated employment.',
    },
    coverage: {
      geographic: 'All 7 emirates. LinkedIn skews toward Dubai (56%) and Abu Dhabi (28%).',
      population: 'LinkedIn: primarily white-collar, English-language roles. MOHRE permits: all regulated private sector hiring.',
      sectors: 'LinkedIn: tech, finance, professional services overrepresented. Construction, retail underrepresented. MOHRE: all private sectors.',
      temporalRange: 'MOHRE permits: 2020-2023 | LinkedIn: Sept 2024-present | JSearch: 2026',
      exclusions: [
        'Government hiring (not on LinkedIn or MOHRE permits)',
        'Internal transfers and promotions',
        'Informal hiring (word-of-mouth, walk-in)',
        'Arabic-only job boards (Bayt.com, GulfTalent — not yet integrated)',
        'Free zone direct hiring not through MOHRE',
      ],
      knownLimitations: [
        'CRITICAL: Demand source changes at 2024 boundary — MOHRE permits (~1.6M) to LinkedIn ads (~37K). This is NOT a demand collapse but a measurement change.',
        'LinkedIn job ads ≠ actual hiring. One ad may fill 1 or 100 positions.',
        'MOHRE permits ≠ unfilled demand. They represent COMPLETED hiring, not vacancies.',
        'Occupation matching: LinkedIn titles fuzzy-matched to ESCO taxonomy at ~80% accuracy.',
        'No demand data exists for 2015-2019.',
      ],
    },
    revision: {
      schedule: 'LinkedIn data: monthly refresh. MOHRE permits: revised when official statistics published.',
      revisionNote: 'LinkedIn data is inherently point-in-time (ads expire). Historical LinkedIn data cannot be revised.',
    },
  },

  /* ─────────────────── EDUCATION SUPPLY ─────────────────── */
  vw_supply_education: {
    sources: ['UAE University Course Catalogs (sdata.csv)', 'Bayanat Education Statistics'],
    aggregation: 'By institution, discipline, degree level, graduation year',
    formula:
      'coverage_ratio = skills_in_curriculum / skills_demanded_by_market\ngap_score = 100 - coverage_ratio',
    measurement:
      'Coverage measures how well a program prepares for market-demanded skills. Gap is the inverse.',
    updateFrequency: 'Annually from CAA + semester updates from institutions',
    dataStatus: 'experimental',
    confidence: {
      level: 'N/A',
      note: 'Skill extraction from course descriptions uses NLP — accuracy depends on description quality. Programs with vague descriptions may have understated skill counts.',
    },
    coverage: {
      geographic: 'Nationwide — 84 programs from UAE universities',
      population: 'Formal higher education only. 151 HE institutions tracked.',
      sectors: 'Academic programs mapped to market sectors via skill overlap.',
      temporalRange: 'Current catalog year (2024-2025)',
      exclusions: [
        'Technical and vocational education (TVET)',
        'Professional certifications (CFA, PMP, AWS, etc.)',
        'Short courses and bootcamps',
        'On-the-job training and apprenticeships',
        'K-12 education pipeline',
      ],
      knownLimitations: [
        'Course descriptions in Arabic may lose detail in NLP skill extraction',
        'Skill-to-market mapping uses ESCO taxonomy — emerging skills may not be in ESCO yet',
        'Only 84 programs currently analyzed — represents ~10% of total UAE HE programs',
      ],
    },
    revision: {
      schedule: 'Annually — when universities publish updated catalogs',
    },
  },

  /* ─────────────────── DEMAND FORECAST ─────────────────── */
  vw_forecast_demand: {
    sources: ['Historical demand data (fact_demand_vacancies_agg)', 'Auto-selected model (Prophet / ETS / Linear Trend)'],
    aggregation: 'Time series by occupation, emirate; monthly granularity',
    formula:
      'Auto-ETS decomposition:\ny(t) = trend(t) + seasonality(t) + error(t)\nProphet: y(t) = g(t) + s(t) + h(t) + ε(t)\nConfidence band: 95% prediction interval',
    measurement:
      'MAPE reported per forecast. Confidence widens with longer horizons. Model auto-selected by lowest AIC.',
    updateFrequency: 'Re-trained monthly with latest data',
    dataStatus: 'experimental',
    confidence: {
      level: '95%',
      marginOfError: 'Varies by horizon — typically ±10% at 3 months, ±25% at 12 months, ±40%+ at 24 months.',
      note: 'Confidence intervals displayed as shaded bands on chart. MAPE shown below chart. Forecast quality degrades significantly beyond 12 months.',
    },
    coverage: {
      geographic: 'National aggregate. Emirate-level forecasts available but with wider confidence intervals.',
      population: 'Based on observed demand patterns. Does not account for policy changes, economic shocks, or geopolitical events.',
      sectors: 'Aggregate across all sectors. Sector-specific forecasts not yet available.',
      temporalRange: 'Training: 2020-present | Forecast: up to 36 months ahead',
      exclusions: [
        'Does not forecast government sector demand',
        'Cannot predict impact of future policy changes (e.g., Emiratisation quotas)',
        'Does not account for global recession scenarios',
      ],
      knownLimitations: [
        'CRITICAL: Training data mixes MOHRE permits (2020-2023) with LinkedIn ads (2024+). Model may overfit to the data-source transition, not actual demand changes.',
        'Only 18 months of LinkedIn data — insufficient for seasonal decomposition',
        'MAPE of 39.2% on current model indicates poor fit — treat forecasts as directional only',
      ],
    },
    revision: {
      schedule: 'Monthly — re-trained with each data refresh',
      revisionNote: 'Previous forecasts are not revised. Each month produces a new independent forecast from the latest data.',
    },
  },

  /* ─────────────────── DASHBOARD: SUPPLY vs DEMAND ─────────────────── */
  dashboard_supply_demand: {
    sources: ['Bayanat Open Data (2015-2019)', 'GLMM/MOHRE (2020-2024)', 'LinkedIn (2024-2025)', 'MOHRE Permits (2020-2023)'],
    aggregation: 'National-level annual aggregation across all occupations and emirates',
    formula: 'total_supply = Σ supply_count across all sources\ntotal_demand = Σ demand_count across all sources\ngap = demand - supply',
    measurement: 'Aggregate headcount. Combines multiple data sources with different methodologies (see limitations).',
    updateFrequency: 'Monthly as new data is ingested',
    dataStatus: 'provisional',
    confidence: {
      level: 'N/A',
      marginOfError: 'Supply: ±5% (register data). Demand: ±20% (mixed sources).',
      note: 'National totals are sums of source-specific estimates. Combined uncertainty is dominated by demand-side measurement variation.',
    },
    coverage: {
      geographic: 'All 7 UAE emirates',
      population: 'Supply: all registered workers (2015-2019) / private sector (2020-2024). Demand: formal job market.',
      sectors: 'All ISIC sectors',
      temporalRange: 'Supply: 2015-2024 | Demand: 2020-2026',
      exclusions: [
        'Informal economy',
        'Government sector (supply 2020-2024)',
        'Non-LinkedIn job market (demand 2024+)',
      ],
      knownLimitations: [
        'Supply and demand are measured differently — direct subtraction (gap) should be interpreted with caution',
        'Supply totals include STOCK of workers; demand mixes FLOW (permits, ads) with stock',
        'Year-on-year supply trend shows artificial drop at 2020 due to methodology change, not actual decline',
      ],
    },
    revision: {
      schedule: 'Quarterly',
    },
  },

  /* ─────────────────── DASHBOARD: SECTOR ─────────────────── */
  dashboard_sector: {
    sources: ['Bayanat Employment by Economic Activity (2015-2019)', 'ISIC Rev 4 Classification'],
    aggregation: 'Worker headcount grouped by ISIC economic sector',
    formula: 'sector_share = sector_workers / total_workers × 100',
    measurement: 'Percentage of total workforce in each economic sector.',
    updateFrequency: 'Annually from Bayanat',
    dataStatus: 'final',
    confidence: {
      level: 'N/A',
      note: 'Administrative register data — complete enumeration, no sampling error.',
    },
    coverage: {
      geographic: 'National aggregate',
      population: 'All registered workers by economic activity',
      sectors: '12 ISIC economic sectors (1-digit)',
      temporalRange: '2015-2019 (Bayanat)',
      exclusions: ['Sector data not available for 2020-2024 at granular level'],
      knownLimitations: [
        'Sector distribution reflects 2015-2019 average — may not represent current (2024) structure',
        'Some workers classified under "Business activities" may belong to more specific sectors',
      ],
    },
    revision: {
      schedule: 'When new Bayanat data is released',
    },
  },

  /* ─────────────────── DASHBOARD: EMIRATE ─────────────────── */
  dashboard_emirate: {
    sources: ['Bayanat Employment by Emirate (2015-2019)', 'GLMM/MOHRE (2020-2024)', 'LinkedIn (demand)'],
    aggregation: 'By emirate (7 emirates), supply/demand/SGI metrics',
    formula: 'SGI = supply / demand\nSGI > 1 = surplus, SGI < 1 = shortage\nCritical threshold: SGI > 15 (supply 15x demand)',
    measurement: 'SGI compares available workforce to job demand per emirate.',
    updateFrequency: 'Quarterly',
    dataStatus: 'provisional',
    confidence: {
      level: 'N/A',
      marginOfError: 'Emirate-level SGI has higher uncertainty than national due to smaller samples.',
      note: 'Dubai and Abu Dhabi have the most reliable estimates (largest samples). UAQ and Fujairah have fewest data points.',
    },
    coverage: {
      geographic: 'All 7 emirates individually',
      population: 'Private sector workers (supply) vs job postings (demand)',
      sectors: 'All sectors combined per emirate',
      temporalRange: 'Supply: 2015-2024 | Demand: 2020-2026',
      exclusions: [
        'Cross-emirate commuters (worker may live in Sharjah, work in Dubai)',
        'Remote workers registered in one emirate but physically in another',
      ],
      knownLimitations: [
        'LinkedIn demand skews toward Dubai (56%) — may underestimate demand in northern emirates',
        'Bayanat 2015-2019 only covers 5 of 7 emirates (Fujairah and UAQ partial)',
      ],
    },
    revision: {
      schedule: 'Quarterly',
    },
  },
};
