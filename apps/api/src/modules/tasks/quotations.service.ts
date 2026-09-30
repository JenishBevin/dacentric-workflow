import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, RoleCode } from "@dacentric/types";
import { loadTaskWithAccess, assertCanEditTask } from "./task-access";
import { ESTIMATION_BOARD_NAME } from "../boards/boards.service";
import { ensureEstimationRecord } from "./tasks.service";

export interface QuoteLineItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  // Costing sheet — internal only, never part of what's sent to the customer.
  vendorName?: string;
  vendorContact?: string;
  buyingCost?: number;
  marginPercent?: number;
  // How this line was priced: MARGIN (default) — the price follows cost + margin %; PRICE — the selling price was
  // typed in, and the margin % is worked out from it.
  priceMode?: "MARGIN" | "PRICE";
}

export interface SaveQuotationInput {
  name?: string;
  currency: string;
  title?: string;
  quotationRef?: string;
  recipientName?: string;
  recipientCompany?: string;
  recipientLocation?: string;
  lineItems: QuoteLineItem[];
  vatRate: number;
  validityDays?: number;
  paymentTerms?: string;
  notes?: string;
  generalTerms?: string;
  preparerName?: string;
  preparerDesignation?: string;
  preparerMobile?: string;
  costingEnabled?: boolean;
  marginPercent?: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** With costing on, a line that has a buying cost is priced one of two ways — the server is authoritative in both,
 *  so a saved price and margin can never disagree:
 *   - MARGIN (default): price = cost + margin % (the line's own margin, else the quotation's default);
 *   - PRICE: the typed selling price stands, and the line's margin % is derived from it.
 *  A line without a buying cost keeps whatever unit price was typed. */
function priceLineItems(items: QuoteLineItem[], costingEnabled: boolean, defaultMargin: number | null | undefined): QuoteLineItem[] {
  return items.map((item) => {
    if (!costingEnabled || item.buyingCost == null) return item;
    if (item.priceMode === "PRICE") {
      const { marginPercent: _ignored, ...rest } = item;
      return item.buyingCost > 0 ? { ...rest, marginPercent: round4((item.unitPrice / item.buyingCost - 1) * 100) } : rest;
    }
    const margin = item.marginPercent ?? defaultMargin ?? 0;
    return { ...item, unitPrice: round2(item.buyingCost * (1 + margin / 100)) };
  });
}

function computeTotals(items: QuoteLineItem[], vatRate: number) {
  const subtotal = round2(items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0));
  const vatAmount = round2(subtotal * (vatRate / 100));
  return { subtotal, vatAmount, totalAmount: round2(subtotal + vatAmount) };
}

/** Creating and editing quotations needs edit rights on the task, and the task must still be on the Estimation board. */
async function loadEstimationTask(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  assertCanEditTask(ctx);
  if (ctx.task.board?.name !== ESTIMATION_BOARD_NAME) {
    throw Errors.badRequest("Quotations can only be created while a task is on the Estimation board.");
  }
  const record = await ensureEstimationRecord(prisma, taskId);
  return { ctx, record };
}

/** Viewing saved quotations with their costing (vendors, buying costs, margins) is internal: Management and admins
 *  can see it for negotiating costs, and so can anyone who can edit the task. Works even after the task has been
 *  Awarded on to a Project, since the quotation is still the record of what was priced. */
async function loadForCostingView(taskId: string, actor: AuthedUser) {
  const ctx = await loadTaskWithAccess(taskId, actor);
  const canView = ctx.isAdmin || actor.roles.includes(RoleCode.MANAGEMENT);
  if (!canView) assertCanEditTask(ctx);
  const record = await prisma.estimationRecord.findUnique({ where: { taskId } });
  return { ctx, record };
}

const normaliseName = (name: string) => name.trim().toLowerCase();

async function assertNameAvailable(estimationRecordId: string, name: string, exceptId?: string) {
  const others = await prisma.estimationQuotation.findMany({
    where: { estimationRecordId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (others.some((o) => o.name && normaliseName(o.name) === normaliseName(name))) {
    throw Errors.conflict(`A quotation named "${name.trim()}" already exists on this task. Choose a different name.`);
  }
}

function toFullQuotation(q: any) {
  return {
    id: q.id,
    versionNumber: q.versionNumber,
    name: q.name,
    currency: q.currency,
    title: q.title,
    quotationRef: q.quotationRef,
    recipientName: q.recipientName,
    recipientCompany: q.recipientCompany,
    recipientLocation: q.recipientLocation,
    lineItems: (q.lineItems as QuoteLineItem[]) ?? [],
    subtotal: q.subtotal,
    vatRate: q.vatRate,
    vatAmount: q.vatAmount,
    totalAmount: q.totalAmount,
    validityDays: q.validityDays,
    paymentTerms: q.paymentTerms,
    notes: q.notes,
    generalTerms: q.generalTerms,
    preparerName: q.preparerName,
    preparerDesignation: q.preparerDesignation,
    preparerMobile: q.preparerMobile,
    costingEnabled: q.costingEnabled,
    marginPercent: q.marginPercent,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    createdByName: q.createdBy?.name ?? null,
  };
}

/** Keeps the EstimationRecord's quotation fields (used by search, Accounts and the task payload) pointed at the
 *  highest version. Costing details are deliberately not copied — that record is readable by anyone on the task. */
async function syncSnapshot(estimationRecordId: string, actor: AuthedUser) {
  const latest = await prisma.estimationQuotation.findFirst({ where: { estimationRecordId }, orderBy: { versionNumber: "desc" } });
  if (!latest) return;
  const lineItems = (latest.lineItems as unknown as QuoteLineItem[]).map(({ description, qty, unit, unitPrice }) => ({ description, qty, unit, unitPrice }));
  await prisma.estimationRecord.update({
    where: { id: estimationRecordId },
    data: {
      currency: latest.currency,
      title: latest.title,
      quotationRef: latest.quotationRef,
      recipientName: latest.recipientName,
      recipientCompany: latest.recipientCompany,
      recipientLocation: latest.recipientLocation,
      lineItems: lineItems as any,
      subtotal: latest.subtotal,
      vatRate: latest.vatRate,
      vatAmount: latest.vatAmount,
      totalAmount: latest.totalAmount,
      validityDays: latest.validityDays,
      paymentTerms: latest.paymentTerms,
      notes: latest.notes,
      generalTerms: latest.generalTerms,
      preparerName: latest.preparerName,
      preparerDesignation: latest.preparerDesignation,
      preparerMobile: latest.preparerMobile,
      quotedAt: latest.updatedAt,
      quotedById: actor.id,
    },
  });
}

/** Quotations saved before versions existed live only on the EstimationRecord — turn that into "v1" the first
 *  time anyone looks, so old quotes show up under Previous quotations without a data migration. */
async function backfillFromRecord(record: any) {
  const count = await prisma.estimationQuotation.count({ where: { estimationRecordId: record.id } });
  if (count > 0 || record.subtotal == null) return;
  await prisma.estimationQuotation.create({
    data: {
      estimationRecordId: record.id,
      versionNumber: 1,
      name: "Version 1",
      currency: record.currency,
      title: record.title,
      quotationRef: record.quotationRef,
      recipientName: record.recipientName,
      recipientCompany: record.recipientCompany,
      recipientLocation: record.recipientLocation,
      lineItems: (record.lineItems as any) ?? [],
      subtotal: record.subtotal,
      vatRate: record.vatRate,
      vatAmount: record.vatAmount ?? 0,
      totalAmount: record.totalAmount ?? record.subtotal,
      validityDays: record.validityDays,
      paymentTerms: record.paymentTerms,
      notes: record.notes,
      generalTerms: record.generalTerms,
      preparerName: record.preparerName,
      preparerDesignation: record.preparerDesignation,
      preparerMobile: record.preparerMobile,
      createdById: record.quotedById,
      createdAt: record.quotedAt ?? undefined,
    },
  });
}

export async function listQuotations(taskId: string, actor: AuthedUser) {
  const { record } = await loadForCostingView(taskId, actor);
  if (!record) return [];
  await backfillFromRecord(record);
  const rows = await prisma.estimationQuotation.findMany({
    where: { estimationRecordId: record.id },
    orderBy: { versionNumber: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((q) => ({
    id: q.id,
    versionNumber: q.versionNumber,
    name: q.name,
    title: q.title,
    quotationRef: q.quotationRef,
    currency: q.currency,
    totalAmount: q.totalAmount,
    itemCount: ((q.lineItems as unknown as QuoteLineItem[]) ?? []).length,
    costingEnabled: q.costingEnabled,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    createdByName: q.createdBy?.name ?? null,
  }));
}

export async function getQuotation(taskId: string, quotationId: string, actor: AuthedUser) {
  const { record } = await loadForCostingView(taskId, actor);
  if (!record) throw Errors.notFound("Quotation");
  const q = await prisma.estimationQuotation.findFirst({ where: { id: quotationId, estimationRecordId: record.id }, include: { createdBy: { select: { name: true } } } });
  if (!q) throw Errors.notFound("Quotation");
  return toFullQuotation(q);
}

function dataFromInput(input: SaveQuotationInput) {
  const costingEnabled = input.costingEnabled ?? false;
  const lineItems = priceLineItems(input.lineItems, costingEnabled, input.marginPercent);
  const { subtotal, vatAmount, totalAmount } = computeTotals(lineItems, input.vatRate);
  return {
    currency: input.currency,
    title: input.title,
    quotationRef: input.quotationRef,
    recipientName: input.recipientName,
    recipientCompany: input.recipientCompany,
    recipientLocation: input.recipientLocation,
    lineItems: lineItems as any,
    subtotal,
    vatRate: input.vatRate,
    vatAmount,
    totalAmount,
    validityDays: input.validityDays ?? 7,
    paymentTerms: input.paymentTerms,
    notes: input.notes,
    generalTerms: input.generalTerms,
    preparerName: input.preparerName,
    preparerDesignation: input.preparerDesignation,
    preparerMobile: input.preparerMobile,
    costingEnabled,
    marginPercent: input.marginPercent ?? null,
  };
}

async function auditSave(actor: AuthedUser, ctx: Awaited<ReturnType<typeof loadEstimationTask>>["ctx"], q: any, verb: "created" | "updated") {
  await writeAudit({
    actor,
    action: verb === "created" ? AuditAction.CREATE : AuditAction.EDIT,
    entityType: "EstimationQuotation",
    entityId: q.id,
    boardId: ctx.task.boardId,
    taskId: ctx.task.id,
    field: "quotation",
    afterValue: { version: q.versionNumber, currency: q.currency, subtotal: q.subtotal, vatAmount: q.vatAmount, totalAmount: q.totalAmount, costing: q.costingEnabled },
  });
}

/** Saves as a brand-new version (v1 for the first quotation, else the next number) — earlier versions are untouched. */
export async function createQuotation(taskId: string, input: SaveQuotationInput, actor: AuthedUser) {
  const { ctx, record } = await loadEstimationTask(taskId, actor);
  const name = input.name?.trim();
  if (!name) throw Errors.badRequest("Give the quotation a name so it can be found under Previous quotations.");
  await backfillFromRecord(record);
  await assertNameAvailable(record.id, name);
  const latest = await prisma.estimationQuotation.findFirst({ where: { estimationRecordId: record.id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
  const created = await prisma.estimationQuotation.create({
    data: { ...dataFromInput(input), name, estimationRecordId: record.id, versionNumber: (latest?.versionNumber ?? 0) + 1, createdById: actor.id },
    include: { createdBy: { select: { name: true } } },
  });
  await syncSnapshot(record.id, actor);
  await auditSave(actor, ctx, created, "created");
  return toFullQuotation(created);
}

/** Saves changes onto an existing version in place. */
export async function updateQuotation(taskId: string, quotationId: string, input: SaveQuotationInput, actor: AuthedUser) {
  const { ctx, record } = await loadEstimationTask(taskId, actor);
  const existing = await prisma.estimationQuotation.findFirst({ where: { id: quotationId, estimationRecordId: record.id } });
  if (!existing) throw Errors.notFound("Quotation");
  // Saving changes keeps the name unless a new one is given (which must still be unique on the task).
  const renamed = input.name?.trim();
  if (renamed && normaliseName(renamed) !== normaliseName(existing.name ?? "")) await assertNameAvailable(record.id, renamed, existing.id);
  const updated = await prisma.estimationQuotation.update({
    where: { id: quotationId },
    data: { ...dataFromInput(input), ...(renamed ? { name: renamed } : {}) },
    include: { createdBy: { select: { name: true } } },
  });
  await syncSnapshot(record.id, actor);
  await auditSave(actor, ctx, updated, "updated");
  return toFullQuotation(updated);
}

/** The internal costing workbook for one saved version: what each item costs, from whom, the margin, and the
 *  resulting selling price and profit. */
export async function buildCostingSheet(taskId: string, quotationId: string, actor: AuthedUser) {
  const { ctx, record } = await loadForCostingView(taskId, actor);
  if (!record) throw Errors.notFound("Quotation");
  const q = await prisma.estimationQuotation.findFirst({ where: { id: quotationId, estimationRecordId: record.id } });
  if (!q) throw Errors.notFound("Quotation");

  const items = (q.lineItems as unknown as QuoteLineItem[]) ?? [];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DaCentric Workflow";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Costing Sheet");
  const money = '#,##0.00';

  const meta: Array<[string, string | number]> = [
    ["Quotation name", q.name ?? ""],
    ["Quotation ref", q.quotationRef ?? ""],
    ["Title", q.title ?? ""],
    ["Task", `${ctx.task.taskId} — ${ctx.task.title}`],
    ["Version", `v${q.versionNumber}`],
    ["Currency", q.currency],
    ["Default margin %", q.marginPercent ?? ""],
  ];
  meta.forEach(([label, value]) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  });
  sheet.addRow([]);

  const header = sheet.addRow(["#", "Description", "Qty", "Unit", "Vendor", "Vendor contact", "Buying cost (unit)", "Buying total", "Margin %", "Selling price (unit)", "Selling total", "Profit"]);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  });

  let buyingTotal = 0;
  let sellingTotal = 0;
  let costedSelling = 0; // selling value of just the items that have a buying cost — profit is only meaningful on those
  items.forEach((item, i) => {
    const hasCost = item.buyingCost != null;
    const buying = hasCost ? round2(item.qty * (item.buyingCost as number)) : null;
    const selling = round2(item.qty * item.unitPrice);
    if (buying != null) {
      buyingTotal += buying;
      costedSelling += selling;
    }
    sellingTotal += selling;
    const margin = hasCost ? item.marginPercent ?? q.marginPercent ?? 0 : null;
    const row = sheet.addRow([
      i + 1,
      item.description,
      item.qty,
      item.unit,
      item.vendorName ?? "",
      item.vendorContact ?? "",
      hasCost ? item.buyingCost : "",
      buying ?? "",
      margin ?? "",
      item.unitPrice,
      selling,
      buying != null ? round2(selling - buying) : "",
    ]);
    [7, 8, 10, 11, 12].forEach((c) => (row.getCell(c).numFmt = money));
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });

  sheet.addRow([]);
  const totals: Array<[string, number, string?]> = [
    ["Total buying cost", round2(buyingTotal)],
    ["Selling subtotal", round2(sellingTotal)],
    ["Total profit (costed items)", round2(costedSelling - buyingTotal)],
    [`VAT (${q.vatRate}%)`, q.vatAmount],
    ["Quotation total", q.totalAmount],
  ];
  totals.forEach(([label, value]) => {
    const row = sheet.addRow(["", "", "", "", "", "", "", label, "", "", value]);
    row.getCell(8).font = { bold: true };
    row.getCell(11).numFmt = money;
    row.getCell(11).font = { bold: true };
  });
  if (buyingTotal > 0) {
    const overall = sheet.addRow(["", "", "", "", "", "", "", "Overall margin on cost %", "", "", round2(((costedSelling - buyingTotal) / buyingTotal) * 100)]);
    overall.getCell(8).font = { bold: true };
    overall.getCell(11).font = { bold: true };
  }

  [5, 34, 8, 8, 22, 22, 18, 16, 10, 20, 16, 14].forEach((width, i) => (sheet.getColumn(i + 1).width = width));

  await writeAudit({
    actor,
    action: AuditAction.EDIT,
    entityType: "EstimationQuotation",
    entityId: q.id,
    boardId: ctx.task.boardId,
    taskId: ctx.task.id,
    field: "costingSheet",
  });

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const safeRef = (q.name ?? q.quotationRef ?? ctx.task.taskId).replace(/[^\w.-]+/g, "-");
  return { buffer, filename: `costing-sheet-${safeRef}-v${q.versionNumber}.xlsx` };
}
