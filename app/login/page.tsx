"use client";
import { useState } from "react";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: mode, email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (j.message) setMessage(j.message);
      else window.location.assign("/");
    } catch (err) {
      setError((err as Error).message || "No se pudo completar el acceso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <aside className="login-brand">
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="44" height="44">
            <path
              d="M32 52V30m0 0c0-10 7-17 17-18 0 10-7 17-17 18Zm0 7c0-8-6-14-15-15 0 9 6 15 15 15Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="eyebrow">PROTECTERRA</p>
        <h1>Inventario, ventas y cobros en un solo lugar.</h1>
        <p>Acceso privado para administración y vendedores autorizados.</p>
      </aside>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <h2>{mode === "register" ? "Crear mi acceso" : "Iniciar sesión"}</h2>
          <p className="muted">
            {mode === "register"
              ? "Usa el correo que el administrador registró para ti. Te llegará un mensaje para confirmarlo."
              : "Ingresa con tu correo y contraseña."}
          </p>
          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              required
              minLength={mode === "register" ? 12 : 1}
              maxLength={128}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && <small className="muted">Mínimo 12 caracteres.</small>}
          </label>
          {error && (
            <p role="alert" className="note danger">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="note ok">
              {message}
            </p>
          )}
          <button className="btn primary full" disabled={busy}>
            {busy ? "Un momento…" : mode === "register" ? "Crear mi acceso" : "Entrar"}
          </button>
          <button
            type="button"
            className="btn link"
            onClick={() => {
              setMode(mode === "register" ? "login" : "register");
              setError("");
              setMessage("");
            }}
          >
            {mode === "register" ? "Ya tengo acceso · Iniciar sesión" : "Primera vez · Crear mi acceso"}
          </button>
        </form>
      </section>
    </main>
  );
}
