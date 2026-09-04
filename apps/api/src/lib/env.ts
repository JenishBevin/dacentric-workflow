import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: num("PORT", 4000),
  apiPublicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:4000",
  webPublicUrl: process.env.WEB_PUBLIC_URL ?? "http://localhost:5173",

  jwtAccessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
  jwtAccessTtlMin: num("JWT_ACCESS_TTL_MIN", 30),
  jwtRefreshTtlDays: num("JWT_REFRESH_TTL_DAYS", 7),
  sessionIdleTimeoutMin: num("SESSION_IDLE_TIMEOUT_MIN", 30),

  invitationTtlHours: num("INVITATION_TTL_HOURS", 72),
  passwordResetTtlHours: num("PASSWORD_RESET_TTL_HOURS", 2),

  loginMaxAttempts: num("LOGIN_MAX_ATTEMPTS", 5),
  loginLockoutMinutes: num("LOGIN_LOCKOUT_MINUTES", 15),

  emailProvider: (process.env.EMAIL_PROVIDER ?? "console") as "console" | "smtp" | "both",
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: num("SMTP_PORT", 587),
    user: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASSWORD ?? "",
    from: process.env.SMTP_FROM ?? "DaCentric Platform <no-reply@dacentric.example>",
  },

  storageProvider: (process.env.STORAGE_PROVIDER ?? "local") as "local" | "s3",
  storage: {
    localDir: process.env.STORAGE_LOCAL_DIR ?? "./uploads",
    maxFileSizeMb: num("STORAGE_MAX_FILE_SIZE_MB", 25),
    allowedExtensions: (process.env.STORAGE_ALLOWED_EXTENSIONS ??
      ".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.ppt,.pptx"
    ).split(",").map((s) => s.trim().toLowerCase()),
    s3: {
      bucket: process.env.S3_BUCKET ?? "",
      region: process.env.S3_REGION ?? "",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      endpoint: process.env.S3_ENDPOINT ?? "",
    },
  },

  recurrenceCron: process.env.RECURRENCE_CRON ?? "*/15 * * * *",
};
