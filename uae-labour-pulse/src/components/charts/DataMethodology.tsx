/**
 * DataMethodology — Transparency panel for every chart/table.
 *
 * Aligned with: OECD OURdata, ILO Convention 160, Eurostat SIMS v2.0,
 * UK ONS Code of Practice, US BLS Handbook of Methods.
 *
 * WCAG 2.1 AA compliant: aria-expanded, role="tablist", role="tab",
 * role="tabpanel", aria-selected, aria-controls, aria-labelledby.
 */
import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Layers,
  Calculator,
  RefreshCw,
  Globe,
  AlertTriangle,
  ShieldCheck,
  History,
  Info,
  Users,
  Factory,
  CalendarRange,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { VIEW_METHODOLOGY, DATA_STATUS_META } from '@/utils/methodology';

interface DataMethodologyProps {
  viewName: string;
  compact?: boolean;
}

const TABS = [
  { key: 'methodology' as const, labelAr: 'المنهجية', labelEn: 'Methodology', icon: Calculator },
  { key: 'coverage' as const, labelAr: 'التغطية والقيود', labelEn: 'Coverage & Limitations', icon: Globe },
  { key: 'confidence' as const, labelAr: 'الثقة والمراجعة', labelEn: 'Confidence & Revisions', icon: ShieldCheck },
];

const DataMethodology = ({ viewName, compact = false }: DataMethodologyProps) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'methodology' | 'coverage' | 'confidence'>('methodology');
  const methodology = VIEW_METHODOLOGY[viewName];

  if (!methodology) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`DataMethodology: no entry found for viewName="${viewName}"`);
    }
    return null;
  }

  const status = DATA_STATUS_META[methodology.dataStatus];
  const panelId = `methodology-panel-${viewName}`;
  const toggleId = `methodology-toggle-${viewName}`;

  /* ── Methodology tab sections ────────────────────────────── */
  const methodSections = [
    { id: 'sources', icon: Database, label: t('مصادر البيانات', 'Data Sources'), content: methodology.sources.join(' · ') },
    { id: 'aggregation', icon: Layers, label: t('التجميع', 'Aggregation'), content: methodology.aggregation },
    { id: 'formula', icon: Calculator, label: t('الصيغة', 'Formula'), content: methodology.formula, mono: true },
    { id: 'frequency', icon: RefreshCw, label: t('تكرار التحديث', 'Update Frequency'), content: methodology.updateFrequency },
  ];

  /* ── Coverage grid items (lucide icons instead of emoji) ─── */
  const coverageItems = [
    { id: 'geo', icon: Globe, label: t('التغطية الجغرافية', 'Geographic'), value: methodology.coverage.geographic },
    { id: 'pop', icon: Users, label: t('السكان', 'Population'), value: methodology.coverage.population },
    { id: 'sec', icon: Factory, label: t('القطاعات', 'Sectors'), value: methodology.coverage.sectors },
    { id: 'time', icon: CalendarRange, label: t('النطاق الزمني', 'Time Range'), value: methodology.coverage.temporalRange },
  ];

  /* ── Revision text ─────────────────────────────────────────── */
  const revisionText = [
    methodology.revision.schedule,
    methodology.revision.revisionNote,
    methodology.revision.lastRevised ? `Last revised: ${methodology.revision.lastRevised}` : null,
    methodology.revision.nextRevision ? `Next revision: ${methodology.revision.nextRevision}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  /* ── Confidence level display ─────────────────────────────── */
  const confidenceLevelText = methodology.confidence.level === 'N/A'
    ? t('غير قابل للتطبيق (بيانات سجل إداري)', 'Not Applicable (administrative register data)')
    : methodology.confidence.level;

  return (
    <div className={compact ? 'mt-1' : 'mt-2'}>
      {/* ── Toggle button + Data Status badge ───────────── */}
      <div className="flex items-center gap-2">
        <button
          id={toggleId}
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-navy transition-colors"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <Database className="w-3 h-3" />
          {t('المنهجية ومصادر البيانات', 'Methodology & Data Sources')}
        </button>

        {/* Data status badge — always visible (UK ONS: preliminary/final must be prominent) */}
        <span
          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ backgroundColor: status.color + '18', color: status.color, border: `1px solid ${status.color}40` }}
          title={status.description}
          role="status"
        >
          {t(status.labelAr, status.label)}
        </span>
      </div>

      {expanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={toggleId}
          className="mt-2 border-l-2 border-navy/20 bg-surface-tertiary/50 rounded-r-lg overflow-hidden"
        >
          {/* ── Tab bar (WCAG: role=tablist) ────────────── */}
          <div role="tablist" aria-label={t('أقسام المنهجية', 'Methodology sections')} className="flex border-b border-navy/10 bg-surface-tertiary/80">
            {TABS.map(tab => (
              <button
                key={tab.key}
                role="tab"
                id={`tab-${viewName}-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`tabpanel-${viewName}-${tab.key}`}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-navy border-b-2 border-navy bg-white/50'
                    : 'text-text-muted hover:text-navy/70'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                {t(tab.labelAr, tab.labelEn)}
              </button>
            ))}
          </div>

          {/* ── TAB 1: Methodology ────────────────────── */}
          <div
            role="tabpanel"
            id={`tabpanel-${viewName}-methodology`}
            aria-labelledby={`tab-${viewName}-methodology`}
            hidden={activeTab !== 'methodology'}
            className="p-3 space-y-2.5"
          >
            {methodSections.map(({ id, icon: Icon, label, content, mono }) => (
              <div key={id} className="flex items-start gap-2">
                <Icon className="w-3.5 h-3.5 text-navy/60 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    {label}
                  </span>
                  <p
                    className={`text-[11px] text-text-secondary leading-relaxed mt-0.5 ${
                      mono ? 'font-mono whitespace-pre-line' : ''
                    }`}
                  >
                    {content}
                  </p>
                </div>
              </div>
            ))}
            {/* Measurement note */}
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-navy/60 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {t('ملاحظة القياس', 'Measurement Note')}
                </span>
                <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">
                  {methodology.measurement}
                </p>
              </div>
            </div>
          </div>

          {/* ── TAB 2: Coverage & Limitations ─────────── */}
          <div
            role="tabpanel"
            id={`tabpanel-${viewName}-coverage`}
            aria-labelledby={`tab-${viewName}-coverage`}
            hidden={activeTab !== 'coverage'}
            className="p-3 space-y-2.5"
          >
            {/* Coverage grid — lucide icons (accessible, consistent rendering) */}
            <div className="grid grid-cols-2 gap-2">
              {coverageItems.map(item => (
                <div key={item.id} className="bg-white/60 rounded p-2 border border-navy/5">
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                    <item.icon className="w-3 h-3" aria-hidden="true" />
                    {item.label}
                  </span>
                  <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Exclusions — red-tinted box */}
            <div className="bg-red-50 border border-red-200 rounded p-2.5 mt-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" aria-hidden="true" />
                <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">
                  {t('ما لم يتم تضمينه', 'What Is NOT Included')}
                </span>
              </div>
              <ul className="space-y-1" role="list">
                {methodology.coverage.exclusions.map(exc => (
                  <li key={exc.slice(0, 50)} className="text-[11px] text-red-800 leading-relaxed flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5" aria-hidden="true">&#x2717;</span>
                    {exc}
                  </li>
                ))}
              </ul>
            </div>

            {/* Known limitations — amber-tinted box */}
            <div className="bg-amber-50 border border-amber-200 rounded p-2.5 mt-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                  {t('القيود المعروفة', 'Known Limitations')}
                </span>
              </div>
              <ul className="space-y-1" role="list">
                {methodology.coverage.knownLimitations.map(lim => (
                  <li key={lim.slice(0, 50)} className={`text-[11px] leading-relaxed flex items-start gap-1.5 ${
                    lim.startsWith('CRITICAL') ? 'text-red-700 font-medium' : 'text-amber-800'
                  }`}>
                    <span className="text-amber-400 mt-0.5" aria-hidden="true">
                      {lim.startsWith('CRITICAL') ? '!' : '\u26A0'}
                    </span>
                    {lim}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── TAB 3: Confidence & Revisions ────────── */}
          <div
            role="tabpanel"
            id={`tabpanel-${viewName}-confidence`}
            aria-labelledby={`tab-${viewName}-confidence`}
            hidden={activeTab !== 'confidence'}
            className="p-3 space-y-2.5"
          >
            {/* Confidence info */}
            <div className="bg-blue-50 border border-blue-200 rounded p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                  {t('مستوى الثقة', 'Confidence Level')}: {confidenceLevelText}
                </span>
              </div>
              {methodology.confidence.marginOfError && (
                <p className="text-[11px] text-blue-800 font-medium mb-1">
                  {t('هامش الخطأ', 'Margin of Error')}: {methodology.confidence.marginOfError}
                </p>
              )}
              <p className="text-[11px] text-blue-700 leading-relaxed">
                {methodology.confidence.note}
              </p>
            </div>

            {/* Revision policy */}
            <div className="flex items-start gap-2 mt-2">
              <History className="w-3.5 h-3.5 text-navy/60 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {t('سياسة المراجعة', 'Revision Policy')}
                </span>
                <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5 whitespace-pre-line">
                  {revisionText}
                </p>
              </div>
            </div>

            {/* Data status explanation */}
            <div className="flex items-start gap-2 mt-2">
              <Info className="w-3.5 h-3.5 text-navy/60 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {t('حالة البيانات', 'Data Status')}
                </span>
                <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">
                  <span className="font-medium" style={{ color: status.color }}>
                    {status.label}
                  </span>
                  {' — '}{status.description}
                </p>
                <div className="flex flex-wrap gap-2 mt-2" role="list" aria-label={t('مستويات حالة البيانات', 'Data status levels')}>
                  {Object.entries(DATA_STATUS_META).map(([key, meta]) => (
                    <span
                      key={key}
                      role="listitem"
                      className="text-[9px] px-1.5 py-0.5 rounded border"
                      style={{
                        backgroundColor: key === methodology.dataStatus ? meta.color + '18' : 'transparent',
                        color: meta.color,
                        borderColor: meta.color + '40',
                        fontWeight: key === methodology.dataStatus ? 700 : 400,
                      }}
                    >
                      {meta.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataMethodology;
