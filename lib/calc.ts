import type { Lot, Sale } from "./types";

export type Allocation = { lot_id: string; lot_number: number; qty: number; unit_cost: number };

export type FifoPreview = {
  allocations: Allocation[];
  missing: number;
  cost: number;
};

/**
 * Reparte una cantidad entre los lotes más viejos primero (FIFO), igual que lo hace
 * la base de datos al guardar la venta. Solo cuenta lotes comprados hasta la fecha de venta.
 * `reserved` descuenta lo que otras líneas de la misma venta ya tomaron de cada lote.
 */
export function fifoPreview(
  lots: Lot[],
  productId: string,
  quantity: number,
  saleDate: string,
  reserved: Record<string, number> = {},
): FifoPreview {
  const candidates = lots
    .filter((l) => l.product_id === productId && (l.purchase_date ?? "1900-01-01") <= saleDate)
    .sort(
      (a, b) =>
        (a.purchase_date ?? "1900-01-01").localeCompare(b.purchase_date ?? "1900-01-01") || a.lot_number - b.lot_number,
    );
  let need = quantity;
  let cost = 0;
  const allocations: Allocation[] = [];
  for (const lot of candidates) {
    if (need <= 0) break;
    const available = lot.qty_available - (reserved[lot.id] ?? 0);
    if (available <= 0) continue;
    const take = Math.min(need, available);
    allocations.push({ lot_id: lot.id, lot_number: lot.lot_number, qty: take, unit_cost: lot.unit_cost });
    cost += take * lot.unit_cost;
    need -= take;
  }
  return { allocations, missing: Math.max(0, need), cost };
}

export type AgingBucket = "al_dia" | "d1_30" | "d31_60" | "d61_90" | "d90";

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "al_dia";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90";
}

export const AGING_LABELS: Record<AgingBucket, string> = {
  al_dia: "Al día",
  d1_30: "1–30 días",
  d31_60: "31–60 días",
  d61_90: "61–90 días",
  d90: "Más de 90",
};

export type CustomerAging = {
  customer_id: string;
  customer_name: string;
  invoices: number;
  balance: number;
  maxDays: number;
  buckets: Record<AgingBucket, number>;
};

type AgingSale = Pick<Sale, "customer_id" | "customer_name" | "balance" | "days_overdue">;

/** Cartera por cliente: saldo pendiente repartido por antigüedad del atraso. */
export function agingByCustomer(sales: AgingSale[]): CustomerAging[] {
  const map = new Map<string, CustomerAging>();
  for (const s of sales) {
    if (s.balance <= 0.005) continue;
    let row = map.get(s.customer_id);
    if (!row) {
      row = {
        customer_id: s.customer_id,
        customer_name: s.customer_name,
        invoices: 0,
        balance: 0,
        maxDays: 0,
        buckets: { al_dia: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 },
      };
      map.set(s.customer_id, row);
    }
    row.invoices += 1;
    row.balance += s.balance;
    row.maxDays = Math.max(row.maxDays, s.days_overdue);
    row.buckets[agingBucket(s.days_overdue)] += s.balance;
  }
  return [...map.values()].sort((a, b) => b.maxDays - a.maxDays || b.balance - a.balance);
}

export type MonthRow = {
  month: string;
  sales: number;
  count: number;
  cost: number;
  expenses: number;
  gross: number;
  commissions: number;
  net: number;
  collected: number;
};

type MonthSale = Pick<
  Sale,
  "sale_date" | "total" | "cost" | "expenses" | "gross_profit" | "commission" | "superior_commission" | "net_profit"
>;

/** Resumen por mes. Los cobros se cuentan en el mes en que entró el dinero. */
export function monthly(sales: MonthSale[], payments: { paid_on: string; amount: number }[]): MonthRow[] {
  const map = new Map<string, MonthRow>();
  const row = (month: string) => {
    let r = map.get(month);
    if (!r) {
      r = { month, sales: 0, count: 0, cost: 0, expenses: 0, gross: 0, commissions: 0, net: 0, collected: 0 };
      map.set(month, r);
    }
    return r;
  };
  for (const s of sales) {
    const r = row(s.sale_date.slice(0, 7));
    r.sales += s.total;
    r.count += 1;
    r.cost += s.cost;
    r.expenses += s.expenses;
    r.gross += s.gross_profit;
    r.commissions += s.commission + s.superior_commission;
    r.net += s.net_profit;
  }
  for (const p of payments) row(p.paid_on.slice(0, 7)).collected += p.amount;
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export const NIO_BILLS = [1000, 500, 200, 100, 50, 20, 10, 5];
export const USD_BILLS = [100, 50, 20, 10, 5];

export function cashTotal(counts: Record<string, number>, bills: number[]): number {
  return bills.reduce((sum, b) => sum + b * (Number(counts[String(b)]) || 0), 0);
}
