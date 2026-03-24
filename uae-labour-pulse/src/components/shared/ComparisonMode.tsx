// Comparison Mode — placeholder occupation comparison.
// Will be wired to skill-gap API with occupation-level drill-down in Phase 2.
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';
import { GitCompare, X, ChevronDown, ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface ComparisonItem {
  label: string;
  sgi: number;
  demand: number;
  supply: number;
  gap: number;
  emiratisation: number;
  aiRisk: number;
}

const occupations: ComparisonItem[] = [
  { label: 'AI Engineer', sgi: 43, demand: 2850, supply: 1624, gap: 1226, emiratisation: 2.1, aiRisk: 12 },
  { label: 'Cybersecurity Specialist', sgi: 38, demand: 1920, supply: 1190, gap: 730, emiratisation: 3.4, aiRisk: 8 },
  { label: 'Data Scientist', sgi: 34, demand: 1650, supply: 1089, gap: 561, emiratisation: 1.8, aiRisk: 15 },
  { label: 'Registered Nurse', sgi: 28, demand: 8500, supply: 6120, gap: 2380, emiratisation: 0.4, aiRisk: 5 },
  { label: 'Cloud Architect', sgi: 25, demand: 1200, supply: 900, gap: 300, emiratisation: 2.8, aiRisk: 18 },
  { label: 'Mechanical Engineer', sgi: 12, demand: 3200, supply: 2816, gap: 384, emiratisation: 5.2, aiRisk: 32 },
  { label: 'Accountant', sgi: 3, demand: 5400, supply: 5238, gap: 162, emiratisation: 8.1, aiRisk: 65 },
  { label: 'Marketing Manager', sgi: -8, demand: 2100, supply: 2268, gap: -168, emiratisation: 6.3, aiRisk: 42 },
];

const metrics = [
  { key: 'sgi', en: 'SGI %', ar: 'المؤشر %', format: (v: number) => `${v > 0 ? '+' : ''}${v}%` },
  { key: 'demand', en: 'Demand', ar: 'الطلب', format: (v: number) => v.toLocaleString() },
  { key: 'supply', en: 'Supply', ar: 'العرض', format: (v: number) => v.toLocaleString() },
  { key: 'gap', en: 'Gap', ar: 'الفجوة', format: (v: number) => `${v > 0 ? '+' : ''}${v.toLocaleString()}` },
  { key: 'emiratisation', en: 'Emiratisation %', ar: 'التوطين %', format: (v: number) => `${v}%` },
  { key: 'aiRisk', en: 'AI Risk %', ar: 'مخاطر الذكاء %', format: (v: number) => `${v}%` },
];

const DiffIndicator = ({ a, b, inverse }: { a: number; b: number; inverse?: boolean }) => {
  const diff = a - b;
  if (Math.abs(diff) < 0.5) return <Minus className="w-3 h-3 text-text-muted" />;
  const isPositive = inverse ? diff < 0 : diff > 0;
  return isPositive
    ? <ArrowUp className="w-3 h-3 text-sgi-critical" />
    : <ArrowDown className="w-3 h-3 text-sgi-balanced" />;
};

interface ComparisonModeProps {
  open: boolean;
  onClose: () => void;
}

const ComparisonMode = ({ open, onClose }: ComparisonModeProps) => {
  const { t } = useLanguage();
  const [itemA, setItemA] = useState(0);
  const [itemB, setItemB] = useState(1);

  const a = occupations[itemA];
  const b = occupations[itemB];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-card rounded-2xl border border-border-light shadow-dropdown w-full max-w-2xl max-h-[80vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border-light">
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-navy" />
                <h2 className="text-base font-bold text-primary">{t('مقارنة المهن', 'Compare Occupations')}</h2>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            {/* Selectors */}
            <div className="grid grid-cols-2 gap-4 p-5 pb-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1.5 block">
                  {t('المهنة أ', 'Occupation A')}
                </label>
                <div className="relative">
                  <select
                    value={itemA}
                    onChange={e => setItemA(Number(e.target.value))}
                    className="w-full h-9 px-3 pr-8 rounded-lg bg-navy/5 border border-navy/20 text-sm font-medium text-navy appearance-none focus:outline-none focus:ring-2 focus:ring-navy/20"
                  >
                    {occupations.map((o, i) => (
                      <option key={i} value={i}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-navy/50 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1.5 block">
                  {t('المهنة ب', 'Occupation B')}
                </label>
                <div className="relative">
                  <select
                    value={itemB}
                    onChange={e => setItemB(Number(e.target.value))}
                    className="w-full h-9 px-3 pr-8 rounded-lg bg-gold/5 border border-gold/30 text-sm font-medium text-gold-dark appearance-none focus:outline-none focus:ring-2 focus:ring-gold/20"
                  >
                    {occupations.map((o, i) => (
                      <option key={i} value={i}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gold/50 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Comparison Table */}
            <div className="px-5 pb-5 overflow-y-auto max-h-[50vh]">
              <div className="rounded-xl border border-border-light overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-tertiary">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-text-muted">{t('المقياس', 'Metric')}</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-navy">{a.label}</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-text-muted w-10"></th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-gold-dark">{b.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(m => {
                      const valA = a[m.key as keyof ComparisonItem] as number;
                      const valB = b[m.key as keyof ComparisonItem] as number;
                      const inverse = m.key === 'aiRisk';
                      return (
                        <tr key={m.key} className="border-t border-border-light">
                          <td className="px-4 py-3 text-text-secondary font-medium">{t(m.ar, m.en)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-semibold tabular-nums text-primary">{m.format(valA)}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DiffIndicator a={valA} b={valB} inverse={inverse} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-semibold tabular-nums text-primary">{m.format(valB)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Visual bar comparison */}
              <div className="mt-4 space-y-3">
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">{t('مقارنة بصرية', 'Visual Comparison')}</h4>
                {metrics.slice(0, 4).map(m => {
                  const valA = a[m.key as keyof ComparisonItem] as number;
                  const valB = b[m.key as keyof ComparisonItem] as number;
                  const max = Math.max(Math.abs(valA), Math.abs(valB)) || 1;
                  return (
                    <div key={m.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-text-muted">
                        <span>{t(m.ar, m.en)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-5 bg-surface-tertiary rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(Math.abs(valA) / max) * 100}%` }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="h-full bg-navy/70 rounded-full"
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-16 text-right text-navy">{m.format(valA)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-5 bg-surface-tertiary rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(Math.abs(valB) / max) * 100}%` }}
                            transition={{ duration: 0.5, delay: 0.2 }}
                            className="h-full bg-gold/70 rounded-full"
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-16 text-right text-gold-dark">{m.format(valB)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ComparisonMode;
