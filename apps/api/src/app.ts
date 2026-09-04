import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env } from "./lib/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { rolesRouter } from "./modules/roles/roles.routes";
import { boardsRouter } from "./modules/boards/boards.routes";
import { tasksRouter } from "./modules/tasks/tasks.routes";
import { tagsRouter } from "./modules/tags/tags.routes";
import { myTasksRouter } from "./modules/myTasks/myTasks.routes";
import { teamWorkloadRouter } from "./modules/teamWorkload/teamWorkload.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { exportsRouter } from "./modules/exports/exports.routes";
import { crmRouter } from "./modules/integrations/crm.routes";
import { hrmsRouter } from "./modules/integrations/hrms.routes";
import { workTimeRouter } from "./modules/workTime/workTime.routes";
import { ticketsRouter } from "./modules/tickets/tickets.routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.webPublicUrl,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  if (!env.isProd) app.use(morgan("dev"));

  const globalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use("/api", globalLimiter);

  app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/roles", rolesRouter);
  app.use("/api/boards", boardsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/my-tasks", myTasksRouter);
  app.use("/api/team-workload", teamWorkloadRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/exports", exportsRouter);
  app.use("/api/integrations/crm", crmRouter);
  app.use("/api/integrations/erp", crmRouter); // same LinkedRecord abstraction; see linkedRecords.service.ts
  app.use("/api/integrations/hrms", hrmsRouter);
  app.use("/api/work-time", workTimeRouter);
  app.use("/api/tickets", ticketsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
