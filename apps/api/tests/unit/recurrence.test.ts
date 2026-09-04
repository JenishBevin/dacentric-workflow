import { computeNextRunAt } from "../../src/modules/recurrence/recurrence.service";
import { RecurrenceFrequency } from "@dacentric/types";

describe("Recurrence scheduling math (Section 23 / UC-17)", () => {
  const base = new Date("2026-01-15T09:00:00.000Z");

  it("advances one day for DAILY", () => {
    const next = computeNextRunAt(base, RecurrenceFrequency.DAILY);
    expect(next.toISOString()).toBe("2026-01-16T09:00:00.000Z");
  });

  it("advances seven days for WEEKLY", () => {
    const next = computeNextRunAt(base, RecurrenceFrequency.WEEKLY);
    expect(next.toISOString()).toBe("2026-01-22T09:00:00.000Z");
  });

  it("advances one calendar month for MONTHLY", () => {
    const next = computeNextRunAt(base, RecurrenceFrequency.MONTHLY);
    expect(next.toISOString()).toBe("2026-02-15T09:00:00.000Z");
  });

  it("uses the custom interval in days for CUSTOM", () => {
    const next = computeNextRunAt(base, RecurrenceFrequency.CUSTOM, 10);
    expect(next.toISOString()).toBe("2026-01-25T09:00:00.000Z");
  });
});
