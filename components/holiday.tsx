import type { CSSProperties } from "react";

/** Purely decorative, deterministic markup: no timers, network calls or business data. */
export function HolidayBackdrop({ corner = false, sparse = false }: { corner?: boolean; sparse?: boolean }) {
  return (
    <div className={`holiday-backdrop${sparse ? " holiday-backdrop-sparse" : ""}`} aria-hidden="true">
      <div className="holiday-snow">
        {Array.from({ length: sparse ? 8 : 18 }, (_, i) => (
          <span
            className="holiday-flake holiday-motion"
            key={i}
            style={{
              left: `${(i * 37 + 7) % 98}%`,
              "--flake-size": `${i % 3 === 0 ? 9 + (i % 5) : 2 + (i % 3)}px`,
              "--flake-opacity": i % 3 === 0 ? 0.44 : 0.3,
              animationDuration: `${14 + (i % 7) * 2}s`,
              animationDelay: `${-((i * 7 + 3) % 29)}s`,
            } as CSSProperties}
          >
            {i % 3 === 0 ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M8 4l4 3 4-3M8 20l4-3 4 3M3 10l4-2-.5-5M21 14l-4 2 .5 5M6.5 21 7 16l-4-2M17.5 3 17 8l4 2" />
              </svg>
            ) : <i />}
          </span>
        ))}
      </div>
      {corner && <img className="holiday-corner" src="/holiday/evergreen.svg" alt="" width="360" height="260" />}
    </div>
  );
}

function SleighFlight() {
  return (
    <div className="holiday-flight" aria-hidden="true">
      <div className="holiday-sleigh-mover holiday-motion">
        <div className="holiday-sleigh-bob holiday-motion">
          <img className="holiday-sleigh" src="/holiday/santa-sleigh.webp" alt="" width="900" height="207" />
        </div>
      </div>
    </div>
  );
}

export function HolidayBanner({ variant = "panel" }: { variant?: "panel" | "seller" | "login" }) {
  return (
    <section className={`holiday-banner holiday-banner-${variant}`} aria-label="Saludo navideño">
      {variant === "panel" && <HolidayBackdrop corner />}
      <img className="holiday-fields" src="/holiday/fields.svg" alt="" width="1200" height="100" aria-hidden="true" />
      <div className="holiday-copy">
        <h2>{variant === "panel" ? "Una temporada para crecer" : "Felices fiestas"}</h2>
        <p>{variant === "seller" ? "Gracias por hacer crecer ProtecTerra." : "Sigamos creciendo juntos."}</p>
      </div>
      <SleighFlight />
      <label className="holiday-pause">
        <input className="holiday-motion-toggle" type="checkbox" aria-label="Pausar animaciones navideñas" />
        <span className="holiday-pause-label">Pausar animación</span>
        <span className="holiday-paused-label">Animación pausada</span>
      </label>
    </section>
  );
}
