// Light-weight mirror of @dacentric/types' contracts. Kept as plain string
// unions (rather than importing the API's TS package) so the SPA never
// needs the backend's toolchain (Prisma-generated types, tsconfig paths) to
// build — it only needs to agree on the JSON shape, which these types
// describe.

export type RoleCode =
  | "SUPER_ADMIN"
  | "SYSTEM_ADMIN"
  | "MANAGEMENT"
  | "HR"
  | "ACCOUNTS"
  | "ESTIMATION"
  | "SALES"
  | "PROCUREMENT"
  | "STAFF"
  | "ESTIMATION_MANAGER"
  | "ESTIMATION_TEAM_LEAD"
  | "ESTIMATION_ENGINEER"
  | "PROJ_MANAGER"
  | "MEP_ENGINEER"
  | "SITE_ENGINEER"
  | "TECHNICIAN";
export type ModuleCode = "CRM" | "ERP" | "HRMS" | "WORKFLOW";
export type PermissionScope = "NONE" | "OWN" | "TEAM" | "ALL";

export type PermissionKey =
  | "LOGIN"
  | "VIEW_WORKFLOW"
  | "CREATE_BOARD"
  | "EDIT_BOARD"
  | "ARCHIVE_DELETE_BOARD"
  | "CONFIGURE_STAGES"
  | "MANAGE_BOARD_MEMBERS"
  | "CREATE_TASK"
  | "EDIT_TASK"
  | "DELETE_TASK"
  | "ASSIGN_TASK"
  | "MOVE_TASK"
  | "MANAGE_TASK_COLLAB"
  | "VIEW_TEAM_WORKLOAD"
  | "APPROVE_TASK"
  | "CRM_ERP_LINKING"
  | "EXPORT"
  | "VIEW_AUDIT_TRAIL"
  | "MANAGE_ROLES"
  | "MANAGE_USERS"
  | "VIEW_TIME_LOGS"
  | "MANAGE_TICKETS";

export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskApprovalStatus = "NONE" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type DueDateStatus = "OVERDUE" | "DUE_SOON" | "ON_TRACK" | "NO_DUE_DATE";
export type BoardMemberRole = "OWNER" | "EDITOR" | "VIEWER" | "COMMENTER";
export type BoardType = "STANDALONE" | "LINKED";
export type LinkedRecordType = "CUSTOMER" | "LEAD" | "ORDER" | "INVOICE";
export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
export type RecurrenceEndType = "NEVER" | "AFTER_N" | "ON_DATE";
export type DependencyType = "BLOCKED_BY" | "BLOCKS";
export type NotificationEvent =
  | "TASK_ASSIGNED"
  | "TASK_REASSIGNED"
  | "TASK_DUE_TODAY"
  | "TASK_OVERDUE"
  | "MENTION"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED"
  | "TASK_ACTIVITY"
  | "CHECKLIST_ASSIGNED"
  | "ACCOUNT_LOCKED";

export interface CurrentUser {
  id: string;
  name: string;
  workEmail: string;
  roles: RoleCode[];
  moduleAccess: ModuleCode[];
  permissions: Record<string, PermissionScope>;
  employee: { id: string; fullName: string; departmentId: string | null; jobTitle: string | null } | null;
  hasAvatar: boolean;
  avatarUpdatedAt: string | null;
}

export type CustomerStatus = "ACTIVE" | "INACTIVE" | "PROSPECT";

export interface CustomerRef {
  id: string;
  customerId: string;
  name: string;
}

export interface CustomerSummary extends CustomerRef {
  status: CustomerStatus;
  industry?: string | null;
  country?: string | null;
  mainContactName?: string | null;
  phone?: string | null;
  email?: string | null;
  accountManager?: { id: string; name: string } | null;
  createdAt: string;
  enquiryCount: number;
  projectCount: number;
}

export interface CustomerContact {
  id: string;
  customerId: string;
  name: string;
  designation?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export interface CustomerDocument {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedBy: { name: string };
  createdAt: string;
}

export interface CustomerDetail extends CustomerSummary {
  customerType?: string | null;
  website?: string | null;
  city?: string | null;
  address?: string | null;
  vatNumber?: string | null;
  designation?: string | null;
  alternateContact?: string | null;
  rating?: string | null;
  notes?: string | null;
  createdBy: { id: string; name: string };
  contacts: CustomerContact[];
  documents: CustomerDocument[];
  enquiries: {
    total: number;
    won: number;
    lost: number;
    open: number;
    items: Array<{
      id: string;
      taskId: string;
      title: string;
      isCompleted: boolean;
      board: { id: string; name: string };
      stage: { name: string; isTerminal: boolean };
      enquiryRecord: { enquiryId: string } | null;
      estimationRecord: { estimationId: string } | null;
      createdAt: string;
    }>;
  };
  projects: {
    total: number;
    completed: number;
    inProgress: number;
    items: Array<{
      id: string;
      boardId: string;
      name: string;
      isCompleted: boolean;
      isArchived: boolean;
      createdAt: string;
      updatedAt: string;
      _count: { tasks: number };
    }>;
  };
  recentActivity: Array<{
    id: string;
    actorName: string;
    action: string;
    entityType: string;
    field?: string | null;
    metadata?: unknown;
    createdAt: string;
  }>;
  tickets: {
    total: number;
    open: number;
    items: Array<{
      id: string;
      ticketId: string;
      title: string;
      status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
      priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      createdAt: string;
      createdBy: { id: string; name: string };
    }>;
  };
  products: Array<{
    id: string;
    name: string;
    quantity: number | null;
    amount: number | null;
    purchasedAt: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  interactions: Array<{
    id: string;
    type: "EMAIL" | "CALL" | "MEETING";
    subject: string;
    notes: string | null;
    occurredAt: string;
    loggedBy: { id: string; name: string };
    createdAt: string;
  }>;
}

export interface TaskStatusHistoryEntry {
  id: string;
  stageName: string;
  comment?: string | null;
  updatedByName: string;
  createdAt: string;
}

export interface Board {
  id: string;
  boardId: string;
  name: string;
  description?: string | null;
  boardType: BoardType;
  linkedRecord?: { id: string; recordType: LinkedRecordType; name: string; externalRef: string } | null;
  customerId?: string | null;
  customer?: CustomerRef | null;
  isArchived: boolean;
  isHighlighted: boolean;
  stageCount: number;
  openTaskCount: number;
  overdueTaskCount: number;
  members: Array<{ userId: string; name: string; role: BoardMemberRole }>;
  updatedAt: string;
}

export interface BoardStage {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
  wipLimit: number | null;
  isTerminal: boolean;
  isFollowUpStage: boolean;
}

export interface TaskSummary {
  id: string;
  taskId: string;
  title: string;
  description?: string | null;
  boardId: string;
  board?: { id: string; name: string };
  stageId: string;
  stage?: { id: string; name: string; color: string; isTerminal: boolean; isFollowUpStage: boolean };
  serviceId?: string | null;
  service?: { id: string; name: string };
  customerId?: string | null;
  customer?: CustomerRef | null;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  followUpDate: string | null;
  dueDateStatus: DueDateStatus;
  estimatedEffortHours: number | null;
  createdById: string;
  createdBy?: { id: string; name: string };
  salespersonUserId?: string | null;
  salesperson?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  taskType: "STANDARD" | "RECURRING_INSTANCE";
  seriesId?: string | null;
  isCompleted: boolean;
  isHighlighted: boolean;
  estimationId?: string | null;
  enquiryId?: string | null;
  quotation?: {
    currency: string;
    title: string | null;
    quotationRef: string | null;
    recipientName: string | null;
    recipientCompany: string | null;
    recipientLocation: string | null;
    lineItems: { description: string; qty: number; unit: string; unitPrice: number }[];
    subtotal: number;
    vatRate: number;
    vatAmount: number | null;
    totalAmount: number | null;
    validityDays: number | null;
    paymentTerms: string | null;
    notes: string | null;
    generalTerms: string | null;
    preparerName: string | null;
    preparerDesignation: string | null;
    preparerMobile: string | null;
    quotedAt: string | null;
  } | null;
  requiresApproval: boolean;
  approverUserId?: string | null;
  approvalStatus: TaskApprovalStatus;
  lostApprovalStatus: TaskApprovalStatus;
  dependencyEnforced: boolean;
  assignees: Array<{ userId: string; name: string; isPrimary: boolean }>;
  watchers: Array<{ userId: string; name: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  checklist: Array<{ id: string; text: string; isComplete: boolean; ownerId?: string | null; ownerName?: string; position: number }>;
  checklistProgress: { done: number; total: number };
  attachmentCount: number;
  commentCount: number;
  linkedRecord: { id: string; type: LinkedRecordType; name: string; externalRef: string } | null;
  blockedBy: Array<{ id: string; taskId: string; title: string; isCompleted: boolean }>;
  blocks: Array<{ id: string; taskId: string; title: string; isCompleted: boolean }>;
}

export interface EmployeeDirectoryEntry {
  employeeId: string;
  userId: string;
  name: string;
  email: string;
  jobTitle?: string | null;
  department?: string | null;
  team?: string | null;
}

export interface NotificationItem {
  id: string;
  event: NotificationEvent;
  title: string;
  body?: string | null;
  taskId?: string | null;
  boardId?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorName: string;
  action: string;
  module: ModuleCode;
  entityType: string;
  entityId?: string | null;
  boardId?: string | null;
  field?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  createdAt: string;
}

export interface WorkloadRow {
  employeeId: string;
  userId: string;
  name: string;
  department: string | null;
  team: string | null;
  openTasks: number;
  overdue: number;
  dueThisWeek: number;
  estimatedEffortHours: number;
  workloadScore: number;
  workloadIndicator: "LOW" | "MEDIUM" | "HIGH";
}
