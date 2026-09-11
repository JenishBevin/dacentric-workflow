import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Trello, ListChecks, Users2, ClipboardList } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";

const ITEMS = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/workflow/boards", label: "Projects", icon: Trello, end: false },
  { to: "/workflow/my-tasks", label: "My Tasks", icon: ListChecks, end: false },
  { to: "/workflow/team", label: "Team", icon: Users2, end: false },
];

// Staff has no Workflow access — Request (Leave/Claim) is the only page
// they can reach (enforced in AppLayout.tsx), so this is the only item shown.
const STAFF_ITEMS = [{ to: "/hrms/leave", label: "Request", icon: ClipboardList, end: true }];

/** Compact mobile navigation (Section 37/8) — the desktop sidebar collapses to this below `sm`. */
export const MobileBottomNav: React.FC = () => {
  const { user } = useAuth();
  const items = user?.roles.includes("STAFF") ? STAFF_ITEMS : ITEMS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-brand-600" : "text-slate-500")
          }
        >
          <item.icon className="h-5 w-5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
};
