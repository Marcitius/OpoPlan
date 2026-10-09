import type { PlanTask } from "./types";

/** Keeps planned days chronological and optional times in a stable order. */
export function comparePlanTasks(a: PlanTask, b: PlanTask): number {
  const day = a.scheduled_day.localeCompare(b.scheduled_day);
  if (day) return day;
  const at = a.scheduled_time?.slice(0, 5) || "99:99";
  const bt = b.scheduled_time?.slice(0, 5) || "99:99";
  return at.localeCompare(bt) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

export function planMinutes(tasks: PlanTask[]): number {
  return tasks.filter((t) => !t.is_backlog && t.status !== "cancelled").reduce((sum, t) => sum + t.estimated_minutes, 0);
}

/** Tasks without a scheduled day remain visible only in the Tareas inbox. */
export const isBacklogTask = (task: PlanTask) => !!task.is_backlog && task.status === "pending" && !task.deleted_at;
export const isScheduledTask = (task: PlanTask) => !task.is_backlog && !task.deleted_at;
