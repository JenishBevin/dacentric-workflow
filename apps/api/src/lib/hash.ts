import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Password complexity: 8+ chars, at least one upper, one lower, one digit, one symbol. */
export function isPasswordComplex(plain: string): boolean {
  if (plain.length < 8) return false;
  const hasUpper = /[A-Z]/.test(plain);
  const hasLower = /[a-z]/.test(plain);
  const hasDigit = /\d/.test(plain);
  const hasSymbol = /[^A-Za-z0-9]/.test(plain);
  return hasUpper && hasLower && hasDigit && hasSymbol;
}

/** Generates a URL-safe random token and returns both the raw value (sent to the
 * user, never stored) and its SHA-256 hash (stored, so a DB leak doesn't expose
 * usable tokens). */
export function generateSecureToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
