import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  Trello,
  Inbox,
  Calculator,
  ListChecks,
  Users2,
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
  ChevronDown,
  DollarSign,
  Building2,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { can } from "../../lib/permissions";
import { useMyTasks, useHrmsLeaveRequests } from "../../api/misc";
import { useAllTickets } from "../../api/tickets";

interface NavItem {
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
  leadingGroup?: React.ReactNode;
}

// Dev-only regrouping: on localhost, Enquiry List / Estimation / Projects
// nest under a collapsible "Sales" dropdown instead of sitting flat in the
// Workflow section. Gated on Vite's own dev-mode flag (true only for `npm
// run dev`, false in the production build Railway serves) rather than a
// hostname check, so it can't accidentally activate on a deployed preview.
const SHOW_SALES_DROPDOWN = import.meta.env.DEV;

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

  const salesItems: NavItem[] = [
    { to: "/workflow/enquiries", label: "Enquiry List", icon: Inbox, visible: !isStaff && can(user, "VIEW_WORKFLOW") },
    { to: "/workflow/estimation", label: "Estimation", icon: Calculator, visible: !isStaff && can(user, "VIEW_WORKFLOW") },
    { to: "/workflow/boards", label: "Projects", icon: Trello, visible: !isStaff && can(user, "VIEW_WORKFLOW") },
  ];

  const workflowItems: NavItem[] = [
    ...(SHOW_SALES_DROPDOWN ? [] : salesItems),
    { to: "/workflow/customers", label: "Customers", icon: Building2, visible: !isStaff && can(user, "VIEW_WORKFLOW") },
    { to: "/workflow/my-tasks", label: "My Tasks", icon: ListChecks, visible: !isStaff, badge: myTaskCount || undefined },
    { to: "/workflow/team", label: "Team Workload", icon: Users2, visible: !isStaff && can(user, "VIEW_TEAM_WORKLOAD") },
    { to: "/workflow/history", label: "Project/Task History", icon: Archive, visible: !isStaff && can(user, "VIEW_WORKFLOW") },
    { to: "/workflow/time-logs", label: "Time Logs", icon: Clock3, visible: !isStaff && can(user, "VIEW_TIME_LOGS", "TEAM") },
    // "Request" covers both Leave and Claim. Management is excluded from
    // Leave (RequestPage hides that tab for them) but does approve Claims,
    // so the menu stays visible for them too; approving others' leave (the
    // pending-count badge below) is additionally gated server-side.
    { to: "/hrms/leave", label: "Request", icon: ClipboardList, visible: true, badge: isLeaveApprover ? leaveRequests?.length || undefined : undefined },
    { to: "/tickets", label: "Support Tickets", icon: TicketIcon, visible: !isStaff, badge: isTicketManager ? openTickets?.length || undefined : undefined },
  ];

  const settingsItems: NavItem[] = [
    // My Profile is allowed for Staff too (see STAFF_ALLOWED_PATHS in
    // AppLayout.tsx); Notifications stays out of reach for them.
    { to: "/settings/profile", label: "My Profile", icon: UserCircle, visible: true },
    { to: "/settings/users", label: "Users", icon: UserCog, visible: !isStaff && can(user, "MANAGE_USERS", "ALL") },
    { to: "/settings/employees", label: "Employees", icon: Contact, visible: !isStaff && can(user, "MANAGE_USERS", "ALL") },
    { to: "/settings/roles", label: "Roles & Permissions", icon: Shield, visible: !isStaff && can(user, "MANAGE_ROLES", "ALL") },
    { to: "/settings/tags", label: "Tags", icon: Tags, visible: !isStaff },
    { to: "/settings/notifications", label: "Notifications", icon: Bell, visible: !isStaff },
    { to: "/workflow/activity", label: "Recent Activity", icon: Activity, visible: !isStaff },
    { to: "/settings/audit", label: "Audit Trail", icon: History, visible: !isStaff && can(user, "VIEW_AUDIT_TRAIL") },
  ];

  const content = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-purple-600 text-sm font-bold text-white shadow-sm">
            D
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">DaCentric</span>
        </div>
        <button className="rounded-md p-1 text-slate-400 hover:bg-white/10 lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      {!isStaff && <SidebarLink to="/" label="Dashboard" icon={LayoutDashboard} visible badge={undefined} onNavigate={onCloseMobile} />}

      <NavSection
        title="Workflow"
        items={workflowItems}
        onNavigate={onCloseMobile}
        leadingGroup={
          SHOW_SALES_DROPDOWN ? <NavGroup label="Sales" icon={DollarSign} items={salesItems} onNavigate={onCloseMobile} /> : undefined
        }
      />
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

const NavSection: React.FC<NavSectionProps> = ({ title, items, onNavigate, leadingGroup }) => {
  const visible = items.filter((i) => i.visible);
  if (!visible.length && !leadingGroup) return null;
  return (
    <div>
      <p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {leadingGroup}
        {visible.map((item) => (
          <SidebarLink key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
};

// Collapsible sub-menu (currently only the dev-only "Sales" grouping) —
// expanded by default, and forced open whenever the current route is one of
// its own children so a deep link never lands on a collapsed dropdown.
const NavGroup: React.FC<{ label: string; icon: React.ElementType; items: NavItem[]; onNavigate?: () => void }> = ({
  label,
  icon: Icon,
  items,
  onNavigate,
}) => {
  const visible = items.filter((i) => i.visible);
  const location = useLocation();
  const containsActive = visible.some((i) => location.pathname.startsWith(i.to));
  const [open, setOpen] = React.useState(true);

  if (!visible.length) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          containsActive && !open ? "text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={clsx("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-3.5 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-3">
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
