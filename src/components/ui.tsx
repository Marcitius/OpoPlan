import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  X,
  MoreHorizontal,
  Search,
  FolderOpen,
  Frown,
  Meh,
  Smile,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Node, Rating } from "../core/types";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`btn ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Modal({
  title,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      content.current?.style.setProperty("--vv-height", viewport.height + "px");
      content.current?.style.setProperty("--vv-top", viewport.offsetTop + "px");
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          ref={content}
          tabIndex={-1}
          className={`modal ${wide ? "wide" : ""}`}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current = document.activeElement as HTMLElement;
            content.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const previous = returnFocus.current;
            requestAnimationFrame(() => {
              if (previous?.isConnected && previous !== document.body)
                previous.focus({ preventScroll: true });
              else
                document
                  .getElementById("main-content")
                  ?.focus({ preventScroll: true });
            });
          }}
        >
          <div className="modal-surface">
            <div className="modal-head">
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Close className="iconbtn" aria-label="Cerrar">
                <X size={22} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className="modal-scroll">{children}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Menu({
  items,
  label = "Opciones",
}: {
  items: { label: string; action: () => void; danger?: boolean }[];
  label?: string;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="iconbtn" aria-label={label}>
        <MoreHorizontal size={21} aria-hidden="true" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          className="dropdown"
          sideOffset={6}
          collisionPadding={12}
        >
          {items.map((i, index) => (
            <Dropdown.Item
              className={i.danger ? "danger-text" : ""}
              key={index}
              onSelect={i.action}
            >
              {i.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ?? <FolderOpen size={28} aria-hidden="true" />}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-actions">{action}</div>}
    </div>
  );
}
export function ErrorText({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
export function BlockPicker({
  nodes,
  allNodes,
  selected,
  onChange,
  recent = [],
}: {
  nodes: Node[];
  allNodes: Node[];
  selected: string[];
  onChange: (ids: string[]) => void;
  recent?: string[];
}) {
  const [q, setQ] = useState(""),
    [limit, setLimit] = useState(40),
    deferred = useDeferredValue(q);
  const paths = useMemo(() => {
    const map = new Map(allNodes.map((n) => [n.id, n])),
      cache = new Map<string, string>();
    const path = (n: Node, depth = 0): string => {
      if (cache.has(n.id)) return cache.get(n.id)!;
      const p = n.parent_id ? map.get(n.parent_id) : null;
      const value =
        p && depth < 30 ? path(p, depth + 1) + " / " + n.name : n.name;
      cache.set(n.id, value);
      return value;
    };
    nodes.forEach((n) => path(n));
    return cache;
  }, [allNodes, nodes]);
  const results = useMemo(
    () =>
      nodes
        .filter((n) =>
          (paths.get(n.id) ?? n.name)
            .toLocaleLowerCase("es")
            .includes(deferred.toLocaleLowerCase("es")),
        )
        .sort(
          (a, b) =>
            Number(selected.includes(b.id)) - Number(selected.includes(a.id)) ||
            Number(recent.includes(b.id)) - Number(recent.includes(a.id)),
        ),
    [nodes, paths, deferred, selected, recent],
  );
  return (
    <div className="picker">
      <div className="search">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label="Buscar bloques"
          placeholder="Buscar bloques…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(40);
          }}
        />
      </div>
      <div className="picker-list">
        {results.slice(0, limit).map((n) => (
          <label className="pick-row" key={n.id}>
            <input
              type="checkbox"
              checked={selected.includes(n.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, n.id]
                    : selected.filter((id) => id !== n.id),
                )
              }
            />
            <span>
              <strong>{n.name}</strong>
              <small>
                {(paths.get(n.id) ?? n.name)
                  .split(" / ")
                  .slice(0, -1)
                  .join(" / ") || "Bloque independiente"}
                {recent.includes(n.id) && " · Reciente"}
              </small>
            </span>
          </label>
        ))}
        {!results.length && (
          <p className="help">
            {nodes.length
              ? "No hay resultados. Prueba con otro nombre."
              : "Aún no hay bloques revisables. Entra en una materia de Temario y añade su primer bloque."}
          </p>
        )}
      </div>
      <div className="picker-pagination">
        <small className="muted">
          {selected.length} bloque(s) seleccionado(s)
        </small>
        {results.length > limit && (
          <button
            type="button"
            className="textbtn"
            onClick={() => setLimit((v) => v + 40)}
          >
            Ver más ({results.length - limit})
          </button>
        )}
      </div>
    </div>
  );
}
export function RatingButtons({
  value,
  onChange,
  label,
}: {
  value: Rating;
  onChange: (v: Rating) => void;
  label: string;
}) {
  const items = [
    { id: "mal", name: "Mal", hint: "No lo recuerdo", icon: Frown },
    { id: "regular", name: "Regular", hint: "Con dificultad", icon: Meh },
    { id: "bien", name: "Bien", hint: "Lo recuerdo", icon: Smile },
  ] as const;
  return (
    <fieldset aria-label={label}>
      <legend>¿Cómo lo recuerdas?</legend>
      <div className="rating-buttons">
        {items.map((i) => (
          <button
            type="button"
            key={i.id}
            className={i.id}
            aria-pressed={value === i.id}
            aria-label={`${i.name} · ${label}`}
            onClick={() => onChange(i.id)}
          >
            <i.icon size={20} aria-hidden="true" />
            {i.name}
            <span>{i.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function ProgressBar({
  value,
  label = "Progreso",
}: {
  value: number;
  label?: string;
}) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(100, value)))}
    >
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`stat ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="heading-actions">{actions}</div>}
    </div>
  );
}
export function Disclosure({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="disclosure" open={open || undefined}>
      <summary>{title}</summary>
      <div className="stack">{children}</div>
    </details>
  );
}
