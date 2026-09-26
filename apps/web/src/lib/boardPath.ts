// Enquiry List and Estimation are boards under the hood (with their own
// QPTS-PRJ-style boardId), but they're reached through dedicated routes
// (/workflow/enquiries, /workflow/estimation) so the sidebar highlights them
// instead of "Projects" — going through the generic /workflow/boards/:id
// path instead (as a plain navigate()/<Link> would) lights up the wrong nav
// item even though the board itself loads correctly.
export function boardPath(boardName: string | undefined | null, boardId: string): string {
  if (boardName === "Enquiry List") return "/workflow/enquiries";
  if (boardName === "Estimation") return "/workflow/estimation";
  return `/workflow/boards/${boardId}`;
}
