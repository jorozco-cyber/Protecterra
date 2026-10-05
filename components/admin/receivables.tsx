"use client";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "./app";
import { SaleDetail, SalePaymentForm } from "./sales";
import { Badge, Empty, Modal, Search, Stat } from "../ui";
import { date, matches, money, plural } from "@/lib/format";
import { AGING_LABELS, agingByCustomer, type AgingBucket, type CustomerAging } from "@/lib/calc";
import type { Sale } from "@/lib/types";
import StatementDialog, { type DialogSale } from "../statement-dialog";

const BUCKETS: AgingBucket[] = ["al_dia", "d1_30", "d31_60", "d61_90", "d90"];

export default function Receivables() {
  const { data, focus, clearFocus } = useApp();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"cartera" | "cobros">("cartera");
  const [customer, setCustomer] = useState<CustomerAging | null>(null);
  const [statement, setStatement] = useState(false);
  useEffect(() => {
    if (focus !== "estado") return;
    setStatement(true);
    clearFocus();
  }, [focus, clearFocus]);
  const sales = useMemo(() => data.sales.filter((s) => !s.voided_at), [data.sales]);
  const aging = useMemo(() => agingByCustomer(sales), [sales]);
  const rows = aging.filter((r) => !query || matches(r.customer_name, query));
  const totals = BUCKETS.map((b) => aging.reduce((a, r) => a + r.buckets[b], 0));
  const total = aging.reduce((a, r) => a + r.balance, 0);
  const saleById = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales]);
  const payments = useMemo(
    () => data.salePayments.filter((p) => !p.voided_at).sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
    [data.salePayments],
  );
  const filteredPayments = payments.filter(
    (p) => !query || matches(saleById.get(p.sale_id)?.customer_name ?? "", query),
  );
  const shownPayments = filteredPayments.slice(0, 200);
  const statementSales = useMemo<DialogSale[]>(
    () =>
      sales
        .filter((s) => s.balance > 0.005)
        .map((s) => ({ ...s, payments: payments.filter((p) => p.sale_id === s.id).reverse() })),
    [sales, payments],
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Cobros y cartera</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setStatement(true)}>
            Estado de cuentas (PDF)
          </button>
        </div>
      </div>
      <div className="stats">
        <Stat label="Por cobrar" value={money(total)} hint={`${aging.length} clientes con saldo`} />
        {BUCKETS.slice(1).map((b, i) => (
          <Stat
            key={b}
            label={`Vencido ${AGING_LABELS[b].toLowerCase()}`}
            value={money(totals[i + 1])}
            tone={totals[i + 1] > 0 ? (b === "d1_30" ? "warn" : "danger") : undefined}
          />
        ))}
      </div>
      <div className="toolbar">
        <Search value={query} onChange={setQuery} placeholder="Buscar cliente" />
        <div className="segmented" role="group" aria-label="Vista">
          <button
            className={tab === "cartera" ? "active" : ""}
            aria-pressed={tab === "cartera"}
            onClick={() => setTab("cartera")}
          >
            Cartera por cliente
          </button>
          <button
            className={tab === "cobros" ? "active" : ""}
            aria-pressed={tab === "cobros"}
            onClick={() => setTab("cobros")}
          >
            Cobros recibidos
          </button>
        </div>
      </div>

      {tab === "cartera" ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num">Saldo</th>
                <th className="num hide-sm">Al día</th>
                <th className="num hide-sm">1–30</th>
                <th className="num hide-sm">31–60</th>
                <th className="num hide-sm">61–90</th>
                <th className="num hide-sm">+90</th>
                <th className="num">Atraso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.customer_id} className="clickable" onClick={() => setCustomer(r)}>
                  <td>
                    <button className="cell-btn" onClick={() => setCustomer(r)}>
                      {r.customer_name}
                    </button>
                    <small>{plural(r.invoices, "factura pendiente", "facturas pendientes")}</small>
                  </td>
                  <td className="num">
                    <strong>{money(r.balance)}</strong>
                  </td>
                  {BUCKETS.map((b) => (
                    <td key={b} className="num hide-sm">
                      {r.buckets[b] > 0 ? money(r.buckets[b]) : "—"}
                    </td>
                  ))}
                  <td className="num">
                    {r.maxDays > 0 ? (
                      <Badge tone={r.maxDays > 30 ? "danger" : "warn"}>{r.maxDays} días</Badge>
                    ) : (
                      <Badge tone="ok">Al día</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total · {plural(rows.length, "cliente", "clientes")}</td>
                <td className="num">{money(rows.reduce((a, r) => a + r.balance, 0))}</td>
                {BUCKETS.map((b) => (
                  <td key={b} className="num hide-sm">
                    {money(rows.reduce((a, r) => a + r.buckets[b], 0))}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
          {rows.length === 0 && <Empty>No hay saldos pendientes.</Empty>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th className="hide-sm">Método</th>
                <th className="num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {shownPayments.map((p) => {
                const s = saleById.get(p.sale_id);
                return (
                  <tr key={p.id}>
                    <td>{date(p.paid_on)}</td>
                    <td>
                      {s?.customer_name ?? "—"}
                      <small>Factura {s?.invoice_number ?? "s/n"}</small>
                    </td>
                    <td className="hide-sm">{p.method ?? "—"}</td>
                    <td className="num">{money(p.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{plural(filteredPayments.length, "cobro", "cobros")}</td>
                <td className="hide-sm" />
                <td className="num">{money(filteredPayments.reduce((a, p) => a + p.amount, 0))}</td>
              </tr>
            </tfoot>
          </table>
          {shownPayments.length === 0 && <Empty>No hay cobros.</Empty>}
        </div>
      )}
      {customer && <Statement aging={customer} onClose={() => setCustomer(null)} />}
      {statement && (
        <StatementDialog
          sales={statementSales}
          sellers={data.sellers.filter((s) => sales.some((x) => x.seller_id === s.id && x.balance > 0.005))}
          onClose={() => setStatement(false)}
        />
      )}
    </div>
  );
}

function Statement({ aging, onClose }: { aging: CustomerAging; onClose: () => void }) {
  const { data } = useApp();
  const [paying, setPaying] = useState<Sale | null>(null);
  const [open, setOpen] = useState<Sale | null>(null);
  const pending = data.sales
    .filter((s) => !s.voided_at && s.customer_id === aging.customer_id && s.balance > 0.005)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const customer = data.customers.find((c) => c.id === aging.customer_id);
  const balance = pending.reduce((a, s) => a + s.balance, 0);
  return (
    <Modal title={`Estado de cuenta · ${aging.customer_name}`} onClose={onClose} wide>
      <div className="stats compact">
        <Stat label="Saldo pendiente" value={money(balance)} />
        <Stat label="Facturas pendientes" value={String(pending.length)} />
        <Stat label="Teléfono" value={customer?.phone ?? "—"} />
      </div>
      {pending.length === 0 ? (
        <Empty>Este cliente ya no tiene saldo pendiente.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Factura</th>
              <th className="hide-sm">Fecha</th>
              <th>Vence</th>
              <th className="num hide-sm">Total</th>
              <th className="num">Saldo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pending.map((s) => (
              <tr key={s.id}>
                <td>
                  <button className="cell-btn" onClick={() => setOpen(s)}>
                    {s.invoice_number ?? "s/n"}
                  </button>
                </td>
                <td className="hide-sm">{date(s.sale_date)}</td>
                <td>
                  {date(s.due_date)}
                  {s.days_overdue > 0 && <small className="danger-text">{s.days_overdue} días de atraso</small>}
                </td>
                <td className="num hide-sm">{money(s.total)}</td>
                <td className="num">{money(s.balance)}</td>
                <td className="num">
                  <button className="btn small primary" onClick={() => setPaying(s)}>
                    Cobrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="hide-sm" />
              <td />
              <td className="num hide-sm">{money(pending.reduce((a, s) => a + s.total, 0))}</td>
              <td className="num">{money(balance)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      {paying && <SalePaymentForm sale={paying} onClose={() => setPaying(null)} />}
      {open && <SaleDetail sale={data.sales.find((s) => s.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </Modal>
  );
}
