import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ChatLauncherProvider } from "./context/ChatLauncherContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./index.css";

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
