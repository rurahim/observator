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
    this.state = { hasError: false, error: null, showDetails: true };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error.message);
    console.error('[ErrorBoundary] Stack:', error.stack);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
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
            {this.state.error && (
              <div className="mb-4 w-full p-3 rounded-lg bg-red-50 border border-red-200 text-left">
                <p className="text-xs font-mono text-red-700 break-all">{this.state.error.message}</p>
                <p className="text-[10px] font-mono text-red-500 mt-1 break-all whitespace-pre-wrap">
                  {this.state.error.stack?.split('\n').slice(1, 5).join('\n')}
                </p>
              </div>
            )}
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-primary-foreground text-xs font-medium hover:bg-navy-dark transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
