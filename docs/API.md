# API Reference

Base URL: `${API_PUBLIC_URL}/api` (default `http://localhost:4000/api`).

## Conventions

- **Auth**: every route except those under `/auth` listed as public below requires `Authorization: Bearer <accessToken>`.
- **Response envelope**: `{ "data": <payload> }` on success, with an optional `"meta"` object (pagination totals, etc.). Errors: `{ "error": { "code": "STRING_CODE", "message": "Human-readable message", "fieldErrors"?: { "<field>": "message" } } }`.
- **Validation**: request bodies are validated server-side with Zod regardless of what the frontend already checked — the API is the authoritative validation layer.
- **Board visibility**: a user who is not a board member gets `404 Not Found` for that board (never `403`), so board existence is never leaked. System Administrators bypass this.
- **Optimistic concurrency**: `Board` and `Task` carry a `version` integer. Passing a stale `version` on update/move returns `409 CONFLICT` with the message "This task was updated. Please refresh." (or the board equivalent).

## Auth — `/api/auth` (public except `/me`)

| Method | Path | Description |
|---|---|---|
| POST | `/login` | Email + password → access token. Locks the account for 15 minutes after 5 consecutive failures and emails the user. |
| POST | `/logout` | Revokes the current session. |
| POST | `/forgot-password` | Issues a time-limited reset token by email (always returns success to avoid email enumeration). |
| POST | `/reset-password` | Consumes a reset token, sets a new password. |
| POST | `/activate` | Consumes a 72-hour invitation token, sets the initial password, activates the account. |
| GET | `/me` | *(auth required)* Current user, effective permissions, module access, linked employee. |

## Users — `/api/users` (MANAGE_USERS: ALL, except where noted)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List/search users, filter by status. |
| GET | `/employees` | *(any authenticated user)* Directory of active, Workflow-enabled employees — powers assignee/watcher/approver pickers. |
| GET | `/employees/unlinked` | Employees with no platform account yet — powers the "HRMS Employee Link" field on New User. |
| GET | `/departments` | *(any authenticated user)* Department list, for Team Workload filters. |
| GET | `/teams` | *(any authenticated user)* Team list, optionally filtered by `departmentId`. |
| POST | `/` | Create + invite a user (name, work email, roles, module access, optional employee link). Sends an invitation email, 72h expiry. |
| POST | `/bulk-import` | Same as above for an array of rows; duplicates are skipped, not errored. |
| POST | `/:id/resend-invite` | Re-issues the invitation (only while `PENDING_ACTIVATION`). |
| PATCH | `/:id` | Update name/roles/moduleAccess/status (`ACTIVE`/`DEACTIVATED`). Deactivation revokes access immediately; history is preserved. |

## Roles & Permissions — `/api/roles` (MANAGE_ROLES: ALL)

| Method | Path | Description |
|---|---|---|
| GET | `/` | All roles with their permission rows. |
| PATCH | `/:roleId/permissions` | Upsert one `{module, permission, scope}` cell of the RBAC matrix. Audited with before/after scope. |

## Boards — `/api/boards`

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/templates` | any | Board templates (built-in + saved custom). |
| GET | `/` | VIEW_WORKFLOW | List boards visible to the caller (`?scope=MY\|ALL\|LINKED\|ARCHIVED`, `?search=`). |
| POST | `/` | CREATE_BOARD | Create a board (name, description, type, linked record, template, stages, members). Enforces ≥1 stage, ≥1 Owner. |
| GET | `/:boardId` | member or Admin | Full board detail incl. stages and members. |
| PATCH | `/:boardId` | EDIT_BOARD | Update name/description/linked record. Optimistic-concurrency checked via `version`. |
| POST | `/:boardId/duplicate` | CREATE_BOARD | Duplicates stages + members (not tasks). |
| POST | `/:boardId/archive` | EDIT_BOARD | `{ archived: boolean }`. |
| DELETE | `/:boardId` | ARCHIVE_DELETE_BOARD | Requires `?confirmCascade=true` when the board has open tasks. |
| POST | `/:boardId/save-as-template` | EDIT_BOARD | Snapshots current stages as a reusable named template. |
| POST | `/:boardId/stages` | CONFIGURE_STAGES | Add a stage (name, color, WIP limit). |
| PATCH | `/:boardId/stages/:stageId` | CONFIGURE_STAGES | Rename/recolor/set WIP limit/mark terminal ("Done"). |
| DELETE | `/:boardId/stages/:stageId` | CONFIGURE_STAGES | Refused while the stage has open tasks; last stage is protected. |
| POST | `/:boardId/stages/reorder` | CONFIGURE_STAGES | `{ orderedStageIds: string[] }`. |
| POST | `/:boardId/members` | MANAGE_BOARD_MEMBERS | Add a member with a role (Owner/Editor/Viewer/Commenter). |
| PATCH | `/:boardId/members/:userId` | MANAGE_BOARD_MEMBERS | Change a member's role. Refused if it would leave the board with zero Owners. |
| DELETE | `/:boardId/members/:userId` | MANAGE_BOARD_MEMBERS | Remove a member. |

## Tasks — `/api/tasks`

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/board/:boardId` | board member | List tasks on a board (`assigneeUserId`, `priority`, `tagId`, `search`, `dueBefore`, `dueAfter`). |
| POST | `/` | CREATE_TASK | Create a task — the full field set: title, description, priority, assignees (≥1), dates, effort, checklist, tags, linked record, watchers, approval config, recurrence, dependencies. |
| GET | `/search/lookup?q=` | board member | Lightweight task search for the dependency picker. |
| GET | `/:taskId` | board member | Full task detail. |
| PATCH | `/:taskId` | task edit rights | Update core fields; `version`-checked. |
| DELETE | `/:taskId` | DELETE_TASK | Soft-delete (audit trail retains the record). |
| POST | `/:taskId/duplicate` | task edit rights | Clones the task (new Task ID, fresh state). |
| POST | `/:taskId/move` | MOVE_TASK | `{ stageId, confirmWipOverride?, version? }`. Enforces WIP limits (with override), the dependency Done-gate, and routes to Pending Approval instead of Done when approval is required. |
| POST | `/:taskId/complete` | task edit rights | Quick-complete — same gates as `/move` to a terminal stage. |
| PATCH | `/:taskId/quick-edit` | task edit rights | `{ priority?, dueDate? }` — the Task Quick View's inline edit. |
| PUT | `/:taskId/assignees` | ASSIGN_TASK | Replace the assignee list; index 0 becomes Primary Assignee. |
| POST/PATCH/DELETE | `/:taskId/checklist[/:itemId]` | task collab rights | Checklist CRUD, optional owner, completion toggling. |
| GET/POST | `/:taskId/comments` | board member / task collab | List/add comments; `mentionedUserIds` triggers @mention notifications. |
| GET/POST | `/:taskId/attachments` | board member / task collab | List / upload (multipart). |
| GET | `/:taskId/attachments/:id/download` | board member | Streams the file. |
| DELETE | `/:taskId/attachments/:id` | task collab rights | Delete, permission-checked. |
| PUT | `/:taskId/tags` | task edit rights | Replace the task's tag set. |
| POST/DELETE | `/:taskId/dependencies[/:id]` | task edit rights | Add/remove Blocked-By / Blocks links; rejects the direct circular pair. |
| POST/DELETE | `/:taskId/watchers[/:userId]` | board member | Watchers never count toward workload or My Tasks. |
| POST | `/:taskId/approval/approve` | APPROVE_TASK | Only the named approver or a System Administrator. |
| POST | `/:taskId/approval/reject` | APPROVE_TASK | `{ reason }` — reason is mandatory; returns the task to its previous stage. |
| GET | `/:taskId/activity` | board member | Task-scoped audit log. |

## My Tasks — `GET /api/my-tasks`

Every task assigned to the caller (never watcher-only tasks) across every board they belong to, pre-grouped into `OVERDUE` / `DUE_TODAY` / `DUE_THIS_WEEK` / `UPCOMING` / `NO_DUE_DATE`.

## Team Workload — `/api/team-workload` (VIEW_TEAM_WORKLOAD)

| Method | Path | Description |
|---|---|---|
| GET | `/` | One row per employee (open/overdue/due-this-week counts, effort hours, a LOW/MEDIUM/HIGH indicator). Filters: `departmentId`, `teamId`, `boardId`, `dateFrom`, `dateTo`, `sort=workload\|overdue`. Row visibility is itself RBAC-scoped (OWN/TEAM/ALL). |
| GET | `/employee/:employeeId` | Drill-down: that employee's open tasks with board/stage/due date/priority/effort. |

## Dashboard — `GET /api/dashboard`

Real, DB-derived figures: open/overdue/due-today/due-this-week/completed-this-month counts, active boards, status and priority distribution, recent activity, pending approvals. Supports `?departmentId=`, `?boardId=`, `?dateFrom=`, `?dateTo=`.

## Notifications — `/api/notifications`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Paginated list + unread count. |
| POST | `/:id/read` / `/mark-all-read` | Mark one or all as read. |
| GET | `/preferences` | Per-event `{ inApp, email }` — defaults to both on. |
| PUT | `/preferences/:event` | Update one event's preferences. |

## Audit Trail — `GET /api/audit` (VIEW_AUDIT_TRAIL)

Filters: `dateFrom`, `dateTo`, `userId`, `boardId`, `taskId`, `action`, `page`, `pageSize`. Rows are immutable — there is no update or delete route, by design (even System Administrator cannot alter history).

## Exports — `/api/exports` (EXPORT / VIEW_AUDIT_TRAIL)

| Method | Path | Description |
|---|---|---|
| GET | `/board/:boardId` | `.xlsx` of that board's tasks, honoring the same filters as the board task list. |
| GET | `/team-workload` | `.xlsx` of the Team Workload table, honoring its filters. |
| GET | `/audit` | `.xlsx` of the Audit Trail, honoring its filters. |

## Integrations

| Method | Path | Description |
|---|---|---|
| GET | `/api/integrations/crm/records?q=&type=` | Search mock CRM/ERP records (Customer/Lead/Order/Invoice) for board/task linking. Same handler is mounted at `/api/integrations/erp` — one abstraction, two mount points, ready for two real backends later. |
| GET | `/api/integrations/crm/records/:id/summary` | Board/task summary shown on a linked commercial record. |
| GET | `/api/integrations/hrms/leave-requests` | *(HR Manager/Workflow Manager/Admin)* Pending leave requests — a minimal demo surface, not a full HRMS module. |
| GET | `/api/integrations/hrms/leave-requests/:id/workload` | Read-only "View Current Workload" for that leave request's employee (UC-12). |
| POST | `/api/integrations/hrms/leave-requests/:id/decision` | `{ decision: "APPROVED" \| "REJECTED" }`. |

## Tags — `/api/tags`

`GET /` is open to any authenticated user; `POST /`, `PATCH /:tagId`, `DELETE /:tagId` require `CREATE_BOARD` scope (see the README's "known simplifications" for why this permission is reused rather than a dedicated one).
