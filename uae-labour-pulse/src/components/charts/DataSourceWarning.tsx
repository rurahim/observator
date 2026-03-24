/**
 * DataSourceWarning — Alert banner shown on charts that combine
 * incompatible data sources (e.g., MOHRE permits + LinkedIn ads).
 *
 * Aligned with: US BLS practice of separating household vs establishment
 * surveys, ILO standard of documenting measurement breaks.
 *
 * Appears as a collapsible amber/red banner above or below the chart.
 */
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export interface SourceBreak {
  /** Year or date when the data source changes */
  breakPoint: string;
  /** Description of what was used BEFORE the break */
  before: { source: string; measure: string; scale: string };
  /** Description of what is used AFTER the break */
  after: { source: string; measure: string; scale: string };
  /** Why this matters */
  impact: string;
}

interface DataSourceWarningProps {
  /** The type of warning: 'break' for measurement change, 'mixed' for blended sources */
  type: 'break' | 'mixed';
  /** One-line summary shown when collapsed */
  summary: string;
  summaryAr?: string;
  /** Detailed source breaks */
  breaks?: SourceBreak[];
  /** Severity: 'critical' (red border) or 'warning' (amber border) */
  severity?: 'critical' | 'warning';
}

const DataSourceWarning = ({
  type,
  summary,
  summaryAr,
  breaks = [],
  severity = 'warning',
}: DataSourceWarningProps) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const isCritical = severity === 'critical';
  const borderColor = isCritical ? 'border-red-300' : 'border-amber-300';
  const bgColor = isCritical ? 'bg-red-50' : 'bg-amber-50';
  const iconColor = isCritical ? 'text-red-600' : 'text-amber-600';
  const textColor = isCritical ? 'text-red-800' : 'text-amber-800';
  const tagBg = isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';

  return (
    <div
      className={`${bgColor} border ${borderColor} rounded-lg overflow-hidden my-2`}
      role="alert"
      aria-live="polite"
    >
      {/* ── Collapsed summary ─────────────────────────── */}
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className={`w-full flex items-start gap-2 px-3 py-2 text-left ${textColor}`}
      >
        <AlertTriangle className={`w-4 h-4 ${iconColor} mt-0.5 shrink-0`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${tagBg}`}>
              {type === 'break'
                ? t('تغيير مصدر البيانات', 'Data Source Change')
                : t('مصادر مختلطة', 'Mixed Sources')
              }
            </span>
            <span className="text-[11px] font-medium leading-snug">
              {summaryAr ? t(summaryAr, summary) : summary}
            </span>
          </div>
        </div>
        {breaks.length > 0 && (
          expanded
            ? <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            : <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        )}
      </button>

      {/* ── Expanded detail ───────────────────────────── */}
      {expanded && breaks.length > 0 && (
        <div className="px-3 pb-3 space-y-3">
          {breaks.map((brk, i) => (
            <div key={brk.breakPoint} className="bg-white/70 rounded border border-current/5 p-2.5">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold ${textColor} uppercase`}>
                  {t('نقطة التغيير', 'Break Point')}: {brk.breakPoint}
                </span>
              </div>

              {/* Before / After comparison */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-surface-tertiary/50 rounded p-2 border-l-2 border-navy/30">
                  <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block mb-1">
                    {t('قبل', 'Before')} {brk.breakPoint}
                  </span>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    <strong>{t('المصدر', 'Source')}:</strong> {brk.before.source}
                  </p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    <strong>{t('يقيس', 'Measures')}:</strong> {brk.before.measure}
                  </p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    <strong>{t('المقياس', 'Scale')}:</strong> {brk.before.scale}
                  </p>
                </div>
                <div className="bg-surface-tertiary/50 rounded p-2 border-l-2 border-gold/50">
                  <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider block mb-1">
                    {t('بعد', 'After')} {brk.breakPoint}
                  </span>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    <strong>{t('المصدر', 'Source')}:</strong> {brk.after.source}
                  </p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    <strong>{t('يقيس', 'Measures')}:</strong> {brk.after.measure}
                  </p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    <strong>{t('المقياس', 'Scale')}:</strong> {brk.after.scale}
                  </p>
                </div>
              </div>

              {/* Impact */}
              <div className="flex items-start gap-1.5 mt-2">
                <Info className="w-3 h-3 text-navy/60 mt-0.5 shrink-0" aria-hidden="true" />
                <p className={`text-[10px] ${textColor} leading-relaxed font-medium`}>
                  {brk.impact}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Pre-configured warnings for common Observator charts ──── */

/** Demand chart: MOHRE permits (2020-2023) -> LinkedIn ads (2024+) */
export const DEMAND_SOURCE_BREAK: DataSourceWarningProps = {
  type: 'break',
  severity: 'critical',
  summary: 'Demand measurement changes at 2024 — numbers before and after this point are NOT directly comparable.',
  summaryAr: 'يتغير قياس الطلب عند 2024 — الأرقام قبل وبعد هذه النقطة غير قابلة للمقارنة المباشرة.',
  breaks: [
    {
      breakPoint: '2024',
      before: {
        source: 'MOHRE Work Permits Issued',
        measure: 'Actual completed hires (government records)',
        scale: '~800,000 - 1,600,000 per year',
      },
      after: {
        source: 'LinkedIn UAE Job Postings',
        measure: 'Advertised vacancies (may not be filled)',
        scale: '~13,000 - 37,000 per year',
      },
      impact: 'The ~99% drop in the chart at 2024 is a MEASUREMENT CHANGE, not a demand collapse. MOHRE permits count people hired. LinkedIn counts job ads posted. One job ad may result in 0 or 100 hires.',
    },
  ],
};

/** Supply chart: All-sector (2015-2019) -> Private-only (2020-2024) */
export const SUPPLY_SOURCE_BREAK: DataSourceWarningProps = {
  type: 'break',
  severity: 'warning',
  summary: 'Supply definition changes at 2020 — includes all sectors before, private sector only after.',
  summaryAr: 'يتغير تعريف العرض عند 2020 — يشمل جميع القطاعات قبلها، والقطاع الخاص فقط بعدها.',
  breaks: [
    {
      breakPoint: '2020',
      before: {
        source: 'Bayanat Open Data Portal',
        measure: 'All registered workers (public + private sectors)',
        scale: '~9,000,000 - 10,000,000 per year',
      },
      after: {
        source: 'GLMM / MOHRE Official Statistics',
        measure: 'Private sector workers only',
        scale: '~4,800,000 - 7,800,000 per year',
      },
      impact: 'The ~50% drop in supply at 2020 is because government workers (~4M) are excluded from 2020 onwards, not because the workforce shrank. The real private sector grew from 4.8M (2020) to 7.8M (2024).',
    },
  ],
};

/** Forecast chart: Mixed training data warning */
export const FORECAST_MIXED_SOURCES: DataSourceWarningProps = {
  type: 'mixed',
  severity: 'warning',
  summary: 'Forecast trained on mixed data sources — MOHRE permits (2020-2023) and LinkedIn ads (2024+). Treat predictions as directional only.',
  summaryAr: 'تم تدريب التنبؤ على مصادر بيانات مختلطة — تصاريح وزارة الموارد (2020-2023) وإعلانات لينكد إن (2024+). تعامل مع التوقعات كاتجاهية فقط.',
  breaks: [],
};

export default DataSourceWarning;
