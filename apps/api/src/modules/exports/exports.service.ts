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
