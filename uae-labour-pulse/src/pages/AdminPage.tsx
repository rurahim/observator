import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import { useDataSourcesStatus, useFetchJSearch, useFetchSalaries, useAuditLogs } from '@/api/hooks';
import { Users, Database, Activity, Clock, Plus, Key, Shield, Settings, AlertTriangle, Server, RefreshCw, Loader2, CheckCircle, XCircle } from 'lucide-react';

const users = [
  { name: 'Fatima Al Hashimi', email: 'fatima@fcsc.gov.ae', role: 'Analyst', roleColor: 'bg-teal/10 text-teal', status: 'Active', initials: 'FA' },
  { name: 'Dr. Abdulla', email: 'abdulla@mohre.gov.ae', role: 'Executive', roleColor: 'bg-navy/10 text-navy', status: 'Active', initials: 'DA' },
  { name: 'Omar Al Suwaidi', email: 'omar@mohre.gov.ae', role: 'Admin', roleColor: 'bg-gold/20 text-gold-dark', status: 'Active', initials: 'OA' },
  { name: 'Ahmed Hassan', email: 'ahmed@mohesr.gov.ae', role: 'Analyst', roleColor: 'bg-teal/10 text-teal', status: 'Inactive', initials: 'AH' },
];

const systemSettings = [
  { label: 'Auto Data Refresh', value: 'Every 6 hours', enabled: true },
  { label: 'Email Alerts', value: 'Enabled', enabled: true },
  { label: 'Critical Alert Threshold', value: 'SGI > 20%', enabled: true },
  { label: 'Auto Backup', value: 'Daily 2 AM', enabled: true },
  { label: 'Maintenance Mode', value: 'Disabled', enabled: false },
];

function formatTimeAgo(isoString: string | null) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const SOURCE_META: Record<string, { label: string; dotClass: string }> = {
  'JSearch': { label: 'JSearch (RapidAPI)', dotClass: 'bg-sgi-balanced' },
  'Glassdoor': { label: 'Glassdoor Salaries', dotClass: 'bg-sgi-balanced' },
  'rdata': { label: 'LinkedIn UAE Jobs', dotClass: 'bg-sgi-balanced' },
  'Bayanat': { label: 'Bayanat.ae Open Data', dotClass: 'bg-sgi-balanced' },
  'Bayanat_proportional': { label: 'Bayanat (Proportional)', dotClass: 'bg-sgi-balanced' },
  'ESCO_crosswalk': { label: 'ESCO Taxonomy', dotClass: 'bg-sgi-balanced' },
};

const AdminPage = () => {
  const { t } = useLanguage();
  const { data: dataSources, isLoading: sourcesLoading } = useDataSourcesStatus();
  const { data: auditLogs } = useAuditLogs({ limit: 10 });
  const fetchJSearch = useFetchJSearch();
  const fetchSalaries = useFetchSalaries();
  const [fetchResult, setFetchResult] = useState<Record<string, unknown> | null>(null);

  const handleFetchJSearch = async () => {
    const toastId = toast.loading('Fetching JSearch jobs…');
    try {
      const result = await fetchJSearch.mutateAsync({ max_pages: 2 });
      setFetchResult(result);
      toast.success(`JSearch: ${(result as any).rows_loaded} jobs loaded`, { id: toastId });
    } catch {
      toast.error('JSearch fetch failed', { id: toastId });
    }
  };

  const handleFetchSalaries = async () => {
    const toastId = toast.loading('Fetching Glassdoor salaries…');
    try {
      const result = await fetchSalaries.mutateAsync();
      setFetchResult(result);
      toast.success(`Glassdoor: ${(result as any).rows_loaded} new, ${(result as any).rows_updated} updated`, { id: toastId });
    } catch {
      toast.error('Salary fetch failed', { id: toastId });
    }
  };

  const totalRecords = dataSources?.reduce((s, d) => s + d.record_count, 0) ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('الإدارة', 'Administration')}
        subtitle={t('إدارة المستخدمين ومصادر البيانات والنظام', 'Manage users, data sources, and system')}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('المستخدمون', 'Users'), value: '4', icon: Users, color: 'text-navy bg-navy-50' },
          { label: t('مصادر البيانات', 'Data Sources'), value: String(dataSources?.length ?? '…'), icon: Database, color: 'text-teal bg-teal-light' },
          { label: t('إجمالي السجلات', 'Total Records'), value: formatCount(totalRecords), icon: Activity, color: 'text-sgi-balanced bg-sgi-balanced/10' },
          { label: t('وقت التشغيل', 'Uptime'), value: '99.7%', icon: Server, color: 'text-gold-dark bg-gold-50' },
        ].map((stat, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color}`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold text-primary tabular-nums">{stat.value}</div>
              <div className="text-xs text-text-muted">{stat.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Data Sources + Fetch Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
          <div className="p-4 border-b border-border-light flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">{t('مصادر البيانات', 'Data Sources')}</h3>
            <span className="text-[10px] text-text-muted">{t('مباشر من قاعدة البيانات', 'Live from database')}</span>
          </div>
          <div className="divide-y divide-border-light">
            {sourcesLoading ? (
              <div className="p-8 text-center text-text-muted text-sm">Loading…</div>
            ) : dataSources?.map((ds, i) => {
              const meta = SOURCE_META[ds.source] ?? { label: ds.source, dotClass: 'bg-sgi-balanced' };
              return (
                <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dotClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary">{meta.label}</div>
                    <div className="text-xs text-text-muted">{formatCount(ds.record_count)} records · {formatTimeAgo(ds.last_updated)}</div>
                  </div>
                  <span className="text-[10px] text-sgi-balanced font-medium">Connected</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Fetch Actions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
          <div className="p-4 border-b border-border-light">
            <h3 className="text-sm font-semibold text-primary">{t('جلب البيانات', 'Data Fetch')}</h3>
          </div>
          <div className="p-4 space-y-3">
            <button
              onClick={handleFetchJSearch}
              disabled={fetchJSearch.isPending}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border-light hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              {fetchJSearch.isPending ? <Loader2 className="w-5 h-5 text-navy animate-spin" /> : <RefreshCw className="w-5 h-5 text-navy" />}
              <div className="flex-1 text-start">
                <div className="text-sm font-medium text-primary">Fetch JSearch Jobs</div>
                <div className="text-xs text-text-muted">Live UAE job postings from Google for Jobs</div>
              </div>
            </button>

            <button
              onClick={handleFetchSalaries}
              disabled={fetchSalaries.isPending}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border-light hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              {fetchSalaries.isPending ? <Loader2 className="w-5 h-5 text-gold-dark animate-spin" /> : <RefreshCw className="w-5 h-5 text-gold-dark" />}
              <div className="flex-1 text-start">
                <div className="text-sm font-medium text-primary">Fetch Glassdoor Salaries</div>
                <div className="text-xs text-text-muted">UAE salary benchmarks per occupation</div>
              </div>
            </button>

            {/* Last fetch result */}
            {fetchResult && (
              <div className="p-3 rounded-xl bg-surface-tertiary text-xs space-y-1">
                <div className="font-medium text-primary flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-sgi-balanced" /> Last Fetch Result
                </div>
                {Object.entries(fetchResult).filter(([k]) => !['errors'].includes(k)).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-text-muted">{k.replace(/_/g, ' ')}</span>
                    <span className="tabular-nums text-primary font-medium">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Users + Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
          <div className="p-4 border-b border-border-light flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">{t('المستخدمون', 'Users')}</h3>
            <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-navy text-primary-foreground text-xs font-medium hover:bg-navy-dark transition-colors">
              <Plus className="w-3.5 h-3.5" />{t('إضافة', 'Add')}
            </button>
          </div>
          <div className="divide-y divide-border-light">
            {users.map((u, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors">
                <div className="w-9 h-9 rounded-full bg-navy-50 flex items-center justify-center text-xs font-bold text-navy shrink-0">{u.initials}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-primary truncate">{u.name}</div>
                  <div className="text-xs text-text-muted truncate">{u.email}</div>
                </div>
                <span className={`px-2 py-1 rounded-lg text-[10px] font-medium ${u.roleColor}`}>{u.role}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
          <h3 className="text-sm font-semibold text-primary mb-3">{t('سجل المراجعة', 'Audit Log')}</h3>
          <div className="space-y-2">
            {auditLogs?.slice(0, 8).map((entry, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-tertiary transition-colors">
                <Key className={`w-4 h-4 shrink-0 ${entry.action.includes('fetch') ? 'text-teal' : entry.action.includes('fail') ? 'text-sgi-critical' : 'text-navy'}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-primary">{entry.action}</span>
                  {entry.resource_type && <span className="text-xs text-text-muted ml-1">— {entry.resource_type}</span>}
                </div>
                <span className="text-[10px] text-text-muted shrink-0">{new Date(entry.created_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )) ?? (
              <div className="text-sm text-text-muted text-center py-4">No audit logs available</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* System Settings */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
        <h3 className="text-sm font-semibold text-primary mb-3">{t('إعدادات النظام', 'System Settings')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {systemSettings.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-surface-tertiary">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${s.enabled ? 'bg-sgi-balanced' : 'bg-border'}`} />
                <span className="text-sm text-primary">{s.label}</span>
              </div>
              <span className="text-xs text-text-muted">{s.value}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default AdminPage;
