/**
 * DataStory — wraps any chart/card. Click to flip and see:
 *   - How the data was collected
 *   - Whether it's real, estimated, or scraped
 *   - Clickable links to Knowledge Base source tables
 *   - Any caveats or manipulation notes
 *
 * Usage:
 *   <DataStory
 *     title="Enrollment Trend"
 *     method="Aggregated from Bayanat HE enrollment CSVs by year. 7 of 17 data points are estimated via linear interpolation."
 *     tables={[
 *       { name: 'fact_program_enrollment', label: 'Program Enrollment' },
 *       { name: 'fact_supply_graduates', label: 'Graduate Counts' },
 *     ]}
 *     quality="official+estimated"
 *     caveats="2018-2024 enrollment figures are estimated from 2012-2017 actuals. Gold dots on chart mark estimated points."
 *   >
 *     <MyChart />
 *   </DataStory>
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Info, X, Database, ExternalLink, Shield, AlertTriangle,
  CheckCircle, FlaskConical, Globe, ArrowLeft,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface SourceTable {
  name: string;   // DB table name — used for KB link
  label: string;  // Display name
}

interface DataStoryProps {
  children: React.ReactNode;
  /** Chart/card title shown in story header */
  title: string;
  /** How the data was collected/aggregated — the "story" */
  method: string;
  /** DB tables this chart pulls from — becomes clickable KB links */
  tables?: SourceTable[];
  /** Data quality: official | research | scraped | estimated | mixed | model-generated */
  quality?: string;
  /** Any caveats, manipulation notes, or known issues */
  caveats?: string;
  /** External source URL */
  sourceUrl?: string;
}

const QUALITY_CONFIG: Record<string, { icon: typeof Shield; label: string; color: string; bg: string }> = {
  official:          { icon: Shield,       label: 'Official Government Data',     color: 'text-[#003366]', bg: 'bg-[#003366]/8' },
  research:          { icon: FlaskConical, label: 'Peer-Reviewed Research',       color: 'text-[#2E7D6B]', bg: 'bg-[#2E7D6B]/8' },
  scraped:           { icon: Globe,        label: 'Web Scraped',                  color: 'text-[#C9A84C]', bg: 'bg-[#C9A84C]/8' },
  estimated:         { icon: AlertTriangle,label: 'Contains Estimates',           color: 'text-[#0A5C8A]', bg: 'bg-[#0A5C8A]/8' },
  'official+estimated': { icon: AlertTriangle, label: 'Official + Estimated',    color: 'text-[#0A5C8A]', bg: 'bg-[#0A5C8A]/8' },
  'official+scraped':   { icon: Shield,    label: 'Official + Scraped',           color: 'text-[#003366]', bg: 'bg-[#003366]/8' },
  mixed:             { icon: Info,         label: 'Multiple Sources',             color: 'text-[#6B8EB5]', bg: 'bg-[#6B8EB5]/8' },
  'model-generated': { icon: FlaskConical, label: 'Model Generated',             color: 'text-[#6B8EB5]', bg: 'bg-[#6B8EB5]/8' },
};

const DataStory = ({ children, title, method, tables, quality, caveats, sourceUrl }: DataStoryProps) => {
  const [flipped, setFlipped] = useState(false);
  const { t } = useLanguage();
  const q = QUALITY_CONFIG[quality || 'mixed'] || QUALITY_CONFIG.mixed;
  const QIcon = q.icon;

  return (
    <div className="relative">
      {/* ── Info toggle button ─────────────────────── */}
      {!flipped && (
        <button
          onClick={() => setFlipped(true)}
          title={t('عرض قصة البيانات', 'View data story')}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-gray-50 hover:bg-[#003366]/10 border border-gray-200 hover:border-[#003366]/30 transition-all group"
        >
          <Info className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#003366] transition-colors" />
        </button>
      )}

      {/* ── Normal view (chart/card) ───────────────── */}
      {!flipped && children}

      {/* ── Flipped view (data story) ──────────────── */}
      {flipped && (
        <div className="bg-white border border-gray-100 shadow-md rounded-2xl p-5 min-h-[200px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#003366]" />
              <h3 className="text-sm font-bold text-gray-900">{title}</h3>
            </div>
            <button
              onClick={() => setFlipped(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Quality badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${q.bg} ${q.color}`}>
              <QIcon className="w-3.5 h-3.5" />
              {q.label}
            </span>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#007DB5] hover:underline">
                <ExternalLink className="w-3 h-3" />
                {t('المصدر الأصلي', 'Original source')}
              </a>
            )}
          </div>

          {/* Method — the data story */}
          <div className="mb-4">
            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('كيف تم جمع البيانات', 'How data was collected')}
            </h4>
            <p className="text-xs text-gray-700 leading-relaxed">{method}</p>
          </div>

          {/* Caveats */}
          {caveats && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">
                    {t('ملاحظات', 'Caveats & Notes')}
                  </h4>
                  <p className="text-xs text-amber-800 leading-relaxed">{caveats}</p>
                </div>
              </div>
            </div>
          )}

          {/* Source tables — clickable links to Knowledge Base */}
          {tables && tables.length > 0 && (
            <div>
              <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {t('جداول البيانات المصدرية', 'Source Tables in Knowledge Base')}
              </h4>
              <div className="space-y-1.5">
                {tables.map(tbl => (
                  <Link
                    key={tbl.name}
                    to={`/knowledge-base?table=${tbl.name}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-50 hover:bg-[#003366]/5 border border-gray-100 hover:border-[#003366]/20 transition-all group"
                  >
                    <Database className="w-4 h-4 text-gray-400 group-hover:text-[#003366] transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 group-hover:text-[#003366] transition-colors">{tbl.label}</p>
                      <p className="text-[10px] font-mono text-gray-400">{tbl.name}</p>
                    </div>
                    <ArrowLeft className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#003366] rotate-180 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Back to chart */}
          <button
            onClick={() => setFlipped(false)}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-xs text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            {t('العودة للرسم البياني', 'Back to chart')}
          </button>
        </div>
      )}
    </div>
  );
};

export default DataStory;
