import { useState } from "react";
import {
  Plus,
  Play,
  Check,
  BookOpen,
  RotateCcw,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ClipboardCheck,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../data/context";
import type { SessionOptions } from "../components/SessionForm";
import {
  Button,
  Stat,
  ProgressBar,
  Empty,
  Modal,
  Menu,
} from "../components/ui";
import { PlanForm } from "../components/PlanForm";
import { active } from "../core/types";
import type { PlanTask } from "../core/types";
import {
  dayAt,
  addDays,
  addMonths,
  monthGridStart,
  labelDay,
  minutesLabel,
} from "../core/dates";
import { blocks, getStates, statistics, nodePath } from "../core/stats";
import { priority } from "../core/memory";
import { calendarICS, download } from "../core/import";
import type { Route } from "../App";
export function Today({
  start,
  navigate,
}: {
  start: (o: SessionOptions) => void;
  navigate: (r: Route) => void;
}) {
  const {
      owner,
      data,
      preferences,
      oppositionId,
      save,
      timer,
      setTimer,
      notify,
    } = useApp(),
    today = dayAt(new Date(), preferences.timezone),
    opposition = data.oppositions.find((o) => o.id === oppositionId),
    b = blocks(data, oppositionId),
    states = getStates(data),
    stats = statistics(data, oppositionId, preferences.timezone, today, today),
    week = statistics(
      data,
      oppositionId,
      preferences.timezone,
      addDays(today, -6),
      today,
    );
  const reviews = b
    .filter((n) => {
      const s = states.get(n.id)!;
      return s.enabled && s.due && s.due <= today;
    })
    .sort(
      (a, c) =>
        priority(
          states.get(c.id)!,
          today,
          c.importance,
          opposition?.exam_date ?? null,
        ) -
        priority(
          states.get(a.id)!,
          today,
          a.importance,
          opposition?.exam_date ?? null,
        ),
    );
  const isStudyDay = preferences.studyDays.includes(
      new Date(today + "T12:00:00Z").getUTCDay(),
    ),
    dailyTarget = isStudyDay ? preferences.dailyMinutes : 0,
    reviewLimit = Math.min(
      preferences.reviewMinutes,
      Math.max(0, dailyTarget - stats.total / 60),
    );
  let budget = 0;
  const recommended = reviews.filter((n) => {
    if (budget + n.estimated_minutes <= reviewLimit) {
      budget += n.estimated_minutes;
      return true;
    }
    return false;
  });
  const tasks = active(data.plan_tasks).filter(
      (t) => t.opposition_id === oppositionId,
    ),
    pending = tasks.filter(
      (t) => t.status === "pending" && t.scheduled_day <= today,
    ),
    completed = tasks.filter(
      (t) => t.status === "completed" && t.scheduled_day === today,
    );
  const [editing, setEditing] = useState<PlanTask | "new" | null>(null),
    [calendar, setCalendar] = useState(false),
    [view, setView] = useState<"day" | "week" | "month">("week"),
    [selected, setSelected] = useState(today);
  const studied = b.filter((n) => states.get(n.id)?.studied).length;
  async function beginTask(t: PlanTask) {
    if (timer) {
      notify("Ya tienes una sesión abierta.");
      navigate("study");
      return;
    }
    if (t.kind !== "practice" && !t.node_id) {
      start({ kind: t.kind, taskId: t.id });
      return;
    }
    await setTimer({
      id: crypto.randomUUID(),
      owner_id: owner,
      oppositionId,
      kind: t.kind,
      nodeIds: t.node_id ? [t.node_id] : [],
      taskId: t.id,
      startedAt: new Date().toISOString(),
      runningSince: Date.now(),
      accumulated: 0,
      mode: "continuous",
      phase: "work",
      phaseAccumulated: 0,
      workSeconds: preferences.pomodoroWork * 60,
      breakSeconds: preferences.pomodoroBreak * 60,
    });
    navigate("study");
  }
  const taskCard = (t: PlanTask) => (
    <div className="task-row" key={t.id}>
      <span className={`activity-icon ${t.kind}`}>
        {t.status === "completed" ? (
          <Check size={19} />
        ) : t.kind === "study" ? (
          <BookOpen size={19} />
        ) : t.kind === "review" ? (
          <RotateCcw size={19} />
        ) : (
          <ClipboardCheck size={19} />
        )}
      </span>
      <div className="task-copy">
        <strong>{t.name}</strong>
        <small>
          {t.node_id
            ? nodePath(data.nodes.find((n) => n.id === t.node_id)!, data.nodes)
            : t.category_id
              ? data.categories.find((c) => c.id === t.category_id)?.name
              : {
                  study: "Estudio nuevo",
                  review: "Repaso",
                  practice: "Práctica",
                }[t.kind]}
          {t.scheduled_day < today && t.status === "pending" && (
            <span className="overdue">
              {" "}
              · Pendiente desde {labelDay(t.scheduled_day)}
            </span>
          )}
        </small>
      </div>
      <span className="duration">{t.estimated_minutes} min</span>
      {t.status === "pending" && (
        <Button variant="secondary" onClick={() => void beginTask(t)}>
          <Play size={15} />
          <span>Iniciar</span>
        </Button>
      )}
      <Menu
        items={[
          { label: "Editar / cambiar fecha", action: () => setEditing(t) },
          ...(t.status === "pending"
            ? [
                {
                  label: "Registrar realizada",
                  action: () =>
                    start({
                      kind: t.kind,
                      nodeIds: t.node_id ? [t.node_id] : [],
                      taskId: t.id,
                      test: t.kind === "practice",
                    }),
                },
                {
                  label: "Posponer a mañana",
                  action: () =>
                    void save("plan_tasks", {
                      ...t,
                      scheduled_day: addDays(today, 1),
                    }),
                },
                {
                  label: "Cancelar actividad",
                  action: () => {
                    if (confirm("¿Cancelar esta actividad prevista?"))
                      void save("plan_tasks", { ...t, status: "cancelled" });
                  },
                  danger: true,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
  const span = view === "day" ? 1 : view === "week" ? 7 : 42;
  const calendarStart = view === "month" ? monthGridStart(selected) : selected;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {labelDay(today, {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).toLocaleUpperCase("es")}
          </div>
          <h1>
            Tu plan para hoy<span className="lime-dot">.</span>
          </h1>
          <p>Un bloque de estudio. Un recuerdo más sólido. Un paso adelante.</p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => setCalendar((v) => !v)}>
            <CalendarDays size={18} />
            Agenda
          </Button>
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus size={18} />
            Actividad
          </Button>
        </div>
      </div>
      <div className="stat-grid">
        <Stat
          label="TIEMPO ESTUDIADO"
          value={minutesLabel(stats.total)}
          detail={`Objetivo: ${dailyTarget} min${isStudyDay ? "" : " · descanso"}`}
          accent
        />
        <Stat
          label="REPASOS PENDIENTES"
          value={reviews.length}
          detail={`${reviews.filter((n) => states.get(n.id)!.due! < today).length} vencidos`}
        />
        <Stat
          label="BLOQUES ESTUDIADOS"
          value={
            <>
              {studied}
              <em> / {b.length}</em>
            </>
          }
          detail={`${b.length ? Math.round((studied / b.length) * 100) : 0}% del temario activo`}
        />
        <Stat
          label="ACTIVIDADES REALIZADAS"
          value={stats.sessions.length}
          detail={`${completed.length} actividades previstas completadas`}
        />
      </div>
      <div className="today-grid">
        <div className="stack">
          <section className="panel agenda-panel">
            <div className="section-title">
              <h2>Repasar para recordar</h2>
              <span className="badge">{reviews.length} pendiente(s)</span>
            </div>
            <p className="section-intro">
              Ordenados por vencimiento, dificultad e importancia.
            </p>
            {reviews.length ? (
              reviews.map((n) => {
                const s = states.get(n.id)!;
                return (
                  <div className="task-row" key={n.id}>
                    <span
                      className={`activity-icon review ${s.due! < today ? "urgent" : ""}`}
                    >
                      <RotateCcw size={19} />
                    </span>
                    <div className="task-copy">
                      <strong>{n.name}</strong>
                      <small>
                        {nodePath(n, data.nodes)
                          .split(" / ")
                          .slice(0, -1)
                          .join(" / ") || "Bloque independiente"}
                      </small>
                      <span
                        className={`task-status ${s.due! < today ? "overdue" : ""}`}
                      >
                        {s.due! < today ? "Vencido · " : "Hoy · "}
                        {labelDay(s.due!)}
                        {recommended.includes(n) && " · Recomendado"}
                      </span>
                    </div>
                    <span className="duration">~{n.estimated_minutes} min</span>
                    <Button
                      variant="secondary"
                      onClick={() => start({ kind: "review", nodeIds: [n.id] })}
                    >
                      Repasar
                    </Button>
                  </div>
                );
              })
            ) : (
              <Empty
                title="Todo al día"
                description={
                  b.length
                    ? "No hay repasos pendientes para hoy."
                    : "Completa el estudio inicial de un bloque y se programará su primer repaso."
                }
              />
            )}
            <div className="panel-foot">
              Recomendación: {budget} / {Math.round(reviewLimit)} min
              recomendados según tu tiempo disponible. Todos los pendientes
              siguen visibles.
            </div>
          </section>
          <section className="panel">
            <div className="section-title">
              <h2>Estudio y práctica</h2>
              <button className="textbtn" onClick={() => setEditing("new")}>
                <Plus size={16} />
                Añadir
              </button>
            </div>
            {pending.length ? (
              pending.map(taskCard)
            ) : (
              <Empty
                title="Dale forma a tu día"
                description="Planifica estudio nuevo, inglés, ortografía o cualquier otra práctica."
                action={
                  <Button variant="secondary" onClick={() => setEditing("new")}>
                    Planificar actividad
                  </Button>
                }
              />
            )}{" "}
            {completed.length > 0 && (
              <>
                <h3 className="subheading">Previstas y completadas</h3>
                {completed.map(taskCard)}
              </>
            )}
          </section>
          {calendar && (
            <section className="panel">
              <div className="section-title">
                <h2>Tu agenda</h2>
                <div className="segmented compact">
                  {(["day", "week", "month"] as const).map((v) => (
                    <button
                      key={v}
                      className={view === v ? "selected" : ""}
                      onClick={() => setView(v)}
                    >
                      {{ day: "Día", week: "Semana", month: "Mes" }[v]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="calendar-controls">
                <button
                  className="iconbtn"
                  aria-label="Periodo anterior"
                  onClick={() =>
                    setSelected(
                      view === "month"
                        ? addMonths(selected, -1)
                        : addDays(selected, -span),
                    )
                  }
                >
                  <ChevronLeft size={20} />
                </button>
                <input
                  type="date"
                  aria-label="Fecha de agenda"
                  value={selected}
                  onChange={(e) => {
                    if (e.target.value) setSelected(e.target.value);
                  }}
                />
                <button
                  className="iconbtn"
                  aria-label="Periodo siguiente"
                  onClick={() =>
                    setSelected(
                      view === "month"
                        ? addMonths(selected, 1)
                        : addDays(selected, span),
                    )
                  }
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className={`calendar-grid ${view}`}>
                {Array.from({ length: span }, (_, i) =>
                  addDays(calendarStart, i),
                ).map((day) => {
                  const ts = tasks.filter(
                      (t) =>
                        t.scheduled_day === day && t.status !== "cancelled",
                    ),
                    rs = b.filter(
                      (n) =>
                        states.get(n.id)?.enabled &&
                        states.get(n.id)?.due === day,
                    );
                  return (
                    <button
                      key={day}
                      className={day === today ? "current" : ""}
                      onClick={() => {
                        setSelected(day);
                        setView("day");
                      }}
                    >
                      <strong>
                        {labelDay(day, {
                          day: "numeric",
                          month: view === "month" ? undefined : "short",
                          weekday: view === "month" ? undefined : "short",
                        })}
                      </strong>
                      <small>{ts.length} actividad(es)</small>
                      {rs.length > 0 && (
                        <span className="badge">{rs.length} repaso(s)</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {view === "day" && (
                <div>
                  {tasks
                    .filter(
                      (t) =>
                        t.scheduled_day === selected &&
                        t.status !== "cancelled",
                    )
                    .map(taskCard)}
                  <Button variant="ghost" onClick={() => setEditing("new")}>
                    Añadir actividad en esta fecha
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  download(
                    "OpoPlan-agenda.ics",
                    calendarICS([
                      ...tasks
                        .filter((t) => t.status === "pending")
                        .map((t) => ({
                          id: t.id,
                          name: t.name,
                          day: t.scheduled_day,
                          minutes: t.estimated_minutes,
                          notes: t.notes,
                        })),
                      ...b
                        .filter(
                          (n) =>
                            states.get(n.id)?.enabled && states.get(n.id)?.due,
                        )
                        .map((n) => ({
                          id: n.id,
                          name: "Repaso · " + n.name,
                          day: states.get(n.id)!.due!,
                          minutes: n.estimated_minutes,
                          notes: states.get(n.id)!.reason,
                        })),
                    ]),
                    "text/calendar",
                  )
                }
              >
                Exportar al calendario (.ics)
              </Button>
            </section>
          )}
        </div>
        <aside className="stack">
          <section className="focus-card">
            <span className="eyebrow">ENFOCA TU SIGUIENTE PASO</span>
            <h2>
              ¿Qué vas a<br />
              trabajar ahora?
            </h2>
            <p>Elige los bloques. Registra el tiempo. Sigue tu avance.</p>
            <Button onClick={() => navigate("study")}>
              <BookOpen size={18} />
              ESTUDIAR
            </Button>
            <Button
              variant="secondary"
              onClick={() => start({ kind: "review" })}
            >
              <RotateCcw size={18} />
              REPASAR
            </Button>
            {timer && (
              <button className="textbtn" onClick={() => navigate("study")}>
                Tienes una sesión abierta
              </button>
            )}
          </section>
          <section className="panel">
            <div className="section-title">
              <h3>Tu ritmo esta semana</h3>
              <Clock size={17} />
            </div>
            <div className="week-bars">
              {Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map(
                (day) => (
                  <div
                    key={day}
                    title={`${labelDay(day)}: ${minutesLabel(week.byDay[day] ?? 0)}`}
                  >
                    <span
                      style={{
                        height: `${Math.min(100, ((week.byDay[day] ?? 0) / Math.max(60, preferences.dailyMinutes * 60)) * 100)}%`,
                      }}
                    />
                    <small>{labelDay(day, { weekday: "narrow" })}</small>
                  </div>
                ),
              )}
            </div>
            <strong className="week-total">{minutesLabel(week.total)}</strong>
            <p className="muted">Tiempo registrado en los últimos 7 días.</p>
            <ProgressBar
              value={
                preferences.weeklyMinutes
                  ? (week.total / (preferences.weeklyMinutes * 60)) * 100
                  : 0
              }
            />
            <small className="muted">
              Objetivo semanal: {preferences.weeklyMinutes} min
            </small>
          </section>
          <section className="panel">
            <h3>Lo que ya has hecho hoy</h3>
            {stats.sessions.length ? (
              <div className="recent-sessions">
                {stats.sessions.map((s) => (
                  <div key={s.id}>
                    <Check size={16} />
                    <span>
                      {
                        {
                          study: "Estudio",
                          review: "Repaso",
                          practice: "Práctica",
                        }[s.kind]
                      }
                    </span>
                    <strong>{minutesLabel(s.duration_seconds)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                Tu primera sesión aparecerá aquí cuando la guardes.
              </p>
            )}
          </section>
        </aside>
      </div>
      <Modal
        title={editing === "new" ? "Planificar actividad" : "Editar actividad"}
        open={!!editing}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <PlanForm
            task={editing === "new" ? undefined : editing}
            day={selected}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}
