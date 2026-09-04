import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Trello, ListChecks, Users2 } from "lucide-react";
import clsx from "clsx";

const ITEMS = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/workflow/boards", label: "Boards", icon: Trello, end: false },
  { to: "/workflow/my-tasks", label: "My Tasks", icon: ListChecks, end: false },
  { to: "/workflow/team", label: "Team", icon: Users2, end: false },
];

/** Compact mobile navigation (Section 37/8) — the desktop sidebar collapses to this below `sm`. */
export const MobileBottomNav: React.FC = () => (
  <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
    {ITEMS.map((item) => (
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
