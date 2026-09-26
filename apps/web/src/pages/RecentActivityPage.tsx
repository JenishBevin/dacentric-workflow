import React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Activity, ChevronRight } from "lucide-react";
import { useDashboard } from "../api/misc";
import { Skeleton, ErrorState, EmptyState, Badge } from "../components/ui/primitives";
import { boardPath } from "../lib/boardPath";

/** Lightweight, unrestricted activity feed — the most recent actions across boards you can see.
 *  For the full filterable/exportable/paginated history, see Settings → Audit Trail (admin-only). */
export default function RecentActivityPage() {
  const { data, isLoading, isError, refetch } = useDashboard({});
  const items = data?.recentActivity ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Recent Activity</h1>
        <p className="text-sm text-slate-500">The latest actions across boards you can see.</p>
      </div>

      {isLoading && <Skeleton className="h-96 w-full" />}
      {isError && <ErrorState message="Could not load recent activity." onRetry={() => refetch()} />}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState icon={<Activity className="h-8 w-8" />} title="No recent activity." description="Actions taken on your boards will show up here." />
      )}

      {!isLoading && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {items.map((a: any) => {
              const target = a.linkedTaskId
                ? `${boardPath(a.boardName, a.boardId)}?task=${a.linkedTaskId}`
                : a.boardId
                  ? boardPath(a.boardName, a.boardId)
                  : null;
              const content = (
                <>
                  <span className="text-slate-600">
                    <span className="font-medium text-slate-900">{a.actorName}</span> {a.action.toLowerCase()}d a{" "}
                    <Badge tone="slate">{a.entityType}</Badge>
                    {a.field && <span className="text-slate-400"> · {a.field}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                    {format(new Date(a.createdAt), "d MMM yyyy, HH:mm")}
                    {target && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                  </span>
                </>
              );
              return (
                <li key={a.id}>
                  {target ? (
                    <Link to={target} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-slate-50">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
