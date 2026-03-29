import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import DataStory from '@/components/shared/DataStory';
import PageHeader from '@/components/shared/PageHeader';
import KPICard from '@/components/shared/KPICard';
import ChartTooltip from '@/components/charts/ChartTooltip';
import { useSupplyDashboard, useSuppliedSkills } from '@/api/hooks';
import { COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, getSeriesColor, SERIES_COLORS, BAR_RADIUS, BAR_RADIUS_H } from '@/utils/chartColors';
import { formatCompact, formatNumber, formatPercent } from '@/utils/formatters';
import { usePageLoading } from '@/hooks/usePageLoading';
import { SkeletonKPICard, SkeletonChart, SkeletonTable } from '@/components/shared/Skeletons';
import { ErrorState, ChartEmpty } from '@/components/shared/EmptyState';
import InsightPanel, { severityFromValue } from '@/components/shared/InsightPanel';
import {
  GraduationCap, BookOpen, Users, Award, Database, ChevronDown, ChevronRight,
  MapPin, FlaskConical, Building2,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Treemap,
} from 'recharts';

// ── Palette ──────────────────────────────────────────────────────────────────
const PIE_COLORS = [
  COLORS.navy, COLORS.teal, COLORS.gold, COLORS.emerald,
  COLORS.coral, COLORS.copper, COLORS.slate, '#8B5CF6', '#06B6D4', '#F59E0B',
];

const GENDER_COLORS: Record<string, string> = {
  Male: COLORS.navy,
  Female: COLORS.teal,
  male: COLORS.navy,
  female: COLORS.teal,
};

// ── Animation Helpers ────────────────────────────────────────────────────────
const stagger = {
  container: { hidden: {}, show: { transition: { staggerChildren: 0.07 } } },
  item: { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } } },
};

const hoverLift = {
  whileHover: { y: -4, transition: { duration: 0.25 } },
};

// ── Source badge helper ──────────────────────────────────────────────────────
const srcStyle = (s: string) => {
  if (s.includes('bayanat')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s.includes('web_scrape') || s.includes('scrape')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s.includes('estimated') || s.includes('Estimated')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s.includes('caa')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (s.includes('ceic') || s.includes('CEIC')) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
};

const SourceTag = ({ source }: { source: string }) => {
  if (!source) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium border ${srcStyle(source)}`}>
      <Database className="w-2.5 h-2.5" />
      {source.replace(/_/g, ' ')}
    </span>
  );
};

// ── Glass card wrapper ───────────────────────────────────────────────────────
const GlassCard = ({
  title, subtitle, source, delay = 0, className = '', children, colSpan,
}: {
  title: string; subtitle?: string; source?: string; delay?: number;
  className?: string; children: React.ReactNode; colSpan?: string;
}) => (
  <div
    className={`
      relative overflow-hidden rounded-2xl border border-gray-100
      bg-white shadow-md hover:shadow-lg transition-shadow duration-200
      ${colSpan || ''} ${className}
    `}
  >
    <div className="relative p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-primary">{title}</h3>
          {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {source && <SourceTag source={source} />}
      </div>
      {children}
    </div>
  </div>
);

// ── Animated counter ─────────────────────────────────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  return <>{formatCompact(value)}</>;
}

// ── Progress Ring SVG ────────────────────────────────────────────────────────
function ProgressRing({ percent, color, size = 80, strokeWidth = 7 }: { percent: number; color: string; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

// ── Custom Treemap content ───────────────────────────────────────────────────
const TreemapContent = (props: any) => {
  const { x, y, width, height, name, enrollment, index } = props;
  if (width < 50 || height < 30) return null;
  const color = PIE_COLORS[index % PIE_COLORS.length];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={color} fillOpacity={0.85}
        stroke="#fff" strokeWidth={2} className="transition-all hover:fill-opacity-100" />
      {width > 70 && height > 45 && (
        <>
          <text x={x + 8} y={y + 18} fontSize={11} fontWeight={600} fill="#fff">
            {name?.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + '...' : name}
          </text>
          <text x={x + 8} y={y + 33} fontSize={10} fill="rgba(255,255,255,0.8)">
            {formatCompact(enrollment)}
          </text>
        </>
      )}
    </g>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const SupplySidePage = () => {
  const { t } = useLanguage();
  const pageLoading = usePageLoading();
  const { data: supply, isLoading: supplyLoading, error: supplyError, refetch: refetchSupply } = useSupplyDashboard();
  const { data: supSkills } = useSuppliedSkills({ limit: 20 });

  const [sourcesOpen, setSourcesOpen] = useState(false);

  const isLoading = pageLoading || supplyLoading;

  // ── Derived data ──────────────────────────────────────────────────────────
  const genderData = useMemo(() => {
    if (!supply?.by_gender) return [];
    return Object.entries(supply.by_gender).map(([key, val]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: val,
    }));
  }, [supply?.by_gender]);

  const stemData = useMemo(() => {
    if (!supply?.stem_split) return { stem: 0, nonStem: 0, total: 0, stemPct: 0 };
    const stem = supply.stem_split.find(s => s.indicator.toLowerCase().includes('stem'))?.count || 0;
    const nonStem = supply.stem_split.find(s => !s.indicator.toLowerCase().includes('stem') || s.indicator.toLowerCase().includes('non'))?.count || 0;
    const total = stem + nonStem;
    return { stem, nonStem, total, stemPct: total > 0 ? Math.round((stem / total) * 100) : 0 };
  }, [supply?.stem_split]);

  const enrollmentSpark = useMemo(
    () => supply?.enrollment_trend?.map(e => e.enrollment) || [],
    [supply?.enrollment_trend],
  );

  const graduateSpark = useMemo(
    () => supply?.graduate_trend?.map(g => g.graduates) || [],
    [supply?.graduate_trend],
  );

  const funnelData = useMemo(() => {
    if (!supply?.kpis) return [];
    const enrolled = supply.kpis.total_enrolled || 0;
    const graduated = supply.kpis.total_graduates || 0;
    return [
      { stage: t('الملتحقون', 'Enrolled'), value: enrolled, color: COLORS.navy },
      { stage: t('الخريجون', 'Graduated'), value: graduated, color: COLORS.teal },
    ];
  }, [supply, t]);

  // Emirates sorted by enrollment for map
  const emirateSorted = useMemo(
    () => [...(supply?.by_emirate || [])].sort((a, b) => b.enrollment - a.enrollment),
    [supply?.by_emirate],
  );

  const maxEmirateEnroll = useMemo(
    () => emirateSorted.length > 0 ? Math.max(...emirateSorted.map(e => e.enrollment)) : 1,
    [emirateSorted],
  );

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 bg-surface-tertiary rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonKPICard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={280} />
          <SkeletonChart height={280} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SkeletonChart height={240} />
          <SkeletonChart height={240} />
          <SkeletonChart height={240} />
        </div>
        <SkeletonTable rows={6} cols={5} />
      </div>
    );
  }

  if (supplyError) {
    return (
      <div className="p-6">
        <PageHeader
          title={t('جانب العرض', 'Supply Side')}
          subtitle={t('خط الإمداد التعليمي والقوى العاملة', 'Education Pipeline & Workforce')}
        />
        <ErrorState message="Failed to load supply-side data" onRetry={() => refetchSupply()} />
      </div>
    );
  }

  if (!supply) {
    return (
      <div className="p-6">
        <PageHeader
          title={t('جانب العرض', 'Supply Side')}
          subtitle={t('خط الإمداد التعليمي والقوى العاملة', 'Education Pipeline & Workforce')}
        />
        <ChartEmpty />
      </div>
    );
  }

  const kpis = supply?.kpis || {} as any;

  try { return (
    <div
      variants={stagger.container}
      initial="hidden"
      animate="show"
      className="space-y-6 p-6 max-w-[1440px] mx-auto"
    >
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={t('جانب العرض في سوق العمل', 'Labour Market Supply Side')}
        subtitle={t(
          'خط الإمداد التعليمي، الخريجون، القوى العاملة والمؤسسات في الإمارات',
          'Education pipeline, graduates, workforce & institutions across the UAE',
        )}
      />

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 1 — HERO KPI CARDS
          ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div variants={stagger.item}>
          <KPICard
            icon={Building2}
            label={t('إجمالي المؤسسات', 'Total Institutions')}
            value={kpis ? formatCompact(kpis.total_institutions) : '—'}
            status="info"
            delay={0}
            sourceLabel="CAA / SCAD"
          />
        </div>
        <div variants={stagger.item}>
          <KPICard
            icon={BookOpen}
            label={t('إجمالي البرامج', 'Total Programs')}
            value={kpis ? formatCompact(kpis.total_programs) : '—'}
            status="info"
            delay={0.05}
            sourceLabel="CAA / Web Scrape"
          />
        </div>
        <div variants={stagger.item}>
          <KPICard
            icon={Users}
            label={t('إجمالي الملتحقين', 'Total Enrolled')}
            value={kpis ? formatCompact(kpis.total_enrolled) : '—'}
            status="success"
            sparkData={enrollmentSpark}
            delay={0.1}
            sourceLabel="Bayanat / SCAD"
          />
        </div>
        <div variants={stagger.item}>
          <KPICard
            icon={Award}
            label={t('إجمالي الخريجين', 'Total Graduates')}
            value={kpis ? formatCompact(kpis.total_graduates) : '—'}
            status="success"
            sparkData={graduateSpark}
            delay={0.15}
            sourceLabel="Bayanat / SCAD"
          />
        </div>
      </div>

      {/* KPI Summary Insight */}
      <InsightPanel
        explanation="These KPIs show the total higher education supply pipeline in the UAE — from institutions offering programs to students graduating into the workforce."
        insight={supply?.kpis ? `The UAE has ${supply.kpis.total_institutions} active institutions producing ${formatCompact(supply.kpis.total_graduates)} graduates annually. The graduation rate is approximately ${supply.kpis.total_graduates && supply.kpis.total_enrolled ? ((supply.kpis.total_graduates / supply.kpis.total_enrolled) * 100).toFixed(1) : '\u2014'}% of enrolled students.` : undefined}
        recommendation="Monitor the graduation-to-enrollment ratio. Values below 15% may indicate high dropout rates or long program durations requiring policy intervention."
        severity="info"
        source="Bayanat (FCSA), CAA Accreditation Data, 20 University Websites"
      />

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 2 — ENROLLMENT TREND + EDUCATION PIPELINE FUNNEL
          ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Enrollment Trend — spans 2 cols */}
        <DataStory
          title="Enrollment Trend"
          method="Annual HE enrollment aggregated from Bayanat education CSVs (2002-2024). 7 of 17 years are estimated via linear interpolation from 2012-2017 official data."
          quality="official+estimated"
          tables={[{name:'fact_program_enrollment', label:'Program Enrollment (668 rows)'}]}
          caveats="Gold dots mark estimated values (2018-2024). Official data from CEIC/Ministry of Planning (2002-2017) only."
          sourceUrl="https://bayanat.ae/en/dataset?groups=education"
        >
        <GlassCard
          title={t('اتجاه الالتحاق', 'Enrollment Trend')}
          subtitle={t('عبر السنوات — المنقّط تقديري', 'Over the years — dotted areas are estimated')}
          source={supply?.enrollment_trend?.[0]?.sources?.[0]}
          colSpan="lg:col-span-2"
        >
          {supply?.enrollment_trend?.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={supply.enrollment_trend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.navy} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="enrollGradEst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={COLORS.gold} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone" dataKey="enrollment" name={t('الالتحاق', 'Enrollment')}
                  stroke={COLORS.navy} strokeWidth={2.5} fill="url(#enrollGrad)"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!payload) return <circle key={`dot-${cx}`} />;
                    return (
                      <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={payload.is_estimated ? 3 : 4}
                        fill={payload.is_estimated ? COLORS.gold : COLORS.navy}
                        stroke="#fff" strokeWidth={2}
                      />
                    );
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : <ChartEmpty />}
          {/* Source badges */}
          {(supply?.enrollment_trend || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[...new Set((supply.enrollment_trend || []).flatMap(e => e.sources || []))].map(src => (
                <SourceTag key={src} source={src} />
              ))}
            </div>
          )}
        </GlassCard>
        </DataStory>

        {/* Education Pipeline Funnel */}
        <GlassCard
          title={t('خط الإمداد التعليمي', 'Education Pipeline')}
          subtitle={t('من الالتحاق إلى التوظيف', 'From enrollment to employment')}
        >
          <div className="space-y-4 mt-2">
            {funnelData.map((stage, i) => {
              const maxVal = funnelData[0]?.value || 1;
              const pct = Math.round((stage.value / maxVal) * 100);
              return (
                <div
                  key={stage.stage}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.12, duration: 0.5 }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-primary">{stage.stage}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: stage.color }}>
                      {formatCompact(stage.value)}
                    </span>
                  </div>
                  <div className="h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg"
                      style={{
                        background: `linear-gradient(90deg, ${stage.color}, ${stage.color}CC)`,
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.3 + i * 0.12, duration: 0.8, ease: 'easeOut' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white mix-blend-difference">
                        {pct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Conversion rates */}
          {funnelData.length >= 2 && funnelData[0].value > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="text-center">
                <div className="text-lg font-bold text-navy">
                  {formatPercent(funnelData[1].value / funnelData[0].value * 100, 0)}
                </div>
                <div className="text-[10px] text-text-muted">{t('نسبة التخرج', 'Graduation Rate')}</div>
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Enrollment Trend Insight */}
      {(() => {
        const trend = supply?.enrollment_trend || [];
        const recent = trend.slice(-3);
        const isGrowing = recent.length >= 2 && recent[recent.length - 1]?.enrollment > recent[0]?.enrollment;
        const estimatedCount = trend.filter(e => e.is_estimated).length;
        return (
          <InsightPanel
            explanation="Enrollment trend tracks the total number of students entering UAE higher education over time. Gold dots indicate estimated values where official data is unavailable."
            insight={trend.length > 0 ? `Enrollment ${isGrowing ? 'has been growing' : 'shows fluctuation'} over the past ${trend.length} years. ${estimatedCount > 0 ? `${estimatedCount} of ${trend.length} data points are estimated \u2014 treat with caution.` : 'All data points are from official sources.'}` : undefined}
            recommendation={isGrowing ? "Growing enrollment is positive but must be matched with labour market demand. Cross-reference with the Demand Side page to ensure graduates align with job openings." : "Stagnant or declining enrollment may signal access barriers or shifting preferences toward vocational training. Investigate by emirate and discipline."}
            severity={isGrowing ? 'success' : 'warning'}
            source="Bayanat Education Statistics (397 CSVs), CEIC/Ministry of Planning"
          />
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 3 — UAE EMIRATES MAP + GENDER + DEGREE DISTRIBUTION
          ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

        {/* Emirate Enrollment Card */}
        <DataStory
          title="Enrollment by Emirate"
          method="Student enrollment distributed across 7 UAE emirates from Bayanat HE statistics."
          quality="official"
          tables={[{name:'fact_program_enrollment', label:'Program Enrollment'}, {name:'dim_region', label:'UAE Emirates (7)'}]}
          sourceUrl="https://bayanat.ae/en/dataset?groups=education"
        >
        <GlassCard
          title={t('الالتحاق حسب الإمارة', 'Enrollment by Emirate')}
          subtitle={t('التوزيع الجغرافي للطلاب', 'Geographic student distribution')}
          source="bayanat"
        >
          <div className="space-y-3 mt-1">
            {emirateSorted.map((em, i) => {
              const pct = Math.round((em.enrollment / maxEmirateEnroll) * 100);
              return (
                <div
                  key={em.region_code}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3" style={{ color: getSeriesColor(i) }} />
                      <span className="text-xs font-medium text-primary">{em.emirate}</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-primary">
                      {formatCompact(em.enrollment)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ background: getSeriesColor(i) }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ delay: 0.15 + i * 0.06, duration: 0.7, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
        </DataStory>

        {/* Gender Distribution — Donut */}
        <DataStory
          title="Gender Distribution"
          method="Male vs Female enrollment counts from Bayanat education datasets."
          quality="official"
          tables={[{name:'fact_program_enrollment', label:'Program Enrollment'}]}
          sourceUrl="https://bayanat.ae/en/dataset?groups=education"
        >
        <GlassCard
          title={t('التوزيع حسب الجنس', 'Gender Distribution')}
          subtitle={t('نسبة الطلاب الذكور والإناث', 'Male vs female student ratio')}
          source="bayanat"
        >
          {genderData.length > 0 ? (
            <div className="flex flex-col items-center">
              <div className="relative">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie
                      data={genderData} dataKey="value" nameKey="name"
                      cx="50%" cy="50%" innerRadius={60} outerRadius={85}
                      paddingAngle={4} strokeWidth={0}
                    >
                      {genderData.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={GENDER_COLORS[entry.name] || getSeriesColor(i)}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-primary">
                    {formatCompact(genderData.reduce((s, g) => s + g.value, 0))}
                  </span>
                  <span className="text-[9px] text-text-muted">{t('إجمالي', 'Total')}</span>
                </div>
              </div>
              {/* Legend */}
              <div className="flex gap-6 mt-3">
                {genderData.map(entry => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ background: GENDER_COLORS[entry.name] || COLORS.slate }}
                    />
                    <div>
                      <div className="text-xs font-semibold text-primary">{entry.name}</div>
                      <div className="text-[10px] text-text-muted">{formatCompact(entry.value)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : <ChartEmpty />}
        </GlassCard>
        </DataStory>

        {/* Degree Level Distribution — Vertical Bar */}
        <DataStory
          title="Degree Level Distribution"
          method="Program count by degree level (Bachelor, Master, PhD, Diploma, etc.) from CAA accreditation database + web-scraped university websites."
          quality="official+scraped"
          tables={[{name:'dim_program', label:'Academic Programs (3,433)'}]}
          caveats="2,423 programs from CAA accreditation list + 1,010 web-scraped from 20 of 93 university websites. 73 universities not yet scraped."
          sourceUrl="https://www.caa.ae/Pages/Programs/All.aspx"
        >
        <GlassCard
          title={t('توزيع مستوى الدرجة', 'Degree Level Distribution')}
          subtitle={t('البرامج حسب المستوى الأكاديمي', 'Programs by academic level')}
          source="caa"
        >
          {supply?.program_distribution?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={supply.program_distribution} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="barDegreeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0.8} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="degree_level" tick={{ ...AXIS_TICK_SM, fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK_SM} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name={t('البرامج', 'Programs')} fill="url(#barDegreeGrad)" radius={BAR_RADIUS} />
              </BarChart>
            </ResponsiveContainer>
          ) : <ChartEmpty />}
        </GlassCard>
        </DataStory>
      </div>

      {/* Gender Distribution Insight */}
      {(() => {
        const male = supply?.by_gender?.M ?? supply?.by_gender?.male ?? 0;
        const female = supply?.by_gender?.F ?? supply?.by_gender?.female ?? 0;
        const total = male + female;
        const femalePct = total > 0 ? ((female / total) * 100).toFixed(1) : '\u2014';
        const gpi = male > 0 ? (female / male).toFixed(2) : '\u2014';
        return (
          <InsightPanel
            explanation="Gender distribution in higher education enrollment. The Gender Parity Index (GPI) measures female-to-male ratio — 1.0 means equal, above 1.0 means more females."
            insight={total > 0 ? `Female enrollment is ${femalePct}% of total (GPI: ${gpi}). ${Number(gpi) > 1.2 ? 'Women significantly outnumber men in higher education.' : Number(gpi) < 0.8 ? 'Men significantly outnumber women.' : 'Near gender parity.'}` : undefined}
            recommendation={Number(gpi) > 1.3 ? "The significant gender gap favoring women may reflect male preference for direct employment or vocational paths. Consider targeted programs to increase male higher education participation." : "Monitor gender balance across STEM vs non-STEM disciplines for more granular insights."}
            severity={Number(gpi) > 1.3 || Number(gpi) < 0.7 ? 'warning' : 'success'}
            source="Bayanat Education \u2014 HE Enrollment by Gender"
          />
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 4 — SPECIALTY TREEMAP + STEM SPLIT
          ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Specialty Treemap — 2 cols */}
        <DataStory
          title="Specializations by Enrollment"
          method="Enrollment by academic specialization from Bayanat private + government specialty datasets."
          quality="official"
          tables={[{name:'fact_program_enrollment', label:'Program Enrollment'}]}
          sourceUrl="https://bayanat.ae/en/dataset?groups=education"
        >
        <GlassCard
          title={t('التخصصات حسب الالتحاق', 'Specializations by Enrollment')}
          subtitle={t('أعلى التخصصات من حيث عدد الطلاب', 'Top specializations by student count')}
          colSpan="lg:col-span-2"
        >
          {supply?.by_specialty?.length ? (
            <ResponsiveContainer width="100%" height={300}>
              <Treemap
                data={supply.by_specialty.slice(0, 20).map((s, i) => ({
                  name: s.specialization,
                  enrollment: s.enrollment,
                  index: i,
                }))}
                dataKey="enrollment"
                aspectRatio={4 / 3}
                stroke="#fff"
                content={<TreemapContent />}
              >
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border-light rounded-xl shadow-dropdown px-3.5 py-2.5">
                        <div className="text-[11px] font-semibold text-primary mb-1">{d.name}</div>
                        <div className="text-[11px] text-text-muted">
                          {t('الالتحاق', 'Enrollment')}: <span className="font-bold text-primary">{formatNumber(d.enrollment)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          ) : <ChartEmpty />}
        </GlassCard>
        </DataStory>

        {/* STEM vs Non-STEM */}
        <DataStory
          title="STEM vs Non-STEM"
          method="Programs classified as STEM or Non-STEM based on CAA program discipline mapping."
          quality="official+scraped"
          tables={[{name:'dim_program', label:'Academic Programs'}]}
          caveats="Classification is based on program name matching to STEM disciplines. Some interdisciplinary programs may be miscategorized."
        >
        <GlassCard
          title={t('العلوم والتكنولوجيا', 'STEM vs Non-STEM')}
          subtitle={t('توزيع التخصصات العلمية والتقنية', 'Science & tech specialization split')}
        >
          <div className="flex flex-col items-center gap-6 mt-4">
            {/* STEM Ring */}
            <div className="relative">
              <ProgressRing percent={stemData.stemPct} color={COLORS.teal} size={140} strokeWidth={12} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <FlaskConical className="w-5 h-5 text-teal mb-1" />
                <span className="text-2xl font-bold text-primary">{stemData.stemPct}%</span>
                <span className="text-[9px] text-text-muted">STEM</span>
              </div>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-2 gap-3 w-full">
              <div
                className="text-center p-3 rounded-xl bg-gradient-to-br from-teal/10 to-teal/5 border border-teal/20"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="text-lg font-bold text-teal">{formatCompact(stemData.stem)}</div>
                <div className="text-[10px] text-text-muted font-medium">STEM</div>
              </div>
              <div
                className="text-center p-3 rounded-xl bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/20"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="text-lg font-bold text-gold">{formatCompact(stemData.nonStem)}</div>
                <div className="text-[10px] text-text-muted font-medium">Non-STEM</div>
              </div>
            </div>
          </div>
        </GlassCard>
        </DataStory>
      </div>

      {/* STEM vs Non-STEM Insight */}
      <InsightPanel
        explanation="STEM (Science, Technology, Engineering, Mathematics) graduates are critical for UAE's knowledge economy transition and Vision 2031 goals."
        insight={stemData.total > 0 ? `STEM programs represent ${stemData.stemPct}% of offerings. ${stemData.stemPct < 30 ? 'This is below the recommended 40% target for knowledge economies.' : stemData.stemPct > 40 ? 'Strong STEM representation aligned with economic diversification goals.' : 'Moderate STEM representation \u2014 room for growth.'}` : undefined}
        recommendation={stemData.stemPct < 35 ? "Increase STEM enrollment through scholarships, industry partnerships, and awareness campaigns. UAE's AI and technology sectors need 40%+ STEM graduates by 2030." : "Maintain STEM momentum while ensuring quality. Focus on emerging fields: AI, cybersecurity, renewable energy, and biotechnology."}
        severity={stemData.stemPct < 25 ? 'critical' : stemData.stemPct < 35 ? 'warning' : 'success'}
        source="Derived from CAA program classifications"
      />

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 5 — GRADUATE TREND + INSTITUTION RANKING
          ════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Graduate Trend */}
        <DataStory
          title="Graduate Trend"
          method="Annual graduate output from Bayanat graduate-by-institution datasets (2010-2024)."
          quality="official"
          tables={[{name:'fact_supply_graduates', label:'Graduate Counts (4,230 rows)'}]}
          sourceUrl="https://bayanat.ae/en/dataset?groups=education"
        >
        <GlassCard
          title={t('اتجاه الخريجين', 'Graduate Trend')}
          subtitle={t('الخريجون عبر السنوات', 'Graduates over the years')}
          source="bayanat"
        >
          {supply?.graduate_trend?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={supply.graduate_trend} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={COLORS.emerald} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone" dataKey="graduates" name={t('الخريجون', 'Graduates')}
                  stroke={COLORS.emerald} strokeWidth={2.5} fill="url(#gradGrad)"
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (!payload) return <circle key={`gd-${cx}`} />;
                    return (
                      <circle key={`gd-${cx}-${cy}`} cx={cx} cy={cy} r={payload.is_estimated ? 3 : 4}
                        fill={payload.is_estimated ? COLORS.gold : COLORS.emerald}
                        stroke="#fff" strokeWidth={2}
                      />
                    );
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : <ChartEmpty />}
        </GlassCard>
        </DataStory>

        {/* Institution Ranking */}
        <DataStory
          title="Institution Ranking"
          method="Institutions ranked by program count and graduate output. Data from CAA accreditation + Bayanat institutional statistics."
          quality="official+scraped"
          tables={[{name:'dim_institution', label:'HE Institutions (168)'}, {name:'dim_program', label:'Academic Programs (3,433)'}]}
          caveats="Some institutions show 0 graduates — may be newly established or data not yet available."
          sourceUrl="https://www.caa.ae/Pages/Institutes/All.aspx"
        >
        <GlassCard
          title={t('ترتيب المؤسسات', 'Institution Ranking')}
          subtitle={t('أفضل المؤسسات حسب البرامج والخريجين', 'Top institutions by programs & graduates')}
          source="caa"
        >
          {supply?.institution_ranking?.length ? (
            <div className="overflow-y-auto max-h-[280px] -mx-1 px-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white/90 z-10">
                  <tr className="text-text-muted text-left">
                    <th className="pb-2 pl-2 font-medium">#</th>
                    <th className="pb-2 font-medium">{t('المؤسسة', 'Institution')}</th>
                    <th className="pb-2 font-medium text-center">{t('البرامج', 'Programs')}</th>
                    <th className="pb-2 font-medium text-center">{t('الخريجون', 'Graduates')}</th>
                    <th className="pb-2 font-medium">{t('الإمارة', 'Emirate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {supply.institution_ranking.slice(0, 15).map((inst, i) => (
                    <tr
                      key={inst.institution}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="hover:bg-surface-tertiary/60 transition-colors"
                    >
                      <td className="py-2 pl-2">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                          i < 3 ? 'bg-gradient-to-br from-gold/20 to-gold/10 text-gold' : 'bg-gray-100 text-text-muted'
                        }`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2 font-medium text-primary max-w-[180px] truncate" title={inst.institution}>
                        {inst.institution}
                      </td>
                      <td className="py-2 text-center tabular-nums font-semibold text-navy">{inst.programs}</td>
                      <td className="py-2 text-center tabular-nums font-semibold text-emerald-600">{formatCompact(inst.graduates)}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-tertiary text-[10px] text-text-muted">
                          <MapPin className="w-2.5 h-2.5" />{inst.emirate}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <ChartEmpty />}
        </GlassCard>
        </DataStory>
      </div>

      {/* Institution Ranking Insight */}
      <InsightPanel
        explanation="Institution ranking by number of programs and graduate output. Larger institutions have more diverse offerings but smaller specialized institutions may have higher per-program impact."
        insight={`Top institutions are concentrated in ${[...new Set((supply?.institution_ranking || []).slice(0, 5).map(i => i.emirate))].join(', ')}. ${(supply?.institution_ranking || []).filter(i => i.graduates === 0).length} institutions report zero graduates (may be newly established or data gaps).`}
        recommendation="Assess institution performance not just by size but by graduate employment rates and employer satisfaction. Consider linking funding to outcome metrics."
        severity="info"
        source="CAA Accreditation Data, Bayanat Institutional Statistics"
      />

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 6b — SKILLS PRODUCED BY EDUCATION
          ════════════════════════════════════════════════════════════════════ */}
      {(supSkills?.skills?.length ?? 0) > 0 && (
        <DataStory title="Skills Produced by Education" quality="official+scraped"
          method="6,176 CAA courses mapped to ESCO skills via token matching. Top 5 matches per course with ≥30% overlap."
          tables={[{name:'fact_course_skills', label:'Course-Skill Maps (10.8K)'}, {name:'dim_skill', label:'ESCO Skills (21K)'}]}>
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('المهارات التي ينتجها التعليم', 'Skills Produced by Education')}</h3>
          <ResponsiveContainer width="100%" height={Math.min(500, (supSkills.skills.length || 1) * 28)}>
            <BarChart data={supSkills.skills} layout="vertical" margin={{ left: 140, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#718096' }} />
              <YAxis type="category" dataKey="skill" tick={{ fontSize: 10, fill: '#718096' }} width={135} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="course_count" name={t('عدد المقررات', 'Courses Teaching')} radius={[0, 4, 4, 0]} fill={COLORS.teal} />
            </BarChart>
          </ResponsiveContainer>
          <InsightPanel
            explanation={t('هذه المهارات مستخرجة من 6,176 مقرر دراسي معتمد من CAA ومطابقة مع تصنيف ESCO', 'Skills mapped from 6,176 CAA-accredited courses to ESCO skill taxonomy.')}
            insight={`${supSkills.skills.length} unique skills taught across ${formatCompact(supSkills.skills.reduce((s: number, sk: any) => s + (sk.course_count || 0), 0))} courses. Compare with Demand Side to see which taught skills match market needs.`}
            severity="info" compact
          />
        </div>
        </DataStory>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          SECTION 7 — DATA SOURCES PANEL
          ════════════════════════════════════════════════════════════════════ */}
      <div variants={stagger.item}>
        <div
          className="rounded-2xl border border-white/30 bg-white shadow-[0_4px_24px_rgba(0,51,102,0.06)] overflow-hidden"
        >
          <button
            onClick={() => setSourcesOpen(!sourcesOpen)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-tertiary/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-navy/10 to-teal/10">
                <Database className="w-4 h-4 text-navy" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-bold text-primary">{t('مصادر البيانات', 'Data Sources')}</h3>
                <p className="text-[11px] text-text-muted">
                  {supply?.sources?.length || 0} {t('مصدر بيانات', 'data sources')} &middot;{' '}
                  {formatCompact((supply?.sources || []).reduce((s, src) => s + (src.rows || 0), 0))} {t('صف إجمالي', 'total rows')}
                </p>
              </div>
            </div>
            <div
              animate={{ rotate: sourcesOpen ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="w-5 h-5 text-text-muted" />
            </div>
          </button>

          {sourcesOpen && supply?.sources && (
            <div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="border-t border-gray-100"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-5">
                {supply.sources.map((src, i) => (
                  <div
                    key={src.source}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-surface-tertiary/50 border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    <div
                      className="w-2 h-10 rounded-full shrink-0"
                      style={{ background: getSeriesColor(i) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-primary truncate" title={src.source}>
                        {src.source.replace(/_/g, ' ')}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-muted tabular-nums">
                          {formatCompact(src.rows)} {t('صف', 'rows')}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-text-muted font-medium">
                          {src.category}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Data Sources Insight */}
      <InsightPanel
        explanation="Data transparency: Every chart on this page traces back to specific sources. Gold-tagged data is estimated where official figures are unavailable."
        recommendation="For policy decisions, prioritize charts backed by Bayanat (official) data. Cross-validate estimated figures with institutional reports before using in formal analysis."
        severity="info"
        compact
      />

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  ); } catch (err: any) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h3 className="text-red-700 font-semibold mb-2">Supply Side rendering error</h3>
          <pre className="text-xs text-red-600 whitespace-pre-wrap break-all">{err?.message}{'\n'}{err?.stack?.split('\n').slice(1,4).join('\n')}</pre>
        </div>
      </div>
    );
  }
};

export default SupplySidePage;
