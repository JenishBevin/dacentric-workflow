import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, ModuleCode } from "@dacentric/types";
import { Errors } from "../../common/errors";
import { DAY_MS, parseMonth, round2 } from "./hr.common";

type Structure = { basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowance: number };

const fixedTotal = (s: Structure) => s.basicSalary + s.housingAllowance + s.transportAllowance + s.otherAllowance;

export async function listSalaryStructures() {
  const employees = await prisma.employee.findMany({
    where: { isActive: true },
    include: { department: true, salaryStructure: true },
    orderBy: { fullName: "asc" },
  });
  return employees.map((e) => ({
    employeeId: e.id,
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    jobTitle: e.jobTitle,
    department: e.department?.name ?? null,
    joiningDate: e.joiningDate,
    structure: e.salaryStructure,
    total: e.salaryStructure ? round2(fixedTotal(e.salaryStructure)) : null,
  }));
}

/** Days of [start,end] (inclusive dates) that fall inside the month range [monthStart, monthEnd). */
function overlapDays(start: Date, end: Date, monthStart: Date, monthEnd: Date): number {
  const s = Math.max(start.getTime(), monthStart.getTime());
  const e = Math.min(end.getTime(), monthEnd.getTime() - 1);
  if (e < s) return 0;
  return Math.floor((e - s) / DAY_MS) + 1;
}

async function unpaidDaysFor(employeeId: string, monthStart: Date, monthEnd: Date, joiningDate: Date | null): Promise<number> {
  const leaves = await prisma.leaveRequest.findMany({
    where: { employeeId, status: "APPROVED", leaveType: "UNPAID", startDate: { lt: monthEnd }, endDate: { gte: monthStart } },
    select: { startDate: true, endDate: true },
  });
  let days = leaves.reduce((sum, l) => sum + overlapDays(l.startDate, l.endDate, monthStart, monthEnd), 0);
  // Days of the month before they joined aren't payable either.
  if (joiningDate && joiningDate > monthStart && joiningDate < monthEnd) {
    days += Math.floor((joiningDate.getTime() - monthStart.getTime()) / DAY_MS);
  }
  return days;
}

function buildPayslipValues(s: Structure, daysInMonth: number, unpaidDays: number, bonus: number, otherDeduction: number) {
  const fixed = fixedTotal(s);
  const cappedUnpaid = Math.min(unpaidDays, daysInMonth);
  const leaveDeduction = round2((fixed / daysInMonth) * cappedUnpaid);
  const grossEarnings = round2(fixed + bonus);
  return {
    basicSalary: s.basicSalary,
    housingAllowance: s.housingAllowance,
    transportAllowance: s.transportAllowance,
    otherAllowance: s.otherAllowance,
    bonus,
    grossEarnings,
    daysInMonth,
    unpaidLeaveDays: cappedUnpaid,
    leaveDeduction,
    otherDeduction,
    netPay: round2(grossEarnings - leaveDeduction - otherDeduction),
  };
}

async function eligibleEmployees(monthEnd: Date) {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, salaryStructure: { isNot: null } },
    include: { salaryStructure: true },
  });
  return employees.filter((e) => !e.joiningDate || e.joiningDate < monthEnd);
}

export async function createRun(month: string, actor: AuthedUser) {
  const { start, end, daysInMonth } = parseMonth(month);
  if (await prisma.payrollRun.findUnique({ where: { month } })) throw Errors.conflict(`A payroll run for ${month} already exists.`);
  const employees = await eligibleEmployees(end);
  if (employees.length === 0) throw Errors.badRequest("No active employees have a salary structure yet. Set one up under Salary Structure first.");

  const run = await prisma.payrollRun.create({ data: { month, createdById: actor.id, createdByName: actor.name } });
  for (const e of employees) {
    const unpaid = await unpaidDaysFor(e.id, start, end, e.joiningDate);
    await prisma.payslip.create({ data: { runId: run.id, employeeId: e.id, ...buildPayslipValues(e.salaryStructure!, daysInMonth, unpaid, 0, 0) } });
  }
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "PayrollRun", entityId: run.id, afterValue: { month, payslips: employees.length }, module: ModuleCode.HRMS });
  return getRun(month);
}

async function loadRun(month: string) {
  parseMonth(month);
  const run = await prisma.payrollRun.findUnique({ where: { month } });
  if (!run) throw Errors.notFound("Payroll run");
  return run;
}

/** Re-pulls salary structures and unpaid leave into a DRAFT run; manual bonus/deduction entries are kept. */
export async function recalculateRun(month: string, actor: AuthedUser) {
  const run = await loadRun(month);
  if (run.status !== "DRAFT") throw Errors.badRequest("Only a draft payroll run can be recalculated.");
  const { start, end, daysInMonth } = parseMonth(month);
  const employees = await eligibleEmployees(end);
  const existing = await prisma.payslip.findMany({ where: { runId: run.id } });
  const byEmployee = new Map(existing.map((p) => [p.employeeId, p]));
  for (const e of employees) {
    const prev = byEmployee.get(e.id);
    const unpaid = await unpaidDaysFor(e.id, start, end, e.joiningDate);
    const values = buildPayslipValues(e.salaryStructure!, daysInMonth, unpaid, prev?.bonus ?? 0, prev?.otherDeduction ?? 0);
    if (prev) await prisma.payslip.update({ where: { id: prev.id }, data: values });
    else await prisma.payslip.create({ data: { runId: run.id, employeeId: e.id, ...values } });
  }
  const eligibleIds = new Set(employees.map((e) => e.id));
  const stale = existing.filter((p) => !eligibleIds.has(p.employeeId)).map((p) => p.id);
  if (stale.length) await prisma.payslip.deleteMany({ where: { id: { in: stale } } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "PayrollRun", entityId: run.id, field: "recalculate", module: ModuleCode.HRMS });
  return getRun(month);
}

function withTotals<T extends { grossEarnings: number; leaveDeduction: number; otherDeduction: number; netPay: number }>(payslips: T[]) {
  return {
    headcount: payslips.length,
    gross: round2(payslips.reduce((s, p) => s + p.grossEarnings, 0)),
    deductions: round2(payslips.reduce((s, p) => s + p.leaveDeduction + p.otherDeduction, 0)),
    net: round2(payslips.reduce((s, p) => s + p.netPay, 0)),
  };
}

export async function getRun(month: string) {
  const run = await loadRun(month);
  const payslips = await prisma.payslip.findMany({
    where: { runId: run.id },
    include: { employee: { select: { id: true, fullName: true, employeeCode: true, jobTitle: true, bankName: true, bankAccountNumber: true, department: { select: { name: true } } } } },
  });
  payslips.sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName));
  return { run, payslips, totals: withTotals(payslips) };
}

export async function listRuns() {
  const runs = await prisma.payrollRun.findMany({ orderBy: { month: "desc" }, include: { payslips: true } });
  return runs.map(({ payslips, ...run }) => ({ ...run, totals: withTotals(payslips) }));
}

export async function updatePayslip(payslipId: string, input: { bonus?: number; otherDeduction?: number; deductionNote?: string | null }, actor: AuthedUser) {
  const p = await prisma.payslip.findUnique({ where: { id: payslipId }, include: { run: true } });
  if (!p) throw Errors.notFound("Payslip");
  if (p.run.status !== "DRAFT") throw Errors.badRequest("This payroll run is already processed and can't be edited.");
  const bonus = input.bonus ?? p.bonus;
  const otherDeduction = input.otherDeduction ?? p.otherDeduction;
  const fixed = p.basicSalary + p.housingAllowance + p.transportAllowance + p.otherAllowance;
  const grossEarnings = round2(fixed + bonus);
  const updated = await prisma.payslip.update({
    where: { id: payslipId },
    data: {
      bonus,
      otherDeduction,
      deductionNote: input.deductionNote === undefined ? p.deductionNote : input.deductionNote,
      grossEarnings,
      netPay: round2(grossEarnings - p.leaveDeduction - otherDeduction),
    },
  });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Payslip", entityId: payslipId, afterValue: { bonus, otherDeduction }, module: ModuleCode.HRMS });
  return updated;
}

export async function processRun(month: string, actor: AuthedUser) {
  const run = await loadRun(month);
  if (run.status !== "DRAFT") throw Errors.badRequest("This payroll run has already been processed.");
  const count = await prisma.payslip.count({ where: { runId: run.id } });
  if (count === 0) throw Errors.badRequest("There are no payslips in this run.");
  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "PROCESSED", processedAt: new Date() } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "PayrollRun", entityId: run.id, field: "status", beforeValue: "DRAFT", afterValue: "PROCESSED", module: ModuleCode.HRMS });
  return getRun(month);
}

export async function payRun(month: string, actor: AuthedUser) {
  const run = await loadRun(month);
  if (run.status !== "PROCESSED") throw Errors.badRequest("Process the payroll run before marking it paid.");
  await prisma.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidAt: new Date() } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "PayrollRun", entityId: run.id, field: "status", beforeValue: "PROCESSED", afterValue: "PAID", module: ModuleCode.HRMS });
  return getRun(month);
}

export async function deleteRun(month: string, actor: AuthedUser) {
  const run = await loadRun(month);
  if (run.status !== "DRAFT") throw Errors.badRequest("Only a draft payroll run can be deleted.");
  await prisma.payrollRun.delete({ where: { id: run.id } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "PayrollRun", entityId: run.id, beforeValue: { month }, module: ModuleCode.HRMS });
}

export async function getEmployeePayslips(employeeId: string) {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!emp) throw Errors.notFound("Employee");
  const payslips = await prisma.payslip.findMany({ where: { employeeId }, include: { run: { select: { month: true, status: true } } } });
  return payslips.sort((a, b) => b.run.month.localeCompare(a.run.month));
}

/** Salary report for a month: the payroll register plus department-wise totals. */
export async function salaryReport(month: string) {
  parseMonth(month);
  const run = await prisma.payrollRun.findUnique({ where: { month } });
  if (!run) return { month, run: null, rows: [], byDepartment: [], totals: { headcount: 0, gross: 0, deductions: 0, net: 0 } };
  const payslips = await prisma.payslip.findMany({
    where: { runId: run.id },
    include: { employee: { select: { fullName: true, employeeCode: true, jobTitle: true, department: { select: { name: true } } } } },
  });
  payslips.sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName));
  const rows = payslips.map((p) => ({
    payslipId: p.id,
    employeeId: p.employeeId,
    employeeCode: p.employee.employeeCode,
    fullName: p.employee.fullName,
    jobTitle: p.employee.jobTitle,
    department: p.employee.department?.name ?? "Unassigned",
    basicSalary: p.basicSalary,
    allowances: round2(p.housingAllowance + p.transportAllowance + p.otherAllowance),
    bonus: p.bonus,
    grossEarnings: p.grossEarnings,
    unpaidLeaveDays: p.unpaidLeaveDays,
    deductions: round2(p.leaveDeduction + p.otherDeduction),
    netPay: p.netPay,
  }));
  const deptMap = new Map<string, { department: string; headcount: number; gross: number; deductions: number; net: number }>();
  for (const r of rows) {
    const d = deptMap.get(r.department) ?? { department: r.department, headcount: 0, gross: 0, deductions: 0, net: 0 };
    d.headcount += 1;
    d.gross = round2(d.gross + r.grossEarnings);
    d.deductions = round2(d.deductions + r.deductions);
    d.net = round2(d.net + r.netPay);
    deptMap.set(r.department, d);
  }
  return { month, run, rows, byDepartment: [...deptMap.values()].sort((a, b) => b.net - a.net), totals: withTotals(payslips) };
}
