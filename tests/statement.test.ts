import test from "node:test";
import assert from "node:assert/strict";
import { buildStatement, statementFileName, statementPdf, type StatementSale } from "../lib/statement";

const sale = (over: Partial<StatementSale>): StatementSale => ({
  invoice_number: 1,
  customer_id: "a",
  customer_name: "Ana",
  sale_date: "2026-09-01",
  due_date: "2026-10-01",
  total: 100,
  paid: 0,
  balance: 100,
  days_overdue: 0,
  payments: [],
  ...over,
});

const sample: StatementSale[] = [
  sale({
    invoice_number: 10,
    total: 1000,
    paid: 400,
    balance: 600,
    days_overdue: 12,
    payments: [{ paid_on: "2026-09-15", amount: 400, method: "Transferencia " }],
  }),
  sale({ invoice_number: 11, sale_date: "2026-09-20", total: 300, balance: 300 }),
  sale({
    invoice_number: 12,
    customer_id: "b",
    customer_name: "Beto Ñandú",
    total: 5000,
    paid: 0,
    balance: 5000,
    days_overdue: 40,
  }),
  sale({ invoice_number: 13, customer_id: "c", customer_name: "Carla", total: 50, paid: 50, balance: 0 }),
];

test("el estado de cuentas agrupa por cliente, deja fuera lo pagado y suma totales", () => {
  const st = buildStatement(sample, "pendientes");
  assert.deepEqual(
    st.customers.map((c) => c.name),
    ["Beto Ñandú", "Ana"],
  );
  assert.deepEqual(st.totals, { invoices: 3, customers: 2, total: 6300, paid: 400, balance: 5900, overdue: 5600 });
  const ana = st.customers[1];
  assert.deepEqual([ana.total, ana.paid, ana.balance, ana.overdue, ana.maxDays], [1300, 400, 900, 600, 12]);
  assert.deepEqual(
    ana.invoices.map((i) => i.invoice_number),
    [10, 11],
  );
});

test("solo vencidas deja fuera las facturas al día", () => {
  const st = buildStatement(sample, "vencidas");
  assert.equal(st.totals.invoices, 2);
  assert.equal(st.totals.balance, 5600);
  assert.equal(st.totals.overdue, 5600);
});

test("el PDF se genera con encabezado, totales y varias páginas cuando hay muchas facturas", () => {
  const many = Array.from({ length: 120 }, (_, i) =>
    sale({ invoice_number: i + 1, customer_id: "c" + (i % 30), customer_name: "Cliente " + (i % 30), balance: 100 }),
  );
  const bytes = statementPdf(buildStatement(many, "pendientes"), { asOf: "2026-10-05", seller: "Aristeo Estrada" });
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.includes("Estado de cuentas por cobrar"));
  assert.ok(text.includes("Total general"));
  assert.ok(text.includes("C$ 12,000.00"));
  assert.ok(Number(/\/Count (\d+)/.exec(text)?.[1]) >= 3);
  assert.ok(text.trimEnd().endsWith("%%EOF"));
});

test("un estado sin facturas también produce un PDF válido, y el nombre del archivo es limpio", () => {
  const bytes = statementPdf(buildStatement([], "vencidas"), { asOf: "2026-10-05" });
  assert.ok(Buffer.from(bytes).toString("latin1").includes("No hay facturas"));
  assert.equal(statementFileName("2026-10-05", "José Pérez"), "estado-de-cuentas-jose-perez-2026-10-05.pdf");
  assert.equal(statementFileName("2026-10-05"), "estado-de-cuentas-2026-10-05.pdf");
});
