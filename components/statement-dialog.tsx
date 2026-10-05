"use client";
import { useMemo, useState } from "react";
import { ErrorNote, Field, Modal, Stat } from "./ui";
import { money, plural, today } from "@/lib/format";
import {
  buildStatement,
  downloadPdf,
  statementFileName,
  statementPdf,
  type StatementSale,
  type StatementScope,
} from "@/lib/statement";

export type DialogSale = StatementSale & { seller_id?: string | null };

/**
 * Estado de cuentas por cobrar en PDF. El administrador puede elegir vendedor;
 * en el portal del vendedor llega fijo con su nombre.
 */
export default function StatementDialog({
  sales,
  sellers,
  fixedSeller,
  onClose,
}: {
  sales: DialogSale[];
  sellers?: { id: string; name: string }[];
  fixedSeller?: string;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<StatementScope>("pendientes");
  const [sellerId, setSellerId] = useState("");
  const [error, setError] = useState("");
  const sellerName = fixedSeller ?? sellers?.find((s) => s.id === sellerId)?.name ?? null;
  const statement = useMemo(
    () =>
      buildStatement(
        sales.filter((s) => !sellerId || s.seller_id === sellerId),
        scope,
      ),
    [sales, sellerId, scope],
  );

  function download() {
    try {
      const asOf = today();
      downloadPdf(statementPdf(statement, { asOf, seller: sellerName }), statementFileName(asOf, sellerName));
      setError("");
    } catch {
      setError("No se pudo generar el PDF. Intenta de nuevo.");
    }
  }

  return (
    <Modal title="Estado de cuentas en PDF" onClose={onClose}>
      <div className="form">
        <div className="form-row">
          <Field label="Qué incluir">
            <select value={scope} onChange={(e) => setScope(e.target.value as StatementScope)}>
              <option value="pendientes">Todas las facturas con saldo</option>
              <option value="vencidas">Solo las vencidas</option>
            </select>
          </Field>
          {sellers && (
            <Field label="Vendedor">
              <select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                <option value="">Todos</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="stats compact">
          <Stat label="Total vendido" value={money(statement.totals.total)} />
          <Stat label="Abonado" value={money(statement.totals.paid)} />
          <Stat label="Pendiente" value={money(statement.totals.balance)} tone="warn" />
        </div>
        <p className="muted small">
          {plural(statement.totals.customers, "cliente", "clientes")} ·{" "}
          {plural(statement.totals.invoices, "factura", "facturas")}. El PDF trae el resumen por cliente y el detalle de
          cada factura con sus abonos, todo con totales.
        </p>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cerrar
          </button>
          <button type="button" className="btn primary" onClick={download} disabled={statement.totals.invoices === 0}>
            Descargar PDF
          </button>
        </div>
      </div>
    </Modal>
  );
}
