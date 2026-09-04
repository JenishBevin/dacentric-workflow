import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword, isPasswordComplex, generateSecureToken, hashToken } from "../../lib/hash";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt";
import { Errors } from "../../common/errors";
import { env } from "../../lib/env";
import { getEmailAdapter } from "../../lib/email";
import { accountLockedEmail, passwordResetEmail } from "../../lib/email/templates";
import { writeAudit } from "../../common/audit";
import { AuditAction, AccountStatus, RoleCode } from "@dacentric/types";
import { v4 as uuid } from "uuid";
import { AuthedUser } from "../../middleware/authenticate";
import { getStorageAdapter, scanFile } from "../../lib/storage";
import path from "path";

const REFRESH_COOKIE_DAYS = env.jwtRefreshTtlDays;

export async function login(email: string, password: string, ctx: { ip?: string; userAgent?: string }) {
  const user = await prisma.user.findUnique({ where: { workEmail: email.toLowerCase() } });

  if (!user || !user.passwordHash) {
    // Do not reveal whether the email exists.
    throw Errors.unauthorized("Incorrect email or password.");
  }

  if (user.status === AccountStatus.DEACTIVATED) {
    throw Errors.forbidden("This account has been deactivated. Please contact your administrator.");
  }

  if (user.status === AccountStatus.LOCKED) {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw Errors.locked(`This account is locked. Try again in ${minutesLeft} minute(s).`);
    }
    // lockout window elapsed — allow the attempt to proceed and self-heal below
  }

  const validPassword = await verifyPassword(password, user.passwordHash);

  if (!validPassword) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= env.loginMaxAttempts;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        status: shouldLock ? AccountStatus.LOCKED : user.status,
        lockedUntil: shouldLock ? new Date(Date.now() + env.loginLockoutMinutes * 60000) : user.lockedUntil,
      },
    });
    await writeAudit({
      actor: null,
      action: AuditAction.LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      metadata: { email, attempts },
    });
    if (shouldLock) {
      getEmailAdapter()
        .send({ to: user.workEmail, ...accountLockedEmail(user.name, env.loginLockoutMinutes) })
        .catch(() => undefined);
      await writeAudit({ actor: null, action: AuditAction.LOCK, entityType: "User", entityId: user.id });
      throw Errors.locked(
        `Too many failed attempts. This account is locked for ${env.loginLockoutMinutes} minutes.`
      );
    }
    throw Errors.unauthorized("Incorrect email or password.");
  }

  // Successful login — reset failure counters, clear any lock.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      status: AccountStatus.ACTIVE,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });

  const sessionId = uuid();
  const refreshToken = signRefreshToken({ sub: user.id, sessionId });
  const session = await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: ctx.userAgent,
      ipAddress: ctx.ip,
      expiresAt: new Date(Date.now() + REFRESH_COOKIE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const accessToken = signAccessToken({ sub: user.id, sessionId: session.id });

  await writeAudit({ actor: null, action: AuditAction.LOGIN, entityType: "User", entityId: user.id, metadata: { email } });

  return { accessToken, refreshToken, sessionId: session.id, userId: user.id };
}

/**
 * Silent refresh, called by the frontend before/when the access token
 * expires so an active tab is never force-logged-out. The refresh token is
 * rotated on every use (old one becomes invalid the moment a new one is
 * issued) and the session's expiresAt slides forward, so a session that
 * stays active never hits its own idle ceiling — only real inactivity for
 * the full JWT_REFRESH_TTL_DAYS window ends it.
 */
export async function refresh(rawRefreshToken: string) {
  let payload: { sub: string; sessionId: string };
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw Errors.unauthorized("Your session has expired. Please sign in again.");
  }

  const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
  if (!session || session.revokedAt) throw Errors.unauthorized("Your session has ended. Please sign in again.");
  if (session.expiresAt.getTime() < Date.now()) throw Errors.unauthorized("Your session has expired. Please sign in again.");
  if (session.refreshTokenHash !== hashToken(rawRefreshToken)) {
    // Token reuse (already rotated away) — treat as compromised, revoke the session.
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    throw Errors.unauthorized("Your session has ended. Please sign in again.");
  }

  const newRefreshToken = signRefreshToken({ sub: payload.sub, sessionId: session.id });
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: hashToken(newRefreshToken),
      lastActiveAt: new Date(),
      expiresAt: new Date(Date.now() + REFRESH_COOKIE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const accessToken = signAccessToken({ sub: payload.sub, sessionId: session.id });
  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(sessionId: string) {
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined);
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { workEmail: email.toLowerCase() } });
  // Always behave the same way whether or not the account exists, so the
  // endpoint can't be used to enumerate registered emails.
  if (!user || user.status === AccountStatus.DEACTIVATED) return;

  const { raw, hash } = generateSecureToken();
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + env.passwordResetTtlHours * 60 * 60 * 1000),
    },
  });

  const resetUrl = `${env.webPublicUrl}/reset-password?token=${raw}`;
  await getEmailAdapter().send({ to: user.workEmail, ...passwordResetEmail(user.name, resetUrl) });
}

export async function resetPassword(rawToken: string, newPassword: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw Errors.badRequest("This password reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        status: AccountStatus.ACTIVE,
        lockedUntil: null,
      },
    }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Revoke all existing sessions on password change.
    prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

export async function activateAccount(rawToken: string, password: string) {
  const tokenHash = hashToken(rawToken);
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() < Date.now()) {
    throw Errors.badRequest("This invitation link is invalid or has expired. Ask your administrator to resend it.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: invitation.userId },
      data: { passwordHash, status: AccountStatus.ACTIVE },
    }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
  ]);

  await writeAudit({ actor: null, action: AuditAction.ACTIVATE, entityType: "User", entityId: invitation.userId });
}

// ---------------------------------------------------------------------------
// Self-service: my own profile — deliberately separate from
// modules/users/users.service.ts, which is admin-only (MANAGE_USERS). These
// operate on req.user.id directly, never a route param, so there's no way
// for a caller to touch anyone else's account through them.
// ---------------------------------------------------------------------------

export async function updateMyProfile(actor: AuthedUser, input: { name: string }) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  const user = await prisma.user.update({ where: { id: actor.id }, data: { name: input.name } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "User", entityId: actor.id, field: "name", beforeValue: before.name, afterValue: input.name });
  return user;
}

export async function changeMyPassword(actor: AuthedUser, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw Errors.unauthorized("Your current password is incorrect.");
  }
  if (!isPasswordComplex(newPassword)) {
    throw Errors.badRequest("New password must be 8+ characters with upper, lower, digit and symbol.");
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: actor.id }, data: { passwordHash } });
  // Sign every other session out (possible-compromise hygiene) but leave the
  // one making this request alone — changing your password shouldn't log
  // you out of the tab you just changed it from.
  await prisma.session.updateMany({
    where: { userId: actor.id, revokedAt: null, id: { not: actor.sessionId } },
    data: { revokedAt: new Date() },
  });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "User", entityId: actor.id, field: "password" });
}

/** Self-service email change — Super Admin only (everyone else is told to
 * contact their administrator). Route-level requireAnyRole(SUPER_ADMIN)
 * already blocks this for anyone else; the role check here is defense in
 * depth in case this service is ever called from another entry point. */
export async function changeMyEmail(actor: AuthedUser, newEmail: string, currentPassword: string) {
  if (!actor.roles.includes(RoleCode.SUPER_ADMIN)) {
    throw Errors.forbidden("Only a Super Admin can change their own work email here.");
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw Errors.unauthorized("Your current password is incorrect.");
  }
  const normalized = newEmail.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { workEmail: normalized } });
  if (existing && existing.id !== actor.id) {
    throw Errors.conflict("That email address is already in use by another account.");
  }
  await prisma.user.update({ where: { id: actor.id }, data: { workEmail: normalized } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "User", entityId: actor.id, field: "workEmail", beforeValue: user.workEmail, afterValue: normalized });
  return { workEmail: normalized };
}

const AVATAR_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const AVATAR_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadMyAvatar(actor: AuthedUser, file: Express.Multer.File) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!AVATAR_EXTENSIONS.includes(ext)) {
    throw Errors.badRequest("Profile pictures must be PNG, JPG, GIF, or WEBP.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw Errors.badRequest("Profile pictures must be 5 MB or smaller.");
  }
  const scanResult = await scanFile(file.buffer);
  if (scanResult !== "CLEAN") {
    throw Errors.badRequest("This file failed a security scan and was not uploaded.");
  }

  const storage = getStorageAdapter();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  const { storageKey } = await storage.save(file.originalname, file.buffer);

  await prisma.user.update({ where: { id: actor.id }, data: { avatarStorageKey: storageKey } });
  if (user.avatarStorageKey) {
    await storage.remove(user.avatarStorageKey).catch(() => undefined);
  }
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "User", entityId: actor.id, field: "avatar" });
  return { storageKey };
}

export async function removeMyAvatar(actor: AuthedUser) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!user.avatarStorageKey) return;
  await getStorageAdapter().remove(user.avatarStorageKey).catch(() => undefined);
  await prisma.user.update({ where: { id: actor.id }, data: { avatarStorageKey: null } });
  await writeAudit({ actor, action: AuditAction.EDIT, entityType: "User", entityId: actor.id, field: "avatar", afterValue: null });
}

export async function getMyAvatar(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.avatarStorageKey) throw Errors.notFound("Avatar");
  const buffer = await getStorageAdapter().read(user.avatarStorageKey);
  const ext = path.extname(user.avatarStorageKey).toLowerCase();
  return { buffer, mimeType: AVATAR_MIME_BY_EXT[ext] ?? "application/octet-stream" };
}
