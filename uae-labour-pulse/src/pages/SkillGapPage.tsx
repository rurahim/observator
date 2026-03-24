import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import { SkeletonChart, SkeletonTable } from '@/components/shared/Skeletons';
import PageHeader from '@/components/shared/PageHeader';
import FilterBar from '@/components/shared/FilterBar';
import EmptyState, { ChartEmpty } from '@/components/shared/EmptyState';
import { Download, Search, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import ChartTooltip from '@/components/charts/ChartTooltip';
import InteractiveLegend, { useChartLegend } from '@/components/charts/InteractiveLegend';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartInsight from '@/components/charts/ChartInsight';
import DataMethodology from '@/components/charts/DataMethodology';
import DataSourceWarning, { DEMAND_SOURCE_BREAK, SUPPLY_SOURCE_BREAK } from '@/components/charts/DataSourceWarning';
import { ConfidenceBadge, getConfidenceTier } from '@/components/shared/ConfidenceBadge';
import DrillBreadcrumb from '@/components/charts/DrillBreadcrumb';
import { DrillProvider, useDrill } from '@/contexts/DrillContext';
import SplitPageLayout from '@/components/layout/SplitPageLayout';
import { useSkillGap } from '@/api/hooks';
import { useFilters } from '@/contexts/FilterContext';
import { COLORS, SGI_COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, BAR_RADIUS_H } from '@/utils/chartColors';
import { formatCompact } from '@/utils/formatters';

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    'Critical Shortage': 'bg-sgi-critical/10 text-sgi-critical',
    'Moderate Shortage': 'bg-sgi-shortage/10 text-sgi-shortage',
    'Balanced': 'bg-sgi-balanced/10 text-sgi-balanced',
    'Moderate Surplus': 'bg-sgi-surplus/10 text-sgi-surplus',
  };
  return map[status] || 'bg-muted text-text-muted';
};

const autoRiskColor = (risk: number) => {
  if (risk >= 60) return 'bg-sgi-critical';
  if (risk >= 30) return 'bg-sgi-shortage';
  return 'bg-sgi-balanced';
};

const SkillGapPage = () => (
  <DrillProvider>
    <SkillGapContent />
  </DrillProvider>
);

const SkillGapContent = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(600);
  const [searchQuery, setSearchQuery] = useState('');
  const drill = useDrill();

  const supplyDemandLegend = useChartLegend();

  const { filters } = useFilters();
  const apiParams = useMemo(() => {
    const p: Record<string, string | number> = { limit: 50 };
    if (filters.emirate !== 'all') p.emirate = filters.emirate;
    if (filters.sector !== 'all') p.sector = filters.sector;
    return p;
  }, [filters.emirate, filters.sector]);
  const { data: apiData, isLoading: apiLoading, error: apiError } = useSkillGap(apiParams);

  const liveSupplyDemand = useMemo(() => {
    if (!apiData?.occupations?.length) return [];
    // When drilled into an occupation, show only that one (or all if at root)
    const occs = drill.filters['occupation']
      ? apiData.occupations.filter(o => o.title_en === drill.filters['occupation'])
      : apiData.occupations.slice(0, 8);
    return (occs.length ? occs : apiData.occupations.slice(0, 8)).map(o => ({
      name: o.title_en.length > 16 ? o.title_en.slice(0, 14) + '…' : o.title_en,
      demand: o.demand,
      supply: o.supply,
    }));
  }, [apiData, drill.filters]);

  const liveSgiTrend = useMemo(() => {
    if (!apiData?.sgi_trend?.length) return [];
    return apiData.sgi_trend.map(p => ({
      month: p.month,
      sgi: p.sgi != null ? Math.round(p.sgi * 100) / 100 : 0,
    }));
  }, [apiData]);

  const liveTableData = useMemo(() => {
    if (!apiData?.occupations?.length) return [];
    return apiData.occupations.map(o => {
      const gapPct = o.demand > 0 ? Math.round(((o.demand - o.supply) / o.demand) * 100) : 0;
      let status = 'Balanced';
      if (gapPct > 20) status = 'Critical Shortage';
      else if (gapPct > 5) status = 'Moderate Shortage';
      else if (gapPct < -5) status = 'Moderate Surplus';
      // SGI from API (ratio 0-1) — convert to percentage for auto risk proxy
      const sgiRatio = o.sgi ?? 1;
      const autoRisk = Math.round(Math.max(0, Math.min(100, (1 - sgiRatio) * 100)));
      return {
        occupation: o.title_en,
        isco: o.code_isco || '',
        sgi: gapPct,
        status,
        demand: o.demand,
        supply: o.supply,
        gap: o.gap,
        autoRisk,
        emirate: '',
        trend: gapPct > 15 ? 'Rising' : gapPct < -5 ? 'Falling' : 'Stable',
        supplySource: (o as Record<string, unknown>).supply_source as string | undefined,
        supplyYear: (o as Record<string, unknown>).supply_year as number | undefined,
      };
    });
  }, [apiData]);

  // Apply drill-down filter: when an occupation is selected, filter to that occupation
  const drillFiltered = useMemo(() => {
    if (drill.depth === 0) return liveTableData;
    const occFilter = drill.filters['occupation'];
    if (occFilter) return liveTableData.filter(r => r.occupation === occFilter);
    return liveTableData;
  }, [liveTableData, drill.depth, drill.filters]);

  const filtered = drillFiltered.filter(r => r.occupation.toLowerCase().includes(searchQuery.toLowerCase()));

  const columnHeaders: { en: string; ar: string }[] = [
    { en: 'Occupation', ar: 'المهنة' },
    { en: 'ISCO', ar: 'تصنيف' },
    { en: 'SGI%', ar: 'المؤشر%' },
    { en: 'Status', ar: 'الحالة' },
    { en: 'Demand', ar: 'الطلب' },
    { en: 'Supply', ar: 'العرض' },
    { en: 'Gap', ar: 'الفجوة' },
    { en: 'Auto Risk', ar: 'خطر الأتمتة' },
    { en: 'Emirate', ar: 'الإمارة' },
    { en: 'Trend', ar: 'الاتجاه' },
  ];

  if (loading || apiLoading) {
    return (
      <div className="space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="h-6 w-48 animate-pulse bg-surface-tertiary rounded" />
          <div className="h-9 w-28 rounded-xl animate-pulse bg-surface-tertiary rounded" />
        </div>
        {/* Filter bar skeleton */}
        <div className="flex gap-3">
          <div className="h-9 w-40 animate-pulse bg-surface-tertiary rounded-lg" />
          <div className="h-9 w-40 animate-pulse bg-surface-tertiary rounded-lg" />
        </div>
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart height={280} />
          <SkeletonChart height={280} />
        </div>
        {/* Table */}
        <SkeletonTable rows={8} cols={10} />
      </div>
    );
  }

  return (
    <SplitPageLayout pageContext="skill-gap">
    <div className="space-y-4">
      {apiError && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sgi-critical/10 border border-sgi-critical/20 text-sm text-sgi-critical">
          <span className="font-semibold">Error:</span>
          <span>{apiError instanceof Error ? apiError.message : 'Failed to load skill gap data. Please try again.'}</span>
        </div>
      )}
      <PageHeader
        title={t('تحليل فجوة المهارات', 'Skill Gap Analysis')}
        actions={
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors">
            <Download className="w-4 h-4" />
            {t('تصدير البيانات', 'Export Data')}
          </button>
        }
      />

      <FilterBar />
      <DrillBreadcrumb />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar title={t('أعلى 8 عرض مقابل طلب', 'Top 8 Supply vs Demand')} data={liveSupplyDemand}>
            {liveSupplyDemand.length === 0 ? (
              <ChartEmpty title="No supply vs demand data" height={280} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={liveSupplyDemand} layout="vertical">
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis type="number" tick={AXIS_TICK_SM} />
                    <YAxis type="category" dataKey="name" tick={AXIS_TICK_SM} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    {!supplyDemandLegend.isHidden('demand') && (
                      <Bar dataKey="demand" fill={COLORS.navy} name="Demand" radius={BAR_RADIUS_H} animationDuration={800} cursor="pointer" onClick={(data: any) => data?.name && drill.push('occupation', data.name, data.name)} />
                    )}
                    {!supplyDemandLegend.isHidden('supply') && (
                      <Bar dataKey="supply" fill={COLORS.gold} name="Supply" radius={BAR_RADIUS_H} animationDuration={800} cursor="pointer" onClick={(data: any) => data?.name && drill.push('occupation', data.name, data.name)} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
                <InteractiveLegend
                  items={[
                    { value: t('الطلب', 'Demand'), color: COLORS.navy, dataKey: 'demand' },
                    { value: t('العرض', 'Supply'), color: COLORS.gold, dataKey: 'supply' },
                  ]}
                  onToggle={supplyDemandLegend.setHiddenKeys}
                />
                <DataSourceWarning {...SUPPLY_SOURCE_BREAK} />
                <DataSourceWarning {...DEMAND_SOURCE_BREAK} />
                <DataMethodology viewName="vw_gap_cube" />
              </>
            )}
          </ChartToolbar>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar title={t('اتجاه المؤشر — 6 أشهر', 'SGI Trend — 6 Months')} data={liveSgiTrend}>
            {liveSgiTrend.length === 0 ? (
              <ChartEmpty title="No SGI trend data" height={280} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={liveSgiTrend}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="month" tick={AXIS_TICK} />
                    <YAxis tick={AXIS_TICK} domain={['auto', 'auto']} />
                    <Tooltip content={<ChartTooltip unit="%" />} />
                    <ReferenceLine y={20} stroke={SGI_COLORS.critical} strokeDasharray="6 4" label={{ value: 'National Avg', position: 'insideTopRight', fill: SGI_COLORS.critical, fontSize: 10 }} />
                    <Line type="monotone" dataKey="sgi" stroke={COLORS.navy} strokeWidth={1.5} dot={{ fill: COLORS.navy, r: 3 }} name="SGI %" animationDuration={800} />
                  </LineChart>
                </ResponsiveContainer>
                <DataMethodology viewName="vw_gap_cube" />
                <ChartInsight text="SGI trending downward from 21.2% to 18.7% — a 12% improvement over 6 months" severity="balanced" />
              </>
            )}
          </ChartToolbar>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
        <div className="p-4 border-b border-border-light flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-primary">{t('تفاصيل المهن', 'Occupation Details')}</h3>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('بحث عن مهنة...', 'Search occupation...')}
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-surface-tertiary border-none text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-tertiary">
                {columnHeaders.map(h => (
                  <th key={h.en} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">{t(h.ar, h.en)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columnHeaders.length}>
                    <EmptyState
                      compact
                      title="No skill gap data"
                      description="Data will appear once the API returns results"
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={i} className="group cursor-pointer border-t border-border-light hover:bg-surface-hover transition-colors" onClick={() => drill.push('occupation', row.occupation, row.occupation)}>
                    <td className="px-4 py-3 font-medium text-primary whitespace-nowrap">{row.occupation}</td>
                    <td className="px-4 py-3 text-text-muted tabular-nums">{row.isco}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        <span className={`font-semibold tabular-nums ${row.sgi > 0 ? 'text-sgi-critical' : row.sgi < 0 ? 'text-sgi-surplus' : 'text-sgi-balanced'}`}>{row.sgi > 0 ? '+' : ''}{row.sgi}%</span>
                        <ConfidenceBadge tier={getConfidenceTier(row.supplySource)} mode="tooltip" detail={`Source: ${row.supplySource || 'mixed'}${row.supplyYear ? ` (${row.supplyYear})` : ''}`} />
                      </span>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${statusBadge(row.status)}`}>{row.status}</span></td>
                    <td className="px-4 py-3 tabular-nums text-text-secondary">{formatCompact(row.demand)}<ConfidenceBadge tier="medium" mode="inline" margin="±15%" /></td>
                    <td className="px-4 py-3 tabular-nums text-text-secondary">{formatCompact(row.supply)}<ConfidenceBadge tier={getConfidenceTier(row.supplySource)} mode="inline" margin={row.supplySource?.includes('Bayanat') ? '±2%' : '±10%'} /></td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1">
                        <span className={`font-medium tabular-nums ${row.gap > 0 ? 'text-sgi-critical' : 'text-sgi-surplus'}`}>{row.gap > 0 ? '+' : ''}{row.gap.toLocaleString()}</span>
                        <ConfidenceBadge tier={getConfidenceTier(row.supplySource, row.supply, row.demand)} mode="badge" margin={row.supply < 100 || row.demand < 50 ? '±50%+' : '±20%'} />
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 rounded-full bg-surface-tertiary overflow-hidden">
                          <div className={`h-full rounded-full ${autoRiskColor(row.autoRisk)}`} style={{ width: `${row.autoRisk}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-text-muted">{row.autoRisk}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{row.emirate}</td>
                    <td className="px-4 py-3">
                      {row.trend === 'Rising' && <span className="flex items-center gap-1 text-sgi-critical"><ArrowUp className="w-3 h-3" /><span className="text-xs">Rising</span></span>}
                      {row.trend === 'Falling' && <span className="flex items-center gap-1 text-sgi-balanced"><ArrowDown className="w-3 h-3" /><span className="text-xs">Falling</span></span>}
                      {row.trend === 'Stable' && <span className="flex items-center gap-1 text-text-muted"><Minus className="w-3 h-3" /><span className="text-xs">Stable</span></span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
    </SplitPageLayout>
  );
};

export default SkillGapPage;
