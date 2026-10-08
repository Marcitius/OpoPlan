import { useState } from "react";
import { Play, CheckCircle2, ChevronRight } from "lucide-react";
import {
  Button,
  Field,
  ErrorText,
  BlockPicker,
  RatingButtons,
  Disclosure,
} from "./ui";
import { useApp } from "../data/context";
import { active } from "../core/types";
import type { Rating, SessionKind, TestResult, Base } from "../core/types";
import { readData } from "../data/local";
import { blocks, score, getStates, nodePath } from "../core/stats";
import { fromLocal, localInput, labelDay, dayAt } from "../core/dates";
import { timerElapsed } from "../core/timer";
export interface SessionOptions {
  kind: SessionKind;
  nodeIds?: string[];
  taskId?: string;
  timer?: boolean;
  test?: boolean;
}
export function SessionForm({
  options,
  onDone,
  onTimer,
  onNext,
}: {
  options: SessionOptions;
  onDone: () => void;
  onTimer?: (kind: SessionKind, ids: string[]) => Promise<void>;
  onNext?: (options: SessionOptions) => void;
}) {
  const {
      data,
      owner,
      preferences,
      oppositionId,
      record,
      timer,
      sync,
      memory,
    } = useApp(),
    available = blocks(
      data,
      options.timer ? (timer?.oppositionId ?? oppositionId) : oppositionId,
    );
  const [saved, setSaved] = useState(false),
    [savedEvents, setSavedEvents] = useState<{ id: string; nodeId: string }[]>(
      [],
    ),
    [recordId] = useState(() =>
      options.timer && timer ? timer.id : crypto.randomUUID(),
    );
  const capturedTimer = options.timer ? timer : null;
  const [kind, setKind] = useState(options.kind),
    [compactSelection] = useState(
      () => (options.nodeIds ?? capturedTimer?.nodeIds ?? []).length > 0,
    ),
    [ids, setIds] = useState(options.nodeIds ?? capturedTimer?.nodeIds ?? []),
    [minutes, setMinutes] = useState(
      capturedTimer
        ? Math.max(1, Math.round(timerElapsed(capturedTimer) / 60))
        : 20,
    ),
    [date, setDate] = useState(
      localInput(
        capturedTimer?.startedAt ?? new Date().toISOString(),
        preferences.timezone,
      ),
    ),
    [notes, setNotes] = useState(""),
    [difficulty, setDifficulty] = useState(""),
    [concentration, setConcentration] = useState(""),
    [perBlock, setPerBlock] = useState<
      Record<
        string,
        {
          done: boolean;
          progress: number;
          rating: Rating;
          notes: string;
          seconds?: number;
        }
      >
    >({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [hasTest, setHasTest] = useState(options.test ?? false),
    [test, setTest] = useState({
      name: "",
      type: "Test",
      category: "",
      total: 30,
      correct: 0,
      wrong: 0,
      blank: 30,
      penalty: 0,
      max: 10,
      manual: false,
      score: 0,
    }),
    [errorBlocks, setErrorBlocks] = useState<string[]>([]),
    [errorNotes, setErrorNotes] = useState("");
  const seconds = capturedTimer
    ? Math.max(1, Math.round(timerElapsed(capturedTimer)))
    : Math.round(minutes * 60);
  const allocations = ids.map(
    (id, i) =>
      perBlock[id]?.seconds ??
      Math.floor(seconds / ids.length) +
        (i === ids.length - 1 ? seconds % ids.length : 0),
  );
  const upd = (id: string, p: Partial<(typeof perBlock)[string]>) =>
    setPerBlock((v) => ({
      ...v,
      [id]: {
        ...(v[id] ?? {
          done: false,
          progress: 50,
          rating: "bien" as Rating,
          notes: "",
        }),
        ...p,
      },
    }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (hasTest && test.total !== test.correct + test.wrong + test.blank)
        throw new Error("Aciertos, errores y blancos deben sumar el total.");
      if (ids.length && allocations.reduce((a, b) => a + b, 0) !== seconds)
        throw new Error(
          "Ajusta el reparto: debe sumar exactamente " + seconds + " segundos.",
        );
      const startedAt =
        capturedTimer?.startedAt ?? fromLocal(date, preferences.timezone);
      const testData: Omit<TestResult, keyof Base | "session_id"> | undefined =
        hasTest
          ? {
              category_id: test.category || null,
              name: test.name || test.type,
              test_type: test.type,
              question_count: test.total,
              correct: test.correct,
              wrong: test.wrong,
              blank: test.blank,
              penalty: test.penalty,
              score: test.manual
                ? test.score
                : score(
                    test.correct,
                    test.wrong,
                    test.total,
                    test.penalty,
                    test.max,
                  ),
              max_score: test.max,
              score_manual: test.manual,
              notes: errorNotes,
            }
          : undefined;
      await record({
        id: recordId,
        oppositionId: capturedTimer?.oppositionId,
        kind,
        nodeIds: ids,
        allocations,
        completed: ids.map(
          (id) => kind === "study" && (perBlock[id]?.done ?? false),
        ),
        progress: ids.map((id) =>
          perBlock[id]?.done ? 100 : (perBlock[id]?.progress ?? 50),
        ),
        ratings: ids.map((id) => perBlock[id]?.rating ?? "bien"),
        blockNotes: ids.map((id) => perBlock[id]?.notes ?? ""),
        duration: seconds,
        startedAt,
        endedAt: capturedTimer
          ? new Date().toISOString()
          : new Date(
              new Date(startedAt).getTime() + seconds * 1000,
            ).toISOString(),
        source: capturedTimer ? "timer" : "manual",
        notes,
        concentration: concentration ? +concentration : null,
        difficulty: difficulty ? +difficulty : null,
        taskId: options.taskId ?? capturedTimer?.taskId,
        test: testData,
        errors: errorBlocks.map((nodeId) => ({ nodeId, notes: errorNotes })),
      });
      const local = await readData(owner);
      setSavedEvents(
        local.memory_events
          .filter((e) => e.session_id === recordId && e.kind === "review")
          .map((e) => ({ id: e.id, nodeId: e.node_id })),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  const states = getStates(data);
  const next = available.find(
    (n) =>
      !ids.includes(n.id) &&
      states.get(n.id)?.enabled &&
      states.get(n.id)?.due &&
      states.get(n.id)!.due! <= dayAt(new Date(), preferences.timezone),
  );
  if (saved)
    return (
      <div className="stack session-result">
        <div className="result-summary">
          <CheckCircle2 size={34} />
          <h3>
            {kind === "review"
              ? "Repaso registrado"
              : kind === "practice"
                ? "Práctica registrada"
                : "Sesión registrada"}
          </h3>
          <p>
            {(seconds / 60).toFixed(seconds % 60 ? 1 : 0)} min ·{" "}
            {ids.length
              ? ids
                  .map((id) => data.nodes.find((n) => n.id === id)?.name)
                  .join(" · ")
              : "Práctica"}
          </p>
        </div>
        {ids.map((id) => {
          const m = states.get(id);
          return m?.due ? (
            <div className="next-review" key={id}>
              <span>{data.nodes.find((n) => n.id === id)?.name}</span>
              <strong>
                {m.due < dayAt(new Date(), preferences.timezone)
                  ? "Repaso pendiente: "
                  : "Próximo repaso: "}
                {labelDay(m.due, { day: "numeric", month: "long" })}
              </strong>
              <small>{m.reason}</small>
            </div>
          ) : null;
        })}
        <p className="help" role="status">
          {sync.status === "synced"
            ? "Guardado y sincronizado."
            : sync.status === "offline"
              ? "Guardado en este dispositivo. Se sincronizará al recuperar la conexión."
              : sync.status === "conflict"
                ? "Guardado en este dispositivo. Hay un conflicto de sincronización; revísalo en Configuración."
                : sync.status === "error"
                  ? "Guardado en este dispositivo. La nube no ha confirmado el guardado; revisa la sincronización en Configuración."
                  : "Guardado en este dispositivo. La sincronización sigue pendiente."}
        </p>
        {savedEvents.length > 0 && (
          <Disclosure title="Corregir la valoración reciente">
            {savedEvents.map((ev) => (
              <div className="stack" key={ev.id}>
                <RatingButtons
                  label={
                    data.nodes.find((n) => n.id === ev.nodeId)?.name ?? "Bloque"
                  }
                  value={perBlock[ev.nodeId]?.rating ?? "bien"}
                  onChange={(rating) => upd(ev.nodeId, { rating })}
                />
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const n = data.nodes.find((n) => n.id === ev.nodeId)!;
                      await memory(n, "correction", {
                        target_event_id: ev.id,
                        rating: perBlock[ev.nodeId]?.rating ?? "bien",
                        notes: perBlock[ev.nodeId]?.notes ?? "",
                      });
                      setError("");
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Guardar corrección
                </Button>
              </div>
            ))}
          </Disclosure>
        )}
        <ErrorText error={error} />
        <div className="modal-footer">
          <Button variant="secondary" onClick={onDone}>
            Listo
          </Button>
          {kind === "review" && next && onNext && (
            <Button
              onClick={() => onNext({ kind: "review", nodeIds: [next.id] })}
            >
              Siguiente repaso
              <ChevronRight size={17} />
            </Button>
          )}
        </div>
      </div>
    );
  return (
    <form onSubmit={submit} className="stack session-form">
      {compactSelection ? (
        <>
          <div className="session-block-context">
            <span className="eyebrow">
              {
                {
                  study: "ESTUDIO NUEVO",
                  review: "REPASO",
                  practice: "PRÁCTICA",
                }[kind]
              }
            </span>
            {ids.map((id) => (
              <div key={id}>
                <strong>{data.nodes.find((n) => n.id === id)?.name}</strong>
                <small>
                  {nodePath(data.nodes.find((n) => n.id === id)!, data.nodes)
                    .split(" / ")
                    .slice(0, -1)
                    .join(" / ")}
                </small>
              </div>
            ))}
          </div>
          <Disclosure title="Cambiar o añadir bloques">
            <BlockPicker
              nodes={available}
              allNodes={data.nodes}
              selected={ids}
              onChange={setIds}
            />
          </Disclosure>
        </>
      ) : kind !== "practice" ? (
        <BlockPicker
          nodes={available}
          allNodes={data.nodes}
          selected={ids}
          onChange={setIds}
        />
      ) : null}
      <div className="session-time">
        <Field label="Tiempo de estudio (minutos)">
          <input
            type="number"
            min="0.1"
            step="0.1"
            max="10080"
            required
            value={capturedTimer ? (seconds / 60).toFixed(1) : minutes}
            disabled={!!capturedTimer}
            onChange={(e) => setMinutes(+e.target.value)}
          />
        </Field>
        {!capturedTimer && onTimer && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy || (kind !== "practice" && !ids.length)}
            onClick={async () => {
              setBusy(true);
              try {
                await onTimer(kind, ids);
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            <Play size={17} />
            Usar cronómetro
          </Button>
        )}
      </div>
      {ids.map((id, i) => {
        const b = data.nodes.find((n) => n.id === id)!;
        return (
          <div className="block-assessment" key={id}>
            {ids.length > 1 && <strong>{b.name}</strong>}
            {kind === "study" ? (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={perBlock[id]?.done ?? false}
                    onChange={(e) => upd(id, { done: e.target.checked })}
                  />
                  Estudio inicial completado
                </label>
                {!perBlock[id]?.done && (
                  <Field label="Avance parcial (%)">
                    <input
                      type="number"
                      min="0"
                      max="99"
                      value={perBlock[id]?.progress ?? 50}
                      onChange={(e) => upd(id, { progress: +e.target.value })}
                    />
                  </Field>
                )}
              </>
            ) : kind === "review" ? (
              <>
                <RatingButtons
                  label={"Recuerdo de " + b.name}
                  value={perBlock[id]?.rating ?? "bien"}
                  onChange={(rating) => upd(id, { rating })}
                />
                <Field label="Partes olvidadas / comentario">
                  <input
                    placeholder="Una pista para tu próximo repaso (opcional)"
                    value={perBlock[id]?.notes ?? ""}
                    onChange={(e) => upd(id, { notes: e.target.value })}
                  />
                </Field>
              </>
            ) : null}
            {b.notes && (
              <Disclosure title="Notas de este bloque">
                <p className="block-notes">{b.notes}</p>
              </Disclosure>
            )}
            {ids.length > 1 && (
              <Disclosure title="Repartir tiempo">
                <Field label={`Tiempo asignado a ${b.name} (segundos)`}>
                  <input
                    type="number"
                    min="0"
                    value={allocations[i]}
                    onChange={(e) => upd(id, { seconds: +e.target.value })}
                  />
                </Field>
              </Disclosure>
            )}
          </div>
        );
      })}
      {kind === "practice" && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={hasTest}
              onChange={(e) => setHasTest(e.target.checked)}
            />
            Registrar resultado de test o simulacro
          </label>
          {hasTest && (
            <>
              <div className="form-grid">
                <Field label="Nombre de la prueba">
                  <input
                    required
                    value={test.name}
                    placeholder="Por ejemplo: simulacro de octubre"
                    onChange={(e) => setTest({ ...test, name: e.target.value })}
                  />
                </Field>
                <Field label="Tipo de prueba">
                  <input
                    required
                    value={test.type}
                    onChange={(e) => setTest({ ...test, type: e.target.value })}
                  />
                </Field>
                <Field label="Categoría">
                  <select
                    value={test.category}
                    onChange={(e) =>
                      setTest({ ...test, category: e.target.value })
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
                <Field label="Preguntas">
                  <input
                    type="number"
                    min="1"
                    value={test.total}
                    onChange={(e) => {
                      const total = +e.target.value;
                      setTest({
                        ...test,
                        total,
                        blank: Math.max(0, total - test.correct - test.wrong),
                      });
                    }}
                  />
                </Field>
              </div>
              <div className="question-counts">
                {(["correct", "wrong", "blank"] as const).map((k) => (
                  <Field
                    key={k}
                    label={
                      {
                        correct: "Aciertos",
                        wrong: "Errores",
                        blank: "Blancos",
                      }[k]
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      value={test[k]}
                      onChange={(e) => {
                        const val = +e.target.value;
                        setTest({
                          ...test,
                          [k]: val,
                          ...(k !== "blank"
                            ? {
                                blank: Math.max(
                                  0,
                                  test.total -
                                    (k === "correct" ? val : test.correct) -
                                    (k === "wrong" ? val : test.wrong),
                                ),
                              }
                            : {}),
                        });
                      }}
                    />
                  </Field>
                ))}
              </div>
              <div className="test-score-preview">
                <span>Resultado</span>
                <strong>
                  {test.manual
                    ? test.score
                    : score(
                        test.correct,
                        test.wrong,
                        test.total,
                        test.penalty,
                        test.max,
                      )}{" "}
                  / {test.max}
                </strong>
              </div>
              <Disclosure title="Fórmula de puntuación y nota manual">
                <div className="form-grid">
                  <Field label="Penalización por error">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={test.penalty}
                      onChange={(e) =>
                        setTest({ ...test, penalty: +e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Nota máxima">
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={test.max}
                      onChange={(e) =>
                        setTest({ ...test, max: +e.target.value })
                      }
                    />
                  </Field>
                </div>
                <p className="help">
                  Nota = (aciertos − errores × penalización) / preguntas × nota
                  máxima. Puede ser negativa.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={test.manual}
                    onChange={(e) =>
                      setTest({ ...test, manual: e.target.checked })
                    }
                  />
                  Introducir nota manual
                </label>
                {test.manual && (
                  <Field label="Nota obtenida">
                    <input
                      type="number"
                      step="0.01"
                      value={test.score}
                      onChange={(e) =>
                        setTest({ ...test, score: +e.target.value })
                      }
                    />
                  </Field>
                )}
              </Disclosure>
              <Disclosure title="Errores y bloques relacionados">
                <Field label="Errores detectados">
                  <textarea
                    value={errorNotes}
                    onChange={(e) => setErrorNotes(e.target.value)}
                  />
                </Field>
                <BlockPicker
                  nodes={available}
                  allNodes={data.nodes}
                  selected={errorBlocks}
                  onChange={setErrorBlocks}
                />
              </Disclosure>
            </>
          )}
          <Disclosure title="Vincular bloques a la práctica (opcional)">
            <BlockPicker
              nodes={available}
              allNodes={data.nodes}
              selected={ids}
              onChange={setIds}
            />
          </Disclosure>
        </>
      )}
      <Disclosure title="Fecha y opciones de la sesión">
        <div className="form-grid">
          <Field label="Actividad">
            <select
              value={kind}
              disabled={!!capturedTimer}
              onChange={(e) => {
                setKind(e.target.value as SessionKind);
                if (e.target.value !== "practice") setHasTest(false);
              }}
            >
              <option value="study">Estudio nuevo</option>
              <option value="review">Repaso</option>
              <option value="practice">Práctica</option>
            </select>
          </Field>
          <Field label={`Fecha real (${preferences.timezone})`}>
            <input
              type="datetime-local"
              required
              value={date}
              disabled={!!capturedTimer}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {(["concentration", "difficulty"] as const).map((k) => (
            <Field
              key={k}
              label={
                k === "concentration"
                  ? "Concentración (opcional)"
                  : "Dificultad (opcional)"
              }
            >
              <select
                value={k === "concentration" ? concentration : difficulty}
                onChange={(e) =>
                  (k === "concentration" ? setConcentration : setDifficulty)(
                    e.target.value,
                  )
                }
              >
                <option value="">Sin valorar</option>
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {v} / 5
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>
        <p className="help">
          Un repaso por bloque y día cuenta para las vueltas. Corregir la
          valoración conserva los registros originales.
        </p>
      </Disclosure>
      <Disclosure title="Añadir una nota (opcional)">
        <Field label="Notas de la sesión">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Disclosure>
      <ErrorText error={error} />
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={busy || (kind !== "practice" && !ids.length)}>
          {busy ? "Guardando…" : "Guardar sesión"}
        </Button>
      </div>
    </form>
  );
}
