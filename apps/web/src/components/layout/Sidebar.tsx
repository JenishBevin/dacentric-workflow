import React from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import {
  LayoutDashboard,
  Trello,
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

export const Sidebar: React.FC<{ mobileOpen: boolean; onCloseMobile: () => void }> = ({ mobileOpen, onCloseMobile }) => {
  const { user } = useAuth();
  const { data: myTaskGroups } = useMyTasks();
  const myTaskCount = myTaskGroups ? Object.values(myTaskGroups).reduce((sum: number, arr: any) => sum + arr.length, 0) : 0;

  const isLeaveApprover = user?.roles.some((r) => ["HR", "MANAGER", "SYSTEM_ADMIN", "SUPER_ADMIN"].includes(r)) ?? false;
  const { data: leaveRequests } = useHrmsLeaveRequests({ enabled: isLeaveApprover });

  const isTicketManager = can(user, "MANAGE_TICKETS", "ALL");
  const { data: openTickets } = useAllTickets("OPEN", { enabled: isTicketManager });

  const workflowItems: NavItem[] = [
    { to: "/workflow/boards", label: "Boards", icon: Trello, visible: can(user, "VIEW_WORKFLOW") },
    { to: "/workflow/my-tasks", label: "My Tasks", icon: ListChecks, visible: true, badge: myTaskCount || undefined },
    { to: "/workflow/team", label: "Team Workload", icon: Users2, visible: can(user, "VIEW_TEAM_WORKLOAD") },
    { to: "/workflow/time-logs", label: "Time Logs", icon: Clock3, visible: can(user, "VIEW_TIME_LOGS", "TEAM") },
    // Everyone can apply for their own leave here; approving others' leave
    // (the pending-count badge below) is additionally gated server-side.
    { to: "/hrms/leave", label: "Leave", icon: ClipboardList, visible: true, badge: isLeaveApprover ? leaveRequests?.length || undefined : undefined },
    { to: "/tickets", label: "Support Tickets", icon: TicketIcon, visible: true, badge: isTicketManager ? openTickets?.length || undefined : undefined },
  ];

  const settingsItems: NavItem[] = [
    { to: "/settings/profile", label: "My Profile", icon: UserCircle, visible: true },
    { to: "/settings/users", label: "Users", icon: UserCog, visible: can(user, "MANAGE_USERS", "ALL") },
    { to: "/settings/employees", label: "Employees", icon: Contact, visible: can(user, "MANAGE_USERS", "ALL") },
    { to: "/settings/roles", label: "Roles & Permissions", icon: Shield, visible: can(user, "MANAGE_ROLES", "ALL") },
    { to: "/settings/tags", label: "Tags", icon: Tags, visible: true },
    { to: "/settings/notifications", label: "Notifications", icon: Bell, visible: true },
    { to: "/settings/audit", label: "Audit Trail", icon: History, visible: can(user, "VIEW_AUDIT_TRAIL") },
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

      <SidebarLink to="/" label="Dashboard" icon={LayoutDashboard} visible badge={undefined} />

      <NavSection title="Workflow" items={workflowItems} />
      <NavSection title="Settings" items={settingsItems} />
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

const NavSection: React.FC<{ title: string; items: NavItem[] }> = ({ title, items }) => {
  const visible = items.filter((i) => i.visible);
  if (!visible.length) return null;
  return (
    <div>
      <p className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {visible.map((item) => (
          <SidebarLink key={item.to} {...item} />
        ))}
      </div>
    </div>
  );
};

const SidebarLink: React.FC<NavItem> = ({ to, label, icon: Icon, badge }) => (
  <NavLink
    to={to}
    end={to === "/"}
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
