import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import FilterBar from '@/components/shared/FilterBar';
import KPICard from '@/components/shared/KPICard';
import ResearchBrief from '@/components/shared/ResearchBrief';
import ChartTooltip from '@/components/charts/ChartTooltip';
import InteractiveLegend, { useChartLegend } from '@/components/charts/InteractiveLegend';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ChartInsight from '@/components/charts/ChartInsight';
import { formatCompact } from '@/utils/formatters';
import { exportToPDF, exportToPNG } from '@/utils/exportDashboard';
import { COLORS, SGI_COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, POLAR_TICK, RADIUS_TICK, CHART_GRID, BAR_RADIUS, getSeriesColor, SECTOR_COLORS } from '@/utils/chartColors';
import ChartGradientDefs from '@/components/charts/ChartGradientDefs';
import DataMethodology from '@/components/charts/DataMethodology';
import DataSourceWarning, { DEMAND_SOURCE_BREAK, SUPPLY_SOURCE_BREAK } from '@/components/charts/DataSourceWarning';
import { usePageLoading } from '@/hooks/usePageLoading';
import { useDashboardSummary, useSalaryBenchmarks, useSkillGap } from '@/api/hooks';
import { useFilters } from '@/contexts/FilterContext';
import { SkeletonKPICard, SkeletonChart, SkeletonTable } from '@/components/shared/Skeletons';
import ResponsiveTable from '@/components/shared/ResponsiveTable';
import ComparisonMode from '@/components/shared/ComparisonMode';
import { AlertTriangle, Users, Zap, TrendingDown, Download, ArrowUp, ArrowDown, Minus, BookOpen, PanelRightOpen, GitCompare, FileText, Image, ChevronDown, Loader2, DollarSign, Inbox } from 'lucide-react';
import EmptyState, { ChartEmpty, ErrorState } from '@/components/shared/EmptyState';
import { ConfidenceBadge, getConfidenceTier } from '@/components/shared/ConfidenceBadge';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts';

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    'Critical Shortage': 'bg-sgi-critical/10 text-sgi-critical',
    'Moderate Shortage': 'bg-sgi-shortage/10 text-sgi-shortage',
    'Balanced': 'bg-sgi-balanced/10 text-sgi-balanced',
    'Moderate Surplus': 'bg-sgi-surplus/10 text-sgi-surplus',
    'Critical Surplus': 'bg-sgi-oversupply/10 text-sgi-oversupply',
  };
  return map[status] || 'bg-muted text-text-muted';
};

const TrendArrow = ({ trend }: { trend: string }) => {
  if (trend === 'Rising') return <span className="flex items-center gap-1 text-sgi-critical"><ArrowUp className="w-3 h-3" /><span className="text-xs">Rising</span></span>;
  if (trend === 'Falling') return <span className="flex items-center gap-1 text-sgi-balanced"><ArrowDown className="w-3 h-3" /><span className="text-xs">Falling</span></span>;
  return <span className="flex items-center gap-1 text-text-muted"><Minus className="w-3 h-3" /><span className="text-xs">Stable</span></span>;
};

function getSGIColor(sgi: number) {
  if (sgi > 20) return SGI_COLORS.critical;
  if (sgi > 10) return SGI_COLORS.shortage;
  if (sgi > 0) return SGI_COLORS.balanced;
  return SGI_COLORS.surplus;
}

// UAE Map Component
const UAEMap = ({ emirateMetrics }: { emirateMetrics?: { emirate: string; supply: number; demand: number; gap: number; sgi?: number }[] }) => {
  const [hoveredEmirate, setHoveredEmirate] = useState<string | null>(null);

  const emiratesSGI = useMemo(() => {
    if (!emirateMetrics?.length) return [];
    return emirateMetrics.map(e => {
      const sgi = e.sgi != null
        ? Math.round(Math.abs(e.sgi) * 100) / 100
        : Math.round(((e.demand - e.supply) / Math.max(e.demand, 1)) * 100);
      return { name: e.emirate, sgi, color: getSGIColor(sgi) };
    });
  }, [emirateMetrics]);

  const paths: { name: string; d: string; textX: number; textY: number; fontSize: string }[] = [
    { name: 'Abu Dhabi', d: 'M 30 60 L 180 40 L 200 80 L 190 140 L 120 170 L 40 150 Z', textX: 100, textY: 110, fontSize: '10px' },
    { name: 'Dubai', d: 'M 200 80 L 250 50 L 280 60 L 270 100 L 230 110 Z', textX: 240, textY: 85, fontSize: '9px' },
    { name: 'Sharjah', d: 'M 270 40 L 300 35 L 310 60 L 280 60 Z', textX: 290, textY: 50, fontSize: '8px' },
    { name: 'Ajman', d: 'M 300 30 L 315 28 L 318 42 L 305 43 Z', textX: 308, textY: 37, fontSize: '6px' },
    { name: 'RAK', d: 'M 310 10 L 340 5 L 345 30 L 315 28 Z', textX: 328, textY: 20, fontSize: '8px' },
    { name: 'Fujairah', d: 'M 340 25 L 370 20 L 375 70 L 340 75 Z', textX: 355, textY: 50, fontSize: '8px' },
    { name: 'UAQ', d: 'M 305 43 L 320 42 L 322 55 L 310 56 Z', textX: 313, textY: 50, fontSize: '6px' },
  ];

  if (!emiratesSGI.length) {
    return <ChartEmpty title="No emirate data available" height={192} />;
  }

  return (
    <div className="flex items-center gap-6">
      <div className="flex-1 relative h-48">
        <svg viewBox="0 0 400 200" className="w-full h-full">
          {paths.map(p => {
            const emirate = emiratesSGI.find(e => e.name === p.name) ?? { name: p.name, sgi: 0, color: '#CBD5E1' };
            const isHovered = hoveredEmirate === p.name;
            return (
              <g
                key={p.name}
                onMouseEnter={() => setHoveredEmirate(p.name)}
                onMouseLeave={() => setHoveredEmirate(null)}
                className="cursor-pointer transition-all duration-200"
              >
                <path
                  d={p.d}
                  fill={emirate.color}
                  fillOpacity={isHovered ? 0.6 : 0.3}
                  stroke={emirate.color}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                />
                <text x={p.textX} y={p.textY} textAnchor="middle" className="font-medium fill-text-primary" style={{ fontSize: p.fontSize }}>
                  {p.name === 'Abu Dhabi' && isHovered ? 'Abu Dhabi' : p.name.length > 6 ? p.name.slice(0, 3).toUpperCase() : p.name}
                </text>
                {isHovered && (
                  <text x={p.textX} y={p.textY + 12} textAnchor="middle" className="font-bold fill-text-primary" style={{ fontSize: '10px' }}>
                    SGI: {emirate.sgi}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="space-y-2 shrink-0">
        {emiratesSGI.map(e => (
          <div
            key={e.name}
            className={`flex items-center gap-2 text-xs px-2 py-1 rounded-lg transition-colors cursor-pointer ${hoveredEmirate === e.name ? 'bg-surface-hover' : ''}`}
            onMouseEnter={() => setHoveredEmirate(e.name)}
            onMouseLeave={() => setHoveredEmirate(null)}
          >
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: e.color, opacity: 0.5 }} />
            <span className="text-text-secondary w-20">{e.name}</span>
            <span className="font-medium tabular-nums text-primary">{e.sgi}%</span>
          </div>
        ))}
        <div className="pt-2 border-t border-border-light space-y-1 mt-2">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted"><div className="w-2 h-2 rounded-full bg-sgi-critical" />Critical</div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted"><div className="w-2 h-2 rounded-full bg-sgi-shortage" />Shortage</div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted"><div className="w-2 h-2 rounded-full bg-sgi-balanced" />Balanced</div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted"><div className="w-2 h-2 rounded-full bg-sgi-surplus" />Surplus</div>
        </div>
      </div>
    </div>
  );
};

const DashboardPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(700);
  const [briefOpen, setBriefOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  // --- API data wiring ---
  const { filters } = useFilters();

  const apiParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (filters.emirate !== 'all') p.emirate = filters.emirate;
    if (filters.sector !== 'all') p.sector = filters.sector;
    return p;
  }, [filters.emirate, filters.sector]);

  const { data: apiData, isLoading: apiLoading, error: apiError } = useDashboardSummary(apiParams);
  const { data: salaryData } = useSalaryBenchmarks({ emirate: apiParams.emirate, limit: 30 });
  const { data: skillGapData } = useSkillGap({ limit: 20 });

  // KPI derived values — show "—" when no API data is available
  const totalSupply = apiData?.total_supply ?? null;
  const totalDemand = apiData?.total_demand ?? null;
  const sgiValue = (totalDemand != null && totalSupply != null && totalDemand > 0)
    ? String(Math.round(((totalDemand - totalSupply) / totalDemand) * 1000) / 10)
    : '—';

  // Supply vs Demand trend
  const supplyDemandData = useMemo(() => {
    if (!apiData?.supply_demand_trend?.length) return [];
    return apiData.supply_demand_trend.map(p => ({
      month: p.month.length > 7 ? p.month.slice(5, 7) : p.month,
      demand: p.demand,
      supply: p.supply,
    }));
  }, [apiData]);

  // Sector distribution
  const sectorDistribution = useMemo(() => {
    if (!apiData?.sector_distribution?.length) return [];
    const total = apiData.sector_distribution.reduce((s, d) => s + d.count, 0);
    return apiData.sector_distribution.map((d, i) => ({
      name: d.sector,
      value: total > 0 ? Math.round((d.count / total) * 100) : 0,
      color: SECTOR_COLORS[d.sector as keyof typeof SECTOR_COLORS] || getSeriesColor(i),
    }));
  }, [apiData]);

  // Emirate bar chart
  const emirateBarData = useMemo(() => {
    if (!apiData?.emirate_metrics?.length) return [];
    return apiData.emirate_metrics.map(e => ({
      emirate: e.emirate,
      sgi: e.sgi != null ? Math.round(Math.abs(e.sgi) * 100) / 100 : Math.round(((e.demand - e.supply) / Math.max(e.demand, 1)) * 100),
      shortages: e.gap > 0 ? Math.ceil(e.gap / 500) : 0,
    }));
  }, [apiData]);

  // Table data
  const tableData = useMemo(() => {
    if (!apiData?.top_occupations?.length) return [];
    return apiData.top_occupations.map(o => {
      const gapPct = o.demand > 0 ? Math.round(((o.demand - o.supply) / o.demand) * 100) : 0;
      let status = 'Balanced';
      if (gapPct > 20) status = 'Critical Shortage';
      else if (gapPct > 5) status = 'Moderate Shortage';
      else if (gapPct < -5) status = 'Moderate Surplus';
      else if (gapPct < -20) status = 'Critical Surplus';
      return {
        occupation: o.title_en,
        isco: '',
        sgi: gapPct,
        status,
        demand: o.demand,
        supply: o.supply,
        gap: o.gap,
        emirate: '',
        trend: gapPct > 10 ? 'Rising' : gapPct < -5 ? 'Falling' : 'Stable',
        supplySource: (o as Record<string, unknown>).supply_source as string | undefined,
      };
    });
  }, [apiData]);

  // Emirate radar chart — derived from real emirate_metrics
  const emirateRadarData = useMemo(() => {
    if (!apiData?.emirate_metrics?.length) return [];
    const totalDemandSum = apiData.emirate_metrics.reduce((s, e) => s + e.demand, 0) || 1;
    const totalSupplySum = apiData.emirate_metrics.reduce((s, e) => s + e.supply, 0) || 1;
    const top3 = apiData.emirate_metrics.slice(0, 3);
    const metrics = ['Demand Share', 'Supply Share', 'Gap Intensity', 'Market Size'];
    return metrics.map(metric => {
      const row: Record<string, unknown> = { metric, fullMark: 100 };
      for (const e of top3) {
        if (metric === 'Demand Share') row[e.emirate] = Math.round((e.demand / totalDemandSum) * 100);
        else if (metric === 'Supply Share') row[e.emirate] = Math.round((e.supply / totalSupplySum) * 100);
        else if (metric === 'Gap Intensity') row[e.emirate] = Math.min(100, e.gap > 0 ? Math.round((e.gap / Math.max(e.demand, 1)) * 100) : 0);
        else if (metric === 'Market Size') row[e.emirate] = Math.round(((e.supply + e.demand) / (totalSupplySum + totalDemandSum)) * 100);
      }
      return row;
    });
  }, [apiData]);

  // Top 3 emirate names for dynamic Radar series
  const radarEmirateNames = useMemo(() => {
    if (!apiData?.emirate_metrics?.length) return [];
    return apiData.emirate_metrics.slice(0, 3).map(e => e.emirate);
  }, [apiData]);

  // Private Sector Workforce — use last year WITH non-zero supply data
  const workforceCount = useMemo(() => {
    const trend = apiData?.supply_demand_trend;
    if (!trend?.length) return '—';
    const withSupply = [...trend].reverse().find(t => t.supply > 0);
    if (!withSupply) return '—';
    return formatCompact(withSupply.supply);
  }, [apiData]);

  // Year label for the latest supply entry
  const workforceYear = useMemo(() => {
    const trend = apiData?.supply_demand_trend;
    if (!trend?.length) return null;
    const withSupply = [...trend].reverse().find(t => t.supply > 0);
    return withSupply?.month ?? null;
  }, [apiData]);

  // Growth since first year with supply data
  const workforceGrowth: { pct: number; fromYear: string } | null = useMemo(() => {
    const trend = apiData?.supply_demand_trend;
    if (!trend || trend.length < 2) return null;
    const first = trend.find(t => t.supply > 0);
    const last = [...trend].reverse().find(t => t.supply > 0);
    if (!first || !last || first === last || first.supply === 0) return null;
    return {
      pct: Math.round(((last.supply - first.supply) / first.supply) * 1000) / 10,
      fromYear: first.month,
    };
  }, [apiData]);

  const workforceSparkData = useMemo(() => {
    const trend = apiData?.supply_demand_trend;
    if (!trend?.length) return undefined;
    const vals = trend.filter(t => t.supply > 0).map(t => t.supply);
    return vals.length >= 3 ? vals.slice(-8) : undefined;
  }, [apiData]);

  // AI Automation Risk — from skill-gap API's ai_exposure_score (joined from fact_ai_exposure_occupation)
  const aiAutomationRisk = useMemo(() => {
    // Primary: use skill-gap data which has ai_exposure_score
    const sgOccs = skillGapData?.occupations;
    if (sgOccs?.length) {
      const withScore = sgOccs.filter(o => typeof o.ai_exposure_score === 'number' && o.ai_exposure_score > 0);
      if (withScore.length > 0) {
        const avg = withScore.reduce((sum, o) => sum + (o.ai_exposure_score ?? 0), 0) / withScore.length;
        return Math.round(avg);
      }
    }
    // Fallback: check dashboard top_occupations
    const occs = apiData?.top_occupations;
    if (occs?.length) {
      const withExposure = occs.filter(o => {
        const score = (o as Record<string, unknown>).ai_exposure_score;
        return typeof score === 'number' && score > 0;
      });
      if (withExposure.length > 0) {
        const avg = withExposure.reduce((sum, o) => sum + ((o as Record<string, unknown>).ai_exposure_score as number), 0) / withExposure.length;
        return Math.round(avg);
      }
    }
    return null;
  }, [skillGapData, apiData]);

  // Ref targeting the left dashboard content pane for export capture.
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Export dropdown open state and in-progress indicator.
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Close the export dropdown when the user clicks outside of it.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    if (exportMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen]);

  const EXPORT_FILENAME = 'uae-labour-pulse-dashboard';

  const handleExportPDF = useCallback(async () => {
    if (!dashboardRef.current || exporting) return;
    setExportMenuOpen(false);
    setExporting(true);
    const toastId = toast.loading(t('جارٍ تصدير PDF…', 'Generating PDF…'));
    try {
      await exportToPDF(dashboardRef.current, EXPORT_FILENAME);
      toast.success(t('تم تصدير PDF بنجاح', 'PDF exported successfully'), { id: toastId });
    } catch {
      toast.error(t('فشل تصدير PDF', 'PDF export failed'), { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);

  const handleExportPNG = useCallback(async () => {
    if (!dashboardRef.current || exporting) return;
    setExportMenuOpen(false);
    setExporting(true);
    const toastId = toast.loading(t('جارٍ تصدير PNG…', 'Generating PNG…'));
    try {
      await exportToPNG(dashboardRef.current, EXPORT_FILENAME);
      toast.success(t('تم تصدير PNG بنجاح', 'PNG exported successfully'), { id: toastId });
    } catch {
      toast.error(t('فشل تصدير PNG', 'PNG export failed'), { id: toastId });
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);

  // Interactive legend state for supply vs demand chart
  const supplyDemandLegend = useChartLegend();
  const emirateLegend = useChartLegend();

  // Active sector for pie chart
  const [activeSector, setActiveSector] = useState<number | null>(null);

  const onPieEnter = useCallback((_: unknown, index: number) => setActiveSector(index), []);
  const onPieLeave = useCallback(() => setActiveSector(null), []);

  if (loading || apiLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-52 mb-2 animate-pulse bg-surface-tertiary rounded" />
            <div className="h-3.5 w-72 animate-pulse bg-surface-tertiary rounded" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-32 rounded-xl animate-pulse bg-surface-tertiary" />
            <div className="h-9 w-28 rounded-xl animate-pulse bg-surface-tertiary" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <SkeletonKPICard key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart height={200} />
        </div>
        <SkeletonTable rows={6} cols={9} />
      </div>
    );
  }

  return (
    <div className="flex gap-0 -m-4 lg:-m-6" style={{ minHeight: 'calc(100vh - 56px)' }}>
      {/* Left Pane — Dashboard Tiles */}
      <div ref={dashboardRef} className={`flex-1 p-4 lg:p-6 space-y-4 overflow-y-auto transition-all duration-300 ${briefOpen ? 'lg:w-[65%]' : 'w-full'}`}>
      <PageHeader
        title={t('لوحة القيادة التنفيذية', 'Executive Dashboard')}
        subtitle={apiData?.refreshed_at
          ? t(`آخر تحديث: ${apiData.refreshed_at}`, `Last updated: ${apiData.refreshed_at}`)
          : t('آخر تحديث: بيانات حية من قاعدة البيانات', 'Last updated: Live data from database')
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBriefOpen(b => !b)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                briefOpen ? 'bg-navy text-primary-foreground' : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {briefOpen ? <BookOpen className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              {t('ملخص بحثي', 'Research Brief')}
            </button>
            <button
              onClick={() => setCompareOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-tertiary text-text-secondary text-sm font-medium hover:bg-surface-hover transition-colors"
            >
              <GitCompare className="w-4 h-4" />
              {t('مقارنة', 'Compare')}
            </button>
            {/* Export dropdown */}
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen(o => !o)}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {exporting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download className="w-4 h-4" />}
                {t('تصدير', 'Export')}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${exportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {exportMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute end-0 mt-2 w-48 z-50 bg-card rounded-xl border border-border-light shadow-dropdown overflow-hidden"
                  >
                    <button
                      onClick={handleExportPDF}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <FileText className="w-4 h-4 text-navy" />
                      {t('تصدير كـ PDF', 'Export as PDF')}
                    </button>
                    <div className="h-px bg-border-light mx-3" />
                    <button
                      onClick={handleExportPNG}
                      className="flex w-full items-center gap-3 px-4 py-3 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <Image className="w-4 h-4 text-teal" />
                      {t('تصدير كـ PNG', 'Export as PNG')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        }
      />

      <FilterBar />

      {/* API Error Banner */}
      {apiError && (
        <div className="bg-card rounded-xl border border-sgi-critical/30 shadow-card p-4">
          <ErrorState
            message={t(
              'تعذّر تحميل بيانات لوحة القيادة. تحقق من اتصال الخادم وأعد المحاولة.',
              'Failed to load dashboard data. Check server connectivity and try again.'
            )}
            compact
          />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={AlertTriangle}
          label={t('مؤشر فجوة المهارات الوطني', 'National Skill Gap Index')}
          value={sgiValue}
          unit={sgiValue !== '—' ? '%' : undefined}
          status="warning"
          delay={0}
          dataStatus="provisional"
          sourceLabel="Bayanat + GLMM/MOHRE + LinkedIn"
          marginOfError={sgiValue !== '—' ? t('±15-25% (مصادر مختلطة)', '±15-25% (mixed sources)') : undefined}
        />
        <KPICard
          icon={Zap}
          label={t('النقص الحاد', 'Critical Shortages')}
          value={tableData.length > 0 ? String(tableData.filter(r => r.status === 'Critical Shortage').length) : '—'}
          unit={tableData.length > 0 ? t('مهنة', 'occupations') : undefined}
          status="critical"
          delay={0.05}
          dataStatus="provisional"
          sourceLabel={t('مكعب الفجوة (العرض مقابل الطلب)', 'Gap cube (supply vs demand)')}
        />
        <KPICard
          icon={Users}
          label={t('القوى العاملة في القطاع الخاص', 'Private Sector Workforce')}
          value={workforceCount}
          unit={workforceYear ? `(${workforceYear})` : undefined}
          trend={workforceGrowth?.pct ?? undefined}
          trendContext={workforceGrowth ? t(`نمو منذ ${workforceGrowth.fromYear}`, `growth since ${workforceGrowth.fromYear}`) : undefined}
          status="info"
          sparkData={workforceSparkData}
          delay={0.1}
          dataStatus="provisional"
          sourceLabel={t('وزارة الموارد البشرية / GLMM', 'MOHRE / GLMM Supply Data')}
        />
        <KPICard
          icon={TrendingDown}
          label={t('مخاطر أتمتة الذكاء الاصطناعي', 'AI Automation Risk')}
          value={aiAutomationRisk != null ? String(aiAutomationRisk) : '—'}
          unit={aiAutomationRisk != null ? t('% من المهن', '% of roles') : undefined}
          status="warning"
          delay={0.15}
          dataStatus="final"
          sourceLabel={t('مؤشر OECD AIOE 2023 + Felten', 'OECD AIOE Index 2023 + Felten et al.')}
          marginOfError={aiAutomationRisk != null ? t('من عينة 39 مهنة من أصل 2,172', 'from sample of 39 occupations out of 2,172') : undefined}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar
            title={t('العرض مقابل الطلب — الاتجاه السنوي', 'Supply vs Demand — Annual Trend')}
            data={supplyDemandData}
          >
            {supplyDemandData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={supplyDemandData}>
                  <ChartGradientDefs />
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tick={AXIS_TICK} />
                  <YAxis tick={AXIS_TICK} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip content={<ChartTooltip />} />
                  {/* Reference line removed — no verified policy target to show */}
                  {!supplyDemandLegend.isHidden('demand') && (
                    <Area type="monotone" dataKey="demand" stroke={COLORS.navy} fill="url(#gradient-navy)" strokeWidth={1.5} name={t('الطلب', 'Demand')} dot={false} animationDuration={800} />
                  )}
                  {!supplyDemandLegend.isHidden('supply') && (
                    <Area type="monotone" dataKey="supply" stroke={COLORS.gold} fill="url(#gradient-gold)" strokeWidth={1.5} name={t('العرض', 'Supply')} dot={false} animationDuration={800} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty height={240} />
            )}
          </ChartToolbar>
          <InteractiveLegend
            items={[
              { value: t('الطلب', 'Demand'), color: COLORS.navy, dataKey: 'demand' },
              { value: t('العرض', 'Supply'), color: COLORS.gold, dataKey: 'supply' },
            ]}
            onToggle={supplyDemandLegend.setHiddenKeys}
          />
          {supplyDemandData.length > 0 && (
            <>
              <DataSourceWarning {...SUPPLY_SOURCE_BREAK} />
              <DataSourceWarning {...DEMAND_SOURCE_BREAK} />
            </>
          )}
          <DataMethodology viewName="dashboard_supply_demand" />
          {supplyDemandData.length > 0 && (
            <ChartInsight
              text={t(
                `${supplyDemandData.length} نقطة بيانات — العرض والطلب عبر ${supplyDemandData.filter(d => d.supply > 0).length} سنوات`,
                `${supplyDemandData.length} data points — supply across ${supplyDemandData.filter(d => d.supply > 0).length} years, demand across ${supplyDemandData.filter(d => d.demand > 0).length} years`
              )}
              severity="info"
            />
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar
            title={t('توزيع النقص حسب القطاع', 'Shortage Distribution by Sector')}
            data={sectorDistribution}
          >
            {sectorDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={sectorDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={activeSector !== null ? 95 : 90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name} ${value}%`}
                    labelLine={false}
                    style={{ fontSize: 10, cursor: 'pointer' }}
                    onMouseEnter={onPieEnter}
                    onMouseLeave={onPieLeave}
                    animationDuration={800}
                  >
                    {sectorDistribution.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color}
                        opacity={activeSector !== null && activeSector !== i ? 0.4 : 1}
                        stroke={activeSector === i ? entry.color : 'transparent'}
                        strokeWidth={activeSector === i ? 3 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip unit="%" />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty height={240} />
            )}
          </ChartToolbar>
          <DataMethodology viewName="dashboard_sector" />
          {sectorDistribution.length > 0 && (
            <ChartInsight
              text={t(
                `قطاع ${sectorDistribution[0]?.name || 'البناء'} يشكل ${sectorDistribution[0]?.value || 0}% من إجمالي القوى العاملة — أكبر قطاع`,
                `${sectorDistribution[0]?.name || 'Construction'} accounts for ${sectorDistribution[0]?.value || 0}% of total workforce — largest sector`
              )}
              severity="info"
            />
          )}
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar
            title={t('مؤشر فجوة المهارات حسب الإمارة', 'Skill Gap Index by Emirate')}
            data={emirateBarData}
          >
            {emirateBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={emirateBarData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="emirate" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK} />
                  <Tooltip content={<ChartTooltip unit="%" />} />
                  <ReferenceLine y={15} stroke={SGI_COLORS.critical} strokeDasharray="4 4" strokeWidth={1} label={{ value: t('عتبة حرجة', 'Critical threshold'), position: 'right', fill: SGI_COLORS.critical, fontSize: 9 }} />
                  {!emirateLegend.isHidden('sgi') && (
                    <Bar dataKey="sgi" fill={COLORS.navy} name={t('مؤشر %', 'SGI %')} radius={BAR_RADIUS} animationDuration={800} />
                  )}
                  {!emirateLegend.isHidden('shortages') && (
                    <Bar dataKey="shortages" fill={COLORS.gold} name={t('نقص', 'Shortages')} radius={BAR_RADIUS} animationDuration={800} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmpty height={240} />
            )}
          </ChartToolbar>
          <InteractiveLegend
            items={[
              { value: t('مؤشر %', 'SGI %'), color: COLORS.navy, dataKey: 'sgi' },
              { value: t('نقص', 'Shortages'), color: COLORS.gold, dataKey: 'shortages' },
            ]}
            onToggle={emirateLegend.setHiddenKeys}
          />
          <DataMethodology viewName="dashboard_emirate" />
          {emirateBarData.filter(e => e.sgi > 15).length > 0 && (
            <ChartInsight
              text={t(
                `${emirateBarData.filter(e => e.sgi > 15).map(e => e.emirate).join(' و')} فوق العتبة الحرجة (15%) — تحتاج إلى تدخل`,
                `${emirateBarData.filter(e => e.sgi > 15).map(e => e.emirate).join(' and ')} exceed the critical threshold (15%) — intervention needed`
              )}
              severity="critical"
            />
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
          <ChartToolbar title={t('خريطة الإمارات — كثافة المؤشر', 'UAE Emirates Map — SGI Intensity')}>
            <UAEMap emirateMetrics={apiData?.emirate_metrics} />
          </ChartToolbar>
        </motion.div>
      </div>

      {/* Emirate Health Radar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 overflow-hidden">
        <ChartToolbar title={t('صحة سوق العمل بالإمارات — رادار', 'Emirate Labour Market Health — Radar')}>
          {emirateRadarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={emirateRadarData}>
                <PolarGrid stroke={CHART_GRID} strokeWidth={0.5} gridType="circle" />
                <PolarAngleAxis dataKey="metric" tick={POLAR_TICK} tickLine={false} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={RADIUS_TICK} tickCount={5} axisLine={false} />
                {radarEmirateNames[0] && (
                  <Radar name={radarEmirateNames[0]} dataKey={radarEmirateNames[0]} stroke={COLORS.navy} fill={COLORS.navy} fillOpacity={0.12} strokeWidth={2} animationDuration={600} />
                )}
                {radarEmirateNames[1] && (
                  <Radar name={radarEmirateNames[1]} dataKey={radarEmirateNames[1]} stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={0.12} strokeWidth={2} animationDuration={600} />
                )}
                {radarEmirateNames[2] && (
                  <Radar name={radarEmirateNames[2]} dataKey={radarEmirateNames[2]} stroke={COLORS.teal} fill={COLORS.teal} fillOpacity={0.12} strokeWidth={2} animationDuration={600} />
                )}
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
                <Tooltip content={<ChartTooltip unit="/100" />} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty height={320} />
          )}
        </ChartToolbar>
        {emirateRadarData.length > 0 && radarEmirateNames.length > 0 && (
          <ChartInsight
            text={t(
              `${radarEmirateNames[0]} و${radarEmirateNames[1] || ''} يهيمنان على سوق العمل الإماراتي — مشتق من بيانات العرض/الطلب الفعلية`,
              `${radarEmirateNames[0]} and ${radarEmirateNames[1] || ''} dominate the UAE labour market — derived from real supply/demand data`
            )}
            severity="info"
          />
        )}
      </motion.div>

      {/* Salary Benchmarks */}
      {salaryData && salaryData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
          <div className="p-4 border-b border-border-light flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gold-dark" />
              <h3 className="text-sm font-semibold text-primary">{t('مؤشرات الرواتب (AED/شهرياً)', 'Salary Benchmarks (AED/month)')}</h3>
            </div>
            <span className="text-[10px] text-text-muted">{t('المصدر: Glassdoor', 'Source: Glassdoor')}</span>
          </div>

          {/* Salary bar chart — top 15 by median */}
          <div className="p-4">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={salaryData.slice(0, 15).map(s => ({
                  title: s.job_title.length > 20 ? s.job_title.slice(0, 18) + '…' : s.job_title,
                  min: s.min_salary,
                  median: s.median_salary,
                  max: s.max_salary,
                  emirate: s.emirate,
                }))}
                layout="vertical"
                margin={{ left: 120, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={AXIS_TICK} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <YAxis type="category" dataKey="title" tick={AXIS_TICK_SM} width={110} />
                <Tooltip content={<ChartTooltip unit=" AED" />} />
                <Bar dataKey="min" fill={COLORS.teal} name={t('الحد الأدنى', 'Min')} radius={[0, 0, 0, 0]} stackId="salary" opacity={0.4} />
                <Bar dataKey="median" fill={COLORS.navy} name={t('الوسيط', 'Median')} radius={[0, 0, 0, 0]} stackId="salary" />
                <Bar dataKey="max" fill={COLORS.gold} name={t('الحد الأقصى', 'Max')} radius={[0, 3, 3, 0]} stackId="salary" opacity={0.5} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Salary table */}
          <ResponsiveTable
            data={salaryData}
            keyExtractor={row => `${row.job_title}-${row.region_code}`}
            columns={[
              { key: 'job_title', label: t('المسمى الوظيفي', 'Job Title'), primary: true, render: row => <span className="font-medium text-primary">{row.job_title}</span> },
              { key: 'emirate', label: t('الإمارة', 'Emirate'), render: row => <span className="text-text-secondary">{row.emirate || row.region_code}</span> },
              { key: 'min_salary', label: t('الحد الأدنى', 'Min'), render: row => <span className="tabular-nums text-text-muted">{row.min_salary?.toLocaleString()}</span>, hideOnMobile: true },
              { key: 'median_salary', label: t('الوسيط', 'Median'), render: row => <span className="tabular-nums font-semibold text-primary">{row.median_salary?.toLocaleString()}</span> },
              { key: 'max_salary', label: t('الحد الأقصى', 'Max'), render: row => <span className="tabular-nums text-text-muted">{row.max_salary?.toLocaleString()}</span>, hideOnMobile: true },
              { key: 'sample_count', label: t('العينة', 'N'), render: row => <span className="tabular-nums text-text-muted">{row.sample_count?.toLocaleString()}</span>, hideOnMobile: true },
              { key: 'confidence', label: t('الثقة', 'Conf.'), render: row => (
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-medium ${
                  row.confidence === 'VERY_HIGH' ? 'bg-sgi-balanced/10 text-sgi-balanced' :
                  row.confidence === 'HIGH' ? 'bg-teal/10 text-teal' :
                  'bg-sgi-shortage/10 text-sgi-shortage'
                }`}>{row.confidence}</span>
              )},
              { key: 'esco_occupation', label: t('مهنة ESCO', 'ESCO Match'), render: row => <span className="text-xs text-text-muted truncate max-w-[150px] block">{row.esco_occupation || '—'}</span>, hideOnMobile: true },
            ]}
          />
        </motion.div>
      )}

      {/* Top Shortages Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
        <div className="p-4 border-b border-border-light lg:block">
          <h3 className="text-sm font-semibold text-primary">{t('أعلى حالات النقص والفائض', 'Top Shortages & Surpluses')}</h3>
        </div>
        {tableData.length > 0 ? (
          <ResponsiveTable
            data={tableData}
            keyExtractor={row => row.isco || row.occupation}
            columns={[
              { key: 'occupation', label: t('المهنة', 'Occupation'), primary: true, render: row => <span className="font-medium text-primary">{row.occupation}</span> },
              { key: 'isco', label: t('رمز ISCO', 'ISCO'), render: row => <span className="text-text-muted tabular-nums">{row.isco}</span>, hideOnMobile: true },
              { key: 'sgi', label: t('المؤشر %', 'SGI%'), render: row => (
                <span className="inline-flex items-center gap-1">
                  <span className={`font-semibold tabular-nums ${row.sgi > 0 ? 'text-sgi-critical' : row.sgi < 0 ? 'text-sgi-surplus' : 'text-sgi-balanced'}`}>{row.sgi > 0 ? '+' : ''}{row.sgi}%</span>
                  <ConfidenceBadge tier={getConfidenceTier(row.supplySource)} mode="tooltip" detail={`SGI confidence depends on source: ${row.supplySource || 'mixed'}. ${row.supplySource?.includes('Bayanat') ? 'Register data (±2%)' : 'Estimated (±15-25%)'}`} />
                </span>
              )},
              { key: 'status', label: t('الحالة', 'Status'), render: row => <span className={`px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap ${statusBadge(row.status)}`}>{row.status}</span> },
              { key: 'demand', label: t('الطلب', 'Demand'), render: row => (
                <span className="tabular-nums text-text-secondary">
                  {formatCompact(row.demand)}
                  <ConfidenceBadge tier="medium" margin="±15%" mode="inline" detail="Demand from LinkedIn job ads — web scrape coverage ~60-70%" />
                </span>
              )},
              { key: 'supply', label: t('العرض', 'Supply'), render: row => (
                <span className="tabular-nums text-text-secondary">
                  {formatCompact(row.supply)}
                  <ConfidenceBadge tier={getConfidenceTier(row.supplySource)} mode="inline" detail={`Supply from ${row.supplySource || 'mixed sources'}`} />
                </span>
              )},
              { key: 'gap', label: t('الفجوة', 'Gap'), render: row => (
                <span className="inline-flex items-center gap-1">
                  <span className={`font-medium tabular-nums ${row.gap > 0 ? 'text-sgi-critical' : 'text-sgi-surplus'}`}>{row.gap > 0 ? '+' : ''}{row.gap.toLocaleString()}</span>
                  <ConfidenceBadge tier={getConfidenceTier(row.supplySource, row.supply, row.demand)} mode="badge" margin={row.supply < 100 || row.demand < 50 ? '±50%+' : '±20%'} />
                </span>
              )},
              { key: 'emirate', label: t('الإمارة', 'Emirate'), render: row => <span className="text-text-secondary">{row.emirate}</span> },
              { key: 'trend', label: t('الاتجاه', 'Trend'), render: row => <TrendArrow trend={row.trend} /> },
            ]}
          />
        ) : (
          <EmptyState
            compact
            icon={Inbox}
            title={t('لا توجد بيانات مهن', 'No occupation data')}
            description={t(
              'اربط مصادر البيانات لعرض تحليل النقص',
              'Connect data sources to see shortage analysis'
            )}
          />
        )}
      </motion.div>
      </div>

      {/* Right Pane — Research Brief */}
      {briefOpen && (
        <div className="hidden lg:block w-[35%] shrink-0 sticky top-0" style={{ height: 'calc(100vh - 56px)' }}>
          <ResearchBrief collapsed={false} onToggle={() => setBriefOpen(false)} />
        </div>
      )}

      <ComparisonMode open={compareOpen} onClose={() => setCompareOpen(false)} />
    </div>
  );
};

export default DashboardPage;
