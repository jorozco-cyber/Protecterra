"use client";
import { Fragment, createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Data } from "@/lib/types";
import { loadData } from "../data";
import { COMPANIES, company, setCompany, type CompanyId } from "@/lib/company";
import { supabaseBrowser } from "@/lib/supabase/browser";
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

// Secciones que una empresa no usa.
const HIDDEN: Record<CompanyId, Section[]> = { protecterra: [], importagro: ["otras", "historial"] };
const COMPANY_KEY = "pt-company";

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
  const [companyId, setCompanyId] = useState<CompanyId>("protecterra");
  // Solo quien administra las dos empresas ve el selector.
  const [canSwitch, setCanSwitch] = useState(false);

  const reload = useCallback(async () => {
    // Si se cambia de empresa mientras carga, lo que llegue de la anterior se descarta.
    const asked = company().id;
    try {
      const loaded = await loadData();
      if (company().id !== asked) return;
      setData(loaded);
      setError("");
    } catch (e) {
      if (company().id === asked) setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setSection(sectionFromHash());
    void (async () => {
      let stored: CompanyId = "protecterra";
      try {
        if (window.localStorage.getItem(COMPANY_KEY) === "importagro") stored = "importagro";
      } catch {
        /* Sin almacenamiento local: se abre Protecterra. */
      }
      const { data: me } = await supabaseBrowser().rpc("ia_me");
      const both = (me as { role?: string } | null)?.role === "admin";
      const start: CompanyId = both ? stored : "protecterra";
      setCanSwitch(both);
      setCompany(start);
      setCompanyId(start);
      await reload();
    })();
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

  function switchCompany(id: CompanyId) {
    if (id === companyId) return;
    setCompany(id);
    setCompanyId(id);
    setData(null);
    try {
      window.localStorage.setItem(COMPANY_KEY, id);
    } catch {
      /* Sin almacenamiento local: el cambio vale solo para esta visita. */
    }
    go("inicio");
    void reload();
  }

  const brand = COMPANIES[companyId];
  const nav = NAV.filter((n) => !HIDDEN[companyId].includes(n.id));
  const groups = [...new Set(nav.map((n) => n.group))];
  const current = nav.find((n) => n.id === section) ?? nav[0];
  const shown = current.id;

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
        {brand.logo ? (
          <img className="topbar-logo" src="/logo-blanco-simple.svg" alt="ProtecTerra" width={518} height={177} />
        ) : (
          <span className="brand-text small">{brand.name}</span>
        )}
      </header>
      <nav className={"sidebar" + (menu ? " open" : "")} aria-label="Secciones">
        <div className="sidebar-brand">
          {brand.logo ? (
            <img src="/logo-blanco-simple.svg" alt="ProtecTerra" width={518} height={177} />
          ) : (
            <span className="brand-text">{brand.name}</span>
          )}
        </div>
        {canSwitch && (
          <div className="company-switch" role="group" aria-label="Empresa">
            {(Object.keys(COMPANIES) as CompanyId[]).map((id) => (
              <button
                key={id}
                className={"company-btn" + (id === companyId ? " active" : "")}
                aria-pressed={id === companyId}
                onClick={() => switchCompany(id)}
              >
                {COMPANIES[id].name}
              </button>
            ))}
          </div>
        )}
        {groups.map((g) => (
          <div key={g} className="nav-group">
            <p className="nav-title">{g}</p>
            {nav
              .filter((n) => n.group === g)
              .map((n) => (
                <button
                  key={n.id}
                  className={"nav-item" + (n.id === shown ? " active" : "")}
                  aria-current={n.id === shown ? "page" : undefined}
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
            <Fragment key={companyId}>
              {shown === "inicio" && <Home />}
              {shown === "inventario" && <Inventory />}
              {shown === "compras" && <Purchases />}
              {shown === "ventas" && <Sales />}
              {shown === "cobros" && <Receivables />}
              {shown === "clientes" && <Customers />}
              {shown === "comisiones" && <Commissions />}
              {shown === "otras" && <OtherCommissions />}
              {shown === "contador" && <CashCounter />}
              {shown === "reportes" && <Reports />}
              {shown === "historial" && <HistoryView />}
              {shown === "registro" && <AuditLog />}
            </Fragment>
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
