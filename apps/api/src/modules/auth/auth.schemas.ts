import { z } from "zod";
import { passwordSchema } from "../../common/passwordSchema";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid work email."),
  password: z.string().min(1, "Password is required."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid work email."),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const activateAccountSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});

export const updateMyProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
});

export const changeMyPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: passwordSchema,
});

export const changeMyEmailSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newEmail: z.string().email("Enter a valid work email."),
});
