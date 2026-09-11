import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";
import { visibleBoardsWhere } from "../boards/board-access";

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
}

/**
 * Project/Task History — a unified, filterable ledger of every Project
 * (Board) and every Enquiry (Task on the Enquiry List board) the caller can
 * see, each carrying its current status:
 *   - Projects: COMPLETED once manually marked done, otherwise IN_PROGRESS.
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
      where: { ...boardWhere, name: { not: "Enquiry List" } },
      select: { id: true, boardId: true, name: true, isCompleted: true, completedAt: true, createdAt: true, service: { select: { name: true } } },
    });
    for (const p of projects) {
      rows.push({
        kind: "PROJECT",
        id: p.id,
        code: p.boardId,
        name: p.name,
        service: p.service?.name ?? null,
        status: p.isCompleted ? "COMPLETED" : "IN_PROGRESS",
        eventDate: p.completedAt ?? p.createdAt,
      });
    }
  }

  if (!filters.type || filters.type === "TASK") {
    const enquiryBoard = await prisma.board.findFirst({ where: { ...boardWhere, name: "Enquiry List" } });
    if (enquiryBoard) {
      const tasks = await prisma.task.findMany({
        where: { boardId: enquiryBoard.id, isDeleted: false },
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
