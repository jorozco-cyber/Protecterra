"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./app";
import { call } from "../data";
import { ProductForm } from "./inventory";
import { Badge, Empty, ErrorNote, Field, FileSlot, Modal, Search, Stat, VoidDialog, useSubmit } from "../ui";
import { addDays, date, matches, money, plural, qty, today } from "@/lib/format";
import { IVA_RATE, invoicesWithoutIva, withIva } from "@/lib/calc";
import type { Purchase, PurchasePayment } from "@/lib/types";

export default function Purchases() {
  const { data, focus, clearFocus } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todas" | "pendientes" | "anuladas">("todas");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!focus) return;
    if (focus === "nueva") setCreating(true);
    else if (focus === "ver:pendientes") setFilter("pendientes");
    else setOpenId(focus);
    clearFocus();
  }, [focus, clearFocus]);

  const rows = useMemo(
    () =>
      data.purchases.filter((p) => {
        if (filter === "anuladas") return !!p.voided_at;
        if (p.voided_at) return false;
        if (filter === "pendientes" && p.balance <= 0.005) return false;
        return !query || matches(`${p.supplier_name ?? ""} ${p.invoice_number ?? ""}`, query);
      }),
    [data.purchases, query, filter],
  );
  const live = data.purchases.filter((p) => !p.voided_at);
  const open = data.purchases.find((p) => p.id === openId) ?? null;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Compras</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setCreating(true)}>
            Nueva compra
          </button>
        </div>
      </div>
      <div className="stats">
        <Stat
          label="Por pagar"
          value={money(live.reduce((a, p) => a + p.balance, 0))}
          hint={`${live.filter((p) => p.balance > 0.005).length} compras pendientes`}
          more="Ver compras"
          onClick={() => setFilter(filter === "pendientes" ? "todas" : "pendientes")}
          active={filter === "pendientes"}
        />
        <Stat
          label="Total comprado"
          value={money(live.reduce((a, p) => a + p.total, 0))}
          hint={`${live.length} compras`}
        />
      </div>
      <div className="toolbar">
        <Search value={query} onChange={setQuery} placeholder="Buscar proveedor o factura" />
        <div className="segmented" role="group" aria-label="Filtro">
          {(
            [
              ["todas", "Todas"],
              ["pendientes", "Por pagar"],
              ["anuladas", "Anuladas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th className="hide-sm">Factura</th>
              <th className="num">Total</th>
              <th className="num">Saldo</th>
              <th className="hide-sm">Vence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => setOpenId(p.id)}>
                <td>{date(p.purchase_date)}</td>
                <td>
                  <button className="cell-btn" onClick={() => setOpenId(p.id)}>
                    {p.supplier_name ?? "Sin proveedor"}
                  </button>
                </td>
                <td className="hide-sm">{p.invoice_number ?? "—"}</td>
                <td className="num">{money(p.total)}</td>
                <td className="num">
                  {p.voided_at ? (
                    <Badge>Anulada</Badge>
                  ) : p.balance > 0.005 ? (
                    money(p.balance)
                  ) : (
                    <Badge tone="ok">Pagada</Badge>
                  )}
                </td>
                <td className="hide-sm">{p.balance > 0.005 ? date(p.due_date) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{plural(rows.length, "compra", "compras")}</td>
              <td className="hide-sm" />
              <td className="num">{money(rows.reduce((a, p) => a + p.total, 0))}</td>
              <td className="num">{money(rows.reduce((a, p) => a + (p.voided_at ? 0 : p.balance), 0))}</td>
              <td className="hide-sm" />
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && <Empty>No hay compras con ese filtro.</Empty>}
      </div>
      {open && <PurchaseDetail purchase={open} onClose={() => setOpenId(null)} />}
      {creating && <PurchaseForm onClose={() => setCreating(false)} />}
    </div>
  );
}

function PurchaseDetail({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { data, reload, notify } = useApp();
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidPayment, setVoidPayment] = useState<PurchasePayment | null>(null);
  const lots = data.lots.filter((l) => l.purchase_id === purchase.id);
  const payments = data.purchasePayments.filter((p) => p.purchase_id === purchase.id);
  const fileSaved = async () => {
    await reload();
    notify("Archivo guardado");
  };
  return (
    <Modal title={`Compra · ${purchase.supplier_name ?? "Sin proveedor"}`} onClose={onClose} wide>
      {purchase.voided_at && <p className="note danger">Compra anulada: {purchase.voided_reason}</p>}
      <div className="stats compact">
        <Stat label="Total" value={money(purchase.total)} hint={`${qty(purchase.units)} unidades`} />
        <Stat label="Pagado" value={money(purchase.paid)} />
        <Stat label="Saldo" value={money(purchase.balance)} tone={purchase.balance > 0.005 ? "warn" : "ok"} />
      </div>
      <dl className="facts">
        <div>
          <dt>Fecha</dt>
          <dd>{date(purchase.purchase_date)}</dd>
        </div>
        <div>
          <dt>Factura</dt>
          <dd>{purchase.invoice_number ?? "—"}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{purchase.kind === "credito" ? "Crédito" : "Contado"}</dd>
        </div>
        <div>
          <dt>Vence</dt>
          <dd>{date(purchase.due_date)}</dd>
        </div>
      </dl>
      <p className="files">
        <FileSlot
          file={purchase.invoice_file}
          label="Factura"
          table="pt_purchases"
          id={purchase.id}
          column="invoice_file"
          locked={!!purchase.voided_at}
          onSaved={fileSaved}
        />
        <FileSlot
          file={purchase.receipt_file}
          label="Comprobante"
          table="pt_purchases"
          id={purchase.id}
          column="receipt_file"
          locked={!!purchase.voided_at}
          onSaved={fileSaved}
        />
      </p>
      <h3>Productos</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th className="num">Cantidad</th>
            <th className="num hide-sm">Costo unitario</th>
            <th className="num">Total</th>
            <th className="num hide-sm">Quedan</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((l) => (
            <tr key={l.id}>
              <td>
                {l.product_name}
                <small>Lote #{l.lot_number}</small>
              </td>
              <td className="num">{qty(l.qty)}</td>
              <td className="num hide-sm">{money(l.unit_cost)}</td>
              <td className="num">{money(l.total_cost)}</td>
              <td className="num hide-sm">{qty(l.qty_available)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td className="num">{qty(purchase.units)}</td>
            <td className="num hide-sm" />
            <td className="num">{money(purchase.total)}</td>
            <td className="num hide-sm">{qty(lots.reduce((a, l) => a + l.qty_available, 0))}</td>
          </tr>
        </tfoot>
      </table>
      <h3>Pagos</h3>
      {purchase.initial_payment > 0 && <p className="muted small">Abono inicial: {money(purchase.initial_payment)}</p>}
      {payments.length === 0 ? (
        <Empty>Sin pagos posteriores registrados.</Empty>
      ) : (
        <table className="table">
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className={p.voided_at ? "voided" : ""}>
                <td>{date(p.paid_on)}</td>
                <td>
                  {p.description ?? "abono"}
                  <small>
                    {p.method ?? ""}{" "}
                    <FileSlot
                      file={p.file}
                      label="Comprobante"
                      table="pt_purchase_payments"
                      id={p.id}
                      column="file"
                      locked={!!p.voided_at || !!purchase.voided_at}
                      onSaved={fileSaved}
                    />
                  </small>
                </td>
                <td className="num">{money(p.amount)}</td>
                <td className="num">
                  {p.voided_at ? (
                    <Badge>Anulado</Badge>
                  ) : (
                    !purchase.voided_at && (
                      <button className="btn link danger-text" onClick={() => setVoidPayment(p)}>
                        Anular
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total pagado</td>
              <td>{purchase.initial_payment > 0 ? "Incluye el abono inicial" : ""}</td>
              <td className="num">{money(purchase.paid)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      {!purchase.voided_at && (
        <div className="actions">
          <button className="btn link danger-text" onClick={() => setVoiding(true)}>
            Anular compra
          </button>
          {purchase.balance > 0.005 && (
            <button className="btn primary" onClick={() => setPaying(true)}>
              Registrar pago
            </button>
          )}
        </div>
      )}
      {paying && <PurchasePaymentForm purchase={purchase} onClose={() => setPaying(false)} />}
      {voiding && (
        <VoidDialog
          title="Anular compra"
          warning="La compra y sus lotes dejarán de contar en el inventario. Solo se puede si no se ha vendido nada de ella."
          onClose={() => setVoiding(false)}
          onConfirm={async (reason) => {
            await call("pt_void_purchase", { p_id: purchase.id, p_reason: reason });
            await reload();
            notify("Compra anulada");
          }}
        />
      )}
      {voidPayment && (
        <VoidDialog
          title="Anular pago"
          warning={`Se anulará el pago de ${money(voidPayment.amount)} y el saldo volverá a quedar pendiente.`}
          onClose={() => setVoidPayment(null)}
          onConfirm={async (reason) => {
            await call("pt_void_purchase_payment", { p_id: voidPayment.id, p_reason: reason });
            await reload();
            notify("Pago anulado");
          }}
        />
      )}
    </Modal>
  );
}

function PurchasePaymentForm({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [amount, setAmount] = useState(purchase.balance.toFixed(2));
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("Transferencia");
  const [description, setDescription] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    await call("pt_add_purchase_payment", {
      p_purchase: purchase.id,
      p_date: paidOn,
      p_amount: Number(amount),
      p_method: method,
      p_description: description,
    });
    await reload();
    notify("Pago registrado");
  }, onClose);
  return (
    <Modal title="Registrar pago a proveedor" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">Saldo pendiente: {money(purchase.balance)}</p>
        <div className="form-row">
          <Field label="Monto (C$)">
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Fecha">
            <input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} required />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Método">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>Transferencia</option>
              <option>Efectivo</option>
              <option>Otro</option>
            </select>
          </Field>
          <Field label="Descripción">
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="abono" />
          </Field>
        </div>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar pago"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

type LotDraft = { key: number; product_id: string; qty: string; unit_cost: string };

function PurchaseForm({ onClose }: { onClose: () => void }) {
  const { data, reload, notify } = useApp();
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [supplier, setSupplier] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [invoice, setInvoice] = useState("");
  const [kind, setKind] = useState<"contado" | "credito">("contado");
  const [dueDate, setDueDate] = useState(addDays(today(), 30));
  const [initial, setInitial] = useState("");
  const [lots, setLots] = useState<LotDraft[]>([{ key: 1, product_id: "", qty: "", unit_cost: "" }]);
  const products = data.products.filter((p) => p.active);
  // Proveedores que facturan el precio unitario sin IVA: se escribe tal cual sale en la
  // factura y la app le suma el 15% a cada producto al guardar.
  const [addIva, setAddIva] = useState(false);
  const finalCost = (l: LotDraft) => (addIva ? withIva(Number(l.unit_cost) || 0) : Number(l.unit_cost) || 0);
  const subtotal = lots.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
  const total = lots.reduce((a, l) => a + (Number(l.qty) || 0) * finalCost(l), 0);
  const pickSupplier = (id: string) => {
    setSupplier(id);
    setAddIva(invoicesWithoutIva(data.suppliers.find((s) => s.id === id)?.name));
  };
  // Línea de la compra desde la que se está registrando un producto nuevo.
  const [newProductFor, setNewProductFor] = useState<number | null>(null);
  const update = (key: number, patch: Partial<LotDraft>) =>
    setLots((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const { busy, error, submit } = useSubmit(async () => {
    await call("pt_create_purchase", {
      p: {
        purchase_date: purchaseDate,
        supplier_id: supplier && supplier !== "new" ? supplier : null,
        supplier_name: supplier === "new" ? newSupplier : null,
        invoice_number: invoice,
        kind,
        due_date: kind === "credito" ? dueDate : null,
        initial_payment: kind === "credito" ? initial || "0" : null,
        lots: lots
          .filter((l) => l.product_id)
          .map((l) => ({
            product_id: l.product_id,
            qty: l.qty,
            unit_cost: addIva ? String(finalCost(l)) : l.unit_cost,
          })),
      },
    });
    await reload();
    notify("Compra registrada");
  }, onClose);

  return (
    <Modal title="Nueva compra" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <Field label="Fecha">
            <input
              type="date"
              value={purchaseDate}
              max={today()}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Proveedor">
            <select value={supplier} onChange={(e) => pickSupplier(e.target.value)} required>
              <option value="">Selecciona…</option>
              {data.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="new">+ Nuevo proveedor</option>
            </select>
          </Field>
          <Field label="Número de factura">
            <input value={invoice} onChange={(e) => setInvoice(e.target.value)} />
          </Field>
        </div>
        {supplier === "new" && (
          <Field label="Nombre del nuevo proveedor">
            <input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} required />
          </Field>
        )}
        <div className="form-row">
          <Field label="Tipo de compra">
            <select value={kind} onChange={(e) => setKind(e.target.value as "contado" | "credito")}>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </Field>
          {kind === "credito" && (
            <>
              <Field label="Fecha de vencimiento">
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
              </Field>
              <Field label="Abono inicial (C$)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={initial}
                  onChange={(e) => setInitial(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </>
          )}
        </div>
        <h3>Productos comprados</h3>
        <label className="check">
          <input type="checkbox" checked={addIva} onChange={(e) => setAddIva(e.target.checked)} /> Los precios de la
          factura no llevan IVA: sumar {Math.round(IVA_RATE * 100)}% a cada producto
        </label>
        {lots.map((l) => (
          <div className="line-block" key={l.key}>
            <div className="line">
              <Field label="Producto" className="grow">
                <select
                  value={l.product_id}
                  onChange={(e) =>
                    e.target.value === "new" ? setNewProductFor(l.key) : update(l.key, { product_id: e.target.value })
                  }
                  required
                >
                  <option value="">Selecciona…</option>
                  <option value="new">+ Nuevo producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.category ? ` · ${p.category}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cantidad">
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  inputMode="decimal"
                  value={l.qty}
                  onChange={(e) => update(l.key, { qty: e.target.value })}
                  required
                />
              </Field>
              <Field label={addIva ? "Costo unitario sin IVA" : "Costo unitario"}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={l.unit_cost}
                  onChange={(e) => update(l.key, { unit_cost: e.target.value })}
                  required
                />
              </Field>
              {lots.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Quitar producto"
                  onClick={() => setLots(lots.filter((x) => x.key !== l.key))}
                >
                  ×
                </button>
              )}
            </div>
            {addIva && Number(l.unit_cost) > 0 && (
              <p className="line-hint">
                Con IVA: {money(finalCost(l))} por unidad
                {Number(l.qty) > 0 ? ` · ${money(Number(l.qty) * finalCost(l))} en total` : ""}
              </p>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn small"
          onClick={() =>
            setLots([...lots, { key: Math.max(...lots.map((l) => l.key)) + 1, product_id: "", qty: "", unit_cost: "" }])
          }
        >
          + Agregar producto
        </button>
        {addIva && (
          <p className="line-hint">
            Subtotal {money(subtotal)} · IVA {money(total - subtotal)}
          </p>
        )}
        <p className="total-line">
          {addIva ? "Total de la compra con IVA" : "Total de la compra"} <strong>{money(total)}</strong>
        </p>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar compra"}
          </button>
        </div>
      </form>
      {newProductFor !== null && (
        <ProductForm
          product={null}
          onClose={() => setNewProductFor(null)}
          onCreated={(id) => update(newProductFor, { product_id: id })}
        />
      )}
    </Modal>
  );
}
