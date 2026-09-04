import { z } from "zod";

/** Shared password complexity rule — used everywhere a raw password is
 * accepted (login/activation, self-service change, and admin-set-directly
 * at user creation), so the requirement never drifts between them. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/\d/, "Password must contain a number.")
  .regex(/[^A-Za-z0-9]/, "Password must contain a symbol.");
