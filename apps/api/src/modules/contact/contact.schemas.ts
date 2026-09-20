import { z } from "zod";

export const submitContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  services: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  otherService: z.string().trim().max(200).optional(),
  message: z.string().trim().min(1).max(4000),
});
