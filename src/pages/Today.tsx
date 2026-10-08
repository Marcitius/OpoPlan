import { useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Play,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useApp } from "../data/context";
import type { SessionOptions } from "../components/SessionForm";
import { Button, Menu, Modal } from "../components/ui";
import { PlanForm } from "../components/PlanForm";
import { BulkPlanForm } from "../components/BulkPlanForm";
import { comparePlanTasks, planMinutes } from "../core/planner";
import { dayPlanSummary, weekStartISO } from "../core/todayOverview";
import { scopeBlockIds } from "../core/planScope";
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
import { blocks, getStates, statistics } from "../core/stats";
import { priority } from "../core/memory";
import { calendarICS, download } from "../core/import";
import type { Route } from "../App";

export function Today({
  start,
  navigate,
  initialCalendar = false,
}: {
  start: (options: SessionOptions) => void;
  navigate: (route: Route) => void;
  initialCalendar?: boolean;
}) {
  const { owner, data, preferences, oppositionId, save, timer, setTimer, notify } = useApp();
  const today = dayAt(new Date(), preferences.timezone);
  const tomorrow = addDays(today, 1);
  const opposition = data.oppositions.find(o => o.id === oppositionId);
  const studyBlocks = blocks(data, oppositionId);
  const states = getStates(data);
  const stats = statistics(data, oppositionId, preferences.timezone, today, today);
  const week = statistics(data, oppositionId, preferences.timezone, addDays(today, -6), today);
  const tasks = active(data.plan_tasks)
    .filter(t => t.opposition_id === oppositionId && t.status !== "cancelled")
    .sort(comparePlanTasks);
  const todaySummary = dayPlanSummary(tasks, today);
  const tomorrowSummary = dayPlanSummary(tasks, tomorrow);
  const todayTasks = todaySummary.activities;
  const tomorrowTasks = tomorrowSummary.activities;
  const pendingToday = todaySummary.pending;
  const completedToday = todaySummary.completed;
  const overdueTasks = tasks.filter(t => t.status === "pending" && t.scheduled_day < today);
  const plannedReviewToday = new Set(todayTasks
    .filter(t => t.kind === "review" && t.status === "pending")
    .flatMap(t => scopeBlockIds(t.node_id, data.nodes, studyBlocks)));
  const plannedMinutes = todaySummary.plannedMinutes;
  const tomorrowMinutes = tomorrowSummary.plannedMinutes;
  const studied = studyBlocks.filter(n => states.get(n.id)?.studied).length;
  const dueReviews = studyBlocks
    .filter(n => {
      const state = states.get(n.id);
      return state?.enabled && state.due && state.due <= today;
    })
    .sort((a, b) =>
      priority(states.get(b.id)!, today, b.importance, opposition?.exam_date ?? null) -
      priority(states.get(a.id)!, today, a.importance, opposition?.exam_date ?? null)
    );
  const unplannedDueReviews = dueReviews.filter(n => !plannedReviewToday.has(n.id));
  const isStudyDay = preferences.studyDays.includes(new Date(today + "T12:00:00Z").getUTCDay());
  const dailyTarget = isStudyDay ? preferences.dailyMinutes : 0;
  const percent = dailyTarget ? Math.min(100, Math.round(stats.total / (dailyTarget * 60) * 100)) : 0;
  const recent = active(data.sessions)
    .filter(s => s.opposition_id === oppositionId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
  const noSetup = !studyBlocks.length && !tasks.length && !recent.length;

  const [selected, setSelected] = useState(today);
  const [calendarMode, setCalendarMode] = useState<"week" | "month">("week");
  const [editing, setEditing] = useState<PlanTask | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const agendaRef = useRef<HTMLElement>(null);

  function openPlanner(date: string) {
    setSelected(date);
    setBulkOpen(true);
  }
  function showAgenda(date = today) {
    setSelected(date);
    // Allow React to update before scrolling. The calendar already exists in the DOM.
    agendaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function taskIds(t: PlanTask): string[] {
    return scopeBlockIds(t.node_id, data.nodes, studyBlocks);
  }
  async function beginTask(t: PlanTask) {
    if (timer) {
      notify("Ya tienes una sesión abierta.");
      navigate("study");
      return;
    }
    const ids = taskIds(t);
    if (t.kind !== "practice" && !ids.length) {
      start({ kind: t.kind, taskId: t.id });
      return;
    }
    await setTimer({
      id: crypto.randomUUID(),
      owner_id: owner,
      oppositionId,
      kind: t.kind,
      nodeIds: ids,
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
  function taskRow(t: PlanTask) {
    const icon = t.kind === "study" ? <BookOpen size={18} /> : t.kind === "review" ? <RotateCcw size={18} /> : <ClipboardCheck size={18} />;
    return (
      <div className={`home-task ${t.status === "completed" ? "is-completed" : ""}`} key={t.id}>
        <span className={`home-task-icon ${t.kind}`}>{t.status === "completed" ? <Check size={18} /> : icon}</span>
        <div className="home-task-content">
          <strong>{t.name}</strong>
          <small>
            {t.scheduled_time ? `${t.scheduled_time.slice(0, 5)} · ` : ""}
            {t.estimated_minutes} min · {t.kind === "study" ? "Estudio" : t.kind === "review" ? "Repaso" : "Práctica"}
          </small>
          {t.notes.trim() && <small className="home-task-note">{t.notes}</small>}
          {t.scheduled_day < today && t.status === "pending" && (
            <small className="home-task-overdue">Pendiente desde {labelDay(t.scheduled_day)}</small>
          )}
        </div>
        <div className="home-task-actions">
          {t.status === "pending" && (
            <Button variant="secondary" onClick={() => void beginTask(t)}><Play size={15} /> Iniciar</Button>
          )}
          <Menu
            label={`Opciones de ${t.name}`}
            items={[
              { label: "Editar / cambiar fecha", action: () => { setSelected(t.scheduled_day); setEditing(t); } },
              ...(t.status === "pending" ? [
                {
                  label: "Registrar realizada",
                  action: () => start({ kind: t.kind, nodeIds: taskIds(t), taskId: t.id, test: t.kind === "practice" }),
                },
                {
                  label: "Posponer a mañana",
                  action: () => void save("plan_tasks", { ...t, scheduled_day: tomorrow }),
                },
                {
                  label: "Cancelar actividad",
                  action: () => {
                    if (confirm("¿Cancelar esta actividad prevista?"))
                      void save("plan_tasks", { ...t, status: "cancelled" });
                  },
                  danger: true,
                },
              ] : []),
            ]}
          />
        </div>
      </div>
    );
  }
  function exportCalendar() {
    download(
      "OpoPlan-agenda.ics",
      calendarICS([
        ...tasks.filter(t => t.status === "pending").map(t => ({
          id: t.id,
          name: t.name,
          day: t.scheduled_day,
          time: t.scheduled_time,
          minutes: t.estimated_minutes,
          notes: t.notes,
        })),
        ...studyBlocks
          .filter(n => states.get(n.id)?.enabled && states.get(n.id)?.due)
          .map(n => ({
            id: n.id,
            name: "Repaso · " + n.name,
            day: states.get(n.id)!.due!,
            minutes: n.estimated_minutes,
            notes: states.get(n.id)!.reason,
          })),
      ]),
      "text/calendar",
    );
  }

  // A weekly calendar must start on the Monday of the selected week,
  // not the Monday of the selected month.
  const selectedWeekStart = weekStartISO(selected);
  const dateCells = calendarMode === "month"
    ? Array.from({ length: 42 }, (_, i) => addDays(monthGridStart(selected), i))
    : Array.from({ length: 7 }, (_, i) => addDays(selectedWeekStart, i));
  const selectedTasks = tasks.filter(t => t.scheduled_day === selected);
  const selectedMonth = labelDay(selected, { month: "long", year: "numeric" });
  const plannedReviewIds = new Set(selectedTasks.filter(t => t.kind === "review" && t.node_id).flatMap(t => taskIds(t)));
  const unplannedReviews = studyBlocks.filter(n => states.get(n.id)?.enabled && states.get(n.id)?.due === selected && !plannedReviewIds.has(n.id));

  const agenda = (
    <section className="panel home-agenda" ref={agendaRef} aria-label="Agenda de estudio">
      <div className="home-section-header">
        <div><h2>Agenda</h2><p>Elige un día y consulta lo que has previsto.</p></div>
        <div className="home-segmented" aria-label="Vista del calendario">
          <button aria-pressed={calendarMode === "week"} className={calendarMode === "week" ? "selected" : ""} onClick={() => setCalendarMode("week")}>Semana</button>
          <button aria-pressed={calendarMode === "month"} className={calendarMode === "month" ? "selected" : ""} onClick={() => setCalendarMode("month")}>Mes</button>
        </div>
      </div>
      <div className="home-agenda-controls">
        <button className="iconbtn" aria-label="Periodo anterior" onClick={() => setSelected(calendarMode === "month" ? addMonths(selected, -1) : addDays(selected, -7))}><ChevronLeft size={19}/></button>
        <label className="home-agenda-date"><span>{selectedMonth}</span><input type="date" aria-label="Elegir fecha de agenda" value={selected} onChange={e => e.target.value && setSelected(e.target.value)} /></label>
        <button className="iconbtn" aria-label="Periodo siguiente" onClick={() => setSelected(calendarMode === "month" ? addMonths(selected, 1) : addDays(selected, 7))}><ChevronRight size={19}/></button>
        <button className="home-today-link" onClick={() => setSelected(today)}>Hoy</button>
      </div>
      <div className={`home-calendar ${calendarMode}`}>
        {dateCells.map(day => {
          const count = tasks.filter(t => t.scheduled_day === day).length;
          const scheduled = studyBlocks.some(n => states.get(n.id)?.enabled && states.get(n.id)?.due === day);
          return <button
            type="button" key={day}
            aria-label={`${labelDay(day, { weekday: "long", day: "numeric", month: "long" })}: ${count} actividades${scheduled ? ", repasos automáticos" : ""}`}
            aria-pressed={day === selected}
            aria-current={day === today ? "date" : undefined}
            className={`${day === selected ? "selected" : ""} ${day === today ? "current" : ""} ${calendarMode === "month" && day.slice(0,7) !== selected.slice(0,7) ? "outside" : ""}`}
            onClick={() => setSelected(day)}>
            <span className="home-calendar-weekday">{labelDay(day, { weekday: "short" }).replace(".", "")}</span>
            <strong>{Number(day.slice(-2))}</strong>
            <span className="home-calendar-dots" aria-hidden="true">
              {count > 0 && <i className="planned"/>}{scheduled && <i className="review"/>}
            </span>
          </button>;
        })}
      </div>
      <div className="home-agenda-day">
        <div className="home-section-header">
          <div>
            <h3>{labelDay(selected, { weekday: "long", day: "numeric", month: "long" })}</h3>
            <p>{selectedTasks.length} {selectedTasks.length === 1 ? "actividad" : "actividades"} · {planMinutes(selectedTasks)} min previstos{unplannedReviews.length ? ` · ${unplannedReviews.length} repasos sugeridos` : ""}</p>
          </div>
          <Button variant="secondary" onClick={() => openPlanner(selected)}><Plus size={16}/> Planificar</Button>
        </div>
        {selectedTasks.length ? selectedTasks.map(taskRow) : (
          <p className="home-inline-empty">Sin actividades planificadas para este día.</p>
        )}
        {unplannedReviews.length > 0 && (
          <div className="home-auto-reviews">
            <strong>{unplannedReviews.length} {unplannedReviews.length === 1 ? "repaso automático" : "repasos automáticos"} para esta fecha</strong>
            <p>Los repasos sugeridos no son actividades planificadas. Se registran cuando los realices.</p>
            {unplannedReviews.slice(0, 3).map(n => <div className="home-auto-review" key={n.id}><span>{n.name}</span><Button variant="ghost" onClick={() => start({ kind: "review", nodeIds: [n.id] })}>Repasar</Button></div>)}
            {unplannedReviews.length > 3 && <button className="textbtn" onClick={() => navigate("reviews")}>Ver todos los repasos <ArrowRight size={16}/></button>}
          </div>
        )}
        <div className="home-agenda-bottom">
          <button className="textbtn" onClick={() => { setEditing("new"); }}>Añadir una actividad <Plus size={15}/></button>
          <button className="textbtn" onClick={exportCalendar}><Download size={15}/> Exportar .ics</button>
        </div>
      </div>
    </section>
  );

  return (
    <>
      <div className="page-heading home-heading">
        <div>
          <div className="eyebrow">{labelDay(today, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1>{initialCalendar ? "Organiza tus días." : "Tu jornada."}</h1>
          <p>{opposition?.name ?? "Tu preparación"}{!initialCalendar && (isStudyDay ? " · Lo importante, a la vista." : " · Hoy es día de descanso.")}</p>
        </div>
        <div className="home-heading-actions">
          {initialCalendar ? (
            <Button onClick={() => openPlanner(selected)}><Plus size={17}/> Planificar día</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => showAgenda()}><CalendarDays size={17}/> Agenda</Button>
              <Button onClick={() => openPlanner(tomorrow)}><Plus size={17}/> Planificar mañana</Button>
            </>
          )}
        </div>
      </div>
      {initialCalendar ? agenda : (
        <div className="home-dashboard">
          {noSetup && (
            <section className="home-onboarding">
              <BookOpen size={22}/>
              <div><h2>Prepara tu primer bloque de estudio</h2><p>Importa o crea tu temario para empezar a registrar sesiones y programar repasos.</p></div>
              <Button onClick={() => navigate("syllabus")}>Ir al temario <ArrowRight size={16}/></Button>
            </section>
          )}
          <section className="home-summary" aria-label="Resumen de hoy">
            <div className="home-summary-lead"><span>Hoy llevas</span><strong>{minutesLabel(stats.total)}</strong><small>{dailyTarget ? `de ${dailyTarget} min de objetivo` : "Sin objetivo para hoy"}</small></div>
            <div className="home-summary-metrics">
              <div><strong>{completedToday.length}/{todayTasks.length}</strong><small>Actividades completadas</small></div>
              <div><strong>{plannedMinutes} min</strong><small>Tiempo previsto</small></div>
              <div><strong>{dueReviews.length}</strong><small>Repasos pendientes</small></div>
            </div>
            <div className="home-summary-progress" role="progressbar" aria-label="Objetivo diario de estudio" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }}/></div>
          </section>
          <div className="home-quick-actions">
            <Button onClick={() => navigate("study")}><Play size={17}/> {timer ? "Continuar sesión" : "Empezar a estudiar"}</Button>
            <Button variant="secondary" onClick={() => start({ kind: "review" })}><RotateCcw size={17}/> Registrar repaso</Button>
          </div>
          <div className="home-main-grid">
            <div className="home-primary-stack">
              <section className="panel home-panel">
                <div className="home-section-header"><div><h2>Tu plan de hoy</h2><p>{pendingToday.length ? `${pendingToday.length} pendientes · ${completedToday.length} completadas` : completedToday.length ? "Has completado todas las actividades previstas." : "Organiza qué quieres hacer hoy."}</p></div><button className="textbtn" onClick={() => openPlanner(today)}><Plus size={17}/> Añadir</button></div>
                {pendingToday.length ? pendingToday.map(taskRow) : (
                  <div className="home-inline-empty">{todayTasks.length ? "No te quedan actividades planificadas pendientes." : "Todavía no has programado actividades para hoy."}</div>
                )}
                {!!completedToday.length && <details className="home-completed"><summary>{completedToday.length} {completedToday.length === 1 ? "actividad completada" : "actividades completadas"}</summary>{completedToday.map(taskRow)}</details>}
                {!!overdueTasks.length && <details className="home-completed overdue"><summary>{overdueTasks.length} {overdueTasks.length === 1 ? "actividad de días anteriores pendiente" : "actividades de días anteriores pendientes"}</summary>{overdueTasks.map(taskRow)}</details>}
              </section>
              <section className="panel home-panel home-review-panel">
                <div className="home-section-header"><div><h2>Repasos por hacer</h2><p>{unplannedDueReviews.length ? `${unplannedDueReviews.length} bloques necesitan atención.` : dueReviews.length ? "Los repasos pendientes ya figuran en tu plan de hoy." : studied ? "No tienes repasos automáticos pendientes." : "Todavía no has activado los repasos automáticos."}</p></div>{dueReviews.length > 0 && <button className="textbtn" onClick={() => navigate("reviews")}>Ver todos <ArrowRight size={16}/></button>}</div>
                {unplannedDueReviews.length ? unplannedDueReviews.slice(0, 3).map(n => {
                  const state = states.get(n.id)!;
                  const late = !!state.due && state.due < today;
                  return <div className="home-review-row" key={n.id}><span className={`home-review-symbol ${late ? "late" : ""}`}><RotateCcw size={18}/></span><div><strong>{n.name}</strong><small>{late ? `${daysBetween(state.due!, today)} días de retraso` : "Para hoy"} · {n.estimated_minutes} min</small></div><Button variant="secondary" onClick={() => start({ kind: "review", nodeIds: [n.id] })}>Repasar</Button></div>;
                }) : <p className="home-inline-empty">{studied ? "No hay otros repasos vencidos ni previstos para hoy." : "Cuando marques un estudio inicial como completado, OpoPlan calculará su primer repaso."}</p>}
              </section>
            </div>
            <aside className="home-secondary-stack">
              <section className="panel home-panel home-tomorrow">
                <div className="home-section-header"><div><span className="eyebrow">PRÓXIMO DÍA</span><h2>Mañana</h2><p>{labelDay(tomorrow, { weekday: "long", day: "numeric", month: "long" })}</p></div><button aria-label="Consultar mañana en agenda" className="iconbtn" onClick={() => showAgenda(tomorrow)}><ChevronRight size={20}/></button></div>
                <p className="home-tomorrow-total"><strong>{tomorrowTasks.length}</strong> {tomorrowTasks.length === 1 ? "actividad" : "actividades"} · <strong>{tomorrowMinutes} min</strong> previstos</p>
                {tomorrowTasks.length ? <div className="home-tomorrow-list">{tomorrowTasks.slice(0, 3).map(t => <div key={t.id}><span>{t.scheduled_time?.slice(0, 5) || "—"}</span><strong>{t.name}</strong></div>)}{tomorrowTasks.length > 3 && <small>Y {tomorrowTasks.length - 3} más</small>}</div> : <p className="home-inline-empty">Mañana todavía no tiene actividades previstas.</p>}
                <Button variant="secondary" onClick={() => openPlanner(tomorrow)}><Plus size={16}/> {tomorrowTasks.length ? "Añadir actividades" : "Planificar mañana"}</Button>
              </section>
              {(stats.sessions.length > 0 || week.sessions.length > 0) && <section className="panel home-panel home-activity-mini"><div className="home-section-header"><div><h2>Actividad real</h2><p>Lo que has registrado, no solo planificado.</p></div><button className="textbtn" onClick={() => navigate("progress")}>Progreso <ArrowRight size={15}/></button></div><div className="home-activity-stats"><div><strong>{stats.sessions.length}</strong><small>Sesiones hoy</small></div><div><strong>{minutesLabel(week.total)}</strong><small>Últimos 7 días</small></div></div></section>}
            </aside>
          </div>
          {agenda}
        </div>
      )}
      <Modal title="Planificar varias actividades" open={bulkOpen} wide onClose={() => setBulkOpen(false)}>
        {bulkOpen && <BulkPlanForm key={selected} day={selected} onDone={() => setBulkOpen(false)} />}
      </Modal>
      <Modal title={editing === "new" ? "Planificar actividad" : "Editar actividad"} open={!!editing} onClose={() => setEditing(null)}>
        {editing && <PlanForm key={editing === "new" ? `new-${selected}` : editing.id} task={editing === "new" ? undefined : editing} day={selected} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}
