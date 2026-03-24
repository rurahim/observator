import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, ChevronDown, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFilters } from '@/contexts/FilterContext';
import { useFilterOptions } from '@/api/hooks';
import SourceToggle from '@/components/shared/SourceToggle';

interface FilterBarProps {
  selectedEmirate?: string;
  selectedSector?: string;
  onEmirateChange?: (v: string) => void;
  onSectorChange?: (v: string) => void;
}

const pillClass = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
    active
      ? 'bg-navy text-primary-foreground'
      : 'bg-surface-tertiary text-text-secondary hover:bg-surface-hover'
  }`;

const FilterBar = ({ selectedEmirate, selectedSector, onEmirateChange, onSectorChange }: FilterBarProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const ctx = useFilters();
  const { data: filterOpts } = useFilterOptions();

  // Use props if provided, otherwise fall back to context
  const emirate = selectedEmirate ?? ctx.filters.emirate;
  const sector = selectedSector ?? ctx.filters.sector;
  const setEmirate = onEmirateChange ?? ctx.setEmirate;
  const setSector = onSectorChange ?? ctx.setSector;

  const { dataSource, gender, nationality, experience } = ctx.filters;
  const { setDataSource, setGender, setNationality, setExperience } = ctx;

  // Build emirate options from API (value=region_code, label=name)
  const emirateOptions = [
    { value: 'all', en: 'All Emirates', ar: 'جميع الإمارات' },
    ...(filterOpts?.emirates ?? []).map(e => ({
      value: e.value,
      en: e.label,
      ar: e.label_ar || e.label,
    })),
  ];

  // Build sector options from API — deduplicate by label
  const seenSectors = new Set<string>();
  const sectorOptions = [
    { value: 'all', en: 'All Sectors', ar: 'جميع القطاعات' },
    ...(filterOpts?.sectors ?? [])
      .filter(s => {
        if (seenSectors.has(s.label)) return false;
        seenSectors.add(s.label);
        return true;
      })
      .slice(0, 15) // Show top 15 sectors to avoid UI overflow
      .map(s => ({
        value: s.label, // Use sector label as filter value (matched in backend)
        en: s.label,
        ar: s.label_ar || s.label,
      })),
  ];

  const activeCount =
    (emirate !== 'all' ? 1 : 0) +
    (sector !== 'all' ? 1 : 0) +
    (dataSource !== 'all' ? 1 : 0) +
    (gender !== 'All' ? 1 : 0) +
    (nationality !== 'All' ? 1 : 0) +
    (experience !== 'All Levels' ? 1 : 0);

  const handleReset = () => {
    setEmirate('all');
    setSector('all');
    setDataSource('all');
    setGender('All');
    setNationality('All');
    setExperience('All Levels');
  };

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-light bg-card text-sm hover:bg-surface-hover transition-colors"
        >
          <Filter className="w-4 h-4 text-text-muted" />
          <span className="text-text-secondary font-medium">{t('تصفية البيانات', 'Filter Data')}</span>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-navy text-primary-foreground text-[10px] font-bold">{activeCount}</span>
          )}
          <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {activeCount > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-text-muted hover:text-sgi-critical hover:bg-sgi-critical/5 transition-colors"
          >
            <X className="w-3 h-3" />
            {t('إعادة تعيين', 'Reset')}
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Data Source — dynamic with row counts from API */}
              <div className="sm:col-span-2">
                <SourceToggle
                  sources={filterOpts?.sources}
                  selected={dataSource}
                  onSelect={setDataSource}
                />
              </div>

              {/* Emirate — uses region_code values from API */}
              <div>
                <span className="text-xs text-text-muted font-medium mb-1.5 block">{t('الإمارة', 'Emirate')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {emirateOptions.map(e => (
                    <button
                      key={e.value}
                      onClick={() => setEmirate(e.value)}
                      className={pillClass(emirate === e.value)}
                    >
                      {t(e.ar, e.en)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sector — uses real sector names from API */}
              <div>
                <span className="text-xs text-text-muted font-medium mb-1.5 block">{t('القطاع', 'Sector')}</span>
                <div className="flex flex-wrap gap-1.5">
                  {sectorOptions.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setSector(s.value)}
                      className={pillClass(sector === s.value)}
                    >
                      {t(s.ar, s.en)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic dimensions — gender, nationality, experience (shown only if data has them) */}
              {filterOpts?.dynamic?.gender && filterOpts.dynamic.gender.length > 0 && (
                <div>
                  <span className="text-xs text-text-muted font-medium mb-1.5 block">{t('الجنس', 'Gender')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setGender('All')} className={pillClass(gender === 'All')}>{t('الكل', 'All')}</button>
                    {filterOpts.dynamic.gender.map(g => (
                      <button key={g.value} onClick={() => setGender(g.value)} className={pillClass(gender === g.value)}>
                        {t(g.label_ar || g.label, g.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterOpts?.dynamic?.nationality && filterOpts.dynamic.nationality.length > 0 && (
                <div>
                  <span className="text-xs text-text-muted font-medium mb-1.5 block">{t('الجنسية', 'Nationality')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setNationality('All')} className={pillClass(nationality === 'All')}>{t('الكل', 'All')}</button>
                    {filterOpts.dynamic.nationality.map(n => (
                      <button key={n.value} onClick={() => setNationality(n.value)} className={pillClass(nationality === n.value)}>
                        {t(n.label_ar || n.label, n.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterOpts?.dynamic?.experience && filterOpts.dynamic.experience.length > 0 && (
                <div>
                  <span className="text-xs text-text-muted font-medium mb-1.5 block">{t('الخبرة', 'Experience')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setExperience('All Levels')} className={pillClass(experience === 'All Levels')}>{t('الكل', 'All')}</button>
                    {filterOpts.dynamic.experience.map(e => (
                      <button key={e.value} onClick={() => setExperience(e.value)} className={pillClass(experience === e.value)}>
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FilterBar;
