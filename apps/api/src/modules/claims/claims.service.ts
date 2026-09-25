import { prisma } from "../../lib/prisma";
import { Errors } from "../../common/errors";
import { AuthedUser } from "../../middleware/authenticate";
import { isSystemLevelAdmin } from "../../common/permissions";
import { getStorageAdapter, validateFile, scanFile } from "../../lib/storage";
import { formatClaimId, RoleCode } from "@dacentric/types";

const FINANCE_TIER = [RoleCode.ESTIMATION]; // labeled "Admin and Finance" in the UI — see rolesSeed.ts
const MANAGEMENT_TIER = [RoleCode.MANAGEMENT];
const ACCOUNTS_TIER = [RoleCode.ACCOUNTS];

function isFinanceTier(actor: AuthedUser) {
  return isSystemLevelAdmin(actor.roles) || actor.roles.some((r) => FINANCE_TIER.includes(r));
}
function isManagementTier(actor: AuthedUser) {
  return isSystemLevelAdmin(actor.roles) || actor.roles.some((r) => MANAGEMENT_TIER.includes(r));
}
function isAccountsTier(actor: AuthedUser) {
  return isSystemLevelAdmin(actor.roles) || actor.roles.some((r) => ACCOUNTS_TIER.includes(r));
}

const CLAIM_INCLUDE = {
  employee: { select: { id: true, fullName: true } },
  attachments: true,
};

export async function submitClaim(
  actor: AuthedUser,
  input: { amount: number; reason: string; expenseDate: Date; files: Express.Multer.File[] }
) {
  if (!actor.employeeId) {
    throw Errors.badRequest("Your account isn't linked to an employee record, so it can't submit a claim. Ask your administrator to link one.");
  }
  if (!input.amount || input.amount <= 0) throw Errors.badRequest("Enter a claim amount greater than zero.");
  if (!input.reason.trim()) throw Errors.badRequest("A reason is required.");
  if (!input.files?.length) throw Errors.badRequest("Attach at least one photo or scan of the bill as proof.");

  const attachmentsData: Array<{ fileName: string; storageKey: string; mimeType: string; fileSizeBytes: number }> = [];
  for (const file of input.files) {
    const validationError = validateFile(file.originalname, file.size);
    if (validationError) throw Errors.validation(validationError, { file: validationError });
    const scanResult = await scanFile(file.buffer);
    if (scanResult === "REJECTED") throw Errors.validation(`"${file.originalname}" failed the security scan and was not stored.`);
    const { storageKey } = await getStorageAdapter().save(file.originalname, file.buffer);
    attachmentsData.push({ fileName: file.originalname, storageKey, mimeType: file.mimetype, fileSizeBytes: file.size });
  }

  return prisma.$transaction(async (tx) => {
    const placeholderId = `TEMP-${Date.now()}-${Math.random()}`;
    const created = await tx.expenseClaim.create({
      data: {
        claimId: placeholderId,
        employeeId: actor.employeeId!,
        amount: input.amount,
        reason: input.reason.trim(),
        expenseDate: input.expenseDate,
        attachments: { create: attachmentsData },
      },
      include: CLAIM_INCLUDE,
    });
    return tx.expenseClaim.update({
      where: { id: created.id },
      data: { claimId: formatClaimId(created.claimNumber) },
      include: CLAIM_INCLUDE,
    });
  });
}

export async function listMyClaims(actor: AuthedUser) {
  if (!actor.employeeId) return [];
  return prisma.expenseClaim.findMany({
    where: { employeeId: actor.employeeId },
    include: CLAIM_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/** Header search-box lookup for a Claim ID (CLM-000001) — same visibility
 *  rule as everywhere else: your own claims, plus every claim if you're an
 *  approver (Management/Accounts/Admin). Never leaks another employee's
 *  claim to a viewer who couldn't otherwise see it. */
export async function lookupClaimByClaimId(claimId: string, actor: AuthedUser) {
  const claim = await prisma.expenseClaim.findFirst({
    where: { claimId: { equals: claimId, mode: "insensitive" } },
    select: { id: true, claimId: true, status: true, employeeId: true },
  });
  if (!claim) return null;

  const isOwner = actor.employeeId && claim.employeeId === actor.employeeId;
  if (!isOwner && !isFinanceTier(actor) && !isManagementTier(actor) && !isAccountsTier(actor)) return null;

  return claim;
}

/** Scoped to what this viewer can actually act on: Admin and Finance only
 *  sees PENDING_VERIFICATION (stage 1); Management only sees PENDING (stage
 *  2); Accounts only sees MANAGEMENT_APPROVED (stage 3) — a claim shouldn't
 *  show up at a later stage until the one before it has cleared. Admins can
 *  act at any stage, so they see all three. */
export async function listActionableClaims(actor: AuthedUser) {
  const statuses: Array<"PENDING_VERIFICATION" | "PENDING" | "MANAGEMENT_APPROVED"> = [];
  if (isFinanceTier(actor)) statuses.push("PENDING_VERIFICATION");
  if (isManagementTier(actor)) statuses.push("PENDING");
  if (isAccountsTier(actor)) statuses.push("MANAGEMENT_APPROVED");
  if (statuses.length === 0) return [];

  return prisma.expenseClaim.findMany({
    where: { status: { in: statuses } },
    include: CLAIM_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/** Settlement history — every claim Accounts has marked Settled, for the
 *  same viewers who can act on claims (Management/Accounts/Admin). Kept
 *  separate from listActionableClaims so a growing history never crowds out
 *  the pending queue. */
export async function listSettledClaims(actor: AuthedUser, filters: { dateFrom?: Date; dateTo?: Date }) {
  if (!isFinanceTier(actor) && !isManagementTier(actor) && !isAccountsTier(actor)) return [];

  return prisma.expenseClaim.findMany({
    where: {
      status: "SETTLED",
      settledAt: { gte: filters.dateFrom, lte: filters.dateTo },
    },
    include: {
      ...CLAIM_INCLUDE,
      verifiedBy: { select: { id: true, name: true } },
      managementDecidedBy: { select: { id: true, name: true } },
      settledBy: { select: { id: true, name: true } },
    },
    orderBy: { settledAt: "desc" },
  });
}

/** Stage 1: Admin and Finance verifies a freshly submitted claim before it
 *  reaches Management. Verifying moves it to PENDING (the pre-existing
 *  "awaiting Management" status, unchanged) so Management's own gate below
 *  needs no changes. */
export async function verifyClaim(claimId: string, decision: "APPROVED" | "REJECTED", reason: string | undefined, actor: AuthedUser) {
  if (!isFinanceTier(actor)) throw Errors.forbidden("Only Admin and Finance or an Administrator can verify this claim.");

  const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw Errors.notFound("Claim");
  if (claim.status !== "PENDING_VERIFICATION") throw Errors.conflict("This claim has already been verified.");
  if (decision === "REJECTED" && !reason?.trim()) throw Errors.badRequest("A reason is required to reject a claim.");

  return prisma.expenseClaim.update({
    where: { id: claimId },
    data: {
      status: decision === "APPROVED" ? "PENDING" : "REJECTED",
      verifiedById: actor.id,
      verifiedAt: new Date(),
      rejectReason: decision === "REJECTED" ? reason!.trim() : null,
    },
    include: CLAIM_INCLUDE,
  });
}

export async function decideClaim(claimId: string, decision: "APPROVED" | "REJECTED", reason: string | undefined, actor: AuthedUser) {
  if (!isManagementTier(actor)) throw Errors.forbidden("Only Management or an Administrator can decide this claim.");

  const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw Errors.notFound("Claim");
  if (claim.status !== "PENDING") throw Errors.conflict("This claim has already been decided.");
  if (decision === "REJECTED" && !reason?.trim()) throw Errors.badRequest("A reason is required to reject a claim.");

  return prisma.expenseClaim.update({
    where: { id: claimId },
    data: {
      status: decision === "APPROVED" ? "MANAGEMENT_APPROVED" : "REJECTED",
      managementDecidedById: actor.id,
      managementDecidedAt: new Date(),
      rejectReason: decision === "REJECTED" ? reason!.trim() : null,
    },
    include: CLAIM_INCLUDE,
  });
}

/** Accounts' stage is a settlement record, not a second approval gate — no
 *  reject path here; a settlement issue gets handled outside the system. */
export async function settleClaim(claimId: string, actor: AuthedUser) {
  if (!isAccountsTier(actor)) throw Errors.forbidden("Only Accounts or an Administrator can settle this claim.");

  const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw Errors.notFound("Claim");
  if (claim.status !== "MANAGEMENT_APPROVED") throw Errors.conflict("This claim isn't ready to be settled yet.");

  return prisma.expenseClaim.update({
    where: { id: claimId },
    data: { status: "SETTLED", settledById: actor.id, settledAt: new Date() },
    include: CLAIM_INCLUDE,
  });
}

export async function downloadClaimAttachment(attachmentId: string, actor: AuthedUser) {
  const attachment = await prisma.claimAttachment.findUniqueOrThrow({
    where: { id: attachmentId },
    include: { claim: true },
  });
  const isOwner = actor.employeeId && attachment.claim.employeeId === actor.employeeId;
  if (!isOwner && !isFinanceTier(actor) && !isManagementTier(actor) && !isAccountsTier(actor)) {
    throw Errors.forbidden("You do not have permission to view this file.");
  }
  const buffer = await getStorageAdapter().read(attachment.storageKey);
  return { attachment, buffer };
}
