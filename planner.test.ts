import { describe, expect, it } from "vitest";
import { comparePlanTasks, planMinutes } from "../src/core/planner";
import type { PlanTask } from "../src/core/types";
const make = (id: string, scheduled_day: string, scheduled_time: string | null, status: PlanTask["status"] = "pending") => ({ id, scheduled_day, scheduled_time, estimated_minutes: 30, status, created_at: "2026-10-08T10:00:00.000Z" }) as PlanTask;
describe("Planificador diario", () => {
 it("ordena por fecha y después hora, dejando los horarios flexibles al final", () => {
   const rows = [make("c","2026-10-09",null),make("a","2026-10-09","10:00:00"),make("b","2026-10-08","20:00"),make("d","2026-10-09","08:30")];
   expect(rows.sort(comparePlanTasks).map(t=>t.id)).toEqual(["b","d","a","c"]);
 });
 it("suma tiempos previstos sin incluir canceladas",()=> {
   expect(planMinutes([make("a","2026-10-09",null),make("b","2026-10-09",null,"cancelled")])).toBe(30);
 });
});
