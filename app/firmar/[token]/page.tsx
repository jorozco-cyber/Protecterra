import { redirect } from "next/navigation";
import { getAccess } from "@/lib/supabase/server";
import SignReceipt from "@/components/sign-receipt";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recibo de comisiones · ProtecTerra" };

/** El recibo solo se abre con sesión iniciada; sin sesión se pide entrar y luego se regresa aquí. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const safe = /^[a-f0-9]{32,80}$/.test(token) ? token : "";
  const access = await getAccess();
  if (!access) redirect(safe ? `/login?next=${encodeURIComponent(`/firmar/${safe}`)}` : "/login");
  return <SignReceipt token={token} email={access.email ?? ""} />;
}
