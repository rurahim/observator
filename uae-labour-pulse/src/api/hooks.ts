/**
 * React Query hooks for all API endpoints.
 *
 * Usage: import { useDashboardSummary } from "@/api/hooks";
 * Then in component: const { data, isLoading, error } = useDashboardSummary({ emirate: "DXB" });
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type {
  AdminUser,
  AIImpactResponse,
  AuditLog,
  ChatResponse,
  ChatSession,
  ChatMessage,
  DashboardSummary,
  DataLandscape,
  DemandInsights,
  DemographicsResponse,
  EducationPipelineResponse,
  FilterOptions,
  ForecastResponse,
  HotTechResponse,
  KBFile,
  OccupationSkillsResponse,
  ReportOut,
  ReportType,
  ScenarioResult,
  SkillGapPathway,
  SkillGapResponse,
  SkillsTaxonomyResponse,
  TransitionsResponse,
  UniversityResponse,
  SupplyDashboardResponse,
  DataExplorerResponse,
} from "./types";

// --- Dashboard ---

export function useDashboardSummary(params?: {
  emirate?: string;
  sector?: string;
  date_from?: string;
  date_to?: string;
  data_source?: string;
}) {
  return useQuery({
    queryKey: ["dashboard-summary", params],
    queryFn: () => api.get<DashboardSummary>("/dashboards/summary", params as any),
    staleTime: 60_000, // 15s — short enough to pick up pipeline data quickly
  });
}

// --- Filters ---

export function useFilterOptions() {
  return useQuery({
    queryKey: ["filter-options"],
    queryFn: () => api.get<FilterOptions>("/filters"),
    staleTime: 5 * 60_000,
  });
}

// --- Skill Gap ---

export function useSkillGap(params?: { emirate?: string; sector?: string; limit?: number }) {
  return useQuery({
    queryKey: ["skill-gap", params],
    queryFn: () => api.get<SkillGapResponse>("/skill-gap", params as any),
    staleTime: 60_000,
  });
}

// --- AI Impact ---

export function useAnthropicIndex() {
  return useQuery({
    queryKey: ["anthropic-index"],
    queryFn: () => api.get<any>("/ai-impact/anthropic-index"),
    staleTime: 5 * 60_000,
  });
}

export function useAITaxonomy() {
  return useQuery({
    queryKey: ["ai-taxonomy"],
    queryFn: () => api.get<any>("/ai-impact/taxonomy"),
    staleTime: 5 * 60_000,
  });
}

export function useAIImpact(params?: { sector?: string; limit?: number }) {
  return useQuery({
    queryKey: ["ai-impact", params],
    queryFn: () => api.get<AIImpactResponse>("/ai-impact", params as any),
    staleTime: 60_000,
  });
}

// --- Forecasts ---

export function useForecasts(params?: {
  occupation_id?: number;
  region_code?: string;
  horizon?: number;
  model?: string;
}) {
  return useQuery({
    queryKey: ["forecasts", params],
    queryFn: () => api.get<ForecastResponse[]>("/forecasts", params as any),
    staleTime: 60_000,
  });
}

export function useGenerateForecast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      occupation_id?: number;
      region_code?: string;
      horizon?: number;
      model_name?: string;
    }) => api.post("/forecasts/generate", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["forecasts"] }),
  });
}

export function useForecastScenarios() {
  return useMutation({
    mutationFn: (body: {
      occupation_id?: number;
      region_code?: string;
      horizon?: number;
      scenarios?: string[];
    }) => api.post<{ scenarios: ScenarioResult[] }>("/forecasts/scenarios", body),
  });
}

export function useForecastModels() {
  return useQuery({
    queryKey: ["forecast-models"],
    queryFn: () => api.get<{ name: string; description: string }[]>("/forecasts/models"),
    staleTime: Infinity,
  });
}

export function useScenarioPresets() {
  return useQuery({
    queryKey: ["scenario-presets"],
    queryFn: () => api.get<{ id: string; name: string; description: string }[]>("/forecasts/scenarios/presets"),
    staleTime: Infinity,
  });
}

// --- Chat ---

export function useChatSessions() {
  return useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api.get<ChatSession[]>("/chat/sessions"),
  });
}

export function useChatMessages(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["chat-messages", sessionId],
    queryFn: () => api.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`),
    enabled: !!sessionId,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      message: string;
      session_id?: string;
      dashboard_state?: Record<string, unknown>;
      selected_files?: string[];
    }) => api.post<ChatResponse>("/chat", body),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      qc.invalidateQueries({ queryKey: ["chat-messages", data.session_id] });
    },
  });
}

// --- Knowledge Base / Files ---

export function useFiles() {
  return useQuery({
    queryKey: ["files"],
    queryFn: () => api.get<KBFile[]>("/files"),
  });
}

export interface FileUploadResult {
  dataset_id: string;
  name: string;
  status: string;
  minio_path?: string;
  pipeline_run_id?: string;
}

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<FileUploadResult>("/files/upload", file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/files/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });
}

export interface PipelineResults {
  dataset_id: string;
  status: "completed" | "processing" | "failed" | "pending";
  started_at?: string;
  completed_at?: string;
  agents_completed?: {
    name: string;
    duration_seconds: number;
    status: string;
  }[];
  results?: {
    rows_loaded?: number;
    occupations_mapped?: number;
    skills_extracted?: number;
    views_refreshed?: number;
    errors?: string[];
  };
}

export function usePipelineResults(datasetId: string | null) {
  return useQuery({
    queryKey: ["pipeline-results", datasetId],
    queryFn: async (): Promise<PipelineResults | null> => {
      const raw = await api.get<{ dataset_id: string; runs: any[] }>(`/files/${datasetId}/pipeline-results`);
      if (!raw?.runs?.length) return null;
      const run = raw.runs[0];
      const summary = run.result_summary || {};
      const timings = run.step_timings || {};
      const errors = run.errors || [];
      const agents = (run.completed_agents || []).map((name: string) => ({
        name,
        duration_seconds: (timings[name] || 0) / 1000,
        status: errors.some((e: string) => e.toLowerCase().includes(name.toLowerCase())) ? 'failed' : 'completed',
      }));
      return {
        dataset_id: raw.dataset_id,
        status: run.status === 'completed_with_errors' ? 'completed' : run.status,
        started_at: run.created_at,
        completed_at: run.finished_at,
        agents_completed: agents,
        results: {
          rows_loaded: summary.rows_loaded,
          occupations_mapped: summary.occupation_mappings_count,
          skills_extracted: summary.skill_extractions_count,
          views_refreshed: Array.isArray(summary.views_refreshed) ? summary.views_refreshed.length : summary.views_refreshed,
          errors: errors.length > 0 ? errors : undefined,
        },
      };
    },
    enabled: !!datasetId,
  });
}

export function usePollPipelineResults(datasetId: string | null) {
  return useQuery({
    queryKey: ["pipeline-results", datasetId],
    queryFn: () => api.get<PipelineResults>(`/files/${datasetId}/pipeline-results`),
    enabled: !!datasetId,
    refetchInterval: (query) => {
      const data = query.state.data as PipelineResults | undefined;
      if (data?.status === "completed" || data?.status === "failed") return false;
      return 3000; // poll every 3 seconds while processing
    },
  });
}

// --- Reports ---

export function useReportTypes() {
  return useQuery({
    queryKey: ["report-types"],
    queryFn: () => api.get<ReportType[]>("/reports/types"),
    staleTime: Infinity,
  });
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: (body: { report_type: string; filters?: Record<string, unknown>; format?: string }) =>
      api.post<ReportOut>("/reports", body),
  });
}

// --- University ---

export function useUniversity(params?: { emirate?: string; institution_id?: number }) {
  return useQuery({
    queryKey: ["university", params],
    queryFn: () => api.get<UniversityResponse>("/university", params as any),
    staleTime: 60_000,
  });
}

// --- Supply Dashboard ---

export function useSupplyDashboard(params?: {
  emirate?: string; year_from?: number; year_to?: number; sector?: string;
}) {
  return useQuery({
    queryKey: ["supply-dashboard", params],
    queryFn: () => api.get<SupplyDashboardResponse>("/supply-dashboard", params as any),
    staleTime: 60_000,
  });
}

export function useSupplyDataExplorer(params: {
  table: string; source?: string; limit?: number; offset?: number;
}) {
  return useQuery({
    queryKey: ["supply-data-explorer", params],
    queryFn: () => api.get<DataExplorerResponse>("/supply-dashboard/data-explorer", params as any),
    staleTime: 30_000,
    enabled: !!params.table,
  });
}

// --- Admin ---

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<AdminUser[]>("/admin/users"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string; display_name?: string; role?: string }) =>
      api.post<AdminUser>("/admin/users", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...body }: { userId: string; display_name?: string; role?: string; is_active?: boolean }) =>
      api.put<AdminUser>(`/admin/users/${userId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
}

export function useAuditLogs(params?: { limit?: number; action?: string }) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => api.get<AuditLog[]>("/admin/audit", params as any),
  });
}

export function useDataSources() {
  return useQuery({
    queryKey: ["data-sources"],
    queryFn: () => api.get<KBFile[]>("/admin/datasources"),
  });
}

// --- Evidence ---

export function useEvidenceSearch() {
  return useMutation({
    mutationFn: (body: { query: string; file_ids?: string[]; k?: number }) =>
      api.post<{ evidence_id: string; source?: string; excerpt?: string }[]>("/evidence/search", body),
  });
}

export function useEvidenceDetail(evidenceId: string | undefined) {
  return useQuery({
    queryKey: ["evidence", evidenceId],
    queryFn: () => api.get<Record<string, unknown>>(`/evidence/${evidenceId}`),
    enabled: !!evidenceId,
  });
}

export function useEvidenceFeedback() {
  return useMutation({
    mutationFn: (body: { evidence_id: string; trace_id: string; score: number; comment?: string }) =>
      api.post("/evidence/feedback", body),
  });
}

// --- Notifications ---

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/notifications"),
    refetchInterval: 10000, // Poll every 10s for new notifications
  });
}

export function useNotificationCount() {
  return useQuery({
    queryKey: ["notification-count"],
    queryFn: () => api.get<{ unread: number }>("/notifications/count"),
    refetchInterval: 10000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/notifications/read-all", {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });
}

// --- Scheduler ---

export interface ScheduledSource {
  source_type: string;
  label: string;
  enabled: boolean;
  interval_hours: number;
  last_run: string | null;
  next_run: string | null;
}

export function useScheduledSources() {
  return useQuery({
    queryKey: ["scheduled-sources"],
    queryFn: () => api.get<ScheduledSource[]>("/scheduler/sources"),
  });
}

export function useToggleSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceType: string) => api.post(`/scheduler/sources/${sourceType}/toggle`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduled-sources"] }),
  });
}

export function useRunSourceNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceType: string) => api.post(`/scheduler/sources/${sourceType}/run-now`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-sources"] });
      qc.invalidateQueries({ queryKey: ["notification-count"] });
    },
  });
}

// --- Data Landscape ---

export function useDemandInsights() {
  return useQuery({
    queryKey: ["demand-insights"],
    queryFn: () => api.get<DemandInsights>("/demand-insights"),
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function useDataLandscape() {
  return useQuery({
    queryKey: ["data-landscape"],
    queryFn: () => api.get<DataLandscape>("/data-landscape"),
    staleTime: 1000 * 60 * 60,
  });
}

// --- Skills Taxonomy ---

export function useSkillsTaxonomy(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ["skills-taxonomy", params],
    queryFn: () => api.get<SkillsTaxonomyResponse>("/skills-taxonomy", params),
    staleTime: 1000 * 60 * 60,
  });
}

export function useOccupationSkills(occupationId: number | null) {
  return useQuery({
    queryKey: ["occupation-skills", occupationId],
    queryFn: () => api.get<OccupationSkillsResponse>(`/skills-taxonomy/occupation/${occupationId}`),
    enabled: !!occupationId,
  });
}

export function useHotTechnologies() {
  return useQuery({
    queryKey: ["hot-technologies"],
    queryFn: () => api.get<HotTechResponse>("/skills-taxonomy/hot-technologies"),
    staleTime: 1000 * 60 * 60,
  });
}

// --- Education Pipeline ---

export function useEducationPipeline(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["education-pipeline", params],
    queryFn: () => api.get<EducationPipelineResponse>("/education-pipeline", params),
    staleTime: 1000 * 60 * 60,
  });
}

// --- Demographics ---

export function useDemographics(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ["demographics", params],
    queryFn: () => api.get<DemographicsResponse>("/population-demographics", params),
    staleTime: 1000 * 60 * 60,
  });
}

// --- Career Transitions ---

export function useOccupationTransitions(occupationId: number | null) {
  return useQuery({
    queryKey: ["transitions", occupationId],
    queryFn: () => api.get<TransitionsResponse>(`/occupation-transitions/${occupationId}`),
    enabled: !!occupationId,
  });
}

export function useSkillGapPathway(fromOcc: number | null, toOcc: number | null) {
  return useQuery({
    queryKey: ["skill-gap-pathway", fromOcc, toOcc],
    queryFn: () => api.get<SkillGapPathway>(`/occupation-transitions/pathway?from_occ=${fromOcc}&to_occ=${toOcc}`),
    enabled: !!fromOcc && !!toOcc,
  });
}

// --- Salary Benchmarks ---
export function useSalaryBenchmarks(params?: { emirate?: string; limit?: number }) {
  return useQuery({
    queryKey: ["salary-benchmarks", params],
    queryFn: () => api.get<import("./types").SalaryBenchmark[]>("/dashboards/salaries", params as any),
    staleTime: 5 * 60_000,
  });
}

// --- Data Source Status ---
export function useDataSourcesStatus() {
  return useQuery({
    queryKey: ["data-sources-status"],
    queryFn: () => api.get<import("./types").DataSourceStatus[]>("/dashboards/data-sources-status"),
    staleTime: 60_000,
  });
}

export function useFetchJSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params?: { max_pages?: number }) =>
      api.post<Record<string, unknown>>("/admin/fetch-jsearch" + (params?.max_pages ? `?max_pages=${params.max_pages}` : "")),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["data-sources-status"] });
    },
  });
}

export function useFetchSalaries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Record<string, unknown>>("/admin/fetch-salaries"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["salary-benchmarks"] });
      qc.invalidateQueries({ queryKey: ["data-sources-status"] });
    },
  });
}

// --- Knowledge Base ---

export function useKBTables() {
  return useQuery({
    queryKey: ["kb-tables"],
    queryFn: () => api.get<import("./types").KBTablesResponse>("/knowledge-base/tables"),
    staleTime: 5 * 60_000,
  });
}

export function useKBBrowse(params: {
  table: string;
  limit?: number;
  offset?: number;
  sort?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["kb-browse", params],
    queryFn: () => api.get<import("./types").KBBrowseResponse>("/knowledge-base/browse", params as any),
    staleTime: 60_000,
    enabled: !!params.table,
  });
}

export function useKBStats() {
  return useQuery({
    queryKey: ["kb-stats"],
    queryFn: () => api.get<import("./types").KBStatsResponse>("/knowledge-base/stats"),
    staleTime: 5 * 60_000,
  });
}

// --- Skill Matching ---

export function useSkillMatchingSummary() {
  return useQuery({
    queryKey: ["skill-matching-summary"],
    queryFn: () => api.get<any>("/skill-matching/summary"),
    staleTime: 5 * 60_000,
  });
}

export function useSkillGaps(params?: { limit?: number; min_demand?: number }) {
  return useQuery({
    queryKey: ["skill-gaps", params],
    queryFn: () => api.get<any>("/skill-matching/gaps", params as any),
    staleTime: 5 * 60_000,
  });
}

export function useDemandedSkills(params?: { limit?: number }) {
  return useQuery({
    queryKey: ["demanded-skills", params],
    queryFn: () => api.get<any>("/skill-matching/demanded-skills", params as any),
    staleTime: 5 * 60_000,
  });
}

export function useSuppliedSkills(params?: { limit?: number }) {
  return useQuery({
    queryKey: ["supplied-skills", params],
    queryFn: () => api.get<any>("/skill-matching/supplied-skills", params as any),
    staleTime: 5 * 60_000,
  });
}

// --- Explorer ---

export function useExplorerFilters() {
  return useQuery({ queryKey: ["explorer-filters"], queryFn: () => api.get<any>("/explorer/filters"), staleTime: 5 * 60_000 });
}
export function useExplorerByInstitution(params?: any) {
  return useQuery({ queryKey: ["explorer-institution", params], queryFn: () => api.get<any>("/explorer/by-institution", params), staleTime: 60_000, enabled: true });
}
export function useExplorerByProgram(params?: any) {
  return useQuery({ queryKey: ["explorer-program", params], queryFn: () => api.get<any>("/explorer/by-program", params), staleTime: 60_000 });
}
export function useExplorerBySkill(params?: any) {
  return useQuery({ queryKey: ["explorer-skill", params], queryFn: () => api.get<any>("/explorer/by-skill", params), staleTime: 60_000 });
}
export function useExplorerByOccupation(params?: any) {
  return useQuery({ queryKey: ["explorer-occupation", params], queryFn: () => api.get<any>("/explorer/by-occupation", params), staleTime: 60_000 });
}
export function useExplorerByRegion() {
  return useQuery({ queryKey: ["explorer-region"], queryFn: () => api.get<any>("/explorer/by-region"), staleTime: 60_000 });
}
export function useExplorerSkillDetail(skillId: number | null) {
  return useQuery({ queryKey: ["explorer-skill-detail", skillId], queryFn: () => api.get<any>(`/explorer/skill-detail/${skillId}`), staleTime: 60_000, enabled: !!skillId });
}

export function useRealSkillComparison(params?: { limit?: number; search?: string; skill_type?: string; page?: number }) {
  return useQuery({
    queryKey: ["real-skill-comparison", params],
    queryFn: () => api.get<any>("/skill-matching/real-comparison", params as any),
    staleTime: 60_000,
  });
}

export function useUnifiedTimeline(params?: { region?: string; occupation?: string; isco_group?: string }) {
  return useQuery({
    queryKey: ["unified-timeline", params],
    queryFn: () => api.get<any>("/skill-matching/unified-timeline", params as any),
    staleTime: 60_000,
  });
}

export function usePastYearly(params?: { year?: number; region?: string; limit?: number }) {
  return useQuery({
    queryKey: ["past-yearly", params],
    queryFn: () => api.get<any>("/skill-matching/past-yearly", params as any),
    staleTime: 5 * 60_000,
  });
}

export function useFutureProjection() {
  return useQuery({
    queryKey: ["future-projection"],
    queryFn: () => api.get<any>("/skill-matching/future-projection"),
    staleTime: 5 * 60_000,
  });
}

export function useISCOGroupComparison(params?: { region?: string }) {
  return useQuery({
    queryKey: ["isco-group-comparison", params],
    queryFn: () => api.get<any>("/skill-matching/isco-group-comparison", params as any),
    staleTime: 5 * 60_000,
  });
}

export function useOccupationSkillsDetail(occupationId: number | null) {
  return useQuery({
    queryKey: ["occ-skills-detail", occupationId],
    queryFn: () => api.get<any>(`/skill-matching/occupation-skills/${occupationId}`),
    staleTime: 60_000,
    enabled: !!occupationId,
  });
}

export function useRealOccupationComparison(params?: { limit?: number; search?: string; region?: string; page?: number }) {
  return useQuery({
    queryKey: ["real-occ-comparison", params],
    queryFn: () => api.get<any>("/skill-matching/real-occupation-comparison", params as any),
    staleTime: 60_000,
  });
}

export function useSkillComparison(params?: { limit?: number }) {
  return useQuery({
    queryKey: ["skill-comparison", params],
    queryFn: () => api.get<any>("/skill-matching/comparison", params as any),
    staleTime: 5 * 60_000,
  });
}

// --- Data Explorer ---
export function useViewSchemas() {
  return useQuery({
    queryKey: ["query-views"],
    queryFn: () => api.get<{ views: import("./types").ViewDef[] }>("/query/views"),
    staleTime: 300_000, // 5 min
  });
}

export function useExploreView(params: {
  view: string;
  sort?: string;
  limit?: number;
  offset?: number;
  search?: string;
  emirate?: string;
  sector?: string;
  source?: string;
}) {
  return useQuery({
    queryKey: ["explore", params],
    queryFn: () => api.get<import("./types").ExploreResponse>("/query/explore", params as any),
    staleTime: 60_000,
    enabled: !!params.view,
  });
}
