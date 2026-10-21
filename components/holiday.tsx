"use client";
import { useEffect, useState, type CSSProperties } from "react";

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
        {Array.from({ length: sparse ? 12 : 26 }, (_, i) => {
          const flake = i % 5 !== 1 && i % 5 !== 3; // 3 de cada 5 son copos; el resto, puntos de nieve
          return (
            <span
              className={"holiday-flake holiday-motion" + (flake ? " star" : "")}
              key={i}
              style={{
                left: `${(i * 37 + 7) % 98}%`,
                "--flake-size": `${flake ? 11 + ((i * 7) % 9) : 3 + (i % 3)}px`,
                "--flake-opacity": flake ? 0.78 + ((i * 3) % 4) * 0.06 : 0.75,
                animationDuration: `${12 + (i % 7) * 2}s`,
                animationDelay: `${-((i * 7 + 3) % 29)}s`,
              } as CSSProperties}
            >
              {flake ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M12 1v22M2.5 6.5l19 11M2.5 17.5l19-11M8 4l4 3 4-3M8 20l4-3 4 3M3 10l4-2-.5-5M21 14l-4 2 .5 5M6.5 21 7 16l-4-2M17.5 3 17 8l4 2" />
                </svg>
              ) : <i />}
            </span>
          );
        })}
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

/** Rama de pino en la esquina superior derecha del panel. */
export function HolidayMainCorner() {
  return <img className="holiday-main-corner" src="/holiday/evergreen.svg" alt="" width="360" height="260" aria-hidden="true" />;
}

/** Hoy en Nicaragua, AAAA-MM-DD. */
const todayNi = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
/** Saludo según la fecha: cuenta regresiva hasta Navidad, luego Navidad y Año Nuevo. */
export function greeting(date: string) {
  const year = Number(date.slice(0, 4)),
    md = date.slice(5);
  if (md === "12-24" || md === "12-25") return { title: "¡Feliz Navidad!", days: 0 };
  if (md >= "12-26") return { title: `¡Feliz ${year + 1}!`, days: 0 };
  if (md <= "01-06") return { title: `¡Feliz ${year}!`, days: 0 };
  const days = Math.round((Date.parse(`${year}-12-25T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);
  return { title: `Felices Fiestas ${year}`, days };
}

/** Portada del inicio: la finca de noche, Santa cruzando la luna y el contador. */
function FincaBanner({ className = "" }: { className?: string }) {
  const [date, setDate] = useState("");
  useEffect(() => setDate(todayNi()), []);
  const g = date ? greeting(date) : null;
  return (
    <section className={`holiday-finca ${className}`.trim()} aria-label="Saludo navideño">
      <img className="holiday-finca-art" src="/holiday/finca-noche.webp" alt="" width="2400" height="461" aria-hidden="true" />
      <HolidayBackdrop />
      <div className="holiday-finca-fly" aria-hidden="true">
        <div className="holiday-finca-sleigh holiday-motion">
          <img src="/holiday/santa-sleigh.webp" alt="" width="900" height="207" />
        </div>
      </div>
      {/* El mismo vuelo, oscuro y recortado a la luna: silueta al cruzarla. */}
      <div className="holiday-finca-fly holiday-finca-moon" aria-hidden="true">
        <div className="holiday-finca-sleigh holiday-motion">
          <img src="/holiday/santa-sleigh.webp" alt="" width="900" height="207" />
        </div>
      </div>
      {g && (
        <div className="holiday-finca-copy">
          <h2>{g.title}</h2>
          {g.days > 0 && (
            <p className="holiday-finca-count">
              <b>{g.days}</b>
              <span>{g.days === 1 ? "día para Navidad" : "días para Navidad"}</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function HolidayBanner({ variant = "panel" }: { variant?: "panel" | "seller" | "login" }) {
  if (variant === "panel") return <FincaBanner />;
  if (variant === "seller") return <FincaBanner className="holiday-finca-seller" />;
  return (
    <section className={`holiday-banner holiday-banner-${variant}`} aria-label="Saludo navideño">
      <img className="holiday-fields" src="/holiday/fields.svg" alt="" width="1200" height="100" aria-hidden="true" />
      <div className="holiday-copy">
        <h2>Felices fiestas</h2>
        <p>Sigamos creciendo juntos.</p>
      </div>
      <SleighFlight />
    </section>
  );
}
