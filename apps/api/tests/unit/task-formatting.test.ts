import { computeDueDateStatus } from "../../src/modules/tasks/task-formatting";
import { formatTaskId } from "@dacentric/types";
import { DueDateStatus } from "@dacentric/types";

describe("Due-date badge logic (Section 12: red/amber/green/grey)", () => {
  it("returns NO_DUE_DATE (grey) when there is no due date", () => {
    expect(computeDueDateStatus(null, false)).toBe(DueDateStatus.NO_DUE_DATE);
  });

  it("returns OVERDUE (red) for a past due date on an incomplete task", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(computeDueDateStatus(past, false)).toBe(DueDateStatus.OVERDUE);
  });

  it("returns DUE_SOON (amber) within the 48-hour window", () => {
    const soon = new Date(Date.now() + 20 * 60 * 60 * 1000);
    expect(computeDueDateStatus(soon, false)).toBe(DueDateStatus.DUE_SOON);
  });

  it("returns ON_TRACK (green) beyond 48 hours out", () => {
    const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    expect(computeDueDateStatus(later, false)).toBe(DueDateStatus.ON_TRACK);
  });

  it("treats a completed task as on-track even if its due date has passed", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(computeDueDateStatus(past, true)).toBe(DueDateStatus.ON_TRACK);
  });
});

describe("Task ID formatting (Section 14: WF-000001, sequential, immutable)", () => {
  it("pads to six digits with the WF- prefix", () => {
    expect(formatTaskId(1)).toBe("WF-000001");
    expect(formatTaskId(123456)).toBe("WF-123456");
  });
});
