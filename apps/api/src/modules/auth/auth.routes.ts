import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { asyncHandler, ok } from "../../common/http";
import { validate } from "../../common/validate";
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  activateAccountSchema,
  updateMyProfileSchema,
  changeMyPasswordSchema,
  changeMyEmailSchema,
} from "./auth.schemas";
import * as authService from "./auth.service";
import { authenticate } from "../../middleware/authenticate";
import { requireAnyRole } from "../../middleware/authorize";
import { prisma } from "../../lib/prisma";
import { env } from "../../lib/env";
import { Errors } from "../../common/errors";
import { RoleCode } from "@dacentric/types";

const uploadAvatar = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many login attempts. Please slow down." } },
});

function setAuthCookie(res: import("express").Response, token: string) {
  res.cookie("accessToken", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: env.jwtAccessTtlMin * 60 * 1000,
  });
}

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/auth";

function setRefreshCookie(res: import("express").Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.jwtRefreshTtlDays * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: import("express").Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

authRouter.post(
  "/login",
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = (req as any).validatedBody;
    const result = await authService.login(email, password, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    setAuthCookie(res, result.accessToken);
    setRefreshCookie(res, result.refreshToken);
    return ok(res, { accessToken: result.accessToken });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res, next) => {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawRefreshToken) return next(Errors.unauthorized("Your session has expired. Please sign in again."));

    const result = await authService.refresh(rawRefreshToken);
    setAuthCookie(res, result.accessToken);
    setRefreshCookie(res, result.refreshToken);
    return ok(res, { accessToken: result.accessToken });
  })
);

authRouter.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.sessionId);
    res.clearCookie("accessToken");
    clearRefreshCookie(res);
    return ok(res, { success: true });
  })
);

authRouter.post(
  "/forgot-password",
  loginLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await authService.requestPasswordReset((req as any).validatedBody.email);
    // Always a generic success response — never reveals account existence.
    return ok(res, { message: "If that email is registered, a reset link has been sent." });
  })
);

authRouter.post(
  "/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = (req as any).validatedBody;
    await authService.resetPassword(token, password);
    return ok(res, { message: "Your password has been reset. You can now sign in." });
  })
);

authRouter.post(
  "/activate",
  validate(activateAccountSchema),
  asyncHandler(async (req, res) => {
    const { token, password } = (req as any).validatedBody;
    await authService.activateAccount(token, password);
    return ok(res, { message: "Your account is now active. You can sign in." });
  })
);

authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { employee: true },
    });
    return ok(res, {
      id: req.user!.id,
      name: req.user!.name,
      workEmail: req.user!.workEmail,
      roles: req.user!.roles,
      moduleAccess: req.user!.moduleAccess,
      permissions: req.user!.permissions,
      employee: user?.employee ?? null,
      hasAvatar: !!user?.avatarStorageKey,
    });
  })
);

authRouter.patch(
  "/me",
  authenticate,
  validate(updateMyProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await authService.updateMyProfile(req.user!, (req as any).validatedBody);
    return ok(res, { id: user.id, name: user.name });
  })
);

authRouter.post(
  "/me/password",
  authenticate,
  validate(changeMyPasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = (req as any).validatedBody;
    await authService.changeMyPassword(req.user!, currentPassword, newPassword);
    return ok(res, { message: "Password changed." });
  })
);

authRouter.patch(
  "/me/email",
  authenticate,
  requireAnyRole(RoleCode.SUPER_ADMIN),
  validate(changeMyEmailSchema),
  asyncHandler(async (req, res) => {
    const { newEmail, currentPassword } = (req as any).validatedBody;
    const result = await authService.changeMyEmail(req.user!, newEmail, currentPassword);
    return ok(res, result);
  })
);

authRouter.post(
  "/me/avatar",
  authenticate,
  uploadAvatar.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw Errors.badRequest("No file was uploaded.");
    await authService.uploadMyAvatar(req.user!, req.file);
    return ok(res, { message: "Profile picture updated." });
  })
);

authRouter.delete(
  "/me/avatar",
  authenticate,
  asyncHandler(async (req, res) => {
    await authService.removeMyAvatar(req.user!);
    return ok(res, { message: "Profile picture removed." });
  })
);

authRouter.get(
  "/me/avatar",
  authenticate,
  asyncHandler(async (req, res) => {
    const { buffer, mimeType } = await authService.getMyAvatar(req.user!.id);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=60");
    // Helmet's default Cross-Origin-Resource-Policy is "same-origin", which
    // blocks this from loading as a plain <img src> from the web app's own
    // origin (a different port = a different origin, even in dev). This is
    // the one route in the app meant to be embedded that way.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(buffer);
  })
);
