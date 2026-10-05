"use client";
import { useState } from "react";
import { useApp } from "./app";
import { Empty, Stat } from "../ui";
import { money, num, qty } from "@/lib/format";

const raw = (d: Record<string, unknown>, f: string) => d[f + "_raw"] ?? d[f];
const text = (d: Record<string, unknown>, f: string) => {
  const v = raw(d, f);
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
};
const day = (d: Record<string, unknown>, f: string) => {
  const v = raw(d, f);
  return v && typeof v === "object" && "date_formatted" in v
    ? String((v as { date_formatted: unknown }).date_formatted)
    : "—";
};

export default function HistoryView() {
  const { data } = useApp();
  const [tab, setTab] = useState<"siembra" | "tomate" | "superior">("siembra");
  const siembra = data.history.filter((h) => h.kind === "siembra");
  const tomate = data.history.filter((h) => h.kind === "venta_tomate");
  const superior = data.sales.filter((s) => !s.voided_at && s.superior_commission > 0.005);
  return (
    <div className="page">
      <div className="page-head">
        <h1>Historial</h1>
      </div>
      <p className="muted">Datos traídos de la app anterior que se conservan solo para consulta.</p>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Historial">
          {(
            [
              ["siembra", "Inversión de siembra"],
              ["tomate", "Ventas de tomate"],
              ["superior", "Comisiones de vendedor superior"],
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
      {tab === "siembra" && (
        <>
          <div className="stats">
            <Stat
              label="Inversión total"
              value={money(siembra.reduce((a, h) => a + num(raw(h.data, "field_236")), 0))}
              hint={`${siembra.length} registros`}
            />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Precio unitario</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {siembra.map((h) => (
                  <tr key={h.id}>
                    <td>{text(h.data, "field_233")}</td>
                    <td className="num">{qty(raw(h.data, "field_235"))}</td>
                    <td className="num">{money(raw(h.data, "field_234"))}</td>
                    <td className="num">{money(raw(h.data, "field_236"))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td />
                  <td className="num">{money(siembra.reduce((a, h) => a + num(raw(h.data, "field_236")), 0))}</td>
                </tr>
              </tfoot>
            </table>
            {siembra.length === 0 && <Empty>Sin registros.</Empty>}
          </div>
        </>
      )}
      {tab === "tomate" && (
        <>
          <div className="stats">
            <Stat
              label="Ventas de tomate"
              value={money(tomate.reduce((a, h) => a + num(raw(h.data, "field_387")), 0))}
            />
            <Stat label="Utilidad neta" value={money(tomate.reduce((a, h) => a + num(raw(h.data, "field_389")), 0))} />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="num">Cajillas</th>
                  <th className="num hide-sm">Precio</th>
                  <th className="num">Total</th>
                  <th className="num hide-sm">Pago de corta</th>
                  <th className="num">Utilidad neta</th>
                </tr>
              </thead>
              <tbody>
                {tomate.map((h) => (
                  <tr key={h.id}>
                    <td>
                      {day(h.data, "field_384")}
                      <small>{text(h.data, "field_390")}</small>
                    </td>
                    <td className="num">{qty(raw(h.data, "field_385"))}</td>
                    <td className="num hide-sm">{money(raw(h.data, "field_386"))}</td>
                    <td className="num">{money(raw(h.data, "field_387"))}</td>
                    <td className="num hide-sm">{money(raw(h.data, "field_388"))}</td>
                    <td className="num">{money(raw(h.data, "field_389"))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{qty(tomate.reduce((a, h) => a + num(raw(h.data, "field_385")), 0))}</td>
                  <td className="num hide-sm" />
                  <td className="num">{money(tomate.reduce((a, h) => a + num(raw(h.data, "field_387")), 0))}</td>
                  <td className="num hide-sm">
                    {money(tomate.reduce((a, h) => a + num(raw(h.data, "field_388")), 0))}
                  </td>
                  <td className="num">{money(tomate.reduce((a, h) => a + num(raw(h.data, "field_389")), 0))}</td>
                </tr>
              </tfoot>
            </table>
            {tomate.length === 0 && <Empty>Sin registros.</Empty>}
          </div>
        </>
      )}
      {tab === "superior" && (
        <>
          <div className="stats">
            <Stat
              label="Comisión de vendedor superior"
              value={money(superior.reduce((a, s) => a + s.superior_commission, 0))}
              hint={`${superior.length} ventas · ya no se usa`}
            />
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Cliente</th>
                  <th>Vendedor superior</th>
                  <th className="num">Comisión</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {superior.map((s) => (
                  <tr key={s.id}>
                    <td>{s.invoice_number ?? "s/n"}</td>
                    <td>{s.customer_name}</td>
                    <td>{s.superior_seller ?? "—"}</td>
                    <td className="num">{money(s.superior_commission)}</td>
                    <td>{s.superior_status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td />
                  <td />
                  <td className="num">{money(superior.reduce((a, s) => a + s.superior_commission, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            {superior.length === 0 && <Empty>Sin registros.</Empty>}
          </div>
        </>
      )}
    </div>
  );
}
