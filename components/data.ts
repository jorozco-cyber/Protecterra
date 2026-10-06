"use client";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Data, Portal, ReceiptDoc, Signature } from "@/lib/types";
import { num } from "@/lib/format";

const FRIENDLY = "No se pudo completar la operación. Revisa tu conexión e intenta de nuevo.";

function message(error: { message?: string; code?: string } | null): string {
  if (!error) return FRIENDLY;
  // Los mensajes de las reglas de negocio vienen en español desde la base de datos (código P0001).
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  if (error.code === "23505") return "Ya existe un registro con ese mismo dato.";
  return FRIENDLY;
}

async function all<T>(table: string, order = "id", ascending = true): Promise<T[]> {
  const sb = supabaseBrowser();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from(table)
      .select("*")
      .order(order, { ascending })
      .range(from, from + 999);
    if (error) throw new Error(message(error));
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export async function loadData(): Promise<Data> {
  const sb = supabaseBrowser();
  const [
    products,
    lots,
    suppliers,
    purchases,
    purchasePayments,
    customers,
    sellers,
    sales,
    saleLines,
    salePayments,
    saleExpenses,
    commissionPayments,
    otherPeople,
    otherCommissions,
    cashCounts,
    history,
    receipts,
    audit,
    settings,
  ] = await Promise.all([
    all<Data["products"][number]>("pt_v_products", "name"),
    all<Data["lots"][number]>("pt_v_lots", "lot_number"),
    all<Data["suppliers"][number]>("pt_suppliers", "name"),
    all<Data["purchases"][number]>("pt_v_purchases", "purchase_date", false),
    all<Data["purchasePayments"][number]>("pt_purchase_payments", "paid_on"),
    all<Data["customers"][number]>("pt_customers", "name"),
    all<Data["sellers"][number]>("pt_sellers", "name"),
    all<Data["sales"][number]>("pt_v_sales", "sale_date", false),
    all<Data["saleLines"][number]>("pt_sale_lines"),
    all<Data["salePayments"][number]>("pt_sale_payments", "paid_on"),
    all<Data["saleExpenses"][number]>("pt_sale_expenses"),
    all<Data["commissionPayments"][number]>("pt_commission_payments", "paid_on", false),
    all<Data["otherPeople"][number]>("pt_other_commission_people", "name"),
    all<Data["otherCommissions"][number]>("pt_other_commissions", "created_at", false),
    all<Data["cashCounts"][number]>("pt_cash_counts", "counted_at", false),
    all<Data["history"][number]>("pt_history"),
    all<Data["commissionReceipts"][number]>("pt_commission_receipts", "created_at", false),
    sb.from("pt_audit_log").select("*").order("id", { ascending: false }).limit(200),
    sb.from("pt_settings").select("key,value"),
  ]);
  if (audit.error) throw new Error(message(audit.error));
  if (settings.error) throw new Error(message(settings.error));
  const rate = (settings.data as { key: string; value: unknown }[]).find((s) => s.key === "usd_exchange_rate");
  const issuer = (settings.data as { key: string; value: unknown }[]).find((s) => s.key === "issuer_signature");
  return {
    products,
    lots,
    suppliers,
    purchases,
    purchasePayments,
    customers,
    sellers,
    sales: sales.sort(
      (a, b) => b.sale_date.localeCompare(a.sale_date) || (b.invoice_number ?? 0) - (a.invoice_number ?? 0),
    ),
    saleLines,
    salePayments,
    saleExpenses,
    commissionPayments,
    otherPeople,
    otherCommissions,
    cashCounts,
    history,
    audit: (audit.data ?? []) as Data["audit"],
    exchangeRate: num(rate?.value) || 36.6243,
    commissionReceipts: receipts,
    issuer: (issuer?.value as Data["issuer"]) ?? null,
  };
}

/** Ejecuta una operación con reglas (venta, cobro, anulación…). Lanza un Error con mensaje en español. */
export async function call<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabaseBrowser().rpc(fn, args);
  if (error) throw new Error(message(error));
  return data as T;
}

/** Crea o actualiza una fila de catálogo (producto, cliente, vendedor…). */
export async function save(table: string, values: Record<string, unknown>, id?: string): Promise<void> {
  const sb = supabaseBrowser();
  const { error } = id ? await sb.from(table).update(values).eq("id", id) : await sb.from(table).insert(values);
  if (error) throw new Error(message(error));
}

/** Crea una fila de catálogo y devuelve su id, para poder usarla de inmediato. */
export async function create(table: string, values: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabaseBrowser().from(table).insert(values).select("id").single();
  if (error || !data) throw new Error(message(error));
  return (data as { id: string }).id;
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabaseBrowser()
    .from("pt_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(message(error));
}

/** Portal del vendedor. Con `previewSeller`, el administrador ve el portal tal como lo vería ese vendedor. */
export async function loadPortal(previewSeller?: string): Promise<Portal> {
  return previewSeller
    ? call<Portal>("pt_seller_portal_preview", { p_seller: previewSeller })
    : call<Portal>("pt_seller_portal", {});
}

const FILE_BUCKET = "protecterra";
export const FILE_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

/** Dirección temporal (5 minutos) para abrir un archivo guardado en el almacén propio. */
export async function fileUrl(path: string): Promise<string> {
  const { data, error } = await supabaseBrowser().storage.from(FILE_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("No se pudo abrir el archivo. Intenta de nuevo.");
  return data.signedUrl;
}

/** Sube una factura, recibo o comprobante y lo deja ligado a su registro. El archivo anterior no se borra. */
export async function attachFile(table: string, id: string, column: string, file: File): Promise<void> {
  if (!FILE_ACCEPT.split(",").includes(file.type)) throw new Error("Solo se aceptan PDF o fotos (JPG, PNG).");
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo pesa más de 10 MB.");
  const safe =
    file.name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .slice(-80) || "archivo";
  const path = `${table}/${id}/${column}/${Date.now()}-${safe}`;
  const sb = supabaseBrowser();
  const up = await sb.storage.from(FILE_BUCKET).upload(path, file, { contentType: file.type });
  if (up.error) throw new Error("No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.");
  const { error } = await sb
    .from(table)
    .update({
      [column]: { filename: file.name, path, size: file.size, mime: file.type, uploaded_at: new Date().toISOString() },
    })
    .eq("id", id);
  if (error) throw new Error(message(error));
}

/** Recibo de comisiones visto desde su enlace privado (no requiere sesión). */
export async function loadReceipt(token: string): Promise<ReceiptDoc> {
  return call<ReceiptDoc>("pt_commission_receipt_public", { p_token: token });
}

export async function signReceipt(token: string, name: string, signature: Signature): Promise<ReceiptDoc> {
  return call<ReceiptDoc>("pt_sign_commission_receipt", { p_token: token, p_name: name, p_signature: signature });
}

/** Pide al servidor que envíe por correo el enlace de firma. Lanza un Error con el motivo si no se pudo. */
export async function emailReceipt(id: string): Promise<void> {
  const r = await fetch("/api/receipts/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || "No se pudo enviar el correo.");
  }
}
