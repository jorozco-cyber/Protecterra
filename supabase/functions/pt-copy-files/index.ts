// Copia los archivos (facturas, recibos, comprobantes) que siguen en Knack al almacenamiento propio.
// Corre sola: avanza por tandas, se vuelve a llamar si le falta trabajo y termina cuando no queda nada.
// Solo responde a quien traiga la clave del trabajo; cuando la clave se borra, queda apagada.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "protecterra";
const BUDGET_MS = 100_000;
const PARALLEL = 5;
const MIME: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const url = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Item = { t: string; id: string; c: string; f: Record<string, unknown> };

const safe = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(-80) || "archivo";

function base64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

async function copyOne(token: string, it: Item): Promise<boolean> {
  const f = it.f;
  const mark = (patch: Record<string, unknown>) =>
    sb.rpc("pt_files_mark", { p_token: token, p_table: it.t, p_id: it.id, p_column: it.c, p_patch: patch });
  try {
    let res: Response | null = null;
    let last = "sin dirección de descarga";
    for (const u of [f.signed_url, f.url]) {
      if (typeof u !== "string" || !u) continue;
      const r = await fetch(u);
      if (r.ok) {
        res = r;
        break;
      }
      last = `Knack respondió ${r.status}`;
      await r.body?.cancel();
    }
    if (!res) throw new Error(last);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) throw new Error("archivo vacío");
    if (f.size && Number(f.size) !== bytes.length) {
      throw new Error(`tamaño distinto: esperado ${f.size}, recibido ${bytes.length}`);
    }
    const sha = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
    const filename = String(f.filename ?? "archivo");
    const ext = (filename.split(".").pop() ?? "").toLowerCase();
    const mime = MIME[ext] ?? "application/octet-stream";
    const path = `${it.t}/${it.id}/${it.c}/${f.id ?? "knack"}-${safe(filename)}`;
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: true });
    if (up.error) throw new Error(`no se pudo guardar: ${up.error.message}`);
    const done = await mark({
      path,
      mime,
      size: bytes.length,
      sha256: sha,
      checksum_ok: typeof f.checksum === "string" ? f.checksum === sha : null,
      copied_at: new Date().toISOString(),
    });
    if (done.error) throw new Error(done.error.message);
    return true;
  } catch (e) {
    await mark({
      copy_error: String((e as Error).message).slice(0, 200),
      copy_attempts: Number(f.copy_attempts ?? 0) + 1,
    });
    return false;
  }
}

async function run(token: string) {
  const start = Date.now();
  let ok = 0;
  let failed = 0;
  while (Date.now() - start < BUDGET_MS) {
    const { data, error } = await sb.rpc("pt_files_pending", { p_token: token, p_limit: PARALLEL * 2 });
    if (error) throw new Error(error.message);
    const items = (data ?? []) as Item[];
    if (items.length === 0) {
      console.log(`Terminado. Copiados en esta vuelta: ${ok}, con error: ${failed}`);
      return;
    }
    for (let i = 0; i < items.length; i += PARALLEL) {
      const results = await Promise.all(items.slice(i, i + PARALLEL).map((it) => copyOne(token, it)));
      for (const r of results) r ? ok++ : failed++;
    }
  }
  console.log(`Se acabó el tiempo de esta vuelta (copiados ${ok}, con error ${failed}). Sigue otra vuelta.`);
  await fetch(`${url}/functions/v1/pt-copy-files`, { method: "POST", headers: { "x-pt-token": token } });
}

Deno.serve(async (req: Request) => {
  const token = req.headers.get("x-pt-token") ?? "";
  const check = await sb.rpc("pt_files_pending", { p_token: token, p_limit: 0 });
  if (check.error) return new Response("No autorizado", { status: 401 });
  // @ts-ignore EdgeRuntime existe en el entorno de Supabase
  EdgeRuntime.waitUntil(run(token).catch((e) => console.error("Fallo la copia:", e)));
  return new Response(JSON.stringify({ started: true }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
});
