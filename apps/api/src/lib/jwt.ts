import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "./env";

export interface AccessTokenPayload {
  sub: string; // user id
  sessionId: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: `${env.jwtAccessTtlMin}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export interface RefreshTokenPayload {
  sub: string; // user id
  sessionId: string;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  // jsonwebtoken truncates `iat` to whole seconds, so two tokens signed with
  // an identical payload in the same second would otherwise be byte-for-byte
  // equal — a jti guarantees each rotation is a genuinely distinct token, so
  // reuse detection can't be fooled by same-second timing.
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, env.jwtRefreshSecret, {
    expiresIn: `${env.jwtRefreshTtlDays}d`,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwtRefreshSecret) as RefreshTokenPayload;
}
