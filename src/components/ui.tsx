import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { X, MoreHorizontal, Search, FolderOpen } from "lucide-react";
import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Node } from "../core/types";
import { nodePath } from "../core/stats";
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
          className={`modal ${wide ? "wide" : ""}`}
          aria-describedby={undefined}
        >
          <div className="modal-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="iconbtn" aria-label="Cerrar">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Menu({
  items,
}: {
  items: { label: string; action: () => void; danger?: boolean }[];
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="iconbtn" aria-label="Opciones">
        <MoreHorizontal size={20} />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className="dropdown" sideOffset={4}>
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
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={30} />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
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
}: {
  nodes: Node[];
  allNodes: Node[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  return (
    <div className="picker">
      <div className="search">
        <Search size={17} />
        <input
          aria-label="Buscar bloques"
          placeholder="Buscar bloques…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="picker-list">
        {nodes
          .filter((n) =>
            nodePath(n, allNodes).toLowerCase().includes(q.toLowerCase()),
          )
          .map((n) => (
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
                  {nodePath(n, allNodes)
                    .split(" / ")
                    .slice(0, -1)
                    .join(" / ") || "Bloque raíz"}
                </small>
              </span>
            </label>
          ))}
        {!nodes.length && (
          <p className="muted">Crea o importa primero un bloque en Temario.</p>
        )}
      </div>
      <small className="muted">
        {selected.length} bloque(s) seleccionado(s)
      </small>
    </div>
  );
}
export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Progreso"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
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
