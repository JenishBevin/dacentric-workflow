import axios, { AxiosError } from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

const TOKEN_STORAGE_KEY = "dacentric_access_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface ApiErrorShape {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export function extractApiError(err: unknown): ApiErrorShape {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ error?: ApiErrorShape }>;
    if (axiosErr.response?.data?.error) return axiosErr.response.data.error;
    if (axiosErr.code === "ERR_NETWORK") {
      return { code: "NETWORK_ERROR", message: "Could not reach the server. Check your connection and try again." };
    }
  }
  return { code: "UNKNOWN", message: "Something went wrong. Please try again." };
}

let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

// The access token is short-lived; the refresh token lives in an httpOnly
// cookie the browser sends automatically. A single in-flight promise is
// shared across every 401 that arrives at once, so a burst of concurrent
// requests triggers exactly one /auth/refresh call, not one per request.
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        const token = res.data?.data?.accessToken as string | undefined;
        setStoredToken(token ?? null);
        return token ?? null;
      })
      .catch(() => {
        setStoredToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (!axios.isAxiosError(err) || err.response?.status !== 401) return Promise.reject(err);

    const config = err.config as (typeof err.config & { _retried?: boolean }) | undefined;
    const isRefreshCall = config?.url?.includes("/auth/refresh");
    if (!config || isRefreshCall || config._retried) {
      setStoredToken(null);
      onUnauthorized?.();
      return Promise.reject(err);
    }

    config._retried = true;
    const newToken = await refreshAccessToken();
    if (!newToken) {
      onUnauthorized?.();
      return Promise.reject(err);
    }
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${newToken}`;
    return api(config);
  }
);
