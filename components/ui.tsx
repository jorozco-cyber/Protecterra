"use client";
import { useEffect, useRef, useState } from "react";
import type { FileRef } from "@/lib/types";

export async function logout() {
  await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
  window.location.assign("/login");
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal" + (wide ? " wide" : "")}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-box">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={"field" + (className ? " " + className : "")}>
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

export type Tone = "ok" | "warn" | "danger" | "neutral" | "info";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={"badge " + tone}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: Tone }) {
  return (
    <div className={"stat" + (tone ? " " + tone : "")}>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Search({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      className="search"
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FileLink({ file, label }: { file: FileRef; label: string }) {
  if (!file || !file.url) return null;
  return (
    <a className="file-link" href={file.url} target="_blank" rel="noopener noreferrer">
      {label}
      {file.filename ? ` · ${file.filename}` : ""}
    </a>
  );
}

export function ErrorNote({ error }: { error: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="note danger">
      {error}
    </p>
  );
}

/**
 * Envoltura para formularios: evita doble envío, muestra el error y cierra al terminar.
 */
export function useSubmit(action: () => Promise<void>, done: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      done();
    } catch (err) {
      setError((err as Error).message || "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, submit, setError };
}

/** Pide un motivo y ejecuta una anulación. */
export function VoidDialog({
  title,
  warning,
  onClose,
  onConfirm,
}: {
  title: string;
  warning: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const { busy, error, submit } = useSubmit(() => onConfirm(reason), onClose);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <p>{warning}</p>
        <Field label="Motivo de la anulación">
          <input value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        </Field>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn danger" disabled={busy}>
            {busy ? "Anulando…" : "Anular"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function Bars({ rows }: { rows: { label: string; value: number; title: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars" role="img" aria-label="Ventas por mes">
      {rows.map((r) => (
        <div className="bar-col" key={r.label} title={r.title}>
          <div className="bar-track">
            <div className="bar-fill" style={{ height: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          <span className="bar-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
