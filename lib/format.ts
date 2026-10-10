import { company } from "./company";

const nf2 = new Intl.NumberFormat("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("es-NI", { maximumFractionDigits: 2 });

export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Dinero con dos decimales en la moneda de la empresa actual: C$ 1,234.50 */
export function money(v: unknown): string {
  const n = num(v);
  return (n < 0 ? "-" : "") + company().currency + " " + nf2.format(Math.abs(n));
}

export function qty(v: unknown): string {
  return nf0.format(num(v));
}

export function pct(v: unknown): string {
  return nf0.format(num(v) * 100) + "%";
}

/** Fecha corta 05/10/2026 a partir de 2026-10-05 (sin cambios de zona horaria). */
export function date(v: string | null | undefined): string {
  if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

const NI_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Managua",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Fecha y hora de Nicaragua a partir de un instante: "05/10/2026 20:15". */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = Object.fromEntries(NI_TIME.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

export function today(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10" → "oct 2026" */
export function monthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(ym);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ym;
}

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Nombre del mes de una fecha, corrido los meses que se pidan: ("2026-10-05", 1) → "noviembre" */
export function monthName(iso: string, offset = 0): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return "";
  return MONTH_NAMES[(((Number(m[2]) - 1 + offset) % 12) + 12) % 12];
}

/** "1 factura" / "3 facturas" */
export function plural(n: number, one: string, many: string): string {
  return `${nf0.format(n)} ${n === 1 ? one : many}`;
}

export function matches(text: string, query: string): boolean {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return norm(text).includes(norm(query.trim()));
}
