import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ChatLauncherProvider } from "./context/ChatLauncherContext";
import { ErrorBoundary, RELOAD_GUARD_KEY } from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

// Vite's own module-preload failure path (distinct from a chunk import
// error thrown during render, which ErrorBoundary.tsx catches) — fires when
// a route's lazy chunk 404s because this tab's build is older than what's
// now deployed. Same self-heal, same one-reload guard, so a genuinely
// broken deploy still surfaces instead of reloading forever.
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
  sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Background poll so one person's changes (e.g. moving a task, editing
      // a project) show up for everyone else viewing the same screen without
      // a manual reload — same interval chat already polls conversations at.
      // Only ticks for actively-mounted queries and pauses when the tab is
      // hidden/backgrounded (refetchIntervalInBackground defaults to false),
      // so it doesn't run up API calls for screens nobody is looking at.
      refetchInterval: 15000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <ChatLauncherProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
            </ChatLauncherProvider>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
