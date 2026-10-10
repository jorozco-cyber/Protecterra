import test from "node:test";
import assert from "node:assert/strict";
import {
  fifoPreview,
  agingBucket,
  agingByCustomer,
  monthly,
  cashTotal,
  NIO_BILLS,
  commissionStage,
  commissionTotals,
  recoveredOn,
  withIva,
  invoicesWithoutIva,
} from "../lib/calc";
import { money, date, addDays, monthLabel, monthName, matches } from "../lib/format";
import type { Lot } from "../lib/types";

const lot = (id: string, n: number, date: string | null, avail: number, cost: number, product = "p1"): Lot => ({
  id,
  lot_number: n,
  product_id: product,
  purchase_id: null,
  qty: avail,
  unit_cost: cost,
  product_name: "x",
  product_category: null,
  purchase_date: date,
  qty_sold: 0,
  qty_available: avail,
  total_cost: avail * cost,
});

test("FIFO toma primero el lote más viejo y reparte entre lotes", () => {
  const lots = [lot("b", 2, "2026-09-10", 10, 120), lot("a", 1, "2026-09-01", 5, 100)];
  const r = fifoPreview(lots, "p1", 8, "2026-09-15");
  assert.deepEqual(
    r.allocations.map((a) => [a.lot_id, a.qty]),
    [
      ["a", 5],
      ["b", 3],
    ],
  );
  assert.equal(r.cost, 5 * 100 + 3 * 120);
  assert.equal(r.missing, 0);
});

test("FIFO no usa lotes comprados después de la fecha de venta ni de otro producto", () => {
  const lots = [
    lot("a", 1, "2026-09-01", 5, 100),
    lot("b", 2, "2026-09-20", 10, 120),
    lot("c", 3, "2026-08-01", 9, 50, "p2"),
  ];
  const r = fifoPreview(lots, "p1", 8, "2026-09-15");
  assert.equal(r.missing, 3);
  assert.deepEqual(
    r.allocations.map((a) => a.lot_id),
    ["a"],
  );
});

test("FIFO descuenta lo reservado por otras líneas y desempata por número de lote", () => {
  const lots = [lot("b", 2, "2026-09-01", 4, 110), lot("a", 1, "2026-09-01", 4, 100)];
  const r = fifoPreview(lots, "p1", 5, "2026-09-15", { a: 3 });
  assert.deepEqual(
    r.allocations.map((a) => [a.lot_id, a.qty]),
    [
      ["a", 1],
      ["b", 4],
    ],
  );
});

test("antigüedad de cartera", () => {
  assert.equal(agingBucket(0), "al_dia");
  assert.equal(agingBucket(30), "d1_30");
  assert.equal(agingBucket(31), "d31_60");
  assert.equal(agingBucket(91), "d90");
  const rows = agingByCustomer([
    { customer_id: "1", customer_name: "A", balance: 100, days_overdue: 0 },
    { customer_id: "1", customer_name: "A", balance: 50, days_overdue: 45 },
    { customer_id: "2", customer_name: "B", balance: 0, days_overdue: 0 },
    { customer_id: "3", customer_name: "C", balance: 10, days_overdue: 100 },
  ]);
  assert.deepEqual(
    rows.map((r) => r.customer_name),
    ["C", "A"],
  );
  assert.equal(rows[1].balance, 150);
  assert.equal(rows[1].buckets.d31_60, 50);
  assert.equal(rows[1].invoices, 2);
});

test("resumen mensual separa ventas del mes y cobros del mes", () => {
  const rows = monthly(
    [
      {
        sale_date: "2026-09-30",
        total: 100,
        cost: 60,
        expenses: 5,
        gross_profit: 35,
        commission: 10,
        superior_commission: 1,
        net_profit: 24,
      },
    ],
    [{ paid_on: "2026-10-02", amount: 100 }],
  );
  assert.deepEqual(
    rows.map((r) => [r.month, r.sales, r.collected]),
    [
      ["2026-09", 100, 0],
      ["2026-10", 0, 100],
    ],
  );
  assert.equal(rows[0].commissions, 11);
});

test("contador de billetes y formatos", () => {
  assert.equal(cashTotal({ "1000": 2, "5": 3 }, NIO_BILLS), 2015);
  assert.equal(money(1234.5), "C$ 1,234.50");
  assert.equal(money(-3), "-C$ 3.00");
  assert.equal(date("2026-10-05"), "05/10/2026");
  assert.equal(addDays("2026-09-15", 30), "2026-10-15");
  assert.equal(monthLabel("2026-10"), "oct 2026");
  assert.ok(matches("Cooperativa Sacaclí", "sacacli"));
});

test("plurales", async () => {
  const { plural } = await import("../lib/format");
  assert.equal(plural(1, "factura", "facturas"), "1 factura");
  assert.equal(plural(3, "factura", "facturas"), "3 facturas");
});

test("La comisión se gana al recuperar la factura y se paga el mes siguiente", () => {
  const sale = (balance: number, status: "pendiente" | "pagado" = "pendiente") => ({
    sale_date: "2026-08-20",
    balance,
    commission: 100,
    commission_status: status,
  });
  const sept = [{ paid_on: "2026-09-03" }, { paid_on: "2026-09-28" }];
  const oct = [{ paid_on: "2026-09-28" }, { paid_on: "2026-10-02" }];
  assert.equal(recoveredOn(sale(0), sept), "2026-09-28");
  assert.equal(recoveredOn(sale(50), sept), null);
  assert.equal(recoveredOn(sale(0), []), "2026-08-20");
  // Recuperada en septiembre: en octubre ya está lista para pago.
  assert.equal(commissionStage(sale(0), sept, "2026-10-05"), "lista");
  // Recuperada en octubre: se paga en noviembre.
  assert.equal(commissionStage(sale(0), oct, "2026-10-05"), "proximo_mes");
  assert.equal(commissionStage(sale(0), oct, "2026-11-01"), "lista");
  // Con saldo, aunque tenga abonos, todavía no se gana.
  assert.equal(commissionStage(sale(50), sept, "2026-10-05"), "por_recuperar");
  assert.equal(commissionStage(sale(0, "pagado"), sept, "2026-10-05"), "pagada");
  // Cambio de año: recuperada en diciembre, lista en enero.
  assert.equal(commissionStage(sale(0), [{ paid_on: "2026-12-30" }], "2027-01-02"), "lista");

  const rows = [
    { ...sale(0), p: sept },
    { ...sale(0), p: oct },
    { ...sale(50), p: sept },
    { ...sale(0, "pagado"), p: sept },
    { ...sale(0), commission: 0, p: sept },
  ];
  const t = commissionTotals(rows, (r) => r.p, "2026-10-05");
  assert.deepEqual(
    [t.lista, t.proximo_mes, t.por_recuperar, t.pagada],
    [
      { amount: 100, count: 1 },
      { amount: 100, count: 1 },
      { amount: 100, count: 1 },
      { amount: 100, count: 1 },
    ],
  );
});

test("Nombre del mes con corrimiento", () => {
  assert.equal(monthName("2026-10-05"), "octubre");
  assert.equal(monthName("2026-10-05", -1), "septiembre");
  assert.equal(monthName("2026-12-05", 1), "enero");
  assert.equal(monthName("2026-01-05", -1), "diciembre");
});

test("IVA: suma el 15% al costo unitario sin IVA", () => {
  assert.equal(withIva(3248), 3735.2);
  assert.equal(withIva(2707), 3113.05);
  assert.equal(withIva(812.1), 933.915);
  assert.equal(withIva(939.5), 1080.425);
  assert.equal(withIva(0), 0);
});

test("IVA: la factura 0121 de Agroquim cuadra con su total", () => {
  const lines: [number, number][] = [
    [5, 3248],
    [3, 3248],
    [3, 3248],
    [6, 2707],
    [8, 812.1],
    [19, 812.1],
    [19, 812.1],
    [19, 939.5],
  ];
  const total = lines.reduce((a, [q, c]) => a + q * withIva(c), 0);
  assert.equal(Math.round(total * 100) / 100, 123253.67);
});

test("IVA: solo Agroquim factura sin IVA", () => {
  assert.equal(invoicesWithoutIva("AGROQUIM"), true);
  assert.equal(invoicesWithoutIva("Agroquim S.A."), true);
  assert.equal(invoicesWithoutIva("Fertagro"), false);
  assert.equal(invoicesWithoutIva(null), false);
});
