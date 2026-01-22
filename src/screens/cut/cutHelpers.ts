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
  total: number; // piezas totales (enteros + medios + cuartos)
  enteros: number;
  medios: number;
  cuartos: number;
};

export type CutPolloSummaryRow = {
  name: string;
  qty: number;
  subtotal: number;
};

// ✅ Totales por método de pago
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
// Helpers: normalización de nombre para pollos
// =======================

/**
 * "1/2 Pollo - Axiote" => "1/2 pollo"
 * "1 pollo - BBQ" => "1 pollo"
 * "1/4 Pollo" => "1/4 pollo"
 */
export function basePolloName(name: any) {
  const s = String(name ?? "").trim();
  const base = s.split(" - ")[0].trim();
  return base.toLowerCase();
}

/**
 * ✅ Detecta el tipo de pollo robusto
 * Soporta "cuarto", "medio" y prefijos ("veracruz 1 pollo", etc.)
 */
function detectPolloBaseName(
  name: any
): "1 pollo" | "1/2 pollo" | "1/4 pollo" | null {
  const raw = String(name ?? "").trim().toLowerCase();
  const base = raw.split(" - ")[0].trim();

  // OJO: orden importa
  if (base.includes("1/4") || base.includes("cuarto")) return "1/4 pollo";
  if (base.includes("1/2") || base.includes("medio")) return "1/2 pollo";
  if (base.includes("1 pollo")) return "1 pollo";

  return null;
}

// =======================
// ✅ PROTECCIÓN EXTRA (anti-datos raros)
// - asegura no negativos
// - asegura total = enteros+medios+cuartos
// =======================
export function sanitizePolloTotals(t: CutPolloTotals): CutPolloTotals {
  const enteros = Math.max(0, safeNum(t?.enteros));
  const medios = Math.max(0, safeNum(t?.medios));
  const cuartos = Math.max(0, safeNum(t?.cuartos));
  const total = enteros + medios + cuartos; // siempre recalculado (evita totales corruptos)
  return { total, enteros, medios, cuartos };
}

// =======================
// ✅ Conteo REAL desde items (sale_items) vía tickets
// (incluye "Incluido en paquete" SI viene como item)
// =======================

/**
 * ✅ Conteo real desde items de ticket
 * NO depende de categorías. Solo del nombre y qty.
 */
export function calcPolloTotalsFromTicketItems(
  ticketItems: Array<{ name: any; qty: any }>
): CutPolloTotals {
  let enteros = 0;
  let medios = 0;
  let cuartos = 0;

  for (const it of ticketItems ?? []) {
    const qty = safeNum(it?.qty);
    if (qty <= 0) continue;

    const base = detectPolloBaseName(it?.name);
    if (!base) continue;

    if (base === "1 pollo") enteros += qty;
    else if (base === "1/2 pollo") medios += qty;
    else if (base === "1/4 pollo") cuartos += qty;
  }

  return sanitizePolloTotals({ total: 0, enteros, medios, cuartos });
}

/**
 * ✅ Extrae items del ticket en varias estructuras (por si cambias backend)
 */
function extractTicketItems(t: any): Array<{ name: any; qty: any }> {
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
  }));
}

/**
 * ✅ Conteo real desde tickets (todos los items)
 */
export function calcPolloTotalsFromTickets(tickets: any[]): CutPolloTotals {
  const allItems: Array<{ name: any; qty: any }> = [];

  for (const t of tickets ?? []) {
    const items = extractTicketItems(t);
    for (const it of items) {
      allItems.push({ name: it?.name, qty: it?.qty });
    }
  }

  return calcPolloTotalsFromTicketItems(allItems);
}

// =======================
// ✅ FUENTE DE VERDAD (BACKEND / DB)
// =======================

/**
 * ✅ Lee el polloTotals real que viene del backend.
 * Soporta pasar:
 * - response completo
 * - data directo
 * - data.data (si cambias wrapper)
 */
export function getPolloTotalsFromBackend(anyResponse: any): CutPolloTotals | null {
  if (!anyResponse) return null;

  // unwrap fuerte (para que funcione aunque cambies estructura)
  const cutData =
    anyResponse?.data?.totals ? anyResponse?.data :
    anyResponse?.totals ? anyResponse :
    anyResponse?.data?.data?.totals ? anyResponse?.data?.data :
    anyResponse?.data?.data ? anyResponse?.data?.data :
    anyResponse?.data ? anyResponse?.data :
    anyResponse;

  const candidates = [
    cutData?.totals?.polloTotals, // ✅ tu estructura real
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
    const enteros =
      safeNum(c?.enteros) ||
      safeNum(c?.entero) ||
      safeNum(c?.whole) ||
      0;

    const medios =
      safeNum(c?.medios) ||
      safeNum(c?.medio) ||
      safeNum(c?.half) ||
      0;

    const cuartos =
      safeNum(c?.cuartos) ||
      safeNum(c?.cuarto) ||
      safeNum(c?.quarter) ||
      0;

    const total =
      safeNum(c?.total) ||
      safeNum(c?.totalPollos) ||
      safeNum(c?.totalPiezas) ||
      (enteros + medios + cuartos);

    // válido si trae algo
    if (total > 0 || enteros > 0 || medios > 0 || cuartos > 0) {
      return sanitizePolloTotals({ total, enteros, medios, cuartos });
    }
  }

  return null;
}

// =======================
// ✅ FALLBACK (recetas) -> SOLO ÚLTIMO RECURSO
// (products NO incluye incluidos)
// =======================
type PolloRecipe = { enteros: number; medios: number; cuartos: number };

const POLLO_RECIPES: Record<string, PolloRecipe> = {
  apollo: { enteros: 1, medios: 1, cuartos: 0 },
  tesoro: { enteros: 2, medios: 0, cuartos: 0 },

  // fallback del paquete especial
  especial: { enteros: 1, medios: 0, cuartos: 0 },
  "paquete especial": { enteros: 1, medios: 0, cuartos: 0 },
};

function normalizeKey(name: any) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(" - ")[0]
    .trim();
}

function recipeFromName(name: any): PolloRecipe | null {
  const key = normalizeKey(name);
  if (POLLO_RECIPES[key]) return POLLO_RECIPES[key];

  for (const k of Object.keys(POLLO_RECIPES)) {
    if (key.includes(k)) return POLLO_RECIPES[k];
  }
  return null;
}

/**
 * ✅ fallback final desde products
 */
export function calcPolloTotalsFromProducts(
  products: Array<{ category: any; name: any; qty: any }>
): CutPolloTotals {
  let enteros = 0;
  let medios = 0;
  let cuartos = 0;

  for (const p of products ?? []) {
    const qty = safeNum(p?.qty);
    if (qty <= 0) continue;

    // 1) por texto directo
    const base = detectPolloBaseName(p?.name);
    if (base) {
      if (base === "1 pollo") enteros += qty;
      else if (base === "1/2 pollo") medios += qty;
      else if (base === "1/4 pollo") cuartos += qty;
      continue;
    }

    // 2) por receta fallback
    const recipe = recipeFromName(p?.name);
    if (!recipe) continue;

    enteros += recipe.enteros * qty;
    medios += recipe.medios * qty;
    cuartos += recipe.cuartos * qty;
  }

  return sanitizePolloTotals({ total: 0, enteros, medios, cuartos });
}

// =======================
// ✅ RESOLVER FINAL (ANTI-BUGS) + ✅ CONSOLE LOG (VERIFICACIÓN DB)
// Orden de confianza (para DIAGNÓSTICO):
// 1) Backend (DB directo) -> preferido
// 2) Tickets.items (DB directo) -> backup
// 3) Products/recipes -> último recurso
//
// ✅ LOGS:
// - imprime backendTotals, ticketsTotals, productsTotals
// - imprime muestra de items que detectan pollo
// - imprime si NO hay items en tickets
// =======================
export function resolvePolloTotals(args: {
  backendResponse?: any;
  cutData?: any;
  tickets?: any[] | null;
  products?: any[] | null;
}): CutPolloTotals {
  const backend =
    getPolloTotalsFromBackend(args.backendResponse) ||
    getPolloTotalsFromBackend(args.cutData);

  const ticketsTotals = calcPolloTotalsFromTickets(args.tickets ?? []);
  const productsTotals = calcPolloTotalsFromProducts(args.products ?? []);

  // ✅ LOG PRINCIPAL
  // eslint-disable-next-line no-console
  console.groupCollapsed("🐔 POLLO DEBUG (UI vs DB)");
  // eslint-disable-next-line no-console
  console.log("backendTotals (cutData.totals.polloTotals?) =>", backend);
  // eslint-disable-next-line no-console
  console.log("ticketsTotals (from tickets.items) =>", ticketsTotals);
  // eslint-disable-next-line no-console
  console.log("productsTotals (fallback recipes) =>", productsTotals);
  // eslint-disable-next-line no-console
  console.log("tickets count =>", (args.tickets ?? []).length);
  // eslint-disable-next-line no-console
  console.groupEnd();

  // ✅ Caso 1: si NO hay backend, usa tickets si hay, si no products
  if (!backend) {
    if (safeNum(ticketsTotals.total) > 0) return ticketsTotals;
    return productsTotals;
  }

  // ✅ Caso 2: si SI hay backend y también tickets (lo ideal):
  // Si NO cuadra, confiamos en tickets (porque viene de items reales).
  const hasTickets = safeNum(ticketsTotals.total) > 0;

  if (hasTickets) {
    const diff =
      Math.abs(safeNum(backend.enteros) - safeNum(ticketsTotals.enteros)) +
      Math.abs(safeNum(backend.medios) - safeNum(ticketsTotals.medios)) +
      Math.abs(safeNum(backend.cuartos) - safeNum(ticketsTotals.cuartos));

    if (diff > 0) {
      // eslint-disable-next-line no-console
      console.warn("⚠️ Backend polloTotals NO cuadra con tickets. Usando ticketsTotals.", {
        backend,
        ticketsTotals,
        diff,
      });

      // 👇 Esto es lo que arregla tu caso (te regresa 8 / 6 enteros)
      return ticketsTotals;
    }

    // si sí cuadra, puedes usar backend sin miedo
    return backend;
  }

  // ✅ Caso 3: backend existe pero NO vinieron tickets.items (raro)
  return backend;
}


/**
 * ✅ Debug opcional: avisa si backend vs tickets no coincide
 */
export function debugPolloMismatch(args: { cutData?: any; tickets?: any[] }) {
  const a = getPolloTotalsFromBackend(args.cutData);
  const b = calcPolloTotalsFromTickets(args.tickets ?? []);
  if (!a) return;

  const diff =
    Math.abs(safeNum(a.enteros) - safeNum(b.enteros)) +
    Math.abs(safeNum(a.medios) - safeNum(b.medios)) +
    Math.abs(safeNum(a.cuartos) - safeNum(b.cuartos));

  if (diff > 0) {
    // eslint-disable-next-line no-console
    console.warn("⚠️ Mismatch POLLOS (backend vs tickets)", { backend: a, tickets: b });
  }
}

// =======================
// ✅ Resumen de pollos (para Ticket / Producción)
// =======================
export function summarizePollosFromProducts(
  products: CutProductRow[]
): CutPolloSummaryRow[] {
  const map = new Map<string, { qty: number; subtotal: number }>();

  function addLine(baseName: string, addQty: number, addSubtotal: number) {
    const prev = map.get(baseName) || { qty: 0, subtotal: 0 };
    prev.qty += addQty;
    prev.subtotal += addSubtotal;
    map.set(baseName, prev);
  }

  for (const p of products ?? []) {
    const qty = safeNum(p?.qty);
    const sub = safeNum(p?.subtotal);
    if (qty <= 0) continue;

    const base = detectPolloBaseName(p?.name);
    if (base) {
      addLine(base, qty, sub);
      continue;
    }

    const recipe = recipeFromName(p?.name);
    if (!recipe) continue;

    if (recipe.enteros) addLine("1 pollo", recipe.enteros * qty, 0);
    if (recipe.medios) addLine("1/2 pollo", recipe.medios * qty, 0);
    if (recipe.cuartos) addLine("1/4 pollo", recipe.cuartos * qty, 0);
  }

  const items: CutPolloSummaryRow[] = Array.from(map.entries()).map(([name, x]) => ({
    name:
      name === "1 pollo"
        ? "1 pollo"
        : name === "1/2 pollo"
        ? "1/2 Pollo"
        : name === "1/4 pollo"
        ? "1/4 Pollo"
        : name,
    qty: x.qty,
    subtotal: x.subtotal,
  }));

  const order = ["1 pollo", "1/2 pollo", "1/4 pollo"];
  items.sort((a, b) => {
    const ai = order.indexOf(String(a.name).toLowerCase());
    const bi = order.indexOf(String(b.name).toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return items;
}

// =======================
// Método de pago (Efectivo / Tarjeta) - robusto
// =======================
function detectPaymentMethod(v: any): "efectivo" | "tarjeta" | "otro" {
  const raw = String(v ?? "").trim().toLowerCase();

  if (raw.includes("efect") || raw.includes("cash") || raw === "mxn_cash" || raw === "money") {
    return "efectivo";
  }

  if (
    raw.includes("tarj") ||
    raw.includes("card") ||
    raw.includes("credito") ||
    raw.includes("crédito") ||
    raw.includes("debito") ||
    raw.includes("débito")
  ) {
    return "tarjeta";
  }

  return "otro";
}

/**
 * ✅ Recalcula totales por método de pago desde tickets
 */
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
