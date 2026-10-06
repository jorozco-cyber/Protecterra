"use client";
import { useState } from "react";
import { useApp } from "./app";
import { save } from "../data";
import { Badge, Empty, ErrorNote, Field, FileSlot, Modal, Stat, useSubmit } from "../ui";
import { money, pct } from "@/lib/format";
import type { OtherCommission } from "@/lib/types";

const total = (c: OtherCommission) => c.agroquim_billing * c.agroquim_rate + c.other_billing * c.other_rate;

export default function OtherCommissions() {
  const { data, reload, notify } = useApp();
  const fileSaved = async () => {
    await reload();
    notify("Archivo guardado");
  };
  const [edit, setEdit] = useState<OtherCommission | "new" | null>(null);
  const rows = data.otherCommissions.filter((c) => !c.voided_at);
  const [status, setStatus] = useState<"pendiente" | "pagado" | null>(null);
  const shown = rows.filter((c) => !status || c.status === status);
  const card = (st: "pendiente" | "pagado") => ({
    more: "Ver comisiones",
    onClick: () => setStatus(status === st ? null : st),
    active: status === st,
  });
  const person = (id: string | null) => data.otherPeople.find((p) => p.id === id)?.name ?? "—";
  return (
    <div className="page">
      <div className="page-head">
        <h1>Otras comisiones</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setEdit("new")}>
            Nueva comisión
          </button>
        </div>
      </div>
      <div className="stats">
        <Stat
          label="Pendiente"
          value={money(rows.filter((c) => c.status === "pendiente").reduce((a, c) => a + total(c), 0))}
          {...card("pendiente")}
        />
        <Stat
          label="Pagado"
          value={money(rows.filter((c) => c.status === "pagado").reduce((a, c) => a + total(c), 0))}
          {...card("pagado")}
        />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Mes</th>
              <th className="num hide-sm">Línea Agroquim</th>
              <th className="num hide-sm">Otras líneas</th>
              <th className="num">Comisión total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => setEdit(c)}>
                <td>
                  <button className="cell-btn" onClick={() => setEdit(c)}>
                    {person(c.person_id)}
                  </button>
                  <small>
                    {c.invoice_number ? `Factura ${c.invoice_number} ` : ""}
                    <FileSlot
                      file={c.invoice_file}
                      label="Factura"
                      table="pt_other_commissions"
                      id={c.id}
                      column="invoice_file"
                      onSaved={fileSaved}
                    />{" "}
                    <FileSlot
                      file={c.payment_file}
                      label="Comprobante"
                      table="pt_other_commissions"
                      id={c.id}
                      column="payment_file"
                      onSaved={fileSaved}
                    />
                  </small>
                </td>
                <td>{c.month_label ?? "—"}</td>
                <td className="num hide-sm">
                  {money(c.agroquim_billing * c.agroquim_rate)}
                  <small>
                    {pct(c.agroquim_rate)} de {money(c.agroquim_billing)}
                  </small>
                </td>
                <td className="num hide-sm">
                  {money(c.other_billing * c.other_rate)}
                  <small>
                    {pct(c.other_rate)} de {money(c.other_billing)}
                  </small>
                </td>
                <td className="num">{money(total(c))}</td>
                <td>
                  <Badge tone={c.status === "pagado" ? "ok" : "warn"}>
                    {c.status === "pagado" ? "Pagada" : "Pendiente"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td />
              <td className="num hide-sm">
                {money(shown.reduce((a, c) => a + c.agroquim_billing * c.agroquim_rate, 0))}
              </td>
              <td className="num hide-sm">{money(shown.reduce((a, c) => a + c.other_billing * c.other_rate, 0))}</td>
              <td className="num">{money(shown.reduce((a, c) => a + total(c), 0))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        {shown.length === 0 && <Empty>Sin comisiones registradas.</Empty>}
      </div>
      {edit && <OtherForm row={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function OtherForm({ row, onClose }: { row: OtherCommission | null; onClose: () => void }) {
  const { data, reload, notify } = useApp();
  const [person, setPerson] = useState(row?.person_id ?? "");
  const [newPerson, setNewPerson] = useState("");
  const [month, setMonth] = useState(row?.month_label ?? "");
  const [invoice, setInvoice] = useState(row?.invoice_number ?? "");
  const [aBilling, setABilling] = useState(String(row?.agroquim_billing ?? ""));
  const [aRate, setARate] = useState(String(Math.round((row?.agroquim_rate ?? 0) * 10000) / 100));
  const [oBilling, setOBilling] = useState(String(row?.other_billing ?? ""));
  const [oRate, setORate] = useState(String(Math.round((row?.other_rate ?? 0) * 10000) / 100));
  const [status, setStatus] = useState<"pendiente" | "pagado">(row?.status ?? "pendiente");
  const preview =
    (Number(aBilling) || 0) * ((Number(aRate) || 0) / 100) + (Number(oBilling) || 0) * ((Number(oRate) || 0) / 100);

  const { busy, error, submit } = useSubmit(async () => {
    let personId = person;
    if (person === "new") {
      const id = crypto.randomUUID();
      await save("pt_other_commission_people", { id, name: newPerson.trim() });
      personId = id;
    }
    await save(
      "pt_other_commissions",
      {
        person_id: personId || null,
        month_label: month.trim() || null,
        invoice_number: invoice.trim() || null,
        agroquim_billing: Number(aBilling) || 0,
        agroquim_rate: (Number(aRate) || 0) / 100,
        other_billing: Number(oBilling) || 0,
        other_rate: (Number(oRate) || 0) / 100,
        status,
      },
      row?.id,
    );
    await reload();
    notify(row ? "Comisión actualizada" : "Comisión registrada");
  }, onClose);

  return (
    <Modal title={row ? "Editar comisión" : "Nueva comisión"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <Field label="Persona">
            <select value={person} onChange={(e) => setPerson(e.target.value)} required>
              <option value="">Selecciona…</option>
              {data.otherPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="new">+ Nueva persona</option>
            </select>
          </Field>
          <Field label="Mes" hint="Por ejemplo: Octubre 2026">
            <input value={month} onChange={(e) => setMonth(e.target.value)} required />
          </Field>
        </div>
        {person === "new" && (
          <Field label="Nombres y apellidos">
            <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} required />
          </Field>
        )}
        <Field label="Número de factura">
          <input value={invoice} onChange={(e) => setInvoice(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Facturación Agroquim (C$)">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={aBilling}
              onChange={(e) => setABilling(e.target.value)}
            />
          </Field>
          <Field label="Porcentaje Agroquim (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={aRate}
              onChange={(e) => setARate(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Facturación otras líneas (C$)">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={oBilling}
              onChange={(e) => setOBilling(e.target.value)}
            />
          </Field>
          <Field label="Porcentaje otras líneas (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={oRate}
              onChange={(e) => setORate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Estado">
          <select value={status} onChange={(e) => setStatus(e.target.value as "pendiente" | "pagado")}>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagada</option>
          </select>
        </Field>
        <p className="total-line">
          Comisión total <strong>{money(preview)}</strong>
        </p>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
