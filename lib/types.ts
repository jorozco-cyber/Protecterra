export type FileRef = { id?: string; filename?: string; url?: string; path?: string } | null;

export type Product = {
  id: string;
  name: string;
  category: string | null;
  unit_price: number | null;
  min_required: number;
  active: boolean;
  qty_received: number;
  qty_sold: number;
  qty_available: number;
  stock_value: number;
  needs_reorder: boolean;
};

export type Lot = {
  id: string;
  lot_number: number;
  product_id: string;
  purchase_id: string | null;
  qty: number;
  unit_cost: number;
  product_name: string;
  product_category: string | null;
  purchase_date: string | null;
  qty_sold: number;
  qty_available: number;
  total_cost: number;
};

export type Supplier = { id: string; name: string; phone: string | null; notes: string | null };

export type Purchase = {
  id: string;
  purchase_date: string;
  invoice_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  kind: "contado" | "credito";
  initial_payment: number;
  due_date: string | null;
  invoice_file: FileRef;
  receipt_file: FileRef;
  total: number;
  units: number;
  paid: number;
  balance: number;
  payment_status: "pagado" | "pendiente";
  voided_at: string | null;
  voided_reason: string | null;
};

export type PurchasePayment = {
  id: string;
  purchase_id: string;
  paid_on: string;
  description: string | null;
  amount: number;
  method: string | null;
  file: FileRef;
  voided_at: string | null;
  voided_reason: string | null;
};

export type Customer = {
  id: string;
  name: string;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export type Seller = {
  id: string;
  name: string;
  email: string | null;
  commission_rate: number;
  cedula: string | null;
  legal_name: string | null;
  active: boolean;
  portal_enabled: boolean;
};

export type Sale = {
  id: string;
  sale_date: string;
  invoice_number: number | null;
  customer_id: string;
  customer_name: string;
  seller_id: string | null;
  seller_name: string | null;
  kind: "contado" | "credito";
  due_date: string | null;
  commission_rate: number;
  commission_status: "pendiente" | "pagado";
  superior_rate: number;
  superior_status: string | null;
  superior_seller: string | null;
  invoice_file: FileRef;
  receipt_file: FileRef;
  total: number;
  cost: number;
  paid: number;
  expenses: number;
  balance: number;
  payment_status: "pagado" | "pendiente";
  gross_profit: number;
  commission: number;
  superior_commission: number;
  net_profit: number;
  days_overdue: number;
  voided_at: string | null;
  voided_reason: string | null;
  note: string | null;
};

export type SaleLine = {
  id: string;
  sale_id: string;
  product_id: string;
  lot_id: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
};

export type SalePayment = {
  id: string;
  sale_id: string;
  paid_on: string;
  receipt_number: string | null;
  amount: number;
  method: string | null;
  file: FileRef;
  voided_at: string | null;
  voided_reason: string | null;
};

export type SaleExpense = {
  id: string;
  sale_id: string;
  description: string;
  amount: number;
  voided_at: string | null;
};

export type CommissionPayment = {
  id: string;
  seller_id: string | null;
  paid_on: string | null;
  amount: number;
  method: string | null;
};

export type OtherPerson = { id: string; name: string; email: string | null };

export type OtherCommission = {
  id: string;
  person_id: string | null;
  month_label: string | null;
  invoice_number: string | null;
  agroquim_billing: number;
  agroquim_rate: number;
  other_billing: number;
  other_rate: number;
  status: "pendiente" | "pagado";
  invoice_file: FileRef;
  payment_file: FileRef;
  voided_at: string | null;
};

export type CashCount = {
  id: string;
  counted_at: string;
  nio: Record<string, number>;
  usd: Record<string, number>;
  exchange_rate: number;
  note: string | null;
};

export type HistoryRow = { id: string; kind: string; data: Record<string, unknown> };

export type AuditRow = {
  id: number;
  at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: Record<string, unknown> | null;
};

export type Data = {
  products: Product[];
  lots: Lot[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchasePayments: PurchasePayment[];
  customers: Customer[];
  sellers: Seller[];
  sales: Sale[];
  saleLines: SaleLine[];
  salePayments: SalePayment[];
  saleExpenses: SaleExpense[];
  commissionPayments: CommissionPayment[];
  otherPeople: OtherPerson[];
  otherCommissions: OtherCommission[];
  cashCounts: CashCount[];
  history: HistoryRow[];
  audit: AuditRow[];
  exchangeRate: number;
  commissionReceipts: CommissionReceipt[];
  /** Firma del administrador que sale precargada en los recibos. */
  issuer: { name: string; signature: Signature | null } | null;
};

export type PortalSale = {
  id: string;
  invoice_number: number | null;
  sale_date: string;
  due_date: string | null;
  kind: string;
  customer_id: string;
  customer_name: string;
  total: number;
  paid: number;
  balance: number;
  payment_status: "pagado" | "pendiente";
  days_overdue: number;
  commission: number;
  commission_status: "pendiente" | "pagado";
  lines: { product: string; qty: number; unit_price: number }[];
  payments: { paid_on: string; amount: number; method: string | null }[];
};

export type Portal = {
  seller: { name: string; commission_rate: number };
  sales: PortalSale[];
  receipts?: PortalReceipt[];
  customers: { id: string; name: string; phone: string | null }[];
};

/** Firma dibujada: trazos como listas x,y,x,y… sobre un lienzo de w × h. */
export type Signature = { w: number; h: number; strokes: number[][] };

export type ReceiptStatus = "enviado" | "firmado" | "pagado" | "anulado";

export type ReceiptItem = {
  sale_id: string;
  invoice_number: number | null;
  customer_name: string;
  sale_date: string;
  recovered_on: string | null;
  total: number;
  commission: number;
};

/** Recibo de comisiones tal como lo ve quien lo firma. */
export type ReceiptDoc = {
  number: number;
  status: ReceiptStatus;
  created_at: string;
  token: string;
  seller_name: string;
  items: ReceiptItem[];
  total_sales: number;
  total_commission: number;
  issuer_name: string;
  issuer_signature: Signature | null;
  signer_name: string | null;
  signature: Signature | null;
  signed_at: string | null;
  /** Solo viene al abrir el enlace: verdadero si la cuenta conectada es la del vendedor del recibo. */
  can_sign?: boolean;
};

export type CommissionReceipt = ReceiptDoc & {
  id: string;
  seller_id: string;
  signed_ip: string | null;
  payment_id: string | null;
  email_sent_at: string | null;
  admin_notified_at: string | null;
  file: FileRef;
  voided_at: string | null;
  voided_reason: string | null;
};

export type PortalReceipt = {
  number: number;
  token: string;
  status: ReceiptStatus;
  created_at: string;
  total_commission: number;
  signed_at: string | null;
  invoices: number;
};
