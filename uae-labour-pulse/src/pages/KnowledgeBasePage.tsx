import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import PageHeader from '@/components/shared/PageHeader';
import InsightPanel from '@/components/shared/InsightPanel';
import EmptyState from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/EmptyState';
import { SkeletonPage } from '@/components/shared/Skeletons';
import { api } from '@/api/client';
import { COLORS, getSeriesColor } from '@/utils/chartColors';
import { formatCompact } from '@/utils/formatters';
import {
  Database, Table2, Search, ChevronLeft, ChevronRight, Layers,
  Grid3x3, Briefcase, GraduationCap, Brain, Settings, Filter,
  ArrowUpDown, ArrowUp, ArrowDown, Download, Eye, Globe, Rows3,
  FolderOpen,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────────── */

interface KBColumn {
  name: string;
  type: string;
}

interface KBTableInfo {
  name: string;
  display_name?: string;
  description?: string;
  row_count?: number;
  column_count?: number;
  category?: string;
  data_type?: string;
  source?: string;
  status?: string;
  source_url?: string | null;
}

interface KBCategory {
  name: string;
  tables: KBTableInfo[];
}

/** API returns categories as an object: { "Dimensions": [...], "Facts - Labour Market": [...] } */
interface KBTablesResponse {
  categories: Record<string, KBTableInfo[]>;
  total_tables: number;
  total_rows: number;
}

interface KBBrowseResponse {
  table: string;
  display_name?: string;
  columns: KBColumn[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

interface KBStatsCategoryInfo {
  table_count: number;
  row_count: number;
}

interface KBStatsResponse {
  total_tables: number;
  total_rows: number;
  categories: Record<string, KBStatsCategoryInfo>;
}

/** Convert the API's categories object into a normalized array for rendering */
function normalizeCategories(raw: Record<string, KBTableInfo[]> | KBCategory[] | null | undefined): KBCategory[] {
  if (!raw) return [];
  // If it's already an array (defensive), use it
  if (Array.isArray(raw)) return raw;
  // It's an object — convert to array, injecting category name into each table
  return Object.entries(raw).map(([name, tables]) => ({
    name,
    tables: (Array.isArray(tables) ? tables : []).map((tb) => ({
      ...tb,
      category: tb.category ?? name,
      display_name: tb.display_name ?? tb.name,
    })),
  }));
}

/* ─── Inline React Query Hooks ───────────────────────────────────────── */

function useKBTables() {
  return useQuery<KBTablesResponse>({
    queryKey: ['kb-tables'],
    queryFn: () => api.get('/knowledge-base/tables'),
    staleTime: 5 * 60_000,
  });
}

function useKBBrowse(params: {
  table: string;
  limit?: number;
  offset?: number;
  sort?: string;
  search?: string;
}) {
  return useQuery<KBBrowseResponse>({
    queryKey: ['kb-browse', params],
    queryFn: () => api.get('/knowledge-base/browse', params as any),
    staleTime: 15_000,
    enabled: !!params.table,
  });
}

function useKBStats() {
  return useQuery<KBStatsResponse>({
    queryKey: ['kb-stats'],
    queryFn: () => api.get('/knowledge-base/stats'),
    staleTime: 5 * 60_000,
  });
}

/* ─── Category Config ────────────────────────────────────────────────── */

interface CategoryConfig {
  icon: typeof Database;
  color: string;
  bgGradient: string;
  accentBorder: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  Dimensions: {
    icon: Grid3x3,
    color: COLORS.navy,
    bgGradient: 'from-[#003366]/10 to-[#003366]/5',
    accentBorder: 'border-l-[#003366]',
  },
  'Facts - Labour Market': {
    icon: Briefcase,
    color: COLORS.teal,
    bgGradient: 'from-[#007DB5]/10 to-[#007DB5]/5',
    accentBorder: 'border-l-[#007DB5]',
  },
  'Facts - Education': {
    icon: GraduationCap,
    color: COLORS.emerald,
    bgGradient: 'from-[#00875A]/10 to-[#00875A]/5',
    accentBorder: 'border-l-[#00875A]',
  },
  'Facts - AI & Skills': {
    icon: Brain,
    color: COLORS.gold,
    bgGradient: 'from-[#C9A84C]/10 to-[#C9A84C]/5',
    accentBorder: 'border-l-[#C9A84C]',
  },
  'O*NET Database': {
    icon: Database,
    color: COLORS.copper,
    bgGradient: 'from-[#B87333]/10 to-[#B87333]/5',
    accentBorder: 'border-l-[#B87333]',
  },
  System: {
    icon: Settings,
    color: COLORS.slate,
    bgGradient: 'from-[#4A6FA5]/10 to-[#4A6FA5]/5',
    accentBorder: 'border-l-[#4A6FA5]',
  },
};

const DEFAULT_CATEGORY: CategoryConfig = {
  icon: Layers,
  color: COLORS.navy,
  bgGradient: 'from-[#003366]/10 to-[#003366]/5',
  accentBorder: 'border-l-[#003366]',
};

function getCategoryConfig(name: string): CategoryConfig {
  return CATEGORY_CONFIG[name] || DEFAULT_CATEGORY;
}

/* ─── Cell Formatting ────────────────────────────────────────────────── */

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toFixed(2);
  }
  if (typeof value === 'string') {
    // Try formatting as date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      }
    }
  }
  return String(value);
}

/* ─── Animated Counter ───────────────────────────────────────────────── */

function AnimatedStat({ value, label, icon: Icon, color }: {
  value: number;
  label: string;
  icon: typeof Database;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-1"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-1"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <span className="text-xl font-bold text-white tabular-nums">
        {formatCompact(value)}
      </span>
      <span className="text-xs text-white/70">{label}</span>
    </motion.div>
  );
}

/* ─── Table Card ─────────────────────────────────────────────────────── */

function TableCard({ table, categoryColor, onClick, index }: {
  table: KBTableInfo;
  categoryColor: string;
  onClick: () => void;
  index: number;
}) {
  const { t } = useLanguage();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      whileHover={{ y: -4, boxShadow: '0 12px 40px -8px rgba(0,0,0,0.12)' }}
      onClick={onClick}
      className="group relative bg-white border border-gray-100 shadow-md rounded-xl p-5 cursor-pointer overflow-hidden transition-all duration-200"
      
    >
      {/* Accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
        style={{ backgroundColor: categoryColor }}
      />

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${categoryColor}15` }}
          >
            <Table2 className="w-4 h-4" style={{ color: categoryColor }} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-primary truncate group-hover:text-navy transition-colors">
              {table.display_name || table.name}
            </h3>
            <p className="text-[10px] font-mono text-text-muted truncate">{table.name}</p>
          </div>
        </div>
        <Eye className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      <p className="text-xs text-text-muted line-clamp-2 mb-3 min-h-[2rem]">
        {table.description || '\u2014'}
      </p>

      <div className="flex items-center gap-4 text-xs mb-3">
        <span className="flex items-center gap-1 text-text-muted">
          <Rows3 className="w-3 h-3" />
          <span className="tabular-nums font-medium">{formatCompact(table.row_count ?? 0)}</span>
          <span>{t('صفوف', 'rows')}</span>
        </span>
        <span className="flex items-center gap-1 text-text-muted">
          <Layers className="w-3 h-3" />
          <span className="tabular-nums font-medium">{table.column_count ?? 0}</span>
          <span>{t('أعمدة', 'cols')}</span>
        </span>
      </div>

      {/* Data Provenance */}
      <div className="border-t border-gray-100 pt-2.5 space-y-1.5">
        {/* Data type badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
            table.data_type === 'official' ? 'bg-[#003366]/10 text-[#003366]'
            : table.data_type === 'research' ? 'bg-[#2E7D6B]/10 text-[#2E7D6B]'
            : table.data_type === 'scraped+API' || table.data_type === 'official+scraped' ? 'bg-[#C9A84C]/10 text-[#C9A84C]'
            : table.data_type === 'official+estimated' ? 'bg-[#0A5C8A]/10 text-[#0A5C8A]'
            : table.data_type === 'not loaded' || table.data_type === 'not built' ? 'bg-gray-200 text-gray-500'
            : table.data_type === 'generated' || table.data_type === 'model-generated' ? 'bg-[#6B8EB5]/10 text-[#6B8EB5]'
            : 'bg-gray-100 text-gray-500'
          }`}>
            {table.data_type === 'official' ? 'Official' : table.data_type === 'research' ? 'Research'
            : table.data_type === 'scraped+API' ? 'Scraped + API' : table.data_type === 'official+scraped' ? 'Official + Scraped'
            : table.data_type === 'official+estimated' ? 'Official + Estimated'
            : table.data_type === 'not loaded' ? 'Not Loaded' : table.data_type === 'not built' ? 'Not Built'
            : table.data_type === 'generated' ? 'Generated' : table.data_type === 'model-generated' ? 'Model Output'
            : table.data_type || 'Unknown'}
          </span>
          {/* Status */}
          {table.status && (
            <span className={`text-[9px] ${
              table.status.startsWith('complete') ? 'text-[#2E7D6B]'
              : table.status.startsWith('partial') ? 'text-[#C9A84C]'
              : table.status.startsWith('EMPTY') ? 'text-gray-400'
              : 'text-gray-500'
            }`}>
              {table.status.startsWith('complete') ? '\u2713 ' : table.status.startsWith('EMPTY') ? '\u25CB ' : '\u25D4 '}
              {table.status.length > 50 ? table.status.slice(0, 50) + '...' : table.status}
            </span>
          )}
        </div>
        {/* Source */}
        {table.source && (
          <p className="text-[9px] text-gray-400 leading-relaxed truncate" title={table.source}>
            {t('المصدر', 'Source')}: {table.source}
          </p>
        )}
        {/* Source URL */}
        {table.source_url && (
          <a href={table.source_url} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[9px] text-[#007DB5] hover:underline">
            <Globe className="w-2.5 h-2.5" />
            {table.source_url.replace('https://', '').replace('http://', '').split('/')[0]}
          </a>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────── */

const KnowledgeBasePage = () => {
  const { t } = useLanguage();
  const pageLoading = usePageLoading();
  const [searchParams] = useSearchParams();

  // API state
  const { data: tablesData, isLoading: tablesLoading, error: tablesError } = useKBTables();
  const { data: statsData } = useKBStats();

  // UI state
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [navHistory, setNavHistory] = useState<{ table: string; search: string }[]>([]);

  // Deep-link: auto-open table from URL ?table=fact_program_enrollment
  useEffect(() => {
    const tbl = searchParams.get('table');
    if (tbl && tbl !== selectedTable) {
      setSelectedTable(tbl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tableSearch, setTableSearch] = useState('');
  const [tableSearchInput, setTableSearchInput] = useState('');
  const [sort, setSort] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Browse query
  const browseParams = useMemo(() => ({
    table: selectedTable || '',
    limit: pageSize,
    offset: (page - 1) * pageSize,
    sort: sort || undefined,
    search: tableSearch || undefined,
  }), [selectedTable, page, pageSize, sort, tableSearch]);

  const {
    data: browseData,
    isLoading: browseLoading,
  } = useKBBrowse(browseParams);

  // Derived data — normalize API object into array
  const categories = useMemo(
    () => normalizeCategories(tablesData?.categories),
    [tablesData?.categories]
  );

  const filteredTables = useMemo(() => {
    let tables: KBTableInfo[] = [];
    if (activeCategory) {
      const cat = categories.find((c) => c.name === activeCategory);
      tables = cat?.tables || [];
    } else {
      tables = categories.flatMap((c) => c.tables || []);
    }
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      tables = tables.filter(
        (tb) =>
          (tb.display_name ?? tb.name ?? '').toLowerCase().includes(q) ||
          (tb.name ?? '').toLowerCase().includes(q) ||
          (tb.description ?? '').toLowerCase().includes(q)
      );
    }
    return tables;
  }, [categories, activeCategory, globalSearch]);

  const totalPages = browseData?.total ? Math.ceil(browseData.total / pageSize) : 0;

  const CATEGORY_INSIGHTS: Record<string, { explanation: string; recommendation: string }> = {
    'Dimensions': {
      explanation: "Dimension tables are reference data — classifications, codes, and hierarchies. They define HOW data is organized (e.g., which emirates exist, which occupations are tracked).",
      recommendation: "Start here to understand what occupations, skills, and sectors are tracked. If you see an occupation missing from analytics, check dim_occupation first — it may not be in the taxonomy yet.",
    },
    'Facts - Labour Market': {
      explanation: "Fact tables contain the actual supply and demand measurements — how many workers exist (supply) and how many jobs are posted (demand) across dimensions.",
      recommendation: "These tables drive the Supply Side, Demand Side, and Analytics pages. Filter by region_code to see emirate-specific data, or by sector_id for industry analysis.",
    },
    'Facts - Education': {
      explanation: "Education facts track the pipeline from enrollment to graduation to employment outcomes. This is the foundation of supply-side workforce planning.",
      recommendation: "Cross-reference graduate counts (fact_supply_graduates) with job vacancy data (fact_demand_vacancies_agg) to identify disciplines producing too many or too few graduates.",
    },
    'Facts - AI & Skills': {
      explanation: "AI and skills data links occupations to their required skills and their exposure to AI automation. This enables forward-looking workforce strategy.",
      recommendation: "Use fact_ai_exposure_occupation to identify which occupations in your emirate need reskilling programs. Combine with fact_occupation_skills to design targeted training curricula.",
    },
    'O*NET Database': {
      explanation: "O*NET is the world's most comprehensive occupation database (US Bureau of Labor Statistics). We use it to enrich UAE data with detailed skill profiles, technologies, and career pathways.",
      recommendation: "Use O*NET data to: (1) Find alternate job titles for better job-matching, (2) Identify hot technologies to include in training programs, (3) Map career transitions between related occupations.",
    },
    'System': {
      explanation: "System tables track data pipeline operations — which datasets were loaded, when, and any evidence collected by the AI agent.",
      recommendation: "Check dataset_registry to verify data freshness. If a source shows an old date, it may need re-ingestion.",
    },
  };

  // Handlers
  const handleSelectTable = useCallback((tableName: string) => {
    setSelectedTable(tableName);
    setPage(1);
    setSort(null);
    setTableSearch('');
    setTableSearchInput('');
  }, []);

  const handleBackToList = useCallback(() => {
    // If there's navigation history, go back to previous table
    if (navHistory.length > 0) {
      const prev = navHistory[navHistory.length - 1];
      setNavHistory(h => h.slice(0, -1));
      setSelectedTable(prev.table);
      setTableSearch(prev.search);
      setTableSearchInput(prev.search);
      setPage(1);
      setSort(null);
    } else {
      setSelectedTable(null);
      setPage(1);
      setSort(null);
      setTableSearch('');
      setTableSearchInput('');
    }
  }, [navHistory]);

  const handleSort = useCallback((col: string) => {
    setSort((prev) => {
      if (prev === col) return `-${col}`;
      if (prev === `-${col}`) return null;
      return col;
    });
    setPage(1);
  }, []);

  const handleTableSearch = useCallback(() => {
    setTableSearch(tableSearchInput);
    setPage(1);
  }, [tableSearchInput]);

  // Loading
  if (pageLoading || tablesLoading) {
    return <SkeletonPage />;
  }

  // Error
  if (tablesError) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('قاعدة المعرفة', 'Knowledge Base')} />
        <ErrorState
          message={t('فشل في تحميل البيانات', 'Failed to load data')}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const selectedTableInfo = filteredTables.find((tb) => tb.name === selectedTable) ||
    categories.flatMap((c) => c.tables || []).find((tb) => tb.name === selectedTable);
  const selectedCategoryName = selectedTableInfo?.category || '';

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title={t('قاعدة المعرفة', 'Knowledge Base')}
        subtitle={t(
          'تصفح جميع جداول قاعدة البيانات حسب الفئة',
          'Browse all database tables organized by category'
        )}
      />

      {/* ── Hero Stats Bar ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#003366] via-[#002347] to-[#003366] p-6 shadow-xl"
      >
        {/* Decorative orbs */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#C9A84C]/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-[#007DB5]/10 blur-3xl" />

        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-6">
          <AnimatedStat
            value={statsData?.total_tables || tablesData?.total_tables || 0}
            label={t('جداول', 'Tables')}
            icon={Database}
            color={COLORS.gold}
          />
          <AnimatedStat
            value={statsData?.total_rows || tablesData?.total_rows || 0}
            label={t('سجلات', 'Records')}
            icon={Rows3}
            color={COLORS.teal}
          />
          <AnimatedStat
            value={statsData?.categories ? Object.keys(statsData.categories).length : categories.length}
            label={t('فئات', 'Categories')}
            icon={FolderOpen}
            color={COLORS.emerald}
          />
          <AnimatedStat
            value={6}
            label={t('مصادر البيانات', 'Data Sources')}
            icon={Globe}
            color={COLORS.coral}
          />
        </div>
      </motion.div>

      {/* ── Welcome Insight ────────────────────────────────────────────── */}
      <InsightPanel
        explanation="The Knowledge Base contains all raw data tables powering this platform. Browse any table to see the underlying data behind every chart and metric."
        insight={tablesData ? `${categories.reduce((sum, c) => sum + c.tables.length, 0)} tables across ${categories.length} categories, containing ${formatCompact(tablesData.total_rows || 0)} total records. Data spans multiple UAE government sources, international taxonomies, and AI research datasets.` : undefined}
        recommendation="Use the Knowledge Base to: (1) Verify any number you see on other pages, (2) Explore data not shown in charts, (3) Export specific tables for your own analysis. Start with Dimensions tables to understand the classification systems, then explore Facts tables for actual data."
        severity="info"
        source="All data sources — Bayanat, LinkedIn, ESCO, O*NET, AIOE, CAA, MOHRE"
      />

      {/* ── Main Content: Sidebar + Tables ──────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* ── Left Panel: Categories ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:w-72 shrink-0"
        >
          <div className="bg-white border border-gray-100 shadow-md rounded-xl overflow-hidden sticky top-4">
            <div className="p-4 border-b border-border-light">
              <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Filter className="w-4 h-4 text-text-muted" />
                {t('الفئات', 'Categories')}
              </h2>
            </div>

            <div className="p-2">
              {/* All tables option */}
              <button
                onClick={() => { setActiveCategory(null); setSelectedTable(null); setPage(1); setTableSearch(''); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-200 ${
                  activeCategory === null && !selectedTable
                    ? 'bg-[#003366]/10 text-navy font-semibold'
                    : 'text-text-muted hover:bg-surface-hover'
                }`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{t('جميع الجداول', 'All Tables')}</span>
                </div>
                <span className="text-xs tabular-nums font-medium opacity-70">
                  {categories.reduce((s, c) => s + (c.tables?.length ?? 0), 0)}
                </span>
              </button>

              {/* Category list */}
              {categories.map((cat) => {
                const config = getCategoryConfig(cat.name);
                const CatIcon = config.icon;
                const isActive = activeCategory === cat.name;
                const totalCatRows = (cat.tables ?? []).reduce((s, tb) => s + (tb.row_count ?? 0), 0);
                return (
                  <button
                    key={cat.name}
                    onClick={() => { setActiveCategory(isActive ? null : cat.name); setSelectedTable(null); setPage(1); setTableSearch(''); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-all duration-200 ${
                      isActive
                        ? `bg-gradient-to-r ${config.bgGradient} font-semibold border-l-2 ${config.accentBorder}`
                        : 'text-text-muted hover:bg-surface-hover'
                    }`}
                  >
                    <CatIcon
                      className="w-4 h-4 shrink-0"
                      style={{ color: isActive ? config.color : undefined }}
                    />
                    <div className="flex-1 min-w-0">
                      <span
                        className="block truncate"
                        style={{ color: isActive ? config.color : undefined }}
                      >
                        {cat.name}
                      </span>
                      <span className="text-[10px] opacity-60">
                        {formatCompact(totalCatRows)} {t('صفوف', 'rows')}
                      </span>
                    </div>
                    <span
                      className="text-xs tabular-nums font-medium px-1.5 py-0.5 rounded-md"
                      style={{
                        backgroundColor: isActive ? `${config.color}15` : undefined,
                        color: isActive ? config.color : undefined,
                      }}
                    >
                      {cat.tables?.length ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* ── Right Panel: Table List or Detail ─────────────────────────── */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {selectedTable ? (
              /* ── Table Detail View ─────────────────────────────────────── */
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm">
                  <button
                    onClick={handleBackToList}
                    className="flex items-center gap-1.5 text-text-muted hover:text-navy transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    {navHistory.length > 0
                      ? `← ${navHistory[navHistory.length - 1].table}`
                      : t('رجوع', 'Back')}
                  </button>
                  {navHistory.length > 0 && (
                    <button
                      onClick={() => { setNavHistory([]); setSelectedTable(null); setTableSearch(''); setTableSearchInput(''); setPage(1); setSort(null); }}
                      className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      {t('القائمة الرئيسية', 'All Tables')}
                    </button>
                  )}
                  <span className="text-text-muted">/</span>
                  {selectedCategoryName && (
                    <>
                      <span className="text-text-muted">{selectedCategoryName}</span>
                      <span className="text-text-muted">/</span>
                    </>
                  )}
                  <span className="font-semibold text-primary">
                    {selectedTableInfo?.display_name || selectedTable}
                  </span>
                </div>

                {/* Table info header */}
                <div className="bg-white border border-gray-100 shadow-md rounded-xl p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-primary">
                        {selectedTableInfo?.display_name || selectedTable}
                      </h2>
                      <p className="text-xs text-text-muted mt-1">
                        {selectedTableInfo?.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <Rows3 className="w-3 h-3" />
                          {browseData?.total?.toLocaleString?.() ?? selectedTableInfo?.row_count?.toLocaleString?.() ?? '...'} {t('صفوف', 'rows')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {browseData?.columns?.length ?? selectedTableInfo?.column_count ?? '...'} {t('أعمدة', 'columns')}
                        </span>
                      </div>
                    </div>

                    {/* Search within table */}
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                        <input
                          value={tableSearchInput}
                          onChange={(e) => setTableSearchInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTableSearch()}
                          placeholder={t('بحث...', 'Search...')}
                          className="h-9 w-48 pl-9 pr-3 rounded-lg bg-surface-tertiary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
                        />
                      </div>
                      <button
                        onClick={handleTableSearch}
                        className="h-9 px-3 rounded-lg bg-navy text-white text-xs font-medium hover:bg-navy-dark transition-colors"
                      >
                        {t('بحث', 'Search')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table Browse Insight */}
                <InsightPanel
                  explanation={`Browsing ${browseData?.display_name || selectedTable}. Each row represents one record. Click column headers to sort. Use search to find specific values across text columns.`}
                  insight={browseData ? `Showing ${browseData.rows?.length || 0} of ${formatCompact(browseData.total || 0)} total records (${browseData.columns?.length || 0} columns). ${browseData.total > 500 ? 'Use search and filters to narrow down large datasets.' : ''}` : undefined}
                  severity="info"
                  compact
                />

                {/* Data Table */}
                <div className="bg-white border border-gray-100 shadow-md rounded-xl overflow-hidden">
                  {browseLoading ? (
                    <div className="p-8 flex items-center justify-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />
                        <span className="text-xs text-text-muted">{t('جاري التحميل...', 'Loading data...')}</span>
                      </div>
                    </div>
                  ) : browseData && Array.isArray(browseData.rows) && browseData.rows.length > 0 ? (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-surface-tertiary/80 backdrop-blur">
                              {(browseData.columns ?? []).map((col) => {
                                const isCurrentSort = sort === col.name || sort === `-${col.name}`;
                                return (
                                  <th
                                    key={col.name}
                                    onClick={() => handleSort(col.name)}
                                    className="px-4 py-3 text-left text-xs font-semibold text-text-muted whitespace-nowrap cursor-pointer hover:text-navy transition-colors sticky top-0 bg-surface-tertiary/80 select-none"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      {col.name}
                                      {isCurrentSort ? (
                                        sort === col.name ? (
                                          <ArrowUp className="w-3 h-3 text-navy" />
                                        ) : (
                                          <ArrowDown className="w-3 h-3 text-navy" />
                                        )
                                      ) : (
                                        <ArrowUpDown className="w-3 h-3 opacity-30" />
                                      )}
                                      <span className="text-[9px] font-normal opacity-50">
                                        {col.type}
                                      </span>
                                    </span>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {(browseData.rows ?? []).map((row, rowIdx) => (
                              <motion.tr
                                key={rowIdx}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: rowIdx * 0.01, duration: 0.15 }}
                                className={`border-t border-border-light transition-colors hover:bg-surface-hover ${
                                  rowIdx % 2 === 0 ? 'bg-white/40' : 'bg-surface-tertiary/20'
                                }`}
                              >
                                {(browseData.columns ?? []).map((col) => {
                                  const val = row?.[col.name];
                                  const formatted = formatCell(val);
                                  const isNull = val === null || val === undefined;
                                  const rel = (browseData as any)?.relationships?.[col.name];
                                  const isFK = rel && val != null && val !== '';
                                  return (
                                    <td
                                      key={col.name}
                                      className={`px-4 py-2.5 whitespace-nowrap text-xs ${
                                        isNull ? 'text-text-muted/40' : isFK ? 'text-[#007DB5] font-medium cursor-pointer hover:underline' : 'text-primary'
                                      } ${typeof val === 'number' ? 'tabular-nums text-right' : ''}`}
                                      onClick={isFK ? () => {
                                        // Push current state to history for back navigation
                                        if (selectedTable) {
                                          setNavHistory(prev => [...prev, { table: selectedTable, search: tableSearch }]);
                                        }
                                        setSelectedTable(rel.table);
                                        setTableSearch(String(val));
                                        setPage(1);
                                        setSort(null);
                                      } : undefined}
                                      title={isFK ? `→ ${rel.table} (${col.name}=${val})` : undefined}
                                    >
                                      {isFK ? (
                                        <span className="inline-flex items-center gap-1">
                                          {formatted}
                                          <ChevronRight className="w-3 h-3 text-[#007DB5]/50" />
                                        </span>
                                      ) : formatted}
                                    </td>
                                  );
                                })}
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-border-light bg-surface-tertiary/30">
                          <span className="text-xs text-text-muted">
                            {t('عرض', 'Showing')}{' '}
                            <span className="font-semibold tabular-nums">
                              {((page - 1) * pageSize + 1).toLocaleString()}
                            </span>
                            {' - '}
                            <span className="font-semibold tabular-nums">
                              {Math.min(page * pageSize, browseData?.total ?? 0).toLocaleString()}
                            </span>
                            {' '}{t('من', 'of')}{' '}
                            <span className="font-semibold tabular-nums">
                              {(browseData?.total ?? 0).toLocaleString()}
                            </span>
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPage((p) => Math.max(1, p - 1))}
                              disabled={page === 1}
                              className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>

                            {/* Page numbers */}
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum: number;
                              if (totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (page <= 3) {
                                pageNum = i + 1;
                              } else if (page >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                              } else {
                                pageNum = page - 2 + i;
                              }
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setPage(pageNum)}
                                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                                    page === pageNum
                                      ? 'bg-navy text-white'
                                      : 'text-text-muted hover:bg-surface-hover'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            })}

                            <button
                              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                              disabled={page === totalPages}
                              className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <EmptyState
                      icon={Table2}
                      title={t('لا توجد بيانات', 'No data found')}
                      description={t(
                        'هذا الجدول فارغ أو لا توجد نتائج مطابقة',
                        'This table is empty or no matching results'
                      )}
                      compact
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              /* ── Table List View ───────────────────────────────────────── */
              <motion.div
                key="list"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                {/* Search Bar */}
                <div className="bg-white border border-gray-100 shadow-md rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        placeholder={t(
                          'بحث في الجداول حسب الاسم أو الوصف...',
                          'Search tables by name or description...'
                        )}
                        className="w-full h-10 pl-10 pr-4 rounded-lg bg-surface-tertiary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
                      />
                    </div>
                    <span className="text-xs text-text-muted whitespace-nowrap">
                      {filteredTables.length} {t('جداول', 'tables')}
                    </span>
                  </div>
                </div>

                {/* Category-specific Insight */}
                {activeCategory && CATEGORY_INSIGHTS[activeCategory] && (
                  <InsightPanel
                    explanation={CATEGORY_INSIGHTS[activeCategory].explanation}
                    recommendation={CATEGORY_INSIGHTS[activeCategory].recommendation}
                    severity="info"
                    compact
                  />
                )}

                {/* Table Cards Grid */}
                {filteredTables.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredTables.map((table, idx) => {
                      const catConfig = getCategoryConfig(table.category ?? '');
                      return (
                        <TableCard
                          key={table.name}
                          table={table}
                          categoryColor={catConfig.color}
                          onClick={() => handleSelectTable(table.name)}
                          index={idx}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={Database}
                    title={t('لا توجد جداول', 'No tables found')}
                    description={t(
                      'حاول تغيير الفئة أو مصطلح البحث',
                      'Try changing the category or search term'
                    )}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Data Source Attribution Panel ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white border border-gray-100 shadow-md rounded-xl p-5"
      >
        <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-text-muted" />
          {t('مصادر البيانات', 'Data Sources')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { name: 'ESCO', desc: t('التصنيف الأوروبي', 'EU Taxonomy'), color: getSeriesColor(0) },
            { name: 'LinkedIn', desc: t('بيانات الوظائف', 'Job Listings'), color: getSeriesColor(1) },
            { name: 'FCSC', desc: t('القوى العاملة', 'Workforce Data'), color: getSeriesColor(2) },
            { name: 'Bayanat', desc: t('التوظيف', 'Employment'), color: getSeriesColor(3) },
            { name: 'MOHRE', desc: t('سوق العمل', 'Labour Market'), color: getSeriesColor(4) },
            { name: 'CAA/SCAD', desc: t('التعليم', 'Education'), color: getSeriesColor(5) },
          ].map((src) => (
            <div
              key={src.name}
              className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface-tertiary/50"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: src.color }}
              />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-primary block truncate">
                  {src.name}
                </span>
                <span className="text-[10px] text-text-muted block truncate">{src.desc}</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-3">
          {t(
            'آخر تحديث: البيانات محدثة باستمرار من خلال خط أنابيب الاستيعاب',
            'Data is continuously updated through the ingestion pipeline'
          )}
        </p>
      </motion.div>
    </div>
  );
};

export default KnowledgeBasePage;
