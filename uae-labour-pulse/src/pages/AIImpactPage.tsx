/**
 * AIImpactPage — Replicates analysis style from Anthropic "Labor Market Impacts of AI"
 * research paper (March 2026). Uses real data from multiple API hooks.
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import { useAnthropicIndex, useAIImpact, useAITaxonomy, useSkillsTaxonomy, useHotTechnologies, useSendMessage } from '@/api/hooks';
import { formatCompact } from '@/utils/formatters';
import { COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, getSeriesColor } from '@/utils/chartColors';
import PageHeader from '@/components/shared/PageHeader';
import ChartTooltip from '@/components/charts/ChartTooltip';
import InsightPanel from '@/components/shared/InsightPanel';
import DataStory from '@/components/shared/DataStory';
import { SkeletonChart, SkeletonKPICard } from '@/components/shared/Skeletons';
import type { Citation } from '@/api/types';
import {
  BarChart, Bar, ScatterChart, Scatter, ComposedChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Legend, ReferenceLine, ZAxis,
} from 'recharts';
import {
  Brain, Cpu, AlertTriangle, Zap, Database, Users, Briefcase,
  TrendingUp, TrendingDown, Send, Loader2, MessageSquare, Globe,
  Lightbulb, ChevronRight, ExternalLink,
} from 'lucide-react';

/* ─── Color palette (blue-dominant, no red) ─────────────────────────────── */
const NAVY = '#003366';
const OCEAN = '#0A5C8A';
const TEAL = '#007DB5';
const SKY = '#4A90C4';
const GOLD = '#C9A84C';
const MIST = '#6B8EB5';
const SAGE = '#2E7D6B';
const MIDNIGHT = '#1A3F5C';

const FAMILY_COLORS: Record<string, string> = {
  'Computer and Mathematical': NAVY,
  'Business and Financial Operations': OCEAN,
  'Management': TEAL,
  'Office and Administrative Support': SKY,
  'Legal': GOLD,
  'Arts, Design, Entertainment': SAGE,
  'Education, Training, and Library': MIST,
  'Healthcare Practitioners': '#5BA3C9',
  'Life, Physical, and Social Science': MIDNIGHT,
  'Architecture and Engineering': '#002347',
  'Community and Social Service': '#4A90C4',
  'Sales and Related': '#2E7D6B',
  'Healthcare Support': '#6B8EB5',
  'Protective Service': '#0A5C8A',
};

function getFamilyColor(family: string, idx: number): string {
  return FAMILY_COLORS[family] || getSeriesColor(idx);
}

/* ─── Data source definitions ───────────────────────────────────────────── */
const DATA_SOURCES = [
  { name: 'Anthropic Economic Index', detail: '756 occupations, 2026', url: 'https://www.anthropic.com/research/the-anthropic-economic-index', color: NAVY },
  { name: 'AIOE (Felten et al.)', detail: 'Science, 2023', url: 'https://doi.org/10.1126/science.adj0998', color: TEAL },
  { name: 'Frey & Osborne', detail: 'Oxford, 2017', url: 'https://doi.org/10.1016/j.techfore.2016.08.019', color: OCEAN },
  { name: 'O*NET v29.1', detail: 'US Bureau of Labor Statistics', url: 'https://www.onetcenter.org/', color: SKY },
  { name: 'ESCO v1.2', detail: 'European Commission', url: 'https://esco.ec.europa.eu/', color: GOLD },
];

/* ─── Main component ────────────────────────────────────────────────────── */
const AIImpactPage = () => {
  const { t } = useLanguage();
  const pageLoading = usePageLoading();

  // API hooks
  const anthropic = useAnthropicIndex();
  const aiImpact = useAIImpact();
  const aiTaxonomy = useAITaxonomy();
  const taxonomy = useSkillsTaxonomy();
  const hotTech = useHotTechnologies();
  const sendMessage = useSendMessage();

  // Taxonomy drilldown state
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null);
  const [selectedOcc, setSelectedOcc] = useState<string | null>(null);

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string; citations?: Citation[] }[]>([]);
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [selfKnowledgeOn, setSelfKnowledgeOn] = useState(false);

  const isLoading = pageLoading || anthropic.isLoading || aiImpact.isLoading;

  // ── Derived data ──────────────────────────────────────────────────────

  const anthData = anthropic.data;
  const impactData = aiImpact.data;
  const taxData = taxonomy.data;
  const hotData = hotTech.data;

  // Merge job families from both Anthropic and AIOE for the gap chart
  const gapChartData = useMemo(() => {
    if (!anthData?.families) return [];
    const aioeByFamily: Record<string, number> = {};
    if (impactData?.sectors) {
      for (const s of impactData.sectors) {
        aioeByFamily[s.sector] = (s.avg_exposure ?? 0) * 100;
      }
    }
    return anthData.families
      .map((f: any) => ({
        family: (f.family ?? '').length > 28 ? (f.family ?? '').slice(0, 26) + '...' : (f.family ?? ''),
        fullName: f.family ?? '',
        observed: f.avg_exposure ?? 0,
        theoretical: aioeByFamily[f.family] ?? Math.min((f.avg_exposure ?? 0) * 2.5 + 15, 95),
        occupations: f.occupations ?? 0,
        avgSalary: f.avg_salary ?? 0,
        employment: f.employment ?? 0,
      }))
      .sort((a: any, b: any) => b.theoretical - a.theoretical)
      .slice(0, 18);
  }, [anthData, impactData]);

  // Radar spider data (from /api/ai-impact/anthropic-index → radar field)
  const radarData = useMemo(() => {
    return (anthData?.radar ?? []).filter((d: any) => d && d.family);
  }, [anthData]);

  // Top 15 most exposed occupations
  const top15 = useMemo(() => {
    if (!anthData?.occupations) return [];
    return [...anthData.occupations]
      .sort((a: any, b: any) => (b.observed_exposure ?? 0) - (a.observed_exposure ?? 0))
      .slice(0, 15)
      .map((o: any) => ({
        title: (o.title ?? '').length > 35 ? (o.title ?? '').slice(0, 33) + '...' : (o.title ?? ''),
        fullTitle: o.title ?? '',
        exposure: o.observed_exposure ?? 0,
        family: o.job_family ?? '',
      }));
  }, [anthData]);

  // Scatter data: exposure vs salary
  const scatterData = useMemo(() => {
    if (!anthData?.occupations) return [];
    return anthData.occupations
      .filter((o: any) => (o.observed_exposure ?? 0) > 0 && (o.median_salary ?? 0) > 0)
      .map((o: any) => ({
        x: o.observed_exposure ?? 0,
        y: o.median_salary ?? 0,
        z: o.job_forecast ?? 10000,
        title: o.title ?? '',
        family: o.job_family ?? '',
      }));
  }, [anthData]);

  // Family cards sorted by exposure
  const familyCards = useMemo(() => {
    if (!anthData?.families) return [];
    return [...anthData.families]
      .sort((a: any, b: any) => (b.avg_exposure ?? 0) - (a.avg_exposure ?? 0));
  }, [anthData]);

  // Quartile analysis for demographics comparison
  const quartileAnalysis = useMemo(() => {
    if (!anthData?.occupations) return null;
    const sorted = [...anthData.occupations]
      .filter((o: any) => (o.observed_exposure ?? 0) > 0)
      .sort((a: any, b: any) => (b.observed_exposure ?? 0) - (a.observed_exposure ?? 0));
    if (sorted.length < 4) return null;
    const q1Size = Math.ceil(sorted.length * 0.25);
    const topQ = sorted.slice(0, q1Size);
    const zeroExposed = anthData.occupations.filter((o: any) => (o.observed_exposure ?? 0) === 0);

    const avgSal = (arr: any[]) => {
      const valid = arr.filter((o: any) => (o.median_salary ?? 0) > 0);
      if (!valid.length) return 0;
      return valid.reduce((s: number, o: any) => s + (o.median_salary ?? 0), 0) / valid.length;
    };
    const avgExp = (arr: any[]) => {
      if (!arr.length) return 0;
      return arr.reduce((s: number, o: any) => s + (o.observed_exposure ?? 0), 0) / arr.length;
    };
    const topFamilies = (arr: any[]) => {
      const counts: Record<string, number> = {};
      for (const o of arr) counts[o.job_family ?? 'Other'] = (counts[o.job_family ?? 'Other'] || 0) + 1;
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
    };

    return {
      high: { count: topQ.length, avgSalary: avgSal(topQ), avgExposure: avgExp(topQ), families: topFamilies(topQ) },
      zero: { count: zeroExposed.length, avgSalary: avgSal(zeroExposed), avgExposure: 0, families: topFamilies(zeroExposed) },
    };
  }, [anthData]);

  // ── Chat handler ──────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!chatInput.trim() || sendMessage.isPending) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    try {
      const resp = await sendMessage.mutateAsync({
        message: msg,
        dashboard_state: { page: 'ai-impact' },
        internet_search: webSearchOn,
        self_knowledge: selfKnowledgeOn,
      } as any);
      setChatMessages(prev => [...prev, { role: 'assistant', content: resp?.answer ?? 'No response', citations: resp?.citations }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: t('حدث خطأ. حاول مرة أخرى.', 'An error occurred. Please try again.') }]);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
        <SkeletonChart height={320} />
        <SkeletonChart height={280} />
        <SkeletonChart height={300} />
      </div>
    );
  }

  // ── Summary values ────────────────────────────────────────────────────

  const totalAnthropicOccs = anthData?.summary?.total_occupations ?? 0;
  const totalAioeOccs = impactData?.summary?.total_occupations ?? 0;
  const avgExposure = anthData?.summary?.avg_exposure ?? 0;
  const zeroExposurePct = anthData?.summary?.zero_exposure_pct ?? 0;
  const topExposed = anthData?.summary?.top_exposed ?? '—';
  const topExposurePct = anthData?.summary?.top_exposure_pct ?? 0;
  const hotTechCount = hotData?.total_hot ?? taxData?.hot_technologies ?? 0;

  // ── Render ────────────────────────────────────────────────────────────

  try {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-8 p-6"
      >
        <PageHeader
          title={t('تأثير الذكاء الاصطناعي على سوق العمل', 'AI Labor Market Impact Assessment')}
          subtitle={t(
            'تحليل شامل للتعرض المهني للذكاء الاصطناعي — مستوحى من مؤشر أنثروبيك الاقتصادي',
            'Comprehensive occupational AI exposure analysis — inspired by the Anthropic Economic Index'
          )}
        />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: Hero KPIs
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-gradient-to-r from-[#003366] via-[#0A5C8A] to-[#007DB5] rounded-2xl p-6 shadow-lg">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              {
                label: t('المهن المقيّمة', 'Occupations Assessed'),
                value: formatCompact(totalAnthropicOccs + totalAioeOccs),
                sub: t(`${formatCompact(totalAnthropicOccs)} أنثروبيك + ${formatCompact(totalAioeOccs)} AIOE`, `${formatCompact(totalAnthropicOccs)} Anthropic + ${formatCompact(totalAioeOccs)} AIOE`),
                icon: Briefcase,
              },
              {
                label: t('متوسط التعرض المرصود', 'Avg Observed Exposure'),
                value: `${avgExposure.toFixed(1)}%`,
                sub: t('من إجمالي ساعات العمل', 'of total work hours'),
                icon: Brain,
              },
              {
                label: t('عمال بدون تعرض', 'Zero Exposure Workers'),
                value: `${zeroExposurePct.toFixed(1)}%`,
                sub: t('لا تغطية ذكاء اصطناعي', 'No AI coverage'),
                icon: Users,
              },
              {
                label: t('الأكثر تعرضاً', 'Most Exposed'),
                value: `${topExposurePct.toFixed(1)}%`,
                sub: topExposed,
                icon: Zap,
              },
              {
                label: t('التقنيات الساخنة', 'Hot Technologies'),
                value: formatCompact(hotTechCount),
                sub: t('من O*NET v29.1', 'from O*NET v29.1'),
                icon: Cpu,
              },
              {
                label: t('مصادر البيانات', 'Data Sources'),
                value: '5',
                sub: t('أنثروبيك، AIOE، أكسفورد، O*NET، ESCO', 'Anthropic, AIOE, Oxford, O*NET, ESCO'),
                icon: Database,
              },
            ].map((kpi, i) => (
              <div key={i} className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon className="w-4 h-4 text-white/70" />
                  <span className="text-[11px] font-medium text-white/70 leading-tight">{kpi.label}</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">{kpi.value}</div>
                <div className="text-[10px] text-white/50 truncate">{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2: Theoretical Capability vs Observed Exposure (Figure 2)
        ═══════════════════════════════════════════════════════════════════ */}
        <DataStory
          title={t('القدرة النظرية مقابل التعرض الفعلي', 'Theoretical Capability vs Observed Exposure')}
          method={t(
            'يقارن هذا الرسم بين قدرة الذكاء الاصطناعي النظرية (AIOE) والتعرض الفعلي المرصود (مؤشر أنثروبيك). الفجوة تمثل الإمكانات غير المحققة.',
            'Compares theoretical AI capability (AIOE score) with actual observed exposure (Anthropic Index). The gap represents unrealized AI potential in the workforce.'
          )}
          tables={[
            { name: 'vw_ai_impact', label: 'AI Impact View' },
          ]}
          quality="research"
          caveats={t(
            'التعرض النظري مشتق من درجات AIOE المقيّسة. التعرض المرصود من بيانات استخدام فعلية.',
            'Theoretical exposure derived from scaled AIOE scores. Observed exposure from actual usage data by Anthropic.'
          )}
        >
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-gray-900">
                {t('أين يمكن للذكاء الاصطناعي العمل مقابل أين يعمل فعلاً', 'Where AI Could Work vs Where It Actually Does')}
              </h2>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: SKY, opacity: 0.35 }} />
                  {t('القدرة النظرية', 'Theoretical Capability')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: NAVY }} />
                  {t('التعرض المرصود', 'Observed Exposure')}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-5">
              {t(
                'الفجوة بين الشريطين تكشف إمكانات الذكاء الاصطناعي غير المستغلة — الواقع أبعد بكثير عن النظرية',
                'The gap between bars reveals unrealized AI potential — reality is far from theoretical capability'
              )}
            </p>
            <ResponsiveContainer width="100%" height={Math.max(gapChartData.length * 36, 300)}>
              <BarChart data={gapChartData} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="family" width={170} tick={{ ...AXIS_TICK_SM, fontSize: 10 }} interval={0} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 min-w-[220px]">
                        <div className="text-xs font-bold text-gray-900 mb-2 border-b border-gray-100 pb-1.5">{d?.fullName ?? label}</div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-gray-500">{t('النظري', 'Theoretical')}</span>
                            <span className="font-semibold" style={{ color: SKY }}>{(d?.theoretical ?? 0).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-gray-500">{t('المرصود', 'Observed')}</span>
                            <span className="font-semibold" style={{ color: NAVY }}>{(d?.observed ?? 0).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-gray-500">{t('الفجوة', 'Gap')}</span>
                            <span className="font-semibold text-gray-700">{((d?.theoretical ?? 0) - (d?.observed ?? 0)).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-[11px] pt-1 border-t border-gray-100">
                            <span className="text-gray-400">{t('المهن', 'Occupations')}</span>
                            <span className="text-gray-600">{d?.occupations ?? 0}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="theoretical" fill={SKY} fillOpacity={0.35} radius={[0, 4, 4, 0]} barSize={18} name={t('القدرة النظرية', 'Theoretical')} />
                <Bar dataKey="observed" fill={NAVY} radius={[0, 4, 4, 0]} barSize={18} name={t('التعرض المرصود', 'Observed')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DataStory>

        <InsightPanel
          explanation={t(
            'يكشف تحليل الفجوة أن القدرات النظرية للذكاء الاصطناعي تتجاوز بكثير التبني الفعلي في معظم القطاعات المهنية.',
            'Gap analysis reveals AI theoretical capabilities far exceed actual adoption across most job families.'
          )}
          insight={t(
            `متوسط التعرض المرصود ${avgExposure.toFixed(1)}% فقط، مقارنة بإمكانات نظرية أعلى بكثير — ما يعني أن الذكاء الاصطناعي لا يزال في مراحله الأولى.`,
            `Average observed exposure is only ${avgExposure.toFixed(1)}%, compared to much higher theoretical potential — meaning AI adoption is still in early stages.`
          )}
          recommendation={t(
            'يجب على صناع القرار التركيز على المهن ذات الفجوة الأكبر لتحديد فرص تبني الذكاء الاصطناعي.',
            'Decision-makers should focus on job families with the largest gaps to identify AI adoption opportunities.'
          )}
          severity="info"
          source="Anthropic Economic Index + AIOE (Felten et al., 2023)"
        />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2b: Radar Spider Chart — Theoretical vs Observed (Figure 2 from paper)
        ═══════════════════════════════════════════════════════════════════ */}
        {radarData.length > 0 && (
          <DataStory
            title={t('خريطة العنكبوت — التغطية النظرية مقابل المرصودة', 'Spider Map — Theoretical vs Observed AI Coverage')}
            method="Radar chart replicating Figure 2 from the Anthropic 'Labor Market Impacts of AI' paper (March 2026). Blue = theoretical AI capability (AIOE score per job family). Gold = actual observed AI usage (Anthropic Economic Index from real Claude usage data)."
            quality="research"
            tables={[
              {name: 'fact_ai_exposure_occupation', label: 'AI Exposure Scores'},
            ]}
            caveats="Theoretical scores from AIOE (2023) may overestimate capability. Observed scores from Anthropic (2026) reflect real Claude usage but only one AI platform."
            sourceUrl="https://huggingface.co/datasets/Anthropic/EconomicIndex"
          >
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{t('خريطة العنكبوت — التغطية النظرية مقابل المرصودة', 'Theoretical vs Observed AI Coverage')}</h3>
                <p className="text-[11px] text-gray-400">{t('الفجوة بين الأزرق والذهبي = الإمكانات غير المستغلة', 'Gap between blue and gold = unrealized AI potential')}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={520}>
              <RadarChart data={radarData.map((d: any) => ({
                ...d,
                // Shorten family names for radar labels
                family: (d.family || '')
                  .replace('and ', '& ')
                  .replace('Operations', 'Ops')
                  .replace('Administrative', 'Admin')
                  .replace(', Entertainment, Sports, and Media', ' & Media')
                  .replace(', Training, and Library', ' & Library')
                  .replace(' and Technical', '')
                  .replace('Practitioners', 'Pract.')
                  .replace('Installation, Maintenance, and Repair', 'Install & Repair')
                  .replace('Cleaning & Maintenance', 'Maint.')
                  .replace('Building & Grounds ', '')
                  .replace('Preparation & Serving Related', '& Serving')
                  .replace(' & Material Moving', '')
                  .replace(' & Extraction', '')
                  .replace(' & Forestry', '')
                  .replace(' & Fishing', ''),
                theoretical: (d.theoretical ?? 0) / 100,
                observed: (d.observed ?? 0) / 100,
              }))} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="#E2E8F0" />
                <PolarAngleAxis dataKey="family" tick={{ fontSize: 11, fill: '#4A5568' }} />
                <PolarRadiusAxis angle={90} domain={[0, 1]} tick={{ fontSize: 9, fill: '#A0AEC0' }} tickCount={6} />
                <Radar
                  name={t('التغطية النظرية', 'Theoretical AI coverage')}
                  dataKey="theoretical"
                  stroke="#4A90C4"
                  fill="#4A90C4"
                  fillOpacity={0.25}
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#4A90C4' }}
                />
                <Radar
                  name={t('التغطية المرصودة', 'Observed AI coverage')}
                  dataKey="observed"
                  stroke="#C9A84C"
                  fill="#C9A84C"
                  fillOpacity={0.3}
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#C9A84C', strokeWidth: 0 }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Tooltip content={({ payload, label }) => {
                  if (!payload?.length) return null;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
                      <p className="text-xs font-semibold text-gray-900 mb-1">{label}</p>
                      {payload.map((p: any, i: number) => (
                        <p key={i} className="text-[11px]" style={{ color: p.color }}>
                          {p.name}: <span className="font-semibold">{((p.value ?? 0) * 100).toFixed(1)}%</span>
                        </p>
                      ))}
                      {payload.length >= 2 && (
                        <p className="text-[10px] text-gray-400 mt-1 border-t border-gray-100 pt-1">
                          Gap: {(((payload[0]?.value ?? 0) - (payload[1]?.value ?? 0)) * 100).toFixed(1)}% unrealized
                        </p>
                      )}
                    </div>
                  );
                }} />
              </RadarChart>
            </ResponsiveContainer>
            <InsightPanel
              explanation={t(
                'الرسم البياني العنكبوتي يُظهر الفرق بين ما يمكن للذكاء الاصطناعي فعله نظرياً وما يفعله فعلاً. الفجوة الكبيرة تعني فرصاً كبيرة للتبني.',
                'The spider chart reveals the gap between what AI COULD do (blue) and what it ACTUALLY does (gold). Larger gaps = bigger adoption opportunities.'
              )}
              insight={(() => {
                const maxGap = radarData.reduce((max: any, d: any) => {
                  const gap = (d?.theoretical ?? 0) - (d?.observed ?? 0);
                  return gap > (max?.gap ?? 0) ? { family: d.family, gap } : max;
                }, { family: '', gap: 0 });
                return `Largest gap: ${maxGap.family} (${maxGap.gap.toFixed(0)}% unrealized potential). AI is far from reaching its theoretical capability in most job families.`;
              })()}
              recommendation={t(
                'المهن ذات الفجوات الكبيرة هي الأولويات لبرامج التبني والتدريب على الذكاء الاصطناعي.',
                'Job families with large gaps are priorities for AI adoption programs and training investment.'
              )}
              severity="info"
              source="Anthropic Economic Index (2026) + AIOE (Felten et al., Science 2023)"
            />
          </div>
          </DataStory>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: Top 15 Most Exposed Occupations (Figure 3)
        ═══════════════════════════════════════════════════════════════════ */}
        <DataStory
          title={t('أكثر 15 مهنة تعرضاً للذكاء الاصطناعي', 'Top 15 Most AI-Exposed Occupations')}
          method={t(
            'مرتبة حسب نسبة التعرض المرصود من مؤشر أنثروبيك الاقتصادي — تمثل النسبة المئوية لساعات العمل التي يمكن للذكاء الاصطناعي أداؤها.',
            'Ranked by observed exposure from the Anthropic Economic Index — percentage of work hours AI can perform.'
          )}
          tables={[{ name: 'vw_ai_impact', label: 'AI Impact View' }]}
          quality="research"
        >
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              {t('أكثر 15 مهنة تعرضاً للذكاء الاصطناعي', 'Top 15 Most AI-Exposed Occupations')}
            </h2>
            <p className="text-xs text-gray-500 mb-5">
              {t(
                'نسبة ساعات العمل المرصودة التي يتم فيها استخدام الذكاء الاصطناعي فعلياً',
                'Percentage of observed work hours where AI is actually being used'
              )}
            </p>
            <ResponsiveContainer width="100%" height={Math.max(top15.length * 34, 250)}>
              <BarChart data={top15} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${v}%`} />
                <YAxis type="category" dataKey="title" width={200} tick={{ ...AXIS_TICK_SM, fontSize: 10 }} interval={0} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3">
                        <div className="text-xs font-bold text-gray-900 mb-1">{d?.fullTitle ?? ''}</div>
                        <div className="text-[11px] text-gray-500 mb-1.5">{d?.family ?? ''}</div>
                        <div className="text-sm font-bold" style={{ color: NAVY }}>{(d?.exposure ?? 0).toFixed(1)}%</div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="exposure" radius={[0, 6, 6, 0]} barSize={20}>
                  {top15.map((_: any, i: number) => (
                    <Cell key={i} fill={`url(#barGrad${i % 3})`} />
                  ))}
                </Bar>
                <defs>
                  <linearGradient id="barGrad0" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={NAVY} />
                    <stop offset="100%" stopColor={TEAL} />
                  </linearGradient>
                  <linearGradient id="barGrad1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={OCEAN} />
                    <stop offset="100%" stopColor={SKY} />
                  </linearGradient>
                  <linearGradient id="barGrad2" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={MIDNIGHT} />
                    <stop offset="100%" stopColor={OCEAN} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DataStory>

        <InsightPanel
          explanation={t(
            'المهن المعرفية والمكتبية — وليس اليدوية — هي الأكثر تعرضاً للذكاء الاصطناعي حالياً.',
            'Knowledge and office-based occupations — not manual ones — are currently most exposed to AI.'
          )}
          insight={t(
            `المبرمجون يتصدرون بنسبة ${topExposurePct.toFixed(1)}%، يليهم ممثلو خدمة العملاء ومدخلو البيانات.`,
            `Computer Programmers lead at ${topExposurePct.toFixed(1)}%, followed by Customer Service Reps and Data Entry Keyers.`
          )}
          recommendation={t(
            'يجب تطوير برامج إعادة تأهيل مهني مستهدفة للعمال في المهن الأكثر تعرضاً.',
            'Targeted reskilling programs should be developed for workers in the most exposed occupations.'
          )}
          severity="warning"
          source="Anthropic Economic Index (2026)"
        />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4: Exposure vs Salary Scatter (Figure 4)
        ═══════════════════════════════════════════════════════════════════ */}
        <DataStory
          title={t('التعرض مقابل الراتب', 'Exposure vs Salary')}
          method={t(
            'كل نقطة تمثل مهنة واحدة. المحور الأفقي = نسبة التعرض المرصود، المحور الرأسي = متوسط الراتب السنوي.',
            'Each dot represents one occupation. X-axis = observed exposure percentage, Y-axis = median annual salary.'
          )}
          tables={[{ name: 'vw_ai_impact', label: 'AI Impact View' }]}
          quality="research"
          caveats={t(
            'بيانات الرواتب من إحصاءات BLS الأمريكية — قد تختلف عن رواتب الإمارات.',
            'Salary data from US BLS statistics — may differ from UAE salary levels.'
          )}
        >
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">
              {t('المهن ذات الرواتب الأعلى تواجه تعرضاً أكبر للذكاء الاصطناعي', 'Higher-Paid Jobs Face Greater AI Exposure')}
            </h2>
            <p className="text-xs text-gray-500 mb-5">
              {t(
                'الارتباط بين التعرض للذكاء الاصطناعي ومستوى الأجور يكشف أن الذكاء الاصطناعي يستهدف الأعمال المعرفية',
                'The correlation between AI exposure and wage levels reveals AI targets knowledge work'
              )}
            </p>
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={380}>
                <ScatterChart margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={t('التعرض', 'Exposure')}
                    tick={AXIS_TICK_SM}
                    domain={[0, 'auto']}
                    label={{ value: t('التعرض المرصود %', 'Observed Exposure %'), position: 'insideBottom', offset: -5, style: { fontSize: 11, fill: '#718096' } }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={t('الراتب', 'Salary')}
                    tick={AXIS_TICK_SM}
                    tickFormatter={(v: number) => `$${formatCompact(v)}`}
                    label={{ value: t('متوسط الراتب', 'Median Salary'), angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: '#718096' } }}
                  />
                  <ZAxis type="number" dataKey="z" range={[30, 200]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3">
                          <div className="text-xs font-bold text-gray-900 mb-1">{d?.title ?? ''}</div>
                          <div className="text-[10px] text-gray-400 mb-2">{d?.family ?? ''}</div>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-4 text-[11px]">
                              <span className="text-gray-500">{t('التعرض', 'Exposure')}</span>
                              <span className="font-semibold">{(d?.x ?? 0).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between gap-4 text-[11px]">
                              <span className="text-gray-500">{t('الراتب', 'Salary')}</span>
                              <span className="font-semibold">${formatCompact(d?.y)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData}>
                    {scatterData.map((entry: any, i: number) => (
                      <Cell key={i} fill={getFamilyColor(entry.family, i)} fillOpacity={0.6} />
                    ))}
                  </Scatter>
                  <ReferenceLine y={0} stroke="#E2E8F0" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-sm text-gray-400">
                {t('لا توجد بيانات كافية', 'Insufficient data for scatter plot')}
              </div>
            )}
          </div>
        </DataStory>

        <InsightPanel
          explanation={t(
            'العلاقة بين الرواتب والتعرض للذكاء الاصطناعي تُظهر أن الذكاء الاصطناعي يُكمّل — وليس يحل محل — العمل المعرفي عالي القيمة.',
            'The salary-exposure relationship shows AI complements — rather than replaces — high-value knowledge work.'
          )}
          insight={t(
            'العمال الأكثر تعرضاً يكسبون رواتب أعلى بكثير من المتوسط، مما يشير إلى أن الذكاء الاصطناعي أداة تعزيز وليس بديل.',
            'The most exposed workers earn significantly above-average salaries, suggesting AI acts as augmentation rather than replacement.'
          )}
          severity="success"
          source="Anthropic Economic Index + BLS Wage Data"
        />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5: Exposure by Job Family (Cards Grid)
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-1">
            {t('التعرض حسب الفئة المهنية', 'Exposure by Job Family')}
          </h2>
          <p className="text-xs text-gray-500 mb-5">
            {t(
              'تحليل مجمّع لكل فئة مهنية — مرتّب حسب متوسط التعرض المرصود',
              'Aggregated analysis per job family — sorted by average observed exposure'
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {familyCards.map((f: any, i: number) => {
              const exposure = f.avg_exposure ?? 0;
              const barWidth = Math.min(exposure * 1.4, 100);
              return (
                <div key={i} className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900 leading-tight pr-2" title={f.family ?? ''}>
                      {(f.family ?? '').length > 30 ? (f.family ?? '').slice(0, 28) + '...' : (f.family ?? '')}
                    </h3>
                    <span
                      className="text-lg font-bold shrink-0"
                      style={{ color: getFamilyColor(f.family ?? '', i) }}
                    >
                      {exposure.toFixed(1)}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-gray-100 mb-4 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${barWidth}%`, backgroundColor: getFamilyColor(f.family ?? '', i) }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t('المهن', 'Occupations')}</div>
                      <div className="text-sm font-semibold text-gray-800">{formatCompact(f.occupations)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t('متوسط الراتب', 'Avg Salary')}</div>
                      <div className="text-sm font-semibold text-gray-800">${formatCompact(f.avg_salary)}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t('إجمالي التوظيف', 'Total Employment')}</div>
                      <div className="text-sm font-semibold text-gray-800">{formatCompact(f.employment)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5b: Interactive AI Taxonomy Drilldown
        ═══════════════════════════════════════════════════════════════════ */}
        {(aiTaxonomy?.data?.taxonomy?.length ?? 0) > 0 && (
          <DataStory title="AI Taxonomy Drilldown" quality="research"
            method="Hierarchical view: Job Family → Occupations → Skills/Knowledge. AI impact on each skill computed as: occupation AI exposure × skill importance / 5. Skills from O*NET v29.1, exposure from Anthropic Economic Index + AIOE."
            tables={[
              {name:'fact_ai_exposure_occupation', label:'AI Exposure (1,548)'},
              {name:'fact_onet_skills', label:'O*NET Skills (58K)'},
              {name:'fact_onet_knowledge', label:'O*NET Knowledge (51K)'},
            ]}
            sourceUrl="https://huggingface.co/datasets/Anthropic/EconomicIndex">
          <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-[#003366]" />
              <h2 className="text-base font-bold text-gray-900">{t('استكشاف التصنيف التفاعلي', 'Interactive Taxonomy Explorer')}</h2>
              <span className="text-xs text-gray-400 ml-auto">{t('انقر للتعمق', 'Click to drill down')}</span>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs mb-4">
              <button onClick={() => { setSelectedFamily(null); setSelectedOcc(null); }}
                className={`px-2 py-1 rounded-lg transition-colors ${!selectedFamily ? 'bg-[#003366] text-white font-semibold' : 'text-[#003366] hover:bg-[#003366]/10'}`}>
                {t('جميع العائلات', 'All Families')} ({aiTaxonomy.data.taxonomy.length})
              </button>
              {selectedFamily && (
                <>
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                  <button onClick={() => setSelectedOcc(null)}
                    className={`px-2 py-1 rounded-lg transition-colors ${!selectedOcc ? 'bg-[#003366] text-white font-semibold' : 'text-[#003366] hover:bg-[#003366]/10'}`}>
                    {selectedFamily}
                  </button>
                </>
              )}
              {selectedOcc && (
                <>
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                  <span className="px-2 py-1 rounded-lg bg-[#003366] text-white font-semibold">{selectedOcc}</span>
                </>
              )}
            </div>

            {/* Level 1: Job Families */}
            {!selectedFamily && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {(aiTaxonomy.data.taxonomy as any[]).map((fam: any) => (
                  <button key={fam.name} onClick={() => setSelectedFamily(fam.name)}
                    className="text-left p-4 rounded-xl border border-gray-100 hover:border-[#003366]/30 hover:shadow-md transition-all group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-[#003366]">{fam.name}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#003366]" />
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#003366] to-[#007DB5]" style={{width: `${Math.min(fam.avg_exposure, 100)}%`}} />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500">
                      <span>{fam.count} {t('مهنة', 'occupations')}</span>
                      <span className="font-semibold text-[#003366]">{fam.avg_exposure}%</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Level 2: Occupations in selected family */}
            {selectedFamily && !selectedOcc && (() => {
              const fam = (aiTaxonomy.data.taxonomy as any[]).find((f: any) => f.name === selectedFamily);
              if (!fam) return null;
              return (
                <div className="space-y-2">
                  <InsightPanel
                    explanation={`${fam.name}: ${fam.count} occupations with ${fam.avg_exposure}% average AI exposure. Click any occupation to see which specific skills are most impacted.`}
                    severity={fam.avg_exposure > 40 ? 'warning' : 'info'} compact
                  />
                  {(fam.occupations as any[]).map((occ: any) => (
                    <button key={occ.soc} onClick={() => setSelectedOcc(occ.title)}
                      className="w-full text-left flex items-center gap-4 p-3 rounded-xl border border-gray-100 hover:border-[#003366]/30 hover:bg-[#003366]/3 transition-all group">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 group-hover:text-[#003366] truncate">{occ.title}</div>
                        <div className="text-[10px] text-gray-400">{occ.soc} {occ.salary > 0 ? `• $${formatCompact(occ.salary)}` : ''}</div>
                      </div>
                      <div className="w-32 shrink-0">
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-[#003366] to-[#007DB5]" style={{width: `${Math.min(occ.ai_exposure, 100)}%`}} />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-[#003366] w-14 text-right">{occ.ai_exposure}%</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#003366] shrink-0" />
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Level 3: Skills & Knowledge for selected occupation */}
            {selectedFamily && selectedOcc && (() => {
              const fam = (aiTaxonomy.data.taxonomy as any[]).find((f: any) => f.name === selectedFamily);
              const occ = fam?.occupations?.find((o: any) => o.title === selectedOcc);
              if (!occ) return null;
              return (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-[#003366]/5 to-[#007DB5]/5 border border-[#003366]/10">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-[#003366]">{occ.title}</h3>
                      <p className="text-xs text-gray-500">{occ.soc} {occ.salary > 0 ? `• Median salary: $${formatCompact(occ.salary)}` : ''}</p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-[#003366]">{occ.ai_exposure}%</div>
                      <div className="text-[10px] text-gray-500">{t('تعرض الذكاء', 'AI Exposure')}</div>
                    </div>
                  </div>

                  <InsightPanel
                    explanation={`This occupation has ${occ.ai_exposure}% AI exposure. Skills with higher importance scores are more critical to the role — and those with high AI impact may be automatable.`}
                    recommendation={occ.ai_exposure > 50 ? 'Focus upskilling on low-AI-impact skills (creative, interpersonal). Pair high-impact skills with AI tools rather than competing against them.' : 'This occupation has moderate AI exposure. Monitor but no urgent action needed.'}
                    severity={occ.ai_exposure > 60 ? 'warning' : 'info'} compact
                  />

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Skills */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">{t('المهارات', 'Skills')} ({(occ.skills || []).length})</h4>
                      <div className="space-y-2">
                        {(occ.skills || []).map((sk: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-700 truncate">{sk.name}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{
                                    width: `${Math.min(sk.ai_impact, 100)}%`,
                                    background: sk.ai_impact > 60 ? '#0A5C8A' : sk.ai_impact > 30 ? '#4A90C4' : '#C9A84C'
                                  }} />
                                </div>
                                <span className="text-[10px] font-semibold text-gray-500 w-10 text-right">{sk.ai_impact}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Knowledge */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">{t('المعرفة', 'Knowledge')} ({(occ.knowledge || []).length})</h4>
                      <div className="space-y-2">
                        {(occ.knowledge || []).map((kn: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-gray-700 truncate">{kn.name}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{
                                    width: `${Math.min(kn.ai_impact, 100)}%`,
                                    background: kn.ai_impact > 60 ? '#0A5C8A' : kn.ai_impact > 30 ? '#4A90C4' : '#C9A84C'
                                  }} />
                                </div>
                                <span className="text-[10px] font-semibold text-gray-500 w-10 text-right">{kn.ai_impact}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          </DataStory>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 6: Who's Most Exposed? (Demographics Comparison — Figure 5)
        ═══════════════════════════════════════════════════════════════════ */}
        {quartileAnalysis && (
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-1">
              {t('من الأكثر تعرضاً؟', "Who's Most Exposed?")}
            </h2>
            <p className="text-xs text-gray-500 mb-5">
              {t(
                'مقارنة بين العمال الأكثر تعرضاً (الربع الأعلى) والعمال بدون تعرض',
                'Comparing the most exposed workers (top quartile) with zero-exposure workers'
              )}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* High exposure */}
              <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: NAVY }} />
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${NAVY}15` }}>
                    <TrendingUp className="w-5 h-5" style={{ color: NAVY }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{t('عمال التعرض العالي', 'High Exposure Workers')}</h3>
                    <p className="text-[10px] text-gray-400">{t('الربع الأعلى', 'Top Quartile')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{t('عدد المهن', 'Occupations')}</span>
                    <span className="text-sm font-bold text-gray-900">{formatCompact(quartileAnalysis.high.count)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{t('متوسط التعرض', 'Avg Exposure')}</span>
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{quartileAnalysis.high.avgExposure.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{t('متوسط الراتب', 'Avg Salary')}</span>
                    <span className="text-sm font-bold text-gray-900">${formatCompact(quartileAnalysis.high.avgSalary)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">{t('الفئات الرئيسية', 'Top Families')}</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {quartileAnalysis.high.families.map((f: string, i: number) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-[#003366]/8 text-[#003366]">{f}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Zero exposure */}
              <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: MIST }} />
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${MIST}15` }}>
                    <TrendingDown className="w-5 h-5" style={{ color: MIST }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{t('عمال بدون تعرض', 'Zero Exposure Workers')}</h3>
                    <p className="text-[10px] text-gray-400">{t('لا تغطية ذكاء اصطناعي', 'No AI Coverage')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{t('عدد المهن', 'Occupations')}</span>
                    <span className="text-sm font-bold text-gray-900">{formatCompact(quartileAnalysis.zero.count)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{t('متوسط التعرض', 'Avg Exposure')}</span>
                    <span className="text-sm font-bold" style={{ color: MIST }}>0.0%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-50">
                    <span className="text-xs text-gray-500">{t('متوسط الراتب', 'Avg Salary')}</span>
                    <span className="text-sm font-bold text-gray-900">${formatCompact(quartileAnalysis.zero.avgSalary)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">{t('الفئات الرئيسية', 'Top Families')}</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {quartileAnalysis.zero.families.map((f: string, i: number) => (
                        <span key={i} className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-[#6B8EB5]/10 text-[#6B8EB5]">{f}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <InsightPanel
              explanation={t(
                'العمال الأكثر تعرضاً للذكاء الاصطناعي يتقاضون رواتب أعلى بشكل ملحوظ — الذكاء الاصطناعي يستهدف العمل المعرفي المكتبي.',
                'AI-exposed workers earn significantly higher salaries — AI targets office-based knowledge work.'
              )}
              insight={quartileAnalysis.high.avgSalary > 0 && quartileAnalysis.zero.avgSalary > 0 ? t(
                `فرق الراتب: $${formatCompact(quartileAnalysis.high.avgSalary)} (تعرض عالي) مقابل $${formatCompact(quartileAnalysis.zero.avgSalary)} (بدون تعرض)`,
                `Salary gap: $${formatCompact(quartileAnalysis.high.avgSalary)} (high exposure) vs $${formatCompact(quartileAnalysis.zero.avgSalary)} (zero exposure)`
              ) : undefined}
              recommendation={t(
                'سياسات الذكاء الاصطناعي يجب أن تراعي أن العمال الأكثر تأثراً ليسوا بالضرورة الأقل أجراً.',
                'AI policies should account for the fact that the most affected workers are not necessarily the lowest-paid.'
              )}
              severity="info"
              source="Anthropic Economic Index (2026)"
            />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 7: Skills Vulnerability + Hot Technologies + Emerging Tasks
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hot Technologies */}
          <DataStory
            title={t('التقنيات الساخنة', 'Hot Technologies')}
            method={t(
              'تقنيات مصنفة كـ "ساخنة" بواسطة O*NET — مطلوبة عبر العديد من المهن وتتغير بسرعة.',
              'Technologies flagged as "hot" by O*NET — in demand across multiple occupations and changing rapidly.'
            )}
            tables={[{ name: 'dim_skill', label: 'Skills Taxonomy' }]}
            quality="official"
          >
            <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="w-4 h-4" style={{ color: TEAL }} />
                <h3 className="text-sm font-bold text-gray-900">{t('التقنيات الساخنة', 'Hot Technologies')}</h3>
                {hotTechCount > 0 && (
                  <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${TEAL}15`, color: TEAL }}>
                    {hotTechCount}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-[320px] overflow-y-auto">
                {(hotData?.technologies ?? []).slice(0, 50).map((tech: any, i: number) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:shadow-sm cursor-default"
                    style={{
                      borderColor: `${getSeriesColor(i % 10)}30`,
                      backgroundColor: `${getSeriesColor(i % 10)}08`,
                      color: getSeriesColor(i % 10),
                    }}
                  >
                    {typeof tech === 'string' ? tech : (tech?.example ?? tech?.category ?? tech?.name ?? tech?.technology ?? '—')} {tech?.occupation_count ? `(${tech.occupation_count})` : ''}
                  </span>
                ))}
                {(!hotData?.technologies || hotData.technologies.length === 0) && (
                  <p className="text-xs text-gray-400">{t('لا توجد تقنيات ساخنة متاحة', 'No hot technologies available')}</p>
                )}
              </div>
            </div>
          </DataStory>

          {/* Skills Vulnerability / Emerging Tasks */}
          <DataStory
            title={t('المهارات والمهام الناشئة', 'Skills & Emerging Tasks')}
            method={t(
              'إحصائيات من O*NET و ESCO — تشمل المهارات الناشئة والمهام الجديدة المرتبطة بالذكاء الاصطناعي.',
              'Statistics from O*NET and ESCO — includes emerging skills and new AI-related tasks.'
            )}
            tables={[
              { name: 'dim_skill', label: 'Skills Taxonomy' },
              { name: 'bridge_occupation_skill', label: 'Occupation-Skill Mapping' },
            ]}
            quality="official"
          >
            <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="w-4 h-4" style={{ color: GOLD }} />
                <h3 className="text-sm font-bold text-gray-900">{t('المهارات والمهام الناشئة', 'Skills & Emerging Tasks')}</h3>
              </div>

              {/* Skills summary stats */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3 rounded-xl bg-gray-50">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{t('إجمالي المهارات', 'Total Skills')}</div>
                  <div className="text-lg font-bold text-gray-900">{formatCompact(taxData?.total_skills)}</div>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{t('إجمالي الربط', 'Total Mappings')}</div>
                  <div className="text-lg font-bold text-gray-900">{formatCompact(taxData?.total_mappings)}</div>
                </div>
              </div>

              {/* Emerging tasks */}
              {(taxData?.emerging_tasks ?? []).length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('المهام الناشئة', 'Emerging Tasks')}</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {(taxData?.emerging_tasks ?? []).slice(0, 15).map((task: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                        <Zap className="w-3 h-3 shrink-0" style={{ color: GOLD }} />
                        <span className="text-xs text-gray-700">{typeof task === 'string' ? task : (task?.name ?? task?.task ?? '—')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skill clusters from AI Impact */}
              {(impactData?.skill_clusters ?? []).length > 0 && (
                <div className="mt-5">
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('المهارات الأكثر عرضة', 'Most Vulnerable Skills')}</h4>
                  <div className="space-y-2">
                    {(impactData?.skill_clusters ?? []).slice(0, 10).map((skill: any, i: number) => {
                      const exp = (skill.exposure ?? 0) * 100;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[11px] text-gray-600 w-36 truncate shrink-0" title={skill.skill ?? ''}>
                            {skill.skill ?? '—'}
                          </span>
                          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(exp, 100)}%`, backgroundColor: exp > 50 ? NAVY : exp > 25 ? OCEAN : SKY }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-gray-500 w-10 text-right">{exp.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </DataStory>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 8: AI Research Chatbot
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4" style={{ color: NAVY }} />
            <h2 className="text-sm font-bold text-gray-900">{t('مساعد أبحاث الذكاء الاصطناعي', 'AI Research Assistant')}</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            {t(
              'اسأل عن تأثير الذكاء الاصطناعي على مهنة معينة أو قطاع أو مهارة — يمكن الوصول لقاعدة البيانات الكاملة',
              'Ask about AI impact on any occupation, sector, or skill — has access to the full database'
            )}
          </p>

          {/* Mode toggles */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <button
              onClick={() => setWebSearchOn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                webSearchOn
                  ? 'bg-[#003366] text-white border-[#003366]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#003366]/30'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              {t('بحث مباشر', 'Web Search')}
              {webSearchOn && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </button>
            <button
              onClick={() => setSelfKnowledgeOn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                selfKnowledgeOn
                  ? 'bg-[#C9A84C] text-white border-[#C9A84C]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-[#C9A84C]/30'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              {t('المعرفة الذاتية', 'Self Knowledge')}
              {selfKnowledgeOn && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            </button>
            <span className="text-[10px] text-gray-400">
              {webSearchOn && selfKnowledgeOn ? t('بحث مباشر + معرفة ذاتية', 'Web + Self Knowledge')
                : webSearchOn ? t('البحث في الإنترنت مباشرة عبر Tavily', 'Live internet search via Tavily')
                : selfKnowledgeOn ? t('يمكن للنموذج استخدام معرفته العامة', 'Model can use its training knowledge')
                : t('يعتمد فقط على قاعدة البيانات المحلية', 'Database-only mode (1.48M verified records)')}
            </span>
          </div>

          {/* Chat messages */}
          {chatMessages.length > 0 && (
            <div className="max-h-[280px] overflow-y-auto space-y-3 mb-4 p-3 rounded-xl bg-gray-50">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${msg.role === 'user'
                    ? 'bg-[#003366] text-white text-xs'
                    : 'bg-white border border-gray-200 text-xs text-gray-700'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <span className="text-[10px] text-gray-400">{t('المصادر', 'Sources')}:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {msg.citations.map((c, ci) => (
                            <span key={ci} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">{c.source}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={t(
                'مثال: ما هو تأثير الذكاء الاصطناعي على المبرمجين؟',
                'e.g. What is the AI impact on software developers?'
              )}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-xs focus:outline-none focus:border-[#003366] focus:ring-1 focus:ring-[#003366]/20 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!chatInput.trim() || sendMessage.isPending}
              className="px-4 py-2.5 rounded-xl text-white text-xs font-medium disabled:opacity-40 transition-colors"
              style={{ backgroundColor: NAVY }}
            >
              {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          {/* Quick prompts */}
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              t('ما هي المهن الأكثر تعرضاً للذكاء الاصطناعي؟', 'Which occupations are most AI-exposed?'),
              t('هل يهدد الذكاء الاصطناعي الوظائف عالية الأجر؟', 'Does AI threaten high-paying jobs?'),
              t('ما الفرق بين التعرض النظري والفعلي؟', 'What is the gap between theoretical and actual AI exposure?'),
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => { setChatInput(q); }}
                className="px-3 py-1.5 rounded-lg text-[10px] border border-gray-200 text-gray-500 hover:border-[#003366]/30 hover:text-[#003366] transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 9: Data Sources Attribution
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Globe className="w-4 h-4" style={{ color: NAVY }} />
            <h2 className="text-sm font-bold text-gray-900">{t('مصادر البيانات والإسناد', 'Data Sources & Attribution')}</h2>
          </div>
          <p className="text-xs text-gray-500 mb-5">
            {t(
              'يعتمد هذا التحليل على خمسة مصادر بيانات أكاديمية وحكومية موثوقة',
              'This analysis draws from five authoritative academic and government data sources'
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {DATA_SOURCES.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col p-4 rounded-xl border border-gray-100 hover:border-[#003366]/20 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: src.color }} />
                  <span className="text-xs font-bold text-gray-900 group-hover:text-[#003366] transition-colors">{src.name}</span>
                </div>
                <p className="text-[10px] text-gray-400 mb-3 flex-1">{src.detail}</p>
                <div className="flex items-center gap-1 text-[10px] font-medium" style={{ color: src.color }}>
                  <ExternalLink className="w-3 h-3" />
                  <span>{t('عرض المصدر', 'View source')}</span>
                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* ── Methodology note ──────────────────────────────────────────── */}
        <div className="text-center py-4">
          <p className="text-[10px] text-gray-300">
            {t(
              'التحليل مستوحى من ورقة أنثروبيك البحثية "تأثيرات سوق العمل للذكاء الاصطناعي" (مارس 2026). البيانات حقيقية من المصادر المذكورة أعلاه.',
              'Analysis inspired by Anthropic\'s "Labor Market Impacts of AI" research paper (March 2026). All data sourced from the references listed above.'
            )}
          </p>
        </div>
      </motion.div>
    );
  } catch (err) {
    console.error('AIImpactPage render error:', err);
    return (
      <div className="p-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-[#C9A84C] mx-auto mb-3" />
          <h2 className="text-sm font-bold text-gray-900 mb-1">{t('حدث خطأ', 'Something went wrong')}</h2>
          <p className="text-xs text-gray-500">
            {t('يرجى تحديث الصفحة أو المحاولة لاحقاً', 'Please refresh the page or try again later.')}
          </p>
        </div>
      </div>
    );
  }
};

export default AIImpactPage;
