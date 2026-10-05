import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function sameOrigin(req: Request) {
  try {
    return new URL(req.headers.get("origin") || "").host === req.headers.get("host");
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Origen no permitido." }, { status: 403, headers });
  try {
    const body = await req.json();
    const sb = await supabaseServer();
    if (body.action === "logout") {
      await sb.auth.signOut();
      return Response.json({ ok: true }, { headers });
    }
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    if (!email.includes("@")) return Response.json({ error: "Escribe tu correo." }, { status: 400, headers });
    if (!password || password.length > 128)
      return Response.json({ error: "Escribe tu contraseña." }, { status: 400, headers });

    if (body.action === "register") {
      if (password.length < 12)
        return Response.json({ error: "Usa una contraseña de al menos 12 caracteres." }, { status: 400, headers });
      const { error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: new URL("/auth/callback", req.headers.get("origin")!).href },
      });
      if (error) {
        console.error("Registro:", error.code);
        return Response.json(
          { error: "No se pudo crear el acceso. Si ya tienes cuenta, inicia sesión." },
          { status: 400, headers },
        );
      }
      return Response.json(
        { message: "Revisa tu correo y confirma tu cuenta. Después regresa aquí e inicia sesión." },
        { headers },
      );
    }

    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      return Response.json(
        { error: "Revisa tu correo y contraseña. La cuenta debe tener el correo confirmado." },
        { status: 401, headers },
      );
    }
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "No se pudo completar el acceso. Intenta de nuevo." }, { status: 503, headers });
  }
}
