import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import { toast } from 'sonner';
import { FileText, BarChart3, Users, Zap, Download, Plus, Clock, X, RefreshCw, Edit } from 'lucide-react';

// Placeholder data — will be replaced when report generation API is fully functional
const reportTypes = [
  { name: { en: 'Executive Summary', ar: 'ملخص تنفيذي' }, desc: { en: 'High-level overview', ar: 'نظرة عامة' }, icon: FileText, color: 'text-navy bg-navy-50' },
  { name: { en: 'Skill Gap Report', ar: 'تقرير فجوة المهارات' }, desc: { en: 'Detailed gap analysis', ar: 'تحليل الفجوة' }, icon: BarChart3, color: 'text-sgi-critical bg-sgi-critical/10' },
  { name: { en: 'Emiratisation Report', ar: 'تقرير التوطين' }, desc: { en: 'Nationalisation metrics', ar: 'مقاييس التوطين' }, icon: Users, color: 'text-sgi-balanced bg-sgi-balanced/10' },
  { name: { en: 'AI Risk Assessment', ar: 'تقييم مخاطر الذكاء' }, desc: { en: 'Automation risk analysis', ar: 'تحليل مخاطر الأتمتة' }, icon: Zap, color: 'text-sgi-shortage bg-sgi-shortage/10' },
];

const reports = [
  { title: 'Q1 2026 Executive Summary', type: 'Executive', status: 'Ready', created: 'Mar 9', format: 'PDF-EN', size: '2.4 MB' },
  { title: 'Skill Gap Deep Dive — Technology', type: 'Skill Gap', status: 'Generating', created: 'Mar 9', format: 'PDF-AR', size: '45%' },
  { title: 'Monthly Emiratisation Tracker', type: 'Emiratisation', status: 'Ready', created: 'Mar 8', format: 'Excel', size: '1.1 MB' },
  { title: 'AI Displacement Risk — Finance', type: 'AI Risk', status: 'Failed', created: 'Mar 7', format: 'PPTX', size: '—' },
  { title: 'Weekly Skills Digest', type: 'Executive', status: 'Scheduled', created: 'Mar 10', format: 'PDF-EN', size: '—' },
];

const scheduled = [
  { title: 'Weekly Skills Digest', freq: 'Weekly', next: 'Mon 08:00', enabled: true },
  { title: 'Monthly SGI Report', freq: 'Monthly', next: 'Apr 1', enabled: true },
  { title: 'Daily Alerts Summary', freq: 'Daily', next: 'Tomorrow 06:00', enabled: false },
];

const statusStyle = (s: string) => {
  if (s === 'Ready') return 'bg-sgi-balanced/10 text-sgi-balanced';
  if (s === 'Generating') return 'bg-sgi-shortage/10 text-sgi-shortage';
  if (s === 'Failed') return 'bg-sgi-critical/10 text-sgi-critical';
  if (s === 'Scheduled') return 'bg-sgi-surplus/10 text-sgi-surplus';
  return 'bg-muted text-text-muted';
};

const actionIcon = (s: string) => {
  if (s === 'Ready') return <Download className="w-4 h-4" />;
  if (s === 'Generating') return <X className="w-4 h-4" />;
  if (s === 'Failed') return <RefreshCw className="w-4 h-4" />;
  return <Edit className="w-4 h-4" />;
};

const ReportsPage = () => {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('التقارير', 'Reports')}
        actions={
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors">
            <Plus className="w-4 h-4" />
            {t('تقرير جديد', 'New Report')}
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {reportTypes.map((rt, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl border border-border-light shadow-card p-4 hover:shadow-card-hover transition-shadow cursor-pointer">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${rt.color}`}>
              <rt.icon className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-primary">{t(rt.name.ar, rt.name.en)}</h3>
            <p className="text-xs text-text-muted mt-1">{t(rt.desc.ar, rt.desc.en)}</p>
            <button
              onClick={() => toast.success(t('بدأ إنشاء التقرير', 'Report generation started'), { description: t(rt.name.ar, rt.name.en) })}
              className="mt-3 px-3 py-1.5 rounded-lg bg-navy text-primary-foreground text-xs font-medium hover:bg-navy-dark transition-colors"
            >
              {t('إنشاء', 'Generate')}
            </button>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
        <div className="p-4 border-b border-border-light">
          <h3 className="text-sm font-semibold text-primary">{t('التقارير الأخيرة', 'Recent Reports')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-surface-tertiary">
              {[t('العنوان', 'Title'), t('النوع', 'Type'), t('الحالة', 'Status'), t('تاريخ', 'Created'), t('التنسيق', 'Format'), t('الحجم', 'Size'), t('إجراء', 'Action')].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i} className="border-t border-border-light hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-primary">{r.title}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{r.type}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded-lg text-xs font-medium ${statusStyle(r.status)}`}>{r.status}</span></td>
                  <td className="px-4 py-3 text-text-muted text-xs">{r.created}</td>
                  <td className="px-4 py-3 text-text-muted text-xs">{r.format}</td>
                  <td className="px-4 py-3 text-text-muted text-xs tabular-nums">{r.size}</td>
                  <td className="px-4 py-3"><button className="p-1.5 rounded-lg hover:bg-surface-tertiary text-text-muted">{actionIcon(r.status)}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
        <h3 className="text-sm font-semibold text-primary mb-3">{t('التقارير المجدولة', 'Scheduled Reports')}</h3>
        <div className="space-y-2">
          {scheduled.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface-tertiary">
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-text-muted" />
                <div>
                  <div className="text-sm font-medium text-primary">{s.title}</div>
                  <div className="text-xs text-text-muted">{s.freq} · Next: {s.next}</div>
                </div>
              </div>
              <div className={`w-8 h-5 rounded-full flex items-center cursor-pointer transition-colors ${s.enabled ? 'bg-sgi-balanced justify-end' : 'bg-border justify-start'}`}>
                <div className="w-4 h-4 rounded-full bg-card shadow-sm mx-0.5" />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default ReportsPage;
