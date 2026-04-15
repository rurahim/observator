import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import {
  useDashboardSummary,
  useDemandInsights,
  useDemandedSkills,
  useSkillGap,
  useSalaryBenchmarks,
  useISCOGroupComparison,
  useRealOccupationComparison,
  useFutureProjection,
  useExplorerFilters,
  useOccupationSkillsDetail,
  useSkillNetworkGraph,
} from '@/api/hooks';
import { formatCompact, formatNumber } from '@/utils/formatters';
import {
  COLORS,
  GRID_PROPS,
  AXIS_TICK,
  AXIS_TICK_SM,
  getSeriesColor,
  SERIES_COLORS,
  BAR_RADIUS,
  BAR_RADIUS_H,
} from '@/utils/chartColors';
import DataStory from '@/components/shared/DataStory';
import BubbleCloud from '@/components/charts/BubbleCloud';
import ForceGraph from '@/components/charts/ForceGraph';
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
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Target,
  Compass,
  GraduationCap,
  Wallet,
  Cpu,
  Shield,
  ArrowUpDown,
  Globe,
  Zap,
  Loader2,
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
  ComposedChart,
  Line,
} from 'recharts';

/* ── Palette ──────────────────────────────────────────────────────────────── */

const PIE_COLORS = [
  COLORS.navy, COLORS.teal, COLORS.gold, COLORS.emerald,
  COLORS.copper, COLORS.slate, COLORS.coral, COLORS.deepBlue,
  '#8B5CF6', '#06B6D4', '#F59E0B', '#0284C7',
];


/* ── Animation variants ───────────────────────────────────────────────────── */

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

/* ── Section Header ──────────────────────────────────────────────────────── */

const SectionHeader = ({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) => (
  <div className="flex items-center gap-3 mb-1">
    <div className="p-2 rounded-xl bg-gradient-to-br from-[#003366]/10 to-[#007DB5]/10">
      <Icon className="w-5 h-5 text-[#003366]" />
    </div>
    <div>
      <h2 className="text-base font-bold text-[#003366]">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
    <div className="flex-1 border-b border-gray-200 ml-3" />
  </div>
);

/* ── Section card wrapper ─────────────────────────────────────────────────── */

const GlassCard = ({
  children,
  className = '',
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

  /* ── Shared state — ALL filter dimensions ──────────────────────────── */
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [industryFilter, setIndustryFilter] = useState<string>('');
  const [expLevelFilter, setExpLevelFilter] = useState<string>('');
  const [empTypeFilter, setEmpTypeFilter] = useState<string>('');
  const [iscoFilter, setIscoFilter] = useState<string>('');
  const [occSearch, setOccSearch] = useState('');
  const [occPage, setOccPage] = useState(1);
  const [selectedOccId, setSelectedOccId] = useState<number | null>(null);
  const [salarySort, setSalarySort] = useState<'median' | 'max' | 'sample'>('median');
  const [graphOccLimit, setGraphOccLimit] = useState(20);
  const [graphSkillsPer, setGraphSkillsPer] = useState(5);
  const hasFilters = !!(regionFilter || industryFilter || expLevelFilter || empTypeFilter || iscoFilter);

  // Future Demand Projection — local drill-down filters
  const [demProjRegion, setDemProjRegion] = useState('');
  const [demProjIsco, setDemProjIsco] = useState('');
  const [demProjSector, setDemProjSector] = useState('');
  const [demProjExp, setDemProjExp] = useState('');
  const hasDemProjFilters = !!(demProjRegion || demProjIsco || demProjSector || demProjExp);
  const [demExtResearch, setDemExtResearch] = useState<any>(null);
  const [demExtLoading, setDemExtLoading] = useState(false);

  /* ── Data hooks ───────────────────────────────────────────────────────── */
  const { data: dashboard, isLoading: dashLoading, error: dashErr } = useDashboardSummary(
    regionFilter ? { emirate: regionFilter } : undefined
  );
  const { data: demand, isLoading: demandLoading, error: demandErr } = useDemandInsights();
  const { data: skillGap, isLoading: sgLoading } = useSkillGap({ limit: 15 });
  const { data: salaries, isLoading: salLoading } = useSalaryBenchmarks({
    emirate: regionFilter || undefined,
    limit: 30,
  });
  const { data: demSkills } = useDemandedSkills({ limit: 30 });
  const { data: iscoGroups, isLoading: iscoLoading } = useISCOGroupComparison(
    regionFilter ? { region: regionFilter } : undefined
  );
  const { data: occComparison, isLoading: occLoading } = useRealOccupationComparison({
    limit: 15,
    search: occSearch || undefined,
    region: regionFilter || undefined,
    page: occPage,
  } as any);
  const { data: futureProj, isLoading: futureLoading } = useFutureProjection();
  const { data: explorerFilters } = useExplorerFilters();
  const { data: occSkills, isLoading: occSkillsLoading } = useOccupationSkillsDetail(selectedOccId);
  const { data: skillNetGraph } = useSkillNetworkGraph({
    occ_limit: graphOccLimit,
    skills_per_occ: graphSkillsPer,
    ...(iscoFilter ? { isco_group: iscoFilter } : {}),
    ...(regionFilter ? { region: regionFilter } : {}),
  });

  const isLoading = loading || dashLoading || demandLoading;

  // External research for demand projection (auto-trigger on filter change)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!demProjRegion && !demProjIsco && !demProjSector && !demProjExp) {
        setDemExtResearch(null);
        return;
      }
      setDemExtLoading(true);
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/external-research/projection-signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            metric: 'demand',
            region: demProjRegion || undefined,
            specialty: demProjIsco ? `ISCO group ${demProjIsco}` : undefined,
            sector: demProjSector || undefined,
            horizon_years: 5,
          }),
        });
        if (res.ok) setDemExtResearch(await res.json());
      } catch {}
      setDemExtLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [demProjRegion, demProjIsco, demProjSector, demProjExp]);

  /* ── Derived data ─────────────────────────────────────────────────────── */

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

  // ISCO data now uses DB-sourced iscoGroups (same as bar chart) instead of CSV isco_distribution

  const topOccupations = useMemo(
    () => (dashboard?.top_occupations ?? []).slice(0, 10),
    [dashboard],
  );

  const sortedSalaries = useMemo(() => {
    if (!salaries?.length) return [];
    const sorted = [...salaries];
    if (salarySort === 'median') sorted.sort((a, b) => (b.median_salary ?? 0) - (a.median_salary ?? 0));
    else if (salarySort === 'max') sorted.sort((a, b) => (b.max_salary ?? 0) - (a.max_salary ?? 0));
    else sorted.sort((a, b) => (b.sample_count ?? 0) - (a.sample_count ?? 0));
    return sorted;
  }, [salaries, salarySort]);

  const salaryByEmirate = useMemo(() => {
    if (!salaries?.length) return [];
    const emirateMap: Record<string, { emirate: string; avg_median: number; count: number }> = {};
    salaries.forEach(s => {
      const key = s.emirate || s.region_code || 'Unknown';
      if (!emirateMap[key]) emirateMap[key] = { emirate: key, avg_median: 0, count: 0 };
      emirateMap[key].avg_median += (s.median_salary ?? 0);
      emirateMap[key].count += 1;
    });
    return Object.values(emirateMap)
      .map(e => ({ ...e, avg_median: Math.round(e.avg_median / (e.count || 1)) }))
      .sort((a, b) => b.avg_median - a.avg_median);
  }, [salaries]);

  const topPayingJobs = useMemo(() => {
    if (!salaries?.length) return [];
    return [...salaries]
      .sort((a, b) => (b.median_salary ?? 0) - (a.median_salary ?? 0))
      .slice(0, 10);
  }, [salaries]);

  const regionOptions = useMemo(() => {
    const opts = explorerFilters?.regions || explorerFilters?.emirates || [];
    if (Array.isArray(opts) && opts.length > 0) return opts;
    // Fallback from dashboard emirate_metrics
    return (dashboard?.emirate_metrics ?? []).map(e => ({
      value: e.region_code,
      label: e.emirate,
    }));
  }, [explorerFilters, dashboard]);

  const skillsByType = useMemo(() => {
    const skills = demSkills?.skills || [];
    const groups: Record<string, number> = {};
    skills.forEach((s: any) => {
      const type = s.type || 'unknown';
      groups[type] = (groups[type] || 0) + (s.job_count || 0);
    });
    return Object.entries(groups).map(([type, count]) => ({ type, count }));
  }, [demSkills]);

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
    <div className="p-6 space-y-8 max-w-[1440px] mx-auto">
      {/* ── Page Header + Filters ─────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <PageHeader
            title={t('تحليل جانب الطلب الشامل', 'Comprehensive Demand Side Analytics')}
            subtitle={t(
              'سوق العمل الإماراتي: الوظائف، القطاعات، المهن، المهارات، الرواتب',
              'UAE labour market: jobs, sectors, occupations, skills, salaries & projections',
            )}
          />
        </div>
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
          {/* Region */}
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 focus:border-[#007DB5] outline-none"
              value={regionFilter}
              onChange={(e) => { setRegionFilter(e.target.value); setOccPage(1); }}
            >
              <option value="">{t('كل الإمارات', 'All Emirates')}</option>
              {regionOptions.map((r: any) => (
                <option key={r.value || r.region_code} value={r.value || r.region_code}>
                  {r.label || r.emirate}
                </option>
              ))}
            </select>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          {/* Industry */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 focus:border-[#007DB5] outline-none max-w-[180px]"
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
            >
              <option value="">{t('كل القطاعات', 'All Industries')}</option>
              {(demand?.top_industries ?? []).map((ind: any) => (
                <option key={ind.industry} value={ind.industry}>{ind.industry}</option>
              ))}
            </select>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          {/* Experience Level */}
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 focus:border-[#007DB5] outline-none"
              value={expLevelFilter}
              onChange={(e) => setExpLevelFilter(e.target.value)}
            >
              <option value="">{t('كل المستويات', 'All Experience Levels')}</option>
              {(demand?.experience_levels ?? []).filter((e: any) => e.level && e.level.length < 30 && !e.level.startsWith('http')).map((e: any) => (
                <option key={e.level} value={e.level}>{e.level}</option>
              ))}
            </select>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          {/* Employment Type */}
          <div className="flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 focus:border-[#007DB5] outline-none"
              value={empTypeFilter}
              onChange={(e) => setEmpTypeFilter(e.target.value)}
            >
              <option value="">{t('كل أنواع التوظيف', 'All Employment Types')}</option>
              {(demand?.employment_types ?? []).filter((e: any) => e.type && e.type.length < 30 && !e.type.startsWith('http')).map((e: any) => (
                <option key={e.type} value={e.type}>{e.type}</option>
              ))}
            </select>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          {/* ISCO Major Group */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 focus:border-[#007DB5] outline-none"
              value={iscoFilter}
              onChange={(e) => { setIscoFilter(e.target.value); setOccPage(1); }}
            >
              <option value="">{t('كل مجموعات ISCO', 'All ISCO Groups')}</option>
              {[
                { v: '0', l: '0 — Armed Forces' }, { v: '1', l: '1 — Managers' },
                { v: '2', l: '2 — Professionals' }, { v: '3', l: '3 — Technicians' },
                { v: '4', l: '4 — Clerical Support' }, { v: '5', l: '5 — Service & Sales' },
                { v: '6', l: '6 — Agriculture' }, { v: '7', l: '7 — Craft & Trade' },
                { v: '8', l: '8 — Machine Operators' }, { v: '9', l: '9 — Elementary' },
              ].map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
            </select>
          </div>
          <div className="w-px h-5 bg-gray-200" />
          {/* Graph controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-400 font-semibold uppercase">{t('خريطة', 'Graph')}:</span>
            <select value={graphOccLimit} onChange={e => setGraphOccLimit(Number(e.target.value))}
              className="text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white w-[60px]">
              {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n} occ</option>)}
            </select>
            <select value={graphSkillsPer} onChange={e => setGraphSkillsPer(Number(e.target.value))}
              className="text-[10px] border border-gray-200 rounded px-1.5 py-1 bg-white w-[60px]">
              {[3, 5, 8, 10, 0].map(n => <option key={n} value={n}>{n === 0 ? 'All' : n} sk</option>)}
            </select>
          </div>
          {/* Clear all */}
          {hasFilters && (
            <>
              <div className="w-px h-5 bg-gray-200" />
              <button
                onClick={() => { setRegionFilter(''); setIndustryFilter(''); setExpLevelFilter(''); setEmpTypeFilter(''); setIscoFilter(''); setOccPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
              >
                ✕ {t('مسح الكل', 'Clear all')}
              </button>
            </>
          )}
          {hasFilters && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#007DB5]/10 text-[#007DB5] font-semibold">
              {[regionFilter, industryFilter, expLevelFilter, empTypeFilter, iscoFilter].filter(Boolean).length} {t('فلتر نشط', 'active')}
            </span>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 1. HERO KPI CARDS                                              */}
      {/* ════════════════════════════════════════════════════════════════ */}
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
          sub={demand?.date_range?.min && demand?.date_range?.max ? `${demand.date_range.min.slice(0, 10)} \u2192 ${demand.date_range.max.slice(0, 10)}` : undefined}
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

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 2. MARKET OVERVIEW                                             */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={BarChart3}
        title={t('نظرة عامة على السوق', 'Market Overview')}
        subtitle={t('حجم التوظيف الشهري والقطاعات الرائدة', 'Monthly hiring volume & leading sectors')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Volume */}
        <GlassCard>
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
        <GlassCard>
          <DataStory
            title="Top Industries"
            method="Industry field from LinkedIn job postings, counted by frequency. Top 10 shown."
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

      {/* Market Overview Insight */}
      {(() => {
        const vols = demand?.monthly_volume || [];
        if (vols.length < 2) return null;
        const recent6 = vols.slice(-6);
        const prev6 = vols.slice(-12, -6);
        const recentAvg = recent6.reduce((s, v) => s + v.count, 0) / (recent6.length || 1);
        const prevAvg = prev6.length > 0 ? prev6.reduce((s, v) => s + v.count, 0) / prev6.length : recentAvg;
        const changePct = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg * 100).toFixed(1) : '0';
        const isGrowing = Number(changePct) > 0;
        const top3 = (demand?.top_industries || []).slice(0, 3).map(i => i.industry).join(', ');
        return (
          <InsightPanel
            explanation="Monthly volume reveals hiring cycles. Top industries show where job creation is concentrated."
            insight={`Recent 6-month average: ${Math.round(recentAvg)} postings/month \u2014 ${isGrowing ? 'up' : 'down'} ${Math.abs(Number(changePct))}% vs prior period. Top sectors: ${top3}.`}
            recommendation={isGrowing ? "Growing demand creates opportunities to fast-track graduates into high-need sectors." : "Monitor for sustained decline vs seasonal dip. Prepare reskilling programs if persistent."}
            severity={isGrowing ? 'success' : 'warning'}
            source="LinkedIn UAE \u2014 Monthly Aggregation"
          />
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 3. GEOGRAPHIC DEMAND                                           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={MapPin}
        title={t('الطلب الجغرافي', 'Geographic Demand')}
        subtitle={t('توزيع الوظائف عبر الإمارات', 'Job distribution across UAE emirates')}
      />

      {/* Emirate Demand Heatmap — full width, interactive */}
      <GlassCard>
        <DataStory
          title="Geographic Demand Distribution"
          method="Job posting locations from LinkedIn UAE mapped to 7 emirates. Click any emirate to filter the entire page."
          quality="scraped"
          tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies (37K)'}, {name:'dim_region', label:'UAE Emirates (7)'}]}
        >
        <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-teal" />
          {t('خريطة الطلب التفاعلية', 'Interactive Demand Map')}
          {regionFilter && <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal/10 text-teal font-medium">{regionFilter}</span>}
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
          </div>
        ) : (
          <ChartEmpty title={t('لا توجد بيانات', 'No emirate data')} />
        )}
        </DataStory>
      </GlassCard>

      {/* Emirate detail cards */}
      {dashboard?.emirate_metrics?.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {dashboard.emirate_metrics.map(em => (
            <div
              key={em.region_code}
              className={`bg-white border rounded-xl p-3 text-center cursor-pointer transition-all hover:shadow-md ${regionFilter === em.region_code ? 'border-[#007DB5] ring-2 ring-[#007DB5]/20' : 'border-gray-100'}`}
              onClick={() => setRegionFilter(regionFilter === em.region_code ? '' : em.region_code)}
            >
              <p className="text-[10px] text-text-muted font-medium">{em.emirate}</p>
              <p className="text-sm font-bold text-[#003366] tabular-nums">{formatCompact(em.demand)}</p>
              <p className="text-[9px] text-text-muted">{t('وظيفة', 'jobs')}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 4. JOB MARKET COMPOSITION                                      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={Layers}
        title={t('تركيبة سوق العمل', 'Job Market Composition')}
        subtitle={t('أنواع التوظيف ومستويات الخبرة والشركات', 'Employment types, experience levels & companies')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employment Types */}
        <GlassCard>
          <DataStory
            title="Employment Types"
            method="Employment type field from LinkedIn. Only valid categories kept."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}]}
            caveats="Original data contained LinkedIn URLs as employment types \u2014 cleaned."
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
                    <YAxis type="category" dataKey="type" tick={AXIS_TICK_SM} width={75} />
                    <Tooltip content={<ChartTooltip unit="%" />} />
                    <Bar dataKey="pct" name={t('النسبة', 'Percentage')} radius={BAR_RADIUS_H}>
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

        {/* Experience Level Donut */}
        <GlassCard>
          <DataStory
            title="Experience Level Distribution"
            method="Experience level field from LinkedIn postings. Items with <0.5% share excluded."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}]}
            caveats="LinkedIn experience levels are employer-assigned and inconsistent."
          >
          <ChartToolbar
            title={t('توزيع مستوى الخبرة', 'Experience Levels')}
            data={demand?.experience_levels as Record<string, unknown>[] | undefined}
          >
            {experiencePie.length ? (
              <div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={experiencePie}
                      dataKey="count"
                      nameKey="level"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
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
                <div className="grid grid-cols-2 gap-1.5 mt-2">
                  {experiencePie.map((e) => (
                    <div key={e.level} className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: e.fill }} />
                      <span className="text-[10px] text-text-secondary truncate">{e.level}</span>
                      <span className="text-[10px] font-bold text-primary tabular-nums ml-auto">{(e.pct ?? 0).toFixed(1)}%</span>
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

        {/* Top Companies */}
        <GlassCard>
          <DataStory
            title="Top Companies Hiring"
            method="Company name (org_name) from LinkedIn postings, counted by frequency. Top 12 shown."
            quality="scraped"
            tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}]}
          >
          <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
            <Crown className="w-4 h-4 text-gold" />
            {t('أكبر الشركات توظيفاً', 'Top Companies Hiring')}
          </h3>
          {topCompanies.length ? (
            <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
              {topCompanies.map((c, i) => (
                <motion.div
                  key={c.company}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.03 }}
                  className="relative flex items-center gap-2 py-1 group"
                >
                  <span className="text-[10px] font-bold text-text-muted w-4 text-right tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0 relative">
                    <div className="absolute inset-y-0 left-0 rounded-md opacity-10 group-hover:opacity-20 transition-opacity"
                      style={{ width: `${(c.count / maxCompanyCount) * 100}%`, backgroundColor: getSeriesColor(i % 4) }}
                    />
                    <div className="relative flex items-center justify-between px-2 py-0.5">
                      <span className="text-[11px] text-text-secondary truncate">{c.company}</span>
                      <span className="text-[11px] font-bold text-primary tabular-nums shrink-0 ml-2">{formatCompact(c.count)}</span>
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

      {/* Top Hiring Companies Bubble Cloud */}
      {(demand?.top_companies?.length ?? 0) > 0 && (
        <div className="bg-card rounded-2xl border border-border-light shadow-card p-5">
          <BubbleCloud
            title="Top Hiring Companies"
            height={380}
            nodes={(demand?.top_companies || []).slice(0, 20).map((c: any, i: number) => ({
              id: `comp-${i}`,
              label: c.company || c.name,
              value: c.count || c.postings || 1,
              category: i < 5 ? 'primary' : 'secondary',
              detail: `${c.count || 0} job postings`,
            }))}
          />
        </div>
      )}

      {/* Experience Level Insight */}
      {(() => {
        const levels = demand?.experience_levels || [];
        const entry = levels.find(l => l.level?.toLowerCase().includes('entry') || l.level?.toLowerCase().includes('junior'));
        const entryPct = entry?.pct ?? 0;
        return levels.length > 0 ? (
          <InsightPanel
            explanation="Experience level distribution reveals whether the market is open to fresh graduates or primarily seeking experienced professionals."
            insight={`Entry-level positions: ${entryPct.toFixed(1)}% of postings. ${entryPct < 15 ? 'Very few entry-level openings \u2014 graduates may struggle to find first jobs.' : entryPct > 30 ? 'Strong entry-level market \u2014 good absorption capacity for new graduates.' : 'Moderate entry-level availability.'}`}
            recommendation={entryPct < 20 ? "Low entry-level availability suggests a need for government-backed internship programs and Emiratisation incentives for first-time hiring." : "Healthy entry-level market. Focus on quality matching \u2014 ensure graduates have skills employers actually need."}
            severity={entryPct < 15 ? 'critical' : entryPct < 25 ? 'warning' : 'success'}
            source="LinkedIn Experience Level Tags"
          />
        ) : null;
      })()}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 5. OCCUPATION DEEP DIVE                                        */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={Target}
        title={t('تحليل المهن المعمق', 'Occupation Deep Dive')}
        subtitle={t('مقارنة مجموعات ISCO وتحليل المهن بالتفصيل', 'ISCO group comparison & detailed occupation analysis')}
      />

      {/* ISCO Major Group — Job Postings by Group */}
      <GlassCard>
        <DataStory
          title="ISCO Major Group — Job Postings"
          method="LinkedIn job postings aggregated at ISCO major group level. Shows demand volume per occupation group."
          quality="scraped"
          tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}, {name:'dim_occupation', label:'Occupations'}]}
          caveats="Demand from LinkedIn scraped postings."
        >
        <ChartToolbar
          title={t('مجموعات ISCO الرئيسية: حجم الوظائف', 'ISCO Major Groups: Job Postings Volume')}
          data={iscoGroups?.groups as Record<string, unknown>[] | undefined}
        >
          {iscoLoading ? (
            <SkeletonChart height={340} />
          ) : (iscoGroups?.groups || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(340, (iscoGroups?.groups?.length ?? 0) * 42)}>
              <BarChart
                data={iscoGroups.groups}
                layout="vertical"
                margin={{ left: 180, right: 30, top: 5, bottom: 5 }}
              >
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis
                  type="category"
                  dataKey="group_name"
                  tick={AXIS_TICK_SM}
                  width={175}
                  tickFormatter={(v: string) => v.length > 32 ? v.slice(0, 30) + '...' : v}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="jobs" name={t('الوظائف', 'Jobs (Demand)')} fill={COLORS.gold} radius={BAR_RADIUS_H} barSize={16}>
                  {(iscoGroups?.groups || []).map((_: any, i: number) => (
                    <Cell key={i} fill={getSeriesColor(i)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty title={t('لا توجد بيانات', 'No ISCO group data')} />
          )}
        </ChartToolbar>
        </DataStory>
      </GlassCard>

      {/* Occupation Demand Table */}
      <GlassCard>
        <DataStory
          title="Occupation Demand Breakdown"
          method="Occupation-level job postings from LinkedIn. Search by occupation name, filter by region. Sorted by demand volume."
          quality="scraped"
          tables={[{name:'vw_demand_jobs', label:'Demand Jobs'}, {name:'dim_occupation', label:'Occupations'}]}
        >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#007DB5]" />
            {t('تفاصيل طلب المهن', 'Occupation Demand Breakdown')}
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder={t('بحث عن مهنة...', 'Search occupation...')}
                value={occSearch}
                onChange={(e) => { setOccSearch(e.target.value); setOccPage(1); }}
                className="text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 w-48 focus:ring-2 focus:ring-[#007DB5]/30 focus:border-[#007DB5] outline-none"
              />
            </div>
          </div>
        </div>

        {occLoading ? (
          <SkeletonTable rows={8} cols={3} />
        ) : (occComparison?.occupations || []).length > 0 ? (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80">
                    {[
                      t('المهنة', 'Occupation'),
                      t('رمز ISCO', 'ISCO Code'),
                      t('الوظائف المطلوبة', 'Job Postings'),
                    ].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(occComparison.occupations || []).map((occ: any, i: number) => (
                    <tr
                      key={occ.occupation_id || i}
                      className={`border-t border-gray-100 hover:bg-[#007DB5]/5 transition-colors cursor-pointer ${selectedOccId === occ.occupation_id ? 'bg-[#007DB5]/10' : ''}`}
                      onClick={() => setSelectedOccId(selectedOccId === occ.occupation_id ? null : occ.occupation_id)}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {selectedOccId === occ.occupation_id ? <ChevronUp className="w-3 h-3 text-[#007DB5]" /> : <ChevronDown className="w-3 h-3 text-gray-300" />}
                          <span className="text-xs font-medium text-primary">{occ.title_en || occ.occupation}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-muted font-mono">{occ.code_isco || '\u2014'}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-[#C9A84C] tabular-nums">{formatCompact(occ.demand ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Skills drill-down for selected occupation */}
            {selectedOccId && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 p-4 bg-[#003366]/5 rounded-xl border border-[#003366]/10"
              >
                <h4 className="text-xs font-semibold text-[#003366] mb-2 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5" />
                  {t('مهارات المهنة المحددة', 'Skills for Selected Occupation')}
                </h4>
                {occSkillsLoading ? (
                  <div className="animate-pulse h-16 bg-gray-100 rounded" />
                ) : occSkills ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* ESCO Skills */}
                    <div>
                      <p className="text-[10px] text-text-muted font-medium mb-1.5">{t('مهارات ESCO', 'ESCO Skills')} ({occSkills.esco_skills?.length ?? 0})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(occSkills.esco_skills || []).slice(0, 15).map((sk: any, i: number) => (
                          <span
                            key={i}
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] ${
                              sk.relation === 'essential'
                                ? 'bg-[#003366]/10 text-[#003366] font-medium'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {sk.skill}
                          </span>
                        ))}
                        {(occSkills.esco_skills?.length ?? 0) > 15 && (
                          <span className="text-[10px] text-text-muted">+{(occSkills.esco_skills?.length ?? 0) - 15} more</span>
                        )}
                      </div>
                    </div>
                    {/* Technologies */}
                    <div>
                      <p className="text-[10px] text-text-muted font-medium mb-1.5">{t('التقنيات', 'Technologies')} ({occSkills.technologies?.length ?? 0})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(occSkills.technologies || []).slice(0, 10).map((tech: any, i: number) => (
                          <span
                            key={i}
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] ${
                              tech.hot
                                ? 'bg-[#C9A84C]/15 text-[#C9A84C] font-medium'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {tech.tool} {tech.hot ? '\u2605' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">{t('لا توجد بيانات مهارات', 'No skills data for this occupation')}</p>
                )}
              </motion.div>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-text-muted">
                {t('الصفحة', 'Page')} {occComparison.page ?? occPage} {occComparison.total_pages ? `/ ${occComparison.total_pages}` : ''}
                {occComparison.total ? ` \u2014 ${occComparison.total} ${t('مهنة', 'occupations')}` : ''}
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOccPage(Math.max(1, occPage - 1))}
                  disabled={occPage <= 1}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {[1, 2, 3].map(p => (
                  <button
                    key={p}
                    onClick={() => setOccPage(p)}
                    className={`w-7 h-7 rounded-lg text-xs font-medium ${occPage === p ? 'bg-[#003366] text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                  >
                    {p}
                  </button>
                ))}
                {(occComparison.total_pages ?? 3) > 3 && <span className="text-xs text-text-muted">...</span>}
                <button
                  onClick={() => setOccPage(occPage + 1)}
                  disabled={occComparison.total_pages ? occPage >= occComparison.total_pages : false}
                  className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <ChartEmpty title={t('لا توجد بيانات مهن', 'No occupation comparison data')} />
        )}
        </DataStory>
      </GlassCard>

      {/* Occupation Treemap — uses same DB source as ISCO bar chart above */}
      <GlassCard>
        <DataStory
          title="Occupation Distribution"
          method="ISCO major occupation groups from fact_demand_vacancies_agg (database). Same source as ISCO bar chart."
          quality="official"
          tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies'}, {name:'dim_occupation', label:'Occupations'}]}
        >
        <ChartToolbar
          title={t('توزيع المهن (مجموعات ISCO)', 'Occupation Distribution (ISCO Groups)')}
          data={(iscoGroups?.groups || []) as Record<string, unknown>[]}
        >
          {(iscoGroups?.groups || []).length ? (
            <ResponsiveContainer width="100%" height={320}>
              <Treemap
                data={(iscoGroups.groups || []).map((g: any) => ({ name: g.name || g.group_label, count: g.jobs ?? g.demand_jobs ?? 0 }))}
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

      {/* Occupation Insight */}
      {(() => {
        const occs = occComparison?.occupations || [];
        if (!occs.length) return null;
        const top = [...occs].sort((a: any, b: any) => (b.demand ?? 0) - (a.demand ?? 0)).slice(0, 3);
        const topNames = top.map((o: any) => o.title_en || o.occupation).join(', ');
        return (
          <InsightPanel
            explanation="Occupation demand breakdown shows which roles employers are actively hiring for. Higher postings count indicates stronger employer demand."
            insight={`Top demanded occupations by job postings: ${topNames}. ${occComparison?.total ? `${occComparison.total} unique occupations tracked across all Emirates.` : ''}`}
            recommendation="High-demand occupations with few graduates represent priority alignment targets for university program expansion and vocational training."
            severity="info"
            source="LinkedIn UAE Job Postings \u2014 Occupation Mapping"
          />
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 6. SKILLS DEMAND ANALYSIS                                      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={Zap}
        title={t('تحليل المهارات المطلوبة', 'Skills Demand Analysis')}
        subtitle={t('المهارات الأكثر طلباً من أصحاب العمل', 'Most demanded skills by employers')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most In-Demand Skills by Type */}
        <GlassCard>
          <DataStory
            title="Most In-Demand Skills"
            quality="official"
            method="Skills inherited from ESCO occupation-skill mappings for each job posting."
            tables={[{name:'fact_job_skills', label:'Job Skills (3M rows)'}, {name:'dim_skill', label:'ESCO Skills (21K)'}]}
          >
          <ChartToolbar
            title={t('أكثر المهارات طلباً', 'Most In-Demand Skills')}
            data={demSkills?.skills as Record<string, unknown>[] | undefined}
          >
            {(demSkills?.skills || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(400, (demSkills?.skills?.length ?? 0) * 22)}>
                <BarChart
                  layout="vertical"
                  data={(demSkills?.skills || []).slice(0, 20)}
                  margin={{ left: 150, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid {...GRID_PROPS} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <YAxis
                    type="category"
                    dataKey="skill"
                    tick={AXIS_TICK_SM}
                    width={145}
                    tickFormatter={(v: string) => v.length > 26 ? v.slice(0, 24) + '...' : v}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="job_count" name={t('عدد الوظائف', 'Job Count')} radius={BAR_RADIUS_H}>
                    {(demSkills?.skills || []).slice(0, 20).map((entry: any, i: number) => {
                      const color =
                        entry.type === 'knowledge' ? COLORS.navy :
                        entry.type === 'competence' ? COLORS.gold :
                        COLORS.teal;
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No skills data')} />
            )}
          </ChartToolbar>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: COLORS.navy }} /> {t('معرفة', 'Knowledge')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: COLORS.teal }} /> {t('مهارة', 'Skill')}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: COLORS.gold }} /> {t('كفاءة', 'Competence')}</span>
          </div>
          </DataStory>
        </GlassCard>

        {/* Skill Type Distribution Pie */}
        <GlassCard>
          <DataStory
            title="Skill Type Distribution"
            method="Aggregate job count by skill type (knowledge, skill, competence) from demanded skills data."
            quality="official"
            tables={[{name:'fact_job_skills', label:'Job Skills'}]}
          >
          <ChartToolbar
            title={t('توزيع أنواع المهارات', 'Skill Type Distribution')}
            data={skillsByType as Record<string, unknown>[]}
          >
            {skillsByType.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={240}>
                  <PieChart>
                    <Pie
                      data={skillsByType}
                      dataKey="count"
                      nameKey="type"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={3}
                      strokeWidth={2}
                      stroke="white"
                    >
                      {skillsByType.map((entry, i) => {
                        const color =
                          entry.type === 'knowledge' ? COLORS.navy :
                          entry.type === 'competence' ? COLORS.gold :
                          entry.type === 'skill' ? COLORS.teal : getSeriesColor(i);
                        return <Cell key={i} fill={color} />;
                      })}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {skillsByType.map((s, i) => {
                    const total = skillsByType.reduce((sum, x) => sum + x.count, 0);
                    const pct = total > 0 ? ((s.count / total) * 100).toFixed(1) : '0';
                    const color =
                      s.type === 'knowledge' ? COLORS.navy :
                      s.type === 'competence' ? COLORS.gold :
                      s.type === 'skill' ? COLORS.teal : getSeriesColor(i);
                    return (
                      <div key={s.type} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-primary capitalize">{s.type}</p>
                          <p className="text-[10px] text-text-muted">{formatCompact(s.count)} demand refs</p>
                        </div>
                        <span className="text-sm font-bold text-primary tabular-nums">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No type data')} />
            )}
          </ChartToolbar>
          </DataStory>
        </GlassCard>
      </div>

      <InsightPanel
        explanation="Skill demand analysis reveals which competencies employers most frequently require in job postings. These represent the current market's expected candidate profile."
        insight={demSkills?.skills?.length ? `Top demanded skill is "${demSkills.skills[0]?.skill}" appearing in ${formatCompact(demSkills.skills[0]?.job_count)} job postings. Skills are categorised by type: knowledge, skill, and competence.` : undefined}
        recommendation="Focus training programs and university curricula on the most demanded skills. Cross-reference with the Supply Dashboard to identify skill curriculum gaps."
        severity="info"
        source="ESCO Taxonomy + LinkedIn Job Postings"
      />

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 7. SALARY INTELLIGENCE                                         */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={Wallet}
        title={t('معلومات الرواتب', 'Salary Intelligence')}
        subtitle={t('مقارنة الرواتب حسب المهنة والإمارة', 'Salary benchmarks by occupation & emirate')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Salary by Emirate */}
        <GlassCard>
          <DataStory
            title="Average Median Salary by Emirate"
            method="Average of median salaries grouped by emirate from salary benchmarks data."
            quality="scraped"
            tables={[{name:'fact_salary_benchmark', label:'Salary Benchmarks'}]}
            sourceUrl="https://www.glassdoor.com/Salaries/uae-salary-SRCH_IL.0,3_IN6.htm"
          >
          <ChartToolbar
            title={t('متوسط الراتب حسب الإمارة', 'Avg Median Salary by Emirate')}
            data={salaryByEmirate as Record<string, unknown>[]}
          >
            {salaryByEmirate.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={salaryByEmirate} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="emirate" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${formatCompact(v)} AED`} />
                  <Tooltip content={<ChartTooltip unit=" AED" />} />
                  <Bar dataKey="avg_median" name={t('متوسط الراتب', 'Avg Median')} radius={BAR_RADIUS} barSize={28}>
                    {salaryByEmirate.map((_, i) => (
                      <Cell key={i} fill={getSeriesColor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No salary data')} />
            )}
          </ChartToolbar>
          </DataStory>
        </GlassCard>

        {/* Top Paying Occupations */}
        <GlassCard>
          <DataStory
            title="Top Paying Occupations"
            method="Top 10 occupations sorted by median salary from salary benchmarks."
            quality="scraped"
            tables={[{name:'fact_salary_benchmark', label:'Salary Benchmarks'}]}
          >
          <ChartToolbar
            title={t('أعلى المهن أجراً', 'Top Paying Occupations')}
            data={topPayingJobs as Record<string, unknown>[]}
          >
            {topPayingJobs.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(260, topPayingJobs.length * 32)}>
                <BarChart
                  data={topPayingJobs}
                  layout="vertical"
                  margin={{ left: 130, right: 30, top: 5, bottom: 5 }}
                >
                  <CartesianGrid {...GRID_PROPS} horizontal={false} />
                  <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${formatCompact(v)}`} />
                  <YAxis
                    type="category"
                    dataKey="job_title"
                    tick={AXIS_TICK_SM}
                    width={125}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '...' : v}
                  />
                  <Tooltip content={<ChartTooltip unit=" AED" />} />
                  <Bar dataKey="median_salary" name={t('الراتب المتوسط', 'Median Salary')} radius={BAR_RADIUS_H} barSize={14}>
                    {topPayingJobs.map((_, i) => (
                      <Cell key={i} fill={getSeriesColor(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات', 'No salary data')} />
            )}
          </ChartToolbar>
          </DataStory>
        </GlassCard>
      </div>

      {/* Full Salary Table */}
      <GlassCard>
        <DataStory
          title="Salary Benchmarks"
          method="Salary data from Glassdoor API. Min/median/max salary per occupation-emirate combination."
          quality="scraped"
          tables={[{name:'fact_salary_benchmark', label:'Salary Benchmarks (71 rows)'}]}
          caveats="Only 71 occupation-emirate combinations covered. Salaries in AED."
          sourceUrl="https://www.glassdoor.com/Salaries/uae-salary-SRCH_IL.0,3_IN6.htm"
        >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-primary">{t('جدول الرواتب التفصيلي', 'Detailed Salary Table')}</h3>
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
            <select
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
              value={salarySort}
              onChange={(e) => setSalarySort(e.target.value as any)}
            >
              <option value="median">{t('الأعلى متوسطاً', 'Highest Median')}</option>
              <option value="max">{t('الأعلى حداً أقصى', 'Highest Max')}</option>
              <option value="sample">{t('الأكثر عينة', 'Most Samples')}</option>
            </select>
          </div>
        </div>

        {salLoading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : sortedSalaries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80">
                  {[
                    t('المسمى الوظيفي', 'Job Title'),
                    t('الإمارة', 'Emirate'),
                    t('نطاق الراتب (AED)', 'Salary Range (AED)'),
                    t('العينة', 'Sample'),
                    t('الثقة', 'Confidence'),
                  ].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedSalaries.slice(0, 20).map((s, i) => {
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
                      transition={{ delay: 0.1 + i * 0.02 }}
                      className="border-t border-border-light hover:bg-surface-hover/50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-primary">{s.job_title}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-secondary">{s.emirate}</td>
                      <td className="px-4 py-2.5 min-w-[200px]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted tabular-nums w-12 text-right">{formatCompact(minSal)}</span>
                          <div className="flex-1 relative h-3 bg-surface-tertiary rounded-full">
                            <div
                              className="absolute inset-y-0 rounded-full"
                              style={{ left: '0%', right: '0%', background: `linear-gradient(90deg, ${COLORS.teal}40, ${COLORS.navy}60)` }}
                            />
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white shadow-md"
                              style={{ left: `${Math.min(Math.max(medianPct, 5), 95)}%`, backgroundColor: COLORS.gold }}
                              title={`Median: ${formatNumber(medSal)} ${s.currency ?? ''}`}
                            />
                          </div>
                          <span className="text-[10px] text-text-muted tabular-nums w-12">{formatCompact(maxSal)}</span>
                        </div>
                        <p className="text-[9px] text-text-muted text-center mt-0.5">
                          {t('المتوسط', 'Median')}: {formatNumber(medSal)} {s.currency ?? ''}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-text-secondary tabular-nums text-center">{s.sample_count}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            s.confidence === 'high'
                              ? 'bg-[#2E7D6B]/10 text-[#2E7D6B]'
                              : s.confidence === 'medium'
                              ? 'bg-[#C9A84C]/10 text-[#C9A84C]'
                              : 'bg-[#6B8EB5]/10 text-[#6B8EB5]'
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
        </DataStory>
      </GlassCard>

      <InsightPanel
        explanation="Salary benchmarks help graduates set realistic expectations and help policymakers assess wage competitiveness across emirates."
        insight={salaries?.length ? `Salary data covers ${salaries.length} occupation-emirate combinations. ${salaries.some(s => (s.median_salary ?? 0) > 20000) ? 'Several roles offer median salaries above AED 20,000/month, indicating strong compensation for specialized skills.' : 'Most roles fall in moderate salary ranges.'}` : undefined}
        recommendation="Compare salary benchmarks against cost of living by emirate. Low salaries in high-cost emirates (Dubai, Abu Dhabi) may drive talent to other markets."
        severity="info"
        source="Glassdoor Salary API"
      />

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 8. FUTURE DEMAND PROJECTION                                    */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={Cpu}
        title={t('توقعات الطلب المستقبلي', 'Future Demand Projection')}
        subtitle={t('التوقعات بناءً على الاتجاهات الحالية وتأثير الذكاء الاصطناعي', 'Projections based on current trends & AI impact')}
      />

      {/* Projection Drill-Down Filters */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Search className="w-4 h-4" />
            {t('فلاتر التوقعات المتقدمة', 'Projection Drill-Down Filters')}
          </h3>
          {hasDemProjFilters && (
            <button onClick={() => { setDemProjRegion(''); setDemProjIsco(''); setDemProjSector(''); setDemProjExp(''); }}
              className="text-[10px] text-red-500 hover:underline font-medium">{t('مسح', 'Clear')}</button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('الإمارة', 'Region')}</label>
            <select value={demProjRegion} onChange={e => setDemProjRegion(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
              <option value="">{t('الكل', 'All Emirates')}</option>
              {regionOptions.map((r: any) => <option key={r.value || r.region_code} value={r.value || r.region_code}>{r.label || r.emirate}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('مجموعة ISCO', 'ISCO Group')}</label>
            <select value={demProjIsco} onChange={e => setDemProjIsco(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
              <option value="">{t('الكل', 'All Groups')}</option>
              {[{v:'1',l:'Managers'},{v:'2',l:'Professionals'},{v:'3',l:'Technicians'},{v:'4',l:'Clerical'},{v:'5',l:'Service & Sales'},{v:'7',l:'Craft & Trade'},{v:'8',l:'Machine Operators'},{v:'9',l:'Elementary'}].map(g => <option key={g.v} value={g.v}>{g.v} — {g.l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('القطاع', 'Sector')}</label>
            <select value={demProjSector} onChange={e => setDemProjSector(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
              <option value="">{t('الكل', 'All Sectors')}</option>
              {(demand?.top_industries ?? []).slice(0, 15).map((ind: any) => <option key={ind.industry} value={ind.industry}>{ind.industry}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('مستوى الخبرة', 'Experience')}</label>
            <select value={demProjExp} onChange={e => setDemProjExp(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
              <option value="">{t('الكل', 'All Levels')}</option>
              {['Entry level', 'Associate', 'Mid-Senior level', 'Director', 'Executive'].map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
        {hasDemProjFilters && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {demProjRegion && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-teal/8 text-teal font-medium">{demProjRegion} <button onClick={() => setDemProjRegion('')}><X className="w-2.5 h-2.5" /></button></span>}
            {demProjIsco && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-navy/8 text-navy font-medium">ISCO {demProjIsco} <button onClick={() => setDemProjIsco('')}><X className="w-2.5 h-2.5" /></button></span>}
            {demProjSector && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-amber-100 text-amber-800 font-medium">{demProjSector.slice(0,20)} <button onClick={() => setDemProjSector('')}><X className="w-2.5 h-2.5" /></button></span>}
            {demProjExp && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-emerald/8 text-emerald-700 font-medium">{demProjExp} <button onClick={() => setDemProjExp('')}><X className="w-2.5 h-2.5" /></button></span>}
          </div>
        )}
      </GlassCard>

      {/* External Research Factors */}
      {(demExtLoading || demExtResearch) && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-amber-600" />
            <h4 className="text-sm font-bold text-amber-900">{t('عوامل خارجية — بحث الويب', 'External Factors — Web Research')}</h4>
            {demExtLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />}
          </div>
          {demExtResearch && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-lg font-bold tabular-nums ${(demExtResearch.market_signal_pct ?? 0) > 0 ? 'text-emerald-600' : (demExtResearch.market_signal_pct ?? 0) < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                  {(demExtResearch.market_signal_pct ?? 0) > 0 ? '+' : ''}{demExtResearch.market_signal_pct ?? 0}%
                </span>
                <span className="text-xs text-gray-500">{t('إشارة السوق الموصى بها', 'Recommended signal')} ({demExtResearch.confidence})</span>
              </div>
              {demExtResearch.rationale && <p className="text-[11px] text-gray-700 bg-amber-50 rounded-lg p-2">{demExtResearch.rationale}</p>}
              {(demExtResearch.factors || []).slice(0, 4).map((f: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-[10px]">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${f.impact === 'positive' ? 'bg-emerald-500' : f.impact === 'negative' ? 'bg-red-500' : 'bg-gray-300'}`} />
                  <div>
                    <span className="font-semibold text-gray-800">{f.title}</span>
                    <span className="text-gray-500 ml-1">{f.summary?.slice(0, 120)}</span>
                    {f.source_url && <a href={f.source_url} target="_blank" rel="noopener" className="ml-1 text-amber-700 hover:underline">[source]</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <DataStory
          title="Future Demand Projection"
          method="Projected demand based on historical trend extrapolation. AI displacement and new AI job creation factors applied. External factors from web research adjust the forecast."
          quality="model-generated"
          tables={[{name:'vw_forecast_demand', label:'Forecast Demand'}, {name:'vw_ai_impact', label:'AI Impact'}]}
          caveats="Projections are model-generated estimates, not predictions. Based on current trends which may change."
        >
        <ChartToolbar
          title={t('توقعات الطلب المستقبلي', 'Future Demand Projection')}
          data={futureProj?.projections as Record<string, unknown>[] | undefined}
        >
          {futureLoading ? (
            <SkeletonChart height={340} />
          ) : (futureProj?.projections || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={futureProj.projections} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="futureGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.navy} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="projected_demand"
                  name={t('الطلب المتوقع', 'Projected Demand')}
                  stroke={COLORS.navy}
                  fill="url(#futureGrad)"
                  strokeWidth={2}
                />
                {futureProj.projections[0]?.ai_displacement != null && (
                  <Line
                    type="monotone"
                    dataKey="ai_displacement"
                    name={t('إزاحة الذكاء الاصطناعي', 'AI Displacement')}
                    stroke={COLORS.gold}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                )}
                {futureProj.projections[0]?.new_ai_jobs != null && (
                  <Line
                    type="monotone"
                    dataKey="new_ai_jobs"
                    name={t('وظائف جديدة بالذكاء الاصطناعي', 'New AI Jobs')}
                    stroke={COLORS.emerald}
                    strokeWidth={2}
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty title={t('لا توجد بيانات', 'No projection data')} />
          )}
        </ChartToolbar>

        {/* Methodology Panel */}
        {futureProj?.methodology && (
          <div className="mt-4 p-4 bg-[#003366]/5 rounded-xl border border-[#003366]/10">
            <h4 className="text-xs font-semibold text-[#003366] mb-2 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              {t('منهجية التوقعات', 'Projection Methodology')}
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              {typeof futureProj.methodology === 'string'
                ? futureProj.methodology
                : JSON.stringify(futureProj.methodology)}
            </p>
          </div>
        )}

        {/* Projection summary cards */}
        {futureProj?.summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {[
              { label: t('الطلب الحالي', 'Current Demand'), value: futureProj.summary.current_demand, color: COLORS.navy },
              { label: t('الطلب المتوقع', 'Projected Demand'), value: futureProj.summary.projected_demand, color: COLORS.teal },
              { label: t('معدل النمو', 'Growth Rate'), value: futureProj.summary.growth_rate, color: COLORS.gold, pct: true },
              { label: t('تأثير الذكاء الاصطناعي', 'AI Displacement'), value: futureProj.summary.ai_displacement_pct, color: COLORS.emerald, pct: true },
            ].filter(item => item.value != null).map(item => (
              <div key={item.label} className="bg-white border border-gray-100 rounded-xl p-3 text-center">
                <p className="text-[10px] text-text-muted mb-0.5">{item.label}</p>
                <p className="text-lg font-bold tabular-nums" style={{ color: item.color }}>
                  {item.pct ? `${Number(item.value).toFixed(1)}%` : formatCompact(Number(item.value))}
                </p>
              </div>
            ))}
          </div>
        )}
        </DataStory>
      </GlassCard>

      <InsightPanel
        explanation="Future projections combine historical demand trends with AI automation impact estimates to forecast labour market evolution."
        insight={futureProj?.summary ? `Projected demand growth of ${Number(futureProj.summary.growth_rate ?? 0).toFixed(1)}%. AI may displace ~${Number(futureProj.summary.ai_displacement_pct ?? 0).toFixed(1)}% of current roles while creating new AI-adjacent positions.` : 'Projection data is being computed.'}
        recommendation="Use projections for strategic planning, not precise targets. Focus on building adaptive workforce capabilities rather than fixed headcount targets."
        severity="info"
        source="Trend Extrapolation + AIOE Impact Model"
      />

      {/* Skills Network — Knowledge Graph */}
      <DataStory
        title="Skills Gap Map — Occupation-Skill Taxonomy"
        method="Top occupations by demand from LinkedIn UAE job postings. Skills from ESCO taxonomy (essential relations only, specificity ≤15 occupations). Gap = demanded but NOT taught in UAE universities. Matched = both demanded and taught."
        quality="official+research"
        tables={[{name:'fact_occupation_skills', label:'ESCO Skills (322K)'}, {name:'fact_course_skills', label:'Course-Skill Links'}, {name:'fact_demand_vacancies_agg', label:'Job Postings (37K)'}]}
        caveats="Only shows top 20 occupations by demand with 5 most specific skills each. Use search to find specific occupations."
      >
      {(skillNetGraph?.nodes?.length ?? 0) > 0 && (
        <GlassCard>
          <ForceGraph
            title={t('خريطة فجوة المهارات — المهن ومهاراتها', 'Skills Gap Map — Occupations & Essential Skills')}
            nodes={skillNetGraph!.nodes}
            edges={skillNetGraph!.edges}
            height={500}
          />
          <div className="flex flex-wrap gap-4 mt-3 px-2 text-[10px] border-t border-gray-100 pt-3">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#F43F5E]" /> {t('فجوة — مطلوبة ولكن غير مُدرَّسة', 'Skill Gap — demanded but NOT taught')}</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#10B981]" /> {t('مغطاة — مطلوبة ومُدرَّسة', 'Matched — demanded AND taught')}</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#1E3A5F]" /> {t('مهنة محورية', 'Occupation (sized by demand)')}</span>
          </div>
        </GlassCard>
      )}
      </DataStory>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* 9. DATA QUALITY & SOURCES                                      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <SectionHeader
        icon={Database}
        title={t('جودة البيانات والمصادر', 'Data Quality & Sources')}
        subtitle={t('شفافية المصادر ومقاييس الجودة', 'Source transparency & quality metrics')}
      />

      <GlassCard>
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
            { name: 'Glassdoor Salaries', color: 'bg-teal-50 text-teal-700 border-teal-200' },
            { name: 'Bayanat Employment', color: 'bg-sky-50 text-sky-700 border-sky-200' },
            { name: 'AIOE Automation Index', color: 'bg-violet-50 text-violet-700 border-violet-200' },
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

        {/* Data quality metrics */}
        {demand?.data_quality && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
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
                label: t('تاريخ مفقود', 'Missing Date'),
                value: `${(demand.data_quality.missing_date_pct ?? 0).toFixed(1)}%`,
                good: (demand.data_quality.missing_date_pct ?? 0) < 5,
              },
              {
                label: t('سجلات مكررة', 'Duplicate IDs'),
                value: formatCompact(demand.data_quality.duplicate_ids ?? 0),
                good: (demand.data_quality.duplicate_ids ?? 0) < 100,
              },
            ].map(q => (
              <div
                key={q.label}
                className="bg-surface-tertiary/50 rounded-lg px-3 py-2.5 text-center"
              >
                <p className="text-[10px] text-text-muted mb-0.5">{q.label}</p>
                <p className={`text-sm font-bold tabular-nums ${q.good ? 'text-[#2E7D6B]' : 'text-[#C9A84C]'}`}>
                  {q.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Dashboard meta info */}
        {dashboard?.meta && (
          <div className="mt-4 p-3 bg-gray-50/80 rounded-xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {dashboard.meta.total_rows != null && (
                <div>
                  <p className="text-text-muted">{t('إجمالي الصفوف', 'Total Rows')}</p>
                  <p className="font-bold text-primary">{formatCompact(dashboard.meta.total_rows)}</p>
                </div>
              )}
              {dashboard.meta.quality_score != null && (
                <div>
                  <p className="text-text-muted">{t('درجة الجودة', 'Quality Score')}</p>
                  <p className="font-bold text-primary">{(dashboard.meta.quality_score * 100).toFixed(0)}%</p>
                </div>
              )}
              {dashboard.meta.refreshed_at && (
                <div>
                  <p className="text-text-muted">{t('آخر تحديث', 'Last Refreshed')}</p>
                  <p className="font-bold text-primary">{dashboard.meta.refreshed_at.slice(0, 10)}</p>
                </div>
              )}
              {dashboard.meta.coverage && (
                <div>
                  <p className="text-text-muted">{t('تغطية الإمارات', 'Emirate Coverage')}</p>
                  <p className="font-bold text-primary">{dashboard.meta.coverage.emirates}/{dashboard.meta.coverage.total}</p>
                </div>
              )}
            </div>
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
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-[#003366] font-semibold mb-2">Demand Side rendering error</h3>
          <pre className="text-xs text-[#1A3F5C] whitespace-pre-wrap break-all">{err?.message}{'\n'}{err?.stack?.split('\n').slice(1,4).join('\n')}</pre>
        </div>
      </div>
    );
  }
};

export default DemandSidePage;
