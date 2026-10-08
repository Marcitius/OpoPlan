import { describe, expect, it } from "vitest";
import type { PlanTask } from "../src/core/types";
import { dayPlanSummary, weekStartISO } from "../src/core/todayOverview";

const task = (id: string, day: string, status: PlanTask["status"], minutes: number): PlanTask => ({
  id, owner_id: "owner", created_at: "2026-10-08T10:00:00Z", updated_at: "2026-10-08T10:00:00Z", version: 0, deleted_at: null,
  opposition_id: "opposition", name: id, kind: "study", node_id: null, category_id: null,
  scheduled_day: day, original_day: day, estimated_minutes: minutes,
  status, notes: "", completed_session_id: null,
});

describe("compact daily plan", () => {
  it("begins week on Monday, including month/year boundaries", () => {
    expect(weekStartISO("2026-10-08")).toBe("2026-10-05");
    expect(weekStartISO("2026-01-01")).toBe("2025-12-29");
    expect(weekStartISO("2026-10-11")).toBe("2026-10-05");
  });
  it("does not treat planned time as actual study time", () => {
    const result = dayPlanSummary([
      task("a", "2026-10-09", "pending", 40),
      task("b", "2026-10-09", "completed", 20),
      task("c", "2026-10-09", "cancelled", 120),
      task("d", "2026-10-10", "pending", 50),
    ], "2026-10-09");
    expect(result.activities.map(x => x.id)).toEqual(["a", "b"]);
    expect(result.pending).toHaveLength(1);
    expect(result.completed).toHaveLength(1);
    expect(result.plannedMinutes).toBe(60);
  });
});
