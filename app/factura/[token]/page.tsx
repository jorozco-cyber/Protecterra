import { supabaseServer } from "@/lib/supabase/server";
import SignInvoice from "@/components/sign-invoice";
import type { InvoiceSignatureDoc } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Factura para firmar" };

/**
 * Enlace que recibe el cliente para firmar su factura. No pide cuenta: el enlace largo y privado es la llave.
 * La factura puede ser de ProtecTerra o de Importagro; se busca en las dos.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let problem = "Este enlace no es válido. Pida uno nuevo a quien se lo envió.";
  if (/^[a-f0-9]{32,80}$/.test(token)) {
    const sb = await supabaseServer();
    for (const prefix of ["pt_", "ia_"] as const) {
      const { data, error } = await sb.rpc(prefix + "invoice_signature_public", { p_token: token });
      if (!error && data) return <SignInvoice prefix={prefix} initial={data as InvoiceSignatureDoc} />;
      // Si la factura sí existe pero el enlace venció o se anuló, se dice eso.
      if (error?.code === "P0001" && error.message && !error.message.startsWith("Este enlace ya no está disponible"))
        problem = error.message;
    }
  }
  return (
    <div className="seller">
      <header className="seller-head">
        <h1>Factura para firmar</h1>
      </header>
      <main className="seller-main">
        <p className="note danger" role="alert">
          {problem}
        </p>
      </main>
    </div>
  );
}
