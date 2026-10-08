import type { SessionKind } from "./types";
export interface Timer {
  id: string;
  owner_id: string;
  oppositionId?: string;
  kind: SessionKind;
  nodeIds: string[];
  taskId: string | null;
  startedAt: string;
  runningSince: number | null;
  accumulated: number;
  mode: "continuous" | "pomodoro";
  phase: "work" | "break";
  phaseAccumulated: number;
  workSeconds: number;
  breakSeconds: number;
}
export function timerElapsed(t: Timer, now = Date.now()): number {
  if (t.phase === "break") return t.accumulated;
  const delta =
    t.runningSince === null ? 0 : Math.max(0, (now - t.runningSince) / 1000);
  return (
    t.accumulated +
    (t.mode === "pomodoro"
      ? Math.min(delta, Math.max(0, t.workSeconds - t.phaseAccumulated))
      : delta)
  );
}
export function pauseTimer(t: Timer, now = Date.now()): Timer {
  const delta =
    t.runningSince === null ? 0 : Math.max(0, (now - t.runningSince) / 1000);
  return {
    ...t,
    accumulated: timerElapsed(t, now),
    phaseAccumulated:
      t.phaseAccumulated +
      (t.mode === "pomodoro"
        ? Math.min(
            delta,
            Math.max(
              0,
              (t.phase === "work" ? t.workSeconds : t.breakSeconds) -
                t.phaseAccumulated,
            ),
          )
        : delta),
    runningSince: null,
  };
}
export function resumeTimer(t: Timer, now = Date.now()): Timer {
  if (t.runningSince !== null) return t;
  return { ...t, runningSince: now };
}
export function nextPhase(t: Timer, now = Date.now()): Timer {
  const p = pauseTimer(t, now);
  return {
    ...p,
    phase: t.phase === "work" ? "break" : "work",
    phaseAccumulated: 0,
    runningSince: now,
  };
}
export function phaseRemaining(t: Timer, now = Date.now()): number {
  const delta =
    t.runningSince === null ? 0 : Math.max(0, (now - t.runningSince) / 1000);
  return Math.max(
    0,
    (t.phase === "work" ? t.workSeconds : t.breakSeconds) -
      t.phaseAccumulated -
      delta,
  );
}
