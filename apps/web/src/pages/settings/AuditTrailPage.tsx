import React, { useState } from "react";
import { format } from "date-fns";
import { Download, History, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuditLog } from "../../api/misc";
import { downloadExport } from "../../api/misc";
import { Input, Select, Button, Skeleton, ErrorState, EmptyState, Badge, Label } from "../../components/ui/primitives";
import { useToast } from "../../context/ToastContext";
import { extractApiError } from "../../lib/apiClient";
import { AuditLogItem } from "../../lib/types";

const ACTIONS = ["CREATE", "EDIT", "DELETE", "MOVE", "ASSIGN", "APPROVE", "REJECT"];
const PAGE_SIZE = 25;

/** Section 34: immutable, admin-visible Workflow activity — filterable, paginated, exportable. Never editable/deletable. */
export default function AuditTrailPage() {
  const { push } = useToast();
  const [filters, setFilters] = useState<{ dateFrom?: string; dateTo?: string; action?: string; userId?: string; boardId?: string; taskId?: string }>({});
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAuditLog({ ...filters, page, pageSize: PAGE_SIZE });

  const items: AuditLogItem[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function setFilter(key: string, value: string) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Audit Trail</h1>
          <p className="text-sm text-slate-500">Every recorded Workflow action. Immutable — not even a System Administrator can edit or delete entries.</p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            downloadExport("/exports/audit", filters, "audit-trail-export.xlsx").catch((err) =>
              push({ variant: "error", title: "Export failed", description: extractApiError(err).message })
            )
          }
        >
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-4">
        <div>
          <Label className="!mb-0.5 !text-xs">From</Label>
          <Input type="date" onChange={(e) => setFilter("dateFrom", e.target.value)} className="!py-1.5 !text-xs" />
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">To</Label>
          <Input type="date" onChange={(e) => setFilter("dateTo", e.target.value)} className="!py-1.5 !text-xs" />
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">Action</Label>
          <Select onChange={(e) => setFilter("action", e.target.value)} className="!py-1.5 !text-xs">
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label className="!mb-0.5 !text-xs">Search entity ID</Label>
          <Input placeholder="Task or board ID…" onChange={(e) => setFilter("taskId", e.target.value)} className="!py-1.5 !text-xs" />
        </div>
      </div>

      {isLoading && <Skeleton className="h-96 w-full" />}
      {isError && <ErrorState message="Could not load audit activity." onRetry={() => refetch()} />}
      {items.length === 0 && !isLoading && !isError && <EmptyState icon={<History className="h-8 w-8" />} title="No audit activity matches your filters." />}

      {items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Date/Time</th>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Before</th>
                  <th className="px-4 py-2.5">After</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 last:border-0 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}</td>
                    <td className="px-4 py-2.5">{entry.actorName}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone="slate">{entry.action}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {entry.entityType}
                      {entry.field && <span className="text-slate-400"> · {entry.field}</span>}
                    </td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-xs text-slate-400">{entry.beforeValue != null ? String(entry.beforeValue) : "—"}</td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-xs text-slate-500">{entry.afterValue != null ? String(entry.afterValue) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page} of {totalPages} ({total} entries)
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
