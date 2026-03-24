/**
 * DrillBreadcrumb — shows the current drill path with clickable levels.
 * Click any level to pop back to that point. Reset button clears all.
 */
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useDrill } from '@/contexts/DrillContext';
import { useLanguage } from '@/contexts/LanguageContext';

const DrillBreadcrumb = () => {
  const { t } = useLanguage();
  const { stack, pop, reset, depth } = useDrill();

  if (depth === 0) return null;

  return (
    <div className="flex items-center gap-1 text-xs mb-3 flex-wrap">
      <button
        onClick={reset}
        className="text-navy hover:underline font-medium"
      >
        {t('الكل', 'All')}
      </button>
      {stack.map((level, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-text-muted" />
          {i < stack.length - 1 ? (
            <button
              onClick={() => pop(i + 1)}
              className="text-navy hover:underline font-medium"
            >
              {level.label}
            </button>
          ) : (
            <span className="text-primary font-semibold">{level.label}</span>
          )}
        </span>
      ))}
      <button
        onClick={reset}
        className="ml-2 p-1 rounded-md hover:bg-surface-hover transition-colors text-text-muted hover:text-navy"
        title={t('إعادة تعيين', 'Reset')}
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
};

export default DrillBreadcrumb;
