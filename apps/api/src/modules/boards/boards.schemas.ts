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
  version: z.number().int().optional(),
});

export const createStageSchema = z.object({
  name: z.string().min(1, "Stage name is required.").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  wipLimit: z.number().int().positive().optional().nullable(),
  isTerminal: z.boolean().optional(),
});

export const updateStageSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  wipLimit: z.number().int().positive().optional().nullable(),
  isTerminal: z.boolean().optional(),
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
