import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useStreamChat } from '@/api/useStreamChat';
import ChatVisualization from '@/components/chat/ChatVisualization';
import { parseVisualization, stripChartBlock, type VisualizationSpec } from '@/components/chat/parseVisualization';
import {
  Send, Hexagon, Shield, ChevronDown, ChevronRight,
  Database, FileText, BarChart3, Code, Paperclip, X,
  FileSpreadsheet, File, Search, CheckSquare, Square, LogIn,
  Globe, ExternalLink, Briefcase, Brain
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Citation {
  evidence_id: string;
  source: string;
  location?: string | null;
  excerpt: string;
  source_type?: 'internal' | 'web_search' | 'job_search' | 'webpage' | 'training_knowledge';
  source_url?: string | null;
  retrieved_at?: string | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  visualization?: VisualizationSpec;
  sqlQuery?: string;
}

interface KBFile {
  id: string;
  name: string;
  type: 'csv' | 'excel' | 'json' | 'pdf' | 'parquet';
  records: string;
}

// ─── Static Data ──────────────────────────────────────────────────────────────

// Placeholder file list — will be replaced with useFiles() API hook
const kbFiles: KBFile[] = [
  { id: 'f1', name: 'MOHRE WPS Register 2026',     type: 'csv',   records: '1.25M' },
  { id: 'f2', name: 'FCSC Labour Force Survey Q4', type: 'excel', records: '340K'  },
  { id: 'f4', name: 'University Graduate Data 2025',type: 'csv',   records: '28K'   },
  { id: 'f5', name: 'ESCO Occupations Taxonomy',   type: 'json',  records: '13.8K' },
  { id: 'f6', name: 'AIOE Exposure Scores',        type: 'csv',   records: '1,016' },
  { id: 'f7', name: 'Bayanat.ae Open Data',        type: 'json',  records: '120K'  },
];

const FILE_TYPE_META: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  csv:   { icon: FileSpreadsheet, color: 'text-sgi-balanced', bg: 'bg-sgi-balanced/10' },
  excel: { icon: FileSpreadsheet, color: 'text-sgi-balanced', bg: 'bg-sgi-balanced/10' },
  json:  { icon: File,            color: 'text-gold',         bg: 'bg-gold/10'         },
  pdf:   { icon: FileText,        color: 'text-sgi-critical', bg: 'bg-sgi-critical/10' },
};

const sampleQueries = [
  { en: 'What are the top 5 skill shortages in Abu Dhabi?',   ar: 'ما هي أعلى 5 نقص في المهارات في أبوظبي؟' },
  { en: 'Show me the Emiratisation trend for the last 2 years', ar: 'أرني اتجاه التوطين لآخر عامين' },
  { en: 'Compare Dubai and Sharjah technology sectors',        ar: 'قارن قطاع التكنولوجيا في دبي والشارقة' },
  { en: 'Which occupations face the highest automation risk?', ar: 'ما المهن الأكثر عرضة لمخاطر الأتمتة؟' },
];


// ─── File Picker Modal ────────────────────────────────────────────────────────

interface FilePickerModalProps {
  pendingIds: Set<string>;
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  t: (ar: string, en: string) => string;
}

const FilePickerModal = ({ pendingIds, onToggle, onConfirm, onClose, t }: FilePickerModalProps) => {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus search on open
    const timer = setTimeout(() => searchRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, []);

  const filtered = kbFiles.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const allFilteredSelected = filtered.length > 0 && filtered.every(f => pendingIds.has(f.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      filtered.forEach(f => { if (pendingIds.has(f.id)) onToggle(f.id); });
    } else {
      filtered.forEach(f => { if (!pendingIds.has(f.id)) onToggle(f.id); });
    }
  };

  return (
    // Backdrop
    <motion.div
      key="kb-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <motion.div
        key="kb-modal-panel"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="bg-card rounded-2xl border border-border-light shadow-dropdown w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-light">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy/8 flex items-center justify-center shrink-0">
              <Database className="w-4 h-4 text-navy" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary leading-tight">
                {t('اختر ملفات المعرفة', 'Select Knowledge Base Files')}
              </h3>
              <p className="text-[11px] text-text-muted mt-0.5">
                {t('سيتم استخدام هذه الملفات كسياق للإجابة', 'These files will be used as context for answers')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface-hover transition-colors"
            aria-label={t('إغلاق', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + Select All */}
        <div className="px-5 py-3 border-b border-border-light flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('بحث في الملفات...', 'Search files...')}
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-border-light bg-surface-tertiary text-xs placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
          </div>
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 text-[11px] text-navy hover:text-navy-dark font-medium shrink-0 transition-colors"
          >
            {allFilteredSelected
              ? <CheckSquare className="w-3.5 h-3.5" />
              : <Square className="w-3.5 h-3.5" />
            }
            {allFilteredSelected ? t('إلغاء الكل', 'Deselect all') : t('تحديد الكل', 'Select all')}
          </button>
        </div>

        {/* File List */}
        <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-muted">
              {t('لا توجد ملفات مطابقة', 'No matching files')}
            </div>
          ) : (
            <ul className="divide-y divide-border-light">
              {filtered.map(file => {
                const meta = FILE_TYPE_META[file.type] ?? FILE_TYPE_META['pdf'];
                const Icon = meta.icon;
                const isSelected = pendingIds.has(file.id);

                return (
                  <li key={file.id}>
                    <button
                      onClick={() => onToggle(file.id)}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-navy/5'
                          : 'hover:bg-surface-hover'
                      }`}
                    >
                      {/* File type icon */}
                      <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-4 h-4 ${meta.color}`} />
                      </div>

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${isSelected ? 'text-navy' : 'text-primary'}`}>
                          {file.name}
                        </p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {file.type.toUpperCase()} · {file.records} {t('سجل', 'records')}
                        </p>
                      </div>

                      {/* Checkbox */}
                      <div className={`w-4.5 h-4.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isSelected
                          ? 'bg-navy border-navy'
                          : 'border-border-light bg-card'
                      }`}>
                        {isSelected && (
                          <motion.svg
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            width="10" height="10" viewBox="0 0 10 10"
                            fill="none"
                          >
                            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </motion.svg>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-light bg-surface-secondary flex items-center justify-between gap-3">
          <span className="text-[11px] text-text-muted">
            {pendingIds.size > 0
              ? `${pendingIds.size} ${t('ملف محدد', pendingIds.size === 1 ? 'file selected' : 'files selected')}`
              : t('لم يتم تحديد أي ملف', 'No files selected')
            }
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-8 px-3.5 rounded-lg border border-border-light text-xs text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {t('إلغاء', 'Cancel')}
            </button>
            <button
              onClick={onConfirm}
              className="h-8 px-4 rounded-lg bg-navy text-primary-foreground text-xs font-medium hover:bg-navy-dark transition-colors flex items-center gap-1.5"
            >
              <Database className="w-3.5 h-3.5" />
              {t('تأكيد الاختيار', 'Confirm Selection')}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Source Badge Component ──────────────────────────────────────────────────

const SOURCE_BADGE_CONFIG: Record<string, { label: string; labelAr: string; color: string; bg: string; Icon: typeof Database }> = {
  internal:           { label: 'Database',     labelAr: 'قاعدة البيانات', color: 'text-navy',         bg: 'bg-navy/10',        Icon: Database },
  web_search:         { label: 'Web Search',   labelAr: 'بحث ويب',       color: 'text-teal',         bg: 'bg-teal/10',        Icon: Globe },
  job_search:         { label: 'Live Jobs',    labelAr: 'وظائف حية',     color: 'text-gold',         bg: 'bg-gold/10',        Icon: Briefcase },
  webpage:            { label: 'Web Page',     labelAr: 'صفحة ويب',      color: 'text-teal',         bg: 'bg-teal/10',        Icon: ExternalLink },
  training_knowledge: { label: 'AI Knowledge', labelAr: 'معرفة الذكاء',  color: 'text-text-muted',   bg: 'bg-gray-100',       Icon: Brain },
};

const SourceBadge = ({ sourceType, sourceUrl, t }: { sourceType?: string; sourceUrl?: string; t: (ar: string, en: string) => string }) => {
  const config = SOURCE_BADGE_CONFIG[sourceType || 'internal'] || SOURCE_BADGE_CONFIG.internal;
  const { Icon } = config;

  const badge = (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color} ${config.bg}`}>
      <Icon className="w-2.5 h-2.5" />
      {t(config.labelAr, config.label)}
    </span>
  );

  if (sourceUrl) {
    return (
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity">
        {badge}
        <ExternalLink className="w-2.5 h-2.5 text-text-muted" />
      </a>
    );
  }
  return badge;
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ChatPage = () => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();

  // Internet search toggle
  const [internetSearch, setInternetSearch] = useState(false);

  const { streamMessage, streamingText, isStreaming, citations: streamCitations, error: streamError } = useStreamChat({
    internetSearch,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [expandedCitations, setExpandedCitations] = useState<Set<number>>(new Set());
  const [expandedSql, setExpandedSql] = useState<Set<number>>(new Set());

  // Active visualization for split layout
  const [activeVisualization, setActiveVisualization] = useState<VisualizationSpec | null>(null);

  // File selection state
  // activeFileIds — committed selection shown as chips & used in queries
  // pendingFileIds — in-modal working copy; synced from active on open
  const [activeFileIds, setActiveFileIds] = useState<Set<string>>(
    new Set(['f1', 'f2']) // default: MOHRE WPS + FCSC
  );
  const [pendingFileIds, setPendingFileIds] = useState<Set<string>>(new Set(['f1', 'f2']));
  const [modalOpen, setModalOpen] = useState(false);

  // Derived: map id → KBFile for easy lookup
  const fileById = Object.fromEntries(kbFiles.map(f => [f.id, f]));
  const activeFiles = [...activeFileIds].map(id => fileById[id]).filter(Boolean);

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openModal = () => {
    // Clone active into pending so modal edits don't affect live chips until confirmed
    setPendingFileIds(new Set(activeFileIds));
    setModalOpen(true);
  };

  const togglePending = (id: string) => {
    setPendingFileIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirmSelection = () => {
    setActiveFileIds(new Set(pendingFileIds));
    setModalOpen(false);
  };

  const removeActiveFile = (id: string) => {
    setActiveFileIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // ── Chat helpers ───────────────────────────────────────────────────────────

  const sendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput('');
    try {
      await streamMessage(text);
    } catch {
      // Error handled by useStreamChat
    }
  };

  // When streaming completes, parse visualizations and add assistant message with citations
  useEffect(() => {
    if (!isStreaming && streamingText) {
      const viz = parseVisualization(streamingText);
      const cleanText = stripChartBlock(streamingText);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: cleanText,
        visualization: viz ?? undefined,
        citations: streamCitations.length > 0 ? streamCitations : undefined,
      }]);
      // Promote latest visualization to the split panel
      if (viz) {
        setActiveVisualization(viz);
      }
    }
  }, [isStreaming, streamingText, streamCitations]);

  // Show stream errors
  useEffect(() => {
    if (streamError) {
      setMessages(prev => [...prev, { role: 'assistant', content: `**Error:** ${streamError}` }]);
    }
  }, [streamError]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  const toggleCitations = (idx: number) => {
    setExpandedCitations(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleSql = (idx: number) => {
    setExpandedSql(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col -m-4 lg:-m-6" style={{ height: 'calc(100vh - 56px)' }}>
        {/* Evidence Files Bar */}
        <div className="px-4 py-2 border-b border-border-light bg-surface-secondary flex items-center gap-2 shrink-0">
          <Database className="w-3.5 h-3.5 text-text-muted shrink-0" />
          <span className="text-[11px] text-text-muted shrink-0">{t('مصادر الأدلة:', 'Evidence sources:')}</span>
          <div className="flex flex-wrap gap-1.5">
            {activeFiles.map(f => {
              const meta = FILE_TYPE_META[f.type] ?? FILE_TYPE_META['pdf'];
              const Icon = meta.icon;
              return (
                <span
                  key={f.id}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-navy-50 text-[10px] text-navy font-medium"
                >
                  <Icon className="w-2.5 h-2.5" />
                  {f.name}
                  <button
                    onClick={() => removeActiveFile(f.id)}
                    className="ml-0.5 hover:text-sgi-critical transition-colors"
                    aria-label={t('إزالة', 'Remove')}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            <button
              onClick={openModal}
              className="px-2 py-0.5 rounded-md bg-surface-tertiary text-[10px] text-text-muted hover:bg-surface-hover transition-colors"
            >
              + {t('إضافة', 'Add')}
            </button>
          </div>
        </div>

        {/* Main content area — splits when visualization is active */}
        <div className={`flex-1 flex ${activeVisualization ? 'flex-col lg:flex-row' : 'flex-col'} overflow-hidden`}>
          {/* LEFT: Visualization panel (only when chart exists) */}
          {activeVisualization && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="lg:w-1/2 border-b lg:border-b-0 lg:border-r border-border-light bg-surface-secondary/50 overflow-y-auto shrink-0"
            >
              <div className="p-4 lg:p-6">
                <div className="sticky top-0">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-navy/10 flex items-center justify-center">
                        <BarChart3 className="w-3.5 h-3.5 text-navy" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-primary leading-tight">
                          {activeVisualization.title || t('تصور البيانات', 'Generated Visualization')}
                        </h3>
                        {activeVisualization.caption && (
                          <p className="text-[11px] text-text-muted mt-0.5">{activeVisualization.caption}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveVisualization(null)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-primary hover:bg-surface-hover transition-colors"
                      aria-label={t('إغلاق', 'Close')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="bg-card rounded-xl border border-border-light shadow-card p-4">
                    <ChatVisualization spec={activeVisualization} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* RIGHT (or full): Chat messages + input */}
          <div className={`${activeVisualization ? 'lg:w-1/2' : 'w-full'} flex flex-col overflow-hidden`}>
            {/* Message Thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="w-16 h-16 rounded-2xl bg-navy-50 flex items-center justify-center mb-4 mx-auto">
                      <Hexagon className="w-8 h-8 text-navy" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-xl font-bold text-primary mb-2">{t('اسأل أوبزرفاتور أي شيء', 'Ask Observator Anything')}</h2>
                    <p className="text-sm text-text-muted mb-2 max-w-md">{t('استعلم بلغة طبيعية بالعربية أو الإنجليزية عن سوق العمل الإماراتي', 'Query the UAE labour market in natural language — Arabic or English')}</p>
                    <p className="text-xs text-text-muted mb-6 max-w-sm">{t('الإجابات مدعومة بالأدلة مع اقتباسات من مصادر البيانات', 'Answers are evidence-backed with citations from data sources')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                      {sampleQueries.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(t(q.ar, q.en))}
                          className="text-left px-3 py-2.5 rounded-xl border border-border-light bg-card text-xs text-text-secondary hover:bg-surface-hover hover:border-navy/20 transition-all"
                        >
                          {t(q.ar, q.en)}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </div>
              ) : (
                <div className={`space-y-4 py-4 ${activeVisualization ? '' : 'max-w-3xl'} mx-auto`}>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] ${msg.role === 'user' ? '' : 'w-full max-w-[85%]'}`}>
                        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-navy text-primary-foreground rounded-br-md'
                            : 'bg-card border border-border-light shadow-card rounded-bl-md'
                        }`}>
                          <div className={`prose prose-sm max-w-none
                            [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5
                            [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm
                            [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold
                            [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:mt-2 [&_h3]:mb-1
                            [&_code]:text-xs [&_code]:bg-black/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
                            [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:text-xs [&_pre]:overflow-x-auto
                            [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-3 [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:border [&_table]:border-border-light
                            [&_thead]:bg-navy/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-border-light [&_th]:text-primary
                            [&_td]:px-3 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-border-light/50
                            [&_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-navy/[0.02]
                            [&_blockquote]:border-l-2 [&_blockquote]:border-navy/30 [&_blockquote]:pl-3 [&_blockquote]:italic
                            [&_a]:text-teal [&_a]:underline
                            ${msg.role === 'user'
                              ? '[&_*]:text-white'
                              : '[&_*]:text-text-secondary [&_h1]:text-primary [&_h2]:text-primary [&_h3]:text-primary [&_strong]:text-primary [&_th]:text-primary'
                            }
                            text-sm leading-relaxed`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        </div>

                        {/* Inline Visualization (compact thumbnail when split panel is active) */}
                        {msg.visualization && (
                          <div
                            className={`mt-2 bg-card border border-border-light rounded-xl p-3 shadow-card ${activeVisualization ? 'cursor-pointer hover:border-navy/30 transition-colors' : ''}`}
                            onClick={() => msg.visualization && setActiveVisualization(msg.visualization)}
                          >
                            <div className="flex items-center gap-1.5 mb-2">
                              <BarChart3 className="w-3.5 h-3.5 text-navy" />
                              <span className="text-[11px] font-medium text-primary">{t('تصور البيانات', 'Data Visualization')}</span>
                              {activeVisualization && (
                                <span className="text-[10px] text-text-muted ml-auto">{t('انقر للتكبير', 'Click to expand')}</span>
                              )}
                            </div>
                            <ChatVisualization spec={msg.visualization} compact={!!activeVisualization} />
                          </div>
                        )}

                        {/* Citations */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleCitations(i)}
                              className="flex items-center gap-1.5 text-[11px] text-navy hover:underline"
                            >
                              {expandedCitations.has(i) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              <Database className="w-3 h-3" />
                              {msg.citations.length} {t('مصادر بيانات', 'data sources')}
                            </button>
                            {expandedCitations.has(i) && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-1.5 space-y-1.5">
                                {msg.citations.map(c => (
                                  <div key={c.evidence_id} className="flex items-start gap-2 p-2 rounded-lg bg-surface-tertiary text-[11px]">
                                    <FileText className="w-3 h-3 text-navy mt-0.5 shrink-0" />
                                    <div>
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-medium text-primary">{c.source}</span>
                                        <SourceBadge sourceType={c.source_type} sourceUrl={c.source_url ?? undefined} t={t} />
                                        {c.location && <span className="text-text-muted">{c.location}</span>}
                                        {c.retrieved_at && (
                                          <span className="text-[10px] text-text-muted">
                                            {t('جلب', 'fetched')} {new Date(c.retrieved_at).toLocaleTimeString()}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-text-muted mt-0.5">{c.excerpt}</p>
                                    </div>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </div>
                        )}

                        {/* SQL Query */}
                        {msg.sqlQuery && (
                          <div className="mt-1.5">
                            <button
                              onClick={() => toggleSql(i)}
                              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-navy"
                            >
                              {expandedSql.has(i) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              <Code className="w-3 h-3" />
                              {t('عرض الاستعلام', 'View QueryPlan SQL')}
                            </button>
                            {expandedSql.has(i) && (
                              <motion.pre initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 p-2.5 rounded-lg bg-navy text-[10px] text-gold-light font-mono overflow-x-auto leading-relaxed">
                                {msg.sqlQuery}
                              </motion.pre>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {/* Streaming response */}
                  {isStreaming && (
                    <div className="flex justify-start">
                      <div className="max-w-[85%] w-full">
                        <div className="bg-card border border-border-light shadow-card rounded-2xl rounded-bl-md px-4 py-3">
                          {streamingText ? (
                            <div className="prose prose-sm max-w-none
                              [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5
                              [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm
                              [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-semibold
                              [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:mt-2 [&_h3]:mb-1
                              [&_code]:text-xs [&_code]:bg-black/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded
                              [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:text-xs [&_pre]:overflow-x-auto
                              [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-3 [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:border [&_table]:border-border-light
                              [&_thead]:bg-navy/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-border-light [&_th]:text-primary
                              [&_td]:px-3 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-border-light/50
                              [&_tr:last-child_td]:border-b-0
                              [&_*]:text-text-secondary [&_strong]:text-primary [&_h1]:text-primary [&_h2]:text-primary [&_h3]:text-primary [&_th]:text-primary
                              text-sm leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripChartBlock(streamingText)}</ReactMarkdown>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              {[0, 1, 2].map(i => (
                                <div key={i} className="w-2 h-2 rounded-full bg-navy/40 animate-bounce-dot" style={{ animationDelay: `${i * 0.16}s` }} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-border-light bg-card p-4 shrink-0">
              <div className={`${activeVisualization ? '' : 'max-w-3xl'} mx-auto`}>

            {/* Selected file chips — shown above input when files are active */}
            <AnimatePresence>
              {activeFiles.length > 0 && (
                <motion.div
                  key="file-chips"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-wrap gap-1.5 overflow-hidden"
                >
                  {activeFiles.map(f => {
                    const meta = FILE_TYPE_META[f.type] ?? FILE_TYPE_META['pdf'];
                    const Icon = meta.icon;
                    return (
                      <motion.span
                        key={f.id}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.15 }}
                        className="inline-flex items-center gap-1.5 bg-navy/5 border border-navy/20 text-navy text-xs rounded-lg px-2 py-1"
                      >
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="max-w-[140px] truncate">{f.name}</span>
                        <button
                          onClick={() => removeActiveFile(f.id)}
                          className="ml-0.5 text-navy/50 hover:text-sgi-critical transition-colors shrink-0"
                          aria-label={t('إزالة', 'Remove')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </motion.span>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input row */}
            <div className="flex items-center gap-2">
              {/* File picker button with badge */}
              <div className="relative shrink-0">
                <button
                  onClick={openModal}
                  title={t('اختيار ملفات المعرفة', 'Select knowledge base files')}
                  className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-colors ${
                    activeFileIds.size > 0
                      ? 'border-navy/30 bg-navy/8 text-navy hover:bg-navy/12'
                      : 'border-border-light bg-surface-tertiary text-text-muted hover:bg-surface-hover hover:text-primary'
                  }`}
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                {/* Count badge */}
                <AnimatePresence>
                  {activeFileIds.size > 0 && (
                    <motion.span
                      key="count-badge"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gold text-white text-[9px] font-bold flex items-center justify-center shadow-sm leading-none"
                    >
                      {activeFileIds.size}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Internet search toggle */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setInternetSearch(prev => !prev)}
                  title={t(
                    internetSearch ? 'تعطيل البحث عبر الإنترنت' : 'تفعيل البحث عبر الإنترنت',
                    internetSearch ? 'Disable internet search' : 'Enable internet search for live data'
                  )}
                  className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-colors ${
                    internetSearch
                      ? 'border-teal/30 bg-teal/10 text-teal hover:bg-teal/15'
                      : 'border-border-light bg-surface-tertiary text-text-muted hover:bg-surface-hover hover:text-primary'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                </button>
                {/* Active indicator */}
                <AnimatePresence>
                  {internetSearch && (
                    <motion.span
                      key="internet-dot"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sgi-balanced shadow-sm"
                    />
                  )}
                </AnimatePresence>
              </div>

              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !isStreaming && sendMessage(input)}
                disabled={!isAuthenticated || isStreaming}
                placeholder={!isAuthenticated
                  ? t('سجل الدخول لاستخدام المساعد', 'Sign in to use the AI assistant')
                  : t('اسأل عن سوق العمل الإماراتي...', 'Ask about the UAE labour market...')}
                className="flex-1 h-10 px-4 rounded-xl border border-border-light bg-surface-tertiary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!isAuthenticated || isStreaming}
                className="h-10 w-10 rounded-xl bg-navy text-primary-foreground flex items-center justify-center hover:bg-navy-dark transition-colors shrink-0 disabled:opacity-50"
              >
                {!isAuthenticated ? <LogIn className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

            {/* Status / quick-action bar */}
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-sgi-balanced"><Shield className="w-3 h-3" />{t('حماية PII نشطة', 'PII Guard Active')}</span>
              <span className="text-[10px] text-text-muted">•</span>
              <span className={`text-[10px] ${isAuthenticated ? 'text-sgi-balanced' : 'text-sgi-critical'}`}>
                {isAuthenticated ? t('متصل', 'Connected') : t('غير مسجل الدخول', 'Not signed in')}
              </span>
              {internetSearch && (
                <>
                  <span className="text-[10px] text-text-muted">•</span>
                  <span className="flex items-center gap-1 text-[10px] text-teal">
                    <Globe className="w-3 h-3" />
                    {t('البحث عبر الإنترنت مفعل', 'Internet Search Active')}
                  </span>
                </>
              )}
              <div className="flex gap-1.5 ms-auto">
                {[t('تلخيص', 'Summarize'), t('مقارنة', 'Compare'), t('توقع', 'Forecast'), t('تصدير', 'Export')].map(chip => (
                  <button key={chip} className="px-2 py-1 rounded-lg bg-surface-tertiary text-[10px] text-text-muted hover:bg-surface-hover transition-colors">{chip}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
          </div>{/* end chat-side column */}
        </div>{/* end split container */}
      </div>

      {/* File Picker Modal — rendered outside the flex column via AnimatePresence */}
      <AnimatePresence>
        {modalOpen && (
          <FilePickerModal
            pendingIds={pendingFileIds}
            onToggle={togglePending}
            onConfirm={confirmSelection}
            onClose={() => setModalOpen(false)}
            t={t}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatPage;
