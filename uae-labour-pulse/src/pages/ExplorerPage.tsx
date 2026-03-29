import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import {
  useExplorerFilters, useExplorerByInstitution, useExplorerByProgram,
  useExplorerBySkill, useExplorerByOccupation, useExplorerByRegion,
  useExplorerSkillDetail,
} from '@/api/hooks';
import { formatCompact } from '@/utils/formatters';
import { COLORS } from '@/utils/chartColors';
import PageHeader from '@/components/shared/PageHeader';
import InsightPanel from '@/components/shared/InsightPanel';
import { SkeletonPage } from '@/components/shared/Skeletons';
import {
  Search, Filter, Building2, GraduationCap, Briefcase, MapPin,
  Layers, ChevronDown, ChevronRight, X, Database,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type TabId = 'skill' | 'occupation' | 'institution' | 'program' | 'region';

interface TabDef {
  id: TabId;
  labelEn: string;
  labelAr: string;
  icon: typeof Layers;
}

const TABS: TabDef[] = [
  { id: 'skill', labelEn: 'By Skill', labelAr: 'حسب المهارة', icon: Layers },
  { id: 'occupation', labelEn: 'By Occupation', labelAr: 'حسب المهنة', icon: Briefcase },
  { id: 'institution', labelEn: 'By Institution', labelAr: 'حسب المؤسسة', icon: Building2 },
  { id: 'program', labelEn: 'By Program', labelAr: 'حسب البرنامج', icon: GraduationCap },
  { id: 'region', labelEn: 'By Region', labelAr: 'حسب المنطقة', icon: MapPin },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function gapStatus(gap: number): { label: string; color: string } {
  if (gap > 20) return { label: 'Critical Shortage', color: '#1A3F5C' };
  if (gap > 5) return { label: 'Shortage', color: '#C9A84C' };
  if (gap >= -5) return { label: 'Balanced', color: '#2E7D6B' };
  return { label: 'Surplus', color: '#4A90C4' };
}

function gapBadgeClass(gap: number): string {
  if (gap > 20) return 'bg-[#1A3F5C]/10 text-[#1A3F5C]';
  if (gap > 5) return 'bg-[#C9A84C]/10 text-[#C9A84C]';
  if (gap >= -5) return 'bg-[#2E7D6B]/10 text-[#2E7D6B]';
  return 'bg-[#4A90C4]/10 text-[#4A90C4]';
}

function DivergingBar({ demand, supply, maxVal }: { demand: number; supply: number; maxVal: number }) {
  const scale = maxVal > 0 ? 100 / maxVal : 0;
  const dW = Math.min(demand * scale, 100);
  const sW = Math.min(supply * scale, 100);
  return (
    <div className="flex items-center gap-0.5 w-full min-w-[140px]">
      <div className="flex-1 flex justify-end">
        <div
          className="h-4 rounded-l-sm transition-all"
          style={{ width: `${dW}%`, backgroundColor: COLORS.navy, minWidth: demand > 0 ? 2 : 0 }}
        />
      </div>
      <div className="w-px h-5 bg-gray-300 shrink-0" />
      <div className="flex-1">
        <div
          className="h-4 rounded-r-sm transition-all"
          style={{ width: `${sW}%`, backgroundColor: COLORS.teal, minWidth: supply > 0 ? 2 : 0 }}
        />
      </div>
    </div>
  );
}

function HorizontalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
      <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function SortHeader({
  label, field, sortField, sortDir, onSort,
}: {
  label: string; field: string; sortField: string; sortDir: 'asc' | 'desc';
  onSort: (f: string) => void;
}) {
  const active = sortField === field;
  return (
    <th
      className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:text-gray-700 transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="text-[10px]">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
        )}
      </span>
    </th>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

const ExplorerPage = () => {
  const { t } = useLanguage();
  const pageLoading = usePageLoading(400);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>('skill');

  // Filter state
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('');
  const [degreeLevelFilter, setDegreeLevelFilter] = useState('');
  const [skillTypeFilter, setSkillTypeFilter] = useState('');

  // Expansion / detail state
  const [expandedSkillId, setExpandedSkillId] = useState<number | null>(null);
  const [expandedOccIdx, setExpandedOccIdx] = useState<number | null>(null);
  const [expandedInstId, setExpandedInstId] = useState<string | null>(null);

  // Sort state
  const [sortField, setSortField] = useState('gap');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  // API queries
  const { data: filters } = useExplorerFilters();

  const skillParams = useMemo(() => {
    const p: Record<string, any> = {};
    if (search) p.search = search;
    if (skillTypeFilter) p.skill_type = skillTypeFilter;
    return p;
  }, [search, skillTypeFilter]);

  const occParams = useMemo(() => {
    const p: Record<string, any> = {};
    if (search) p.search = search;
    if (regionFilter) p.region = regionFilter;
    return p;
  }, [search, regionFilter]);

  const instParams = useMemo(() => {
    const p: Record<string, any> = {};
    if (search) p.search = search;
    if (regionFilter) p.region = regionFilter;
    return p;
  }, [search, regionFilter]);

  const progParams = useMemo(() => {
    const p: Record<string, any> = {};
    if (search) p.search = search;
    if (institutionFilter) p.institution = institutionFilter;
    if (degreeLevelFilter) p.degree_level = degreeLevelFilter;
    return p;
  }, [search, institutionFilter, degreeLevelFilter]);

  const { data: skillData, isLoading: skillLoading } = useExplorerBySkill(
    activeTab === 'skill' ? skillParams : undefined
  );
  const { data: occData, isLoading: occLoading } = useExplorerByOccupation(
    activeTab === 'occupation' ? occParams : undefined
  );
  const { data: instData, isLoading: instLoading } = useExplorerByInstitution(
    activeTab === 'institution' ? instParams : undefined
  );
  const { data: progData, isLoading: progLoading } = useExplorerByProgram(
    activeTab === 'program' ? progParams : undefined
  );
  const { data: regionData, isLoading: regionLoading } = useExplorerByRegion();
  const { data: skillDetail, isLoading: detailLoading } = useExplorerSkillDetail(expandedSkillId);

  // Loading state
  const tabLoading = {
    skill: skillLoading,
    occupation: occLoading,
    institution: instLoading,
    program: progLoading,
    region: regionLoading,
  }[activeTab];

  if (pageLoading) return <SkeletonPage />;

  // ── Sorted & filtered data helpers ─────────────────────────────────────────

  const sortedSkills = useMemo(() => {
    const skills = skillData?.skills || [];
    return [...skills].sort((a: any, b: any) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [skillData, sortField, sortDir]);

  const sortedOccupations = useMemo(() => {
    const occs = occData?.occupations || [];
    return [...occs].sort((a: any, b: any) => {
      const av = a[sortField] ?? 0;
      const bv = b[sortField] ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [occData, sortField, sortDir]);

  const maxSkillVal = useMemo(() => {
    if (!sortedSkills.length) return 1;
    return Math.max(...sortedSkills.map((s: any) => Math.max(s.demand || 0, s.supply || 0, 1)));
  }, [sortedSkills]);

  const maxOccVal = useMemo(() => {
    if (!sortedOccupations.length) return 1;
    return Math.max(...sortedOccupations.map((o: any) => Math.max(o.demand || 0, o.supply || 0, 1)));
  }, [sortedOccupations]);

  // ── Reset filters on tab change ───────────────────────────────────────────

  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setSearch('');
    setExpandedSkillId(null);
    setExpandedOccIdx(null);
    setExpandedInstId(null);
    setSortField('gap');
    setSortDir('desc');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('مستكشف العرض والطلب', 'Supply-Demand Explorer')}
        subtitle={t(
          'تعمق في بيانات المهارات والمهن والمؤسسات والبرامج والمناطق',
          'Drill into skills, occupations, institutions, programs, and regions'
        )}
        actions={
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Database className="w-3.5 h-3.5" />
            {t('بيانات حية', 'Live data')}
          </div>
        }
      />

      {/* ── Tab Selector ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl px-2 py-1 flex gap-1 overflow-x-auto">
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap
                ${active
                  ? 'bg-[#003366] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
            >
              <Icon className="w-4 h-4" />
              {t(tab.labelAr, tab.labelEn)}
            </button>
          );
        })}
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('بحث...', 'Search...')}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366]/40"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {activeTab === 'skill' && filters?.skill_types?.length > 0 && (
          <select
            value={skillTypeFilter}
            onChange={e => setSkillTypeFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
          >
            <option value="">{t('كل أنواع المهارات', 'All Skill Types')}</option>
            {filters.skill_types.map((st: string) => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>
        )}

        {(activeTab === 'occupation' || activeTab === 'institution') && filters?.regions?.length > 0 && (
          <select
            value={regionFilter}
            onChange={e => setRegionFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
          >
            <option value="">{t('كل المناطق', 'All Regions')}</option>
            {filters.regions.map((r: any) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        )}

        {activeTab === 'program' && (
          <>
            {filters?.institutions?.length > 0 && (
              <select
                value={institutionFilter}
                onChange={e => setInstitutionFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#003366]/20 max-w-[220px]"
              >
                <option value="">{t('كل المؤسسات', 'All Institutions')}</option>
                {filters.institutions.map((i: any) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            )}
            {filters?.degree_levels?.length > 0 && (
              <select
                value={degreeLevelFilter}
                onChange={e => setDegreeLevelFilter(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#003366]/20"
              >
                <option value="">{t('كل المستويات', 'All Degree Levels')}</option>
                {filters.degree_levels.map((dl: string) => (
                  <option key={dl} value={dl}>{dl}</option>
                ))}
              </select>
            )}
          </>
        )}

        <div className="flex items-center gap-1 text-[11px] text-gray-400">
          <Filter className="w-3 h-3" />
          {t('تصفية النتائج', 'Filtering results')}
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tabLoading ? (
            <SkeletonPage />
          ) : (
            <>
              {activeTab === 'skill' && (
                <SkillTab
                  skills={sortedSkills}
                  maxVal={maxSkillVal}
                  expandedId={expandedSkillId}
                  onExpand={setExpandedSkillId}
                  detail={skillDetail}
                  detailLoading={detailLoading}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  t={t}
                />
              )}
              {activeTab === 'occupation' && (
                <OccupationTab
                  occupations={sortedOccupations}
                  maxVal={maxOccVal}
                  expandedIdx={expandedOccIdx}
                  onExpand={setExpandedOccIdx}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  t={t}
                />
              )}
              {activeTab === 'institution' && (
                <InstitutionTab
                  institutions={instData?.institutions || []}
                  expandedId={expandedInstId}
                  onExpand={setExpandedInstId}
                  t={t}
                />
              )}
              {activeTab === 'program' && (
                <ProgramTab
                  programs={progData?.programs || []}
                  t={t}
                />
              )}
              {activeTab === 'region' && (
                <RegionTab
                  regions={regionData?.regions || []}
                  t={t}
                />
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

// ── SKILL TAB (richest view) ────────────────────────────────────────────────

function SkillTab({
  skills, maxVal, expandedId, onExpand, detail, detailLoading,
  sortField, sortDir, onSort, t,
}: {
  skills: any[]; maxVal: number; expandedId: number | null;
  onExpand: (id: number | null) => void; detail: any; detailLoading: boolean;
  sortField: string; sortDir: 'asc' | 'desc'; onSort: (f: string) => void;
  t: (ar: string, en: string) => string;
}) {
  if (!skills.length) {
    return (
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-12 text-center">
        <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('لا توجد مهارات', 'No skills found')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-gray-500 px-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.navy }} />
          {t('الطلب (وظائف)', 'Demand (jobs)')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS.teal }} />
          {t('العرض (دورات)', 'Supply (courses)')}
        </span>
      </div>

      <div className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              <th className="w-8 px-3 py-2.5" />
              <SortHeader label={t('المهارة', 'Skill')} field="skill" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              <SortHeader label={t('النوع', 'Type')} field="type" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              <SortHeader label={t('الطلب', 'Demand')} field="demand" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              <SortHeader label={t('العرض', 'Supply')} field="supply" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[160px]">
                {t('الفجوة المرئية', 'Gap Visual')}
              </th>
              <SortHeader label={t('الفجوة', 'Gap')} field="gap" sortField={sortField} sortDir={sortDir} onSort={onSort} />
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('الحالة', 'Status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s: any) => {
              const isExpanded = expandedId === s.skill_id;
              const status = gapStatus(s.gap ?? 0);
              return (
                <SkillRow
                  key={s.skill_id}
                  skill={s}
                  status={status}
                  maxVal={maxVal}
                  isExpanded={isExpanded}
                  onToggle={() => onExpand(isExpanded ? null : s.skill_id)}
                  detail={isExpanded ? detail : null}
                  detailLoading={isExpanded && detailLoading}
                  t={t}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <InsightPanel
        explanation={t(
          'يعرض هذا الجدول الفجوة بين الطلب على المهارات في سوق العمل والعرض من المؤسسات التعليمية',
          'This table shows the gap between labour market demand for skills and the supply from educational institutions'
        )}
        insight={t(
          `${skills.filter((s: any) => (s.gap ?? 0) > 20).length} مهارات في حالة نقص حاد`,
          `${skills.filter((s: any) => (s.gap ?? 0) > 20).length} skills are in critical shortage`
        )}
        recommendation={t(
          'انقر على أي مهارة لمعرفة الوظائف التي تتطلبها والدورات التي تدرسها',
          'Click any skill to see which jobs require it and which courses teach it'
        )}
        severity="info"
        source={t('ESCO + بيانات العرض والطلب', 'ESCO + Supply-Demand data')}
      />
    </div>
  );
}

function SkillRow({
  skill: s, status, maxVal, isExpanded, onToggle, detail, detailLoading, t,
}: {
  skill: any; status: { label: string; color: string }; maxVal: number;
  isExpanded: boolean; onToggle: () => void;
  detail: any; detailLoading: boolean;
  t: (ar: string, en: string) => string;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-t border-gray-50 cursor-pointer transition-colors
          ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}
      >
        <td className="px-3 py-3 text-gray-400">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 text-sm font-medium text-gray-800 max-w-[200px] truncate">
          {s.skill || s.name || '—'}
        </td>
        <td className="px-4 py-3">
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {s.type || '—'}
          </span>
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-gray-700 tabular-nums">
          {formatCompact(s.demand)}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-gray-700 tabular-nums">
          {formatCompact(s.supply)}
        </td>
        <td className="px-4 py-3">
          <DivergingBar demand={s.demand ?? 0} supply={s.supply ?? 0} maxVal={maxVal} />
        </td>
        <td className="px-4 py-3">
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: status.color }}
          >
            {s.gap != null ? (s.gap > 0 ? '+' : '') + formatCompact(s.gap) : '—'}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${gapBadgeClass(s.gap ?? 0)}`}>
            {status.label}
          </span>
        </td>
      </tr>

      {/* Expanded detail panel */}
      {isExpanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-gradient-to-b from-blue-50/60 to-white border-t border-blue-100"
            >
              <SkillDetailPanel detail={detail} loading={detailLoading} t={t} />
            </motion.div>
          </td>
        </tr>
      )}
    </>
  );
}

function SkillDetailPanel({
  detail, loading, t,
}: {
  detail: any; loading: boolean; t: (ar: string, en: string) => string;
}) {
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-sm text-gray-400">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-[#003366] rounded-full animate-spin" />
        {t('جار التحميل...', 'Loading details...')}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6 text-center text-sm text-gray-400">
        {t('لا توجد تفاصيل', 'No detail data available')}
      </div>
    );
  }

  const jobs = detail.demand?.jobs || [];
  const courses = detail.supply?.courses || [];

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[#003366] flex items-center justify-center">
          <Layers className="w-4 h-4 text-white" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-gray-800">{detail.skill?.name || '—'}</h4>
          <p className="text-[11px] text-gray-500">
            {detail.skill?.type || '—'}
            {detail.demand?.total_jobs != null && ` \u00B7 ${formatCompact(detail.demand.total_jobs)} ${t('وظيفة', 'jobs')}`}
            {detail.supply?.total_courses != null && ` \u00B7 ${formatCompact(detail.supply.total_courses)} ${t('دورة', 'courses')}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LEFT: Jobs requiring this skill */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" />
            {t('الوظائف التي تتطلب هذه المهارة', 'Jobs requiring this skill')}
          </h5>
          {jobs.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">{t('لا توجد وظائف', 'No jobs found')}</p>
          ) : (
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {jobs.map((j: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-50 text-sm">
                  <div>
                    <span className="text-gray-800 font-medium">{j.title || j.occupation || '—'}</span>
                    {j.region && (
                      <span className="ml-2 text-[10px] text-gray-400 flex-shrink-0">
                        <MapPin className="w-2.5 h-2.5 inline -mt-0.5" /> {j.region}
                      </span>
                    )}
                  </div>
                  {j.count != null && (
                    <span className="text-xs font-semibold text-[#003366] tabular-nums">{formatCompact(j.count)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Courses teaching this skill */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" />
            {t('الدورات التي تدرس هذه المهارة', 'Courses teaching this skill')}
          </h5>
          {courses.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">{t('لا توجد دورات', 'No courses found')}</p>
          ) : (
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {courses.map((c: any, i: number) => (
                <div key={i} className="py-1.5 px-2 rounded-lg hover:bg-gray-50">
                  <span className="text-sm text-gray-800 font-medium">{c.course || c.name || '—'}</span>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {c.institution && <span><Building2 className="w-2.5 h-2.5 inline -mt-0.5" /> {c.institution}</span>}
                    {c.program && <span className="ml-2"><GraduationCap className="w-2.5 h-2.5 inline -mt-0.5" /> {c.program}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── OCCUPATION TAB ──────────────────────────────────────────────────────────

function OccupationTab({
  occupations, maxVal, expandedIdx, onExpand, sortField, sortDir, onSort, t,
}: {
  occupations: any[]; maxVal: number; expandedIdx: number | null;
  onExpand: (idx: number | null) => void;
  sortField: string; sortDir: 'asc' | 'desc'; onSort: (f: string) => void;
  t: (ar: string, en: string) => string;
}) {
  if (!occupations.length) {
    return (
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-12 text-center">
        <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('لا توجد مهن', 'No occupations found')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-100">
            <th className="w-8 px-3 py-2.5" />
            <SortHeader label={t('المهنة', 'Occupation')} field="occupation" sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">ISCO</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('المنطقة', 'Region')}</th>
            <SortHeader label={t('العرض', 'Supply')} field="supply" sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <SortHeader label={t('الطلب', 'Demand')} field="demand" sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[140px]">
              {t('العرض/الطلب', 'Supply vs Demand')}
            </th>
            <SortHeader label={t('الفجوة', 'Gap')} field="gap" sortField={sortField} sortDir={sortDir} onSort={onSort} />
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('مهارات', 'Skills')}</th>
            <SortHeader label={t('مخاطر AI', 'AI Risk')} field="ai_exposure" sortField={sortField} sortDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {occupations.map((o: any, idx: number) => {
            const isExpanded = expandedIdx === idx;
            const status = gapStatus(o.gap ?? 0);
            return (
              <OccupationRow
                key={idx}
                occ={o}
                idx={idx}
                maxVal={maxVal}
                status={status}
                isExpanded={isExpanded}
                onToggle={() => onExpand(isExpanded ? null : idx)}
                t={t}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OccupationRow({
  occ: o, idx, maxVal, status, isExpanded, onToggle, t,
}: {
  occ: any; idx: number; maxVal: number; status: { label: string; color: string };
  isExpanded: boolean; onToggle: () => void;
  t: (ar: string, en: string) => string;
}) {
  const skills: string[] = Array.isArray(o.skills)
    ? o.skills
    : typeof o.skills === 'string'
      ? o.skills.split(',').map((s: string) => s.trim())
      : [];

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-t border-gray-50 cursor-pointer transition-colors
          ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}
      >
        <td className="px-3 py-3 text-gray-400">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 text-sm font-medium text-gray-800 max-w-[180px] truncate">
          {o.occupation || '—'}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{o.isco || '—'}</td>
        <td className="px-4 py-3 text-xs text-gray-600">{o.region || o.emirate || '—'}</td>
        <td className="px-4 py-3 text-sm tabular-nums">{formatCompact(o.supply)}</td>
        <td className="px-4 py-3 text-sm tabular-nums">{formatCompact(o.demand)}</td>
        <td className="px-4 py-3">
          <DivergingBar demand={o.demand ?? 0} supply={o.supply ?? 0} maxVal={maxVal} />
        </td>
        <td className="px-4 py-3">
          <span className="text-sm font-bold tabular-nums" style={{ color: status.color }}>
            {o.gap != null ? (o.gap > 0 ? '+' : '') + formatCompact(o.gap) : '—'}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {typeof o.skills === 'number' ? o.skills : skills.length || '—'}
        </td>
        <td className="px-4 py-3">
          {o.ai_exposure != null ? (
            <div className="flex items-center gap-2">
              <div className="w-14 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${Math.min(o.ai_exposure * 100, 100)}%`,
                    backgroundColor: o.ai_exposure > 0.6 ? '#1A3F5C' : o.ai_exposure > 0.3 ? '#C9A84C' : '#2E7D6B',
                  }}
                />
              </div>
              <span className="text-[11px] text-gray-500 tabular-nums">
                {(o.ai_exposure * 100).toFixed(0)}%
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
      </tr>

      {isExpanded && skills.length > 0 && (
        <tr>
          <td colSpan={10} className="p-0">
            <div className="bg-blue-50/40 border-t border-blue-100 px-8 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t('المهارات المطلوبة', 'Required Skills')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, 20).map((sk: string, i: number) => (
                  <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700">
                    {sk}
                  </span>
                ))}
                {skills.length > 20 && (
                  <span className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                    +{skills.length - 20} {t('المزيد', 'more')}
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── INSTITUTION TAB ─────────────────────────────────────────────────────────

function InstitutionTab({
  institutions, expandedId, onExpand, t,
}: {
  institutions: any[]; expandedId: string | null;
  onExpand: (id: string | null) => void;
  t: (ar: string, en: string) => string;
}) {
  const avgSkills = useMemo(() => {
    if (!institutions.length) return 0;
    return Math.round(institutions.reduce((sum: number, i: any) => sum + (i.skills_taught || 0), 0) / institutions.length);
  }, [institutions]);

  const maxSkills = useMemo(() => {
    return Math.max(...institutions.map((i: any) => i.skills_taught || 0), 1);
  }, [institutions]);

  if (!institutions.length) {
    return (
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-12 text-center">
        <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('لا توجد مؤسسات', 'No institutions found')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {institutions.map((inst: any) => {
        const id = inst.institution_id || inst.institution;
        const isExpanded = expandedId === id;
        return (
          <motion.div
            key={id}
            layout
            className={`bg-white border shadow-md rounded-2xl overflow-hidden cursor-pointer transition-all
              ${isExpanded ? 'border-[#003366]/30 ring-1 ring-[#003366]/10 col-span-full' : 'border-gray-100 hover:border-gray-200 hover:shadow-lg'}`}
            onClick={() => onExpand(isExpanded ? null : id)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#003366]/5 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-[#003366]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-800 line-clamp-1">{inst.institution || '—'}</h3>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-[#003366]">{inst.programs ?? '—'}</p>
                  <p className="text-[10px] text-gray-500">{t('برامج', 'Programs')}</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#007DB5]">{inst.courses ?? '—'}</p>
                  <p className="text-[10px] text-gray-500">{t('دورات', 'Courses')}</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#2E7D6B]">{inst.skills_taught ?? '—'}</p>
                  <p className="text-[10px] text-gray-500">{t('مهارات', 'Skills')}</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>{t('المهارات المدرسة', 'Skills taught')}</span>
                  <span>{t('متوسط', 'Avg')}: {avgSkills}</span>
                </div>
                <HorizontalBar value={inst.skills_taught || 0} max={maxSkills} color={COLORS.teal} />
              </div>
            </div>

            {/* Expanded: show programs */}
            {isExpanded && inst.programs_list && (
              <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {t('البرامج', 'Programs')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(inst.programs_list || []).map((prog: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-sm font-medium text-gray-800">{prog.name || prog.program || '—'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {prog.courses != null && `${prog.courses} ${t('دورات', 'courses')}`}
                        {prog.skills_taught != null && ` \u00B7 ${prog.skills_taught} ${t('مهارات', 'skills')}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ── PROGRAM TAB ─────────────────────────────────────────────────────────────

function ProgramTab({
  programs, t,
}: {
  programs: any[];
  t: (ar: string, en: string) => string;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!programs.length) {
    return (
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-12 text-center">
        <GraduationCap className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('لا توجد برامج', 'No programs found')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-100">
            <th className="w-8 px-3 py-2.5" />
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('البرنامج', 'Program')}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('المؤسسة', 'Institution')}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('الدورات', 'Courses')}
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('المهارات المدرسة', 'Skills Taught')}
            </th>
          </tr>
        </thead>
        <tbody>
          {programs.map((p: any, idx: number) => {
            const isExpanded = expandedIdx === idx;
            const skills: string[] = Array.isArray(p.skills_list) ? p.skills_list : [];
            return (
              <ProgramRow
                key={idx}
                program={p}
                idx={idx}
                isExpanded={isExpanded}
                onToggle={() => setExpandedIdx(isExpanded ? null : idx)}
                skills={skills}
                t={t}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProgramRow({
  program: p, idx, isExpanded, onToggle, skills, t,
}: {
  program: any; idx: number; isExpanded: boolean; onToggle: () => void;
  skills: string[];
  t: (ar: string, en: string) => string;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-t border-gray-50 cursor-pointer transition-colors
          ${isExpanded ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}
      >
        <td className="px-3 py-3 text-gray-400">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.program || '—'}</td>
        <td className="px-4 py-3 text-sm text-gray-600">{p.institution || '—'}</td>
        <td className="px-4 py-3 text-sm tabular-nums font-semibold text-gray-700">{p.courses ?? '—'}</td>
        <td className="px-4 py-3 text-sm tabular-nums font-semibold text-[#007DB5]">{p.skills_taught ?? '—'}</td>
      </tr>

      {isExpanded && skills.length > 0 && (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="bg-blue-50/40 border-t border-blue-100 px-8 py-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t('المهارات المدرسة في هذا البرنامج', 'Skills taught in this program')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((sk: string, i: number) => (
                  <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700">
                    {sk}
                  </span>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── REGION TAB ──────────────────────────────────────────────────────────────

function RegionTab({
  regions, t,
}: {
  regions: any[];
  t: (ar: string, en: string) => string;
}) {
  const maxVal = useMemo(() => {
    return Math.max(...regions.map((r: any) => Math.max(r.supply || 0, r.demand || 0)), 1);
  }, [regions]);

  if (!regions.length) {
    return (
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-12 text-center">
        <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t('لا توجد بيانات مناطق', 'No region data found')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {regions.map((r: any, idx: number) => {
        const status = gapStatus(r.gap ?? 0);
        return (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#003366]/5 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-[#003366]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-800">{r.region || r.emirate || '—'}</h3>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${gapBadgeClass(r.gap ?? 0)}`}
                >
                  {status.label}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-500">{t('الطلب', 'Demand')}</span>
                  <span className="font-semibold text-[#003366]">{formatCompact(r.demand)}</span>
                </div>
                <HorizontalBar value={r.demand || 0} max={maxVal} color={COLORS.navy} />
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-500">{t('العرض', 'Supply')}</span>
                  <span className="font-semibold text-[#007DB5]">{formatCompact(r.supply)}</span>
                </div>
                <HorizontalBar value={r.supply || 0} max={maxVal} color={COLORS.teal} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-500">{t('الفجوة', 'Gap')}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: status.color }}>
                {r.gap != null ? (r.gap > 0 ? '+' : '') + formatCompact(r.gap) : '—'}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default ExplorerPage;
