import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import LeavePage from "./LeavePage";
import ClaimPage from "./ClaimPage";
import SettlementsPage from "./SettlementsPage";
import { useAuth } from "../context/AuthContext";

const ALL_TABS = [
  { key: "leave", label: "Leave" },
  { key: "claim", label: "Claim" },
  { key: "settlements", label: "Approved Settlements" },
] as const;
type TabKey = (typeof ALL_TABS)[number]["key"];

/** "Request" menu — the entry point for the self-service request types:
 * Leave (unchanged), Claim (expense reimbursement), and — for whoever can
 * act on claims — Approved Settlements as its own top-level tab right next
 * to Claim, rather than a section buried below Pending Approvals. Management
 * doesn't apply for leave through this workflow, so they get Claim tabs only.
 * The header search box deep-links here with ?tab=&claim= for a Claim ID
 * lookup (CLM-000001) — the target tab opens directly and the matching card
 * is highlighted. */
export default function RequestPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isAdminUser = user?.roles.some((r) => ["SYSTEM_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;
  const isManagement = user?.roles.includes("MANAGEMENT") ?? false;
  const isAccounts = user?.roles.includes("ACCOUNTS") ?? false;
  const isApprover = isAdminUser || isManagement || isAccounts;

  const tabs = ALL_TABS.filter((t) => {
    if (t.key === "leave") return !isManagement;
    if (t.key === "settlements") return isApprover;
    return true;
  });
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const initialTab = requestedTab && tabs.some((t) => t.key === requestedTab) ? requestedTab : isManagement ? "claim" : "leave";
  const [tab, setTab] = useState<TabKey>(initialTab);
  const highlightClaimId = searchParams.get("claim");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Request</h1>
        <p className="text-sm text-slate-500">
          {isManagement ? "Review and approve expense claims submitted by the team." : "Apply for leave, or claim an expense you paid on behalf of the company."}
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
                tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "leave" ? <LeavePage /> : tab === "claim" ? <ClaimPage highlightClaimId={highlightClaimId} /> : <SettlementsPage highlightClaimId={highlightClaimId} />}
    </div>
  );
}
