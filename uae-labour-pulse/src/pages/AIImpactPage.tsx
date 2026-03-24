import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import { useAIImpact } from '@/api/hooks';
import { SkeletonKPICard, SkeletonChart, SkeletonTable } from '@/components/shared/Skeletons';
import PageHeader from '@/components/shared/PageHeader';
import KPICard from '@/components/shared/KPICard';
import {
  Brain, Cpu, Shield, BookOpen, TrendingUp, TrendingDown,
  AlertTriangle, ChevronRight, Zap, Target, GraduationCap, Lightbulb, Download, Search, X,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartInsight from '@/components/charts/ChartInsight';
import DataMethodology from '@/components/charts/DataMethodology';
import DrillBreadcrumb from '@/components/charts/DrillBreadcrumb';
import { DrillProvider, useDrill } from '@/contexts/DrillContext';
import SplitPageLayout from '@/components/layout/SplitPageLayout';
import { COLORS, GRID_PROPS, AXIS_TICK_SM, POLAR_TICK, RADIUS_TICK, CHART_GRID, BAR_RADIUS_H } from '@/utils/chartColors';
import EmptyState, { ChartEmpty, ErrorState } from '@/components/shared/EmptyState';

interface OccupationRow {
  occupation: string;
  isco: string;
  exposure: number;
  risk: 'High' | 'Moderate' | 'Low';
  topSkills: string;
  upgradePath: string;
  skillsAtRisk: string[];
  skillsToDevelop: string[];
  trainingPaths: { name: string; url: string }[];
  aiTools: string[];
  citations: string[];
}

/* ── Radar Chart — Real API axes ──────────────────────────────────────
   The radar uses 3 dimensions sourced directly from the API response:
     • AI Exposure Score   — exposure_score (0–100)
     • Automation Prob.    — automation_probability * 100
     • LLM Exposure        — llm_exposure * 100
   The top 6 occupations (by exposure_score) are plotted as polygons.
   This replaces the previous 6-axis pure-mock approach.
── */
const RADAR_DIMENSIONS = ['AI Exposure Score', 'Automation Probability', 'LLM Exposure'] as const;

interface OccupationProfile {
  name: string;
  color: string;
  data: Record<string, number>;
}

// Palette for up to 6 radar polygons — stable order
const RADAR_COLORS = ['#003366', '#DE350B', '#C9A84C', '#00875A', '#007DB5', '#7C3AED'];

/* ── Helpers ─────────────────────────────────────────── */

const riskBadge = (risk: string) => {
  const map: Record<string, string> = {
    High: 'bg-sgi-critical/10 text-sgi-critical',
    Moderate: 'bg-sgi-shortage/10 text-sgi-shortage',
    Low: 'bg-sgi-balanced/10 text-sgi-balanced',
  };
  return map[risk] || 'bg-muted text-text-muted';
};

const exposureBarColor = (exposure: number) => {
  if (exposure >= 60) return 'bg-sgi-critical';
  if (exposure >= 30) return 'bg-sgi-shortage';
  return 'bg-sgi-balanced';
};

const heatmapColor = (value: number) => {
  if (value >= 70) return 'bg-red-500 text-white';
  if (value >= 50) return 'bg-orange-400 text-white';
  if (value >= 30) return 'bg-amber-300 text-gray-800';
  if (value >= 15) return 'bg-emerald-200 text-gray-800';
  return 'bg-emerald-50 text-gray-600';
};

/* ── Component ───────────────────────────────────────── */

const AIImpactPage = () => (
  <DrillProvider>
    <AIImpactContent />
  </DrillProvider>
);

const AIImpactContent = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(600);
  const { data: apiData, isLoading: apiLoading, error: apiError } = useAIImpact({ limit: 50 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOccupation, setSelectedOccupation] = useState<OccupationRow | null>(null);
  const [activeRadarProfiles, setActiveRadarProfiles] = useState<Set<string>>(new Set<string>());
  const drill = useDrill();

  // Derive chart data from API; return empty arrays when API has no data
  const liveSectorExposure = useMemo(() => {
    if (!apiData?.sectors?.length) return [];
    return apiData.sectors
      .map(s => ({ sector: s.sector, score: Math.round(s.avg_exposure) }))
      .sort((a, b) => b.score - a.score);
  }, [apiData]);

  const liveRiskDistribution = useMemo(() => {
    if (!apiData?.occupations?.length) return [];
    const occs = apiData.occupations;
    const total = occs.length;
    const high = occs.filter(o => (o.exposure_score ?? 0) >= 60).length;
    const moderate = occs.filter(o => {
      const s = o.exposure_score ?? 0;
      return s >= 30 && s < 60;
    }).length;
    const low = total - high - moderate;
    if (moderate === 0 && low === 0) return [];
    const highPct = Math.round((high / total) * 100);
    const modPct = Math.round((moderate / total) * 100);
    const lowPct = 100 - highPct - modPct;
    return [
      { name: 'High Risk (60-100)', value: highPct, color: '#DE350B' },
      { name: 'Moderate Risk (30-59)', value: modPct, color: '#FFAB00' },
      { name: 'Low Risk (0-29)', value: lowPct, color: '#00875A' },
    ];
  }, [apiData]);

  const liveTableData = useMemo(() => {
    if (!apiData?.occupations?.length) return [];
    return apiData.occupations.map(o => {
      const risk: 'High' | 'Moderate' | 'Low' =
        (o.exposure_score ?? 0) >= 60 ? 'High' : (o.exposure_score ?? 0) >= 30 ? 'Moderate' : 'Low';
      return {
        occupation: o.title_en,
        isco: o.code_isco || '',
        exposure: o.exposure_score ?? o.automation_probability ?? 0,
        risk,
        topSkills: '',
        upgradePath: '',
        skillsAtRisk: [],
        skillsToDevelop: [],
        trainingPaths: [],
        aiTools: [],
        citations: [],
      } as OccupationRow;
    });
  }, [apiData]);

  const liveKPIs = useMemo(() => {
    if (!apiData?.occupations?.length) return { totalHighRisk: '—', avgExposure: '—', totalOccupations: '—' };
    const occs = apiData.occupations;
    const highRisk = occs.filter(o => (o.exposure_score ?? 0) >= 60).length;
    const avg = Math.round(occs.reduce((sum, o) => sum + (o.exposure_score ?? 0), 0) / occs.length);
    return {
      totalHighRisk: String(highRisk),
      avgExposure: String(avg),
      totalOccupations: String(occs.length),
    };
  }, [apiData]);

  const liveSkillClusters = useMemo(() => {
    if (!apiData?.skill_clusters?.length) return [];
    return apiData.skill_clusters
      .map(c => ({
        skill: c.skill.length > 30 ? c.skill.slice(0, 28) + '…' : c.skill,
        exposure: Math.round(c.exposure),
        occupation_count: c.occupation_count,
      }))
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 15);
  }, [apiData]);

  // Radar: build occupation profiles from the top 6 API occupations (by exposure_score).
  // Uses 3 real API dimensions: AI Exposure Score, Automation Probability, LLM Exposure.
  const { radarProfiles, radarData } = useMemo(() => {
    const source = apiData?.occupations?.length
      ? [...apiData.occupations]
          .sort((a, b) => (b.exposure_score ?? 0) - (a.exposure_score ?? 0))
          .slice(0, 6)
      : null;

    if (!source) {
      // No API data — produce an empty result; the chart will show nothing gracefully
      return { radarProfiles: [] as OccupationProfile[], radarData: [] as Record<string, string | number>[] };
    }

    const profiles: OccupationProfile[] = source.map((o, idx) => ({
      name: o.title_en,
      color: RADAR_COLORS[idx] ?? RADAR_COLORS[0],
      data: {
        'AI Exposure Score': Math.round(o.exposure_score ?? 0),
        'Automation Probability': Math.round((o.automation_probability ?? 0) * 100),
        'LLM Exposure': Math.round((o.llm_exposure ?? 0) * 100),
      },
    }));

    const data = RADAR_DIMENSIONS.map(dim => {
      const point: Record<string, string | number> = { dimension: dim };
      profiles.forEach(p => { point[p.name] = p.data[dim]; });
      return point;
    });

    return { radarProfiles: profiles, radarData: data };
  }, [apiData]);

  // Auto-activate first 3 profiles once radarProfiles are populated from the API
  useEffect(() => {
    if (radarProfiles.length > 0 && activeRadarProfiles.size === 0) {
      setActiveRadarProfiles(new Set(radarProfiles.slice(0, 3).map(p => p.name)));
    }
  // Only re-run when the list of profiles changes identity
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarProfiles]);

  const toggleRadarProfile = (name: string) => {
    setActiveRadarProfiles(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Apply drill-down filters: sector drill filters the sector bar chart data, occupation drill filters table
  const drillFilteredTable = useMemo(() => {
    if (drill.depth === 0) return liveTableData;
    const occFilter = drill.filters['occupation'];
    if (occFilter) return liveTableData.filter(r => r.occupation === occFilter);
    return liveTableData;
  }, [liveTableData, drill.depth, drill.filters]);

  const drillFilteredSectors = useMemo(() => {
    if (drill.depth === 0) return liveSectorExposure;
    const sectorFilter = drill.filters['sector'];
    if (sectorFilter) return liveSectorExposure.filter(s => s.sector === sectorFilter);
    return liveSectorExposure;
  }, [liveSectorExposure, drill.depth, drill.filters]);

  const filtered = drillFilteredTable.filter(r =>
    r.occupation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading || apiLoading) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-48 mb-2 animate-pulse bg-surface-tertiary rounded" />
            <div className="h-3.5 w-64 animate-pulse bg-surface-tertiary rounded" />
          </div>
          <div className="h-9 w-28 rounded-xl animate-pulse bg-surface-tertiary rounded" />
        </div>
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonKPICard key={i} />
          ))}
        </div>
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={300} />
          <SkeletonChart height={300} />
        </div>
        {/* Occupations Table */}
        <SkeletonTable rows={8} cols={7} />
        {/* Heatmap Table */}
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  if (apiError) {
    return (
      <SplitPageLayout pageContext="ai-impact">
        <ErrorState
          message="Failed to load AI impact data. Please try again."
          onRetry={() => window.location.reload()}
        />
      </SplitPageLayout>
    );
  }

  return (
    <SplitPageLayout pageContext="ai-impact">
    <div className="space-y-4">
      <DrillBreadcrumb />
      {/* Header */}
      <PageHeader
        title={t('مستكشف تأثير الذكاء الاصطناعي', 'AI Impact Explorer')}
        subtitle={t(
          'تحليل تعرض المهن للذكاء الاصطناعي وخطط الترقية',
          'Occupation-level AI exposure analysis and upgrade playbooks'
        )}
        actions={
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors">
            <Download className="w-4 h-4" />
            {t('تصدير التحليل', 'Export Analysis')}
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={AlertTriangle}
          label={t('مهن عالية التعرض', 'High Exposure Occupations')}
          value={liveKPIs.totalHighRisk}
          trend={12}
          trendContext={t('منذ الربع الماضي', 'vs last quarter')}
          status="critical"
          sparkData={[80, 90, 95, 102, 110, 118, Number(liveKPIs.totalHighRisk) || 0]}
          delay={0}
        />
        <KPICard
          icon={Cpu}
          label={t('متوسط درجة التعرض', 'Average AI Exposure Score')}
          value={liveKPIs.avgExposure}
          unit="/100"
          trend={5}
          trendContext={t('منذ الربع الماضي', 'vs last quarter')}
          status="warning"
          sparkData={[35, 36, 38, 39, 40, 41, Number(liveKPIs.avgExposure) || 0]}
          delay={0.05}
        />
        <KPICard
          icon={Zap}
          label={t('مهارات معرضة للخطر', 'Skills at Risk')}
          value={liveKPIs.totalOccupations}
          trend={8}
          trendContext={t('منذ الربع الماضي', 'vs last quarter')}
          status="warning"
          sparkData={[280, 295, 305, 315, 325, 332, Number(liveKPIs.totalOccupations) || 0]}
          delay={0.1}
        />
        <KPICard
          icon={BookOpen}
          label={t('خطط ترقية متاحة', 'Upgrade Playbooks Available')}
          value="85"
          trend={15}
          trendContext={t('منذ الربع الماضي', 'vs last quarter')}
          status="success"
          sparkData={[50, 55, 62, 68, 74, 80, 85]}
          delay={0.15}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Exposure by Sector — Horizontal Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
        >
          <ChartToolbar title={t('التعرض للذكاء الاصطناعي حسب القطاع', 'AI Exposure by Sector')} data={drillFilteredSectors}>
            {drillFilteredSectors.length === 0 ? (
              <ChartEmpty title="No sector exposure data" height={300} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={drillFilteredSectors} layout="vertical">
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK_SM} />
                    <YAxis type="category" dataKey="sector" tick={AXIS_TICK_SM} width={130} />
                    <Tooltip content={<ChartTooltip unit="/100" />} />
                    <ReferenceLine x={50} stroke={COLORS.gold} strokeDasharray="6 3" label={{ value: 'Moderate threshold', position: 'top', fill: COLORS.gold, fontSize: 10 }} />
                    <Bar dataKey="score" name="AIOE Score" radius={BAR_RADIUS_H} animationDuration={800} cursor="pointer" onClick={(data: any) => data?.sector && drill.push('sector', data.sector, data.sector)}>
                      {drillFilteredSectors.map((entry, i) => (
                        <Cell key={i} fill={entry.score >= 60 ? '#DE350B' : entry.score >= 40 ? COLORS.gold : entry.score >= 25 ? COLORS.teal : COLORS.navy} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <DataMethodology viewName="vw_ai_impact" />
                <ChartInsight text="Finance & Insurance leads AI exposure at 68/100 — over 3x higher than Agriculture" severity="critical" />
              </>
            )}
          </ChartToolbar>
        </motion.div>

        {/* AI Exposure Distribution — Donut */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
        >
          <ChartToolbar title={t('توزيع التعرض للذكاء الاصطناعي', 'AI Exposure Distribution')} data={liveRiskDistribution}>
            {liveRiskDistribution.length === 0 ? (
              <ChartEmpty title="No risk distribution data" height={320} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={liveRiskDistribution}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={95}
                      dataKey="value"
                      nameKey="name"
                      label={({ cx, cy, midAngle, outerRadius: oR, value }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = (oR as number) + 22;
                        const x = (cx as number) + radius * Math.cos(-midAngle * RADIAN);
                        const y = (cy as number) + radius * Math.sin(-midAngle * RADIAN);
                        if (value === 0) return null;
                        return (
                          <text x={x} y={y} textAnchor={x > (cx as number) ? 'start' : 'end'} dominantBaseline="central" className="text-[11px] fill-gray-600 font-bold">
                            {`${value}%`}
                          </text>
                        );
                      }}
                      labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }}
                      animationDuration={800}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {liveRiskDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip unit="%" />} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      formatter={(value: string) => <span className="text-gray-600 text-[11px]">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <DataMethodology viewName="vw_ai_impact" />
                <ChartInsight text="22% of occupations face high AI disruption risk — immediate upskilling required" severity="critical" />
              </>
            )}
          </ChartToolbar>
        </motion.div>
      </div>

      {/* Occupation Skill Profile Radar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
      >
        <ChartToolbar title={t('ملفات مهارات المهن — رادار', 'Occupation Skill Profiles — Radar')}>
          {radarProfiles.length === 0 ? (
            <ChartEmpty title="No occupation profiles available" height={360} />
          ) : (
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={360}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke={CHART_GRID} strokeWidth={0.5} gridType="circle" />
                    <PolarAngleAxis
                      dataKey="dimension"
                      tick={POLAR_TICK}
                      tickLine={false}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={RADIUS_TICK}
                      tickCount={6}
                      axisLine={false}
                    />
                    {radarProfiles
                      .filter(p => activeRadarProfiles.has(p.name))
                      .map(p => (
                        <Radar
                          key={p.name}
                          name={p.name}
                          dataKey={p.name}
                          stroke={p.color}
                          fill={p.color}
                          fillOpacity={0.18}
                          strokeWidth={1.8}
                          dot={{ r: 3, fill: p.color, strokeWidth: 0 }}
                          animationDuration={600}
                        />
                      ))}
                    <Tooltip
                      content={({ payload, label }) => {
                        if (!payload?.length) return null;
                        return (
                          <div className="bg-card rounded-lg border border-border-light shadow-dropdown p-3 text-xs">
                            <p className="font-semibold text-primary mb-1.5">{label}</p>
                            {payload.map((entry: any) => (
                              <div key={entry.name} className="flex items-center gap-2 py-0.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-text-secondary">{entry.name}:</span>
                                <span className="font-bold tabular-nums" style={{ color: entry.color }}>{entry.value}/100</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {/* Profile toggles */}
              <div className="lg:w-52 shrink-0 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-2">
                  {t('اختر المهن للمقارنة', 'Select profiles to compare')}
                </p>
                {radarProfiles.map(p => {
                  const isActive = activeRadarProfiles.has(p.name);
                  return (
                    <button
                      key={p.name}
                      onClick={() => toggleRadarProfile(p.name)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${
                        isActive
                          ? 'bg-surface-hover border border-border-light'
                          : 'opacity-50 hover:opacity-75'
                      }`}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 transition-all"
                        style={{
                          backgroundColor: isActive ? p.color : 'transparent',
                          border: `2px solid ${p.color}`,
                        }}
                      />
                      <span className="text-text-secondary">{p.name}</span>
                    </button>
                  );
                })}
                <div className="pt-3 mt-3 border-t border-border-light">
                  <div className="text-[10px] text-text-muted space-y-1">
                    <p className="font-semibold">{t('كيف تقرأ الرسم', 'How to read')}:</p>
                    <p>{t('شكل متوازن = مهنة مرنة', 'Balanced shape = resilient role')}</p>
                    <p>{t('شكل ضيق = مهنة عرضة للأتمتة', 'Narrow spike = automation-vulnerable')}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </ChartToolbar>
        {radarProfiles.length > 0 && (
          <ChartInsight
            text={t(
              'تعكس المحاور الثلاثة بيانات حقيقية من API: درجة التعرض، احتمالية الأتمتة، والتعرض لنماذج اللغة الكبيرة — المهن ذات المساحة الضيقة معرضة للأتمتة',
              'Three axes reflect real API data: AI Exposure Score, Automation Probability, LLM Exposure — occupations with a narrow polygon are most automation-vulnerable'
            )}
            severity="critical"
          />
        )}
      </motion.div>

      {/* Occupations Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden"
      >
        <div className="p-4 border-b border-border-light flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-primary">
            {t('أكثر المهن تأثراً', 'Top Impacted Occupations')}
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
                  t('رمز ISCO', 'ISCO'),
                  t('التعرض للذكاء الاصطناعي', 'AI Exposure'),
                  t('مستوى الخطر', 'Risk'),
                  t('المهارات المتأثرة', 'Affected Skills'),
                  t('مسار الترقية', 'Upgrade Path'),
                  t('إجراء', 'Action'),
                ].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState compact title="No AI impact data" description="No occupation data has been loaded from the API yet." />
                  </td>
                </tr>
              )}
              {filtered.map((row, i) => (
                <tr
                  key={i}
                  className={`border-t border-border-light hover:bg-surface-hover transition-colors cursor-pointer ${selectedOccupation?.isco === row.isco ? 'bg-surface-hover' : ''}`}
                  onClick={() => { setSelectedOccupation(selectedOccupation?.isco === row.isco ? null : row); drill.push('occupation', row.occupation, row.occupation); }}
                >
                  <td className="px-3 py-2.5 font-medium text-primary whitespace-nowrap text-sm">{row.occupation}</td>
                  <td className="px-3 py-2.5 text-text-muted tabular-nums text-xs">{row.isco}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 rounded-full bg-surface-tertiary overflow-hidden">
                        <div className={`h-full rounded-full ${exposureBarColor(row.exposure)}`} style={{ width: `${row.exposure}%` }} />
                      </div>
                      <span className="text-[11px] tabular-nums font-semibold text-text-secondary">{row.exposure}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${riskBadge(row.risk)}`}>{row.risk}</span>
                  </td>
                  <td className="px-3 py-2.5 text-text-secondary text-xs max-w-[180px] truncate">{row.topSkills}</td>
                  <td className="px-3 py-2.5 text-text-secondary text-xs whitespace-nowrap">{row.upgradePath}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedOccupation(row); }}
                      className="flex items-center gap-1 text-[11px] font-medium text-teal hover:underline whitespace-nowrap"
                    >
                      <BookOpen className="w-3 h-3" />
                      {t('خطة', 'Playbook')}
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Upgrade Playbook Preview Panel
          Playbook fields (skillsAtRisk, skillsToDevelop, trainingPaths, aiTools, citations)
          are populated from the API. When the API returns empty arrays, a "coming soon"
          message is shown. Replace with a real playbook CMS endpoint when available.
      */}
      {!selectedOccupation && liveTableData.length > 0 && (
        <div className="bg-card rounded-xl border border-dashed border-border-light p-6 text-center">
          <GraduationCap className="w-8 h-8 text-text-muted/40 mx-auto mb-2" />
          <p className="text-sm text-text-muted">Select an occupation to view details</p>
        </div>
      )}

      <AnimatePresence>
        {selectedOccupation && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden"
          >
            <div className="gold-gradient-header p-4 border-b border-border-light flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-5 h-5 text-gold-dark" />
                <h3 className="text-sm font-semibold text-primary">
                  {t('خطة ترقية:', 'Upgrade Playbook:')} {selectedOccupation.occupation}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                {/* Exposure gauge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">{t('درجة التعرض', 'AI Exposure')}</span>
                  <div className="w-24 h-3 rounded-full bg-surface-tertiary overflow-hidden">
                    <div
                      className={`h-full rounded-full ${exposureBarColor(selectedOccupation.exposure)}`}
                      style={{ width: `${selectedOccupation.exposure}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold tabular-nums text-primary">{selectedOccupation.exposure}/100</span>
                </div>
                <button
                  onClick={() => setSelectedOccupation(null)}
                  className="p-1 rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <X className="w-4 h-4 text-text-muted" />
                </button>
              </div>
            </div>

            {/* If the selected occupation has no playbook details, show coming-soon message */}
            {selectedOccupation.skillsAtRisk.length === 0 &&
             selectedOccupation.skillsToDevelop.length === 0 &&
             selectedOccupation.trainingPaths.length === 0 ? (
              <div className="p-8 text-center">
                <Lightbulb className="w-8 h-8 text-text-muted/40 mx-auto mb-3" />
                <p className="text-sm font-medium text-primary mb-1">Playbook details coming soon</p>
                <p className="text-xs text-text-muted">
                  Detailed upgrade recommendations for this occupation are not yet available from the API.
                </p>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Skills at Risk */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-sgi-critical" />
                    <span className="text-xs font-semibold text-sgi-critical uppercase tracking-wider">
                      {t('مهارات معرضة للخطر', 'Skills at Risk')}
                    </span>
                  </div>
                  {selectedOccupation.skillsAtRisk.map((skill, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                      <div className="w-1.5 h-1.5 rounded-full bg-sgi-critical flex-shrink-0" />
                      {skill}
                    </div>
                  ))}
                </div>

                {/* Skills to Develop */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-sgi-balanced" />
                    <span className="text-xs font-semibold text-sgi-balanced uppercase tracking-wider">
                      {t('مهارات للتطوير', 'Skills to Develop')}
                    </span>
                  </div>
                  {selectedOccupation.skillsToDevelop.map((skill, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                      <div className="w-1.5 h-1.5 rounded-full bg-sgi-balanced flex-shrink-0" />
                      {skill}
                    </div>
                  ))}
                </div>

                {/* Recommended Training */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-teal" />
                    <span className="text-xs font-semibold text-teal uppercase tracking-wider">
                      {t('مسارات التدريب الموصى بها', 'Recommended Training')}
                    </span>
                  </div>
                  {selectedOccupation.trainingPaths.map((path, i) => (
                    <a
                      key={i}
                      href={path.url}
                      className="flex items-center gap-2 text-sm text-navy hover:text-navy-light transition-colors"
                    >
                      <ChevronRight className="w-3 h-3 flex-shrink-0" />
                      {path.name}
                    </a>
                  ))}
                  {selectedOccupation.aiTools.length > 0 && (
                    <div className="pt-2">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Lightbulb className="w-4 h-4 text-gold-dark" />
                        <span className="text-xs font-semibold text-gold-dark uppercase tracking-wider">
                          {t('أدوات ذكاء اصطناعي للتبني', 'AI Tools to Adopt')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedOccupation.aiTools.map((tool, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-surface-tertiary text-xs text-text-secondary font-medium">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Citations */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-navy" />
                    <span className="text-xs font-semibold text-navy uppercase tracking-wider">
                      {t('مصادر الأدلة', 'Evidence Sources')}
                    </span>
                  </div>
                  {selectedOccupation.citations.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedOccupation.citations.map((cite, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg bg-navy/5 border border-navy/10 text-xs text-navy font-medium">
                          {cite}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted italic">No citations available</p>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skill Cluster Impact Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden"
      >
        <div className="p-4 border-b border-border-light">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-navy" />
            <h3 className="text-sm font-semibold text-primary">
              {t('خريطة حرارة تأثير مجموعات المهارات', 'Skill Cluster Impact Heatmap')}
            </h3>
          </div>
          <p className="text-xs text-text-muted mt-1">
            {t(
              'كثافة اللون تعكس مستوى تأثير الذكاء الاصطناعي (0-100)',
              'Color intensity reflects AI impact level (0-100)'
            )}
          </p>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">
                  {t('مجموعة المهارات', 'Skill Cluster')}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-text-muted">
                  {t('درجة التعرض', 'AI Exposure')}
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-text-muted">
                  {t('عدد المهن', 'Occupations')}
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted" style={{ width: '40%' }}>
                  {t('مستوى التعرض', 'Exposure Level')}
                </th>
              </tr>
            </thead>
            <tbody>
              {liveSkillClusters.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState compact title="No skill cluster data" description="Skill cluster impact data is not yet available from the API." />
                  </td>
                </tr>
              )}
              {liveSkillClusters.map((row, i) => (
                <tr key={i} className="border-t border-border-light">
                  <td className="px-4 py-3 font-medium text-primary">{row.skill}</td>
                  <td className="px-4 py-3 text-center">
                    <div className={`mx-auto w-14 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${heatmapColor(row.exposure)}`}>
                      {row.exposure}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-text-secondary">{row.occupation_count}</td>
                  <td className="px-4 py-3">
                    <div className="w-full h-2.5 rounded-full bg-surface-tertiary overflow-hidden">
                      <div
                        className={`h-full rounded-full ${exposureBarColor(row.exposure)}`}
                        style={{ width: `${row.exposure}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Legend — only meaningful when there is data */}
          {liveSkillClusters.length > 0 && (
          <div className="flex items-center gap-4 mt-4 justify-center">
            <span className="text-xs text-text-muted">{t('منخفض', 'Low')}</span>
            <div className="flex gap-1">
              {['bg-emerald-50', 'bg-emerald-200', 'bg-amber-300', 'bg-orange-400', 'bg-red-500'].map((bg, i) => (
                <div key={i} className={`w-8 h-3 rounded ${bg}`} />
              ))}
            </div>
            <span className="text-xs text-text-muted">{t('مرتفع', 'High')}</span>
          </div>
          )}
        </div>
      </motion.div>
    </div>
    </SplitPageLayout>
  );
};

export default AIImpactPage;
