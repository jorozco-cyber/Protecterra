"use client";
import { useEffect, useMemo, useState } from "react";
import type { Portal, PortalSale } from "@/lib/types";
import { loadPortal } from "../data";
import { Badge, Empty, Modal, Search, Stat, logout } from "../ui";
import { date, matches, money, monthName, pct, plural, qty, today } from "@/lib/format";
import { agingByCustomer, commissionStage, commissionTotals, recoveredOn } from "@/lib/calc";
import type { CommissionStage } from "@/lib/calc";
import StatementDialog from "../statement-dialog";

type Tab = "atrasos" | "ventas" | "comisiones";

export function CommissionBadge({ stage }: { stage: CommissionStage }) {
  if (stage === "pagada") return <Badge tone="ok">Pagada</Badge>;
  if (stage === "lista") return <Badge tone="info">Lista para pago</Badge>;
  if (stage === "proximo_mes") return <Badge>Se paga en {monthName(today(), 1)}</Badge>;
  return <Badge tone="warn">Por recuperar</Badge>;
}

export default function SellerApp({
  email,
  preview,
}: {
  email: string;
  /** Vista previa para el administrador: muestra el portal de este vendedor y un botón para volver. */
  preview?: { sellerId: string; onExit: () => void };
}) {
  const [portal, setPortal] = useState<Portal | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("atrasos");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<PortalSale | null>(null);
  const [statement, setStatement] = useState(false);

  useEffect(() => {
    loadPortal(preview?.sellerId)
      .then(setPortal)
      .catch((e: Error) => setError(e.message));
  }, [preview?.sellerId]);

  const view = useMemo(() => {
    const sales = portal?.sales ?? [];
    const pending = sales.filter((s) => s.balance > 0.005);
    return {
      sales,
      pending,
      aging: agingByCustomer(sales),
      receivable: pending.reduce((a, s) => a + s.balance, 0),
      overdue: pending.filter((s) => s.days_overdue > 0).reduce((a, s) => a + s.balance, 0),
      commission: commissionTotals(sales, (s) => s.payments, today()),
    };
  }, [portal]);

  const phone = (id: string) => portal?.customers.find((c) => c.id === id)?.phone ?? null;
  const filtered = view.sales.filter((s) => !query || matches(`${s.customer_name} ${s.invoice_number ?? ""}`, query));
  const commissionRows = filtered.filter((s) => Math.abs(s.commission) > 0.005);

  return (
    <div className="seller">
      <header className="seller-head">
        <div>
          <img className="seller-logo" src="/logo-blanco-simple.svg" alt="ProtecTerra" width={518} height={177} />
          <h1>{portal?.seller.name ?? "Mi portal"}</h1>
        </div>
        <button className="btn small" onClick={preview ? preview.onExit : logout}>
          {preview ? "Salir de la vista previa" : "Cerrar sesión"}
        </button>
      </header>
      {preview && (
        <p className="preview-note" role="status">
          Vista previa: así ve su portal este vendedor. Él no ve costos, utilidades ni datos de otros vendedores.
        </p>
      )}
      <main className="seller-main">
        {error && (
          <p role="alert" className="note danger">
            {error}
          </p>
        )}
        {!portal && !error && <p className="loading">Cargando…</p>}
        {portal && (
          <>
            <div className="stats">
              <Stat
                label="Por cobrar de mis clientes"
                value={money(view.receivable)}
                hint={`${view.pending.length} facturas`}
              />
              <Stat label="Vencido" value={money(view.overdue)} tone={view.overdue > 0 ? "danger" : "ok"} />
              <Stat
                label="Comisión lista para pago"
                value={money(view.commission.lista.amount)}
                hint={`${plural(view.commission.lista.count, "factura recuperada", "facturas recuperadas")} hasta ${monthName(today(), -1)}`}
                tone="ok"
              />
              <Stat
                label={`Recuperado en ${monthName(today())}`}
                value={money(view.commission.proximo_mes.amount)}
                hint={`${plural(view.commission.proximo_mes.count, "factura", "facturas")} · se paga a inicios de ${monthName(today(), 1)}`}
              />
              <Stat
                label="Comisión por recuperar"
                value={money(view.commission.por_recuperar.amount)}
                hint={`${plural(view.commission.por_recuperar.count, "factura", "facturas")} aún con saldo · comisión actual ${pct(portal.seller.commission_rate)}`}
                tone="warn"
              />
              <Stat label="Mi comisión pagada" value={money(view.commission.pagada.amount)} />
            </div>
            <div className="toolbar">
              <div className="segmented" role="group" aria-label="Vista">
                {(
                  [
                    ["atrasos", "Clientes con saldo"],
                    ["ventas", "Mis ventas"],
                    ["comisiones", "Mis comisiones"],
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
              {tab === "atrasos" && (
                <button className="btn primary" onClick={() => setStatement(true)}>
                  Estado de cuentas (PDF)
                </button>
              )}
              {tab !== "atrasos" && <Search value={query} onChange={setQuery} placeholder="Buscar cliente o factura" />}
            </div>

            {tab === "atrasos" && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th className="num">Saldo</th>
                      <th className="num">Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.aging.map((r) => (
                      <tr key={r.customer_id}>
                        <td>
                          {r.customer_name}
                          <small>
                            {plural(r.invoices, "factura pendiente", "facturas pendientes")}
                            {phone(r.customer_id) ? ` · ${phone(r.customer_id)}` : ""}
                          </small>
                        </td>
                        <td className="num">
                          <strong>{money(r.balance)}</strong>
                        </td>
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
                      <td>Total · {plural(view.aging.length, "cliente", "clientes")}</td>
                      <td className="num">{money(view.receivable)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                {view.aging.length === 0 && <Empty>Ninguno de tus clientes tiene saldo pendiente.</Empty>}
              </div>
            )}

            {tab === "ventas" && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th>Cliente</th>
                      <th className="num hide-sm">Total</th>
                      <th className="num">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 300).map((s) => (
                      <tr key={s.id} className="clickable" onClick={() => setOpen(s)}>
                        <td>
                          <button className="cell-btn" onClick={() => setOpen(s)}>
                            {s.invoice_number ?? "s/n"}
                          </button>
                          <small>{date(s.sale_date)}</small>
                        </td>
                        <td>{s.customer_name}</td>
                        <td className="num hide-sm">{money(s.total)}</td>
                        <td className="num">
                          {s.balance <= 0.005 ? (
                            <Badge tone="ok">Pagada</Badge>
                          ) : (
                            <>
                              {money(s.balance)}
                              {s.days_overdue > 0 && (
                                <small className="danger-text">{s.days_overdue} días de atraso</small>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td>{plural(filtered.length, "factura", "facturas")}</td>
                      <td className="num hide-sm">{money(filtered.reduce((a, s) => a + s.total, 0))}</td>
                      <td className="num">{money(filtered.reduce((a, s) => a + s.balance, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
                {filtered.length === 0 && <Empty>No hay ventas con esa búsqueda.</Empty>}
              </div>
            )}

            {tab === "comisiones" && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th>Cliente</th>
                      <th className="num">Comisión</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionRows.slice(0, 300).map((s) => (
                      <tr key={s.id}>
                        <td>
                          {s.invoice_number ?? "s/n"}
                          <small>{date(s.sale_date)}</small>
                        </td>
                        <td>
                          {s.customer_name}
                          <small>
                            {s.balance <= 0.005
                              ? `Recuperada el ${date(recoveredOn(s, s.payments))}`
                              : `Por cobrar: ${money(s.balance)}`}
                          </small>
                        </td>
                        <td className="num">{money(s.commission)}</td>
                        <td>
                          <CommissionBadge stage={commissionStage(s, s.payments, today())} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td />
                      <td className="num">{money(commissionRows.reduce((a, s) => a + s.commission, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
        <p className="muted small center">{email}</p>
      </main>
      {statement && portal && (
        <StatementDialog sales={view.pending} fixedSeller={portal.seller.name} onClose={() => setStatement(false)} />
      )}
      {open && (
        <Modal
          title={`Factura ${open.invoice_number ?? "s/n"} · ${open.customer_name}`}
          onClose={() => setOpen(null)}
          wide
        >
          <div className="stats compact">
            <Stat label="Total" value={money(open.total)} />
            <Stat label="Cobrado" value={money(open.paid)} />
            <Stat
              label="Saldo"
              value={money(open.balance)}
              tone={open.balance <= 0.005 ? "ok" : open.days_overdue > 0 ? "danger" : "warn"}
            />
          </div>
          <dl className="facts">
            <div>
              <dt>Fecha</dt>
              <dd>{date(open.sale_date)}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{open.kind === "credito" ? "Crédito" : "Contado"}</dd>
            </div>
            <div>
              <dt>Fecha prevista de pago</dt>
              <dd>{date(open.due_date)}</dd>
            </div>
            <div>
              <dt>Mi comisión</dt>
              <dd>{money(open.commission)}</dd>
            </div>
          </dl>
          <h3>Productos</h3>
          <table className="table">
            <tbody>
              {open.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.product}</td>
                  <td className="num">
                    {qty(l.qty)} × {money(l.unit_price)}
                  </td>
                  <td className="num">{money(l.qty * l.unit_price)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td />
                <td className="num">{money(open.total)}</td>
              </tr>
            </tfoot>
          </table>
          <h3>Cobros</h3>
          {open.payments.length === 0 ? (
            <Empty>Sin cobros registrados.</Empty>
          ) : (
            <table className="table">
              <tbody>
                {open.payments.map((p, i) => (
                  <tr key={i}>
                    <td>{date(p.paid_on)}</td>
                    <td>{p.method ?? "—"}</td>
                    <td className="num">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total cobrado</td>
                  <td />
                  <td className="num">{money(open.paid)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}
