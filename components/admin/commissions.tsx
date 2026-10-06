"use client";
import { useMemo, useState } from "react";
import { useApp } from "./app";
import { call, save } from "../data";
import { Badge, Empty, ErrorNote, Field, Modal, Stat, useSubmit } from "../ui";
import { date, money, pct, plural, today } from "@/lib/format";
import type { Seller } from "@/lib/types";
import SellerApp from "../seller/app";

export default function Commissions() {
  const { data } = useApp();
  const sellers = data.sellers;
  const [sellerId, setSellerId] = useState(
    sellers.find((s) => s.portal_enabled)?.id ?? sellers.find((s) => s.active)?.id ?? "",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const [edit, setEdit] = useState<Seller | "new" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const seller = sellers.find((s) => s.id === sellerId) ?? null;
  const sales = useMemo(
    () => data.sales.filter((s) => !s.voided_at && s.seller_id === sellerId),
    [data.sales, sellerId],
  );
  const pending = sales.filter((s) => s.commission_status === "pendiente" && Math.abs(s.commission) > 0.005);
  const ready = pending.filter((s) => s.balance <= 0.005);
  const payments = data.commissionPayments.filter((p) => p.seller_id === sellerId);
  const selectedTotal = pending.filter((s) => selected.includes(s.id)).reduce((a, s) => a + s.commission, 0);
  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Comisiones</h1>
        <div className="head-actions">
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
                    <button className="cell-btn" onClick={() => (setSellerId(s.id), setSelected([]))}>
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
              label={`Pendiente de pagar a ${seller.name}`}
              value={money(pending.reduce((a, s) => a + s.commission, 0))}
              hint={`${pending.length} ventas`}
            />
            <Stat
              label="De ventas ya cobradas"
              value={money(ready.reduce((a, s) => a + s.commission, 0))}
              hint={`${ready.length} ventas listas para pagar`}
              tone="ok"
            />
            <Stat
              label="Pagado históricamente"
              value={money(sales.filter((s) => s.commission_status === "pagado").reduce((a, s) => a + s.commission, 0))}
            />
          </div>
          <section className="card">
            <div className="card-head">
              <h2>Comisiones pendientes</h2>
              <div className="head-actions">
                <button className="btn small" onClick={() => setSelected(ready.map((s) => s.id))}>
                  Marcar las ya cobradas
                </button>
                <button className="btn small primary" disabled={selected.length === 0} onClick={() => setPaying(true)}>
                  Pagar {selected.length ? money(selectedTotal) : ""}
                </button>
              </div>
            </div>
            {pending.length === 0 ? (
              <Empty>No hay comisiones pendientes para este vendedor.</Empty>
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
                      <th>Venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Elegir factura ${s.invoice_number ?? ""}`}
                            checked={selected.includes(s.id)}
                            onChange={() => toggle(s.id)}
                          />
                        </td>
                        <td>{s.invoice_number ?? "s/n"}</td>
                        <td>
                          {s.customer_name}
                          <small>{date(s.sale_date)}</small>
                        </td>
                        <td className="num hide-sm">{money(s.gross_profit)}</td>
                        <td className="num">{money(s.commission)}</td>
                        <td>
                          {s.balance <= 0.005 ? (
                            <Badge tone="ok">Cobrada</Badge>
                          ) : (
                            <Badge tone="warn">Por cobrar</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td />
                      <td>Total</td>
                      <td>{plural(pending.length, "venta", "ventas")}</td>
                      <td className="num hide-sm">{money(pending.reduce((a, s) => a + s.gross_profit, 0))}</td>
                      <td className="num">{money(pending.reduce((a, s) => a + s.commission, 0))}</td>
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
