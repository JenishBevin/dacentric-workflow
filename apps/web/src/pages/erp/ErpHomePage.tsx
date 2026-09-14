import React from "react";
import { Package } from "lucide-react";
import { EmptyState } from "../../components/ui/primitives";

/** ERP module landing page. Nothing is built here yet — purchasing,
 * vendors, and inventory are a future pass; this exists so the ERP nav
 * section (gated on moduleAccess including ERP) has somewhere to go. */
export default function ErpHomePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">ERP</h1>
        <p className="text-sm text-slate-500">Purchasing, vendors, and inventory.</p>
      </div>
      <EmptyState
        icon={<Package className="h-8 w-8" />}
        title="ERP isn't built yet"
        description="Purchase orders, vendors, and inventory tracking will live here once that module is scoped."
      />
    </div>
  );
}
