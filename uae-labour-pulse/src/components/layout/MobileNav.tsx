import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, BarChart3, MessageSquare, FileText,
  MoreHorizontal, X, Brain, TrendingUp, Database,
  GraduationCap, Cpu, Settings, Sliders, Layers,
} from 'lucide-react';

const primaryTabs = [
  { path: '/', icon: LayoutDashboard, en: 'Dashboard', ar: 'لوحة القيادة' },
  { path: '/skill-gap', icon: BarChart3, en: 'Skill Gap', ar: 'فجوة المهارات' },
  { path: '/chat', icon: MessageSquare, en: 'AI Query', ar: 'استعلام' },
  { path: '/reports', icon: FileText, en: 'Reports', ar: 'التقارير' },
];

const moreTabs = [
  { path: '/ai-impact', icon: Brain, en: 'AI Impact', ar: 'تأثير الذكاء' },
  { path: '/skills-taxonomy', icon: Layers, en: 'Skills Taxonomy', ar: 'تصنيف المهارات' },
  { path: '/forecast', icon: TrendingUp, en: 'Forecasts', ar: 'التوقعات' },
  { path: '/knowledge-base', icon: Database, en: 'Knowledge Base', ar: 'قاعدة المعرفة' },
  { path: '/university', icon: GraduationCap, en: 'University', ar: 'الجامعات' },
  { path: '/agents', icon: Cpu, en: 'Agents', ar: 'الوكلاء' },
  { path: '/admin', icon: Settings, en: 'Admin', ar: 'الإدارة' },
  { path: '/data-landscape', icon: Database, en: 'Data Landscape', ar: 'المشهد البياني' },
  { path: '/settings', icon: Sliders, en: 'Settings', ar: 'الإعدادات' },
];

const MobileNav = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreTabs.some(tab => tab.path === location.pathname);

  return (
    <>
      {/* More Panel */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/40 lg:hidden"
            onClick={() => setMoreOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-14 left-0 right-0 bg-card rounded-t-2xl border-t border-border-light shadow-dropdown p-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-primary">{t('المزيد', 'More')}</span>
                <button onClick={() => setMoreOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-tertiary">
                  <X className="w-4 h-4 text-text-muted" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {moreTabs.map(tab => {
                  const Icon = tab.icon;
                  const active = location.pathname === tab.path;
                  return (
                    <Link
                      key={tab.path}
                      to={tab.path}
                      onClick={() => setMoreOpen(false)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${
                        active ? 'bg-navy/5 text-navy' : 'text-text-muted hover:bg-surface-hover'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[10px] font-medium text-center leading-tight">{t(tab.ar, tab.en)}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-14 bg-card border-t border-border-light z-[80] flex items-center justify-around px-2 lg:hidden">
        {primaryTabs.map(tab => {
          const Icon = tab.icon;
          const active = location.pathname === tab.path;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors ${
                active ? 'text-navy' : 'text-text-muted'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
                {t(tab.ar, tab.en)}
              </span>
              {active && <div className="w-4 h-0.5 rounded-full bg-navy mt-0.5" />}
            </Link>
          );
        })}
        {/* More button */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors ${
            isMoreActive || moreOpen ? 'text-navy' : 'text-text-muted'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className={`text-[10px] ${isMoreActive || moreOpen ? 'font-semibold' : 'font-medium'}`}>
            {t('المزيد', 'More')}
          </span>
          {isMoreActive && <div className="w-4 h-0.5 rounded-full bg-navy mt-0.5" />}
        </button>
      </nav>
    </>
  );
};

export default MobileNav;
