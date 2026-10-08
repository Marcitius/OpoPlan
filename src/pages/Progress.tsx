import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useApp, change } from "../data/context";
import {
  Stat,
  ProgressBar,
  Button,
  Menu,
  Modal,
  Field,
  ErrorText,
  Empty,
} from "../components/ui";
import { active, base } from "../core/types";
import type { Session, SessionKind } from "../core/types";
import {
  blocks,
  getStates,
  coverage,
  statistics,
  nodePath,
  descendants,
} from "../core/stats";
import {
  dayAt,
  addDays,
  daysBetween,
  labelDay,
  minutesLabel,
  fromLocal,
  localInput,
} from "../core/dates";
import { effectiveEvents, mastery } from "../core/memory";
import { toCSV, download } from "../core/import";
const colors = ["#216b58", "#a2bc36", "#c46252"];
import type { Route } from "../App";
export function Progress({ navigate }: { navigate: (r: Route) => void }) {
  const { data, oppositionId, preferences, commit, owner } = useApp(),
    today = dayAt(new Date(), preferences.timezone),
    [from, setFrom] = useState(addDays(today, -29)),
    [to, setTo] = useState(today),
    [kind, setKind] = useState<SessionKind | "all">("all"),
    [subject, setSubject] = useState(""),
    [editing, setEditing] = useState<Session | null>(null),
    [minutes, setMinutes] = useState(0),
    [date, setDate] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState("");
  const [tab, setTab] = useState("overview"),
    [boardLimit, setBoardLimit] = useState(60);
  const hasActivity = active(data.sessions).some(
    (s) => s.opposition_id === oppositionId,
  );
  const stats = statistics(
      data,
      oppositionId,
      preferences.timezone,
      from,
      to,
      kind,
      subject,
    ),
    b = blocks(data, oppositionId),
    states = getStates(data),
    cov = coverage(data, oppositionId),
    exam = data.oppositions.find((o) => o.id === oppositionId)?.exam_date;
  const allowedIds = subject
    ? new Set([subject, ...descendants(subject, data.nodes).map((n) => n.id)])
    : null;
  const events = effectiveEvents(
    data.memory_events.filter(
      (e) =>
        (!allowedIds || allowedIds.has(e.node_id)) &&
        data.nodes.find((n) => n.id === e.node_id)?.opposition_id ===
          oppositionId,
    ),
  );
  const reviews = events
    .filter(
      (e) => e.kind === "review" && e.study_day >= from && e.study_day <= to,
    )
    .filter(
      (e, i, a) =>
        !a
          .slice(i + 1)
          .some((x) => x.node_id === e.node_id && x.study_day === e.study_day),
    );
  const monthly = daysBetween(from, to) > 90;
  const chartDays = monthly
    ? Object.entries(
        Object.entries(stats.byDay).reduce<Record<string, number>>(
          (a, [day, seconds]) => {
            const month = day.slice(0, 7);
            a[month] = (a[month] ?? 0) + seconds;
            return a;
          },
          {},
        ),
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, seconds]) => ({
          day: labelDay(month + "-01", { month: "short", year: "numeric" }),
          minutes: Math.round(seconds / 60),
        }))
    : Array.from({ length: Math.max(0, daysBetween(from, to) + 1) }, (_, i) => {
        const day = addDays(from, i);
        return {
          day: labelDay(day, { day: "numeric", month: "short" }),
          minutes: Math.round((stats.byDay[day] ?? 0) / 60),
        };
      });
  const pie = (["bien", "regular", "mal"] as const).map((r) => ({
    name: r.toUpperCase(),
    value: reviews.filter((e) => e.rating === r).length,
  }));
  const pending = b.filter(
    (n) =>
      states.get(n.id)?.enabled &&
      states.get(n.id)?.due &&
      states.get(n.id)!.due! <= today,
  );
  const studied = b.filter((n) => states.get(n.id)?.studied);
  const tasks = active(data.plan_tasks).filter(
    (t) =>
      t.opposition_id === oppositionId &&
      t.scheduled_day >= from &&
      t.scheduled_day <= to &&
      t.status !== "cancelled" &&
      (!subject || (t.node_id && allowedIds!.has(t.node_id))) &&
      (kind === "all" || t.kind === kind),
  );
  const planned = tasks.reduce((sum, t) => sum + t.estimated_minutes, 0),
    completed = tasks.filter((t) => t.status === "completed").length;
  const firstStudies = b
    .map(
      (n) =>
        events
          .filter((e) => e.node_id === n.id && e.kind === "study")
          .sort((a, c) => a.occurred_at.localeCompare(c.occurred_at))[0],
    )
    .filter(
      (e) => e && e.study_day >= addDays(today, -27) && e.study_day <= today,
    );
  const pace = firstStudies.length / 28;
  const projected =
    exam && pace
      ? Math.min(
          b.length,
          studied.length +
            Math.floor(Math.max(0, daysBetween(today, exam)) * pace),
        )
      : null;
  async function deleteSession(s: Session) {
    if (
      !confirm(
        "¿Anular esta sesión? Se conservará constancia de la corrección y se retirará de las estadísticas.",
      )
    )
      return;
    const now = new Date().toISOString(),
      rows = active(data.session_blocks).filter((a) => a.session_id === s.id),
      mem = effectiveEvents(
        data.memory_events.filter((e) => e.session_id === s.id),
      ).filter((e) => e.kind === "study" || e.kind === "review");
    const changes = [
      change("sessions", { ...s, deleted_at: now }),
      ...rows.map((r) => change("session_blocks", { ...r, deleted_at: now })),
      ...active(data.test_results)
        .filter((t) => t.session_id === s.id)
        .map((t) => change("test_results", { ...t, deleted_at: now })),
      ...mem.map((e) =>
        change("memory_events", {
          ...base(owner),
          node_id: e.node_id,
          session_id: null,
          kind: "void",
          occurred_at: now,
          study_day: today,
          timezone: preferences.timezone,
          rating: null,
          notes: "Sesión anulada",
          manual_due: null,
          target_event_id: e.id,
          rules: preferences.rules,
        }),
      ),
    ];
    const task = data.plan_tasks.find((t) => t.completed_session_id === s.id);
    if (task)
      changes.push(
        change("plan_tasks", {
          ...task,
          status: "pending",
          completed_session_id: null,
        }),
      );
    await commit(changes);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REGISTROS REALES, PERSPECTIVA CLARA</div>
          <h1>Cada avance cuenta.</h1>
          <p>
            Tiempo, vueltas y memoria. Cada indicador responde a una pregunta
            distinta.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            download("OpoPlan-sesiones.csv", toCSV(stats.sessions), "text/csv")
          }
        >
          Exportar sesiones CSV
        </Button>
      </div>
      <div className="toolbar filters">
        <Field label="Desde">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              if (e.target.value) setFrom(e.target.value);
            }}
          />
        </Field>
        <Field label="Hasta">
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              if (e.target.value) setTo(e.target.value);
            }}
          />
        </Field>
        <Field label="Actividad">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="all">Todas</option>
            <option value="study">Estudio</option>
            <option value="review">Repaso</option>
            <option value="practice">Práctica</option>
          </select>
        </Field>
        <Field label="Materia / tema">
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">Todos</option>
            {active(data.nodes)
              .filter(
                (n) =>
                  n.opposition_id === oppositionId && n.kind === "container",
              )
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {nodePath(n, data.nodes)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {!hasActivity && (
        <section className="panel">
          <Empty
            title="Tu esfuerzo tendrá perspectiva"
            description="Al registrar estudio verás tu tiempo, la cobertura por vueltas y cómo recuerdas cada bloque. Empieza con una sesión; no hace falta completar un tema."
            action={
              <>
                <Button onClick={() => navigate("study")}>
                  Registrar mi primera sesión
                </Button>
                <Button variant="ghost" onClick={() => navigate("syllabus")}>
                  Ver mi temario
                </Button>
              </>
            }
          />
        </section>
      )}
      {hasActivity && (
        <>
          <div
            className="segmented progress-tabs"
            aria-label="Secciones de progreso"
          >
            {[
              { id: "overview", name: "Resumen" },
              { id: "memory", name: "Memoria" },
              { id: "planning", name: "Plan" },
              { id: "history", name: "Historial" },
            ].map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "selected" : ""}
                aria-pressed={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="stat-grid">
            <Stat
              label="TIEMPO DEL PERIODO"
              value={minutesLabel(stats.total)}
              detail={`${stats.sessions.length} sesiones reales`}
              accent
            />
            <Stat
              label="DÍAS ACTIVOS"
              value={stats.activeDays}
              detail={`Racha más larga del periodo: ${stats.bestStreak} días`}
            />
            <Stat
              label="MEMORIA"
              value={reviews.length}
              detail="Repasos efectivos · una pasada por bloque y día"
            />
            <Stat
              label="PLANIFICACIÓN"
              value={`${tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%`}
              detail={`${completed}/${tasks.length} previstas completadas`}
            />
          </div>
          <div className="analytics-grid">
            <section className="panel chart-panel" hidden={tab !== "overview"}>
              <h2>Tiempo de estudio</h2>
              {monthly && (
                <p className="help">
                  Agrupado por meses; incluye todo el periodo seleccionado.
                </p>
              )}
              {stats.total > 0 ? (
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartDays}>
                      <CartesianGrid vertical={false} stroke="var(--line)" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12 }}
                        minTickGap={24}
                      />
                      <YAxis unit=" m" tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar
                        dataKey="minutes"
                        name="Minutos"
                        fill="var(--green)"
                        isAnimationActive={false}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="quiet-empty">
                  No hay sesiones en este periodo. Amplía las fechas para
                  consultar tu actividad.
                </p>
              )}
              <div className="time-breakdown">
                {Object.entries(stats.byKind).map(([k, v]) => (
                  <div key={k}>
                    <span>
                      {
                        {
                          study: "Estudio nuevo",
                          review: "Repaso",
                          practice: "Práctica",
                        }[k as SessionKind]
                      }
                    </span>
                    <strong>{minutesLabel(v)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel" hidden={tab !== "overview"}>
              <h2>Tiempo por materia</h2>
              {Object.entries(stats.bySubject)
                .sort((a, c) => c[1] - a[1])
                .map(([name, seconds]) => (
                  <div className="subject-stat" key={name}>
                    <div>
                      <strong>{name}</strong>
                      <span>{minutesLabel(seconds)}</span>
                    </div>
                    <ProgressBar
                      value={stats.total ? (seconds / stats.total) * 100 : 0}
                    />
                  </div>
                ))}
              {!stats.total && (
                <p className="muted">
                  Se calcula con el tiempo repartido entre bloques.
                </p>
              )}
            </section>
            <section className="panel" hidden={tab !== "overview"}>
              <h2>Cobertura por vuelta</h2>
              <p className="help">
                Temario activo actual. Los filtros de fecha no alteran las
                vueltas acumuladas.
              </p>
              {cov.map((c) => (
                <div className="coverage-row" key={c.pass}>
                  <div>
                    <strong>
                      {c.pass === 1
                        ? "1.ª vuelta · estudio inicial"
                        : `${c.pass}.ª vuelta`}
                    </strong>
                    <span>
                      {c.count}/{c.total} bloques
                    </span>
                  </div>
                  <ProgressBar
                    value={c.total ? (c.count / c.total) * 100 : 0}
                  />
                </div>
              ))}
              <p className="help">
                Añadir bloques cambia el denominador actual. Las instantáneas
                guardan la cobertura que existía al registrar cada sesión.
              </p>
            </section>
            <section className="panel" hidden={tab !== "memory"}>
              <h2>Cómo estás recordando</h2>
              {reviews.length ? (
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={pie}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="50%"
                        outerRadius="75%"
                        paddingAngle={3}
                      >
                        {pie.map((v, i) => (
                          <Cell key={v.name} fill={colors[i]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty
                  title="Todavía sin valoraciones"
                  description="Registra Mal, Regular o Bien al terminar un repaso."
                />
              )}
              <p className="help">
                El dominio depende del recuerdo indicado, no del número de
                vueltas.
              </p>
            </section>
            <section className="panel" hidden={tab !== "planning"}>
              <h2>Previsto y realizado</h2>
              <div className="comparison">
                <div>
                  <span>Previsto</span>
                  <strong>{Math.round((planned / 60) * 10) / 10} h</strong>
                </div>
                <div>
                  <span>Real registrado</span>
                  <strong>
                    {Math.round((stats.total / 3600) * 10) / 10} h
                  </strong>
                </div>
              </div>
              <p className="help">
                El tiempo real incluye actividades no planificadas. Cada sesión
                suma una sola vez.
              </p>
              <h3>Carga de los próximos 14 días</h3>
              <div className="chart small">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Array.from({ length: 14 }, (_, i) => {
                      const day = addDays(today, i);
                      return {
                        day: labelDay(day, { day: "numeric", month: "short" }),
                        minutes: b
                          .filter(
                            (n) =>
                              states.get(n.id)?.enabled &&
                              states.get(n.id)?.due === day,
                          )
                          .reduce((sum, n) => sum + n.estimated_minutes, 0),
                      };
                    })}
                  >
                    <XAxis
                      dataKey="day"
                      minTickGap={15}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Bar
                      dataKey="minutes"
                      fill="var(--green)"
                      isAnimationActive={false}
                      name="Minutos estimados"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="help">
                Incluye la próxima fecha de cada bloque. Los intervalos
                posteriores dependerán de tus valoraciones.
              </p>
            </section>
            <section className="panel" hidden={tab !== "planning"}>
              <h2>Hasta el examen</h2>
              {exam ? (
                <>
                  <p>
                    Examen previsto:{" "}
                    <strong>
                      {labelDay(exam, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </strong>
                  </p>
                  <strong className="projection">
                    {projected === null
                      ? "Faltan registros para estimar"
                      : `${projected}/${b.length} bloques`}
                  </strong>
                  <p className="help">
                    Estimación de cobertura inicial con la media de los últimos
                    28 días: {pace.toFixed(2)} bloques nuevos/día. Supone
                    mantener ese ritmo; no considera cambios de dificultad ni
                    nuevos bloques.
                  </p>
                </>
              ) : (
                <p className="muted">
                  Añade una fecha de examen en Configuración para consultar la
                  estimación.
                </p>
              )}
              <p>
                {pending.length} bloques pendientes de repaso ·{" "}
                {b.filter((n) => states.get(n.id)?.rating === "mal").length} con
                dominio bajo.
              </p>
              <div className="block-board">
                {b.slice(0, boardLimit).map((n) => (
                  <div
                    key={n.id}
                    title={nodePath(n, data.nodes)}
                    className={`board-item ${states.get(n.id)?.rating ?? (states.get(n.id)?.studied ? "studied" : "new")}`}
                  >
                    <strong>{n.name}</strong>
                    <small>
                      {states.get(n.id)?.due && states.get(n.id)!.due! < today
                        ? "Repaso vencido"
                        : states.get(n.id)?.due === today
                          ? "Repaso pendiente"
                          : states.get(n.id)?.studied
                            ? mastery(states.get(n.id)!)
                            : active(data.session_blocks).some(
                                  (a) => a.node_id === n.id,
                                )
                              ? "En estudio"
                              : "No empezado"}
                    </small>
                  </div>
                ))}
              </div>
              {b.length > boardLimit && (
                <Button
                  variant="ghost"
                  onClick={() => setBoardLimit((v) => v + 60)}
                >
                  Mostrar más bloques
                </Button>
              )}
            </section>
          </div>
          <section className="panel history-panel" hidden={tab !== "history"}>
            <div className="section-title">
              <h2>Historial de actividad</h2>
              <span className="badge">{stats.sessions.length} sesiones</span>
            </div>
            <p className="help">
              Al filtrar una materia, el total usa solo su tiempo asignado. La
              duración de cada fila sigue mostrando la sesión completa.
            </p>
            {stats.sessions
              .slice()
              .sort((a, c) => c.started_at.localeCompare(a.started_at))
              .map((s) => (
                <div className="history-row" key={s.id}>
                  <strong>
                    {labelDay(dayAt(s.started_at, preferences.timezone))}
                  </strong>
                  <span>
                    {
                      {
                        study: "Estudio nuevo",
                        review: "Repaso",
                        practice: "Práctica",
                      }[s.kind]
                    }
                    <small>
                      {active(data.session_blocks)
                        .filter((a) => a.session_id === s.id)
                        .map(
                          (a) =>
                            data.nodes.find((n) => n.id === a.node_id)?.name,
                        )
                        .join(" · ") ||
                        s.notes ||
                        "Sin bloque relacionado"}
                    </small>
                  </span>
                  <strong>{minutesLabel(s.duration_seconds)}</strong>
                  <Menu
                    items={[
                      {
                        label: "Corregir tiempo / fecha / notas",
                        action: () => {
                          setEditing(s);
                          setMinutes(s.duration_seconds / 60);
                          setDate(
                            localInput(s.started_at, preferences.timezone),
                          );
                          setNotes(s.notes);
                          setError("");
                        },
                      },
                      {
                        label: "Anular sesión",
                        action: () => void deleteSession(s),
                        danger: true,
                      },
                    ]}
                  />
                </div>
              ))}
            {!stats.sessions.length && (
              <Empty
                title="Sin actividad en este periodo"
                description="Amplía las fechas o registra tu primera sesión."
              />
            )}
          </section>
        </>
      )}
      <Modal
        title="Corregir sesión"
        open={!!editing}
        onClose={() => setEditing(null)}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const duration = Math.round(minutes * 60);
              if (duration < 1)
                throw new Error("La duración debe ser mayor que cero.");
              const s = editing!,
                dateChanged =
                  date !== localInput(s.started_at, preferences.timezone),
                changedDate = dateChanged
                  ? fromLocal(date, preferences.timezone)
                  : s.started_at;
              if (
                dateChanged &&
                data.memory_events.some((e) => e.session_id === s.id)
              )
                throw new Error(
                  "Esta sesión tiene eventos de memoria. Para cambiar su fecha, anúlala y regístrala de nuevo con la fecha real.",
                );
              const assignments = active(data.session_blocks).filter(
                (a) => a.session_id === s.id,
              );
              let spent = 0;
              const rows = assignments.map((a, i) => {
                const allocated =
                  i === assignments.length - 1
                    ? duration - spent
                    : Math.floor(
                        (duration * a.allocated_seconds) / s.duration_seconds,
                      );
                spent += allocated;
                return { ...a, allocated_seconds: allocated };
              });
              await commit([
                change("sessions", {
                  ...s,
                  duration_seconds: duration,
                  started_at: changedDate,
                  ended_at:
                    s.source === "timer" &&
                    !dateChanged &&
                    duration <=
                      (new Date(s.ended_at).getTime() -
                        new Date(s.started_at).getTime()) /
                        1000
                      ? s.ended_at
                      : new Date(
                          new Date(changedDate).getTime() + duration * 1000,
                        ).toISOString(),
                  notes,
                }),
                ...rows.map((r) => change("session_blocks", r)),
              ]);
              setEditing(null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <Field label="Minutos reales">
            <input
              type="number"
              min="0.1"
              max="10080"
              step="0.1"
              required
              value={minutes}
              onChange={(e) => setMinutes(+e.target.value)}
            />
          </Field>
          <Field label="Fecha real">
            <input
              type="datetime-local"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <p className="help">
            El tiempo asignado a los bloques se ajusta proporcionalmente. Las
            correcciones quedan en el registro de operaciones.
          </p>
          <ErrorText error={error} />
          <Button>Guardar corrección</Button>
        </form>
      </Modal>
    </>
  );
}
