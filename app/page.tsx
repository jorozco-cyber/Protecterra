import { redirect } from "next/navigation";
import { getAccess } from "@/lib/supabase/server";
import AdminApp from "@/components/admin/app";
import SellerApp from "@/components/seller/app";
import NoAccess from "@/components/no-access";

export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await getAccess();
  if (!access) redirect("/login");
  if (access.role === "admin") return <AdminApp email={access.email ?? ""} />;
  if (access.role === "vendedor") return <SellerApp email={access.email ?? ""} />;
  return <NoAccess email={access.email ?? ""} />;
}
