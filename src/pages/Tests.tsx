import { useState } from "react";
import { Plus, ClipboardCheck, Search } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useApp, change } from "../data/context";
import {
  Button,
  Empty,
  Modal,
  Field,
  ErrorText,
  Stat,
  Menu,
  BlockPicker,
} from "../components/ui";
import type { SessionOptions } from "../components/SessionForm";
import { active, base } from "../core/types";
import type { TestResult } from "../core/types";
import { dayAt, labelDay, minutesLabel } from "../core/dates";
import { score, nodePath, blocks } from "../core/stats";
import { download, toCSV } from "../core/import";
export function Tests({ start }: { start: (o: SessionOptions) => void }) {
  const { data, oppositionId, preferences, owner, save, commit, memory } =
      useApp(),
    [category, setCategory] = useState(""),
    [type, setType] = useState(""),
    [q, setQ] = useState(""),
    [editing, setEditing] = useState<TestResult | null>(null),
    [editingLinks, setEditingLinks] = useState<string[]>([]),
    [error, setError] = useState(""),
    [date, setDate] = useState(dayAt(new Date(), preferences.timezone)),
    [reviewTest, setReviewTest] = useState<TestResult | null>(null);
  const all = active(data.test_results).filter((t) => {
    const s = data.sessions.find((s) => s.id === t.session_id);
    return s?.opposition_id === oppositionId && !s.deleted_at;
  });
  const tests = all
    .filter(
      (t) =>
        (!category || t.category_id === category) &&
        (!type || t.test_type === type) &&
        t.name.toLowerCase().includes(q.toLowerCase()),
    )
    .sort((a, b) =>
      data.sessions
        .find((s) => s.id === a.session_id)!
        .started_at.localeCompare(
          data.sessions.find((s) => s.id === b.session_id)!.started_at,
        ),
    );
  const questions = tests.reduce((sum, t) => sum + t.question_count, 0),
    correct = tests.reduce((sum, t) => sum + t.correct, 0);
  const chart = tests.map((t) => ({
    date: labelDay(
      dayAt(
        data.sessions.find((s) => s.id === t.session_id)!.started_at,
        preferences.timezone,
      ),
    ),
    score: Math.round((t.score / t.max_score) * 10000) / 100,
    name: t.name,
  }));
  const categoryStats = active(data.categories).map((c) => {
    const rows = all.filter((t) => t.category_id === c.id);
    const questions = rows.reduce((s, t) => s + t.question_count, 0);
    return {
      category: c,
      count: rows.length,
      accuracy: questions
        ? Math.round(
            (rows.reduce((s, t) => s + t.correct, 0) / questions) * 100,
          )
        : null,
    };
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PON A PRUEBA TU PREPARACIÓN</div>
          <h1>Pon tu avance a prueba.</h1>
          <p>
            Inglés, ortografía, psicotécnicos y simulacros. Toda tu práctica, en
            un lugar.
          </p>
        </div>
        <Button onClick={() => start({ kind: "practice", test: true })}>
          <Plus size={18} />
          Registrar prueba
        </Button>
      </div>
      <div className="category-cards">
        {categoryStats.map((c) => (
          <button
            key={c.category.id}
            className={category === c.category.id ? "selected" : ""}
            onClick={() =>
              setCategory(category === c.category.id ? "" : c.category.id)
            }
          >
            <span>{c.category.name}</span>
            {c.accuracy !== null && <strong>{c.accuracy}%</strong>}
            {c.count > 0 && <small>{c.count} prueba(s)</small>}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            aria-label="Buscar pruebas"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar prueba…"
          />
        </div>
        <select
          aria-label="Tipo de prueba"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {[...new Set(all.map((t) => t.test_type))].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Button
          variant="ghost"
          onClick={() =>
            download("OpoPlan-pruebas.csv", toCSV(tests), "text/csv")
          }
        >
          Exportar CSV
        </Button>
      </div>
      {all.length > 0 && (
        <>
          <div className="stat-grid three">
            <Stat label="PRUEBAS REGISTRADAS" value={tests.length} />
            <Stat
              label="PORCENTAJE DE ACIERTO"
              value={`${questions ? Math.round((correct / questions) * 100) : 0}%`}
              detail={`${correct}/${questions} preguntas`}
            />
            <Stat
              label="TIEMPO DE PRÁCTICA"
              value={minutesLabel(
                tests.reduce(
                  (sum, t) =>
                    sum +
                    (data.sessions.find((s) => s.id === t.session_id)
                      ?.duration_seconds ?? 0),
                  0,
                ),
              )}
              accent
            />
          </div>
          <section className="panel" hidden={tests.length < 2}>
            <h2>Evolución de puntuaciones</h2>
            <p className="help">
              Nota / nota máxima × 100. Selecciona un tipo de prueba para
              comparar resultados equivalentes.
            </p>
            {tests.length ? (
              <div className="chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" minTickGap={20} />
                    <YAxis unit="%" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="score"
                      name="Puntuación relativa (%)"
                      stroke="var(--green)"
                      isAnimationActive={false}
                      strokeWidth={3}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty
                title="La primera prueba marca el punto de partida"
                description="Registra resultados reales y observa su evolución."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => start({ kind: "practice", test: true })}
                  >
                    Registrar primera prueba
                  </Button>
                }
              />
            )}
          </section>
        </>
      )}
      {!all.length && (
        <section className="panel">
          <Empty
            icon={<ClipboardCheck size={30} />}
            title="Tu primera prueba, tu punto de partida"
            description="Registra un test de inglés, ortografía, psicotécnicos o un simulacro. Verás tus resultados y los bloques que necesitan atención."
            action={
              <Button onClick={() => start({ kind: "practice", test: true })}>
                Registrar primera prueba
              </Button>
            }
          />
        </section>
      )}
      <section className="panel history-panel" hidden={!tests.length}>
        <h2>Historial de pruebas</h2>
        {tests.length === 1 && (
          <p className="help">
            Tu punto de partida está registrado. Con otra prueba comparable
            verás tu evolución.
          </p>
        )}
        {tests
          .slice()
          .reverse()
          .map((t) => {
            const s = data.sessions.find((s) => s.id === t.session_id)!;
            const links = active(data.test_links).filter(
              (l) => l.test_id === t.id,
            );
            return (
              <div className="test-row" key={t.id}>
                <div>
                  <small>
                    {labelDay(dayAt(s.started_at, preferences.timezone))} ·{" "}
                    {t.test_type}
                  </small>
                  <h3>{t.name}</h3>
                  <p>
                    {t.correct} aciertos · {t.wrong} errores · {t.blank} blancos
                    · {minutesLabel(s.duration_seconds)}
                  </p>
                  {links.length > 0 && (
                    <small>
                      Bloques vinculados:{" "}
                      {links
                        .map(
                          (l) =>
                            data.nodes.find((n) => n.id === l.node_id)?.name,
                        )
                        .join(", ")}
                    </small>
                  )}
                </div>
                <strong className="test-score">
                  {t.score}
                  <small> / {t.max_score}</small>
                </strong>
                <Menu
                  items={[
                    {
                      label: "Corregir resultado",
                      action: () => {
                        setEditing({ ...t });
                        setEditingLinks(
                          active(data.test_links)
                            .filter((l) => l.test_id === t.id)
                            .map((l) => l.node_id),
                        );
                        setError("");
                      },
                    },
                    ...(links.length
                      ? [
                          {
                            label: "Programar repaso de errores",
                            action: () => {
                              setReviewTest(t);
                              setDate(dayAt(new Date(), preferences.timezone));
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            );
          })}
      </section>
      <section
        className="panel"
        hidden={
          !tests.some((t) =>
            active(data.test_links).some((l) => l.test_id === t.id),
          )
        }
      >
        <h2>Bloques con errores vinculados</h2>
        {data.nodes
          .filter((n) => n.opposition_id === oppositionId)
          .map((n) => ({
            n,
            count: active(data.test_links).filter(
              (l) =>
                l.node_id === n.id &&
                tests.some((t) => t.id === l.test_id) &&
                !!l.error_notes,
            ).length,
          }))
          .filter((x) => x.count > 0)
          .sort((a, b) => b.count - a.count)
          .map((x) => (
            <div className="history-row" key={x.n.id}>
              <strong>{nodePath(x.n, data.nodes)}</strong>
              <span>{x.count} prueba(s) con errores vinculados</span>
              <Button
                variant="secondary"
                onClick={() => start({ kind: "review", nodeIds: [x.n.id] })}
              >
                Repasar
              </Button>
            </div>
          ))}
      </section>
      <Modal
        title="Corregir resultado"
        open={!!editing}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const t = editing;
                if (t.correct + t.wrong + t.blank !== t.question_count)
                  throw new Error(
                    "Aciertos, errores y blancos deben sumar el total.",
                  );
                const links = data.test_links.filter((l) => l.test_id === t.id);
                const changes = [
                  change("test_results", {
                    ...t,
                    score: t.score_manual
                      ? t.score
                      : score(
                          t.correct,
                          t.wrong,
                          t.question_count,
                          t.penalty,
                          t.max_score,
                        ),
                  }),
                  ...links
                    .filter(
                      (l) => !l.deleted_at && !editingLinks.includes(l.node_id),
                    )
                    .map((l) =>
                      change("test_links", {
                        ...l,
                        deleted_at: new Date().toISOString(),
                      }),
                    ),
                  ...editingLinks.map((nodeId) => {
                    const old = links.find((l) => l.node_id === nodeId);
                    return change("test_links", {
                      ...(old ?? base(owner)),
                      test_id: t.id,
                      node_id: nodeId,
                      error_notes: t.notes,
                      deleted_at: null,
                    });
                  }),
                ];
                await commit(changes);
                setEditing(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <Field label="Nombre">
              <input
                required
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <Field label="Tipo de prueba">
              <input
                required
                value={editing.test_type}
                onChange={(e) =>
                  setEditing({ ...editing, test_type: e.target.value })
                }
              />
            </Field>
            <Field label="Categoría">
              <select
                value={editing.category_id ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    category_id: e.target.value || null,
                  })
                }
              >
                <option value="">Sin categoría</option>
                {active(data.categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              {(
                [
                  "question_count",
                  "correct",
                  "wrong",
                  "blank",
                  "penalty",
                  "max_score",
                ] as const
              ).map((k) => (
                <Field
                  key={k}
                  label={
                    {
                      question_count: "Preguntas",
                      correct: "Aciertos",
                      wrong: "Errores",
                      blank: "Blancos",
                      penalty: "Penalización",
                      max_score: "Nota máxima",
                    }[k]
                  }
                >
                  <input
                    type="number"
                    required
                    min={k === "question_count" || k === "max_score" ? 1 : 0}
                    step={k === "penalty" || k === "max_score" ? "0.01" : "1"}
                    value={editing[k]}
                    onChange={(e) =>
                      setEditing({ ...editing, [k]: +e.target.value })
                    }
                  />
                </Field>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.score_manual}
                onChange={(e) =>
                  setEditing({ ...editing, score_manual: e.target.checked })
                }
              />
              Nota manual
            </label>
            {editing.score_manual && (
              <Field label="Nota">
                <input
                  type="number"
                  step="0.01"
                  value={editing.score}
                  onChange={(e) =>
                    setEditing({ ...editing, score: +e.target.value })
                  }
                />
              </Field>
            )}
            <Field label="Notas / errores">
              <textarea
                value={editing.notes}
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </Field>
            <p className="muted">Bloques relacionados con los errores</p>
            <BlockPicker
              nodes={blocks(data, oppositionId)}
              allNodes={data.nodes}
              selected={editingLinks}
              onChange={setEditingLinks}
            />
            <ErrorText error={error} />
            <Button>Guardar resultado</Button>
          </form>
        )}
      </Modal>
      <Modal
        title="Planificar repaso de errores"
        open={!!reviewTest}
        onClose={() => setReviewTest(null)}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const now = new Date().toISOString();
              const links = active(data.test_links).filter(
                (l) => l.test_id === reviewTest!.id,
              );
              await commit(
                links.map((l) =>
                  change("memory_events", {
                    ...base(owner),
                    node_id: l.node_id,
                    session_id: null,
                    kind: "reschedule",
                    occurred_at: now,
                    study_day: dayAt(now, preferences.timezone),
                    timezone: preferences.timezone,
                    rating: null,
                    notes:
                      "Error en " + reviewTest!.name + ": " + l.error_notes,
                    manual_due: date,
                    target_event_id: null,
                    rules: preferences.rules,
                  }),
                ),
              );
              setReviewTest(null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <p>
            Se programarán los bloques vinculados a «{reviewTest?.name}». El
            resultado y el historial de estudio se conservan.
          </p>
          <Field label="Fecha del repaso">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
          <Button>Programar repasos</Button>
        </form>
      </Modal>
    </>
  );
}
