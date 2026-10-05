import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* Página de servidor: la renovación de sesión la hace proxy.ts. */
        }
      },
    },
  });
}

export type Access = { role: "admin" | "vendedor" | null; email: string | null };

/** Quién está conectado y qué puede ver. La base de datos decide el rol. */
export async function getAccess(): Promise<Access | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) return null;
  const { data } = await sb.rpc("pt_me");
  const role = data && (data.role === "admin" || data.role === "vendedor") ? data.role : null;
  return { role, email: user.email ?? null };
}
