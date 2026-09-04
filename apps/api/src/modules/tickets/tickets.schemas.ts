import { z } from "zod";
import { TaskPriority, TicketStatus } from "@dacentric/types";

export const createTicketSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().min(1, "Description is required.").max(5000),
  priority: z.nativeEnum(TaskPriority).optional(),
});

export const updateTicketStatusSchema = z.object({
  status: z.nativeEnum(TicketStatus),
  resolutionNote: z.string().trim().max(2000).optional(),
});
