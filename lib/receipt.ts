import { INK, createPdf, type Row } from "./pdf";
import { date, dateTime, money, plural } from "./format";
import type { ReceiptDoc } from "./types";

export const receiptNumber = (n: number) => String(n).padStart(4, "0");

export function receiptFileName(doc: ReceiptDoc): string {
  return `recibo-comisiones-${receiptNumber(doc.number)}${doc.signed_at ? "-firmado" : ""}.pdf`;
}

/** Suma facturas, venta y comisión por cliente, en orden alfabético. */
export function receiptByCustomer(
  doc: ReceiptDoc,
): { name: string; invoices: number; total: number; commission: number }[] {
  const map = new Map<string, { name: string; invoices: number; total: number; commission: number }>();
  for (const it of doc.items) {
    const row = map.get(it.customer_name) ?? { name: it.customer_name, invoices: 0, total: 0, commission: 0 };
    row.invoices += 1;
    row.total += it.total;
    row.commission += it.commission;
    map.set(it.customer_name, row);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Texto de conformidad que firma el vendedor. */
export function receiptStatement(doc: ReceiptDoc): string {
  return (
    `Yo, ${doc.signer_name ?? doc.seller_name}, hago constar que revisé el detalle de comisiones por facturas ` +
    `recuperadas que aparece en este documento y que estoy conforme con el monto total de ` +
    `${money(doc.total_commission)}, correspondiente a ${plural(doc.items.length, "factura", "facturas")}, ` +
    `que ProtecTerra me entrega por este concepto.`
  );
}

/** PDF del recibo de comisiones, con las firmas que ya existan. */
export function receiptPdf(doc: ReceiptDoc): Uint8Array {
  const created = dateTime(doc.created_at).slice(0, 10);
  const n = receiptNumber(doc.number);
  return createPdf(
    {
      title: "Recibo de comisiones",
      subtitle: `N.º ${n} · ${created}`,
      footer: `ProtecTerra · Recibo de comisiones N.º ${n} · Código ${doc.token.slice(0, 12)}`,
    },
    (pdf) => {
      pdf.space(6);
      pdf.paragraph(`Vendedor: ${doc.seller_name} · Comisiones por facturas recuperadas · Montos en córdobas (C$)`);
      pdf.space(4);
      pdf.stats([
        { label: "Facturas recuperadas", value: String(doc.items.length) },
        { label: "Total de las ventas", value: money(doc.total_sales) },
        { label: "Comisión a pagar", value: money(doc.total_commission) },
      ]);

      pdf.heading("Detalle por factura");
      const rows: Row[] = doc.items.map((it) => ({
        cells: [
          it.invoice_number == null ? "s/n" : String(it.invoice_number),
          it.customer_name,
          date(it.recovered_on),
          money(it.total),
          money(it.commission),
        ],
      }));
      rows.push({
        kind: "total",
        cells: [
          "Total",
          plural(doc.items.length, "factura", "facturas"),
          "",
          money(doc.total_sales),
          money(doc.total_commission),
        ],
      });
      pdf.table(
        [
          { header: "Factura", width: 60 },
          { header: "Cliente", width: 200 },
          { header: "Recuperada el", width: 80 },
          { header: "Total de la venta", width: 100, align: "right" },
          { header: "Comisión", width: 92, align: "right" },
        ],
        rows,
      );

      const customers = receiptByCustomer(doc);
      pdf.heading("Resumen por cliente");
      pdf.table(
        [
          { header: "Cliente", width: 250 },
          { header: "Facturas", width: 70, align: "right" },
          { header: "Total de las ventas", width: 110, align: "right" },
          { header: "Comisión", width: 102, align: "right" },
        ],
        [
          ...customers.map<Row>((c) => ({ cells: [c.name, String(c.invoices), money(c.total), money(c.commission)] })),
          {
            kind: "total",
            cells: [
              `Total · ${plural(customers.length, "cliente", "clientes")}`,
              String(doc.items.length),
              money(doc.total_sales),
              money(doc.total_commission),
            ],
          },
        ],
      );

      pdf.space(8);
      pdf.paragraph(receiptStatement(doc), 9.5, INK);
      pdf.space(6);
      pdf.signatures([
        { caption: "Entregué conforme", name: doc.issuer_name, note: "ProtecTerra", signature: doc.issuer_signature },
        {
          caption: "Recibí conforme",
          name: doc.signer_name ?? doc.seller_name,
          note: doc.signed_at
            ? `Firmado electrónicamente el ${dateTime(doc.signed_at)} (hora de Nicaragua)`
            : "Pendiente de firma",
          signature: doc.signature,
        },
      ]);
    },
  );
}
