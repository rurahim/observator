import { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFilters } from '@/contexts/FilterContext';
import { useSupplyDashboard, useSupplyDataExplorer, useSuppliedSkills } from '@/api/hooks';
import { api } from '@/api/client';
import { usePageLoading } from '@/hooks/usePageLoading';
import { SkeletonChart, SkeletonTable, SkeletonKPICard } from '@/components/shared/Skeletons';
import { ErrorState } from '@/components/shared/EmptyState';
import PageHeader from '@/components/shared/PageHeader';
import KPICard from '@/components/shared/KPICard';
import ChartTooltip from '@/components/charts/ChartTooltip';
import { COLORS, GRID_PROPS, AXIS_TICK_SM, BAR_RADIUS, BAR_RADIUS_H } from '@/utils/chartColors';
import DataStory from '@/components/shared/DataStory';
import InsightPanel from '@/components/shared/InsightPanel';
import { formatCompact } from '@/utils/formatters';
import {
  Building2, BookOpen, Users, GraduationCap, ExternalLink, Database,
  BarChart3, Table2, MessageSquare, Send, Loader2, X, FlaskConical, Globe,
  UserCheck, School, TrendingUp,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const srcStyle = (s: string) => {
  if (s.includes('bayanat')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s.includes('web_scrape') || s.includes('scrape')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s.includes('estimated') || s.includes('Estimated')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s.includes('caa')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (s.includes('ceic') || s.includes('CEIC')) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
};

const SourceBadge = ({ source, onClick }: { source: string; onClick?: () => void }) => (
  <button onClick={onClick}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border hover:shadow-sm cursor-pointer ${srcStyle(source)}`}>
    <Database className="w-2.5 h-2.5" />{source.replace(/_/g, ' ')}{onClick && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
  </button>
);

const PIE = [COLORS.navy, COLORS.teal, COLORS.gold, COLORS.emerald, COLORS.coral, COLORS.copper, COLORS.slate, '#8B5CF6', '#06B6D4', '#F59E0B'];
type Tab = 'overview' | 'explorer';

const ChartCard = ({ title, source, onSourceClick, delay = 0, className = '', children }: {
  title: string; source?: string; onSourceClick?: () => void; delay?: number; className?: string; children: React.ReactNode;
}) => (
  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className={`bg-card rounded-xl border border-border-light shadow-card p-4 ${className}`}>
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold text-primary">{title}</h3>
      {source && <SourceBadge source={source} onClick={onSourceClick} />}
    </div>
    {children}
  </motion.div>
);

const StatRow = ({ label, value, color, pct }: { label: string; value: string; color: string; pct?: number }) => (
  <div className="flex items-center gap-3 py-1.5">
    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
    <span className="text-xs text-text-secondary flex-1">{label}</span>
    <span className="text-xs font-semibold text-primary tabular-nums">{value}</span>
    {pct != null && <span className="text-[10px] text-text-muted w-10 text-right">{pct.toFixed(0)}%</span>}
  </div>
);

/* ══════════════════════════════════════════════════════════════ */
const SupplyDashboardPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(400);
  const { filters } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'overview');
  const [explorerSource, setExplorerSource] = useState<string | undefined>(searchParams.get('source') ?? undefined);

  const apiParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (filters.emirate !== 'all') p.emirate = filters.emirate;
    return p;
  }, [filters.emirate]);

  const { data, isLoading, error } = useSupplyDashboard(apiParams);

  const goToExplorer = (source?: string) => {
    setExplorerSource(source); setActiveTab('explorer');
    setSearchParams({ tab: 'explorer', ...(source ? { source } : {}) });
  };

  useEffect(() => {
    const t = searchParams.get('tab') as Tab;
    if (t && t !== activeTab) setActiveTab(t);
    const s = searchParams.get('source');
    if (s) setExplorerSource(s);
  }, [searchParams]);

  if (loading || isLoading) return (
    <div className="space-y-4">
      <div><div className="h-7 w-72 mb-2 animate-pulse bg-surface-tertiary rounded" /></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0,1,2,3].map(i => <SkeletonKPICard key={i} />)}</div>
      <SkeletonChart height={300} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><SkeletonChart height={260} /><SkeletonChart height={260} /></div>
    </div>
  );

  if (error) return (
    <div className="space-y-4">
      <PageHeader title={t('لوحة العرض التعليمي', 'Supply / Education Dashboard')} />
      <ErrorState message="Failed to load supply dashboard data" onRetry={() => window.location.reload()} />
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={t('لوحة العرض التعليمي', 'Supply / Education Dashboard')}
        subtitle={t('التعليم العالي والخريجين ومواءمة القوى العاملة', 'Higher education, graduates & workforce alignment')} />

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-surface-secondary rounded-xl p-1 shadow-sm">
        {([
          { key: 'overview' as Tab, icon: BarChart3, label: t('نظرة عامة', 'Overview') },
          { key: 'explorer' as Tab, icon: Table2, label: t('مستكشف البيانات', 'Data Explorer') },
        ]).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSearchParams({ tab: tab.key }); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.key ? 'bg-card text-primary shadow-md border border-border-light' : 'text-text-muted hover:text-primary hover:bg-card/50'
            }`}><tab.icon className="w-4 h-4" />{tab.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4"><OverviewTab data={data} goToExplorer={goToExplorer} /></motion.div>}
        {activeTab === 'explorer' && <motion.div key="ex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><DataExplorerTab initialSource={explorerSource} /></motion.div>}
      </AnimatePresence>

      {/* Floating AI Chat Widget — always visible on Overview */}
      <FloatingChat />
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════ */
/*  OVERVIEW                                                      */
/* ══════════════════════════════════════════════════════════════ */
const OverviewTab = ({ data, goToExplorer }: { data: any; goToExplorer: (s?: string) => void }) => {
  const { t } = useLanguage();
  const { data: supSkills } = useSuppliedSkills({ limit: 20 });
  if (!data) return null;
  const k = data.kpis;
  const enrollTrend = data.enrollment_trend ?? [];
  const gradTrend = data.graduate_trend ?? [];

  // Prep enrollment trend: actual vs estimated
  const trendCombined = enrollTrend.map((d: any) => ({
    year: d.year, actual: d.is_estimated ? null : d.enrollment, estimated: d.is_estimated ? d.enrollment : null,
  }));

  // Sector trend: pivot to {year, government, private}
  const sectorMap: Record<number, any> = {};
  (data.sector_trend ?? []).forEach((d: any) => {
    if (!sectorMap[d.year]) sectorMap[d.year] = { year: d.year };
    sectorMap[d.year][d.sector] = d.enrollment;
  });
  const sectorTrend = Object.values(sectorMap).sort((a: any, b: any) => a.year - b.year);

  // Gender totals for enrollment
  const gM = data.by_gender?.M ?? 0; const gF = data.by_gender?.F ?? 0; const gT = gM + gF;
  // Nationality
  const nCit = data.by_nationality?.citizen ?? 0; const nExp = data.by_nationality?.expat ?? 0; const nT = nCit + nExp;
  // Graduate gender
  const ggM = data.grad_gender?.M ?? 0; const ggF = data.grad_gender?.F ?? 0; const ggT = ggM + ggF;
  // Graduate nationality
  const gnCit = data.grad_nationality?.citizen ?? 0; const gnExp = data.grad_nationality?.expat ?? 0;

  return (<>
    {/* ── KPIs ── */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KPICard icon={Building2} label={t('المؤسسات', 'Institutions')} value={fmt(k?.total_institutions ?? 0)} status="info" delay={0} sourceLabel="CAA Registry" dataStatus="official" />
      <KPICard icon={BookOpen} label={t('البرامج المعتمدة', 'Accredited Programs')} value={fmt(k?.total_programs ?? 0)} status="info" delay={0.05} sourceLabel="CAA Scrape (95 institutions)" dataStatus="official" />
      <KPICard icon={Users} label={t('إجمالي المسجلين', 'Total Enrolled')} value={fmt(k?.total_enrolled ?? 0)} status="success" delay={0.1}
        sparkData={enrollTrend.map((d: any) => d.enrollment)} sourceLabel="Bayanat / CEIC / MOHESR" dataStatus="experimental" />
      <KPICard icon={GraduationCap} label={t('إجمالي الخريجين', 'Total Graduates')} value={fmt(k?.total_graduates ?? 0)} status="success" delay={0.15}
        sparkData={gradTrend.map((d: any) => d.graduates)} sourceLabel="Bayanat / UAEU" />
    </div>

    {/* ── Section: ENROLLMENT ── */}
    <div className="flex items-center gap-2 mt-2">
      <School className="w-4 h-4 text-navy" />
      <h2 className="text-base font-bold text-primary">{t('بيانات التسجيل', 'Enrollment Data')}</h2>
      <div className="flex-1 h-px bg-border-light" />
    </div>

    {/* Enrollment Trend (full width) */}
    <ChartCard title={t('اتجاه التسجيل السنوي', 'Annual Enrollment Trend')} source="bayanat + CEIC" onSourceClick={() => goToExplorer('bayanat')} delay={0.2}>
      <div className="flex items-center gap-3 mb-1">
        <span className="flex items-center gap-1.5 text-[10px] text-text-muted"><span className="w-5 h-0.5 bg-navy rounded" />Actual</span>
        <span className="flex items-center gap-1.5 text-[10px] text-text-muted"><span className="w-5 h-0.5 border-b-2 border-dashed border-amber-500" />Estimated</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={trendCombined}>
          <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="year" tick={AXIS_TICK_SM} /><YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} />
          <Tooltip content={<ChartTooltip />} />
          <Area type="monotone" dataKey="actual" stroke={COLORS.navy} fill={COLORS.navy} fillOpacity={0.1} strokeWidth={2.5} connectNulls={false} dot={{ r: 4 }} />
          <Area type="monotone" dataKey="estimated" stroke="#D97706" fill="#D97706" fillOpacity={0.05} strokeWidth={2} strokeDasharray="6 4" connectNulls={false} dot={{ r: 3, strokeDasharray: '' }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>

    {/* Gov vs Private Trend */}
    {sectorTrend.length > 0 && (
      <ChartCard title={t('حكومي مقابل خاص', 'Government vs Private Enrollment')} source="bayanat" onSourceClick={() => goToExplorer('bayanat_emirate_sector')} delay={0.25}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={sectorTrend}>
            <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="year" tick={AXIS_TICK_SM} /><YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} />
            <Tooltip content={<ChartTooltip />} /><Legend />
            <Area type="monotone" dataKey="government" stackId="1" stroke={COLORS.teal} fill={COLORS.teal} fillOpacity={0.3} name={t('حكومي', 'Government')} />
            <Area type="monotone" dataKey="private" stackId="1" stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={0.3} name={t('خاص', 'Private')} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    )}

    {/* 3-col: Emirate + Specialty + Demographics */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title={t('حسب الإمارة', 'By Emirate')} source="bayanat" onSourceClick={() => goToExplorer('bayanat_emirate_sector')} delay={0.3}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.by_emirate ?? []} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={fmt} />
            <YAxis type="category" dataKey="emirate" tick={AXIS_TICK_SM} width={85} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="enrollment" fill={COLORS.teal} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('حسب التخصص', 'Top Specializations')} source="bayanat" onSourceClick={() => goToExplorer('bayanat_gov_specialty')} delay={0.35}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={(data.by_specialty ?? []).slice(0, 8)} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={fmt} />
            <YAxis type="category" dataKey="specialization" tick={{ ...AXIS_TICK_SM, width: 100 }} width={100} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="enrollment" fill={COLORS.gold} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Demographics Breakdown */}
      <ChartCard title={t('التركيبة السكانية', 'Demographics')} source="bayanat" delay={0.4}>
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">{t('الجنس', 'Gender')}</p>
            <StatRow label={t('إناث', 'Female')} value={fmt(gF)} color={COLORS.coral} pct={gT > 0 ? gF/gT*100 : 0} />
            <StatRow label={t('ذكور', 'Male')} value={fmt(gM)} color={COLORS.navy} pct={gT > 0 ? gM/gT*100 : 0} />
            <div className="w-full h-2 rounded-full bg-gray-100 mt-1 overflow-hidden flex">
              <div className="h-full bg-coral" style={{ width: `${gT > 0 ? gF/gT*100 : 50}%` }} />
              <div className="h-full bg-navy" style={{ width: `${gT > 0 ? gM/gT*100 : 50}%` }} />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">{t('الجنسية', 'Nationality')}</p>
            <StatRow label={t('مواطنين', 'Citizens')} value={fmt(nCit)} color={COLORS.emerald} pct={nT > 0 ? nCit/nT*100 : 0} />
            <StatRow label={t('وافدين', 'Expats')} value={fmt(nExp)} color={COLORS.copper} pct={nT > 0 ? nExp/nT*100 : 0} />
            <div className="w-full h-2 rounded-full bg-gray-100 mt-1 overflow-hidden flex">
              <div className="h-full" style={{ width: `${nT > 0 ? nCit/nT*100 : 50}%`, backgroundColor: COLORS.emerald }} />
              <div className="h-full" style={{ width: `${nT > 0 ? nExp/nT*100 : 50}%`, backgroundColor: COLORS.copper }} />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">{t('القطاع', 'Sector')}</p>
            <StatRow label={t('حكومي', 'Government')} value={fmt(data.by_gender?.gov ?? 0)} color={COLORS.teal} />
            <StatRow label={t('خاص', 'Private')} value={fmt(data.by_gender?.priv ?? 0)} color={COLORS.gold} />
          </div>
        </div>
      </ChartCard>
    </div>

    {/* ── Section: GRADUATES ── */}
    <div className="flex items-center gap-2 mt-2">
      <GraduationCap className="w-4 h-4 text-navy" />
      <h2 className="text-base font-bold text-primary">{t('بيانات الخريجين', 'Graduate Data')}</h2>
      <div className="flex-1 h-px bg-border-light" />
    </div>

    {/* 2-col: Graduate trend + grad by specialty */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title={t('اتجاه التخرج', 'Graduate Output Trend')} source="bayanat" onSourceClick={() => goToExplorer('bayanat_gov_graduates')} delay={0.45}>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={gradTrend}>
            <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="year" tick={AXIS_TICK_SM} /><YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} />
            <Tooltip content={<ChartTooltip />} />
            <Area type="monotone" dataKey="graduates" stroke={COLORS.emerald} fill={COLORS.emerald} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('الخريجين حسب التخصص', 'Graduates by Specialty')} source="bayanat" delay={0.5}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={(data.grad_by_specialty ?? []).slice(0, 8)} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={fmt} />
            <YAxis type="category" dataKey="specialization" tick={{ ...AXIS_TICK_SM, width: 110 }} width={110} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="graduates" fill={COLORS.emerald} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>

    {/* 3-col: Gender + Nationality + STEM */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <ChartCard title={t('جنس الخريجين', 'Graduate Gender')} source="bayanat" delay={0.55}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart><Pie data={[{ name: 'Female', value: ggF }, { name: 'Male', value: ggM }]}
            cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value"
            label={({ name, percent }: any) => `${name} ${(percent*100).toFixed(0)}%`}>
            <Cell fill={COLORS.coral} /><Cell fill={COLORS.navy} />
          </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
        </ResponsiveContainer>
        <div className="text-center text-[10px] text-text-muted mt-1">
          {ggT > 0 && `${(ggF/ggT*100).toFixed(0)}% Female — ${fmt(ggT)} total`}
        </div>
      </ChartCard>

      <ChartCard title={t('جنسية الخريجين', 'Graduate Nationality')} source="bayanat" delay={0.6}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart><Pie data={[{ name: 'Citizens', value: gnCit }, { name: 'Expats', value: gnExp }]}
            cx="50%" cy="50%" outerRadius={70} innerRadius={35} dataKey="value"
            label={({ name, percent }: any) => `${name} ${(percent*100).toFixed(0)}%`}>
            <Cell fill={COLORS.emerald} /><Cell fill={COLORS.copper} />
          </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('STEM مقابل غير STEM', 'STEM vs Non-STEM')} source="bayanat" delay={0.65}>
        <ResponsiveContainer width="100%" height={180}>
          <PieChart><Pie data={data.stem_split ?? []} cx="50%" cy="50%" outerRadius={70} innerRadius={35}
            dataKey="count" nameKey="indicator"
            label={({ indicator, percent }: any) => `${indicator} ${(percent*100).toFixed(0)}%`}>
            {(data.stem_split ?? []).map((_: any, i: number) => <Cell key={i} fill={i === 0 ? COLORS.navy : COLORS.gold} />)}
          </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>

    {/* UAEU Colleges (if data exists) */}
    {(data.uaeu_colleges?.length ?? 0) > 0 && (
      <ChartCard title={t('خريجو جامعة الإمارات حسب الكلية', 'UAEU Graduates by College (Actual Counts)')} source="bayanat_uaeu" onSourceClick={() => goToExplorer('bayanat_uaeu')} delay={0.7}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.uaeu_colleges}>
            <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="college" tick={AXIS_TICK_SM} angle={-20} textAnchor="end" height={70} />
            <YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="graduates" fill={COLORS.navy} radius={BAR_RADIUS} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    )}

    {/* ── Section: PROGRAMS ── */}
    <div className="flex items-center gap-2 mt-2">
      <BookOpen className="w-4 h-4 text-navy" />
      <h2 className="text-base font-bold text-primary">{t('البرامج الأكاديمية', 'Academic Programs')}</h2>
      <div className="flex-1 h-px bg-border-light" />
    </div>

    {/* 3-col: By field, by emirate, by degree */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <ChartCard title={t('حسب المجال', 'Programs by Field')} source="caa_accredited" onSourceClick={() => goToExplorer('caa_accredited')} delay={0.75}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={(data.programs_by_field ?? []).slice(0, 10)} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} />
            <YAxis type="category" dataKey="field" tick={{ ...AXIS_TICK_SM, width: 110 }} width={110} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" fill={COLORS.navy} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('حسب الإمارة', 'Programs by Emirate')} source="caa_accredited" delay={0.8}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={(data.programs_by_emirate ?? []).slice(0, 7)} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} />
            <YAxis type="category" dataKey="emirate" tick={AXIS_TICK_SM} width={85} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="count" fill={COLORS.teal} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('حسب المستوى', 'By Degree Level')} source="caa_accredited" delay={0.85}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart><Pie data={(data.program_distribution ?? []).slice(0, 7)} cx="50%" cy="50%" outerRadius={90} innerRadius={45}
            dataKey="count" nameKey="degree_level"
            label={({ degree_level, percent }: any) => `${degree_level} ${(percent*100).toFixed(0)}%`}>
            {(data.program_distribution ?? []).slice(0, 7).map((_: any, i: number) => <Cell key={i} fill={PIE[i]} />)}
          </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>

    {/* ── Section: SKILLS ── */}
    <div className="flex items-center gap-2 mt-2">
      <FlaskConical className="w-4 h-4 text-navy" />
      <h2 className="text-base font-bold text-primary">{t('المهارات', 'Skills & Competencies')}</h2>
      <div className="flex-1 h-px bg-border-light" />
      {data.skills_kpis && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-navy/10 text-navy font-medium">{fmt(data.skills_kpis.total_skills)} skills</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">{fmt(data.skills_kpis.total_mappings)} mappings</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">{fmt(data.skills_kpis.essential_mappings)} essential</span>
        </div>
      )}
    </div>

    {/* 2-col: Top Skills + Knowledge Areas */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title={t('أكثر المهارات طلبا', 'Top In-Demand Skills (Essential)')} source="ESCO" delay={0.9}>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={(data.top_skills ?? []).slice(0, 12)} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} label={{ value: 'Occupations requiring this skill', position: 'insideBottom', offset: -5, style: { fontSize: 9, fill: '#718096' } }} />
            <YAxis type="category" dataKey="skill" tick={{ ...AXIS_TICK_SM, width: 160 }} width={160} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="occupations" fill={COLORS.navy} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('أهم مجالات المعرفة', 'Top Knowledge Areas (Essential)')} source="ESCO" delay={0.95}>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={(data.knowledge_areas ?? []).slice(0, 12)} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} />
            <YAxis type="category" dataKey="area" tick={{ ...AXIS_TICK_SM, width: 160 }} width={160} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="occupations" fill={COLORS.emerald} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>

    {/* 2-col: Digital Skills + Skill Type Distribution */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title={t('المهارات الرقمية المطلوبة', 'Digital & Tech Skills Demand')} source="ESCO" delay={1.0}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={(data.digital_skills ?? []).slice(0, 10)} layout="vertical">
            <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} />
            <YAxis type="category" dataKey="skill" tick={{ ...AXIS_TICK_SM, width: 150 }} width={150} /><Tooltip content={<ChartTooltip />} />
            <Bar dataKey="occupations" fill={COLORS.teal} radius={BAR_RADIUS_H} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('توزيع أنواع المهارات', 'Skills by Type (ESCO Taxonomy)')} source="ESCO" delay={1.05}>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart><Pie data={(data.skills_by_type ?? []).filter((d: any) => d.type)} cx="50%" cy="50%" outerRadius={100} innerRadius={50}
            dataKey="count" nameKey="type"
            label={({ type, percent }: any) => `${type} ${(percent*100).toFixed(0)}%`}>
            {(data.skills_by_type ?? []).filter((d: any) => d.type).map((_: any, i: number) => <Cell key={i} fill={PIE[i]} />)}
          </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>

    {/* ── Section: INSTITUTIONS ── */}
    <div className="flex items-center gap-2 mt-2">
      <Building2 className="w-4 h-4 text-navy" />
      <h2 className="text-base font-bold text-primary">{t('المؤسسات', 'Institutions')}</h2>
      <div className="flex-1 h-px bg-border-light" />
    </div>

    {/* Institution Table */}
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
      className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary">{t('ترتيب المؤسسات', 'Institution Ranking')}</h3>
        <SourceBadge source="CAA + Bayanat" onClick={() => goToExplorer()} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-surface-secondary text-text-muted text-xs">
            <th className="px-4 py-2 text-left">#</th><th className="px-4 py-2 text-left">{t('المؤسسة', 'Institution')}</th>
            <th className="px-4 py-2 text-left">{t('الإمارة', 'Emirate')}</th><th className="px-4 py-2 text-left">{t('القطاع', 'Sector')}</th>
            <th className="px-4 py-2 text-right">{t('البرامج', 'Programs')}</th><th className="px-4 py-2 text-right">{t('الخريجين', 'Graduates')}</th>
          </tr></thead>
          <tbody>{(data.institution_ranking ?? []).map((inst: any, i: number) => (
            <tr key={i} className="border-t border-border-light hover:bg-surface-secondary/50 transition-colors">
              <td className="px-4 py-2.5 text-text-muted text-xs">{i + 1}</td>
              <td className="px-4 py-2.5 font-medium text-primary text-xs">{inst.institution}</td>
              <td className="px-4 py-2.5 text-text-secondary text-xs">{inst.emirate || '—'}</td>
              <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${
                inst.sector?.toLowerCase().includes('private') ? 'bg-purple-50 text-purple-700'
                : inst.sector?.toLowerCase().includes('government') ? 'bg-teal-50 text-teal-700'
                : 'bg-gray-50 text-gray-600'}`}>{inst.sector || '—'}</span></td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium text-xs">{inst.programs}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-xs">{inst.graduates > 0 ? fmt(inst.graduates) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </motion.div>

    {/* ── Section: SKILLS PRODUCED BY EDUCATION ── */}
    {(supSkills?.skills?.length ?? 0) > 0 && (<>
      <div className="flex items-center gap-2 mt-2">
        <BookOpen className="w-4 h-4 text-navy" />
        <h2 className="text-base font-bold text-primary">{t('المهارات التي ينتجها التعليم', 'Skills Produced by Education')}</h2>
        <div className="flex-1 h-px bg-border-light" />
      </div>

      <DataStory
        title={t('المهارات التي ينتجها التعليم', 'Skills Produced by Education')}
        quality="official+scraped"
        method="6,176 CAA courses mapped to ESCO skills via token matching. Each course name tokenized and matched against 21K ESCO skill labels. Top 5 matches per course with ≥30% token overlap."
        tables={[
          { name: 'fact_course_skills', label: 'Course-Skill Maps (10.8K)' },
          { name: 'dim_skill', label: 'ESCO Skills' },
        ]}
      >
        <ChartCard title={t('المهارات التي ينتجها التعليم', 'Skills Produced by Education')} source="CAA + ESCO" delay={1.1}>
          <ResponsiveContainer width="100%" height={Math.max(360, (supSkills?.skills?.length ?? 10) * 22)}>
            <BarChart data={[...(supSkills?.skills ?? [])].sort((a: any, b: any) => b.course_count - a.course_count)} layout="vertical">
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={AXIS_TICK_SM} label={{ value: t('عدد المقررات', 'Courses teaching this skill'), position: 'insideBottom', offset: -5, style: { fontSize: 9, fill: '#718096' } }} />
              <YAxis type="category" dataKey="skill" tick={{ ...AXIS_TICK_SM, width: 180 }} width={180} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="course_count" fill={COLORS.teal} radius={BAR_RADIUS_H} name={t('عدد المقررات', 'Course Count')} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </DataStory>

      <InsightPanel
        explanation={t(
          'هذه المهارات مرتبطة من 6,176 مقررًا معتمدًا من هيئة الاعتماد الأكاديمي إلى تصنيف ESCO للمهارات عبر مطابقة الأسماء الآلية.',
          'These skills are mapped from 6,176 CAA-accredited courses to ESCO skill taxonomy via automated name matching.'
        )}
        insight={supSkills?.skills ? t(
          `${formatCompact(supSkills.skills.length)} مهارة فريدة تغطيها ${formatCompact(supSkills.skills.reduce((s: number, r: any) => s + (r?.course_count ?? 0), 0))} مقررًا`,
          `${formatCompact(supSkills.skills.length)} unique skills covered by ${formatCompact(supSkills.skills.reduce((s: number, r: any) => s + (r?.course_count ?? 0), 0))} courses`
        ) : undefined}
        recommendation={t(
          'قارن هذه القائمة مع "المهارات الأكثر طلبًا" في جانب الطلب لتحديد الفجوات في المناهج.',
          'Compare this list with the Demand Side\'s "Most In-Demand Skills" to identify curriculum gaps.'
        )}
        severity="info"
        source="CAA + ESCO"
      />
    </>)}

    {/* Data Sources */}
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95 }}
      className="bg-card rounded-xl border border-border-light shadow-card p-4">
      <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
        <Database className="w-4 h-4" />{t('مصادر البيانات', 'Data Sources')}<span className="text-[10px] text-text-muted font-normal ml-2">{t('انقر للاستكشاف', 'Click to explore')}</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {(data.sources ?? []).map((s: any, i: number) => (
          <button key={i} onClick={() => goToExplorer(s.source)}
            className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-all text-left group border border-transparent hover:border-border-light hover:shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${s.source.includes('estimated') || s.source.includes('Estimated') ? 'bg-amber-400' : s.source.includes('bayanat') ? 'bg-emerald-400' : s.source.includes('caa') ? 'bg-indigo-400' : 'bg-blue-400'}`} />
              <div><span className="text-xs font-medium text-primary">{s.source.replace(/_/g, ' ')}</span><span className="text-[10px] text-text-muted block capitalize">{s.category}</span></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-text-muted">{fmt(s.rows)}</span>
              <ExternalLink className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  </>);
};

/* ══════════════════════════════════════════════════════════════ */
/*  DATA EXPLORER                                                */
/* ══════════════════════════════════════════════════════════════ */
const DataExplorerTab = ({ initialSource }: { initialSource?: string }) => {
  const { t } = useLanguage();
  const [table, setTable] = useState('enrollment');
  const [source, setSource] = useState<string | undefined>(initialSource);
  const [page, setPage] = useState(0);
  const { data, isLoading } = useSupplyDataExplorer({ table, source, limit: 50, offset: page * 50 });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 bg-card rounded-xl border border-border-light shadow-card p-4">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-text-muted" />
          <select value={table} onChange={e => { setTable(e.target.value); setPage(0); }}
            className="text-sm bg-surface-secondary border border-border-light rounded-lg px-3 py-1.5 text-primary font-medium">
            <option value="enrollment">Enrollment</option><option value="graduates">Graduates</option>
            <option value="programs">Programs</option><option value="institutions">Institutions</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-text-muted" />
          <select value={source ?? ''} onChange={e => { setSource(e.target.value || undefined); setPage(0); }}
            className="text-sm bg-surface-secondary border border-border-light rounded-lg px-3 py-1.5 text-primary">
            <option value="">All Sources</option>
            {(data?.available_sources ?? []).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        {source && <button onClick={() => setSource(undefined)} className="text-xs text-text-muted hover:text-primary flex items-center gap-1"><X className="w-3 h-3" />Clear</button>}
        <div className="flex-1" />
        <span className="text-[10px] px-2 py-1 rounded-full bg-navy/10 text-navy font-medium">{data?.db_table}</span>
        <span className="text-xs tabular-nums text-text-muted font-medium">{fmt(data?.total ?? 0)} records</span>
      </div>
      <div className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
        {isLoading ? <SkeletonTable rows={10} cols={6} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-surface-secondary">
                {(data?.columns ?? []).map(col => <th key={col} className="px-3 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap uppercase tracking-wider text-[10px]">{col}</th>)}
              </tr></thead>
              <tbody>{(data?.rows ?? []).map((row, i) => (
                <tr key={i} className="border-t border-border-light hover:bg-blue-50/30 transition-colors">
                  {(data?.columns ?? []).map(col => {
                    const v = row[col]; const isSrc = col === 'source'; const isEst = col === 'is_estimated' && v === true;
                    return <td key={col} className={`px-3 py-2 whitespace-nowrap ${isEst ? 'text-amber-600' : 'text-text-secondary'}`}>
                      {isSrc && v ? <SourceBadge source={String(v)} /> : isEst ? <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]">Est.</span>
                        : v === true ? <span className="text-emerald-600">Yes</span> : v === false ? <span className="text-text-muted">No</span>
                        : v == null ? <span className="text-text-muted/50">--</span> : String(v)}
                    </td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(data?.total ?? 0) > 50 && (
          <div className="flex items-center justify-between px-4 py-3 bg-surface-secondary border-t border-border-light">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-xs font-medium text-primary disabled:text-text-muted px-4 py-1.5 rounded-lg hover:bg-card">Previous</button>
            <span className="text-xs text-text-muted tabular-nums">{page * 50 + 1}-{Math.min((page + 1) * 50, data?.total ?? 0)} of {fmt(data?.total ?? 0)}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= (data?.total ?? 0)} className="text-xs font-medium text-primary disabled:text-text-muted px-4 py-1.5 rounded-lg hover:bg-card">Next</button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════ */
/*  FLOATING AI CHAT — pinned bottom-right, collapsible          */
/* ══════════════════════════════════════════════════════════════ */
interface ChatMsg { role: 'user' | 'assistant'; content: string }

const FloatingChat = () => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', content: t(
      'مرحبا! اسألني عن بيانات التعليم العالي في الإمارات وسأعدل العرض مباشرة.',
      'Hi! Ask me anything about UAE education data. Try:\n- "Students in Abu Dhabi"\n- "Top specializations"\n- "STEM vs Non-STEM"'
    )}
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const q = input.trim(); setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]); setLoading(true);
    try {
      const res = await api.post<any>('/chat', { message: q, context: 'supply_education_dashboard' });
      setMessages(prev => [...prev, { role: 'assistant', content: res?.response || res?.message || res?.answer || JSON.stringify(res) }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err?.message || 'Unknown'}. Try rephrasing.` }]);
    } finally { setLoading(false); inputRef.current?.focus(); }
  };

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-navy text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              <X className="w-5 h-5" />
            </motion.div>
          ) : (
            <motion.div key="msg" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="relative">
              <MessageSquare className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-navy animate-pulse" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Chat Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-24 right-6 z-50 w-[400px] max-w-[calc(100vw-48px)] bg-card rounded-2xl border border-border-light shadow-2xl overflow-hidden flex flex-col"
            style={{ height: 480, maxHeight: 'calc(100vh - 160px)' }}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-navy to-navy/90 text-white flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold">{t('المساعد الذكي', 'AI Data Assistant')}</h3>
                <p className="text-[10px] text-white/70">NL2SQL — {t('اسأل وعدل العرض مباشرة', 'Ask & update view live')}</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-navy text-white rounded-br-sm'
                      : 'bg-surface-secondary text-primary rounded-bl-sm border border-border-light'
                  }`}>
                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-surface-secondary rounded-2xl rounded-bl-sm px-3 py-2.5 border border-border-light">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-navy" />
                      <span className="text-[11px] text-text-muted">{t('جاري التحليل...', 'Analyzing...')}</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick Suggestions */}
            <div className="px-3 py-1.5 border-t border-border-light bg-surface-secondary/50 shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {[
                  t('طلاب أبوظبي', 'Abu Dhabi students'),
                  t('أفضل التخصصات', 'Top specializations'),
                  t('STEM مقابل غير STEM', 'STEM vs Non-STEM'),
                  t('ذكور مقابل إناث', 'Male vs Female'),
                ].map(q => (
                  <button key={q} onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-card border border-border-light text-text-muted hover:text-primary hover:border-navy/30 transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border-light bg-card shrink-0">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && send()}
                  placeholder={t('اسأل عن البيانات...', 'Ask about the data...')}
                  className="flex-1 bg-surface-secondary border border-border-light rounded-xl px-3 py-2 text-sm text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40"
                  disabled={loading}
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="bg-navy hover:bg-navy/90 disabled:bg-navy/30 text-white p-2 rounded-xl transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SupplyDashboardPage;
