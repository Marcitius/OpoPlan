export type Rating = "mal" | "regular" | "bien";
export type SessionKind = "study" | "review" | "practice";
export type MemoryKind =
  | "study"
  | "review"
  | "reschedule"
  | "reset"
  | "exclude"
  | "include"
  | "correction"
  | "void";
export interface Base {
  id: string;
  owner_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
export interface Rules {
  version: 1;
  firstDays: number;
  secondDays: number;
  maxDays: number;
  regularMultiplier: number;
}
export interface Preferences {
  timezone: string;
  theme: "light" | "dark" | "auto";
  dailyMinutes: number;
  weeklyMinutes: number;
  reviewMinutes: number;
  studyDays: number[];
  pomodoroWork: number;
  pomodoroBreak: number;
  reminders: boolean;
  reminderHour: number;
  language: "es";
  rules: Rules;
}
export interface Profile extends Base {
  display_name: string;
  preferences: Preferences;
}
export interface Opposition extends Base {
  name: string;
  exam_date: string | null;
  archived: boolean;
}
export interface Node extends Base {
  opposition_id: string;
  parent_id: string | null;
  source_node_id: string | null;
  name: string;
  kind: "container" | "block";
  position: number;
  archived: boolean;
  importance: number;
  estimated_minutes: number;
  notes: string;
}
export interface Category extends Base {
  name: string;
  color: string;
}
export interface Session extends Base {
  opposition_id: string;
  kind: SessionKind;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  notes: string;
  concentration: number | null;
  difficulty: number | null;
  source: "manual" | "timer";
  planned_task_id: string | null;
}
export interface SessionBlock extends Base {
  session_id: string;
  node_id: string;
  allocated_seconds: number;
  progress: number;
  completed: boolean;
}
export interface MemoryEvent extends Base {
  node_id: string;
  session_id: string | null;
  kind: MemoryKind;
  occurred_at: string;
  study_day: string;
  timezone: string;
  rating: Rating | null;
  notes: string;
  manual_due: string | null;
  target_event_id: string | null;
  rules: Rules;
  scheduled_due?: string | null;
}
export interface PlanTask extends Base {
  /** True for unscheduled tasks; scheduled_day is ignored until planned. */
  is_backlog?: boolean;
  opposition_id: string;
  node_id: string | null;
  category_id: string | null;
  name: string;
  kind: SessionKind;
  scheduled_day: string;
  scheduled_time?: string | null;
  original_day: string;
  estimated_minutes: number;
  status: "pending" | "completed" | "cancelled";
  notes: string;
  completed_session_id: string | null;
}
export interface TestResult extends Base {
  session_id: string;
  category_id: string | null;
  name: string;
  test_type: string;
  question_count: number;
  correct: number;
  wrong: number;
  blank: number;
  penalty: number;
  score: number;
  max_score: number;
  score_manual: boolean;
  notes: string;
}
export interface TestLink extends Base {
  test_id: string;
  node_id: string;
  error_notes: string;
}
export interface CoverageSnapshot extends Base {
  opposition_id: string;
  day: string;
  active_blocks: number;
  coverage: number[];
}
export interface PushSubscriptionRow extends Base {
  endpoint: string;
  subscription: PushSubscriptionJSON;
  last_sent_day: string | null;
}
export interface Tables {
  profiles: Profile;
  oppositions: Opposition;
  nodes: Node;
  categories: Category;
  sessions: Session;
  session_blocks: SessionBlock;
  memory_events: MemoryEvent;
  plan_tasks: PlanTask;
  test_results: TestResult;
  test_links: TestLink;
  coverage_snapshots: CoverageSnapshot;
  push_subscriptions: PushSubscriptionRow;
}
export type TableName = keyof Tables;
export const TABLES: TableName[] = [
  "profiles",
  "oppositions",
  "nodes",
  "categories",
  "plan_tasks",
  "sessions",
  "session_blocks",
  "memory_events",
  "test_results",
  "test_links",
  "coverage_snapshots",
  "push_subscriptions",
];
export type DataSet = { [K in TableName]: Tables[K][] };
export const emptyData = (): DataSet =>
  Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DataSet;
export const DEFAULT_RULES: Rules = {
  version: 1,
  firstDays: 1,
  secondDays: 6,
  maxDays: 365,
  regularMultiplier: 1.2,
};
export const DEFAULT_PREFS: Preferences = {
  timezone: "Europe/Madrid",
  theme: "auto",
  dailyMinutes: 180,
  weeklyMinutes: 900,
  reviewMinutes: 60,
  studyDays: [1, 2, 3, 4, 5, 6],
  pomodoroWork: 25,
  pomodoroBreak: 5,
  reminders: true,
  reminderHour: 9,
  language: "es",
  rules: DEFAULT_RULES,
};
export interface Change {
  table: TableName;
  row: Base & Record<string, unknown>;
  expected_version: number;
}
export interface Operation {
  id: string;
  owner_id: string;
  changes: Change[];
  created_at: string;
  attempts: number;
  next_attempt: number;
  error: string | null;
  conflicts?: Conflict[];
  queue_order?: number;
}
export interface Conflict {
  table: TableName;
  id: string;
  expected: number;
  actual: number;
  remote: (Base & Record<string, unknown>) | null;
}
export const active = <T extends Base>(rows: T[]) =>
  rows.filter((r) => !r.deleted_at);
export function base(owner_id: string, id: string = crypto.randomUUID()): Base {
  const now = new Date().toISOString();
  return {
    id,
    owner_id,
    version: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
