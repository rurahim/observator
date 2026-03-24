import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const routeNames: Record<string, { en: string; ar: string }> = {
  '/': { en: 'Dashboard', ar: 'لوحة القيادة' },
  '/skill-gap': { en: 'Skill Gap', ar: 'فجوة المهارات' },
  '/ai-impact': { en: 'AI Impact', ar: 'تأثير الذكاء الاصطناعي' },
  '/forecast': { en: 'Forecasts', ar: 'التوقعات' },
  '/chat': { en: 'Chat', ar: 'المحادثة' },
  '/knowledge-base': { en: 'Knowledge Base', ar: 'قاعدة المعرفة' },
  '/reports': { en: 'Reports', ar: 'التقارير' },
  '/university': { en: 'University', ar: 'الجامعات' },
  '/agents': { en: 'Agents', ar: 'الوكلاء' },
  '/admin': { en: 'Admin', ar: 'الإدارة' },
  '/settings': { en: 'Settings', ar: 'الإعدادات' },
};

const Breadcrumbs = () => {
  const { pathname } = useLocation();
  const { t } = useLanguage();

  // Don't show breadcrumbs on the dashboard (home page)
  if (pathname === '/') return null;

  const route = routeNames[pathname];
  if (!route) return null;

  return (
    <nav className="flex items-center gap-1.5 text-[11px] mb-3">
      <Link
        to="/"
        className="flex items-center gap-1 text-text-muted hover:text-navy transition-colors"
      >
        <Home className="w-3 h-3" />
        <span>{t('لوحة القيادة', 'Dashboard')}</span>
      </Link>
      <ChevronRight className="w-3 h-3 text-text-muted" />
      <span className="text-primary font-medium">{t(route.ar, route.en)}</span>
    </nav>
  );
};

export default Breadcrumbs;
