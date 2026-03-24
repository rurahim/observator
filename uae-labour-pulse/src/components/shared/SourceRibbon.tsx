import { Database, Clock, Shield, MapPin } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { DataMeta } from '@/api/types';

interface SourceRibbonProps {
  meta?: DataMeta | null;
  compact?: boolean;
}

/**
 * Dynamic source/freshness ribbon displayed under charts.
 * Shows which data sources contributed, row counts, freshness, quality, and coverage.
 */
export default function SourceRibbon({ meta, compact = false }: SourceRibbonProps) {
  const { t } = useLanguage();

  if (!meta || !meta.sources || meta.sources.length === 0) return null;

  // Aggregate sources by name (merge duplicates from different views)
  const sourceMap = new Map<string, number>();
  for (const s of meta.sources) {
    const name = s.name === 'system' ? 'System' : s.name.replace(/_/g, ' ');
    sourceMap.set(name, (sourceMap.get(name) || 0) + s.rows);
  }
  const aggregated = Array.from(sourceMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Top 5 sources

  const qualityColor = !meta.quality_score ? 'text-gray-400'
    : meta.quality_score >= 80 ? 'text-emerald-600'
    : meta.quality_score >= 50 ? 'text-amber-500'
    : 'text-red-500';

  const qualityLabel = !meta.quality_score ? null
    : meta.quality_score >= 80 ? t('جودة عالية', 'High Quality')
    : meta.quality_score >= 50 ? t('جودة متوسطة', 'Moderate')
    : t('جودة منخفضة', 'Low Quality');

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-[10px] text-text-muted mt-1 px-1">
        <span className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          {aggregated.map(([name, rows]) => `${name} (${rows.toLocaleString()})`).join(' · ')}
        </span>
        {meta.freshness_label && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {meta.freshness_label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted mt-2 px-2 py-1.5 bg-surface-secondary/50 rounded-lg border border-border-light">
      {/* Sources */}
      <div className="flex items-center gap-1.5">
        <Database className="w-3.5 h-3.5 text-navy/60" />
        <span className="font-medium text-primary/80">
          {t('المصادر:', 'Sources:')}
        </span>
        {aggregated.map(([name, rows], i) => (
          <span key={name}>
            <span className="font-medium">{name}</span>
            <span className="opacity-60"> ({rows.toLocaleString()})</span>
            {i < aggregated.length - 1 && <span className="opacity-40"> · </span>}
          </span>
        ))}
      </div>

      {/* Freshness */}
      {meta.freshness_label && (
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-navy/60" />
          <span>{t('آخر تحديث:', 'Updated:')} {meta.freshness_label}</span>
        </div>
      )}

      {/* Quality */}
      {meta.quality_score != null && (
        <div className="flex items-center gap-1">
          <Shield className={`w-3.5 h-3.5 ${qualityColor}`} />
          <span className={qualityColor}>
            {qualityLabel} ({meta.quality_score}/100)
          </span>
        </div>
      )}

      {/* Coverage */}
      {meta.coverage && (
        <div className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-navy/60" />
          <span>
            {meta.coverage.emirates}/{meta.coverage.total} {t('إمارات', 'emirates')}
          </span>
        </div>
      )}

      {/* Total rows */}
      {meta.total_rows > 0 && (
        <div className="ml-auto text-[10px] opacity-60">
          {meta.total_rows.toLocaleString()} {t('سجل', 'rows')}
        </div>
      )}
    </div>
  );
}
