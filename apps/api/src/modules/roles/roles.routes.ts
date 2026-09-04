import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok } from "../../common/http";
import { validate } from "../../common/validate";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../common/audit";
import { AuditAction, PermissionKey, PermissionScope, ModuleCode } from "@dacentric/types";

export const rolesRouter = Router();
rolesRouter.use(authenticate);

rolesRouter.get(
  "/",
  requirePermission(PermissionKey.MANAGE_ROLES, "ALL"),
  asyncHandler(async (req, res) => {
    const roles = await prisma.role.findMany({
      include: { rolePermissions: true, _count: { select: { userRoles: true } } },
      orderBy: { name: "asc" },
    });
    return ok(res, roles);
  })
);

const updatePermissionSchema = z.object({
  module: z.nativeEnum(ModuleCode),
  permission: z.nativeEnum(PermissionKey),
  scope: z.enum(["NONE", "OWN", "TEAM", "ALL"]),
});

rolesRouter.patch(
  "/:roleId/permissions",
  requirePermission(PermissionKey.MANAGE_ROLES, "ALL"),
  validate(updatePermissionSchema),
  asyncHandler(async (req, res) => {
    const { module, permission, scope } = (req as any).validatedBody as {
      module: ModuleCode;
      permission: PermissionKey;
      scope: PermissionScope;
    };
    const roleId = req.params.roleId;

    const before = await prisma.rolePermission.findUnique({
      where: { roleId_module_permission: { roleId, module: module as any, permission: permission as any } },
    });

    const updated = await prisma.rolePermission.upsert({
      where: { roleId_module_permission: { roleId, module: module as any, permission: permission as any } },
      create: { roleId, module: module as any, permission: permission as any, scope: scope as any },
      update: { scope: scope as any },
    });

    await writeAudit({
      actor: req.user!,
      action: AuditAction.EDIT,
      entityType: "Role",
      entityId: roleId,
      field: `${module}:${permission}`,
      beforeValue: before?.scope ?? "NONE",
      afterValue: scope,
    });

    return ok(res, updated);
  })
);
