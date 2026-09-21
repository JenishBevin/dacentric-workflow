import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";
import { visibleBoardsWhere } from "../boards/board-access";
import { SYSTEM_BOARD_NAMES } from "../boards/boards.service";

export type HistoryType = "PROJECT" | "TASK";
export type HistoryStatus = "COMPLETED" | "IN_PROGRESS" | "LOST";

export interface HistoryFilters {
  type?: HistoryType;
  status?: HistoryStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface HistoryRow {
  kind: HistoryType;
  id: string;
  code: string;
  name: string;
  service: string | null;
  status: HistoryStatus;
  eventDate: Date;
  // Only set for TASK rows — which pipeline board it currently lives on, so
  // the UI can label it correctly and route back to the right page.
  board?: "Enquiry List" | "Estimation";
}

/**
 * Project/Task History — a unified, filterable ledger of every Project
 * (Board) and every Enquiry (Task on the Enquiry List board) the caller can
 * see, each carrying its current status:
 *   - Projects: LOST once Accounts rejects it (see rejectAccountsBoard),
 *     COMPLETED once manually marked done, otherwise IN_PROGRESS.
 *     Individual tasks on a project never appear here on their own —
 *     Section per user's design, only the whole project moves to history.
 *   - Enquiries: LOST once moved to the "Lost" stage, COMPLETED if it
 *     otherwise reached a terminal stage (e.g. Converted, before being
 *     Awarded into a Project), IN_PROGRESS otherwise.
 */
export async function getHistory(actor: AuthedUser, filters: HistoryFilters): Promise<HistoryRow[]> {
  const boardWhere = visibleBoardsWhere(actor);
  const rows: HistoryRow[] = [];

  if (!filters.type || filters.type === "PROJECT") {
    const projects = await prisma.board.findMany({
      where: { ...boardWhere, name: { notIn: SYSTEM_BOARD_NAMES } },
      select: {
        id: true,
        boardId: true,
        name: true,
        isCompleted: true,
        completedAt: true,
        createdAt: true,
        accountsApprovalStatus: true,
        accountsDecidedAt: true,
        service: { select: { name: true } },
      },
    });
    for (const p of projects) {
      const isLost = p.accountsApprovalStatus === "REJECTED";
      rows.push({
        kind: "PROJECT",
        id: p.id,
        code: p.boardId,
        name: p.name,
        service: p.service?.name ?? null,
        status: isLost ? "LOST" : p.isCompleted ? "COMPLETED" : "IN_PROGRESS",
        eventDate: (isLost ? p.accountsDecidedAt : p.completedAt) ?? p.createdAt,
      });
    }
  }

  if (!filters.type || filters.type === "TASK") {
    // Both pipeline boards (Enquiry List, then Estimation) feed the same
    // TASK ledger — a task only ever appears under whichever one currently
    // holds it, since Awarded reassigns its boardId away from the other.
    const pipelineBoards = await prisma.board.findMany({ where: { ...boardWhere, name: { in: ["Enquiry List", "Estimation"] } } });
    for (const pipelineBoard of pipelineBoards) {
      const tasks = await prisma.task.findMany({
        where: { boardId: pipelineBoard.id, isDeleted: false },
        select: {
          id: true,
          taskId: true,
          title: true,
          isCompleted: true,
          completedAt: true,
          createdAt: true,
          stage: { select: { name: true } },
          service: { select: { name: true } },
        },
      });
      for (const t of tasks) {
        const status: HistoryStatus = t.stage.name.toLowerCase() === "lost" ? "LOST" : t.isCompleted ? "COMPLETED" : "IN_PROGRESS";
        rows.push({
          kind: "TASK",
          id: t.id,
          code: t.taskId,
          name: t.title,
          service: t.service?.name ?? null,
          status,
          eventDate: t.completedAt ?? t.createdAt,
          board: pipelineBoard.name as "Enquiry List" | "Estimation",
        });
      }
    }
  }

  const filtered = rows.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.dateFrom && r.eventDate < filters.dateFrom) return false;
    if (filters.dateTo && r.eventDate > filters.dateTo) return false;
    return true;
  });

  return filtered.sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime());
}
