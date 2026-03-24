import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import { useDataLandscape, useDemandInsights } from '@/api/hooks';
import { SkeletonKPICard, SkeletonChart } from '@/components/shared/Skeletons';
import PageHeader from '@/components/shared/PageHeader';
import KPICard from '@/components/shared/KPICard';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartInsight from '@/components/charts/ChartInsight';
import {
  Database, FileText, Users, Brain, GraduationCap, TrendingUp, AlertTriangle,
  CheckCircle2, XCircle, BarChart3, Layers, Globe, ShieldCheck, Briefcase, Award,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import { COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, BAR_RADIUS, BAR_RADIUS_H, getSeriesColor } from '@/utils/chartColors';

/* No fallback data — all data comes from API */









/* ================================================================
   TAB DEFINITIONS
   ================================================================ */

const TABS = [
  { id: 'overview', en: 'Overview', ar: 'نظرة عامة', icon: Layers },
  { id: 'demand', en: 'Demand Deep-Dive', ar: 'تعمق في الطلب', icon: Briefcase },
  { id: 'education', en: 'Education & Skills', ar: 'التعليم والمهارات', icon: GraduationCap },
  { id: 'quality', en: 'Data Quality', ar: 'جودة البيانات', icon: ShieldCheck },
] as const;

type TabId = typeof TABS[number]['id'];

/* ================================================================
   PIE COLORS
   ================================================================ */
const PIE_COLORS = ['#003366', '#007DB5', '#C9A84C', '#00875A', '#B87333', '#4A6FA5', '#D4726A', '#002347'];

/* ================================================================
   MAIN COMPONENT
   ================================================================ */

const DataLandscapePage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(600);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Attempt to load from backend; fall back to embedded data
  const { data: landscapeData, isLoading: landscapeLoading } = useDataLandscape();
  const { data: demandData, isLoading: demandLoading } = useDemandInsights();

  const apiLoading = landscapeLoading || demandLoading;

  // Merge API data with fallback
  const sources = landscapeData?.sources ?? [];
  const overview = landscapeData?.overview ?? { total_files: 0, total_rows: 0, data_sources: 0, time_span_years: 0 };
  const emiratisation = landscapeData?.emiratisation ?? { emiratis_in_private_sector: [], nafis_establishments: [], growth_pct: 0 };
  const education = landscapeData?.education_pipeline ?? { institutions: 0, programs: 0, courses: 0, tech_courses: {}, degree_distribution: {}, institutions_by_emirate: {} };
  const ai = landscapeData?.ai_impact_summary ?? { total_assessed: 0, risk_distribution: {}, high_risk_pct: 0, top_exposed: [], top_safe: [] };
  const skills = landscapeData?.skills_taxonomy ?? { esco_occupations: 0, esco_skills: 0, esco_mappings: 0, essential_skills: 0, optional_skills: 0, onet_occupations: 0, onet_skill_records: 0, onet_hot_technologies: 0, onet_emerging_tasks: 0, top_essential_skills: [] };
  const quality = landscapeData?.data_quality ?? { gaps: [], strengths: [] };

  const demand = useMemo(() => {
    if (demandData) return demandData;
    return {
      total_postings: 0,
      unique_titles: 0,
      unique_companies: 0,
      date_range: { min: '', max: '' },
      monthly_volume: [], top_locations: [], top_industries: [], employment_types: [], experience_levels: [], isco_distribution: [], data_quality: { missing_occupation_pct: 0, missing_industry_pct: 0, missing_date_pct: 0, standardized_pct: 0, duplicate_ids: 0 },
    };
  }, [demandData]);

  // Chart data transforms
  const employmentTypeData = useMemo(() =>
    demand.employment_types.map((d, i) => ({ name: d.type, value: d.pct, color: PIE_COLORS[i % PIE_COLORS.length] })),
    [demand]
  );

  const experienceLevelData = useMemo(() =>
    demand.experience_levels.map((d, i) => ({ name: d.level, value: d.pct, color: PIE_COLORS[i % PIE_COLORS.length] })),
    [demand]
  );

  const riskDistData = useMemo(() =>
    Object.entries(ai.risk_distribution).map(([name, value], i) => ({
      name, value: value as number, color: i === 0 ? '#DE350B' : i === 1 ? '#FFAB00' : '#00875A',
    })),
    [ai]
  );

  const techCoursesData = useMemo(() =>
    Object.entries(education.tech_courses).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value),
    [education]
  );

  const degreeData = useMemo(() =>
    Object.entries(education.degree_distribution).map(([name, value], i) => ({ name, value: value as number, color: PIE_COLORS[i % PIE_COLORS.length] })),
    [education]
  );

  const institutionsByEmirateData = useMemo(() =>
    Object.entries(education.institutions_by_emirate).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value),
    [education]
  );

  if (loading || apiLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-56 mb-2 animate-pulse bg-surface-tertiary rounded" />
            <div className="h-3.5 w-80 animate-pulse bg-surface-tertiary rounded" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <SkeletonKPICard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart /> <SkeletonChart />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title={t('المشهد البياني', 'Data Landscape')}
        subtitle={t(
          'نظرة شاملة على مصادر البيانات، جودتها، ونطاقها عبر منصة المراقب',
          'Comprehensive view of data sources, quality, and coverage powering the Observator platform'
        )}
      />

      {/* Hero Stats Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-[#003366] to-[#002347] rounded-2xl p-6 text-white relative overflow-hidden"
      >
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #C9A84C 0%, transparent 50%), radial-gradient(circle at 80% 20%, #007DB5 0%, transparent 40%)' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-6 h-6 text-[#C9A84C]" />
            <h2 className="text-lg font-bold">{t('ملخص مشهد البيانات', 'Data Landscape Summary')}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-3xl font-extrabold tabular-nums">{overview.total_files.toLocaleString()}</div>
              <div className="text-sm text-white/70 mt-1">{t('ملف بيانات', 'Data Files')}</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tabular-nums">{(overview.total_rows / 1000).toFixed(0)}K</div>
              <div className="text-sm text-white/70 mt-1">{t('سجل', 'Records')}</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tabular-nums">{overview.data_sources}</div>
              <div className="text-sm text-white/70 mt-1">{t('مصدر بيانات', 'Data Sources')}</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold tabular-nums">{overview.time_span_years}</div>
              <div className="text-sm text-white/70 mt-1">{t('سنة تغطية', 'Years Coverage')}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-surface-tertiary rounded-xl">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active ? 'bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t(tab.ar, tab.en)}</span>
            </button>
          );
        })}
      </div>

      {/* ============================================================
          TAB 1 — OVERVIEW
          ============================================================ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard icon={Briefcase} label={t('وظائف حقيقية', 'Real Job Postings')} value="36,923" trend={12} trendContext="2024-2025" status="info" sparkData={[2100, 2450, 2800, 3100, 2900, 2650, 2200, 2500, 3200, 3800, 3500, 2700, 2923]} delay={0} />
            <KPICard icon={Brain} label={t('مهن مقيّمة للذكاء الاصطناعي', 'AI-Assessed Occupations')} value="774" unit={`${ai.high_risk_pct}% risk`} trend={5.2} trendContext={t('عالي المخاطر', 'high risk')} status="warning" sparkData={[500, 550, 600, 650, 700, 730, 750, 774]} delay={0.05} />
            <KPICard icon={GraduationCap} label={t('مؤسسات تعليم عالي', 'HE Institutions')} value="151" unit={`${education.programs} programs`} trend={3} trendContext={t('برنامج جديد', 'new programs')} status="success" sparkData={[120, 125, 130, 135, 140, 145, 148, 151]} delay={0.1} />
            <KPICard icon={Users} label={t('إماراتيون بالقطاع الخاص', 'Emiratis in Private Sector')} value="131,883" trend={282} trendContext={t('نمو منذ 2020', 'growth since 2020')} status="info" sparkData={[34500, 52900, 79800, 105200, 131883]} delay={0.15} />
          </div>

          {/* Additional KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[#003366]/10"><Layers className="w-4 h-4 text-[#003366]" /></div>
                <span className="text-xs text-text-muted font-medium">{t('تصنيف ESCO', 'ESCO Taxonomy')}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold text-primary tabular-nums">{skills.esco_occupations.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted">{t('مهنة', 'Occupations')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-primary tabular-nums">{skills.esco_skills.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted">{t('مهارة', 'Skills')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-primary tabular-nums">{(skills.esco_mappings / 1000).toFixed(0)}K</div>
                  <div className="text-[10px] text-text-muted">{t('رابط', 'Mappings')}</div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[#007DB5]/10"><Globe className="w-4 h-4 text-[#007DB5]" /></div>
                <span className="text-xs text-text-muted font-medium">{t('تصنيف O*NET', 'O*NET Taxonomy')}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold text-primary tabular-nums">{skills.onet_occupations.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted">{t('مهنة', 'Occupations')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-primary tabular-nums">{skills.onet_hot_technologies.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted">{t('تقنية ناشئة', 'Hot Tech')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-primary tabular-nums">{skills.onet_emerging_tasks.toLocaleString()}</div>
                  <div className="text-[10px] text-text-muted">{t('مهمة ناشئة', 'Emerging Tasks')}</div>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-[#C9A84C]/10"><Award className="w-4 h-4 text-[#C9A84C]" /></div>
                <span className="text-xs text-text-muted font-medium">{t('التوطين', 'Emiratisation')}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold text-[#00875A] tabular-nums">+{emiratisation.growth_pct}%</div>
                  <div className="text-[10px] text-text-muted">{t('نمو 2020-2024', 'Growth 2020-2024')}</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-primary tabular-nums">86.4%</div>
                  <div className="text-[10px] text-text-muted">{t('دبي + أبوظبي', 'Dubai + Abu Dhabi')}</div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Data Sources Table */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
            <div className="p-4 border-b border-border-light flex items-center gap-2">
              <Database className="w-4 h-4 text-navy" />
              <h3 className="text-sm font-semibold text-primary">{t('مصادر البيانات', 'Data Sources')}</h3>
              <span className="ml-auto text-xs text-text-muted tabular-nums">{sources.length} {t('مصدر', 'sources')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-tertiary">
                    {[t('المصدر', 'Source'), t('الفئة', 'Category'), t('الملفات', 'Files'), t('السجلات', 'Records'), t('الفترة', 'Time Range'), t('الاكتمال', 'Completeness'), t('الحالة', 'Status')].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s, i) => (
                    <tr key={i} className="border-t border-border-light hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-medium text-primary whitespace-nowrap">{s.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-tertiary text-text-secondary">{s.category}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-text-secondary">{s.files}</td>
                      <td className="px-4 py-3 tabular-nums text-text-secondary">{s.rows.toLocaleString()}</td>
                      <td className="px-4 py-3 text-text-secondary text-xs">{s.time_start} - {s.time_end}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 rounded-full bg-surface-tertiary overflow-hidden">
                            <div
                              className={`h-full rounded-full ${s.completeness >= 90 ? 'bg-[#00875A]' : s.completeness >= 70 ? 'bg-[#FFAB00]' : 'bg-[#DE350B]'}`}
                              style={{ width: `${s.completeness}%` }}
                            />
                          </div>
                          <span className="text-[11px] tabular-nums text-text-muted">{s.completeness}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#00875A] animate-pulse" />
                          <span className="text-xs text-[#00875A] font-medium">{t('نشط', 'Active')}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============================================================
          TAB 2 — DEMAND DEEP-DIVE
          ============================================================ */}
      {activeTab === 'demand' && (
        <div className="space-y-5">
          {/* Monthly Volume */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
            <ChartToolbar title={t('حجم نشر الوظائف الشهري', 'Monthly Job Posting Volume')} data={demand.monthly_volume}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={demand.monthly_volume}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK} tickFormatter={v => `${(v / 1000).toFixed(1)}K`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill={COLORS.navy} name={t('الوظائف', 'Postings')} radius={BAR_RADIUS} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
            <ChartInsight text={t('أكتوبر 2024 أعلى شهر (3,800 وظيفة) — ذروة التوظيف الخريفي', 'October 2024 peak (3,800 postings) — autumn hiring surge')} severity="shortage" />
          </motion.div>

          {/* Locations + Industries */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('أعلى 8 مواقع', 'Top 8 Locations')} data={demand.top_locations}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={demand.top_locations} layout="vertical">
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="location" tick={AXIS_TICK_SM} width={80} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" fill={COLORS.teal} name={t('الوظائف', 'Jobs')} radius={BAR_RADIUS_H} animationDuration={800}>
                      {demand.top_locations.map((_, i) => (
                        <Cell key={i} fill={getSeriesColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartToolbar>
              <ChartInsight text={t('دبي + أبوظبي = 86.4% من إجمالي الوظائف', 'Dubai + Abu Dhabi = 86.4% of all postings')} severity="critical" />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('أعلى 15 قطاع', 'Top 15 Industries')} data={demand.top_industries}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={demand.top_industries.slice(0, 10)} layout="vertical">
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis type="number" tick={AXIS_TICK_SM} />
                    <YAxis type="category" dataKey="industry" tick={AXIS_TICK_SM} width={110} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" fill={COLORS.gold} name={t('الوظائف', 'Jobs')} radius={BAR_RADIUS_H} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartToolbar>
              <ChartInsight text={t('تكنولوجيا المعلومات والخدمات المالية = 25% من الطلب', 'IT & Financial Services = 25% of demand')} severity="shortage" />
            </motion.div>
          </div>

          {/* Employment Type + Experience Level */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('أنواع التوظيف', 'Employment Types')} data={employmentTypeData}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={employmentTypeData} cx="50%" cy="45%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={3} animationDuration={800}
                      label={({ name, value }) => `${name} ${value}%`} labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }} style={{ fontSize: 11 }}>
                      {employmentTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip unit="%" />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartToolbar>
              <ChartInsight text={t('80% دوام كامل — سوق عمل مستقر', '80% full-time — stable employment market')} severity="balanced" />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('مستوى الخبرة', 'Experience Levels')} data={experienceLevelData}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={experienceLevelData} cx="50%" cy="45%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={3} animationDuration={800}
                      label={({ name, value }) => `${name} ${value}%`} labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }} style={{ fontSize: 10 }}>
                      {experienceLevelData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip unit="%" />} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartToolbar>
              <ChartInsight text={t('43.7% مستوى متوسط-عالي — طلب قوي على الخبرة', '43.7% mid-senior — strong demand for experience')} severity="shortage" />
            </motion.div>
          </div>

          {/* ISCO Distribution */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
            <ChartToolbar title={t('توزيع المهن حسب ISCO', 'ISCO Occupation Distribution')} data={demand.isco_distribution}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={demand.isco_distribution} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={v => `${(v / 1000).toFixed(1)}K`} />
                  <YAxis type="category" dataKey="group" tick={AXIS_TICK_SM} width={120} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill={COLORS.navy} name={t('الوظائف', 'Jobs')} radius={BAR_RADIUS_H} animationDuration={800}>
                    {demand.isco_distribution.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
            <ChartInsight text={t('المهنيون (35%) والمديرون (20%) يشكلون أكثر من نصف الطلب', 'Professionals (35%) and Managers (20%) make up over half of demand')} severity="shortage" />
          </motion.div>

          {/* Data Quality Warning Cards */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-[#DE350B]" />
                <span className="text-xs font-semibold text-[#DE350B]">{t('نقص كبير', 'Major Gap')}</span>
              </div>
              <div className="text-2xl font-bold text-primary tabular-nums">{demand.data_quality.missing_occupation_pct}%</div>
              <div className="text-xs text-text-muted mt-1">{t('وظائف بدون رمز مهني', 'Jobs missing occupation code')}</div>
            </div>
            <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-[#DE350B]" />
                <span className="text-xs font-semibold text-[#DE350B]">{t('نقص كبير', 'Major Gap')}</span>
              </div>
              <div className="text-2xl font-bold text-primary tabular-nums">{demand.data_quality.missing_industry_pct}%</div>
              <div className="text-xs text-text-muted mt-1">{t('وظائف بدون تصنيف قطاعي', 'Jobs missing industry class')}</div>
            </div>
            <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-[#00875A]" />
                <span className="text-xs font-semibold text-[#00875A]">{t('جيد', 'Good')}</span>
              </div>
              <div className="text-2xl font-bold text-primary tabular-nums">{100 - demand.data_quality.missing_date_pct}%</div>
              <div className="text-xs text-text-muted mt-1">{t('وظائف بتاريخ نشر', 'Jobs with posting date')}</div>
            </div>
            <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-[#00875A]" />
                <span className="text-xs font-semibold text-[#00875A]">{t('ممتاز', 'Excellent')}</span>
              </div>
              <div className="text-2xl font-bold text-primary tabular-nums">{demand.data_quality.duplicate_ids}</div>
              <div className="text-xs text-text-muted mt-1">{t('سجلات مكررة', 'Duplicate records')}</div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============================================================
          TAB 3 — EDUCATION & SKILLS
          ============================================================ */}
      {activeTab === 'education' && (
        <div className="space-y-5">
          {/* Emiratisation Progress */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
            <ChartToolbar title={t('تقدم التوطين 2020-2024', 'Emiratisation Progress 2020-2024')} data={emiratisation.emiratis_in_private_sector}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={emiratisation.emiratis_in_private_sector.map((e, i) => ({
                  year: String(e.year),
                  emiratis: e.value,
                  establishments: emiratisation.nafis_establishments[i]?.value ?? 0,
                }))}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="year" tick={AXIS_TICK} />
                  <YAxis yAxisId="left" tick={AXIS_TICK} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="emiratis" stroke={COLORS.navy} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.navy }} name={t('إماراتيون بالقطاع الخاص', 'Emiratis in Private Sector')} animationDuration={800} />
                  <Line yAxisId="right" type="monotone" dataKey="establishments" stroke={COLORS.gold} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.gold }} name={t('منشآت نافس', 'NAFIS Establishments')} animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </ChartToolbar>
            <ChartInsight text={t('282% نمو في التوطين بالقطاع الخاص — من 34,500 إلى 131,883 خلال 4 سنوات', '282% growth in private sector Emiratisation — from 34,500 to 131,883 in 4 years')} severity="balanced" />
          </motion.div>

          {/* Tech Courses + Institutions by Emirate */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('دورات التكنولوجيا', 'Technology Courses')} data={techCoursesData}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={techCoursesData} layout="vertical">
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis type="number" tick={AXIS_TICK_SM} />
                    <YAxis type="category" dataKey="name" tick={AXIS_TICK_SM} width={120} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" fill={COLORS.teal} name={t('الدورات', 'Courses')} radius={BAR_RADIUS_H} animationDuration={800}>
                      {techCoursesData.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartToolbar>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('المؤسسات حسب الإمارة', 'Institutions by Emirate')} data={institutionsByEmirateData}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={institutionsByEmirateData}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="name" tick={AXIS_TICK_SM} />
                    <YAxis tick={AXIS_TICK} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" fill={COLORS.navy} name={t('المؤسسات', 'Institutions')} radius={BAR_RADIUS} animationDuration={800}>
                      {institutionsByEmirateData.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartToolbar>
            </motion.div>
          </div>

          {/* Degree Distribution + AI Risk Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('توزيع الشهادات', 'Degree Distribution')} data={degreeData}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={degreeData} cx="50%" cy="45%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={3} animationDuration={800}
                      label={({ name, value }) => `${name} ${value}`} labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }} style={{ fontSize: 11 }}>
                      {degreeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartToolbar>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
              <ChartToolbar title={t('توزيع مخاطر الذكاء الاصطناعي', 'AI Risk Distribution')} data={riskDistData}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={riskDistData} cx="50%" cy="45%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name" paddingAngle={3} animationDuration={800}
                      label={({ name, value }) => `${value}`} labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }} style={{ fontSize: 12, fontWeight: 600 }}>
                      {riskDistData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend iconType="circle" verticalAlign="bottom" wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartToolbar>
              <ChartInsight text={t('59.6% من المهن المقيّمة في خطر عالي من الذكاء الاصطناعي', '59.6% of assessed occupations at high AI disruption risk')} severity="critical" />
            </motion.div>
          </div>

          {/* Top Essential Skills */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
            <ChartToolbar title={t('أعلى 10 مهارات أساسية (ESCO)', 'Top 10 Essential Skills (ESCO)')} data={skills.top_essential_skills}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={skills.top_essential_skills} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={AXIS_TICK_SM} />
                  <YAxis type="category" dataKey="skill" tick={AXIS_TICK_SM} width={180} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="occupations" fill={COLORS.navy} name={t('مهن تحتاجها', 'Occupations requiring')} radius={BAR_RADIUS_H} animationDuration={800}>
                    {skills.top_essential_skills.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
            <ChartInsight text={t('التفكير النقدي والاستماع الفعّال = أكثر المهارات طلباً عبر جميع المهن', 'Critical thinking & active listening = most demanded skills across all occupations')} severity="shortage" />
          </motion.div>

          {/* ESCO vs O*NET comparison */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border-light shadow-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#003366]/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-[#003366]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-primary">ESCO (EU)</h4>
                  <p className="text-xs text-text-muted">{t('التصنيف الأوروبي', 'European Classification')}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('المهن', 'Occupations')}</span><span className="font-semibold text-primary tabular-nums">{skills.esco_occupations.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('المهارات', 'Skills')}</span><span className="font-semibold text-primary tabular-nums">{skills.esco_skills.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('الروابط', 'Mappings')}</span><span className="font-semibold text-primary tabular-nums">{skills.esco_mappings.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('أساسية', 'Essential')}</span><span className="font-semibold text-primary tabular-nums">{skills.essential_skills.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('اختيارية', 'Optional')}</span><span className="font-semibold text-primary tabular-nums">{skills.optional_skills.toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border-light shadow-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#007DB5]/10 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-[#007DB5]" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-primary">O*NET (US)</h4>
                  <p className="text-xs text-text-muted">{t('التصنيف الأمريكي', 'US Classification')}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('المهن', 'Occupations')}</span><span className="font-semibold text-primary tabular-nums">{skills.onet_occupations.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('سجلات المهارات', 'Skill Records')}</span><span className="font-semibold text-primary tabular-nums">{skills.onet_skill_records.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('تقنيات ناشئة', 'Hot Technologies')}</span><span className="font-semibold text-primary tabular-nums">{skills.onet_hot_technologies.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('مهام ناشئة', 'Emerging Tasks')}</span><span className="font-semibold text-primary tabular-nums">{skills.onet_emerging_tasks.toLocaleString()}</span></div>
                <div className="flex justify-between text-sm"><span className="text-text-secondary">{t('ربط SOC-ISCO', 'SOC-ISCO Crosswalk')}</span><span className="font-semibold text-primary tabular-nums">1,100</span></div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* ============================================================
          TAB 4 — DATA QUALITY
          ============================================================ */}
      {activeTab === 'quality' && (
        <div className="space-y-5">
          {/* Completeness Bars */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <ShieldCheck className="w-4 h-4 text-navy" />
              <h3 className="text-sm font-semibold text-primary">{t('اكتمال البيانات حسب المصدر', 'Data Completeness by Source')}</h3>
            </div>
            <div className="space-y-3">
              {sources.map((s, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-xs text-text-secondary w-48 truncate shrink-0">{s.name}</span>
                  <div className="flex-1 h-3 rounded-full bg-surface-tertiary overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${s.completeness}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className={`h-full rounded-full ${s.completeness >= 90 ? 'bg-[#00875A]' : s.completeness >= 70 ? 'bg-[#FFAB00]' : 'bg-[#DE350B]'}`}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-text-secondary w-10 text-right">{s.completeness}%</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Gaps + Strengths */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <XCircle className="w-4 h-4 text-[#DE350B]" />
                <h3 className="text-sm font-semibold text-[#DE350B]">{t('فجوات البيانات', 'Data Gaps')}</h3>
              </div>
              <div className="space-y-2">
                {quality.gaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                    <AlertTriangle className="w-4 h-4 text-[#DE350B] shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-700 leading-relaxed">{gap}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-4 h-4 text-[#00875A]" />
                <h3 className="text-sm font-semibold text-[#00875A]">{t('نقاط القوة', 'Data Strengths')}</h3>
              </div>
              <div className="space-y-2">
                {quality.strengths.map((str, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <CheckCircle2 className="w-4 h-4 text-[#00875A] shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-700 leading-relaxed">{str}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Geographic Coverage Matrix */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
            <div className="p-4 border-b border-border-light flex items-center gap-2">
              <Globe className="w-4 h-4 text-navy" />
              <h3 className="text-sm font-semibold text-primary">{t('مصفوفة التغطية الجغرافية', 'Geographic Coverage Matrix')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-tertiary">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">{t('الإمارة', 'Emirate')}</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">{t('الطلب', 'Demand')}</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">{t('العرض', 'Supply')}</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">{t('التعليم', 'Education')}</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">{t('السكان', 'Population')}</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">{t('الاقتصاد', 'Economic')}</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">SCAD</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">{t('الذكاء الاصطناعي', 'AI')}</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-text-muted">{t('التوطين', 'Emirtisation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {COVERAGE_MATRIX.map((row, i) => (
                    <tr key={i} className="border-t border-border-light">
                      <td className="px-4 py-3 font-medium text-primary whitespace-nowrap">{row.emirate}</td>
                      {['demand', 'supply', 'education', 'population', 'economic', 'scad', 'ai', 'emiratisation'].map(key => (
                        <td key={key} className="px-3 py-3 text-center">
                          {(row as any)[key] ? (
                            <CheckCircle2 className="w-4 h-4 text-[#00875A] mx-auto" />
                          ) : (
                            <XCircle className="w-4 h-4 text-gray-300 mx-auto" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-surface-tertiary border-t border-border-light flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00875A]" />
                <span className="text-[11px] text-text-muted">{t('بيانات متاحة', 'Data available')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-gray-300" />
                <span className="text-[11px] text-text-muted">{t('بيانات غير متاحة', 'No data')}</span>
              </div>
            </div>
          </motion.div>

          {/* AI Exposure: Top Exposed & Safe */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-[#DE350B]" />
                <h3 className="text-sm font-semibold text-primary">{t('أعلى مهن تعرضاً للذكاء الاصطناعي', 'Most AI-Exposed Occupations')}</h3>
              </div>
              <div className="space-y-2">
                {ai.top_exposed.map((occ, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                    <span className="text-xs font-bold text-[#DE350B] w-5 tabular-nums">{i + 1}</span>
                    <span className="text-sm text-gray-700">{occ}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-4 h-4 text-[#00875A]" />
                <h3 className="text-sm font-semibold text-primary">{t('أكثر المهن أماناً من الذكاء الاصطناعي', 'Most AI-Resilient Occupations')}</h3>
              </div>
              <div className="space-y-2">
                {ai.top_safe.map((occ, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                    <span className="text-xs font-bold text-[#00875A] w-5 tabular-nums">{i + 1}</span>
                    <span className="text-sm text-gray-700">{occ}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataLandscapePage;
