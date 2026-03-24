import { Database, Upload, Globe, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { SourceOption } from '@/api/types';

interface SourceToggleProps {
  sources?: SourceOption[];
  selected: string;          // 'all' | 'system' | 'user_upload' | specific source name
  onSelect: (value: string) => void;
}

/**
 * Source toggle pills — lets users filter data by source.
 * Shows available sources with row counts from the API.
 */
export default function SourceToggle({ sources, selected, onSelect }: SourceToggleProps) {
  const { t } = useLanguage();

  // Group sources by side for summary counts
  const demandRows = sources?.filter(s => s.side === 'demand').reduce((sum, s) => sum + s.rows, 0) || 0;
  const supplyRows = sources?.filter(s => s.side === 'supply').reduce((sum, s) => sum + s.rows, 0) || 0;
  const totalRows = (sources || []).reduce((sum, s) => sum + s.rows, 0);

  const presets = [
    {
      value: 'all',
      label: t('كل البيانات', 'All Data'),
      icon: Globe,
      count: totalRows,
    },
    {
      value: 'system',
      label: t('بيانات النظام', 'System Data'),
      icon: Database,
      count: (sources || []).filter(s => s.value !== 'user_upload').reduce((sum, s) => sum + s.rows, 0),
    },
    {
      value: 'user_upload',
      label: t('تحميلاتي', 'My Uploads'),
      icon: Upload,
      count: sources?.find(s => s.value === 'user_upload')?.rows || 0,
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-text-muted font-medium">
        <Database className="w-3.5 h-3.5" />
        {t('مصدر البيانات', 'Data Source')}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(({ value, label, icon: Icon, count }) => {
          const isSelected = selected === value;
          return (
            <button
              key={value}
              onClick={() => onSelect(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                ${isSelected
                  ? 'bg-navy text-white border-navy shadow-sm'
                  : 'bg-white text-text-muted border-border-light hover:border-navy/30 hover:text-primary'
                }`}
            >
              {isSelected ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              <span>{label}</span>
              {count > 0 && (
                <span className={`text-[10px] ${isSelected ? 'opacity-70' : 'opacity-50'}`}>
                  {count >= 1000 ? `${(count / 1000).toFixed(0)}K` : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Show supply/demand breakdown when "All Data" selected */}
      {selected === 'all' && totalRows > 0 && (
        <div className="flex items-center gap-3 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#003366]" />
            {t('طلب', 'Demand')}: {demandRows.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#C9A84C]" />
            {t('عرض', 'Supply')}: {supplyRows.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
