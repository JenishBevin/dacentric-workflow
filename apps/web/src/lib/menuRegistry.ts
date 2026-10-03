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
  { key: "hrms.employees", label: "Employee Management", path: "/settings/employees", module: "HRMS" },
  // Request 1008 (HRMS expansion). The Employee page (/hrms/employees/:id) is covered by hrms.employees — see menuItemForPath.
  { key: "hrms.recruitment.candidates", label: "Recruitment · Candidate Management", path: "/hrms/recruitment/candidates", module: "HRMS" },
  { key: "hrms.recruitment.cv-bank", label: "Recruitment · CV Management", path: "/hrms/recruitment/cv-bank", module: "HRMS" },
  { key: "hrms.recruitment.interviews", label: "Recruitment · Interview Management", path: "/hrms/recruitment/interviews", module: "HRMS" },
  { key: "hrms.recruitment.selection", label: "Recruitment · Candidate Selection", path: "/hrms/recruitment/selection", module: "HRMS" },
  { key: "hrms.recruitment.offers", label: "Recruitment · Offer Letter Generation", path: "/hrms/recruitment/offers", module: "HRMS" },
  { key: "hrms.recruitment.joining", label: "Recruitment · Joining Details", path: "/hrms/recruitment/joining", module: "HRMS" },
  { key: "hrms.payroll.structure", label: "Payroll · Salary Structure", path: "/hrms/payroll/structure", module: "HRMS" },
  { key: "hrms.payroll.processing", label: "Payroll · Payroll Processing", path: "/hrms/payroll/processing", module: "HRMS" },
  { key: "hrms.payroll.payslips", label: "Payroll · Payslip Generation", path: "/hrms/payroll/payslips", module: "HRMS" },
  { key: "hrms.payroll.reports", label: "Payroll · Salary Reports", path: "/hrms/payroll/reports", module: "HRMS" },
  { key: "hrms.reports.employees", label: "Reports · Employee Reports", path: "/hrms/reports/employees", module: "HRMS" },
  { key: "hrms.reports.attendance", label: "Reports · Attendance Reports", path: "/hrms/reports/attendance", module: "HRMS" },
  { key: "hrms.reports.leave", label: "Reports · Leave Reports", path: "/hrms/reports/leave", module: "HRMS" },
  { key: "hrms.reports.payroll", label: "Reports · Payroll Reports", path: "/hrms/reports/payroll", module: "HRMS" },
  { key: "hrms.reports.recruitment", label: "Reports · Recruitment Reports", path: "/hrms/reports/recruitment", module: "HRMS" },
  { key: "erp.erp", label: "Vendor List", path: "/erp", module: "ERP" },
  { key: "tools.time-logs", label: "Time Logs", path: "/workflow/time-logs", module: "Tools" },
  { key: "tools.request", label: "Request", path: "/hrms/leave", module: "Tools" },
  { key: "tools.tickets", label: "Support Tickets", path: "/tickets", module: "Tools" },
  { key: "tools.activity", label: "Recent Activity", path: "/workflow/activity", module: "Tools" },
  { key: "tools.tags", label: "Tags", path: "/settings/tags", module: "Tools" },
];

export const MENU_MODULES = ["Workflow", "CRM", "HRMS", "ERP", "Tools"] as const;

export function menuItemForPath(pathname: string): MenuItemDef | undefined {
  if (pathname.startsWith("/hrms/employees")) return MENU_REGISTRY.find((m) => m.key === "hrms.employees");
  // Longest-path-first so a nested route (e.g. a board detail page under
  // /workflow/boards/:id) still matches its parent nav item ("Projects").
  return [...MENU_REGISTRY].sort((a, b) => b.path.length - a.path.length).find((m) => pathname.startsWith(m.path));
}
