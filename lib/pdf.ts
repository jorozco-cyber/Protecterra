import { widths } from "./pdf-metrics";
import { LOGO_H, LOGO_ICON_RECT, LOGO_ICON_STROKES, LOGO_ICON_STROKE_WIDTH, LOGO_W, LOGO_WORD } from "./logo-paths";

/**
 * Generador de PDF sin dependencias (PDF 1.4, tamaño carta, letra Helvetica).
 * Solo dibuja texto, líneas, rectángulos y el logo vectorial.
 */
type Font = "regular" | "bold";
export type Color = [number, number, number];

export const INK: Color = [0.09, 0.14, 0.11];
export const MUTED: Color = [0.36, 0.42, 0.38];
export const BRAND: Color = [0.122, 0.302, 0.227];
export const BRAND_LIGHT: Color = [0.13, 0.545, 0.373];
export const SOFT: Color = [0.93, 0.95, 0.93];
export const RULE: Color = [0.82, 0.85, 0.82];
export const DANGER: Color = [0.64, 0.15, 0.11];

const PAGE_W = 612;
const PAGE_H = 792;
export const MARGIN = 40;
const BOTTOM = 58;

function clean(s: string): string {
  return Array.from(
    s
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/ /g, " ")
      .replace(/[\x00-\x1f\x7f]/g, " ")
      .normalize("NFC"),
  )
    .map((c) => (c.charCodeAt(0) > 255 ? "?" : c))
    .join("");
}

function encoded(s: string): string {
  let out = "";
  for (const c of clean(s)) {
    const n = c.charCodeAt(0);
    if (n > 126 || n < 32) out += "\\" + n.toString(8).padStart(3, "0");
    else if ("\\()".includes(c)) out += "\\" + c;
    else out += c;
  }
  return out;
}

export function textWidth(s: string, size: number, font: Font = "regular"): number {
  const table = widths[font] as Record<string, number>;
  let sum = 0;
  for (const c of clean(s)) sum += table[String(c.charCodeAt(0))] || 556;
  return (sum * size) / 1000;
}

export function wrapText(s: string, size: number, max: number, font: Font = "regular"): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of clean(s).split(/\s+/)) {
    const candidate = line ? line + " " + word : word;
    if (textWidth(candidate, size, font) <= max) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let part = "";
    for (const c of word) {
      if (part && textWidth(part + c, size, font) > max) {
        lines.push(part);
        part = "";
      }
      part += c;
    }
    line = part;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

export type Column = { header: string; width: number; align?: "left" | "right" };
export type Row = {
  cells: string[];
  /** normal: fila de datos · group: encabezado de grupo · sub: detalle sangrado · total: fila de totales */
  kind?: "normal" | "group" | "sub" | "subtotal" | "total";
  /** Índices de celdas que van en rojo (por ejemplo, días de atraso). */
  alert?: number[];
};

export type PdfDoc = {
  /** Posición vertical actual, medida desde abajo de la página. */
  y: number;
  space(points: number): void;
  ensure(height: number): void;
  heading(text: string): void;
  paragraph(text: string, size?: number, color?: Color): void;
  stats(items: { label: string; value: string }[]): void;
  table(columns: Column[], rows: Row[]): void;
  /** Bloques de firma lado a lado: la firma dibujada sobre una línea, con leyenda y nombre debajo. */
  signatures(blocks: SignatureBlock[]): void;
};

export type SignatureBlock = {
  caption: string;
  name: string;
  note?: string;
  signature: { w: number; h: number; strokes: number[][] } | null;
};

/** Convierte un trazo SVG (solo M, L, C, Z con coordenadas absolutas) a operadores PDF. */
function svgPath(d: string, scale: number, left: number, top: number): string {
  const out: string[] = [];
  const re = /([MLCZ])([^MLCZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const n = m[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    const pts: string[] = [];
    for (let i = 0; i + 1 < n.length; i += 2)
      pts.push(`${(left + n[i] * scale).toFixed(2)} ${(top - n[i + 1] * scale).toFixed(2)}`);
    if (m[1] === "M") out.push(`${pts[0]} m`);
    else if (m[1] === "L") out.push(`${pts[0]} l`);
    else if (m[1] === "C") out.push(`${pts.join(" ")} c`);
    else out.push("h");
  }
  return out.join(" ");
}

export function createPdf(
  options: { title: string; subtitle: string; footer: string },
  build: (doc: PdfDoc) => void,
): Uint8Array {
  const streams: string[][] = [];
  let ops: string[] = [];
  const L = MARGIN;
  const R = PAGE_W - MARGIN;
  const W = R - L;
  const rgb = (c: Color) => c.map((v) => v.toFixed(3)).join(" ");
  const add = (command: string) => ops.push(command);

  function text(value: string, x: number, baseline: number, size = 9, font: Font = "regular", fill: Color = INK) {
    add(
      `BT /${font === "bold" ? "F2" : "F1"} ${size} Tf ${rgb(fill)} rg 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm (${encoded(value)}) Tj ET`,
    );
  }
  function rect(x: number, bottom: number, w: number, h: number, fill: Color) {
    add(`${rgb(fill)} rg ${x.toFixed(2)} ${bottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  function rule(x: number, at: number, w: number, color: Color = RULE, weight = 0.6) {
    add(`${rgb(color)} RG ${weight} w ${x.toFixed(2)} ${at.toFixed(2)} m ${(x + w).toFixed(2)} ${at.toFixed(2)} l S`);
  }
  function logo(left: number, top: number, width: number) {
    const s = width / LOGO_W;
    add(`${rgb(BRAND_LIGHT)} rg ${svgPath(LOGO_WORD, s, left, top - 14 * s)} f*`);
    const r = LOGO_ICON_RECT;
    // Rectángulo redondeado del puño, como trazo.
    const x0 = left + r.x * s;
    const x1 = left + (r.x + r.w) * s;
    const yT = top - r.y * s;
    const yB = top - (r.y + r.h) * s;
    const k = r.r * s;
    const c = k * 0.4477;
    const cuff =
      `${(x0 + k).toFixed(2)} ${yT.toFixed(2)} m ${(x1 - k).toFixed(2)} ${yT.toFixed(2)} l ` +
      `${(x1 - c).toFixed(2)} ${yT.toFixed(2)} ${x1.toFixed(2)} ${(yT - c).toFixed(2)} ${x1.toFixed(2)} ${(yT - k).toFixed(2)} c ` +
      `${x1.toFixed(2)} ${(yB + k).toFixed(2)} l ` +
      `${x1.toFixed(2)} ${(yB + c).toFixed(2)} ${(x1 - c).toFixed(2)} ${yB.toFixed(2)} ${(x1 - k).toFixed(2)} ${yB.toFixed(2)} c ` +
      `${(x0 + k).toFixed(2)} ${yB.toFixed(2)} l ` +
      `${(x0 + c).toFixed(2)} ${yB.toFixed(2)} ${x0.toFixed(2)} ${(yB + c).toFixed(2)} ${x0.toFixed(2)} ${(yB + k).toFixed(2)} c ` +
      `${x0.toFixed(2)} ${(yT - k).toFixed(2)} l ` +
      `${x0.toFixed(2)} ${(yT - c).toFixed(2)} ${(x0 + c).toFixed(2)} ${yT.toFixed(2)} ${(x0 + k).toFixed(2)} ${yT.toFixed(2)} c h`;
    add(
      `q ${rgb(BRAND_LIGHT)} RG ${(LOGO_ICON_STROKE_WIDTH * s).toFixed(2)} w 1 J 1 j ${cuff} S ${svgPath(LOGO_ICON_STROKES, s, left, top)} S Q`,
    );
  }

  const doc: PdfDoc = {
    y: 0,
    space(points) {
      doc.y -= points;
    },
    ensure(height) {
      if (doc.y - height < BOTTOM) newPage();
    },
    heading(value) {
      doc.ensure(40);
      doc.y -= 14;
      text(value.toUpperCase(), L, doc.y, 9, "bold", BRAND);
      doc.y -= 6;
      rule(L, doc.y, W, BRAND, 0.9);
      doc.y -= 4;
    },
    paragraph(value, size = 9, color = MUTED) {
      for (const line of wrapText(value, size, W)) {
        doc.ensure(size + 4);
        doc.y -= size + 3;
        text(line, L, doc.y, size, "regular", color);
      }
    },
    stats(items) {
      const gap = 8;
      const w = (W - gap * (items.length - 1)) / items.length;
      const h = 42;
      doc.ensure(h + 8);
      doc.y -= h + 4;
      items.forEach((item, i) => {
        const x = L + i * (w + gap);
        rect(x, doc.y, w, h, SOFT);
        rect(x, doc.y, 2.5, h, BRAND);
        text(item.label, x + 10, doc.y + h - 15, 7.5, "regular", MUTED);
        let size = 12;
        while (size > 8 && textWidth(item.value, size, "bold") > w - 18) size -= 0.5;
        text(item.value, x + 10, doc.y + 10, size, "bold", INK);
      });
      doc.y -= 4;
    },
    table(columns, rows) {
      const scale = W / columns.reduce((a, c) => a + c.width, 0);
      const cw = columns.map((c) => c.width * scale);
      const cx: number[] = [];
      cw.reduce((x, w, i) => ((cx[i] = x), x + w), L);
      const pad = 5;
      const size = 8.2;
      const header = () => {
        doc.y -= 18;
        rect(L, doc.y, W, 18, BRAND);
        columns.forEach((c, i) => {
          const tw = textWidth(c.header, 7.5, "bold");
          text(
            c.header,
            c.align === "right" ? cx[i] + cw[i] - pad - tw : cx[i] + pad,
            doc.y + 6,
            7.5,
            "bold",
            [1, 1, 1],
          );
        });
      };
      doc.ensure(18 + 30);
      header();
      for (const row of rows) {
        const kind = row.kind ?? "normal";
        const bold: Font = kind === "group" || kind === "total" || kind === "subtotal" ? "bold" : "regular";
        const indent = kind === "sub" ? 12 : 0;
        const fontSize = kind === "sub" ? 7.6 : size;
        const lines = row.cells.map((cell, i) =>
          columns[i].align === "right"
            ? [cell]
            : wrapText(cell, fontSize, cw[i] - pad * 2 - (i === 0 ? indent : 0), bold),
        );
        const count = Math.max(1, ...lines.map((l) => l.length));
        const h = count * (fontSize + 2.6) + (kind === "total" ? 9 : 6.5);
        if (doc.y - h < BOTTOM) {
          newPage();
          header();
        }
        doc.y -= h;
        if (kind === "total") rect(L, doc.y, W, h, SOFT);
        if (kind === "group") rect(L, doc.y, W, h, [0.965, 0.972, 0.962]);
        row.cells.forEach((_, i) => {
          const color = row.alert?.includes(i) ? DANGER : kind === "sub" ? MUTED : INK;
          lines[i].forEach((value, n) => {
            const baseline = doc.y + h - (kind === "total" ? 5 : 3.5) - (n + 1) * (fontSize + 2.6) + 2.6;
            const tw = textWidth(value, fontSize, bold);
            const x = columns[i].align === "right" ? cx[i] + cw[i] - pad - tw : cx[i] + pad + (i === 0 ? indent : 0);
            text(value, x, baseline, fontSize, bold, color);
          });
        });
        if (kind === "total") rule(L, doc.y + h, W, BRAND, 0.9);
        else rule(L, doc.y, W, RULE, kind === "subtotal" ? 0.8 : 0.4);
      }
      doc.y -= 6;
    },
    signatures(blocks) {
      const gap = 30;
      const w = (W - gap * (blocks.length - 1)) / blocks.length;
      const area = 64;
      doc.ensure(area + 58);
      doc.y -= area + 10;
      const line = doc.y;
      blocks.forEach((b, i) => {
        const x = L + i * (w + gap);
        const sig = b.signature;
        if (sig && sig.strokes.length && sig.w > 0 && sig.h > 0) {
          const s = Math.min((w - 24) / sig.w, area / sig.h);
          const ox = x + (w - sig.w * s) / 2;
          const top = line + 3 + sig.h * s;
          const paths: string[] = [];
          for (const st of sig.strokes) {
            if (st.length < 2) continue;
            const at = (k: number) => `${(ox + st[k] * s).toFixed(2)} ${(top - st[k + 1] * s).toFixed(2)}`;
            let d = `${at(0)} m`;
            if (st.length < 4) d += ` ${at(0)} l`;
            for (let k = 2; k + 1 < st.length; k += 2) d += ` ${at(k)} l`;
            paths.push(d);
          }
          if (paths.length) add(`q 0.06 0.10 0.28 RG 1.15 w 1 J 1 j ${paths.join(" ")} S Q`);
        }
        rule(x, line, w, INK, 0.7);
        text(b.caption, x, line - 12, 8.5, "bold", INK);
        text(b.name, x, line - 24, 9, "regular", INK);
        if (b.note) wrapText(b.note, 7.2, w).forEach((ln, n) => text(ln, x, line - 35 - n * 9, 7.2, "regular", MUTED));
      });
      doc.y = line - 56;
    },
  };

  function newPage() {
    ops = [];
    streams.push(ops);
    const first = streams.length === 1;
    if (first) {
      logo(L, PAGE_H - 34, 150);
      const tw = textWidth(options.title, 15, "bold");
      text(options.title, R - tw, PAGE_H - 56, 15, "bold", INK);
      const sw = textWidth(options.subtitle, 9, "regular");
      text(options.subtitle, R - sw, PAGE_H - 71, 9, "regular", MUTED);
      rule(L, PAGE_H - 92, W, BRAND, 1.2);
      doc.y = PAGE_H - 96;
    } else {
      text(options.title, L, PAGE_H - 46, 9, "bold", BRAND);
      const sw = textWidth(options.subtitle, 8, "regular");
      text(options.subtitle, R - sw, PAGE_H - 46, 8, "regular", MUTED);
      rule(L, PAGE_H - 54, W, RULE, 0.6);
      doc.y = PAGE_H - 58;
    }
  }

  newPage();
  build(doc);

  const total = streams.length;
  streams.forEach((stream, i) => {
    ops = stream;
    rule(L, 44, W);
    text(options.footer, L, 31, 7.5, "regular", MUTED);
    const page = `Página ${i + 1} de ${total}`;
    text(page, R - textWidth(page, 7.5), 31, 7.5, "regular", MUTED);
  });

  const objects: string[] = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pageIds: number[] = [];
  for (const stream of streams) {
    const pageId = objects.length;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
    );
    const content = stream.join("\n") + "\n";
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
  }
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => id + " 0 R").join(" ")}] >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0));
}
