import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import PageHeader from '@/components/shared/PageHeader';
import EmptyState from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/EmptyState';
import UploadModal from '@/components/shared/UploadModal';
import { useFiles } from '@/api/hooks';
import { toast } from 'sonner';
import {
  Database, Upload, FileText, FileSpreadsheet, File, Trash2, Eye, Download,
  CheckCircle, AlertCircle, Clock, Search, X, MessageSquare, GitCompare
} from 'lucide-react';

const typeIcon: Record<string, { icon: typeof FileText; color: string }> = {
  csv: { icon: FileSpreadsheet, color: 'text-sgi-balanced' },
  excel: { icon: FileSpreadsheet, color: 'text-sgi-balanced' },
  xlsx: { icon: FileSpreadsheet, color: 'text-sgi-balanced' },
  json: { icon: File, color: 'text-gold' },
  pdf: { icon: FileText, color: 'text-sgi-critical' },
  parquet: { icon: Database, color: 'text-navy' },
};

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string; labelAr: string }> = {
  processed: { icon: CheckCircle, color: 'text-sgi-balanced', label: 'Processed', labelAr: 'تمت المعالجة' },
  ready: { icon: CheckCircle, color: 'text-sgi-balanced', label: 'Ready', labelAr: 'جاهز' },
  processing: { icon: Clock, color: 'text-sgi-shortage', label: 'Processing', labelAr: 'جاري المعالجة' },
  ingesting: { icon: Clock, color: 'text-sgi-shortage', label: 'Ingesting', labelAr: 'جاري الاستيعاب' },
  failed: { icon: AlertCircle, color: 'text-sgi-critical', label: 'Failed', labelAr: 'فشل' },
  error: { icon: AlertCircle, color: 'text-sgi-critical', label: 'Error', labelAr: 'خطأ' },
};

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes > 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatCount(n?: number | null) {
  if (!n) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

const KnowledgeBasePage = () => {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: apiFiles, isLoading, error } = useFiles();

  const files = useMemo(() => {
    if (!apiFiles?.length) return [];
    return apiFiles.map(f => ({
      id: f.dataset_id,
      name: f.filename,
      type: f.file_type || f.source_type || 'file',
      size: formatBytes(f.file_size),
      records: formatCount(f.row_count),
      uploaded: f.created_at ? new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
      status: f.status || 'processed',
      progress: f.progress,
    }));
  }, [apiFiles]);

  const filtered = files.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalRecords = apiFiles?.reduce((s, f) => s + (f.row_count || 0), 0) ?? 0;

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(f => f.id)));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div><div className="h-6 w-48 mb-2 animate-pulse bg-surface-tertiary rounded" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="bg-card rounded-xl border border-border-light shadow-card p-4 h-20 animate-pulse bg-surface-tertiary" />)}
        </div>
        <div className="bg-card rounded-xl border border-border-light shadow-card h-64 animate-pulse bg-surface-tertiary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('قاعدة المعرفة', 'Knowledge Base')} />
        <ErrorState message="Failed to load files" onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('قاعدة المعرفة', 'Knowledge Base')}
        subtitle={t('إدارة مجموعات البيانات والملفات ومصادر الأدلة', 'Manage datasets, files, and evidence sources')}
        actions={
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-sm font-medium hover:bg-navy-dark transition-colors"
          >
            <Upload className="w-4 h-4" />
            {t('رفع ملف', 'Upload File')}
          </button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t('إجمالي الملفات', 'Total Files'), value: String(files.length || '—'), icon: Database, color: 'text-navy' },
          { label: t('إجمالي السجلات', 'Total Records'), value: formatCount(totalRecords) || '—', icon: FileText, color: 'text-teal' },
          { label: t('الحالة', 'Status'), value: files.length > 0 ? t('متصل', 'Connected') : '—', icon: CheckCircle, color: 'text-sgi-balanced' },
          { label: t('المعالجة', 'Processing'), value: String(files.filter(f => f.status === 'processing' || f.status === 'ingesting').length), icon: Clock, color: 'text-gold' },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl border border-border-light shadow-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-text-muted">{s.label}</span>
            </div>
            <span className="text-lg font-bold text-primary tabular-nums">{s.value}</span>
          </motion.div>
        ))}
      </div>

      {/* Upload Area */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={() => setUploadOpen(true)}
        className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-navy/30 transition-colors cursor-pointer bg-surface-secondary/50"
      >
        <Upload className="w-8 h-8 text-text-muted mx-auto mb-3" />
        <p className="text-sm font-medium text-primary">{t('أسقط الملفات هنا أو انقر للرفع', 'Drop files here or click to upload')}</p>
        <p className="text-xs text-text-muted mt-1">{t('CSV, Excel, JSON, Parquet — حتى 100 ميجابايت', 'CSV, Excel, JSON, Parquet — up to 100MB')}</p>
      </motion.div>

      {/* Search + Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border border-border-light shadow-card overflow-hidden">
        <div className="p-4 border-b border-border-light flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('بحث في الملفات...', 'Search files...')}
              className="w-full h-9 pl-9 pr-4 rounded-lg bg-surface-tertiary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-navy/20"
            />
          </div>
          <span className="text-xs text-text-muted">{filtered.length} {t('ملفات', 'files')}</span>
        </div>

        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-tertiary">
                  <th className="px-4 py-2.5 text-left w-10">
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="w-3.5 h-3.5 rounded border-border text-navy focus:ring-navy" />
                  </th>
                  {[t('الاسم', 'Name'), t('النوع', 'Type'), t('الحجم', 'Size'), t('السجلات', 'Records'), t('الرفع', 'Uploaded'), t('الحالة', 'Status'), t('إجراءات', 'Actions')].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(file => {
                  const ft = file.type?.toLowerCase() || 'file';
                  const TypeIcon = typeIcon[ft]?.icon || File;
                  const typeColor = typeIcon[ft]?.color || 'text-text-muted';
                  const status = statusConfig[file.status] || statusConfig.processed;
                  const StatusIcon = status.icon;
                  return (
                    <tr key={file.id} className={`border-t border-border-light hover:bg-surface-hover transition-colors ${selected.has(file.id) ? 'bg-navy-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(file.id)} onChange={() => toggleSelect(file.id)} className="w-3.5 h-3.5 rounded border-border text-navy focus:ring-navy" />
                      </td>
                      <td className="px-4 py-3 font-medium text-primary whitespace-nowrap">{file.name}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 ${typeColor}`}>
                          <TypeIcon className="w-3.5 h-3.5" />
                          <span className="text-xs uppercase font-medium">{ft}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted tabular-nums">{file.size}</td>
                      <td className="px-4 py-3 text-text-muted tabular-nums">{file.records}</td>
                      <td className="px-4 py-3 text-text-muted whitespace-nowrap">{file.uploaded}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 ${status.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">{t(status.labelAr, status.label)}</span>
                          {file.progress != null && file.progress < 100 && <span className="text-[10px] text-text-muted">({file.progress}%)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded-md hover:bg-surface-tertiary transition-colors" title="View"><Eye className="w-3.5 h-3.5 text-text-muted" /></button>
                          <button className="p-1.5 rounded-md hover:bg-surface-tertiary transition-colors" title="Download"><Download className="w-3.5 h-3.5 text-text-muted" /></button>
                          <button onClick={(e) => { e.stopPropagation(); toast.warning(t('هل أنت متأكد من الحذف؟', 'Are you sure you want to delete this file?')); }} className="p-1.5 rounded-md hover:bg-surface-tertiary transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5 text-text-muted hover:text-sgi-critical" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Database}
            title={t('لا توجد ملفات', 'No files yet')}
            description={t('قم برفع ملف لبدء بناء قاعدة المعرفة', 'Upload a file to start building the knowledge base')}
            action={{ label: t('رفع ملف', 'Upload File'), onClick: () => setUploadOpen(true) }}
          />
        )}
      </motion.div>

      {/* Selected Files Actions */}
      {selected.size > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl bg-navy text-primary-foreground shadow-dropdown z-50"
        >
          <span className="text-sm font-medium">{selected.size} {t('ملفات محددة', 'files selected')}</span>
          <div className="w-px h-5 bg-white/20" />
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors">
            <MessageSquare className="w-3.5 h-3.5" />
            {t('استخدام كأدلة في المحادثة', 'Use as Evidence in Chat')}
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors">
            <GitCompare className="w-3.5 h-3.5" />
            {t('مقارنة الإصدارات', 'Compare Versions')}
          </button>
          <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
};

export default KnowledgeBasePage;
