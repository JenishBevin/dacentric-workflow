import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { getBoardRole, assertBoardVisible, assertCanEditBoard, assertIsBoardOwnerOrAdmin, visibleBoardsWhere } from "./board-access";
import { AuditAction, BoardType, RoleCode } from "@dacentric/types";

const DEFAULT_STAGES = [
  { name: "Backlog", color: "#94a3b8" },
  { name: "To Do", color: "#60a5fa" },
  { name: "In Progress", color: "#f59e0b" },
  { name: "Review", color: "#a78bfa" },
  { name: "Done", color: "#22c55e", isTerminal: true },
];

export interface CreateBoardInput {
  name: string;
  description?: string;
  boardType: BoardType;
  linkedRecordType?: string;
  linkedRecordId?: string;
  templateId?: string;
  members: Array<{ userId: string; role: string }>;
}

export async function listBoards(
  user: AuthedUser,
  filters: { search?: string; scope?: "MY" | "ALL" | "LINKED" | "ARCHIVED"; }
) {
  const base = visibleBoardsWhere(user);
  const where: any = { ...base };

  if (filters.scope === "ARCHIVED") {
    where.isArchived = true;
  } else {
    where.isArchived = false;
  }

  if (filters.scope === "MY") {
    where.members = { some: { userId: user.id } };
  }
  if (filters.scope === "LINKED") {
    where.boardType = BoardType.LINKED;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { linkedRecord: { name: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  const boards = await prisma.board.findMany({
    where,
    include: {
      stages: { orderBy: { position: "asc" } },
      members: { include: { user: true } },
      linkedRecord: true,
      _count: { select: { tasks: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const boardIds = boards.map((b) => b.id);
  const openCounts = await prisma.task.groupBy({
    by: ["boardId"],
    where: { boardId: { in: boardIds }, isDeleted: false, isCompleted: false },
    _count: { _all: true },
  });
  const overdueCounts = await prisma.task.groupBy({
    by: ["boardId"],
    where: { boardId: { in: boardIds }, isDeleted: false, isCompleted: false, dueDate: { lt: new Date() } },
    _count: { _all: true },
  });
  const openMap = new Map(openCounts.map((c) => [c.boardId, c._count._all]));
  const overdueMap = new Map(overdueCounts.map((c) => [c.boardId, c._count._all]));

  return boards.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    boardType: b.boardType,
    linkedRecord: b.linkedRecord,
    isArchived: b.isArchived,
    stageCount: b.stages.length,
    openTaskCount: openMap.get(b.id) ?? 0,
    overdueTaskCount: overdueMap.get(b.id) ?? 0,
    members: b.members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
    updatedAt: b.updatedAt,
  }));
}

export async function getBoardDetail(boardId: string, user: AuthedUser) {
  const role = await assertBoardVisible(boardId, user);
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      stages: { orderBy: { position: "asc" } },
      members: { include: { user: true } },
      linkedRecord: true,
      tags: { include: { tag: true } },
    },
  });
  if (!board || board.isDeleted) throw Errors.notFound("Board");
  return {
    ...board,
    // Never return the raw joined User row (passwordHash and friends) —
    // same sanitized shape listBoards() already uses.
    members: board.members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
    myRole: role,
  };
}

export async function createBoard(input: CreateBoardInput, actor: AuthedUser) {
  let stageDefs: Array<{ name: string; color: string; wipLimit?: number; isTerminal?: boolean }> = DEFAULT_STAGES;
  let checklistTemplate: any = null;

  if (input.templateId) {
    const template = await prisma.boardTemplate.findUnique({ where: { id: input.templateId } });
    if (!template) throw Errors.badRequest("Selected template does not exist.");
    stageDefs = template.stageDefinition as any;
    checklistTemplate = template.checklistTemplate;
  }

  // Ensure the creator is always an Owner, even if the payload omitted them.
  const members = [...input.members];
  if (!members.some((m) => m.userId === actor.id)) {
    members.push({ userId: actor.id, role: "OWNER" });
  }

  const board = await prisma.$transaction(async (tx) => {
    const created = await tx.board.create({
      data: {
        name: input.name,
        description: input.description,
        boardType: input.boardType,
        linkedRecordType: input.boardType === BoardType.LINKED ? (input.linkedRecordType as any) : null,
        linkedRecordId: input.boardType === BoardType.LINKED ? input.linkedRecordId : null,
        templateId: input.templateId,
        createdById: actor.id,
        stages: {
          create: stageDefs.map((s, idx) => ({
            name: s.name,
            color: s.color ?? "#6366f1",
            position: idx,
            wipLimit: s.wipLimit ?? null,
            isTerminal: s.isTerminal ?? idx === stageDefs.length - 1,
          })),
        },
        members: { create: members.map((m) => ({ userId: m.userId, role: m.role })) },
      },
      include: { stages: true, members: true },
    });
    return created;
  });

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "Board",
    entityId: board.id,
    boardId: board.id,
    afterValue: { name: board.name, boardType: board.boardType },
  });

  return board;
}

export async function updateBoard(
  boardId: string,
  input: { name?: string; description?: string | null; linkedRecordType?: string | null; linkedRecordId?: string | null; version?: number },
  actor: AuthedUser
) {
  const role = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(role);

  const existing = await prisma.board.findUniqueOrThrow({ where: { id: boardId } });
  if (input.version !== undefined && input.version !== existing.version) {
    throw Errors.conflict("This board was updated by someone else. Please refresh.");
  }

  const updated = await prisma.board.update({
    where: { id: boardId },
    data: {
      name: input.name,
      description: input.description ?? undefined,
      linkedRecordType: input.linkedRecordType === null ? null : (input.linkedRecordType as any),
      linkedRecordId: input.linkedRecordId === null ? null : input.linkedRecordId,
      boardType: input.linkedRecordId === null ? BoardType.STANDALONE : undefined,
      version: { increment: 1 },
    },
  });

  await writeAudit({
    actor,
    action: AuditAction.EDIT,
    entityType: "Board",
    entityId: boardId,
    boardId,
    beforeValue: { name: existing.name, description: existing.description },
    afterValue: input,
  });

  return updated;
}

export async function duplicateBoard(boardId: string, actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(role);

  const original = await prisma.board.findUniqueOrThrow({
    where: { id: boardId },
    include: { stages: { orderBy: { position: "asc" } }, members: true },
  });

  const copy = await prisma.board.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      boardType: BoardType.STANDALONE,
      createdById: actor.id,
      stages: {
        create: original.stages.map((s) => ({
          name: s.name,
          color: s.color,
          position: s.position,
          wipLimit: s.wipLimit,
          isTerminal: s.isTerminal,
        })),
      },
      members: { create: original.members.map((m) => ({ userId: m.userId, role: m.role })) },
    },
    include: { stages: true, members: true },
  });

  await writeAudit({
    actor,
    action: AuditAction.CREATE,
    entityType: "Board",
    entityId: copy.id,
    boardId: copy.id,
    metadata: { duplicatedFrom: boardId },
  });

  return copy;
}

export async function archiveBoard(boardId: string, archived: boolean, actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertIsBoardOwnerOrAdmin(role, actor);

  const board = await prisma.board.update({
    where: { id: boardId },
    data: { isArchived: archived, archivedAt: archived ? new Date() : null },
  });

  await writeAudit({
    actor,
    action: AuditAction.ARCHIVE,
    entityType: "Board",
    entityId: boardId,
    boardId,
    afterValue: { isArchived: archived },
  });

  return board;
}

export async function deleteBoard(boardId: string, actor: AuthedUser, cascadeConfirm: boolean) {
  const role = await assertBoardVisible(boardId, actor);
  assertIsBoardOwnerOrAdmin(role, actor);

  const openTasks = await prisma.task.count({ where: { boardId, isDeleted: false, isCompleted: false } });
  if (openTasks > 0 && !cascadeConfirm) {
    throw Errors.conflict(
      `This board has ${openTasks} open task(s). Confirm cascading delete to remove the board and its tasks, or move the tasks first.`
    );
  }

  const board = await prisma.board.findUniqueOrThrow({ where: { id: boardId } });

  await prisma.$transaction([
    prisma.task.updateMany({ where: { boardId }, data: { isDeleted: true, deletedAt: new Date() } }),
    prisma.board.update({ where: { id: boardId }, data: { isDeleted: true, deletedAt: new Date() } }),
  ]);

  await writeAudit({
    actor,
    action: AuditAction.DELETE,
    entityType: "Board",
    entityId: boardId,
    boardId,
    beforeValue: { name: board.name },
  });
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export async function addStage(boardId: string, input: { name: string; color?: string; wipLimit?: number | null; isTerminal?: boolean }, actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(role);

  const maxPosition = await prisma.boardStage.aggregate({ where: { boardId }, _max: { position: true } });
  const stage = await prisma.boardStage.create({
    data: {
      boardId,
      name: input.name,
      color: input.color ?? "#6366f1",
      wipLimit: input.wipLimit ?? null,
      isTerminal: input.isTerminal ?? false,
      position: (maxPosition._max.position ?? -1) + 1,
    },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "BoardStage", entityId: stage.id, boardId, afterValue: input });
  return stage;
}

export async function updateStage(boardId: string, stageId: string, input: any, actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(role);

  const before = await prisma.boardStage.findFirstOrThrow({ where: { id: stageId, boardId } });
  const stage = await prisma.boardStage.update({ where: { id: stageId }, data: input });

  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "BoardStage", entityId: stageId, boardId, beforeValue: before, afterValue: input });
  return stage;
}

export async function deleteStage(boardId: string, stageId: string, actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(role);

  const stageCount = await prisma.boardStage.count({ where: { boardId } });
  if (stageCount <= 1) {
    throw Errors.conflict("A board must always retain at least one stage.");
  }

  const tasksInStage = await prisma.task.count({ where: { stageId, isDeleted: false } });
  if (tasksInStage > 0) {
    throw Errors.conflict(
      `This stage still has ${tasksInStage} task(s). Move them to another stage before deleting it.`
    );
  }

  const stage = await prisma.boardStage.delete({ where: { id: stageId } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "BoardStage", entityId: stageId, boardId, beforeValue: stage });
}

export async function reorderStages(boardId: string, orderedStageIds: string[], actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(role);

  await prisma.$transaction(
    orderedStageIds.map((id, idx) => prisma.boardStage.update({ where: { id }, data: { position: idx } }))
  );
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "BoardStage", entityId: boardId, boardId, field: "order", afterValue: orderedStageIds });
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function addMember(boardId: string, userId: string, role: string, actor: AuthedUser) {
  const myRole = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(myRole);

  const member = await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId, userId } },
    create: { boardId, userId, role },
    update: { role },
  });

  await writeAudit({ actor, action: AuditAction.CREATE, entityType: "BoardMember", entityId: member.id, boardId, afterValue: { userId, role } });
  return member;
}

export async function updateMemberRole(boardId: string, userId: string, role: string, actor: AuthedUser) {
  const myRole = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(myRole);

  if (role !== "OWNER") {
    const ownerCount = await prisma.boardMember.count({ where: { boardId, role: "OWNER" } });
    const target = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } });
    if (target?.role === "OWNER" && ownerCount <= 1) {
      throw Errors.conflict("A board must always have at least one Owner.");
    }
  }

  const member = await prisma.boardMember.update({ where: { boardId_userId: { boardId, userId } }, data: { role } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "BoardMember", entityId: member.id, boardId, field: "role", afterValue: role });
  return member;
}

export async function removeMember(boardId: string, userId: string, actor: AuthedUser) {
  const myRole = await assertBoardVisible(boardId, actor);
  assertCanEditBoard(myRole);

  const target = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId } } });
  if (!target) throw Errors.notFound("Board member");

  if (target.role === "OWNER") {
    const ownerCount = await prisma.boardMember.count({ where: { boardId, role: "OWNER" } });
    if (ownerCount <= 1) throw Errors.conflict("A board must always have at least one Owner.");
  }

  await prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId } } });
  await writeAudit({ actor, action: AuditAction.DELETE, entityType: "BoardMember", entityId: target.id, boardId, beforeValue: { userId, role: target.role } });
}

export async function listTemplates() {
  return prisma.boardTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function saveAsTemplate(boardId: string, name: string, actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertIsBoardOwnerOrAdmin(role, actor);

  const board = await prisma.board.findUniqueOrThrow({ where: { id: boardId }, include: { stages: { orderBy: { position: "asc" } } } });
  const template = await prisma.boardTemplate.create({
    data: {
      name,
      description: `Saved from board "${board.name}"`,
      createdById: actor.id,
      stageDefinition: board.stages.map((s) => ({ name: s.name, color: s.color, wipLimit: s.wipLimit, isTerminal: s.isTerminal })),
    },
  });
  return template;
}
