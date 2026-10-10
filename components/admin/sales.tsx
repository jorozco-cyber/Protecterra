"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./app";
import { call, save } from "../data";
import { Badge, Empty, ErrorNote, Field, FileSlot, Modal, Search, Stat, VoidDialog, useSubmit } from "../ui";
import { addDays, date, matches, money, num, pct, plural, qty, today } from "@/lib/format";
import { fifoPreview } from "@/lib/calc";
import type { Sale, SaleExpense, SalePayment } from "@/lib/types";

export default function Sales() {
  const { data, focus, clearFocus, go } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todas" | "mes" | "pendientes" | "vencidas" | "anuladas">("todas");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!focus) return;
    if (focus === "nueva") setCreating(true);
    else if (focus === "ver:mes" || focus === "ver:pendientes" || focus === "ver:vencidas")
      setFilter(focus.slice(4) as "mes" | "pendientes" | "vencidas");
    else setOpenId(focus);
    clearFocus();
  }, [focus, clearFocus]);

  const rows = useMemo(
    () =>
      data.sales.filter((s) => {
        if (filter === "anuladas") return !!s.voided_at;
        if (s.voided_at) return false;
        if (filter === "mes" && !s.sale_date.startsWith(today().slice(0, 7))) return false;
        if (filter === "pendientes" && s.balance <= 0.005) return false;
        if (filter === "vencidas" && s.days_overdue <= 0) return false;
        return !query || matches(`${s.customer_name} ${s.invoice_number ?? ""} ${s.seller_name ?? ""}`, query);
      }),
    [data.sales, query, filter],
  );
  const open = data.sales.find((s) => s.id === openId) ?? null;
  const shown = rows.slice(0, 300);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Ventas</h1>
        <div className="head-actions">
          <button className="btn" onClick={() => go("cobros", "estado")}>
            Estado de cuentas (PDF)
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Nueva venta
          </button>
        </div>
      </div>
      <div className="stats">
        <Stat label="Facturas" value={String(rows.length)} />
        <Stat label="Total" value={money(rows.reduce((a, s) => a + s.total, 0))} />
        <Stat
          label="Saldo pendiente"
          value={money(rows.reduce((a, s) => a + (s.voided_at ? 0 : s.balance), 0))}
          onClick={() => setFilter(filter === "pendientes" ? "todas" : "pendientes")}
          active={filter === "pendientes"}
        />
        <Stat label="Utilidad neta" value={money(rows.reduce((a, s) => a + (s.voided_at ? 0 : s.net_profit), 0))} />
      </div>
      <div className="toolbar">
        <Search value={query} onChange={setQuery} placeholder="Buscar cliente, factura o vendedor" />
        <div className="segmented" role="group" aria-label="Filtro">
          {(
            [
              ["todas", "Todas"],
              ["mes", "Este mes"],
              ["pendientes", "Por cobrar"],
              ["vencidas", "Vencidas"],
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
              <th>Factura</th>
              <th>Cliente</th>
              <th className="hide-sm">Fecha</th>
              <th className="num">Total</th>
              <th className="num">Saldo</th>
              <th className="num hide-sm">Utilidad neta</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => setOpenId(s.id)}>
                <td>
                  <button className="cell-btn" onClick={() => setOpenId(s.id)}>
                    {s.invoice_number ?? "s/n"}
                  </button>
                </td>
                <td>
                  {s.customer_name}
                  <small>
                    {s.seller_name ?? "Sin vendedor"} · {s.kind === "credito" ? "Crédito" : "Contado"}
                  </small>
                </td>
                <td className="hide-sm">{date(s.sale_date)}</td>
                <td className="num">{money(s.total)}</td>
                <td className="num">
                  {s.voided_at ? (
                    <Badge>Anulada</Badge>
                  ) : s.balance <= 0.005 ? (
                    <Badge tone="ok">Pagada</Badge>
                  ) : (
                    <>
                      {money(s.balance)}
                      {s.days_overdue > 0 && <small className="danger-text">{s.days_overdue} días de atraso</small>}
                    </>
                  )}
                </td>
                <td className="num hide-sm">{money(s.net_profit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{plural(rows.length, "factura", "facturas")}</td>
              <td className="hide-sm" />
              <td className="num">{money(rows.reduce((a, s) => a + s.total, 0))}</td>
              <td className="num">{money(rows.reduce((a, s) => a + (s.voided_at ? 0 : s.balance), 0))}</td>
              <td className="num hide-sm">{money(rows.reduce((a, s) => a + (s.voided_at ? 0 : s.net_profit), 0))}</td>
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && <Empty>No hay ventas con ese filtro.</Empty>}
        {rows.length > shown.length && (
          <p className="muted small pad">
            Se muestran las {shown.length} más recientes. Usa el buscador para encontrar las demás.
          </p>
        )}
      </div>
      {open && <SaleDetail sale={open} onClose={() => setOpenId(null)} />}
      {creating && <SaleForm onClose={() => setCreating(false)} />}
    </div>
  );
}

export function SaleDetail({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { data, reload, notify } = useApp();
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidPayment, setVoidPayment] = useState<SalePayment | null>(null);
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingDue, setEditingDue] = useState(false);
  const lines = data.saleLines.filter((l) => l.sale_id === sale.id);
  const payments = data.salePayments.filter((p) => p.sale_id === sale.id);
  const expenses = data.saleExpenses.filter((e) => e.sale_id === sale.id && !e.voided_at);
  const productName = (id: string) => data.products.find((p) => p.id === id)?.name ?? "Producto";
  const lotNumber = (id: string) => data.lots.find((l) => l.id === id)?.lot_number;
  const fileSaved = async () => {
    await reload();
    notify("Archivo guardado");
  };

  async function removeExpense(e: SaleExpense) {
    try {
      await call("pt_void_sale_expense", { p_id: e.id });
      await reload();
      notify("Gasto quitado");
    } catch (err) {
      notify((err as Error).message);
    }
  }

  return (
    <Modal title={`Factura ${sale.invoice_number ?? "s/n"} · ${sale.customer_name}`} onClose={onClose} wide>
      {sale.voided_at && <p className="note danger">Venta anulada: {sale.voided_reason}</p>}
      <div className="stats compact">
        <Stat label="Total" value={money(sale.total)} />
        <Stat label="Cobrado" value={money(sale.paid)} />
        <Stat
          label="Saldo"
          value={money(sale.balance)}
          tone={sale.balance <= 0.005 ? "ok" : sale.days_overdue > 0 ? "danger" : "warn"}
          hint={sale.days_overdue > 0 ? `${sale.days_overdue} días de atraso` : undefined}
        />
      </div>
      <dl className="facts">
        <div>
          <dt>Fecha</dt>
          <dd>{date(sale.sale_date)}</dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{sale.kind === "credito" ? "Crédito" : "Contado"}</dd>
        </div>
        <div>
          <dt>Fecha prevista de pago</dt>
          <dd>
            {date(sale.due_date)}{" "}
            {!sale.voided_at && sale.balance > 0.005 && (
              <button className="btn link" onClick={() => setEditingDue(true)}>
                Cambiar
              </button>
            )}
          </dd>
        </div>
        <div>
          <dt>Vendedor</dt>
          <dd>{sale.seller_name ?? "—"}</dd>
        </div>
      </dl>
      {sale.note && <p className="muted">{sale.note}</p>}
      <p className="files">
        <FileSlot
          file={sale.invoice_file}
          label="Factura digital"
          table="pt_sales"
          id={sale.id}
          column="invoice_file"
          locked={!!sale.voided_at}
          onSaved={fileSaved}
        />
        <FileSlot
          file={sale.receipt_file}
          label="Recibo oficial de caja"
          table="pt_sales"
          id={sale.id}
          column="receipt_file"
          locked={!!sale.voided_at}
          onSaved={fileSaved}
        />
      </p>

      <h3>Productos</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th className="num">Cantidad</th>
            <th className="num hide-sm">Precio</th>
            <th className="num">Total</th>
            <th className="num hide-sm">Costo</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                {productName(l.product_id)}
                <small>Lote #{lotNumber(l.lot_id) ?? "—"}</small>
              </td>
              <td className="num">{qty(l.qty)}</td>
              <td className="num hide-sm">{money(l.unit_price)}</td>
              <td className="num">{money(l.qty * l.unit_price)}</td>
              <td className="num hide-sm">
                {money(l.qty * l.unit_cost)}
                {l.unit_price < l.unit_cost && <small className="danger-text">Bajo costo</small>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>{num(sale.tax_rate) > 0 ? "Subtotal sin IVA" : "Total"}</td>
            <td className="num">{qty(lines.reduce((a, l) => a + l.qty, 0))}</td>
            <td className="num hide-sm" />
            <td className="num">{money(sale.subtotal ?? sale.total)}</td>
            <td className="num hide-sm">{money(sale.cost)}</td>
          </tr>
          {num(sale.tax_rate) > 0 && (
            <>
              <tr>
                <td>IVA ({pct(sale.tax_rate)})</td>
                <td className="num" />
                <td className="num hide-sm" />
                <td className="num">{money(sale.tax)}</td>
                <td className="num hide-sm" />
              </tr>
              <tr>
                <td>Total con IVA</td>
                <td className="num" />
                <td className="num hide-sm" />
                <td className="num">{money(sale.total)}</td>
                <td className="num hide-sm" />
              </tr>
            </>
          )}
        </tfoot>
      </table>

      <div className="card-head">
        <h3>Gastos de venta</h3>
        {!sale.voided_at && (
          <button className="btn small" onClick={() => setAddingExpense(true)}>
            + Agregar gasto
          </button>
        )}
      </div>
      {expenses.length === 0 ? (
        <Empty>Sin gastos.</Empty>
      ) : (
        <table className="table">
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id}>
                <td>{e.description}</td>
                <td className="num">{money(e.amount)}</td>
                <td className="num">
                  {!sale.voided_at && (
                    <button className="btn link danger-text" onClick={() => void removeExpense(e)}>
                      Quitar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total de gastos</td>
              <td className="num">{money(sale.expenses)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      <h3>Resultado</h3>
      <dl className="facts result">
        <div>
          <dt>Costo de los productos</dt>
          <dd>{money(sale.cost)}</dd>
        </div>
        <div>
          <dt>Gastos de venta</dt>
          <dd>{money(sale.expenses)}</dd>
        </div>
        <div>
          <dt>Utilidad bruta</dt>
          <dd>{money(sale.gross_profit)}</dd>
        </div>
        <div>
          <dt>
            Comisión del vendedor ({pct(sale.commission_rate)}){" "}
            <Badge tone={sale.commission_status === "pagado" ? "ok" : "warn"}>
              {sale.commission_status === "pagado" ? "Pagada" : "Pendiente"}
            </Badge>
          </dt>
          <dd>{money(sale.commission)}</dd>
        </div>
        {sale.superior_commission > 0 && (
          <div>
            <dt>Comisión de vendedor superior ({pct(sale.superior_rate)}, histórico)</dt>
            <dd>{money(sale.superior_commission)}</dd>
          </div>
        )}
        <div className="strong">
          <dt>Utilidad neta</dt>
          <dd>{money(sale.net_profit)}</dd>
        </div>
      </dl>

      <h3>Cobros</h3>
      {payments.length === 0 ? (
        <Empty>Sin cobros registrados.</Empty>
      ) : (
        <table className="table">
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className={p.voided_at ? "voided" : ""}>
                <td>{date(p.paid_on)}</td>
                <td>
                  {p.method ?? "—"}
                  <small>
                    {p.receipt_number ? `Recibo ${p.receipt_number} ` : ""}
                    <FileSlot
                      file={p.file}
                      label="Comprobante"
                      table="pt_sale_payments"
                      id={p.id}
                      column="file"
                      locked={!!p.voided_at || !!sale.voided_at}
                      onSaved={fileSaved}
                    />
                  </small>
                </td>
                <td className="num">{money(p.amount)}</td>
                <td className="num">
                  {p.voided_at ? (
                    <Badge>Anulado</Badge>
                  ) : (
                    !sale.voided_at && (
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
              <td>Total cobrado</td>
              <td />
              <td className="num">{money(sale.paid)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      {!sale.voided_at && (
        <div className="actions">
          <button className="btn link danger-text" onClick={() => setVoiding(true)}>
            Anular venta
          </button>
          {sale.balance > 0.005 && (
            <button className="btn primary" onClick={() => setPaying(true)}>
              Registrar cobro
            </button>
          )}
        </div>
      )}

      {paying && <SalePaymentForm sale={sale} onClose={() => setPaying(false)} />}
      {addingExpense && <ExpenseForm sale={sale} onClose={() => setAddingExpense(false)} />}
      {editingDue && <DueDateForm sale={sale} onClose={() => setEditingDue(false)} />}
      {voiding && (
        <VoidDialog
          title="Anular venta"
          warning="La venta dejará de contar y sus productos regresarán al inventario. Si tiene cobros, primero hay que anularlos."
          onClose={() => setVoiding(false)}
          onConfirm={async (reason) => {
            await call("pt_void_sale", { p_id: sale.id, p_reason: reason });
            await reload();
            notify("Venta anulada");
          }}
        />
      )}
      {voidPayment && (
        <VoidDialog
          title="Anular cobro"
          warning={`Se anulará el cobro de ${money(voidPayment.amount)} y el saldo volverá a quedar pendiente.`}
          onClose={() => setVoidPayment(null)}
          onConfirm={async (reason) => {
            await call("pt_void_sale_payment", { p_id: voidPayment.id, p_reason: reason });
            await reload();
            notify("Cobro anulado");
          }}
        />
      )}
    </Modal>
  );
}

export function SalePaymentForm({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [amount, setAmount] = useState(sale.balance.toFixed(2));
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState("Transferencia");
  const [receipt, setReceipt] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    await call("pt_add_sale_payment", {
      p_sale: sale.id,
      p_date: paidOn,
      p_amount: Number(amount),
      p_method: method,
      p_receipt: receipt,
    });
    await reload();
    notify("Cobro registrado");
  }, onClose);
  return (
    <Modal title={`Registrar cobro · Factura ${sale.invoice_number ?? "s/n"}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">
          {sale.customer_name} · saldo pendiente {money(sale.balance)}
        </p>
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
          <Field label="Fecha de pago">
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
          <Field label="Número de recibo">
            <input value={receipt} onChange={(e) => setReceipt(e.target.value)} />
          </Field>
        </div>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar cobro"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseForm({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const { busy, error, submit } = useSubmit(async () => {
    await call("pt_add_sale_expense", { p_sale: sale.id, p_description: description, p_amount: Number(amount) });
    await reload();
    notify("Gasto agregado");
  }, onClose);
  return (
    <Modal title="Agregar gasto de venta" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Descripción" hint="Por ejemplo: flete, retención 2%">
          <input value={description} onChange={(e) => setDescription(e.target.value)} required autoFocus />
        </Field>
        <Field label="Monto (C$)">
          <input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </Field>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar gasto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DueDateForm({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [due, setDue] = useState(sale.due_date ?? today());
  const { busy, error, submit } = useSubmit(async () => {
    await save("pt_sales", { due_date: due }, sale.id);
    await reload();
    notify("Fecha de pago actualizada");
  }, onClose);
  return (
    <Modal title="Cambiar fecha prevista de pago" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nueva fecha">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} required autoFocus />
        </Field>
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

type LineDraft = { key: number; product_id: string; qty: string; unit_price: string };
type ExpenseDraft = { key: number; description: string; amount: string };

function SaleForm({ onClose }: { onClose: () => void }) {
  const { data, reload, notify } = useApp();
  const nextInvoice = useMemo(
    () => Math.max(0, ...data.sales.filter((s) => !s.voided_at).map((s) => s.invoice_number ?? 0)) + 1,
    [data.sales],
  );
  const activeSellers = data.sellers.filter((s) => s.active);
  const [saleDate, setSaleDate] = useState(today());
  const [invoice, setInvoice] = useState(String(nextInvoice));
  const [customer, setCustomer] = useState("");
  const [seller, setSeller] = useState(activeSellers.find((s) => s.portal_enabled)?.id ?? "");
  const [kind, setKind] = useState<"contado" | "credito">("contado");
  const [dueDate, setDueDate] = useState(addDays(today(), 30));
  const [method, setMethod] = useState("Efectivo");
  const [paidNow, setPaidNow] = useState(true);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ key: 1, product_id: "", qty: "", unit_price: "" }]);
  const [expenses, setExpenses] = useState<ExpenseDraft[]>([]);
  const [allowBelow, setAllowBelow] = useState(false);

  const products = data.products.filter((p) => p.active && p.qty_available > 0);
  const sellerRate = data.sellers.find((s) => s.id === seller)?.commission_rate ?? 0;

  // Vista previa del reparto FIFO, descontando lo que ya tomaron las líneas anteriores.
  const preview = useMemo(() => {
    const reserved: Record<string, number> = {};
    return lines.map((l) => {
      const quantity = Number(l.qty) || 0;
      if (!l.product_id || quantity <= 0) return null;
      const p = fifoPreview(data.lots, l.product_id, quantity, saleDate, reserved);
      for (const a of p.allocations) reserved[a.lot_id] = (reserved[a.lot_id] ?? 0) + a.qty;
      const price = Number(l.unit_price) || 0;
      const below = p.allocations.some((a) => price < a.unit_cost);
      return { ...p, below, total: quantity * price };
    });
  }, [lines, data.lots, saleDate]);

  const total = preview.reduce((a, p) => a + (p?.total ?? 0), 0);
  const cost = preview.reduce((a, p) => a + (p?.cost ?? 0), 0);
  const expenseTotal = expenses.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  // En empresas que llevan el IVA aparte, los precios se escriben sin IVA y el total a cobrar lo suma.
  const taxRate = data.taxRate;
  const tax = total * taxRate;
  const grand = total + tax;
  const gross = total - cost - expenseTotal;
  const commission = gross * sellerRate;
  const anyMissing = preview.some((p) => p && p.missing > 0);
  const anyBelow = preview.some((p) => p?.below);

  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function chooseProduct(key: number, productId: string) {
    const product = data.products.find((p) => p.id === productId);
    const line = lines.find((l) => l.key === key);
    updateLine(key, {
      product_id: productId,
      unit_price: line?.unit_price || (product?.unit_price != null ? String(product.unit_price) : ""),
    });
  }

  const { busy, error, submit } = useSubmit(async () => {
    await call("pt_create_sale", {
      p: {
        sale_date: saleDate,
        invoice_number: invoice,
        customer_id: customer,
        seller_id: seller || null,
        kind,
        due_date: kind === "credito" ? dueDate : null,
        note,
        allow_below_cost: allowBelow,
        paid_now: kind === "contado" && paidNow ? grand.toFixed(4) : null,
        method,
        lines: lines
          .filter((l) => l.product_id)
          .map((l) => ({ product_id: l.product_id, qty: l.qty, unit_price: l.unit_price })),
        expenses: expenses.filter((e) => e.description.trim() && e.amount),
      },
    });
    await reload();
    notify("Venta registrada");
  }, onClose);

  return (
    <Modal title="Nueva venta" onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <Field label="Fecha">
            <input type="date" value={saleDate} max={today()} onChange={(e) => setSaleDate(e.target.value)} required />
          </Field>
          <Field label="Número de factura">
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              required
            />
          </Field>
          <Field label="Vendedor">
            <select value={seller} onChange={(e) => setSeller(e.target.value)}>
              <option value="">Sin vendedor</option>
              {activeSellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({pct(s.commission_rate)})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Cliente">
          <select value={customer} onChange={(e) => setCustomer(e.target.value)} required>
            <option value="">Selecciona…</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-row">
          <Field label="Tipo de venta">
            <select value={kind} onChange={(e) => setKind(e.target.value as "contado" | "credito")}>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </Field>
          {kind === "credito" ? (
            <Field label="Fecha prevista de pago">
              <input type="date" value={dueDate} min={saleDate} onChange={(e) => setDueDate(e.target.value)} required />
            </Field>
          ) : (
            <Field label="Método de pago">
              <select value={method} onChange={(e) => setMethod(e.target.value)} disabled={!paidNow}>
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Otro</option>
              </select>
            </Field>
          )}
        </div>
        {kind === "contado" && (
          <label className="check">
            <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} /> Registrar el
            cobro completo ahora
          </label>
        )}

        <h3>Productos</h3>
        {lines.map((l, i) => {
          const p = preview[i];
          const product = data.products.find((x) => x.id === l.product_id);
          return (
            <div key={l.key} className="line-block">
              <div className="line">
                <Field label="Producto" className="grow">
                  <select value={l.product_id} onChange={(e) => chooseProduct(l.key, e.target.value)} required>
                    <option value="">Selecciona…</option>
                    {products.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                        {x.category ? ` · ${x.category}` : ""} — {qty(x.qty_available)} disp.
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
                    onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Precio unitario">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={l.unit_price}
                    onChange={(e) => updateLine(l.key, { unit_price: e.target.value })}
                    required
                  />
                </Field>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Quitar producto"
                    onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                  >
                    ×
                  </button>
                )}
              </div>
              {p && (
                <p className={"line-hint" + (p.missing > 0 || p.below ? " danger-text" : "")}>
                  {p.missing > 0
                    ? `No alcanza: ${p.missing === 1 ? "falta 1 unidad" : `faltan ${qty(p.missing)} unidades`} de ${product?.name ?? "este producto"} con compra hasta esta fecha.`
                    : `Sale de ${p.allocations.map((a) => `lote #${a.lot_number} (${qty(a.qty)} a ${money(a.unit_cost)})`).join(" + ")} · total ${money(p.total)}`}
                  {p.below && p.missing === 0 && " · El precio está por debajo del costo."}
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="btn small"
          onClick={() =>
            setLines([
              ...lines,
              { key: Math.max(...lines.map((l) => l.key)) + 1, product_id: "", qty: "", unit_price: "" },
            ])
          }
        >
          + Agregar producto
        </button>

        <h3>Gastos de venta (opcional)</h3>
        {expenses.map((e) => (
          <div className="line" key={e.key}>
            <Field label="Descripción" className="grow">
              <input
                value={e.description}
                onChange={(ev) =>
                  setExpenses(expenses.map((x) => (x.key === e.key ? { ...x, description: ev.target.value } : x)))
                }
              />
            </Field>
            <Field label="Monto (C$)">
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={e.amount}
                onChange={(ev) =>
                  setExpenses(expenses.map((x) => (x.key === e.key ? { ...x, amount: ev.target.value } : x)))
                }
              />
            </Field>
            <button
              type="button"
              className="icon-btn"
              aria-label="Quitar gasto"
              onClick={() => setExpenses(expenses.filter((x) => x.key !== e.key))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn small"
          onClick={() =>
            setExpenses([
              ...expenses,
              { key: Math.max(0, ...expenses.map((e) => e.key)) + 1, description: "", amount: "" },
            ])
          }
        >
          + Agregar gasto
        </button>

        <Field label="Nota (opcional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <dl className="facts result">
          {taxRate > 0 && (
            <>
              <div>
                <dt>Subtotal sin IVA</dt>
                <dd>{money(total)}</dd>
              </div>
              <div>
                <dt>IVA ({pct(taxRate)})</dt>
                <dd>{money(tax)}</dd>
              </div>
            </>
          )}
          <div className="strong">
            <dt>{taxRate > 0 ? "Total a cobrar con IVA" : "Total de la venta"}</dt>
            <dd>{money(grand)}</dd>
          </div>
          <div>
            <dt>Costo (FIFO) y gastos</dt>
            <dd>{money(cost + expenseTotal)}</dd>
          </div>
          <div>
            <dt>Comisión del vendedor ({pct(sellerRate)})</dt>
            <dd>{money(commission)}</dd>
          </div>
          <div className="strong">
            <dt>Utilidad neta estimada</dt>
            <dd>{money(gross - commission)}</dd>
          </div>
        </dl>

        {anyBelow && !anyMissing && (
          <label className="check warn">
            <input type="checkbox" checked={allowBelow} onChange={(e) => setAllowBelow(e.target.checked)} /> Autorizo
            vender por debajo del costo
          </label>
        )}
        <ErrorNote error={error.replace(/^BAJO_COSTO: /, "")} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || anyMissing || (anyBelow && !allowBelow)}>
            {busy ? "Guardando…" : "Guardar venta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
