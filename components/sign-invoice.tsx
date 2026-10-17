"use client";
import { useEffect, useState } from "react";
import type { InvoiceSignatureDoc, Signature } from "@/lib/types";
import { signInvoice } from "./data";
import { ErrorNote, Field, Stat } from "./ui";
import { SignaturePad } from "./signature";
import { InvoicePages } from "./invoice-pages";
import { renderPages, type PageImage } from "@/lib/pdfjs";
import { date, dateTime } from "@/lib/format";
import { downloadPdf } from "@/lib/statement";
import {
  amount,
  fitSpot,
  invoiceLabel,
  invoiceStatement,
  sha256Hex,
  signatureCaption,
  signedInvoicePdf,
} from "@/lib/signed-invoice";

/** Página del enlace privado: el cliente revisa su factura y la firma con nombre, cédula y firma a mano. */
export default function SignInvoice({ prefix, initial }: { prefix: "pt_" | "ia_"; initial: InvoiceSignatureDoc }) {
  const [doc, setDoc] = useState(initial);
  const [pages, setPages] = useState<PageImage[] | null>(null);
  const [original, setOriginal] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [signature, setSignature] = useState<Signature | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [making, setMaking] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(initial.view_url);
        if (!r.ok) throw new Error();
        const bytes = await r.arrayBuffer();
        const rendered = await renderPages(bytes, initial.mime, 2);
        if (!alive) return;
        setOriginal(bytes);
        setPages(rendered);
      } catch {
        if (alive)
          setLoadError(
            "No se pudo mostrar la factura. Revise su conexión y vuelva a abrir el enlace. Si el problema sigue, pida uno nuevo.",
          );
      }
    })();
    return () => {
      alive = false;
    };
  }, [initial.view_url, initial.mime]);

  const signed = doc.status === "firmado" && !!doc.signed_at;
  const spot = fitSpot(doc.placement, pages?.length ?? doc.placement.page);
  const caption = signed ? signatureCaption(doc.signer_name ?? "", doc.signer_id ?? "", doc.signed_at!) : undefined;
  const logo = doc.company === "ProtecTerra";

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!signature) return setFormError("Dibuje su firma en el recuadro.");
    if (!agree) return setFormError("Marque la casilla para confirmar que está conforme.");
    setBusy(true);
    setFormError("");
    try {
      setDoc(await signInvoice(prefix, doc.token, name.trim(), idNumber, signature));
      window.scrollTo({ top: 0 });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!pages || !original || making) return;
    setMaking(true);
    try {
      const pdf = await signedInvoicePdf({ doc, pages, sha256: await sha256Hex(original) });
      downloadPdf(pdf, `Factura ${invoiceLabel(doc.invoice_number)} firmada.pdf`);
    } catch {
      setFormError("No se pudo preparar la copia. Intente de nuevo.");
    } finally {
      setMaking(false);
    }
  }

  return (
    <div className="seller">
      <header className="seller-head">
        <div>
          {logo ? (
            <img className="seller-logo" src="/logo-blanco-simple.svg" alt="ProtecTerra" width={518} height={177} />
          ) : (
            <span className="brand-small">{doc.company}</span>
          )}
          <h1>Factura N.º {invoiceLabel(doc.invoice_number)}</h1>
        </div>
      </header>
      <main className="seller-main">
        {signed ? (
          <p className="note ok" role="status">
            Listo. La factura quedó firmada por {doc.signer_name} el {dateTime(doc.signed_at)} (hora de Nicaragua).
            Gracias. Puede descargar su copia abajo.
          </p>
        ) : (
          <p className="note" role="status">
            {doc.company} le envía esta factura para su firma. Revísela y firme al final de la página. El enlace vence el{" "}
            {dateTime(doc.expires_at)}.
          </p>
        )}
        <div className="stats">
          <Stat label="Cliente" value={doc.customer_name} />
          <Stat label="Fecha" value={date(doc.sale_date)} />
          <Stat label="Total" value={amount(doc.total, doc.currency)} />
          {doc.kind === "credito" && <Stat label="Fecha prevista de pago" value={date(doc.due_date)} />}
        </div>

        <section className="card">
          <h2>Factura</h2>
          {!signed && <p className="muted small">El recuadro amarillo es donde quedará su firma.</p>}
          <ErrorNote error={loadError} />
          {!pages && !loadError && <p className="loading">Cargando la factura…</p>}
          {pages && (
            <InvoicePages
              pages={pages}
              spot={spot}
              signature={signed ? doc.signature : null}
              caption={caption}
              label="Su firma va aquí"
            />
          )}
        </section>

        <section className="card">
          <h2>{signed ? "Firma" : "Firmar"}</h2>
          {signed ? (
            <div className="form">
              <p>{invoiceStatement(doc)}</p>
              <p className="muted">
                Firmado por {doc.signer_name}, cédula {doc.signer_id}, el {dateTime(doc.signed_at)}.
              </p>
              <div className="actions">
                <button className="btn primary" disabled={!pages || making} onClick={() => void download()}>
                  {making ? "Preparando…" : "Descargar mi copia firmada"}
                </button>
              </div>
              <ErrorNote error={formError} />
            </div>
          ) : (
            <form className="form" onSubmit={sign}>
              <Field label="Nombre completo de quien firma">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Nombre y apellidos"
                />
              </Field>
              <Field label="Número de cédula" hint="Así: 001-010190-0001A">
                <input
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value.toUpperCase())}
                  required
                  maxLength={20}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="001-010190-0001A"
                />
              </Field>
              <div className="field">
                <span>Su firma</span>
                <SignaturePad value={signature} onChange={setSignature} />
              </div>
              <label className="check">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />{" "}
                {invoiceStatement(doc)}
              </label>
              <ErrorNote error={formError} />
              <div className="actions">
                <button className="btn primary" disabled={busy || !pages}>
                  {busy ? "Firmando…" : "Firmar factura"}
                </button>
              </div>
            </form>
          )}
        </section>
        <p className="muted small center">{doc.company} · Documento privado</p>
      </main>
    </div>
  );
}
