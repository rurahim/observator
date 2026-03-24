import { LucideIcon, Inbox, AlertCircle, BarChart3, RefreshCw } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  compact?: boolean;
}

const EmptyState = ({ icon: Icon = Inbox, title, description, action, compact }: EmptyStateProps) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-16'}`}>
    <div className={`${compact ? 'w-10 h-10 mb-3' : 'w-14 h-14 mb-4'} rounded-2xl bg-surface-tertiary flex items-center justify-center`}>
      <Icon className={`${compact ? 'w-5 h-5' : 'w-7 h-7'} text-text-muted`} />
    </div>
    <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-primary mb-1`}>{title}</h3>
    {description && <p className="text-xs text-text-muted max-w-xs">{description}</p>}
    {action && (
      <button
        onClick={action.onClick}
        className="mt-4 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-xs font-medium hover:bg-navy-dark transition-colors"
      >
        {action.label}
      </button>
    )}
  </div>
);

export default EmptyState;

export const ChartEmpty = ({ title = 'No data available', height = 240 }: { title?: string; height?: number }) => (
  <div
    className="flex flex-col items-center justify-center bg-surface-tertiary/50 rounded-xl border border-dashed border-border-light"
    style={{ height }}
  >
    <BarChart3 className="w-8 h-8 text-text-muted/40 mb-2" />
    <span className="text-xs text-text-muted">{title}</span>
  </div>
);

export const ErrorState = ({
  message = 'Failed to load data',
  onRetry,
  compact,
}: {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) => (
  <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-6' : 'py-12'}`}>
    <div className={`${compact ? 'w-10 h-10 mb-2' : 'w-12 h-12 mb-3'} rounded-2xl bg-sgi-critical/10 flex items-center justify-center`}>
      <AlertCircle className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} text-sgi-critical`} />
    </div>
    <p className="text-xs text-text-muted mb-2">{message}</p>
    {onRetry && (
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-navy hover:bg-surface-hover transition-colors"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
    )}
  </div>
);
