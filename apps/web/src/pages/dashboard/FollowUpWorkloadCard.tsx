import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useFollowUpWorkload } from "../../api/misc";
import { Card, Skeleton, Avatar } from "../../components/ui/primitives";

/** Compact Follow-up Workload panel, shown beside Team Workload — same idea, but for tasks
 *  waiting on a client follow-up (which Team Workload deliberately doesn't count). */
export const FollowUpWorkloadCard: React.FC<{ limit?: number }> = ({ limit = 5 }) => {
  const { data: rows } = useFollowUpWorkload({});
  const maxOpen = Math.max(1, ...(rows ?? []).map((r) => r.openFollowUps));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">Follow-up Workload</p>
        <Link to="/workflow/follow-ups" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
          View All Follow-ups <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {!rows && <Skeleton className="h-40" />}
      {rows && rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No follow-ups pending.</p>}
      <div className="space-y-3">
        {rows?.slice(0, limit).map((row) => (
          <div key={row.employeeId} className="flex items-center gap-2.5">
            <Avatar name={row.name} size="xs" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-700">{row.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {row.openFollowUps} open
                  {row.overdue > 0 && <span className="ml-1.5 font-medium text-red-600">{row.overdue} overdue</span>}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${Math.min(100, (row.openFollowUps / maxOpen) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
