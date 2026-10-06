import { redirect } from "next/navigation";
import { getAccess, supabaseServer } from "@/lib/supabase/server";
import SignReceipt from "@/components/sign-receipt";
import type { ReceiptDoc } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recibo de comisiones · ProtecTerra" };

/**
 * El recibo solo se abre con sesión iniciada. Sin sesión se pide entrar y luego se regresa aquí.
 * Si la cuenta conectada no es la del vendedor del recibo (ni el administrador), no se muestra nada:
 * se le lleva a su propia pantalla de inicio, igual que si el enlace no existiera.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[a-f0-9]{32,80}$/.test(token);
  const access = await getAccess();
  if (!access) redirect(valid ? `/login?next=${encodeURIComponent(`/firmar/${token}`)}` : "/login");
  if (!valid) redirect("/");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("pt_commission_receipt_public", { p_token: token });
  if (error || !data) redirect("/");
  return <SignReceipt token={token} email={access.email ?? ""} initial={data as ReceiptDoc} />;
}
