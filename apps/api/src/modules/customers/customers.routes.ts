import { Router } from "express";
import multer from "multer";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { Errors } from "../../common/errors";
import { env } from "../../lib/env";
import * as customersService from "./customers.service";
import { createCustomerSchema, updateCustomerSchema, createContactSchema, updateContactSchema } from "./customers.schemas";
import { PermissionKey } from "@dacentric/types";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const customersRouter = Router();
customersRouter.use(authenticate);

customersRouter.get(
  "/",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => {
    const { search, status, accountManagerId } = req.query as Record<string, string>;
    return ok(res, await customersService.listCustomers({ search, status, accountManagerId }));
  })
);

// Must come before "/:id" — otherwise Express would capture "search" as an id.
customersRouter.get(
  "/search/lookup",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => ok(res, await customersService.searchCustomers((req.query.q as string) ?? "")))
);

customersRouter.post(
  "/",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  validate(createCustomerSchema),
  asyncHandler(async (req, res) => created(res, await customersService.createCustomer((req as any).validatedBody, req.user!)))
);

// Local development only — see env.allowCustomerImport. Must come before
// "/:id" so Express doesn't capture "import" as an id.
customersRouter.post(
  "/import",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!env.allowCustomerImport) throw Errors.forbidden("Customer import is only available in local development.");
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    return ok(res, await customersService.importCustomersFromExcel(req.file.buffer, req.user!));
  })
);

customersRouter.get(
  "/:id",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => ok(res, await customersService.getCustomerDetail(req.params.id)))
);

customersRouter.patch(
  "/:id",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  validate(updateCustomerSchema),
  asyncHandler(async (req, res) => ok(res, await customersService.updateCustomer(req.params.id, (req as any).validatedBody, req.user!)))
);

customersRouter.delete(
  "/:id",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  asyncHandler(async (req, res) => {
    await customersService.deleteCustomer(req.params.id, req.user!);
    return ok(res, { message: "Customer deleted." });
  })
);

// --- Contacts ---
customersRouter.post(
  "/:id/contacts",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  validate(createContactSchema),
  asyncHandler(async (req, res) => created(res, await customersService.addContact(req.params.id, (req as any).validatedBody, req.user!)))
);

customersRouter.patch(
  "/:id/contacts/:contactId",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  validate(updateContactSchema),
  asyncHandler(async (req, res) =>
    ok(res, await customersService.updateContact(req.params.id, req.params.contactId, (req as any).validatedBody, req.user!))
  )
);

customersRouter.delete(
  "/:id/contacts/:contactId",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  asyncHandler(async (req, res) => {
    await customersService.deleteContact(req.params.id, req.params.contactId, req.user!);
    return ok(res, { message: "Contact removed." });
  })
);

// --- Documents ---
customersRouter.get(
  "/:id/documents/:documentId/download",
  requirePermission(PermissionKey.VIEW_WORKFLOW, "OWN"),
  asyncHandler(async (req, res) => {
    const { document, buffer } = await customersService.downloadDocument(req.params.id, req.params.documentId);
    res.setHeader("Content-Type", document.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${document.fileName}"`);
    res.send(buffer);
  })
);

customersRouter.post(
  "/:id/documents",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    return created(res, await customersService.uploadDocument(req.params.id, req.file, req.user!));
  })
);

customersRouter.delete(
  "/:id/documents/:documentId",
  requirePermission(PermissionKey.CRM_ERP_LINKING, "OWN"),
  asyncHandler(async (req, res) => {
    await customersService.deleteDocument(req.params.id, req.params.documentId, req.user!);
    return ok(res, { message: "Document removed." });
  })
);
