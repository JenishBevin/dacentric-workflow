import { z } from "zod";
import { BoardType, LinkedRecordType } from "@dacentric/types";

export const createBoardSchema = z
  .object({
    name: z.string().min(1, "Board name is required.").max(150),
    description: z.string().max(2000).optional(),
    boardType: z.nativeEnum(BoardType).default(BoardType.STANDALONE),
    linkedRecordType: z.nativeEnum(LinkedRecordType).optional(),
    linkedRecordId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional().nullable(),
    members: z
      .array(
        z.object({
          userId: z.string().uuid(),
          role: z.enum(["OWNER", "EDITOR", "VIEWER", "COMMENTER"]),
        })
      )
      .default([]),
  })
  .refine((v) => v.boardType !== BoardType.LINKED || (v.linkedRecordType && v.linkedRecordId), {
    message: "Select a record to link when Board Type is Linked.",
    path: ["linkedRecordId"],
  })
  .refine((v) => v.members.some((m) => m.role === "OWNER"), {
    message: "A board must always have at least one Owner.",
    path: ["members"],
  });

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(2000).optional().nullable(),
  linkedRecordType: z.nativeEnum(LinkedRecordType).optional().nullable(),
  linkedRecordId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  version: z.number().int().optional(),
});

export const createStageSchema = z.object({
  name: z.string().min(1, "Stage name is required.").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  wipLimit: z.number().int().positive().optional().nullable(),
  isTerminal: z.boolean().optional(),
  isFollowUpStage: z.boolean().optional(),
});

export const updateStageSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  wipLimit: z.number().int().positive().optional().nullable(),
  isTerminal: z.boolean().optional(),
  isFollowUpStage: z.boolean().optional(),
});

export const reorderStagesSchema = z.object({
  orderedStageIds: z.array(z.string().uuid()).min(1),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["OWNER", "EDITOR", "VIEWER", "COMMENTER"]),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["OWNER", "EDITOR", "VIEWER", "COMMENTER"]),
});

export const bulkDeleteBoardsSchema = z.object({
  boardIds: z.array(z.string().uuid()).min(1, "Select at least one project."),
  confirmCascade: z.boolean().optional(),
});

export const bulkArchiveBoardsSchema = z.object({
  boardIds: z.array(z.string().uuid()).min(1, "Select at least one project."),
  archived: z.boolean(),
});

const isoDate = z.coerce.date();

export const updateProcurementSchema = z.object({
  vendorName: z.string().max(200).optional().nullable(),
  vendorContact: z.string().max(200).optional().nullable(),
  vendorAddress: z.string().max(500).optional().nullable(),
  poNumber: z.string().max(100).optional().nullable(),
  orderDate: isoDate.optional().nullable(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().nonnegative(),
        unitCost: z.number().nonnegative(),
      })
    )
    .optional()
    .nullable(),
  expectedDeliveryDate: isoDate.optional().nullable(),
  actualDeliveryDate: isoDate.optional().nullable(),
  status: z.enum(["PENDING", "ORDERED", "DELIVERED", "CANCELLED"]).optional(),
  notes: z.string().max(4000).optional().nullable(),
});
