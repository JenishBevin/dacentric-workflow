import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PackageSearch, Search } from "lucide-react";
import { useProcurementBoards } from "../../api/boards";
import { Skeleton, ErrorState, EmptyState, Badge, Input } from "../../components/ui/primitives";
import { extractApiError } from "../../lib/apiClient";
import { format } from "date-fns";

const STATUS_TONE: Record<string, "amber" | "indigo" | "green" | "red"> = {
  PENDING: "amber",
  ORDERED: "indigo",
  DELIVERED: "green",
  CANCELLED: "red",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  ORDERED: "Ordered",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/**
 * Every Project that has been awarded from Accounts, listed by its
 * ProcurementRecord. Clicking one opens the same Project board, defaulted to
 * its Procurement view via the toggle at the top — same task/project, same
 * id, just switched to the other page.
 */
export default function ProcurementListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useProcurementBoards(search);
  const rows = data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Procurement</h1>
        <p className="text-sm text-slate-500">Every project awarded from Accounts — vendor, order and delivery details live here.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects…" className="pl-9" />
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {isError && <ErrorState message={extractApiError(error).message} onRetry={() => refetch()} />}

      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState icon={<PackageSearch className="h-8 w-8" />} title="Nothing in Procurement yet." description="Projects awarded from Accounts will show up here." />
      )}

      {!isLoading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Procurement ID</th>
                <th className="px-4 py-2.5">Project</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Accounts</th>
                <th className="px-4 py-2.5">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/workflow/procurement/${r.id}`)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">{r.procurement.procurementId}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.customer?.name ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.service ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.procurement.vendorName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONE[r.procurement.status]}>{STATUS_LABEL[r.procurement.status] ?? r.procurement.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.accountsApprovalStatus === "PENDING" ? (
                      <Badge tone="amber">Awaiting approval</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{format(new Date(r.procurement.updatedAt), "d MMM yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
