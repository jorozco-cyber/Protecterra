import type { CSSProperties } from "react";

/** Purely decorative, deterministic markup: no timers, network calls or business data. */
/** Destellos dorados y estrellas fijas (posiciones deterministas). */
const sparks = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 41 + 11) % 96,
  top: (i * 29 + 7) % 92,
  size: 8 + ((i * 5) % 9),
  delay: ((i * 0.53) % 3.2).toFixed(2),
}));
const dots = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 53 + 3) % 99,
  top: (i * 37 + 5) % 97,
  size: 1 + (i % 3) * 0.6,
}));
function Stars() {
  return (
    <div className="holiday-stars">
      {dots.map((d, i) => (
        <i key={"d" + i} style={{ left: d.left + "%", top: d.top + "%", width: d.size, height: d.size }} />
      ))}
      {sparks.map((s, i) => (
        <b
          key={"s" + i}
          className="holiday-motion"
          style={{ left: s.left + "%", top: s.top + "%", fontSize: s.size, animationDelay: s.delay + "s" }}
        >
          ✦
        </b>
      ))}
    </div>
  );
}

export function HolidayBackdrop({
  corner = false,
  sparse = false,
  stars = false,
  bottom = false,
}: {
  corner?: boolean;
  sparse?: boolean;
  /** Cielo estrellado con destellos dorados. */
  stars?: boolean;
  /** Ramas también en las esquinas de abajo (menú lateral). */
  bottom?: boolean;
}) {
  return (
    <div className={`holiday-backdrop${sparse ? " holiday-backdrop-sparse" : ""}`} aria-hidden="true">
      {stars && <Stars />}
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
      {bottom && (
        <>
          <img className="holiday-corner holiday-corner-bl" src="/holiday/evergreen.svg" alt="" width="360" height="260" />
          <img className="holiday-corner holiday-corner-br" src="/holiday/evergreen.svg" alt="" width="360" height="260" />
        </>
      )}
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

/** Pinitos dorados sobre las líneas del campo, en la portada. */
const pines = [
  { l: 6, s: 16 }, { l: 9.5, s: 22 }, { l: 12.5, s: 14 }, { l: 34, s: 18 }, { l: 37, s: 24 },
  { l: 40.5, s: 15 }, { l: 61, s: 20 }, { l: 64.5, s: 26 }, { l: 68, s: 16 }, { l: 86, s: 18 }, { l: 89, s: 13 },
];
function Pines() {
  return (
    <div className="holiday-pines" aria-hidden="true">
      {pines.map((p, i) => (
        <svg key={i} viewBox="0 0 20 30" style={{ left: p.l + "%", width: p.s * 0.66, height: p.s }}>
          <path d="M10 1 L15 10 H12.5 L17 18 H13.5 L19 27 H1 L6.5 18 H3 L7.5 10 H5 Z M9 27 H11 V30 H9 Z" />
        </svg>
      ))}
    </div>
  );
}

/** Rama de pino en la esquina superior derecha del panel. */
export function HolidayMainCorner() {
  return <img className="holiday-main-corner" src="/holiday/evergreen.svg" alt="" width="360" height="260" aria-hidden="true" />;
}

export function HolidayBanner({ variant = "panel" }: { variant?: "panel" | "seller" | "login" }) {
  return (
    <section className={`holiday-banner holiday-banner-${variant}`} aria-label="Saludo navideño">
      {variant === "panel" && <HolidayBackdrop corner stars />}
      <img className="holiday-fields" src="/holiday/fields.svg" alt="" width="1200" height="100" aria-hidden="true" />
      {variant === "panel" && <Pines />}
      <div className="holiday-copy">
        <h2>{variant === "panel" ? "Una temporada para crecer" : "Felices fiestas"}</h2>
        <p>
          {variant === "seller"
            ? "Gracias por hacer crecer ProtecTerra."
            : variant === "panel"
              ? "Felices fiestas, equipo ProtecTerra."
              : "Sigamos creciendo juntos."}
        </p>
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
