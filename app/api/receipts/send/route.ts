import { getAccess, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

function sameOrigin(req: Request) {
  try {
    return new URL(req.headers.get("origin") || "").host === req.headers.get("host");
  } catch {
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Envía al vendedor el correo con el enlace para firmar su recibo de comisiones. Solo el administrador. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origen no permitido.", 403);
  const access = await getAccess();
  if (access?.role !== "admin") return fail("No autorizado.", 403);
  const key = process.env.RESEND_API_KEY;
  if (!key) return fail("El envío por correo todavía no está configurado. Mientras tanto, comparte el enlace.", 503);

  try {
    const { id } = (await req.json()) as { id?: string };
    const sb = await supabaseServer();
    const { data: r } = await sb
      .from("pt_commission_receipts")
      .select("id, number, token, status, total_commission, seller_id, seller_name")
      .eq("id", String(id || ""))
      .maybeSingle();
    if (!r) return fail("Recibo no encontrado.", 404);
    if (r.status !== "enviado") return fail("Este recibo ya no está pendiente de firma.", 400);
    const { data: seller } = await sb.from("pt_sellers").select("email").eq("id", r.seller_id).maybeSingle();
    if (!seller?.email) return fail("El vendedor no tiene correo registrado. Agrégalo en Editar vendedor.", 400);

    const link = new URL(`/firmar/${r.token}`, req.headers.get("origin")!).href;
    const n = String(r.number).padStart(4, "0");
    const amount = "C$ " + Number(r.total_commission).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "ProtecTerra <avisos@protecterra.app>",
        to: [seller.email],
        reply_to: access.email || undefined,
        subject: `Recibo de comisiones N.º ${n} para firmar`,
        text: `Hola ${r.seller_name}:\n\nTu recibo de comisiones N.º ${n} por ${amount} está listo. Revísalo y fírmalo en este enlace (te pedirá entrar con tu correo y contraseña del portal):\n${link}\n\nProtecTerra`,
        html:
          `<div style="font-family:Arial,sans-serif;font-size:15px;color:#18231d;line-height:1.5">` +
          `<p>Hola ${esc(r.seller_name)}:</p>` +
          `<p>Tu recibo de comisiones <strong>N.º ${n}</strong> por <strong>${amount}</strong> está listo. Revisa el detalle y fírmalo desde tu teléfono o computadora. Te pedirá entrar con tu correo y contraseña del portal.</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#1f4d3a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Revisar y firmar</a></p>` +
          `<p style="font-size:13px;color:#5c6b61">Si el botón no abre, copia este enlace en tu navegador:<br>${link}</p>` +
          `<p>ProtecTerra</p></div>`,
      }),
    });
    if (!send.ok) {
      console.error("Resend:", send.status, await send.text());
      return fail("El servicio de correo rechazó el envío. Comparte el enlace mientras lo revisamos.", 502);
    }
    await sb.from("pt_commission_receipts").update({ email_sent_at: new Date().toISOString() }).eq("id", r.id);
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    console.error(e);
    return fail("No se pudo enviar el correo. Intenta de nuevo.", 503);
  }
}
