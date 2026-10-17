"use client";
import { useEffect, useState } from "react";
import type { PageImage } from "@/lib/pdfjs";
import type { Signature, SignatureSpot } from "@/lib/types";
import { SignatureView } from "./signature";

/**
 * Muestra las páginas de la factura una debajo de otra, con el campo de firma marcado.
 * Con `onPick`, tocar una página mueve el campo a ese lugar (para el administrador).
 * Con `signature`, la firma aparece dentro del campo.
 */
export function InvoicePages({
  pages,
  spot,
  onPick,
  signature,
  caption,
  label = "Firma aquí",
}: {
  pages: PageImage[];
  spot: SignatureSpot;
  onPick?: (page: number, fx: number, fy: number) => void;
  signature?: Signature | null;
  caption?: string;
  label?: string;
}) {
  const urls = usePageUrls(pages);
  return (
    <div className={"invoice-pages" + (onPick ? " picking" : "")}>
      {pages.map((p, i) => (
        <div
          key={i}
          className="invoice-page"
          style={{ aspectRatio: `${p.width} / ${p.height}` }}
          onClick={
            onPick
              ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onPick(i + 1, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
                }
              : undefined
          }
        >
          {urls[i] ? (
            <img src={urls[i]} alt={`Página ${i + 1} de la factura`} draggable={false} />
          ) : (
            <span className="invoice-page-wait">Cargando página…</span>
          )}
          {spot.page === i + 1 && (
            <div
              className={"invoice-spot" + (signature ? " signed" : "")}
              style={{
                left: `${spot.x * 100}%`,
                top: `${spot.y * 100}%`,
                width: `${spot.w * 100}%`,
                height: `${spot.h * 100}%`,
              }}
            >
              {signature ? (
                <>
                  <SignatureView signature={signature} className="invoice-spot-sign" />
                  {caption && <span className="invoice-spot-caption">{caption}</span>}
                </>
              ) : (
                <span className="invoice-spot-label">{label}</span>
              )}
            </div>
          )}
          {pages.length > 1 && <span className="invoice-page-num">{`${i + 1} / ${pages.length}`}</span>}
        </div>
      ))}
    </div>
  );
}

/** Convierte las imágenes de las páginas en direcciones que el navegador puede mostrar, y las libera al salir. */
function usePageUrls(pages: PageImage[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    void (async () => {
      for (const p of pages) {
        const blob = await new Promise<Blob | null>((ok) => p.canvas.toBlob(ok, "image/jpeg", 0.85));
        if (!alive) return;
        const url = blob ? URL.createObjectURL(blob) : p.canvas.toDataURL("image/jpeg", 0.85);
        made.push(url);
        setUrls([...made]);
      }
    })();
    return () => {
      alive = false;
      made.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
    };
  }, [pages]);
  return urls;
}
