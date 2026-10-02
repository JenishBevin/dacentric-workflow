import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";
import { getPermissionScope, isSystemLevelAdmin } from "../../common/permissions";
import { PermissionKey } from "@dacentric/types";
import { Errors } from "../../common/errors";

export interface WorkloadFilters {
  departmentId?: string;
  teamId?: string;
  boardId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort?: "workload" | "overdue";
}

/**
 * Resolves which Employee rows the caller is permitted to see for a given
 * scoped permission — shared by Team Workload (VIEW_TEAM_WORKLOAD) and the
 * time-logs report (VIEW_TIME_LOGS), since "my team" means the same thing
 * for both: employees on a team I manage, or members of a board I own.
 */
export async function resolveScopedEmployeeIds(actor: AuthedUser, permission: PermissionKey = PermissionKey.VIEW_TEAM_WORKLOAD): Promise<string[] | "ALL"> {
  const scope = getPermissionScope(actor.permissions, permission);
  if (scope === "ALL" || isSystemLevelAdmin(actor.roles)) return "ALL";

  if (scope === "TEAM") {
    if (!actor.employeeId) return [];
    const managedTeams = await prisma.team.findMany({ where: { managerId: actor.employeeId }, select: { id: true } });
    const ownedBoards = await prisma.boardMember.findMany({ where: { userId: actor.id, role: "OWNER" }, select: { boardId: true } });
    const boardMemberUserIds = ownedBoards.length
      ? (
          await prisma.boardMember.findMany({ where: { boardId: { in: ownedBoards.map((b) => b.boardId) } }, select: { userId: true } })
        ).map((m) => m.userId)
      : [];
    const teamEmployees = await prisma.employee.findMany({
      where: { OR: [{ teams: { some: { id: { in: managedTeams.map((t) => t.id) } } } }, { user: { id: { in: boardMemberUserIds } } }] },
      select: { id: true },
    });
    const ids = new Set(teamEmployees.map((e) => e.id));
    ids.add(actor.employeeId);
    return [...ids];
  }

  // OWN
  return actor.employeeId ? [actor.employeeId] : [];
}

export async function getTeamWorkload(actor: AuthedUser, filters: WorkloadFilters) {
  const scopedIds = await resolveScopedEmployeeIds(actor);

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      ...(scopedIds === "ALL" ? {} : { id: { in: scopedIds } }),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.teamId ? { teams: { some: { id: filters.teamId } } } : {}),
      user: { isNot: null },
    },
    include: { user: true, department: true, teams: true },
  });

  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  const rows = await Promise.all(
    employees.map(async (emp) => {
      if (!emp.user) return null;
      const taskWhere: any = {
        isDeleted: false,
        assignees: { some: { userId: emp.user.id } },
        // Parked on a follow-up stage (e.g. Estimation's "Submitted", waiting
        // on the client) — not active work, so it shouldn't count toward
        // workload until it moves again. A task on a "Lost" stage is in the
        // same boat — it already shows up in Project/Task History (see
        // history.service.ts's identical stage.name check) and isCompleted
        // never gets set true for it, so without this it would otherwise
        // count toward workload forever.
        stage: { isFollowUpStage: false, NOT: { name: { equals: "Lost", mode: "insensitive" } } },
        // Marking the whole project Completed doesn't touch its individual
        // tasks' own isCompleted flag, so a task left open at that moment
        // would otherwise count toward workload forever even after the
        // project moved to Project/Task History.
        board: { isCompleted: false, isArchived: false, isDeleted: false },
        ...(filters.boardId ? { boardId: filters.boardId } : {}),
      };

      const [openTasks, overdue, dueThisWeek, effortAgg] = await Promise.all([
        prisma.task.count({ where: { ...taskWhere, isCompleted: false } }),
        prisma.task.count({ where: { ...taskWhere, isCompleted: false, dueDate: { lt: now, gte: filters.dateFrom, lte: filters.dateTo } } }),
        prisma.task.count({ where: { ...taskWhere, isCompleted: false, dueDate: { gte: now, lte: endOfWeek } } }),
        prisma.task.aggregate({ where: { ...taskWhere, isCompleted: false }, _sum: { estimatedEffortHours: true } }),
      ]);

      const effortHours = effortAgg._sum.estimatedEffortHours ?? 0;
      const workloadScore = openTasks * 2 + effortHours; // task-count + effort blended meter
      const indicator = workloadScore >= 20 ? "HIGH" : workloadScore >= 10 ? "MEDIUM" : "LOW";

      return {
        employeeId: emp.id,
        userId: emp.user.id,
        name: emp.fullName,
        department: emp.department?.name ?? null,
        team: emp.teams.map((t) => t.name).join(", ") || null,
        openTasks,
        overdue,
        dueThisWeek,
        estimatedEffortHours: effortHours,
        workloadScore,
        workloadIndicator: indicator,
      };
    })
  );

  const filtered = rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[];

  if (filters.sort === "overdue") {
    filtered.sort((a, b) => b.overdue - a.overdue);
  } else {
    filtered.sort((a, b) => b.workloadScore - a.workloadScore);
  }

  return filtered;
}

// Follow-up workload — deliberately a separate ledger from getTeamWorkload():
// tasks parked on a follow-up stage never count toward regular workload, and
// instead count here against whoever is chasing the client. Tasks parked
// before a follow-up owner could be named fall back to their assignees.
function followUpTaskWhere(userId: string) {
  return {
    isDeleted: false,
    isCompleted: false,
    stage: { isFollowUpStage: true },
    // Same reasoning as getTeamWorkload's taskWhere — a project being marked
    // Completed doesn't complete its individual tasks, so exclude tasks
    // whose project has already moved to Project/Task History.
    board: { isCompleted: false, isArchived: false, isDeleted: false },
    OR: [{ followUpAssigneeUserId: userId }, { followUpAssigneeUserId: null, assignees: { some: { userId } } }],
  };
}

export async function getFollowUpWorkload(actor: AuthedUser, filters: { departmentId?: string; teamId?: string }) {
  const scopedIds = await resolveScopedEmployeeIds(actor);

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      ...(scopedIds === "ALL" ? {} : { id: { in: scopedIds } }),
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
      ...(filters.teamId ? { teams: { some: { id: filters.teamId } } } : {}),
      user: { isNot: null },
    },
    include: { user: true, department: true, teams: true },
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  const rows = await Promise.all(
    employees.map(async (emp) => {
      if (!emp.user) return null;
      const where: any = followUpTaskWhere(emp.user.id);
      const [openFollowUps, overdue, dueToday, dueThisWeek, noDate] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.count({ where: { ...where, followUpDate: { lt: startOfToday } } }),
        prisma.task.count({ where: { ...where, followUpDate: { gte: startOfToday, lte: endOfToday } } }),
        prisma.task.count({ where: { ...where, followUpDate: { gte: startOfToday, lte: endOfWeek } } }),
        prisma.task.count({ where: { ...where, followUpDate: null } }),
      ]);
      return {
        employeeId: emp.id,
        userId: emp.user.id,
        name: emp.fullName,
        department: emp.department?.name ?? null,
        team: emp.teams.map((t) => t.name).join(", ") || null,
        openFollowUps,
        overdue,
        dueToday,
        dueThisWeek,
        noDate,
      };
    })
  );

  return (rows.filter(Boolean) as NonNullable<(typeof rows)[number]>[])
    .filter((r) => r.openFollowUps > 0)
    .sort((a, b) => b.overdue - a.overdue || b.openFollowUps - a.openFollowUps);
}

export async function getEmployeeFollowUpDetail(employeeId: string, actor: AuthedUser) {
  const scopedIds = await resolveScopedEmployeeIds(actor);
  if (scopedIds !== "ALL" && !scopedIds.includes(employeeId)) {
    throw Errors.forbidden("You do not have permission to view this employee's follow-ups.");
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!employee?.user) throw Errors.notFound("Employee");

  const tasks = await prisma.task.findMany({
    where: followUpTaskWhere(employee.user.id) as any,
    include: { board: true, stage: true, customer: { select: { name: true } } },
    orderBy: [{ followUpDate: { sort: "asc", nulls: "first" } }],
  });

  return {
    employee: { id: employee.id, name: employee.fullName, department: employee.departmentId },
    tasks: tasks.map((t) => ({
      taskId: t.taskId,
      id: t.id,
      title: t.title,
      board: t.board.name,
      boardId: t.boardId,
      stage: t.stage.name,
      customer: t.customer?.name ?? null,
      followUpDate: t.followUpDate,
      priority: t.priority,
    })),
  };
}

export async function getEmployeeWorkloadDetail(employeeId: string, actor: AuthedUser) {
  const scopedIds = await resolveScopedEmployeeIds(actor);
  if (scopedIds !== "ALL" && !scopedIds.includes(employeeId)) {
    throw Errors.forbidden("You do not have permission to view this employee's workload.");
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!employee?.user) throw Errors.notFound("Employee");

  const tasks = await prisma.task.findMany({
    where: {
      isDeleted: false,
      isCompleted: false,
      assignees: { some: { userId: employee.user.id } },
      // Keep this in sync with getTeamWorkload's taskWhere — otherwise this
      // drill-down list wouldn't match the summary count it's opened from.
      stage: { isFollowUpStage: false, NOT: { name: { equals: "Lost", mode: "insensitive" } } },
      board: { isCompleted: false, isArchived: false, isDeleted: false },
    },
    include: { board: true, stage: true },
    orderBy: { dueDate: "asc" },
  });

  return {
    employee: { id: employee.id, name: employee.fullName, department: employee.departmentId },
    tasks: tasks.map((t) => ({
      taskId: t.taskId,
      id: t.id,
      title: t.title,
      board: t.board.name,
      boardId: t.boardId,
      stage: t.stage.name,
      dueDate: t.dueDate,
      priority: t.priority,
      estimatedEffortHours: t.estimatedEffortHours,
    })),
  };
}
