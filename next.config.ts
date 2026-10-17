import type { NextConfig } from "next";

// Deployment settings are supplied through environment variables.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      {
        // Lector de PDF (copia fija de pdf.js): se carga como módulo, así que debe servirse como JavaScript.
        source: "/vendor/pdfjs/:file(.*\\.mjs)",
        headers: [
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};
export default nextConfig;
