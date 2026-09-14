import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction, CustomerStatus, formatCustomerId } from "@dacentric/types";
import { CreateCustomerInput, UpdateCustomerInput, CreateContactInput, UpdateContactInput } from "./customers.types";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";

const CUSTOMER_SUMMARY_SELECT = {
  id: true,
  customerId: true,
  name: true,
  status: true,
  industry: true,
  country: true,
  mainContactName: true,
  phone: true,
  email: true,
  accountManager: { select: { id: true, name: true } },
  createdAt: true,
  _count: { select: { tasks: true, boards: true } },
} as const;

export async function listCustomers(filters: { search?: string; status?: string; accountManagerId?: string }) {
  const where: any = { isDeleted: false };
  if (filters.status) where.status = filters.status;
  if (filters.accountManagerId) where.accountManagerId = filters.accountManagerId;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { customerId: { contains: filters.search, mode: "insensitive" } },
      { mainContactName: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  const customers = await prisma.customer.findMany({
    where,
    select: CUSTOMER_SUMMARY_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return customers.map((c) => ({
    id: c.id,
    customerId: c.customerId,
    name: c.name,
    status: c.status,
    industry: c.industry,
    country: c.country,
    mainContactName: c.mainContactName,
    phone: c.phone,
    email: c.email,
    accountManager: c.accountManager,
    createdAt: c.createdAt,
    enquiryCount: c._count.tasks,
    projectCount: c._count.boards,
  }));
}

// Global "search by Customer ID or name" lookup — used by pickers embedded
// in New Enquiry / New Project, and the header search box.
export async function searchCustomers(q: string) {
  if (!q.trim()) return [];
  const customers = await prisma.customer.findMany({
    where: {
      isDeleted: false,
      OR: [{ name: { contains: q, mode: "insensitive" } }, { customerId: { contains: q, mode: "insensitive" } }],
    },
    select: { id: true, customerId: true, name: true, status: true },
    orderBy: { name: "asc" },
    take: 20,
  });
  return customers;
}

export async function createCustomer(input: CreateCustomerInput, actor: AuthedUser) {
  const customer = await prisma.$transaction(async (tx) => {
    const placeholder = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.customer.create({
      data: {
        customerId: placeholder,
        name: input.name,
        customerType: input.customerType,
        industry: input.industry,
        website: input.website,
        country: input.country,
        city: input.city,
        address: input.address,
        mainContactName: input.mainContactName,
        designation: input.designation,
        email: input.email || null,
        phone: input.phone,
        alternateContact: input.alternateContact,
        status: (input.status ?? CustomerStatus.PROSPECT) as any,
        accountManagerId: input.accountManagerId ?? null,
        rating: input.rating,
        notes: input.notes,
        createdById: actor.id,
      },
    });
    return tx.customer.update({ where: { id: created.id }, data: { customerId: formatCustomerId(created.customerNumber) } });
  });

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "Customer",
    entityId: customer.id,
    afterValue: { name: customer.name, customerId: customer.customerId },
  });

  return customer;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput, actor: AuthedUser) {
  const existing = await prisma.customer.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw Errors.notFound("Customer");

  const data: any = { ...input };
  if (data.email === "") data.email = null;

  const customer = await prisma.customer.update({ where: { id }, data });

  await writeAudit({
    actor,
    action: AuditAction.EDIT,
    entityType: "Customer",
    entityId: id,
    beforeValue: existing,
    afterValue: customer,
  });

  return customer;
}

export async function deleteCustomer(id: string, actor: AuthedUser) {
  const existing = await prisma.customer.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw Errors.notFound("Customer");

  await prisma.customer.update({ where: { id }, data: { isDeleted: true } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "Customer", entityId: id, beforeValue: { name: existing.name } });
}

// The Customer 360 view: profile + contacts + every enquiry/project linked
// to this customer + recent activity (audit trail for those items and the
// customer record itself) + documents. Deliberately one aggregating read
// rather than N separate round-trips from the client.
export async function getCustomerDetail(id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, isDeleted: false },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      accountManager: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true } } },
      },
    },
  });
  if (!customer) throw Errors.notFound("Customer");

  const tasks = await prisma.task.findMany({
    where: { customerId: id, isDeleted: false },
    select: {
      id: true,
      taskId: true,
      title: true,
      isCompleted: true,
      board: { select: { id: true, name: true } },
      stage: { select: { name: true, isTerminal: true } },
      enquiryRecord: { select: { enquiryId: true } },
      estimationRecord: { select: { estimationId: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const boards = await prisma.board.findMany({
    where: { customerId: id, isDeleted: false },
    select: {
      id: true,
      boardId: true,
      name: true,
      isCompleted: true,
      isArchived: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const boardIds = boards.map((b) => b.id);
  const taskIds = tasks.map((t) => t.id);

  const recentActivity = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Customer", entityId: id },
        boardIds.length ? { boardId: { in: boardIds } } : undefined,
        taskIds.length ? { entityType: "Task", entityId: { in: taskIds } } : undefined,
      ].filter(Boolean) as any[],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, actorName: true, action: true, entityType: true, field: true, metadata: true, createdAt: true },
  });

  const wonCount = tasks.filter((t) => t.stage.isTerminal && !t.stage.name.toLowerCase().includes("lost")).length;
  const lostCount = tasks.filter((t) => t.stage.name.toLowerCase().includes("lost")).length;
  const openCount = tasks.length - wonCount - lostCount;

  return {
    ...customer,
    enquiries: {
      total: tasks.length,
      won: wonCount,
      lost: lostCount,
      open: openCount,
      items: tasks,
    },
    projects: {
      total: boards.length,
      completed: boards.filter((b) => b.isCompleted).length,
      inProgress: boards.filter((b) => !b.isCompleted).length,
      items: boards,
    },
    recentActivity,
  };
}

// --- Contacts ---

export async function addContact(customerId: string, input: CreateContactInput, actor: AuthedUser) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, isDeleted: false } });
  if (!customer) throw Errors.notFound("Customer");

  if (input.isPrimary) {
    await prisma.customerContact.updateMany({ where: { customerId }, data: { isPrimary: false } });
  }

  const contact = await prisma.customerContact.create({
    data: {
      customerId,
      name: input.name,
      designation: input.designation,
      email: input.email || null,
      phone: input.phone,
      isPrimary: input.isPrimary ?? false,
    },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "CustomerContact", entityId: contact.id, afterValue: { name: contact.name, customerId } });
  return contact;
}

export async function updateContact(customerId: string, contactId: string, input: UpdateContactInput, actor: AuthedUser) {
  const existing = await prisma.customerContact.findFirst({ where: { id: contactId, customerId } });
  if (!existing) throw Errors.notFound("Contact");

  if (input.isPrimary) {
    await prisma.customerContact.updateMany({ where: { customerId, id: { not: contactId } }, data: { isPrimary: false } });
  }

  const data: any = { ...input };
  if (data.email === "") data.email = null;

  const contact = await prisma.customerContact.update({ where: { id: contactId }, data });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "CustomerContact", entityId: contactId, beforeValue: existing, afterValue: contact });
  return contact;
}

export async function deleteContact(customerId: string, contactId: string, actor: AuthedUser) {
  const existing = await prisma.customerContact.findFirst({ where: { id: contactId, customerId } });
  if (!existing) throw Errors.notFound("Contact");
  await prisma.customerContact.delete({ where: { id: contactId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "CustomerContact", entityId: contactId, beforeValue: { name: existing.name } });
}

// --- Documents ---

export async function uploadDocument(customerId: string, file: Express.Multer.File, actor: AuthedUser) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, isDeleted: false } });
  if (!customer) throw Errors.notFound("Customer");

  const validationError = validateFile(file.originalname, file.size);
  if (validationError) throw Errors.validation(validationError, { file: validationError });

  const scanResult = await scanFile(file.buffer);
  if (scanResult === "REJECTED") throw Errors.validation("This file failed the security scan and was not stored.");

  const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);

  const document = await prisma.customerDocument.create({
    data: {
      customerId,
      fileName: file.originalname,
      storageKey,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      uploadedById: actor.id,
      scanStatus: scanResult,
    },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "CustomerDocument", entityId: document.id, afterValue: { fileName: file.originalname, customerId } });
  return document;
}

export async function downloadDocument(customerId: string, documentId: string) {
  const document = await prisma.customerDocument.findFirstOrThrow({ where: { id: documentId, customerId } });
  const buffer = await getStorageAdapter().read(document.storageKey);
  return { document, buffer };
}

export async function deleteDocument(customerId: string, documentId: string, actor: AuthedUser) {
  const document = await prisma.customerDocument.findFirstOrThrow({ where: { id: documentId, customerId } });
  await getStorageAdapter().remove(document.storageKey);
  await prisma.customerDocument.delete({ where: { id: documentId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "CustomerDocument", entityId: documentId, beforeValue: { fileName: document.fileName } });
}

// --- Excel import (local dev only — see customers.routes.ts) ---

const IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
  name: ["customer name", "company", "company / customer name", "name"],
  customerType: ["customer type"],
  industry: ["industry"],
  website: ["website"],
  country: ["country"],
  city: ["city"],
  address: ["address"],
  mainContactName: ["main contact person", "main contact name", "main contact"],
  designation: ["designation"],
  email: ["email"],
  phone: ["phone"],
  alternateContact: ["alternate contact"],
  status: ["status", "customer status"],
  rating: ["rating", "priority", "customer rating / priority"],
  notes: ["notes"],
};

export interface ImportCustomersResult {
  created: number;
  skipped: Array<{ row: number; reason: string }>;
}

/** Reads an uploaded .xlsx (first sheet, header row first) and creates one
 * Customer per data row via the same createCustomer() path the UI uses —
 * matching header text to a fixed set of Customer Profile field aliases, in
 * any column order. Only "Customer Name" is required; every other column is
 * optional and simply left blank if missing or empty. */
export async function importCustomersFromExcel(buffer: Buffer, actor: AuthedUser): Promise<ImportCustomersResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Errors.badRequest("The uploaded file has no worksheet.");

  const headerCells = sheet.getRow(1).values as unknown[];
  const columnIndex: Record<string, number> = {};
  headerCells.forEach((cell, idx) => {
    if (typeof cell === "string" && cell.trim()) columnIndex[cell.trim().toLowerCase()] = idx;
  });

  const resolveColumn = (field: string): number | undefined => {
    for (const alias of IMPORT_COLUMN_ALIASES[field]) {
      const idx = columnIndex[alias];
      if (idx !== undefined) return idx;
    }
    return undefined;
  };
  const fieldColumns = Object.fromEntries(Object.keys(IMPORT_COLUMN_ALIASES).map((f) => [f, resolveColumn(f)])) as Record<string, number | undefined>;

  if (!fieldColumns.name) {
    throw Errors.badRequest('The file must have a "Customer Name" column (row 1).');
  }

  const result: ImportCustomersResult = { created: 0, skipped: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cellText = (colIdx?: number) => (colIdx ? String(row.getCell(colIdx).value ?? "").trim() : "");

    const isBlankRow = Object.values(fieldColumns).every((idx) => !cellText(idx));
    if (isBlankRow) continue;

    const name = cellText(fieldColumns.name);
    if (!name) {
      result.skipped.push({ row: rowNumber, reason: "Missing Customer Name" });
      continue;
    }

    const statusRaw = cellText(fieldColumns.status).toUpperCase();
    const status = (Object.values(CustomerStatus) as string[]).includes(statusRaw) ? (statusRaw as CustomerStatus) : CustomerStatus.PROSPECT;

    try {
      await createCustomer(
        {
          name,
          customerType: cellText(fieldColumns.customerType) || undefined,
          industry: cellText(fieldColumns.industry) || undefined,
          website: cellText(fieldColumns.website) || undefined,
          country: cellText(fieldColumns.country) || undefined,
          city: cellText(fieldColumns.city) || undefined,
          address: cellText(fieldColumns.address) || undefined,
          mainContactName: cellText(fieldColumns.mainContactName) || undefined,
          designation: cellText(fieldColumns.designation) || undefined,
          email: cellText(fieldColumns.email) || undefined,
          phone: cellText(fieldColumns.phone) || undefined,
          alternateContact: cellText(fieldColumns.alternateContact) || undefined,
          status,
          rating: cellText(fieldColumns.rating) || undefined,
          notes: cellText(fieldColumns.notes) || undefined,
        },
        actor
      );
      result.created++;
    } catch (err: any) {
      result.skipped.push({ row: rowNumber, reason: err?.message ?? "Unknown error" });
    }
  }

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "Customer",
    afterValue: { source: "excel-import", created: result.created, skipped: result.skipped.length },
  });

  return result;
}
