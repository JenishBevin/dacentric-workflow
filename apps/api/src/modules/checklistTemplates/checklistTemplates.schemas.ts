import { z } from "zod";

export const createChecklistTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required.").max(150),
  items: z.array(z.string().min(1)).min(1, "Add at least one checklist item first."),
});
