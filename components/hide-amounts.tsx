"use client";
import { useEffect, useState } from "react";
import { company } from "@/lib/company";
import { money } from "@/lib/format";

/** Ojo del Inicio: oculta los montos hasta que el dueño quiera verlos. Empieza
 * oculto y este dispositivo recuerda la última elección. */
const key = "protecterra-ocultar-montos";

export function useHideAmounts() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "no") setHidden(false);
    } catch {}
  }, []);
  function toggle() {
    setHidden((h) => {
      const next = !h;
      try {
        localStorage.setItem(key, next ? "si" : "no");
      } catch {}
      return next;
    });
  }
  /** Igual que money(), pero con puntos mientras los montos están ocultos. */
  const amount = (v: unknown) => (hidden ? `${company().currency} ••••••` : money(v));
  return { hidden, toggle, amount };
}

export function EyeToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const label = hidden ? "Mostrar montos" : "Ocultar montos";
  return (
    <button type="button" className="icon-btn eye-btn" aria-label={label} title={label} aria-pressed={!hidden} onClick={onToggle}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 20 20 4" />}
      </svg>
    </button>
  );
}
