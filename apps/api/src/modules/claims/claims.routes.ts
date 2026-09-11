import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { asyncHandler, ok, created } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import * as claimsService from "./claims.service";

export const claimsRouter = Router();
claimsRouter.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

claimsRouter.get(
  "/mine",
  asyncHandler(async (req, res) => ok(res, await claimsService.listMyClaims(req.user!)))
);

claimsRouter.get(
  "/",
  asyncHandler(async (req, res) => ok(res, await claimsService.listActionableClaims(req.user!)))
);

// NOTE: must be registered before "/attachments/:attachmentId/download" isn't
// an issue (different path shape), but kept alongside the other GETs above
// any future "/:id" route for the same reason as tasks.routes.ts.
claimsRouter.get(
  "/search/lookup",
  asyncHandler(async (req, res) => {
    const q = ((req.query.q as string) ?? "").trim();
    const claim = q ? await claimsService.lookupClaimByClaimId(q, req.user!) : null;
    return ok(res, claim);
  })
);

claimsRouter.get(
  "/settled",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const rows = await claimsService.listSettledClaims(req.user!, {
      dateFrom: q.dateFrom ? new Date(q.dateFrom) : undefined,
      dateTo: q.dateTo ? new Date(q.dateTo) : undefined,
    });
    return ok(res, rows);
  })
);

claimsRouter.post(
  "/",
  upload.array("files", 5),
  asyncHandler(async (req, res) => {
    const { amount, reason, expenseDate } = req.body as Record<string, string>;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const claim = await claimsService.submitClaim(req.user!, {
      amount: Number(amount),
      reason,
      expenseDate: new Date(expenseDate),
      files,
    });
    return created(res, claim);
  })
);

claimsRouter.post(
  "/:id/decision",
  validate(z.object({ decision: z.enum(["APPROVED", "REJECTED"]), reason: z.string().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const { decision, reason } = (req as any).validatedBody as { decision: "APPROVED" | "REJECTED"; reason?: string };
    const claim = await claimsService.decideClaim(req.params.id, decision, reason, req.user!);
    return ok(res, claim);
  })
);

claimsRouter.post(
  "/:id/settle",
  asyncHandler(async (req, res) => ok(res, await claimsService.settleClaim(req.params.id, req.user!)))
);

claimsRouter.get(
  "/attachments/:attachmentId/download",
  asyncHandler(async (req, res) => {
    const { attachment, buffer } = await claimsService.downloadClaimAttachment(req.params.attachmentId, req.user!);
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
    res.send(buffer);
  })
);
