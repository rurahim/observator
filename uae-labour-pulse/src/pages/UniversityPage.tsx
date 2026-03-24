import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFilters } from '@/contexts/FilterContext';
import { useUniversity } from '@/api/hooks';
import { usePageLoading } from '@/hooks/usePageLoading';
import { SkeletonChart, SkeletonTable } from '@/components/shared/Skeletons';
import EmptyState, { ChartEmpty, ErrorState } from '@/components/shared/EmptyState';
import PageHeader from '@/components/shared/PageHeader';
import ChartTooltip from '@/components/charts/ChartTooltip';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartInsight from '@/components/charts/ChartInsight';
import DataMethodology from '@/components/charts/DataMethodology';
import SplitPageLayout from '@/components/layout/SplitPageLayout';
import { COLORS, SGI_COLORS, GRID_PROPS, AXIS_TICK_SM, BAR_RADIUS_H } from '@/utils/chartColors';
import { GraduationCap, Upload, Eye } from 'lucide-react';
import {
  BarChart, Bar, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const priorityBadge = (p: string) => {
  if (p === 'Critical') return 'bg-sgi-critical/10 text-sgi-critical';
  if (p === 'High') return 'bg-sgi-shortage/10 text-sgi-shortage';
  return 'bg-sgi-surplus/10 text-sgi-surplus';
};

const DISCIPLINE_COLORS = [COLORS.emerald, COLORS.teal, COLORS.gold, COLORS.coral, COLORS.navy, COLORS.copper, COLORS.slate, COLORS.deepBlue];

const UniversityPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(600);
  const { filters } = useFilters();
  const apiParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filters.emirate !== 'all') p.emirate = filters.emirate;
    return p;
  }, [filters.emirate]);
  const { data: apiData, isLoading: apiLoading, error } = useUniversity(apiParams);

  const liveProgramCoverage = useMemo(() => {
    if (!apiData?.program_coverage?.length) return [];
    return apiData.program_coverage.slice(0, 8).map((p, i) => ({
      name: p.discipline,
      coverage: Math.round(p.coverage_ratio * 100),
      fill: DISCIPLINE_COLORS[i % DISCIPLINE_COLORS.length],
    }));
  }, [apiData]);

  const liveMissingSkills = useMemo(() => {
    if (!apiData?.missing_skills?.length) return [];
    return apiData.missing_skills.slice(0, 8).map(s => ({
      skill: s.skill,
      gap: s.gap > 100 ? Math.round((s.gap / apiData.missing_skills[0].gap) * 100) : s.gap,
    }));
  }, [apiData]);

  const liveRecommendations = useMemo(() => {
    if (!apiData?.recommendations?.length) return [];
    return apiData.recommendations.map(r => ({
      skill: r.discipline,
      priority: r.priority === 'high' ? 'Critical' : r.priority === 'medium' ? 'High' : 'Medium',
      program: r.recommendation,
      gap: r.priority === 'high' ? 85 : r.priority === 'medium' ? 65 : 45,
    }));
  }, [apiData]);

  const overallCoverage = useMemo(() => {
    if (!apiData?.program_coverage?.length) return null;
    const avg = apiData.program_coverage.reduce((s, p) => s + p.coverage_ratio, 0) / apiData.program_coverage.length;
    return Math.round(avg * 100);
  }, [apiData]);

  if (loading || apiLoading) {
    return (
      <div className="space-y-4">
        <div>
          <div className="h-6 w-48 mb-2 animate-pulse bg-surface-tertiary rounded" />
          <div className="h-3.5 w-64 animate-pulse bg-surface-tertiary rounded" />
        </div>
        <div className="bg-card rounded-xl border-2 border-dashed border-border p-8 text-center">
          <div className="w-8 h-8 mx-auto mb-2 animate-pulse bg-surface-tertiary rounded" />
          <div className="h-4 w-40 mx-auto mb-1 animate-pulse bg-surface-tertiary rounded" />
          <div className="h-3 w-48 mx-auto animate-pulse bg-surface-tertiary rounded" />
        </div>
        <div className="bg-card rounded-xl border border-border-light shadow-card p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl animate-pulse bg-surface-tertiary" />
          <div>
            <div className="h-8 w-16 mb-2 animate-pulse bg-surface-tertiary rounded" />
            <div className="h-3.5 w-72 animate-pulse bg-surface-tertiary rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={240} />
          <SkeletonChart height={240} />
        </div>
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('مواءمة الجامعات', 'University Alignment')} />
        <ErrorState message="Failed to load university alignment data" onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <SplitPageLayout pageContext="university">
    <div className="space-y-4">
      <PageHeader
        title={t('مواءمة الجامعات', 'University Alignment')}
        subtitle={t('تحليل المنهج مقابل السوق', 'Curriculum-to-market analysis')}
      />

      {/* Upload */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border-2 border-dashed border-border hover:border-navy/40 transition-colors p-8 text-center cursor-pointer">
        <Upload className="w-8 h-8 text-text-muted mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-primary">{t('تحميل كتالوج المقررات', 'Upload Course Catalog')}</h3>
        <p className="text-xs text-text-muted mt-1">{t('PDF أو Excel — حتى 500 ميجابايت', 'PDF or Excel — up to 500MB')}</p>
      </motion.div>

      {/* Summary */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl border border-border-light shadow-card p-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gold-50 flex items-center justify-center shrink-0">
          <GraduationCap className="w-7 h-7 text-gold-dark" />
        </div>
        <div>
          <div className="text-3xl font-bold text-primary tabular-nums">{overallCoverage != null ? `${overallCoverage}%` : '—'}</div>
          <p className="text-sm text-text-secondary">
            {overallCoverage != null
              ? t(`برامجك تغطي ${overallCoverage}% من المهارات المطلوبة في قطاع الهندسة`, `Your programs cover ${overallCoverage}% of skills demanded by the Engineering sector market.`)
              : t('قم بتحميل كتالوج المقررات لتحليل التغطية', 'Upload a course catalog to analyze coverage')
            }
          </p>
        </div>
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar title={t('تغطية البرنامج مقابل الطلب', 'Program Coverage vs Market Demand')} data={liveProgramCoverage}>
            {liveProgramCoverage.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" data={liveProgramCoverage} startAngle={180} endAngle={0}>
                  <RadialBar dataKey="coverage" background label={{ position: 'insideStart', fill: '#fff', fontSize: 11 }} animationDuration={800} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11, bottom: -5 }} />
                  <Tooltip content={<ChartTooltip unit="%" />} />
                </RadialBarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات تغطية', 'No coverage data available')} height={240} />
            )}
          </ChartToolbar>
          <DataMethodology viewName="vw_supply_education" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar title={t('أهم المهارات المفقودة', 'Top Missing Skills in Curriculum')} data={liveMissingSkills}>
            {liveMissingSkills.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={liveMissingSkills} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={AXIS_TICK_SM} domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="skill" tick={AXIS_TICK_SM} width={110} />
                  <Tooltip content={<ChartTooltip unit="%" />} />
                  <Bar dataKey="gap" fill={SGI_COLORS.critical} radius={BAR_RADIUS_H} name="Gap %" animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty title={t('لا توجد بيانات مهارات', 'No missing skills data')} height={240} />
            )}
          </ChartToolbar>
          <DataMethodology viewName="vw_supply_education" />
        </motion.div>
      </div>

      {/* Recommendations Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
        <div className="p-4 border-b border-border-light gold-gradient-header flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-gold-dark" />
          <h3 className="text-sm font-semibold text-primary">{t('توصيات تحسين المنهج', 'Curriculum Improvement Recommendations')}</h3>
        </div>
        {liveRecommendations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-surface-tertiary">
                {[
                  t('المهارة المفقودة', 'Missing Skill'),
                  t('الأولوية', 'Priority'),
                  t('البرنامج المقترح', 'Suggested Program'),
                  t('درجة الفجوة', 'Gap Score'),
                  t('إجراء', 'Action'),
                ].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {liveRecommendations.map((r, i) => (
                  <tr key={i} className="border-t border-border-light hover:bg-surface-hover transition-colors cursor-pointer group">
                    <td className="px-4 py-3 font-medium text-primary group-hover:text-navy transition-colors">{r.skill}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-xs font-medium ${priorityBadge(r.priority)}`}>{r.priority}</span></td>
                    <td className="px-4 py-3 text-text-secondary">{r.program}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 rounded-full bg-surface-tertiary overflow-hidden">
                          <div className="h-full rounded-full bg-sgi-critical" style={{ width: `${r.gap}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-text-muted">{r.gap}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button className="flex items-center gap-1 text-xs text-teal hover:underline"><Eye className="w-3.5 h-3.5" />{t('تفاصيل', 'View Details')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState compact title={t('لا توجد توصيات', 'No recommendations available')} description={t('قم بتحميل كتالوج المقررات لتحليل الفجوات', 'Upload a course catalog to generate recommendations')} />
        )}
      </motion.div>
    </div>
    </SplitPageLayout>
  );
};

export default UniversityPage;
