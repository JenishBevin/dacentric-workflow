import { z } from "zod";
import { TaskPriority, RecurrenceFrequency, RecurrenceEndType, LinkedRecordType, DependencyType } from "@dacentric/types";

const isoDate = z.coerce.date();

export const createTaskSchema = z
  .object({
    boardId: z.string().uuid("Board is required."),
    stageId: z.string().uuid().optional(),
    title: z.string().min(1, "Title is required.").max(150, "Title cannot exceed 150 characters."),
    description: z.string().max(20000).optional(),
    priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
    assigneeUserIds: z.array(z.string().uuid()).min(1, "At least one assignee is required."),
    startDate: isoDate.optional().nullable(),
    dueDate: isoDate.optional().nullable(),
    estimatedEffortHours: z.number().positive().optional().nullable(),
    checklist: z.array(z.object({ text: z.string().min(1), ownerId: z.string().uuid().optional() })).optional(),
    tagIds: z.array(z.string().uuid()).optional(),
    linkedRecordId: z.string().uuid().optional(),
    linkedRecordType: z.nativeEnum(LinkedRecordType).optional(),
    watcherUserIds: z.array(z.string().uuid()).optional(),
    requiresApproval: z.boolean().optional(),
    approverUserId: z.string().uuid().optional(),
    recurring: z
      .object({
        frequency: z.nativeEnum(RecurrenceFrequency),
        customIntervalDays: z.number().int().positive().optional(),
        endType: z.nativeEnum(RecurrenceEndType),
        occurrencesLimit: z.number().int().positive().optional(),
        endDate: isoDate.optional(),
      })
      .optional(),
    dependencies: z
      .array(z.object({ type: z.nativeEnum(DependencyType), taskId: z.string().uuid() }))
      .optional(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
    message: "Due Date cannot be before Start Date.",
    path: ["dueDate"],
  })
  .refine((v) => !v.requiresApproval || !!v.approverUserId, {
    message: "Select an Approver when Requires Approval is on.",
    path: ["approverUserId"],
  });

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    description: z.string().max(20000).optional().nullable(),
    priority: z.nativeEnum(TaskPriority).optional(),
    startDate: isoDate.optional().nullable(),
    dueDate: isoDate.optional().nullable(),
    estimatedEffortHours: z.number().positive().optional().nullable(),
    requiresApproval: z.boolean().optional(),
    approverUserId: z.string().uuid().optional().nullable(),
    dependencyEnforced: z.boolean().optional(),
    version: z.number().int().optional(),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate, {
    message: "Due Date cannot be before Start Date.",
    path: ["dueDate"],
  });

export const moveTaskSchema = z.object({
  stageId: z.string().uuid(),
  confirmWipOverride: z.boolean().optional(),
  version: z.number().int().optional(),
});

export const setAssigneesSchema = z.object({
  assigneeUserIds: z.array(z.string().uuid()).min(1, "At least one assignee is required."),
});

export const quickEditSchema = z.object({
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: isoDate.optional().nullable(),
});

export const checklistItemSchema = z.object({
  text: z.string().min(1, "Checklist item cannot be empty.").max(300),
  ownerId: z.string().uuid().optional().nullable(),
});

export const updateChecklistItemSchema = z.object({
  text: z.string().min(1).max(300).optional(),
  isComplete: z.boolean().optional(),
  ownerId: z.string().uuid().optional().nullable(),
});

export const commentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty.").max(5000),
  mentionedUserIds: z.array(z.string().uuid()).optional(),
});

export const dependencySchema = z.object({
  type: z.nativeEnum(DependencyType),
  taskId: z.string().uuid(),
});

export const watcherSchema = z.object({
  userId: z.string().uuid(),
});

export const recurrenceSchema = z.object({
  frequency: z.nativeEnum(RecurrenceFrequency),
  customIntervalDays: z.number().int().positive().optional(),
  endType: z.nativeEnum(RecurrenceEndType),
  occurrencesLimit: z.number().int().positive().optional(),
  endDate: isoDate.optional(),
});

export const rejectApprovalSchema = z.object({
  reason: z.string().min(1, "A rejection reason is required."),
});

export const taskFilterSchema = z.object({
  boardId: z.string().uuid().optional(),
  assigneeUserId: z.string().uuid().optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  tagId: z.string().uuid().optional(),
  search: z.string().optional(),
  dueBefore: isoDate.optional(),
  dueAfter: isoDate.optional(),
  sortBy: z.enum(["dueDate", "priority", "createdAt", "title"]).optional(),
  groupBy: z.enum(["assignee", "priority", "stage", "none"]).optional(),
});
