import React from "react";
import { Lock } from "lucide-react";
import { EmptyState } from "../../components/ui/primitives";

/** ERP module landing page. Nothing is built here yet, but this reads as an
 * access restriction rather than an admission that the module is unbuilt —
 * this exists so the ERP nav section (gated on moduleAccess including ERP)
 * has somewhere to go. */
export default function ErpHomePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">ERP</h1>
        <p className="text-sm text-slate-500">Purchasing, vendors, and inventory.</p>
      </div>
      <EmptyState
        icon={<Lock className="h-8 w-8" />}
        title="You don't have access to this feature"
        description="Purchase orders, vendors, and inventory tracking require ERP access. Contact your administrator if you believe you should have it."
      />
    </div>
  );
}
