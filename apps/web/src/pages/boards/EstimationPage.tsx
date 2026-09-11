import React from "react";
import { Calculator } from "lucide-react";
import { useEstimationBoard } from "../../api/boards";
import { Spinner, EmptyState, ErrorState } from "../../components/ui/primitives";
import { extractApiError } from "../../lib/apiClient";
import BoardKanbanPage from "./BoardKanbanPage";

/**
 * Sits between Enquiry List and Projects: an Awarded enquiry lands here
 * first, and a task here can also be created directly, without ever going
 * through Enquiry List (via the ordinary "Add Task" flow on this board).
 * Only once *this* task is Awarded does a real Project get created. Same
 * lazy-provisioning + embed pattern as EnquiryListPage — renders in place so
 * the URL stays at /workflow/estimation and the sidebar highlights
 * "Estimation", not "Projects".
 */
export default function EstimationPage() {
  const { data: board, isLoading, isError, error, refetch } = useEstimationBoard();

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
          icon={<Calculator className="h-8 w-8" />}
          title="Estimation isn't set up yet"
          description="Ask a Project Manager or Administrator to open Estimation once — it only needs to happen the first time."
        />
      </div>
    );
  }

  return <BoardKanbanPage boardId={board.id} />;
}
