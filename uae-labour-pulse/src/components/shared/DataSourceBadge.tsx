import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { API_BASE } from '@/api/client';
import { Database, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, Upload, FileSpreadsheet } from 'lucide-react';

interface DataSourceDetail {
  count: number;
  source: string;
  is_real: boolean;
  [key: string]: unknown;
}

interface ViewStatus {
  rows: number;
  status: string;
}

interface UserUploadInfo {
  dataset_id: string;
  filename: string;
  file_type: string;
  row_count: number;
  status: string;
  uploaded_at: string | null;
}

interface DataStatus {
  overall: 'real' | 'mixed' | 'mock';
  real_sources: number;
  total_sources: number;
  details: {
    occupations: DataSourceDetail;
    skills: DataSourceDetail;
    demand: DataSourceDetail;
    supply: DataSourceDetail;
    ai_exposure: DataSourceDetail;
    education: DataSourceDetail;
    views: Record<string, ViewStatus>;
    user_uploads?: { count: number; total_rows: number; files: UserUploadInfo[] };
  };
}

const statusConfig = {
  real: {
    label: { en: 'LIVE DATA', ar: 'بيانات حقيقية' },
    color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    dotColor: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  mixed: {
    label: { en: 'MIXED DATA', ar: 'بيانات مختلطة' },
    color: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    dotColor: 'bg-amber-500',
    icon: AlertTriangle,
  },
  mock: {
    label: { en: 'MOCK DATA', ar: 'بيانات تجريبية' },
    color: 'bg-red-500/10 text-red-600 border-red-500/20',
    dotColor: 'bg-red-500',
    icon: XCircle,
  },
};

/**
 * Floating badge showing whether the platform is running on real or mock data.
 * Expandable panel shows per-source breakdown.
 */
export default function DataSourceBadge() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    fetch(`${API_BASE}/data-status`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !status) return null;

  const config = statusConfig[status.overall];
  const Icon = config.icon;
  const sources = status.details;

  const sourceList = [
    { key: 'occupations', label: 'Occupations (ESCO)', detail: sources.occupations },
    { key: 'skills', label: 'Skills (ESCO)', detail: sources.skills },
    { key: 'demand', label: 'Demand (Job Postings)', detail: sources.demand },
    { key: 'supply', label: 'Supply (Labor Force)', detail: sources.supply },
    { key: 'ai_exposure', label: 'AI Exposure', detail: sources.ai_exposure },
    { key: 'education', label: 'Education', detail: sources.education },
  ];

  return (
    <div className="fixed bottom-4 left-4 z-50" style={{ maxWidth: 360 }}>
      {/* Badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg backdrop-blur-sm transition-all hover:shadow-xl ${config.color}`}
      >
        <div className={`w-2 h-2 rounded-full ${config.dotColor} animate-pulse`} />
        <Icon className="w-4 h-4" />
        <span className="text-xs font-bold tracking-wide">
          {t(config.label.ar, config.label.en)}
        </span>
        <span className="text-[10px] opacity-70">
          {status.real_sources}/{status.total_sources}
        </span>
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      {/* Expanded Panel */}
      {expanded && (
        <div className="mt-2 bg-white rounded-xl border border-border-light shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border-light bg-surface-tertiary">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-navy" />
              <span className="text-xs font-semibold text-primary">
                {t('حالة مصادر البيانات', 'Data Source Status')}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border-light">
            {sourceList.map(({ key, label, detail }) => (
              <div key={key} className="px-3 py-2 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-primary">{label}</div>
                  <div className="text-[10px] text-text-muted truncate">
                    {detail.source} ({detail.count.toLocaleString()} rows)
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  {detail.is_real ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" /> REAL
                    </span>
                  ) : detail.count > 0 ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-600">
                      <AlertTriangle className="w-3 h-3" /> MOCK
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/10 text-gray-500">
                      <XCircle className="w-3 h-3" /> EMPTY
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* User Uploads section */}
          {sources.user_uploads && sources.user_uploads.count > 0 && (
            <div className="px-3 py-2 border-t border-border-light bg-gold/5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Upload className="w-3.5 h-3.5 text-gold" />
                <span className="text-[10px] font-semibold text-gold">
                  {t('بيانات مرفوعة من المستخدم', 'User-Uploaded Data')}
                </span>
                <span className="text-[9px] text-text-muted ml-auto">
                  {sources.user_uploads.total_rows.toLocaleString()} {t('سجل إجمالي', 'total rows')}
                </span>
              </div>
              <div className="space-y-1">
                {sources.user_uploads.files
                  .filter((f: UserUploadInfo) => f.status === 'ready' || f.status === 'processed')
                  .map((f: UserUploadInfo) => (
                  <div key={f.dataset_id} className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-card border border-gold/15">
                    <FileSpreadsheet className="w-3 h-3 text-gold shrink-0" />
                    <span className="text-[10px] font-medium text-primary truncate flex-1">{f.filename}</span>
                    <span className="text-[9px] text-text-muted tabular-nums">{f.row_count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-text-muted mt-1 italic">
                {t('مدمجة في التحليلات الرئيسية', 'Merged into main analytics')}
              </p>
            </div>
          )}

          {/* Views section */}
          <div className="px-3 py-2 border-t border-border-light bg-surface-tertiary">
            <div className="text-[10px] font-semibold text-text-muted mb-1">
              {t('طبقات المشاهدة', 'Materialized Views')}
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(sources.views || {}).map(([name, info]) => {
                const v = info as ViewStatus;
                return (
                  <span
                    key={name}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                      v.status === 'populated'
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : v.status === 'empty'
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-red-500/10 text-red-600'
                    }`}
                  >
                    {name.replace('vw_', '')}: {v.rows.toLocaleString()}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
