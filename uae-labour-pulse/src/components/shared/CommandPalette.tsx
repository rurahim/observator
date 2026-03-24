import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Search, LayoutDashboard, BarChart3, Brain, TrendingUp,
  MessageSquare, Database, FileText, GraduationCap, Cpu,
  Settings, Sliders, ArrowRight, Command,
} from 'lucide-react';

interface PaletteItem {
  id: string;
  label: string;
  labelAr: string;
  path: string;
  icon: typeof LayoutDashboard;
  keywords: string[];
}

const items: PaletteItem[] = [
  { id: 'dashboard', label: 'Dashboard', labelAr: 'لوحة القيادة', path: '/', icon: LayoutDashboard, keywords: ['home', 'main', 'overview', 'executive'] },
  { id: 'skill-gap', label: 'Skill Gap Analysis', labelAr: 'تحليل فجوة المهارات', path: '/skill-gap', icon: BarChart3, keywords: ['skills', 'shortage', 'occupation', 'gap', 'sgi'] },
  { id: 'ai-impact', label: 'AI Impact Explorer', labelAr: 'مستكشف تأثير الذكاء الاصطناعي', path: '/ai-impact', icon: Brain, keywords: ['artificial intelligence', 'automation', 'exposure', 'aioe', 'playbook'] },
  { id: 'forecast', label: 'Forecasts & Scenarios', labelAr: 'التوقعات والسيناريوهات', path: '/forecast', icon: TrendingUp, keywords: ['predict', 'scenario', 'what-if', 'trend', 'future'] },
  { id: 'chat', label: 'AI Query Chat', labelAr: 'استعلام الذكاء', path: '/chat', icon: MessageSquare, keywords: ['ask', 'question', 'query', 'natural language', 'conversation'] },
  { id: 'knowledge-base', label: 'Knowledge Base', labelAr: 'قاعدة المعرفة', path: '/knowledge-base', icon: Database, keywords: ['files', 'data', 'upload', 'datasets', 'evidence'] },
  { id: 'reports', label: 'Reports', labelAr: 'التقارير', path: '/reports', icon: FileText, keywords: ['report', 'pdf', 'export', 'generate', 'executive'] },
  { id: 'university', label: 'University Alignment', labelAr: 'مواءمة الجامعات', path: '/university', icon: GraduationCap, keywords: ['curriculum', 'education', 'program', 'course', 'skill gap'] },
  { id: 'agents', label: 'Agent Pipeline', labelAr: 'خط أنابيب الوكلاء', path: '/agents', icon: Cpu, keywords: ['pipeline', 'agent', 'token', 'monitoring', 'status'] },
  { id: 'admin', label: 'Administration', labelAr: 'الإدارة', path: '/admin', icon: Settings, keywords: ['admin', 'users', 'data sources', 'audit'] },
  { id: 'settings', label: 'Settings', labelAr: 'الإعدادات', path: '/settings', icon: Sliders, keywords: ['settings', 'preferences', 'mode', 'forecast', 'privacy'] },
];

const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  // Keyboard shortcut: Ctrl+K or /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query.trim()
    ? items.filter(item => {
        const q = query.toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          item.labelAr.includes(query) ||
          item.keywords.some(k => k.includes(q))
        );
      })
    : items;

  const handleSelect = useCallback(
    (path: string) => {
      navigate(path);
      setOpen(false);
    },
    [navigate]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex].path);
      }
    },
    [filtered, selectedIndex, handleSelect]
  );

  return (
    <>
      {/* Trigger hint in topbar search */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-1.5 text-[10px] text-text-muted bg-surface-tertiary px-2 py-1 rounded-md border border-border-light hover:bg-surface-hover transition-colors"
      >
        <Command className="w-3 h-3" />
        <span>K</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/40 flex items-start justify-center pt-[15vh]"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 400 }}
              className="bg-card rounded-2xl shadow-dropdown border border-border-light w-full max-w-lg overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border-light">
                <Search className="w-5 h-5 text-text-muted shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder={t('ابحث عن صفحة أو ميزة...', 'Search pages, features...')}
                  className="flex-1 bg-transparent text-sm text-primary placeholder:text-text-muted focus:outline-none"
                />
                <kbd className="px-2 py-0.5 rounded-md bg-surface-tertiary text-[10px] text-text-muted border border-border-light">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-[340px] overflow-y-auto py-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-text-muted">
                    {t('لا توجد نتائج', 'No results found')}
                  </div>
                ) : (
                  filtered.map((item, i) => {
                    const Icon = item.icon;
                    const isSelected = i === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item.path)}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          isSelected ? 'bg-navy/5' : 'hover:bg-surface-hover'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-navy/10' : 'bg-surface-tertiary'}`}>
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-navy' : 'text-text-muted'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium ${isSelected ? 'text-navy' : 'text-primary'}`}>
                            {t(item.labelAr, item.label)}
                          </div>
                          <div className="text-[10px] text-text-muted truncate">
                            {item.path}
                          </div>
                        </div>
                        {isSelected && <ArrowRight className="w-3.5 h-3.5 text-navy shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-border-light flex items-center gap-4 text-[10px] text-text-muted">
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-surface-tertiary border border-border-light">↑↓</kbd> {t('تنقل', 'Navigate')}</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-surface-tertiary border border-border-light">↵</kbd> {t('فتح', 'Open')}</span>
                <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 rounded bg-surface-tertiary border border-border-light">Esc</kbd> {t('إغلاق', 'Close')}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CommandPalette;
