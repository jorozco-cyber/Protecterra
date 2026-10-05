import { createPdf, type Row } from "./pdf";
import { date, money, plural } from "./format";

/** Una factura tal como la necesita el estado de cuentas (sirve para el administrador y para el vendedor). */
export type StatementSale = {
  invoice_number: number | null;
  customer_id: string;
  customer_name: string;
  sale_date: string;
  due_date: string | null;
  total: number;
  paid: number;
  balance: number;
  days_overdue: number;
  payments: { paid_on: string; amount: number; method: string | null }[];
};

export type StatementScope = "pendientes" | "vencidas";

export type StatementCustomer = {
  customer_id: string;
  name: string;
  invoices: StatementSale[];
  total: number;
  paid: number;
  balance: number;
  overdue: number;
  maxDays: number;
};

export type Statement = {
  scope: StatementScope;
  customers: StatementCustomer[];
  totals: { invoices: number; customers: number; total: number; paid: number; balance: number; overdue: number };
};

/**
 * Agrupa por cliente las facturas con saldo. "vencidas" deja solo las que ya pasaron su fecha de pago.
 * Los clientes salen ordenados por saldo, de mayor a menor; sus facturas, de la más vieja a la más nueva.
 */
export function buildStatement(sales: StatementSale[], scope: StatementScope): Statement {
  const map = new Map<string, StatementCustomer>();
  for (const s of sales) {
    if (s.balance <= 0.005) continue;
    if (scope === "vencidas" && s.days_overdue <= 0) continue;
    let c = map.get(s.customer_id);
    if (!c) {
      c = {
        customer_id: s.customer_id,
        name: s.customer_name,
        invoices: [],
        total: 0,
        paid: 0,
        balance: 0,
        overdue: 0,
        maxDays: 0,
      };
      map.set(s.customer_id, c);
    }
    c.invoices.push(s);
    c.total += s.total;
    c.paid += s.paid;
    c.balance += s.balance;
    if (s.days_overdue > 0) c.overdue += s.balance;
    c.maxDays = Math.max(c.maxDays, s.days_overdue);
  }
  const customers = [...map.values()].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
  for (const c of customers)
    c.invoices.sort(
      (a, b) => a.sale_date.localeCompare(b.sale_date) || (a.invoice_number ?? 0) - (b.invoice_number ?? 0),
    );
  const sum = (f: (c: StatementCustomer) => number) => customers.reduce((a, c) => a + f(c), 0);
  return {
    scope,
    customers,
    totals: {
      invoices: sum((c) => c.invoices.length),
      customers: customers.length,
      total: sum((c) => c.total),
      paid: sum((c) => c.paid),
      balance: sum((c) => c.balance),
      overdue: sum((c) => c.overdue),
    },
  };
}

const days = (n: number) => (n > 0 ? plural(n, "día", "días") : "Al día");

export function statementFileName(asOf: string, seller?: string | null): string {
  const who = seller
    ? "-" +
      seller
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
    : "";
  return `estado-de-cuentas${who}-${asOf}.pdf`;
}

/** PDF del estado de cuentas: resumen, tabla por cliente y detalle por factura con sus abonos. Todo con totales. */
export function statementPdf(st: Statement, opts: { asOf: string; seller?: string | null }): Uint8Array {
  const scopeLabel = st.scope === "vencidas" ? "Solo facturas vencidas" : "Todas las facturas con saldo pendiente";
  const who = opts.seller ? `Vendedor: ${opts.seller}` : "Todos los vendedores";
  return createPdf(
    {
      title: "Estado de cuentas por cobrar",
      subtitle: `Corte al ${date(opts.asOf)}`,
      footer: `ProtecTerra · Estado de cuentas por cobrar · Corte al ${date(opts.asOf)}`,
    },
    (doc) => {
      doc.space(6);
      doc.paragraph(`${scopeLabel} · ${who} · Montos en córdobas (C$)`);
      doc.space(4);
      doc.stats([
        { label: "Total vendido", value: money(st.totals.total) },
        { label: "Abonado", value: money(st.totals.paid) },
        { label: "Pendiente por cobrar", value: money(st.totals.balance) },
        { label: "De eso, ya vencido", value: money(st.totals.overdue) },
      ]);
      doc.paragraph(
        `${plural(st.totals.customers, "cliente", "clientes")} · ${plural(st.totals.invoices, "factura", "facturas")}`,
        8.5,
      );

      if (st.customers.length === 0) {
        doc.space(10);
        doc.paragraph("No hay facturas que cumplan con este filtro.", 10);
        return;
      }

      doc.heading("Resumen por cliente");
      doc.table(
        [
          { header: "Cliente", width: 150 },
          { header: "Facturas", width: 42, align: "right" },
          { header: "Total venta", width: 78, align: "right" },
          { header: "Abonado", width: 78, align: "right" },
          { header: "Pendiente", width: 78, align: "right" },
          { header: "Mayor atraso", width: 58, align: "right" },
        ],
        [
          ...st.customers.map<Row>((c) => ({
            cells: [
              c.name,
              String(c.invoices.length),
              money(c.total),
              money(c.paid),
              money(c.balance),
              days(c.maxDays),
            ],
            alert: c.maxDays > 0 ? [5] : [],
          })),
          {
            kind: "total",
            cells: [
              "Total",
              String(st.totals.invoices),
              money(st.totals.total),
              money(st.totals.paid),
              money(st.totals.balance),
              "",
            ],
          },
        ],
      );

      doc.heading("Detalle por factura");
      const rows: Row[] = [];
      for (const c of st.customers) {
        rows.push({ kind: "group", cells: [c.name, "", "", "", "", "", ""] });
        for (const s of c.invoices) {
          rows.push({
            cells: [
              `Factura ${s.invoice_number ?? "s/n"}`,
              date(s.sale_date),
              date(s.due_date),
              days(s.days_overdue),
              money(s.total),
              money(s.paid),
              money(s.balance),
            ],
            alert: s.days_overdue > 0 ? [3] : [],
          });
          for (const p of s.payments)
            rows.push({
              kind: "sub",
              cells: [`Abono · ${p.method?.trim() || "sin método"}`, date(p.paid_on), "", "", "", money(p.amount), ""],
            });
        }
        rows.push({
          kind: "subtotal",
          cells: ["Subtotal del cliente", "", "", "", money(c.total), money(c.paid), money(c.balance)],
        });
      }
      rows.push({
        kind: "total",
        cells: ["Total general", "", "", "", money(st.totals.total), money(st.totals.paid), money(st.totals.balance)],
      });
      doc.table(
        [
          { header: "Factura", width: 128 },
          { header: "Fecha", width: 52 },
          { header: "Vence", width: 52 },
          { header: "Atraso", width: 50, align: "right" },
          { header: "Total venta", width: 74, align: "right" },
          { header: "Abonado", width: 74, align: "right" },
          { header: "Pendiente", width: 74, align: "right" },
        ],
        rows,
      );
    },
  );
}

/** Descarga el PDF en el navegador. */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice().buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
