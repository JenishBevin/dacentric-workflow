import { env } from "../env";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface StoredFileHandle {
  storageKey: string;
}

export interface StorageAdapter {
  /** Persists a buffer and returns the opaque key used to retrieve it later. */
  save(originalName: string, buffer: Buffer): Promise<StoredFileHandle>;
  /** Returns a readable stream (local) or a signed/redirect URL (S3) for download. */
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

/** Development/self-hosted storage on local disk. */
class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  async save(originalName: string, buffer: Buffer): Promise<StoredFileHandle> {
    const ext = path.extname(originalName);
    const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(this.baseDir, key), buffer);
    return { storageKey: key };
  }

  async read(storageKey: string): Promise<Buffer> {
    return fs.readFileSync(path.join(this.baseDir, storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    const target = path.join(this.baseDir, storageKey);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

/**
 * S3-compatible adapter (AWS S3, MinIO, Cloudflare R2, ...). Not wired to a
 * live bucket in this build (no bucket/creds are provisioned in a demo
 * environment) but implements the exact same interface, so switching
 * STORAGE_PROVIDER=s3 with real credentials is a config change, not a
 * rewrite. Uses the AWS SDK v3 client lazily so it's not a hard dependency
 * for local development.
 */
class S3StorageAdapter implements StorageAdapter {
  private async client() {
    const { S3Client } = await import("@aws-sdk/client-s3" as string).catch(() => {
      throw new Error(
        "S3 storage selected but @aws-sdk/client-s3 is not installed. Run `npm install @aws-sdk/client-s3` in apps/api to enable it."
      );
    });
    return new S3Client({
      region: env.storage.s3.region,
      endpoint: env.storage.s3.endpoint || undefined,
      credentials: {
        accessKeyId: env.storage.s3.accessKeyId,
        secretAccessKey: env.storage.s3.secretAccessKey,
      },
    });
  }

  async save(originalName: string, buffer: Buffer): Promise<StoredFileHandle> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3" as string);
    const ext = path.extname(originalName);
    const key = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const client = await this.client();
    await client.send(
      new PutObjectCommand({ Bucket: env.storage.s3.bucket, Key: key, Body: buffer })
    );
    return { storageKey: key };
  }

  async read(storageKey: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3" as string);
    const client = await this.client();
    const res = await client.send(
      new GetObjectCommand({ Bucket: env.storage.s3.bucket, Key: storageKey })
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  async remove(storageKey: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3" as string);
    const client = await this.client();
    await client.send(
      new DeleteObjectCommand({ Bucket: env.storage.s3.bucket, Key: storageKey })
    );
  }
}

let adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (!adapter) {
    adapter =
      env.storageProvider === "s3"
        ? new S3StorageAdapter()
        : new LocalStorageAdapter(path.resolve(process.cwd(), env.storage.localDir));
  }
  return adapter;
}

/** Validates a file against the platform-wide size/type policy (Section 19/44). */
export function validateFile(originalName: string, sizeBytes: number): string | null {
  const ext = path.extname(originalName).toLowerCase();
  if (!env.storage.allowedExtensions.includes(ext)) {
    return `File type "${ext || "unknown"}" is not permitted.`;
  }
  const maxBytes = env.storage.maxFileSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    return `File exceeds the maximum size of ${env.storage.maxFileSizeMb} MB.`;
  }
  return null;
}

/**
 * Attachment "scan" abstraction (Section 19: "files are scanned before
 * storage"). In this build it is a synchronous stub that always clears the
 * file, but call sites treat the result as async and log the outcome, so a
 * real AV engine (ClamAV, a cloud scanning API) can be dropped in behind
 * this one function without touching the attachments module.
 */
export async function scanFile(_buffer: Buffer): Promise<"CLEAN" | "REJECTED"> {
  return "CLEAN";
}
