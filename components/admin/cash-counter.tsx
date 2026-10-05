"use client";
import { useState } from "react";
import { useApp } from "./app";
import { save, saveSetting } from "../data";
import { Empty, ErrorNote, Field, Stat, useSubmit } from "../ui";
import { money } from "@/lib/format";
import { NIO_BILLS, USD_BILLS, cashTotal } from "@/lib/calc";

const usd = (v: number) => "US$ " + v.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CashCounter() {
  const { data, reload, notify } = useApp();
  const [nio, setNio] = useState<Record<string, number>>({});
  const [dollars, setDollars] = useState<Record<string, number>>({});
  const [rate, setRate] = useState(String(data.exchangeRate));
  const [note, setNote] = useState("");
  const rateNumber = Number(rate) || 0;
  const totalNio = cashTotal(nio, NIO_BILLS);
  const totalUsd = cashTotal(dollars, USD_BILLS);
  const grand = totalNio + totalUsd * rateNumber;

  const { busy, error, submit } = useSubmit(
    async () => {
      if (rateNumber <= 0) throw new Error("Escribe el tipo de cambio.");
      await save("pt_cash_counts", { nio, usd: dollars, exchange_rate: rateNumber, note: note.trim() || null });
      if (rateNumber !== data.exchangeRate) await saveSetting("usd_exchange_rate", rateNumber);
      await reload();
      notify("Conteo guardado");
    },
    () => {
      setNio({});
      setDollars({});
      setNote("");
    },
  );

  const input = (
    bill: number,
    counts: Record<string, number>,
    set: (v: Record<string, number>) => void,
    label: string,
  ) => (
    <label className="bill" key={label + bill}>
      <span>
        {label} {bill}
      </span>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={counts[String(bill)] ?? ""}
        placeholder="0"
        onChange={(e) => set({ ...counts, [String(bill)]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
      />
      <span className="bill-total">{(bill * (counts[String(bill)] || 0)).toLocaleString("es-NI")}</span>
    </label>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Contador de billetes</h1>
      </div>
      <div className="stats">
        <Stat label="Córdobas" value={money(totalNio)} />
        <Stat label="Dólares" value={usd(totalUsd)} hint={`${money(totalUsd * rateNumber)} al cambio`} />
        <Stat label="Total general en córdobas" value={money(grand)} tone="ok" />
      </div>
      <form className="grid-2" onSubmit={submit}>
        <section className="card">
          <h2>Billetes en córdobas</h2>
          <div className="bills">{NIO_BILLS.map((b) => input(b, nio, setNio, "C$"))}</div>
        </section>
        <section className="card">
          <h2>Billetes en dólares</h2>
          <div className="bills">{USD_BILLS.map((b) => input(b, dollars, setDollars, "US$"))}</div>
          <Field label="Tipo de cambio (C$ por dólar)" hint="Se guarda para los siguientes conteos">
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </Field>
          <Field label="Nota (opcional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorNote error={error} />
          <div className="actions">
            <button className="btn primary" disabled={busy || grand <= 0}>
              {busy ? "Guardando…" : "Guardar conteo"}
            </button>
          </div>
        </section>
      </form>
      <section className="card">
        <h2>Conteos guardados</h2>
        {data.cashCounts.length === 0 ? (
          <Empty>Todavía no hay conteos guardados.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="num">Córdobas</th>
                <th className="num">Dólares</th>
                <th className="num">Total en córdobas</th>
              </tr>
            </thead>
            <tbody>
              {data.cashCounts.slice(0, 30).map((c) => {
                const n = cashTotal(c.nio ?? {}, NIO_BILLS);
                const d = cashTotal(c.usd ?? {}, USD_BILLS);
                return (
                  <tr key={c.id}>
                    <td>
                      {new Date(c.counted_at).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" })}
                      <small>{c.note ?? ""}</small>
                    </td>
                    <td className="num">{money(n)}</td>
                    <td className="num">{usd(d)}</td>
                    <td className="num">{money(n + d * c.exchange_rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
