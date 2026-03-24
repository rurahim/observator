import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-card rounded-xl border border-sgi-critical/20 shadow-card p-6">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-sgi-critical/10 flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6 text-sgi-critical" />
            </div>
            <h3 className="text-sm font-semibold text-primary mb-1">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h3>
            <p className="text-xs text-text-muted mb-4 max-w-xs">
              This section encountered an error. You can try reloading it.
            </p>
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-xs font-medium hover:bg-navy-dark transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>

            {this.state.error && (
              <div className="mt-4 w-full text-left">
                <button
                  onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary"
                >
                  {this.state.showDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Error details
                </button>
                {this.state.showDetails && (
                  <pre className="mt-2 p-3 rounded-lg bg-surface-tertiary text-[10px] text-sgi-critical font-mono overflow-x-auto max-h-32">
                    {this.state.error.message}
                    {'\n'}
                    {this.state.error.stack?.split('\n').slice(1, 4).join('\n')}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
