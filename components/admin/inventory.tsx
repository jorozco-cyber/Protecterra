"use client";
import { useMemo, useState } from "react";
import { useApp } from "./app";
import { save } from "../data";
import { Badge, Empty, ErrorNote, Field, Modal, Search, Stat, useSubmit } from "../ui";
import { date, matches, money, qty } from "@/lib/format";
import type { Product } from "@/lib/types";

export default function Inventory() {
  const { data } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"stock" | "todos" | "reordenar" | "inactivos">("stock");
  const [open, setOpen] = useState<Product | null>(null);
  const [edit, setEdit] = useState<Product | "new" | null>(null);

  const rows = useMemo(
    () =>
      data.products.filter((p) => {
        if (query && !matches(`${p.name} ${p.category ?? ""}`, query)) return false;
        if (filter === "inactivos") return !p.active;
        if (!p.active) return false;
        if (filter === "stock") return p.qty_available > 0;
        if (filter === "reordenar") return p.needs_reorder && p.min_required > 0;
        return true;
      }),
    [data.products, query, filter],
  );
  const value = data.products.reduce((a, p) => a + p.stock_value, 0);
  const units = data.products.reduce((a, p) => a + p.qty_available, 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Inventario</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setEdit("new")}>
            Nuevo producto
          </button>
        </div>
      </div>
      <div className="stats">
        <Stat label="Valor al costo" value={money(value)} />
        <Stat label="Unidades en stock" value={qty(units)} />
        <Stat label="Productos con stock" value={String(data.products.filter((p) => p.qty_available > 0).length)} />
      </div>
      <div className="toolbar">
        <Search value={query} onChange={setQuery} placeholder="Buscar producto" />
        <div className="segmented" role="group" aria-label="Filtro">
          {(
            [
              ["stock", "Con stock"],
              ["reordenar", "Por reordenar"],
              ["todos", "Todos"],
              ["inactivos", "Inactivos"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">Disponible</th>
              <th className="num hide-sm">Mínimo</th>
              <th className="num hide-sm">Vendido</th>
              <th className="num">Valor al costo</th>
              <th className="num hide-sm">Precio de venta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => setOpen(p)}>
                <td>
                  <button className="cell-btn" onClick={() => setOpen(p)}>
                    {p.name}
                  </button>
                  <small>{p.category ?? ""}</small>
                </td>
                <td className="num">
                  {qty(p.qty_available)} {p.needs_reorder && p.min_required > 0 && <Badge tone="warn">Reordenar</Badge>}
                </td>
                <td className="num hide-sm">{qty(p.min_required)}</td>
                <td className="num hide-sm">{qty(p.qty_sold)}</td>
                <td className="num">{money(p.stock_value)}</td>
                <td className="num hide-sm">{p.unit_price == null ? "—" : money(p.unit_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No hay productos con ese filtro.</Empty>}
      </div>
      {open && (
        <ProductDetail product={open} onClose={() => setOpen(null)} onEdit={() => (setEdit(open), setOpen(null))} />
      )}
      {edit && <ProductForm product={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ProductDetail({ product, onClose, onEdit }: { product: Product; onClose: () => void; onEdit: () => void }) {
  const { data } = useApp();
  const lots = data.lots
    .filter((l) => l.product_id === product.id)
    .sort((a, b) => (a.purchase_date ?? "").localeCompare(b.purchase_date ?? "") || a.lot_number - b.lot_number);
  const withStock = lots.filter((l) => l.qty_available > 0);
  return (
    <Modal title={product.name} onClose={onClose} wide>
      <div className="stats compact">
        <Stat label="Disponible" value={qty(product.qty_available)} />
        <Stat label="Valor al costo" value={money(product.stock_value)} />
        <Stat label="Comprado / vendido" value={`${qty(product.qty_received)} / ${qty(product.qty_sold)}`} />
      </div>
      <h3>Lotes con stock (se venden en este orden)</h3>
      {withStock.length === 0 ? (
        <Empty>Sin stock.</Empty>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Comprado</th>
              <th className="num">Disponible</th>
              <th className="num">Costo unitario</th>
            </tr>
          </thead>
          <tbody>
            {withStock.map((l) => (
              <tr key={l.id}>
                <td>#{l.lot_number}</td>
                <td>{date(l.purchase_date)}</td>
                <td className="num">
                  {qty(l.qty_available)} de {qty(l.qty)}
                </td>
                <td className="num">{money(l.unit_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">{lots.length - withStock.length} lotes anteriores ya se agotaron.</p>
      <div className="actions">
        <button className="btn" onClick={onEdit}>
          Editar producto
        </button>
      </div>
    </Modal>
  );
}

function ProductForm({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { reload, notify } = useApp();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [price, setPrice] = useState(product?.unit_price == null ? "" : String(product.unit_price));
  const [min, setMin] = useState(String(product?.min_required ?? 0));
  const [active, setActive] = useState(product?.active ?? true);
  const { busy, error, submit } = useSubmit(async () => {
    await save(
      "pt_products",
      {
        name: name.trim(),
        category: category.trim() || null,
        unit_price: price === "" ? null : Number(price),
        min_required: Number(min) || 0,
        active,
      },
      product?.id,
    );
    await reload();
    notify(product ? "Producto actualizado" : "Producto creado");
  }, onClose);
  return (
    <Modal title={product ? "Editar producto" : "Nuevo producto"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label="Nombre">
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Presentación o categoría" hint="Por ejemplo: Galón, Litro, Abono">
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <div className="form-row">
          <Field label="Precio de venta sugerido (C$)">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Mínimo en stock" hint="Avisa cuando baje a esta cantidad">
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Producto activo
        </label>
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
