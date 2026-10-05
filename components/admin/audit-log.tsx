"use client";
import { useApp } from "./app";
import { Empty } from "../ui";
import { money } from "@/lib/format";

const ENTITY: Record<string, string> = {
  venta: "Venta",
  cobro: "Cobro",
  gasto_venta: "Gasto de venta",
  compra: "Compra",
  pago_compra: "Pago a proveedor",
  pago_comision: "Pago de comisión",
};
const ACTION: Record<string, string> = { crear: "Creó", anular: "Anuló" };

function describe(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const parts: string[] = [];
  if (detail.factura != null) parts.push(`factura ${String(detail.factura)}`);
  if (typeof detail.total === "number") parts.push(money(detail.total));
  if (typeof detail.monto === "number") parts.push(money(detail.monto));
  if (typeof detail.motivo === "string") parts.push(`motivo: ${detail.motivo}`);
  return parts.join(" · ");
}

export default function AuditLog() {
  const { data } = useApp();
  return (
    <div className="page">
      <div className="page-head">
        <h1>Registro de cambios</h1>
      </div>
      <p className="muted">
        Los últimos 200 movimientos hechos en la app. Nada se borra: lo que se corrige queda anulado y registrado aquí.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Cuándo</th>
              <th>Qué</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {data.audit.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.at).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" })}</td>
                <td>
                  {ACTION[a.action] ?? a.action} {(ENTITY[a.entity] ?? a.entity).toLowerCase()}
                </td>
                <td>{describe(a.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.audit.length === 0 && <Empty>Todavía no hay movimientos hechos desde esta app.</Empty>}
      </div>
    </div>
  );
}
