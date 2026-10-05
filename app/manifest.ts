import type { MetadataRoute } from "next";

/** Datos para instalar la app en la pantalla de inicio del teléfono. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProtecTerra",
    short_name: "ProtecTerra",
    description: "Inventario, ventas, cobros y comisiones.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ec",
    theme_color: "#1f4d3a",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
