/**
 * @dacentric/types
 * Canonical enums and shared DTO contracts for the DaCentric Workflow module.
 * Consumed by apps/api directly (via tsconfig path alias "@dacentric/types").
 * apps/web keeps light-weight mirror interfaces in src/lib/types.ts derived
 * from the same JSON contracts (kept intentionally decoupled from the build
 * of the API so the SPA never needs the API's toolchain to compile).
 */

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export enum RoleCode {
  SUPER_ADMIN = "SUPER_ADMIN",
  SYSTEM_ADMIN = "SYSTEM_ADMIN",
  CEO_DIRECTOR = "CEO_DIRECTOR",
  MANAGER = "MANAGER",
  HR = "HR",
  TEAM_LEAD = "TEAM_LEAD",
  TEAM_MEMBER = "TEAM_MEMBER",
}

export enum ModuleCode {
  CRM = "CRM",
  ERP = "ERP",
  HRMS = "HRMS",
  WORKFLOW = "WORKFLOW",
}

/** Canonical permission keys — Section 5 RBAC matrix, rows 1-20. */
export enum PermissionKey {
  LOGIN = "LOGIN",
  VIEW_WORKFLOW = "VIEW_WORKFLOW",
  CREATE_BOARD = "CREATE_BOARD",
  EDIT_BOARD = "EDIT_BOARD",
  ARCHIVE_DELETE_BOARD = "ARCHIVE_DELETE_BOARD",
  CONFIGURE_STAGES = "CONFIGURE_STAGES",
  MANAGE_BOARD_MEMBERS = "MANAGE_BOARD_MEMBERS",
  CREATE_TASK = "CREATE_TASK",
  EDIT_TASK = "EDIT_TASK",
  DELETE_TASK = "DELETE_TASK",
  ASSIGN_TASK = "ASSIGN_TASK",
  MOVE_TASK = "MOVE_TASK",
  MANAGE_TASK_COLLAB = "MANAGE_TASK_COLLAB", // checklist / comments / attachments
  VIEW_TEAM_WORKLOAD = "VIEW_TEAM_WORKLOAD",
  APPROVE_TASK = "APPROVE_TASK",
  CRM_ERP_LINKING = "CRM_ERP_LINKING",
  EXPORT = "EXPORT",
  VIEW_AUDIT_TRAIL = "VIEW_AUDIT_TRAIL",
  MANAGE_ROLES = "MANAGE_ROLES",
  MANAGE_USERS = "MANAGE_USERS",
  VIEW_TIME_LOGS = "VIEW_TIME_LOGS",
  MANAGE_TICKETS = "MANAGE_TICKETS",
}

export type PermissionScope = "NONE" | "OWN" | "TEAM" | "ALL";

// ---------------------------------------------------------------------------
// Users / accounts
// ---------------------------------------------------------------------------

export enum AccountStatus {
  PENDING_ACTIVATION = "PENDING_ACTIVATION",
  ACTIVE = "ACTIVE",
  LOCKED = "LOCKED",
  DEACTIVATED = "DEACTIVATED",
}

export enum BoardMemberRole {
  OWNER = "OWNER",
  EDITOR = "EDITOR",
  VIEWER = "VIEWER",
  COMMENTER = "COMMENTER",
}

export enum BoardType {
  STANDALONE = "STANDALONE",
  LINKED = "LINKED",
}

export enum LinkedRecordType {
  CUSTOMER = "CUSTOMER",
  LEAD = "LEAD",
  ORDER = "ORDER",
  INVOICE = "INVOICE",
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export enum TaskApprovalStatus {
  NONE = "NONE",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum TaskType {
  STANDARD = "STANDARD",
  RECURRING_INSTANCE = "RECURRING_INSTANCE",
}

export enum RecurrenceFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  CUSTOM = "CUSTOM",
}

export enum RecurrenceEndType {
  NEVER = "NEVER",
  AFTER_N = "AFTER_N",
  ON_DATE = "ON_DATE",
}

export enum DependencyType {
  BLOCKED_BY = "BLOCKED_BY",
  BLOCKS = "BLOCKS",
}

export enum DueDateStatus {
  OVERDUE = "OVERDUE",
  DUE_SOON = "DUE_SOON", // within 48h
  ON_TRACK = "ON_TRACK",
  NO_DUE_DATE = "NO_DUE_DATE",
}

// ---------------------------------------------------------------------------
// Notifications / audit
// ---------------------------------------------------------------------------

export enum NotificationEvent {
  TASK_ASSIGNED = "TASK_ASSIGNED",
  TASK_REASSIGNED = "TASK_REASSIGNED",
  TASK_DUE_TODAY = "TASK_DUE_TODAY",
  TASK_OVERDUE = "TASK_OVERDUE",
  MENTION = "MENTION",
  APPROVAL_REQUESTED = "APPROVAL_REQUESTED",
  APPROVAL_APPROVED = "APPROVAL_APPROVED",
  APPROVAL_REJECTED = "APPROVAL_REJECTED",
  TASK_ACTIVITY = "TASK_ACTIVITY",
  CHECKLIST_ASSIGNED = "CHECKLIST_ASSIGNED",
  ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
}

export enum AuditAction {
  CREATE = "CREATE",
  EDIT = "EDIT",
  DELETE = "DELETE",
  MOVE = "MOVE",
  ASSIGN = "ASSIGN",
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  ARCHIVE = "ARCHIVE",
  LOGIN = "LOGIN",
  LOGIN_FAILED = "LOGIN_FAILED",
  LOCK = "LOCK",
  ACTIVATE = "ACTIVATE",
  DEACTIVATE = "DEACTIVATE",
}

export const TASK_ID_PREFIX = "WF-";
export const TASK_ID_PAD_LENGTH = 6;

export function formatTaskId(sequence: number): string {
  return `${TASK_ID_PREFIX}${String(sequence).padStart(TASK_ID_PAD_LENGTH, "0")}`;
}

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export enum TicketStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export const TICKET_ID_PREFIX = "TKT-";
export const TICKET_ID_PAD_LENGTH = 6;

export function formatTicketId(sequence: number): string {
  return `${TICKET_ID_PREFIX}${String(sequence).padStart(TICKET_ID_PAD_LENGTH, "0")}`;
}

// ---------------------------------------------------------------------------
// Common API envelope
// ---------------------------------------------------------------------------

export interface ApiError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
  };
}

export interface ApiFailure {
  error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
