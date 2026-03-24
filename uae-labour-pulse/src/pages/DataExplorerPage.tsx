import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFilters } from '@/contexts/FilterContext';
import PageHeader from '@/components/shared/PageHeader';
import { SkeletonTable } from '@/components/shared/Skeletons';
import EmptyState from '@/components/shared/EmptyState';
import { useViewSchemas, useExploreView } from '@/api/hooks';
import {
  Database, Search, ChevronDown, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Download, Table2, Columns3,
} from 'lucide-react';
import type { ViewDef } from '@/api/types';

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  return String(value);
};

const VIEW_LABELS: Record<string, { en: string; ar: string; icon: string }> = {
  vw_demand_jobs: { en: 'Job Demand', ar: 'طلب الوظائف', icon: '💼' },
  vw_supply_talent: { en: 'Talent Supply', ar: 'عرض المواهب', icon: '👥' },
  vw_gap_cube: { en: 'Supply-Demand Gap', ar: 'فجوة العرض والطلب', icon: '📊' },
  vw_ai_impact: { en: 'AI Impact', ar: 'تأثير الذكاء الاصطناعي', icon: '🤖' },
  vw_forecast_demand: { en: 'Forecasts', ar: 'التوقعات', icon: '📈' },
  vw_skills_taxonomy: { en: 'Skills Taxonomy', ar: 'تصنيف المهارات', icon: '🧠' },
  vw_supply_education: { en: 'Education Pipeline', ar: 'خط التعليم', icon: '🎓' },
  vw_education_pipeline: { en: 'Education Stats', ar: 'إحصائيات التعليم', icon: '📚' },
  vw_population_demographics: { en: 'Demographics', ar: 'الديموغرافيا', icon: '🏘️' },
  vw_occupation_transitions: { en: 'Career Transitions', ar: 'التحولات المهنية', icon: '🔄' },
};

export default function DataExplorerPage() {
  const { t } = useLanguage();
  const { filters } = useFilters();

  // State
  const [selectedView, setSelectedView] = useState('vw_demand_jobs');
  const [sort, setSort] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Fetch view schemas
  const { data: schemaData } = useViewSchemas();
  const views = schemaData?.views || [];
  const currentSchema = views.find((v: ViewDef) => v.name === selectedView);

  // Build query params
  const queryParams = useMemo(() => ({
    view: selectedView,
    sort: sort || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    search: search || undefined,
    emirate: filters.emirate !== 'all' ? filters.emirate : undefined,
    sector: filters.sector !== 'all' ? filters.sector : undefined,
    source: filters.dataSource !== 'all' ? filters.dataSource : undefined,
  }), [selectedView, sort, page, pageSize, search, filters.emirate, filters.sector, filters.dataSource]);

  const { data: exploreData, isLoading } = useExploreView(queryParams);

  const handleSort = (col: string) => {
    if (sort === col) setSort(`-${col}`);
    else if (sort === `-${col}`) setSort(null);
    else setSort(col);
    setPage(1);
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleViewChange = (view: string) => {
    setSelectedView(view);
    setSort(null);
    setPage(1);
    setSearch('');
    setSearchInput('');
  };

  const exportCSV = () => {
    if (!exploreData?.data?.length) return;
    const cols = exploreData.columns.map(c => c.name);
    const header = cols.join(',');
    const rows = exploreData.data.map(row =>
      cols.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') ? `"${s}"` : s;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedView}_page${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortIcon = (col: string) => {
    if (sort === col) return <ArrowUp className="w-3 h-3" />;
    if (sort === `-${col}`) return <ArrowDown className="w-3 h-3" />;
    return <ArrowUpDown className="w-3 h-3 opacity-30" />;
  };

  return (
    <div className="space-y-4 px-2 sm:px-0">
      <PageHeader
        icon={Table2}
        title={t('مستكشف البيانات', 'Data Explorer')}
        description={t(
          'تصفح واستكشاف البيانات الخام من جميع المصادر',
          'Browse and explore raw data from all sources with filtering, sorting, and export'
        )}
        actions={
          <button
            onClick={exportCSV}
            disabled={!exploreData?.data?.length}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {t('تصدير CSV', 'Export CSV')}
          </button>
        }
      />

      {/* View Selector */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(VIEW_LABELS).map(([key, { en, ar, icon }]) => (
          <button
            key={key}
            onClick={() => handleViewChange(key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border
              ${selectedView === key
                ? 'bg-navy text-white border-navy shadow-sm'
                : 'bg-white text-text-secondary border-border-light hover:border-navy/30 hover:text-primary'
              }`}
          >
            <span>{icon}</span>
            <span>{t(ar, en)}</span>
          </button>
        ))}
      </div>

      {/* Search + Stats Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('بحث في البيانات...', 'Search data...')}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border-light bg-white text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/40"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          {currentSchema && (
            <span className="flex items-center gap-1">
              <Columns3 className="w-3.5 h-3.5" />
              {currentSchema.columns.length} {t('عمود', 'columns')}
            </span>
          )}
          {exploreData && (
            <span className="flex items-center gap-1">
              <Database className="w-3.5 h-3.5" />
              {exploreData.total.toLocaleString()} {t('سجل', 'rows')}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {currentSchema && (
        <div className="text-xs text-text-muted px-1">
          {currentSchema.description}
        </div>
      )}

      {/* Data Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden"
      >
        {isLoading ? (
          <div className="p-4"><SkeletonTable /></div>
        ) : !exploreData?.data?.length ? (
          <EmptyState message={t('لا توجد بيانات', 'No data found for this view')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light bg-surface-tertiary/50">
                  {exploreData.columns.map(col => (
                    <th
                      key={col.name}
                      onClick={() => col.filterable && handleSort(col.name)}
                      className={`px-3 py-2.5 text-left text-xs font-semibold text-text-secondary whitespace-nowrap
                        ${col.filterable ? 'cursor-pointer hover:bg-surface-hover select-none' : ''}`}
                    >
                      <span className="flex items-center gap-1">
                        {col.name.replace(/_/g, ' ')}
                        {col.filterable && sortIcon(col.name)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exploreData.data.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border-light/50 hover:bg-surface-hover/50 transition-colors"
                  >
                    {exploreData.columns.map(col => (
                      <td key={col.name} className="px-3 py-2 text-xs text-primary whitespace-nowrap max-w-[200px] truncate">
                        {formatCell(row[col.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {exploreData && exploreData.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-light bg-surface-tertiary/30">
            <span className="text-xs text-text-muted">
              {t('صفحة', 'Page')} {exploreData.page} {t('من', 'of')} {exploreData.pages}
              <span className="ml-2 opacity-60">
                ({((exploreData.page - 1) * exploreData.page_size + 1).toLocaleString()}–
                {Math.min(exploreData.page * exploreData.page_size, exploreData.total).toLocaleString()}
                {' '}{t('من', 'of')} {exploreData.total.toLocaleString()})
              </span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-border-light hover:bg-surface-hover disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, exploreData.pages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, exploreData.pages - 4));
                const p = start + i;
                if (p > exploreData.pages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors
                      ${p === page ? 'bg-navy text-white' : 'hover:bg-surface-hover text-text-secondary'}`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(exploreData.pages, p + 1))}
                disabled={page >= exploreData.pages}
                className="p-1.5 rounded-lg border border-border-light hover:bg-surface-hover disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
