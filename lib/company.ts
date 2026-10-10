// Empresas que se llevan en esta app. Cada una tiene sus propias tablas, reglas y archivos;
// las pantallas son las mismas.
export type CompanyId = "protecterra" | "importagro";

export type Company = {
  id: CompanyId;
  name: string;
  /** Prefijo de sus tablas y funciones en la base de datos. */
  prefix: "pt_" | "ia_";
  /** Almacén privado donde viven sus facturas y recibos. */
  bucket: string;
  /** Símbolo de la moneda en que se llevan sus cuentas. */
  currency: string;
  /** Si tiene logo propio dibujado (si no, se escribe el nombre). */
  logo: boolean;
  /** Recibos de comisión con firma y portal del vendedor. */
  sellerPortal: boolean;
};

export const COMPANIES: Record<CompanyId, Company> = {
  protecterra: {
    id: "protecterra",
    name: "ProtecTerra",
    prefix: "pt_",
    bucket: "protecterra",
    currency: "C$",
    logo: true,
    sellerPortal: true,
  },
  importagro: {
    id: "importagro",
    name: "Importagro",
    prefix: "ia_",
    bucket: "importagro",
    currency: "US$",
    logo: false,
    sellerPortal: false,
  },
};

let current: Company = COMPANIES.protecterra;

/** Empresa en la que se está trabajando. */
export function company(): Company {
  return current;
}

export function setCompany(id: CompanyId): void {
  current = COMPANIES[id] ?? COMPANIES.protecterra;
}

/** Nombre real de una tabla o función para la empresa actual: "pt_sales" → "ia_sales" en Importagro. */
export function table(name: string): string {
  return name.startsWith("pt_") ? current.prefix + name.slice(3) : name;
}
