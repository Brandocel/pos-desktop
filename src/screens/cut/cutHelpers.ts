// src/pos/screens/cut/cutHelpers.ts

// =======================
// Básicos (a prueba de null/NaN)
// =======================
export function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normText(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// =======================
// Tipos
// =======================
export type CutProductRow = {
  name: string;
  category: string;
  qty: number;
  subtotal: number;
};

export type CutPolloTotals = {
  total: number;
  enteros: number;
  medios: number;
  cuartos: number;
};

export type CutPolloSummaryRow = {
  name: string;
  qty: number;
  subtotal: number;
};

export type CutPayTotals = {
  efectivoTotal: number;
  tarjetaTotal: number;
  efectivoCount: number;
  tarjetaCount: number;
  otrosTotal: number;
  otrosCount: number;
};

// =======================
// Orden de categorías (modo producción)
// =======================
export const productionOrder = [
  "Pollos",
  "Paquetes",
  "Especialidades",
  "Miércoles",
  "Extras",
  "Bebidas",
  "Desechables",
  "Desechable",
];

// =======================
// Detectores de pollos
// =======================
function detectPolloBaseName(
  name: any
): "1 pollo" | "1/2 pollo" | "1/4 pollo" | null {
  const raw = String(name ?? "").trim().toLowerCase();
  const base = raw.split(" - ")[0].trim();

  // orden importa
  if (base.includes("1/4") || base.includes("cuarto")) return "1/4 pollo";
  if (base.includes("1/2") || base.includes("medio")) return "1/2 pollo";
  if (base.includes("1 pollo")) return "1 pollo";

  return null;
}

export function sanitizePolloTotals(t: CutPolloTotals): CutPolloTotals {
  const enteros = Math.max(0, safeNum(t?.enteros));
  const medios = Math.max(0, safeNum(t?.medios));
  const cuartos = Math.max(0, safeNum(t?.cuartos));
  const total = enteros + medios + cuartos;
  return { total, enteros, medios, cuartos };
}

// =======================
// Tickets -> items (robusto)
// =======================
function extractTicketItems(t: any): Array<{ name: any; qty: any; category?: any; subtotal?: any; price?: any }> {
  const items =
    t?.items ??
    t?.sale_items ??
    t?.saleItems ??
    t?.lineItems ??
    t?.products ??
    [];

  if (!Array.isArray(items)) return [];

  return items.map((it: any) => ({
    name: it?.name ?? it?.productName ?? it?.title ?? it?.descripcion,
    qty: it?.qty ?? it?.quantity ?? it?.cant ?? it?.cantidad,
    category: it?.category ?? it?.categoria,
    subtotal: it?.subtotal,
    price: it?.price,
  }));
}

export function calcPolloTotalsFromTicketItems(
  ticketItems: Array<{ name: any; qty: any; category?: any }>
): CutPolloTotals {
  let enteros = 0;
  let medios = 0;
  let cuartos = 0;

  for (const it of ticketItems ?? []) {
    const qty = safeNum(it?.qty);
    if (qty <= 0) continue;

    const base = detectPolloBaseName(it?.name);
    if (!base) continue;

    // Solo contar si es categoría Pollos o Incluido en paquete
    const category = String(it?.category ?? "").toLowerCase();
    const isPolloCategory = category === "pollos" || category.includes("incluido");
    if (!isPolloCategory) continue;

    if (base === "1 pollo") enteros += qty;
    else if (base === "1/2 pollo") medios += qty;
    else if (base === "1/4 pollo") cuartos += qty;
  }

  return sanitizePolloTotals({ total: 0, enteros, medios, cuartos });
}

export function calcPolloTotalsFromTickets(tickets: any[]): CutPolloTotals {
  const allItems: Array<{ name: any; qty: any; category?: any }> = [];

  for (const t of tickets ?? []) {
    const items = extractTicketItems(t);
    for (const it of items) allItems.push({ name: it?.name, qty: it?.qty });
  }

  return calcPolloTotalsFromTicketItems(allItems);
}

// =======================
// Backend -> polloTotals (lo que dice el backend)
// =======================
export function getPolloTotalsFromBackend(anyResponse: any): CutPolloTotals | null {
  if (!anyResponse) return null;

  const cutData =
    anyResponse?.data?.totals ? anyResponse?.data :
    anyResponse?.totals ? anyResponse :
    anyResponse?.data?.data?.totals ? anyResponse?.data?.data :
    anyResponse?.data?.data ? anyResponse?.data?.data :
    anyResponse?.data ? anyResponse?.data :
    anyResponse;

  const candidates = [
    cutData?.totals?.polloTotals,
    cutData?.polloTotals,
    cutData?.totals?.pollo,
    cutData?.totals?.pollos,
    cutData?.production?.pollos,
    cutData?.summary?.pollos,
    cutData?.consumoPollos,
    cutData?.consumo_pollos,
    cutData?.kitchen?.pollos,
    cutData?.kitchen?.polloTotals,
  ].filter(Boolean);

  for (const c of candidates) {
    const enteros = safeNum(c?.enteros) || safeNum(c?.entero) || safeNum(c?.whole) || 0;
    const medios  = safeNum(c?.medios)  || safeNum(c?.medio)  || safeNum(c?.half)  || 0;
    const cuartos = safeNum(c?.cuartos) || safeNum(c?.cuarto) || safeNum(c?.quarter) || 0;

    const total =
      safeNum(c?.total) ||
      safeNum(c?.totalPollos) ||
      safeNum(c?.totalPiezas) ||
      (enteros + medios + cuartos);

    if (total > 0 || enteros > 0 || medios > 0 || cuartos > 0) {
      return sanitizePolloTotals({ total, enteros, medios, cuartos });
    }
  }

  return null;
}

// =======================
// Evidencia: qué items EXACTOS detectan pollos (para consola)
// =======================
export function buildPolloEvidenceFromTickets(tickets: any[]) {
  const rows: Array<{
    saleId: string;
    createdAt: string;
    name: string;
    base: "1 pollo" | "1/2 pollo" | "1/4 pollo";
    qty: number;
    category?: string;
    subtotal?: number;
  }> = [];

  for (const t of tickets ?? []) {
    const saleId = String(t?.saleId ?? t?.id ?? "");
    const createdAt = String(t?.createdAt ?? t?.created_at ?? "");
    const items = extractTicketItems(t);

    for (const it of items) {
      const base = detectPolloBaseName(it?.name);
      if (!base) continue;

      const qty = safeNum(it?.qty);
      if (qty <= 0) continue;

      rows.push({
        saleId,
        createdAt,
        name: String(it?.name ?? ""),
        base,
        qty,
        category: String(it?.category ?? ""),
        subtotal: safeNum(it?.subtotal),
      });
    }
  }

  return rows;
}

// =======================
// Resolver final (lo que muestras en UI)
// Recomendación: mostrar ticketsTotals si hay mismatch
// (porque refleja items reales, incluidos en paquete)
// =======================
export function resolvePolloTotals(args: {
  backendResponse?: any;
  cutData?: any;
  tickets?: any[] | null;
  products?: any[] | null;
}): CutPolloTotals {
  const backend = getPolloTotalsFromBackend(args.backendResponse) || getPolloTotalsFromBackend(args.cutData);
  const ticketsTotals = calcPolloTotalsFromTickets(args.tickets ?? []);

  // Si el backend no trae polloTotals, usa tickets
  if (!backend) return ticketsTotals;

  // Si tickets trae algo y no cuadra con backend, usa tickets (UI real)
  const hasTickets = safeNum(ticketsTotals.total) > 0;
  if (hasTickets) {
    const diff =
      Math.abs(safeNum(backend.enteros) - safeNum(ticketsTotals.enteros)) +
      Math.abs(safeNum(backend.medios) - safeNum(ticketsTotals.medios)) +
      Math.abs(safeNum(backend.cuartos) - safeNum(ticketsTotals.cuartos));

    if (diff > 0) return ticketsTotals;
  }

  // Si sí cuadra o no hay items, backend
  return backend;
}

// =======================
// Debug detallado (NO inventa, imprime evidencia)
// =======================
export function debugPolloMismatchDetailed(args: { cutData?: any; tickets?: any[] }) {
  const backend = getPolloTotalsFromBackend(args.cutData);
  const ticketsTotals = calcPolloTotalsFromTickets(args.tickets ?? []);
  const evidence = buildPolloEvidenceFromTickets(args.tickets ?? []);

  // Si no hay backend, no hay comparación
  if (!backend) {
    // eslint-disable-next-line no-console
    console.warn("🐔 POLLO DEBUG: backendTotals NO disponible en cutData.totals.polloTotals");
    // eslint-disable-next-line no-console
    console.table(evidence);
    return;
  }

  const diff =
    Math.abs(safeNum(backend.enteros) - safeNum(ticketsTotals.enteros)) +
    Math.abs(safeNum(backend.medios) - safeNum(ticketsTotals.medios)) +
    Math.abs(safeNum(backend.cuartos) - safeNum(ticketsTotals.cuartos));

  // eslint-disable-next-line no-console
  console.groupCollapsed("🐔 POLLO DEBUG (backend vs tickets)");
  // eslint-disable-next-line no-console
  console.log("backendTotals =>", backend);
  // eslint-disable-next-line no-console
  console.log("ticketsTotals =>", ticketsTotals);
  // eslint-disable-next-line no-console
  console.log("diff =>", diff);
  // eslint-disable-next-line no-console
  console.log("tickets count =>", (args.tickets ?? []).length);
  // eslint-disable-next-line no-console
  console.table(evidence);
  // eslint-disable-next-line no-console
  console.groupEnd();

  if (diff > 0) {
    // eslint-disable-next-line no-console
    console.warn("⚠️ Mismatch POLLOS detectado (backend vs tickets)", {
      backend,
      ticketsTotals,
      diff,
    });
  }
}

// =======================
// Pago (igual que ya tenías)
// =======================
function detectPaymentMethod(v: any): "efectivo" | "tarjeta" | "otro" {
  const raw = String(v ?? "").trim().toLowerCase();

  if (raw.includes("efect") || raw.includes("cash") || raw === "mxn_cash" || raw === "money") return "efectivo";

  if (
    raw.includes("tarj") ||
    raw.includes("card") ||
    raw.includes("credito") ||
    raw.includes("crédito") ||
    raw.includes("debito") ||
    raw.includes("débito")
  ) return "tarjeta";

  return "otro";
}

export function calcPayTotalsFromTickets(tickets: any[]): CutPayTotals {
  const out: CutPayTotals = {
    efectivoTotal: 0,
    tarjetaTotal: 0,
    efectivoCount: 0,
    tarjetaCount: 0,
    otrosTotal: 0,
    otrosCount: 0,
  };

  for (const t of tickets ?? []) {
    const methodRaw =
      t?.paymentMethod ??
      t?.payment_method ??
      t?.metodoPago ??
      t?.metodo_pago ??
      t?.method ??
      t?.payMethod ??
      t?.payment ??
      t?.pago ??
      t?.tipoPago;

    const method = detectPaymentMethod(methodRaw);

    const total =
      safeNum(t?.total) ||
      safeNum(t?.grandTotal) ||
      safeNum(t?.amount) ||
      safeNum(t?.paidTotal) ||
      safeNum(t?.totalAmount) ||
      safeNum(t?.subtotal) ||
      safeNum(t?.totals?.grand) ||
      0;

    if (method === "efectivo") {
      out.efectivoTotal += total;
      out.efectivoCount += 1;
    } else if (method === "tarjeta") {
      out.tarjetaTotal += total;
      out.tarjetaCount += 1;
    } else {
      out.otrosTotal += total;
      out.otrosCount += 1;
    }
  }

  return out;
}
