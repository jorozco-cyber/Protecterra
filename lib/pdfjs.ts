"use client";
// Lector de PDF (pdf.js de Mozilla, copia fija en /public/vendor/pdfjs). Se carga solo cuando hace falta
// mostrar una factura, para no hacer más pesada el resto de la app.

const BASE = "/vendor/pdfjs/";

type Viewport = { width: number; height: number };
type PdfPage = {
  getViewport(o: { scale: number }): Viewport;
  render(o: {
    canvasContext: CanvasRenderingContext2D;
    canvas: HTMLCanvasElement;
    viewport: Viewport;
    background?: string;
  }): { promise: Promise<void> };
  cleanup(): void;
};
type PdfDocument = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
};

let loading: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  if (!loading) {
    const url = BASE + "pdf.mjs";
    loading = (import(/* webpackIgnore: true */ url) as Promise<PdfJs>).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.mjs";
      return lib;
    });
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Una página lista para mostrar: su tamaño real (en puntos) y una imagen de ella. */
export type PageImage = { width: number; height: number; canvas: HTMLCanvasElement };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Convierte la factura (PDF o foto) en imágenes de sus páginas. `pixelsPerPoint` decide la nitidez:
 * 1,5 alcanza para la pantalla del teléfono; 2 para la copia firmada.
 */
export async function renderPages(bytes: ArrayBuffer, mime: string, pixelsPerPoint: number): Promise<PageImage[]> {
  if (IMAGE_TYPES.includes(mime)) return [await renderImage(bytes, mime, pixelsPerPoint)];
  const lib = await pdfjs();
  const task = lib.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    standardFontDataUrl: BASE + "standard_fonts/",
    wasmUrl: BASE + "wasm/",
    enableXfa: false,
  });
  try {
    const doc = await task.promise;
    const out: PageImage[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 20); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // Un límite de tamaño para que un teléfono no se quede sin memoria con una hoja muy grande.
      const scale = Math.min(pixelsPerPoint, 4000 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, canvas, viewport, background: "#ffffff" }).promise;
      page.cleanup();
      out.push({ width: base.width, height: base.height, canvas });
    }
    return out;
  } finally {
    // Libera la memoria y el proceso de lectura del PDF.
    void task.destroy();
  }
}

/** Una foto de la factura cuenta como una sola página del ancho de una hoja carta. */
async function renderImage(bytes: ArrayBuffer, mime: string, pixelsPerPoint: number): Promise<PageImage> {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const width = 612;
    const height = (img.naturalHeight / img.naturalWidth) * width;
    const scale = Math.min(pixelsPerPoint, 4000 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { width, height, canvas };
  } finally {
    URL.revokeObjectURL(url);
  }
}
