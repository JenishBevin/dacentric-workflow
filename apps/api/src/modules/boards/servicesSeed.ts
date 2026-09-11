import { PrismaClient } from "@prisma/client";

export const SERVICE_CATALOG = ["MEP", "ELV", "IT", "Automation & Innovation", "Civil", "Fitout", "AMC", "Demolition", "Approvals"];

/**
 * Idempotently ensures the fixed company Service catalog exists, in this
 * exact order (`position` drives the "Projects" nav sort, not creation
 * order — re-running this after SERVICE_CATALOG is reordered fixes existing
 * rows too). Shared by prisma/seed.ts and the API test suite, same pattern
 * as rolesSeed.ts. Does not delete services removed from the list — that's
 * a deliberate one-off cleanup (see chat history), not a seed responsibility.
 */
export async function ensureServices(prisma: PrismaClient) {
  for (const [position, name] of SERVICE_CATALOG.entries()) {
    await prisma.service.upsert({ where: { name }, create: { name, position }, update: { position } });
  }
}
