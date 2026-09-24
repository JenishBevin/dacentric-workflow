import { prisma } from "../../lib/prisma";
import { AuthedUser } from "../../middleware/authenticate";

export async function listChecklistTemplates() {
  return prisma.checklistTemplate.findMany({ orderBy: { name: "asc" } });
}

export async function createChecklistTemplate(name: string, items: string[], actor: AuthedUser) {
  return prisma.checklistTemplate.create({
    data: { name, items, createdById: actor.id },
  });
}
