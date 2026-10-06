import { getAccess, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function sameOrigin(req: Request) {
  try {
    return new URL(req.headers.get("origin") || "").host === req.headers.get("host");
  } catch {
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Avisa por correo al administrador que un recibo quedó firmado. Lo llama la página de firma justo después de firmar.
 * La base de datos solo entrega el aviso una vez por recibo y solo a quien puede ver ese recibo.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ ok: false }, { status: 403, headers });
  if (!(await getAccess())) return Response.json({ ok: false }, { status: 401, headers });
  const key = process.env.RESEND_API_KEY;
  if (!key) return Response.json({ ok: false }, { headers });
  try {
    const { token } = (await req.json()) as { token?: string };
    const sb = await supabaseServer();
    const { data } = await sb.rpc("pt_receipt_signed_notice", { p_token: String(token || "") });
    const admins = Array.isArray(data?.admins) ? (data.admins as unknown[]).filter((e) => typeof e === "string") : [];
    if (!data || admins.length === 0) return Response.json({ ok: true }, { headers });

    const n = String(data.number).padStart(4, "0");
    const amount = "C$ " + Number(data.total_commission).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const link = new URL("/#comisiones", req.headers.get("origin")!).href;
    const who = String(data.signer_name || data.seller_name);
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "ProtecTerra <avisos@protecterra.app>",
        to: admins,
        subject: `${who} firmó el recibo de comisiones N.º ${n} (${amount})`,
        text: `${who} firmó el recibo de comisiones N.º ${n} por ${amount} (${data.invoices} facturas). Ya puedes registrar el pago en Comisiones: ${link}\n\nProtecTerra`,
        html:
          `<div style="font-family:Arial,sans-serif;font-size:15px;color:#18231d;line-height:1.5">` +
          `<p><strong>${esc(who)}</strong> firmó el recibo de comisiones <strong>N.º ${n}</strong> por <strong>${amount}</strong> (${Number(data.invoices)} facturas).</p>` +
          `<p>Ya puedes registrar el pago desde Comisiones, en la sección Recibos de comisión.</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#1f4d3a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Abrir Comisiones</a></p>` +
          `<p>ProtecTerra</p></div>`,
      }),
    });
    if (!send.ok) console.error("Resend aviso de firma:", send.status, await send.text());
    return Response.json({ ok: send.ok }, { headers });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false }, { headers });
  }
}
