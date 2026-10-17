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
const COMPANY = { pt_: { name: "ProtecTerra", currency: "C$" }, ia_: { name: "Importagro", currency: "US$" } } as const;

/** Envía al cliente el correo con el enlace para firmar su factura. Solo el administrador. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Origen no permitido.", 403);
  const access = await getAccess();
  if (access?.role !== "admin") return fail("No autorizado.", 403);
  const key = process.env.RESEND_API_KEY;
  if (!key) return fail("El envío por correo todavía no está configurado. Mientras tanto, comparte el enlace.", 503);

  try {
    const body = (await req.json()) as { id?: string; prefix?: string };
    const prefix = body.prefix === "ia_" ? "ia_" : "pt_";
    const co = COMPANY[prefix];
    const sb = await supabaseServer();
    const { data: s } = await sb
      .from(prefix + "invoice_signatures")
      .select("id, token, status, expires_at, invoice_number, customer_name, total, sale_id")
      .eq("id", String(body.id || ""))
      .maybeSingle();
    if (!s) return fail("Enlace no encontrado.", 404);
    if (s.status !== "enviado" || new Date(s.expires_at).getTime() < Date.now())
      return fail("Este enlace ya no está pendiente de firma.", 400);
    const { data: sale } = await sb.from(prefix + "sales").select("customer_id").eq("id", s.sale_id).maybeSingle();
    const { data: customer } = sale
      ? await sb.from(prefix + "customers").select("email").eq("id", sale.customer_id).maybeSingle()
      : { data: null };
    const to = String(customer?.email || "").trim();
    if (!to) return fail("El cliente no tiene correo registrado. Agrégalo en Clientes o comparte el enlace.", 400);

    const link = new URL(`/factura/${s.token}`, req.headers.get("origin")!).href;
    const n = s.invoice_number ?? "s/n";
    const total = `${co.currency} ${Number(s.total).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
    const until = new Intl.DateTimeFormat("es-NI", { timeZone: "America/Managua", dateStyle: "long" }).format(
      new Date(s.expires_at),
    );
    // Mismo remitente configurado, con el nombre de la empresa de la factura.
    const configured = process.env.RESEND_FROM || "avisos@protecterra.app";
    const address = /<([^>]+)>/.exec(configured)?.[1] ?? configured;
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${co.name} <${address}>`,
        to: [to],
        reply_to: access.email || undefined,
        subject: `Factura N.º ${n} de ${co.name} para firmar`,
        text:
          `Estimado(a) ${s.customer_name}:\n\nLe enviamos la factura N.º ${n} por ${total} para su firma. ` +
          `Ábrala en este enlace, revísela y firme desde su teléfono o computadora:\n${link}\n\n` +
          `El enlace vence el ${until}.\n\n${co.name}`,
        html:
          `<div style="font-family:Arial,sans-serif;font-size:15px;color:#18231d;line-height:1.5">` +
          `<p>Estimado(a) ${esc(s.customer_name)}:</p>` +
          `<p>Le enviamos la factura <strong>N.º ${esc(String(n))}</strong> por <strong>${total}</strong> para su firma. ` +
          `Revísela y firme desde su teléfono o computadora; solo necesita su nombre y su número de cédula.</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#1f4d3a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px">Revisar y firmar</a></p>` +
          `<p style="font-size:13px;color:#5c6b61">El enlace vence el ${esc(until)}. Si el botón no abre, copie este enlace en su navegador:<br>${link}</p>` +
          `<p>${co.name}</p></div>`,
      }),
    });
    if (!send.ok) {
      console.error("Resend:", send.status, await send.text());
      return fail("El servicio de correo rechazó el envío. Comparte el enlace por WhatsApp mientras lo revisamos.", 502);
    }
    await sb.from(prefix + "invoice_signatures").update({ email_sent_at: new Date().toISOString() }).eq("id", s.id);
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    console.error(e);
    return fail("No se pudo enviar el correo. Intenta de nuevo.", 503);
  }
}
