import React, { useState, useRef, useEffect } from "react";
import { Menu, ChevronDown, LogOut, User, Search, Plus, Trello, ListChecks, Clock, Pause, Bell } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { can, roleLabel } from "../../lib/permissions";
import { NotificationBell } from "./NotificationBell";
import { Avatar } from "../ui/primitives";
import { useWorkTimer, formatDuration } from "../../hooks/useWorkTimer";
import { myAvatarUrl } from "../../api/profile";
import clsx from "clsx";

const WorkTimerBadge: React.FC = () => {
  const { isRunning, todaySeconds, isLoading } = useWorkTimer();
  if (isLoading) return null;
  return (
    <span
      title={isRunning ? "Tracking your work time — keeps running across tabs and other apps, pauses only if this device sleeps or shuts down" : "Paused — resumes automatically once tracking picks back up"}
      className={clsx(
        "hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium sm:flex",
        isRunning ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      )}
    >
      {isRunning ? <Clock className="h-3.5 w-3.5 animate-pulse" /> : <Pause className="h-3.5 w-3.5" />}
      {formatDuration(todaySeconds)} today
    </span>
  );
};

const BREADCRUMB_LABELS: Record<string, string> = {
  workflow: "Workflow",
  boards: "Boards",
  "my-tasks": "My Tasks",
  team: "Team Workload",
  "time-logs": "Time Logs",
  settings: "Settings",
  profile: "My Profile",
  employees: "Employees",
  users: "Users",
  roles: "Roles & Permissions",
  tags: "Tags",
  notifications: "Notifications",
  audit: "Audit Trail",
  hrms: "Workflow",
  leave: "Leave",
  tickets: "Support Tickets",
};

function useBreadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  return segments.map((s) => BREADCRUMB_LABELS[s] ?? s);
}

export const Header: React.FC<{ onOpenMobileMenu: () => void }> = ({ onOpenMobileMenu }) => {
  const { user, logout } = useAuth();
  const crumbs = useBreadcrumbs();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    navigate(`/workflow/boards?search=${encodeURIComponent(search.trim())}`);
  }

  const canCreateBoard = can(user, "CREATE_BOARD");
  const canCreateTask = can(user, "CREATE_TASK");

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={onOpenMobileMenu} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label="Breadcrumb" className="hidden min-w-0 shrink-0 items-center gap-1.5 text-sm text-slate-500 xl:flex">
          <Link to="/" className="hover:text-slate-700">
            Home
          </Link>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <span className="text-slate-300">/</span>
              <span className={i === crumbs.length - 1 ? "font-medium text-slate-900" : ""}>{c}</span>
            </React.Fragment>
          ))}
        </nav>
        <form onSubmit={submitSearch} className="hidden min-w-0 max-w-md flex-1 sm:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search boards, tasks, records…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-14 text-sm text-slate-700 placeholder:text-slate-400 focus-visible:focus-ring"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              Ctrl K
            </kbd>
          </div>
        </form>
      </div>

      <div className="flex items-center gap-2">
        <WorkTimerBadge />
        {(canCreateBoard || canCreateTask) && (
          <div className="relative" ref={createRef}>
            <button
              onClick={() => setCreateOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
            {createOpen && (
              <div className="absolute right-0 z-30 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                {canCreateTask && (
                  <Link
                    to="/workflow/my-tasks?newTask=1"
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <ListChecks className="h-4 w-4" /> New Task
                  </Link>
                )}
                {canCreateBoard && (
                  <Link
                    to="/workflow/boards?newBoard=1"
                    onClick={() => setCreateOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    <Trello className="h-4 w-4" /> New Board
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
        <NotificationBell />
        <div className="relative" ref={ref}>
          <button onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100">
            <Avatar name={user?.name ?? "?"} size="sm" src={user?.hasAvatar ? myAvatarUrl() : undefined} />
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight text-slate-700">{user?.name}</span>
              <span className="block text-xs leading-tight text-slate-400">{user?.roles[0] ? roleLabel(user.roles[0]) : ""}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:inline" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-2 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
              <div className="border-b border-slate-100 px-3 py-2">
                <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.workEmail}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-brand-600">{user?.roles.map(roleLabel).join(", ")}</p>
              </div>
              <Link to="/settings/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <User className="h-4 w-4" /> My Profile
              </Link>
              <Link to="/settings/notifications" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                <Bell className="h-4 w-4" /> Notification settings
              </Link>
              <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
