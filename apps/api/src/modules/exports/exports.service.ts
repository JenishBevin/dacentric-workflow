import ExcelJS from "exceljs";

/**
 * Section 33 / UC-18: every export reflects the caller's current
 * filter/search/sort — callers pass already-filtered, already-authorized
 * rows in; this module only turns rows into a workbook. No route in the
 * app ever exports an unfiltered/unpermitted dataset because callers
 * always route through the same authorized query functions used to render
 * the screen (boards.service, teamWorkload.service, audit.service).
 */
export async function buildWorkbook(sheetName: string, columns: Array<{ header: string; key: string; width?: number }>, rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DaCentric Workflow";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  rows.forEach((row) => sheet.addRow(row));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function boardExportColumns() {
  return [
    { header: "Task ID", key: "taskId", width: 14 },
    { header: "Title", key: "title", width: 40 },
    { header: "Stage", key: "stage", width: 16 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Assignees", key: "assignees", width: 30 },
    { header: "Start Date", key: "startDate", width: 14 },
    { header: "Due Date", key: "dueDate", width: 14 },
    { header: "Estimated Effort (h)", key: "estimatedEffortHours", width: 18 },
    { header: "Checklist", key: "checklist", width: 12 },
    { header: "Approval Status", key: "approvalStatus", width: 16 },
    { header: "Tags", key: "tags", width: 24 },
  ];
}

/** Shared row shape for both the per-board task export and the bulk
 * selection export — same columns, same source data (serializeTask output). */
export function mapTaskExportRow(t: any) {
  return {
    taskId: t.taskId,
    title: t.title,
    stage: t.stage?.name,
    priority: t.priority,
    assignees: t.assignees.map((a: { name: string }) => a.name).join(", "),
    startDate: t.startDate ? new Date(t.startDate).toISOString().slice(0, 10) : "",
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : "",
    estimatedEffortHours: t.estimatedEffortHours ?? "",
    checklist: `${t.checklistProgress.done}/${t.checklistProgress.total}`,
    approvalStatus: t.approvalStatus,
    tags: t.tags.map((tag: any) => tag.name).join(", "),
  };
}

export function customersExportColumns() {
  return [
    { header: "Customer ID", key: "customerId", width: 16 },
    { header: "Name", key: "name", width: 32 },
    { header: "Status", key: "status", width: 12 },
    { header: "Industry", key: "industry", width: 18 },
    { header: "Country", key: "country", width: 16 },
    { header: "Main Contact", key: "mainContactName", width: 22 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 26 },
    { header: "Account Manager", key: "accountManager", width: 20 },
    { header: "Enquiries", key: "enquiryCount", width: 12 },
    { header: "Projects", key: "projectCount", width: 12 },
  ];
}

export function boardsExportColumns() {
  return [
    { header: "Project ID", key: "boardId", width: 16 },
    { header: "Name", key: "name", width: 32 },
    { header: "Customer", key: "customer", width: 26 },
    { header: "Status", key: "status", width: 12 },
    { header: "Stages", key: "stageCount", width: 10 },
    { header: "Open Tasks", key: "openTaskCount", width: 12 },
  ];
}

export function workloadExportColumns() {
  return [
    { header: "Employee", key: "name", width: 24 },
    { header: "Department", key: "department", width: 20 },
    { header: "Team", key: "team", width: 20 },
    { header: "Open Tasks", key: "openTasks", width: 12 },
    { header: "Overdue", key: "overdue", width: 12 },
    { header: "Due This Week", key: "dueThisWeek", width: 14 },
    { header: "Estimated Effort (h)", key: "estimatedEffortHours", width: 18 },
    { header: "Workload Indicator", key: "workloadIndicator", width: 16 },
  ];
}

export function historyExportColumns() {
  return [
    { header: "Type", key: "type", width: 12 },
    { header: "ID", key: "code", width: 16 },
    { header: "Name", key: "name", width: 40 },
    { header: "Service", key: "service", width: 20 },
    { header: "Status", key: "status", width: 14 },
    { header: "Date", key: "date", width: 14 },
  ];
}

export function settledClaimsExportColumns() {
  return [
    { header: "Claim ID", key: "claimId", width: 16 },
    { header: "Employee", key: "employee", width: 24 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Reason", key: "reason", width: 40 },
    { header: "Expense Date", key: "expenseDate", width: 16 },
    { header: "Verified By", key: "verifiedBy", width: 20 },
    { header: "Approved By", key: "approvedBy", width: 20 },
    { header: "Settled By", key: "settledBy", width: 20 },
    { header: "Settled Date", key: "settledDate", width: 16 },
  ];
}

export function auditExportColumns() {
  return [
    { header: "Date/Time", key: "createdAt", width: 22 },
    { header: "User", key: "actorName", width: 20 },
    { header: "Action", key: "action", width: 14 },
    { header: "Module", key: "module", width: 12 },
    { header: "Entity", key: "entityType", width: 16 },
    { header: "Entity ID", key: "entityId", width: 24 },
    { header: "Field", key: "field", width: 16 },
    { header: "Before", key: "beforeValue", width: 30 },
    { header: "After", key: "afterValue", width: 30 },
  ];
}
