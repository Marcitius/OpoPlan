import { z } from "zod";
import type { TableName } from "./types";
import { dayAt } from "./dates";
const uuid = z.uuid(),
  nullableId = uuid.nullable(),
  date = z.iso.date(),
  stamp = z.iso.datetime({ offset: true });
const rules = z
  .object({
    version: z.literal(1),
    firstDays: z.number().int().min(1).max(30),
    secondDays: z.number().int().min(1).max(60),
    maxDays: z.number().int().min(1).max(3650),
    regularMultiplier: z.number().min(1).max(2),
  })
  .refine(
    (r) => r.firstDays <= r.maxDays && r.secondDays <= r.maxDays,
    "El intervalo máximo es demasiado corto.",
  );
const prefs = z.object({
  timezone: z.string().refine((t) => {
    try {
      new Intl.DateTimeFormat("es", { timeZone: t });
      return true;
    } catch {
      return false;
    }
  }, "Zona horaria inválida"),
  theme: z.enum(["light", "dark", "auto"]),
  dailyMinutes: z.number().int().min(0).max(1440),
  weeklyMinutes: z.number().int().min(0).max(10080),
  reviewMinutes: z.number().int().min(0).max(1440),
  studyDays: z.array(z.number().int().min(0).max(6)),
  pomodoroWork: z.number().int().min(1).max(180),
  pomodoroBreak: z.number().int().min(1).max(60),
  reminders: z.boolean(),
  reminderHour: z.number().int().min(0).max(23),
  language: z.literal("es"),
  rules,
});
const row = z.object({
  id: uuid,
  owner_id: uuid,
  version: z.number().int().min(0),
  created_at: stamp,
  updated_at: stamp,
  deleted_at: stamp.nullable(),
});
const kind = z.enum(["study", "review", "practice"]),
  rating = z.enum(["mal", "regular", "bien"]);
export const schemas: Record<TableName, z.ZodType> = {
  profiles: row
    .extend({ display_name: z.string().max(200), preferences: prefs })
    .refine((r) => r.id === r.owner_id),
  oppositions: row.extend({
    name: z.string().trim().min(1).max(200),
    exam_date: date.nullable(),
    archived: z.boolean(),
  }),
  nodes: row.extend({
    opposition_id: uuid,
    parent_id: nullableId,
    source_node_id: nullableId,
    name: z.string().trim().min(1).max(300),
    kind: z.enum(["container", "block"]),
    position: z.number().int(),
    archived: z.boolean(),
    importance: z.number().int().min(1).max(5),
    estimated_minutes: z.number().int().min(1).max(1440),
    notes: z.string(),
  }),
  categories: row.extend({
    name: z.string().trim().min(1).max(200),
    color: z.string(),
  }),
  sessions: row
    .extend({
      opposition_id: uuid,
      kind,
      started_at: stamp,
      ended_at: stamp,
      duration_seconds: z.number().int().min(1).max(604800),
      notes: z.string(),
      concentration: z.number().int().min(1).max(5).nullable(),
      difficulty: z.number().int().min(1).max(5).nullable(),
      source: z.enum(["manual", "timer"]),
      planned_task_id: nullableId,
    })
    .refine(
      (r) => new Date(r.ended_at) >= new Date(r.started_at),
      "La fecha final precede al inicio.",
    ),
  session_blocks: row
    .extend({
      session_id: uuid,
      node_id: uuid,
      allocated_seconds: z.number().int().min(0),
      progress: z.number().int().min(0).max(100),
      completed: z.boolean(),
    })
    .refine((r) => !r.completed || r.progress === 100),
  memory_events: row
    .extend({
      node_id: uuid,
      session_id: nullableId,
      kind: z.enum([
        "study",
        "review",
        "reschedule",
        "reset",
        "exclude",
        "include",
        "correction",
        "void",
      ]),
      occurred_at: stamp,
      study_day: date,
      timezone: z.string(),
      rating: rating.nullable(),
      notes: z.string(),
      manual_due: date.nullable(),
      target_event_id: nullableId,
      rules,
      scheduled_due: date.nullable().optional(),
    })
    .superRefine((r, ctx) => {
      if (["review", "correction"].includes(r.kind) !== !!r.rating)
        ctx.addIssue({
          code: "custom",
          message: "Valoración incompatible con evento.",
        });
      if (["correction", "void"].includes(r.kind) !== !!r.target_event_id)
        ctx.addIssue({
          code: "custom",
          message: "Falta el evento original de la corrección.",
        });
      if ((r.kind === "reschedule") !== !!r.manual_due)
        ctx.addIssue({ code: "custom", message: "Fecha manual no válida." });
      try {
        if (dayAt(r.occurred_at, r.timezone) !== r.study_day) throw new Error();
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Día o zona horaria no válidos.",
        });
      }
    }),
  plan_tasks: row.extend({
    opposition_id: uuid,
    node_id: nullableId,
    category_id: nullableId,
    name: z.string().trim().min(1).max(300),
    kind,
    scheduled_day: date,
    original_day: date,
    estimated_minutes: z.number().int().min(1).max(1440),
    status: z.enum(["pending", "completed", "cancelled"]),
    notes: z.string(),
    completed_session_id: nullableId,
  }),
  test_results: row
    .extend({
      session_id: uuid,
      category_id: nullableId,
      name: z.string().min(1),
      test_type: z.string().min(1),
      question_count: z.number().int().min(1),
      correct: z.number().int().min(0),
      wrong: z.number().int().min(0),
      blank: z.number().int().min(0),
      penalty: z.number().min(0),
      score: z.number(),
      max_score: z.number().min(0.01),
      score_manual: z.boolean(),
      notes: z.string(),
    })
    .refine(
      (r) => r.correct + r.wrong + r.blank === r.question_count,
      "Aciertos, errores y blancos deben sumar las preguntas.",
    ),
  test_links: row.extend({
    test_id: uuid,
    node_id: uuid,
    error_notes: z.string(),
  }),
  coverage_snapshots: row.extend({
    opposition_id: uuid,
    day: date,
    active_blocks: z.number().int().min(0),
    coverage: z.array(z.number().int().min(0)),
  }),
  push_subscriptions: row.extend({
    endpoint: z.url(),
    subscription: z.object({
      endpoint: z.url().optional(),
      expirationTime: z.number().nullable().optional(),
      keys: z.record(z.string(), z.string()).optional(),
    }),
    last_sent_day: date.nullable(),
  }),
};
export function validateRow(table: TableName, value: unknown) {
  const parsed = schemas[table].safeParse(value);
  if (!parsed.success)
    throw new Error(
      `Registro ${table} no válido: ${parsed.error.issues[0]?.message}`,
    );
}
