"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./app";
import {
  attachFile,
  call,
  createInvoiceSignature,
  emailInvoiceSignature,
  fileBytes,
  invoiceViewUrl,
  save,
} from "../data";
import { ErrorNote, FileLink, Modal, VoidDialog } from "../ui";
import { InvoicePages } from "../invoice-pages";
import { renderPages, type PageImage } from "@/lib/pdfjs";
import {
  defaultSpot,
  fitSpot,
  invoiceLabel,
  sha256Hex,
  signedInvoicePdf,
} from "@/lib/signed-invoice";
import { company } from "@/lib/company";
import { dateTime } from "@/lib/format";
import type { Customer, FileRef, InvoiceSignature, InvoiceSignatureDoc, Sale, SignatureSpot } from "@/lib/types";

/** Enlace vigente (pendiente o firmado) de una factura, si lo hay. */
export function liveSignature(list: InvoiceSignature[], saleId: string): InvoiceSignature | null {
  return list.find((s) => s.sale_id === saleId && s.status !== "anulado") ?? null;
}

function mimeOf(file: FileRef): string {
  const f = file as { mime?: string; filename?: string; path?: string } | null;
  if (f?.mime) return f.mime;
  const name = (f?.filename || f?.path || "").toLowerCase();
  if (/\.(jpe?g)$/.test(name)) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "application/pdf";
}

function signLink(token: string): string {
  return `${window.location.origin}/factura/${token}`;
}

/** Datos del enlace tal como los ve el cliente, para armar la copia firmada. */
function asDoc(s: InvoiceSignature): InvoiceSignatureDoc {
  return { ...s, company: company().name, currency: company().currency, mime: s.file.mime };
}

/** Sección "Firma del cliente" dentro del detalle de la venta. */
export function InvoiceSignaturePanel({ sale }: { sale: Sale }) {
  const { data, reload, notify } = useApp();
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const live = liveSignature(data.invoiceSignatures, sale.id);
  const hasFile = !!(sale.invoice_file as { path?: string } | null)?.path;

  // Al abrir una factura recién firmada, el aviso de la pantalla de inicio se da por visto.
  useEffect(() => {
    if (live?.status !== "firmado" || live.admin_seen_at) return;
    void save("pt_invoice_signatures", { admin_seen_at: new Date().toISOString() }, live.id)
      .then(reload)
      .catch(() => undefined);
  }, [live?.id, live?.status, live?.admin_seen_at, reload]);

  if (sale.voided_at && !live) return null;
  const expired = live?.status === "enviado" && new Date(live.expires_at).getTime() < Date.now();

  return (
    <section className="invoice-sign-status" aria-label="Firma del cliente">
      <strong>Firma del cliente</strong>
      {!live ? (
        hasFile ? (
          <div className="actions">
            <span className="muted small">Envíale al cliente un enlace para que firme esta factura desde su teléfono.</span>
            {!sale.voided_at && (
              <button className="btn primary small" onClick={() => setSending(true)}>
                Enviar para firma
              </button>
            )}
          </div>
        ) : (
          <span className="muted small">Para pedir la firma del cliente, primero sube la factura digital.</span>
        )
      ) : live.status === "enviado" ? (
        <>
          <span className={expired ? "danger-text" : "muted"}>
            {expired
              ? `El enlace venció el ${dateTime(live.expires_at)} sin firma. Envía uno nuevo.`
              : `Esperando la firma del cliente. Enviada el ${dateTime(live.created_at)}; el enlace vence el ${dateTime(live.expires_at)}.`}
          </span>
          <div className="actions">
            {!expired && (
              <button className="btn small primary" onClick={() => setSharing(true)}>
                Compartir enlace
              </button>
            )}
            <button className="btn small" onClick={() => setSending(true)}>
              {expired ? "Enviar enlace nuevo" : "Cambiar lugar de la firma"}
            </button>
            <button className="btn small link danger-text" onClick={() => setVoiding(true)}>
              Anular enlace
            </button>
          </div>
        </>
      ) : (
        <>
          <span>
            Firmada por <strong>{live.signer_name}</strong> (cédula {live.signer_id}) el {dateTime(live.signed_at)}.
          </span>
          <div className="actions">
            {live.signed_file ? (
              <FileLink file={live.signed_file} label="Factura firmada" />
            ) : (
              <span className="muted small">Guardando la copia firmada…</span>
            )}
            <button className="btn small link danger-text" onClick={() => setVoiding(true)}>
              Anular firma
            </button>
          </div>
        </>
      )}
      {sending && <SendForSignature sale={sale} onClose={() => setSending(false)} />}
      {sharing && live && (
        <Modal title={`Factura ${invoiceLabel(live.invoice_number)} · enlace para firmar`} onClose={() => setSharing(false)}>
          <ShareLink signature={live} sale={sale} />
          <div className="actions">
            <button className="btn" onClick={() => setSharing(false)}>
              Listo
            </button>
          </div>
        </Modal>
      )}
      {voiding && live && (
        <VoidDialog
          title={live.status === "firmado" ? "Anular la firma" : "Anular el enlace"}
          warning={
            live.status === "firmado"
              ? "La firma queda anulada (no se borra: sigue en el registro de cambios). Después puedes pedir otra."
              : "El cliente ya no podrá abrir ni firmar con este enlace."
          }
          onClose={() => setVoiding(false)}
          onConfirm={async (reason) => {
            await call("pt_void_invoice_signature", { p_id: live.id, p_reason: reason });
            await reload();
            notify(live.status === "firmado" ? "Firma anulada" : "Enlace anulado");
          }}
        />
      )}
    </section>
  );
}

/** Marcar el campo de firma en la factura y crear el enlace. */
function SendForSignature({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { data, reload } = useApp();
  const [pages, setPages] = useState<PageImage[] | null>(null);
  const [spot, setSpot] = useState<SignatureSpot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const file = sale.invoice_file as { path: string } | null;

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const bytes = await fileBytes(file!.path);
        const rendered = await renderPages(bytes, mimeOf(sale.invoice_file), 1.5);
        if (!alive) return;
        if (!rendered.length) throw new Error("La factura no tiene páginas.");
        const previous = liveSignature(data.invoiceSignatures, sale.id)?.placement ?? data.signatureSpot;
        setPages(rendered);
        setSpot(fitSpot(previous ?? defaultSpot(rendered.length), rendered.length));
      } catch (e) {
        if (alive) setError((e as Error).message || "No se pudo abrir la factura.");
      }
    })();
    return () => {
      alive = false;
    };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resize = (dw: number, dh: number) =>
    spot &&
    pages &&
    setSpot(
      fitSpot(
        { ...spot, x: spot.x - (spot.w * (dw - 1)) / 2, y: spot.y - (spot.h * (dh - 1)) / 2, w: spot.w * dw, h: spot.h * dh },
        pages.length,
      ),
    );

  async function create() {
    if (!spot || busy) return;
    setBusy(true);
    setError("");
    try {
      const url = await invoiceViewUrl(file!.path);
      const r = await createInvoiceSignature(sale.id, spot, url);
      await reload();
      setMade(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const created = made ? data.invoiceSignatures.find((s) => s.id === made) : null;
  return (
    <Modal title={`Factura ${invoiceLabel(sale.invoice_number)} · enviar para firma`} onClose={onClose} wide>
      {created ? (
        <>
          <p className="note ok" role="status">
            Enlace listo. Mándaselo a {sale.customer_name}: lo abre en su teléfono, escribe su nombre y cédula y firma en
            el campo marcado. Vence en 7 días y sirve una sola vez.
          </p>
          <ShareLink signature={created} sale={sale} />
          <div className="actions">
            <button className="btn primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Toca la factura donde el cliente debe firmar: el recuadro amarillo es el campo de firma. La app recuerda el
            lugar para las próximas facturas.
          </p>
          {spot && pages && (
            <div className="spot-tools">
              <span className="muted small">Tamaño del campo:</span>
              <button type="button" className="btn small" onClick={() => resize(1.15, 1)}>
                Más ancho
              </button>
              <button type="button" className="btn small" onClick={() => resize(1 / 1.15, 1)}>
                Más angosto
              </button>
              <button type="button" className="btn small" onClick={() => resize(1, 1.2)}>
                Más alto
              </button>
              <button type="button" className="btn small" onClick={() => resize(1, 1 / 1.2)}>
                Más bajo
              </button>
            </div>
          )}
          <ErrorNote error={error} />
          {!pages && !error && <p className="loading">Abriendo la factura…</p>}
          {pages && spot && (
            <InvoicePages
              pages={pages}
              spot={spot}
              label="Firma del cliente"
              onPick={(page, fx, fy) =>
                setSpot(fitSpot({ ...spot, page, x: fx - spot.w / 2, y: fy - spot.h / 2 }, pages.length))
              }
            />
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn primary" disabled={!spot || busy} onClick={() => void create()}>
              {busy ? "Creando enlace…" : "Crear enlace de firma"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** El enlace con las formas de mandarlo: copiar, WhatsApp o correo. */
function ShareLink({ signature, sale }: { signature: InvoiceSignature; sale: Sale }) {
  const { data, reload } = useApp();
  const [copied, setCopied] = useState(false);
  const [mail, setMail] = useState<"" | "busy" | "sent">(signature.email_sent_at ? "sent" : "");
  const [error, setError] = useState("");
  const customer: Customer | undefined = data.customers.find((c) => c.id === sale.customer_id);
  const link = signLink(signature.token);
  const message =
    `Hola ${sale.customer_name}, le enviamos la factura N.º ${invoiceLabel(signature.invoice_number)} de ` +
    `${company().name} para su firma. Ábrala aquí, revísela y firme desde su teléfono: ${link}\n` +
    `El enlace vence el ${dateTime(signature.expires_at)}.`;
  const digits = (customer?.phone ?? "").replace(/\D/g, "");
  const phone = digits.length === 8 ? "505" + digits : digits.length >= 10 ? digits : "";
  const whatsapp = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("No se pudo copiar. Mantén presionado el enlace para copiarlo.");
    }
  }

  async function email() {
    setMail("busy");
    setError("");
    try {
      await emailInvoiceSignature(signature.id);
      setMail("sent");
      await reload();
    } catch (e) {
      setMail("");
      setError((e as Error).message);
    }
  }

  return (
    <div className="form">
      <div className="share-link">
        <span>{link}</span>
      </div>
      <div className="actions">
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? "Copiado ✓" : "Copiar enlace"}
        </button>
        <a className="btn primary" href={whatsapp} target="_blank" rel="noopener noreferrer">
          Enviar por WhatsApp
        </a>
        {customer?.email && (
          <button type="button" className="btn" disabled={mail === "busy"} onClick={() => void email()}>
            {mail === "busy" ? "Enviando…" : mail === "sent" ? "Enviado por correo ✓" : `Enviar a ${customer.email}`}
          </button>
        )}
      </div>
      {!phone && (
        <p className="muted small">
          Este cliente no tiene teléfono guardado: WhatsApp te pedirá elegir el contacto. Puedes agregarlo en Clientes.
        </p>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

/**
 * Cuando un cliente firma, la copia firmada de la factura se arma y se guarda sola en el almacén
 * la próxima vez que el administrador abre la app.
 */
export function SignedInvoiceKeeper() {
  const { data, reload } = useApp();
  const storing = useRef(new Set<string>());
  useEffect(() => {
    const todo = data.invoiceSignatures.filter(
      (s) => s.status === "firmado" && !s.signed_file && !storing.current.has(s.id),
    );
    if (!todo.length) return;
    todo.forEach((s) => storing.current.add(s.id));
    void (async () => {
      let saved = 0;
      for (const s of todo) {
        try {
          const bytes = await fileBytes(s.file.path);
          const [pages, sha256] = await Promise.all([renderPages(bytes, s.file.mime, 2), sha256Hex(bytes)]);
          const pdf = await signedInvoicePdf({ doc: asDoc(s), pages, sha256, ip: s.signed_ip, agent: s.signed_agent });
          const name = `Factura ${invoiceLabel(s.invoice_number)} firmada.pdf`;
          await attachFile("pt_invoice_signatures", s.id, "signed_file", new File([pdf.slice().buffer], name, { type: "application/pdf" }));
          saved++;
        } catch (e) {
          console.error("Copia firmada:", e);
          storing.current.delete(s.id);
        }
      }
      if (saved) await reload();
    })();
  }, [data.invoiceSignatures, reload]);
  return null;
}
