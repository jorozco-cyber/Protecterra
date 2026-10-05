"use client";
import { useMemo, useState } from "react";
import { useApp } from "./app";
import { Empty, Stat } from "../ui";
import { money, monthLabel, qty } from "@/lib/format";
import { monthly } from "@/lib/calc";

export default function Reports() {
  const { data } = useApp();
  const years = useMemo(
    () => [...new Set(data.sales.map((s) => s.sale_date.slice(0, 4)))].sort().reverse(),
    [data.sales],
  );
  const [year, setYear] = useState(years[0] ?? "");
  const [tab, setTab] = useState<"mes" | "producto" | "cliente">("mes");

  const sales = useMemo(
    () => data.sales.filter((s) => !s.voided_at && (!year || s.sale_date.startsWith(year))),
    [data.sales, year],
  );
  const months = useMemo(
    () =>
      monthly(
        sales,
        data.salePayments.filter((p) => !p.voided_at && (!year || p.paid_on.startsWith(year))),
      ),
    [sales, data.salePayments, year],
  );
  const byProduct = useMemo(() => {
    const ids = new Set(sales.map((s) => s.id));
    const map = new Map<string, { name: string; qty: number; total: number; cost: number }>();
    for (const l of data.saleLines) {
      if (!ids.has(l.sale_id)) continue;
      const p = data.products.find((x) => x.id === l.product_id);
      const r = map.get(l.product_id) ?? {
        name: p ? `${p.name}${p.category ? " · " + p.category : ""}` : "Producto",
        qty: 0,
        total: 0,
        cost: 0,
      };
      r.qty += l.qty;
      r.total += l.qty * l.unit_price;
      r.cost += l.qty * l.unit_cost;
      map.set(l.product_id, r);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [sales, data.saleLines, data.products]);
  const byCustomer = useMemo(() => {
    const map = new Map<string, { name: string; count: number; total: number; net: number; balance: number }>();
    for (const s of sales) {
      const r = map.get(s.customer_id) ?? { name: s.customer_name, count: 0, total: 0, net: 0, balance: 0 };
      r.count += 1;
      r.total += s.total;
      r.net += s.net_profit;
      r.balance += s.balance;
      map.set(s.customer_id, r);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [sales]);

  const sum = (f: (m: (typeof months)[number]) => number) => months.reduce((a, m) => a + f(m), 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Reportes</h1>
        <div className="head-actions">
          <select aria-label="Año" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Todos los años</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="stats">
        <Stat label="Ventas" value={money(sum((m) => m.sales))} hint={`${sum((m) => m.count)} facturas`} />
        <Stat label="Cobrado" value={money(sum((m) => m.collected))} />
        <Stat label="Utilidad bruta" value={money(sum((m) => m.gross))} />
        <Stat label="Comisiones" value={money(sum((m) => m.commissions))} />
        <Stat label="Utilidad neta" value={money(sum((m) => m.net))} tone="ok" />
      </div>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Reporte">
          {(
            [
              ["mes", "Por mes"],
              ["producto", "Por producto"],
              ["cliente", "Por cliente"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        {tab === "mes" && (
          <table className="table">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="num">Ventas</th>
                <th className="num hide-sm">Costo</th>
                <th className="num hide-sm">Gastos</th>
                <th className="num hide-sm">Utilidad bruta</th>
                <th className="num hide-sm">Comisiones</th>
                <th className="num">Utilidad neta</th>
                <th className="num">Cobrado</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>
                    {monthLabel(m.month)}
                    <small>{m.count} facturas</small>
                  </td>
                  <td className="num">{money(m.sales)}</td>
                  <td className="num hide-sm">{money(m.cost)}</td>
                  <td className="num hide-sm">{money(m.expenses)}</td>
                  <td className="num hide-sm">{money(m.gross)}</td>
                  <td className="num hide-sm">{money(m.commissions)}</td>
                  <td className="num">{money(m.net)}</td>
                  <td className="num">{money(m.collected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "producto" && (
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="num">Unidades</th>
                <th className="num">Ventas</th>
                <th className="num hide-sm">Costo</th>
                <th className="num">Margen</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td className="num">{qty(p.qty)}</td>
                  <td className="num">{money(p.total)}</td>
                  <td className="num hide-sm">{money(p.cost)}</td>
                  <td className="num">{money(p.total - p.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "cliente" && (
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="num hide-sm">Facturas</th>
                <th className="num">Ventas</th>
                <th className="num hide-sm">Utilidad neta</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {byCustomer.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="num hide-sm">{c.count}</td>
                  <td className="num">{money(c.total)}</td>
                  <td className="num hide-sm">{money(c.net)}</td>
                  <td className="num">{c.balance > 0.005 ? money(c.balance) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sales.length === 0 && <Empty>No hay ventas en ese período.</Empty>}
      </div>
    </div>
  );
}
