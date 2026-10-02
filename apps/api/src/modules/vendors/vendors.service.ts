import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { writeAudit } from "../../common/audit";
import { AuditAction, ModuleCode } from "@dacentric/types";

export interface VendorContact {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface CreateVendorInput {
  name: string;
  brands: string[];
  services: string[];
  contacts: VendorContact[];
  website?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  notes?: string | null;
}

/** One-at-a-time counterpart to importVendorsFromExcel — a vendor the
 *  spreadsheet doesn't cover yet, or added between imports. Same uniqueness
 *  rule as the import (case-insensitive name), so a manual add can't quietly
 *  create a duplicate of one the next re-import would have merged into. */
export async function createVendor(input: CreateVendorInput, actor: AuthedUser) {
  const name = input.name.trim();
  if (!name) throw Errors.badRequest("Vendor name is required.");

  const existing = await prisma.vendor.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) throw Errors.conflict(`A vendor named "${existing.name}" already exists.`);

  const vendor = await prisma.vendor.create({
    data: {
      name,
      brands: input.brands,
      services: input.services,
      contacts: input.contacts as any,
      website: input.website ?? null,
      vatNumber: input.vatNumber ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      createdById: actor.id,
    },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "Vendor", entityId: vendor.id, afterValue: { name: vendor.name }, module: ModuleCode.ERP });
  return vendor;
}

export async function listVendors(filters: { search?: string; brand?: string; service?: string }) {
  const where: any = {};
  // Free-text search matches the vendor's own name; Brand/Service are exact
  // picks from the filter dropdowns (Postgres array `has` needs an exact
  // element, not a substring, so it wouldn't make sense to fold into search).
  if (filters.search) where.name = { contains: filters.search, mode: "insensitive" };
  if (filters.brand) where.brands = { has: filters.brand };
  if (filters.service) where.services = { has: filters.service };

  return prisma.vendor.findMany({ where, orderBy: { name: "asc" } });
}

/** Distinct brand/service values across every vendor — backs the filter
 *  dropdowns on the Vendors page without the frontend needing to compute
 *  them from a potentially-paginated list. */
export async function getVendorFilterOptions() {
  const vendors = await prisma.vendor.findMany({ select: { brands: true, services: true } });
  const brands = new Set<string>();
  const services = new Set<string>();
  for (const v of vendors) {
    v.brands.forEach((b) => brands.add(b));
    v.services.forEach((s) => services.add(s));
  }
  return {
    brands: [...brands].sort((a, b) => a.localeCompare(b)),
    services: [...services].sort((a, b) => a.localeCompare(b)),
  };
}

export interface VendorDetailsInput {
  name?: string;
  brands?: string[];
  services?: string[];
  contacts?: VendorContact[];
  website?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  notes?: string | null;
}

/** Every field is independently optional — undefined means "leave as is",
 *  not "clear it" — so the detail drawer can PATCH just the fields it
 *  actually changed. name/brands/services/contacts were originally only
 *  set at creation/import time; this lets any of them be corrected
 *  afterward too. Renaming goes through the same case-insensitive
 *  uniqueness check as createVendor/importVendorsFromExcel, so it can't
 *  collide with another vendor — note that renaming also changes which
 *  supplier a future Excel re-import would merge into, under its original
 *  name, since that match is by name. */
export async function updateVendorDetails(id: string, input: VendorDetailsInput, actor: AuthedUser) {
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound("Vendor");

  const data: Record<string, unknown> = {
    website: input.website,
    vatNumber: input.vatNumber,
    address: input.address,
    notes: input.notes,
  };
  if (input.brands !== undefined) data.brands = input.brands;
  if (input.services !== undefined) data.services = input.services;
  if (input.contacts !== undefined) data.contacts = input.contacts;

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw Errors.badRequest("Vendor name is required.");
    if (name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.vendor.findFirst({ where: { name: { equals: name, mode: "insensitive" }, id: { not: id } } });
      if (duplicate) throw Errors.conflict(`A vendor named "${duplicate.name}" already exists.`);
    }
    data.name = name;
  }

  const updated = await prisma.vendor.update({ where: { id }, data: data as any });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Vendor", entityId: id, afterValue: data, module: ModuleCode.ERP });
  return updated;
}

export async function deleteVendor(id: string, actor: AuthedUser) {
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound("Vendor");
  await prisma.vendor.delete({ where: { id } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "Vendor", entityId: id, afterValue: { name: existing.name }, module: ModuleCode.ERP });
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const v = value as any;
    if (v.text) return String(v.text).trim();
    if (v.richText) return v.richText.map((t: any) => t.text).join("").trim();
    if (v.result !== undefined) return String(v.result).trim();
  }
  return String(value).trim();
}

export interface ImportVendorsResult {
  vendorsCreated: number;
  vendorsUpdated: number;
  servicesFound: number;
  brandsFound: number;
  rowsSkipped: number;
}

/**
 * The company's supplier spreadsheet isn't a plain header-row table — it's
 * grouped by service category, each category introduced by a banner row
 * where every column repeats the same category name (e.g. "CCTV SYSTEM"
 * across columns B–G), followed by data rows (Brand, Supplier, Contact
 * Person, Phone, Email) until the next banner. A supplier can reappear
 * under several categories, several brands (sometimes comma-separated in
 * one cell), and several contacts — all of that is consolidated into one
 * Vendor per supplier name (case-insensitive), not one row per mention.
 * Re-importing the same file is safe: existing vendors are merged into
 * (brands/services/contacts are unioned, nothing is dropped), not replaced.
 */
export async function importVendorsFromExcel(buffer: Buffer, actor: AuthedUser): Promise<ImportVendorsResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw Errors.badRequest("The uploaded file has no worksheet.");

  interface Pending {
    name: string;
    brands: Map<string, string>; // lowercase -> original casing
    services: Set<string>;
    contacts: VendorContact[];
  }
  const pending = new Map<string, Pending>(); // lowercase name -> Pending
  let currentService: string | null = null;
  let rowsSkipped = 0;

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const cells = [1, 2, 3, 4, 5, 6].map((c) => cellText(row.getCell(c).value));
    const [, brandRaw, supplierRaw, contactPerson, phoneRaw, emailRaw] = cells;

    if (!cells.some(Boolean)) continue; // fully blank row

    // The sheet's own two-row header ("Sl No | Brand | Supplier | Contact
    // Person | Contact Details | Contact Details" then "... | Phone No. |
    // E-mail ID") repeats above every category banner's data — matched by
    // its literal column B/C text rather than a fixed row number, so this
    // still works if a future export of this report shifts rows around.
    if (brandRaw.toLowerCase() === "brand" && supplierRaw.toLowerCase() === "supplier") continue;

    // Category banner: columns Brand/Supplier/Contact Person all repeat the
    // same non-empty text — that text is the service category from here
    // down to the next banner (or the end of the sheet).
    if (brandRaw && brandRaw === supplierRaw && supplierRaw === contactPerson) {
      currentService = brandRaw;
      continue;
    }

    if (!supplierRaw) {
      rowsSkipped++;
      continue;
    }

    const key = supplierRaw.toLowerCase();
    if (!pending.has(key)) {
      pending.set(key, { name: supplierRaw, brands: new Map(), services: new Set(), contacts: [] });
    }
    const v = pending.get(key)!;
    if (currentService) v.services.add(currentService);
    if (brandRaw) {
      for (const b of brandRaw.split(",")) {
        const bt = b.trim();
        if (bt && !v.brands.has(bt.toLowerCase())) v.brands.set(bt.toLowerCase(), bt);
      }
    }
    if (contactPerson || phoneRaw || emailRaw) {
      const contact: VendorContact = { name: contactPerson || null, phone: phoneRaw || null, email: emailRaw || null };
      const dup = v.contacts.some((c) => c.name === contact.name && c.phone === contact.phone && c.email === contact.email);
      if (!dup) v.contacts.push(contact);
    }
  }

  if (pending.size === 0) {
    throw Errors.badRequest("No supplier rows were found in this file — check it matches the usual supplier-list format.");
  }

  const existing = await prisma.vendor.findMany({ select: { id: true, name: true, brands: true, services: true, contacts: true } });
  const existingByKey = new Map(existing.map((v) => [v.name.toLowerCase(), v]));

  let vendorsCreated = 0;
  let vendorsUpdated = 0;
  const allBrands = new Set<string>();
  const allServices = new Set<string>();

  for (const [key, v] of pending) {
    const brands = [...v.brands.values()];
    const services = [...v.services];
    brands.forEach((b) => allBrands.add(b));
    services.forEach((s) => allServices.add(s));

    const existingVendor = existingByKey.get(key);
    if (!existingVendor) {
      await prisma.vendor.create({
        data: { name: v.name, brands, services, contacts: v.contacts as any, createdById: actor.id },
      });
      vendorsCreated++;
    } else {
      // Merge, don't replace — union brands/services, append only genuinely new contacts.
      const mergedBrands = new Map<string, string>();
      for (const b of existingVendor.brands) mergedBrands.set(b.toLowerCase(), b);
      for (const b of brands) if (!mergedBrands.has(b.toLowerCase())) mergedBrands.set(b.toLowerCase(), b);
      const mergedServices = new Set([...existingVendor.services, ...services]);
      const existingContacts = (existingVendor.contacts as unknown as VendorContact[]) ?? [];
      const mergedContacts = [...existingContacts];
      for (const c of v.contacts) {
        const dup = mergedContacts.some((x) => x.name === c.name && x.phone === c.phone && x.email === c.email);
        if (!dup) mergedContacts.push(c);
      }
      await prisma.vendor.update({
        where: { id: existingVendor.id },
        data: { brands: [...mergedBrands.values()], services: [...mergedServices], contacts: mergedContacts as any },
      });
      vendorsUpdated++;
    }
  }

  await writeAudit({
    actor,
    action: AuditAction.IMPORT,
    entityType: "Vendor",
    afterValue: { vendorsCreated, vendorsUpdated, servicesFound: allServices.size, brandsFound: allBrands.size, rowsSkipped },
    module: ModuleCode.ERP,
  });

  return { vendorsCreated, vendorsUpdated, servicesFound: allServices.size, brandsFound: allBrands.size, rowsSkipped };
}
