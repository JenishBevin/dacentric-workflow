import { Router } from "express";
import multer from "multer";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyRole } from "../../middleware/authorize";
import { Errors } from "../../common/errors";
import { RoleCode } from "@dacentric/types";
import * as vendorsService from "./vendors.service";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const vendorsRouter = Router();
vendorsRouter.use(authenticate);

vendorsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search, brand, service } = req.query as Record<string, string>;
    return ok(res, await vendorsService.listVendors({ search, brand, service }));
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
  requireAnyRole(RoleCode.SUPER_ADMIN),
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

vendorsRouter.delete(
  "/:id",
  requireAnyRole(RoleCode.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    await vendorsService.deleteVendor(req.params.id, req.user!);
    return ok(res, { message: "Vendor deleted." });
  })
);
