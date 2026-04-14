import { useMemo, useState, useEffect, useRef, Fragment } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFilters } from '@/contexts/FilterContext';
import {
  useSupplyDashboard, useSupplyDataExplorer, useSuppliedSkills,
  useFutureProjection, useExplorerFilters,
  useExplorerByInstitution, useExplorerByProgram, useExplorerBySkill,
  useSkillMatchingSummary, useSupplyChainGraph,
  useSupplyFilterOptions,
} from '@/api/hooks';
import { useStreamChatWithTraces } from '@/api/useStreamChatWithTraces';
import { parseVisualization, stripChartBlock } from '@/components/chat/parseVisualization';
import ChatVisualization from '@/components/chat/ChatVisualization';
import { api } from '@/api/client';
import { usePageLoading } from '@/hooks/usePageLoading';
import { SkeletonChart, SkeletonTable, SkeletonKPICard } from '@/components/shared/Skeletons';
import { ErrorState } from '@/components/shared/EmptyState';
import PageHeader from '@/components/shared/PageHeader';
import KPICard from '@/components/shared/KPICard';
import ChartTooltip from '@/components/charts/ChartTooltip';
import ChartToolbar from '@/components/charts/ChartToolbar';
import ForceGraph from '@/components/charts/ForceGraph';
import { COLORS, GRID_PROPS, AXIS_TICK_SM, BAR_RADIUS, BAR_RADIUS_H } from '@/utils/chartColors';
import DataStory from '@/components/shared/DataStory';
import InsightPanel from '@/components/shared/InsightPanel';
import { formatCompact } from '@/utils/formatters';
import {
  Building2, BookOpen, Users, GraduationCap, ExternalLink, Database,
  BarChart3, Table2, MessageSquare, Send, Loader2, X, FlaskConical, Globe,
  School, TrendingUp, Briefcase, Target, Layers, ChevronDown,
  ChevronRight, Search, ArrowUpDown, MapPin, Calendar, Cpu,
  Filter, LayoutGrid, Award, AlertTriangle, Sparkles, Minimize2,
  FlaskRound, Eye, EyeOff, Crosshair,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, ReferenceLine,
} from 'recharts';

/* ── Helpers ─────────────────────────────────────────────────── */
const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const srcStyle = (s: string) => {
  if (s.includes('bayanat')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s.includes('web_scrape') || s.includes('scrape')) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (s.includes('estimated') || s.includes('Estimated')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (s.includes('caa')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (s.includes('ceic') || s.includes('CEIC')) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-gray-50 text-gray-600 border-gray-200';
};

const SourceBadge = ({ source, onClick }: { source: string; onClick?: () => void }) => (
  <button onClick={onClick}
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border hover:shadow-sm cursor-pointer ${srcStyle(source)}`}>
    <Database className="w-2.5 h-2.5" />{source.replace(/_/g, ' ')}{onClick && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
  </button>
);

const PIE = [COLORS.navy, COLORS.teal, COLORS.gold, COLORS.emerald, COLORS.coral, COLORS.copper, COLORS.slate, '#0A5C8A', '#5BA3C9', '#1A3F5C', '#8B5CF6', '#06B6D4'];
type Tab = 'overview' | 'explorer';

/* ── GlassCard ────────────────────────────────────────────────── */
const GlassCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-gray-100 shadow-md hover:shadow-lg transition-shadow duration-200 rounded-2xl p-5 ${className}`}>
    {children}
  </div>
);

/* ── Section Header (collapsible, gradient icon) ──────────────── */
const SectionHeader = ({ icon: Icon, title, subtitle, collapsed, onToggle }: {
  icon: React.ElementType; title: string; subtitle?: string; collapsed?: boolean; onToggle?: () => void;
}) => (
  <div className="flex items-center gap-3 mb-1 cursor-pointer select-none" onClick={onToggle}>
    <div className="p-2 rounded-xl bg-gradient-to-br from-[#003366]/10 to-[#007DB5]/10">
      <Icon className="w-5 h-5 text-[#003366]" />
    </div>
    <div className="flex-1">
      <h2 className="text-base font-bold text-[#003366]">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    </div>
    <div className="flex-1 border-b border-gray-200" />
    {onToggle && (
      <motion.div animate={{ rotate: collapsed ? 0 : 180 }} transition={{ duration: 0.2 }}>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </motion.div>
    )}
  </div>
);

/* ── HeroKPI ──────────────────────────────────────────────────── */
const HERO_GRADIENTS = ['from-[#003366] to-[#007DB5]', 'from-[#C9A84C] to-[#B87333]', 'from-[#007DB5] to-[#00875A]', 'from-[#00875A] to-[#003366]'];

const HeroKPI = ({ icon: Icon, label, value, sub, gradient, delay }: {
  icon: React.ElementType; label: string; value: string; sub?: string; gradient: string; delay: number;
}) => (
  <motion.div initial={{ opacity: 0, y: 20, rotateX: 8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
    transition={{ delay, duration: 0.5 }}
    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-5 text-white cursor-default`}>
    <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10 blur-xl" />
    <div className="absolute right-3 bottom-3 opacity-10"><Icon className="w-16 h-16" /></div>
    <div className="relative z-10">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="w-5 h-5" /></div>
        <span className="text-xs font-medium text-white/80">{label}</span>
      </div>
      <p className="text-2xl lg:text-3xl font-bold tracking-tight tabular-nums truncate">{value}</p>
      {sub && <p className="text-[10px] text-white/70 mt-1 truncate">{sub}</p>}
    </div>
  </motion.div>
);

/* ── StatRow ──────────────────────────────────────────────────── */
const StatRow = ({ label, value, color, pct }: { label: string; value: string; color: string; pct?: number }) => (
  <div className="flex items-center gap-3 py-1.5">
    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
    <span className="text-xs text-text-secondary flex-1">{label}</span>
    <span className="text-xs font-semibold text-primary tabular-nums">{value}</span>
    {pct != null && <span className="text-[10px] text-text-muted w-10 text-right">{pct.toFixed(0)}%</span>}
  </div>
);

/* ── UAE Interactive Institution Map (vanilla Leaflet) ────────── */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const InstitutionMap = ({ institutions }: {
  institutions: { institution: string; emirate: string; lat: number | null; lng: number | null; programs: number; graduates: number }[];
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  const valid = useMemo(
    () => institutions.filter(i => i.lat && i.lng && i.lat > 20 && i.lat < 27 && i.lng > 50 && i.lng < 57),
    [institutions]
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [24.4, 54.5],
      zoom: 7,
      scrollWheelZoom: true,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || valid.length === 0) return;

    const markers: L.CircleMarker[] = [];
    const maxProg = Math.max(...valid.map(i => i.programs), 1);

    valid.forEach(inst => {
      const radius = Math.max(6, Math.min(22, (inst.programs / maxProg) * 20 + 4));
      const marker = L.circleMarker([inst.lat!, inst.lng!], {
        radius,
        fillColor: '#003366',
        fillOpacity: 0.7,
        color: '#C9A84C',
        weight: 2,
      }).bindPopup(`
        <div style="font-size:12px;min-width:180px">
          <p style="font-weight:700;color:#003366;font-size:13px;margin:0 0 4px 0">${inst.institution}</p>
          <p style="color:#9ca3af;margin:0 0 8px 0">${inst.emirate || 'UAE'}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px">
            <span style="color:#9ca3af">Programs:</span><span style="font-weight:600">${inst.programs}</span>
            <span style="color:#9ca3af">Graduates:</span><span style="font-weight:600">${fmt(inst.graduates)}</span>
          </div>
        </div>
      `).addTo(map);
      markers.push(marker);
    });

    return () => {
      markers.forEach(m => m.remove());
    };
  }, [valid]);

  if (valid.length === 0) return (
    <div className="h-[450px] flex items-center justify-center text-text-muted text-sm rounded-xl bg-gray-50">No geospatial data available for institutions</div>
  );

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      <div ref={mapContainerRef} style={{ height: 450, width: '100%' }} />
      <div className="flex items-center gap-4 px-3 py-2 bg-white border-t border-gray-100 text-[10px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#003366]/70 border-2 border-[#C9A84C]" /> Institution (size = # programs)</span>
        <span>{valid.length} institutions mapped · Click markers for details</span>
      </div>
    </div>
  );
};

/* ── Treemap custom content ──────────────────────────────────── */
const TreemapContent = (props: any) => {
  const { x, y, width, height, name, count, index } = props;
  if (width < 40 || height < 30) return null;
  const colors = [COLORS.navy, COLORS.teal, COLORS.gold, COLORS.emerald, COLORS.copper, COLORS.slate, COLORS.coral, '#0A5C8A', '#5BA3C9'];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={colors[index % colors.length]} fillOpacity={0.85} stroke="white" strokeWidth={2} />
      {width > 60 && height > 40 && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" className="fill-white text-[10px] font-medium pointer-events-none">{name?.substring(0, 18)}</text>
          <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" className="fill-white/70 text-[9px] pointer-events-none">{fmt(count ?? 0)}</text>
        </>
      )}
    </g>
  );
};

/* ── Chat message type ────────────────────────────────────────── */
interface ChatMsg { role: 'user' | 'assistant'; content: string; visualization?: any }

/* ══════════════════════════════════════════════════════════════ */
const SupplyDashboardPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading(400);
  const { filters } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'overview');
  const [explorerSource, setExplorerSource] = useState<string | undefined>(searchParams.get('source') ?? undefined);

  // Filters
  const [regionFilter, setRegionFilter] = useState<string | undefined>(undefined);
  const [yearFrom, setYearFrom] = useState<number | undefined>(undefined);
  const [yearTo, setYearTo] = useState<number | undefined>(undefined);
  const [sectorFilter, setSectorFilter] = useState<string | undefined>(undefined);
  const [specialtyFilter, setSpecialtyFilter] = useState<string | undefined>(undefined);
  const [degreeLevelFilter, setDegreeLevelFilter] = useState<string | undefined>(undefined);
  const hasFilters = regionFilter || yearFrom || yearTo || sectorFilter || specialtyFilter || degreeLevelFilter;
  const clearFilters = () => { setRegionFilter(undefined); setYearFrom(undefined); setYearTo(undefined); setSectorFilter(undefined); setSpecialtyFilter(undefined); setDegreeLevelFilter(undefined); };

  // AI Chat state (SSE streaming with traces + dashboard patches)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [webSearchOn, setWebSearchOn] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const {
    streamMessage, streamingText, isStreaming, traces, citations: streamCitations,
    dashboardPatches, error: streamError, cancel: cancelStream,
  } = useStreamChatWithTraces({
    pageContext: 'supply_education_dashboard',
    internetSearch: webSearchOn,
  });

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages, streamingText]);

  const sendChatMessage = async () => {
    const q = chatInput.trim();
    if (!q || isStreaming) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: q }]);
    await streamMessage(q);
  };

  // When streaming completes, add assistant message with parsed visualization
  useEffect(() => {
    if (!isStreaming && streamingText && chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === 'user') {
      const viz = parseVisualization(streamingText);
      const cleanContent = stripChartBlock(streamingText);
      setChatMessages(prev => [...prev, { role: 'assistant', content: cleanContent, visualization: viz }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  // Apply dashboard patches from AI agent — modify page filters/state
  useEffect(() => {
    if (dashboardPatches.length === 0) return;
    for (const p of dashboardPatches) {
      if (p.action === 'filter') {
        const [key, val] = p.value.split('=');
        if (key === 'emirate' || key === 'region') setRegionFilter(val || undefined);
        if (key === 'year_from') setYearFrom(parseInt(val) || undefined);
        if (key === 'year_to') setYearTo(parseInt(val) || undefined);
        if (key === 'sector') setSectorFilter(val || undefined);
        if (key === 'specialty') setSpecialtyFilter(val || undefined);
        if (key === 'degree_level') setDegreeLevelFilter(val || undefined);
      }
    }
  }, [dashboardPatches]);

  const apiParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (filters.emirate !== 'all') p.emirate = filters.emirate;
    if (regionFilter) p.emirate = regionFilter;
    if (yearFrom) p.year_from = yearFrom;
    if (yearTo) p.year_to = yearTo;
    if (sectorFilter) p.sector = sectorFilter;
    if (specialtyFilter) p.specialty = specialtyFilter;
    if (degreeLevelFilter) p.degree_level = degreeLevelFilter;
    return p;
  }, [filters.emirate, regionFilter, yearFrom, yearTo, sectorFilter, specialtyFilter, degreeLevelFilter]);

  const { data, isLoading, error } = useSupplyDashboard(apiParams);
  const { data: filterOptions } = useSupplyFilterOptions();

  const goToExplorer = (source?: string) => {
    setExplorerSource(source); setActiveTab('explorer');
    setSearchParams({ tab: 'explorer', ...(source ? { source } : {}) });
  };

  useEffect(() => {
    const tab = searchParams.get('tab') as Tab;
    if (tab && tab !== activeTab) setActiveTab(tab);
    const s = searchParams.get('source');
    if (s) setExplorerSource(s);
  }, [searchParams]);

  if (loading || isLoading) return (
    <div className="p-6 space-y-8 max-w-[1440px] mx-auto">
      <div className="h-7 w-72 mb-2 animate-pulse bg-surface-tertiary rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0,1,2,3].map(i => <SkeletonKPICard key={i} />)}</div>
      <SkeletonChart height={300} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6"><SkeletonChart height={280} /><SkeletonChart height={280} /></div>
    </div>
  );

  if (error) return (
    <div className="p-6 space-y-8 max-w-[1440px] mx-auto">
      <PageHeader title={t('لوحة العرض التعليمي', 'Supply / Education Dashboard')} />
      <ErrorState message="Failed to load supply dashboard data" onRetry={() => window.location.reload()} />
    </div>
  );

  return (
    <div className="p-6 space-y-8 max-w-[1440px] mx-auto">
      <PageHeader title={t('تحليلات جانب العرض: التعليم والقوى العاملة', 'Supply-Side Analytics: Education & Workforce')}
        subtitle={t('تحليل شامل للتعليم العالي والخريجين والبرامج والمهارات في الإمارات', 'Comprehensive analysis of UAE higher education, graduates, programs & skills pipeline')} />

      <div className="flex items-center gap-1 bg-surface-secondary rounded-xl p-1 shadow-sm">
        {([
          { key: 'overview' as Tab, icon: BarChart3, label: t('نظرة عامة', 'Overview') },
          { key: 'explorer' as Tab, icon: Table2, label: t('مستكشف البيانات', 'Data Explorer') },
        ]).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSearchParams({ tab: tab.key }); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.key ? 'bg-card text-primary shadow-md border border-border-light' : 'text-text-muted hover:text-primary hover:bg-card/50'
            }`}><tab.icon className="w-4 h-4" />{tab.label}</button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
            <OverviewTab data={data} goToExplorer={goToExplorer}
              regionFilter={regionFilter} setRegionFilter={setRegionFilter}
              yearFrom={yearFrom} setYearFrom={setYearFrom}
              yearTo={yearTo} setYearTo={setYearTo}
              sectorFilter={sectorFilter} setSectorFilter={setSectorFilter}
              specialtyFilter={specialtyFilter} setSpecialtyFilter={setSpecialtyFilter}
              degreeLevelFilter={degreeLevelFilter} setDegreeLevelFilter={setDegreeLevelFilter}
              hasFilters={!!hasFilters} clearFilters={clearFilters} filterOptions={filterOptions} />
          </motion.div>
        )}
        {activeTab === 'explorer' && (
          <motion.div key="ex" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <DataExplorerTab initialSource={explorerSource} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* AI RESEARCH CHATBOT — Inline section with thinking traces */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#003366]/10"><Sparkles className="w-5 h-5 text-[#003366]" /></div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{t('مساعد أبحاث التعليم', 'Education Research Assistant')}</h2>
                <p className="text-[11px] text-gray-400">
                  {t('وكيل ذكاء — قاعدة بيانات + بحث ويب + تعديل الرسوم البيانية', 'Multi-agent: DB queries + web search + chart modifications')}
                </p>
              </div>
            </div>
            <button onClick={() => setChatOpen(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                chatOpen ? 'bg-[#003366]/10 text-[#003366] border-[#003366]/20' : 'bg-white text-gray-400 border-gray-200'
              }`}>
              <FlaskRound className="w-3.5 h-3.5" />
              {t('سلسلة التفكير', 'Thinking Traces')}
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button onClick={() => setWebSearchOn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                webSearchOn ? 'bg-[#003366] text-white border-[#003366]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#003366]/30'
              }`}>
              <Globe className="w-3.5 h-3.5" />
              {t('بحث مباشر', 'Web Search')}
              {webSearchOn && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </button>
            <span className="text-[10px] text-gray-400">
              {webSearchOn ? t('بحث مباشر عبر Tavily', 'Live Tavily web search')
                : t('قاعدة بيانات التعليم العالي', 'UAE higher education database')}
            </span>
          </div>

          {chatMessages.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                t('ما التخصصات الأكثر طلبا في أبوظبي؟', 'What specialties have highest enrollment in Abu Dhabi?'),
                t('أظهر فقط بيانات القطاع الحكومي', 'Filter to show only government sector data'),
                t('ما نسبة خريجي STEM مقارنة بغير STEM؟', 'What is the STEM vs Non-STEM graduate ratio?'),
                t('ما المهارات المفقودة من المناهج الجامعية؟', 'What skills are missing from university curricula?'),
                t('قائمة جميع المؤسسات التعليمية', 'List all higher education institutions'),
                t('غيّر الفلتر إلى دبي والقطاع الخاص', 'Change filter to Dubai + private sector'),
              ].map((q, i) => (
                <button key={i} onClick={() => { setChatInput(q); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-[#003366]/5 hover:border-[#003366]/20 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main: Chat + Traces */}
        <div className={`flex ${chatOpen ? 'divide-x divide-gray-100' : ''}`}>
          <div className={`${chatOpen ? 'w-[60%]' : 'w-full'} max-h-[500px] overflow-y-auto p-5 space-y-4`}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-[#003366] text-white rounded-br-md'
                    : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-bl-md'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <div className="text-sm leading-relaxed prose prose-sm prose-gray max-w-none
                      prose-headings:text-gray-900 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
                      prose-p:my-1.5 prose-li:my-0.5
                      prose-table:text-xs prose-th:bg-[#003366]/5 prose-th:text-[#003366] prose-th:font-semibold prose-th:px-3 prose-th:py-1.5
                      prose-td:px-3 prose-td:py-1 prose-td:border-gray-200
                      prose-strong:text-[#003366]">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                  {msg.visualization && (
                    <div className="mt-3 -mx-1">
                      <ChatVisualization spec={msg.visualization} compact />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                  <div className="text-sm leading-relaxed prose prose-sm prose-gray max-w-none
                    prose-headings:text-gray-900 prose-headings:font-bold prose-p:my-1.5
                    prose-table:text-xs prose-th:bg-[#003366]/5 prose-th:text-[#003366] prose-th:font-semibold prose-th:px-3 prose-th:py-1.5
                    prose-td:px-3 prose-td:py-1 prose-strong:text-[#003366]">
                    <ReactMarkdown>{stripChartBlock(streamingText)}</ReactMarkdown>
                  </div>
                  <span className="inline-block w-1.5 h-4 bg-[#003366] animate-pulse ml-0.5 align-middle" />
                </div>
              </div>
            )}
            {isStreaming && !streamingText && (
              <div className="flex justify-start">
                <div className="bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#003366]" />
                  <span className="text-xs text-gray-400">{t('الوكيل يفكر...', 'Agent thinking...')}</span>
                </div>
              </div>
            )}
            {streamError && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{streamError}</div>}
            <div ref={chatEndRef} />
          </div>

          {/* Thinking Traces Panel */}
          {chatOpen && (
            <div className="w-[40%] max-h-[500px] overflow-y-auto bg-[#FAFBFE] p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                  <FlaskRound className="w-3.5 h-3.5" />
                  {t('سلسلة التنفيذ', 'Execution Trace')}
                </h4>
                {traces.length > 0 && (
                  <span className="text-[9px] text-gray-400">{traces.length} steps</span>
                )}
              </div>

              {traces.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  <p className="text-[11px]">{t('أرسل رسالة لرؤية خطوات التنفيذ', 'Send a message to see execution steps')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {traces.map((step) => (
                    <div key={step.id} className={`rounded-lg border p-2.5 text-[11px] ${
                      step.type === 'thinking' ? 'bg-blue-50/50 border-blue-100' :
                      step.type === 'tool_call' ? 'bg-amber-50/50 border-amber-100' :
                      step.type === 'done' ? 'bg-green-50/50 border-green-100' :
                      step.type === 'error' ? 'bg-red-50/50 border-red-100' :
                      'bg-white border-gray-100'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {step.type === 'thinking' && <Sparkles className="w-3 h-3 text-blue-500" />}
                          {step.type === 'tool_call' && <FlaskRound className="w-3 h-3 text-amber-600" />}
                          {step.type === 'done' && <FlaskRound className="w-3 h-3 text-green-600" />}
                          {step.type === 'error' && <X className="w-3 h-3 text-red-500" />}
                          <span className="font-semibold text-gray-700">
                            {step.type === 'thinking' ? 'Planning' :
                             step.type === 'tool_call' ? step.tool?.replace(/_/g, ' ') :
                             step.type === 'done' ? 'Complete' :
                             step.type === 'error' ? 'Error' : step.type}
                          </span>
                          {!step.duration && step.type !== 'done' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                        </div>
                        {step.duration != null && (
                          <span className="text-[9px] text-gray-400 tabular-nums">
                            {step.duration < 1000 ? `${step.duration}ms` : `${(step.duration / 1000).toFixed(1)}s`}
                          </span>
                        )}
                      </div>
                      {step.content && (
                        <p className="text-[10px] text-gray-500 mt-0.5">{step.content}</p>
                      )}
                      {step.tool && step.args && (
                        <details className="mt-1">
                          <summary className="text-[9px] text-gray-400 cursor-pointer hover:text-gray-600">View arguments</summary>
                          <pre className="mt-1 p-1.5 bg-white rounded text-[9px] text-gray-600 overflow-x-auto max-h-[100px]">
                            {JSON.stringify(step.args, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                  {dashboardPatches.length > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-[11px]">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                        <FlaskRound className="w-3 h-3" />
                        {dashboardPatches.length} dashboard patch{dashboardPatches.length !== 1 ? 'es' : ''} applied
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100">
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
              placeholder={t('اسأل أي سؤال — البيانات، التحليل، تغيير الرسوم البيانية...', 'Ask anything — data, analysis, change charts...')}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366]/40 outline-none"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button onClick={cancelStream}
                className="px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-2">
                <X className="w-4 h-4" /> {t('إلغاء', 'Stop')}
              </button>
            ) : (
              <button onClick={sendChatMessage} disabled={!chatInput.trim()}
                className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-medium hover:bg-[#003366]/90 disabled:opacity-50 transition-colors flex items-center gap-2">
                <Send className="w-4 h-4" /> {t('إرسال', 'Send')}
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            {t('وكيل التعليم العالي', 'Higher Ed AI Agent')} | {t('بحث ويب + تحكم بلوحة المعلومات', 'Web search + Dashboard control')}
          </p>
        </div>
      </div>
      )}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════ */
/*  OVERVIEW TAB                                                  */
/* ══════════════════════════════════════════════════════════════ */
interface OverviewProps {
  data: any; goToExplorer: (s?: string) => void;
  regionFilter: string | undefined; setRegionFilter: (v: string | undefined) => void;
  yearFrom: number | undefined; setYearFrom: (v: number | undefined) => void;
  yearTo: number | undefined; setYearTo: (v: number | undefined) => void;
  sectorFilter: string | undefined; setSectorFilter: (v: string | undefined) => void;
  specialtyFilter: string | undefined; setSpecialtyFilter: (v: string | undefined) => void;
  degreeLevelFilter: string | undefined; setDegreeLevelFilter: (v: string | undefined) => void;
  hasFilters: boolean; clearFilters: () => void; filterOptions: any;
}

const OverviewTab = (props: OverviewProps) => {
  const { data, goToExplorer, regionFilter, setRegionFilter, filterOptions } = props;
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (s: string) => setCollapsed(prev => ({ ...prev, [s]: !prev[s] }));

  // Taxonomy filters (separate from main filter bar)
  const [taxonomyInst, setTaxonomyInst] = useState<string>('');
  const [taxonomyLimit, setTaxonomyLimit] = useState<number>(30);

  // Future projection filters & adjustments
  const [projHorizon, setProjHorizon] = useState<number>(5); // years ahead
  const [projGrowthRate, setProjGrowthRate] = useState<number>(5); // % per year
  const [projMarketSignal, setProjMarketSignal] = useState<number>(0); // -50 to +50 external adjustment
  const [projMetric, setProjMetric] = useState<'enrollment' | 'graduates'>('enrollment');

  // External research agent — auto-fetches when filters change
  const [extResearch, setExtResearch] = useState<any>(null);
  const [extResearchLoading, setExtResearchLoading] = useState(false);
  const [extResearchError, setExtResearchError] = useState<string | null>(null);
  const [extResearchAuto, setExtResearchAuto] = useState(true); // auto-update slider

  // Drill-down state for projection chart
  const [selectedProjYear, setSelectedProjYear] = useState<number | null>(null);

  // Section-local filters for Future Supply Projection (separate from global filters)
  // These let user drill into university/program/region/specialty without affecting other sections
  const [projInstitution, setProjInstitution] = useState<string>('');
  const [projProgram, setProjProgram] = useState<string>('');
  const [projSpecialty, setProjSpecialty] = useState<string>('');
  const [projRegion, setProjRegion] = useState<string>('');
  const [projSector, setProjSector] = useState<string>('');
  const [projDegreeLevel, setProjDegreeLevel] = useState<string>('');

  // Fetch projection-specific data with local filters applied
  const projApiParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (projRegion) p.emirate = projRegion;
    if (projInstitution) p.institution = projInstitution;
    if (projProgram) p.program = projProgram;
    if (projSpecialty) p.specialty = projSpecialty;
    if (projSector) p.sector = projSector;
    if (projDegreeLevel) p.degree_level = projDegreeLevel;
    return p;
  }, [projRegion, projInstitution, projProgram, projSpecialty, projSector, projDegreeLevel]);

  const { data: projData } = useSupplyDashboard(Object.keys(projApiParams).length > 0 ? projApiParams : undefined as any);
  const activeProjData = projData || data;
  const hasProjFilters = !!(projInstitution || projProgram || projSpecialty || projRegion || projSector || projDegreeLevel);

  // Supply-only hooks
  const { data: supSkills } = useSuppliedSkills({ limit: 25 });
  const { data: futureProj } = useFutureProjection();
  const { data: skillsSummary } = useSkillMatchingSummary();
  // Map institution name to id for graph filter
  const taxonomyInstId = useMemo(() => {
    if (!taxonomyInst) return undefined;
    const inst = (data?.institution_ranking ?? []).find((i: any) => i.institution === taxonomyInst);
    return inst?.institution_id;
  }, [taxonomyInst, data]);
  const { data: supplyChainGraph } = useSupplyChainGraph({
    region: regionFilter,
    limit: taxonomyLimit,
    institution_id: taxonomyInstId,
  });

  if (!data) return null;
  const k = data.kpis;
  const enrollTrend = (hasProjFilters ? activeProjData : data)?.enrollment_trend ?? [];
  const gradTrend = (hasProjFilters ? activeProjData : data)?.graduate_trend ?? [];

  const trendCombined = enrollTrend.map((d: any) => ({
    year: d.year, actual: d.is_estimated ? null : d.enrollment, estimated: d.is_estimated ? d.enrollment : null,
  }));

  const sectorMap: Record<number, any> = {};
  (data.sector_trend ?? []).forEach((d: any) => {
    if (!sectorMap[d.year]) sectorMap[d.year] = { year: d.year };
    sectorMap[d.year][d.sector] = d.enrollment;
  });
  const sectorTrend = Object.values(sectorMap).sort((a: any, b: any) => a.year - b.year);

  const gM = data.by_gender?.M ?? 0; const gF = data.by_gender?.F ?? 0; const gT = gM + gF;
  const nCit = data.by_nationality?.citizen ?? 0; const nExp = data.by_nationality?.expat ?? 0; const nT = nCit + nExp;
  const ggM = data.grad_gender?.M ?? 0; const ggF = data.grad_gender?.F ?? 0; const ggT = ggM + ggF;
  const gnCit = data.grad_nationality?.citizen ?? 0; const gnExp = data.grad_nationality?.expat ?? 0;

  const futureData = futureProj?.projections ?? futureProj?.data ?? futureProj ?? [];
  const futureMethodology = futureProj?.methodology ?? null;

  // Compute self-projection from historical enrollment/graduate data
  // Uses linear extrapolation × growth rate × market signal adjustment
  const projectedSeries = useMemo(() => {
    const historical = projMetric === 'enrollment'
      ? enrollTrend.filter((d: any) => d.enrollment > 0).map((d: any) => ({ year: d.year, value: d.enrollment }))
      : gradTrend.filter((d: any) => d.graduates > 0).map((d: any) => ({ year: d.year, value: d.graduates }));

    if (historical.length < 2) return [];

    // Linear regression on last 5 years
    const recent = historical.slice(-5);
    const n = recent.length;
    const sumX = recent.reduce((s: number, d: any) => s + d.year, 0);
    const sumY = recent.reduce((s: number, d: any) => s + d.value, 0);
    const sumXY = recent.reduce((s: number, d: any) => s + d.year * d.value, 0);
    const sumX2 = recent.reduce((s: number, d: any) => s + d.year * d.year, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const lastYear = historical[historical.length - 1].year;
    const lastValue = historical[historical.length - 1].value;
    const baselineGrowth = projGrowthRate / 100;
    const marketAdjust = 1 + (projMarketSignal / 100);

    const result: any[] = historical.map((d: any) => ({
      year: d.year,
      historical: d.value,
      projected: null,
      adjusted: null,
    }));

    for (let i = 1; i <= projHorizon; i++) {
      const yr = lastYear + i;
      const linearProj = Math.max(0, intercept + slope * yr);
      const compoundProj = lastValue * Math.pow(1 + baselineGrowth, i);
      const blended = (linearProj + compoundProj) / 2;
      const withMarket = blended * Math.pow(marketAdjust, i / projHorizon);
      result.push({
        year: yr,
        historical: null,
        projected: Math.round(blended),
        adjusted: Math.round(withMarket),
        upper: Math.round(blended * 1.15),
        lower: Math.round(blended * 0.85),
      });
    }
    return result;
  }, [enrollTrend, gradTrend, projMetric, projHorizon, projGrowthRate, projMarketSignal]);

  // ── External Research Agent: auto-fetch when projection-local filters change ──
  useEffect(() => {
    const debounceTimer = setTimeout(async () => {
      setExtResearchLoading(true);
      setExtResearchError(null);
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/external-research/projection-signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            metric: projMetric,
            region: projRegion || undefined,
            sector: projSector || undefined,
            specialty: projSpecialty || undefined,
            institution: projInstitution || undefined,
            program: projProgram || undefined,
            horizon_years: projHorizon,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setExtResearch(data);
        if (extResearchAuto && typeof data.market_signal_pct === 'number') {
          setProjMarketSignal(data.market_signal_pct);
        }
      } catch (err: any) {
        setExtResearchError(err.message || 'Research failed');
      } finally {
        setExtResearchLoading(false);
      }
    }, 1500);
    return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projMetric, projHorizon, projRegion, projSector, projSpecialty, projInstitution, projProgram]);

  const projInsight = useMemo(() => {
    if (projectedSeries.length === 0) return null;
    const last = projectedSeries[projectedSeries.length - 1];
    const baseline = projectedSeries.find((d: any) => d.historical != null);
    if (!last.adjusted || !baseline) return null;
    const baseValue = baseline.historical;
    const finalValue = last.adjusted;
    const totalGrowth = ((finalValue - baseValue) / baseValue) * 100;
    return { baseValue, finalValue, totalGrowth, year: last.year };
  }, [projectedSeries]);

  const regionOptions = filterOptions?.emirates ?? [];
  const yearOptions = filterOptions?.years ?? [];
  const specialtyOptions = filterOptions?.specializations ?? [];
  const degreeLevelOptions = filterOptions?.degree_levels ?? [];
  const sectorOptions = filterOptions?.sectors ?? [];

  return (<>
    {/* ── FILTER BAR ────────────────────────────────────────────── */}
    <div className="flex flex-wrap items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-3 shadow-sm">
      <Filter className="w-4 h-4 text-gray-400" />
      <div className="flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5 text-gray-400" />
        <select value={regionFilter ?? ''} onChange={e => setRegionFilter(e.target.value || undefined)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 focus:border-[#007DB5] outline-none">
          <option value="">{t('جميع الإمارات', 'All Emirates')}</option>
          {Array.isArray(regionOptions) && regionOptions.map((r: any) => <option key={r.value ?? r} value={r.value ?? r}>{r.label ?? r}</option>)}
        </select>
      </div>
      <div className="w-px h-5 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <Calendar className="w-3.5 h-3.5 text-gray-400" />
        <select value={props.yearFrom ?? ''} onChange={e => props.setYearFrom(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 outline-none">
          <option value="">{t('من سنة', 'From')}</option>
          {yearOptions.map((y: number) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-[10px] text-gray-400">–</span>
        <select value={props.yearTo ?? ''} onChange={e => props.setYearTo(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 outline-none">
          <option value="">{t('إلى سنة', 'To')}</option>
          {yearOptions.map((y: number) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="w-px h-5 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-gray-400" />
        <select value={props.sectorFilter ?? ''} onChange={e => props.setSectorFilter(e.target.value || undefined)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 outline-none">
          <option value="">{t('جميع القطاعات', 'All Sectors')}</option>
          {sectorOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="w-px h-5 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <GraduationCap className="w-3.5 h-3.5 text-gray-400" />
        <select value={props.specialtyFilter ?? ''} onChange={e => props.setSpecialtyFilter(e.target.value || undefined)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 outline-none max-w-[160px]">
          <option value="">{t('جميع التخصصات', 'All Specialties')}</option>
          {specialtyOptions.map((s: string) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="w-px h-5 bg-gray-200" />
      <div className="flex items-center gap-1.5">
        <BookOpen className="w-3.5 h-3.5 text-gray-400" />
        <select value={props.degreeLevelFilter ?? ''} onChange={e => props.setDegreeLevelFilter(e.target.value || undefined)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 outline-none">
          <option value="">{t('جميع المستويات', 'All Degrees')}</option>
          {degreeLevelOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      {props.hasFilters && (<><div className="w-px h-5 bg-gray-200" /><button onClick={props.clearFilters} className="text-xs text-[#007DB5] hover:text-[#003366] font-medium">✕ {t('مسح', 'Clear all')}</button></>)}
    </div>

    {/* ── 1. HERO KPIs (Supply-only) ────────────────────────────── */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <HeroKPI icon={Building2} label={t('المؤسسات', 'Total Institutions')} value={fmt(k?.total_institutions ?? 0)} gradient={HERO_GRADIENTS[0]} delay={0} sub="CAA Registry" />
      <HeroKPI icon={BookOpen} label={t('البرامج المعتمدة', 'Accredited Programs')} value={fmt(k?.total_programs ?? 0)} gradient={HERO_GRADIENTS[1]} delay={0.05} sub="CAA (95 institutions)" />
      <HeroKPI icon={Users} label={t('إجمالي المسجلين', 'Total Enrolled')} value={fmt(k?.total_enrolled ?? 0)} gradient={HERO_GRADIENTS[2]} delay={0.1} sub="Bayanat / CEIC" />
      <HeroKPI icon={GraduationCap} label={t('إجمالي الخريجين', 'Total Graduates')} value={fmt(k?.total_graduates ?? 0)} gradient={HERO_GRADIENTS[3]} delay={0.15} sub="Bayanat / UAEU" />
    </div>

    {/* Row 2: Secondary KPIs */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard icon={Layers} label={t('المهارات المرصودة', 'ESCO Skills Mapped')} value={fmt(skillsSummary?.total_skills ?? 0)} status="info" delay={0.2} sourceLabel="ESCO Taxonomy" />
      <KPICard icon={Target} label={t('المهارات المتطابقة', 'Skills Matched')} value={fmt(skillsSummary?.matched_skills ?? 0)} status="success" delay={0.25} sourceLabel="Course↔Skill matching" />
      <KPICard icon={FlaskConical} label={t('نسبة STEM', 'STEM Ratio')} value={(() => {
        const stem = data.stem_split?.find((s: any) => s.indicator === 'STEM')?.count ?? 0;
        const total = (data.stem_split ?? []).reduce((s: number, d: any) => s + d.count, 0);
        return total > 0 ? `${Math.round(stem/total*100)}%` : '—';
      })()} status="info" delay={0.3} sourceLabel="Graduate classification" />
      <KPICard icon={Award} label={t('معدل التوظيف', 'Avg Employment Rate')} value={(() => {
        const emp = data.graduate_employment ?? [];
        if (emp.length === 0) return '—';
        const avg = emp.reduce((s: number, d: any) => s + d.avg_rate, 0) / emp.length;
        return `${avg.toFixed(0)}%`;
      })()} status="success" delay={0.35} sourceLabel="Graduate outcomes" />
    </div>

    {/* ── 2. EDUCATION ENROLLMENT ───────────────────────────────── */}
    <SectionHeader icon={School} title={t('خط إنتاج التعليم: التسجيل', 'Education Pipeline: Enrollment')}
      subtitle={t('اتجاهات التسجيل والتوزيع الجغرافي والتخصصات والمؤسسات', 'Enrollment trends, geographic distribution, specializations, and institutions')}
      collapsed={collapsed.enrollment} onToggle={() => toggle('enrollment')} />

    <AnimatePresence>{!collapsed.enrollment && (
      <motion.div key="enrollment" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
        <DataStory title={t('اتجاهات التسجيل', 'Enrollment Trends')} quality="official+estimated"
          method="Enrollment data aggregated from Bayanat HE enrollment CSVs by year. Government and private sector data from emirate-level datasets. Some data points estimated via linear interpolation."
          tables={[{ name: 'fact_program_enrollment', label: 'Program Enrollment' }]}
          caveats="Estimated data points (dashed gold line) are interpolated from surrounding actuals.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard>
            <ChartToolbar title={t('اتجاه التسجيل السنوي', 'Annual Enrollment Trend')} data={enrollTrend}>
              <div className="flex items-center gap-3 mb-1">
                <span className="flex items-center gap-1.5 text-[10px] text-text-muted"><span className="w-5 h-0.5 bg-navy rounded" />{t('فعلي', 'Actual')}</span>
                <span className="flex items-center gap-1.5 text-[10px] text-text-muted"><span className="w-5 h-0.5 border-b-2 border-dashed border-amber-500" />{t('مقدر', 'Estimated')}</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendCombined}>
                  <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="year" tick={AXIS_TICK_SM} /><YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} /><Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="actual" stroke={COLORS.navy} fill={COLORS.navy} fillOpacity={0.1} strokeWidth={2.5} connectNulls={false} dot={{ r: 4 }} />
                  <Area type="monotone" dataKey="estimated" stroke="#D97706" fill="#D97706" fillOpacity={0.05} strokeWidth={2} strokeDasharray="6 4" connectNulls={false} dot={{ r: 3, strokeDasharray: '' }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
          {sectorTrend.length > 0 && (
            <GlassCard>
              <ChartToolbar title={t('حكومي مقابل خاص', 'Government vs Private')} data={sectorTrend}>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={sectorTrend}>
                    <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="year" tick={AXIS_TICK_SM} /><YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} /><Tooltip content={<ChartTooltip />} /><Legend />
                    <Area type="monotone" dataKey="government" stackId="1" stroke={COLORS.teal} fill={COLORS.teal} fillOpacity={0.3} name={t('حكومي', 'Government')} />
                    <Area type="monotone" dataKey="private" stackId="1" stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={0.3} name={t('خاص', 'Private')} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartToolbar>
            </GlassCard>
          )}
        </div>

        {/* Emirate bar + Specialty + Demographics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard>
            <ChartToolbar title={t('التسجيل حسب الإمارة', 'Enrollment by Emirate')} data={data.by_emirate ?? []}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.by_emirate ?? []} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={fmt} />
                  <YAxis type="category" dataKey="emirate" tick={AXIS_TICK_SM} width={85} /><Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="enrollment" fill={COLORS.teal} radius={BAR_RADIUS_H} />
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
          <GlassCard>
            <ChartToolbar title={t('حسب التخصص', 'Top Specializations')} data={(data.by_specialty ?? []).slice(0, 10)}>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={(data.by_specialty ?? []).slice(0, 10)} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={fmt} />
                  <YAxis type="category" dataKey="specialization" tick={{ ...AXIS_TICK_SM, width: 100 }} width={100} /><Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="enrollment" fill={COLORS.gold} radius={BAR_RADIUS_H} />
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
          <GlassCard>
            <h3 className="text-sm font-semibold text-primary mb-3">{t('التركيبة السكانية', 'Demographics')}</h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">{t('الجنس', 'Gender')}</p>
                <StatRow label={t('إناث', 'Female')} value={fmt(gF)} color={COLORS.coral} pct={gT > 0 ? gF/gT*100 : 0} />
                <StatRow label={t('ذكور', 'Male')} value={fmt(gM)} color={COLORS.navy} pct={gT > 0 ? gM/gT*100 : 0} />
                <div className="w-full h-2.5 rounded-full bg-gray-100 mt-1 overflow-hidden flex">
                  <div className="h-full" style={{ width: `${gT > 0 ? gF/gT*100 : 50}%`, backgroundColor: COLORS.coral }} />
                  <div className="h-full" style={{ width: `${gT > 0 ? gM/gT*100 : 50}%`, backgroundColor: COLORS.navy }} />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">{t('الجنسية', 'Nationality')}</p>
                <StatRow label={t('مواطنين', 'Citizens')} value={fmt(nCit)} color={COLORS.emerald} pct={nT > 0 ? nCit/nT*100 : 0} />
                <StatRow label={t('وافدين', 'Expats')} value={fmt(nExp)} color={COLORS.copper} pct={nT > 0 ? nExp/nT*100 : 0} />
                <div className="w-full h-2.5 rounded-full bg-gray-100 mt-1 overflow-hidden flex">
                  <div className="h-full" style={{ width: `${nT > 0 ? nCit/nT*100 : 50}%`, backgroundColor: COLORS.emerald }} />
                  <div className="h-full" style={{ width: `${nT > 0 ? nExp/nT*100 : 50}%`, backgroundColor: COLORS.copper }} />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">{t('القطاع', 'Sector')}</p>
                <StatRow label={t('حكومي', 'Government')} value={fmt(data.by_gender?.gov ?? 0)} color={COLORS.teal} />
                <StatRow label={t('خاص', 'Private')} value={fmt(data.by_gender?.priv ?? 0)} color={COLORS.gold} />
              </div>
            </div>
          </GlassCard>
        </div>

        </DataStory>

        <InsightPanel
          explanation={t('يوضح خط إنتاج التعليم: الاتجاه الزمني والتوزيع الجغرافي والتخصصات والتركيبة السكانية.', 'Education pipeline: time trend, geographic distribution, specializations, and demographics.')}
          insight={k?.total_enrolled ? t(`${fmt(k.total_enrolled)} طالب مسجل في ${fmt(k.total_institutions)} مؤسسة. ${gT > 0 ? `${(gF/gT*100).toFixed(0)}% إناث` : ''}.`, `${fmt(k.total_enrolled)} students enrolled across ${fmt(k.total_institutions)} institutions. ${gT > 0 ? `${(gF/gT*100).toFixed(0)}% female` : ''}.`) : undefined}
          recommendation={t('تابع التسجيل حسب التخصص لتحديد المجالات ذات الطلب المتزايد أو المتناقص.', 'Track enrollment by specialty to identify fields with growing or shrinking demand.')}
          severity="info" source="Bayanat / CEIC / MOHESR" />
      </motion.div>
    )}</AnimatePresence>

    {/* ── 3. GRADUATE OUTPUT ────────────────────────────────────── */}
    <SectionHeader icon={GraduationCap} title={t('مخرجات الخريجين', 'Graduate Output')}
      subtitle={t('التخرج والتوظيف والتخصصات والجنس والجنسية', 'Graduation, employment, specializations, gender & nationality')}
      collapsed={collapsed.graduates} onToggle={() => toggle('graduates')} />

    <AnimatePresence>{!collapsed.graduates && (
      <motion.div key="graduates" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
        <DataStory title={t('بيانات الخريجين', 'Graduate Data')} quality="official+estimated"
          method="Graduate counts from Bayanat government/private graduate statistics and UAEU detailed data (2018-2024). Includes specialty, gender, nationality, STEM classification, and employment rates where available."
          tables={[{ name: 'fact_graduate_outcomes', label: 'Graduate Outcomes' }]}
          caveats="Employment rate data only available for institutions that report it. UAEU has the most detailed data.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard>
            <ChartToolbar title={t('اتجاه التخرج', 'Graduate Output Trend')} data={gradTrend}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={gradTrend}><CartesianGrid {...GRID_PROPS} /><XAxis dataKey="year" tick={AXIS_TICK_SM} /><YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} /><Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="graduates" stroke={COLORS.emerald} fill={COLORS.emerald} fillOpacity={0.15} strokeWidth={2} dot={{ r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
          <GlassCard>
            <ChartToolbar title={t('الخريجين حسب التخصص', 'Graduates by Specialty')} data={(data.grad_by_specialty ?? []).slice(0, 10)}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={(data.grad_by_specialty ?? []).slice(0, 10)} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={fmt} />
                  <YAxis type="category" dataKey="specialization" tick={{ ...AXIS_TICK_SM, width: 110 }} width={110} /><Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="graduates" fill={COLORS.emerald} radius={BAR_RADIUS_H} />
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
        </div>

        {/* Employment rates */}
        {(data.graduate_employment?.length ?? 0) > 0 && (
          <GlassCard>
            <ChartToolbar title={t('معدلات توظيف الخريجين', 'Graduate Employment Rates')} data={data.graduate_employment}>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={data.graduate_employment}>
                  <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="year" tick={AXIS_TICK_SM} />
                  <YAxis yAxisId="rate" tick={AXIS_TICK_SM} domain={[0, 100]} unit="%" />
                  <YAxis yAxisId="count" orientation="right" tick={AXIS_TICK_SM} tickFormatter={fmt} />
                  <Tooltip content={<ChartTooltip />} /><Legend />
                  <Bar yAxisId="count" dataKey="graduates_with_rate" fill={COLORS.navy} fillOpacity={0.2} radius={BAR_RADIUS} name={t('خريجين', 'Graduates')} />
                  <Line yAxisId="rate" type="monotone" dataKey="avg_rate" stroke={COLORS.emerald} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.emerald }} name={t('معدل التوظيف %', 'Employment Rate %')} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
        )}

        {/* 3-col pies */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-primary mb-2">{t('جنس الخريجين', 'Graduate Gender')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart><Pie data={[{ name: t('إناث', 'Female'), value: ggF }, { name: t('ذكور', 'Male'), value: ggM }]} cx="50%" cy="50%" outerRadius={90} innerRadius={45} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent*100).toFixed(0)}%`}>
                <Cell fill={COLORS.coral} /><Cell fill={COLORS.navy} /></Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
          </GlassCard>
          <GlassCard>
            <h3 className="text-sm font-semibold text-primary mb-2">{t('جنسية الخريجين', 'Graduate Nationality')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart><Pie data={[{ name: t('مواطنين', 'Citizens'), value: gnCit }, { name: t('وافدين', 'Expats'), value: gnExp }]} cx="50%" cy="50%" outerRadius={90} innerRadius={45} dataKey="value" label={({ name, percent }: any) => `${name} ${(percent*100).toFixed(0)}%`}>
                <Cell fill={COLORS.emerald} /><Cell fill={COLORS.copper} /></Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
          </GlassCard>
          <GlassCard>
            <h3 className="text-sm font-semibold text-primary mb-2">{t('STEM مقابل غير STEM', 'STEM vs Non-STEM')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart><Pie data={data.stem_split ?? []} cx="50%" cy="50%" outerRadius={90} innerRadius={45} dataKey="count" nameKey="indicator" label={({ indicator, percent }: any) => `${indicator} ${(percent*100).toFixed(0)}%`}>
                {(data.stem_split ?? []).map((_: any, i: number) => <Cell key={i} fill={i === 0 ? COLORS.navy : COLORS.gold} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
          </GlassCard>
        </div>

        {/* Degree level + UAEU */}
        {(data.grad_degree?.length ?? 0) > 0 && (
          <GlassCard>
            <ChartToolbar title={t('الخريجين حسب المستوى', 'Graduates by Degree Level')} data={data.grad_degree}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.grad_degree} layout="vertical"><CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={fmt} /><YAxis type="category" dataKey="degree_level" tick={{ ...AXIS_TICK_SM, width: 110 }} width={110} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="graduates" fill={COLORS.teal} radius={BAR_RADIUS_H} /></BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart><Pie data={data.grad_degree} cx="50%" cy="50%" outerRadius={95} innerRadius={45} dataKey="graduates" nameKey="degree_level" label={({ degree_level, percent }: any) => `${degree_level} ${(percent*100).toFixed(0)}%`}>{data.grad_degree.map((_: any, i: number) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart>
                </ResponsiveContainer>
              </div>
            </ChartToolbar>
          </GlassCard>
        )}

        {(data.uaeu_colleges?.length ?? 0) > 0 && (
          <GlassCard>
            <ChartToolbar title={t('خريجو جامعة الإمارات', 'UAEU Graduates by College')} data={data.uaeu_colleges}>
              <ResponsiveContainer width="100%" height={300}><BarChart data={data.uaeu_colleges}><CartesianGrid {...GRID_PROPS} /><XAxis dataKey="college" tick={AXIS_TICK_SM} angle={-20} textAnchor="end" height={70} /><YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="graduates" fill={COLORS.navy} radius={BAR_RADIUS} /></BarChart></ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
        )}

        </DataStory>

        <InsightPanel
          explanation={t('بيانات الخريجين الشاملة: الاتجاه الزمني والتخصصات والجنس والجنسية ونسبة STEM ومعدلات التوظيف.', 'Comprehensive graduate data: trend, specializations, gender, nationality, STEM ratio, and employment rates.')}
          insight={ggT > 0 ? t(`${(ggF/ggT*100).toFixed(0)}% من الخريجين إناث مما يعكس تفوق المرأة في التعليم العالي الإماراتي. نسبة المواطنين ${gnCit > 0 ? (gnCit/(gnCit+gnExp)*100).toFixed(0) : 0}%.`, `${(ggF/ggT*100).toFixed(0)}% of graduates are female. Emiratis represent ${gnCit > 0 ? (gnCit/(gnCit+gnExp)*100).toFixed(0) : 0}% of graduates.`) : undefined}
          recommendation={t('تابع معدلات التوظيف حسب التخصص لتحديد البرامج ذات النتائج المهنية الأفضل.', 'Track employment rates by specialty to identify programs with best career outcomes.')}
          severity="info" source="Bayanat / UAEU" />
      </motion.div>
    )}</AnimatePresence>

    {/* ── 4. ACADEMIC PROGRAMS (with Treemap) ───────────────────── */}
    <SectionHeader icon={BookOpen} title={t('البرامج الأكاديمية', 'Academic Programs')}
      subtitle={t('البرامج المعتمدة حسب المجال والإمارة والمستوى', 'Accredited programs by field, emirate, and degree level')}
      collapsed={collapsed.programs} onToggle={() => toggle('programs')} />

    <AnimatePresence>{!collapsed.programs && (
      <motion.div key="programs" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
        <DataStory title={t('البرامج الأكاديمية', 'Academic Programs')} quality="official+scraped"
          method="Programs scraped from CAA accreditation registry (95 institutions). Classified by field of study, emirate, and degree level. 2,480 accredited programs catalogued."
          tables={[{ name: 'dim_program', label: 'Programs Registry' }, { name: 'dim_institution', label: 'Institutions' }]}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard>
            <ChartToolbar title={t('البرامج حسب المجال', 'Programs by Field')} data={(data.programs_by_field ?? []).slice(0, 12)}>
              <ResponsiveContainer width="100%" height={380}>
                <Treemap data={(data.programs_by_field ?? []).slice(0, 15).map((d: any) => ({ name: d.field, count: d.count }))} dataKey="count" aspectRatio={4/3} content={<TreemapContent />}>
                  <Tooltip content={<ChartTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
          <div className="space-y-6">
            <GlassCard>
              <ChartToolbar title={t('حسب الإمارة', 'Programs by Emirate')} data={(data.programs_by_emirate ?? []).slice(0, 7)}>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={(data.programs_by_emirate ?? []).slice(0, 7)} layout="vertical"><CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} /><YAxis type="category" dataKey="emirate" tick={AXIS_TICK_SM} width={85} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="count" fill={COLORS.teal} radius={BAR_RADIUS_H} /></BarChart>
                </ResponsiveContainer>
              </ChartToolbar>
            </GlassCard>
            <GlassCard>
              <h3 className="text-sm font-semibold text-primary mb-2">{t('حسب المستوى', 'By Degree Level')}</h3>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart><Pie data={(data.program_distribution ?? []).slice(0, 7)} cx="50%" cy="50%" outerRadius={65} innerRadius={30} dataKey="count" nameKey="degree_level" label={({ degree_level, percent }: any) => `${degree_level} ${(percent*100).toFixed(0)}%`}>{(data.program_distribution ?? []).slice(0, 7).map((_: any, i: number) => <Cell key={i} fill={PIE[i]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart>
              </ResponsiveContainer>
            </GlassCard>
          </div>
        </div>
        </DataStory>
      </motion.div>
    )}</AnimatePresence>

    {/* ── 5. SKILLS & COMPETENCIES ──────────────────────────────── */}
    <SectionHeader icon={FlaskConical} title={t('المهارات والكفاءات', 'Skills & Competencies')}
      subtitle={t('المهارات المطلوبة والمنتجة من التعليم والفجوات', 'Skills demanded, produced by education, and gaps')}
      collapsed={collapsed.skills} onToggle={() => toggle('skills')} />

    <AnimatePresence>{!collapsed.skills && (
      <motion.div key="skills" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
        <DataStory title={t('المهارات والكفاءات', 'Skills & Competencies')} quality="official"
          method="Skills from ESCO taxonomy (28K skills) mapped to occupations via fact_occupation_skills. Course-to-skill mapping via fact_course_skills (10.8K mappings from 6,177 CAA courses matched against ESCO labels with ≥30% token overlap)."
          tables={[{ name: 'dim_skill', label: 'ESCO Skills' }, { name: 'fact_occupation_skills', label: 'Occupation-Skill Links' }, { name: 'fact_course_skills', label: 'Course-Skill Maps' }]}>
        {data.skills_kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t('إجمالي المهارات', 'Total Skills'), value: data.skills_kpis.total_skills, color: COLORS.navy, bg: 'bg-blue-50' },
              { label: t('إجمالي الروابط', 'Total Mappings'), value: data.skills_kpis.total_mappings, color: COLORS.teal, bg: 'bg-teal-50' },
              { label: t('روابط أساسية', 'Essential Mappings'), value: data.skills_kpis.essential_mappings, color: COLORS.emerald, bg: 'bg-emerald-50' },
              { label: t('نسبة التطابق', 'Match Rate'), value: skillsSummary?.match_rate ? `${(skillsSummary.match_rate*100).toFixed(0)}%` : `${skillsSummary?.match_pct ?? 0}%`, color: COLORS.gold, bg: 'bg-amber-50' },
            ].map((s, i) => (
              <div key={i} className={`rounded-2xl border border-gray-100 shadow-sm p-4 text-center ${s.bg}`}>
                <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">{s.label}</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: s.color }}>{typeof s.value === 'number' ? fmt(s.value) : s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard>
            <ChartToolbar title={t('أكثر المهارات طلبا (أساسي)', 'Top In-Demand Skills (Essential)')} data={(data.top_skills ?? []).slice(0, 12)}>
              <ResponsiveContainer width="100%" height={360}><BarChart data={(data.top_skills ?? []).slice(0, 12)} layout="vertical"><CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} /><YAxis type="category" dataKey="skill" tick={{ ...AXIS_TICK_SM, width: 160 }} width={160} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="occupations" fill={COLORS.navy} radius={BAR_RADIUS_H} /></BarChart></ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
          <GlassCard>
            <ChartToolbar title={t('المهارات الرقمية', 'Digital & Tech Skills')} data={(data.digital_skills ?? []).slice(0, 10)}>
              <ResponsiveContainer width="100%" height={360}><BarChart data={(data.digital_skills ?? []).slice(0, 10)} layout="vertical"><CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} /><YAxis type="category" dataKey="skill" tick={{ ...AXIS_TICK_SM, width: 150 }} width={150} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="occupations" fill={COLORS.teal} radius={BAR_RADIUS_H} /></BarChart></ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
        </div>

        {/* Skills from Courses */}
        {(supSkills?.skills?.length ?? 0) > 0 && (
          <GlassCard>
            <ChartToolbar title={t('المهارات المنتجة من التعليم', 'Skills Produced by Education (Course→Skill mapping)')} data={supSkills?.skills ?? []}>
              <ResponsiveContainer width="100%" height={Math.max(380, (supSkills?.skills?.length ?? 10) * 22)}>
                <BarChart data={[...(supSkills?.skills ?? [])].sort((a: any, b: any) => b.course_count - a.course_count)} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} />
                  <YAxis type="category" dataKey="skill" tick={{ ...AXIS_TICK_SM, width: 180 }} width={180} /><Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="course_count" fill={COLORS.teal} radius={BAR_RADIUS_H} name={t('عدد المقررات', 'Course Count')} />
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
        )}

        <InsightPanel
          explanation={t('المهارات مرتبطة من مقررات CAA المعتمدة إلى تصنيف ESCO عبر مطابقة آلية. هذا يكشف الفجوات بين ما يُدرَّس وما يُطلب.', 'Skills are mapped from CAA-accredited courses to ESCO taxonomy via automated matching. This reveals gaps between what is taught and what is demanded.')}
          insight={supSkills?.skills ? t(`${formatCompact(supSkills.skills.length)} مهارة فريدة تُدرَّس عبر ${formatCompact(supSkills.skills.reduce((s: number, r: any) => s + (r?.course_count ?? 0), 0))} مقرر. المهارات الرقمية تمثل جزءاً متزايداً.`, `${formatCompact(supSkills.skills.length)} unique skills taught across ${formatCompact(supSkills.skills.reduce((s: number, r: any) => s + (r?.course_count ?? 0), 0))} courses. Digital skills represent a growing share.`) : undefined}
          recommendation={t('قارن المهارات المنتجة مع المطلوبة في سوق العمل لتحديد فجوات المناهج وتوجيه إصلاح البرامج.', 'Compare skills produced vs demanded in the job market to identify curriculum gaps and guide program reform.')}
          severity="info" source="CAA + ESCO" />
        </DataStory>
      </motion.div>
    )}</AnimatePresence>

    {/* ── 6. INSTITUTION MAP & DEEP DIVE ────────────────────────── */}
    <SectionHeader icon={Building2} title={t('خريطة المؤسسات', 'Institution Map & Deep Dive')}
      subtitle={t('التوزيع الجغرافي للمؤسسات والبرامج والخريجين', 'Geographic distribution of institutions, programs, and graduates')}
      collapsed={collapsed.institutions} onToggle={() => toggle('institutions')} />

    <AnimatePresence>{!collapsed.institutions && (
      <motion.div key="institutions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
        <DataStory title={t('بيانات المؤسسات', 'Institution Data')} quality="official+scraped"
          method="Institution data from CAA registry (125 licensed institutions) with geospatial coordinates. Programs from CAA accreditation scrape. Graduate data from Bayanat. Courses from CAA program outlines (6,177 courses)."
          tables={[{ name: 'dim_institution', label: 'Institutions' }, { name: 'dim_program', label: 'Programs' }, { name: 'dim_course', label: 'Courses' }]}>
        {/* Interactive Map */}
        <GlassCard>
          <h3 className="text-sm font-semibold text-primary mb-1">{t('خريطة المؤسسات التعليمية', 'UAE Higher Education Institution Map')}</h3>
          <p className="text-[10px] text-gray-500 mb-3">{t('حجم الدائرة يعكس عدد البرامج. انقر لعرض التفاصيل.', 'Circle size reflects program count. Click for details.')}</p>
          <InstitutionMap institutions={data.institution_ranking ?? []} />
        </GlassCard>

        {/* Institution ranking table */}
        <InstitutionDeepDive data={data} goToExplorer={goToExplorer} />

        {/* Institutions by Programs & Courses */}
        {(data.enrollment_by_institution?.length ?? 0) > 0 && (
          <GlassCard>
            <ChartToolbar title={t('المؤسسات حسب عدد البرامج والمقررات', 'Institutions by Programs & Courses')} data={data.enrollment_by_institution}>
              <ResponsiveContainer width="100%" height={Math.max(350, (data.enrollment_by_institution?.length ?? 0) * 26)}>
                <BarChart data={(data.enrollment_by_institution ?? []).slice(0, 15)} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} />
                  <YAxis type="category" dataKey="institution" tick={{ ...AXIS_TICK_SM, width: 160 }} width={160} /><Tooltip content={<ChartTooltip />} /><Legend />
                  <Bar dataKey="programs" fill={COLORS.navy} radius={BAR_RADIUS_H} name={t('البرامج المعتمدة', 'Accredited Programs')} />
                  <Bar dataKey="courses" fill={COLORS.teal} radius={BAR_RADIUS_H} name={t('المقررات', 'Courses')} />
                </BarChart>
              </ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
        )}
        </DataStory>
      </motion.div>
    )}</AnimatePresence>

    {/* ── 7. PROGRAM → COURSE → SKILL TAXONOMY ─────────────────── */}
    <SectionHeader icon={Layers} title={t('تصنيف البرامج والمقررات والمهارات', 'Program → Course → Skill Taxonomy')}
      subtitle={t('استكشاف البرامج والمقررات والمهارات المُدرَّسة', 'Explore programs, courses, and skills taught')}
      collapsed={collapsed.taxonomy} onToggle={() => toggle('taxonomy')} />

    <AnimatePresence>{!collapsed.taxonomy && (
      <motion.div key="taxonomy" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
        <DataStory title={t('سلسلة إمداد التعليم', 'Education Supply Chain')} quality="official+scraped"
          method="Knowledge graph built from Institution → Course → Skill relationships. Courses from CAA program outlines mapped to ESCO skills via automated name matching. Skills classified by type (knowledge, skill/competence, technology)."
          tables={[{ name: 'dim_institution', label: 'Institutions' }, { name: 'dim_course', label: 'Courses' }, { name: 'fact_course_skills', label: 'Course-Skill Maps' }, { name: 'dim_skill', label: 'ESCO Skills' }]}>

        {/* Taxonomy Filters */}
        <GlassCard>
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">{t('تصفية الرسم البياني', 'Filter Graph')}:</span>

            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-gray-400" />
              <select value={taxonomyInst} onChange={e => setTaxonomyInst(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 outline-none max-w-[200px]">
                <option value="">{t('جميع المؤسسات', 'All Institutions')}</option>
                {(data.institution_ranking ?? []).map((inst: any, i: number) => (
                  <option key={i} value={inst.institution}>{inst.institution}</option>
                ))}
              </select>
            </div>

            <div className="w-px h-5 bg-gray-200" />

            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[10px] text-gray-500">{t('الإمارة من الفلتر العام', 'Emirate from global filter')}: </span>
              <span className="text-xs font-semibold text-navy">{regionFilter || t('الكل', 'All')}</span>
            </div>

            <div className="w-px h-5 bg-gray-200" />

            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-gray-400" />
              <label className="text-[10px] text-gray-500">{t('عدد المقررات', 'Course nodes')}: <span className="text-navy font-bold">{taxonomyLimit}</span></label>
              <input type="range" min={10} max={100} step={5} value={taxonomyLimit} onChange={e => setTaxonomyLimit(Number(e.target.value))}
                className="w-32 accent-navy" />
            </div>

            {(taxonomyInst || taxonomyLimit !== 30) && (
              <button onClick={() => { setTaxonomyInst(''); setTaxonomyLimit(30); }}
                className="text-xs text-[#007DB5] hover:text-[#003366] font-medium">✕ {t('إعادة تعيين', 'Reset')}</button>
            )}
          </div>
          <p className="mt-2 text-[10px] text-gray-500">
            {t('اختر مؤسسة لرؤية برامجها ومقرراتها ومهاراتها فقط. استخدم منزلق العقد لزيادة/تقليل التفاصيل.', 'Select an institution to see only its programs, courses, and skills. Use the node slider to adjust detail level.')}
          </p>
        </GlassCard>

        {/* Supply Chain Knowledge Graph */}
        {(supplyChainGraph?.nodes?.length ?? 0) > 0 && (
          <GlassCard>
            <ForceGraph
              title={t('سلسلة إمداد التعليم: مؤسسة → مقرر → مهارة', 'Education Supply Chain: Institution → Course → Skill')}
              nodes={supplyChainGraph!.nodes}
              edges={supplyChainGraph!.edges}
              height={550}
            />
          </GlassCard>
        )}

        {/* Skills by type pie + knowledge areas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-primary mb-3">{t('توزيع أنواع المهارات (ESCO)', 'Skills by Type (ESCO)')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart><Pie data={(data.skills_by_type ?? []).filter((d: any) => d.type)} cx="50%" cy="50%" outerRadius={110} innerRadius={55} dataKey="count" nameKey="type" label={({ type, percent }: any) => `${type} ${(percent*100).toFixed(0)}%`}>{(data.skills_by_type ?? []).filter((d: any) => d.type).map((_: any, i: number) => <Cell key={i} fill={PIE[i]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
          </GlassCard>
          <GlassCard>
            <ChartToolbar title={t('أهم مجالات المعرفة', 'Top Knowledge Areas')} data={(data.knowledge_areas ?? []).slice(0, 12)}>
              <ResponsiveContainer width="100%" height={300}><BarChart data={(data.knowledge_areas ?? []).slice(0, 12)} layout="vertical"><CartesianGrid {...GRID_PROPS} /><XAxis type="number" tick={AXIS_TICK_SM} /><YAxis type="category" dataKey="area" tick={{ ...AXIS_TICK_SM, width: 160 }} width={160} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="occupations" fill={COLORS.emerald} radius={BAR_RADIUS_H} /></BarChart></ResponsiveContainer>
            </ChartToolbar>
          </GlassCard>
        </div>

        <InsightPanel
          explanation={t('التصنيف يوضح كيف تتصل المؤسسات بالمقررات وكيف ترتبط المقررات بمهارات ESCO. هذا يكشف سلسلة الإمداد التعليمي الكاملة.', 'The taxonomy shows how institutions connect to courses and how courses map to ESCO skills. This reveals the full education supply chain.')}
          recommendation={t('استخدم هذا لتحديد المؤسسات الأكثر تنوعاً في المهارات والمقررات التي تغطي فجوات السوق.', 'Use this to identify institutions with the most diverse skill coverage and courses that fill market gaps.')}
          severity="info" source="CAA + ESCO + Course-Skill Mapping" />
        </DataStory>
      </motion.div>
    )}</AnimatePresence>

    {/* ── 8. FUTURE SUPPLY PROJECTION ──────────────────────────── */}
    <SectionHeader icon={TrendingUp} title={t('إسقاطات العرض المستقبلية', 'Future Supply Projection')}
      subtitle={t('نماذج إحصائية وتوقعات التسجيل والتخرج', 'Statistical models and enrollment/graduation forecasts')}
      collapsed={collapsed.future} onToggle={() => toggle('future')} />

    <AnimatePresence>{!collapsed.future && (
      <motion.div key="future" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-6 overflow-hidden">
        <DataStory title={t('إسقاطات مستقبلية', 'Future Projections')} quality="model-generated"
          method="Linear regression on last 5 years of historical data + compound growth. Adjusted by user-controlled growth rate and external market signal slider. Confidence bands ±15%."
          tables={[{ name: 'fact_program_enrollment', label: 'Program Enrollment' }, { name: 'fact_graduate_outcomes', label: 'Graduate Outcomes' }]}
          caveats="Projections are model-generated estimates, not official forecasts. Use the market signal slider to incorporate external knowledge (expert forecasts, technology trends, policy changes).">

        {/* ── Projection-Local Filter Bar — University, Program, Region, Specialty ── */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Search className="w-4 h-4" />
              {t('فلاتر الإسقاط المتقدمة', 'Projection Drill-Down Filters')}
            </h3>
            {hasProjFilters && (
              <button onClick={() => { setProjInstitution(''); setProjProgram(''); setProjSpecialty(''); setProjRegion(''); setProjSector(''); setProjDegreeLevel(''); }}
                className="text-[10px] text-red-500 hover:underline font-medium">
                {t('مسح الكل', 'Clear all')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('الجامعة', 'University')}</label>
              <select value={projInstitution} onChange={e => setProjInstitution(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none truncate">
                <option value="">{t('الكل', 'All Universities')}</option>
                {(filterOptions?.institutions ?? []).map((inst: string) => (
                  <option key={inst} value={inst}>{inst.length > 30 ? inst.slice(0, 28) + '..' : inst}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('التخصص', 'Program/Specialty')}</label>
              <select value={projSpecialty} onChange={e => setProjSpecialty(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
                <option value="">{t('الكل', 'All Specialties')}</option>
                {(filterOptions?.specializations ?? []).map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('الإمارة', 'Region')}</label>
              <select value={projRegion} onChange={e => setProjRegion(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
                <option value="">{t('الكل', 'All Emirates')}</option>
                {(filterOptions?.emirates ?? []).map((em: any) => (
                  <option key={em.value} value={em.value}>{em.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('القطاع', 'Sector')}</label>
              <select value={projSector} onChange={e => setProjSector(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
                <option value="">{t('الكل', 'All Sectors')}</option>
                {(filterOptions?.sectors ?? []).map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-semibold uppercase text-gray-500 mb-1 block">{t('المستوى', 'Degree Level')}</label>
              <select value={projDegreeLevel} onChange={e => setProjDegreeLevel(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-navy/20 outline-none">
                <option value="">{t('الكل', 'All Levels')}</option>
                {(filterOptions?.degree_levels ?? []).map((d: string) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="text-[10px] text-gray-500 p-1.5">
                {hasProjFilters ? (
                  <span className="text-navy font-semibold">{[projInstitution, projSpecialty, projRegion, projSector, projDegreeLevel].filter(Boolean).length} {t('فلتر نشط', 'active')}</span>
                ) : (
                  <span>{t('بدون فلاتر — إجمالي الإمارات', 'No filters — all UAE')}</span>
                )}
              </div>
            </div>
          </div>
          {hasProjFilters && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {projInstitution && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-navy/8 text-navy font-medium">{projInstitution.slice(0, 25)} <button onClick={() => setProjInstitution('')}><X className="w-2.5 h-2.5" /></button></span>}
              {projSpecialty && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-teal/8 text-teal font-medium">{projSpecialty} <button onClick={() => setProjSpecialty('')}><X className="w-2.5 h-2.5" /></button></span>}
              {projRegion && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-emerald/8 text-emerald-700 font-medium">{projRegion} <button onClick={() => setProjRegion('')}><X className="w-2.5 h-2.5" /></button></span>}
              {projSector && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-amber-100 text-amber-800 font-medium">{projSector} <button onClick={() => setProjSector('')}><X className="w-2.5 h-2.5" /></button></span>}
              {projDegreeLevel && <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] rounded-full bg-purple-100 text-purple-800 font-medium">{projDegreeLevel} <button onClick={() => setProjDegreeLevel('')}><X className="w-2.5 h-2.5" /></button></span>}
            </div>
          )}
        </GlassCard>

        {/* Projection Sliders & Controls */}
        <GlassCard>
          <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2"><Filter className="w-4 h-4" />{t('عوامل الإسقاط القابلة للتعديل', 'Projection Controls & External Factors')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t('المقياس', 'Metric')}</label>
              <select value={projMetric} onChange={e => setProjMetric(e.target.value as any)}
                className="mt-1 w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-[#007DB5]/30 outline-none">
                <option value="enrollment">{t('التسجيل', 'Enrollment')}</option>
                <option value="graduates">{t('الخريجين', 'Graduates')}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t('الأفق (سنوات)', 'Horizon (years)')}: <span className="text-navy font-bold">{projHorizon}</span></label>
              <input type="range" min={1} max={10} value={projHorizon} onChange={e => setProjHorizon(Number(e.target.value))}
                className="mt-1 w-full accent-navy" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t('معدل النمو', 'Baseline Growth Rate')}: <span className="text-navy font-bold">{projGrowthRate}%</span></label>
              <input type="range" min={-5} max={20} value={projGrowthRate} onChange={e => setProjGrowthRate(Number(e.target.value))}
                className="mt-1 w-full accent-navy" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{t('إشارة السوق الخارجية', 'External Market Signal')}: <span className={`font-bold ${projMarketSignal > 0 ? 'text-emerald-600' : projMarketSignal < 0 ? 'text-red-500' : 'text-gray-500'}`}>{projMarketSignal > 0 ? '+' : ''}{projMarketSignal}%</span></label>
              <input type="range" min={-50} max={50} value={projMarketSignal} onChange={e => setProjMarketSignal(Number(e.target.value))}
                className="mt-1 w-full accent-amber-500" />
            </div>
          </div>
          <div className="mt-3 text-[10px] text-gray-500 flex flex-wrap gap-3">
            <span><strong className="text-emerald-600">+</strong> {t('سوق متفائل (طلب مرتفع متوقع)', 'Bullish market (high expected demand)')}</span>
            <span><strong className="text-red-500">−</strong> {t('سوق متشائم (مخاطر AI، تشبع، إلخ)', 'Bearish (AI risk, saturation, etc.)')}</span>
            <span>{t('الفلاتر العامة (الإمارة، التخصص، السنة) تطبق على البيانات التاريخية', 'Global filters (emirate, specialty, year) apply to historical data')}</span>
          </div>
        </GlassCard>

        {/* Projection Chart */}
        <GlassCard>
          <ChartToolbar title={t('إسقاط العرض المستقبلي', `${projMetric === 'enrollment' ? 'Enrollment' : 'Graduates'} Projection (${projHorizon}-year horizon)`)} data={projectedSeries}>
            {projectedSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={projectedSeries}
                  onClick={(ev: any) => {
                    const yr = ev?.activePayload?.[0]?.payload?.year;
                    if (yr) setSelectedProjYear(selectedProjYear === yr ? null : yr);
                  }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="year" tick={{ ...AXIS_TICK_SM, cursor: 'pointer' }} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={fmt} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Area type="monotone" dataKey="upper" stroke="transparent" fill={COLORS.navy} fillOpacity={0.06} name={t('الحد الأعلى', 'Upper Bound')} />
                  <Area type="monotone" dataKey="lower" stroke="transparent" fill={COLORS.navy} fillOpacity={0.06} name={t('الحد الأدنى', 'Lower Bound')} />
                  <Line type="monotone" dataKey="historical" stroke={COLORS.navy} strokeWidth={2.5} dot={{ r: 4, fill: COLORS.navy }} name={t('فعلي', 'Historical')} connectNulls style={{ cursor: 'pointer' }} />
                  <Line type="monotone" dataKey="projected" stroke={COLORS.teal} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3 }} name={t('إسقاط أساسي', 'Baseline Projection')} style={{ cursor: 'pointer' }} />
                  <Line type="monotone" dataKey="adjusted" stroke={projMarketSignal >= 0 ? COLORS.emerald : '#E85D75'} strokeWidth={3} dot={{ r: 4 }} name={t('معدل بالسوق', 'Market-Adjusted')} style={{ cursor: 'pointer' }} />
                  {selectedProjYear && (
                    <ReferenceLine x={selectedProjYear} stroke="#003366" strokeDasharray="3 3" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[360px] flex items-center justify-center text-text-muted text-sm">{t('لا توجد بيانات تاريخية كافية للإسقاط', 'Not enough historical data for projection')}</div>
            )}
            <p className="text-[10px] text-text-muted text-center mt-1">
              {t('انقر على أي سنة لرؤية تفاصيل العرض', 'Click any year to see supply breakdown')}
            </p>

            {/* Year drill-down: shows breakdown by region/specialty for that year */}
            {selectedProjYear && (
              <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-navy/3 to-teal/3 border border-navy/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-navy" />
                    <h4 className="text-sm font-bold text-navy">
                      {t('تفاصيل العرض لعام', 'Supply Breakdown for')} {selectedProjYear}
                    </h4>
                    {selectedProjYear > new Date().getFullYear() && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{t('متوقع', 'PROJECTED')}</span>
                    )}
                  </div>
                  <button onClick={() => setSelectedProjYear(null)} className="text-text-muted hover:text-navy">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {(() => {
                  const yearData = projectedSeries.find((d: any) => d.year === selectedProjYear);
                  if (!yearData) return <p className="text-xs text-text-muted">{t('لا توجد بيانات لهذا العام', 'No data for this year')}</p>;
                  const isHistorical = yearData.historical != null;
                  const value = yearData.historical ?? yearData.adjusted ?? yearData.projected ?? 0;

                  // Get matching breakdown from data based on filters
                  const isFiltered = props.regionFilter || props.specialtyFilter || props.sectorFilter;
                  const breakdownLabel = props.regionFilter && props.specialtyFilter ? t('حسب البرنامج', 'By Program')
                    : props.regionFilter ? t('حسب التخصص', 'By Specialty')
                    : props.specialtyFilter ? t('حسب الإمارة', 'By Emirate')
                    : t('حسب الإمارة', 'By Emirate');

                  // Pull breakdown from supply data if available
                  const breakdown: any[] = isFiltered
                    ? (activeProjData?.top_specializations ?? activeProjData?.top_specialties ?? []).slice(0, 8)
                    : (activeProjData?.by_emirate ?? []).slice(0, 8);

                  return (
                    <div className="space-y-3">
                      {/* KPI Row */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg bg-white border border-navy/10 p-3 text-center">
                          <p className="text-[9px] uppercase font-semibold text-gray-500">{t('إجمالي العرض', 'Total Supply')}</p>
                          <p className="text-xl font-bold text-navy tabular-nums">{fmt(value)}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">{projMetric === 'enrollment' ? t('طالب', 'students') : t('خريج', 'graduates')}</p>
                        </div>
                        <div className="rounded-lg bg-white border border-navy/10 p-3 text-center">
                          <p className="text-[9px] uppercase font-semibold text-gray-500">{t('السنة', 'Year')}</p>
                          <p className="text-xl font-bold text-teal tabular-nums">{selectedProjYear}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">{isHistorical ? t('فعلي', 'actual') : t('توقع', 'projected')}</p>
                        </div>
                        <div className="rounded-lg bg-white border border-navy/10 p-3 text-center">
                          <p className="text-[9px] uppercase font-semibold text-gray-500">{t('الفلاتر النشطة', 'Active Filters')}</p>
                          <p className="text-sm font-bold text-emerald-600 mt-1">
                            {[props.regionFilter, props.specialtyFilter, props.sectorFilter].filter(Boolean).length || t('لا شيء', 'None')}
                          </p>
                          <p className="text-[9px] text-gray-500">
                            {props.regionFilter || ''} {props.specialtyFilter || ''}
                          </p>
                        </div>
                      </div>

                      {/* Breakdown table */}
                      {breakdown.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">{breakdownLabel}</p>
                          <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="text-left px-3 py-2 font-semibold text-gray-600">{props.regionFilter ? t('التخصص', 'Specialty') : t('الإمارة', 'Emirate')}</th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">{t('العدد', 'Count')}</th>
                                  <th className="text-right px-3 py-2 font-semibold text-gray-600">{t('النسبة', 'Share')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {breakdown.map((row: any, i: number) => {
                                  const name = row.specialization || row.specialty || row.emirate || row.region_code || `Item ${i+1}`;
                                  const count = row.enrollment_count || row.total || row.students || row.value || 0;
                                  const totalSum = breakdown.reduce((s: number, r: any) =>
                                    s + (r.enrollment_count || r.total || r.students || r.value || 0), 0);
                                  const pct = totalSum > 0 ? (count / totalSum * 100).toFixed(1) : '0';
                                  return (
                                    <tr key={i} className={`border-t border-gray-100 hover:bg-navy/3 ${i % 2 ? 'bg-gray-50/30' : ''}`}>
                                      <td className="px-3 py-1.5 text-gray-700">{name}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-navy">{fmt(count)}</td>
                                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pct}%</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-[9px] text-gray-400 italic mt-1.5">
                            {isFiltered
                              ? t('البيانات مفلترة حسب الفلاتر النشطة', 'Data filtered by active selections')
                              : t('انقر على فلتر إمارة أو تخصص لتفصيل أعمق', 'Apply emirate or specialty filter for deeper drill-down')}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </ChartToolbar>
        </GlassCard>

        {/* Projection Summary Card */}
        {projInsight && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-gradient-to-br from-navy/5 to-teal/5 border border-navy/10 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{t('القيمة الحالية', 'Current')}</p>
              <p className="text-2xl font-bold text-navy tabular-nums">{fmt(projInsight.baseValue)}</p>
              <p className="text-[10px] text-gray-500 mt-1">{projMetric === 'enrollment' ? t('طالب مسجل', 'students enrolled') : t('خريج', 'graduates')}</p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-emerald/5 to-teal/5 border border-emerald/10 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{t('متوقع في', 'Projected by')} {projInsight.year}</p>
              <p className="text-2xl font-bold text-emerald-600 tabular-nums">{fmt(projInsight.finalValue)}</p>
              <p className="text-[10px] text-gray-500 mt-1">{t('بعد تعديل السوق', 'with market adjustment')}</p>
            </div>
            <div className={`rounded-2xl bg-gradient-to-br ${projInsight.totalGrowth >= 0 ? 'from-emerald/5 to-navy/5 border-emerald/10' : 'from-red-50 to-amber-50 border-red-200'} border p-4`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{t('إجمالي التغير', 'Total Change')}</p>
              <p className={`text-2xl font-bold tabular-nums ${projInsight.totalGrowth >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {projInsight.totalGrowth >= 0 ? '+' : ''}{projInsight.totalGrowth.toFixed(1)}%
              </p>
              <p className="text-[10px] text-gray-500 mt-1">{t('على الأفق المحدد', 'over selected horizon')}</p>
            </div>
          </div>
        )}

        {/* External Research Agent Panel — auto-fetched per filter combo */}
        <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/50 to-white p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-100"><Globe className="w-4 h-4 text-amber-700" /></div>
              <div>
                <h4 className="text-sm font-bold text-amber-900">{t('وكيل البحث الخارجي', 'External Research Agent')}</h4>
                <p className="text-[10px] text-amber-700">{t('يبحث في الويب تلقائياً ويزن الإشارات حسب الفلاتر النشطة', 'Auto-researches web and weights signals based on active filters')}</p>
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-amber-700 cursor-pointer">
              <input type="checkbox" checked={extResearchAuto} onChange={e => setExtResearchAuto(e.target.checked)} className="rounded" />
              {t('تطبيق تلقائي', 'Auto-apply')}
            </label>
          </div>

          {extResearchLoading && (
            <div className="flex items-center gap-2 py-3 text-xs text-amber-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('جاري البحث في الويب وتحليل العوامل الخارجية...', 'Researching web sources and analyzing external factors...')}
            </div>
          )}

          {extResearchError && !extResearchLoading && (
            <p className="text-xs text-red-600 py-2">{extResearchError}</p>
          )}

          {extResearch && !extResearchLoading && (
            <>
              {/* Recommended signal */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg bg-white border border-amber-200 p-3 text-center">
                  <p className="text-[9px] uppercase font-semibold text-gray-500 mb-0.5">{t('الإشارة الموصى بها', 'Recommended Signal')}</p>
                  <p className={`text-2xl font-bold tabular-nums ${
                    extResearch.market_signal_pct > 5 ? 'text-emerald-600'
                    : extResearch.market_signal_pct < -5 ? 'text-red-500'
                    : 'text-gray-600'
                  }`}>{extResearch.market_signal_pct > 0 ? '+' : ''}{extResearch.market_signal_pct}%</p>
                </div>
                <div className="rounded-lg bg-white border border-amber-200 p-3 text-center">
                  <p className="text-[9px] uppercase font-semibold text-gray-500 mb-0.5">{t('الثقة', 'Confidence')}</p>
                  <p className="text-sm font-bold text-amber-700 capitalize mt-2">{extResearch.confidence}</p>
                </div>
                <div className="rounded-lg bg-white border border-amber-200 p-3 text-center">
                  <p className="text-[9px] uppercase font-semibold text-gray-500 mb-0.5">{t('عوامل', 'Factors Found')}</p>
                  <p className="text-2xl font-bold text-navy">{extResearch.factors?.length || 0}</p>
                </div>
              </div>

              {/* Rationale */}
              {extResearch.rationale && (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-100 text-[11px] text-amber-900">
                  <span className="font-semibold">{t('السبب', 'Rationale')}:</span> {extResearch.rationale}
                </div>
              )}

              {/* Factors with weights */}
              {extResearch.factors && extResearch.factors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase">{t('العوامل الخارجية مع الأوزان', 'External Factors with Weights')}</p>
                  {extResearch.factors.map((f: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-white border border-gray-100 hover:border-amber-200 transition-colors">
                      <div className={`shrink-0 w-1.5 self-stretch rounded-full ${
                        f.impact === 'positive' ? 'bg-emerald-500'
                        : f.impact === 'negative' ? 'bg-red-500'
                        : 'bg-gray-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h5 className="text-xs font-semibold text-gray-900">{f.title}</h5>
                          <span className={`text-[10px] font-bold tabular-nums shrink-0 ${
                            f.weight > 0 ? 'text-emerald-600' : f.weight < 0 ? 'text-red-500' : 'text-gray-400'
                          }`}>
                            {f.weight > 0 ? '+' : ''}{(f.weight * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-600 mt-0.5 leading-relaxed">{f.summary}</p>
                        {f.source_url && (
                          <a href={f.source_url} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] text-amber-700 hover:underline inline-flex items-center gap-0.5 mt-1">
                            <ExternalLink className="w-2.5 h-2.5" />
                            {f.source_name || new URL(f.source_url).hostname}
                            {f.date && <span className="text-gray-400 ml-1">• {f.date}</span>}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Research summary */}
              {extResearch.research_summary && (
                <details className="mt-3">
                  <summary className="text-[10px] font-semibold text-gray-500 cursor-pointer hover:text-gray-700">
                    {t('ملخص البحث الكامل', 'Full Research Summary')}
                  </summary>
                  <p className="text-[11px] text-gray-600 mt-2 leading-relaxed p-2 bg-gray-50 rounded">{extResearch.research_summary}</p>
                </details>
              )}
            </>
          )}

          {!extResearch && !extResearchLoading && !extResearchError && (
            <p className="text-xs text-gray-500 py-2">{t('قم بتعديل الفلاتر لتشغيل البحث الخارجي', 'Adjust filters to trigger external research')}</p>
          )}
        </div>

        {/* External factors explanation (kept as reference) */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
          <Sparkles className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-800">{t('كيف تعمل إشارة السوق الخارجية', 'How External Market Signal Works')}</p>
            <p className="text-[11px] text-blue-700 mt-1">{t(
              'الإسقاط الأساسي يستخدم انحدار خطي على آخر 5 سنوات + نمو مركب. وكيل البحث الخارجي يبحث تلقائياً في الويب ويوصي بقيمة لمنزلق "إشارة السوق" بناءً على الفلاتر النشطة.',
              'Baseline uses linear regression on last 5 years + compound growth. The External Research Agent automatically searches the web and recommends a value for the "Market Signal" slider based on active filters.'
            )}</p>
          </div>
        </div>

        <InsightPanel
          explanation={t('الإسقاطات تعتمد على البيانات التاريخية + معدل نمو قابل للتعديل + إشارة سوق خارجية. الفلاتر العامة (الإمارة، التخصص، السنوات، القطاع، المستوى) تؤثر على البيانات التاريخية المستخدمة في الانحدار.', 'Projections use historical data + adjustable growth rate + external market signal. Global filters (emirate, specialty, years, sector, degree level) affect the historical data used in regression.')}
          insight={projInsight ? t(
            `بناءً على الاتجاه التاريخي ومعدل نمو ${projGrowthRate}%${projMarketSignal !== 0 ? ` وإشارة السوق ${projMarketSignal > 0 ? '+' : ''}${projMarketSignal}%` : ''}، نتوقع ${fmt(projInsight.finalValue)} ${projMetric === 'enrollment' ? 'مسجل' : 'خريج'} بحلول ${projInsight.year} (${projInsight.totalGrowth >= 0 ? '+' : ''}${projInsight.totalGrowth.toFixed(1)}%).`,
            `Based on historical trend + ${projGrowthRate}% growth rate${projMarketSignal !== 0 ? ` + ${projMarketSignal > 0 ? '+' : ''}${projMarketSignal}% market signal` : ''}, we project ${fmt(projInsight.finalValue)} ${projMetric === 'enrollment' ? 'enrolled' : 'graduates'} by ${projInsight.year} (${projInsight.totalGrowth >= 0 ? '+' : ''}${projInsight.totalGrowth.toFixed(1)}%).`
          ) : undefined}
          recommendation={t('جرب سيناريوهات مختلفة بتعديل المنزلقات. استخدم إشارات السوق السلبية للبرامج المعرضة لخطر AI والإيجابية للبرامج المتنامية.', 'Try different scenarios by adjusting sliders. Use negative market signals for AI-risk programs and positive for growth areas.')}
          severity="info" source="Computed from historical enrollment + graduate trends" />
        </DataStory>
      </motion.div>
    )}</AnimatePresence>

    {/* ── 9. DATA SOURCES ──────────────────────────────────────── */}
    <SectionHeader icon={Database} title={t('مصادر البيانات', 'Data Sources')}
      subtitle={t('جميع مصادر البيانات المستخدمة', 'All data sources used in this dashboard')} />

    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Database className="w-4 h-4" />{t('مصادر البيانات', 'Data Sources')}</h3>
        <span className="text-[10px] text-text-muted">{fmt((data.sources ?? []).reduce((s: number, src: any) => s + (src.rows ?? 0), 0))} {t('سجل إجمالي', 'total records')}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {(data.sources ?? []).map((s: any, i: number) => (
          <button key={i} onClick={() => goToExplorer(s.source)}
            className="flex items-center justify-between p-3 rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-all text-left group border border-transparent hover:border-border-light hover:shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className={`w-2.5 h-2.5 rounded-full ${s.source.includes('estimated') ? 'bg-amber-400' : s.source.includes('bayanat') ? 'bg-emerald-400' : s.source.includes('caa') ? 'bg-indigo-400' : 'bg-blue-400'}`} />
              <div><span className="text-xs font-medium text-primary">{s.source.replace(/_/g, ' ')}</span><span className="text-[10px] text-text-muted block capitalize">{s.category}</span></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-text-muted">{fmt(s.rows)}</span>
              <ExternalLink className="w-3.5 h-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ))}
      </div>
    </GlassCard>
  </>);
};

/* ══════════════════════════════════════════════════════════════ */
/*  INSTITUTION DEEP DIVE                                        */
/* ══════════════════════════════════════════════════════════════ */
const InstitutionDeepDive = ({ data, goToExplorer }: { data: any; goToExplorer: (s?: string) => void }) => {
  const { t } = useLanguage();
  const [expandedInst, setExpandedInst] = useState<string | null>(null);
  const [instSearch, setInstSearch] = useState('');
  const [sortCol, setSortCol] = useState<string>('programs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const PER_PAGE = 15;
  const { data: instDetail, isLoading: instDetailLoading } = useExplorerByInstitution(expandedInst ? { institution: expandedInst } : undefined);

  const institutions = data.institution_ranking ?? [];
  const filtered = useMemo(() => {
    let list = instSearch ? institutions.filter((inst: any) => inst.institution?.toLowerCase().includes(instSearch.toLowerCase())) : institutions;
    return [...list].sort((a: any, b: any) => {
      const av = a[sortCol] ?? 0; const bv = b[sortCol] ?? 0;
      return sortDir === 'asc' ? (typeof av === 'string' ? av.localeCompare(bv) : av - bv) : (typeof bv === 'string' ? bv.localeCompare(av) : bv - av);
    });
  }, [institutions, instSearch, sortCol, sortDir]);

  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const toggleSort = (col: string) => { if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('desc'); } };

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-primary">{t('ترتيب المؤسسات', 'Institution Ranking')}</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input value={instSearch} onChange={e => { setInstSearch(e.target.value); setPage(0); }} placeholder={t('بحث...', 'Search...')}
              className="text-xs bg-surface-secondary border border-border-light rounded-lg pl-8 pr-3 py-1.5 text-primary w-48 placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-navy/20" />
          </div>
          <SourceBadge source="CAA + Bayanat" onClick={() => goToExplorer()} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-surface-secondary text-text-muted text-xs">
            <th className="px-4 py-2 text-left w-8">#</th>
            <th className="px-4 py-2 text-left cursor-pointer" onClick={() => toggleSort('institution')}><span className="inline-flex items-center gap-1">{t('المؤسسة', 'Institution')}<ArrowUpDown className="w-3 h-3" /></span></th>
            <th className="px-4 py-2 text-left">{t('الإمارة', 'Emirate')}</th>
            <th className="px-4 py-2 text-left">{t('القطاع', 'Sector')}</th>
            <th className="px-4 py-2 text-right cursor-pointer" onClick={() => toggleSort('programs')}><span className="inline-flex items-center gap-1">{t('البرامج', 'Programs')}<ArrowUpDown className="w-3 h-3" /></span></th>
            <th className="px-4 py-2 text-right cursor-pointer" onClick={() => toggleSort('graduates')}><span className="inline-flex items-center gap-1">{t('الخريجين', 'Graduates')}<ArrowUpDown className="w-3 h-3" /></span></th>
            <th className="px-4 py-2 w-8" />
          </tr></thead>
          <tbody>{paged.map((inst: any, i: number) => {
            const isExpanded = expandedInst === inst.institution;
            return (
              <Fragment key={i}>
                <tr className="border-t border-border-light hover:bg-surface-secondary/50 transition-colors cursor-pointer" onClick={() => setExpandedInst(isExpanded ? null : inst.institution)}>
                  <td className="px-4 py-2.5 text-text-muted text-xs">{page * PER_PAGE + i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-primary text-xs">{inst.institution}</td>
                  <td className="px-4 py-2.5 text-text-secondary text-xs">{inst.emirate || '—'}</td>
                  <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full ${inst.sector?.toLowerCase().includes('private') ? 'bg-purple-50 text-purple-700' : inst.sector?.toLowerCase().includes('government') ? 'bg-teal-50 text-teal-700' : 'bg-gray-50 text-gray-600'}`}>{inst.sector || '—'}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-xs">{inst.programs}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs">{inst.graduates > 0 ? fmt(inst.graduates) : '—'}</td>
                  <td className="px-4 py-2.5 text-center">{isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-text-muted" /> : <ChevronRight className="w-3.5 h-3.5 text-text-muted" />}</td>
                </tr>
                {isExpanded && (
                  <tr><td colSpan={7} className="bg-surface-secondary/30 px-6 py-4">
                    {instDetailLoading ? <div className="flex items-center gap-2 text-text-muted text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" />{t('جاري التحميل...', 'Loading...')}</div>
                    : instDetail ? (
                      <div className="space-y-3">
                        {instDetail.programs && Array.isArray(instDetail.programs) && (<div><p className="text-xs font-semibold text-primary mb-1">{t('البرامج', 'Programs')}</p><div className="flex flex-wrap gap-1.5">{instDetail.programs.slice(0, 20).map((p: any, idx: number) => <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-navy/10 text-navy">{p.name ?? p.program ?? p}</span>)}{instDetail.programs.length > 20 && <span className="text-[10px] text-text-muted">+{instDetail.programs.length - 20} more</span>}</div></div>)}
                        {instDetail.skills && Array.isArray(instDetail.skills) && (<div><p className="text-xs font-semibold text-primary mb-1">{t('المهارات', 'Skills Taught')}</p><div className="flex flex-wrap gap-1.5">{instDetail.skills.slice(0, 15).map((sk: any, idx: number) => <span key={idx} className="text-[10px] px-2 py-0.5 rounded-full bg-teal/10 text-teal-700">{sk.skill ?? sk.name ?? sk}</span>)}{instDetail.skills.length > 15 && <span className="text-[10px] text-text-muted">+{instDetail.skills.length - 15} more</span>}</div></div>)}
                      </div>
                    ) : <p className="text-xs text-text-muted">{t('لا توجد تفاصيل', 'No details')}</p>}
                  </td></tr>
                )}
              </Fragment>
            );
          })}</tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface-secondary border-t border-border-light">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-xs font-medium text-primary disabled:text-text-muted px-4 py-1.5 rounded-lg hover:bg-card">{t('السابق', 'Previous')}</button>
          <span className="text-xs text-text-muted tabular-nums">{page * PER_PAGE + 1}-{Math.min((page + 1) * PER_PAGE, filtered.length)} {t('من', 'of')} {filtered.length}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PER_PAGE >= filtered.length} className="text-xs font-medium text-primary disabled:text-text-muted px-4 py-1.5 rounded-lg hover:bg-card">{t('التالي', 'Next')}</button>
        </div>
      )}
    </GlassCard>
  );
};

/* ══════════════════════════════════════════════════════════════ */
/*  DATA EXPLORER                                                */
/* ══════════════════════════════════════════════════════════════ */
const DataExplorerTab = ({ initialSource }: { initialSource?: string }) => {
  const { t } = useLanguage();
  const [table, setTable] = useState('enrollment');
  const [source, setSource] = useState<string | undefined>(initialSource);
  const [page, setPage] = useState(0);
  const { data, isLoading } = useSupplyDataExplorer({ table, source, limit: 50, offset: page * 50 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 bg-white border border-gray-100 rounded-xl shadow-sm p-4">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-text-muted" />
          <select value={table} onChange={e => { setTable(e.target.value); setPage(0); }} className="text-sm bg-surface-secondary border border-border-light rounded-lg px-3 py-1.5 text-primary font-medium">
            <option value="enrollment">{t('التسجيل', 'Enrollment')}</option><option value="graduates">{t('الخريجين', 'Graduates')}</option><option value="programs">{t('البرامج', 'Programs')}</option><option value="institutions">{t('المؤسسات', 'Institutions')}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-text-muted" />
          <select value={source ?? ''} onChange={e => { setSource(e.target.value || undefined); setPage(0); }} className="text-sm bg-surface-secondary border border-border-light rounded-lg px-3 py-1.5 text-primary">
            <option value="">{t('جميع المصادر', 'All Sources')}</option>
            {(data?.available_sources ?? []).map((s: string) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        {source && <button onClick={() => setSource(undefined)} className="text-xs text-text-muted hover:text-primary flex items-center gap-1"><X className="w-3 h-3" />{t('مسح', 'Clear')}</button>}
        <div className="flex-1" />
        <span className="text-[10px] px-2 py-1 rounded-full bg-navy/10 text-navy font-medium">{data?.db_table}</span>
        <span className="text-xs tabular-nums text-text-muted font-medium">{fmt(data?.total ?? 0)} {t('سجل', 'records')}</span>
      </div>
      <GlassCard className="overflow-hidden !p-0">
        {isLoading ? <div className="p-5"><SkeletonTable rows={10} cols={6} /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-surface-secondary">{(data?.columns ?? []).map((col: string) => <th key={col} className="px-3 py-2.5 text-left font-semibold text-text-muted whitespace-nowrap uppercase tracking-wider text-[10px]">{col}</th>)}</tr></thead>
              <tbody>{(data?.rows ?? []).map((row: any, i: number) => (
                <tr key={i} className="border-t border-border-light hover:bg-blue-50/30 transition-colors">
                  {(data?.columns ?? []).map((col: string) => {
                    const v = row[col]; const isSrc = col === 'source'; const isEst = col === 'is_estimated' && v === true;
                    return <td key={col} className={`px-3 py-2 whitespace-nowrap ${isEst ? 'text-amber-600' : 'text-text-secondary'}`}>
                      {isSrc && v ? <SourceBadge source={String(v)} /> : isEst ? <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]">Est.</span> : v === true ? <span className="text-emerald-600">Yes</span> : v === false ? <span className="text-text-muted">No</span> : v == null ? <span className="text-text-muted/50">--</span> : String(v)}
                    </td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(data?.total ?? 0) > 50 && (
          <div className="flex items-center justify-between px-4 py-3 bg-surface-secondary border-t border-border-light">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-xs font-medium text-primary disabled:text-text-muted px-4 py-1.5 rounded-lg hover:bg-card">{t('السابق', 'Previous')}</button>
            <span className="text-xs text-text-muted tabular-nums">{page * 50 + 1}-{Math.min((page + 1) * 50, data?.total ?? 0)} of {fmt(data?.total ?? 0)}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * 50 >= (data?.total ?? 0)} className="text-xs font-medium text-primary disabled:text-text-muted px-4 py-1.5 rounded-lg hover:bg-card">{t('التالي', 'Next')}</button>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

/* FloatingChat replaced by inline AI Research Assistant panel in main component */

export default SupplyDashboardPage;
