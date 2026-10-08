import { useMemo, useState } from "react";
import { Search, RotateCcw, CalendarDays, CheckCircle2 } from "lucide-react";
import { useApp } from "../data/context";
import {
  Button,
  Empty,
  Menu,
  Modal,
  Field,
  ErrorText,
  PageHeader,
  Disclosure,
} from "../components/ui";
import type { SessionOptions } from "../components/SessionForm";
import type { Node } from "../core/types";
import { blocks, getStates, nodePath } from "../core/stats";
import { dayAt, labelDay, daysBetween } from "../core/dates";
import { mastery, priority } from "../core/memory";
import type { Route } from "../App";
export function Reviews({
  start,
  navigate,
}: {
  start: (o: SessionOptions) => void;
  navigate: (r: Route) => void;
}) {
  const { data, oppositionId, preferences, memory } = useApp(),
    today = dayAt(new Date(), preferences.timezone);
  const states = useMemo(() => getStates(data), [data]);
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("scheduled"),
    [subject, setSubject] = useState(""),
    [importance, setImportance] = useState(""),
    [until, setUntil] = useState(""),
    [limit, setLimit] = useState(60),
    [dateNode, setDateNode] = useState<Node | null>(null),
    [date, setDate] = useState(today),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const exam =
    data.oppositions.find((o) => o.id === oppositionId)?.exam_date ?? null;
  const available = blocks(data, oppositionId);
  const subjects = data.nodes.filter(
    (n) =>
      n.opposition_id === oppositionId &&
      n.kind === "container" &&
      !n.parent_id &&
      !n.deleted_at &&
      !n.archived,
  );
  function root(n: Node) {
    let current = n;
    for (let i = 0; current.parent_id && i < 30; i++) {
      const parent = data.nodes.find((x) => x.id === current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return current.id;
  }
  const rows = available
    .filter((n) => {
      const m = states.get(n.id)!;
      return (
        nodePath(n, data.nodes)
          .toLocaleLowerCase("es")
          .includes(q.toLocaleLowerCase("es")) &&
        (!subject || root(n) === subject) &&
        (!importance || n.importance >= Number(importance)) &&
        (!until || (m.due && m.due <= until)) &&
        (filter === "all" ||
          (filter === "excluded"
            ? !m.enabled
            : filter === "difficult"
              ? m.rating === "mal" || m.rating === "regular"
              : filter === "due"
                ? m.enabled && m.due && m.due <= today
                : m.enabled && m.due))
      );
    })
    .sort(
      (a, b) =>
        priority(states.get(b.id)!, today, b.importance, exam) -
        priority(states.get(a.id)!, today, a.importance, exam),
    );
  const groups = [
    {
      title: "Vencidos",
      key: "overdue",
      rows: rows.filter(
        (n) => states.get(n.id)!.due && states.get(n.id)!.due! < today,
      ),
    },
    {
      title: "Para hoy",
      key: "today",
      rows: rows.filter((n) => states.get(n.id)!.due === today),
    },
    {
      title: "Próximos",
      key: "upcoming",
      rows: rows
        .filter((n) => states.get(n.id)!.due && states.get(n.id)!.due! > today)
        .sort((a, b) =>
          states.get(a.id)!.due!.localeCompare(states.get(b.id)!.due!),
        ),
    },
    {
      title: "Sin programar",
      key: "unscheduled",
      rows: rows.filter((n) => !states.get(n.id)!.due),
    },
  ];
  let rendered = 0;
  return (
    <>
      <PageHeader
        title="Recuerda lo que sabes."
        eyebrow="REPASOS"
        description="Cada bloque, a su ritmo. Empieza por lo que necesita atención."
        actions={
          <Button onClick={() => start({ kind: "review" })}>
            <RotateCcw size={18} />
            Registrar repaso
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(60);
            }}
            placeholder="Buscar un bloque…"
            aria-label="Buscar repasos"
          />
        </div>
        <select
          aria-label="Filtrar repasos"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setLimit(60);
          }}
        >
          <option value="scheduled">Programados</option>
          <option value="due">Pendientes y vencidos</option>
          <option value="all">Todos los bloques</option>
          <option value="difficult">Con dificultad</option>
          <option value="excluded">Excluidos</option>
        </select>
      </div>
      {available.length > 0 && (
        <div className="review-filters">
          <Disclosure title="Filtrar por materia, prioridad o fecha">
            <div className="form-grid">
              <Field label="Materia">
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="">Todas las materias</option>
                  {subjects.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prioridad">
                <select
                  value={importance}
                  onChange={(e) => setImportance(e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="4">Alta (4–5)</option>
                  <option value="3">Media y alta (3–5)</option>
                </select>
              </Field>
              <Field label="Repasos previstos hasta">
                <input
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </Field>
              <Button
                variant="ghost"
                onClick={() => {
                  setSubject("");
                  setImportance("");
                  setUntil("");
                }}
              >
                Limpiar filtros
              </Button>
            </div>
          </Disclosure>
        </div>
      )}
      {rows.length ? (
        <div className="review-groups">
          {groups
            .filter((g) => g.rows.length)
            .map((group) => {
              const visible = group.rows.slice(
                0,
                Math.max(0, limit - rendered),
              );
              rendered += visible.length;
              if (!visible.length) return null;
              return (
                <section
                  className={`review-group ${group.key}`}
                  key={group.key}
                >
                  <div className="section-title">
                    <h2>{group.title}</h2>
                    <span className="badge">{group.rows.length}</span>
                  </div>
                  <div className="review-list">
                    {visible.map((n) => {
                      const m = states.get(n.id)!,
                        overdue = m.due && m.due < today;
                      return (
                        <article className="review-row" key={n.id}>
                          <div className="task-copy">
                            <small>
                              {nodePath(n, data.nodes)
                                .split(" / ")
                                .slice(0, -1)
                                .join(" / ") || "Bloque independiente"}
                            </small>
                            <h3>{n.name}</h3>
                            <div className="review-meta">
                              <span className={overdue ? "overdue" : ""}>
                                {m.due
                                  ? overdue
                                    ? `${daysBetween(m.due, today)} ${daysBetween(m.due, today) === 1 ? "día" : "días"} de retraso`
                                    : labelDay(m.due)
                                  : "Sin fecha"}
                              </span>
                              <span>· {n.estimated_minutes} min</span>
                              {m.rating && (
                                <span className={`badge ${m.rating}`}>
                                  {mastery(m)}
                                </span>
                              )}
                              {!m.enabled && (
                                <span className="badge">Excluido</span>
                              )}
                              {m.manual && (
                                <span className="badge">Fecha manual</span>
                              )}
                            </div>
                            <details className="schedule-reason">
                              <summary>Por qué toca esta fecha</summary>
                              <p>
                                {m.reason} · {m.passes}{" "}
                                {m.passes === 1 ? "pasada" : "pasadas"}
                              </p>
                              {n.notes && <p>{n.notes}</p>}
                            </details>
                          </div>
                          <div className="review-actions">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                start({ kind: "review", nodeIds: [n.id] })
                              }
                            >
                              Repasar
                            </Button>
                            <Menu
                              label={`Opciones de ${n.name}`}
                              items={[
                                {
                                  label: "Cambiar fecha / posponer",
                                  action: () => {
                                    setDateNode(n);
                                    setDate(m.due ?? today);
                                    setNote("");
                                    setError("");
                                  },
                                },
                                {
                                  label: m.enabled
                                    ? "Excluir de repetición espaciada"
                                    : "Activar repetición espaciada",
                                  action: () =>
                                    void memory(
                                      n,
                                      m.enabled ? "exclude" : "include",
                                    ),
                                },
                                {
                                  label: "Reiniciar programación",
                                  action: () => {
                                    if (
                                      confirm(
                                        "¿Reiniciar los intervalos? El historial y las vueltas se conservarán.",
                                      )
                                    )
                                      void memory(n, "reset");
                                  },
                                },
                              ]}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          {rows.length > limit && (
            <Button variant="secondary" onClick={() => setLimit((v) => v + 60)}>
              Mostrar más ({rows.length - limit})
            </Button>
          )}
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={<CheckCircle2 size={30} />}
            title={
              filter === "scheduled" || filter === "due"
                ? "Tu memoria empieza con un bloque"
                : "No hay bloques en esta vista"
            }
            description={
              available.length
                ? "Completa el estudio inicial de un bloque para programar su primer repaso, o cambia los filtros."
                : "Añade bloques revisables dentro de tus materias. Después podrás repasarlos sin tener que terminar todo el tema."
            }
            action={
              <Button
                variant="secondary"
                onClick={() =>
                  navigate(available.length ? "study" : "syllabus")
                }
              >
                {available.length ? "Estudiar un bloque" : "Ir al temario"}
              </Button>
            }
          />
        </section>
      )}
      <Modal
        title="Reprogramar repaso"
        open={!!dateNode}
        onClose={() => setDateNode(null)}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await memory(dateNode!, "reschedule", {
                manual_due: date,
                notes: note,
              });
              setDateNode(null);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <strong>{dateNode?.name}</strong>
          <Field label="Nueva fecha prevista">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Motivo (opcional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <p className="help">
            La fecha automática y el historial se conservan. Este cambio quedará
            identificado como una reprogramación manual.
          </p>
          <ErrorText error={error} />
          <div className="modal-footer">
            <Button disabled={busy}>
              {busy ? "Guardando…" : "Guardar fecha"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
