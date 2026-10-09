import { describe,it,expect } from "vitest";
import { isBacklogTask, isScheduledTask, planMinutes } from "../src/core/planner";
import { dayPlanSummary } from "../src/core/todayOverview";
import type { PlanTask } from "../src/core/types";
const task = (id:string, is_backlog:boolean):PlanTask => ({id,owner_id:"u",opposition_id:"o",version:0,created_at:"2026-10-09T00:00:00Z",updated_at:"2026-10-09T00:00:00Z",deleted_at:null,name:"Ejercicios",kind:"practice",scheduled_day:"2026-10-09",original_day:"2026-10-09",is_backlog,estimated_minutes:40,status:"pending",notes:"",node_id:null,category_id:null,completed_session_id:null});
describe("Tareas sin fecha",()=>{
 it("no cuentan como actividades del día aunque conserven una fecha técnica",()=>{const t=task("one",true);expect(isBacklogTask(t)).toBe(true);expect(dayPlanSummary([t],"2026-10-09").activities).toHaveLength(0);expect(planMinutes([t])).toBe(0)});
 it("se convierten en actividades reales sin duplicar su identidad",()=>{const t=task("one",true);const scheduled={...t,is_backlog:false,scheduled_day:"2026-10-10"};expect(scheduled.id).toBe(t.id);expect(isScheduledTask(scheduled)).toBe(true);expect(dayPlanSummary([scheduled],"2026-10-10").plannedMinutes).toBe(40)});
});
