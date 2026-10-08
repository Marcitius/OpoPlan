import type { MemoryEvent, Rating, Rules } from "./types";
import { DEFAULT_RULES } from "./types";
import { addDays, daysBetween } from "./dates";
export interface MemoryState {
  studied: boolean;
  passes: number;
  reviews: number;
  repetitions: number;
  ease: number;
  interval: number;
  due: string | null;
  automaticDue: string | null;
  manual: boolean;
  enabled: boolean;
  rating: Rating | null;
  lastDay: string | null;
  reason: string;
  difficulties: number;
}
export const freshMemory = (): MemoryState => ({
  studied: false,
  passes: 0,
  reviews: 0,
  repetitions: 0,
  ease: 2.5,
  interval: 0,
  due: null,
  automaticDue: null,
  manual: false,
  enabled: true,
  rating: null,
  lastDay: null,
  reason: "Completa el estudio inicial para programar el primer repaso.",
  difficulties: 0,
});
export function nextInterval(
  state: MemoryState,
  rating: Rating,
  rules: Rules = DEFAULT_RULES,
) {
  const q = rating === "mal" ? 1 : rating === "regular" ? 3 : 5;
  const ease = Math.max(
    1.3,
    Math.round((state.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)) * 100) /
      100,
  );
  let repetitions = state.repetitions;
  let interval: number;
  if (q < 3) {
    repetitions = 0;
    interval = rules.firstDays;
  } else {
    repetitions++;
    interval =
      rating === "regular"
        ? Math.max(
            rules.firstDays,
            Math.round(Math.max(1, state.interval) * rules.regularMultiplier),
          )
        : repetitions === 1
          ? rules.firstDays
          : repetitions === 2
            ? rules.secondDays
            : Math.round(state.interval * ease);
  }
  return {
    ease,
    repetitions,
    interval: Math.min(rules.maxDays, Math.max(1, interval)),
  };
}
export function effectiveEvents(events: MemoryEvent[]): MemoryEvent[] {
  const active = events.filter((e) => !e.deleted_at).sort(compare);
  const originals = active.filter(
    (e) => !["correction", "void"].includes(e.kind),
  );
  const modifications = new Map<string, MemoryEvent>();
  for (const e of active) {
    if (e.target_event_id && ["correction", "void"].includes(e.kind))
      modifications.set(e.target_event_id, e);
  }
  return originals
    .filter((e) => modifications.get(e.id)?.kind !== "void")
    .map((e) => {
      const c = modifications.get(e.id);
      return c ? { ...e, rating: c.rating, notes: c.notes } : e;
    });
}
function compare(a: MemoryEvent, b: MemoryEvent) {
  return a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id);
}
export function replayMemory(events: MemoryEvent[]): MemoryState {
  let s = freshMemory();
  const effective = effectiveEvents(events);
  const reviewByDay = new Map<string, MemoryEvent>();
  for (const e of effective)
    if (e.kind === "review") reviewByDay.set(e.study_day, e);
  for (const e of effective) {
    const r = e.rules ?? DEFAULT_RULES;
    switch (e.kind) {
      case "study":
        if (!s.studied) {
          s = {
            ...s,
            studied: true,
            passes: 1 + s.reviews,
            lastDay: e.study_day,
            interval: r.firstDays,
            due: addDays(e.study_day, r.firstDays),
            automaticDue: addDays(e.study_day, r.firstDays),
            manual: false,
            reason: `Estudio inicial completado · primer repaso en ${r.firstDays} día(s).`,
          };
        }
        break;
      case "review":
        if (reviewByDay.get(e.study_day)?.id !== e.id || !e.rating) break;
        {
          const n = nextInterval(s, e.rating, r);
          s = {
            ...s,
            ...n,
            reviews: s.reviews + 1,
            passes: s.studied ? s.reviews + 2 : 0,
            rating: e.rating,
            lastDay: e.study_day,
            manual: false,
            due: addDays(e.study_day, n.interval),
            automaticDue: addDays(e.study_day, n.interval),
            difficulties: s.difficulties + (e.rating === "mal" ? 1 : 0),
            reason: `${e.rating.toUpperCase()} (SM-2: ${e.rating === "mal" ? 1 : e.rating === "regular" ? 3 : 5}/5) · intervalo ${n.interval} día(s) · facilidad ${n.ease.toFixed(2)}.`,
          };
        }
        break;
      case "reschedule":
        s = {
          ...s,
          due: e.manual_due,
          manual: true,
          reason: `Fecha elegida manualmente${e.notes ? ": " + e.notes : ""}. Fecha automática: ${s.automaticDue ?? "sin programar"}.`,
        };
        break;
      case "reset":
        s = {
          ...freshMemory(),
          studied: s.studied,
          reviews: s.reviews,
          passes: s.passes,
          difficulties: s.difficulties,
          enabled: s.enabled,
          due: s.studied ? addDays(e.study_day, r.firstDays) : null,
          automaticDue: s.studied ? addDays(e.study_day, r.firstDays) : null,
          reason: "Programación reiniciada. Historial y pasadas conservados.",
        };
        break;
      case "exclude":
        s = {
          ...s,
          enabled: false,
          reason: "Excluido de repetición espaciada.",
        };
        break;
      case "include":
        s = { ...s, enabled: true, reason: "Repetición espaciada activada." };
        break;
    }
  }
  return s;
}
export function priority(
  state: MemoryState,
  today: string,
  importance: number,
  examDate: string | null,
) {
  const overdue = state.due ? Math.max(0, daysBetween(state.due, today)) : 0;
  const risk = state.lastDay
    ? Math.min(
        2,
        Math.max(0, daysBetween(state.lastDay, today)) /
          Math.max(1, state.interval),
      )
    : 0;
  const exam = examDate
    ? Math.max(0, 30 - daysBetween(today, examDate)) / 10
    : 0;
  return (
    overdue * 3 +
    risk * 4 +
    state.difficulties * 2 +
    importance * 2 +
    exam * (risk + importance / 2 + state.difficulties)
  );
}
export const mastery = (s: MemoryState) =>
  !s.rating
    ? "Sin valorar"
    : s.rating === "mal"
      ? "Dominio bajo"
      : s.rating === "regular"
        ? "Dominio medio"
        : "Dominio alto";
