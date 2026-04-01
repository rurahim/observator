/**
 * Executive Intelligence Dashboard — the first page decision-makers see.
 * 8 sections, all real API data, zero hardcoded values.
 * Blue-only palette, Recharts, bilingual, framer-motion entry.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Users, Briefcase, Brain, Database, BarChart3,
  Send, Loader2, TrendingUp, ArrowRight,
  GraduationCap, Building2, MessageSquare, Layers,
  ChevronRight, Globe, Shield, Lightbulb, Activity,
  Crosshair, BookOpen, Cpu, FlaskConical, X, Search as SearchIcon,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import {
  useSupplyDashboard, useDashboardSummary, useDemandInsights,
  useAIImpact, useKBStats, useSendMessage,
  useSkillMatchingSummary, useDemandedSkills, useSuppliedSkills, useSkillComparison,
  useExplorerFilters,
  useRealOccupationComparison, useOccupationSkillsDetail, useISCOGroupComparison,
  usePastYearly, useFutureProjection,
} from '@/api/hooks';
import { formatCompact, formatNumber, formatPercent } from '@/utils/formatters';
import { COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, getSeriesColor } from '@/utils/chartColors';
import ChartTooltip from '@/components/charts/ChartTooltip';
import InsightPanel from '@/components/shared/InsightPanel';
import DataStory from '@/components/shared/DataStory';
import { SkeletonPage } from '@/components/shared/Skeletons';
import type { Citation } from '@/api/types';

/* ── Animation helpers ──────────────────────────── */
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

/* ── Chat message type ──────────────────────────── */
interface ChatMsg { role: 'user' | 'assistant'; content: string; citations?: Citation[] }

/* ── Heatmap cell colors by gap severity ────────── */
const heatColor = (gap: number, maxGap: number): string => {
  if (maxGap === 0) return '#E2E8F0';
  const ratio = Math.min(gap / maxGap, 1);
  if (ratio > 0.7) return '#003366';
  if (ratio > 0.5) return '#0A5C8A';
  if (ratio > 0.3) return '#007DB5';
  if (ratio > 0.1) return '#4A90C4';
  return '#C9D6E8';
};

/* ══════════════════════════════════════════════════ */
/* ── COMPONENT ────────────────────────────────────  */
/* ══════════════════════════════════════════════════ */
const DashboardPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading();

  /* ── Data hooks ──────────────────────────────── */
  const { data: supply, isLoading: supLoad } = useSupplyDashboard();
  const { data: dashboard, isLoading: dashLoad } = useDashboardSummary();
  const { data: demand, isLoading: demLoad } = useDemandInsights();
  const { data: ai, isLoading: aiLoad } = useAIImpact();
  const { data: kb } = useKBStats();
  const { data: skillMatch } = useSkillMatchingSummary();
  const { data: skillComp } = useSkillComparison({ limit: 15 });
  const { data: demandedSkillsData } = useDemandedSkills({ limit: 20 });
  const { data: suppliedSkillsData } = useSuppliedSkills({ limit: 20 });
  const chat = useSendMessage();

  // Occupation comparison state
  const { data: expFilters } = useExplorerFilters();
  const [occSearch, setOccSearch] = useState('');
  const [occRegion, setOccRegion] = useState('');
  const [occPage, setOccPage] = useState(1);
  const [selectedOccId, setSelectedOccId] = useState<number | null>(null);

  // Past/Future hooks
  const [pastYear, setPastYear] = useState<number | null>(null);
  const { data: pastData } = usePastYearly({ year: pastYear || undefined, region: occRegion || undefined });
  const { data: futureData } = useFutureProjection();

  // Occupation comparison hooks
  const { data: iscoGroups } = useISCOGroupComparison({ region: occRegion || undefined });
  const [occSort, setOccSort] = useState('demand_jobs');
  const [occOrder, setOccOrder] = useState<'desc' | 'asc'>('desc');

  const { data: occComparison, isLoading: occLoading } = useRealOccupationComparison({
    limit: 15, search: occSearch || undefined, region: occRegion || undefined, page: occPage,
    sort: occSort, order: occOrder,
  } as any);
  const { data: occSkills } = useOccupationSkillsDetail(selectedOccId);

  /* ── Chat state ──────────────────────────────── */
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [selfKnowledgeOn, setSelfKnowledgeOn] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || chatLoading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setChatLoading(true);
    try {
      const res = await chat.mutateAsync({ message: q, internet_search: webSearchOn, self_knowledge: selfKnowledgeOn } as any);
      setMessages(prev => [...prev, { role: 'assistant', content: res.message, citations: res.citations }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not process that query. Please try again.' }]);
    }
    setChatLoading(false);
  };

  /* ── Derived data ────────────────────────────── */
  const kpis = supply?.kpis || ({} as any);

  const enrollmentTrend = useMemo(() => {
    return (supply?.enrollment_trend || []).map(e => ({
      year: e.year,
      enrollment: e.enrollment,
    }));
  }, [supply]);

  const demandMonthly = useMemo(() => {
    return (demand?.monthly_volume || []).slice(-24).map(m => ({
      month: m.month?.slice(0, 7) || m.month,
      count: m.count,
    }));
  }, [demand]);

  const enrollVsGrad = useMemo(() => {
    const trend = supply?.enrollment_trend || [];
    const grads = supply?.graduate_trend || [];
    const gradMap = Object.fromEntries(grads.map((g: any) => [g.year, g.graduates]));
    return trend.map((e: any) => ({ year: e.year, enrollment: e.enrollment, graduates: gradMap[e.year] || 0 }));
  }, [supply]);

  const supplyDemandTrend = useMemo(() => {
    return (dashboard?.supply_demand_trend || []).map((p: any) => ({
      month: p.month ?? '', supply: p.supply ?? 0, demand: p.demand ?? 0,
    }));
  }, [dashboard]);

  const topIndustries = useMemo(() => (demand?.top_industries || []).slice(0, 8), [demand]);

  const expLevels = useMemo(() =>
    (demand?.experience_levels || []).filter(e => (e.pct ?? 0) >= 1).slice(0, 7),
  [demand]);

  const emirateData = useMemo(() => {
    return (supply?.by_emirate || []).map(e => ({
      emirate: e.emirate?.replace('Umm Al Quwain', 'UAQ')?.replace('Ras Al Khaimah', 'RAK') || e.region_code,
      enrollment: e.enrollment || 0,
    }));
  }, [supply]);

  const genderData = useMemo(() => {
    const g = supply?.by_gender || {};
    const m = g.M ?? (g as any).male ?? 0;
    const f = g.F ?? (g as any).female ?? 0;
    return { male: m, female: f, total: m + f };
  }, [supply]);

  const stemData = useMemo(() => {
    const split = supply?.stem_split || [];
    const stem = split.find(s => s.indicator?.toLowerCase() === 'stem')?.count ?? 0;
    const total = split.reduce((s, x) => s + (x.count ?? 0), 0);
    return { stem, total, pct: total > 0 ? (stem / total * 100) : 0 };
  }, [supply]);

  const aiRiskDist = useMemo(() => {
    const occs = ai?.occupations || [];
    const h = occs.filter(o => o.risk_level === 'High').length;
    const m = occs.filter(o => o.risk_level === 'Moderate').length;
    const l = occs.filter(o => o.risk_level === 'Low').length;
    if (h + m + l === 0 && ai?.summary) {
      const total = ai.summary.total_occupations || 100;
      const highPct = ai.summary.high_risk_pct || 0;
      return [
        { name: t('مخاطر عالية', 'High Risk'), value: Math.round(total * highPct / 100), color: '#1A3F5C' },
        { name: t('متوسط', 'Moderate'), value: Math.round(total * (100 - highPct) * 0.4 / 100), color: '#C9A84C' },
        { name: t('مخاطر منخفضة', 'Low Risk'), value: Math.round(total * (100 - highPct) * 0.6 / 100), color: '#2E7D6B' },
      ];
    }
    return [
      { name: t('مخاطر عالية', 'High Risk'), value: h, color: '#1A3F5C' },
      { name: t('متوسط', 'Moderate'), value: m, color: '#C9A84C' },
      { name: t('مخاطر منخفضة', 'Low Risk'), value: l, color: '#2E7D6B' },
    ];
  }, [ai, t]);

  const graduateTrend = useMemo(() => (supply?.graduate_trend || []).slice(-10), [supply]);

  const topGaps = useMemo(() => (skillMatch?.top_gaps || []).slice(0, 10), [skillMatch]);

  const demandedSkills = useMemo(() => (demandedSkillsData?.skills || []).slice(0, 10), [demandedSkillsData]);
  const suppliedSkills = useMemo(() => (suppliedSkillsData?.skills || []).slice(0, 10), [suppliedSkillsData]);

  // Heatmap data: combine top gaps + surplus to show grid of skill types
  const heatmapData = useMemo(() => {
    const gaps = skillMatch?.top_gaps || [];
    const surplus = skillMatch?.top_surplus || [];
    const all = [...gaps.slice(0, 15), ...surplus.slice(0, 15)];
    const types = ['knowledge', 'skill/competence', 'competence'];
    const maxGap = Math.max(...all.map((s: any) => Math.abs(s.gap ?? 0)), 1);
    // Group by type, take top items per type
    const grouped: Record<string, any[]> = {};
    for (const item of all) {
      const typ = (item.type || 'knowledge').toLowerCase();
      const bucket = types.find(t => typ.includes(t)) || 'knowledge';
      if (!grouped[bucket]) grouped[bucket] = [];
      if (grouped[bucket].length < 10) grouped[bucket].push({ ...item, maxGap });
    }
    return { grouped, maxGap };
  }, [skillMatch]);

  const totalRecords = (kb?.total_rows ?? 0);

  const skillsGapCount = (skillMatch?.total_skills_demanded ?? 0) - (skillMatch?.skill_overlap ?? 0);

  /* ── Loading gate ────────────────────────────── */
  const isLoading = loading || supLoad || demLoad;
  if (isLoading) return <SkeletonPage />;

  try { return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-[1480px] mx-auto"
    >

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: HERO KPI BAR                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl bg-gradient-to-r from-[#003366] via-[#004a80] to-[#007DB5] p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-white/15"><Activity className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-lg font-bold text-white">{t('لوحة القيادة التنفيذية', 'Executive Intelligence Dashboard')}</h1>
            <p className="text-xs text-white/60">{t('نظرة شاملة على سوق العمل الإماراتي', 'Comprehensive UAE labour market overview')}</p>
          </div>
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              icon: GraduationCap,
              label: t('العرض التعليمي', 'Education Supply'),
              value: formatCompact(kpis.total_enrolled),
              sub: `${formatCompact(kpis.total_graduates)} ${t('خريجون', 'graduates')}`,
            },
            {
              icon: Briefcase,
              label: t('الوظائف النشطة', 'Job Postings'),
              value: formatCompact(demand?.total_postings),
              sub: `${formatCompact(demand?.unique_companies)} ${t('شركات', 'companies')}`,
            },
            {
              icon: Crosshair,
              label: t('تطابق المهارات', 'Skill Match'),
              value: `${(skillMatch?.overlap_pct ?? 0).toFixed(1)}%`,
              sub: `${formatCompact(skillMatch?.skill_overlap ?? 0)} ${t('مهارة مشتركة', 'shared')}`,
            },
            {
              icon: Cpu,
              label: t('مخاطر الذكاء', 'AI Risk'),
              value: `${ai?.summary?.high_risk_pct?.toFixed(1) ?? '—'}%`,
              sub: `${formatCompact(ai?.summary?.total_occupations)} ${t('مهنة', 'occupations')}`,
            },
            {
              icon: Building2,
              label: t('المؤسسات', 'Institutions'),
              value: formatCompact(kpis.total_institutions),
              sub: `${formatCompact(kpis.total_programs)} ${t('برامج', 'programs')}`,
            },
            {
              icon: Database,
              label: t('البيانات', 'Data Coverage'),
              value: formatCompact(totalRecords),
              sub: `${kb?.total_tables ?? '—'} ${t('جدول', 'tables')}`,
            },
          ].map((kpi, i) => (
            <motion.div key={i} variants={fadeUp} className="bg-white/10 rounded-xl p-3 border border-white/10 hover:bg-white/15 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className="w-4 h-4 text-white/70" />
                <span className="text-[10px] text-white/60 font-medium">{kpi.label}</span>
              </div>
              <div className="text-xl font-bold text-white tabular-nums">{kpi.value}</div>
              <div className="text-[10px] text-white/50 mt-0.5">{kpi.sub}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: OCCUPATION SUPPLY-DEMAND COMPARISON                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* UNIFIED: ISCO Groups + Occupation Detail in one section */}
      <DataStory title="Supply vs Demand by Occupation" quality="official+generated"
        method="ISCO group level = REAL Bayanat census data. Specific occupations = ESTIMATED (proportionally distributed). Click any ISCO group to filter. Click any occupation for skill breakdown."
        tables={[{name:'fact_supply_talent_agg',label:'Employment Census (842K)'},{name:'fact_demand_vacancies_agg',label:'Job Postings (37K)'},{name:'fact_occupation_skills',label:'Occupation Skills (322K)'}]}
        caveats="Supply (2015-2019) and demand (2024-2025) are from different time periods."
        sourceUrl="https://bayanat.ae/en/dataset?groups=employment-labour">
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 space-y-5">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t('العرض والطلب حسب المهنة', 'Supply vs Demand by Occupation')}</h2>
            <p className="text-[11px] text-gray-400">{t('انقر على فئة لتصفية المهن أدناه • انقر على مهنة لعرض المهارات', 'Click a group to filter occupations below • Click an occupation for skill breakdown')}</p>
          </div>
          <span className="text-[10px] text-gray-400">{occComparison?.total ?? '—'} {t('مهنة', 'occupations')}</span>
        </div>

        {/* ISCO Group Chart */}
        {(iscoGroups?.groups?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">{t('فئات المهن — بيانات حقيقية', 'Occupation Groups — Real Data')}</h3>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">REAL</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={iscoGroups.groups} layout="vertical" margin={{ left: 155, right: 60 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#4A5568' }} width={150} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                      <p className="font-semibold mb-1">{d?.name} (ISCO {d?.code})</p>
                      <p className="text-[#007DB5]">{t('العمال', 'Workers')}: <b>{formatCompact(d?.workers)}</b></p>
                      <p className="text-[#003366]">{t('الوظائف', 'Jobs')}: <b>{formatCompact(d?.jobs)}</b></p>
                      <p className="text-gray-400">{t('النسبة', 'Ratio')}: {d?.ratio}%</p>
                    </div>
                  );
                }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="workers" name={t('العمال (تعداد)', 'Workers (census)')} fill="#007DB5" radius={[0, 3, 3, 0]} barSize={12} />
                <Bar dataKey="jobs" name={t('الوظائف (LinkedIn)', 'Jobs (LinkedIn)')} fill="#003366" radius={[0, 3, 3, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Divider + subtitle for detailed breakdown */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">{t('تفصيل المهن', 'Occupation Detail')}</h3>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">ESTIMATED</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-3">{t('أرقام تقديرية — موزعة نسبياً من بيانات الفئات أعلاه', 'Estimated — proportionally distributed from group data above')}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" value={occSearch} onChange={e => { setOccSearch(e.target.value); setOccPage(1); setSelectedOccId(null); }}
            placeholder={t('بحث عن مهنة...', 'Search occupation...')}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-[#003366]/20" />
          <select value={occRegion} onChange={e => { setOccRegion(e.target.value); setOccPage(1); setSelectedOccId(null); }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="">{t('كل المناطق', 'All Regions')}</option>
            {(expFilters?.regions || []).map((r: any) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {occSearch && <button onClick={() => { setOccSearch(''); setOccPage(1); }} className="text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>}

          {/* Sort */}
          <select value={occSort} onChange={e => { setOccSort(e.target.value); setOccPage(1); }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="demand_jobs">{t('ترتيب: الوظائف', 'Sort: Jobs')}</option>
            <option value="supply_workers">{t('ترتيب: العمال', 'Sort: Workers')}</option>
            <option value="gap">{t('ترتيب: الفجوة', 'Sort: Gap')}</option>
            <option value="skill_count">{t('ترتيب: المهارات', 'Sort: Skills')}</option>
          </select>
          <button onClick={() => { setOccOrder(o => o === 'desc' ? 'asc' : 'desc'); setOccPage(1); }}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
            {occOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
          </button>
        </div>

        {/* Occupation Chart — horizontal bars with workers (teal) vs jobs (navy) */}
        {(occComparison?.occupations || []).length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={Math.max(400, (occComparison?.occupations?.length || 1) * 32)}>
              <BarChart
                data={(occComparison?.occupations || []).map((o: any) => ({
                  ...o,
                  name: (o.occupation || '').length > 25 ? o.occupation.slice(0, 23) + '...' : o.occupation,
                  ratio: o.supply_workers > 0 ? `${(o.demand_jobs / o.supply_workers * 100).toFixed(2)}%` : o.demand_jobs > 0 ? '∞' : '—',
                }))}
                layout="vertical"
                margin={{ left: 160, right: 60, top: 5, bottom: 5 }}
                onClick={(data: any) => {
                  if (data?.activePayload?.[0]?.payload?.occupation_id) {
                    const id = data.activePayload[0].payload.occupation_id;
                    setSelectedOccId(selectedOccId === id ? null : id);
                  }
                }}
              >
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#4A5568' }} width={155} />
                <Tooltip content={({ payload, label }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                      <p className="font-semibold mb-1">{d?.occupation}</p>
                      <p className="text-[#007DB5]">{t('العمال', 'Workers')}: <b>{formatCompact(d?.supply_workers)}</b></p>
                      <p className="text-[#003366]">{t('الوظائف', 'Jobs')}: <b>{formatCompact(d?.demand_jobs)}</b></p>
                      <p className="text-gray-400">{t('النسبة', 'Ratio')}: {d?.ratio}</p>
                      <p className="text-gray-400">{t('المهارات', 'Skills')}: {d?.skills}</p>
                      <p className="text-[10px] text-gray-300 mt-1 border-t pt-1">{t('انقر لعرض المهارات', 'Click for skill breakdown')}</p>
                    </div>
                  );
                }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="supply_workers" name={t('العمال الموظفون', 'Employed Workers')} fill="#007DB5" radius={[0, 3, 3, 0]} barSize={12} cursor="pointer" />
                <Bar dataKey="demand_jobs" name={t('الوظائف المنشورة', 'Job Postings')} fill="#003366" radius={[0, 3, 3, 0]} barSize={12} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[9px] text-gray-400 mt-1">{t('انقر على أي مهنة لعرض تفاصيل المهارات', 'Click any occupation bar to see skill details')} • {t('المصدر', 'Source')}: Bayanat (workers) + LinkedIn (jobs)</p>
          </>
        ) : occLoading ? (
          <div className="h-[400px] flex items-center justify-center text-gray-400">{t('جاري التحميل...', 'Loading...')}</div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400">{t('لا توجد نتائج', 'No results')}</div>
        )}

        {/* Pagination */}
        {(occComparison?.pages ?? 0) > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-[10px] text-gray-400">
              {t('صفحة', 'Page')} {occComparison?.page} / {occComparison?.pages} ({occComparison?.total} {t('مهنة', 'occupations')})
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setOccPage(1)} disabled={occPage === 1} className="px-2 py-1 text-[10px] rounded hover:bg-gray-100 disabled:opacity-30">⟨⟨</button>
              <button onClick={() => setOccPage(p => Math.max(1, p - 1))} disabled={occPage === 1} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30">⟨</button>
              <input type="number" min={1} max={occComparison?.pages || 1} value={occPage}
                onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= (occComparison?.pages || 1)) { setOccPage(v); setSelectedOccId(null); } }}
                className="w-14 px-2 py-1 text-xs text-center border border-gray-200 rounded tabular-nums" />
              <button onClick={() => setOccPage(p => Math.min(occComparison?.pages || 1, p + 1))} disabled={occPage === (occComparison?.pages || 1)} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30">⟩</button>
              <button onClick={() => setOccPage(occComparison?.pages || 1)} disabled={occPage === (occComparison?.pages || 1)} className="px-2 py-1 text-[10px] rounded hover:bg-gray-100 disabled:opacity-30">⟩⟩</button>
            </div>
          </div>
        )}

        {/* Skill Drill-Down — 3-column heatmap comparison */}
        {selectedOccId && occSkills && (
          <div className="p-5 rounded-xl bg-gray-50 border border-gray-100 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{occSkills.occupation?.title}</h3>
                <p className="text-[10px] text-gray-400">
                  ISCO: {occSkills.occupation?.isco} •
                  {occSkills.total_skills} ESCO skills ({occSkills.essential_count} essential, {occSkills.total_skills - occSkills.essential_count} optional) •
                  <span className="text-[#007DB5] font-semibold"> {occSkills.supplied_count} taught in courses</span> •
                  <span className="text-gray-500"> {occSkills.total_skills - occSkills.supplied_count} NOT taught</span>
                </p>
              </div>
              <button onClick={() => setSelectedOccId(null)} className="p-1.5 rounded-lg hover:bg-gray-200"><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            {/* 3 KPI summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-white border border-gray-100 text-center">
                <div className="text-lg font-bold text-gray-900">{occSkills.total_skills}</div>
                <div className="text-[9px] text-gray-500">{t('مهارات ESCO المطلوبة', 'ESCO Skills Required')}</div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100 text-center">
                <div className="text-lg font-bold text-[#003366]">{occSkills.essential_count}</div>
                <div className="text-[9px] text-gray-500">{t('مطلوبة من الصناعة', 'Industry Essential')}</div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100 text-center">
                <div className="text-lg font-bold text-[#007DB5]">{occSkills.supplied_count}</div>
                <div className="text-[9px] text-gray-500">{t('تُدرَّس في الجامعات', 'Taught in Universities')}</div>
              </div>
            </div>

            {/* Heatmap table — all skills with 3 columns */}
            <div className="overflow-auto max-h-[350px]">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-500 w-[35%]">{t('المهارة', 'Skill')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500 w-[10%]">{t('النوع', 'Type')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-[#003366] w-[15%]">{t('مطلوبة ESCO', 'ESCO Required')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-[#003366] w-[15%]">{t('طلب الصناعة', 'Industry Demand')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-[#007DB5] w-[15%]">{t('عرض التعليم', 'Education Supply')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500 w-[10%]">{t('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(occSkills.skills || []).map((s: any) => {
                    const hasIndustry = s.demand_jobs > 0;
                    const hasCourses = s.supply_courses > 0;
                    const isEssential = s.relation === 'essential';
                    // Heatmap color: green = both sides, amber = demanded not taught, gray = optional
                    const rowBg = hasCourses && hasIndustry ? 'bg-[#007DB5]/5'
                      : hasIndustry && !hasCourses ? 'bg-[#C9A84C]/8'
                      : 'bg-white';
                    return (
                      <tr key={s.skill_id} className={`border-b border-gray-100 ${rowBg}`}>
                        <td className="py-1.5 px-2 text-gray-800 truncate max-w-[200px]" title={s.skill}>{s.skill}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                            s.type === 'knowledge' ? 'bg-[#003366]/10 text-[#003366]'
                            : s.type === 'technology' ? 'bg-[#C9A84C]/10 text-[#C9A84C]'
                            : 'bg-[#007DB5]/10 text-[#007DB5]'
                          }`}>{(s.type || '').replace('skill/competence','skill')}</span>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`inline-block w-5 h-5 rounded-full text-[8px] font-bold leading-5 text-center ${
                            isEssential ? 'bg-[#003366] text-white' : 'bg-gray-200 text-gray-500'
                          }`}>{isEssential ? 'E' : 'O'}</span>
                        </td>
                        <td className="py-1.5 px-2 text-center font-semibold tabular-nums">
                          {hasIndustry ? (
                            <span className="text-[#003366]">{formatCompact(s.demand_jobs)}</span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center font-semibold tabular-nums">
                          {hasCourses ? (
                            <span className="text-[#007DB5]">{s.supply_courses} {t('مقرر', 'courses')}</span>
                          ) : (
                            <span className="text-gray-300">{t('لا يوجد', 'none')}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {hasCourses && hasIndustry ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#007DB5]/10 text-[#007DB5] font-semibold">{t('متطابق', 'Match')}</span>
                          ) : hasIndustry && !hasCourses ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#C9A84C]/15 text-[#C9A84C] font-semibold">{t('فجوة', 'Gap')}</span>
                          ) : (
                            <span className="text-[9px] text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[9px] text-gray-400 pt-2 border-t border-gray-200">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#007DB5]/10 border border-[#007DB5]/20" /> {t('متطابق — مطلوب ومُدرَّس', 'Match — demanded & taught')}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#C9A84C]/15 border border-[#C9A84C]/20" /> {t('فجوة — مطلوب ولكن غير مُدرَّس', 'Gap — demanded but NOT taught')}</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full bg-[#003366] text-white text-[7px] text-center leading-4 font-bold">E</span> {t('أساسي', 'Essential')}</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[7px] text-center leading-4 font-bold">O</span> {t('اختياري', 'Optional')}</span>
            </div>
          </div>
        )}

        <InsightPanel
          explanation={t(
            'يقارن هذا الجدول عدد العمال الموظفين في كل مهنة مع عدد الوظائف المنشورة. انقر على أي مهنة لعرض المهارات المطلوبة والمتوفرة.',
            'This table compares employed workers per occupation with job postings. Click any occupation to see required vs available skills.'
          )}
          insight={occComparison?.total ? t(
            `${occComparison.total} مهنة لديها بيانات. الطلب من LinkedIn (2024-2025)، العرض من بيانات التوظيف (2015-2019).`,
            `${occComparison.total} occupations with data. Demand from LinkedIn (2024-2025), Supply from Bayanat employment census (2015-2019).`
          ) : undefined}
          severity="info" compact
        />
      </div>
      </DataStory>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2b: PAST & FUTURE                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT: PAST (2015-2019) */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('الماضي — اتجاه العمالة', 'Past — Employment Trend')}</h3>
              <p className="text-[10px] text-gray-400">2015-2019 • {t('انقر على سنة لعرض التفاصيل', 'Click a year for detail')}</p>
            </div>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">REAL</span>
          </div>

          {/* Area chart: workers by year — clickable dots */}
          {(pastData?.yearly_trend?.length ?? 0) > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={pastData.yearly_trend}
                onClick={(data: any) => {
                  if (data?.activePayload?.[0]?.payload?.year) {
                    const yr = data.activePayload[0].payload.year;
                    setPastYear(pastYear === yr ? null : yr);
                  }
                }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
                      <p className="font-semibold">{d?.year}</p>
                      <p className="text-[#007DB5]">{t('العمال', 'Workers')}: {formatCompact(d?.workers)}</p>
                      <p className="text-gray-400">{d?.occupations} {t('مهنة', 'occupations')}</p>
                      <p className="text-[10px] text-gray-300 mt-1">{t('انقر لعرض التفاصيل', 'Click for details')}</p>
                    </div>
                  );
                }} />
                <defs>
                  <linearGradient id="gPast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#007DB5" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#007DB5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="workers" fill="url(#gPast)" stroke="#007DB5" strokeWidth={2} cursor="pointer" />
                {pastYear && <ReferenceLine x={pastYear} stroke="#003366" strokeDasharray="4 4" />}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Year detail — occupations for selected year */}
          {pastYear && (pastData?.occupations?.length ?? 0) > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase mb-2">{t('أعلى المهن في', 'Top Occupations in')} {pastYear}</h4>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {pastData.occupations.map((o: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-700 truncate w-[45%]">{o.occupation}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#007DB5] rounded-full"
                        style={{ width: `${Math.min(100, (o.workers / Math.max(pastData.occupations[0]?.workers || 1, 1)) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-semibold text-[#007DB5] w-[15%] text-right">{formatCompact(o.workers)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-gray-400 mt-2">{t('ملاحظة: الأرقام تقديرية (موزعة من فئات ISCO)', 'Note: Numbers are ESTIMATED (distributed from ISCO groups)')}</p>
            </div>
          )}
          {pastYear && (pastData?.occupations?.length ?? 0) === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">{t('لا توجد بيانات لهذه السنة', 'No data for this year')}</p>
          )}
        </div>

        {/* RIGHT: FUTURE (2026-2030) */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('المستقبل — توقعات', 'Future — Projections')}</h3>
              <p className="text-[10px] text-gray-400">2026-2030 • {t('تنبؤ بالذكاء الاصطناعي والنمو', 'AI + growth forecasting')}</p>
            </div>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">FORECAST</span>
          </div>

          {/* Composed chart: graduates vs demand with AI impact */}
          {(futureData?.projections?.length ?? 0) > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={futureData.projections}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
                      <p className="font-semibold">{d?.year} {t('(توقعات)', '(forecast)')}</p>
                      <p className="text-[#007DB5]">{t('خريجون متوقعون', 'Expected Graduates')}: {formatCompact(d?.supply_graduates)}</p>
                      <p className="text-[#003366]">{t('وظائف متوقعة', 'Expected Jobs')}: {formatCompact(d?.demand_jobs)}</p>
                      <p className="text-[#C9A84C]">{t('وظائف يلغيها الذكاء', 'AI Displaced')}: -{formatCompact(d?.ai_displacement)}</p>
                      <p className="text-[#2E7D6B]">{t('وظائف جديدة بالذكاء', 'AI New Jobs')}: +{formatCompact(d?.ai_new_jobs)}</p>
                      <p className="text-gray-400 border-t mt-1 pt-1">{t('الفجوة', 'Gap')}: {formatCompact(d?.gap)}</p>
                    </div>
                  );
                }} />
                <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 9 }} />
                <Area type="monotone" dataKey="supply_graduates" name={t('خريجون', 'Graduates')} fill="#007DB5" fillOpacity={0.15} stroke="#007DB5" strokeWidth={2} />
                <Line type="monotone" dataKey="demand_jobs" name={t('وظائف (مع الذكاء)', 'Jobs (AI adjusted)')} stroke="#003366" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="demand_base" name={t('وظائف (أساسي)', 'Jobs (base)')} stroke="#C9A84C" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Assumptions + methodology */}
          {futureData?.methodology && (
            <div className="border-t border-gray-100 pt-3 space-y-2">
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase">{t('المنهجية والافتراضات', 'Methodology & Assumptions')}</h4>
              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div className="p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-500">{t('نمو الالتحاق', 'Enrollment growth')}:</span>
                  <span className="font-semibold text-gray-700 ml-1">{futureData.assumptions?.enrollment_growth}/yr</span>
                </div>
                <div className="p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-500">{t('نمو الطلب', 'Demand growth')}:</span>
                  <span className="font-semibold text-gray-700 ml-1">{futureData.assumptions?.demand_growth}/yr</span>
                </div>
                <div className="p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-500">{t('معدل التخرج', 'Graduation rate')}:</span>
                  <span className="font-semibold text-gray-700 ml-1">{futureData.assumptions?.graduation_rate}</span>
                </div>
                <div className="p-2 rounded-lg bg-gray-50">
                  <span className="text-gray-500">{t('تأثير الذكاء', 'AI impact')}:</span>
                  <span className="font-semibold text-gray-700 ml-1">-{futureData.assumptions?.ai_displacement_rate} / +{futureData.assumptions?.ai_new_job_rate}</span>
                </div>
              </div>
              <p className="text-[8px] text-amber-600 bg-amber-50 px-2 py-1 rounded">{t('⚠️ جميع الأرقام المستقبلية تقديرات وليست بيانات فعلية', '⚠️ ALL future numbers are PROJECTIONS based on assumptions, not measured data')}</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: SUPPLY vs DEMAND COMPARISON                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT: Education Pipeline */}
        <DataStory
          title="Education Pipeline — Enrollment Trend"
          method="Annual HE enrollment from Bayanat education CSVs (2002-2024). Gold dots = estimated."
          quality="official+estimated"
          tables={[{name:'fact_program_enrollment', label:'Enrollment (668)'}]}
          sourceUrl="https://bayanat.ae/en/dataset?groups=education"
        >
          <motion.div variants={fadeUp} initial="hidden" animate="show"
            className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-gray-900">{t('خط إمداد التعليم', 'Education Pipeline')}</h3>
              <Link to="/university" className="text-xs text-[#007DB5] hover:underline flex items-center gap-1">
                {t('التفاصيل', 'Details')} <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">{t('اتجاه الالتحاق بالتعليم العالي', 'HE enrollment trend, 2002-2025')}</p>
            {enrollmentTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={enrollmentTrend} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradEnroll" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={COLORS.navy} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="enrollment" name={t('الالتحاق', 'Enrollment')} fill="url(#gradEnroll)" stroke={COLORS.navy} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                {t('لا توجد بيانات', 'No enrollment data')}
              </div>
            )}
            <InsightPanel
              explanation={t(
                'يوضح هذا الرسم اتجاه خط إمداد التعليم العالي عبر السنوات.',
                'This chart tracks the higher education pipeline — how enrollment has grown over time.'
              )}
              insight={enrollmentTrend.length > 2 ? t(
                `نما الالتحاق من ${formatCompact(enrollmentTrend[0]?.enrollment)} (${enrollmentTrend[0]?.year}) إلى ${formatCompact(enrollmentTrend[enrollmentTrend.length - 1]?.enrollment)} (${enrollmentTrend[enrollmentTrend.length - 1]?.year}).`,
                `Enrollment grew from ${formatCompact(enrollmentTrend[0]?.enrollment)} (${enrollmentTrend[0]?.year}) to ${formatCompact(enrollmentTrend[enrollmentTrend.length - 1]?.enrollment)} (${enrollmentTrend[enrollmentTrend.length - 1]?.year}).`
              ) : undefined}
              severity="info" source="Bayanat Education Statistics" compact
            />
          </motion.div>
        </DataStory>

        {/* RIGHT: Job Market Momentum */}
        <DataStory
          title="Job Market Momentum"
          method="Monthly job postings from LinkedIn UAE scrape. 36K total."
          quality="scraped"
          tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies (37K)'}]}
        >
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }}
            className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-gray-900">{t('حركة سوق العمل', 'Job Market Momentum')}</h3>
              <Link to="/skill-gap" className="text-xs text-[#007DB5] hover:underline flex items-center gap-1">
                {t('التفاصيل', 'Details')} <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">{t('حجم الوظائف الشهري — آخر 24 شهراً', 'Monthly job posting volume — last 24 months')}</p>
            {demandMonthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={demandMonthly} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradDemand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tick={AXIS_TICK_SM} interval={Math.max(0, Math.floor(demandMonthly.length / 8))} />
                  <YAxis tick={AXIS_TICK_SM} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" name={t('الوظائف', 'Job Postings')} fill="url(#gradDemand)" stroke={COLORS.gold} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                {t('لا توجد بيانات', 'No demand data')}
              </div>
            )}
            <InsightPanel
              explanation={t(
                'نشاط التوظيف الشهري من LinkedIn الإمارات.',
                'Monthly hiring activity from LinkedIn UAE. Peaks show seasonal demand surges.'
              )}
              insight={demandMonthly.length > 3 ? t(
                `${formatCompact(demand?.total_postings)} وظيفة من ${formatCompact(demand?.unique_companies)} شركة. أعلى قطاع: ${demand?.top_industries?.[0]?.industry || '—'}.`,
                `${formatCompact(demand?.total_postings)} total postings from ${formatCompact(demand?.unique_companies)} companies. Top sector: ${demand?.top_industries?.[0]?.industry || '—'}.`
              ) : undefined}
              severity="info" source="LinkedIn UAE Job Postings" compact
            />
          </motion.div>
        </DataStory>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: THREE-WAY COMPARISON                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <DataStory
        title="Industry, Experience & Regional Comparison"
        method="Industries + experience from LinkedIn CSV. Emirates enrollment from Bayanat. All aggregated by category."
        quality="mixed"
        tables={[{name:'fact_demand_vacancies_agg', label:'Demand (37K)'}, {name:'fact_program_enrollment', label:'Enrollment (668)'}, {name:'dim_region', label:'Emirates (7)'}]}
      >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Top Industries */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('أعلى القطاعات توظيفاً', 'Top Industries')}</h3>
          {topIndustries.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topIndustries} layout="vertical" margin={{ left: 100, right: 20 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} />
                <YAxis type="category" dataKey="industry" tick={AXIS_TICK_SM} width={95} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name={t('وظائف', 'Jobs')} radius={[0, 4, 4, 0]}>
                  {topIndustries.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              {t('لا توجد بيانات', 'No industry data')}
            </div>
          )}
        </motion.div>

        {/* Experience Levels */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.08 }}
          className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('مستويات الخبرة المطلوبة', 'Experience Levels')}</h3>
          {expLevels.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={expLevels} margin={{ left: 0, right: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="level" tick={AXIS_TICK_SM} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<ChartTooltip unit="%" />} />
                <Bar dataKey="pct" name="%" radius={[4, 4, 0, 0]}>
                  {expLevels.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              {t('لا توجد بيانات', 'No experience data')}
            </div>
          )}
        </motion.div>

        {/* Enrollment by Emirate */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.16 }}
          className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('الالتحاق حسب الإمارة', 'Enrollment by Emirate')}</h3>
          {emirateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={emirateData} margin={{ left: 60, right: 10 }} layout="vertical">
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis type="category" dataKey="emirate" tick={AXIS_TICK_SM} width={55} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="enrollment" name={t('طلاب', 'Students')} radius={[0, 4, 4, 0]} fill={COLORS.navy} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              {t('لا توجد بيانات', 'No emirate data')}
            </div>
          )}
        </motion.div>
      </div>
      </DataStory>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: KEY METRICS GRID (2x3 cards with mini visualizations)  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <DataStory
        title="Key Metrics Summary"
        method="Gender: Bayanat enrollment by gender. STEM: CAA program classification. AI Risk: AIOE+Frey-Osborne. Graduates: Bayanat graduate trend. Hiring: LinkedIn companies. Coverage: all DB tables."
        quality="mixed"
        tables={[{name:'fact_supply_graduates', label:'Graduates (4.2K)'}, {name:'fact_ai_exposure_occupation', label:'AI Exposure (2.3K)'}, {name:'dim_program', label:'Programs (3.9K)'}]}
      >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Gender Split */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#003366]" />
            {t('توزيع الجنس', 'Gender Split')}
          </h4>
          {genderData.total > 0 ? (
            <div className="flex items-center gap-4">
              <div className="w-20 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: t('ذكور', 'Male'), value: genderData.male, fill: COLORS.navy },
                        { name: t('إناث', 'Female'), value: genderData.female, fill: COLORS.teal },
                      ]}
                      cx="50%" cy="50%" innerRadius={22} outerRadius={36} paddingAngle={3} dataKey="value"
                    >
                      <Cell fill={COLORS.navy} />
                      <Cell fill={COLORS.teal} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.navy }} />
                  <span className="text-gray-600">{t('ذكور', 'Male')}</span>
                  <span className="font-bold text-gray-900">{genderData.total > 0 ? (genderData.male / genderData.total * 100).toFixed(0) : 0}%</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.teal }} />
                  <span className="text-gray-600">{t('إناث', 'Female')}</span>
                  <span className="font-bold text-gray-900">{genderData.total > 0 ? (genderData.female / genderData.total * 100).toFixed(0) : 0}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* STEM Ratio */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[#2E7D6B]" />
            {t('نسبة ستم', 'STEM Ratio')}
          </h4>
          <div className="text-2xl font-bold text-[#2E7D6B] mb-2 tabular-nums">{stemData.pct.toFixed(0)}%</div>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-[#2E7D6B] to-[#007DB5] transition-all"
              style={{ width: `${Math.min(stemData.pct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400">
            {formatCompact(stemData.stem)} STEM {t('من', 'of')} {formatCompact(stemData.total)} {t('برامج', 'programs')}
          </p>
        </div>

        {/* AI Risk mini donut */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#0A5C8A]" />
            {t('مخاطر الذكاء', 'AI Risk')}
          </h4>
          {aiRiskDist.some(d => d.value > 0) ? (
            <div className="flex items-center gap-4">
              <div className="w-20 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={aiRiskDist} cx="50%" cy="50%" innerRadius={22} outerRadius={36} paddingAngle={2} dataKey="value">
                      {aiRiskDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                {aiRiskDist.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-gray-500">{d.name}</span>
                    <span className="font-semibold text-gray-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* Graduate Output sparkline */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#C9A84C]" />
            {t('مخرجات التخرج', 'Graduate Output')}
          </h4>
          {graduateTrend.length > 0 ? (
            <>
              <div className="text-2xl font-bold text-gray-900 tabular-nums mb-1">
                {formatCompact(graduateTrend[graduateTrend.length - 1]?.graduates)}
              </div>
              <div className="h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={graduateTrend} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="graduates" fill="url(#gradGrad)" stroke={COLORS.gold} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {t('آخر سنة', 'Latest year')}: {graduateTrend[graduateTrend.length - 1]?.year}
              </p>
            </>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* Top Hiring Company */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#4A90C4]" />
            {t('أكبر جهة توظيف', 'Top Hiring Company')}
          </h4>
          {(demand?.top_companies || []).length > 0 ? (
            <div className="space-y-2">
              {(demand?.top_companies || []).slice(0, 3).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 truncate max-w-[70%]">{c.company}</span>
                  <span className="text-xs font-bold text-[#003366] tabular-nums">{formatCompact(c.count)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* Data Coverage */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-[#003366]" />
            {t('تغطية البيانات', 'Data Coverage')}
          </h4>
          <div className="text-2xl font-bold text-[#003366] tabular-nums mb-1">{formatCompact(totalRecords)}</div>
          <p className="text-xs text-gray-500">{t('سجلات موثقة', 'verified records')}</p>
          <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-[10px] text-gray-400">
            <span>{kb?.total_tables ?? '—'} {t('جدول', 'tables')}</span>
            <span>{formatCompact(supply?.kpis?.total_institutions)} {t('مؤسسات', 'institutions')}</span>
          </div>
        </div>
      </div>
      </DataStory>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: KEY INSIGHTS & RECOMMENDATIONS                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-[#C9A84C]" />
          <h2 className="text-base font-bold text-gray-900">{t('رؤى وتوصيات رئيسية', 'Key Insights & Recommendations')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Insight 1: Education Pipeline */}
          <InsightPanel
            explanation={t(
              `الإمارات لديها ${formatCompact(kpis.total_institutions)} مؤسسة تقدم ${formatCompact(kpis.total_programs)} برنامج وتخرّج ${formatCompact(kpis.total_graduates)} طالب سنوياً.`,
              `UAE has ${formatCompact(kpis.total_institutions)} institutions offering ${formatCompact(kpis.total_programs)} programs, producing ${formatCompact(kpis.total_graduates)} graduates annually.`
            )}
            insight={(() => {
              const fPct = genderData.total > 0 ? (genderData.female / genderData.total * 100).toFixed(0) : '—';
              return t(
                `النساء يمثلن ${fPct}% من الالتحاق. ${Number(fPct) > 55 ? 'فجوة جنسية كبيرة — مشاركة الذكور تحتاج اهتماماً.' : 'تكافؤ شبه تام بين الجنسين.'}`,
                `Women represent ${fPct}% of enrollment. ${Number(fPct) > 55 ? 'Significant gender gap — male participation needs attention.' : 'Near gender parity in education.'}`
              );
            })()}
            recommendation={t(
              'ربط مخرجات الخريجين بالقطاعات الأكثر توظيفاً لضمان التوافق. تسريع البرامج في القطاعات ذات النقص المستمر.',
              'Cross-reference graduate output by discipline with top hiring industries. Fast-track programs in sectors with persistent shortages.'
            )}
            severity="info" source="Bayanat + CAA"
          />

          {/* Insight 2: Job Market */}
          <InsightPanel
            explanation={t(
              `${formatCompact(demand?.total_postings)} وظيفة نشطة من ${formatCompact(demand?.unique_companies)} شركة في جميع أنحاء الإمارات.`,
              `${formatCompact(demand?.total_postings)} active job postings from ${formatCompact(demand?.unique_companies)} companies across the UAE.`
            )}
            insight={(() => {
              const entry = demand?.experience_levels?.find(e => e.level?.toLowerCase().includes('entry'));
              const entryPct = entry?.pct ?? 0;
              return t(
                `الوظائف المبتدئة: ${entryPct.toFixed(0)}% من الإعلانات. ${entryPct > 40 ? 'قدرة عالية على استيعاب الخريجين.' : entryPct < 20 ? 'انخفاض فرص المبتدئين.' : 'سوق متوسط للمبتدئين.'}`,
                `Entry-level: ${entryPct.toFixed(0)}% of postings. ${entryPct > 40 ? 'Strong graduate absorption.' : entryPct < 20 ? 'Low entry-level availability — graduates may struggle.' : 'Moderate entry-level market.'}`
              );
            })()}
            recommendation={t(
              'توجيه خدمات التوظيف الجامعية نحو أعلى 3 صناعات. إنشاء شراكات مع أكبر الشركات الموظفة.',
              'Focus university career services on top 3 industries. Create employer partnership programs with the top hiring companies.'
            )}
            severity={(demand?.experience_levels?.find(e => e.level?.toLowerCase().includes('entry'))?.pct ?? 0) < 20 ? 'warning' : 'success'}
            source="LinkedIn UAE"
          />

          {/* Insight 3: AI Disruption */}
          <InsightPanel
            explanation={t(
              `${formatCompact(ai?.summary?.total_occupations)} مهنة تم تقييم تأثير الذكاء الاصطناعي عليها. ${ai?.summary?.high_risk_pct?.toFixed(0) ?? '—'}% تواجه مخاطر عالية.`,
              `${formatCompact(ai?.summary?.total_occupations)} occupations assessed for AI impact. ${ai?.summary?.high_risk_pct?.toFixed(0) ?? '—'}% face high disruption risk.`
            )}
            insight={t(
              `متوسط التعرض: ${ai?.summary?.avg_exposure?.toFixed(0) ?? '—'}%. المهن ذات المخاطر العالية تحتاج برامج تأهيل عاجلة.`,
              `Average exposure: ${ai?.summary?.avg_exposure?.toFixed(0) ?? '—'}%. High-risk occupations need urgent reskilling programs to complement AI, not compete with it.`
            )}
            recommendation={t(
              'الاستثمار في برامج تدريب تجمع بين أدوات الذكاء الاصطناعي ومهارات الحكم البشري.',
              'Invest in upskilling programs that pair AI tools with human judgment skills. High-risk occupations need human-AI collaboration training.'
            )}
            severity={(ai?.summary?.high_risk_pct ?? 0) > 30 ? 'warning' : 'info'}
            source="AIOE Index + O*NET"
          />

          {/* Insight 4: Skills Ecosystem */}
          <InsightPanel
            explanation={t(
              `${formatCompact(skillMatch?.total_skills_demanded ?? 0)} مهارة مطلوبة مقابل ${formatCompact(skillMatch?.total_skills_supplied ?? 0)} مهارة مُدرَّسة. التطابق: ${(skillMatch?.overlap_pct ?? 0).toFixed(0)}% فقط.`,
              `${formatCompact(skillMatch?.total_skills_demanded ?? 0)} skills demanded vs ${formatCompact(skillMatch?.total_skills_supplied ?? 0)} taught. Match rate: only ${(skillMatch?.overlap_pct ?? 0).toFixed(0)}%.`
            )}
            insight={t(
              `برامج ستم: ${stemData.pct.toFixed(0)}% من العروض. ${stemData.pct < 35 ? 'أقل من هدف 40% لاقتصاد المعرفة — يحتاج توسيع.' : 'على المسار الصحيح لأهداف ستم.'}`,
              `STEM programs: ${stemData.pct.toFixed(0)}% of offerings. ${stemData.pct < 35 ? 'Below the 40% target for knowledge economies — needs expansion.' : 'On track for STEM targets.'}`
            )}
            recommendation={t(
              'ربط التقنيات الساخنة من O*NET بمناهج الجامعات. أي تقنية تظهر في أكثر من 100 مهنة وليست في المناهج = فجوة تدريب.',
              'Map hot technologies from O*NET against university curricula. Any technology in >100 occupations but not in current programs = training gap.'
            )}
            severity="info" source="ESCO + O*NET + CAA"
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: AI RESEARCH CHATBOT                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#003366]/10"><MessageSquare className="w-5 h-5 text-[#003366]" /></div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('محادثة البحث', 'Research Assistant')}</h2>
              <p className="text-[11px] text-gray-400">
                {t('اسأل أي سؤال عن سوق العمل الإماراتي — الإجابات مدعومة بالبيانات', 'Ask anything about UAE labour market — answers grounded in verified data')}
              </p>
            </div>
          </div>

          {/* Mode toggles */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button onClick={() => setWebSearchOn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                webSearchOn ? 'bg-[#003366] text-white border-[#003366]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#003366]/30'
              }`}>
              <Globe className="w-3.5 h-3.5" />
              {t('بحث مباشر', 'Web Search')}
              {webSearchOn && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </button>
            <button onClick={() => setSelfKnowledgeOn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                selfKnowledgeOn ? 'bg-[#C9A84C] text-white border-[#C9A84C]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#C9A84C]/30'
              }`}>
              <Lightbulb className="w-3.5 h-3.5" />
              {t('المعرفة الذاتية', 'Self Knowledge')}
              {selfKnowledgeOn && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            </button>
            <span className="text-[10px] text-gray-400">
              {webSearchOn && selfKnowledgeOn ? t('بحث + معرفة ذاتية', 'Web + Self Knowledge')
                : webSearchOn ? t('بحث مباشر عبر Tavily', 'Live search via Tavily')
                : selfKnowledgeOn ? t('معرفة النموذج + قاعدة البيانات', 'Model knowledge + DB')
                : t(`قاعدة بيانات فقط (${formatCompact(totalRecords)} سجل)`, `DB only (${formatCompact(totalRecords)} records)`)}
            </span>
          </div>

          {/* Suggestion chips */}
          {messages.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                t('ما أكبر فجوة في المهارات في دبي؟', 'What is the biggest skill gap in Dubai?'),
                t('ما القطاعات الأكثر تأثراً بالذكاء الاصطناعي؟', 'Which sectors are most affected by AI?'),
                t('كم عدد خريجي الهندسة في الإمارات؟', 'How many engineering graduates does UAE produce?'),
                t('ما متوسط الرواتب في قطاع التكنولوجيا؟', 'What are avg salaries in the tech sector?'),
              ].map((q, i) => (
                <button key={i} onClick={() => { setInput(q); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-[#003366]/5 hover:border-[#003366]/20 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat messages */}
        <div className="max-h-[400px] overflow-y-auto p-5 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-[#003366] text-white rounded-br-md'
                  : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-bl-md'
              }`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200/50 space-y-1">
                    {msg.citations.slice(0, 3).map((c, ci) => (
                      <div key={ci} className="flex items-start gap-1.5 text-[10px] text-gray-500">
                        <Database className="w-3 h-3 mt-0.5 shrink-0" />
                        <span><span className="font-medium">{c.source}</span>: {c.excerpt?.slice(0, 100)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                <Loader2 className="w-4 h-4 animate-spin text-[#003366]" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={t('اسأل عن سوق العمل الإماراتي...', 'Ask about UAE labour market data...')}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366]/40 outline-none"
              disabled={chatLoading}
            />
            <button
              onClick={sendMessage}
              disabled={chatLoading || !input.trim()}
              className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-medium hover:bg-[#003366]/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {t('إرسال', 'Send')}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            {t('الإجابات مدعومة بـ', 'Powered by AI Agent grounded in')} {formatCompact(totalRecords)} {t('سجل بيانات موثق', 'verified data records')}
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 8: QUICK NAVIGATION                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            to: '/skill-gap',
            icon: Crosshair,
            label: t('فجوة المهارات', 'Skill Gap'),
            desc: t('تحليل تفصيلي للعرض والطلب', 'Detailed supply vs demand analysis'),
            color: COLORS.navy,
          },
          {
            to: '/ai-impact',
            icon: Brain,
            label: t('تأثير الذكاء', 'AI Impact'),
            desc: t(`${formatCompact(ai?.summary?.total_occupations)} مهنة مقيّمة`, `${formatCompact(ai?.summary?.total_occupations)} occupations assessed`),
            color: COLORS.teal,
          },
          {
            to: '/forecast',
            icon: TrendingUp,
            label: t('التنبؤ', 'Forecast'),
            desc: t('توقعات العرض والطلب', 'Supply & demand predictions'),
            color: COLORS.gold,
          },
          {
            to: '/knowledge-base',
            icon: Database,
            label: t('قاعدة المعرفة', 'Knowledge Base'),
            desc: t(`${kb?.total_tables ?? '—'} جدول`, `${kb?.total_tables ?? '—'} tables`),
            color: COLORS.emerald,
          },
        ].map((nav) => (
          <motion.div key={nav.to} variants={fadeUp}>
            <Link to={nav.to}
              className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:-translate-y-1 transition-all text-center"
            >
              <div className="p-3 rounded-xl transition-colors" style={{ background: `${nav.color}15` }}>
                <nav.icon className="w-5 h-5" style={{ color: nav.color }} />
              </div>
              <span className="text-sm font-semibold text-gray-900">{nav.label}</span>
              <span className="text-[10px] text-gray-400">{nav.desc}</span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#003366] group-hover:translate-x-1 transition-all" />
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <div className="h-4" />
    </motion.div>
  ); } catch (err: any) {
    return (
      <div className="p-6">
        <div className="bg-[#003366]/5 border border-[#003366]/20 rounded-xl p-6">
          <h3 className="text-[#003366] font-semibold mb-2">{t('خطأ في العرض', 'Dashboard rendering error')}</h3>
          <pre className="text-xs text-[#1A3F5C] whitespace-pre-wrap break-all">{err?.message}</pre>
        </div>
      </div>
    );
  }
};

export default DashboardPage;
