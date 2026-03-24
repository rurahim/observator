import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Globe, User, Menu, Wifi, WifiOff, TrendingUp, Command, Check, Database, Zap, AlertTriangle, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNotifications, useNotificationCount, useMarkNotificationRead, useMarkAllRead } from '@/api/hooks';
import type { Notification } from '@/api/hooks';
import { useQueryClient } from '@tanstack/react-query';

interface TopbarProps {
  onToggleSidebar: () => void;
}

const NOTIF_ICON: Record<string, typeof Database> = {
  pipeline_complete: Database,
  data_refresh: Zap,
  alert: AlertTriangle,
};

const Topbar = ({ onToggleSidebar }: TopbarProps) => {
  const { t, toggleLang, lang } = useLanguage();
  const [mode, setMode] = useState<'offline' | 'live'>('offline');
  const [forecastEnabled, setForecastEnabled] = useState(false);
  const [forecastHorizon, setForecastHorizon] = useState(12);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: notifications } = useNotifications();
  const { data: countData } = useNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllRead();

  const unreadCount = countData?.unread ?? 0;

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    if (showNotifs) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotifs]);

  // When a pipeline_complete notification arrives, invalidate dashboard data
  useEffect(() => {
    if (notifications && notifications.length > 0) {
      const recent = notifications[0];
      if (recent && !recent.read && recent.type === 'pipeline_complete') {
        // Auto-invalidate all analytics queries so dashboards refresh
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
        qc.invalidateQueries({ queryKey: ["skill-gap"] });
        qc.invalidateQueries({ queryKey: ["ai-impact"] });
        qc.invalidateQueries({ queryKey: ["forecasts"] });
        qc.invalidateQueries({ queryKey: ["filters"] });
        qc.invalidateQueries({ queryKey: ["university"] });
      }
    }
  }, [notifications, qc]);

  const handleNotifClick = (notif: Notification) => {
    if (!notif.read) markRead.mutate(notif.id);
    setShowNotifs(false);
    if (notif.type === 'pipeline_complete') {
      navigate('/skill-gap');
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-card border-b border-border-light z-50 flex items-center px-4 gap-3 shadow-card">
      <button onClick={onToggleSidebar} className="p-2 rounded-lg hover:bg-surface-tertiary transition-colors">
        <Menu className="w-5 h-5 text-text-secondary" />
      </button>

      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center">
          <span className="text-gold text-xs font-bold">O</span>
        </div>
        <span className="text-sm font-bold text-primary hidden sm:block">
          {t('أوبزرفاتور', 'Observator')}
        </span>
      </div>

      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
          }}
          className="w-full h-9 flex items-center gap-2 pl-3 pr-3 rounded-lg bg-surface-tertiary text-sm text-text-muted hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">{t('بحث...', 'Search occupations, skills, reports...')}</span>
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-card border border-border-light text-[10px] font-medium text-text-muted">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1 ms-auto">
        {/* Offline / Live Mode Toggle */}
        <button
          onClick={() => setMode(m => m === 'offline' ? 'live' : 'offline')}
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
            mode === 'live'
              ? 'bg-sgi-balanced/10 text-sgi-balanced'
              : 'bg-surface-tertiary text-text-muted hover:bg-surface-hover'
          }`}
          title={mode === 'offline' ? 'Switch to Live mode (unvalidated signals)' : 'Switch to Offline mode (curated data)'}
        >
          {mode === 'live' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {mode === 'live' ? t('مباشر', 'Live') : t('بدون اتصال', 'Offline')}
        </button>

        {/* Forecast Toggle */}
        <div className="hidden lg:flex items-center gap-1">
          <button
            onClick={() => setForecastEnabled(f => !f)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              forecastEnabled
                ? 'bg-gold/10 text-gold-dark'
                : 'bg-surface-tertiary text-text-muted hover:bg-surface-hover'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            {t('توقع', 'Forecast')}
          </button>
          {forecastEnabled && (
            <select
              value={forecastHorizon}
              onChange={e => setForecastHorizon(Number(e.target.value))}
              className="h-7 px-1.5 rounded-md bg-surface-tertiary text-[11px] text-text-secondary border-none focus:outline-none focus:ring-1 focus:ring-navy/20"
            >
              <option value={6}>6m</option>
              <option value={12}>12m</option>
              <option value={24}>24m</option>
              <option value={36}>36m</option>
            </select>
          )}
        </div>

        <div className="w-px h-5 bg-border-light hidden lg:block mx-1" />

        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-surface-tertiary transition-colors text-text-secondary"
        >
          <Globe className="w-4 h-4" />
          {lang === 'en' ? 'عربي' : 'EN'}
        </button>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(s => !s)}
            className="relative p-2 rounded-lg hover:bg-surface-tertiary transition-colors"
            aria-label="Notifications"
            aria-expanded={showNotifs}
          >
            <Bell className="w-5 h-5 text-text-secondary" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-sgi-critical text-white text-[9px] font-bold px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifs && (
            <div className="absolute right-0 top-full mt-1 w-80 max-h-[420px] bg-card rounded-xl border border-border-light shadow-lg z-[100] overflow-hidden">
              <div className="p-3 border-b border-border-light flex items-center justify-between">
                <span className="text-sm font-semibold text-primary">{t('الإشعارات', 'Notifications')}</span>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="text-[10px] font-medium text-navy hover:underline"
                  >
                    {t('تعيين الكل كمقروء', 'Mark all read')}
                  </button>
                )}
              </div>
              <div className="overflow-y-auto max-h-[360px] divide-y divide-border-light">
                {(!notifications || notifications.length === 0) ? (
                  <div className="p-6 text-center text-sm text-text-muted">
                    {t('لا توجد إشعارات', 'No notifications')}
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const Icon = NOTIF_ICON[notif.type] || Bell;
                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleNotifClick(notif)}
                        className={`w-full text-left p-3 hover:bg-surface-hover transition-colors flex gap-3 ${
                          !notif.read ? 'bg-navy/3' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          notif.type === 'pipeline_complete' ? 'bg-sgi-balanced/10' :
                          notif.type === 'alert' ? 'bg-sgi-critical/10' :
                          'bg-navy/10'
                        }`}>
                          <Icon className={`w-4 h-4 ${
                            notif.type === 'pipeline_complete' ? 'text-sgi-balanced' :
                            notif.type === 'alert' ? 'text-sgi-critical' :
                            'text-navy'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-primary truncate">{notif.title}</span>
                            {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-navy shrink-0" />}
                          </div>
                          <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{notif.message}</div>
                          <div className="text-[9px] text-text-muted mt-1">{timeAgo(notif.created_at)}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors">
          <div className="w-8 h-8 rounded-full bg-navy-50 flex items-center justify-center">
            <User className="w-4 h-4 text-navy" />
          </div>
        </button>
      </div>
    </header>
  );
};

export default Topbar;
