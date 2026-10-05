"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Data } from "@/lib/types";
import { loadData } from "../data";
import { logout } from "../ui";
import Home from "./home";
import Inventory from "./inventory";
import Purchases from "./purchases";
import Sales from "./sales";
import Receivables from "./receivables";
import Customers from "./customers";
import Commissions from "./commissions";
import OtherCommissions from "./other-commissions";
import CashCounter from "./cash-counter";
import Reports from "./reports";
import HistoryView from "./history";
import AuditLog from "./audit-log";

export type Section =
  | "inicio"
  | "inventario"
  | "compras"
  | "ventas"
  | "cobros"
  | "clientes"
  | "comisiones"
  | "otras"
  | "contador"
  | "reportes"
  | "historial"
  | "registro";

const NAV: { id: Section; label: string; group: string }[] = [
  { id: "inicio", label: "Inicio", group: "Operación" },
  { id: "ventas", label: "Ventas", group: "Operación" },
  { id: "cobros", label: "Cobros y cartera", group: "Operación" },
  { id: "inventario", label: "Inventario", group: "Operación" },
  { id: "compras", label: "Compras", group: "Operación" },
  { id: "clientes", label: "Clientes", group: "Operación" },
  { id: "comisiones", label: "Comisiones", group: "Finanzas" },
  { id: "otras", label: "Otras comisiones", group: "Finanzas" },
  { id: "contador", label: "Contador de billetes", group: "Finanzas" },
  { id: "reportes", label: "Reportes", group: "Finanzas" },
  { id: "historial", label: "Historial", group: "Consulta" },
  { id: "registro", label: "Registro de cambios", group: "Consulta" },
];

type Ctx = {
  data: Data;
  reload: () => Promise<void>;
  notify: (message: string) => void;
  go: (section: Section, focus?: string) => void;
  focus: string | null;
  clearFocus: () => void;
};

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp fuera de AdminApp");
  return ctx;
}

function sectionFromHash(): Section {
  const h = typeof window === "undefined" ? "" : window.location.hash.replace("#", "");
  return NAV.some((n) => n.id === h) ? (h as Section) : "inicio";
}

export default function AdminApp({ email }: { email: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("inicio");
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await loadData());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setSection(sectionFromHash());
    void reload();
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const go = useCallback((next: Section, nextFocus?: string) => {
    setFocus(nextFocus ?? null);
    setSection(next);
    setMenu(false);
    window.history.replaceState(null, "", "#" + next);
    window.scrollTo({ top: 0 });
  }, []);

  const groups = [...new Set(NAV.map((n) => n.group))];
  const current = NAV.find((n) => n.id === section)!;

  return (
    <div className="shell">
      <header className="topbar">
        <button
          className="icon-btn menu-btn"
          aria-label="Abrir menú"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          ☰
        </button>
        <span className="topbar-title">{current.label}</span>
        <span className="brand-small">Protecterra</span>
      </header>
      <nav className={"sidebar" + (menu ? " open" : "")} aria-label="Secciones">
        <div className="sidebar-brand">
          <span className="brand-dot" aria-hidden="true" />
          Protecterra
        </div>
        {groups.map((g) => (
          <div key={g} className="nav-group">
            <p className="nav-title">{g}</p>
            {NAV.filter((n) => n.group === g).map((n) => (
              <button
                key={n.id}
                className={"nav-item" + (n.id === section ? " active" : "")}
                aria-current={n.id === section ? "page" : undefined}
                onClick={() => go(n.id)}
              >
                {n.label}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <span className="muted small">{email}</span>
          <button className="btn small" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </nav>
      {menu && <div className="scrim" onClick={() => setMenu(false)} />}
      <main className="main">
        {error && (
          <p role="alert" className="note danger">
            {error}{" "}
            <button className="btn small" onClick={() => void reload()}>
              Reintentar
            </button>
          </p>
        )}
        {!data && !error && <p className="loading">Cargando datos…</p>}
        {data && (
          <AppContext.Provider value={{ data, reload, notify: setToast, go, focus, clearFocus: () => setFocus(null) }}>
            {section === "inicio" && <Home />}
            {section === "inventario" && <Inventory />}
            {section === "compras" && <Purchases />}
            {section === "ventas" && <Sales />}
            {section === "cobros" && <Receivables />}
            {section === "clientes" && <Customers />}
            {section === "comisiones" && <Commissions />}
            {section === "otras" && <OtherCommissions />}
            {section === "contador" && <CashCounter />}
            {section === "reportes" && <Reports />}
            {section === "historial" && <HistoryView />}
            {section === "registro" && <AuditLog />}
          </AppContext.Provider>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
