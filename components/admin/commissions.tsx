"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./app";
import { attachFile, call, emailReceipt, save, saveSetting } from "../data";
import { Badge, Empty, ErrorNote, Field, FileLink, Modal, Stat, VoidDialog, useSubmit } from "../ui";
import { SignaturePad, SignatureView } from "../signature";
import { date, dateTime, money, monthName, pct, plural, today } from "@/lib/format";
import { receiptFileName, receiptNumber, receiptPdf } from "@/lib/receipt";
import { downloadPdf } from "@/lib/statement";
import { commissionStage, commissionTotals, type CommissionStage } from "@/lib/calc";
import { SaleDetail } from "./sales";
import type { CommissionReceipt, Seller, Signature } from "@/lib/types";
import SellerApp, { CommissionBadge } from "../seller/app";

type Share = { id: string; number: number; token: string; note: string };

export default function Commissions() {
  const { data, reload, notify } = useApp();
  const sellers = data.sellers;
  const [sellerId, setSellerId] = useState(
    sellers.find((s) => s.portal_enabled)?.id ?? sellers.find((s) => s.active)?.id ?? "",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [edit, setEdit] = useState<Seller | "new" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Tarjeta elegida: la tabla de abajo muestra solo las facturas de ese grupo.
  const [stage, setStage] = useState<CommissionStage | null>(null);
  const [openSale, setOpenSale] = useState<string | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [voidReceipt, setVoidReceipt] = useState<CommissionReceipt | null>(null);
  const [payReceipt, setPayReceipt] = useState<CommissionReceipt | null>(null);
  const [sending, setSending] = useState(false);
  const seller = sellers.find((s) => s.id === sellerId) ?? null;
  const sales = useMemo(
    () => data.sales.filter((s) => !s.voided_at && s.seller_id === sellerId),
    [data.sales, sellerId],
  );
  const pending = sales.filter((s) => s.commission_status === "pendiente" && Math.abs(s.commission) > 0.005);
  // Cobros vigentes de cada venta, para saber en qué mes quedó recuperada la factura.
  const paymentsBySale = useMemo(() => {
    const map = new Map<string, { paid_on: string }[]>();
    for (const p of data.salePayments) {
      if (p.voided_at) continue;
      const list = map.get(p.sale_id);
      if (list) list.push(p);
      else map.set(p.sale_id, [p]);
    }
    return map;
  }, [data.salePayments]);
  const paymentsOf = (s: { id: string }) => paymentsBySale.get(s.id) ?? [];
  const stageOf = (s: (typeof sales)[number]) => commissionStage(s, paymentsOf(s), today());
  const totals = commissionTotals(sales, paymentsOf, today());
  const ready = pending.filter((s) => stageOf(s) === "lista");
  const tableRows = stage ? sales.filter((s) => Math.abs(s.commission) > 0.005 && stageOf(s) === stage) : pending;
  const card = (st: CommissionStage) => ({ onClick: () => setStage(stage === st ? null : st), active: stage === st });
  const STAGE_TITLE: Record<CommissionStage, string> = {
    lista: "Comisiones listas para pagar",
    proximo_mes: `Recuperado en ${monthName(today())} (se paga en ${monthName(today(), 1)})`,
    por_recuperar: "Comisiones por recuperar",
    pagada: "Comisiones ya pagadas",
  };
  const payments = data.commissionPayments.filter((p) => p.seller_id === sellerId);
  const selectedTotal = pending.filter((s) => selected.includes(s.id)).reduce((a, s) => a + s.commission, 0);
  const receipts = data.commissionReceipts.filter((r) => r.seller_id === sellerId);
  // Facturas que ya están en un recibo en curso: no se pueden meter en otro ni pagar por fuera.
  const inReceipt = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of data.commissionReceipts)
      if (r.status === "enviado" || r.status === "firmado") for (const it of r.items) map.set(it.sale_id, r.number);
    return map;
  }, [data.commissionReceipts]);

  // Cuando un recibo ya está firmado, su PDF se guarda solo en el almacén de archivos.
  const storing = useRef(new Set<string>());
  useEffect(() => {
    const todo = data.commissionReceipts.filter(
      (r) => r.signed_at && !r.file && r.status !== "anulado" && !storing.current.has(r.id),
    );
    if (!todo.length) return;
    todo.forEach((r) => storing.current.add(r.id));
    void (async () => {
      let saved = 0;
      for (const r of todo) {
        try {
          const pdf = new File([receiptPdf(r).slice().buffer], receiptFileName(r), { type: "application/pdf" });
          await attachFile("pt_commission_receipts", r.id, "file", pdf);
          saved++;
        } catch {
          storing.current.delete(r.id);
        }
      }
      if (saved) await reload();
    })();
  }, [data.commissionReceipts, reload]);

  async function sendForSignature() {
    if (!seller || sending) return;
    setSending(true);
    try {
      const made = await call<{ id: string; number: number; token: string }>("pt_create_commission_receipt", {
        p_seller: seller.id,
        p_sales: selected,
      });
      setSelected([]);
      let note = `Se envió por correo a ${seller.email ?? "el vendedor"}.`;
      try {
        await emailReceipt(made.id);
      } catch (e) {
        note = (e as Error).message;
      }
      await reload();
      setShare({ ...made, note });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Comisiones</h1>
        <div className="head-actions">
          <button className="btn" onClick={() => setSigOpen(true)}>
            Mi firma{data.issuer?.signature ? "" : " (falta)"}
          </button>
          <button className="btn" onClick={() => setEdit("new")}>
            Nuevo vendedor
          </button>
        </div>
      </div>

      <section className="card">
        <h2>Vendedores</h2>
        <div className="table-wrap flat">
          <table className="table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th className="num">Comisión</th>
                <th>Portal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id} className={s.id === sellerId ? "selected" : ""}>
                  <td>
                    <button className="cell-btn" onClick={() => (setSellerId(s.id), setSelected([]), setStage(null))}>
                      {s.name}
                    </button>
                    <small>{s.email ?? "sin correo"}</small>
                  </td>
                  <td className="num">{pct(s.commission_rate)}</td>
                  <td>
                    {!s.active ? (
                      <Badge>Inactivo</Badge>
                    ) : s.portal_enabled ? (
                      <Badge tone="ok">Activo</Badge>
                    ) : (
                      <Badge>Sin portal</Badge>
                    )}
                  </td>
                  <td className="num">
                    <button className="btn link" onClick={() => setPreview(s.id)}>
                      Ver su portal
                    </button>
                    <button className="btn link" onClick={() => setEdit(s)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {seller && (
        <>
          <div className="stats">
            <Stat
              label={`Listo para pagar a ${seller.name}`}
              value={money(totals.lista.amount)}
              hint={`${plural(totals.lista.count, "factura recuperada", "facturas recuperadas")} hasta ${monthName(today(), -1)}`}
              tone="ok"
              {...card("lista")}
            />
            <Stat
              label={`Recuperado en ${monthName(today())}`}
              value={money(totals.proximo_mes.amount)}
              hint={`${plural(totals.proximo_mes.count, "factura", "facturas")} · se paga a inicios de ${monthName(today(), 1)}`}
              {...card("proximo_mes")}
            />
            <Stat
              label="Por recuperar"
              value={money(totals.por_recuperar.amount)}
              hint={`${plural(totals.por_recuperar.count, "factura", "facturas")} aún con saldo`}
              tone="warn"
              {...card("por_recuperar")}
            />
            <Stat label="Pagado históricamente" value={money(totals.pagada.amount)} {...card("pagada")} />
          </div>
          <section className="card">
            <div className="card-head">
              <h2>
                {stage ? STAGE_TITLE[stage] : "Comisiones pendientes"}
                {stage && (
                  <>
                    {" "}
                    <button className="btn link" onClick={() => setStage(null)}>
                      Ver todas las pendientes
                    </button>
                  </>
                )}
              </h2>
              <div className="head-actions">
                <button
                  className="btn small"
                  onClick={() => setSelected(ready.filter((s) => !inReceipt.has(s.id)).map((s) => s.id))}
                >
                  Marcar las listas para pagar
                </button>
                <button
                  className="btn small"
                  disabled={selected.length === 0 || sending}
                  onClick={() => void sendForSignature()}
                >
                  {sending ? "Preparando…" : "Enviar para firma"}
                </button>
                <button className="btn small primary" disabled={selected.length === 0} onClick={() => setPaying(true)}>
                  Pagar {selected.length ? money(selectedTotal) : ""}
                </button>
              </div>
            </div>
            {tableRows.length === 0 ? (
              <Empty>No hay comisiones en este grupo para este vendedor.</Empty>
            ) : (
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th>Factura</th>
                      <th>Cliente</th>
                      <th className="num hide-sm">Utilidad bruta</th>
                      <th className="num">Comisión</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {s.commission_status === "pendiente" && !inReceipt.has(s.id) && (
                            <input
                              type="checkbox"
                              aria-label={`Elegir factura ${s.invoice_number ?? ""}`}
                              checked={selected.includes(s.id)}
                              onChange={() => toggle(s.id)}
                            />
                          )}
                        </td>
                        <td>
                          <button className="cell-btn" onClick={() => setOpenSale(s.id)}>
                            {s.invoice_number ?? "s/n"}
                          </button>
                        </td>
                        <td>
                          {s.customer_name}
                          <small>{date(s.sale_date)}</small>
                        </td>
                        <td className="num hide-sm">{money(s.gross_profit)}</td>
                        <td className="num">{money(s.commission)}</td>
                        <td>
                          <CommissionBadge stage={stageOf(s)} />
                          {inReceipt.has(s.id) && <small>En recibo N.º {receiptNumber(inReceipt.get(s.id)!)}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td />
                      <td>Total</td>
                      <td>{plural(tableRows.length, "venta", "ventas")}</td>
                      <td className="num hide-sm">{money(tableRows.reduce((a, s) => a + s.gross_profit, 0))}</td>
                      <td className="num">{money(tableRows.reduce((a, s) => a + s.commission, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
          <section className="card">
            <h2>Recibos de comisión</h2>
            {receipts.length === 0 ? (
              <Empty>
                Sin recibos. Marca las comisiones listas para pagar y usa «Enviar para firma»: el vendedor firma y
                después registras el pago.
              </Empty>
            ) : (
              <div className="table-wrap flat">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Recibo</th>
                      <th className="num">Comisión</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id} className={r.status === "anulado" ? "voided" : ""}>
                        <td>
                          N.º {receiptNumber(r.number)}
                          <small>
                            {dateTime(r.created_at)} · {plural(r.items.length, "factura", "facturas")}
                          </small>
                        </td>
                        <td className="num">{money(r.total_commission)}</td>
                        <td>
                          {r.status === "enviado" && <Badge tone="warn">Esperando firma</Badge>}
                          {r.status === "firmado" && <Badge tone="info">Firmado · falta pagar</Badge>}
                          {r.status === "pagado" && <Badge tone="ok">Firmado y pagado</Badge>}
                          {r.status === "anulado" && <Badge>Anulado</Badge>}
                          <small>
                            {r.signed_at
                              ? `Firmó ${r.signer_name} el ${dateTime(r.signed_at)}`
                              : r.status === "enviado"
                                ? r.email_sent_at
                                  ? `Correo enviado el ${dateTime(r.email_sent_at)}`
                                  : "Correo no enviado"
                                : (r.voided_reason ?? "")}
                          </small>
                        </td>
                        <td className="num">
                          {r.file ? (
                            <FileLink file={r.file} label="PDF firmado" />
                          ) : (
                            <button className="btn link" onClick={() => downloadPdf(receiptPdf(r), receiptFileName(r))}>
                              Ver PDF
                            </button>
                          )}
                          {r.status === "enviado" && (
                            <button
                              className="btn link"
                              onClick={() => setShare({ id: r.id, number: r.number, token: r.token, note: "" })}
                            >
                              Compartir enlace
                            </button>
                          )}
                          {r.status === "firmado" && (
                            <button className="btn link" onClick={() => setPayReceipt(r)}>
                              Registrar pago
                            </button>
                          )}
                          {(r.status === "enviado" || r.status === "firmado") && (
                            <button className="btn link danger-text" onClick={() => setVoidReceipt(r)}>
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>
                        Total · {plural(receipts.filter((r) => r.status !== "anulado").length, "recibo", "recibos")}
                      </td>
                      <td className="num">
                        {money(
                          receipts.filter((r) => r.status !== "anulado").reduce((a, r) => a + r.total_commission, 0),
                        )}
                      </td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
          <section className="card">
            <h2>Pagos de comisión realizados</h2>
            {payments.length === 0 ? (
              <Empty>Sin pagos registrados.</Empty>
            ) : (
              <table className="table">
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{date(p.paid_on)}</td>
                      <td>{p.method ?? "—"}</td>
                      <td className="num">{money(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total pagado</td>
                    <td />
                    <td className="num">{money(payments.reduce((a, p) => a + p.amount, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        </>
      )}
      {paying && seller && (
        <PayForm
          seller={seller}
          saleIds={selected}
          amount={selectedTotal}
          onClose={() => setPaying(false)}
          onDone={() => setSelected([])}
        />
      )}
      {openSale && data.sales.some((x) => x.id === openSale) && (
        <SaleDetail sale={data.sales.find((x) => x.id === openSale)!} onClose={() => setOpenSale(null)} />
      )}
      {sigOpen && <SignatureForm onClose={() => setSigOpen(false)} />}
      {share && <ShareDialog share={share} seller={seller} onClose={() => setShare(null)} />}
      {payReceipt && <PayReceiptForm receipt={payReceipt} onClose={() => setPayReceipt(null)} />}
      {voidReceipt && (
        <VoidDialog
          title={`Anular recibo N.º ${receiptNumber(voidReceipt.number)}`}
          warning="El enlace de firma dejará de funcionar y las facturas volverán a quedar disponibles para otro recibo."
          onClose={() => setVoidReceipt(null)}
          onConfirm={async (reason) => {
            await call("pt_void_commission_receipt", { p_id: voidReceipt.id, p_reason: reason });
            await reload();
            notify("Recibo anulado");
          }}
        />
      )}
      {edit && <SellerForm seller={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {preview && (
        <div className="portal-preview">
          <SellerApp
            email={sellers.find((s) => s.id === preview)?.email ?? ""}
            preview={{ sellerId: preview, onExit: () => setPreview(null) }}
          />
        </div>
      )}
    </div>
  );
}

function PayForm({
  seller,
  saleIds,
  amount,
  onClose,
  onDone,
}: {
  seller: Seller;
  saleIds: string[];
  amount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { reload, notify } = useApp();
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("Transferencia");
  const { busy, error, submit } = useSubmit(async () => {
    await call("pt_pay_commissions", { p_seller: seller.id, p_sales: saleIds, p_date: paidOn, p_method: method });
    onDone();
    await reload();
    notify("Pago de comisión registrado");
  }, onClose);
  return (
    <Modal title={`Pagar comisión a ${seller.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p>
          Se pagarán <strong>{money(amount)}</strong> por {saleIds.length} ventas. Esas ventas quedarán con la comisión
          marcada como pagada.
        </p>
        <div className="form-row">
          <Field label="Fecha de pago">
            <input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} required />
          </Field>
          <Field label="Método">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Transferencia</option>
              <option>Efectivo</option>
            </select>
          </Field>
        </div>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Registrar pago"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SellerForm({ seller, onClose }: { seller: Seller | null; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [name, setName] = useState(seller?.name ?? "");
  const [email, setEmail] = useState(seller?.email ?? "");
  const [rate, setRate] = useState(String(Math.round((seller?.commission_rate ?? 0.3) * 10000) / 100));
  const [legal, setLegal] = useState(seller?.legal_name ?? "");
  const [cedula, setCedula] = useState(seller?.cedula ?? "");
  const [active, setActive] = useState(seller?.active ?? true);
  const [portal, setPortal] = useState(seller?.portal_enabled ?? false);
  const { busy, error, submit } = useSubmit(async () => {
    if (portal && !email.trim()) throw new Error("Para activar el portal, el vendedor necesita un correo.");
    await save(
      "pt_sellers",
      {
        name: name.trim(),
        email: email.trim().toLowerCase() || null,
        commission_rate: (Number(rate) || 0) / 100,
        legal_name: legal.trim() || null,
        cedula: cedula.trim() || null,
        active,
        portal_enabled: portal && active,
      },
      seller?.id,
    );
    await reload();
    notify(seller ? "Vendedor actualizado" : "Vendedor creado");
  }, onClose);
  return (
    <Modal title={seller ? "Editar vendedor" : "Nuevo vendedor"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <div className="form-row">
          <Field label="Correo electrónico" hint="Con este correo entra a su portal">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Comisión (%)" hint="Aplica a las ventas nuevas; las anteriores conservan su porcentaje">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Nombre legal">
            <input value={legal} onChange={(e) => setLegal(e.target.value)} />
          </Field>
          <Field label="Número de cédula">
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Vendedor activo
        </label>
        <label className="check">
          <input type="checkbox" checked={portal} disabled={!active} onChange={(e) => setPortal(e.target.checked)} />{" "}
          Puede entrar a su portal (solo ve sus ventas, sus clientes y sus comisiones)
        </label>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Firma del administrador: se dibuja una vez y sale precargada en cada recibo nuevo. */
function SignatureForm({ onClose }: { onClose: () => void }) {
  const { data, reload, notify } = useApp();
  const [name, setName] = useState(data.issuer?.name ?? "Jose Adrian Torrez O.");
  const [signature, setSignature] = useState<Signature | null>(null);
  const current = data.issuer?.signature ?? null;
  const { busy, error, submit } = useSubmit(async () => {
    const next = signature ?? current;
    if (!next) throw new Error("Dibuja tu firma en el recuadro.");
    await saveSetting("issuer_signature", { name: name.trim(), signature: next });
    await reload();
    notify("Firma guardada");
  }, onClose);
  return (
    <Modal title="Mi firma" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">
          Esta firma aparece en «Entregué conforme» de cada recibo nuevo. Los recibos ya creados conservan la firma que
          tenían.
        </p>
        <Field label="Nombre que aparece bajo la firma">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        {current && (
          <div className="field">
            <span>Firma guardada</span>
            <SignatureView signature={current} />
          </div>
        )}
        <div className="field">
          <span>{current ? "Dibujar una nueva (opcional)" : "Dibuja tu firma"}</span>
          <SignaturePad value={signature} onChange={setSignature} />
        </div>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar firma"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Enlace privado del recibo, para mandarlo por correo o por WhatsApp. */
function ShareDialog({ share, seller, onClose }: { share: Share; seller: Seller | null; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [note, setNote] = useState(share.note);
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/firmar/${share.token}`;
  const message = `Hola${seller ? " " + seller.name.split(" ")[0] : ""}, tu recibo de comisiones N.º ${receiptNumber(share.number)} está listo para revisar y firmar: ${link}`;
  async function email() {
    setBusy(true);
    try {
      await emailReceipt(share.id);
      await reload();
      setNote(`Se envió por correo a ${seller?.email ?? "el vendedor"}.`);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Recibo N.º ${receiptNumber(share.number)} · enlace para firmar`} onClose={onClose}>
      <div className="form">
        {note && (
          <p className="note" role="status">
            {note}
          </p>
        )}
        <p className="muted">
          Para abrirlo hay que iniciar sesión. Solo {seller?.name ?? "el vendedor"} puede firmarlo, con su cuenta del
          portal.
          {seller && !seller.portal_enabled
            ? " Su portal está apagado: actívalo en Editar para que pueda entrar a firmar."
            : ""}
        </p>
        <code className="share-link">{link}</code>
        <div className="actions">
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                notify("Enlace copiado");
              } catch {
                notify("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
              }
            }}
          >
            Copiar enlace
          </button>
          <a
            className="btn"
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Enviar por WhatsApp
          </a>
          <button className="btn primary" disabled={busy} onClick={() => void email()}>
            {busy ? "Enviando…" : "Enviar por correo"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PayReceiptForm({ receipt, onClose }: { receipt: CommissionReceipt; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("Transferencia");
  const { busy, error, submit } = useSubmit(async () => {
    await call("pt_pay_commission_receipt", { p_id: receipt.id, p_date: paidOn, p_method: method });
    await reload();
    notify("Pago de comisión registrado");
  }, onClose);
  return (
    <Modal title={`Pagar recibo N.º ${receiptNumber(receipt.number)}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p>
          Se registrará el pago de <strong>{money(receipt.total_commission)}</strong> a {receipt.seller_name} por{" "}
          {plural(receipt.items.length, "factura", "facturas")}. Firmó {receipt.signer_name} el{" "}
          {dateTime(receipt.signed_at)}.
        </p>
        <div className="form-row">
          <Field label="Fecha de pago">
            <input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} required />
          </Field>
          <Field label="Método">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Transferencia</option>
              <option>Efectivo</option>
            </select>
          </Field>
        </div>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Registrar pago"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
