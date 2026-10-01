import { Router } from "express";
import multer from "multer";
import { asyncHandler, ok, created } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyRole } from "../../middleware/authorize";
import { Errors } from "../../common/errors";
import { RoleCode } from "@dacentric/types";
import * as vendorsService from "./vendors.service";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Who sees "Add Vendor", can add one by hand, and can edit an existing
// vendor's details — Admin and Finance (role code ESTIMATION — see
// rolesSeed.ts) and Procurement deal with suppliers day to day, so they get
// the same access as Management here. Deleting a vendor outright stays
// narrower still (Super Admin + Management only — see the DELETE route).
const VENDOR_EDITORS = [RoleCode.SUPER_ADMIN, RoleCode.MANAGEMENT, RoleCode.ESTIMATION, RoleCode.PROCUREMENT];

export const vendorsRouter = Router();
vendorsRouter.use(authenticate);

vendorsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, brand, service } = req.query as Record<string, string>;
    return ok(res, await vendorsService.listVendors({ search, brand, service }));
  })
);

vendorsRouter.post(
  "/",
  requireAnyRole(...VENDOR_EDITORS),
  asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const toNullable = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const toList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);
    const toContacts = (v: unknown) =>
      Array.isArray(v)
        ? v
            .map((c) => ({ name: toNullable((c as any)?.name), phone: toNullable((c as any)?.phone), email: toNullable((c as any)?.email) }))
            .filter((c) => c.name || c.phone || c.email)
        : [];

    if (typeof body.name !== "string" || !body.name.trim()) throw Errors.badRequest("Vendor name is required.");

    return created(
      res,
      await vendorsService.createVendor(
        {
          name: body.name,
          brands: toList(body.brands),
          services: toList(body.services),
          contacts: toContacts(body.contacts),
          website: toNullable(body.website),
          vatNumber: toNullable(body.vatNumber),
          address: toNullable(body.address),
          notes: toNullable(body.notes),
        },
        req.user!
      )
    );
  })
);

vendorsRouter.get(
  "/filter-options",
  asyncHandler(async (_req, res) => ok(res, await vendorsService.getVendorFilterOptions()))
);

// Bulk import bypasses one-at-a-time data entry, so it's restricted to
// Super Admin regardless of module access — same reasoning as the
// Enquiry/Estimation Excel imports.
vendorsRouter.post(
  "/import",
  requireAnyRole(RoleCode.SUPER_ADMIN),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    return ok(res, await vendorsService.importVendorsFromExcel(req.file.buffer, req.user!));
  })
);

vendorsRouter.patch(
  "/:id",
  requireAnyRole(...VENDOR_EDITORS),
  asyncHandler(async (req, res) => {
    const { website, vatNumber, address, notes } = req.body as Record<string, unknown>;
    const toNullable = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    return ok(
      res,
      await vendorsService.updateVendorDetails(
        req.params.id,
        { website: toNullable(website), vatNumber: toNullable(vatNumber), address: toNullable(address), notes: toNullable(notes) },
        req.user!
      )
    );
  })
);

// Narrower than VENDOR_EDITORS above — removing a vendor outright stays
// Super Admin + Management only.
vendorsRouter.delete(
  "/:id",
  requireAnyRole(RoleCode.SUPER_ADMIN, RoleCode.MANAGEMENT),
  asyncHandler(async (req, res) => {
    await vendorsService.deleteVendor(req.params.id, req.user!);
    return ok(res, { message: "Vendor deleted." });
  })
);
