/**
 * Every restrictable sidebar item, in one place — Settings -> Users -> Edit
 * -> Menu Access reads this list to build its checklist, and
 * Sidebar.tsx/AppLayout.tsx use the same `key` to hide a link or block
 * direct navigation to it for a given user.
 *
 * Adding a new nav item: give it a stable `key` here (and reuse that same
 * key on its Sidebar.tsx entry) — it then shows up under Menu Access
 * automatically, nothing else to wire up.
 */
export interface MenuItemDef {
  key: string;
  label: string;
  path: string;
  module: "Workflow" | "CRM" | "HRMS" | "ERP" | "Tools";
}

export const MENU_REGISTRY: MenuItemDef[] = [
  { key: "workflow.enquiries", label: "Enquiry List", path: "/workflow/enquiries", module: "Workflow" },
  { key: "workflow.estimation", label: "Estimation", path: "/workflow/estimation", module: "Workflow" },
  { key: "workflow.accounts", label: "Accounts", path: "/workflow/accounts", module: "Workflow" },
  { key: "workflow.procurement", label: "Procurement", path: "/workflow/procurement", module: "Workflow" },
  { key: "workflow.boards", label: "Projects", path: "/workflow/boards", module: "Workflow" },
  { key: "workflow.my-tasks", label: "My Tasks", path: "/workflow/my-tasks", module: "Workflow" },
  { key: "workflow.team", label: "Team Workload", path: "/workflow/team", module: "Workflow" },
  { key: "workflow.follow-ups", label: "Follow-up Workload", path: "/workflow/follow-ups", module: "Workflow" },
  { key: "workflow.history", label: "Project/Task History", path: "/workflow/history", module: "Workflow" },
  { key: "crm.customers", label: "Customers", path: "/workflow/customers", module: "CRM" },
  { key: "hrms.employees", label: "Employees", path: "/settings/employees", module: "HRMS" },
  { key: "erp.erp", label: "Vendor List", path: "/erp", module: "ERP" },
  { key: "tools.time-logs", label: "Time Logs", path: "/workflow/time-logs", module: "Tools" },
  { key: "tools.request", label: "Request", path: "/hrms/leave", module: "Tools" },
  { key: "tools.tickets", label: "Support Tickets", path: "/tickets", module: "Tools" },
  { key: "tools.activity", label: "Recent Activity", path: "/workflow/activity", module: "Tools" },
  { key: "tools.tags", label: "Tags", path: "/settings/tags", module: "Tools" },
];

export const MENU_MODULES = ["Workflow", "CRM", "HRMS", "ERP", "Tools"] as const;

export function menuItemForPath(pathname: string): MenuItemDef | undefined {
  // Longest-path-first so a nested route (e.g. a board detail page under
  // /workflow/boards/:id) still matches its parent nav item ("Projects").
  return [...MENU_REGISTRY].sort((a, b) => b.path.length - a.path.length).find((m) => pathname.startsWith(m.path));
}
