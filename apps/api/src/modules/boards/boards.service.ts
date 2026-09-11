import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { AuthedUser } from "../../middleware/authenticate";
import { getBoardRole, assertBoardVisible, assertCanEditBoard, assertIsBoardOwnerOrAdmin, visibleBoardsWhere } from "./board-access";
import { getPermissionScope, scopeAtLeast } from "../../common/permissions";
import { AuditAction, BoardType, RoleCode, PermissionKey, formatProjectId } from "@dacentric/types";

export const DEFAULT_STAGES = [
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
  serviceId?: string;
  members: Array<{ userId: string; role: string }>;
}

export async function listBoards(
  user: AuthedUser,
  filters: { search?: string; scope?: "MY" | "ALL" | "LINKED" | "ARCHIVED"; serviceId?: string }
) {
  const base = visibleBoardsWhere(user);
  // Completed projects have moved to Project/Task History — they never show
  // up in the regular Projects browsing view, archived or not.
  const where: any = { ...base, isCompleted: false };

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
  if (filters.serviceId) {
    where.serviceId = filters.serviceId;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { boardId: { contains: filters.search, mode: "insensitive" } },
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
    boardId: b.boardId,
    name: b.name,
    description: b.description,
    boardType: b.boardType,
    linkedRecord: b.linkedRecord,
    isArchived: b.isArchived,
    isHighlighted: b.isHighlighted,
    stageCount: b.stages.length,
    openTaskCount: openMap.get(b.id) ?? 0,
    overdueTaskCount: overdueMap.get(b.id) ?? 0,
    members: b.members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role })),
    updatedAt: b.updatedAt,
  }));
}

// Global "search by Project ID or name" lookup for the header search box.
// Scoped by visibleBoardsWhere (Business Rule 16 / Section 36) — a board a
// user isn't a member of must never be discoverable through search.
export async function searchBoards(q: string, user: AuthedUser) {
  const boards = await prisma.board.findMany({
    where: {
      ...visibleBoardsWhere(user),
      OR: [{ name: { contains: q, mode: "insensitive" } }, { boardId: { contains: q, mode: "insensitive" } }],
    },
    take: 20,
    select: { id: true, boardId: true, name: true },
  });
  return boards;
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
    const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.board.create({
      data: {
        boardId: placeholderId,
        name: input.name,
        description: input.description,
        boardType: input.boardType,
        linkedRecordType: input.boardType === BoardType.LINKED ? (input.linkedRecordType as any) : null,
        linkedRecordId: input.boardType === BoardType.LINKED ? input.linkedRecordId : null,
        templateId: input.templateId,
        serviceId: input.serviceId ?? null,
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
    return tx.board.update({
      where: { id: created.id },
      data: { boardId: formatProjectId(created.boardNumber) },
      include: { stages: true, members: true },
    });
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

// ---------------------------------------------------------------------------
// Named system boards — company-wide boards (currently just Enquiry List)
// that every environment lazily provisions itself the first time someone
// opens it, rather than depending on a per-environment seed step. Every item
// on them is just a Task, so it gets the full create/assign/monitor flow
// (NewTaskDrawer, approvals, comments, notifications) for free.
// ---------------------------------------------------------------------------

async function getOrCreateNamedBoard(
  name: string,
  description: string,
  stageDefs: Array<{ name: string; color: string; isTerminal?: boolean }>,
  actor: AuthedUser
) {
  let board = await prisma.board.findFirst({ where: { name, isDeleted: false } });

  if (!board) {
    const canCreateBoard = scopeAtLeast(getPermissionScope(actor.permissions, PermissionKey.CREATE_BOARD), "OWN");
    if (!canCreateBoard) {
      throw Errors.forbidden(`"${name}" hasn't been set up yet. Ask a Project Manager or Administrator to open it once to create it.`);
    }

    const activeUsers = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    const otherMembers = activeUsers.filter((u) => u.id !== actor.id).map((u) => ({ userId: u.id, role: "EDITOR" }));

    board = await prisma.$transaction(async (tx) => {
      const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
      const created = await tx.board.create({
        data: {
          boardId: placeholderId,
          name,
          description,
          boardType: BoardType.STANDALONE,
          createdById: actor.id,
          stages: {
            create: stageDefs.map((s, idx) => ({ name: s.name, color: s.color, position: idx, isTerminal: s.isTerminal ?? false })),
          },
          members: { create: [{ userId: actor.id, role: "OWNER" }, ...otherMembers] },
        },
      });
      return tx.board.update({ where: { id: created.id }, data: { boardId: formatProjectId(created.boardNumber) } });
    });

    await writeAudit({
      actor,
      action: AuditAction.CREATE,
      entityType: "Board",
      entityId: board.id,
      boardId: board.id,
      afterValue: { name: board.name, boardType: board.boardType, system: true },
    });
  } else {
    // Self-heal: anyone who can already reach this endpoint (VIEW_WORKFLOW)
    // should be able to use a company-wide board even if they were added to
    // the company after the board was first created.
    await prisma.boardMember.upsert({
      where: { boardId_userId: { boardId: board.id, userId: actor.id } },
      create: { boardId: board.id, userId: actor.id, role: "EDITOR" },
      update: {},
    });
  }

  return board;
}

const ENQUIRY_BOARD_NAME = "Enquiry List";
const ENQUIRY_STAGES = [
  { name: "New", color: "#60a5fa", isTerminal: false },
  { name: "In Progress", color: "#f59e0b", isTerminal: false },
  { name: "Converted", color: "#22c55e", isTerminal: true },
  { name: "Lost", color: "#ef4444", isTerminal: true },
];

export async function getOrCreateEnquiryBoard(actor: AuthedUser) {
  const board = await getOrCreateNamedBoard(
    ENQUIRY_BOARD_NAME,
    "Every incoming enquiry, tracked and assigned like any other task.",
    ENQUIRY_STAGES,
    actor
  );
  return { id: board.id, name: board.name };
}

// Sits between Enquiry List and Projects in the pipeline: an Awarded enquiry
// lands here first (not yet a real Project), can also be created directly
// here without ever going through Enquiry List, and only becomes a Project
// (under its chosen Service) once *it* is Awarded — see awardTask().
export const ESTIMATION_BOARD_NAME = "Estimation";
const ESTIMATION_STAGES = [
  { name: "New", color: "#60a5fa", isTerminal: false },
  { name: "In Progress", color: "#f59e0b", isTerminal: false },
  { name: "Converted", color: "#22c55e", isTerminal: true },
  { name: "Lost", color: "#ef4444", isTerminal: true },
];

export async function getOrCreateEstimationBoard(actor: AuthedUser) {
  const board = await getOrCreateNamedBoard(
    ESTIMATION_BOARD_NAME,
    "Costing and quoting for awarded enquiries — and anything estimated directly, without an enquiry first.",
    ESTIMATION_STAGES,
    actor
  );
  return { id: board.id, name: board.name };
}

// ---------------------------------------------------------------------------
// List of Services — the fixed company service catalog (seeded by
// servicesSeed.ts). "Projects" nav shows this list first; picking one shows
// the projects filed under it (listBoards with serviceId), each an ordinary
// board with the usual stages/task flow.
// ---------------------------------------------------------------------------

export async function listServices() {
  const services = await prisma.service.findMany({
    // Must match listBoards()'s filtering exactly, or the tile count and the
    // list it links to disagree — completed projects have moved to History,
    // so they don't count here either.
    include: { _count: { select: { boards: { where: { isDeleted: false, isCompleted: false } } } } },
    orderBy: { position: "asc" },
  });
  return services.map((s) => ({ id: s.id, name: s.name, projectCount: s._count.boards }));
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
      isHighlighted: false,
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

  const copy = await prisma.$transaction(async (tx) => {
    const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.board.create({
      data: {
        boardId: placeholderId,
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
    return tx.board.update({
      where: { id: created.id },
      data: { boardId: formatProjectId(created.boardNumber) },
      include: { stages: true, members: true },
    });
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

/** Marks the whole project done and moves it out of the active Projects
 *  view into Project/Task History — no per-task completion is required by
 *  the system; the Owner/Admin decides when every task is actually done. */
export async function setBoardCompleted(boardId: string, completed: boolean, actor: AuthedUser) {
  const role = await assertBoardVisible(boardId, actor);
  assertIsBoardOwnerOrAdmin(role, actor);

  const board = await prisma.board.update({
    where: { id: boardId },
    data: { isCompleted: completed, completedAt: completed ? new Date() : null },
  });

  await writeAudit({
    actor,
    action: AuditAction.EDIT,
    entityType: "Board",
    entityId: boardId,
    boardId,
    field: "isCompleted",
    afterValue: { isCompleted: completed },
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
