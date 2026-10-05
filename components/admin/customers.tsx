"use client";
import { useMemo, useState } from "react";
import { useApp } from "./app";
import { save } from "../data";
import { Empty, ErrorNote, Field, Modal, Search, useSubmit } from "../ui";
import { matches, money, plural } from "@/lib/format";
import type { Customer } from "@/lib/types";

export default function Customers() {
  const { data } = useApp();
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<Customer | "new" | null>(null);
  const stats = useMemo(() => {
    const map = new Map<string, { total: number; balance: number; count: number }>();
    for (const s of data.sales) {
      if (s.voided_at) continue;
      const r = map.get(s.customer_id) ?? { total: 0, balance: 0, count: 0 };
      r.total += s.total;
      r.balance += s.balance;
      r.count += 1;
      map.set(s.customer_id, r);
    }
    return map;
  }, [data.sales]);
  const rows = data.customers.filter(
    (c) => !query || matches(`${c.name} ${c.trade_name ?? ""} ${c.phone ?? ""}`, query),
  );
  return (
    <div className="page">
      <div className="page-head">
        <h1>Clientes</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setEdit("new")}>
            Nuevo cliente
          </button>
        </div>
      </div>
      <div className="toolbar">
        <Search value={query} onChange={setQuery} placeholder="Buscar cliente" />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="hide-sm">Teléfono</th>
              <th className="num hide-sm">Compras</th>
              <th className="num">Total vendido</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const s = stats.get(c.id);
              return (
                <tr key={c.id} className="clickable" onClick={() => setEdit(c)}>
                  <td>
                    <button className="cell-btn" onClick={() => setEdit(c)}>
                      {c.name}
                    </button>
                    <small>{c.trade_name ?? ""}</small>
                  </td>
                  <td className="hide-sm">{c.phone ?? "—"}</td>
                  <td className="num hide-sm">{s?.count ?? 0}</td>
                  <td className="num">{money(s?.total ?? 0)}</td>
                  <td className="num">{(s?.balance ?? 0) > 0.005 ? money(s!.balance) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total · {plural(rows.length, "cliente", "clientes")}</td>
              <td className="hide-sm" />
              <td className="num hide-sm">{rows.reduce((a, c) => a + (stats.get(c.id)?.count ?? 0), 0)}</td>
              <td className="num">{money(rows.reduce((a, c) => a + (stats.get(c.id)?.total ?? 0), 0))}</td>
              <td className="num">{money(rows.reduce((a, c) => a + (stats.get(c.id)?.balance ?? 0), 0))}</td>
            </tr>
          </tfoot>
        </table>
        {rows.length === 0 && <Empty>No hay clientes con ese nombre.</Empty>}
      </div>
      {edit && <CustomerForm customer={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function CustomerForm({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [name, setName] = useState(customer?.name ?? "");
  const [trade, setTrade] = useState(customer?.trade_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const { busy, error, submit } = useSubmit(async () => {
    await save(
      "pt_customers",
      {
        name: name.trim(),
        trade_name: trade.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      },
      customer?.id,
    );
    await reload();
    notify(customer ? "Cliente actualizado" : "Cliente creado");
  }, onClose);
  return (
    <Modal title={customer ? "Editar cliente" : "Nuevo cliente"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nombre del cliente">
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Nombre comercial">
          <input value={trade} onChange={(e) => setTrade(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Teléfono">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Correo electrónico">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <Field label="Dirección">
          <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Comentarios">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
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
