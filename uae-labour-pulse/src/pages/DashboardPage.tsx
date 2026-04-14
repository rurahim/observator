/**
 * Executive Intelligence Dashboard — the first page decision-makers see.
 * 8 sections, all real API data, zero hardcoded values.
 * Blue-only palette, Recharts, bilingual, framer-motion entry.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Users, Briefcase, Brain, Database, BarChart3,
  Send, Loader2, TrendingUp, ArrowRight,
  GraduationCap, Building2, MessageSquare, Layers,
  ChevronRight, Globe, Shield, Lightbulb, Activity,
  Crosshair, BookOpen, Cpu, FlaskConical, X, Search as SearchIcon,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageLoading } from '@/hooks/usePageLoading';
import {
  useSupplyDashboard, useDashboardSummary, useDemandInsights,
  useAIImpact, useKBStats, useSendMessage,
  useSkillMatchingSummary, useDemandedSkills, useSuppliedSkills, useSkillComparison,
  useExplorerFilters,
  useRealOccupationComparison, useOccupationSkillsDetail, useISCOGroupComparison,
  useUnifiedTimeline, useOccupationSearch,
  useSkillNetworkGraph, useGraphOccupationSearch, useGraphOccupationList,
  useUploadChatFile, type ChatFile,
} from '@/api/hooks';
import { formatCompact, formatNumber, formatPercent } from '@/utils/formatters';
import { useStreamChatWithTraces } from '@/api/useStreamChatWithTraces';
import type { TraceStep } from '@/api/useStreamChatWithTraces';
import { parseVisualization, parseAllVisualizations, stripChartBlock } from '@/components/chat/parseVisualization';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { VisualizationSpec } from '@/components/chat/parseVisualization';
import ChatVisualization from '@/components/chat/ChatVisualization';
import { COLORS, GRID_PROPS, AXIS_TICK, AXIS_TICK_SM, getSeriesColor } from '@/utils/chartColors';
import ChartTooltip from '@/components/charts/ChartTooltip';
import ForceGraph from '@/components/charts/ForceGraph';
import InsightPanel from '@/components/shared/InsightPanel';
import DataStory from '@/components/shared/DataStory';
import { SkeletonPage } from '@/components/shared/Skeletons';
import type { Citation } from '@/api/types';

/* ── Animation helpers ──────────────────────────── */
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

/* ── Chat message type ──────────────────────────── */
interface ChatMsg { role: 'user' | 'assistant'; content: string; citations?: Citation[]; visualization?: VisualizationSpec | null; visualizations?: VisualizationSpec[] }

/* ── Render structured AI analysis sections ────── */
const renderAnalysisSections = (text: string) => {
  const sectionIcons: Record<string, { icon: string; color: string; bg: string }> = {
    'Trend Analysis': { icon: '📊', color: 'text-[#003366]', bg: 'bg-[#003366]/5 border-[#003366]/10' },
    'How We Projected': { icon: '🔬', color: 'text-[#007DB5]', bg: 'bg-[#007DB5]/5 border-[#007DB5]/10' },
    'Model Limitations': { icon: '⚠️', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  };
  // Split by **Section**: pattern
  const parts = text.split(/\*\*([^*]+)\*\*\s*:\s*/);
  if (parts.length <= 1) {
    // No sections found — render as plain text with bold parsing
    return <p className="text-xs text-gray-700 leading-relaxed">{text.replace(/\*\*/g, '')}</p>;
  }
  const sections: { title: string; content: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i], content: (parts[i + 1] || '').trim() });
  }
  return (
    <div className="space-y-2.5">
      {sections.map((s, i) => {
        const style = sectionIcons[s.title] || { icon: '💡', color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200' };
        return (
          <div key={i} className={`rounded-lg border p-3 ${style.bg}`}>
            <h5 className={`text-[10px] font-bold uppercase mb-1 ${style.color}`}>{style.icon} {s.title}</h5>
            <p className="text-xs text-gray-700 leading-relaxed">{s.content.replace(/\*\*/g, '')}</p>
          </div>
        );
      })}
    </div>
  );
};

/* ── Render web factors as styled cards ────────── */
const renderWebFactors = (text: string) => {
  // Split by bullet points
  const lines = text.split(/\n/).filter(l => l.trim());
  const factors: { title: string; desc: string; source: string; url: string }[] = [];
  const otherLines: string[] = [];
  for (const line of lines) {
    // Match: • **Title**: Description — _Source: Name_ [Read more](url)
    const match = line.match(/[•\-]\s*\*\*([^*]+)\*\*\s*:\s*(.+)/);
    if (match) {
      const title = match[1];
      let desc = match[2];
      // Extract source
      let source = '';
      let url = '';
      const srcMatch = desc.match(/[—–-]\s*_?Source:\s*([^_\[]+)_?\s*\[?[Rr]ead\s*more\]?\(?([^)]*)\)?/);
      if (srcMatch) {
        source = srcMatch[1].trim();
        url = srcMatch[2] || '';
        desc = desc.replace(srcMatch[0], '').trim();
      }
      factors.push({ title, desc: desc.replace(/\*\*/g, ''), source, url });
    } else {
      otherLines.push(line.replace(/\*\*/g, ''));
    }
  }
  if (factors.length === 0) {
    return <p className="text-xs text-gray-700 leading-relaxed">{text.replace(/\*\*/g, '')}</p>;
  }
  return (
    <div className="space-y-2">
      {factors.map((f, i) => (
        <div key={i} className="flex gap-3 p-2.5 rounded-lg bg-white/60 border border-[#C9A84C]/10">
          <div className="w-6 h-6 rounded-full bg-[#C9A84C]/15 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[10px] font-bold text-[#C9A84C]">{i + 1}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h6 className="text-[11px] font-semibold text-gray-900">{f.title}</h6>
            <p className="text-[10px] text-gray-600 leading-relaxed mt-0.5">{f.desc}</p>
            {f.source && (
              <p className="text-[9px] text-[#C9A84C] mt-1 font-medium">
                {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{f.source} ↗</a> : f.source}
              </p>
            )}
          </div>
        </div>
      ))}
      {otherLines.filter(l => l.trim() && !l.startsWith('Here are') && !l.startsWith('These factors')).map((l, i) => (
        <p key={`other-${i}`} className="text-[10px] text-gray-500 italic">{l}</p>
      ))}
    </div>
  );
};

/* ── Heatmap cell colors by gap severity ────────── */
const heatColor = (gap: number, maxGap: number): string => {
  if (maxGap === 0) return '#E2E8F0';
  const ratio = Math.min(gap / maxGap, 1);
  if (ratio > 0.7) return '#003366';
  if (ratio > 0.5) return '#0A5C8A';
  if (ratio > 0.3) return '#007DB5';
  if (ratio > 0.1) return '#4A90C4';
  return '#C9D6E8';
};

/* ══════════════════════════════════════════════════ */
/* ── COMPONENT ────────────────────────────────────  */
/* ══════════════════════════════════════════════════ */
const DashboardPage = () => {
  const { t } = useLanguage();
  const loading = usePageLoading();

  /* ── Data hooks — CRITICAL (above fold, load immediately) ──── */
  const { data: supply, isLoading: supLoad } = useSupplyDashboard();
  const { data: dashboard, isLoading: dashLoad } = useDashboardSummary();
  const { data: demand, isLoading: demLoad } = useDemandInsights();

  /* ── DEFERRED hooks — load after initial render ──── */
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDeferredReady(true), 800); return () => clearTimeout(t); }, []);

  const { data: ai, isLoading: aiLoad } = useAIImpact();
  const { data: kb } = useKBStats();
  const { data: skillMatch } = useSkillMatchingSummary();
  const { data: skillComp } = useSkillComparison({ limit: 100 });
  const { data: demandedSkillsData } = useDemandedSkills({ limit: 20 });
  const { data: suppliedSkillsData } = useSuppliedSkills({ limit: 20 });

  // ── Skills Gap Map filters ──
  const [graphIsco, setGraphIsco] = useState('');
  const [graphRegion, setGraphRegion] = useState('');
  const [graphOccLimit, setGraphOccLimit] = useState(20);
  const [graphSkillsPer, setGraphSkillsPer] = useState(5);
  const [graphOccSearch, setGraphOccSearch] = useState('');
  const [graphSelectedOccs, setGraphSelectedOccs] = useState<{ id: number; title: string }[]>([]);
  const [graphOccDropdownOpen, setGraphOccDropdownOpen] = useState(false);
  const { data: graphOccSearchResults } = useGraphOccupationSearch(graphOccSearch);
  const { data: graphOccListData } = useGraphOccupationList(deferredReady ? { limit: 500 } : undefined);
  // When typing, use search results. When just clicking, show full list filtered.
  const graphOccOptions = useMemo(() => {
    if (graphOccSearch.length >= 2 && graphOccSearchResults) {
      return graphOccSearchResults;
    }
    if (graphOccListData?.occupations) {
      return graphOccListData.occupations;
    }
    return [];
  }, [graphOccSearch, graphOccSearchResults, graphOccListData]);
  const graphOccIds = graphSelectedOccs.length > 0 ? graphSelectedOccs.map(o => o.id).join(',') : undefined;
  const [graphSearch, setGraphSearch] = useState('');
  const debouncedGraphSearch = useMemo(() => graphSearch, [graphSearch]);
  const { data: skillGraph } = useSkillNetworkGraph({
    occ_limit: graphOccLimit,
    skills_per_occ: graphSkillsPer,
    ...(graphIsco ? { isco_group: graphIsco } : {}),
    ...(graphRegion ? { region: graphRegion } : {}),
    ...(graphOccIds ? { occupation_ids: graphOccIds } : {}),
    ...(debouncedGraphSearch.length >= 2 ? { search: debouncedGraphSearch } : {}),
  });
  const chat = useSendMessage();

  // Occupation comparison state
  const { data: expFilters } = useExplorerFilters();
  const [occSearch, setOccSearch] = useState('');
  const [occRegion, setOccRegion] = useState('');
  const [occPage, setOccPage] = useState(1);
  const [selectedOccId, setSelectedOccId] = useState<number | null>(null);

  // Unified timeline hooks
  const [tlRegion, setTlRegion] = useState('');
  const [tlOccupation, setTlOccupation] = useState('');
  const [tlOccInput, setTlOccInput] = useState('');          // What user types (for autocomplete)
  const [tlOccDropdownOpen, setTlOccDropdownOpen] = useState(false);
  const [tlIscoGroup, setTlIscoGroup] = useState('');
  const [tlSelectedYear, setTlSelectedYear] = useState<number | null>(null);
  const { data: occSuggestions } = useOccupationSearch(tlOccInput);
  const occDropdownRef = useRef<HTMLDivElement>(null);
  const [tlExplanation, setTlExplanation] = useState('');
  const [tlWebFactors, setTlWebFactors] = useState('');
  const [tlExplLoading, setTlExplLoading] = useState(false);
  const [tlWebLoading, setTlWebLoading] = useState(false);
  const { data: timeline } = useUnifiedTimeline({
    region: tlRegion || undefined,
    occupation: tlOccupation || undefined,
    isco_group: tlIscoGroup || undefined,
    year: tlSelectedYear ?? undefined,
  });

  // AUTO-TRIGGER: generate AI explanation whenever timeline data changes (debounced)
  useEffect(() => {
    if (!timeline || (!timeline.past?.length && !timeline.future?.length)) {
      setTlExplanation('');
      setTlWebFactors('');
      return;
    }
    // Debounce: wait 2s after last change before calling OpenAI
    const debounceTimer = setTimeout(() => generateTimelineExplanation(), 2000);
    return () => clearTimeout(debounceTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline]);

  const generateTimelineExplanation = () => {
    if (!timeline || (!timeline.past?.length && !timeline.future?.length)) return;

    const filterDesc = [
      tlRegion ? `Region: ${tlRegion}` : 'All UAE',
      tlIscoGroup ? `ISCO Group: ${tlIscoGroup}` : 'All occupations',
      tlOccupation ? `Occupation: ${tlOccupation}` : '',
      tlSelectedYear ? `Selected Year: ${tlSelectedYear}` : '',
    ].filter(Boolean).join(', ');

    // Full yearly data for context
    const pastYearly = (timeline.past || []).map((p: any) => `${p.year}: ${formatCompact(p.workers)} workers (${p.occupations} occupations)`).join('; ');
    const futureYearly = (timeline.future || []).map((f: any) => `${f.year}: supply ${formatCompact(f.supply_projected)}, demand ${formatCompact(f.demand_projected)}`).join('; ');
    const topSupply = (timeline.top_supply_occupations || []).slice(0,8).map((o: any) => `${o.occupation} (${formatCompact(o.workers)})`).join(', ');
    const topDemand = (timeline.top_demand_occupations || []).slice(0,8).map((o: any) => `${o.occupation} (${formatCompact(o.jobs)})`).join(', ');
    const meth = timeline.methodology || {};

    const yearContext = tlSelectedYear
      ? `\nSELECTED YEAR: ${tlSelectedYear}. The user is focused on this specific year — tailor your analysis to what happened/will happen in ${tlSelectedYear} specifically, while referencing the broader trend for context.`
      : '';

    // PART 1: ML Model Explainability (self_knowledge — no web search)
    const mlPrompt = `You are a labour market analyst for UAE government. Analyze this data and explain the ML projection methodology.

FILTERS: ${filterDesc}${yearContext}
PAST DATA (yearly): ${pastYearly || 'No past data'}
FUTURE PROJECTIONS (yearly): ${futureYearly || 'No future data'}
Top supply occupations: ${topSupply || 'None'}
Top demand occupations: ${topDemand || 'None'}

PROJECTION MODEL DETAILS:
- Supply model: ${meth.supply_model || 'CAGR 2% from 2019 base'}
- Demand model: ${meth.demand_model || 'CAGR 8% from 2024/25 LinkedIn base'}
- Method: ${meth.projection_method || 'Compound annual growth rate'}
- AI adjustment: ${meth.ai_adjustment || '±2-3%/year from AI displacement/creation'}
- Limitations: ${(meth.limitations || []).join('; ')}

Respond in this EXACT format:
**Trend Analysis**: [2-3 sentences on what the data shows${tlSelectedYear ? ` for ${tlSelectedYear} in context of the full timeline` : ' for this filter combination'}]
**How We Projected**: [2-3 sentences explaining the ML model — growth rates, base data, assumptions in plain language]
**Model Limitations**: [1-2 sentences on what could make this projection wrong]`;

    // Both calls use stateless:true since they're auto-generated, not conversational.
    // Chained sequentially to avoid SQLite concurrency crash + OpenAI rate limits.
    const occupationContext = tlOccupation || (topDemand ? topDemand.split(',')[0] : 'general workforce');
    const regionContext = tlRegion || 'UAE';
    const webPrompt = `Search for the latest news and articles about factors affecting labour market supply and demand in ${regionContext} for ${occupationContext} occupations${tlSelectedYear ? ` around ${tlSelectedYear}` : ''}. Focus on:
1. UAE government economic policies (Vision 2030, Emiratization, new free zones)
2. AI and automation impact on these specific jobs
3. Global trends affecting this sector
4. Immigration/visa policy changes
5. Education/training initiatives

Return 4-6 specific factors with source names. Format each as:
• **[Factor title]**: [1 sentence explanation] — _Source: [publication name]_`;

    setTlExplLoading(true);
    setTlWebLoading(true);
    chat.mutateAsync({ message: mlPrompt, self_knowledge: true, stateless: true } as any)
      .then(res => {
        setTlExplanation(res?.message || '');
        setTlExplLoading(false);
        // Delay before web search to respect OpenAI rate limits (30K TPM tier)
        return new Promise<void>(resolve => setTimeout(resolve, 20000));
      })
      .then(() => chat.mutateAsync({ message: webPrompt, internet_search: true, stateless: true } as any))
      .then(res => setTlWebFactors(res?.message || ''))
      .catch(() => {
        if (!tlExplanation) setTlExplanation('Could not generate analysis.');
        setTlWebFactors('Could not fetch external factors. This may be due to rate limits — try again in a moment.');
      })
      .finally(() => {
        setTlExplLoading(false);
        setTlWebLoading(false);
      });
  };

  // Occupation comparison hooks
  const { data: iscoGroups } = useISCOGroupComparison({ region: occRegion || undefined });
  const [occSort, setOccSort] = useState('demand_jobs');
  const [occOrder, setOccOrder] = useState<'desc' | 'asc'>('desc');

  const { data: occComparison, isLoading: occLoading } = useRealOccupationComparison({
    limit: 15, search: occSearch || undefined, region: occRegion || undefined, page: occPage,
    sort: occSort, order: occOrder,
  } as any);
  const { data: occSkills, isLoading: occSkillsLoading } = useOccupationSkillsDetail(selectedOccId);

  /* ── Chat state (SSE streaming with traces) ──── */
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [selfKnowledgeOn, setSelfKnowledgeOn] = useState(false);
  const [showTraces, setShowTraces] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<ChatFile[]>([]);
  const [chatSessionId] = useState<string>(() => crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFile = useUploadChatFile();
  // Skills Gap Snapshot controls
  const [snapSearch, setSnapSearch] = useState('');
  const [snapExpandGap, setSnapExpandGap] = useState(false);
  const [snapExpandMatch, setSnapExpandMatch] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Section override state — agent can hide/style any section
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set());
  const [sectionStyles, setSectionStyles] = useState<Record<string, React.CSSProperties>>({});
  const [pageFontScale, setPageFontScale] = useState<number>(1);
  const isHidden = (id: string) => hiddenSections.has(id) || hiddenSections.has('all_graphs');
  const sectionStyle = (id: string): React.CSSProperties => sectionStyles[id] || {};
  const [dashboardOverrides, setDashboardOverrides] = useState<Record<string, any>>({});
  const {
    streamMessage, streamingText, isStreaming, traces, citations: streamCitations, dashboardPatches,
    error: streamError, cancel: cancelStream,
  } = useStreamChatWithTraces({
    internetSearch: webSearchOn,
    selfKnowledge: selfKnowledgeOn,
  });

  const chatLoading = isStreaming;

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || isStreaming) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setShowTraces(true); // Auto-show traces on send

    // Prepend file context so the agent knows about attached files
    let messageWithContext = q;
    if (attachedFiles.length > 0) {
      const fileList = attachedFiles.map(f => `- ${f.filename} (${f.type}): ${f.summary}`).join('\n');
      messageWithContext = `[ATTACHED FILES — use list_chat_files() and query_chat_file(file_id) tools to read them]
${fileList}

USER QUESTION: ${q}`;
    }
    await streamMessage(messageWithContext, chatSessionId);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      try {
        const result = await uploadFile.mutateAsync({ file: files[i], sessionId: chatSessionId });
        setAttachedFiles(prev => [...prev, result]);
      } catch (err: any) {
        console.error('Upload failed:', err);
        setMessages(prev => [...prev, { role: 'assistant', content: `Failed to upload ${files[i].name}: ${err.message}` }]);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachedFile = async (fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.file_id !== fileId));
    try {
      const token = localStorage.getItem('auth_token');
      await fetch(`${import.meta.env.VITE_API_URL || '/api'}/chat/files/${chatSessionId}/${fileId}`, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {}
  };

  // Apply dashboard patches from agent — full control system
  useEffect(() => {
    if (dashboardPatches.length === 0) return;
    console.log('[DashboardPatches] Applying patches:', dashboardPatches);
    for (const p of dashboardPatches) {
      const target = p.target;
      console.log('[DashboardPatches] Patch:', p);

      // ── HIDE / SHOW actions ──
      if (p.action === 'hide') {
        setHiddenSections(prev => {
          const next = new Set(prev);
          next.add(target);
          return next;
        });
        continue;
      }
      if (p.action === 'show') {
        setHiddenSections(prev => {
          const next = new Set(prev);
          if (target === 'all_graphs') next.clear();
          else next.delete(target);
          return next;
        });
        continue;
      }

      // ── STYLE action ──
      if (p.action === 'style') {
        const [key, val] = p.value.split('=');
        if (target === 'page' && key === 'font_size') {
          const scale = val === 'small' ? 0.85 : val === 'large' ? 1.15 : val === 'xl' ? 1.3 : 1;
          setPageFontScale(scale);
        } else {
          // Generic CSS override (background, border, padding, etc.)
          const cssKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          setSectionStyles(prev => ({
            ...prev,
            [target]: { ...prev[target], [cssKey]: val },
          }));
        }
        continue;
      }

      // ── FILTER action — apply to chart state ──
      if (p.action === 'filter') {
        if (target === 'skills_gap_map' || target === 'skill_gap_map') {
          const [key, val] = p.value.split('=');
          if (key === 'occ_limit' || key === 'occupations') setGraphOccLimit(parseInt(val) || 20);
          if (key === 'skills_per_occ' || key === 'skills') setGraphSkillsPer(parseInt(val) || 5);
          if (key === 'isco_group') setGraphIsco(val);
          if (key === 'region') setGraphRegion(val);
          if (key === 'search' || key === 'keyword' || key === 'topic') setGraphSearch(val);
          if (key === 'clear') { setGraphSearch(''); setGraphIsco(''); setGraphRegion(''); }
        }
        if (target === 'occupation_chart') {
          const [key, val] = p.value.split('=');
          if (key === 'page') setOccPage(parseInt(val) || 1);
          if (key === 'sort') setOccSort(val);
          if (key === 'region') setOccRegion(val);
        }
      }

      // Track all patches for the override description
      setDashboardOverrides(prev => ({
        ...prev,
        [target]: { ...prev[target], [p.action]: p.value, description: p.description },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardPatches]);

  // When streaming completes, add the final message with parsed charts
  useEffect(() => {
    if (!isStreaming && streamingText && messages.length > 0 && messages[messages.length - 1].role === 'user') {
      const allViz = parseAllVisualizations(streamingText);
      const cleanContent = stripChartBlock(streamingText);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: cleanContent,
        citations: streamCitations,
        visualization: allViz[0] || null,
        visualizations: allViz,
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  /* ── Derived data ────────────────────────────── */
  const kpis = supply?.kpis || ({} as any);

  const enrollmentTrend = useMemo(() => {
    return (supply?.enrollment_trend || []).map(e => ({
      year: e.year,
      enrollment: e.enrollment,
    }));
  }, [supply]);

  const demandMonthly = useMemo(() => {
    return (demand?.monthly_volume || []).slice(-24).map(m => ({
      month: m.month?.slice(0, 7) || m.month,
      count: m.count,
    }));
  }, [demand]);

  const enrollVsGrad = useMemo(() => {
    const trend = supply?.enrollment_trend || [];
    const grads = supply?.graduate_trend || [];
    const gradMap = Object.fromEntries(grads.map((g: any) => [g.year, g.graduates]));
    return trend.map((e: any) => ({ year: e.year, enrollment: e.enrollment, graduates: gradMap[e.year] || 0 }));
  }, [supply]);

  const supplyDemandTrend = useMemo(() => {
    return (dashboard?.supply_demand_trend || []).map((p: any) => ({
      month: p.month ?? '', supply: p.supply ?? 0, demand: p.demand ?? 0,
    }));
  }, [dashboard]);

  const topIndustries = useMemo(() => (demand?.top_industries || []).slice(0, 8), [demand]);

  const expLevels = useMemo(() =>
    (demand?.experience_levels || []).filter(e => (e.pct ?? 0) >= 1).slice(0, 7),
  [demand]);

  const emirateData = useMemo(() => {
    return (supply?.by_emirate || []).map(e => ({
      emirate: e.emirate?.replace('Umm Al Quwain', 'UAQ')?.replace('Ras Al Khaimah', 'RAK') || e.region_code,
      enrollment: e.enrollment || 0,
    }));
  }, [supply]);

  const genderData = useMemo(() => {
    const g = supply?.by_gender || {};
    const m = g.M ?? (g as any).male ?? 0;
    const f = g.F ?? (g as any).female ?? 0;
    return { male: m, female: f, total: m + f };
  }, [supply]);

  const stemData = useMemo(() => {
    const split = supply?.stem_split || [];
    const stem = split.find(s => s.indicator?.toLowerCase() === 'stem')?.count ?? 0;
    const total = split.reduce((s, x) => s + (x.count ?? 0), 0);
    return { stem, total, pct: total > 0 ? (stem / total * 100) : 0 };
  }, [supply]);

  const aiRiskDist = useMemo(() => {
    const occs = ai?.occupations || [];
    const h = occs.filter(o => o.risk_level === 'High').length;
    const m = occs.filter(o => o.risk_level === 'Moderate').length;
    const l = occs.filter(o => o.risk_level === 'Low').length;
    if (h + m + l === 0 && ai?.summary) {
      const total = ai.summary.total_occupations || 100;
      const highPct = ai.summary.high_risk_pct || 0;
      return [
        { name: t('مخاطر عالية', 'High Risk'), value: Math.round(total * highPct / 100), color: '#1A3F5C' },
        { name: t('متوسط', 'Moderate'), value: Math.round(total * (100 - highPct) * 0.4 / 100), color: '#C9A84C' },
        { name: t('مخاطر منخفضة', 'Low Risk'), value: Math.round(total * (100 - highPct) * 0.6 / 100), color: '#2E7D6B' },
      ];
    }
    return [
      { name: t('مخاطر عالية', 'High Risk'), value: h, color: '#1A3F5C' },
      { name: t('متوسط', 'Moderate'), value: m, color: '#C9A84C' },
      { name: t('مخاطر منخفضة', 'Low Risk'), value: l, color: '#2E7D6B' },
    ];
  }, [ai, t]);

  const graduateTrend = useMemo(() => (supply?.graduate_trend || []).slice(-10), [supply]);

  const topGaps = useMemo(() => (skillMatch?.top_gaps || []).slice(0, 10), [skillMatch]);

  const demandedSkills = useMemo(() => (demandedSkillsData?.skills || []).slice(0, 10), [demandedSkillsData]);
  const suppliedSkills = useMemo(() => (suppliedSkillsData?.skills || []).slice(0, 10), [suppliedSkillsData]);

  // Heatmap data: combine top gaps + surplus to show grid of skill types
  const heatmapData = useMemo(() => {
    const gaps = skillMatch?.top_gaps || [];
    const surplus = skillMatch?.top_surplus || [];
    const all = [...gaps.slice(0, 15), ...surplus.slice(0, 15)];
    const types = ['knowledge', 'skill/competence', 'competence'];
    const maxGap = Math.max(...all.map((s: any) => Math.abs(s.gap ?? 0)), 1);
    // Group by type, take top items per type
    const grouped: Record<string, any[]> = {};
    for (const item of all) {
      const typ = (item.type || 'knowledge').toLowerCase();
      const bucket = types.find(t => typ.includes(t)) || 'knowledge';
      if (!grouped[bucket]) grouped[bucket] = [];
      if (grouped[bucket].length < 10) grouped[bucket].push({ ...item, maxGap });
    }
    return { grouped, maxGap };
  }, [skillMatch]);

  const totalRecords = (kb?.total_rows ?? 0);

  const skillsGapCount = (skillMatch?.total_skills_demanded ?? 0) - (skillMatch?.skill_overlap ?? 0);

  /* ── Loading gate ────────────────────────────── */
  const isLoading = loading || supLoad || demLoad;
  if (isLoading) return <SkeletonPage />;

  try { return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 max-w-[1480px] mx-auto"
      style={{ fontSize: `${pageFontScale}rem` }}
    >

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1: HERO KPI BAR                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isHidden('hero_kpi') && (
      <div className="rounded-2xl bg-gradient-to-r from-[#003366] via-[#004a80] to-[#007DB5] p-5 shadow-xl" style={sectionStyle('hero_kpi')}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-white/15"><Activity className="w-5 h-5 text-white" /></div>
          <div>
            <h1 className="text-lg font-bold text-white">{t('لوحة القيادة التنفيذية', 'Executive Intelligence Dashboard')}</h1>
            <p className="text-xs text-white/60">{t('نظرة شاملة على سوق العمل الإماراتي', 'Comprehensive UAE labour market overview')}</p>
          </div>
        </div>
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              icon: GraduationCap,
              label: t('العرض التعليمي', 'Education Supply'),
              value: formatCompact(kpis.total_enrolled),
              sub: `${formatCompact(kpis.total_graduates)} ${t('خريجون', 'graduates')}`,
            },
            {
              icon: Briefcase,
              label: t('الوظائف النشطة', 'Job Postings'),
              value: formatCompact(demand?.total_postings),
              sub: `${formatCompact(demand?.unique_companies)} ${t('شركات', 'companies')}`,
            },
            {
              icon: Crosshair,
              label: t('تطابق المهارات', 'Skill Match'),
              value: `${(skillMatch?.overlap_pct ?? 0).toFixed(1)}%`,
              sub: `${formatCompact(skillMatch?.skill_overlap ?? 0)} ${t('مهارة مشتركة', 'shared')}`,
            },
            {
              icon: Cpu,
              label: t('مخاطر الذكاء', 'AI Risk'),
              value: `${ai?.summary?.high_risk_pct?.toFixed(1) ?? '—'}%`,
              sub: `${formatCompact(ai?.summary?.total_occupations)} ${t('مهنة', 'occupations')}`,
            },
            {
              icon: Building2,
              label: t('المؤسسات', 'Institutions'),
              value: formatCompact(kpis.total_institutions),
              sub: `${formatCompact(kpis.total_programs)} ${t('برامج', 'programs')}`,
            },
            {
              icon: Database,
              label: t('البيانات', 'Data Coverage'),
              value: formatCompact(totalRecords),
              sub: `${kb?.total_tables ?? '—'} ${t('جدول', 'tables')}`,
            },
          ].map((kpi, i) => (
            <motion.div key={i} variants={fadeUp} className="bg-white/10 rounded-xl p-3 border border-white/10 hover:bg-white/15 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className="w-4 h-4 text-white/70" />
                <span className="text-[10px] text-white/60 font-medium">{kpi.label}</span>
              </div>
              <div className="text-xl font-bold text-white tabular-nums">{kpi.value}</div>
              <div className="text-[10px] text-white/50 mt-0.5">{kpi.sub}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2: OCCUPATION SUPPLY-DEMAND COMPARISON                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* UNIFIED: ISCO Groups + Occupation Detail in one section */}
      {!isHidden('occupation_chart') && (
      <div style={sectionStyle('occupation_chart')}>
      <DataStory title="Supply vs Demand by Occupation" quality="official+generated"
        method="ISCO group level = REAL Bayanat census data. Specific occupations = ESTIMATED (proportionally distributed). Click any ISCO group to filter. Click any occupation for skill breakdown."
        tables={[{name:'fact_supply_talent_agg',label:'Employment Census (842K)'},{name:'fact_demand_vacancies_agg',label:'Job Postings (37K)'},{name:'fact_occupation_skills',label:'Occupation Skills (322K)'}]}
        caveats="Supply (2015-2019) and demand (2024-2025) are from different time periods."
        sourceUrl="https://bayanat.ae/en/dataset?groups=employment-labour">
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 space-y-5">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t('العرض والطلب حسب المهنة', 'Supply vs Demand by Occupation')}</h2>
            <p className="text-[11px] text-gray-400">{t('انقر على فئة لتصفية المهن أدناه • انقر على مهنة لعرض المهارات', 'Click a group to filter occupations below • Click an occupation for skill breakdown')}</p>
          </div>
          <span className="text-[10px] text-gray-400">{occComparison?.total ?? '—'} {t('مهنة', 'occupations')}</span>
        </div>

        {/* ISCO Group Chart */}
        {(iscoGroups?.groups?.length ?? 0) > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">{t('فئات المهن — بيانات حقيقية', 'Occupation Groups — Real Data')}</h3>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">REAL</span>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={iscoGroups.groups} layout="vertical" margin={{ left: 155, right: 60 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#4A5568' }} width={150} />
                <Tooltip content={({ payload }) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                      <p className="font-semibold mb-1">{d?.name} (ISCO {d?.code})</p>
                      <p className="text-[#007DB5]">{t('العمال', 'Workers')}: <b>{formatCompact(d?.workers)}</b></p>
                      <p className="text-[#003366]">{t('الوظائف', 'Jobs')}: <b>{formatCompact(d?.jobs)}</b></p>
                      <p className="text-gray-400">{t('النسبة', 'Ratio')}: {d?.ratio}%</p>
                    </div>
                  );
                }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="workers" name={t('العمال (تعداد)', 'Workers (census)')} fill="#007DB5" radius={[0, 3, 3, 0]} barSize={12} />
                <Bar dataKey="jobs" name={t('الوظائف (LinkedIn)', 'Jobs (LinkedIn)')} fill="#003366" radius={[0, 3, 3, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Divider + subtitle for detailed breakdown */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xs font-semibold text-gray-500 uppercase">{t('تفصيل المهن', 'Occupation Detail')}</h3>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">ESTIMATED</span>
          </div>
          <p className="text-[10px] text-gray-400 mb-3">{t('أرقام تقديرية — موزعة نسبياً من بيانات الفئات أعلاه', 'Estimated — proportionally distributed from group data above')}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <input type="text" value={occSearch} onChange={e => { setOccSearch(e.target.value); setOccPage(1); setSelectedOccId(null); }}
            placeholder={t('بحث عن مهنة...', 'Search occupation...')}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-[#003366]/20" />
          <select value={occRegion} onChange={e => { setOccRegion(e.target.value); setOccPage(1); setSelectedOccId(null); }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="">{t('كل المناطق', 'All Regions')}</option>
            {(expFilters?.regions || []).map((r: any) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {occSearch && <button onClick={() => { setOccSearch(''); setOccPage(1); }} className="text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>}

          {/* Sort */}
          <select value={occSort} onChange={e => { setOccSort(e.target.value); setOccPage(1); }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5">
            <option value="demand_jobs">{t('ترتيب: الوظائف', 'Sort: Jobs')}</option>
            <option value="supply_workers">{t('ترتيب: العمال', 'Sort: Workers')}</option>
            <option value="gap">{t('ترتيب: الفجوة', 'Sort: Gap')}</option>
            <option value="skill_count">{t('ترتيب: المهارات', 'Sort: Skills')}</option>
          </select>
          <button onClick={() => { setOccOrder(o => o === 'desc' ? 'asc' : 'desc'); setOccPage(1); }}
            className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50">
            {occOrder === 'desc' ? '↓ Desc' : '↑ Asc'}
          </button>
        </div>

        {/* Occupation Chart — horizontal bars with workers (teal) vs jobs (navy) */}
        {(occComparison?.occupations || []).length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={Math.max(400, (occComparison?.occupations?.length || 1) * 32)}>
              <BarChart
                data={(occComparison?.occupations || []).map((o: any) => ({
                  ...o,
                  name: (o.occupation || '').length > 25 ? o.occupation.slice(0, 23) + '...' : o.occupation,
                  ratio: o.supply_workers > 0 ? `${(o.demand_jobs / o.supply_workers * 100).toFixed(2)}%` : o.demand_jobs > 0 ? '∞' : '—',
                }))}
                layout="vertical"
                margin={{ left: 160, right: 60, top: 5, bottom: 5 }}
                onClick={(data: any) => {
                  const id = data?.activePayload?.[0]?.payload?.occupation_id;
                  if (id) setSelectedOccId(selectedOccId === id ? null : id);
                }}
              >
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis
                  type="category" dataKey="name" width={155}
                  tick={({ x, y, payload }: any) => {
                    const occ = (occComparison?.occupations || []).find((o: any) =>
                      ((o.occupation || '').length > 25 ? o.occupation.slice(0, 23) + '...' : o.occupation) === payload.value
                    );
                    const isSelected = occ?.occupation_id === selectedOccId;
                    return (
                      <text
                        x={x} y={y} textAnchor="end" dominantBaseline="middle"
                        fill={isSelected ? '#003366' : '#4A5568'}
                        fontSize={10}
                        fontWeight={isSelected ? 700 : 400}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (occ?.occupation_id) setSelectedOccId(selectedOccId === occ.occupation_id ? null : occ.occupation_id);
                        }}
                      >
                        {payload.value}
                      </text>
                    );
                  }}
                />
                <Tooltip content={({ payload }: any) => {
                  if (!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                      <p className="font-semibold mb-1">{d?.occupation}</p>
                      <p className="text-[#007DB5]">{t('العمال', 'Workers')}: <b>{formatCompact(d?.supply_workers)}</b></p>
                      <p className="text-[#003366]">{t('الوظائف', 'Jobs')}: <b>{formatCompact(d?.demand_jobs)}</b></p>
                      <p className="text-gray-400">{t('النسبة', 'Ratio')}: {d?.ratio}</p>
                      <p className="text-gray-400">{t('المهارات', 'Skills')}: {d?.skills}</p>
                      <p className="text-[10px] text-gray-300 mt-1 border-t pt-1">{t('انقر لعرض المهارات', 'Click for skill breakdown')}</p>
                    </div>
                  );
                }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="supply_workers" name={t('العمال الموظفون', 'Employed Workers')} fill="#007DB5" radius={[0, 3, 3, 0]} barSize={12} cursor="pointer"
                  onClick={(data: any) => { if (data?.occupation_id) setSelectedOccId(selectedOccId === data.occupation_id ? null : data.occupation_id); }} />
                <Bar dataKey="demand_jobs" name={t('الوظائف المنشورة', 'Job Postings')} fill="#003366" radius={[0, 3, 3, 0]} barSize={12} cursor="pointer"
                  onClick={(data: any) => { if (data?.occupation_id) setSelectedOccId(selectedOccId === data.occupation_id ? null : data.occupation_id); }} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[9px] text-gray-400 mt-1">{t('انقر على أي مهنة لعرض تفاصيل المهارات', 'Click any occupation bar to see skill details')} • {t('المصدر', 'Source')}: Bayanat (workers) + LinkedIn (jobs)</p>
          </>
        ) : occLoading ? (
          <div className="h-[400px] flex items-center justify-center text-gray-400">{t('جاري التحميل...', 'Loading...')}</div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-gray-400">{t('لا توجد نتائج', 'No results')}</div>
        )}

        {/* Pagination */}
        {(occComparison?.pages ?? 0) > 1 && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <span className="text-[10px] text-gray-400">
              {t('صفحة', 'Page')} {occComparison?.page} / {occComparison?.pages} ({occComparison?.total} {t('مهنة', 'occupations')})
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setOccPage(1)} disabled={occPage === 1} className="px-2 py-1 text-[10px] rounded hover:bg-gray-100 disabled:opacity-30">⟨⟨</button>
              <button onClick={() => setOccPage(p => Math.max(1, p - 1))} disabled={occPage === 1} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30">⟨</button>
              <input type="number" min={1} max={occComparison?.pages || 1} value={occPage}
                onChange={e => { const v = parseInt(e.target.value); if (v >= 1 && v <= (occComparison?.pages || 1)) { setOccPage(v); setSelectedOccId(null); } }}
                className="w-14 px-2 py-1 text-xs text-center border border-gray-200 rounded tabular-nums" />
              <button onClick={() => setOccPage(p => Math.min(occComparison?.pages || 1, p + 1))} disabled={occPage === (occComparison?.pages || 1)} className="px-2 py-1 text-xs rounded hover:bg-gray-100 disabled:opacity-30">⟩</button>
              <button onClick={() => setOccPage(occComparison?.pages || 1)} disabled={occPage === (occComparison?.pages || 1)} className="px-2 py-1 text-[10px] rounded hover:bg-gray-100 disabled:opacity-30">⟩⟩</button>
            </div>
          </div>
        )}

        {/* Skill Drill-Down — 3-column heatmap comparison */}
        {selectedOccId && occSkillsLoading && (
          <div className="p-5 rounded-xl bg-gray-50 border border-gray-100 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-[#003366]" />
            <span className="text-xs text-gray-500">{t('جاري تحميل المهارات...', 'Loading skill details...')}</span>
          </div>
        )}
        {selectedOccId && occSkills && !occSkillsLoading && (
          <div className="p-5 rounded-xl bg-gray-50 border border-gray-100 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{occSkills.occupation?.title}</h3>
                <p className="text-[10px] text-gray-400">
                  ISCO: {occSkills.occupation?.isco} •
                  {occSkills.total_skills} ESCO skills ({occSkills.essential_count} essential, {occSkills.total_skills - occSkills.essential_count} optional) •
                  <span className="text-[#007DB5] font-semibold"> {occSkills.supplied_count} taught in courses</span> •
                  <span className="text-gray-500"> {occSkills.total_skills - occSkills.supplied_count} NOT taught</span>
                </p>
              </div>
              <button onClick={() => setSelectedOccId(null)} className="p-1.5 rounded-lg hover:bg-gray-200"><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            {/* 3 KPI summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-white border border-gray-100 text-center">
                <div className="text-lg font-bold text-gray-900">{occSkills.total_skills}</div>
                <div className="text-[9px] text-gray-500">{t('مهارات ESCO المطلوبة', 'ESCO Skills Required')}</div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100 text-center">
                <div className="text-lg font-bold text-[#003366]">{occSkills.essential_count}</div>
                <div className="text-[9px] text-gray-500">{t('مطلوبة من الصناعة', 'Industry Essential')}</div>
              </div>
              <div className="p-3 rounded-lg bg-white border border-gray-100 text-center">
                <div className="text-lg font-bold text-[#007DB5]">{occSkills.supplied_count}</div>
                <div className="text-[9px] text-gray-500">{t('تُدرَّس في الجامعات', 'Taught in Universities')}</div>
              </div>
            </div>

            {/* Skills Gap Summary — Demanded but NOT Taught vs Taught but NOT Demanded */}
            {(() => {
              const skills = occSkills.skills || [];
              const demandedNotTaught = skills.filter((s: any) => s.demand_jobs > 0 && s.supply_courses === 0);
              const taughtNotDemanded = skills.filter((s: any) => s.supply_courses > 0 && s.demand_jobs === 0);
              return (demandedNotTaught.length > 0 || taughtNotDemanded.length > 0) ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Demanded but NOT taught */}
                  {demandedNotTaught.length > 0 && (
                    <div className="p-3 rounded-lg bg-[#C9A84C]/5 border border-[#C9A84C]/15">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-[#C9A84C]" />
                        <h5 className="text-[10px] font-bold text-[#C9A84C] uppercase">
                          {t('مهارات مطلوبة ولكن غير مُدرَّسة', 'Skills Demanded but NOT Taught')}
                          <span className="ml-1 text-xs font-bold">({demandedNotTaught.length})</span>
                        </h5>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {demandedNotTaught.slice(0, 12).map((s: any) => (
                          <span key={s.skill_id} className="text-[9px] px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C] border border-[#C9A84C]/20">
                            {s.skill} <span className="font-bold">({formatCompact(s.demand_jobs)})</span>
                          </span>
                        ))}
                        {demandedNotTaught.length > 12 && (
                          <span className="text-[9px] px-2 py-0.5 text-gray-400">+{demandedNotTaught.length - 12} {t('أخرى', 'more')}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Taught but NOT demanded */}
                  {taughtNotDemanded.length > 0 && (
                    <div className="p-3 rounded-lg bg-[#007DB5]/5 border border-[#007DB5]/15">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-[#007DB5]" />
                        <h5 className="text-[10px] font-bold text-[#007DB5] uppercase">
                          {t('مهارات مُدرَّسة ولكن غير مطلوبة', 'Skills Taught but NOT Demanded')}
                          <span className="ml-1 text-xs font-bold">({taughtNotDemanded.length})</span>
                        </h5>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {taughtNotDemanded.slice(0, 12).map((s: any) => (
                          <span key={s.skill_id} className="text-[9px] px-2 py-0.5 rounded-full bg-[#007DB5]/10 text-[#007DB5] border border-[#007DB5]/20">
                            {s.skill} <span className="font-bold">({s.supply_courses} {t('مقررات', 'courses')})</span>
                          </span>
                        ))}
                        {taughtNotDemanded.length > 12 && (
                          <span className="text-[9px] px-2 py-0.5 text-gray-400">+{taughtNotDemanded.length - 12} {t('أخرى', 'more')}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            {/* Heatmap table — all skills with 3 columns */}
            <div className="overflow-auto max-h-[350px]">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-semibold text-gray-500 w-[35%]">{t('المهارة', 'Skill')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500 w-[10%]">{t('النوع', 'Type')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-[#003366] w-[15%]">{t('مطلوبة ESCO', 'ESCO Required')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-[#003366] w-[15%]">{t('طلب الصناعة', 'Industry Demand')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-[#007DB5] w-[15%]">{t('عرض التعليم', 'Education Supply')}</th>
                    <th className="text-center py-2 px-2 font-semibold text-gray-500 w-[10%]">{t('الحالة', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(occSkills.skills || []).map((s: any) => {
                    const hasIndustry = s.demand_jobs > 0;
                    const hasCourses = s.supply_courses > 0;
                    const isEssential = s.relation === 'essential';
                    // Heatmap color: green = both sides, amber = demanded not taught, gray = optional
                    const rowBg = hasCourses && hasIndustry ? 'bg-[#007DB5]/5'
                      : hasIndustry && !hasCourses ? 'bg-[#C9A84C]/8'
                      : 'bg-white';
                    return (
                      <tr key={s.skill_id} className={`border-b border-gray-100 ${rowBg}`}>
                        <td className="py-1.5 px-2 text-gray-800 truncate max-w-[200px]" title={s.skill}>{s.skill}</td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                            s.type === 'knowledge' ? 'bg-[#003366]/10 text-[#003366]'
                            : s.type === 'technology' ? 'bg-[#C9A84C]/10 text-[#C9A84C]'
                            : 'bg-[#007DB5]/10 text-[#007DB5]'
                          }`}>{(s.type || '').replace('skill/competence','skill')}</span>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className={`inline-block w-5 h-5 rounded-full text-[8px] font-bold leading-5 text-center ${
                            isEssential ? 'bg-[#003366] text-white' : 'bg-gray-200 text-gray-500'
                          }`}>{isEssential ? 'E' : 'O'}</span>
                        </td>
                        <td className="py-1.5 px-2 text-center font-semibold tabular-nums">
                          {hasIndustry ? (
                            <span className="text-[#003366]">{formatCompact(s.demand_jobs)}</span>
                          ) : (
                            <span className="text-gray-300">0</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center font-semibold tabular-nums">
                          {hasCourses ? (
                            <span className="text-[#007DB5]">{s.supply_courses} {t('مقرر', 'courses')}</span>
                          ) : (
                            <span className="text-gray-300">{t('لا يوجد', 'none')}</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          {hasCourses && hasIndustry ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#007DB5]/10 text-[#007DB5] font-semibold">{t('متطابق', 'Match')}</span>
                          ) : hasIndustry && !hasCourses ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#C9A84C]/15 text-[#C9A84C] font-semibold">{t('فجوة', 'Gap')}</span>
                          ) : (
                            <span className="text-[9px] text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[9px] text-gray-400 pt-2 border-t border-gray-200">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#007DB5]/10 border border-[#007DB5]/20" /> {t('متطابق — مطلوب ومُدرَّس', 'Match — demanded & taught')}</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#C9A84C]/15 border border-[#C9A84C]/20" /> {t('فجوة — مطلوب ولكن غير مُدرَّس', 'Gap — demanded but NOT taught')}</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full bg-[#003366] text-white text-[7px] text-center leading-4 font-bold">E</span> {t('أساسي', 'Essential')}</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded-full bg-gray-200 text-gray-500 text-[7px] text-center leading-4 font-bold">O</span> {t('اختياري', 'Optional')}</span>
            </div>
          </div>
        )}

        <InsightPanel
          explanation={t(
            'يقارن هذا الجدول عدد العمال الموظفين في كل مهنة مع عدد الوظائف المنشورة. انقر على أي مهنة لعرض المهارات المطلوبة والمتوفرة.',
            'This table compares employed workers per occupation with job postings. Click any occupation to see required vs available skills.'
          )}
          insight={occComparison?.total ? t(
            `${occComparison.total} مهنة لديها بيانات. الطلب من LinkedIn (2024-2025)، العرض من بيانات التوظيف (2015-2019).`,
            `${occComparison.total} occupations with data. Demand from LinkedIn (2024-2025), Supply from Bayanat employment census (2015-2019).`
          ) : undefined}
          severity="info" compact
        />
      </div>
      </DataStory>
      </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2b: TIMELINE — Past, Present & Future (filter-driven)     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isHidden('timeline') && (
      <DataStory
        title="Timeline — Past, Present & Future"
        method="PAST: Real employment census data from Bayanat/FCSC (2015-2019). FUTURE: Linear extrapolation + compound growth model with AI impact adjustment. Filter-driven — all data recalculates based on Region, ISCO Group, and Occupation selections."
        quality="official+model-generated"
        tables={[{name:'fact_supply_talent_agg', label:'Employment Census (842K)'}, {name:'fact_demand_vacancies_agg', label:'Job Postings (37K)'}, {name:'vw_forecast_demand', label:'Forecast Model (768)'}]}
        caveats="Supply (2015-2019) and demand (2024-2025) are from different time periods. Future projections are model-generated estimates with ±15% confidence bands."
      >
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 space-y-4" style={sectionStyle('timeline')}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">{t('الجدول الزمني — الماضي والحاضر والمستقبل', 'Timeline — Past, Present & Future')}</h2>
            <p className="text-[10px] text-gray-400">{t('اختر الفلاتر لتخصيص العرض — كل شيء يتغير حسب اختيارك', 'Select filters to customize — everything updates based on your selection')}</p>
          </div>
        </div>

        {/* FILTERS — Region, Occupation search, ISCO Group */}
        <div className="flex flex-wrap gap-2 items-center p-3 bg-gray-50 rounded-xl">
          <select value={tlRegion} onChange={e => setTlRegion(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">{t('كل المناطق', 'All Regions')}</option>
            {(expFilters?.regions || []).map((r: any) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          <select value={tlIscoGroup} onChange={e => setTlIscoGroup(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">{t('كل فئات المهن', 'All ISCO Groups')}</option>
            <option value="1">1 — Managers</option>
            <option value="2">2 — Professionals</option>
            <option value="3">3 — Technicians</option>
            <option value="4">4 — Clerical Support</option>
            <option value="5">5 — Service & Sales</option>
            <option value="6">6 — Agriculture</option>
            <option value="7">7 — Craft & Trade</option>
            <option value="8">8 — Machine Operators</option>
            <option value="9">9 — Elementary</option>
          </select>

          <div className="relative" ref={occDropdownRef}>
            <input type="text"
              value={tlOccInput}
              onChange={e => {
                setTlOccInput(e.target.value);
                setTlOccDropdownOpen(true);
                if (!e.target.value) { setTlOccupation(''); }
              }}
              onFocus={() => tlOccInput.length >= 2 && setTlOccDropdownOpen(true)}
              onBlur={() => setTimeout(() => setTlOccDropdownOpen(false), 200)}
              placeholder={t('بحث عن مهنة...', 'Search occupation...')}
              className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white w-52" />
            {tlOccDropdownOpen && (occSuggestions?.occupations?.length ?? 0) > 0 && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
                {occSuggestions.occupations.map((o: any) => (
                  <button key={o.id} type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[#003366]/5 flex items-center justify-between border-b border-gray-50 last:border-0"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      setTlOccupation(o.title);
                      setTlOccInput(o.title);
                      setTlOccDropdownOpen(false);
                    }}>
                    <span className="text-gray-800 truncate">{o.title}</span>
                    <span className="text-[9px] text-gray-400 ml-2 shrink-0">ISCO {o.isco}</span>
                  </button>
                ))}
              </div>
            )}
            {tlOccInput.length >= 2 && (occSuggestions?.occupations?.length ?? 0) === 0 && tlOccDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                <p className="text-[10px] text-gray-400">{t('لا توجد نتائج', 'No occupations found')}</p>
              </div>
            )}
          </div>

          {(tlRegion || tlOccupation || tlIscoGroup || tlSelectedYear) && (
            <button onClick={() => { setTlRegion(''); setTlOccupation(''); setTlOccInput(''); setTlIscoGroup(''); setTlSelectedYear(null); }}
              className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 border border-gray-200 rounded-lg">
              ✕ {t('مسح الكل', 'Clear all')}
            </button>
          )}

          {/* Active filter badges */}
          <div className="flex gap-1 ml-auto flex-wrap">
            {tlRegion && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#003366]/10 text-[#003366]">{tlRegion}</span>}
            {tlIscoGroup && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#007DB5]/10 text-[#007DB5]">ISCO {tlIscoGroup}</span>}
            {tlOccupation && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]">{tlOccupation}</span>}
            {tlSelectedYear && (
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-1">
                {tlSelectedYear}
                <button onClick={() => setTlSelectedYear(null)} className="hover:text-emerald-900 leading-none">✕</button>
              </span>
            )}
          </div>
        </div>

        {/* FALLBACK NOTE — when supply data unavailable for specific occupation */}
        {timeline?.supply_fallback_note && (
          <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
            <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <p className="text-[10px] text-amber-700">{timeline.supply_fallback_note}</p>
          </div>
        )}

        {/* UNIFIED CHART — Past (left) + Future (right) on same axis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* PAST: Employment trend */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">{t('الماضي — العمالة', 'Past — Employment')}</h3>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">2015-2019</span>
            </div>
            {(timeline?.past?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart
                  data={timeline.past}
                  onClick={(e) => {
                    const yr = e?.activePayload?.[0]?.payload?.year;
                    if (yr) setTlSelectedYear(tlSelectedYear === yr ? null : yr);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <defs>
                    <linearGradient id="gTlPast" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#007DB5" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#007DB5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs">
                        <p className="font-semibold">{d?.year}{tlSelectedYear === d?.year ? ' ✓' : ''}</p>
                        <p className="text-[#007DB5]">{t('العمال', 'Workers')}: <b>{formatCompact(d?.workers)}</b></p>
                        <p className="text-gray-400">{d?.occupations} {t('مهنة', 'occupations')}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{tlSelectedYear === d?.year ? t('انقر للإلغاء', 'Click to deselect') : t('انقر للتصفية', 'Click to filter')}</p>
                      </div>
                    );
                  }} />
                  <Area
                    type="monotone"
                    dataKey="workers"
                    fill="url(#gTlPast)"
                    stroke="#007DB5"
                    strokeWidth={2}
                    name={t('العمال', 'Workers')}
                    dot={(props: any) => {
                      const isSelected = props.payload?.year === tlSelectedYear;
                      return <circle key={props.key} cx={props.cx} cy={props.cy} r={isSelected ? 6 : 3} fill={isSelected ? '#003366' : '#007DB5'} stroke={isSelected ? '#fff' : 'none'} strokeWidth={2} />;
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">{t('لا توجد بيانات', 'No data for this filter')}</div>
            )}
          </div>

          {/* FUTURE: Projected supply vs demand */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">{t('المستقبل — توقعات', 'Future — Projections')}</h3>
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">2026-2030</span>
            </div>
            {(timeline?.future?.length ?? 0) > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart
                  data={timeline.future}
                  onClick={(e) => {
                    const yr = e?.activePayload?.[0]?.payload?.year;
                    if (yr) setTlSelectedYear(tlSelectedYear === yr ? null : yr);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs space-y-1">
                        <p className="font-semibold">{d?.year}{tlSelectedYear === d?.year ? ' ✓' : ''} <span className="text-amber-600">(forecast)</span></p>
                        <div className="border-b border-gray-100 pb-1">
                          <p className="text-[9px] text-gray-400 font-semibold uppercase">Baseline</p>
                          <p className="text-[#007DB5]">Supply: <b>{formatCompact(d?.supply_projected)}</b></p>
                          <p className="text-[#003366]">Demand: <b>{formatCompact(d?.demand_projected)}</b></p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-400 font-semibold uppercase">AI + External Factors</p>
                          <p className="text-[#00A86B]">Supply: <b>{formatCompact(d?.supply_with_factors)}</b></p>
                          <p className="text-[#C9A84C]">Demand: <b>{formatCompact(d?.demand_with_factors)}</b></p>
                        </div>
                        <p className="text-[9px] text-gray-400 mt-1">{tlSelectedYear === d?.year ? t('انقر للإلغاء', 'Click to deselect') : t('انقر للتصفية', 'Click to filter')}</p>
                      </div>
                    );
                  }} />
                  <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 9 }} />
                  {/* Baseline supply */}
                  <Area type="monotone" dataKey="supply_projected" name={t('عرض أساسي', 'Supply (baseline)')}
                    fill="#007DB5" fillOpacity={0.08} stroke="#007DB5" strokeWidth={1.5} strokeDasharray="4 3"
                    dot={{ r: 2, fill: '#007DB5' }} />
                  {/* AI + External adjusted supply — the primary line */}
                  <Area type="monotone" dataKey="supply_with_factors" name={t('عرض معدّل', 'Supply (AI + factors)')}
                    fill="#00A86B" fillOpacity={0.12} stroke="#00A86B" strokeWidth={2.5}
                    dot={(props: any) => {
                      const isSelected = props.payload?.year === tlSelectedYear;
                      return <circle key={props.key} cx={props.cx} cy={props.cy} r={isSelected ? 6 : 3} fill={isSelected ? '#003366' : '#00A86B'} stroke={isSelected ? '#fff' : 'none'} strokeWidth={2} />;
                    }} />
                  {/* Baseline demand */}
                  <Line type="monotone" dataKey="demand_projected" name={t('طلب أساسي', 'Demand (baseline)')}
                    stroke="#003366" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2, fill: '#003366' }} />
                  {/* AI + External adjusted demand — the primary line */}
                  <Line type="monotone" dataKey="demand_with_factors" name={t('طلب معدّل', 'Demand (AI + factors)')}
                    stroke="#C9A84C" strokeWidth={2.5} dot={{ r: 3, fill: '#C9A84C' }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">{t('لا توجد بيانات', 'No data for this filter')}</div>
            )}
          </div>
        </div>

        {/* AI ANALYSIS — Auto-generated on every filter change */}
        {(tlExplanation || tlExplLoading || tlWebFactors || tlWebLoading) && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            {/* PART 1: ML Model Explainability */}
            <div className="bg-gradient-to-r from-[#003366]/5 to-[#007DB5]/5 border border-[#003366]/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-[#003366] flex items-center justify-center">
                  <Cpu className="w-3 h-3 text-white" />
                </div>
                <h4 className="text-xs font-semibold text-[#003366]">{t('تحليل النموذج والبيانات', 'Model Analysis & Data Reasoning')}</h4>
                {tlExplLoading && <span className="w-3 h-3 border-2 border-[#003366]/30 border-t-[#003366] rounded-full animate-spin" />}
              </div>
              {tlExplLoading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-full" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-4/5" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-3/5" />
                  <div className="h-3 bg-gray-200 rounded animate-pulse w-[70%]" />
                </div>
              ) : tlExplanation ? (
                renderAnalysisSections(tlExplanation)
              ) : null}
            </div>

            {/* PART 2: External Factors from Web Search (Tavily) */}
            <div className="bg-gradient-to-r from-[#C9A84C]/5 to-[#007DB5]/5 border border-[#C9A84C]/15 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-[#C9A84C] flex items-center justify-center">
                  <Globe className="w-3 h-3 text-white" />
                </div>
                <h4 className="text-xs font-semibold text-[#C9A84C]">{t('عوامل خارجية — مصادر الويب', 'External Factors — Web Sources')}</h4>
                {tlWebLoading && <span className="w-3 h-3 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />}
              </div>
              {tlWebLoading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-[#C9A84C]/10 rounded animate-pulse w-full" />
                  <div className="h-3 bg-[#C9A84C]/10 rounded animate-pulse w-[90%]" />
                  <div className="h-3 bg-[#C9A84C]/10 rounded animate-pulse w-4/5" />
                  <div className="h-3 bg-[#C9A84C]/10 rounded animate-pulse w-[65%]" />
                </div>
              ) : tlWebFactors ? (
                renderWebFactors(tlWebFactors)
              ) : (
                <p className="text-[10px] text-gray-400 italic">{t('لم يتم العثور على عوامل خارجية', 'No external factors found for this combination')}</p>
              )}
            </div>
          </div>
        )}

        <InsightPanel
          explanation={t(
            'كل تغيير في الفلاتر يولّد تحليلاً تلقائياً: (1) تفسير نموذج التوقعات — كيف تم حساب الأرقام (2) عوامل خارجية من أخبار ومقالات حديثة عبر البحث المباشر',
            'Every filter change auto-generates: (1) Model explainability — how projections were calculated, growth rates, assumptions (2) External factors from live web search — news, policies, trends with sources'
          )}
          severity="info" compact
        />
      </div>
      </DataStory>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2b: SKILLS GAP SNAPSHOT                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isHidden('skills_gap_snapshot') && skillComp && (
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          style={sectionStyle('skills_gap_snapshot')}
          className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('لمحة عن فجوة المهارات', 'Skills Gap Snapshot')}</h3>
              <p className="text-[10px] text-gray-400">{t('المهارات الأكثر طلبا ولكن غير مُدرَّسة مقابل المغطاة', 'Top demanded skills — gap vs covered status')}</p>
            </div>
            {/* Search input */}
            <div className="relative w-56">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={snapSearch}
                onChange={e => setSnapSearch(e.target.value)}
                placeholder={t('ابحث عن مهارة...', 'Search skills...')}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#003366]/30 focus:border-[#003366]/40 bg-gray-50"
              />
              {snapSearch && (
                <button onClick={() => setSnapSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3 mb-4 mt-3">
            <div className="text-center p-3 rounded-xl bg-[#DE350B]/5 border border-[#DE350B]/10">
              <div className="text-xl font-bold text-[#DE350B]">{skillComp?.stats?.demand_only_count ?? 0}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{t('فجوة — مطلوبة ولكن غير مُدرَّسة', 'Gap — demanded NOT taught')}</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-[#00875A]/5 border border-[#00875A]/10">
              <div className="text-xl font-bold text-[#00875A]">{skillComp?.stats?.overlap_count ?? 0}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{t('مغطاة — مطلوبة ومُدرَّسة', 'Matched — both sides')}</div>
            </div>
            <div className="text-center p-3 rounded-xl bg-[#0052CC]/5 border border-[#0052CC]/10">
              <div className="text-xl font-bold text-[#0052CC]">{skillComp?.stats?.supply_only_count ?? 0}</div>
              <div className="text-[9px] text-gray-500 mt-0.5">{t('فائض — مُدرَّسة ولكن غير مطلوبة', 'Oversupply — taught only')}</div>
            </div>
          </div>

          {/* Two columns: Gap skills vs Matched skills */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Critical gaps — demanded but NOT taught */}
            {(() => {
              const gapList = (skillComp?.demand_only || []).filter((s: any) =>
                !snapSearch || s.skill?.toLowerCase().includes(snapSearch.toLowerCase())
              );
              const gapVisible = snapExpandGap ? gapList : gapList.slice(0, 10);
              const gapMax = gapList[0]?.demand || 1;
              return (
                <div className="rounded-xl bg-[#DE350B]/3 border border-[#DE350B]/10 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-bold text-[#DE350B] uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#DE350B]" />
                      {t('أهم فجوات المهارات', 'Top Skill Gaps — Demanded but NOT Taught')}
                    </h4>
                    <span className="text-[9px] text-gray-400">{gapList.length} {t('مهارة', 'skills')}</span>
                  </div>
                  <div className={`space-y-1.5 ${snapExpandGap ? 'max-h-[400px] overflow-y-auto pr-1' : ''}`}>
                    {gapVisible.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-700 truncate flex-1">{s.skill}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#DE350B] rounded-full"
                            style={{ width: `${Math.min(100, (s.demand / gapMax) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-[#DE350B] w-12 text-right tabular-nums">{formatCompact(s.demand)}</span>
                      </div>
                    ))}
                    {gapList.length === 0 && snapSearch && (
                      <p className="text-[10px] text-gray-400 italic py-2">{t('لا توجد نتائج', 'No matching skills')}</p>
                    )}
                  </div>
                  {gapList.length > 10 && (
                    <button onClick={() => setSnapExpandGap(!snapExpandGap)}
                      className="mt-2 text-[10px] text-[#DE350B] hover:underline font-medium w-full text-center">
                      {snapExpandGap
                        ? t('عرض أقل', `Show less`)
                        : t(`عرض الكل (${gapList.length})`, `Show all ${gapList.length} skills`)}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Matched — both demanded and taught */}
            {(() => {
              const matchList = (skillComp?.overlap || []).filter((s: any) =>
                !snapSearch || s.skill?.toLowerCase().includes(snapSearch.toLowerCase())
              );
              const matchVisible = snapExpandMatch ? matchList : matchList.slice(0, 10);
              return (
                <div className="rounded-xl bg-[#00875A]/3 border border-[#00875A]/10 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] font-bold text-[#00875A] uppercase flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#00875A]" />
                      {t('مهارات مغطاة — مطلوبة ومُدرَّسة', 'Covered Skills — Demanded AND Taught')}
                    </h4>
                    <span className="text-[9px] text-gray-400">{matchList.length} {t('مهارة', 'skills')}</span>
                  </div>
                  <div className={`space-y-1.5 ${snapExpandMatch ? 'max-h-[400px] overflow-y-auto pr-1' : ''}`}>
                    {matchVisible.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-700 truncate flex-1">{s.skill}</span>
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#00875A] rounded-full"
                            style={{ width: `${Math.min(100, s.match_pct || 0)}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-[#00875A] w-12 text-right tabular-nums">{Math.round(s.match_pct || 0)}%</span>
                      </div>
                    ))}
                    {matchList.length === 0 && snapSearch && (
                      <p className="text-[10px] text-gray-400 italic py-2">{t('لا توجد نتائج', 'No matching skills')}</p>
                    )}
                  </div>
                  {matchList.length > 10 && (
                    <button onClick={() => setSnapExpandMatch(!snapExpandMatch)}
                      className="mt-2 text-[10px] text-[#00875A] hover:underline font-medium w-full text-center">
                      {snapExpandMatch
                        ? t('عرض أقل', `Show less`)
                        : t(`عرض الكل (${matchList.length})`, `Show all ${matchList.length} skills`)}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </motion.div>
      )}

      {/* Skills Gap Map — force-directed graph */}
      {!isHidden('skills_gap_map') && (
      <DataStory
        title="Skills Gap Map — Occupations & Their Essential Skills"
        method="Occupation nodes from LinkedIn job postings mapped to ESCO taxonomy. Skill connections from ESCO occupation-skill relationships (essential only, specificity ≤15 occupations). Gap/Matched status from fact_course_skills (UAE university course catalogs). Layout via D3.js force simulation."
        quality="official+research"
        tables={[{name:'fact_occupation_skills', label:'ESCO Mappings (322K)'}, {name:'fact_course_skills', label:'Course-Skill Links'}, {name:'fact_demand_vacancies_agg', label:'Job Postings (37K)'}, {name:'dim_occupation', label:'Occupations (3.9K)'}]}
        caveats="ESCO taxonomy mappings are validated via coherence checking (skills must share domain words with occupation title). Some occupations may have incorrect skill connections due to cross-walk data quality."
      >
      <motion.div variants={fadeUp} initial="hidden" animate="show"
        style={sectionStyle('skills_gap_map')}
        className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">

        {/* Filter bar */}
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-[9px] font-semibold text-gray-500 uppercase mb-1">{t('مجموعة ISCO', 'ISCO Group')}</label>
            <select value={graphIsco} onChange={e => setGraphIsco(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#003366]/30 min-w-[160px]">
              <option value="">{t('الكل', 'All Groups')}</option>
              {[
                { v: '0', l: '0 — Armed Forces' },
                { v: '1', l: '1 — Managers' },
                { v: '2', l: '2 — Professionals' },
                { v: '3', l: '3 — Technicians & Associates' },
                { v: '4', l: '4 — Clerical Support' },
                { v: '5', l: '5 — Service & Sales' },
                { v: '6', l: '6 — Agriculture & Forestry' },
                { v: '7', l: '7 — Craft & Trade' },
                { v: '8', l: '8 — Machine Operators' },
                { v: '9', l: '9 — Elementary Occupations' },
              ].map(g => <option key={g.v} value={g.v}>{g.l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-500 uppercase mb-1">{t('الإمارة', 'Region')}</label>
            <select value={graphRegion} onChange={e => setGraphRegion(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#003366]/30 min-w-[120px]">
              <option value="">{t('الكل', 'All Emirates')}</option>
              {[
                { v: 'AUH', l: 'Abu Dhabi' }, { v: 'DXB', l: 'Dubai' }, { v: 'SHJ', l: 'Sharjah' },
                { v: 'AJM', l: 'Ajman' }, { v: 'RAK', l: 'Ras Al Khaimah' }, { v: 'FUJ', l: 'Fujairah' }, { v: 'UAQ', l: 'Umm Al Quwain' },
              ].map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-500 uppercase mb-1">{t('عدد المهن', 'Occupations')}</label>
            <select value={graphOccLimit} onChange={e => setGraphOccLimit(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#003366]/30 w-[80px]">
              {[
                { v: 1030, l: 'All (1,030)' }, { v: 50, l: '50' }, { v: 30, l: '30' },
                { v: 20, l: '20' }, { v: 10, l: '10' },
              ].map(n => <option key={n.v} value={n.v}>{n.l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-semibold text-gray-500 uppercase mb-1">{t('مهارات/مهنة', 'Skills/Occ')}</label>
            <select value={graphSkillsPer} onChange={e => setGraphSkillsPer(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#003366]/30 w-[80px]">
              {[
                { v: 3, l: '3' }, { v: 5, l: '5' }, { v: 8, l: '8' },
                { v: 10, l: '10' }, { v: 15, l: '15' }, { v: 0, l: 'All' },
              ].map(n => <option key={n.v} value={n.v}>{n.l}</option>)}
            </select>
          </div>
          {(graphIsco || graphRegion || graphSelectedOccs.length > 0) && (
            <button onClick={() => { setGraphIsco(''); setGraphRegion(''); setGraphSelectedOccs([]); setGraphOccSearch(''); }}
              className="text-[10px] text-[#DE350B] hover:underline font-medium pb-1.5">
              {t('مسح الفلاتر', 'Clear all')}
            </button>
          )}
        </div>

        {/* Occupation search + selected chips */}
        <div className="mb-4">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={graphOccSearch}
              onChange={e => { setGraphOccSearch(e.target.value); setGraphOccDropdownOpen(true); }}
              onFocus={() => setGraphOccDropdownOpen(true)}
              onBlur={() => setTimeout(() => setGraphOccDropdownOpen(false), 200)}
              placeholder={t('ابحث عن مهنة وأضفها... (3,897 مهنة)', 'Search & add occupations... (3,897 available)')}
              className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#003366]/20 bg-gray-50"
            />
            {/* Browsable + searchable dropdown */}
            {graphOccDropdownOpen && graphOccOptions.length > 0 && (
              <div className="absolute z-30 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-[280px] overflow-y-auto">
                <div className="sticky top-0 bg-gray-50 px-3 py-1.5 border-b border-gray-100 text-[9px] text-gray-400 font-semibold uppercase">
                  {graphOccSearch.length >= 2
                    ? `${graphOccOptions.length} results for "${graphOccSearch}"`
                    : `${graphOccListData?.total ?? graphOccOptions.length} occupations (scroll or type to filter)`}
                </div>
                {graphOccOptions
                  .filter((r: any) => !graphSelectedOccs.some(s => s.id === r.id))
                  .slice(0, 100)
                  .map((r: any) => (
                    <button key={r.id}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[#003366]/5 flex items-center justify-between border-b border-gray-50 last:border-0 transition-colors"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => {
                        setGraphSelectedOccs(prev => [...prev, { id: r.id, title: r.title }]);
                        setGraphOccSearch('');
                        setGraphOccDropdownOpen(false);
                      }}>
                      <span className="truncate font-medium">{r.title}</span>
                      <span className="text-[9px] text-gray-400 ml-2 whitespace-nowrap flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100">ISCO {r.isco_group}</span>
                        {r.demand > 0 && <span className="text-[#003366] font-semibold">{formatCompact(r.demand)} jobs</span>}
                      </span>
                    </button>
                  ))}
                {graphOccOptions.length > 100 && (
                  <div className="px-3 py-2 text-[9px] text-gray-400 text-center italic">
                    Type to narrow results...
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Selected occupation chips */}
          {graphSelectedOccs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {graphSelectedOccs.map(occ => (
                <span key={occ.id} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-[#003366]/10 text-[#003366] font-medium">
                  {occ.title}
                  <button onClick={() => setGraphSelectedOccs(prev => prev.filter(o => o.id !== occ.id))}
                    className="hover:text-[#DE350B]">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {(skillGraph?.nodes?.length ?? 0) > 0 ? (
          <>
            <ForceGraph
              title={t('خريطة فجوة المهارات — المهن ومهاراتها الأساسية', 'Skills Gap Map — Occupations & Their Essential Skills')}
              nodes={skillGraph!.nodes}
              edges={skillGraph!.edges}
              height={700}
              showEdgeLabels={false}
              searchValue={graphSearch}
              onSearchChange={setGraphSearch}
            />
            <div className="flex flex-wrap gap-4 mt-3 px-2 text-[10px] border-t border-gray-100 pt-3">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#DE350B]" /> {t('فجوة — مطلوبة ولكن غير مُدرَّسة', 'Skill Gap — demanded but NOT taught')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#00875A]" /> {t('مغطاة — مطلوبة ومُدرَّسة', 'Matched — demanded AND taught in UAE universities')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#003366]" /> {t('مهنة محورية', 'Occupation (sized by demand)')}</span>
              <span className="text-gray-400 ml-auto">{t('انقر على أي عقدة للتفاصيل • اسحب لتحريك • مرر للتكبير', 'Click any node for details | Drag to move | Scroll to zoom')}</span>
            </div>
            <div className="mt-2 px-2 text-[9px] text-gray-400 italic">
              {t('المصدر', 'Source')}: {skillGraph?.meta?.data_source || 'ESCO Taxonomy + UAE University Catalogs'}
            </div>
          </>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('لا توجد بيانات تطابق الفلاتر', 'No validated occupations match these filters')}</p>
            <p className="text-[10px] mt-1">{t('جرب فلاتر مختلفة', 'Try different filter combinations')}</p>
          </div>
        )}
      </motion.div>
      </DataStory>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 3: SUPPLY vs DEMAND COMPARISON                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isHidden('supply_demand') && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5" style={sectionStyle('supply_demand')}>

        {/* LEFT: Education Pipeline */}
        <DataStory
          title="Education Pipeline — Enrollment Trend"
          method="Annual HE enrollment from Bayanat education CSVs (2002-2024). Gold dots = estimated."
          quality="official+estimated"
          tables={[{name:'fact_program_enrollment', label:'Enrollment (668)'}]}
          sourceUrl="https://bayanat.ae/en/dataset?groups=education"
        >
          <Link to="/supply" className="block">
          <motion.div variants={fadeUp} initial="hidden" animate="show"
            className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 hover:border-[#007DB5]/30 hover:shadow-lg transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-gray-900">{t('خط إمداد التعليم', 'Education Pipeline')}</h3>
              <span className="text-xs text-[#007DB5] flex items-center gap-1">
                {t('التفاصيل', 'Details')} <ChevronRight className="w-3 h-3" />
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">{t('اتجاه الالتحاق بالتعليم العالي', 'HE enrollment trend, 2002-2025')}</p>
            {enrollmentTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={enrollmentTrend} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradEnroll" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.navy} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={COLORS.navy} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="year" tick={AXIS_TICK_SM} />
                  <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="enrollment" name={t('الالتحاق', 'Enrollment')} fill="url(#gradEnroll)" stroke={COLORS.navy} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                {t('لا توجد بيانات', 'No enrollment data')}
              </div>
            )}
            <InsightPanel
              explanation={t(
                'يوضح هذا الرسم اتجاه خط إمداد التعليم العالي عبر السنوات.',
                'This chart tracks the higher education pipeline — how enrollment has grown over time.'
              )}
              insight={enrollmentTrend.length > 2 ? t(
                `نما الالتحاق من ${formatCompact(enrollmentTrend[0]?.enrollment)} (${enrollmentTrend[0]?.year}) إلى ${formatCompact(enrollmentTrend[enrollmentTrend.length - 1]?.enrollment)} (${enrollmentTrend[enrollmentTrend.length - 1]?.year}).`,
                `Enrollment grew from ${formatCompact(enrollmentTrend[0]?.enrollment)} (${enrollmentTrend[0]?.year}) to ${formatCompact(enrollmentTrend[enrollmentTrend.length - 1]?.enrollment)} (${enrollmentTrend[enrollmentTrend.length - 1]?.year}).`
              ) : undefined}
              severity="info" source="Bayanat Education Statistics" compact
            />
          </motion.div>
          </Link>
        </DataStory>

        {/* RIGHT: Job Market Momentum */}
        <DataStory
          title="Job Market Momentum"
          method="Monthly job postings from LinkedIn UAE scrape. 36K total."
          quality="scraped"
          tables={[{name:'fact_demand_vacancies_agg', label:'Job Vacancies (37K)'}]}
        >
          <Link to="/demand" className="block">
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }}
            className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 hover:border-[#C9A84C]/30 hover:shadow-lg transition-all cursor-pointer">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-bold text-gray-900">{t('حركة سوق العمل', 'Job Market Momentum')}</h3>
              <span className="text-xs text-[#007DB5] flex items-center gap-1">
                {t('التفاصيل', 'Details')} <ChevronRight className="w-3 h-3" />
              </span>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">{t('حجم الوظائف الشهري — آخر 24 شهراً', 'Monthly job posting volume — last 24 months')}</p>
            {demandMonthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={demandMonthly} margin={{ left: 10, right: 10, top: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradDemand" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tick={AXIS_TICK_SM} interval={Math.max(0, Math.floor(demandMonthly.length / 8))} />
                  <YAxis tick={AXIS_TICK_SM} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="count" name={t('الوظائف', 'Job Postings')} fill="url(#gradDemand)" stroke={COLORS.gold} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
                {t('لا توجد بيانات', 'No demand data')}
              </div>
            )}
            <InsightPanel
              explanation={t(
                'نشاط التوظيف الشهري من LinkedIn الإمارات.',
                'Monthly hiring activity from LinkedIn UAE. Peaks show seasonal demand surges.'
              )}
              insight={demandMonthly.length > 3 ? t(
                `${formatCompact(demand?.total_postings)} وظيفة من ${formatCompact(demand?.unique_companies)} شركة. أعلى قطاع: ${demand?.top_industries?.[0]?.industry || '—'}.`,
                `${formatCompact(demand?.total_postings)} total postings from ${formatCompact(demand?.unique_companies)} companies. Top sector: ${demand?.top_industries?.[0]?.industry || '—'}.`
              ) : undefined}
              severity="info" source="LinkedIn UAE Job Postings" compact
            />
          </motion.div>
          </Link>
        </DataStory>
      </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 4: THREE-WAY COMPARISON                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isHidden('three_way') && (
      <div style={sectionStyle('three_way')}>
      <DataStory
        title="Industry, Experience & Regional Comparison"
        method="Industries + experience from LinkedIn CSV. Emirates enrollment from Bayanat. All aggregated by category."
        quality="mixed"
        tables={[{name:'fact_demand_vacancies_agg', label:'Demand (37K)'}, {name:'fact_program_enrollment', label:'Enrollment (668)'}, {name:'dim_region', label:'Emirates (7)'}]}
      >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Top Industries */}
        <motion.div variants={fadeUp} initial="hidden" animate="show"
          className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('أعلى القطاعات توظيفاً', 'Top Industries')}</h3>
          {topIndustries.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topIndustries} layout="vertical" margin={{ left: 100, right: 20 }}>
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} />
                <YAxis type="category" dataKey="industry" tick={AXIS_TICK_SM} width={95} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name={t('وظائف', 'Jobs')} radius={[0, 4, 4, 0]}>
                  {topIndustries.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              {t('لا توجد بيانات', 'No industry data')}
            </div>
          )}
        </motion.div>

        {/* Experience Levels */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.08 }}
          className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('مستويات الخبرة المطلوبة', 'Experience Levels')}</h3>
          {expLevels.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={expLevels} margin={{ left: 0, right: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="level" tick={AXIS_TICK_SM} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip content={<ChartTooltip unit="%" />} />
                <Bar dataKey="pct" name="%" radius={[4, 4, 0, 0]}>
                  {expLevels.map((_, i) => <Cell key={i} fill={getSeriesColor(i)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              {t('لا توجد بيانات', 'No experience data')}
            </div>
          )}
        </motion.div>

        {/* Enrollment by Emirate */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.16 }}
          className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('الالتحاق حسب الإمارة', 'Enrollment by Emirate')}</h3>
          {emirateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={emirateData} margin={{ left: 60, right: 10 }} layout="vertical">
                <CartesianGrid {...GRID_PROPS} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK_SM} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis type="category" dataKey="emirate" tick={AXIS_TICK_SM} width={55} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="enrollment" name={t('طلاب', 'Students')} radius={[0, 4, 4, 0]} fill={COLORS.navy} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
              {t('لا توجد بيانات', 'No emirate data')}
            </div>
          )}
        </motion.div>
      </div>
      </DataStory>
      </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 5: KEY METRICS GRID (2x3 cards with mini visualizations)  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isHidden('metrics_grid') && (
      <div style={sectionStyle('metrics_grid')}>
      <DataStory
        title="Key Metrics Summary"
        method="Gender: Bayanat enrollment by gender. STEM: CAA program classification. AI Risk: AIOE+Frey-Osborne. Graduates: Bayanat graduate trend. Hiring: LinkedIn companies. Coverage: all DB tables."
        quality="mixed"
        tables={[{name:'fact_supply_graduates', label:'Graduates (4.2K)'}, {name:'fact_ai_exposure_occupation', label:'AI Exposure (2.3K)'}, {name:'dim_program', label:'Programs (3.9K)'}]}
      >
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Gender Split */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#003366]" />
            {t('توزيع الجنس', 'Gender Split')}
          </h4>
          {genderData.total > 0 ? (
            <div className="flex items-center gap-4">
              <div className="w-20 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: t('ذكور', 'Male'), value: genderData.male, fill: COLORS.navy },
                        { name: t('إناث', 'Female'), value: genderData.female, fill: COLORS.teal },
                      ]}
                      cx="50%" cy="50%" innerRadius={22} outerRadius={36} paddingAngle={3} dataKey="value"
                    >
                      <Cell fill={COLORS.navy} />
                      <Cell fill={COLORS.teal} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.navy }} />
                  <span className="text-gray-600">{t('ذكور', 'Male')}</span>
                  <span className="font-bold text-gray-900">{genderData.total > 0 ? (genderData.male / genderData.total * 100).toFixed(0) : 0}%</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS.teal }} />
                  <span className="text-gray-600">{t('إناث', 'Female')}</span>
                  <span className="font-bold text-gray-900">{genderData.total > 0 ? (genderData.female / genderData.total * 100).toFixed(0) : 0}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* STEM Ratio */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[#2E7D6B]" />
            {t('نسبة ستم', 'STEM Ratio')}
          </h4>
          <div className="text-2xl font-bold text-[#2E7D6B] mb-2 tabular-nums">{stemData.pct.toFixed(0)}%</div>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-[#2E7D6B] to-[#007DB5] transition-all"
              style={{ width: `${Math.min(stemData.pct, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400">
            {formatCompact(stemData.stem)} STEM {t('من', 'of')} {formatCompact(stemData.total)} {t('برامج', 'programs')}
          </p>
        </div>

        {/* AI Risk mini donut */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#0A5C8A]" />
            {t('مخاطر الذكاء', 'AI Risk')}
          </h4>
          {aiRiskDist.some(d => d.value > 0) ? (
            <div className="flex items-center gap-4">
              <div className="w-20 h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={aiRiskDist} cx="50%" cy="50%" innerRadius={22} outerRadius={36} paddingAngle={2} dataKey="value">
                      {aiRiskDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1">
                {aiRiskDist.map(d => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                    <span className="text-gray-500">{d.name}</span>
                    <span className="font-semibold text-gray-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* Graduate Output sparkline */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#C9A84C]" />
            {t('مخرجات التخرج', 'Graduate Output')}
          </h4>
          {graduateTrend.length > 0 ? (
            <>
              <div className="text-2xl font-bold text-gray-900 tabular-nums mb-1">
                {formatCompact(graduateTrend[graduateTrend.length - 1]?.graduates)}
              </div>
              <div className="h-12">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={graduateTrend} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="graduates" fill="url(#gradGrad)" stroke={COLORS.gold} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                {t('آخر سنة', 'Latest year')}: {graduateTrend[graduateTrend.length - 1]?.year}
              </p>
            </>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* Top Hiring Company */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#4A90C4]" />
            {t('أكبر جهة توظيف', 'Top Hiring Company')}
          </h4>
          {(demand?.top_companies || []).length > 0 ? (
            <div className="space-y-2">
              {(demand?.top_companies || []).slice(0, 3).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-gray-700 truncate max-w-[70%]">{c.company}</span>
                  <span className="text-xs font-bold text-[#003366] tabular-nums">{formatCompact(c.count)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">{t('لا توجد بيانات', 'No data')}</div>
          )}
        </div>

        {/* Data Coverage */}
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5">
          <h4 className="text-xs font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Database className="w-4 h-4 text-[#003366]" />
            {t('تغطية البيانات', 'Data Coverage')}
          </h4>
          <div className="text-2xl font-bold text-[#003366] tabular-nums mb-1">{formatCompact(totalRecords)}</div>
          <p className="text-xs text-gray-500">{t('سجلات موثقة', 'verified records')}</p>
          <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between text-[10px] text-gray-400">
            <span>{kb?.total_tables ?? '—'} {t('جدول', 'tables')}</span>
            <span>{formatCompact(supply?.kpis?.total_institutions)} {t('مؤسسات', 'institutions')}</span>
          </div>
        </div>
      </div>
      </DataStory>
      </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 6: KEY INSIGHTS & RECOMMENDATIONS                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {!isHidden('insights') && (
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5" style={sectionStyle('insights')}>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-5 h-5 text-[#C9A84C]" />
          <h2 className="text-base font-bold text-gray-900">{t('رؤى وتوصيات رئيسية', 'Key Insights & Recommendations')}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Insight 1: Education Pipeline */}
          <InsightPanel
            explanation={t(
              `الإمارات لديها ${formatCompact(kpis.total_institutions)} مؤسسة تقدم ${formatCompact(kpis.total_programs)} برنامج وتخرّج ${formatCompact(kpis.total_graduates)} طالب سنوياً.`,
              `UAE has ${formatCompact(kpis.total_institutions)} institutions offering ${formatCompact(kpis.total_programs)} programs, producing ${formatCompact(kpis.total_graduates)} graduates annually.`
            )}
            insight={(() => {
              const fPct = genderData.total > 0 ? (genderData.female / genderData.total * 100).toFixed(0) : '—';
              return t(
                `النساء يمثلن ${fPct}% من الالتحاق. ${Number(fPct) > 55 ? 'فجوة جنسية كبيرة — مشاركة الذكور تحتاج اهتماماً.' : 'تكافؤ شبه تام بين الجنسين.'}`,
                `Women represent ${fPct}% of enrollment. ${Number(fPct) > 55 ? 'Significant gender gap — male participation needs attention.' : 'Near gender parity in education.'}`
              );
            })()}
            recommendation={t(
              'ربط مخرجات الخريجين بالقطاعات الأكثر توظيفاً لضمان التوافق. تسريع البرامج في القطاعات ذات النقص المستمر.',
              'Cross-reference graduate output by discipline with top hiring industries. Fast-track programs in sectors with persistent shortages.'
            )}
            severity="info" source="Bayanat + CAA"
          />

          {/* Insight 2: Job Market */}
          <InsightPanel
            explanation={t(
              `${formatCompact(demand?.total_postings)} وظيفة نشطة من ${formatCompact(demand?.unique_companies)} شركة في جميع أنحاء الإمارات.`,
              `${formatCompact(demand?.total_postings)} active job postings from ${formatCompact(demand?.unique_companies)} companies across the UAE.`
            )}
            insight={(() => {
              const entry = demand?.experience_levels?.find(e => e.level?.toLowerCase().includes('entry'));
              const entryPct = entry?.pct ?? 0;
              return t(
                `الوظائف المبتدئة: ${entryPct.toFixed(0)}% من الإعلانات. ${entryPct > 40 ? 'قدرة عالية على استيعاب الخريجين.' : entryPct < 20 ? 'انخفاض فرص المبتدئين.' : 'سوق متوسط للمبتدئين.'}`,
                `Entry-level: ${entryPct.toFixed(0)}% of postings. ${entryPct > 40 ? 'Strong graduate absorption.' : entryPct < 20 ? 'Low entry-level availability — graduates may struggle.' : 'Moderate entry-level market.'}`
              );
            })()}
            recommendation={t(
              'توجيه خدمات التوظيف الجامعية نحو أعلى 3 صناعات. إنشاء شراكات مع أكبر الشركات الموظفة.',
              'Focus university career services on top 3 industries. Create employer partnership programs with the top hiring companies.'
            )}
            severity={(demand?.experience_levels?.find(e => e.level?.toLowerCase().includes('entry'))?.pct ?? 0) < 20 ? 'warning' : 'success'}
            source="LinkedIn UAE"
          />

          {/* Insight 3: AI Disruption */}
          <InsightPanel
            explanation={t(
              `${formatCompact(ai?.summary?.total_occupations)} مهنة تم تقييم تأثير الذكاء الاصطناعي عليها. ${ai?.summary?.high_risk_pct?.toFixed(0) ?? '—'}% تواجه مخاطر عالية.`,
              `${formatCompact(ai?.summary?.total_occupations)} occupations assessed for AI impact. ${ai?.summary?.high_risk_pct?.toFixed(0) ?? '—'}% face high disruption risk.`
            )}
            insight={t(
              `متوسط التعرض: ${ai?.summary?.avg_exposure?.toFixed(0) ?? '—'}%. المهن ذات المخاطر العالية تحتاج برامج تأهيل عاجلة.`,
              `Average exposure: ${ai?.summary?.avg_exposure?.toFixed(0) ?? '—'}%. High-risk occupations need urgent reskilling programs to complement AI, not compete with it.`
            )}
            recommendation={t(
              'الاستثمار في برامج تدريب تجمع بين أدوات الذكاء الاصطناعي ومهارات الحكم البشري.',
              'Invest in upskilling programs that pair AI tools with human judgment skills. High-risk occupations need human-AI collaboration training.'
            )}
            severity={(ai?.summary?.high_risk_pct ?? 0) > 30 ? 'warning' : 'info'}
            source="AIOE Index + O*NET"
          />

          {/* Insight 4: Skills Ecosystem */}
          <InsightPanel
            explanation={t(
              `${formatCompact(skillMatch?.total_skills_demanded ?? 0)} مهارة مطلوبة مقابل ${formatCompact(skillMatch?.total_skills_supplied ?? 0)} مهارة مُدرَّسة. التطابق: ${(skillMatch?.overlap_pct ?? 0).toFixed(0)}% فقط.`,
              `${formatCompact(skillMatch?.total_skills_demanded ?? 0)} skills demanded vs ${formatCompact(skillMatch?.total_skills_supplied ?? 0)} taught. Match rate: only ${(skillMatch?.overlap_pct ?? 0).toFixed(0)}%.`
            )}
            insight={t(
              `برامج ستم: ${stemData.pct.toFixed(0)}% من العروض. ${stemData.pct < 35 ? 'أقل من هدف 40% لاقتصاد المعرفة — يحتاج توسيع.' : 'على المسار الصحيح لأهداف ستم.'}`,
              `STEM programs: ${stemData.pct.toFixed(0)}% of offerings. ${stemData.pct < 35 ? 'Below the 40% target for knowledge economies — needs expansion.' : 'On track for STEM targets.'}`
            )}
            recommendation={t(
              'ربط التقنيات الساخنة من O*NET بمناهج الجامعات. أي تقنية تظهر في أكثر من 100 مهنة وليست في المناهج = فجوة تدريب.',
              'Map hot technologies from O*NET against university curricula. Any technology in >100 occupations but not in current programs = training gap.'
            )}
            severity="info" source="ESCO + O*NET + CAA"
          />
        </div>
      </div>
      )}

      {/* ── Restore banner — shows when agent has hidden/styled sections ── */}
      {(hiddenSections.size > 0 || Object.keys(sectionStyles).length > 0 || pageFontScale !== 1) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-800">
            <Lightbulb className="w-4 h-4" />
            <span>
              <strong>{hiddenSections.size}</strong> sections hidden
              {Object.keys(sectionStyles).length > 0 && <>, <strong>{Object.keys(sectionStyles).length}</strong> styled</>}
              {pageFontScale !== 1 && <>, font {pageFontScale > 1 ? 'enlarged' : 'reduced'}</>}
              {' '}by AI agent
            </span>
          </div>
          <button onClick={() => { setHiddenSections(new Set()); setSectionStyles({}); setPageFontScale(1); }}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors">
            Restore All Sections
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 7: AI RESEARCH CHATBOT + THINKING TRACES                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border border-gray-100 shadow-md rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#003366]/10"><MessageSquare className="w-5 h-5 text-[#003366]" /></div>
              <div>
                <h2 className="text-base font-bold text-gray-900">{t('محادثة البحث', 'AI Research Assistant')}</h2>
                <p className="text-[11px] text-gray-400">
                  {t('وكيل متعدد الخطوات — قواعد بيانات + بحث + تحليل + تعديل لوحة المعلومات', 'Multi-agent: DB queries + web search + insights + dashboard control')}
                </p>
              </div>
            </div>
            {/* Traces toggle */}
            <button onClick={() => setShowTraces(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                showTraces ? 'bg-[#003366]/10 text-[#003366] border-[#003366]/20' : 'bg-white text-gray-400 border-gray-200'
              }`}>
              <Activity className="w-3.5 h-3.5" />
              {t('سلسلة التفكير', 'Thinking Traces')}
            </button>
          </div>

          {/* Mode toggles */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button onClick={() => setWebSearchOn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                webSearchOn ? 'bg-[#003366] text-white border-[#003366]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#003366]/30'
              }`}>
              <Globe className="w-3.5 h-3.5" />
              {t('بحث مباشر', 'Web Search')}
              {webSearchOn && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
            </button>
            <button onClick={() => setSelfKnowledgeOn(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                selfKnowledgeOn ? 'bg-[#C9A84C] text-white border-[#C9A84C]' : 'bg-white text-gray-500 border-gray-200 hover:border-[#C9A84C]/30'
              }`}>
              <Lightbulb className="w-3.5 h-3.5" />
              {t('المعرفة الذاتية', 'Self Knowledge')}
              {selfKnowledgeOn && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            </button>
            <span className="text-[10px] text-gray-400">
              {webSearchOn && selfKnowledgeOn ? t('بحث + معرفة ذاتية', 'Web + Self Knowledge')
                : webSearchOn ? t('بحث مباشر عبر Tavily', 'Live search via Tavily')
                : selfKnowledgeOn ? t('معرفة النموذج + قاعدة البيانات', 'Model knowledge + DB')
                : t(`قاعدة بيانات فقط (${formatCompact(totalRecords)} سجل)`, `DB only (${formatCompact(totalRecords)} records)`)}
            </span>
          </div>

          {/* Suggestion chips */}
          {messages.length === 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                t('ما أكبر فجوة في المهارات في دبي؟', 'What is the biggest skill gap in Dubai?'),
                t('ما القطاعات الأكثر تأثراً بالذكاء الاصطناعي؟', 'Which sectors are most affected by AI?'),
                t('كم عدد خريجي الهندسة في الإمارات؟', 'How many engineering graduates does UAE produce?'),
                t('ما متوسط الرواتب في قطاع التكنولوجيا؟', 'What are avg salaries in the tech sector?'),
                t('أظهر لي كل الجداول المتاحة في قاعدة البيانات', 'Show me all available tables in the database'),
                t('قم بتحليل مقارن بين العرض والطلب لجميع الإمارات', 'Cross-emirate supply vs demand analysis'),
              ].map((q, i) => (
                <button key={i} onClick={() => { setInput(q); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-[#003366]/5 hover:border-[#003366]/20 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main area: Chat + optional Traces panel */}
        <div className={`flex ${showTraces ? 'divide-x divide-gray-100' : ''}`}>
          {/* Chat messages */}
          <div className={`${showTraces ? 'w-[60%]' : 'w-full'} max-h-[500px] overflow-y-auto p-5 space-y-4`}>
            {messages.map((msg, i) => (
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                  {/* Inline charts from agent — grid layout for multiple */}
                  {msg.visualizations && msg.visualizations.length > 0 && (
                    <div className={`mt-3 -mx-1 ${msg.visualizations.length > 1 ? 'grid grid-cols-1 lg:grid-cols-2 gap-2' : ''}`}>
                      {msg.visualizations.map((viz, vi) => (
                        <div key={vi} className="bg-white rounded-lg border border-gray-100 p-2">
                          <ChatVisualization spec={viz} compact />
                        </div>
                      ))}
                    </div>
                  )}
                  {!msg.visualizations && msg.visualization && (
                    <div className="mt-3 -mx-1">
                      <ChatVisualization spec={msg.visualization} compact />
                    </div>
                  )}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200/50 space-y-1">
                      {msg.citations.slice(0, 3).map((c, ci) => (
                        <div key={ci} className="flex items-start gap-1.5 text-[10px] text-gray-500">
                          <Database className="w-3 h-3 mt-0.5 shrink-0" />
                          <span><span className="font-medium">{c.source}</span>: {c.excerpt?.slice(0, 100)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming response (while generating) */}
            {isStreaming && streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-gray-50 rounded-2xl rounded-bl-md px-4 py-3 border border-gray-100">
                  <div className="text-sm leading-relaxed prose prose-sm prose-gray max-w-none
                    prose-headings:text-gray-900 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
                    prose-p:my-1.5 prose-table:text-xs prose-th:bg-[#003366]/5 prose-th:text-[#003366] prose-th:font-semibold prose-th:px-3 prose-th:py-1.5
                    prose-td:px-3 prose-td:py-1 prose-strong:text-[#003366]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripChartBlock(streamingText)}</ReactMarkdown>
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
            <div ref={chatEndRef} />
          </div>

          {/* Thinking Traces Panel */}
          {showTraces && (
            <div className="w-[40%] max-h-[500px] overflow-y-auto bg-[#FAFBFE] p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  {t('سلسلة التنفيذ', 'Execution Trace')}
                </h4>
                {traces.length > 0 && (
                  <span className="text-[9px] text-gray-400">{traces.length} steps</span>
                )}
              </div>

              {traces.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Cpu className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  <p className="text-[11px]">{t('أرسل رسالة لرؤية خطوات التنفيذ', 'Send a message to see execution steps')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {traces.map((step, i) => (
                    <div key={step.id} className={`rounded-lg border p-2.5 text-[11px] transition-all ${
                      step.type === 'thinking' ? 'bg-blue-50/50 border-blue-100' :
                      step.type === 'tool_call' ? 'bg-amber-50/50 border-amber-100' :
                      step.type === 'done' ? 'bg-green-50/50 border-green-100' :
                      step.type === 'error' ? 'bg-red-50/50 border-red-100' :
                      'bg-white border-gray-100'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {step.type === 'thinking' && <Brain className="w-3 h-3 text-blue-500" />}
                          {step.type === 'tool_call' && <FlaskConical className="w-3 h-3 text-amber-600" />}
                          {step.type === 'done' && <Crosshair className="w-3 h-3 text-green-600" />}
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

                  {/* Connection line between steps */}
                  {isStreaming && (
                    <div className="flex justify-center py-1">
                      <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t('جاري المعالجة...', 'Processing...')}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-gray-100">
          {/* Attached files chips */}
          {(attachedFiles.length > 0 || uploadFile.isPending) && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachedFiles.map(f => (
                <div key={f.file_id} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#003366]/8 border border-[#003366]/15 rounded-lg text-[11px]">
                  <Database className="w-3 h-3 text-[#003366]" />
                  <span className="font-medium text-[#003366]">{f.filename}</span>
                  <span className="text-[9px] text-gray-400">{f.summary?.slice(0, 40)}{(f.summary?.length || 0) > 40 ? '..' : ''}</span>
                  <button onClick={() => removeAttachedFile(f.file_id)} className="text-gray-400 hover:text-red-500">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {uploadFile.isPending && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-[11px]">
                  <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                  <span className="text-amber-700">Uploading...</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {/* File attachment button */}
            <input ref={fileInputRef} type="file" multiple
              accept=".xlsx,.xls,.csv,.pdf,.txt,.json,.md,.log"
              onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || uploadFile.isPending}
              title={t('إرفاق ملف (Excel, CSV, PDF, TXT)', 'Attach file (Excel, CSV, PDF, TXT)')}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-[#003366] transition-colors disabled:opacity-50"
            >
              <Layers className="w-4 h-4" />
            </button>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={attachedFiles.length > 0
                ? t('اسأل عن الملف المرفق...', 'Ask about your attached file(s)...')
                : t('اسأل أي سؤال — البيانات، التحليل، تغيير الرسوم البيانية...', 'Ask anything — data, analysis, change charts, upload files...')}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366]/40 outline-none"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <button onClick={cancelStream}
                className="px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors flex items-center gap-2">
                <X className="w-4 h-4" /> {t('إلغاء', 'Stop')}
              </button>
            ) : (
              <button onClick={sendMessage} disabled={!input.trim()}
                className="px-4 py-2.5 bg-[#003366] text-white rounded-xl text-sm font-medium hover:bg-[#003366]/90 disabled:opacity-50 transition-colors flex items-center gap-2">
                <Send className="w-4 h-4" /> {t('إرسال', 'Send')}
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            {t('وكيل ذكاء اصطناعي متعدد الأدوات', 'Multi-tool AI Agent')} | {formatCompact(totalRecords)} {t('سجل', 'records')} | 47 {t('جدول', 'tables')} | {t('إرفاق ملفات + بحث ويب + تحكم بلوحة المعلومات', 'File attachments + Web search + Dashboard control')}
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 8: QUICK NAVIGATION                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            to: '/skill-gap',
            icon: Crosshair,
            label: t('فجوة المهارات', 'Skill Gap'),
            desc: t('تحليل تفصيلي للعرض والطلب', 'Detailed supply vs demand analysis'),
            color: COLORS.navy,
          },
          {
            to: '/ai-impact',
            icon: Brain,
            label: t('تأثير الذكاء', 'AI Impact'),
            desc: t(`${formatCompact(ai?.summary?.total_occupations)} مهنة مقيّمة`, `${formatCompact(ai?.summary?.total_occupations)} occupations assessed`),
            color: COLORS.teal,
          },
          {
            to: '/forecast',
            icon: TrendingUp,
            label: t('التنبؤ', 'Forecast'),
            desc: t('توقعات العرض والطلب', 'Supply & demand predictions'),
            color: COLORS.gold,
          },
          {
            to: '/knowledge-base',
            icon: Database,
            label: t('قاعدة المعرفة', 'Knowledge Base'),
            desc: t(`${kb?.total_tables ?? '—'} جدول`, `${kb?.total_tables ?? '—'} tables`),
            color: COLORS.emerald,
          },
        ].map((nav) => (
          <motion.div key={nav.to} variants={fadeUp}>
            <Link to={nav.to}
              className="group flex flex-col items-center gap-2 p-5 rounded-2xl border border-gray-100 bg-white hover:shadow-lg hover:-translate-y-1 transition-all text-center"
            >
              <div className="p-3 rounded-xl transition-colors" style={{ background: `${nav.color}15` }}>
                <nav.icon className="w-5 h-5" style={{ color: nav.color }} />
              </div>
              <span className="text-sm font-semibold text-gray-900">{nav.label}</span>
              <span className="text-[10px] text-gray-400">{nav.desc}</span>
              <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#003366] group-hover:translate-x-1 transition-all" />
            </Link>
          </motion.div>
        ))}
      </motion.div>

      <div className="h-4" />
    </motion.div>
  ); } catch (err: any) {
    return (
      <div className="p-6">
        <div className="bg-[#003366]/5 border border-[#003366]/20 rounded-xl p-6">
          <h3 className="text-[#003366] font-semibold mb-2">{t('خطأ في العرض', 'Dashboard rendering error')}</h3>
          <pre className="text-xs text-[#1A3F5C] whitespace-pre-wrap break-all">{err?.message}</pre>
        </div>
      </div>
    );
  }
};

export default DashboardPage;
