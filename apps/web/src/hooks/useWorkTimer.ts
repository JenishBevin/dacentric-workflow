import { useEffect, useRef, useState } from "react";
import { useStartWorkTime, useHeartbeatWorkTime, useWorkTimeToday } from "../api/workTime";
import { API_BASE_URL, getStoredToken } from "../lib/apiClient";

// Comfortably under the server's 3-minute stale threshold, with margin above
// Chrome's most aggressive background-tab throttling (still fires at least
// once a minute) — so an ordinary backgrounded tab never gets mistaken for a
// sleeping machine.
const HEARTBEAT_MS = 30000;

/**
 * Starts a work-time segment on load and keeps it alive with a heartbeat
 * every 30s — deliberately independent of tab visibility, so it keeps
 * counting across tab switches, other apps, and minimizing. Only a real
 * system sleep/suspend or the browser dying stops the heartbeats; the server
 * detects that gap and excludes it from the tracked time (see
 * workTime.service.ts). A web page has no way to detect the monitor's power
 * state directly — this is the closest a browser-based tracker can get.
 */
export function useWorkTimer() {
  const { data: today, isLoading } = useWorkTimeToday();
  const start = useStartWorkTime();
  const heartbeat = useHeartbeatWorkTime();
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const startedRef = useRef(false);

  // Kick off (or resume, or reconcile a stale segment) once on load.
  useEffect(() => {
    if (isLoading || startedRef.current) return;
    startedRef.current = true;
    start.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Heartbeat forever while mounted, regardless of visibility.
  useEffect(() => {
    const id = setInterval(() => heartbeat.mutate(), HEARTBEAT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort: closes the segment immediately if the tab/browser actually
  // closes, rather than waiting up to the stale threshold to be reconciled.
  useEffect(() => {
    function onPageHide() {
      const token = getStoredToken();
      if (!token) return;
      navigator.sendBeacon?.(`${API_BASE_URL}/work-time/pause`, new Blob([JSON.stringify({})], { type: "application/json" }));
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Local ticking display, resynced whenever the server confirms a new value.
  useEffect(() => {
    if (today) setDisplaySeconds(today.todaySeconds);
  }, [today]);

  useEffect(() => {
    if (!today?.isRunning) return;
    const id = setInterval(() => setDisplaySeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [today?.isRunning]);

  return { isRunning: today?.isRunning ?? false, todaySeconds: displaySeconds, isLoading };
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}
