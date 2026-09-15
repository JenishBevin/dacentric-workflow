import { Router } from "express";
import multer from "multer";
import { asyncHandler, ok } from "../../common/http";
import { authenticate } from "../../middleware/authenticate";
import { Errors } from "../../common/errors";
import { isSuperAdmin } from "../../common/permissions";
import { writeAudit } from "../../common/audit";
import { AuditAction } from "@dacentric/types";
import * as backupService from "./backup.service";

export const backupRouter = Router();
backupRouter.use(authenticate);

// Full-database backup/restore bypasses the app's own access-control data,
// so it's hardcoded to Super Admin rather than routed through
// requirePermission/Roles & Permissions like everything else.
function requireSuperAdmin(req: any) {
  if (!isSuperAdmin(req.user!.roles)) {
    throw Errors.forbidden("Only a Super Admin can back up or restore the database.");
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

backupRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    requireSuperAdmin(req);
    const backup = await backupService.buildBackup();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await writeAudit({ actor: req.user!, action: AuditAction.EXPORT, entityType: "Database", entityId: "backup", afterValue: { exportedAt: backup.meta.exportedAt } });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="qplus-backup-${stamp}.json"`);
    res.send(JSON.stringify(backup));
  })
);

backupRouter.post(
  "/import",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    requireSuperAdmin(req);
    if (!req.file) throw Errors.badRequest("No backup file was uploaded.");
    // A deliberate, typed confirmation — not just a UI checkbox — so a
    // stray or scripted request can't wipe the database by accident.
    if ((req.body as any)?.confirmText !== "RESTORE") {
      throw Errors.badRequest('Type "RESTORE" to confirm before this runs.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(req.file.buffer.toString("utf-8"));
    } catch {
      throw Errors.badRequest("That file isn't valid JSON — is this actually a backup export?");
    }

    const result = await backupService.restoreBackup(parsed as any);

    await writeAudit({
      actor: req.user!,
      action: AuditAction.IMPORT,
      entityType: "Database",
      entityId: "backup",
      afterValue: { restoredModels: result.restoredModels.length, fileName: req.file.originalname },
    });

    return ok(res, result);
  })
);
