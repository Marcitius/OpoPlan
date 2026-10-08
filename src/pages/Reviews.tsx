import { useState } from "react";
import { Search, RotateCcw, CalendarDays } from "lucide-react";
import { useApp } from "../data/context";
import { Button, Empty, Menu, Modal, Field, ErrorText } from "../components/ui";
import type { SessionOptions } from "../components/SessionForm";
import type { Node } from "../core/types";
import { blocks, getStates, nodePath } from "../core/stats";
import { dayAt, labelDay } from "../core/dates";
import { mastery, priority } from "../core/memory";
export function Reviews({ start }: { start: (o: SessionOptions) => void }) {
  const { data, oppositionId, preferences, memory } = useApp(),
    today = dayAt(new Date(), preferences.timezone),
    states = getStates(data);
  const [q, setQ] = useState(""),
    [filter, setFilter] = useState("due"),
    [dateNode, setDateNode] = useState<Node | null>(null),
    [date, setDate] = useState(today),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const exam =
    data.oppositions.find((o) => o.id === oppositionId)?.exam_date ?? null;
  const rows = blocks(data, oppositionId)
    .filter((n) => {
      const s = states.get(n.id)!;
      return (
        nodePath(n, data.nodes).toLowerCase().includes(q.toLowerCase()) &&
        (filter === "all" || filter === "excluded"
          ? !s.enabled || filter === "all"
          : filter === "difficult"
            ? s.rating === "mal" || s.rating === "regular"
            : s.enabled && s.due && s.due <= today)
      );
    })
    .sort(
      (a, b) =>
        priority(states.get(b.id)!, today, b.importance, exam) -
        priority(states.get(a.id)!, today, a.importance, exam),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA BLOQUE TIENE SU CALENDARIO</div>
          <h1>Recuerda lo que importa.</h1>
          <p>
            Las fechas se adaptan a cómo recuerdas, sin esperar a completar una
            vuelta.
          </p>
        </div>
        <Button onClick={() => start({ kind: "review" })}>
          <RotateCcw size={18} />
          Registrar repaso
        </Button>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar un bloque…"
            aria-label="Buscar repasos"
          />
        </div>
        <select
          aria-label="Filtrar repasos"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="due">Pendientes y vencidos</option>
          <option value="all">Todos los bloques</option>
          <option value="difficult">Con dificultad</option>
          <option value="excluded">Excluidos</option>
        </select>
      </div>
      <section className="panel">
        {rows.length ? (
          rows.map((n) => {
            const s = states.get(n.id)!;
            return (
              <div className="review-row" key={n.id}>
                <div className="task-copy">
                  <small>
                    {nodePath(n, data.nodes)
                      .split(" / ")
                      .slice(0, -1)
                      .join(" / ")}
                  </small>
                  <h3>{n.name}</h3>
                  <p className="help">{s.reason}</p>
                  <div className="chips">
                    <span className={`badge ${s.rating ?? ""}`}>
                      {mastery(s)}
                    </span>
                    <span className="badge">{s.passes} pasada(s)</span>
                    {!s.enabled && <span className="badge">Excluido</span>}
                    {s.manual && <span className="badge">Fecha manual</span>}
                  </div>
                </div>
                <div className="review-date">
                  <CalendarDays size={17} />
                  <strong className={s.due && s.due < today ? "overdue" : ""}>
                    {s.due ? labelDay(s.due) : "Sin programar"}
                  </strong>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => start({ kind: "review", nodeIds: [n.id] })}
                >
                  Repasar
                </Button>
                <Menu
                  items={[
                    {
                      label: "Cambiar fecha / posponer",
                      action: () => {
                        setDateNode(n);
                        setDate(s.due ?? today);
                        setNote("");
                      },
                    },
                    {
                      label: s.enabled
                        ? "Excluir de repetición espaciada"
                        : "Activar repetición espaciada",
                      action: () =>
                        void memory(n, s.enabled ? "exclude" : "include"),
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
            );
          })
        ) : (
          <Empty
            title="No hay bloques en esta vista"
            description="Cambia el filtro o completa el estudio inicial de un bloque."
          />
        )}
      </section>
      <Modal
        title="Reprogramar repaso"
        open={!!dateNode}
        onClose={() => setDateNode(null)}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await memory(dateNode!, "reschedule", {
                manual_due: date,
                notes: note,
              });
              setDateNode(null);
            } catch (err) {
              setError((err as Error).message);
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
            Se conserva la fecha calculada por el algoritmo y queda registrado
            este cambio manual.
          </p>
          <ErrorText error={error} />
          <Button>Guardar fecha</Button>
        </form>
      </Modal>
    </>
  );
}
