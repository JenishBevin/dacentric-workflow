import { createApp } from "./app";
import { env } from "./lib/env";
import { startBackgroundJobs } from "./jobs/recurrenceScheduler";

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`DaCentric Workflow API listening on port ${env.port} (${env.nodeEnv})`);
  startBackgroundJobs();
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
