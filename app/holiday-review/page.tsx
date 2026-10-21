import { notFound } from "next/navigation";
import { ReviewContent } from "@/components/holiday-review-content";
import fixtures from "./fixtures.json";
export default async function Review({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  const { view } = await searchParams;
  if (view === "mobile") return <main style={{ display: "flex", gap: 24, padding: 20, flexWrap: "wrap" }}>{(["admin", "seller"] as const).map((v) => <div key={v}><h1>{v === "admin" ? "Administración · 390px" : "Vendedor · 390px"}</h1><iframe title={v} srcDoc={fixtures[v]} sandbox="allow-same-origin" width="390" height="1000" style={{ border: "1px solid #ccc", marginTop: 12 }} /></div>)}</main>;
  return <ReviewContent view={view} />;
}
