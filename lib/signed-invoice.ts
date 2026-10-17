"use client";
// Copia firmada de una factura: cada página de la factura original tal como se ve, con la firma del
// cliente puesta en el campo que se marcó, más una hoja final con la constancia de la firma.
import { textWidth } from "./pdf";
import { date, dateTime } from "./format";
import type { PageImage } from "./pdfjs";
import type { InvoiceSignatureDoc, Signature, SignatureSpot } from "./types";

const nf2 = new Intl.NumberFormat("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function amount(v: number, currency: string): string {
  return currency + " " + nf2.format(Number(v) || 0);
}

export function invoiceLabel(n: number | null): string {
  return n == null ? "s/n" : String(n);
}

/** Lo que el cliente declara al firmar. Sale igual en la página de firma y en la constancia. */
export function invoiceStatement(doc: Pick<InvoiceSignatureDoc, "invoice_number" | "kind" | "due_date" | "total" | "currency">): string {
  const base = `Recibí conforme la mercadería detallada en la factura N.º ${invoiceLabel(doc.invoice_number)}`;
  if (doc.kind !== "credito") return base + ".";
  const when = doc.due_date ? `a más tardar el ${date(doc.due_date)}` : "en el plazo acordado";
  return `${base} y me comprometo a pagar ${amount(doc.total, doc.currency)} ${when}.`;
}

/** Lugar de firma inicial cuando todavía no se ha marcado ninguno: abajo a la derecha de la última página. */
export function defaultSpot(pages: number): SignatureSpot {
  return { page: Math.max(1, pages), x: 0.55, y: 0.8, w: 0.36, h: 0.08 };
}

/** Asegura que el recuadro quede dentro de la hoja y en una página que existe. */
export function fitSpot(s: SignatureSpot, pages: number): SignatureSpot {
  const w = Math.min(0.9, Math.max(0.12, s.w));
  const h = Math.min(0.3, Math.max(0.03, s.h));
  return {
    page: Math.min(Math.max(1, Math.round(s.page)), Math.max(1, pages)),
    w: round(w),
    h: round(h),
    x: round(Math.min(1 - w, Math.max(0, s.x))),
    y: round(Math.min(1 - h, Math.max(0, s.y))),
  };
}

const round = (v: number) => Math.round(v * 10000) / 10000;

/** Texto corto que acompaña la firma dentro del campo. */
export function signatureCaption(name: string, id: string, signedAt: string): string {
  return `${name} · Céd. ${id} · ${dateTime(signedAt)}`;
}

/** Dibuja la firma (y su texto) sobre la imagen de una página, para verla en pantalla. */
export function drawSignatureOnCanvas(
  canvas: HTMLCanvasElement,
  spot: SignatureSpot,
  signature: Signature,
  caption: string,
): void {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const box = { x: spot.x * W, y: spot.y * H, w: spot.w * W, h: spot.h * H };
  const { area, k, ox, oy } = signatureFit(box, signature);
  ctx.save();
  ctx.strokeStyle = "rgb(13,38,110)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, 3 * k);
  for (const st of signature.strokes) {
    ctx.beginPath();
    ctx.moveTo(ox + st[0] * k, oy + st[1] * k);
    if (st.length < 4) ctx.lineTo(ox + st[0] * k + 0.5, oy + st[1] * k);
    for (let i = 2; i + 1 < st.length; i += 2) ctx.lineTo(ox + st[i] * k, oy + st[i + 1] * k);
    ctx.stroke();
  }
  const size = captionSize(box.w, area.captionH, caption, (s, f) => {
    ctx.font = `${f}px Helvetica, Arial, sans-serif`;
    return ctx.measureText(s).width;
  });
  ctx.fillStyle = "rgb(40,40,40)";
  ctx.font = `${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(caption, box.x + box.w / 2, box.y + box.h);
  ctx.restore();
}

type Box = { x: number; y: number; w: number; h: number };

/** La firma ocupa la parte de arriba del campo, apoyada abajo como sobre una línea; el texto va debajo. */
function signatureFit(box: Box, sig: Signature) {
  const captionH = box.h * 0.26;
  const area = { x: box.x, y: box.y, w: box.w, h: box.h - captionH, captionH };
  const k = Math.min(area.w / sig.w, area.h / sig.h);
  const ox = area.x + (area.w - sig.w * k) / 2;
  const oy = area.y + area.h - sig.h * k;
  return { area, k, ox, oy };
}

function captionSize(maxW: number, maxH: number, text: string, measure: (s: string, size: number) => number): number {
  let size = Math.max(4, Math.min(maxH * 0.85, 9));
  while (size > 4 && measure(text, size) > maxW * 0.98) size -= 0.25;
  return size;
}

export type SignedInvoiceInput = {
  doc: InvoiceSignatureDoc;
  pages: PageImage[];
  /** Huella del archivo original, para que la constancia lo identifique sin duda. */
  sha256?: string;
  ip?: string | null;
  agent?: string | null;
};

/** Arma el PDF firmado. Solo se llama después de la firma. */
export async function signedInvoicePdf(input: SignedInvoiceInput): Promise<Uint8Array> {
  const { doc, pages } = input;
  if (!doc.signature || !doc.signed_at || !doc.signer_name || !doc.signer_id) throw new Error("La factura no está firmada.");
  const w = new PdfWriter();
  const caption = signatureCaption(doc.signer_name, doc.signer_id, doc.signed_at);
  const spot = fitSpot(doc.placement, pages.length);

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const jpeg = await canvasJpeg(p.canvas);
    const img = w.image(jpeg, p.canvas.width, p.canvas.height);
    let content = `q ${n(p.width)} 0 0 ${n(p.height)} 0 0 cm /Im Do Q\n`;
    if (i + 1 === spot.page) {
      const box = { x: spot.x * p.width, y: spot.y * p.height, w: spot.w * p.width, h: spot.h * p.height };
      content += signatureOps(box, p.height, doc.signature, caption);
    }
    w.page(p.width, p.height, content, { Im: img });
  }

  w.page(612, 792, proofPage(input, caption), {});
  return w.finish();
}

/** Trazos de la firma en coordenadas de PDF (que cuentan desde abajo de la hoja). */
function signatureOps(box: Box, pageH: number, sig: Signature, caption: string): string {
  const { area, k, ox, oy } = signatureFit(box, sig);
  let out = `q 0.05 0.15 0.43 RG 1 J 1 j ${n(Math.max(0.6, 3 * k))} w\n`;
  for (const st of sig.strokes) {
    const X = (v: number) => n(ox + v * k);
    const Y = (v: number) => n(pageH - (oy + v * k));
    out += `${X(st[0])} ${Y(st[1])} m `;
    if (st.length < 4) out += `${n(ox + st[0] * k + 0.3)} ${Y(st[1])} l `;
    for (let i = 2; i + 1 < st.length; i += 2) out += `${X(st[i])} ${Y(st[i + 1])} l `;
    out += "S\n";
  }
  out += "Q\n";
  const size = captionSize(box.w, area.captionH, caption, (s, f) => textWidth(s, f));
  const tw = textWidth(caption, size);
  out += text(box.x + (box.w - tw) / 2, pageH - (box.y + box.h) + size * 0.25, size, caption, false, "0.16 0.16 0.16");
  return out;
}

/** Hoja final: quién firmó, cuándo, desde dónde y qué declaró. */
function proofPage(input: SignedInvoiceInput, caption: string): string {
  const { doc } = input;
  const H = 792;
  let y = 60;
  let out = "";
  const line = (s: string, size = 10, bold = false, color = "0.09 0.14 0.11") => {
    out += text(56, H - y, size, s, bold, color);
    y += size + 7;
  };
  const wrap = (s: string, size = 10) => {
    for (const l of wrapLines(s, size, 500)) line(l, size);
  };
  line(`${doc.company}`, 12, true, "0.12 0.30 0.23");
  y += 6;
  line("Constancia de firma electrónica de factura", 16, true);
  y += 8;
  const rows: [string, string][] = [
    ["Factura", `N.º ${invoiceLabel(doc.invoice_number)} del ${date(doc.sale_date)}`],
    ["Cliente", doc.customer_name],
    ["Tipo", doc.kind === "credito" ? "Crédito" : "Contado"],
    ["Total", amount(doc.total, doc.currency)],
  ];
  if (doc.kind === "credito") rows.push(["Fecha prevista de pago", doc.due_date ? date(doc.due_date) : "—"]);
  rows.push(
    ["Firmado por", doc.signer_name ?? ""],
    ["Cédula", doc.signer_id ?? ""],
    ["Fecha y hora", `${dateTime(doc.signed_at)} (hora de Nicaragua)`],
  );
  if (input.ip) rows.push(["Dirección de internet", input.ip]);
  if (input.agent) rows.push(["Dispositivo", input.agent.slice(0, 110)]);
  for (const [k, v] of rows) {
    out += text(56, H - y, 10, k, true, "0.36 0.42 0.38");
    const lines = wrapLines(v, 10, 360);
    lines.forEach((l, i) => (out += text(196, H - y - i * 14, 10, l, false, "0.09 0.14 0.11")));
    y += 14 * lines.length + 4;
  }
  y += 10;
  line("Declaración del firmante", 11, true);
  wrap(invoiceStatement(doc));
  y += 6;
  wrap(
    "La firma se hizo a mano en la pantalla del dispositivo del firmante, desde un enlace privado enviado por " +
      `${doc.company}. En las páginas anteriores la firma aparece en el campo de firma de la factura original, sin otros cambios.`,
    9,
  );
  if (input.sha256) {
    y += 6;
    line("Huella del archivo original de la factura (SHA-256):", 9, true);
    line(input.sha256, 8, false, "0.36 0.42 0.38");
  }
  // La firma, de nuevo, en grande.
  if (doc.signature) {
    y += 14;
    const box = { x: 56, y, w: 260, h: 90 };
    out += `q 0.82 0.85 0.82 RG 0.6 w ${n(box.x)} ${n(H - box.y - box.h)} ${n(box.w)} ${n(box.h)} re S Q\n`;
    out += signatureOps(box, H, doc.signature, caption);
  }
  return out;
}

function wrapLines(s: string, size: number, max: number): string[] {
  const out: string[] = [];
  let lineText = "";
  for (const word of s.split(/\s+/)) {
    const next = lineText ? lineText + " " + word : word;
    if (textWidth(next, size) <= max || !lineText) lineText = next;
    else {
      out.push(lineText);
      lineText = word;
    }
  }
  out.push(lineText);
  return out;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

function enc(s: string): string {
  let out = "";
  for (const c of s.normalize("NFC")) {
    const code = c === "·" ? 183 : c.charCodeAt(0);
    if (code > 255) out += "?";
    else if (code > 126 || code < 32) out += "\\" + code.toString(8).padStart(3, "0");
    else if ("\\()".includes(c)) out += "\\" + c;
    else out += c;
  }
  return out;
}

function text(x: number, y: number, size: number, s: string, bold: boolean, color: string): string {
  return `BT ${color} rg /${bold ? "F2" : "F1"} ${n(size)} Tf ${n(x)} ${n(y)} Td (${enc(s)}) Tj ET\n`;
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? b.arrayBuffer().then((a) => resolve(new Uint8Array(a)), reject) : reject(new Error("Sin imagen"))),
      "image/jpeg",
      0.82,
    ),
  );
}

/** Huella SHA-256 en hexadecimal. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Escritor mínimo de PDF: páginas de cualquier tamaño, fotos JPEG, trazos y texto Helvetica. */
class PdfWriter {
  private objects: (Uint8Array | string)[] = [];
  private pages: number[] = [];
  private readonly te = new TextEncoder();

  constructor() {
    this.objects.push("<< /Type /Catalog /Pages 2 0 R >>"); // 1
    this.objects.push(""); // 2: la lista de páginas se completa al final
    this.objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
    this.objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"); // 4
  }

  private add(obj: Uint8Array | string): number {
    this.objects.push(obj);
    return this.objects.length;
  }

  private stream(dict: string, data: Uint8Array): Uint8Array {
    return concat([this.te.encode(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, this.te.encode("\nendstream")]);
  }

  image(jpeg: Uint8Array, width: number, height: number): number {
    return this.add(
      this.stream(
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
        jpeg,
      ),
    );
  }

  page(width: number, height: number, content: string, images: Record<string, number>): void {
    const contents = this.add(this.stream("", this.te.encode(content)));
    const xo = Object.entries(images)
      .map(([k, v]) => `/${k} ${v} 0 R`)
      .join(" ");
    this.pages.push(
      this.add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> /Contents ${contents} 0 R >>`,
      ),
    );
  }

  finish(): Uint8Array {
    this.objects[1] = `<< /Type /Pages /Kids [${this.pages.map((p) => `${p} 0 R`).join(" ")}] /Count ${this.pages.length} >>`;
    // El encabezado lleva bytes binarios para que los programas traten el archivo como binario.
    const parts: Uint8Array[] = [
      concat([this.te.encode("%PDF-1.4\n%"), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), this.te.encode("\n")]),
    ];
    let offset = parts[0].length;
    const offsets: number[] = [];
    this.objects.forEach((obj, i) => {
      offsets.push(offset);
      const body = typeof obj === "string" ? this.te.encode(obj) : obj;
      const chunk = concat([this.te.encode(`${i + 1} 0 obj\n`), body, this.te.encode("\nendobj\n")]);
      parts.push(chunk);
      offset += chunk.length;
    });
    const xref =
      `xref\n0 ${this.objects.length + 1}\n0000000000 65535 f \n` +
      offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
      `trailer\n<< /Size ${this.objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    parts.push(this.te.encode(xref));
    return concat(parts);
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
