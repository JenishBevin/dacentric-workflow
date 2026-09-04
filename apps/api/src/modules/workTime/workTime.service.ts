import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";
import { PermissionKey } from "@dacentric/types";
import { resolveScopedEmployeeIds } from "../teamWorkload/teamWorkload.service";

// A web page cannot detect the monitor's power state. What it *can* detect
// is a gap in heartbeats bigger than any plausible background-tab throttling
// delay (Chrome's most aggressive throttling still fires at least once a
// minute) — a gap this large means the machine was actually asleep, or the
// browser/tab died outright. That's the closest proxy available, and it's
// what every read/write path below reconciles against.
const STALE_THRESHOLD_MS = 3 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  return x; // exclusive
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Local YYYY-MM-DD — never use toISOString() for this, it shifts to UTC and
 * can land on the wrong day for any non-zero timezone offset. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Seconds that [start,end) overlaps [rangeStart,rangeEnd). */
function overlapSeconds(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): number {
  const s = Math.max(start.getTime(), rangeStart.getTime());
  const e = Math.min(end.getTime(), rangeEnd.getTime());
  return Math.max(0, e - s) / 1000;
}

interface Segment {
  startedAt: Date;
  endedAt: Date | null;
  lastHeartbeatAt: Date;
}

/** The instant a segment's contribution actually stops counting: its real
 * endedAt if closed, otherwise "now" unless heartbeats went stale, in which
 * case it's capped at the last confirmed-alive heartbeat. This makes every
 * read self-correcting even before the next start/heartbeat call physically
 * closes the row — important for reports on OTHER users, whose tab might be
 * asleep with nobody around to trigger a reconciling write. */
function effectiveEnd(s: Segment, now: Date): Date {
  if (s.endedAt) return s.endedAt;
  const staleSince = now.getTime() - s.lastHeartbeatAt.getTime();
  return staleSince > STALE_THRESHOLD_MS ? s.lastHeartbeatAt : now;
}

function isStale(s: Segment, now: Date): boolean {
  return !s.endedAt && now.getTime() - s.lastHeartbeatAt.getTime() > STALE_THRESHOLD_MS;
}

/** Closes a stale open segment at its last heartbeat (excluding the sleep
 * gap) and opens a fresh one. No-op if the open segment isn't stale. */
async function reconcileAndOpen(userId: string) {
  const open = await prisma.workSession.findFirst({ where: { userId, endedAt: null } });
  const now = new Date();

  if (!open) return prisma.workSession.create({ data: { userId } });

  if (isStale(open, now)) {
    await prisma.workSession.update({ where: { id: open.id }, data: { endedAt: open.lastHeartbeatAt } });
    return prisma.workSession.create({ data: { userId } });
  }

  return open;
}

/** Called on login/page-load. Idempotent — refreshing the page never creates
 * a duplicate open segment, and a segment left stale by a crash/sleep/tab
 * close gets closed at its last heartbeat first. */
export async function startOrResume(userId: string) {
  return reconcileAndOpen(userId);
}

/** Called every ~30s by an active tab, regardless of visibility — this is
 * what keeps the timer running across tab switches and other apps. Reconciles
 * (and transparently restarts) a stale segment exactly like start does, so a
 * heartbeat arriving right after a sleep/wake cycle self-heals instead of
 * requiring a page reload. */
export async function heartbeat(userId: string) {
  const session = await reconcileAndOpen(userId);
  if (session.endedAt === null && !isStale(session, new Date())) {
    return prisma.workSession.update({ where: { id: session.id }, data: { lastHeartbeatAt: new Date() } });
  }
  return session;
}

/** Called on manual logout (or best-effort on tab close). Closes the
 * currently open segment, if any. */
export async function pause(userId: string) {
  const open = await prisma.workSession.findFirst({ where: { userId, endedAt: null } });
  if (!open) return null;
  return prisma.workSession.update({ where: { id: open.id }, data: { endedAt: new Date() } });
}

async function segmentsOverlapping(userId: string, rangeStart: Date, rangeEnd: Date) {
  return prisma.workSession.findMany({
    where: {
      userId,
      startedAt: { lt: rangeEnd },
      OR: [{ endedAt: null }, { endedAt: { gt: rangeStart } }],
    },
  });
}

export async function getToday(userId: string) {
  const now = new Date();
  const rangeStart = startOfDay(now);
  const rangeEnd = endOfDay(now);
  const sessions = await segmentsOverlapping(userId, rangeStart, rangeEnd);

  let totalSeconds = 0;
  let open: Segment | null = null;
  for (const s of sessions) {
    totalSeconds += overlapSeconds(s.startedAt, effectiveEnd(s, now), rangeStart, rangeEnd);
    if (!s.endedAt && !isStale(s, now)) open = s;
  }

  return {
    todaySeconds: Math.round(totalSeconds),
    isRunning: !!open,
    currentSegmentStartedAt: open?.startedAt ?? null,
  };
}

export async function getSummary(userId: string, range: "week" | "month") {
  const now = new Date();
  const rangeStart = range === "week" ? startOfWeek(now) : startOfMonth(now);
  const rangeEnd = endOfDay(now);
  const sessions = await segmentsOverlapping(userId, rangeStart, rangeEnd);

  const dayTotals = new Map<string, number>();
  let totalSeconds = 0;

  for (const s of sessions) {
    const segEnd = effectiveEnd(s, now);
    let cursor = startOfDay(s.startedAt < rangeStart ? rangeStart : s.startedAt);
    while (cursor < segEnd && cursor < rangeEnd) {
      const dayEnd = endOfDay(cursor);
      const secs = overlapSeconds(s.startedAt, segEnd, cursor, dayEnd);
      if (secs > 0) {
        const key = dateKey(cursor);
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + secs);
        totalSeconds += secs;
      }
      cursor = dayEnd;
    }
  }

  const days = Array.from(dayTotals.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, seconds]) => ({ date, seconds: Math.round(seconds) }));

  return { totalSeconds: Math.round(totalSeconds), days };
}

/**
 * Time-log report for Team Lead, HR, Manager, System Admin and Super Admin
 * (VIEW_TIME_LOGS) — per-employee totals for the range, scoped exactly like
 * Team Workload: TEAM sees employees on a team you manage or a board you
 * own, ALL sees everyone, NONE (Team Member, CEO/Director) sees nothing.
 */
export async function getReport(actor: AuthedUser, range: "week" | "month") {
  const scopedIds = await resolveScopedEmployeeIds(actor, PermissionKey.VIEW_TIME_LOGS);

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      ...(scopedIds === "ALL" ? {} : { id: { in: scopedIds } }),
      user: { isNot: null },
    },
    include: { user: true, department: true, team: true },
  });

  const rows = await Promise.all(
    employees
      .filter((e) => e.user)
      .map(async (emp) => {
        const [today, summary] = await Promise.all([getToday(emp.user!.id), getSummary(emp.user!.id, range)]);
        return {
          employeeId: emp.id,
          userId: emp.user!.id,
          name: emp.fullName,
          department: emp.department?.name ?? null,
          team: emp.team?.name ?? null,
          todaySeconds: today.todaySeconds,
          isRunning: today.isRunning,
          rangeSeconds: summary.totalSeconds,
          days: summary.days,
        };
      })
  );

  rows.sort((a, b) => b.rangeSeconds - a.rangeSeconds);
  return rows;
}
