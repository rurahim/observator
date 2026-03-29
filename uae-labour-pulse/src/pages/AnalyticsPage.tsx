import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFilters } from '@/contexts/FilterContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import {
  useSkillGap,
  useForecasts,
  useGenerateForecast,
  useForecastScenarios,
  useScenarioPresets,
  useForecastModels,
  useDashboardSummary,
} from '@/api/hooks';
import type { ScenarioResult } from '@/api/types';
import PageHeader from '@/components/shared/PageHeader';
import KPICard from '@/components/shared/KPICard';
import FilterBar from '@/components/shared/FilterBar';
import InsightPanel from '@/components/shared/InsightPanel';
import EmptyState, { ChartEmpty, ErrorState } from '@/components/shared/EmptyState';
import { SkeletonPage, SkeletonChart, SkeletonKPICard } from '@/components/shared/Skeletons';
import ResponsiveTable from '@/components/shared/ResponsiveTable';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartTooltip from '@/components/charts/ChartTooltip';
import ChartInsight from '@/components/charts/ChartInsight';
import DataMethodology from '@/components/charts/DataMethodology';
import ChartGradientDefs from '@/components/charts/ChartGradientDefs';
import {
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar,
  ComposedChart,
  PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Users, Briefcase, TrendingDown, Activity, AlertTriangle,
  Search, Download, Play, Loader2, ChevronDown,
  Database, ExternalLink,
} from 'lucide-react';
import { formatCompact } from '@/utils/formatters';
import {
  COLORS, SGI_COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM,
  getSeriesColor, SERIES_COLORS, BAR_RADIUS,
} from '@/utils/chartColors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    'Critical Shortage': 'bg-sgi-critical/10 text-sgi-critical',
    'Moderate Shortage': 'bg-sgi-shortage/10 text-sgi-shortage',
    'Balanced': 'bg-sgi-balanced/10 text-sgi-balanced',
    'Moderate Surplus': 'bg-sgi-surplus/10 text-sgi-surplus',
    'Critical Surplus': 'bg-sgi-oversupply/10 text-sgi-oversupply',
  };
  return map[status] || 'bg-muted text-text-muted';
};

const sgiSeverity = (sgi: number) => {
  if (sgi > 20) return 'critical';
  if (sgi > 5) return 'warning';
  if (sgi >= -5) return 'success';
  return 'info';
};

const sgiSeverityLabel = (sgi: number) => {
  if (sgi > 20) return 'Critical Shortage';
  if (sgi > 5) return 'Moderate Shortage';
  if (sgi >= -5) return 'Balanced';
  return 'Surplus';
};

const cardClass = 'bg-white/80 backdrop-blur-xl border border-white/20 shadow-xl rounded-2xl';
const sectionCard = `${cardClass} p-5 overflow-hidden`;

// Tab definitions
const TABS = [
  { key: 'gap', label: 'Gap Analysis', labelAr: 'تحليل الفجوة' },
  { key: 'forecast', label: 'Forecasting', labelAr: 'التنبؤ' },
  { key: 'scenarios', label: 'Scenarios', labelAr: 'السيناريوهات' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

// Scenario colors
const SCENARIO_COLORS: Record<string, string> = {
  baseline: COLORS.navy,
  optimistic: COLORS.emerald,
  pessimistic: COLORS.coral,
  emiratisation_push: COLORS.gold,
  ai_disruption: COLORS.teal,
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const AnalyticsPage = () => {
  const { t } = useLanguage();
  const { filters } = useFilters();
  const loading = usePageLoading(600);

  // ---- State ----
  const [activeTab, setActiveTab] = useState<TabKey>('gap');
  const [searchQuery, setSearchQuery] = useState('');
  const [forecastModel, setForecastModel] = useState('auto');
  const [horizon, setHorizon] = useState(12);
  const [activeScenarios, setActiveScenarios] = useState<Set<string>>(
    new Set(['baseline', 'optimistic', 'pessimistic'])
  );
  const [expandedOcc, setExpandedOcc] = useState<number | null>(null);

  // ---- API params ----
  const apiParams = useMemo(() => {
    const p: Record<string, string | number> = { limit: 50 };
    if (filters.emirate !== 'all') p.emirate = filters.emirate;
    if (filters.sector !== 'all') p.sector = filters.sector;
    return p;
  }, [filters.emirate, filters.sector]);

  // ---- Data hooks ----
  const { data: gapData, isLoading: gapLoading, error: gapError } = useSkillGap(apiParams);
  const { data: forecasts, isLoading: forecastLoading } = useForecasts({
    horizon,
    model: forecastModel === 'auto' ? undefined : forecastModel,
  });
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary(
    filters.emirate !== 'all' ? { emirate: filters.emirate } : undefined
  );
  const { data: models } = useForecastModels();
  const { data: presets } = useScenarioPresets();
  const generateForecast = useGenerateForecast();
  const scenarioMutation = useForecastScenarios();

  // ---- Derived data ----
  const totalSupply = gapData?.total_supply ?? summary?.total_supply ?? 0;
  const totalDemand = gapData?.total_demand ?? summary?.total_demand ?? 0;
  const totalGap = gapData?.total_gap ?? summary?.total_gap ?? 0;
  const overallSgi = totalDemand > 0
    ? Math.round(((totalDemand - totalSupply) / totalDemand) * 100 * 10) / 10
    : 0;
  const criticalCount = useMemo(
    () => (gapData?.occupations ?? []).filter(
      o => o.status === 'Critical Shortage' || (o.sgi != null && o.sgi > 20)
    ).length,
    [gapData]
  );

  // Sparklines for KPIs
  const sgiSparkData = useMemo(
    () => (gapData?.sgi_trend ?? []).map(p => p.sgi),
    [gapData]
  );

  // SGI Trend chart data
  const sgiTrend = useMemo(
    () => (gapData?.sgi_trend ?? []).map(p => ({
      month: p.month,
      sgi: Math.round(p.sgi * 100) / 100,
    })),
    [gapData]
  );

  // Supply vs Demand trend from dashboard
  const supplyDemandTrend = useMemo(
    () => (summary?.supply_demand_trend ?? []).map(p => ({
      month: p.month ?? '',
      supply: p.supply ?? 0,
      demand: p.demand ?? 0,
      gap: (p.demand ?? 0) - (p.supply ?? 0),
    })),
    [summary]
  );

  // Top occupation gaps (diverging bar)
  const topGaps = useMemo(() => {
    if (!gapData?.occupations?.length) return [];
    return [...gapData.occupations]
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, 15)
      .map(o => ({
        name: (o.title_en ?? '').length > 25 ? (o.title_en ?? '').slice(0, 23) + '...' : (o.title_en ?? ''),
        gap: o.gap,
        fill: o.gap > 0 ? SGI_COLORS.critical : SGI_COLORS.surplus,
      }));
  }, [gapData]);

  // Forecast chart data
  const forecastChartData = useMemo(() => {
    if (!forecasts?.length) return [];
    const fc = forecasts[0];
    if (!fc?.points?.length) return [];
    return fc.points.map(p => ({
      date: p.date,
      demand: p.predicted_demand ?? 0,
      supply: p.predicted_supply ?? 0,
      gap: p.predicted_gap ?? 0,
      lower: p.confidence_lower ?? 0,
      upper: p.confidence_upper ?? 0,
    }));
  }, [forecasts]);

  // Scenario data
  const scenarioResults: ScenarioResult[] = (scenarioMutation.data?.scenarios ?? []).map(sr => ({
    ...sr,
    demand: sr.demand ?? [],
    supply: sr.supply ?? [],
    gap: sr.gap ?? [],
  }));

  // Sector distribution for pie chart
  const sectorData = useMemo(() => {
    if (!summary?.sector_distribution?.length) return [];
    return summary.sector_distribution.slice(0, 8).map((s, i) => ({
      name: s.sector,
      value: s.count,
      fill: getSeriesColor(i),
    }));
  }, [summary]);

  // Emirate comparison data
  const emirateData = useMemo(
    () => (summary?.emirate_metrics ?? []).map(e => ({
      emirate: e.emirate ?? '',
      supply: e.supply ?? 0,
      demand: e.demand ?? 0,
      sgi: e.sgi ?? 0,
    })),
    [summary]
  );

  // Table data
  const tableData = useMemo(() => {
    if (!gapData?.occupations?.length) return [];
    return gapData.occupations.map(o => {
      const gapPct = o.demand > 0 ? Math.round(((o.demand - o.supply) / o.demand) * 100) : 0;
      let status = o.status || 'Balanced';
      if (!o.status) {
        if (gapPct > 20) status = 'Critical Shortage';
        else if (gapPct > 5) status = 'Moderate Shortage';
        else if (gapPct < -5) status = 'Moderate Surplus';
      }
      return { ...o, sgiPct: gapPct, derivedStatus: status };
    });
  }, [gapData]);

  const filteredTable = useMemo(
    () => tableData.filter(r =>
      (r.title_en ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.code_isco ?? '').includes(searchQuery)
    ),
    [tableData, searchQuery]
  );

  // Scenario radar data
  const radarData = useMemo(() => {
    if (!scenarioResults.length) return [];
    const metrics = ['Peak Demand', 'Peak Supply', 'Avg Gap', 'Volatility', 'Trend Slope'];
    return metrics.map((metric, mi) => {
      const entry: Record<string, string | number> = { metric };
      scenarioResults.forEach(sr => {
        if (!activeScenarios.has(sr.scenario)) return;
        const values = mi === 0 ? sr.demand : mi === 1 ? sr.supply : sr.gap;
        if (!values || values.length === 0) {
          entry[sr.scenario] = 0;
          return;
        }
        const max = Math.max(...values.map(Math.abs), 1);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        // Normalize to 0-100 scale
        entry[sr.scenario] = mi < 3
          ? Math.round((Math.max(...values) / max) * 100)
          : mi === 3
            ? Math.round((Math.max(...values) - Math.min(...values)) / max * 100)
            : Math.round(Math.abs(avg / max) * 100);
      });
      return entry;
    });
  }, [scenarioResults, activeScenarios]);

  // ---- Actions ----
  const handleGenerateForecast = useCallback(() => {
    generateForecast.mutate({
      horizon,
      model_name: forecastModel === 'auto' ? undefined : forecastModel,
    });
  }, [generateForecast, horizon, forecastModel]);

  const handleRunScenarios = useCallback(() => {
    scenarioMutation.mutate({
      horizon,
      scenarios: Array.from(activeScenarios),
    });
  }, [scenarioMutation, horizon, activeScenarios]);

  const toggleScenario = useCallback((id: string) => {
    setActiveScenarios(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ---- Skeleton ----
  if (loading || gapLoading || summaryLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 animate-pulse bg-surface-tertiary rounded" />
          <div className="h-9 w-28 rounded-xl animate-pulse bg-surface-tertiary rounded" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={300} />
          <SkeletonChart height={300} />
        </div>
        <SkeletonChart height={350} />
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="space-y-6">
      {/* Error banner */}
      {gapError && (
        <ErrorState
          message={gapError instanceof Error ? gapError.message : 'Failed to load analytics data'}
          onRetry={() => window.location.reload()}
        />
      )}

      {/* Page Header */}
      <PageHeader
        title={t('التحليلات والتنبؤ', 'Analytics & Forecasting')}
        subtitle={t(
          'تحليل الفجوة + التنبؤ + محاكاة السيناريوهات',
          'Skill gap analysis, demand forecasting, and scenario simulation'
        )}
        actions={
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors">
            <Download className="w-4 h-4" />
            {t('تصدير التقرير', 'Export Report')}
          </button>
        }
      />

      <FilterBar />

      {/* ============================================================= */}
      {/* KPI Cards                                                     */}
      {/* ============================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          icon={Users}
          label={t('إجمالي العرض', 'Total Supply')}
          value={formatCompact(totalSupply)}
          status="info"
          delay={0}
          sparkData={supplyDemandTrend.map(p => p.supply)}
        />
        <KPICard
          icon={Briefcase}
          label={t('إجمالي الطلب', 'Total Demand')}
          value={formatCompact(totalDemand)}
          status="info"
          delay={0.05}
          sparkData={supplyDemandTrend.map(p => p.demand)}
        />
        <KPICard
          icon={TrendingDown}
          label={t('الفجوة الكلية', 'Overall Gap')}
          value={formatCompact(Math.abs(totalGap))}
          unit={totalGap > 0 ? 'shortage' : totalGap < 0 ? 'surplus' : ''}
          status={totalGap > 0 ? 'critical' : totalGap < 0 ? 'success' : 'info'}
          delay={0.1}
          sparkData={supplyDemandTrend.map(p => p.gap)}
        />
        <KPICard
          icon={Activity}
          label={t('مؤشر الفجوة', 'SGI %')}
          value={`${overallSgi}%`}
          status={sgiSeverity(overallSgi) as 'critical' | 'warning' | 'info' | 'success'}
          delay={0.15}
          sparkData={sgiSparkData}
          trendContext={sgiSeverityLabel(overallSgi)}
        />
        <KPICard
          icon={AlertTriangle}
          label={t('نقص حرج', 'Critical Shortages')}
          value={String(criticalCount)}
          unit={t('مهنة', 'occupations')}
          status={criticalCount > 5 ? 'critical' : criticalCount > 0 ? 'warning' : 'success'}
          delay={0.2}
        />
      </div>

      <InsightPanel
        explanation="The Skill Gap Index (SGI) measures labour market balance. Positive SGI = more demand than supply (shortage). Negative = surplus. Formula: (demand - supply) / demand x 100."
        insight={gapData ? `Overall SGI: ${totalDemand > 0 ? ((totalDemand - totalSupply) / totalDemand * 100).toFixed(1) : '0'}%. Total supply: ${formatCompact(totalSupply)}, demand: ${formatCompact(totalDemand)}, gap: ${formatCompact(Math.abs(totalGap))}.` : undefined}
        recommendation={(() => {
          const sgi = totalDemand ? (totalDemand - totalSupply) / totalDemand * 100 : 0;
          if (sgi > 20) return "Critical overall shortage. Prioritize: expand training programs, streamline work permits for in-demand occupations, and invest in automation where appropriate.";
          if (sgi > 5) return "Moderate shortage. Target specific occupations rather than broad interventions. Focus resources on the top 10 critical shortages shown below.";
          if (sgi > -5) return "Market is broadly balanced. Monitor occupation-level gaps for emerging imbalances before they become critical.";
          return "Overall surplus. Consider export of talent, entrepreneurship programs, and diversification into new sectors.";
        })()}
        severity={(() => {
          const sgi = totalDemand ? (totalDemand - totalSupply) / totalDemand * 100 : 0;
          if (sgi > 20) return 'critical' as const;
          if (sgi > 5) return 'warning' as const;
          return 'success' as const;
        })()}
        source="Gap Cube (vw_gap_cube) — Materialized View"
      />

      {/* ============================================================= */}
      {/* Tab Navigation                                                */}
      {/* ============================================================= */}
      <div className="flex items-center gap-1 p-1 bg-surface-tertiary/60 rounded-xl w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-white text-navy shadow-sm'
                : 'text-text-muted hover:text-navy hover:bg-white/50'
            }`}
          >
            {t(tab.labelAr, tab.label)}
          </button>
        ))}
      </div>

      {/* ============================================================= */}
      {/* TAB: Gap Analysis                                             */}
      {/* ============================================================= */}
      <AnimatePresence mode="wait">
        {activeTab === 'gap' && (
          <motion.div
            key="gap"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* SGI Trend + Supply vs Demand */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SGI Trend Line */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={sectionCard}
              >
                <ChartToolbar title={t('اتجاه مؤشر الفجوة', 'SGI Trend')} data={sgiTrend}>
                  {sgiTrend.length === 0 ? (
                    <ChartEmpty title="No SGI trend data" height={300} />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={sgiTrend}>
                          <ChartGradientDefs />
                          <defs>
                            <linearGradient id="sgiGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={COLORS.navy} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={COLORS.navy} stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid {...GRID_PROPS} />
                          <XAxis dataKey="month" tick={AXIS_TICK_SM} />
                          <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} />
                          <Tooltip content={<ChartTooltip unit="%" />} />
                          <ReferenceLine
                            y={20}
                            stroke={SGI_COLORS.critical}
                            strokeDasharray="6 4"
                            label={{ value: 'Critical (20%)', position: 'insideTopRight', fill: SGI_COLORS.critical, fontSize: 10 }}
                          />
                          <ReferenceLine
                            y={0}
                            stroke={SGI_COLORS.balanced}
                            strokeDasharray="4 4"
                            label={{ value: 'Balanced', position: 'insideBottomRight', fill: SGI_COLORS.balanced, fontSize: 10 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="sgi"
                            stroke={COLORS.navy}
                            strokeWidth={2}
                            fill="url(#sgiGradient)"
                            dot={{ fill: COLORS.navy, r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                            name="SGI %"
                            animationDuration={800}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                      <DataMethodology viewName="vw_gap_cube" />
                      {sgiTrend.length >= 2 && (
                        <ChartInsight
                          text={`SGI ${sgiTrend[sgiTrend.length - 1].sgi > sgiTrend[0].sgi ? 'increased' : 'decreased'} from ${sgiTrend[0].sgi}% to ${sgiTrend[sgiTrend.length - 1].sgi}% over ${sgiTrend.length} months`}
                          severity={sgiTrend[sgiTrend.length - 1].sgi > 20 ? 'critical' : sgiTrend[sgiTrend.length - 1].sgi > 5 ? 'shortage' : 'balanced'}
                        />
                      )}
                    </>
                  )}
                </ChartToolbar>
              </motion.div>

              {/* SGI Trend Insight */}
              {(() => {
                const trends = gapData?.sgi_trend || [];
                if (trends.length < 2) return null;
                const latest = trends[trends.length - 1]?.sgi ?? 0;
                const first = trends[0]?.sgi ?? 0;
                const direction = latest > first ? 'worsening (growing shortage)' : latest < first ? 'improving (shrinking shortage)' : 'stable';
                return (
                  <InsightPanel
                    explanation="SGI trend over time shows whether the labour market gap is widening or narrowing. The red dashed line at 20% marks the critical threshold."
                    insight={`SGI moved from ${first.toFixed(1)}% to ${latest.toFixed(1)}% — ${direction}. ${latest > 20 ? 'Currently in CRITICAL zone.' : latest > 5 ? 'Currently in MODERATE zone.' : 'Currently BALANCED.'}`}
                    recommendation={latest > first ? "The gap is widening. Without intervention, shortages will worsen. Accelerate training programs and consider temporary visa fast-tracking for critical occupations." : "Positive trajectory. Continue current policies but maintain monitoring to prevent reversal."}
                    severity={latest > 20 ? 'critical' : latest > 5 ? 'warning' : 'success'}
                    source="Monthly SGI Calculation from Gap Cube"
                  />
                );
              })()}

              {/* Supply vs Demand Dual Area */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className={sectionCard}
              >
                <ChartToolbar title={t('العرض مقابل الطلب', 'Supply vs Demand')} data={supplyDemandTrend}>
                  {supplyDemandTrend.length === 0 ? (
                    <ChartEmpty title="No trend data" height={300} />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={supplyDemandTrend}>
                          <ChartGradientDefs />
                          <CartesianGrid {...GRID_PROPS} />
                          <XAxis dataKey="month" tick={AXIS_TICK_SM} />
                          <YAxis tick={AXIS_TICK} />
                          <Tooltip content={<ChartTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="supply"
                            stroke={COLORS.teal}
                            strokeWidth={2}
                            fill="url(#gradient-teal)"
                            name={t('العرض', 'Supply')}
                            animationDuration={800}
                          />
                          <Area
                            type="monotone"
                            dataKey="demand"
                            stroke={COLORS.navy}
                            strokeWidth={2}
                            fill="url(#gradient-navy)"
                            name={t('الطلب', 'Demand')}
                            animationDuration={800}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                      <DataMethodology viewName="vw_gap_cube" />
                    </>
                  )}
                </ChartToolbar>
              </motion.div>
            </div>

            {/* Top Occupation Gaps -- Diverging Bar */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={sectionCard}
            >
              <ChartToolbar title={t('أعلى فجوات المهن', 'Top Occupation Gaps')} data={topGaps}>
                {topGaps.length === 0 ? (
                  <ChartEmpty title="No occupation gap data" height={400} />
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(400, topGaps.length * 32)}>
                    <BarChart data={topGaps} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid {...GRID_PROPS} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK_SM} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={AXIS_TICK_SM}
                        width={160}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1} />
                      <Bar
                        dataKey="gap"
                        name={t('الفجوة', 'Gap')}
                        animationDuration={800}
                        radius={[0, 4, 4, 0]}
                      >
                        {topGaps.map((entry, index) => (
                          <Cell key={index} fill={entry.fill} fillOpacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartToolbar>
              <ChartInsight
                text={`${topGaps.filter(g => g.gap > 0).length} occupations show shortage, ${topGaps.filter(g => g.gap < 0).length} show surplus among top ${topGaps.length}`}
                severity={topGaps.filter(g => g.gap > 0).length > topGaps.length / 2 ? 'critical' : 'balanced'}
              />
            </motion.div>

            {/* Top Occupation Gaps Insight */}
            {(() => {
              const occs = gapData?.occupations || [];
              const critical = occs.filter(o => (o.status || '').includes('Critical')).length;
              const balanced = occs.filter(o => (o.status || '').includes('Balanced')).length;
              return occs.length > 0 ? (
                <InsightPanel
                  explanation="Each bar shows the gap between supply and demand for a specific occupation. Bars extending right (red) = shortage. Left (blue) = surplus."
                  insight={`${critical} occupations in critical shortage, ${balanced} balanced. The largest gaps indicate where workforce planning should focus.`}
                  recommendation="For critical shortages: (1) Create targeted scholarships in related university programs, (2) Fast-track professional licensing for qualified expatriates, (3) Launch employer-sponsored upskilling programs. For surpluses: Redirect training capacity to shortage areas."
                  severity={critical > 5 ? 'critical' : critical > 2 ? 'warning' : 'success'}
                  source="Analytics Engine — SGI per Occupation"
                />
              ) : null;
            })()}

            {/* Sector Distribution + Emirate Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sector Donut */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className={sectionCard}
              >
                <ChartToolbar title={t('توزيع القطاعات', 'Sector Distribution')} data={sectorData}>
                  {sectorData.length === 0 ? (
                    <ChartEmpty title="No sector data" height={300} />
                  ) : (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="60%" height={300}>
                        <PieChart>
                          <Pie
                            data={sectorData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={2}
                            animationDuration={800}
                          >
                            {sectorData.map((entry, index) => (
                              <Cell key={index} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {sectorData.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.fill }} />
                            <span className="text-text-secondary truncate flex-1">{s.name}</span>
                            <span className="text-primary font-semibold tabular-nums">{formatCompact(s.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </ChartToolbar>
              </motion.div>

              {/* Emirate Comparison */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={sectionCard}
              >
                <ChartToolbar title={t('مقارنة الإمارات', 'Emirate Comparison')} data={emirateData}>
                  {emirateData.length === 0 ? (
                    <ChartEmpty title="No emirate data" height={300} />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <ComposedChart data={emirateData}>
                        <ChartGradientDefs />
                        <CartesianGrid {...GRID_PROPS} />
                        <XAxis dataKey="emirate" tick={AXIS_TICK_SM} />
                        <YAxis yAxisId="left" tick={AXIS_TICK_SM} />
                        <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK_SM} domain={[0, 'auto']} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar yAxisId="left" dataKey="supply" fill={COLORS.teal} name={t('العرض', 'Supply')} radius={BAR_RADIUS} barSize={20} animationDuration={800} />
                        <Bar yAxisId="left" dataKey="demand" fill={COLORS.navy} name={t('الطلب', 'Demand')} radius={BAR_RADIUS} barSize={20} animationDuration={800} />
                        <Line yAxisId="right" type="monotone" dataKey="sgi" stroke={SGI_COLORS.critical} strokeWidth={2} dot={{ r: 4, fill: SGI_COLORS.critical }} name="SGI %" animationDuration={800} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </ChartToolbar>
              </motion.div>
            </div>

            {/* Occupation Detail Table */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className={`${cardClass} overflow-hidden`}
            >
              <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-primary">
                  {t('تفاصيل المهن', 'Occupation Details')}
                  <span className="text-text-muted font-normal ml-2">({filteredTable.length})</span>
                </h3>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('بحث عن مهنة...', 'Search occupation...')}
                    className="w-full h-9 pl-9 pr-4 rounded-lg bg-surface-tertiary border-none text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-tertiary">
                      {[
                        t('المهنة', 'Occupation'),
                        t('تصنيف', 'ISCO'),
                        t('العرض', 'Supply'),
                        t('الطلب', 'Demand'),
                        t('الفجوة', 'Gap'),
                        t('المؤشر%', 'SGI%'),
                        t('الحالة', 'Status'),
                      ].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTable.length === 0 ? (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState compact title="No occupations found" description="Try adjusting your search or filters" />
                        </td>
                      </tr>
                    ) : (
                      filteredTable.map((row) => (
                        <tr
                          key={row.occupation_id}
                          onClick={() => setExpandedOcc(expandedOcc === row.occupation_id ? null : row.occupation_id)}
                          className="group cursor-pointer border-t border-border-light hover:bg-surface-hover transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-primary whitespace-nowrap max-w-[200px] truncate">
                            {row.title_en}
                          </td>
                          <td className="px-4 py-3 text-text-muted tabular-nums text-xs">{row.code_isco ?? '--'}</td>
                          <td className="px-4 py-3 tabular-nums text-text-secondary">{formatCompact(row.supply)}</td>
                          <td className="px-4 py-3 tabular-nums text-text-secondary">{formatCompact(row.demand)}</td>
                          <td className="px-4 py-3">
                            <span className={`font-medium tabular-nums ${row.gap > 0 ? 'text-sgi-critical' : row.gap < 0 ? 'text-sgi-surplus' : 'text-sgi-balanced'}`}>
                              {row.gap > 0 ? '+' : ''}{formatCompact(row.gap)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold tabular-nums ${row.sgiPct > 20 ? 'text-sgi-critical' : row.sgiPct > 5 ? 'text-sgi-shortage' : row.sgiPct >= -5 ? 'text-sgi-balanced' : 'text-sgi-surplus'}`}>
                              {row.sgiPct > 0 ? '+' : ''}{row.sgiPct}%
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${statusBadge(row.derivedStatus)}`}>
                              {row.derivedStatus}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Occupation Table Insight */}
            <InsightPanel
              explanation="This table provides the complete occupation-level view. Use search and sort to find specific occupations. Status badges follow the SGI classification: Critical (>20%), Moderate (5-20%), Balanced (+/-5%), Surplus (<-5%)."
              recommendation="Export this data for detailed workforce planning reports. Cross-reference with the AI Impact page to identify occupations that are both in shortage AND at high automation risk — these need different strategies than simple training expansion."
              severity="info"
              compact
            />
          </motion.div>
        )}

        {/* ============================================================= */}
        {/* TAB: Forecasting                                              */}
        {/* ============================================================= */}
        {activeTab === 'forecast' && (
          <motion.div
            key="forecast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Controls Panel */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={sectionCard}
            >
              <h3 className="text-sm font-semibold text-primary mb-4">
                {t('إعدادات التنبؤ', 'Forecast Controls')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Model Selector */}
                <div>
                  <label className="text-xs text-text-muted font-medium mb-1.5 block">
                    {t('النموذج', 'Model')}
                  </label>
                  <div className="relative">
                    <select
                      value={forecastModel}
                      onChange={e => setForecastModel(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-surface-tertiary border border-border-light text-sm text-primary appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-navy/20"
                    >
                      <option value="auto">Auto (Best Fit)</option>
                      {(models ?? []).map(m => (
                        <option key={m.name} value={m.name}>{m.name} - {m.description}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  </div>
                </div>

                {/* Horizon Slider */}
                <div>
                  <label className="text-xs text-text-muted font-medium mb-1.5 block">
                    {t('الأفق الزمني', 'Horizon')}: <span className="text-primary font-semibold">{horizon} {t('شهر', 'months')}</span>
                  </label>
                  <div className="flex items-center gap-3 mt-1">
                    {[6, 12, 24, 36].map(h => (
                      <button
                        key={h}
                        onClick={() => setHorizon(h)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          horizon === h
                            ? 'bg-navy text-white shadow-sm'
                            : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover'
                        }`}
                      >
                        {h}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generate Button */}
                <div className="flex items-end">
                  <button
                    onClick={handleGenerateForecast}
                    disabled={generateForecast.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-dark transition-colors disabled:opacity-50 shadow-md hover:shadow-lg"
                  >
                    {generateForecast.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    {t('توليد التنبؤ', 'Generate Forecast')}
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Forecast Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={sectionCard}
            >
              <ChartToolbar title={t('نتائج التنبؤ', 'Forecast Results')} data={forecastChartData}>
                {forecastLoading ? (
                  <div className="flex items-center justify-center h-[350px]">
                    <Loader2 className="w-8 h-8 text-navy animate-spin" />
                  </div>
                ) : forecastChartData.length === 0 ? (
                  <ChartEmpty title={t('لا توجد بيانات تنبؤ - اضغط توليد', 'No forecast data - click Generate')} height={350} />
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={350}>
                      <ComposedChart data={forecastChartData}>
                        <defs>
                          <linearGradient id="confidenceBand" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={COLORS.teal} stopOpacity={0.15} />
                            <stop offset="95%" stopColor={COLORS.teal} stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid {...GRID_PROPS} />
                        <XAxis dataKey="date" tick={AXIS_TICK_SM} />
                        <YAxis tick={AXIS_TICK} />
                        <Tooltip content={<ChartTooltip />} />
                        {/* Confidence band */}
                        <Area
                          type="monotone"
                          dataKey="upper"
                          stroke="none"
                          fill="url(#confidenceBand)"
                          name="Upper CI"
                          animationDuration={600}
                        />
                        <Area
                          type="monotone"
                          dataKey="lower"
                          stroke="none"
                          fill="transparent"
                          name="Lower CI"
                          animationDuration={600}
                        />
                        {/* Demand forecast */}
                        <Line
                          type="monotone"
                          dataKey="demand"
                          stroke={COLORS.navy}
                          strokeWidth={2}
                          strokeDasharray="6 3"
                          dot={{ r: 3, fill: COLORS.navy }}
                          name={t('الطلب المتوقع', 'Predicted Demand')}
                          animationDuration={800}
                        />
                        {/* Supply forecast */}
                        <Line
                          type="monotone"
                          dataKey="supply"
                          stroke={COLORS.teal}
                          strokeWidth={2}
                          strokeDasharray="6 3"
                          dot={{ r: 3, fill: COLORS.teal }}
                          name={t('العرض المتوقع', 'Predicted Supply')}
                          animationDuration={800}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <DataMethodology viewName="vw_forecast_demand" />
                    {forecasts?.[0] && (
                      <ChartInsight
                        text={`Model: ${forecasts[0].model_name ?? 'auto'} | Horizon: ${forecasts[0].horizon_months} months | ${forecastChartData.length} data points`}
                        severity="balanced"
                      />
                    )}
                  </>
                )}
              </ChartToolbar>
            </motion.div>

            {/* Forecast Insight */}
            <InsightPanel
              explanation="Forecasting uses historical patterns to predict future demand and supply. The shaded area shows the confidence interval — wider bands mean less certainty."
              insight={forecasts?.length ? `${forecasts.length} forecast(s) generated using ${forecasts[0]?.model_name || 'Auto'} model over ${forecasts[0]?.horizon_months || 12} months.` : 'No forecasts generated yet. Click "Generate" to create a forecast.'}
              recommendation="Use forecasts for 6-12 month planning horizons. Beyond 12 months, treat as directional only. Always compare multiple models (ETS vs Linear) and check if MAPE < 15% for reliable predictions."
              severity="info"
              source="Forecasting Engine — ETS + Linear Trend Models"
            />

            {/* Forecast Metrics */}
            {forecasts && forecasts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              >
                {[
                  { label: t('النموذج', 'Model'), value: forecasts[0]?.model_name ?? 'Auto' },
                  { label: t('الأفق', 'Horizon'), value: `${forecasts[0]?.horizon_months ?? horizon}m` },
                  { label: t('نقاط البيانات', 'Data Points'), value: String(forecastChartData.length) },
                  { label: t('آخر توقع', 'Last Point'), value: forecastChartData[forecastChartData.length - 1]?.date ?? '--' },
                ].map((m, i) => (
                  <div key={i} className={`${cardClass} p-4`}>
                    <span className="text-[10px] text-text-muted uppercase tracking-wider font-medium">{m.label}</span>
                    <p className="text-lg font-bold text-primary mt-1">{m.value}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}

        {/* ============================================================= */}
        {/* TAB: Scenarios                                                */}
        {/* ============================================================= */}
        {activeTab === 'scenarios' && (
          <motion.div
            key="scenarios"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="space-y-6"
          >
            {/* Scenario Toggles */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={sectionCard}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h3 className="text-sm font-semibold text-primary">
                  {t('محاكاة السيناريوهات', 'Scenario Simulator')}
                </h3>
                <button
                  onClick={handleRunScenarios}
                  disabled={scenarioMutation.isPending || activeScenarios.size === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-white text-sm font-semibold hover:bg-navy-dark transition-colors disabled:opacity-50 shadow-md"
                >
                  {scenarioMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {t('تشغيل السيناريوهات', 'Run Scenarios')}
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {(presets ?? [
                  { id: 'baseline', name: 'Baseline', description: 'Current trajectory' },
                  { id: 'optimistic', name: 'Optimistic', description: 'Strong economic growth' },
                  { id: 'pessimistic', name: 'Pessimistic', description: 'Economic slowdown' },
                  { id: 'emiratisation_push', name: 'Emiratisation Push', description: 'Accelerated nationalization' },
                  { id: 'ai_disruption', name: 'AI Disruption', description: 'Rapid AI adoption' },
                ]).map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => toggleScenario(preset.id)}
                    className={`group relative px-4 py-3 rounded-xl border-2 transition-all duration-200 text-left ${
                      activeScenarios.has(preset.id)
                        ? 'border-navy/30 bg-navy/5 shadow-sm'
                        : 'border-border-light bg-white/50 hover:border-navy/10'
                    }`}
                    style={activeScenarios.has(preset.id) ? {
                      borderLeftColor: SCENARIO_COLORS[preset.id] ?? COLORS.navy,
                      borderLeftWidth: 4,
                    } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: SCENARIO_COLORS[preset.id] ?? COLORS.slate }}
                      />
                      <span className="text-xs font-semibold text-primary">{preset.name}</span>
                    </div>
                    <p className="text-[10px] text-text-muted">{preset.description}</p>
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Scenario Overlay Chart */}
            {scenarioResults.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className={sectionCard}
                >
                  <ChartToolbar title={t('مقارنة السيناريوهات — الطلب', 'Scenario Comparison - Demand')}>
                    <ResponsiveContainer width="100%" height={350}>
                      <LineChart>
                        <CartesianGrid {...GRID_PROPS} />
                        <XAxis
                          dataKey="index"
                          type="number"
                          tick={AXIS_TICK_SM}
                          domain={[0, 'auto']}
                          label={{ value: t('الأشهر', 'Months'), position: 'insideBottomRight', offset: -5, style: { fontSize: 10 } }}
                        />
                        <YAxis tick={AXIS_TICK} />
                        <Tooltip content={<ChartTooltip />} />
                        {scenarioResults
                          .filter(sr => activeScenarios.has(sr.scenario))
                          .map(sr => {
                            const lineData = (sr.demand ?? []).map((v, i) => ({ index: i, value: v }));
                            return (
                              <Line
                                key={sr.scenario}
                                data={lineData}
                                dataKey="value"
                                stroke={SCENARIO_COLORS[sr.scenario] ?? COLORS.slate}
                                strokeWidth={2}
                                dot={false}
                                name={sr.scenario}
                                animationDuration={800}
                              />
                            );
                          })}
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 mt-3">
                      {scenarioResults
                        .filter(sr => activeScenarios.has(sr.scenario))
                        .map(sr => (
                          <div key={sr.scenario} className="flex items-center gap-1.5 text-[11px]">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: SCENARIO_COLORS[sr.scenario] ?? COLORS.slate }} />
                            <span className="text-text-secondary capitalize">{sr.scenario.replace(/_/g, ' ')}</span>
                          </div>
                        ))}
                    </div>
                  </ChartToolbar>
                </motion.div>

                {/* Radar Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className={sectionCard}
                >
                  <ChartToolbar title={t('مقارنة تأثير السيناريوهات', 'Scenario Impact Comparison')}>
                    {radarData.length === 0 ? (
                      <ChartEmpty title="Run scenarios to see radar" height={350} />
                    ) : (
                      <ResponsiveContainer width="100%" height={350}>
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="#E2E8F0" />
                          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: '#4A5568' }} />
                          <PolarRadiusAxis tick={{ fontSize: 9, fill: '#A0AEC0' }} domain={[0, 100]} />
                          {scenarioResults
                            .filter(sr => activeScenarios.has(sr.scenario))
                            .map(sr => (
                              <Radar
                                key={sr.scenario}
                                dataKey={sr.scenario}
                                stroke={SCENARIO_COLORS[sr.scenario] ?? COLORS.slate}
                                fill={SCENARIO_COLORS[sr.scenario] ?? COLORS.slate}
                                fillOpacity={0.1}
                                strokeWidth={2}
                                name={sr.scenario}
                              />
                            ))}
                          <Tooltip />
                        </RadarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartToolbar>
                </motion.div>
              </div>
            )}

            {/* Scenario Details */}
            {scenarioResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {scenarioResults
                  .filter(sr => activeScenarios.has(sr.scenario))
                  .map(sr => {
                    const demandArr = sr.demand ?? [];
                    const gapArr = sr.gap ?? [];
                    const avgDemand = demandArr.length > 0 ? demandArr.reduce((a, b) => a + b, 0) / demandArr.length : 0;
                    const avgGap = gapArr.length > 0 ? gapArr.reduce((a, b) => a + b, 0) / gapArr.length : 0;
                    return (
                      <div
                        key={sr.scenario}
                        className={`${cardClass} p-4 border-l-4`}
                        style={{ borderLeftColor: SCENARIO_COLORS[sr.scenario] ?? COLORS.slate }}
                      >
                        <h4 className="text-sm font-semibold text-primary capitalize mb-1">
                          {sr.scenario.replace(/_/g, ' ')}
                        </h4>
                        <p className="text-[10px] text-text-muted mb-3">{sr.description ?? ''}</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] text-text-muted uppercase tracking-wider">Avg Demand</span>
                            <p className="text-sm font-bold text-primary tabular-nums">{formatCompact(avgDemand)}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-text-muted uppercase tracking-wider">Avg Gap</span>
                            <p className={`text-sm font-bold tabular-nums ${avgGap > 0 ? 'text-sgi-critical' : 'text-sgi-balanced'}`}>
                              {avgGap > 0 ? '+' : ''}{formatCompact(avgGap)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </motion.div>
            )}

            {/* Empty state for scenarios */}
            {scenarioResults.length === 0 && !scenarioMutation.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={sectionCard}
              >
                <EmptyState
                  title={t('لم يتم تشغيل أي سيناريو بعد', 'No scenarios run yet')}
                  description={t(
                    'اختر السيناريوهات المطلوبة واضغط تشغيل',
                    'Select your desired scenarios and click Run Scenarios to see projections'
                  )}
                  action={{ label: t('تشغيل السيناريوهات', 'Run Scenarios'), onClick: handleRunScenarios }}
                />
              </motion.div>
            )}

            {/* Loading state */}
            {scenarioMutation.isPending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`${sectionCard} flex items-center justify-center py-16`}
              >
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-navy animate-spin" />
                  <p className="text-sm text-text-muted">{t('جارٍ حساب السيناريوهات...', 'Computing scenarios...')}</p>
                </div>
              </motion.div>
            )}

            {/* Scenario Insight */}
            <InsightPanel
              explanation="Scenarios model 'what-if' outcomes by adjusting supply and demand multipliers. Use them to stress-test policy decisions before implementation."
              recommendation="Run all 5 scenarios for any occupation before making policy recommendations. The gap between 'Optimistic' and 'Pessimistic' shows your risk range. If even the optimistic scenario shows a shortage, urgent action is needed."
              severity="info"
              source="Scenario Engine — 5 Preset Scenarios"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============================================================= */}
      {/* Data Sources Attribution                                       */}
      {/* ============================================================= */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-wrap items-center gap-2 pt-4 border-t border-border-light"
      >
        <Database className="w-4 h-4 text-text-muted" />
        <span className="text-[11px] text-text-muted font-medium">{t('المصادر:', 'Data Sources:')}</span>
        {[
          { label: 'ESCO Taxonomy', url: 'https://esco.ec.europa.eu/' },
          { label: 'MOHRE', url: 'https://www.mohre.gov.ae/' },
          { label: 'LinkedIn Jobs', url: '#' },
          { label: 'FCSC Workforce', url: '#' },
          { label: 'Bayanat Employment', url: 'https://bayanat.ae/' },
          { label: 'SCAD', url: 'https://scad.gov.ae/' },
        ].map(source => (
          <a
            key={source.label}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-tertiary text-[10px] font-medium text-text-secondary hover:bg-surface-hover hover:text-navy transition-colors"
          >
            {source.label}
            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
          </a>
        ))}
      </motion.div>
    </div>
  );
};

export default AnalyticsPage;
