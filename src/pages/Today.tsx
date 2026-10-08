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
  ChevronRight as ArrowRight,
  Sparkles,
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
import { BulkPlanForm } from "../components/BulkPlanForm";
import { comparePlanTasks, planMinutes } from "../core/planner";
import { active } from "../core/types";
import type { PlanTask } from "../core/types";
import {
  dayAt,
  addDays,
  addMonths,
  monthGridStart,
  labelDay,
  minutesLabel,
  daysBetween,
} from "../core/dates";
import { blocks, getStates, statistics, nodePath } from "../core/stats";
import { priority } from "../core/memory";
import { calendarICS, download } from "../core/import";
import type { Route } from "../App";
export function Today({
  start,
  navigate,
  initialCalendar = false,
}: {
  start: (o: SessionOptions) => void;
  navigate: (r: Route) => void;
  initialCalendar?: boolean;
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
    ).sort(comparePlanTasks),
    pending = tasks.filter(
      (t) => t.status === "pending" && t.scheduled_day <= today,
    ),
    completed = tasks.filter(
      (t) => t.status === "completed" && t.scheduled_day === today,
    );
  const [editing, setEditing] = useState<PlanTask | "new" | null>(null),
    [bulkOpen, setBulkOpen] = useState(false),
    [calendar, setCalendar] = useState(initialCalendar),
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
      <span className="duration">{t.scheduled_time ? `${t.scheduled_time.slice(0, 5)} · ` : ""}{t.estimated_minutes} min</span>
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
  const recent = active(data.sessions)
    .filter((s) => s.opposition_id === oppositionId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const lastStudy = recent.find(
    (s) =>
      s.kind === "study" &&
      active(data.session_blocks).some(
        (a) => a.session_id === s.id && b.some((n) => n.id === a.node_id),
      ),
  );
  const lastBlock = lastStudy
    ? b.find((n) =>
        active(data.session_blocks).some(
          (a) => a.session_id === lastStudy.id && a.node_id === n.id,
        ),
      )
    : undefined;
  const yesterday = recent.filter(
    (s) => dayAt(s.started_at, preferences.timezone) === addDays(today, -1),
  );
  function sessionContents(id: string) {
    const content = active(data.session_blocks)
      .filter((a) => a.session_id === id)
      .map((a) => data.nodes.find((n) => n.id === a.node_id)?.name)
      .filter(Boolean)
      .join(" · ");
    const result = active(data.test_results).find((t) => t.session_id === id);
    return content || result?.name || "Práctica";
  }
  const displayName = data.profiles
    .find((p) => p.id === owner)
    ?.display_name.trim()
    .split(" ")[0];
  const hour = Number(
    new Intl.DateTimeFormat("es", {
      timeZone: preferences.timezone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const goalProgress = dailyTarget
    ? Math.min(100, (stats.total / (dailyTarget * 60)) * 100)
    : 0;
  async function continueStudy() {
    if (timer || !lastBlock) {
      navigate("study");
      return;
    }
    await setTimer({
      id: crypto.randomUUID(),
      owner_id: owner,
      oppositionId,
      kind: "study",
      nodeIds: [lastBlock.id],
      taskId: null,
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
  return (
    <>
      <div className="page-heading today-heading">
        <div>
          <div className="eyebrow">
            {labelDay(today, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
          <h1>
            {greeting}
            {displayName ? `, ${displayName}` : ""}.
          </h1>
          <p>
            {opposition?.name} ·{" "}
            {isStudyDay
              ? "Un paso más, bloque a bloque."
              : "Hoy puedes descansar. Tu plan sigue aquí."}
          </p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => setCalendar((v) => !v)}>
            <CalendarDays size={18} />
            Agenda
          </Button>
          <Button variant="secondary" onClick={() => { setSelected(addDays(today, 1)); setBulkOpen(true); }}>
            <Plus size={18} />
            Planificar mañana
          </Button>
        </div>
      </div>
      {!recent.length && (
        <section className="getting-started">
          <span className="activity-icon">
            <Sparkles size={22} />
          </span>
          <div>
            <h2>Tu preparación empieza aquí.</h2>
            <p>
              {!data.nodes.some(
                (n) => n.opposition_id === oppositionId && !n.deleted_at,
              )
                ? "Añade tu temario. Divídelo en bloques pequeños y registra lo que estudias de verdad."
                : !b.length
                  ? "Ya tienes la estructura. Entra en una materia y añade un bloque revisable para empezar."
                  : "Tu temario está listo. Registra tu primer bloque; cuando lo completes, programaremos su repaso."}
            </p>
            <div className="onboarding-steps">
              <span className="selected">✓ Tu plan</span>
              <span className={b.length ? "selected" : ""}>
                {b.length ? "✓" : "2"} Temario
              </span>
              <span>3 Primera sesión</span>
            </div>
            <div className="heading-actions">
              <Button onClick={() => navigate(b.length ? "study" : "syllabus")}>
                {b.length ? "Empezar a estudiar" : "Preparar mi temario"}
                <ArrowRight size={17} />
              </Button>
              {b.length > 0 ? (
                <Button
                  variant="ghost"
                  onClick={() => start({ kind: "study" })}
                >
                  Registrar estudio anterior
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => start({ kind: "practice", test: true })}
                >
                  Registrar una práctica
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
      {(b.length > 0 || recent.length > 0) && (
        <>
          <section className="daily-card" aria-label="Progreso diario">
            <div>
              <span className="daily-label">Tu tiempo de hoy</span>
              <strong className="daily-time">
                {minutesLabel(stats.total)}
              </strong>
              <p>
                {dailyTarget
                  ? `de ${dailyTarget} min de objetivo`
                  : "Día sin objetivo de tiempo"}
              </p>
              <span className="daily-completed">
                <Check size={15} />
                {stats.sessions.length}{" "}
                {stats.sessions.length === 1
                  ? "actividad registrada"
                  : "actividades registradas"}
              </span>
            </div>
            <div className="daily-ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="42" />
                <circle
                  className="ring-progress"
                  cx="50"
                  cy="50"
                  r="42"
                  strokeDasharray={`${goalProgress * 2.639} 263.9`}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <strong>
                {Math.round(goalProgress)}
                <small>%</small>
              </strong>
            </div>
          </section>
          <div className="quick-actions">
            <Button onClick={() => navigate("study")}>
              <Play size={18} />
              {timer ? "Continuar sesión" : "Estudiar"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => start({ kind: "review" })}
            >
              <RotateCcw size={18} />
              Registrar repaso
            </Button>
          </div>
        </>
      )}
      <div className="today-grid">
        <div className="stack">
          {b.length > 0 && (
            <section className="panel agenda-panel">
              <div className="section-title">
                <h2>Repasos de hoy</h2>
                {reviews.length > 0 && (
                  <span className="badge">{reviews.length} pendientes</span>
                )}
              </div>
              {reviews.length ? (
                <>
                  {reviews.slice(0, 5).map((n, i) => {
                    const state = states.get(n.id)!,
                      overdue = state.due! < today,
                      previous = reviews[i - 1];
                    return (
                      <div key={n.id}>
                        {(i === 0 ||
                          (!!previous &&
                            states.get(previous.id)!.due! < today !==
                              overdue)) && (
                          <div className="list-label">
                            {overdue ? "Vencidos" : "Para hoy"}
                          </div>
                        )}
                        <div className="task-row">
                          <span
                            className={`activity-icon review ${overdue ? "urgent" : ""}`}
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
                              className={`task-status ${overdue ? "overdue" : ""}`}
                            >
                              {overdue
                                ? `${daysBetween(state.due!, today)} ${daysBetween(state.due!, today) === 1 ? "día" : "días"} de retraso`
                                : "Para hoy"}{" "}
                              · {n.estimated_minutes} min
                              {recommended.includes(n) && " · Recomendado"}
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              start({ kind: "review", nodeIds: [n.id] })
                            }
                          >
                            Repasar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  <div className="panel-foot">
                    {budget} min recomendados según tu tiempo disponible.{" "}
                    {reviews.length > 5 && (
                      <button
                        className="textbtn"
                        onClick={() => navigate("reviews")}
                      >
                        Ver los {reviews.length} repasos
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="quiet-empty">
                  <Check size={20} />
                  <div>
                    <strong>Todo al día</strong>
                    <p>
                      {studied
                        ? "No tienes repasos pendientes para hoy."
                        : "Completa un bloque y su primer repaso aparecerá aquí."}
                    </p>
                  </div>
                </div>
              )}
            </section>
          )}
          {lastBlock && (
            <section className="continue-card">
              <div>
                <span className="eyebrow">CONTINUAR ESTUDIANDO</span>
                <h2>{lastBlock.name}</h2>
                <p>
                  {lastStudy &&
                    labelDay(
                      dayAt(lastStudy.started_at, preferences.timezone),
                    )}{" "}
                  ·{" "}
                  {states.get(lastBlock.id)?.studied
                    ? "Estudio inicial completado"
                    : "En estudio"}
                </p>
              </div>
              <Button variant="secondary" onClick={() => void continueStudy()}>
                <Play size={17} />
                Continuar
              </Button>
            </section>
          )}
          {(pending.length > 0 || b.length > 0) && (
            <section className="panel">
              <div className="section-title">
                <h2>Tu plan</h2>
                <div className="heading-actions">
                  <button className="textbtn" onClick={() => setEditing("new")}><Plus size={17}/> Una actividad</button>
                  <button className="textbtn" onClick={() => {setSelected(today);setBulkOpen(true);}}><CalendarDays size={17}/> Planificar día</button>
                </div>
              </div>
              {pending.length ? (
                pending.map(taskCard)
              ) : (
                <div className="quiet-empty">
                  <CalendarDays size={22} />
                  <p>
                    Un día a tu medida. Añade estudio nuevo, inglés o una
                    práctica.
                  </p>
                </div>
              )}
              {completed.length > 0 && (
                <details className="completed-tasks">
                  <summary>{completed.length} previstas y completadas</summary>
                  {completed.map(taskCard)}
                </details>
              )}
            </section>
          )}
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
                      aria-label={`${labelDay(day, { weekday: "long", day: "numeric", month: "long" })}: ${ts.length} actividades, ${rs.length} repasos`}
                      aria-current={day === today ? "date" : undefined}
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
                      <small className="calendar-count">
                        {ts.length} actividades
                      </small>
                      {rs.length > 0 && (
                        <span className="badge calendar-count">
                          {rs.length} repasos
                        </span>
                      )}
                      <span className="calendar-dots" aria-hidden="true">
                        {ts.length > 0 && <i className="planned" />}
                        {rs.length > 0 && <i className="reviews" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {view === "day" && (
                <div>
                  <p className="help">{tasks.filter(t => t.scheduled_day === selected && t.status !== "cancelled").length} actividades · {planMinutes(tasks.filter(t => t.scheduled_day === selected))} min previstos</p>
                  {tasks
                    .filter(
                      (t) =>
                        t.scheduled_day === selected &&
                        t.status !== "cancelled",
                    )
                    .map(taskCard)}
                  <div className="heading-actions">
                    <Button variant="ghost" onClick={() => setEditing("new")}>Añadir una actividad</Button>
                    <Button variant="secondary" onClick={() => setBulkOpen(true)}>Planificar varias en esta fecha</Button>
                  </div>
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
                          time: t.scheduled_time,
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
          {week.sessions.length > 0 && (
            <section className="panel weekly-panel">
              <div className="section-title">
                <h3>Tu ritmo semanal</h3>
                <strong>{minutesLabel(week.total)}</strong>
              </div>
              <div
                className="week-bars"
                role="img"
                aria-label={`Últimos siete días: ${minutesLabel(week.total)}. ${Array.from(
                  { length: 7 },
                  (_, i) => {
                    const d = addDays(today, i - 6);
                    return `${labelDay(d)}: ${minutesLabel(week.byDay[d] ?? 0)}`;
                  },
                ).join(". ")}`}
              >
                {Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map(
                  (day) => (
                    <div key={day} className={day === today ? "current" : ""}>
                      <div className="week-track">
                        <span
                          style={{
                            height: `${Math.min(100, ((week.byDay[day] ?? 0) / Math.max(60, preferences.dailyMinutes * 60)) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>{labelDay(day, { weekday: "narrow" })}</small>
                    </div>
                  ),
                )}
              </div>
              <small className="muted">
                Objetivo semanal: {preferences.weeklyMinutes} min
              </small>
            </section>
          )}
          {stats.sessions.length > 0 && (
            <section className="panel">
              <h3>Lo que ya has hecho hoy</h3>
              <div className="recent-sessions">
                {stats.sessions.map((session) => (
                  <div key={session.id}>
                    <Check size={16} />
                    <span>
                      {
                        {
                          study: "Estudio",
                          review: "Repaso",
                          practice: "Práctica",
                        }[session.kind]
                      }
                      <small>{sessionContents(session.id)}</small>
                    </span>
                    <strong>{minutesLabel(session.duration_seconds)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          {yesterday.length > 0 && (
            <section className="panel">
              <h3>Ayer avanzaste</h3>
              <p className="help">
                {minutesLabel(
                  yesterday.reduce((total, s) => total + s.duration_seconds, 0),
                )}{" "}
                · {yesterday.length}{" "}
                {yesterday.length === 1 ? "actividad" : "actividades"}
              </p>
              <div className="recent-sessions">
                {yesterday.slice(0, 3).map((session) => (
                  <div key={session.id}>
                    <span>{sessionContents(session.id)}</span>
                    <strong>{minutesLabel(session.duration_seconds)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          {recent.length > 0 && (
            <button
              className="progress-link"
              onClick={() => navigate("progress")}
            >
              <ArrowUpRight size={24} />
              <span>
                <strong>
                  {studied}/{b.length} bloques estudiados
                </strong>
                <small>Consulta tus vueltas y tu progreso</small>
              </span>
              <ArrowRight size={18} />
            </button>
          )}
        </aside>
      </div>
      <Modal title="Planificar varias actividades" open={bulkOpen} wide onClose={() => setBulkOpen(false)}>
        {bulkOpen && <BulkPlanForm key={selected} day={selected} onDone={() => setBulkOpen(false)} />}
      </Modal>
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
