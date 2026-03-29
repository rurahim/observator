import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import {
  useDashboardSummary,
  useDemandInsights,
  useDemandedSkills,
  useSkillGap,
  useSalaryBenchmarks,
} from '@/api/hooks';
import { formatCompact, formatNumber } from '@/utils/formatters';
import {
  COLORS,
  SGI_COLORS,
  GRID_PROPS,
  AXIS_TICK,
  AXIS_TICK_SM,
  getSeriesColor,
  SERIES_COLORS,
  SECTOR_COLORS,
  BAR_RADIUS,
  BAR_RADIUS_H,
} from '@/utils/chartColors';
import DataStory from '@/components/shared/DataStory';
import PageHeader from '@/components/shared/PageHeader';
import InsightPanel from '@/components/shared/InsightPanel';
import KPICard from '@/components/shared/KPICard';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartTooltip from '@/components/charts/ChartTooltip';
import ResponsiveTable from '@/components/shared/ResponsiveTable';
import { ChartEmpty, ErrorState } from '@/components/shared/EmptyState';
import { SkeletonKPICard, SkeletonChart, SkeletonTable } from '@/components/shared/Skeletons';
import {
  Briefcase,
  Building2,
  Layers,
  TrendingUp,
  Database,
  MapPin,
  Users,
  BarChart3,
  Crown,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Treemap,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

/* ── Palette ──────────────────────────────────────────────────────────────── */

const PIE_COLORS = [
  COLORS.navy, COLORS.teal, COLORS.gold, COLORS.emerald,
  COLORS.copper, COLORS.slate, COLORS.coral, COLORS.deepBlue,
  '#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899',
];

const STATUS_COLOR: Record<string, string> = {
  'Critical Shortage': SGI_COLORS.critical,
  'Moderate Shortage': SGI_COLORS.shortage,
  Balanced: SGI_COLORS.balanced,
  Surplus: SGI_COLORS.surplus,
  Oversupply: SGI_COLORS.oversupply,
};

/* ── Animation variants ───────────────────────────────────────────────────── */

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

/* ── Section card wrapper ─────────────────────────────────────────────────── */

const GlassCard = ({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) => (
  <div className={`bg-white border border-gray-100 shadow-md hover:shadow-lg transition-shadow duration-200 rounded-2xl p-5 ${className}`}>
    {children}
  </div>
);

/* ── Hero KPI gradient cards ──────────────────────────────────────────────── */

const HERO_GRADIENTS = [
  'from-[#003366] to-[#007DB5]',
  'from-[#C9A84C] to-[#B87333]',
  'from-[#007DB5] to-[#00875A]',
  'from-[#00875A] to-[#003366]',
];

interface HeroKPIProps {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  gradient: string;
  delay: number;
}

const HeroKPI = ({ icon: Icon, label, value, sub, gradient, delay }: HeroKPIProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20, rotateX: 8 }}
    animate={{ opacity: 1, y: 0, rotateX: 0 }}
    transition={{ delay, duration: 0.5 }}
    
    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white cursor-default`}
    
  >
    <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10 blur-xl" />
    <div className="absolute right-3 bottom-3 opacity-10">
      <Icon className="w-16 h-16" />
    </div>
    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium text-white/80">{label}</span>
      </div>
      <p className="text-2xl lg:text-3xl font-bold tracking-tight tabular-nums truncate">{value}</p>
      {sub && <p className="text-[10px] text-white/70 mt-1 truncate">{sub}</p>}
    </div>
  </motion.div>
);

/* ── UAE Map heatmap ──────────────────────────────────────────────────────── */

const EMIRATE_PATHS: Record<string, { d: string; cx: number; cy: number }> = {
  AUH: {
    d: 'M30,90 L80,55 L140,50 L160,75 L150,110 L100,130 L50,120 Z',
    cx: 100, cy: 85,
  },
  DXB: {
    d: 'M160,45 L185,35 L195,55 L180,65 L160,60 Z',
    cx: 175, cy: 50,
  },
  SHJ: {
    d: 'M185,25 L210,20 L215,45 L195,50 L185,35 Z',
    cx: 200, cy: 35,
  },
  AJM: {
    d: 'M195,15 L210,12 L215,22 L205,25 L195,20 Z',
    cx: 205, cy: 18,
  },
  UAQ: {
    d: 'M210,8 L222,5 L225,18 L215,20 L210,15 Z',
    cx: 218, cy: 13,
  },
  RAK: {
    d: 'M215,0 L235,2 L232,20 L225,18 L220,8 Z',
    cx: 226, cy: 10,
  },
  FUJ: {
    d: 'M235,5 L250,15 L245,40 L230,30 L232,15 Z',
    cx: 240, cy: 22,
  },
};

const getHeatColor = (value: number, max: number) => {
  const ratio = max > 0 ? value / max : 0;
  if (ratio > 0.7) return COLORS.navy;
  if (ratio > 0.4) return COLORS.teal;
  if (ratio > 0.15) return COLORS.gold;
  return '#CBD5E1';
};

interface EmirateHeatmapProps {
  data: { region_code: string; emirate: string; demand: number }[];
}

const EmirateHeatmap = ({ data }: EmirateHeatmapProps) => {
  const max = Math.max(...data.map(d => d.demand), 1);
  return (
    <svg viewBox="0 0 260 140" className="w-full max-w-md mx-auto">
      {data.map(em => {
        const path = EMIRATE_PATHS[em.region_code];
        if (!path) return null;
        const fill = getHeatColor(em.demand, max);
        return (
          <g key={em.region_code}>
            <motion.path
              d={path.d}
              fill={fill}
              stroke="white"
              strokeWidth={1.5}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.05, filter: 'brightness(1.2)' }}
              style={{ cursor: 'pointer', transformOrigin: `${path.cx}px ${path.cy}px` }}
            />
            <text
              x={path.cx}
              y={path.cy}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-[6px] font-bold fill-white pointer-events-none select-none"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
            >
              {em.region_code}
            </text>
            <text
              x={path.cx}
              y={path.cy + 9}
              textAnchor="middle"
              dominantBaseline="central"
              className="text-[4.5px] fill-white/80 pointer-events-none select-none"
            >
              {formatCompact(em.demand)}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/* ── Treemap custom content ───────────────────────────────────────────────── */

const TreemapContent = (props: any) => {
  const { x, y, width, height, name, count, index } = props;
  if (width < 40 || height < 30) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={getSeriesColor(index)}
        fillOpacity={0.85}
        stroke="white"
        strokeWidth={2}
      />
      {width > 60 && height > 40 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 6}
            textAnchor="middle"
            className="text-[9px] font-semibold fill-white"
          >
            {name?.length > 18 ? name.slice(0, 16) + '...' : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 8}
            textAnchor="middle"
            className="text-[8px] fill-white/80"
          >
            {formatCompact(count)}
          </text>
        </>
      )}
    </g>
  );
};

/* ══════════════════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

const DemandSidePage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(400);

  const { data: dashboard, isLoading: dashLoading, error: dashErr } = useDashboardSummary();
  const { data: demand, isLoading: demandLoading, error: demandErr } = useDemandInsights();
  const { data: skillGap, isLoading: sgLoading } = useSkillGap({ limit: 15 });
  const { data: salaries, isLoading: salLoading } = useSalaryBenchmarks({ limit: 20 });
  const { data: demSkills } = useDemandedSkills({ limit: 20 });

  const isLoading = loading || dashLoading || demandLoading;

  /* ── Derived data ────────────────────────────────────────────────────── */

  const monthlyAvg = useMemo(() => {
    if (!demand?.monthly_volume?.length) return 0;
    const total = demand.monthly_volume.reduce((s, m) => s + m.count, 0);
    return Math.round(total / demand.monthly_volume.length);
  }, [demand]);

  const monthlyGrowth = useMemo(() => {
    if (!demand?.monthly_volume || demand.monthly_volume.length < 2) return null;
    const vols = demand.monthly_volume;
    const recent = vols.slice(-3).reduce((s, m) => s + m.count, 0) / 3;
    const earlier = vols.slice(0, 3).reduce((s, m) => s + m.count, 0) / 3;
    if (earlier === 0) return null;
    return ((recent - earlier) / earlier) * 100;
  }, [demand]);

  const topIndustries = useMemo(
    () => (demand?.top_industries ?? []).slice(0, 10),
    [demand],
  );

  const maxIndustryCount = useMemo(
    () => Math.max(...topIndustries.map(i => i.count), 1),
    [topIndustries],
  );

  const experiencePie = useMemo(
    () => (demand?.experience_levels ?? [])
      .filter(e => (e.pct ?? 0) >= 0.5)
      .slice(0, 10)
      .map((e, i) => ({
        ...e,
        fill: PIE_COLORS[i % PIE_COLORS.length],
      })),
    [demand],
  );

  const topCompanies = useMemo(
    () => (demand?.top_companies ?? []).slice(0, 12),
    [demand],
  );

  const maxCompanyCount = useMemo(
    () => Math.max(...topCompanies.map(c => c.count), 1),
    [topCompanies],
  );

  const iscoData = useMemo(
    () => (demand?.isco_distribution ?? []).map((g, i) => ({
      name: g.group,
      count: g.count,
      index: i,
    })),
    [demand],
  );

  const topOccupations = useMemo(
    () => (dashboard?.top_occupations ?? []).slice(0, 10),
    [dashboard],
  );

  /* ── Error state ─────────────────────────────────────────────────────── */

  if (demandErr && dashErr) {
    return (
      <div className="p-6">
        <ErrorState
          message={t('فشل تحميل بيانات الطلب — حاول تسجيل الدخول مرة أخرى', 'Failed to load demand data — try logging in again')}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  /* ── Skeleton loading ────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-64 animate-pulse bg-surface-tertiary rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <SkeletonKPICard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={280} />
          <SkeletonChart height={280} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={280} />
          <SkeletonChart height={280} />
        </div>
        <SkeletonTable rows={8} cols={6} />
      </div>
    );
  }

  /* ── Guard: demand data not yet available ─────────────────────────── */
  if (!demand) {
    return (
      <div className="p-6">
        <ErrorState
          message={t('لا تتوفر بيانات الطلب حالياً', 'Demand insights data is not available')}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════ */
  /*  RENDER                                                              */
  /* ══════════════════════════════════════════════════════════════════════ */

  try { return (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <PageHeader
        title={t('تحليل جانب الطلب', 'Demand Side Analytics')}
        subtitle={t(
          'سوق العمل الإماراتي: الوظائف، القطاعات، الشركات',
          'UAE labour market: jobs, sectors, companies & vacancies',
        )}
      />

      {/* ── 1. Hero KPI Cards ──────────────────────────────────────────── */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <HeroKPI
          icon={Briefcase}
          label={t('إجمالي الوظائف', 'Total Job Postings')}
          value={formatCompact(demand?.total_postings ?? dashboard?.total_demand ?? 0)}
          sub={demand?.date_range?.min && demand?.date_range?.max ? `${demand.date_range.min.slice(0, 10)} → ${demand.date_range.max.slice(0, 10)}` : undefined}
          gradient={HERO_GRADIENTS[0]}
          delay={0}
        />
        <HeroKPI
          icon={Building2}
          label={t('شركات فريدة', 'Unique Companies')}
          value={formatCompact(demand?.unique_companies ?? 0)}
          sub={t('شركات نشطة في التوظيف', 'Actively hiring')}
          gradient={HERO_GRADIENTS[1]}
          delay={0.08}
        />
        <HeroKPI
          icon={Layers}
          label={t('القطاعات النشطة', 'Active Sectors')}
          value={String(demand?.top_industries?.length ?? dashboard?.sector_distribution?.length ?? 0)}
          sub={t('قطاعات بها وظائف', 'Sectors with postings')}
          gradient={HERO_GRADIENTS[2]}
          delay={0.16}
        />
        <HeroKPI
          icon={TrendingUp}
          label={t('نمو شهري', 'Avg Monthly Growth')}
          value={monthlyGrowth != null ? `${monthlyGrowth > 0 ? '+' : ''}${monthlyGrowth.toFixed(1)}%` : 'N/A'}
          sub={t('مقارنة بالفترة السابقة', 'vs. earlier period')}
          gradient={HERO_GRADIENTS[3]}
          delay={0.24}
        />
      </motion.div>

      <InsightPanel
        explanation="These KPIs summarize UAE's active job market. Total postings reflect real employer demand captured from LinkedIn and job aggregators."
        insight={demand ? `${formatCompact(demand.total_postings)} job postings from ${formatCompact(demand.unique_companies)} companies (${(demand.date_range?.min || '?').slice(0, 10)} to ${(demand.date_range?.max || '?').slice(0, 10)}). Average of ${demand.monthly_volume?.length ? Math.round(demand.total_postings / demand.monthly_volume.length) : '\u2014'} postings per month.` : undefined}
        recommendation="Compare these demand figures against the Supply Side page to identify where graduate output meets or misses employer needs."
        severity="info"
        source="LinkedIn UAE Job Postings (36K+), JSearch API"
      />

      {/* ── 2. Monthly Job Volume + 3. Top Industries ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Volume */}
        <GlassCard delay={0.1}>
          <DataStory
            title="Monthly Job Volume"
            method="Monthly counts of LinkedIn UAE job postings. Each row in the CSV represents one posting with a date field. Grouped by YYYY-MM."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies (37,380 rows)'}]}
            caveats="110 postings (~0.3%) missing dates excluded from monthly chart. LinkedIn data scraped, not from official API."
            sourceUrl="https://www.linkedin.com/jobs/search/?location=United%20Arab%20Emirates"
          >
          <ChartToolbar
            title={t('حجم الوظائف الشهري', 'Monthly Job Volume')}
            data={demand?.monthly_volume as Record<string, unknown>[] | undefined}
          >
            {demand?.monthly_volume?.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={demand.monthly_volume}>
                  <defs>
                    <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLORS.navy} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tick={AXIS_TICK_SM} tickFormatter={(v: string) => v.slice(0, 7)} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine
                    y={monthlyAvg}
                    stroke={COLORS.gold}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: `Avg ${formatCompact(monthlyAvg)}`, position: 'right', fontSize: 10, fill: COLORS.gold }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name={t('الوظائف', 'Postings')}
                    stroke={COLORS.navy}
                    strokeWidth={2.5}
                    fill="url(#demandGrad)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, fill: 'white', stroke: COLORS.navy }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No volume data')} />
            )}
          </ChartToolbar>
          </DataStory>
        </GlassCard>

        {/* Top Industries */}
        <GlassCard delay={0.15}>
          <DataStory
            title="Top Industries"
            method="Industry field from LinkedIn job postings, counted by frequency. Top 8 shown."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}]}
            sourceUrl="https://www.linkedin.com/jobs/search/?location=United%20Arab%20Emirates"
          >
          <ChartToolbar
            title={t('أكبر الصناعات', 'Top Industries')}
            data={topIndustries as Record<string, unknown>[]}
          >
            {topIndustries.length ? (
              <div className="space-y-2.5">
                {topIndustries.map((ind, i) => (
                  <motion.div
                    key={ind.industry}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.04 }}
                    className="group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-secondary truncate max-w-[200px]">
                        {ind.industry}
                      </span>
                      <span className="text-xs font-bold text-primary tabular-nums">
                        {formatCompact(ind.count)}
                      </span>
                    </div>
                    <div className="h-2.5 bg-surface-tertiary rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(ind.count / maxIndustryCount) * 100}%` }}
                        transition={{ delay: 0.3 + i * 0.04, duration: 0.6 }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${getSeriesColor(i)}, ${getSeriesColor(i)}CC)`,
                        }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No industry data')} />
            )}
          </ChartToolbar>
          </DataStory>
        </GlassCard>
      </div>

      {/* Monthly Volume Insight */}
      {(() => {
        const vols = demand?.monthly_volume || [];
        if (vols.length < 2) return null;
        const recent6 = vols.slice(-6);
        const prev6 = vols.slice(-12, -6);
        const recentAvg = recent6.reduce((s, v) => s + v.count, 0) / (recent6.length || 1);
        const prevAvg = prev6.length > 0 ? prev6.reduce((s, v) => s + v.count, 0) / prev6.length : recentAvg;
        const changePct = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg * 100).toFixed(1) : '0';
        const isGrowing = Number(changePct) > 0;
        return (
          <InsightPanel
            explanation="Monthly job posting volume reveals hiring cycles and market momentum. Seasonal patterns (Q1 budget cycles, Ramadan slowdowns) are normal."
            insight={`Recent 6-month average: ${Math.round(recentAvg)} postings/month \u2014 ${isGrowing ? 'up' : 'down'} ${Math.abs(Number(changePct))}% vs prior period. ${isGrowing ? 'The job market is expanding.' : 'Hiring is contracting \u2014 may signal economic slowdown or seasonal adjustment.'}`}
            recommendation={isGrowing ? "Growing demand creates opportunities to fast-track graduates into high-need sectors. Coordinate with universities on accelerated programs." : "Monitor for sustained decline vs seasonal dip. If persistent, prepare workforce reskilling programs and consider stimulus for key sectors."}
            severity={isGrowing ? 'success' : 'warning'}
            source="LinkedIn UAE \u2014 Monthly Aggregation"
          />
        );
      })()}

      {/* Top Industries Insight */}
      {(() => {
        const industries = demand?.top_industries || [];
        const top3 = industries.slice(0, 3).map(i => i.industry).join(', ');
        return industries.length > 0 ? (
          <InsightPanel
            explanation="Industry distribution shows where job creation is concentrated. Diversification across sectors indicates a healthy economy."
            insight={`Top hiring sectors: ${top3}. ${industries.length > 5 ? `The top 5 sectors account for ${industries.slice(0, 5).reduce((s, i) => s + i.count, 0)} of ${demand?.total_postings || 0} total postings.` : ''}`}
            recommendation="Align university program offerings with top hiring industries. If Technology and Finance dominate, ensure adequate STEM and business program capacity."
            severity="info"
            source="LinkedIn Industry Classification"
          />
        ) : null;
      })()}

      {/* ── 4. UAE Heatmap + 5. Experience Level Donut ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Emirate Demand Heatmap */}
        <GlassCard delay={0.2}>
          <DataStory
            title="Demand by Emirate"
            method="Job posting locations mapped to 7 UAE emirates. Location field from LinkedIn parsed to emirate codes."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}, {name:'dim_region', label:'UAE Emirates'}]}
          >
          <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal" />
            {t('خريطة الطلب حسب الإمارة', 'Emirate Demand Heatmap')}
          </h3>
          {dashboard?.emirate_metrics?.length ? (
            <div>
              <EmirateHeatmap data={dashboard.emirate_metrics} />
              <div className="flex items-center justify-center gap-4 mt-4">
                {[
                  { label: t('مرتفع', 'High'), color: COLORS.navy },
                  { label: t('متوسط', 'Medium'), color: COLORS.teal },
                  { label: t('منخفض', 'Low'), color: COLORS.gold },
                  { label: t('قليل', 'Minimal'), color: '#CBD5E1' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
                    <span className="text-[10px] text-text-muted">{l.label}</span>
                  </div>
                ))}
              </div>
              {/* Emirate detail row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                {dashboard.emirate_metrics.slice(0, 4).map(em => (
                  <div
                    key={em.region_code}
                    className="bg-surface-tertiary/50 rounded-lg p-2.5 text-center"
                  >
                    <p className="text-[10px] text-text-muted">{em.emirate}</p>
                    <p className="text-sm font-bold text-primary tabular-nums">
                      {formatCompact(em.demand)}
                    </p>
                    <p className="text-[9px] text-text-muted">
                      {t('فجوة', 'Gap')}: {formatCompact(em.gap)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ChartEmpty title={t('لا توجد بيانات', 'No emirate data')} />
          )}
          </DataStory>
        </GlassCard>

        {/* Experience Level Donut */}
        <GlassCard delay={0.25}>
          <DataStory
            title="Experience Level Distribution"
            method="Experience level field from LinkedIn postings. Only 7 valid categories kept (Entry level, Mid-Senior, Associate, Director, Executive, Internship, Not Applicable). Dates and garbage values filtered out."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}]}
            caveats="LinkedIn experience levels are employer-assigned and inconsistent. Items with <0.5% share excluded from chart."
          >
          <ChartToolbar
            title={t('توزيع مستوى الخبرة', 'Experience Level Distribution')}
            data={demand?.experience_levels as Record<string, unknown>[] | undefined}
          >
            {experiencePie.length ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={240}>
                  <PieChart>
                    <Pie
                      data={experiencePie}
                      dataKey="count"
                      nameKey="level"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={3}
                      strokeWidth={2}
                      stroke="white"
                    >
                      {experiencePie.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {experiencePie.map((e, i) => (
                    <div key={e.level} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: e.fill }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-secondary truncate">{e.level}</p>
                      </div>
                      <span className="text-xs font-bold text-primary tabular-nums">
                        {(e.pct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No experience data')} />
            )}
          </ChartToolbar>
          </DataStory>
        </GlassCard>
      </div>

      {/* Experience Level Insight */}
      {(() => {
        const levels = demand?.experience_levels || [];
        const entry = levels.find(l => l.level?.toLowerCase().includes('entry') || l.level?.toLowerCase().includes('junior'));
        const entryPct = entry?.pct ?? 0;
        return levels.length > 0 ? (
          <InsightPanel
            explanation="Experience level distribution reveals whether the market is open to fresh graduates or primarily seeking experienced professionals."
            insight={`Entry-level positions: ${entryPct.toFixed(1)}% of postings. ${entryPct < 15 ? 'Very few entry-level openings \u2014 graduates may struggle to find first jobs.' : entryPct > 30 ? 'Strong entry-level market \u2014 good absorption capacity for new graduates.' : 'Moderate entry-level availability.'}`}
            recommendation={entryPct < 20 ? "Low entry-level availability suggests a need for government-backed internship programs, apprenticeships, and Emiratisation incentives for first-time hiring." : "Healthy entry-level market. Focus on quality matching \u2014 ensure graduates have skills employers actually need."}
            severity={entryPct < 15 ? 'critical' : entryPct < 25 ? 'warning' : 'success'}
            source="LinkedIn Experience Level Tags"
          />
        ) : null;
      })()}

      {/* ── 6. Employment Types + 7. Top Companies ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employment Types Stacked Bar */}
        <GlassCard delay={0.3}>
          <DataStory
            title="Employment Types"
            method="Employment type field from LinkedIn. Only valid categories kept (Full-time, Part-time, Contract, Temporary, Internship, Volunteer, Other). URLs and company names filtered out."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}]}
            caveats="Original data contained LinkedIn URLs as employment types — cleaned."
          >
          <ChartToolbar
            title={t('أنواع التوظيف', 'Employment Types')}
            data={demand?.employment_types as Record<string, unknown>[] | undefined}
          >
            {(() => {
              const clean = (demand?.employment_types ?? []).filter(e => e.type && e.type.length < 30 && !e.type.startsWith('http'));
              return clean.length ? (
                <ResponsiveContainer width="100%" height={Math.max(180, clean.length * 36)}>
                  <BarChart
                    data={clean}
                    layout="vertical"
                    margin={{ left: 80, right: 30, top: 5, bottom: 5 }}
                  >
                    <CartesianGrid {...GRID_PROPS} horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${v}%`} />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={AXIS_TICK_SM}
                      width={75}
                    />
                    <Tooltip content={<ChartTooltip unit="%" />} />
                    <Bar
                      dataKey="pct"
                      name={t('النسبة', 'Percentage')}
                      radius={BAR_RADIUS_H}
                    >
                      {clean.map((_, i) => (
                        <Cell key={i} fill={getSeriesColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty title={t('لا توجد بيانات', 'No employment type data')} />
              );
            })()}
          </ChartToolbar>
          </DataStory>
        </GlassCard>

        {/* Top Companies */}
        <GlassCard delay={0.35}>
          <DataStory
            title="Top Companies Hiring"
            method="Company name (org_name) from LinkedIn postings, counted by frequency. Top 12 shown."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}]}
          >
          <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <Crown className="w-4 h-4 text-gold" />
            {t('أكبر الشركات توظيفاً', 'Top Companies Hiring')}
          </h3>
          {topCompanies.length ? (
            <div className="space-y-2">
              {topCompanies.map((c, i) => (
                <motion.div
                  key={c.company}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.04 }}
                  className="relative flex items-center gap-3 py-1.5 group"
                >
                  <span className="text-[10px] font-bold text-text-muted w-5 text-right tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0 relative">
                    {/* bar behind */}
                    <div className="absolute inset-y-0 left-0 rounded-md opacity-10 group-hover:opacity-20 transition-opacity"
                      style={{
                        width: `${(c.count / maxCompanyCount) * 100}%`,
                        backgroundColor: getSeriesColor(i % 4),
                      }}
                    />
                    <div className="relative flex items-center justify-between px-2 py-1">
                      <span className="text-xs text-text-secondary truncate">{c.company}</span>
                      <span className="text-xs font-bold text-primary tabular-nums shrink-0 ml-2">
                        {formatCompact(c.count)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <ChartEmpty title={t('لا توجد بيانات', 'No company data')} height={200} />
          )}
          </DataStory>
        </GlassCard>
      </div>

      {/* ── 8. Occupation Distribution (Treemap) ──────────────────────── */}
      <GlassCard delay={0.4}>
        <DataStory
          title="Occupation Distribution"
          method="ISCO major occupation groups from LinkedIn data. Postings mapped to occupation codes via job title matching."
          quality="scraped"
          tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}, {name:'dim_occupation', label:'Occupations (3,813)'}]}
          caveats="Many postings lack occupation codes — mapping quality varies."
        >
        <ChartToolbar
          title={t('توزيع المهن (مجموعات ISCO)', 'Occupation Distribution (ISCO Groups)')}
          data={iscoData as Record<string, unknown>[]}
        >
          {iscoData.length ? (
            <ResponsiveContainer width="100%" height={320}>
              <Treemap
                data={iscoData}
                dataKey="count"
                nameKey="name"
                content={<TreemapContent />}
                animationDuration={600}
              />
            </ResponsiveContainer>
          ) : (
            <ChartEmpty title={t('لا توجد بيانات', 'No ISCO data')} />
          )}
        </ChartToolbar>
        </DataStory>
      </GlassCard>

      {/* ── 9. Salary Benchmarks ──────────────────────────────────────── */}
      <GlassCard delay={0.45}>
        <DataStory
          title="Salary Benchmarks"
          method="Salary data from Glassdoor API. Min/median/max salary per occupation-emirate combination."
          quality="scraped"
          tables={[{name:'fact_salary_benchmark', label:'Salary Benchmarks (71 rows)'}]}
          caveats="Only 71 occupation-emirate combinations covered. Salaries in AED. Small sample sizes for some roles."
          sourceUrl="https://www.glassdoor.com/Salaries/uae-salary-SRCH_IL.0,3_IN6.htm"
        >
        <ChartToolbar
          title={t('مقارنة الرواتب', 'Salary Benchmarks')}
          data={salaries as Record<string, unknown>[] | undefined}
        >
          {salLoading ? (
            <SkeletonTable rows={5} cols={5} />
          ) : salaries?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-tertiary">
                    {[
                      t('المسمى الوظيفي', 'Job Title'),
                      t('الإمارة', 'Emirate'),
                      t('نطاق الراتب', 'Salary Range'),
                      t('العينة', 'Sample'),
                      t('الثقة', 'Confidence'),
                    ].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salaries.slice(0, 15).map((s, i) => {
                    const minSal = s.min_salary ?? 0;
                    const maxSal = s.max_salary ?? 0;
                    const medSal = s.median_salary ?? 0;
                    const range = maxSal - minSal || 1;
                    const medianPct = ((medSal - minSal) / range) * 100;
                    return (
                      <motion.tr
                        key={`${s.job_title}-${s.region_code}-${i}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 + i * 0.03 }}
                        className="border-t border-border-light hover:bg-surface-hover/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-primary">{s.job_title}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary">{s.emirate}</td>
                        <td className="px-4 py-3 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-text-muted tabular-nums w-12 text-right">
                              {formatCompact(minSal)}
                            </span>
                            <div className="flex-1 relative h-3 bg-surface-tertiary rounded-full">
                              <div
                                className="absolute inset-y-0 rounded-full"
                                style={{
                                  left: '0%',
                                  right: '0%',
                                  background: `linear-gradient(90deg, ${COLORS.teal}40, ${COLORS.navy}60)`,
                                }}
                              />
                              <div
                                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-md"
                                style={{
                                  left: `${Math.min(Math.max(medianPct, 5), 95)}%`,
                                  backgroundColor: COLORS.gold,
                                }}
                                title={`Median: ${formatNumber(medSal)} ${s.currency ?? ''}`}
                              />
                            </div>
                            <span className="text-[10px] text-text-muted tabular-nums w-12">
                              {formatCompact(maxSal)}
                            </span>
                          </div>
                          <p className="text-[9px] text-text-muted text-center mt-0.5">
                            {t('المتوسط', 'Median')}: {formatNumber(medSal)} {s.currency ?? ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-text-secondary tabular-nums text-center">
                          {s.sample_count}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              s.confidence === 'high'
                                ? 'bg-emerald-50 text-emerald-700'
                                : s.confidence === 'medium'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {s.confidence ?? 'N/A'}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <ChartEmpty title={t('لا توجد بيانات رواتب', 'No salary data available')} />
          )}
        </ChartToolbar>
        </DataStory>
      </GlassCard>

      <InsightPanel
        explanation="Salary benchmarks help graduates set realistic expectations and help policymakers assess wage competitiveness across emirates."
        insight={salaries?.length ? `Salary data covers ${salaries.length} occupation-emirate combinations. ${salaries.some(s => (s.median_salary ?? 0) > 20000) ? 'Several roles offer median salaries above AED 20,000/month, indicating strong compensation for specialized skills.' : 'Most roles fall in moderate salary ranges.'}` : undefined}
        recommendation="Compare salary benchmarks against cost of living by emirate. Low salaries in high-cost emirates (Dubai, Abu Dhabi) may drive talent to other markets."
        severity="info"
        source="JSearch Salary API, LinkedIn Compensation Data"
      />

      {/* ── 10. Top Demanded Occupations (Supply vs Demand) ────────────── */}
      <GlassCard delay={0.5}>
        <DataStory
          title="Supply vs Demand by Occupation"
          method="Occupation-level supply (from Bayanat/MOHRE workforce data) vs demand (from LinkedIn job postings). Gap = supply - demand."
          quality="mixed"
          tables={[{name:'fact_supply_talent_agg', label:'Labour Supply (842K rows)'}, {name:'fact_demand_vacancies_agg', label:'Job Vacancies (37K rows)'}]}
          caveats="Gap analysis depends on ISCO occupation code mapping which is incomplete. Many supply/demand rows lack occupation codes."
        >
        <ChartToolbar
          title={t('أعلى المهن المطلوبة', 'Top Demanded Occupations')}
          data={topOccupations as Record<string, unknown>[]}
        >
          {topOccupations.length ? (
            <ResponsiveContainer width="100%" height={Math.max(topOccupations.length * 42, 280)}>
              <BarChart
                data={topOccupations}
                layout="vertical"
                margin={{ left: 160, right: 40, top: 5, bottom: 5 }}
              >
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis
                  type="category"
                  dataKey="title_en"
                  tick={AXIS_TICK_SM}
                  width={155}
                  tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 26) + '...' : v}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="supply"
                  name={t('العرض', 'Supply')}
                  fill={COLORS.teal}
                  radius={BAR_RADIUS_H}
                  barSize={14}
                />
                <Bar
                  dataKey="demand"
                  name={t('الطلب', 'Demand')}
                  fill={COLORS.gold}
                  radius={BAR_RADIUS_H}
                  barSize={14}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty title={t('لا توجد بيانات', 'No occupation data')} />
          )}
        </ChartToolbar>

        {/* Status badges row */}
        {topOccupations.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {topOccupations.filter(o => o.status).slice(0, 8).map(o => (
              <div
                key={o.occupation_id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-tertiary/60 text-xs"
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[o.status ?? ''] ?? '#999' }}
                />
                <span className="text-text-secondary truncate max-w-[140px]">{o.title_en}</span>
                <span
                  className="font-semibold text-[10px]"
                  style={{ color: STATUS_COLOR[o.status ?? ''] ?? '#999' }}
                >
                  {o.status}
                </span>
              </div>
            ))}
          </div>
        )}
        </DataStory>
      </GlassCard>

      {/* Top Occupations Insight */}
      {(() => {
        const occs = dashboard?.top_occupations || [];
        const shortages = occs.filter(o => (o.status || '').includes('Shortage')).length;
        return occs.length > 0 ? (
          <InsightPanel
            explanation="Supply vs Demand comparison reveals which occupations have talent shortages (red) or surpluses (blue). The gap determines policy priority."
            insight={`${shortages} of ${occs.length} displayed occupations show talent shortages. ${shortages > occs.length * 0.6 ? 'The majority of tracked occupations face shortages \u2014 indicating systemic undersupply.' : 'A mix of shortages and balanced occupations suggests targeted rather than systemic issues.'}`}
            recommendation={shortages > 3 ? "Critical shortages require immediate action: expand relevant university programs, fast-track work permits for skilled expatriates, and launch targeted reskilling initiatives." : "Monitor balanced occupations for emerging gaps. Proactive planning is cheaper than reactive crisis management."}
            severity={shortages > occs.length * 0.5 ? 'critical' : shortages > 2 ? 'warning' : 'success'}
            source="Gap Cube \u2014 Supply (Bayanat/MOHRE) vs Demand (LinkedIn)"
          />
        ) : null;
      })()}

      {/* ── Most In-Demand Skills ─────────────────────────────────────── */}
      <DataStory
        title="Most In-Demand Skills"
        quality="official"
        method="Skills inherited from ESCO occupation-skill mappings for each job posting. Each LinkedIn job is mapped to an ESCO occupation, then all essential+optional skills for that occupation are attributed to the job."
        tables={[{name:'fact_job_skills', label:'Job Skills (3M rows)'}, {name:'dim_skill', label:'ESCO Skills (21K)'}]}
      >
        <GlassCard delay={0.5}>
          <ChartToolbar
            title={t('أكثر المهارات طلباً', 'Most In-Demand Skills')}
            data={demSkills?.skills as Record<string, unknown>[] | undefined}
          >
            {(demSkills?.skills || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(400, (demSkills?.skills?.length ?? 0) * 28)}>
                <BarChart
                  layout="vertical"
                  data={demSkills?.skills || []}
                  margin={{ left: 160, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid {...GRID_PROPS} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    tick={AXIS_TICK_SM}
                    width={155}
                    tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 26) + '...' : v}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar
                    dataKey="job_count"
                    name={t('عدد الوظائف', 'Job Count')}
                    radius={BAR_RADIUS_H}
                  >
                    {(demSkills?.skills || []).map((entry: any, i: number) => {
                      const color =
                        entry.type === 'knowledge' ? COLORS.navy :
                        entry.type === 'competence' ? COLORS.gold :
                        COLORS.teal; // skill
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No skills data')} />
            )}
          </ChartToolbar>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: COLORS.navy }} /> {t('معرفة', 'Knowledge')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: COLORS.teal }} /> {t('مهارة', 'Skill')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: COLORS.gold }} /> {t('كفاءة', 'Competence')}</span>
          </div>
        </GlassCard>
        <InsightPanel
          explanation="These are ESCO-standardized skills extracted from 35K+ job postings. Each job is mapped to an ESCO occupation, and skills are inherited from the ESCO occupation-skill taxonomy."
          insight={demSkills?.skills?.length ? `Top demanded skill is "${demSkills.skills[0]?.skill}" appearing in ${formatCompact(demSkills.skills[0]?.job_count)} job postings.` : undefined}
          recommendation="Focus training programs and university curricula on the most demanded skills to improve graduate employability and reduce the skills gap."
          severity="info"
          source="ESCO Taxonomy + LinkedIn Job Postings"
        />
      </DataStory>

      {/* ── 11. Data Sources Panel ─────────────────────────────────────── */}
      <GlassCard delay={0.55}>
        <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-navy" />
          {t('مصادر البيانات', 'Data Sources')}
        </h3>
        <div className="flex flex-wrap gap-2">
          {[
            { name: 'LinkedIn Job Postings', color: 'bg-blue-50 text-blue-700 border-blue-200' },
            { name: 'JSearch API', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            { name: 'MOHRE', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
            { name: 'ESCO Taxonomy', color: 'bg-purple-50 text-purple-700 border-purple-200' },
            { name: 'FCSC Workforce', color: 'bg-amber-50 text-amber-700 border-amber-200' },
            { name: 'Salary API', color: 'bg-teal-50 text-teal-700 border-teal-200' },
          ].map(src => (
            <span
              key={src.name}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${src.color} cursor-default hover:shadow-sm transition-shadow`}
            >
              <Database className="w-3 h-3" />
              {src.name}
            </span>
          ))}
        </div>

        {/* Data quality row */}
        {demand?.data_quality && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: t('نسبة التوحيد', 'Standardized'),
                value: `${(demand.data_quality.standardized_pct ?? 0).toFixed(1)}%`,
                good: (demand.data_quality.standardized_pct ?? 0) > 80,
              },
              {
                label: t('مهنة مفقودة', 'Missing Occupation'),
                value: `${(demand.data_quality.missing_occupation_pct ?? 0).toFixed(1)}%`,
                good: (demand.data_quality.missing_occupation_pct ?? 0) < 15,
              },
              {
                label: t('صناعة مفقودة', 'Missing Industry'),
                value: `${(demand.data_quality.missing_industry_pct ?? 0).toFixed(1)}%`,
                good: (demand.data_quality.missing_industry_pct ?? 0) < 15,
              },
              {
                label: t('سجلات مكررة', 'Duplicate IDs'),
                value: formatCompact(demand.data_quality.duplicate_ids ?? 0),
                good: (demand.data_quality.duplicate_ids ?? 0) < 100,
              },
            ].map(q => (
              <div
                key={q.label}
                className="bg-surface-tertiary/50 rounded-lg px-3 py-2 text-center"
              >
                <p className="text-[10px] text-text-muted mb-0.5">{q.label}</p>
                <p className={`text-sm font-bold tabular-nums ${q.good ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {q.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <InsightPanel
        explanation="Data quality metrics help you assess confidence in the demand-side analysis. Higher standardization and lower missing rates mean more reliable insights."
        insight={demand?.data_quality ? `Standardized: ${(demand.data_quality.standardized_pct ?? 0).toFixed(0)}%, Missing occupation: ${(demand.data_quality.missing_occupation_pct ?? 0).toFixed(0)}%, Missing industry: ${(demand.data_quality.missing_industry_pct ?? 0).toFixed(0)}%` : undefined}
        recommendation="Charts based on data with >20% missing values should be treated as directional indicators, not precise measurements. Always note confidence levels in reports."
        severity={(demand?.data_quality?.missing_occupation_pct ?? 0) > 20 ? 'warning' : 'success'}
        source="Automated Pipeline Quality Checks"
      />
    </div>
  ); } catch (err: any) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h3 className="text-red-700 font-semibold mb-2">Demand Side rendering error</h3>
          <pre className="text-xs text-red-600 whitespace-pre-wrap break-all">{err?.message}{'\n'}{err?.stack?.split('\n').slice(1,4).join('\n')}</pre>
        </div>
      </div>
    );
  }
};

export default DemandSidePage;
