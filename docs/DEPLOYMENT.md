# Deployment

This covers taking the Docker Compose setup from local development to a real production host. It assumes a single-host deployment (one VM/instance running all three containers); for a multi-instance setup, replace the Postgres container with a managed database and put the `api`/`web` images behind your usual load balancer / orchestrator.

## 1. Build the images

```bash
docker-compose build
```

This builds `apps/api/Dockerfile` (multi-stage: `npm ci` → `prisma generate` → `esbuild` bundle → slim runtime image) and `apps/web/Dockerfile` (multi-stage: `npm ci` → `vite build` → static files served by nginx, per `apps/web/nginx.conf`).

## 2. Configure environment for production

Copy `.env.example` to `.env` and change **every** value marked `change-me`, plus:

- `NODE_ENV=production`
- `DATABASE_URL` — point at your production Postgres instance (managed service recommended: RDS, Cloud SQL, etc.)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — generate real secrets: `openssl rand -hex 32`
- `API_PUBLIC_URL`, `WEB_PUBLIC_URL` — your real domains (used in email links and CORS)
- `EMAIL_PROVIDER=smtp` plus `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM` — the console adapter is dev-only
- `STORAGE_PROVIDER=s3` plus `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_ENDPOINT` — local disk storage does not survive container replacement or scale past one instance
- `VITE_API_BASE_URL` — baked into the frontend build (passed as a Docker build arg in `docker-compose.yml`), so it must be set **before** building the `web` image, not just at runtime

Never commit the resulting `.env` file.

## 3. Database migrations

The `api` container's entrypoint already runs `npx prisma migrate deploy` before starting the server (see `apps/api/Dockerfile`'s `CMD`), so migrations apply automatically on every container start — nothing extra to run for a normal deploy. `prisma migrate deploy` only applies already-committed migrations; it never generates new ones, which is the correct, non-interactive behavior for production (as opposed to `prisma migrate dev`, which is local-development-only and must never run against a production database).

If you'd rather run migrations as an explicit, separate release step (e.g. in a CI/CD pipeline, before traffic is routed to new containers), run the same command manually and skip relying on the container's automatic step:

```bash
DATABASE_URL="<prod-url>" npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
```

Seed data (`npm run prisma:seed` inside the `api` container) is meant for demos and development. Do not run it against a real production database unless you specifically want the sample users/boards/tasks it creates.

## 4. Start the stack

```bash
docker-compose up -d
```

Put a reverse proxy (nginx, Caddy, or your cloud load balancer) in front of both the `web` and `api` containers to terminate TLS — neither container handles HTTPS itself. Route:

- `your-domain.com/` → `web:80`
- `your-domain.com/api/` → `api:4000`

(or serve the API on a separate subdomain and set `VITE_API_BASE_URL` accordingly).

## 5. Background jobs

The recurrence-generation and due-date-notification jobs run inside the `api` process itself via `node-cron` (see `apps/api/src/jobs/`) — no separate worker process or queue to deploy. This means they only run while the `api` container is up; if you scale `api` to multiple replicas, either designate a single "jobs" replica or move the cron logic to a separate scheduled task/lambda to avoid duplicate job runs.

## 6. File storage volume (local storage mode only)

If you stay on `STORAGE_PROVIDER=local` in production (not recommended beyond a single-instance deployment), the `dacentric_uploads` Docker volume defined in `docker-compose.yml` must be backed up like a database — it holds every task attachment. Switching to `STORAGE_PROVIDER=s3` removes this concern entirely and is the recommended path for anything beyond a demo/single-host deployment.

## 7. Health checks

- API: `GET /api/dashboard` (authenticated) or add a dedicated `/healthz` route if your orchestrator needs an unauthenticated check.
- Web: nginx serves static files; any 200 on `/` is sufficient.
- Postgres: `docker-compose.yml` already defines a `pg_isready` healthcheck.

## 8. What this deployment does *not* include

- No CDN configuration for the frontend's static assets — add one in front of the `web` container if you expect meaningful traffic.
- No log aggregation — `morgan` logs to stdout in development only (`NODE_ENV !== "production"`); wire stdout/stderr from both containers into your platform's log collector.
- No automated database backup/restore tooling — use your database provider's native backup mechanism.
- No CI/CD pipeline definition — this repo contains the application only, not deployment automation.
