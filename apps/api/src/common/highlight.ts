import { prisma } from "../lib/prisma";

/** Drops the "New" tag once anyone has actually worked on the task/project.
 *  updateMany with an isHighlighted filter is a cheap no-op when it's already off. */
export async function clearTaskHighlight(taskId: string) {
  await prisma.task.updateMany({ where: { id: taskId, isHighlighted: true }, data: { isHighlighted: false } });
}

export async function clearBoardHighlight(boardId: string) {
  await prisma.board.updateMany({ where: { id: boardId, isHighlighted: true }, data: { isHighlighted: false } });
}
