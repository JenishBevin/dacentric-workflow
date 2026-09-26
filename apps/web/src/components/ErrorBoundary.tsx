import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, an uncaught render error anywhere in the tree unmounts the
 * whole app — React's default behavior with no error boundary — leaving a
 * blank white screen with no message, no console clue visible to the user,
 * and no way back in short of a manual reload. This catches it, logs the
 * real error (check the browser console — F12 — for the stack trace next
 * time this fires) and offers a reload instead of a dead white page.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Uncaught render error — this crashed the whole app:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-500" />
          <div>
            <p className="text-base font-semibold text-slate-900">Something went wrong.</p>
            <p className="mt-1 text-sm text-slate-500">This page hit an unexpected error. Reloading usually fixes it.</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Reload
          </button>
          <details className="mt-2 max-w-lg text-left text-xs text-slate-400">
            <summary className="cursor-pointer select-none">Technical details</summary>
            <pre className="mt-1 whitespace-pre-wrap break-words">{this.state.error.message}</pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
