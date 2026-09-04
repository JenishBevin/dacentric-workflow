import { prisma } from "../lib/prisma";
import { AuditAction, ModuleCode } from "@dacentric/types";
import { AuthedUser } from "../middleware/authenticate";

export interface AuditEntryInput {
  actor: AuthedUser | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  boardId?: string;
  field?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  metadata?: Record<string, unknown>;
  module?: ModuleCode;
}

/**
 * Append-only audit trail writer. No update/delete method exists on this
 * service or is exposed anywhere in the API — Business Rule 15 / Section 34:
 * "Audit records cannot be edited/deleted [...] even Admin."
 */
export async function writeAudit(entry: AuditEntryInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? "System",
      action: entry.action as any,
      module: (entry.module ?? ModuleCode.WORKFLOW) as any,
      entityType: entry.entityType,
      entityId: entry.entityId,
      boardId: entry.boardId,
      field: entry.field,
      beforeValue: entry.beforeValue === undefined ? undefined : (entry.beforeValue as any),
      afterValue: entry.afterValue === undefined ? undefined : (entry.afterValue as any),
      metadata: entry.metadata as any,
    },
  });
}
