import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Client } from "./client";
import { SyncEngine, supabaseRemote } from "./sync";
import type { SyncState } from "./sync";
import { enqueue, readData, readTimer, writeTimer } from "./local";
import { active, base, DEFAULT_PREFS, emptyData } from "../core/types";
import type {
  Base,
  Change,
  DataSet,
  MemoryEvent,
  MemoryKind,
  Node,
  Operation,
  Preferences,
  Rating,
  Rules,
  Session,
  SessionBlock,
  SessionKind,
  TableName,
  TestResult,
  TestLink,
} from "../core/types";
import type { Timer } from "../core/timer";
import { dayAt } from "../core/dates";
import { coverage } from "../core/stats";
import { replayMemory } from "../core/memory";
interface Context {
  owner: string;
  client: Client;
  data: DataSet;
  sync: SyncState;
  preferences: Preferences;
  oppositionId: string;
  setOppositionId: (id: string) => void;
  commit: (changes: Change[], message?: string) => Promise<void>;
  save: <T extends Base>(table: TableName, row: T) => Promise<void>;
  notify: (message: string) => void;
  retry: () => void;
  resolve: (op: Operation, choice: "cloud" | "local") => Promise<void>;
  timer: Timer | null;
  setTimer: (timer: Timer | null) => Promise<void>;
  record: (input: RecordInput) => Promise<void>;
  memory: (
    node: Node,
    kind: MemoryKind,
    options?: Partial<MemoryEvent>,
  ) => Promise<void>;
}
export interface RecordInput {
  id?: string;
  oppositionId?: string;
  kind: SessionKind;
  nodeIds: string[];
  allocations: number[];
  completed: boolean[];
  progress: number[];
  ratings: Rating[];
  blockNotes: string[];
  duration: number;
  startedAt: string;
  endedAt: string;
  source: "timer" | "manual";
  notes: string;
  concentration: number | null;
  difficulty: number | null;
  taskId?: string | null;
  test?: Omit<TestResult, keyof Base | "session_id">;
  errors?: { nodeId: string; notes: string }[];
}
const Store = createContext<Context | null>(null);
export const useApp = () => {
  const value = useContext(Store);
  if (!value) throw new Error("Contexto no disponible.");
  return value;
};
export function change<T extends Base>(table: TableName, row: T): Change {
  return {
    table,
    row: row as Base & Record<string, unknown>,
    expected_version: row.version,
  };
}
export function Provider({
  owner,
  client,
  children,
}: {
  owner: string;
  client: Client;
  children: ReactNode;
}) {
  const [data, setData] = useState(emptyData),
    [sync, setSync] = useState<SyncState>({
      status: "loading",
      count: 0,
      error: null,
      operations: [],
    }),
    [timer, setTimerState] = useState<Timer | null>(null),
    [oppositionId, setOpposition] = useState(
      localStorage.getItem("opoplan-opposition-" + owner) ?? "",
    ),
    [toast, setToast] = useState("");
  const engine = useRef<SyncEngine | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const notify = (msg: string) => setToast(msg);
  useEffect(() => {
    let stopped = false;
    const eng = new SyncEngine(owner, supabaseRemote(client), (d, s) => {
      if (!stopped) {
        setData(d);
        setSync(s);
      }
    });
    engine.current = eng;
    void readData(owner).then((d) => {
      if (!stopped) setData(d);
    });
    void readTimer(owner).then((t) => {
      if (!stopped) setTimerState(t);
    });
    void eng.sync(true);
    const onOnline = () => void eng.sync(true),
      onOffline = () => void eng.refresh("offline"),
      onVisible = () => {
        if (document.visibilityState === "visible") void eng.sync(true);
      };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => void eng.sync(), 30000);
    const channel = client
      .channel("opoplan-" + owner)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "*",
          filter: "owner_id=eq." + owner,
        },
        () => void eng.sync(),
      )
      .subscribe();
    return () => {
      stopped = true;
      eng.stop();
      void client.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [owner, client]);
  useEffect(() => {
    if (
      !oppositionId ||
      !data.oppositions.some(
        (o) => o.id === oppositionId && !o.deleted_at && !o.archived,
      )
    ) {
      const id = active(data.oppositions).find((o) => !o.archived)?.id;
      if (id) {
        setOpposition(id);
        localStorage.setItem("opoplan-opposition-" + owner, id);
      }
    }
  }, [data.oppositions, oppositionId, owner]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const preferences =
    data.profiles.find((p) => p.id === owner)?.preferences ?? DEFAULT_PREFS;
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);
  async function commit(
    changes: Change[],
    message = "Guardado en este dispositivo. Sincronización pendiente.",
  ) {
    await enqueue(owner, changes);
    await engine.current?.refresh();
    notify(message);
    void engine.current?.sync(true);
  }
  async function save<T extends Base>(table: TableName, row: T) {
    await commit([change(table, row)]);
  }
  async function setTimer(t: Timer | null) {
    await writeTimer(owner, t);
    setTimerState(t);
  }
  function event(
    nodeId: string,
    kind: MemoryKind,
    options: Partial<MemoryEvent> = {},
  ): MemoryEvent {
    const now = new Date().toISOString();
    const occurred = options.occurred_at ?? now;
    const ev: MemoryEvent = {
      ...base(owner),
      node_id: nodeId,
      session_id: null,
      kind,
      occurred_at: occurred,
      study_day: dayAt(occurred, preferences.timezone),
      timezone: preferences.timezone,
      rating: null,
      notes: "",
      manual_due: null,
      target_event_id: null,
      rules: { ...preferences.rules },
      ...options,
    };
    ev.scheduled_due = replayMemory([
      ...dataRef.current.memory_events.filter((e) => e.node_id === nodeId),
      ev,
    ]).due;
    return ev;
  }
  async function memory(
    node: Node,
    kind: MemoryKind,
    options: Partial<MemoryEvent> = {},
  ) {
    await save("memory_events", event(node.id, kind, options));
  }
  async function record(input: RecordInput) {
    if (!Number.isInteger(input.duration) || input.duration < 1)
      throw new Error("Introduce una duración mayor que cero.");
    if (input.kind !== "practice" && !input.nodeIds.length)
      throw new Error("Selecciona al menos un bloque.");
    if (
      input.nodeIds.length &&
      input.allocations.reduce((a, b) => a + b, 0) !== input.duration
    )
      throw new Error(
        "El tiempo repartido debe coincidir con el tiempo total.",
      );
    const d = dataRef.current;
    const recordOpposition = input.oppositionId ?? oppositionId;
    const session: Session = {
      ...base(owner, input.id),
      opposition_id: recordOpposition,
      kind: input.kind,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      duration_seconds: input.duration,
      source: input.source,
      notes: input.notes,
      concentration: input.concentration,
      difficulty: input.difficulty,
      planned_task_id: input.taskId ?? null,
    };
    if (d.sessions.some((s) => s.id === session.id)) {
      await setTimer(null);
      notify("Esta sesión ya estaba guardada.");
      return;
    }
    const changes = [change("sessions", session)];
    input.nodeIds.forEach((id, i) => {
      const a: SessionBlock = {
        ...base(owner),
        session_id: session.id,
        node_id: id,
        allocated_seconds: input.allocations[i],
        progress: input.progress[i] ?? 0,
        completed: input.completed[i] ?? false,
      };
      changes.push(change("session_blocks", a));
      if (input.kind === "review" || (input.kind === "study" && a.completed))
        changes.push(
          change(
            "memory_events",
            event(id, input.kind === "study" ? "study" : "review", {
              session_id: session.id,
              occurred_at: input.endedAt,
              study_day: dayAt(input.endedAt, preferences.timezone),
              rating: input.kind === "review" ? input.ratings[i] : null,
              notes: input.blockNotes[i] ?? "",
            }),
          ),
        );
    });
    if (input.test) {
      const result: TestResult = {
        ...base(owner),
        session_id: session.id,
        ...input.test,
      };
      changes.push(change("test_results", result));
      for (const e of input.errors ?? []) {
        const link: TestLink = {
          ...base(owner),
          test_id: result.id,
          node_id: e.nodeId,
          error_notes: e.notes,
        };
        changes.push(change("test_links", link));
      }
    }
    const task = d.plan_tasks.find((t) => t.id === input.taskId);
    if (task && task.kind !== input.kind)
      throw new Error(
        "El tipo no coincide con la actividad prevista. Edítala antes de registrar su realización.",
      );
    if (task)
      changes.push(
        change("plan_tasks", {
          ...task,
          status: "completed",
          completed_session_id: session.id,
        }),
      );
    await commit(changes);
    if (input.source === "timer") await setTimer(null);
    // Snapshot captures the denominator after this actual activity; a failed optional snapshot does not undo the session.
    try {
      const updated = await readData(owner),
        c = coverage(updated, recordOpposition);
      await save("coverage_snapshots", {
        ...base(owner),
        opposition_id: recordOpposition,
        day: dayAt(input.endedAt, preferences.timezone),
        active_blocks: c[0]?.total ?? 0,
        coverage: c.map((x) => x.count),
      });
    } catch {
      notify(
        "Sesión guardada. No se pudo guardar la instantánea de cobertura.",
      );
    }
  }
  return (
    <Store.Provider
      value={{
        owner,
        client,
        data,
        sync,
        preferences,
        oppositionId,
        setOppositionId: (id) => {
          setOpposition(id);
          localStorage.setItem("opoplan-opposition-" + owner, id);
        },
        commit,
        save,
        notify,
        retry: () => void engine.current?.sync(true),
        resolve: async (op, choice) => {
          await engine.current?.resolve(op, choice);
        },
        timer,
        setTimer,
        record,
        memory,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast("")}>
            ×
          </button>
        </div>
      )}
    </Store.Provider>
  );
}
