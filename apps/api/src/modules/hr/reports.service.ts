import { prisma } from "../../lib/prisma";
import { DAY_MS, UAE_OFFSET_MS, parseMonth, round2, uaeDateKey } from "./hr.common";

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // same as workTime.service.ts

function countBy<T>(items: T[], key: (item: T) => string): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const i of items) map.set(key(i), (map.get(key(i)) ?? 0) + 1);
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// --- Employee report ---

export async function employeeReport() {
  const employees = await prisma.employee.findMany({
    include: { department: true, teams: true },
    orderBy: { fullName: "asc" },
  });
  const now = new Date();
  const soon = new Date(now.getTime() + 90 * DAY_MS);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const expiries: { employeeId: string; fullName: string; document: string; expiryDate: Date; expired: boolean }[] = [];
  for (const e of employees) {
    if (!e.isActive) continue;
    for (const [label, date] of [["Passport", e.passportExpiry], ["Emirates ID", e.emiratesIdExpiry], ["Visa", e.visaExpiry]] as const) {
      if (date && date < soon) expiries.push({ employeeId: e.id, fullName: e.fullName, document: label, expiryDate: date, expired: date < now });
    }
  }
  expiries.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  const active = employees.filter((e) => e.isActive);
  return {
    summary: {
      total: employees.length,
      active: active.length,
      inactive: employees.length - active.length,
      joinedThisYear: employees.filter((e) => e.joiningDate && e.joiningDate >= yearStart).length,
      documentsExpiring: expiries.length,
    },
    byDepartment: countBy(active, (e) => e.department?.name ?? "Unassigned"),
    byDesignation: countBy(active, (e) => e.jobTitle?.trim() || "Not set"),
    byNationality: countBy(active, (e) => e.nationality?.trim() || "Not set"),
    expiries,
    rows: employees.map((e) => ({
      employeeId: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      workEmail: e.workEmail,
      jobTitle: e.jobTitle,
      department: e.department?.name ?? null,
      team: e.teams.map((t) => t.name).join(", ") || null,
      phone: e.phone,
      nationality: e.nationality,
      joiningDate: e.joiningDate,
      isActive: e.isActive,
    })),
  };
}

// --- Attendance report (from the work-time tracker) ---

export async function attendanceReport(month: string) {
  const { start, end, daysInMonth } = parseMonth(month);
  const now = new Date();
  const employees = await prisma.employee.findMany({
    where: { isActive: true, user: { isNot: null } },
    include: { user: { select: { id: true } }, department: true },
    orderBy: { fullName: "asc" },
  });
  const sessions = await prisma.workSession.findMany({
    where: { userId: { in: employees.map((e) => e.user!.id) }, startedAt: { lt: end }, OR: [{ endedAt: null }, { endedAt: { gt: start } }] },
  });
  const byUser = new Map<string, typeof sessions>();
  for (const s of sessions) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

  const rows = employees.map((e) => {
    const dayTotals = new Map<string, number>();
    for (const s of byUser.get(e.user!.id) ?? []) {
      const stale = !s.endedAt && now.getTime() - s.lastHeartbeatAt.getTime() > STALE_THRESHOLD_MS;
      const segEnd = s.endedAt ?? (stale ? s.lastHeartbeatAt : now);
      let cursor = Math.max(s.startedAt.getTime(), start.getTime());
      const limit = Math.min(segEnd.getTime(), end.getTime());
      while (cursor < limit) {
        const dayStart = Math.floor((cursor + UAE_OFFSET_MS) / DAY_MS) * DAY_MS - UAE_OFFSET_MS;
        const dayEnd = Math.min(dayStart + DAY_MS, limit);
        const key = uaeDateKey(new Date(cursor));
        dayTotals.set(key, (dayTotals.get(key) ?? 0) + (dayEnd - cursor) / 1000);
        cursor = dayEnd;
      }
    }
    const presentDays = [...dayTotals.values()].filter((sec) => sec >= 60).length;
    const totalSeconds = [...dayTotals.values()].reduce((a, b) => a + b, 0);
    return {
      employeeId: e.id,
      employeeCode: e.employeeCode,
      fullName: e.fullName,
      department: e.department?.name ?? null,
      presentDays,
      totalHours: round2(totalSeconds / 3600),
      avgHoursPerDay: presentDays ? round2(totalSeconds / 3600 / presentDays) : 0,
    };
  });
  return {
    month,
    daysInMonth,
    summary: {
      employees: rows.length,
      totalHours: round2(rows.reduce((s, r) => s + r.totalHours, 0)),
      avgPresentDays: rows.length ? round2(rows.reduce((s, r) => s + r.presentDays, 0) / rows.length) : 0,
    },
    rows: rows.sort((a, b) => b.totalHours - a.totalHours),
  };
}

// --- Leave report ---

export async function leaveReport(from: Date, to: Date) {
  const requests = await prisma.leaveRequest.findMany({
    where: { startDate: { lte: to }, endDate: { gte: from } },
    include: { employee: { select: { id: true, fullName: true, employeeCode: true, department: { select: { name: true } } } } },
    orderBy: { startDate: "desc" },
  });
  const approved = requests.filter((r) => r.status === "APPROVED");
  const perEmployee = new Map<string, { employeeId: string; fullName: string; employeeCode: string; department: string | null; days: number; requests: number }>();
  for (const r of approved) {
    const row = perEmployee.get(r.employeeId) ?? { employeeId: r.employeeId, fullName: r.employee.fullName, employeeCode: r.employee.employeeCode, department: r.employee.department?.name ?? null, days: 0, requests: 0 };
    row.days += r.numberOfDays;
    row.requests += 1;
    perEmployee.set(r.employeeId, row);
  }
  const typeDays = new Map<string, number>();
  for (const r of approved) typeDays.set(r.leaveType, (typeDays.get(r.leaveType) ?? 0) + r.numberOfDays);
  return {
    from,
    to,
    summary: {
      requests: requests.length,
      approved: approved.length,
      pending: requests.filter((r) => r.status === "PENDING").length,
      rejected: requests.filter((r) => r.status === "REJECTED").length,
      approvedDays: approved.reduce((s, r) => s + r.numberOfDays, 0),
    },
    byType: [...typeDays.entries()].map(([leaveType, days]) => ({ leaveType, days })).sort((a, b) => b.days - a.days),
    byEmployee: [...perEmployee.values()].sort((a, b) => b.days - a.days),
    rows: requests.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      fullName: r.employee.fullName,
      employeeCode: r.employee.employeeCode,
      leaveType: r.leaveType,
      startDate: r.startDate,
      endDate: r.endDate,
      numberOfDays: r.numberOfDays,
      status: r.status,
    })),
  };
}

// --- Payroll report (across months of a year) ---

export async function payrollReport(year: number) {
  const runs = await prisma.payrollRun.findMany({
    where: { month: { startsWith: `${year}-` } },
    include: { payslips: true },
    orderBy: { month: "asc" },
  });
  const months = runs.map((run) => {
    const gross = round2(run.payslips.reduce((s, p) => s + p.grossEarnings, 0));
    const deductions = round2(run.payslips.reduce((s, p) => s + p.leaveDeduction + p.otherDeduction, 0));
    return { month: run.month, status: run.status, headcount: run.payslips.length, gross, deductions, net: round2(gross - deductions) };
  });
  return {
    year,
    months,
    totals: {
      gross: round2(months.reduce((s, m) => s + m.gross, 0)),
      deductions: round2(months.reduce((s, m) => s + m.deductions, 0)),
      net: round2(months.reduce((s, m) => s + m.net, 0)),
    },
  };
}

// --- Recruitment report ---

export async function recruitmentReport(from: Date, to: Date) {
  const candidates = await prisma.candidate.findMany({ where: { createdAt: { gte: from, lte: to } } });
  const interviews = await prisma.candidateInterview.findMany({ where: { scheduledAt: { gte: from, lte: to } } });
  const reached = (statuses: string[]) => candidates.filter((c) => statuses.includes(c.status)).length;
  const offered = candidates.filter((c) => c.offerRefNo).length;
  const accepted = reached(["ACCEPTED", "JOINED"]);
  const rated = interviews.filter((i) => i.rating != null);
  const designations = new Map<string, { designation: string; candidates: number; selected: number; offered: number; joined: number }>();
  for (const c of candidates) {
    const key = c.designation.trim().toLowerCase();
    const row = designations.get(key) ?? { designation: c.designation.trim(), candidates: 0, selected: 0, offered: 0, joined: 0 };
    row.candidates += 1;
    if (["SELECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"].includes(c.status)) row.selected += 1;
    if (c.offerRefNo) row.offered += 1;
    if (c.status === "JOINED") row.joined += 1;
    designations.set(key, row);
  }
  return {
    from,
    to,
    summary: {
      candidates: candidates.length,
      interviews: interviews.length,
      interviewsCompleted: interviews.filter((i) => i.status === "COMPLETED").length,
      avgRating: rated.length ? round2(rated.reduce((s, i) => s + (i.rating ?? 0), 0) / rated.length) : null,
      selected: reached(["SELECTED", "OFFERED", "ACCEPTED", "DECLINED", "JOINED"]),
      offered,
      accepted,
      joined: reached(["JOINED"]),
      offerAcceptanceRate: offered ? Math.round((accepted / offered) * 100) : null,
    },
    byStatus: countBy(candidates, (c) => c.status),
    bySource: countBy(candidates, (c) => c.source?.trim() || "Not recorded"),
    byDesignation: [...designations.values()].sort((a, b) => b.candidates - a.candidates),
  };
}
