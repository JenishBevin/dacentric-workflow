import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Wrench, ArrowRight } from "lucide-react";
import { useServices } from "../../api/boards";
import { Skeleton, EmptyState, ErrorState, Card } from "../../components/ui/primitives";
import { NewBoardDrawer } from "../../components/boards/NewBoardDrawer";

/**
 * "Projects" nav lands here first: create a standalone project via the
 * "New Project" tile (always first — e.g. the "Awarded" action on an
 * enquiry task lands here with a service + name pre-filled), or pick a
 * service (the fixed company catalog) to see the projects filed under it
 * (ServiceProjectsPage).
 */
export default function BoardsListPage() {
  const navigate = useNavigate();
  const { data: services, isLoading, isError, refetch } = useServices();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newProjectOpen, setNewProjectOpen] = useState(() => searchParams.get("newBoard") === "1");
  const prefillServiceId = searchParams.get("serviceId") ?? undefined;
  const prefillName = searchParams.get("name") ?? undefined;

  useEffect(() => {
    if (searchParams.get("newBoard") || searchParams.get("serviceId") || searchParams.get("name")) {
      const next = new URLSearchParams(searchParams);
      next.delete("newBoard");
      next.delete("serviceId");
      next.delete("name");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Projects</h1>
        <p className="text-sm text-slate-500">Start a new project, or pick a service to see the projects filed under it.</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {isError && <ErrorState message="Could not load services." onRetry={() => refetch()} />}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <button onClick={() => setNewProjectOpen(true)} className="text-left">
            <Card className="flex items-center justify-between gap-3 border-2 border-dashed border-brand-300 bg-brand-50/50 p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
                  <Plus className="h-5 w-5" />
                </div>
                <p className="truncate font-semibold text-brand-700">New Project</p>
              </div>
            </Card>
          </button>

          {services?.map((service) => (
            <Link key={service.id} to={`/workflow/boards/service/${service.id}`}>
              <Card className="flex items-center justify-between gap-3 p-4 transition-shadow hover:shadow-md">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{service.name}</p>
                  <p className="text-xs text-slate-500">{service.projectCount} project{service.projectCount === 1 ? "" : "s"}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </Card>
            </Link>
          ))}

          {services && services.length === 0 && (
            <EmptyState icon={<Wrench className="h-8 w-8" />} title="No services set up yet" />
          )}
        </div>
      )}

      <NewBoardDrawer
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        initialServiceId={prefillServiceId}
        initialName={prefillName}
        onCreated={(board) => navigate(`/workflow/boards/${board.id}`)}
      />
    </div>
  );
}
