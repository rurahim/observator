import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import { useSkillsTaxonomy, useHotTechnologies, useOccupationSkills } from '@/api/hooks';
import { SkeletonKPICard, SkeletonChart } from '@/components/shared/Skeletons';
import PageHeader from '@/components/shared/PageHeader';
import KPICard from '@/components/shared/KPICard';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartInsight from '@/components/charts/ChartInsight';
import ChartTooltip from '@/components/charts/ChartTooltip';
import {
  Layers, BookOpen, Cpu, Database, Search, Zap, Award, Tag,
  ChevronRight, Download,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, BAR_RADIUS, BAR_RADIUS_H, getSeriesColor } from '@/utils/chartColors';
import { formatNumber, formatCompact } from '@/utils/formatters';

/* ================================================================
   FALLBACK DATA
   From the _master_tables analysis report — used when backend
   endpoints are not yet available.
   ================================================================ */






/* ================================================================
   TAB DEFINITIONS
   ================================================================ */

const TABS = [
  { id: 'overview', en: 'Skills Overview', ar: 'نظرة عامة على المهارات', icon: Layers },
  { id: 'hot-tech', en: 'Hot Technologies', ar: 'التقنيات الرائجة', icon: Zap },
  { id: 'occupation-skills', en: 'Occupation Skills', ar: 'مهارات المهن', icon: BookOpen },
] as const;

type TabId = typeof TABS[number]['id'];

const PIE_COLORS = ['#003366', '#007DB5', '#C9A84C', '#00875A', '#B87333', '#4A6FA5', '#D4726A', '#002347'];

const CATEGORY_COLORS: Record<string, string> = {
  'Data Science': COLORS.navy,
  'Software Development': COLORS.teal,
  'DevOps': COLORS.gold,
  'Cybersecurity': '#DE350B',
  'AI Integration': COLORS.emerald,
  'Quality Assurance': COLORS.copper,
  'Cloud Computing': COLORS.slate,
  'Blockchain': COLORS.coral,
  'Automation': COLORS.deepBlue,
  'Data Engineering': COLORS.teal,
  'AI/ML': COLORS.navy,
  'RPA': COLORS.gold,
};

/* ================================================================
   FALLBACK OCCUPATION LIST (for search)
   ================================================================ */


/* ================================================================
   MAIN COMPONENT
   ================================================================ */

const SkillsTaxonomyPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(600);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [occupationSearch, setOccupationSearch] = useState('');
  const [selectedOccupationId, setSelectedOccupationId] = useState<number | null>(null);
  const [selectedOccupationLabel, setSelectedOccupationLabel] = useState('');

  // API hooks
  const { data: taxonomyData, isLoading: taxonomyLoading } = useSkillsTaxonomy();
  const { data: hotTechData, isLoading: hotTechLoading } = useHotTechnologies();
  const { data: occSkillsData, isLoading: occSkillsLoading } = useOccupationSkills(selectedOccupationId);

  const apiLoading = taxonomyLoading || hotTechLoading;

  // Merge API with fallback
  const topEssentialSkills = useMemo(() => {
    const raw = taxonomyData?.top_essential_skills ?? [];
    return raw.slice(0, 20).map(s => ({
      skill: s.skill.length > 28 ? s.skill.slice(0, 26) + '...' : s.skill,
      occupations: s.occupation_count,
    }));
  }, [taxonomyData]);

  const skillTypesData = useMemo(() => {
    if (taxonomyData?.skills?.length) {
      const types: Record<string, number> = {};
      taxonomyData.skills.forEach(s => {
        const t = s.skill_type || 'Unknown';
        types[t] = (types[t] || 0) + 1;
      });
      return Object.entries(types).map(([name, value], i) => ({
        name, value, color: PIE_COLORS[i % PIE_COLORS.length],
      }));
    }
    return [];
  }, [taxonomyData]);

  const onetStats = taxonomyData?.onet_stats ?? { occupations: 0, skills: 0, knowledge: 0, technologies: 0, alternate_titles: 0, task_statements: 0, emerging_tasks: 0, related_occupations: 0, hot_technologies: 0, career_transitions: 0 };
  const totalSkills = taxonomyData?.total_skills ?? 0;
  const totalMappings = taxonomyData?.total_mappings ?? 0;

  const hotTechnologies = useMemo(() => {
    const raw = hotTechData?.technologies ?? [];
    return raw.slice(0, 20).map(ht => ({
      technology: ht.category.length > 22 ? ht.category.slice(0, 20) + '...' : ht.category,
      occupations: ht.occupation_count,
    }));
  }, [hotTechData]);

  const emergingTasks = useMemo(() => {
    return taxonomyData?.emerging_tasks ?? [];
  }, [taxonomyData]);

  // Occupation skills: merge API with fallback
  const escoEssential = useMemo(() => {
    if (occSkillsData?.esco_skills?.length) {
      return occSkillsData.esco_skills
        .filter(s => s.relation === 'essential')
        .map(s => s.skill);
    }
    return occSkillsData?.esco_skills?.filter((s: any) => s.relation === 'essential') ?? [];
  }, [occSkillsData, selectedOccupationId]);

  const escoOptional = useMemo(() => {
    if (occSkillsData?.esco_skills?.length) {
      return occSkillsData.esco_skills
        .filter(s => s.relation === 'optional')
        .map(s => s.skill);
    }
    return occSkillsData?.esco_skills?.filter((s: any) => s.relation === 'optional') ?? [];
  }, [occSkillsData, selectedOccupationId]);

  const onetImportance = useMemo(() => {
    if (occSkillsData?.onet_skills?.length) {
      return occSkillsData.onet_skills
        .filter(s => s.value !== null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .slice(0, 10)
        .map(s => ({ skill: s.skill, value: s.value ?? 0 }));
    }
    return occSkillsData?.onet_skills ?? [];
  }, [occSkillsData, selectedOccupationId]);

  const techList = useMemo(() => {
    if (occSkillsData?.technologies?.length) {
      return occSkillsData.technologies;
    }
    return occSkillsData?.technologies ?? [];
  }, [occSkillsData, selectedOccupationId]);

  const filteredOccupations = useMemo(() => {
    if (!occupationSearch.trim()) return [];
    const q = occupationSearch.toLowerCase();
    return [];
  }, [occupationSearch]);

  /* ── Loading State ────────────────────────────────────────────── */
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
          <SkeletonChart height={340} />
          <SkeletonChart height={340} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title={t('مستكشف تصنيف المهارات', 'Skills Taxonomy Explorer')}
        subtitle={t(
          'استعراض شامل لتصنيف المهارات ESCO و O*NET والتقنيات الرائجة',
          'Comprehensive browser for ESCO & O*NET skill taxonomies, hot technologies, and occupation-skill mappings'
        )}
        actions={
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors">
            <Download className="w-4 h-4" />
            {t('تصدير البيانات', 'Export Data')}
          </button>
        }
      />

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
          TAB 1 -- SKILLS OVERVIEW
          ============================================================ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              icon={Layers}
              label={t('إجمالي المهارات', 'Total Skills')}
              value={formatNumber(totalSkills)}
              trend={0}
              trendContext={t('ESCO + O*NET', 'ESCO + O*NET')}
              status="info"
              sparkData={[9000, 10200, 11400, 12100, 12800, 13400, totalSkills]}
              delay={0}
            />
            <KPICard
              icon={Database}
              label={t('إجمالي الربط', 'Total Mappings')}
              value={formatCompact(totalMappings)}
              trend={0}
              trendContext={t('مهارة-مهنة', 'skill-occupation')}
              status="info"
              sparkData={[80000, 90000, 100000, 108000, 115000, 120000, totalMappings]}
              delay={0.05}
            />
            <KPICard
              icon={Cpu}
              label={t('مهن O*NET', 'O*NET Occupations')}
              value={formatNumber(onetStats.occupations)}
              trend={0}
              trendContext={t('مع بيانات المهارات', 'with skill data')}
              status="success"
              sparkData={[800, 850, 900, 940, 970, 1000, onetStats.occupations]}
              delay={0.1}
            />
            <KPICard
              icon={Zap}
              label={t('تقنيات رائجة', 'Hot Technologies')}
              value={formatNumber(onetStats.hot_technologies)}
              trend={8}
              trendContext={t('تقنية مطلوبة', 'in-demand tech')}
              status="warning"
              sparkData={[8000, 9000, 9800, 10300, 10800, 11200, onetStats.hot_technologies]}
              delay={0.15}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 20 Essential Skills — Horizontal Bar */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
            >
              <ChartToolbar
                title={t('أهم 20 مهارة أساسية', 'Top 20 Essential Skills')}
                data={topEssentialSkills as Record<string, unknown>[]}
              >
                <ResponsiveContainer width="100%" height={520}>
                  <BarChart data={topEssentialSkills} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis type="number" tick={AXIS_TICK_SM} />
                    <YAxis type="category" dataKey="skill" tick={AXIS_TICK_SM} width={140} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="occupations"
                      name={t('عدد المهن', 'Occupations')}
                      radius={BAR_RADIUS_H}
                      animationDuration={800}
                    >
                      {topEssentialSkills.map((_, i) => (
                        <Cell key={i} fill={getSeriesColor(i % 3)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <ChartInsight
                  text={t(
                    '"إدارة الموظفين" تتصدر المهارات الأساسية وتظهر في 261 مهنة - مما يشير لأهمية المهارات القيادية عبر القطاعات',
                    '"Manage staff" leads essential skills, appearing in 261 occupations -- highlighting cross-sector demand for leadership competencies'
                  )}
                  severity="balanced"
                />
              </ChartToolbar>
            </motion.div>

            {/* Skill Types — Pie Chart */}
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
              >
                <ChartToolbar
                  title={t('توزيع أنواع المهارات', 'Skill Types Distribution')}
                  data={skillTypesData as Record<string, unknown>[]}
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={skillTypesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
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
                              {formatCompact(value)}
                            </text>
                          );
                        }}
                        labelLine={{ stroke: '#94A3B8', strokeWidth: 1 }}
                        animationDuration={800}
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {skillTypesData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(value: string) => <span className="text-gray-600 text-[11px]">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ChartInsight
                    text={t(
                      'المهارات والكفاءات تشكل 77% من التصنيف مقابل 23% للمعرفة',
                      'Skills/competences make up 77% of the taxonomy vs 23% knowledge -- practical ability dominates'
                    )}
                    severity="balanced"
                  />
                </ChartToolbar>
              </motion.div>

              {/* O*NET Coverage Stat Cards */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Award className="w-4 h-4 text-navy" />
                  <h3 className="text-sm font-semibold text-primary">
                    {t('تغطية بيانات O*NET', 'O*NET Data Coverage')}
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: t('سجلات المهارات', 'Skill Records'), value: onetStats.skills, color: COLORS.navy },
                    { label: t('سجلات المعرفة', 'Knowledge Records'), value: onetStats.knowledge, color: COLORS.teal },
                    { label: t('سجلات التقنيات', 'Technology Records'), value: onetStats.technologies, color: COLORS.gold },
                    { label: t('مهام ناشئة', 'Emerging Tasks'), value: onetStats.emerging_tasks, color: '#DE350B' },
                    { label: t('ألقاب بديلة', 'Alternate Titles'), value: onetStats.alternate_titles, color: COLORS.copper },
                    { label: t('مسارات وظيفية', 'Career Paths'), value: onetStats.career_transitions, color: COLORS.emerald },
                  ].map((stat, i) => (
                    <div key={i} className="bg-surface-tertiary rounded-lg p-3 text-center">
                      <div className="text-lg font-bold tabular-nums" style={{ color: stat.color }}>
                        {formatCompact(stat.value)}
                      </div>
                      <div className="text-[10px] text-text-muted mt-1 font-medium uppercase tracking-wider">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 2 -- HOT TECHNOLOGIES
          ============================================================ */}
      {activeTab === 'hot-tech' && (
        <div className="space-y-5">
          {/* Hot Technologies Leaderboard */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
          >
            <ChartToolbar
              title={t('قائمة التقنيات الرائجة - أعلى 20', 'Hot Technologies Leaderboard -- Top 20')}
              data={hotTechnologies as Record<string, unknown>[]}
            >
              <ResponsiveContainer width="100%" height={560}>
                <BarChart data={hotTechnologies} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={AXIS_TICK_SM} />
                  <YAxis type="category" dataKey="technology" tick={AXIS_TICK_SM} width={150} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="occupations"
                    name={t('عدد المهن', 'Occupations Using')}
                    radius={BAR_RADIUS_H}
                    animationDuration={800}
                  >
                    {hotTechnologies.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? COLORS.gold : i < 8 ? COLORS.teal : COLORS.navy} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartInsight
                text={t(
                  'Microsoft Excel يتصدر بـ 859 مهنة — أدوات Microsoft Office تهيمن على أعلى 5 مراكز',
                  'Microsoft Excel leads with 859 occupations -- Microsoft Office tools dominate the top 5 positions'
                )}
                severity="shortage"
              />
            </ChartToolbar>
          </motion.div>

          {/* Emerging Tasks */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden"
          >
            <div className="p-4 border-b border-border-light">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-gold" />
                <h3 className="text-sm font-semibold text-primary">
                  {t('المهام الناشئة من O*NET', 'Emerging Tasks from O*NET')}
                </h3>
                <span className="ml-2 px-2 py-0.5 rounded-md bg-gold/10 text-gold text-[10px] font-bold uppercase tracking-wider">
                  {onetStats.emerging_tasks} {t('مهمة', 'tasks')}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-1">
                {t(
                  'مهام جديدة أو متغيرة تم تحديدها بواسطة O*NET — تعكس التحولات في متطلبات سوق العمل',
                  'New or changed tasks identified by O*NET -- reflecting shifts in labour market requirements'
                )}
              </p>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {emergingTasks.slice(0, 12).map((task, i) => (
                <div key={i} className="bg-surface-tertiary rounded-lg p-3 hover:bg-surface-hover transition-colors">
                  <div className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                      style={{ backgroundColor: CATEGORY_COLORS[task.category] || COLORS.navy }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-primary font-medium leading-relaxed">{task.task}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-white"
                          style={{ backgroundColor: CATEGORY_COLORS[task.category] || COLORS.slate }}
                        >
                          {task.category}
                        </span>
                        <span className="text-[10px] text-text-muted tabular-nums">SOC {task.soc_code}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <ChartInsight
              text={t(
                'أكثر المهام الناشئة تتعلق بالذكاء الاصطناعي والحوسبة السحابية — مما يشير للتحول الرقمي السريع في سوق العمل',
                'Most emerging tasks relate to AI and cloud computing -- signaling rapid digital transformation in the labour market'
              )}
              severity="shortage"
            />
          </motion.div>
        </div>
      )}

      {/* ============================================================
          TAB 3 -- OCCUPATION SKILLS
          ============================================================ */}
      {activeTab === 'occupation-skills' && (
        <div className="space-y-5">
          {/* Occupation Selector */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-navy" />
              <h3 className="text-sm font-semibold text-primary">
                {t('اختر مهنة لاستعراض المهارات', 'Select an Occupation to Browse Skills')}
              </h3>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                value={occupationSearch}
                onChange={e => setOccupationSearch(e.target.value)}
                placeholder={t('ابحث عن مهنة...', 'Search occupation by name or ISCO code...')}
                className="w-full h-10 pl-10 pr-4 rounded-lg bg-surface-tertiary border-none text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {filteredOccupations.map(occ => {
                const isSelected = selectedOccupationId === occ.id;
                return (
                  <button
                    key={occ.id}
                    onClick={() => {
                      setSelectedOccupationId(isSelected ? null : occ.id);
                      setSelectedOccupationLabel(isSelected ? '' : occ.label);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-navy text-white shadow-sm'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {occ.label}
                    {isSelected && <ChevronRight className="w-3 h-3 inline ml-1" />}
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Occupation Detail */}
          {selectedOccupationId ? (
            <>
              {/* Selected Occupation Header */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-[#003366] to-[#002347] rounded-xl p-4 text-white"
              >
                <div className="flex items-center gap-3">
                  <BookOpen className="w-5 h-5 text-[#C9A84C]" />
                  <div>
                    <h2 className="text-base font-bold">{selectedOccupationLabel}</h2>
                    <p className="text-xs text-white/70 mt-0.5">
                      {t('عرض المهارات والتقنيات المرتبطة', 'Viewing linked skills and technologies')}
                    </p>
                  </div>
                </div>
              </motion.div>

              {occSkillsLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <SkeletonChart height={280} />
                  <SkeletonChart height={280} />
                </div>
              ) : (
                <>
                  {/* ESCO Skills Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Essential Skills */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-sgi-balanced" />
                        <h3 className="text-sm font-semibold text-primary">
                          {t('المهارات الأساسية (ESCO)', 'Essential Skills (ESCO)')}
                        </h3>
                        <span className="ml-auto text-[10px] font-medium text-text-muted bg-surface-tertiary px-2 py-0.5 rounded-md">
                          {escoEssential.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {escoEssential.map((skill, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-sgi-balanced/10 border border-sgi-balanced/20 text-xs font-medium text-sgi-balanced"
                          >
                            {skill}
                          </span>
                        ))}
                        {escoEssential.length === 0 && (
                          <p className="text-xs text-text-muted italic">
                            {t('لا توجد مهارات أساسية مسجلة', 'No essential skills recorded')}
                          </p>
                        )}
                      </div>
                    </motion.div>

                    {/* Optional Skills */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-teal" />
                        <h3 className="text-sm font-semibold text-primary">
                          {t('المهارات الاختيارية (ESCO)', 'Optional Skills (ESCO)')}
                        </h3>
                        <span className="ml-auto text-[10px] font-medium text-text-muted bg-surface-tertiary px-2 py-0.5 rounded-md">
                          {escoOptional.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {escoOptional.map((skill, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-teal/10 border border-teal/20 text-xs font-medium text-teal"
                          >
                            {skill}
                          </span>
                        ))}
                        {escoOptional.length === 0 && (
                          <p className="text-xs text-text-muted italic">
                            {t('لا توجد مهارات اختيارية مسجلة', 'No optional skills recorded')}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  </div>

                  {/* O*NET Importance Bar + Technologies */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* O*NET Importance Scores */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                      className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
                    >
                      <ChartToolbar
                        title={t('درجات أهمية المهارات (O*NET)', 'O*NET Skill Importance Scores')}
                        data={onetImportance as Record<string, unknown>[]}
                      >
                        {onetImportance.length > 0 ? (
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={onetImportance} layout="vertical" margin={{ left: 10, right: 20 }}>
                              <CartesianGrid {...GRID_PROPS} />
                              <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK_SM} />
                              <YAxis type="category" dataKey="skill" tick={AXIS_TICK_SM} width={160} />
                              <Tooltip content={<ChartTooltip unit="/100" />} />
                              <Bar
                                dataKey="value"
                                name={t('درجة الأهمية', 'Importance')}
                                radius={BAR_RADIUS_H}
                                animationDuration={800}
                              >
                                {onetImportance.map((entry, i) => (
                                  <Cell key={i} fill={entry.value >= 65 ? COLORS.navy : entry.value >= 50 ? COLORS.teal : COLORS.gold} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[300px] flex items-center justify-center text-sm text-text-muted">
                            {t('لا توجد بيانات O*NET لهذه المهنة', 'No O*NET data available for this occupation')}
                          </div>
                        )}
                      </ChartToolbar>
                    </motion.div>

                    {/* Technologies Used */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <Cpu className="w-4 h-4 text-navy" />
                        <h3 className="text-sm font-semibold text-primary">
                          {t('التقنيات المستخدمة', 'Technologies Used')}
                        </h3>
                        <span className="ml-auto text-[10px] font-medium text-text-muted bg-surface-tertiary px-2 py-0.5 rounded-md">
                          {techList.length}
                        </span>
                      </div>
                      {techList.length > 0 ? (
                        <div className="space-y-2">
                          {techList.map((tech, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between px-3 py-2 bg-surface-tertiary rounded-lg"
                            >
                              <div className="flex items-center gap-2">
                                <Tag className="w-3.5 h-3.5 text-text-muted" />
                                <span className="text-xs font-medium text-primary">{tech.tool}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-text-muted">{tech.category}</span>
                                {tech.hot && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gold/15 text-gold border border-gold/20 uppercase">
                                    HOT
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-[300px] flex items-center justify-center text-sm text-text-muted">
                          {t('لا توجد تقنيات مسجلة لهذه المهنة', 'No technologies recorded for this occupation')}
                        </div>
                      )}
                    </motion.div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* No occupation selected */
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-card rounded-xl border border-border-light shadow-card p-12 text-center"
            >
              <BookOpen className="w-12 h-12 text-text-muted/30 mx-auto mb-4" />
              <h3 className="text-sm font-semibold text-primary mb-1">
                {t('اختر مهنة للبدء', 'Select an Occupation to Begin')}
              </h3>
              <p className="text-xs text-text-muted max-w-md mx-auto">
                {t(
                  'اختر مهنة من القائمة أعلاه لعرض المهارات الأساسية والاختيارية والتقنيات المرتبطة',
                  'Choose an occupation from the list above to view its essential skills, optional skills, O*NET importance scores, and linked technologies'
                )}
              </p>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
};

export default SkillsTaxonomyPage;
