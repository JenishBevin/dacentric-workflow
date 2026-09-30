import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  Trello,
  Inbox,
  Calculator,
  ListChecks,
  Users2,
  PhoneCall,
  Clock3,
  Shield,
  Tags,
  Bell,
  History,
  UserCog,
  UserCircle,
  Contact,
  ClipboardList,
  Ticket as TicketIcon,
  Activity,
  Archive,
  Building2,
  Package,
  Landmark,
  Truck,
  DatabaseBackup,
  ChevronDown,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { can, isSuperAdmin } from "../../lib/permissions";
import { isLocalhost } from "../../lib/isLocalhost";
import { useMyTasks, useHrmsLeaveRequests } from "../../api/misc";
import qplusIcon from "../../assets/qplus-icon.png";
import { useAllTickets } from "../../api/tickets";

interface NavItem {
  key?: string;
  to: string;
  label: string;
  icon: React.ElementType;
  visible: boolean;
  badge?: number;
}

interface NavSectionProps {
  title: string;
  items: NavItem[];
  onNavigate?: () => void;
}

export const Sidebar: React.FC<{ mobileOpen: boolean; onCloseMobile: () => void }> = ({ mobileOpen, onCloseMobile }) => {
  const { user } = useAuth();
  const { data: myTaskGroups } = useMyTasks();
  const myTaskCount = myTaskGroups ? Object.values(myTaskGroups).reduce((sum: number, arr: any) => sum + arr.length, 0) : 0;

  const isLeaveApprover = user?.roles.some((r) => ["HR", "SYSTEM_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;
  const { data: leaveRequests } = useHrmsLeaveRequests({ enabled: isLeaveApprover });

  const isTicketManager = can(user, "MANAGE_TICKETS", "ALL");
  const { data: openTickets } = useAllTickets("OPEN", { enabled: isTicketManager });

  // Staff has no Workflow access — Leave is the only page they can reach
  // (enforced in AppLayout.tsx, not just hidden here), so every other nav
  // item is force-hidden rather than left to permission scopes.
  const isStaff = user?.roles.includes("STAFF") ?? false;
  const hasModule = (m: "CRM" | "ERP" | "HRMS" | "WORKFLOW") => user?.moduleAccess.includes(m) ?? false;
  // Per-user sidebar/route restriction on top of role permissions — set from
  // Settings -> Users -> Edit -> Menu Access, see lib/menuRegistry.ts.
  const isRestricted = (key: string) => user?.restrictedMenuKeys?.includes(key) ?? false;

  const workflowItems: NavItem[] = [
    { key: "workflow.enquiries", to: "/workflow/enquiries", label: "Enquiry List", icon: Inbox, visible: !isStaff && !isRestricted("workflow.enquiries") && can(user, "VIEW_WORKFLOW") },
    { key: "workflow.estimation", to: "/workflow/estimation", label: "Estimation", icon: Calculator, visible: !isStaff && !isRestricted("workflow.estimation") && can(user, "VIEW_WORKFLOW") },
    { key: "workflow.accounts", to: "/workflow/accounts", label: "Accounts", icon: Landmark, visible: !isStaff && !isRestricted("workflow.accounts") && can(user, "VIEW_WORKFLOW") },
    { key: "workflow.procurement", to: "/workflow/procurement", label: "Procurement", icon: Truck, visible: !isStaff && !isRestricted("workflow.procurement") && can(user, "VIEW_WORKFLOW") },
    { key: "workflow.boards", to: "/workflow/boards", label: "Projects", icon: Trello, visible: !isStaff && !isRestricted("workflow.boards") && can(user, "VIEW_WORKFLOW") },
    { key: "workflow.my-tasks", to: "/workflow/my-tasks", label: "My Tasks", icon: ListChecks, visible: !isStaff && !isRestricted("workflow.my-tasks"), badge: myTaskCount || undefined },
    { key: "workflow.team", to: "/workflow/team", label: "Team Workload", icon: Users2, visible: !isStaff && !isRestricted("workflow.team") && can(user, "VIEW_TEAM_WORKLOAD") },
    { key: "workflow.follow-ups", to: "/workflow/follow-ups", label: "Follow-up Workload", icon: PhoneCall, visible: !isStaff && !isRestricted("workflow.follow-ups") && can(user, "VIEW_TEAM_WORKLOAD") },
    { key: "workflow.history", to: "/workflow/history", label: "Project/Task History", icon: Archive, visible: !isStaff && !isRestricted("workflow.history") && can(user, "VIEW_WORKFLOW") },
  ];

  // Module-gated top-level sections, parallel to Workflow — visible only to
  // users an admin has granted that module (Settings -> Users -> edit ->
  // Module Access). Customers is genuinely CRM functionality, so it moves
  // here and is now additionally gated on CRM access — this narrows who
  // sees it versus before (anyone with VIEW_WORKFLOW could). Employees
  // moves to HRMS too — viewing the directory only needs the HRMS grant
  // (matching ERP's module-only gate); creating/editing/deactivating an
  // employee is still restricted to Manage Users: All, enforced both on the
  // page itself (EmployeesSettingsPage hides those controls) and by the API.
  // "Request" (leave/claims) lives in the Tools section below rather than
  // moving to HRMS — it's a universal employee entitlement, not an
  // HRMS-admin feature, and most users don't have HRMS access.
  const crmItems: NavItem[] = [
    { key: "crm.customers", to: "/workflow/customers", label: "Customers", icon: Building2, visible: !isStaff && !isRestricted("crm.customers") && hasModule("CRM") && can(user, "VIEW_WORKFLOW") },
  ];

  const hrmsItems: NavItem[] = [
    { key: "hrms.employees", to: "/settings/employees", label: "Employees", icon: Contact, visible: !isStaff && !isRestricted("hrms.employees") && hasModule("HRMS") },
  ];

  const erpItems: NavItem[] = [{ key: "erp.erp", to: "/erp", label: "ERP", icon: Package, visible: !isStaff && !isRestricted("erp.erp") && hasModule("ERP") }];

  // Grouped separately from Workflow/Settings, sitting just above Settings —
  // reporting/utility pages that don't fit neatly under a single module.
  // Every item keeps its original visibility condition unchanged, so this is
  // a pure regrouping with no access changes.
  const toolsItems: NavItem[] = [
    { key: "tools.time-logs", to: "/workflow/time-logs", label: "Time Logs", icon: Clock3, visible: !isStaff && !isRestricted("tools.time-logs") && can(user, "VIEW_TIME_LOGS", "TEAM") },
    // "Request" covers both Leave and Claim. Management is excluded from
    // Leave (RequestPage hides that tab for them) but does approve Claims,
    // so the menu stays visible for them too; approving others' leave (the
    // pending-count badge below) is additionally gated server-side.
    { key: "tools.request", to: "/hrms/leave", label: "Request", icon: ClipboardList, visible: !isRestricted("tools.request"), badge: isLeaveApprover ? leaveRequests?.length || undefined : undefined },
    { key: "tools.tickets", to: "/tickets", label: "Support Tickets", icon: TicketIcon, visible: !isStaff && !isRestricted("tools.tickets"), badge: isTicketManager ? openTickets?.length || undefined : undefined },
    { key: "tools.activity", to: "/workflow/activity", label: "Recent Activity", icon: Activity, visible: !isStaff && !isRestricted("tools.activity") },
    { to: "/settings/audit", label: "Audit Trail", icon: History, visible: !isStaff && can(user, "VIEW_AUDIT_TRAIL") },
    { key: "tools.tags", to: "/settings/tags", label: "Tags", icon: Tags, visible: !isStaff && !isRestricted("tools.tags") },
  ];

  const settingsItems: NavItem[] = [
    // My Profile is allowed for Staff too (see STAFF_ALLOWED_PATHS in
    // AppLayout.tsx); Notifications stays out of reach for them.
    { to: "/settings/profile", label: "My Profile", icon: UserCircle, visible: true },
    { to: "/settings/users", label: "Users", icon: UserCog, visible: !isStaff && can(user, "MANAGE_USERS", "ALL") },
    { to: "/settings/roles", label: "Roles & Permissions", icon: Shield, visible: !isStaff && can(user, "MANAGE_ROLES", "ALL") },
    { to: "/settings/notifications", label: "Notifications", icon: Bell, visible: !isStaff },
    // Hardcoded to the Super Admin role itself, not a configurable
    // permission — bypasses the app's own access rules, so it can't be
    // handed out via Roles & Permissions like everything else here.
    { to: "/settings/backup", label: "Backup & Restore", icon: DatabaseBackup, visible: isSuperAdmin(user) },
  ];

  const content = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <div className="relative flex items-center justify-center px-2 py-1">
        <div className="flex items-center justify-center gap-2 py-2" style={{ width: "75%" }}>
          <img src={qplusIcon} alt="" className="h-12 w-12 shrink-0 object-contain" />
          <span className="whitespace-nowrap text-2xl tracking-wide text-white" style={{ fontFamily: "'Baloo 2', sans-serif", fontWeight: 700 }}>
            QPlus
          </span>
        </div>
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-white/10 lg:hidden"
          onClick={onCloseMobile}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* On localhost, clicking "Workflow" below already opens this same
          page, making this separate link redundant — kept in production,
          where that module-header click-through doesn't apply. */}
      {!isStaff && !isLocalhost && <SidebarLink to="/dashboard" label="Dashboard" icon={LayoutDashboard} visible badge={undefined} onNavigate={onCloseMobile} />}

      <div className="flex flex-col gap-1">
        <ModuleGroup title="Workflow" items={workflowItems} onNavigate={onCloseMobile} dashboardTo="/dashboard" />
        <ModuleGroup title="CRM" items={crmItems} onNavigate={onCloseMobile} dashboardTo="/crm" />
        <ModuleGroup title="HRMS" items={hrmsItems} onNavigate={onCloseMobile} dashboardTo="/hrms" />
        <ModuleGroup title="ERP" items={erpItems} onNavigate={onCloseMobile} />
      </div>
      <NavSection title="Tools" items={toolsItems} onNavigate={onCloseMobile} />
      <NavSection title="Settings" items={settingsItems} onNavigate={onCloseMobile} />
    </nav>
  );

  return (
    <>
      <aside className="hidden w-60 shrink-0 bg-slate-900 lg:block">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
};

const NavSection: React.FC<NavSectionProps> = ({ title, items, onNavigate }) => {
  const visible = items.filter((i) => i.visible);
  if (!visible.length) return null;
  return (
    <div>
      <p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {visible.map((item) => (
          <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
};

// Collapsible, highlighted module header — used for the four top-level
// modules (Workflow/CRM/HRMS/ERP) so they read as a module switcher rather
// than a plain section label. Expanded by default, and forced visibly
// "current" (via containsActive) whenever the active route is one of its
// own children, even while collapsed.
//
// `dashboardTo`, when given, also makes the header itself navigate to that
// module's dashboard on click (alongside the usual expand/collapse) — a
// localhost-only preview (see ../../lib/isLocalhost) of per-module
// dashboards, so it's a no-op in production even if passed.
const ModuleGroup: React.FC<{ title: string; items: NavItem[]; onNavigate?: () => void; dashboardTo?: string }> = ({ title, items, onNavigate, dashboardTo }) => {
  const visible = items.filter((i) => i.visible);
  const location = useLocation();
  const navigate = useNavigate();
  const containsActive = visible.some((i) => location.pathname.startsWith(i.to)) || (!!dashboardTo && location.pathname === dashboardTo);
  const [open, setOpen] = React.useState(true);

  if (!visible.length) return null;

  function handleHeaderClick() {
    setOpen((o) => !o);
    if (isLocalhost && dashboardTo) navigate(dashboardTo);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleHeaderClick}
        className={clsx(
          "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
          containsActive ? "bg-brand-600/15 text-brand-300" : "text-slate-400 hover:bg-white/5 hover:text-white"
        )}
      >
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={clsx("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-0.5">
          {visible.map((item) => (
            <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
};

const SidebarLink: React.FC<NavItem & { onNavigate?: () => void }> = ({ to, label, icon: Icon, badge, onNavigate }) => (
  <NavLink
    to={to}
    end={to === "/"}
    onClick={onNavigate}
    className={({ isActive }) =>
      clsx(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        isActive ? "bg-brand-600 text-white shadow-sm" : "text-slate-300 hover:bg-white/5 hover:text-white"
      )
    }
  >
    <Icon className="h-4 w-4 shrink-0" />
    <span className="flex-1">{label}</span>
    {!!badge && (
      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/15 px-1.5 text-[11px] font-semibold text-white">
        {badge > 99 ? "99+" : badge}
      </span>
    )}
  </NavLink>
);
