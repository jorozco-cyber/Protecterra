import SignReceipt from "@/components/sign-receipt";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recibo de comisiones · ProtecTerra" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignReceipt token={token} />;
}
