import { useLocation, Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  LayoutDashboard, Users, Briefcase, Database, Brain,
} from 'lucide-react';

const primaryTabs = [
  { path: '/', icon: LayoutDashboard, en: 'Dashboard', ar: 'القيادة' },
  { path: '/supply', icon: Users, en: 'Supply', ar: 'العرض' },
  { path: '/demand', icon: Briefcase, en: 'Demand', ar: 'الطلب' },
  { path: '/knowledge-base', icon: Database, en: 'Knowledge', ar: 'المعرفة' },
  { path: '/ai-impact', icon: Brain, en: 'AI Impact', ar: 'الذكاء' },
];

const MobileNav = () => {
  const location = useLocation();
  const { t } = useLanguage();

  return (
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
    </nav>
  );
};

export default MobileNav;
