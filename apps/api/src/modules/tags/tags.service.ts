import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { AuditAction } from "@dacentric/types";

export async function listTags(search?: string) {
  return prisma.tag.findMany({
    where: search ? { name: { contains: search, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function createTag(name: string, color: string | undefined, actor: AuthedUser) {
  const existing = await prisma.tag.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (existing) throw Errors.conflict(`A tag named "${name}" already exists.`);
  const tag = await prisma.tag.create({ data: { name, color: color ?? "#64748b", createdById: actor.id } });
  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "Tag", entityId: tag.id, afterValue: { name, color } });
  return tag;
}

export async function updateTag(tagId: string, input: { name?: string; color?: string }, actor: AuthedUser) {
  const before = await prisma.tag.findUniqueOrThrow({ where: { id: tagId } });
  const tag = await prisma.tag.update({ where: { id: tagId }, data: input });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Tag", entityId: tagId, beforeValue: before, afterValue: input });
  return tag;
}

export async function deleteTag(tagId: string, actor: AuthedUser) {
  const tag = await prisma.tag.delete({ where: { id: tagId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "Tag", entityId: tagId, beforeValue: tag });
}

export async function setTaskTags(taskId: string, tagIds: string[], actor: AuthedUser) {
  await prisma.$transaction([
    prisma.tagOnTask.deleteMany({ where: { taskId } }),
    prisma.tagOnTask.createMany({ data: tagIds.map((tagId) => ({ taskId, tagId })) }),
  ]);
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "Task", entityId: taskId, field: "tags", afterValue: tagIds });
}
