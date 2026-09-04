import cron from "node-cron";
import { env } from "../lib/env";
import { processAllDueSeries } from "../modules/recurrence/recurrence.service";
import { runDueDateNotifications } from "./dueDateNotifier";

/**
 * Backend scheduled processing for recurring task instances (Section 23:
 * "Do not depend exclusively on a browser being open"). This runs inside
 * the API process for simplicity in this build; in a larger deployment it
 * would be its own worker process/container sharing the same database.
 */
export function startBackgroundJobs(): void {
  cron.schedule(env.recurrenceCron, async () => {
    try {
      const count = await processAllDueSeries();
      if (count > 0) {
        // eslint-disable-next-line no-console
        console.log(`[recurrence] generated ${count} recurring task instance(s).`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[recurrence] scheduler run failed:", err);
    }
  });

  // Once every 24h for due/overdue notifications.
  cron.schedule("0 6 * * *", async () => {
    try {
      await runDueDateNotifications();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[notifications] due-date job failed:", err);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`[jobs] Recurrence scheduler active (${env.recurrenceCron}); due-date notifier active (06:00 daily).`);
}
