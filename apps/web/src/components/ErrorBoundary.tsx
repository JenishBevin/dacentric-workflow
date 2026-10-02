import React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  reloading: boolean;
}

// Every deploy ships route pages as separately-hashed chunk files (Vite's
// code splitting via React.lazy) and wipes the previous build's files from
// the server. A tab left open across a deploy still holds the OLD chunk
// URLs in memory, so the next time it lazy-loads a page it hasn't visited
// yet, that fetch 404s — surfacing as exactly this error, thrown up to this
// boundary. It isn't a real app bug, just a stale build in that one tab.
const CHUNK_LOAD_ERROR_PATTERN = /dynamically imported module|loading chunk .* failed|importing a module script failed/i;
// Exported so main.tsx's "vite:preloadError" listener (a module-preload
// failure that Vite itself intercepts, rather than one that reaches this
// boundary as a thrown render error) shares the same one-reload budget.
export const RELOAD_GUARD_KEY = "chunk-reload-attempted";

function isChunkLoadError(error: Error): boolean {
  return CHUNK_LOAD_ERROR_PATTERN.test(error.message ?? "") || error.name === "ChunkLoadError";
}

/**
 * Without this, an uncaught render error anywhere in the tree unmounts the
 * whole app — React's default behavior with no error boundary — leaving a
 * blank white screen with no message, no console clue visible to the user,
 * and no way back in short of a manual reload. This catches it, logs the
 * real error (check the browser console — F12 — for the stack trace next
 * time this fires) and offers a reload instead of a dead white page.
 *
 * A stale-chunk error specifically (see above) self-heals: it auto-reloads
 * once rather than showing the alarming "Something went wrong" card for
 * what's really just "this tab needs the page it's already on refreshed."
 * Guarded via sessionStorage against looping if reloading doesn't actually
 * fix it (a genuinely broken deploy, or offline) — falls through to the
 * normal error card on a second occurrence.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, reloading: false };
  }

  componentDidMount() {
    // Reaching a successful mount means this load's chunks are current —
    // clear the guard so a *future* deploy still gets one fresh auto-retry.
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Uncaught render error — this crashed the whole app:", error, info.componentStack);

    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_GUARD_KEY)) {
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      this.setState({ reloading: true });
      window.location.reload();
    }
  }

  render() {
    if (this.state.reloading) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm text-slate-500">Updating to the latest version…</p>
        </div>
      );
    }
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
