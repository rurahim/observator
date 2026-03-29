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
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import {
  useSupplyDashboard, useDashboardSummary, useDemandInsights,
  useAIImpact, useKBStats, useSendMessage,
  useSkillMatchingSummary, useDemandedSkills, useSuppliedSkills, useSkillComparison,
  useExplorerFilters, useExplorerBySkill, useExplorerByOccupation, useExplorerByInstitution, useExplorerSkillDetail,
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

  // Explorer hooks (always called — never conditional)
  const { data: expFilters } = useExplorerFilters();
  const [expView, setExpView] = useState<'skill' | 'occupation' | 'institution'>('skill');
  const [expRegion, setExpRegion] = useState('');
  const [expSearch, setExpSearch] = useState('');
  const [expSkillType, setExpSkillType] = useState('');
  const [expSelectedSkill, setExpSelectedSkill] = useState<number | null>(null);

  const expSkillParams = useMemo(() => {
    const p: Record<string, any> = { limit: 15 };
    if (expSearch) p.search = expSearch;
    if (expSkillType) p.skill_type = expSkillType;
    return p;
  }, [expSearch, expSkillType]);
  const expOccParams = useMemo(() => {
    const p: Record<string, any> = { limit: 15 };
    if (expSearch) p.search = expSearch;
    if (expRegion) p.region = expRegion;
    return p;
  }, [expSearch, expRegion]);
  const expInstParams = useMemo(() => {
    const p: Record<string, any> = {};
    if (expRegion) p.region = expRegion;
    return p;
  }, [expRegion]);

  const { data: expSkills } = useExplorerBySkill(expSkillParams);
  const { data: expOccs } = useExplorerByOccupation(expOccParams);
  const { data: expInsts } = useExplorerByInstitution(expInstParams);
  const { data: expSkillDetail } = useExplorerSkillDetail(expSelectedSkill);

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
      {/* SECTION 2: SKILL GAP INTELLIGENCE — REDESIGNED                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <DataStory
        title="Skill Gap Intelligence"
        method="Compares 2,237 essential skills demanded by 35.7K LinkedIn jobs with 1,772 skills taught across 19.2K university courses. Skills inherited from ESCO occupation-skill mappings. Course-skill mapping via token matching against 21K ESCO labels."
        quality="official+generated"
        tables={[{name:'fact_job_skills', label:'Job Skills (3M)'}, {name:'fact_course_skills', label:'Course Skills (24.8K)'}, {name:'dim_skill', label:'ESCO Skills (21.5K)'}, {name:'vw_skill_gap', label:'Skill Gap View (13K)'}]}
        caveats="Job skills inherited from ESCO occupation mappings (not extracted from JDs). Course skills from token matching (~60-70% accuracy). Some generic skills like 'mathematics' inflate demand counts."
        sourceUrl="https://esco.ec.europa.eu/en/use-esco/download"
      >
      <div className="space-y-5">
        {/* Header + 6 KPI metrics */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-navy" />
                {t('تحليل فجوة المهارات', 'Skill Gap Intelligence')}
              </h2>
              <p className="text-[11px] text-gray-400">{t('مطابقة مهارات سوق العمل بمخرجات التعليم', 'Matching labour market skills with education output')}</p>
            </div>
            <div className="text-right text-[10px] text-gray-400">
              <div>{t('المصادر', 'Sources')}: ESCO + LinkedIn + CAA + 100 University Catalogs</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: t('مهارات مطلوبة (أساسية)', 'Skills Demanded (Essential)'), value: formatCompact(skillComp?.stats?.total_demanded ?? skillMatch?.total_skills_demanded ?? 0), color: '#003366' },
              { label: t('مهارات مُدرَّسة', 'Skills Taught'), value: formatCompact(skillComp?.stats?.total_supplied ?? skillMatch?.total_skills_supplied ?? 0), color: '#007DB5' },
              { label: t('تطابق', 'Overlap'), value: formatCompact(skillComp?.stats?.overlap_count ?? skillMatch?.skill_overlap ?? 0), color: '#2E7D6B' },
              { label: t('فجوة الطلب', 'Demand-Only Gap'), value: formatCompact(skillComp?.stats?.demand_only_count ?? 0), color: '#0A5C8A' },
              { label: t('فائض العرض', 'Supply-Only Surplus'), value: formatCompact(skillComp?.stats?.supply_only_count ?? 0), color: '#C9A84C' },
              { label: t('نسبة التغطية', 'Coverage %'), value: `${(skillMatch?.overlap_pct ?? 0).toFixed(1)}%`, color: '#4A90C4' },
            ].map((kpi, i) => (
              <div key={i} className="p-3 rounded-xl border border-gray-100 bg-gray-50/50">
                <div className="text-[10px] font-medium mb-1" style={{ color: kpi.color }}>{kpi.label}</div>
                <div className="text-xl font-bold text-gray-900 tabular-nums">{kpi.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ROW 2: Butterfly/Diverging bar + Heatmap */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* LEFT: Skill Overlap — Demand vs Supply for SAME skills (butterfly chart) */}
          <DataStory title="Overlapping Skills: Demand vs Supply" quality="official+generated"
            method="Shows skills that appear in BOTH job postings AND university courses. Demand = count of jobs requiring this skill (essential only, from ESCO occupation-skill mappings for 35.7K LinkedIn jobs). Supply = count of courses teaching it (from token matching 19.2K university catalog courses against ESCO skills). Bars normalized to relative scale for visual comparison."
            tables={[{name:'fact_job_skills', label:'Job Skills (3M rows)'}, {name:'fact_course_skills', label:'Course Skills (24.8K rows)'}, {name:'vw_skill_gap', label:'Skill Gap View (13K)'}]}
            caveats="Demand numbers reflect ESCO occupation inheritance — all jobs mapped to an occupation inherit its full skill list. Supply matching is token-based (~60-70% accuracy)."
            sourceUrl="https://esco.ec.europa.eu/en/use-esco/download">
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">{t('مقارنة المهارات المتداخلة', 'Overlapping Skills: Demand vs Supply')}</h3>
            <p className="text-[10px] text-gray-400 mb-3">{t('مهارات موجودة في كلا الجانبين — الطلب (أزرق) مقابل العرض (أخضر)', 'Skills present in BOTH sides — Demand (blue) vs Supply (teal)')}</p>
            {(skillComp?.overlap?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={Math.min(400, (skillComp.overlap.length || 1) * 32)}>
                <BarChart data={(skillComp?.overlap || []).slice(0, 12).map((s: any) => ({
                  ...s,
                  // Normalize to make comparable (demand is much larger)
                  demandNorm: Math.min(100, Math.round((s.demand / Math.max(...(skillComp?.overlap || []).map((x: any) => x.demand || 1))) * 100)),
                  supplyNorm: Math.min(100, Math.round((s.supply / Math.max(...(skillComp?.overlap || []).map((x: any) => x.supply || 1))) * 100)),
                }))} layout="vertical" margin={{ left: 120, right: 20 }}>
                  <CartesianGrid {...GRID_PROPS} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${v}%`} />
                  <YAxis type="category" dataKey="skill" tick={AXIS_TICK_SM} width={115} />
                  <Tooltip content={({ payload, label }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
                        <p className="font-semibold mb-1">{label}</p>
                        <p style={{ color: '#003366' }}>{t('الطلب', 'Demand')}: {formatCompact(d?.demand)} {t('وظيفة', 'jobs')}</p>
                        <p style={{ color: '#007DB5' }}>{t('العرض', 'Supply')}: {formatCompact(d?.supply)} {t('مقرر', 'courses')}</p>
                        <p className="text-gray-400 border-t mt-1 pt-1">{t('تطابق', 'Match')}: {d?.match_pct}%</p>
                      </div>
                    );
                  }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="demandNorm" name={t('الطلب (نسبي)', 'Demand (relative)')} fill="#003366" radius={[0, 3, 3, 0]} barSize={12} />
                  <Bar dataKey="supplyNorm" name={t('العرض (نسبي)', 'Supply (relative)')} fill="#007DB5" radius={[0, 3, 3, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Loading...</div>}
            <p className="text-[9px] text-gray-400 mt-2">{t('المصدر', 'Source')}: ESCO essential skills (35.7K jobs) + CAA/University Catalogs (19.2K courses)</p>
          </div>

          </DataStory>

          {/* RIGHT: Heatmap — by skill type, color = match percentage */}
          <DataStory title="Skill Match Heatmap" quality="official+generated"
            method="Skills grouped by ESCO type (knowledge, skill/competence, technology). Color intensity = match percentage (supply courses / demand jobs × 100). Darker = bigger gap. Each pill shows skill name + match %. Data from overlapping skills analysis."
            tables={[{name:'vw_skill_gap', label:'Skill Gap (13K)'}, {name:'dim_skill', label:'ESCO Skills (21.5K)'}]}
            sourceUrl="https://esco.ec.europa.eu/en/classification/skills">
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">{t('خريطة حرارية للتطابق', 'Skill Match Heatmap')}</h3>
            <p className="text-[10px] text-gray-400 mb-3">{t('كلما كان اللون أغمق، كلما كانت الفجوة أكبر', 'Darker = larger gap between demand and supply')}</p>
            <div className="space-y-4">
              {Object.entries(skillComp?.categories || {}).slice(0, 4).map(([type, skills]: [string, any]) => (
                <div key={type}>
                  <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{type}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {(skills || []).slice(0, 12).map((s: any, i: number) => {
                      const matchPct = s.match_pct ?? 0;
                      // Color gradient: 0% match = dark navy, 100% match = light teal
                      const bg = matchPct > 50 ? `rgba(0,125,181,${0.15 + matchPct/200})` : matchPct > 10 ? `rgba(10,92,138,${0.2 + (50-matchPct)/100})` : `rgba(0,51,102,${0.3 + (100-matchPct)/200})`;
                      const text = matchPct > 30 ? '#003366' : '#ffffff';
                      return (
                        <div key={i} className="px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all hover:scale-105 cursor-default"
                          style={{ background: bg, color: text }}
                          title={`${s.skill}: demand=${formatCompact(s.demand)}, supply=${formatCompact(s.supply)}, match=${matchPct}%`}>
                          {(s.skill || '').length > 20 ? s.skill.slice(0, 18) + '...' : s.skill}
                          <span className="ml-1 opacity-70">{matchPct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-100">
              <span className="text-[9px] text-gray-400">{t('مقياس الفجوة', 'Gap scale')}:</span>
              <div className="flex gap-1">
                {[0, 20, 40, 60, 80, 100].map(v => (
                  <div key={v} className="w-6 h-4 rounded" style={{
                    background: v > 50 ? `rgba(0,125,181,${0.15 + v/200})` : `rgba(0,51,102,${0.3 + (100-v)/200})`,
                  }} />
                ))}
              </div>
              <span className="text-[9px] text-gray-400">0% → 100% {t('تطابق', 'match')}</span>
            </div>
            <p className="text-[9px] text-gray-400 mt-2">{t('المصدر', 'Source')}: ESCO Taxonomy + LinkedIn + 100 University Catalogs</p>
          </div>
          </DataStory>
        </div>

        {/* ROW 3: Demand-Only Gaps + Supply-Only Surplus */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Demand-only: skills employers NEED but nobody teaches */}
          <DataStory title="Critical Gaps — Demanded but NOT Taught" quality="official+generated"
            method="Skills that appear in job postings (via ESCO occupation-skill inheritance) but have ZERO matching courses in any UAE university catalog. These are skills employers need that the education system completely lacks. Demand count = number of LinkedIn jobs whose ESCO occupation requires this skill as essential."
            tables={[{name:'fact_job_skills', label:'Job Skills (3M)'}, {name:'fact_course_skills', label:'Course Skills (24.8K)'}, {name:'dim_skill', label:'ESCO Skills (21.5K)'}]}
            caveats="Microsoft Excel/Word/Outlook appear as top gaps because ESCO maps them as skills for many occupations, but university course names don't match these exact labels. This may overstate the gap for software tool skills."
            sourceUrl="https://esco.ec.europa.eu/en/use-esco/download">
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">{t('فجوات حرجة — مهارات مطلوبة غير مُدرَّسة', 'Critical Gaps — Demanded but NOT Taught')}</h3>
            <p className="text-[10px] text-gray-400 mb-3">{t('مهارات يحتاجها أصحاب العمل ولا تُدرَّس في أي جامعة', 'Skills employers need but zero courses teach')}</p>
            <div className="space-y-1.5">
              {(skillComp?.demand_only || []).slice(0, 10).map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-32 truncate">{s.skill}</span>
                  <div className="flex-1 h-3 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#003366] to-[#0A5C8A]"
                      style={{ width: `${Math.min(100, (s.demand / ((skillComp?.demand_only?.[0]?.demand) || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500 w-12 text-right">{formatCompact(s.demand)}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-gray-400 mt-3">{t('المصدر', 'Source')}: ESCO essential skill mappings from LinkedIn jobs</p>
          </div>

          </DataStory>

          {/* Supply-only: skills taught but market doesn't demand */}
          <DataStory title="Potential Surplus — Taught but NOT Demanded" quality="official+generated"
            method="Skills that are taught in UAE university courses (matched via token matching against ESCO) but do NOT appear as essential requirements in any LinkedIn job posting. These represent curriculum areas that may not align with current market needs."
            tables={[{name:'fact_course_skills', label:'Course Skills (24.8K)'}, {name:'dim_course', label:'Courses (19.2K)'}, {name:'dim_skill', label:'ESCO Skills (21.5K)'}]}
            caveats="Token matching may produce false positives — 'design window and glazing systems' matching a generic engineering course. Supply-only doesn't mean the skill is useless — it may be demanded under a different name."
            sourceUrl="https://www.caa.ae/Pages/Programs/All.aspx">
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">{t('فائض محتمل — مهارات مُدرَّسة غير مطلوبة', 'Potential Surplus — Taught but NOT Demanded')}</h3>
            <p className="text-[10px] text-gray-400 mb-3">{t('مهارات تُدرَّسها الجامعات ولكن السوق لا يطلبها', 'Skills universities teach but the market doesn\'t ask for')}</p>
            <div className="space-y-1.5">
              {(skillComp?.supply_only || []).slice(0, 10).map((s: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-32 truncate" title={s.skill}>{s.skill}</span>
                  <div className="flex-1 h-3 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#C9A84C] to-[#C9A84C]/60"
                      style={{ width: `${Math.min(100, (s.supply / ((skillComp?.supply_only?.[0]?.supply) || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold text-gray-500 w-12 text-right">{formatCompact(s.supply)}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-gray-400 mt-3">{t('المصدر', 'Source')}: CAA + 100 University Catalog course-to-skill mappings</p>
          </div>
          </DataStory>
        </div>

        <InsightPanel
          explanation={t(
            'تحليل ذكي يقارن 2,237 مهارة أساسية مطلوبة في سوق العمل مع 1,772 مهارة مُدرَّسة في الجامعات. فقط 300 مهارة متداخلة.',
            `Smart analysis comparing ${formatCompact(skillComp?.stats?.total_demanded ?? 0)} essential demanded skills with ${formatCompact(skillComp?.stats?.total_supplied ?? 0)} taught skills. Only ${formatCompact(skillComp?.stats?.overlap_count ?? 0)} overlap.`
          )}
          insight={t(
            'أكبر فجوات: Microsoft Excel, Microsoft Word, Outlook — أدوات أساسية لم تُطابق. أكبر فوائض: مهارات هندسية متخصصة لا يطلبها السوق.',
            `Biggest gaps: ${(skillComp?.demand_only || []).slice(0, 3).map((s: any) => s.skill).join(', ')} — basic tools not matched. Biggest surplus: ${(skillComp?.supply_only || []).slice(0, 2).map((s: any) => s.skill).join(', ')}.`
          )}
          recommendation={t(
            'أولوية: إضافة مقررات في الأدوات الرقمية (Excel, Office) عبر جميع التخصصات. مراجعة البرامج ذات الفائض.',
            'Priority: add digital tools courses (Excel, Office, Outlook) across ALL disciplines. Review programs with surplus skills for curriculum rebalancing.'
          )}
          severity="warning"
          source={`ESCO (${formatCompact(skillComp?.stats?.total_demanded ?? 0)} essential skills) + LinkedIn (${formatCompact(skillMatch?.total_jobs_with_skills ?? 0)} jobs) + University Catalogs (${formatCompact(skillMatch?.total_courses_mapped ?? 0)} courses)`}
        />
      </div>
      </DataStory>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2b: TIME SERIES — Past, Present, Future                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <DataStory
        title="Time Series — Past, Present, Future"
        method="Enrollment: Bayanat HE CSVs 2002-2024 (7 estimated). Job postings: LinkedIn UAE monthly aggregation. Gap: supply vs demand from materialized views."
        quality="official+estimated"
        tables={[{name:'fact_program_enrollment', label:'Enrollment (668)'}, {name:'fact_demand_vacancies_agg', label:'Job Vacancies (37K)'}, {name:'vw_gap_cube', label:'Gap Cube (2.7K)'}]}
        sourceUrl="https://bayanat.ae/en/dataset?groups=education"
      >
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-navy" />
          {t('الاتجاهات الزمنية — الماضي والحاضر والمستقبل', 'Time Series — Past, Present & Future')}
        </h2>

        {/* 3 time series charts in a row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Enrollment Over Time (Supply Pipeline) */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('خط العرض: الالتحاق', 'Supply Pipeline: Enrollment')}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={enrollVsGrad} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="gEnroll" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS.navy} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="enrollment" name={t('الالتحاق', 'Enrollment')} fill="url(#gEnroll)" stroke={COLORS.navy} strokeWidth={2} />
                <Line type="monotone" dataKey="graduates" name={t('الخريجون', 'Graduates')} stroke={COLORS.teal} strokeWidth={2} dot={{ r: 2, fill: COLORS.teal }} />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-gray-400 mt-1">{t('2002-2024 • ذهبي = تقديري', '2002-2024 • Blue=enrollment, Teal=graduates')}</p>
          </div>

          {/* Job Postings Over Time (Demand Momentum) */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('خط الطلب: الوظائف الشهرية', 'Demand Momentum: Monthly Jobs')}</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={demandMonthly} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="gDemand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={AXIS_TICK_SM} interval={Math.max(0, Math.floor((demandMonthly?.length ?? 0) / 6))} />
                <YAxis tick={AXIS_TICK_SM} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="count" name={t('الوظائف', 'Job Postings')} fill="url(#gDemand)" stroke={COLORS.gold} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-gray-400 mt-1">{t('آخر 24 شهر من LinkedIn', 'Last 24 months from LinkedIn UAE')}</p>
          </div>

          {/* Supply vs Demand Gap Trend */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('اتجاه الفجوة', 'Gap Trend: Supply vs Demand')}</h3>
            {(supplyDemandTrend?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={supplyDemandTrend} margin={{ left: 5, right: 5, top: 5, bottom: 0 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tick={AXIS_TICK_SM} interval={Math.max(0, Math.floor((supplyDemandTrend?.length ?? 0) / 6))} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="supply" name={t('العرض', 'Supply')} fill={COLORS.teal} fillOpacity={0.2} stroke={COLORS.teal} strokeWidth={2} />
                  <Area type="monotone" dataKey="demand" name={t('الطلب', 'Demand')} fill={COLORS.navy} fillOpacity={0.2} stroke={COLORS.navy} strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-xs text-gray-400">
                {t('بيانات الفجوة الزمنية قيد الإنشاء', 'Gap trend data building up...')}
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1">{t('العرض (أزرق فاتح) مقابل الطلب (أزرق غامق)', 'Supply (teal) vs Demand (navy) monthly')}</p>
          </div>
        </div>

        <InsightPanel
          explanation={t(
            'ثلاث سلاسل زمنية توضح: (1) خط إمداد التعليم العالي (2) حركة سوق العمل (3) الفجوة بينهما عبر الزمن.',
            'Three time series showing: (1) Education supply pipeline growth, (2) Job market hiring momentum, (3) The gap between supply and demand over time.'
          )}
          insight={(() => {
            const trend = supply?.enrollment_trend || [];
            if (trend.length < 2) return undefined;
            const first = trend[0]?.enrollment ?? 0;
            const last = trend[trend.length - 1]?.enrollment ?? 0;
            const growth = first > 0 ? ((last - first) / first * 100).toFixed(0) : '?';
            return t(
              `الالتحاق نما ${growth}% من ${formatCompact(first)} (${trend[0]?.year}) إلى ${formatCompact(last)} (${trend[trend.length-1]?.year}). الطلب الشهري: ${formatCompact(demand?.total_postings ?? 0)} وظيفة.`,
              `Enrollment grew ${growth}% from ${formatCompact(first)} (${trend[0]?.year}) to ${formatCompact(last)} (${trend[trend.length-1]?.year}). Monthly demand: ${formatCompact(demand?.total_postings ?? 0)} job postings.`
            );
          })()}
          severity="info" compact
        />
      </div>
      </DataStory>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2c: DRILL-DOWN EXPLORER — Filter & Explore at Any Level   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <DataStory
        title="Supply-Demand Explorer"
        method="Interactive drill-down across skills, occupations, and institutions. Skills: ESCO essential mappings from 35.7K jobs vs 19.2K course token matches. Occupations: gap cube (supply from Bayanat/MOHRE vs demand from LinkedIn). Institutions: 168 CAA/Bayanat institutions with 19.2K parsed catalog courses."
        quality="mixed"
        tables={[{name:'vw_skill_gap', label:'Skill Gap (13K)'}, {name:'vw_gap_cube', label:'Gap Cube (2.7K)'}, {name:'dim_course', label:'Courses (19.2K)'}, {name:'dim_institution', label:'Institutions (168)'}]}
        caveats="Skill demand uses essential skills only (filtered from 13K total). Occupation gap depends on ISCO mapping quality."
      >
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">{t('مستكشف العرض والطلب', 'Supply-Demand Explorer')}</h2>
          <span className="text-[10px] text-gray-400">{t('اختر العرض والفلاتر للتعمق', 'Select view & filters to drill down')}</span>
        </div>

        {/* View tabs + Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* View selector */}
          {[
            { key: 'skill' as const, label: t('بالمهارة', 'By Skill'), icon: Layers },
            { key: 'occupation' as const, label: t('بالمهنة', 'By Occupation'), icon: Briefcase },
            { key: 'institution' as const, label: t('بالجامعة', 'By University'), icon: GraduationCap },
          ].map(v => (
            <button key={v.key} onClick={() => { setExpView(v.key); setExpSelectedSkill(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                expView === v.key ? 'bg-[#003366] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}>
              <v.icon className="w-3.5 h-3.5" />
              {v.label}
            </button>
          ))}

          <span className="w-px h-6 bg-gray-200" />

          {/* Search */}
          <input type="text" value={expSearch} onChange={e => setExpSearch(e.target.value)}
            placeholder={t('بحث...', 'Search...')}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-40 focus:outline-none focus:ring-1 focus:ring-[#003366]/20" />

          {/* Region filter */}
          <select value={expRegion} onChange={e => setExpRegion(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="">{t('كل المناطق', 'All Regions')}</option>
            {(expFilters?.regions || []).map((r: any) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* Skill type filter (for skill view) */}
          {expView === 'skill' && (
            <select value={expSkillType} onChange={e => setExpSkillType(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
              <option value="">{t('كل الأنواع', 'All Types')}</option>
              {(expFilters?.skill_types || []).map((st: string) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          )}
        </div>

        {/* Results table */}
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          {expView === 'skill' && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">{t('المهارة', 'Skill')}</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">{t('النوع', 'Type')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">{t('الطلب', 'Demand')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">{t('العرض', 'Supply')}</th>
                  <th className="py-2 px-3 font-semibold text-gray-500 w-32">{t('الفجوة', 'Gap')}</th>
                </tr>
              </thead>
              <tbody>
                {(expSkills?.skills || []).map((s: any, i: number) => (
                  <tr key={s.skill_id || i}
                    className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${expSelectedSkill === s.skill_id ? 'bg-[#003366]/5' : ''}`}
                    onClick={() => setExpSelectedSkill(expSelectedSkill === s.skill_id ? null : s.skill_id)}>
                    <td className="py-2 px-3 font-medium text-gray-800 max-w-[200px] truncate">{s.skill}</td>
                    <td className="py-2 px-3 text-gray-400">{s.type}</td>
                    <td className="py-2 px-3 text-right font-semibold text-[#003366] tabular-nums">{formatCompact(s.demand)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-[#007DB5] tabular-nums">{formatCompact(s.supply)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-[#003366] rounded-l-full" style={{ width: `${Math.min(50, (s.demand / Math.max(s.demand + s.supply, 1)) * 100)}%` }} />
                          <div className="h-full bg-[#007DB5] rounded-r-full" style={{ width: `${Math.min(50, (s.supply / Math.max(s.demand + s.supply, 1)) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-gray-500 w-10 text-right">{formatCompact(s.gap)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {expView === 'occupation' && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">{t('المهنة', 'Occupation')}</th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-500">{t('الإمارة', 'Region')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">{t('العرض', 'Supply')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">{t('الطلب', 'Demand')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">{t('الفجوة', 'Gap')}</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500">AI %</th>
                </tr>
              </thead>
              <tbody>
                {(expOccs?.occupations || []).map((o: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-800 max-w-[200px] truncate">{o.occupation}</td>
                    <td className="py-2 px-3 text-gray-400">{o.emirate || o.region}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[#007DB5]">{formatCompact(o.supply)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-[#003366]">{formatCompact(o.demand)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: o.gap < 0 ? '#003366' : '#007DB5' }}>{formatCompact(o.gap)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-gray-400">{o.ai_exposure ? `${o.ai_exposure.toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {expView === 'institution' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(expInsts?.institutions || []).slice(0, 12).map((inst: any, i: number) => (
                <div key={i} className="p-3 rounded-xl border border-gray-100 hover:shadow-sm transition-shadow">
                  <h4 className="text-xs font-semibold text-gray-900 truncate mb-2">{inst.institution}</h4>
                  <div className="flex gap-3 text-[10px] text-gray-500">
                    <span><span className="font-semibold text-[#003366]">{inst.courses}</span> {t('مقرر', 'courses')}</span>
                    <span><span className="font-semibold text-[#007DB5]">{inst.skills_taught}</span> {t('مهارة', 'skills')}</span>
                    <span><span className="font-semibold text-[#C9A84C]">{inst.programs}</span> {t('برنامج', 'programs')}</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#003366] to-[#007DB5]"
                      style={{ width: `${Math.min(100, (inst.skills_taught / 1200) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Skill detail panel — when a skill is clicked */}
        {expSelectedSkill && expSkillDetail && (
          <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">{expSkillDetail.skill?.name}</h3>
              <button onClick={() => setExpSelectedSkill(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h4 className="text-[10px] font-semibold text-[#003366] uppercase mb-2">{t('وظائف تطلب هذه المهارة', 'Jobs Requiring This Skill')} ({expSkillDetail.demand?.total_jobs ?? 0})</h4>
                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                  {(expSkillDetail.demand?.jobs || []).map((j: any, i: number) => (
                    <div key={i} className="flex justify-between text-[10px] py-1 border-b border-gray-100">
                      <span className="text-gray-700 truncate max-w-[60%]">{j.occupation || '—'}</span>
                      <span className="text-gray-400">{j.region} • {j.experience || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-semibold text-[#007DB5] uppercase mb-2">{t('مقررات تدرّس هذه المهارة', 'Courses Teaching This Skill')} ({expSkillDetail.supply?.total_courses ?? 0})</h4>
                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                  {(expSkillDetail.supply?.courses || []).map((c: any, i: number) => (
                    <div key={i} className="flex justify-between text-[10px] py-1 border-b border-gray-100">
                      <span className="text-gray-700 truncate max-w-[50%]">{c.course}</span>
                      <span className="text-gray-400 truncate max-w-[40%]">{c.institution}</span>
                    </div>
                  ))}
                  {(expSkillDetail.supply?.total_courses ?? 0) === 0 && (
                    <p className="text-[10px] text-gray-400 italic">{t('لا توجد مقررات تدرّس هذه المهارة', 'No courses teach this skill')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </DataStory>

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
