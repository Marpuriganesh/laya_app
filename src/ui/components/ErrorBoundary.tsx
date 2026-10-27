import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl m-4 text-zinc-900 dark:text-zinc-100">
          <AlertTriangle className="w-8 h-8 text-red-500 mb-2" />
          <h4 className="text-sm font-bold text-red-600 dark:text-red-400">
            {this.props.fallbackTitle || "Something went wrong in this panel"}
          </h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-md font-mono text-[11px] break-words">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-xs cursor-pointer transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Recover</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
