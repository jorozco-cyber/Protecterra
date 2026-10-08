"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Signature } from "@/lib/types";

// Lienzo amplio para firmar con el dedo; la firma se recorta a su tamaño real.
const W = 600;
const H = 340;

const toPath = (st: number[]) => {
  let d = `M${st[0]} ${st[1]}`;
  if (st.length < 4) d += ` L${st[0] + 0.1} ${st[1]}`;
  for (let k = 2; k + 1 < st.length; k += 2) d += ` L${st[k]} ${st[k + 1]}`;
  return d;
};

/** Recorta la firma a lo que realmente se dibujó, con un pequeño margen, para que se vea igual en pantalla y en el PDF. */
export function trimStrokes(strokes: number[][]): Signature {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const st of strokes)
    for (let k = 0; k + 1 < st.length; k += 2) {
      minX = Math.min(minX, st[k]);
      maxX = Math.max(maxX, st[k]);
      minY = Math.min(minY, st[k + 1]);
      maxY = Math.max(maxY, st[k + 1]);
    }
  const pad = 8;
  // Una firma muy angosta o muy baja no debe estirarse al mostrarse.
  const w = Math.max(maxX - minX, 120);
  const h = Math.max(maxY - minY, 40);
  const dx = minX - pad - (w - (maxX - minX)) / 2;
  const dy = minY - pad - (h - (maxY - minY)) / 2;
  return {
    w: Math.round(w + pad * 2),
    h: Math.round(h + pad * 2),
    strokes: strokes.map((st) => st.map((v, k) => Math.round((v - (k % 2 ? dy : dx)) * 10) / 10)),
  };
}

/** Muestra una firma ya guardada. */
export function SignatureView({ signature, className }: { signature: Signature | null; className?: string }) {
  if (!signature || !signature.strokes.length) return null;
  return (
    <svg
      className={"signature-view" + (className ? " " + className : "")}
      viewBox={`0 0 ${signature.w} ${signature.h}`}
      role="img"
      aria-label="Firma"
    >
      {signature.strokes.map((st, i) => (
        <path key={i} d={toPath(st)} />
      ))}
    </svg>
  );
}

/** Panel a pantalla completa solo para firmar: la página de atrás no se mueve mientras el dedo dibuja. */
function SignaturePanel({
  host,
  onDone,
  onCancel,
}: {
  host: HTMLElement;
  onDone: (signature: Signature) => void;
  onCancel: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const ref = useRef<SVGSVGElement>(null);
  const drawing = useRef<number[] | null>(null);
  const [strokes, setStrokes] = useState<number[][]>([]);
  const [, redraw] = useState(0);

  useEffect(() => {
    // Mientras el panel está abierto, ni la página ni el panel se desplazan.
    const body = document.body;
    const before = { overflow: body.style.overflow, touch: body.style.touchAction };
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    const node = panel.current;
    const stop = (e: TouchEvent) => {
      if (!(e.target as HTMLElement).closest("button")) e.preventDefault();
    };
    node?.addEventListener("touchstart", stop, { passive: false });
    node?.addEventListener("touchmove", stop, { passive: false });
    // Escape cierra solo este panel, no la ventana que lo abrió.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", key, true);
    return () => {
      body.style.overflow = before.overflow;
      body.style.touchAction = before.touch;
      node?.removeEventListener("touchstart", stop);
      node?.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", key, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function point(e: React.PointerEvent): [number, number] {
    const box = ref.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - box.left) / box.width) * W);
    const y = Math.round(((e.clientY - box.top) / box.height) * H);
    return [Math.max(0, Math.min(W, x)), Math.max(0, Math.min(H, y))];
  }
  function down(e: React.PointerEvent) {
    e.preventDefault();
    ref.current?.setPointerCapture(e.pointerId);
    drawing.current = [...point(e)];
    redraw((n) => n + 1);
  }
  function move(e: React.PointerEvent) {
    const st = drawing.current;
    if (!st) return;
    const [x, y] = point(e);
    const dx = x - st[st.length - 2];
    const dy = y - st[st.length - 1];
    if (dx * dx + dy * dy < 4) return;
    st.push(x, y);
    redraw((n) => n + 1);
  }
  function up() {
    const st = drawing.current;
    if (!st) return;
    drawing.current = null;
    setStrokes((old) => [...old, st]);
  }

  const all = drawing.current ? [...strokes, drawing.current] : strokes;
  // Sobre la ventana que lo abrió (o sobre la página), para que nada lo recorte.
  return createPortal(
    <div className="signature-panel" ref={panel} role="dialog" aria-modal="true" aria-label="Firmar">
      <header>
        <b>Firma aquí</b>
        <span>Usa el dedo. Puedes girar el teléfono para tener más espacio.</span>
      </header>
      <div className="signature-panel-canvas">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label="Recuadro para firmar"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <line x1="40" y1={H - 70} x2={W - 40} y2={H - 70} className="signature-guide" />
          {all.map((st, i) => (
            <path key={i} d={toPath(st)} />
          ))}
        </svg>
      </div>
      <footer>
        <button
          type="button"
          className="btn"
          disabled={!all.length}
          onClick={() => {
            drawing.current = null;
            setStrokes([]);
          }}
        >
          Borrar
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!strokes.length}
          onClick={() => onDone(trimStrokes(strokes))}
        >
          Listo
        </button>
      </footer>
    </div>,
    host,
  );
}

/** Campo de firma: muestra la firma hecha y abre el panel para firmar. Entrega los trazos; no guarda nada por sí mismo. */
export function SignaturePad({
  value,
  onChange,
}: {
  value: Signature | null;
  onChange: (signature: Signature | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  // Si el campo está dentro de una ventana emergente, el panel se abre encima de ella.
  const open = () => setHost((wrap.current?.closest("dialog") as HTMLElement | null) ?? document.body);
  return (
    <div className="signature-pad" ref={wrap}>
      {value ? (
        <button type="button" className="signature-pad-preview" aria-label="Cambiar firma" onClick={open}>
          <SignatureView signature={value} />
        </button>
      ) : (
        <button type="button" className="signature-pad-empty" onClick={open}>
          Toca aquí para firmar
        </button>
      )}
      <div className="signature-pad-foot">
        <span className="muted small">
          {value ? "Si no quedó bien, firma otra vez." : "Se abre un panel solo para tu firma."}
        </span>
        <button type="button" className="btn small" onClick={open}>
          {value ? "Firmar otra vez" : "Firmar"}
        </button>
      </div>
      {host && (
        <SignaturePanel
          host={host}
          onCancel={() => setHost(null)}
          onDone={(signature) => {
            onChange(signature);
            setHost(null);
          }}
        />
      )}
    </div>
  );
}
