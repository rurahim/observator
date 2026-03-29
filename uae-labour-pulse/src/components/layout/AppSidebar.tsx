import { useLocation, Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Users, Briefcase, BarChart3, Activity, ChevronLeft,
  Database, Brain, LogOut, Search,
} from 'lucide-react';

interface AppSidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
}

const navItems = [
  { path: '/', icon: LayoutDashboard, en: 'Dashboard', ar: 'لوحة القيادة' },
  { path: '/supply', icon: Users, en: 'Supply Side', ar: 'جانب العرض' },
  { path: '/demand', icon: Briefcase, en: 'Demand Side', ar: 'جانب الطلب' },
  { path: '/knowledge-base', icon: Database, en: 'Knowledge Base', ar: 'قاعدة المعرفة' },
  { path: '/ai-impact', icon: Brain, en: 'AI Impact', ar: 'تأثير الذكاء الاصطناعي' },
];

const AppSidebar = ({ collapsed, onCollapse }: AppSidebarProps) => {
  const location = useLocation();
  const { t } = useLanguage();
  const { logout, user } = useAuth();

  return (
    <aside
      className={`fixed top-14 bottom-0 z-40 navy-gradient text-sidebar-foreground transition-all duration-300 flex-col hidden lg:flex ${
        collapsed ? 'w-[60px]' : 'w-[220px]'
      }`}
      style={{ left: 0 }}
    >
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const active = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                active
                  ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}
              title={collapsed ? t(item.ar, item.en) : undefined}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="truncate">{t(item.ar, item.en)}</span>}
              {active && !collapsed && (
                <div className="ms-auto w-1.5 h-1.5 rounded-full bg-gold" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status */}
      {!collapsed && (
        <div className="p-3 mx-2 mb-3 rounded-lg bg-sidebar-accent/50 border border-sidebar-border/30">
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60 mb-2">
            <Activity className="w-3.5 h-3.5" />
            <span>{t('حالة النظام', 'System Status')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sgi-balanced animate-pulse" />
            <span className="text-xs text-sidebar-foreground/80">{t('جميع الأنظمة تعمل', 'All Systems Operational')}</span>
          </div>
        </div>
      )}

      {/* Logout */}
      <button
        onClick={() => { logout(); window.location.href = '/login'; }}
        className="mx-2 mb-2 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:bg-red-500/20 hover:text-red-300 transition-all duration-200"
        title={collapsed ? t('تسجيل الخروج', 'Sign Out') : undefined}
      >
        <LogOut className="w-5 h-5 shrink-0" />
        {!collapsed && <span>{t('تسجيل الخروج', 'Sign Out')}</span>}
      </button>

      <button
        onClick={onCollapse}
        className="p-3 border-t border-sidebar-border/30 flex items-center justify-center hover:bg-sidebar-accent/50 transition-colors"
      >
        <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
      </button>
    </aside>
  );
};

export default AppSidebar;
