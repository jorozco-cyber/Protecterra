"use client";
import { useEffect, useRef, useState } from "react";
import type { Signature } from "@/lib/types";

const W = 600;
const H = 200;

const toPath = (st: number[]) => {
  let d = `M${st[0]} ${st[1]}`;
  if (st.length < 4) d += ` L${st[0] + 0.1} ${st[1]}`;
  for (let k = 2; k + 1 < st.length; k += 2) d += ` L${st[k]} ${st[k + 1]}`;
  return d;
};

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

/** Recuadro para firmar con el dedo o el ratón. Entrega los trazos; no guarda nada por sí mismo. */
export function SignaturePad({
  value,
  onChange,
}: {
  value: Signature | null;
  onChange: (signature: Signature | null) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<number[][]>(value?.strokes ?? []);
  const drawing = useRef<number[] | null>(null);
  const [, redraw] = useState(0);

  useEffect(() => {
    setStrokes(value?.strokes ?? []);
  }, [value]);

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
    const next = [...strokes, st];
    setStrokes(next);
    onChange({ w: W, h: H, strokes: next });
  }
  function clear() {
    drawing.current = null;
    setStrokes([]);
    onChange(null);
  }

  const all = drawing.current ? [...strokes, drawing.current] : strokes;
  return (
    <div className="signature-pad">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Recuadro para firmar"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <line x1="30" y1={H - 40} x2={W - 30} y2={H - 40} className="signature-guide" />
        {all.map((st, i) => (
          <path key={i} d={toPath(st)} />
        ))}
      </svg>
      <div className="signature-pad-foot">
        <span className="muted small">
          {all.length ? "Si no quedó bien, bórrala y firma otra vez." : "Firma aquí con el dedo o el ratón."}
        </span>
        <button type="button" className="btn small" onClick={clear} disabled={!all.length}>
          Borrar
        </button>
      </div>
    </div>
  );
}
