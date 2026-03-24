import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import { toast } from 'sonner';
import { Sliders, Wifi, WifiOff, TrendingUp, Shield, BookOpen, Bell, Database, Eye, Lock, Save, Loader2 } from 'lucide-react';
import { API_BASE } from '@/api/client';

interface Preferences {
  data_mode: string;
  forecast_enabled: boolean;
  forecast_horizon: number;
  forecast_model: string;
  citation_style: string;
  email_alerts: boolean;
  critical_threshold: number;
  auto_refresh: boolean;
  refresh_interval: number;
  cohort_threshold: number;
}

const defaultPrefs: Preferences = {
  data_mode: 'offline',
  forecast_enabled: false,
  forecast_horizon: 12,
  forecast_model: 'auto',
  citation_style: 'inline',
  email_alerts: true,
  critical_threshold: 20,
  auto_refresh: true,
  refresh_interval: 2,
  cohort_threshold: 10,
};

const SettingsPage = () => {
  const { t } = useLanguage();
  const [prefs, setPrefs] = useState<Preferences>(defaultPrefs);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load settings from API
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    fetch(`${API_BASE}/settings`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(res => res.ok ? res.json() : defaultPrefs)
      .then(data => { setPrefs({ ...defaultPrefs, ...data }); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success(t('تم حفظ الإعدادات', 'Settings saved successfully'));
    } catch {
      toast.error(t('فشل الحفظ', 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative rounded-full transition-colors ${enabled ? 'bg-navy' : 'bg-border'}`}
      style={{ width: 40, height: 22 }}
    >
      <div
        className="absolute top-0.5 rounded-full bg-white shadow-sm transition-transform"
        style={{ width: 18, height: 18, transform: enabled ? 'translateX(20px)' : 'translateX(2px)' }}
      />
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('الإعدادات', 'Settings')}
        subtitle={t('تكوين النظام وتفضيلات العرض', 'System configuration and display preferences')}
        actions={
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('حفظ', 'Save')}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Data Mode */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            {prefs.data_mode === 'live' ? <Wifi className="w-5 h-5 text-sgi-balanced" /> : <WifiOff className="w-5 h-5 text-text-muted" />}
            <h3 className="text-sm font-semibold text-primary">{t('وضع البيانات', 'Data Mode')}</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">{t('الوضع الحالي', 'Current Mode')}</p>
                <p className="text-xs text-text-muted mt-0.5">{prefs.data_mode === 'offline' ? t('بيانات مخزنة', 'Curated warehouse data') : t('إشارات مباشرة', 'Unvalidated live signals')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${prefs.data_mode === 'offline' ? 'text-navy' : 'text-text-muted'}`}>{t('بدون اتصال', 'Offline')}</span>
                <Toggle enabled={prefs.data_mode === 'live'} onChange={v => update('data_mode', v ? 'live' : 'offline')} />
                <span className={`text-xs font-medium ${prefs.data_mode === 'live' ? 'text-sgi-balanced' : 'text-text-muted'}`}>{t('مباشر', 'Live')}</span>
              </div>
            </div>
            {prefs.data_mode === 'live' && (
              <div className="p-2.5 rounded-lg bg-sgi-shortage/5 border border-sgi-shortage/20">
                <p className="text-[11px] text-sgi-shortage">{t('تحذير: البيانات المباشرة غير محققة', 'Warning: Live data is unvalidated and may contain errors')}</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Forecasting */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-gold" />
            <h3 className="text-sm font-semibold text-primary">{t('التوقعات', 'Forecasting')}</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">{t('تمكين التوقعات', 'Enable Forecasting')}</p>
              <Toggle enabled={prefs.forecast_enabled} onChange={v => update('forecast_enabled', v)} />
            </div>
            {prefs.forecast_enabled && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-secondary">{t('الأفق', 'Horizon')}</p>
                  <select value={prefs.forecast_horizon} onChange={e => update('forecast_horizon', Number(e.target.value))} className="h-8 px-3 rounded-lg bg-surface-tertiary text-xs border-none focus:outline-none focus:ring-2 focus:ring-navy/20">
                    <option value={6}>{t('6 أشهر', '6 months')}</option>
                    <option value={12}>{t('12 شهر', '12 months')}</option>
                    <option value={24}>{t('24 شهر', '24 months')}</option>
                    <option value={36}>{t('36 شهر', '36 months')}</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-text-secondary">{t('النموذج', 'Model')}</p>
                  <select value={prefs.forecast_model} onChange={e => update('forecast_model', e.target.value)} className="h-8 px-3 rounded-lg bg-surface-tertiary text-xs border-none focus:outline-none focus:ring-2 focus:ring-navy/20">
                    <option value="auto">{t('تلقائي', 'Auto')}</option>
                    <option value="ets">ETS / ARIMA</option>
                    <option value="linear_trend">Linear Trend</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* Citations */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-teal" />
            <h3 className="text-sm font-semibold text-primary">{t('الاقتباسات', 'Citations & Evidence')}</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">{t('نمط الاقتباس', 'Citation Style')}</p>
              <select value={prefs.citation_style} onChange={e => update('citation_style', e.target.value)} className="h-8 px-3 rounded-lg bg-surface-tertiary text-xs border-none focus:outline-none focus:ring-2 focus:ring-navy/20">
                <option value="inline">{t('مضمن', 'Inline')}</option>
                <option value="footnote">{t('حاشية', 'Footnote')}</option>
                <option value="endnote">{t('ملاحظة ختامية', 'Endnote')}</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Alerts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-sgi-shortage" />
            <h3 className="text-sm font-semibold text-primary">{t('التنبيهات', 'Alerts & Notifications')}</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">{t('تنبيهات البريد', 'Email Alerts')}</p>
              <Toggle enabled={prefs.email_alerts} onChange={v => update('email_alerts', v)} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">{t('حد التنبيه الحرج', 'Critical Alert Threshold')}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">SGI &gt;</span>
                <input type="number" value={prefs.critical_threshold} onChange={e => update('critical_threshold', Number(e.target.value))} className="w-14 h-8 px-2 rounded-lg bg-surface-tertiary text-xs text-center border-none focus:outline-none focus:ring-2 focus:ring-navy/20" />
                <span className="text-xs text-text-muted">%</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Data Refresh */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-navy" />
            <h3 className="text-sm font-semibold text-primary">{t('تحديث البيانات', 'Data Refresh')}</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">{t('تحديث تلقائي', 'Auto Refresh')}</p>
              <Toggle enabled={prefs.auto_refresh} onChange={v => update('auto_refresh', v)} />
            </div>
            {prefs.auto_refresh && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">{t('كل', 'Every')}</p>
                <select value={prefs.refresh_interval} onChange={e => update('refresh_interval', Number(e.target.value))} className="h-8 px-3 rounded-lg bg-surface-tertiary text-xs border-none focus:outline-none focus:ring-2 focus:ring-navy/20">
                  <option value={1}>{t('ساعة', '1 hour')}</option>
                  <option value={2}>{t('ساعتين', '2 hours')}</option>
                  <option value={4}>{t('4 ساعات', '4 hours')}</option>
                  <option value={12}>{t('12 ساعة', '12 hours')}</option>
                  <option value={24}>{t('24 ساعة', '24 hours')}</option>
                </select>
              </div>
            )}
          </div>
        </motion.div>

        {/* Privacy */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-5 h-5 text-sgi-critical" />
            <h3 className="text-sm font-semibold text-primary">{t('الخصوصية والأمان', 'Privacy & Security')}</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">{t('حد المجموعة الأدنى', 'Min Cohort Threshold')}</p>
                <p className="text-xs text-text-muted mt-0.5">{t('الحد الأدنى لحجم المجموعة', 'Minimum group size for segmented results')}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">N &ge;</span>
                <input type="number" value={prefs.cohort_threshold} onChange={e => update('cohort_threshold', Number(e.target.value))} className="w-14 h-8 px-2 rounded-lg bg-surface-tertiary text-xs text-center border-none focus:outline-none focus:ring-2 focus:ring-navy/20" />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">{t('إخفاء معلومات PII', 'PII Masking')}</p>
              <span className="flex items-center gap-1 text-xs text-sgi-balanced"><Shield className="w-3.5 h-3.5" />{t('نشط', 'Active')}</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary">{t('تدقيق الوصول', 'Access Auditing')}</p>
              <span className="flex items-center gap-1 text-xs text-sgi-balanced"><Eye className="w-3.5 h-3.5" />{t('مفعل', 'Enabled')}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SettingsPage;
