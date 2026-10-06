"use client";
import { useMemo } from "react";
import { useApp } from "./app";
import { Bars, Empty, Stat } from "../ui";
import { date, money, monthLabel, qty, today } from "@/lib/format";
import { monthly } from "@/lib/calc";

export default function Home() {
  const { data, go } = useApp();
  const view = useMemo(() => {
    const sales = data.sales.filter((s) => !s.voided_at);
    const purchases = data.purchases.filter((p) => !p.voided_at);
    const month = today().slice(0, 7);
    const monthSales = sales.filter((s) => s.sale_date.startsWith(month));
    const pending = sales.filter((s) => s.balance > 0.005);
    const overdue = pending.filter((s) => s.days_overdue > 0).sort((a, b) => b.days_overdue - a.days_overdue);
    const payable = purchases.filter((p) => p.balance > 0.005);
    const reorder = data.products.filter((p) => p.active && p.needs_reorder && p.min_required > 0);
    const payments = data.salePayments.filter((p) => !p.voided_at);
    const months = monthly(sales, payments).slice(-12);
    return {
      monthTotal: monthSales.reduce((a, s) => a + s.total, 0),
      monthCount: monthSales.length,
      monthNet: monthSales.reduce((a, s) => a + s.net_profit, 0),
      receivable: pending.reduce((a, s) => a + s.balance, 0),
      pendingCount: pending.length,
      overdue,
      overdueTotal: overdue.reduce((a, s) => a + s.balance, 0),
      payable: payable.reduce((a, p) => a + p.balance, 0),
      payableList: payable.sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "")),
      stockValue: data.products.reduce((a, p) => a + p.stock_value, 0),
      stockUnits: data.products.reduce((a, p) => a + p.qty_available, 0),
      reorder,
      months,
    };
  }, [data]);

  const signedReceipts = data.commissionReceipts.filter((r) => r.status === "firmado");
  const waitingReceipts = data.commissionReceipts.filter((r) => r.status === "enviado");

  return (
    <div className="page">
      <div className="page-head">
        <h1>Inicio</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => go("ventas", "nueva")}>
            Nueva venta
          </button>
          <button className="btn" onClick={() => go("compras", "nueva")}>
            Nueva compra
          </button>
        </div>
      </div>

      {signedReceipts.length > 0 && (
        <p className="note ok" role="status">
          {signedReceipts.length === 1
            ? `${signedReceipts[0].seller_name} ya firmó su recibo de comisiones`
            : `Hay ${signedReceipts.length} recibos de comisiones ya firmados`}
          : <strong>{money(signedReceipts.reduce((a, r) => a + r.total_commission, 0))}</strong> listos para pagar.{" "}
          <button
            className="btn small primary"
            onClick={() => go("comisiones", `vendedor:${signedReceipts[0].seller_id}`)}
          >
            Registrar pago
          </button>
        </p>
      )}
      {waitingReceipts.length > 0 && (
        <p className="note" role="status">
          {waitingReceipts.length === 1
            ? "1 recibo de comisiones espera"
            : `${waitingReceipts.length} recibos de comisiones esperan`}{" "}
          la firma del vendedor ({money(waitingReceipts.reduce((a, r) => a + r.total_commission, 0))}).{" "}
          <button className="btn link" onClick={() => go("comisiones", `vendedor:${waitingReceipts[0].seller_id}`)}>
            Ver
          </button>
        </p>
      )}
      <div className="stats">
        <Stat
          label="Ventas del mes"
          value={money(view.monthTotal)}
          hint={`${view.monthCount} facturas · utilidad neta ${money(view.monthNet)}`}
          onClick={() => go("ventas", "ver:mes")}
        />
        <Stat
          label="Por cobrar"
          value={money(view.receivable)}
          hint={`${view.pendingCount} facturas pendientes`}
          onClick={() => go("ventas", "ver:pendientes")}
        />
        <Stat
          label="Vencido"
          value={money(view.overdueTotal)}
          hint={`${view.overdue.length} facturas atrasadas`}
          tone={view.overdue.length ? "danger" : "ok"}
          onClick={() => go("ventas", "ver:vencidas")}
        />
        <Stat
          label="Por pagar a proveedores"
          value={money(view.payable)}
          hint={`${view.payableList.length} compras`}
          more="Ver compras"
          onClick={() => go("compras", "ver:pendientes")}
        />
        <Stat
          label="Inventario al costo"
          value={money(view.stockValue)}
          hint={`${qty(view.stockUnits)} unidades`}
          more="Ver productos"
          onClick={() => go("inventario", "ver:stock")}
        />
        <Stat
          label="Productos por reordenar"
          value={String(view.reorder.length)}
          hint="En o por debajo del mínimo"
          tone={view.reorder.length ? "warn" : "ok"}
          more="Ver productos"
          onClick={() => go("inventario", "ver:reordenar")}
        />
      </div>

      <section className="card">
        <h2>Ventas por mes</h2>
        <Bars
          rows={view.months.map((m) => ({
            label: monthLabel(m.month).split(" ")[0],
            value: m.sales,
            title: `${monthLabel(m.month)}: ${money(m.sales)} en ${m.count} facturas`,
          }))}
        />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Facturas vencidas</h2>
            <button className="btn link" onClick={() => go("cobros")}>
              Ver cartera
            </button>
          </div>
          {view.overdue.length === 0 ? (
            <Empty>No hay facturas vencidas.</Empty>
          ) : (
            <ul className="list">
              {view.overdue.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <button className="row-btn" onClick={() => go("ventas", s.id)}>
                    <span>
                      <strong>{s.customer_name}</strong>
                      <small>
                        Factura {s.invoice_number ?? "s/n"} · venció {date(s.due_date)}
                      </small>
                    </span>
                    <span className="right">
                      <strong>{money(s.balance)}</strong>
                      <small className="danger-text">{s.days_overdue} días</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Por reordenar</h2>
            <button className="btn link" onClick={() => go("inventario")}>
              Ver inventario
            </button>
          </div>
          {view.reorder.length === 0 ? (
            <Empty>Ningún producto está por debajo de su mínimo.</Empty>
          ) : (
            <ul className="list">
              {view.reorder.slice(0, 8).map((p) => (
                <li key={p.id} className="row-static">
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.category ?? ""}</small>
                  </span>
                  <span className="right">
                    <strong>{qty(p.qty_available)}</strong>
                    <small>mínimo {qty(p.min_required)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {view.payableList.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Pagos pendientes a proveedores</h2>
            <button className="btn link" onClick={() => go("compras")}>
              Ver compras
            </button>
          </div>
          <ul className="list">
            {view.payableList.slice(0, 6).map((p) => (
              <li key={p.id}>
                <button className="row-btn" onClick={() => go("compras", p.id)}>
                  <span>
                    <strong>{p.supplier_name ?? "Sin proveedor"}</strong>
                    <small>
                      Factura {p.invoice_number ?? "s/n"} · vence {date(p.due_date)}
                    </small>
                  </span>
                  <span className="right">
                    <strong>{money(p.balance)}</strong>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
