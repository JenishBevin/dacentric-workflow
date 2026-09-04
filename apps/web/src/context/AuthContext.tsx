import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, getStoredToken, setStoredToken, registerUnauthorizedHandler, refreshAccessToken } from "../lib/apiClient";
import { CurrentUser } from "../lib/types";

// Comfortably under the backend's default 30-minute access token TTL, so an
// active tab renews before the token would ever expire — the reactive 401
// retry in apiClient.ts is just the fallback if this timer drifts or the tab
// was asleep. Runs in the background even while the tab is hidden, which is
// what keeps a session alive without the user having to touch anything.
const PROACTIVE_REFRESH_MS = 20 * 60 * 1000;

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMe = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get("/auth/me");
      setUser(res.data.data);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null);
      navigate("/login", { replace: true });
    });
    fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (user) {
      refreshTimerRef.current = setInterval(() => {
        refreshAccessToken();
      }, PROACTIVE_REFRESH_MS);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [user]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post("/auth/login", { email, password });
      setStoredToken(res.data.data.accessToken);
      await fetchMe();
    },
    [fetchMe]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/work-time/pause").catch(() => undefined);
      await api.post("/auth/logout");
    } finally {
      setStoredToken(null);
      setUser(null);
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return <AuthContext.Provider value={{ user, loading, login, logout, refreshMe: fetchMe }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
