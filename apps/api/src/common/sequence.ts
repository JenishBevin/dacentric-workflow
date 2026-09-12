import { prisma } from "../lib/prisma";

/**
 * Backs every "QPTS-..." year-scoped id (Project, Estimation, Enquiry): one
 * row per (key, year), upserted-with-increment so it resets to 1 at the
 * start of each calendar year rather than growing forever. The upsert's
 * increment is a single atomic statement, so this is safe under concurrent
 * callers even outside an enclosing transaction — pass `tx` (a transaction
 * client) when called from inside one, or omit it to use the default client.
 */
export async function nextYearlySequence(key: string, year: number, tx: { yearlySequence: typeof prisma.yearlySequence } = prisma): Promise<number> {
  const row = await tx.yearlySequence.upsert({
    where: { key_year: { key, year } },
    create: { key, year, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}
