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
      where: { OR: [{ teamId: { in: managedTeams.map((t) => t.id) } }, { user: { id: { in: boardMemberUserIds } } }] },
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
      ...(filters.teamId ? { teamId: filters.teamId } : {}),
      user: { isNot: null },
    },
    include: { user: true, department: true, team: true },
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
        team: emp.team?.name ?? null,
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

export async function getEmployeeWorkloadDetail(employeeId: string, actor: AuthedUser) {
  const scopedIds = await resolveScopedEmployeeIds(actor);
  if (scopedIds !== "ALL" && !scopedIds.includes(employeeId)) {
    throw Errors.forbidden("You do not have permission to view this employee's workload.");
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!employee?.user) throw Errors.notFound("Employee");

  const tasks = await prisma.task.findMany({
    where: { isDeleted: false, isCompleted: false, assignees: { some: { userId: employee.user.id } } },
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
