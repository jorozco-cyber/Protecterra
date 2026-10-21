import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Figtree, Lora } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./holiday.css";

const sans = Figtree({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
/** Serif clásica para los títulos de la decoración navideña. */
const holidaySerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-holiday",
  display: "swap",
});
/** Letra caligráfica del título navideño (TeX Gyre Chorus, licencia GUST, ver app/fonts). */
const holidayScript = localFont({
  src: "./fonts/texgyrechorus-mediumitalic.otf",
  variable: "--font-holiday-script",
  display: "swap",
});
/** Itálica para el contador de días. */
const holidayItalic = Lora({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["500", "600"],
  variable: "--font-holiday-italic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ProtecTerra",
  description: "Inventario, ventas, cobros y comisiones.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "ProtecTerra", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#08473e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${sans.variable} ${holidaySerif.variable} ${holidayScript.variable} ${holidayItalic.variable}`}>
      <body>{children}</body>
    </html>
  );
}
