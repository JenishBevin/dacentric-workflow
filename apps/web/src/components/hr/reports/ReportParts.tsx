import React from "react";
import { Download } from "lucide-react";
import clsx from "clsx";
import { Button, Card, ErrorState, Skeleton } from "../../ui/primitives";

export function ReportHeader({
  title,
  subtitle,
  filters,
  onExport,
  exportDisabled,
}: {
  title: string;
  subtitle: string;
  filters?: React.ReactNode;
  onExport?: () => void;
  exportDisabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {filters}
        {onExport && (
          <Button variant="outline" onClick={onExport} disabled={exportDisabled}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        )}
      </div>
    </div>
  );
}

export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

export function SummaryTile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "red" | "amber" | "green" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={clsx(
          "mt-1 text-xl font-semibold",
          tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : tone === "green" ? "text-emerald-600" : "text-slate-900"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

export function TileGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 5 }) {
  return (
    <div
      className={clsx(
        "grid grid-cols-2 gap-3",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        cols === 5 && "sm:grid-cols-3 lg:grid-cols-5"
      )}
    >
      {children}
    </div>
  );
}

export function BarList({
  title,
  items,
  maxRows = 8,
  color = "bg-brand-500",
  unit = "",
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  maxRows?: number;
  color?: string;
  unit?: string;
}) {
  const shown = items.slice(0, maxRows);
  const rest = items.slice(maxRows).reduce((s, i) => s + i.value, 0);
  const rows = rest > 0 ? [...shown, { label: `Other (${items.length - maxRows})`, value: rest }] : shown;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">No data.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-slate-600" title={r.label}>
                  {r.label}
                </span>
                <span className="shrink-0 font-medium text-slate-800">
                  {r.value}
                  {unit}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className={clsx("h-full rounded-full", color)} style={{ width: `${(r.value / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TableCard({ title, children, maxHeight = true }: { title?: string; children: React.ReactNode; maxHeight?: boolean }) {
  return (
    <Card className="overflow-hidden">
      {title && <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">{title}</h2>}
      <div className={clsx("overflow-auto", maxHeight && "max-h-[60vh]")}>{children}</div>
    </Card>
  );
}

export const THEAD = "sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500";
export const TH = "px-4 py-2.5 whitespace-nowrap";
export const TD = "px-4 py-2.5";
export const TR = "border-b border-slate-100 last:border-0";

export function ReportLoading({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </div>
  );
}

/** Renders loading / error / content for a react-query result. */
export function ReportBody<T>({
  query,
  tiles,
  children,
}: {
  query: { data: T | undefined; isLoading: boolean; isError: boolean; refetch: () => unknown };
  tiles?: number;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isLoading) return <ReportLoading tiles={tiles} />;
  if (query.isError || !query.data) return <ErrorState message="Could not load this report." onRetry={() => query.refetch()} />;
  return <>{children(query.data)}</>;
}

export const todayInput = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const yearStartInput = () => `${new Date().getFullYear()}-01-01`;
