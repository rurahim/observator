/**
 * API response types — mirrors backend Pydantic schemas.
 */

// --- Salary Benchmarks ---
export interface SalaryBenchmark {
  job_title: string;
  region_code: string;
  emirate: string;
  min_salary: number;
  median_salary: number;
  max_salary: number;
  currency: string;
  sample_count: number;
  confidence: string;
  esco_occupation?: string;
  code_isco?: string;
}

// --- Data Source Status ---
export interface DataSourceStatus {
  source: string;
  record_count: number;
  last_updated: string | null;
}

// --- Data Transparency Metadata ---
export interface SourceInfo {
  name: string;
  rows: number;
  side?: string; // "supply" | "demand" | "ai"
}

export interface DataMeta {
  sources: SourceInfo[];
  total_rows: number;
  date_range?: { min: string; max: string };
  refreshed_at?: string;
  freshness_label?: string;
  quality_score?: number;
  coverage?: { emirates: number; total: number };
}

export interface SourceOption {
  value: string;
  label: string;
  rows: number;
  side?: string;
}

// --- Dashboard ---
export interface SupplyDemandPoint {
  month: string;
  supply: number;
  demand: number;
}

export interface SectorDistribution {
  sector: string;
  sector_ar?: string;
  count: number;
  percentage?: number;
}

export interface EmirateMetric {
  region_code: string;
  emirate: string;
  emirate_ar?: string;
  supply: number;
  demand: number;
  gap: number;
  sgi?: number;
}

export interface TopOccupation {
  occupation_id: number;
  title_en: string;
  title_ar?: string;
  supply: number;
  demand: number;
  gap: number;
  sgi?: number;
  status?: string;
}

export interface DashboardSummary {
  total_supply: number;
  total_demand: number;
  total_gap: number;
  sgi?: number;
  supply_demand_trend: SupplyDemandPoint[];
  sector_distribution: SectorDistribution[];
  sector_data_side?: string; // "demand" | "supply" | "both" | "none"
  emirate_metrics: EmirateMetric[];
  top_occupations: TopOccupation[];
  meta?: DataMeta;
}

// --- Filters ---
export interface FilterOption {
  value: string;
  label: string;
  label_ar?: string;
}

export interface FilterOptions {
  emirates: FilterOption[];
  sectors: FilterOption[];
  occupations: FilterOption[];
  date_range: { min: string; max: string };
  dynamic?: Record<string, FilterOption[]>; // gender, nationality, experience
  sources?: SourceOption[]; // available data sources with row counts
}

// --- Skill Gap ---
export interface OccupationGap {
  occupation_id: number;
  title_en: string;
  title_ar?: string;
  code_isco?: string;
  supply: number;
  demand: number;
  gap: number;
  sgi?: number;
  status?: string;
}

export interface SGITrend {
  month: string;
  sgi: number;
}

export interface SkillGapResponse {
  occupations: OccupationGap[];
  sgi_trend: SGITrend[];
  total_supply: number;
  total_demand: number;
  total_gap: number;
  methodology?: string;
  meta?: DataMeta;
}

// --- AI Impact ---
export interface OccupationAIExposure {
  occupation_id: number;
  title_en: string;
  title_ar?: string;
  code_isco?: string;
  exposure_score?: number;
  automation_probability?: number;
  llm_exposure?: number;
  risk_level: string;
}

export interface SectorAIExposure {
  sector: string;
  sector_ar?: string;
  avg_exposure: number;
  occupation_count: number;
  high_risk_count: number;
}

export interface AIImpactResponse {
  occupations: OccupationAIExposure[];
  sectors: SectorAIExposure[];
  skill_clusters: { skill: string; exposure: number; occupation_count: number }[];
  summary: { total_occupations: number; high_risk_pct: number; avg_exposure: number };
  meta?: DataMeta;
}

// --- Forecast ---
export interface ForecastPoint {
  date: string;
  predicted_demand?: number;
  predicted_supply?: number;
  predicted_gap?: number;
  confidence_lower?: number;
  confidence_upper?: number;
}

export interface ForecastResponse {
  occupation_id?: number;
  title_en?: string;
  region_code?: string;
  model_name?: string;
  horizon_months: number;
  points: ForecastPoint[];
}

export interface ScenarioResult {
  scenario: string;
  description: string;
  demand: number[];
  supply: number[];
  gap: number[];
}

// --- Chat ---
export interface ChatMessage {
  message_id: string;
  role: string;
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface Citation {
  evidence_id: string;
  source: string;
  excerpt: string;
  location?: string;
  source_type?: 'internal' | 'web_search' | 'job_search' | 'webpage' | 'training_knowledge';
  source_url?: string;
  retrieved_at?: string;
}

export interface ChatResponse {
  message: string;
  session_id: string;
  citations: Citation[];
  trace_id?: string;
}

export interface ChatSession {
  session_id: string;
  title?: string;
  created_at: string;
  message_count: number;
}

// --- Knowledge Base / Files ---
// Matches backend FileMetadata schema (files.py)
export interface KBFile {
  id: string;
  name: string;
  type: string;       // csv, excel, json, pdf, parquet
  size?: number;      // bytes
  records?: number;   // row_count
  uploaded: string;   // ISO datetime
  status: string;     // processed, processing, failed
  progress?: number;
  version?: string;
  source_type?: string;
}

// --- Reports ---
export interface ReportType {
  id: string;
  title: string;
  description: string;
}

export interface ReportOut {
  report_id: string;
  report_type: string;
  title: string;
  status: string;
  created_at?: string;
  data?: Record<string, unknown>;
}

// --- University ---
export interface UniversityResponse {
  program_coverage: { discipline: string; graduates: number; market_demand: number; coverage_ratio: number }[];
  missing_skills: { skill: string; demand_count: number; graduate_coverage: number; gap: number }[];
  recommendations: { institution: string; discipline: string; recommendation: string; priority: string }[];
  summary: Record<string, unknown>;
}

// --- Supply Dashboard ---
export interface SupplyDashboardResponse {
  kpis: {
    total_institutions: number;
    total_programs: number;
    total_enrolled: number;
    total_graduates: number;
  };
  enrollment_trend: { year: number; enrollment: number; is_estimated: boolean; sources: string[] }[];
  sector_trend: { year: number; sector: string; enrollment: number }[];
  by_emirate: { region_code: string; emirate: string; enrollment: number }[];
  by_specialty: { specialization: string; enrollment: number; data_type: string }[];
  by_gender: Record<string, number>;
  by_nationality: Record<string, number>;
  graduate_trend: { year: number; graduates: number; is_estimated: boolean }[];
  grad_by_specialty: { specialization: string; graduates: number }[];
  grad_gender: Record<string, number>;
  grad_nationality: Record<string, number>;
  grad_degree: { degree_level: string; graduates: number }[];
  stem_split: { indicator: string; count: number }[];
  uaeu_colleges: { college: string; graduates: number }[];
  programs_by_field: { field: string; count: number }[];
  programs_by_emirate: { emirate: string; count: number }[];
  program_distribution: { degree_level: string; count: number }[];
  institution_ranking: {
    institution: string; emirate: string; sector: string;
    programs: number; graduates: number; lat: number | null; lng: number | null;
  }[];
  top_skills: { skill: string; type: string; occupations: number; course_count?: number; skill_id?: string }[];
  skills_by_type: { type: string; count: number }[];
  digital_skills: { skill: string; occupations: number }[];
  knowledge_areas: { area: string; occupations: number }[];
  skills_kpis: { total_skills: number; total_mappings: number; essential_mappings: number };
  workforce_alignment: { occupation: string; code_isco: string; supply: number; demand: number; gap: number }[];
  // New sections
  enrollment_by_institution: { institution: string; emirate: string; enrollment: number }[];
  graduate_employment: { year: number; avg_rate: number; graduates_with_rate: number }[];
  graduate_credentials: { degree_level: string; graduates: number; avg_employment_rate: number | null }[];
  wage_distribution: { wage_band: string; workers: number }[];
  private_sector_trend: { year: number; isco_group: string; workers: number }[];
  enrollment_nationality_detail: { institution: string; nationality: string; enrollment: number }[];
  sources: { source: string; rows: number; category: string }[];
}

export interface DataExplorerResponse {
  table: string;
  db_table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  available_sources: string[];
}

// --- Admin ---
export interface AdminUser {
  user_id: string;
  email: string;
  display_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface AuditLog {
  id: number;
  user_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

// --- Data Landscape ---
export interface DataSource {
  name: string;
  category: string;
  files: number;
  rows: number;
  time_start: string;
  time_end: string;
  completeness: number;
  loaded_rows: number;
  status: string;
}

export interface DemandInsights {
  total_postings: number;
  unique_titles: number;
  unique_companies: number;
  date_range: { min: string; max: string };
  monthly_volume: { month: string; count: number }[];
  top_locations: { location: string; count: number; pct: number }[];
  top_industries: { industry: string; count: number }[];
  employment_types: { type: string; count: number; pct: number }[];
  experience_levels: { level: string; count: number; pct: number }[];
  isco_distribution: { group: string; count: number }[];
  top_companies: { company: string; count: number }[];
  data_quality: {
    missing_occupation_pct: number;
    missing_industry_pct: number;
    missing_date_pct: number;
    standardized_pct: number;
    duplicate_ids: number;
  };
}

export interface DataLandscape {
  overview: { total_files: number; total_rows: number; data_sources: number; time_span_years: number };
  sources: DataSource[];
  emiratisation: {
    emiratis_in_private_sector: { year: number; value: number }[];
    nafis_establishments: { year: number; value: number }[];
    growth_pct: number;
  };
  education_pipeline: {
    institutions: number;
    programs: number;
    courses: number;
    tech_courses: Record<string, number>;
    degree_distribution: Record<string, number>;
    institutions_by_emirate: Record<string, number>;
  };
  ai_impact_summary: {
    total_assessed: number;
    risk_distribution: Record<string, number>;
    high_risk_pct: number;
    top_exposed: string[];
    top_safe: string[];
  };
  skills_taxonomy: {
    esco_occupations: number;
    esco_skills: number;
    esco_mappings: number;
    essential_skills: number;
    optional_skills: number;
    onet_occupations: number;
    onet_skill_records: number;
    onet_hot_technologies: number;
    onet_emerging_tasks: number;
    top_essential_skills: { skill: string; occupations: number }[];
  };
  data_quality: {
    gaps: string[];
    strengths: string[];
  };
}

// --- Skills Taxonomy ---
export interface SkillDetail {
  skill_id: number;
  label_en: string;
  label_ar?: string;
  skill_type: string;
  taxonomy?: string;
  occupation_count: number;
  relation_type?: string;
}

export interface OnetStats {
  occupations: number;
  skills: number;
  knowledge: number;
  technologies: number;
  hot_technologies: number;
  emerging_tasks: number;
  alternate_titles: number;
  career_transitions: number;
}

export interface SkillsTaxonomyResponse {
  skills: SkillDetail[];
  total_skills: number;
  total_mappings: number;
  hot_technologies: { technology: string; occupation_count: number }[];
  emerging_tasks: { task: string; category: string; soc_code: string }[];
  top_essential_skills: { skill: string; occupation_count: number }[];
  onet_stats: OnetStats;
}

export interface HotTechResponse {
  technologies: { category: string; example: string; occupation_count: number }[];
  total_hot: number;
}

export interface OccupationSkillsResponse {
  occupation_id: number;
  esco_skills: { skill: string; skill_ar?: string; type: string; relation: string }[];
  onet_skills: { skill: string; scale: string; value: number | null }[];
  technologies: { tool: string; category: string; hot: boolean }[];
}

// --- Education Pipeline ---
export interface EducationPipelineResponse {
  yearly_trends: Record<string, Record<string, number>>;
  by_emirate: { emirate: string; region_code: string; total: number }[];
  by_gender: Record<string, number>;
  by_level: { level: string; total: number }[];
  by_sector: Record<string, number>;
  institutions: { total: number; by_emirate: Record<string, number> };
  totals: Record<string, number>;
  programs: number;
  courses: number;
}

// --- Demographics ---
export interface DemographicsResponse {
  total_population: number;
  age_pyramid: { age_group: string; gender: string; count: number }[];
  citizenship: Record<string, number>;
  by_emirate: { emirate: string; region_code: string; population: number }[];
  years_available: number[];
}

// --- Career Transitions ---
export interface TransitionTarget {
  occupation: string;
  code_isco?: string;
  occupation_id: number;
  tier: string;
  index: number | null;
}

export interface TransitionsResponse {
  occupation: string;
  code_isco?: string;
  occupation_id: number;
  transitions_from: TransitionTarget[];
  transitions_to: TransitionTarget[];
}

export interface SkillGapPathway {
  from_occupation: string;
  to_occupation: string;
  skill_overlap_pct: number;
  shared_skills: string[];
  skills_to_acquire: string[];
  transferable_skills: string[];
  transition_difficulty: string;
}

// --- Knowledge Base ---
export interface KBTableInfo {
  name: string;
  display_name: string;
  description: string;
  row_count: number;
  column_count: number;
  category: string;
}

export interface KBCategory {
  name: string;
  icon: string;
  tables: KBTableInfo[];
}

export interface KBTablesResponse {
  categories: KBCategory[];
  total_tables: number;
  total_rows: number;
}

export interface KBColumnDef {
  name: string;
  type: string;
}

export interface KBBrowseResponse {
  table: string;
  display_name: string;
  columns: KBColumnDef[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export interface KBStatsResponse {
  total_tables: number;
  total_rows: number;
  categories: { name: string; tables: number; rows: number }[];
  data_sources: number;
}

// --- Data Explorer ---
export interface ViewColumnDef {
  name: string;
  type: string;
  filterable: boolean;
  aggregatable?: boolean;
  description?: string;
}

export interface ViewDef {
  name: string;
  description: string;
  columns: ViewColumnDef[];
  default_order: string;
  supports_group_by: boolean;
}

export interface ExploreResponse {
  data: Record<string, unknown>[];
  columns: ViewColumnDef[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  view: string;
}
