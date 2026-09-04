import React from "react";
import { format } from "date-fns";
import { Activity } from "lucide-react";
import { useDashboard } from "../api/misc";
import { Skeleton, ErrorState, EmptyState, Badge } from "../components/ui/primitives";

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
            {items.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-900">{a.actorName}</span> {a.action.toLowerCase()}d a{" "}
                  <Badge tone="slate">{a.entityType}</Badge>
                  {a.field && <span className="text-slate-400"> · {a.field}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{format(new Date(a.createdAt), "d MMM yyyy, HH:mm")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
