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
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { connection, makeClient, validateConnection } from "./data/client";
import { Provider, useApp, change } from "./data/context";
import { Button, Field, ErrorText, Modal } from "./components/ui";
import { SessionForm } from "./components/SessionForm";
import type { SessionOptions } from "./components/SessionForm";
import { base, DEFAULT_PREFS, active } from "./core/types";
import { Today } from "./pages/Today";
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
  | "settings";
const nav = [
  { id: "today", name: "Hoy", icon: LayoutDashboard },
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
            Ejecuta las migraciones del repositorio en el SQL Editor de
            Supabase.
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
      <div className="eyebrow">BIENVENIDO A OPOPLAN</div>
      <h1>
        Prepara tu oposición,
        <br />a tu manera.
      </h1>
      <p className="muted">
        Define tu objetivo. Después podrás importar el temario y registrar el
        estudio que ya has realizado con sus fechas reales.
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
    preferences,
    owner,
  } = useApp();
  const [route, setRoute] = useState<Route>("today"),
    [session, setSession] = useState<SessionOptions | null>(null);
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
              className={route === n.id ? "selected" : ""}
              onClick={() => setRoute(n.id)}
            >
              <n.icon size={21} />
              <span>{n.name}</span>
              {n.id === "study" && timer && <span className="live-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            onClick={() => setRoute("settings")}
            className={route === "settings" ? "selected" : ""}
          >
            <Settings size={20} />
            Configuración
          </button>
          <button
            onClick={async () => {
              if (
                count &&
                !confirm(
                  "Tienes cambios pendientes de sincronizar. Se conservarán en este dispositivo para esta cuenta. ¿Cerrar sesión?",
                )
              )
                return;
              await client.auth.signOut();
            }}
          >
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
              {nav.find((n) => n.id === route)?.name ?? "Configuración"}
            </strong>
          </div>
          <div className="topbar-actions">
            <button
              className={`sync-indicator ${sync.status}`}
              onClick={() => setRoute("settings")}
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
              onClick={() => setRoute("settings")}
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
        <main>
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
            ) : route === "today" ? (
              <Today start={start} navigate={setRoute} />
            ) : route === "syllabus" ? (
              <Syllabus start={start} />
            ) : route === "reviews" ? (
              <Reviews start={start} />
            ) : route === "study" ? (
              <Study start={start} />
            ) : route === "progress" ? (
              <Progress />
            ) : route === "tests" ? (
              <Tests start={start} />
            ) : (
              <Configuration />
            )}
          </Suspense>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {nav.map((n) => (
          <button
            key={n.id}
            className={route === n.id ? "selected" : ""}
            onClick={() => setRoute(n.id)}
          >
            <n.icon size={21} />
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
          <SessionForm options={session} onDone={() => setSession(null)} />
        )}
      </Modal>
    </div>
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
