import { prisma } from "../../lib/prisma";

/**
 * CRM/ERP integration abstraction (Section 21 / Section 2). The Workflow
 * module never talks to a specific CRM/ERP vendor directly — it only knows
 * about `LinkedRecord`, a normalized shape any future adapter (a real CRM,
 * a real ERP) can populate. This module IS that adapter for the standalone
 * build: it serves the demo Customers/Leads/Orders/Invoices seeded into the
 * same database. Swapping in a live CRM means replacing the body of
 * `searchLinkedRecords` with a call to that system's API and leaving every
 * other line in the Workflow module untouched.
 */
export async function searchLinkedRecords(query: string, type?: string) {
  return prisma.linkedRecord.findMany({
    where: {
      recordType: type ? (type as any) : undefined,
      OR: query
        ? [
            { name: { contains: query, mode: "insensitive" } },
            { externalRef: { contains: query, mode: "insensitive" } },
          ]
        : undefined,
    },
    take: 25,
    orderBy: { name: "asc" },
  });
}

export async function getLinkedRecordSummary(linkedRecordId: string) {
  const record = await prisma.linkedRecord.findUniqueOrThrow({ where: { id: linkedRecordId } });
  const [boards, tasks] = await Promise.all([
    prisma.board.findMany({ where: { linkedRecordId, isDeleted: false }, include: { _count: { select: { tasks: true } } } }),
    prisma.taskLinkedRecord.findMany({ where: { linkedRecordId }, include: { task: { include: { stage: true } } } }),
  ]);
  return {
    record,
    boards: boards.map((b) => ({ id: b.id, name: b.name, taskCount: b._count.tasks })),
    tasks: tasks.map((t) => ({ id: t.task.id, taskId: t.task.taskId, title: t.task.title, stage: t.task.stage.name })),
  };
}
