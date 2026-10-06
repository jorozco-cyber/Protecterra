"use client";
import { useEffect, useState } from "react";
import type { ReceiptDoc, Signature } from "@/lib/types";
import { loadReceipt, signReceipt } from "./data";
import { Badge, ErrorNote, Field, Stat, logout } from "./ui";
import { SignaturePad, SignatureView } from "./signature";
import { date, dateTime, money, plural } from "@/lib/format";
import { receiptByCustomer, receiptFileName, receiptNumber, receiptPdf, receiptStatement } from "@/lib/receipt";
import { downloadPdf } from "@/lib/statement";

/** Página del enlace privado: el vendedor revisa su recibo de comisiones y lo firma. */
export default function SignReceipt({ token, email }: { token: string; email: string }) {
  const [doc, setDoc] = useState<ReceiptDoc | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<Signature | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    loadReceipt(token)
      .then((d) => {
        setDoc(d);
        setName(d.seller_name);
      })
      .catch((e: Error) => setError(e.message));
  }, [token]);

  async function sign(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !doc) return;
    if (!signature) return setFormError("Dibuja tu firma en el recuadro.");
    if (!agree) return setFormError("Marca la casilla para confirmar que estás conforme.");
    setBusy(true);
    setFormError("");
    try {
      setDoc(await signReceipt(token, name.trim(), signature));
      window.scrollTo({ top: 0 });
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const signed = !!doc?.signed_at;
  return (
    <div className="seller">
      <header className="seller-head">
        <div>
          <img className="seller-logo" src="/logo-blanco-simple.svg" alt="ProtecTerra" width={518} height={177} />
          <h1>Recibo de comisiones{doc ? ` N.º ${receiptNumber(doc.number)}` : ""}</h1>
        </div>
        <a className="btn small" href="/">
          Ir a mi portal
        </a>
      </header>
      <main className="seller-main">
        <ErrorNote error={error} />
        {error && (
          <p className="muted">
            Estás conectado como {email}.{" "}
            <button className="btn link" onClick={logout}>
              Entrar con otra cuenta
            </button>
          </p>
        )}
        {!doc && !error && <p className="loading">Cargando…</p>}
        {doc && (
          <>
            {signed ? (
              <p className="note ok" role="status">
                Documento firmado por {doc.signer_name} el {dateTime(doc.signed_at)} (hora de Nicaragua). Puedes
                descargar tu copia abajo.
              </p>
            ) : (
              <p className="note" role="status">
                Revisa el detalle y firma al final para dar tu conformidad con el monto.
              </p>
            )}
            <div className="stats">
              <Stat label="Vendedor" value={doc.seller_name} />
              <Stat label="Facturas recuperadas" value={String(doc.items.length)} />
              <Stat label="Total de las ventas" value={money(doc.total_sales)} />
              <Stat label="Comisión a pagar" value={money(doc.total_commission)} tone="ok" />
            </div>

            <section className="card">
              <h2>Detalle por factura</h2>
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th>Cliente</th>
                      <th className="num hide-sm">Total de la venta</th>
                      <th className="num">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.items.map((it) => (
                      <tr key={it.sale_id}>
                        <td>
                          {it.invoice_number ?? "s/n"}
                          <small>Recuperada el {date(it.recovered_on)}</small>
                        </td>
                        <td>{it.customer_name}</td>
                        <td className="num hide-sm">{money(it.total)}</td>
                        <td className="num">{money(it.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td>{plural(doc.items.length, "factura", "facturas")}</td>
                      <td className="num hide-sm">{money(doc.total_sales)}</td>
                      <td className="num">{money(doc.total_commission)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="card">
              <h2>Resumen por cliente</h2>
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="num hide-sm">Facturas</th>
                      <th className="num hide-sm">Total de las ventas</th>
                      <th className="num">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptByCustomer(doc).map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td className="num hide-sm">{c.invoices}</td>
                        <td className="num hide-sm">{money(c.total)}</td>
                        <td className="num">{money(c.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="num hide-sm">{doc.items.length}</td>
                      <td className="num hide-sm">{money(doc.total_sales)}</td>
                      <td className="num">{money(doc.total_commission)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section className="card">
              <h2>Conformidad</h2>
              <p>{receiptStatement(doc)}</p>
              <div className="sign-blocks">
                <div className="sign-block">
                  <SignatureView signature={doc.issuer_signature} />
                  <strong>Entregué conforme</strong>
                  <span>{doc.issuer_name}</span>
                  <small className="muted">ProtecTerra</small>
                </div>
                {signed && (
                  <div className="sign-block">
                    <SignatureView signature={doc.signature} />
                    <strong>Recibí conforme</strong>
                    <span>{doc.signer_name}</span>
                    <small className="muted">Firmado el {dateTime(doc.signed_at)}</small>
                  </div>
                )}
              </div>
              {signed ? (
                <div className="actions">
                  <Badge tone="ok">Firmado</Badge>
                  <button className="btn primary" onClick={() => downloadPdf(receiptPdf(doc), receiptFileName(doc))}>
                    Descargar PDF firmado
                  </button>
                </div>
              ) : !doc.can_sign ? (
                <div className="form">
                  <p className="note" role="status">
                    Pendiente de firma. Solo {doc.seller_name} puede firmar este recibo, entrando con su propia cuenta.
                  </p>
                  <div className="actions">
                    <button className="btn" onClick={() => downloadPdf(receiptPdf(doc), receiptFileName(doc))}>
                      Ver PDF sin firmar
                    </button>
                  </div>
                </div>
              ) : (
                <form className="form" onSubmit={sign}>
                  <Field label="Tu nombre completo">
                    <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
                  </Field>
                  <div className="field">
                    <span>Tu firma (Recibí conforme)</span>
                    <SignaturePad value={signature} onChange={setSignature} />
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Revisé el
                    detalle y estoy conforme con la comisión de {money(doc.total_commission)}.
                  </label>
                  <ErrorNote error={formError} />
                  <div className="actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => downloadPdf(receiptPdf(doc), receiptFileName(doc))}
                    >
                      Ver PDF sin firmar
                    </button>
                    <button className="btn primary" disabled={busy}>
                      {busy ? "Firmando…" : "Firmar documento"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </>
        )}
        <p className="muted small center">ProtecTerra · Documento privado · {email}</p>
      </main>
    </div>
  );
}
