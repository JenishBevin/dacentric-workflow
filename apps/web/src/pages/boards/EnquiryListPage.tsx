import React from "react";
import { Inbox } from "lucide-react";
import { useEnquiryListBoard } from "../../api/boards";
import { Spinner, EmptyState, ErrorState } from "../../components/ui/primitives";
import { extractApiError } from "../../lib/apiClient";
import BoardKanbanPage from "./BoardKanbanPage";

/**
 * Resolves (or, for the first admin/PM to visit, provisions) the single
 * company-wide Enquiry List board, then renders the ordinary board Kanban
 * view in place — every enquiry is just a Task there, so it gets the exact
 * same create/assign/monitor flow as any other project. Renders in place
 * (rather than redirecting to /workflow/boards/:id) so the URL stays at
 * /workflow/enquiries and the sidebar highlights "Enquiry List", not
 * "Projects".
 */
export default function EnquiryListPage() {
  const { data: board, isLoading, isError, error, refetch } = useEnquiryListBoard();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6">
        <ErrorState message={extractApiError(error).message} onRetry={() => refetch()} />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          title="Enquiry List isn't set up yet"
          description="Ask a Project or Administrator to open Enquiry List once — it only needs to happen the first time."
        />
      </div>
    );
  }

  return <BoardKanbanPage boardId={board.id} />;
}
