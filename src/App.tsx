import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import {
  LayoutDashboard,
  Library,
  RotateCcw,
  Timer as TimerIcon,
  ChartNoAxesCombined,
  ClipboardCheck,
  Settings,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  Plus,
  Play,
  BookOpen,
  ChevronRight,
  Ellipsis,
  CalendarDays,
  ListTodo,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { connection, makeClient, validateConnection } from "./data/client";
import { Provider, useApp, change } from "./data/context";
import { Button, Field, ErrorText, Modal } from "./components/ui";
import { SessionForm } from "./components/SessionForm";
import type { SessionOptions } from "./components/SessionForm";
import { base, DEFAULT_PREFS, active } from "./core/types";
import { Today } from "./pages/Today";
import { Tasks } from "./pages/Tasks";
import { Syllabus } from "./pages/Syllabus";
import { Reviews } from "./pages/Reviews";
import { Study } from "./pages/Study";
const Progress = lazy(() =>
  import("./pages/Progress").then((m) => ({ default: m.Progress })),
);
const Tests = lazy(() =>
  import("./pages/Tests").then((m) => ({ default: m.Tests })),
);
import { Configuration } from "./pages/Configuration";
import { registerWebMCP } from "./core/webmcp";
import { blocks, getStates, statistics } from "./core/stats";
import { dayAt } from "./core/dates";
export type Route =
  | "today"
  | "syllabus"
  | "reviews"
  | "study"
  | "progress"
  | "tests"
  | "settings"
  | "more"
  | "agenda"
  | "tasks";
const nav = [
  { id: "today", name: "Hoy", icon: LayoutDashboard },
  { id: "tasks", name: "Tareas", icon: ListTodo },
  { id: "syllabus", name: "Temario", icon: Library },
  { id: "reviews", name: "Repasos", icon: RotateCcw },
  { id: "study", name: "Estudiar", icon: TimerIcon },
  { id: "progress", name: "Progreso", icon: ChartNoAxesCombined },
  { id: "tests", name: "Pruebas", icon: ClipboardCheck },
] as const;
export function Logo() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <BookOpen size={22} />
      </span>
      <span>
        opo<strong>plan</strong>
        <small>PREPARA TU PRÓXIMO PASO</small>
      </span>
    </div>
  );
}
function Setup() {
  const [url, setUrl] = useState("https://kavehkjbwyycthpfsngz.supabase.co"),
    [key, setKey] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <div className="eyebrow">CONEXIÓN INICIAL</div>
        <h1>
          Todo empieza con
          <br />
          una buena base.
        </h1>
        <p className="muted">
          Conecta el proyecto OpoPlan para guardar tus datos y recuperarlos en
          cualquier dispositivo.
        </p>
        <ol className="setup-steps">
          <li>
            Conecta tu proyecto existente. Si ya está configurado, conserva sus
            tablas y no vuelvas a ejecutar INSTALL.sql.
          </li>
          <li>
            Copia la <strong>publishable key pública</strong> desde Project
            Settings → API Keys.
          </li>
          <li>
            Introduce la clave aquí. La cuenta se crea en el siguiente paso.
          </li>
        </ol>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const c = { url: url.trim().replace(/\/$/, ""), key: key.trim() };
              validateConnection(c);
              localStorage.setItem("opoplan-connection", JSON.stringify(c));
              location.reload();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <Field label="URL del proyecto">
            <input
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </Field>
          <Field label="Publishable key pública">
            <input
              required
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sb_publishable_…"
            />
          </Field>
          <ErrorText error={error} />
          <Button>Conectar OpoPlan</Button>
        </form>
        <p className="help">
          Usa la clave pública. Las claves secret y service_role no se admiten.
        </p>
        <a
          href="https://github.com/Marcitius/OpoPlan"
          target="_blank"
          rel="noreferrer"
        >
          Código e instrucciones de configuración
        </a>
      </div>
      <div className="auth-aside">
        <span className="eyebrow">BLOQUE A BLOQUE</span>
        <h2>
          Tu preparación.
          <br />
          Con perspectiva.
        </h2>
        <div className="auth-motif">
          <div />
          <div />
          <div />
          <div />
          <div />
        </div>
        <p>
          Estudio, memoria y práctica.
          <br />
          Cada avance cuenta en su lugar.
        </p>
      </div>
    </div>
  );
}
function Auth({
  client,
  recovery,
  onRecoveryDone,
}: {
  client: ReturnType<typeof makeClient>;
  recovery: boolean;
  onRecoveryDone: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (recovery) {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        onRecoveryDone();
        return;
      }
      if (mode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin },
        });
        if (error) throw error;
        if (!data.session)
          setMessage("Revisa tu correo y confirma la cuenta para entrar.");
      } else {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin,
        });
        if (error) throw error;
        setMessage(
          "Si existe la cuenta, recibirás un enlace para cambiar la contraseña.",
        );
      }
    } catch (err) {
      const msg = (err as Error).message;
      setError(
        msg === "Invalid login credentials"
          ? "El correo o la contraseña no son correctos."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <div className="eyebrow">TU ESPACIO DE PREPARACIÓN</div>
        <h1>
          {recovery
            ? "Nueva contraseña"
            : mode === "signup"
              ? "Empieza tu preparación."
              : mode === "reset"
                ? "Recupera tu acceso."
                : "Vuelve a tu plan."}
        </h1>
        <p className="muted">
          {mode === "signup"
            ? "Crea tu cuenta para sincronizar todos tus dispositivos."
            : "Cada bloque tiene su ritmo. Retoma el tuyo."}
        </p>
        <form className="stack" onSubmit={submit}>
          {!recovery && (
            <Field label="Correo electrónico">
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          )}
          {(recovery || mode !== "reset") && (
            <Field label="Contraseña">
              <input
                type="password"
                autoComplete={
                  mode === "signup" || recovery
                    ? "new-password"
                    : "current-password"
                }
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <ErrorText error={error} />
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <Button disabled={busy}>
            {busy
              ? "Un momento…"
              : recovery
                ? "Guardar contraseña"
                : mode === "signup"
                  ? "Crear cuenta"
                  : mode === "reset"
                    ? "Enviar enlace"
                    : "Entrar"}
          </Button>
        </form>
        {!recovery && (
          <div className="auth-links">
            <button
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError("");
                setMessage("");
              }}
            >
              {mode === "signup" ? "Ya tengo cuenta" : "Crear una cuenta"}
            </button>
            <button
              onClick={() => {
                setMode(mode === "reset" ? "login" : "reset");
                setError("");
              }}
            >
              {mode === "reset" ? "Volver a entrar" : "Olvidé mi contraseña"}
            </button>
          </div>
        )}
      </div>
      <div className="auth-aside">
        <span className="eyebrow">A TU RITMO, CON UN PLAN</span>
        <h2>
          Un poco más cerca.
          <br />
          Cada día.
        </h2>
        <div className="auth-motif">
          <div />
          <div />
          <div />
          <div />
          <div />
        </div>
        <p>
          Decide qué estudiar.
          <br />
          Recuerda lo que ya sabes.
          <br />
          Comprueba cómo avanzas.
        </p>
      </div>
    </div>
  );
}
function Onboarding() {
  const { owner, commit, notify } = useApp();
  const [name, setName] = useState("Guardia Civil"),
    [exam, setExam] = useState(""),
    [goal, setGoal] = useState(180),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="onboarding panel">
      <div className="onboarding-steps">
        <span className="selected">1 · Tu plan</span>
        <span>2 · Temario</span>
        <span>3 · Primera sesión</span>
      </div>
      <div className="eyebrow">BIENVENIDO A OPOPLAN</div>
      <h1>
        Prepara tu oposición,
        <br />a tu manera.
      </h1>
      <p className="muted">
        Solo necesitamos el nombre de tu oposición. El temario, el objetivo y la
        fecha de examen se pueden completar después, a tu ritmo.
      </p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const profile = {
              ...base(owner, owner),
              display_name: "",
              preferences: { ...DEFAULT_PREFS, dailyMinutes: goal },
            };
            const opposition = {
              ...base(owner),
              name,
              exam_date: exam || null,
              archived: false,
            };
            const categories = [
              "Inglés · Gramática",
              "Inglés · Vocabulario",
              "Inglés · Comprensión lectora",
              "Ortografía",
              "Gramática española",
              "Psicotécnicos",
              "Otros ejercicios",
            ].map((name) => ({ ...base(owner), name, color: "#287462" }));
            await commit([
              change("profiles", profile),
              change("oppositions", opposition),
              ...categories.map((c) => change("categories", c)),
            ]);
            notify(
              "Tu espacio está preparado. Añade el primer bloque en Temario.",
            );
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nombre de la oposición">
          <input
            value={name}
            required
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <details className="disclosure">
          <summary>Objetivo y fecha de examen (opcional)</summary>
          <div className="stack">
            <div className="form-grid">
              <Field label="Fecha de examen (opcional)">
                <input
                  type="date"
                  value={exam}
                  onChange={(e) => setExam(e.target.value)}
                />
              </Field>
              <Field label="Objetivo diario (minutos)">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  required
                  value={goal}
                  onChange={(e) => setGoal(+e.target.value)}
                />
              </Field>
            </div>
          </div>
        </details>
        <ErrorText error={error} />
        <Button disabled={busy}>{busy ? "Guardando…" : "Crear mi plan"}</Button>
      </form>
    </div>
  );
}
function Workspace() {
  const {
    data,
    sync,
    oppositionId,
    setOppositionId,
    client,
    notify,
    timer,
    setTimer,
    preferences,
    owner,
  } = useApp();
  const [route, setRoute] = useState<Route>("today"),
    [session, setSession] = useState<SessionOptions | null>(null),
    [settingsInitial, setSettingsInitial] = useState("opposition");
  function navigate(next: Route, initialSettings = "opposition") {
    if (next === "settings") setSettingsInitial(initialSettings);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  async function signOut() {
    if (
      sync.count &&
      !confirm(
        "Tienes cambios pendientes. Se conservarán en este dispositivo para esta cuenta. ¿Cerrar sesión?",
      )
    )
      return;
    await client.auth.signOut();
  }
  const count = sync.count;
  const syncLabel = {
    loading: "Cargando datos",
    synced: "Sincronizado",
    pending: `${count} cambio(s) pendiente(s)`,
    offline: "Sin conexión",
    error: "Error de sincronización",
    conflict: "Conflicto pendiente",
  }[sync.status];
  const start = (options: SessionOptions) => {
    if (timer && !options.timer) {
      notify("Tienes una sesión abierta. Termínala o descártala en Estudiar.");
      setRoute("study");
      return;
    }
    setSession(options);
  };
  const hasOpp = active(data.oppositions).some((o) => !o.archived);
  useEffect(() => {
    if (!hasOpp) return;
    return registerWebMCP([
      {
        name: "get_today_summary",
        description:
          "Read your real study time and pending review count for today.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: (input) => {
          if (!input || typeof input !== "object" || Object.keys(input).length)
            throw new Error("Expected an empty object.");
          const today = dayAt(new Date(), preferences.timezone),
            states = getStates(data);
          return {
            day: today,
            seconds: statistics(
              data,
              oppositionId,
              preferences.timezone,
              today,
              today,
            ).total,
            pendingReviews: blocks(data, oppositionId).filter((n) => {
              const m = states.get(n.id)!;
              return m.enabled && m.due && m.due <= today;
            }).length,
            syncStatus: sync.status,
          };
        },
      },
      {
        name: "start_review_registration",
        description:
          "Open the review form for selected active blocks. No review is saved until the user completes it.",
        inputSchema: {
          type: "object",
          properties: {
            nodeIds: { type: "array", items: { type: "string" }, minItems: 1 },
          },
          required: ["nodeIds"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          const ids = (input as { nodeIds?: unknown })?.nodeIds;
          if (
            !Array.isArray(ids) ||
            !ids.length ||
            new Set(ids).size !== ids.length ||
            Object.keys(input as object).some((k) => k !== "nodeIds") ||
            ids.some(
              (id) =>
                typeof id !== "string" ||
                !blocks(data, oppositionId).some((n) => n.id === id),
            )
          )
            throw new Error(
              "Select active blocks belonging to this opposition.",
            );
          if (timer) throw new Error("Finish the active timer first.");
          setSession({ kind: "review", nodeIds: ids });
          await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r())),
          );
          return { status: "form_open", blocks: ids.length };
        },
      },
    ]);
  }, [data, oppositionId, preferences.timezone, hasOpp, sync.status, timer]);
  useEffect(() => {
    if (!preferences.reminders) return;
    const today = dayAt(new Date(), preferences.timezone),
      states = getStates(data),
      count = blocks(data, oppositionId).filter(
        (n) =>
          states.get(n.id)?.enabled &&
          states.get(n.id)?.due &&
          states.get(n.id)!.due! <= today,
      ).length;
    const key = "opoplan-reminder-" + owner + "-" + today;
    if (count && !localStorage.getItem(key)) {
      localStorage.setItem(key, "1");
      notify(`Hoy tienes ${count} bloque(s) pendientes de repaso.`);
    }
  }, [data, oppositionId, preferences.reminders, preferences.timezone, owner]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <Logo />
        <div className="sidebar-context">
          <span className="eyebrow">MI OPOSICIÓN</span>
          <select
            aria-label="Oposición actual"
            value={oppositionId}
            onChange={(e) => setOppositionId(e.target.value)}
          >
            {active(data.oppositions)
              .filter((o) => !o.archived)
              .map((o) => (
                <option value={o.id} key={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </div>
        <nav aria-label="Navegación principal">
          {nav.map((n) => (
            <button
              key={n.id}
              aria-current={route === n.id ? "page" : undefined}
              className={route === n.id ? "selected" : ""}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={21} />
              <span>{n.name}</span>
              {n.id === "study" && timer && <span className="live-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => navigate("settings")}
            className={route === "settings" ? "selected" : ""}
          >
            <Settings size={20} />
            Configuración
          </button>
          <button onClick={() => void signOut()}>
            <LogOut size={20} />
            Cerrar sesión
          </button>
          <div className="sidebar-note">
            <span>Tu preparación, a tu ritmo.</span>
            <small>Todo avance empieza por un bloque.</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <Logo />
          </div>
          <div className="desktop-breadcrumb">
            Mi preparación <ChevronRight size={15} />
            <strong>
              {nav.find((n) => n.id === route)?.name ??
                (
                  {
                    settings: "Configuración",
                    more: "Más",
                    agenda: "Agenda",
                  } as Record<string, string>
                )[route]}
            </strong>
          </div>
          <div className="topbar-actions">
            <button
              className={`sync-indicator ${sync.status}`}
              onClick={() => navigate("settings", "sync")}
              title={sync.error ?? syncLabel}
            >
              {sync.status === "offline" ? (
                <CloudOff size={17} />
              ) : sync.status === "loading" || sync.status === "pending" ? (
                <RefreshCw size={17} />
              ) : (
                <Cloud size={17} />
              )}
              <span>{syncLabel}</span>
            </button>
            <button
              className="iconbtn mobile-settings"
              aria-label="Configuración"
              onClick={() => navigate("settings")}
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} data-view={route}>
          <Suspense
            fallback={
              <p className="empty" role="status">
                Abriendo tu preparación…
              </p>
            }
          >
            {sync.status === "loading" && !data.oppositions.length ? (
              <div className="empty" role="status">
                Recuperando tu preparación…
              </div>
            ) : !hasOpp ? (
              <Onboarding />
            ) : route === "today" || route === "agenda" ? (
              <Today
                key={route}
                start={start}
                navigate={navigate}
                initialCalendar={route === "agenda"}
              />
            ) : route === "tasks" ? (
              <Tasks />
            ) : route === "syllabus" ? (
              <Syllabus start={start} />
            ) : route === "reviews" ? (
              <Reviews start={start} navigate={navigate} />
            ) : route === "more" ? (
              <More navigate={navigate} signOut={signOut} />
            ) : route === "study" ? (
              <Study start={start} navigate={navigate} />
            ) : route === "progress" ? (
              <Progress navigate={navigate} />
            ) : route === "tests" ? (
              <Tests start={start} />
            ) : (
              <Configuration
                key={settingsInitial}
                initialSection={settingsInitial}
              />
            )}
          </Suspense>
        </main>
      </div>
      {timer && route !== "study" && (
        <button className="active-timer" onClick={() => navigate("study")}>
          <TimerIcon size={21} />
          <strong>Volver a tu sesión</strong>
          <ChevronRight size={19} />
        </button>
      )}
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {[
          ...nav.filter((n) =>
            ["today", "syllabus", "reviews", "progress"].includes(n.id),
          ),
          { id: "more" as const, name: "Más", icon: Ellipsis },
        ].map((n) => (
          <button
            key={n.id}
            aria-current={
              route === n.id ||
              (n.id === "more" &&
                ["tests", "settings", "study", "tasks"].includes(route)) ||
              (n.id === "today" && route === "agenda")
                ? "page"
                : undefined
            }
            className={
              route === n.id ||
              (n.id === "more" &&
                ["tests", "settings", "study", "tasks"].includes(route)) ||
              (n.id === "today" && route === "agenda")
                ? "selected"
                : ""
            }
            onClick={() => navigate(n.id)}
          >
            <n.icon size={22} aria-hidden="true" />
            <span>{n.name}</span>
          </button>
        ))}
      </nav>
      <Modal
        title={
          session?.timer
            ? "Finalizar sesión"
            : session?.kind === "review"
              ? "Registrar repaso"
              : session?.kind === "practice"
                ? "Registrar práctica"
                : "Registrar estudio"
        }
        open={!!session}
        onClose={() => setSession(null)}
        wide
      >
        {session && (
          <SessionForm
            key={`${session.kind}-${session.nodeIds?.join(",")}-${!!session.timer}`}
            options={session}
            onDone={() => setSession(null)}
            onNext={setSession}
            onTimer={async (kind, ids) => {
              await setTimer({
                id: crypto.randomUUID(),
                owner_id: owner,
                oppositionId,
                kind,
                nodeIds: ids,
                taskId: session.taskId ?? null,
                startedAt: new Date().toISOString(),
                runningSince: Date.now(),
                accumulated: 0,
                mode: "continuous",
                phase: "work",
                phaseAccumulated: 0,
                workSeconds: preferences.pomodoroWork * 60,
                breakSeconds: preferences.pomodoroBreak * 60,
              });
              setSession(null);
              navigate("study");
            }}
          />
        )}
      </Modal>
    </div>
  );
}
function More({
  navigate,
  signOut,
}: {
  navigate: (r: Route) => void;
  signOut: () => Promise<void>;
}) {
  const { data, oppositionId, setOppositionId, sync, preferences } = useApp();
  const items = [
    {
      route: "study",
      title: "Estudiar",
      description: "Cronómetro, Pomodoro y tiempo manual",
      icon: TimerIcon,
    },
    {
      route: "tests",
      title: "Pruebas y simulacros",
      description: "Registra resultados y encuentra tus puntos débiles",
      icon: ClipboardCheck,
    },
    {
      route: "tasks",
      title: "Tareas pendientes",
      description: "Guarda actividades sin fecha y añádelas a cualquier día",
      icon: ListTodo,
    },
    {
      route: "agenda",
      title: "Agenda",
      description: "Organiza los próximos días y exporta al calendario",
      icon: CalendarDays,
    },
    {
      route: "settings",
      title: "Configuración",
      description: "Objetivos, apariencia, avisos y copias de seguridad",
      icon: Settings,
    },
  ] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU ESPACIO</div>
          <h1>Todo lo demás.</h1>
          <p>Tu preparación, a tu manera.</p>
        </div>
      </div>
      <div className="more-context">
        <strong>Tu oposición</strong>
        <Field label="Oposición actual">
          <select
            value={oppositionId}
            onChange={(e) => setOppositionId(e.target.value)}
          >
            {active(data.oppositions)
              .filter((o) => !o.archived)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
        </Field>
        <small className="muted">
          {preferences.timezone} ·{" "}
          {sync.status === "synced"
            ? "Todos los cambios sincronizados"
            : sync.status === "offline"
              ? "Sin conexión. Los cambios se guardan en este dispositivo."
              : `${sync.count} cambio(s) por sincronizar`}
        </small>
      </div>
      <div className="more-list">
        {items.map((i) => (
          <button
            key={i.route}
            aria-label={i.title}
            onClick={() => navigate(i.route)}
          >
            <span className="activity-icon">
              <i.icon size={22} aria-hidden="true" />
            </span>
            <span>
              <strong>{i.title}</strong>
              <small>{i.description}</small>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        ))}
        <button onClick={() => void signOut()}>
          <LogOut size={22} aria-hidden="true" />
          <span>
            <strong>Cerrar sesión</strong>
            <small>Tu historial permanece vinculado a tu cuenta.</small>
          </span>
        </button>
      </div>
    </>
  );
}

export default function App() {
  const c = useMemo(connection, []),
    client = useMemo(() => (c ? makeClient(c) : null), [c]);
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(!!client),
    [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  if (!client) return <Setup />;
  if (loading)
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <Logo />
          <p role="status">Recuperando tu sesión…</p>
        </div>
      </div>
    );
  if (!user || recovery)
    return (
      <Auth
        client={client}
        recovery={recovery}
        onRecoveryDone={() => setRecovery(false)}
      />
    );
  return (
    <Provider key={user.id} owner={user.id} client={client}>
      <Workspace />
    </Provider>
  );
}
