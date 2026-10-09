import type { PlanTask } from "./types";
import { planMinutes } from "./planner";

/** ISO Monday of the week containing date (UTC avoids locale/DST shifts). */
export function weekStartISO(date: string): string {
  const current = new Date(`${date}T12:00:00Z`);
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  current.setUTCDate(current.getUTCDate() - mondayOffset);
  return current.toISOString().slice(0, 10);
}

/** Planned activities are separate from actual sessions and spaced reviews. */
export function dayPlanSummary(tasks: PlanTask[], day: string) {
  const activities = tasks.filter(t => !t.is_backlog && t.scheduled_day === day && t.status !== "cancelled");
  return {
    activities,
    pending: activities.filter(t => t.status === "pending"),
    completed: activities.filter(t => t.status === "completed"),
    plannedMinutes: planMinutes(activities),
  };
}
