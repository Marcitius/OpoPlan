import { useEffect, useState } from "react";
import { Play, Pause, Square, RotateCcw, BookOpen, Clock } from "lucide-react";
import { useApp } from "../data/context";
import {
  Button,
  BlockPicker,
  ErrorText,
  Empty,
  PageHeader,
  Disclosure,
} from "../components/ui";
import type { SessionOptions } from "../components/SessionForm";
import type { SessionKind } from "../core/types";
import type { Route } from "../App";
import { active } from "../core/types";
import { blocks } from "../core/stats";
import {
  timerElapsed,
  pauseTimer,
  resumeTimer,
  nextPhase,
  phaseRemaining,
} from "../core/timer";
import type { Timer } from "../core/timer";
export function Study({
  start,
  navigate,
}: {
  start: (o: SessionOptions) => void;
  navigate: (r: Route) => void;
}) {
  const { owner, data, oppositionId, preferences, timer, setTimer, notify } =
    useApp();
  const [kind, setKind] = useState<SessionKind>("study"),
    [ids, setIds] = useState<string[]>([]),
    [mode, setMode] = useState<"continuous" | "pomodoro">("continuous"),
    [tick, setTick] = useState(Date.now()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const available = blocks(data, oppositionId);
  const recent = active(data.sessions)
    .filter((s) => s.opposition_id === oppositionId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 5)
    .flatMap((s) =>
      active(data.session_blocks)
        .filter((a) => a.session_id === s.id)
        .map((a) => a.node_id),
    );
  const elapsed = timer ? Math.floor(timerElapsed(timer, tick)) : 0;
  const fmt = (seconds: number) =>
    `${Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0")}:${Math.floor((seconds / 60) % 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;
  const done = timer?.mode === "pomodoro" && phaseRemaining(timer, tick) === 0;
  async function updateTimer(next: Timer | null, after?: () => void) {
    setError("");
    setBusy(true);
    try {
      await setTimer(next);
      after?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function begin() {
    setError("");
    if (kind !== "practice" && !ids.length) {
      setError("Selecciona un bloque para empezar.");
      return;
    }
    setBusy(true);
    try {
      await setTimer({
        id: crypto.randomUUID(),
        owner_id: owner,
        oppositionId,
        kind,
        nodeIds: ids,
        taskId: null,
        startedAt: new Date().toISOString(),
        runningSince: Date.now(),
        accumulated: 0,
        mode,
        phase: "work",
        phaseAccumulated: 0,
        workSeconds: preferences.pomodoroWork * 60,
        breakSeconds: preferences.pomodoroBreak * 60,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={timer ? "Este momento es para ti." : "¿En qué vas a avanzar?"}
        eyebrow={timer ? "CONCENTRACIÓN" : "ESTUDIAR"}
        description={
          timer
            ? "Una cosa cada vez. Tu sesión está guardada en este dispositivo."
            : "Elige tu actividad, selecciona un bloque y empieza."
        }
        actions={
          !timer && (
            <Button
              variant="secondary"
              onClick={() => start({ kind, nodeIds: ids })}
            >
              <Clock size={17} />
              Registrar tiempo manual
            </Button>
          )
        }
      />
      {!timer && !available.length && kind !== "practice" ? (
        <section className="panel">
          <Empty
            icon={<BookOpen size={30} />}
            title="Prepara tu primer bloque"
            description="En Temario, entra en una materia y añade una unidad revisable. Puedes registrar estudio parcial sin completar todo el tema."
            action={
              <>
                <Button onClick={() => navigate("syllabus")}>
                  Ir al temario
                </Button>
                <Button variant="ghost" onClick={() => setKind("practice")}>
                  Empezar una práctica
                </Button>
              </>
            }
          />
        </section>
      ) : (
        <div className={`study-layout ${timer ? "is-running" : ""}`}>
          {!timer && (
            <section className="panel study-selection">
              <div className="segmented" aria-label="Tipo de sesión">
                {(["study", "review", "practice"] as const).map((k) => (
                  <button
                    key={k}
                    aria-pressed={kind === k}
                    className={kind === k ? "selected" : ""}
                    onClick={() => setKind(k)}
                  >
                    {
                      {
                        study: "Estudio",
                        review: "Repaso",
                        practice: "Práctica",
                      }[k]
                    }
                  </button>
                ))}
              </div>
              <h2>
                {kind === "practice"
                  ? "Bloques relacionados (opcional)"
                  : "Selecciona tus bloques"}
              </h2>
              <BlockPicker
                nodes={available}
                allNodes={data.nodes}
                selected={ids}
                onChange={setIds}
                recent={recent}
              />
              <Disclosure title="Modo de concentración">
                <div className="segmented">
                  {(["continuous", "pomodoro"] as const).map((m) => (
                    <button
                      key={m}
                      className={mode === m ? "selected" : ""}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      {m === "continuous"
                        ? "Continuo"
                        : `Pomodoro ${preferences.pomodoroWork}/${preferences.pomodoroBreak}`}
                    </button>
                  ))}
                </div>
                <p className="help">
                  Puedes ajustar los intervalos en Configuración.
                </p>
              </Disclosure>
              <ErrorText error={error} />
              <Button
                disabled={busy || (kind !== "practice" && !ids.length)}
                onClick={() => void begin()}
              >
                <Play size={18} />
                {busy ? "Iniciando…" : "Iniciar sesión"}
              </Button>
            </section>
          )}
          <section
            className={`focus-timer ${timer ? "active" : ""}`}
            aria-label="Cronómetro"
          >
            <div className="eyebrow">
              {timer?.phase === "break"
                ? "DESCANSO · NO SUMA TIEMPO"
                : timer
                  ? timer.runningSince === null
                    ? "SESIÓN EN PAUSA"
                    : "EN CONCENTRACIÓN"
                  : "TU PRÓXIMA SESIÓN"}
            </div>
            <div className="clock" aria-live="off">
              {fmt(elapsed)}
            </div>
            <p className="timer-context">
              {timer
                ? timer.nodeIds
                    .map(
                      (id) =>
                        data.nodes.find((n) => n.id === id)?.name ??
                        "Bloque archivado",
                    )
                    .join(" · ") || "Práctica"
                : ids.length
                  ? ids
                      .map((id) => data.nodes.find((n) => n.id === id)?.name)
                      .join(" · ")
                  : "El tiempo comienza cuando tú decidas."}
            </p>
            {timer?.mode === "pomodoro" && (
              <p className="phase-label">
                {timer.phase === "work" ? "Trabajo" : "Descanso"} ·{" "}
                {Math.ceil(phaseRemaining(timer, tick) / 60)} min restantes
              </p>
            )}
            {timer && (
              <>
                <div className="timer-controls">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void updateTimer(
                        timer.runningSince === null
                          ? resumeTimer(timer)
                          : pauseTimer(timer),
                      )
                    }
                  >
                    {timer.runningSince === null ? (
                      <Play size={19} />
                    ) : (
                      <Pause size={19} />
                    )}{" "}
                    {timer.runningSince === null ? "Reanudar" : "Pausar"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void updateTimer(pauseTimer(timer), () =>
                        start({
                          kind: timer.kind,
                          nodeIds: timer.nodeIds,
                          timer: true,
                        }),
                      )
                    }
                  >
                    <Square size={16} />
                    Finalizar
                  </Button>
                </div>
                {timer.mode === "pomodoro" && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void updateTimer(nextPhase(timer))}
                  >
                    {timer.phase === "work"
                      ? "Iniciar descanso"
                      : "Comenzar otro intervalo"}
                  </Button>
                )}
                {done && (
                  <p className="success" role="status">
                    Intervalo terminado. Continúa cuando estés listo.
                  </p>
                )}
                <details className="timer-options">
                  <summary>Opciones de la sesión</summary>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        confirm(
                          "¿Descartar el cronómetro? No se creará una sesión.",
                        )
                      ) {
                        await updateTimer(null, () =>
                          notify("Cronómetro descartado."),
                        );
                      }
                    }}
                  >
                    Descartar sesión abierta
                  </Button>
                </details>
                <ErrorText error={error} />
              </>
            )}
            <div className="timer-note">
              <RotateCcw size={16} />
              <span>
                Tu sesión se recupera al recargar. Las pausas y descansos no
                suman tiempo.
              </span>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
