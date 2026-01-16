// src/pos/screens/cut/cutHelpers.ts

// =======================
// Básicos
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
  total: number; // total UNIDADES (enteros + medios + cuartos)
  enteros: number; // 1 pollo
  medios: number; // 1/2 pollo
  cuartos: number; // 1/4 pollo
};

export type CutPolloSummaryRow = {
  name: string; // "1 pollo" | "1/2 pollo" | "1/4 pollo"
  qty: number; // unidades
  subtotal: number; // subtotal acumulado
};

// ✅ NUEVO: Totales por método de pago
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
// Pollos (sin sabor)
// =======================

/**
 * "1/2 Pollo - Axiote" => "1/2 pollo"
 * "1 pollo - BBQ" => "1 pollo"
 * "1/4 Pollo" => "1/4 pollo"
 */
export function basePolloName(name: any) {
  const s = String(name ?? "").trim();
  const base = s.split(" - ")[0].trim();
  return base.toLowerCase(); // normaliza a minúsculas
}

/**
 * ✅ Recalcula enteros/medios/cuartos desde products (lo que se ve en el detalle)
 * TOTAL = enteros + medios + cuartos (UNIDADES)
 * Esto evita el bug donde el backend infla enteros.
 */
export function calcPolloTotalsFromProducts(
  products: Array<{ category: any; name: any; qty: any }>
): CutPolloTotals {
  let enteros = 0;
  let medios = 0;
  let cuartos = 0;

  for (const p of products ?? []) {
    if (String(p?.category ?? "") !== "Pollos") continue;

    const base = basePolloName(p?.name);
    const qty = safeNum(p?.qty);

    if (base === "1 pollo") enteros += qty;
    else if (base === "1/2 pollo") medios += qty;
    else if (base === "1/4 pollo") cuartos += qty;
  }

  const total = enteros + medios + cuartos;
  return { total, enteros, medios, cuartos };
}

/**
 * ✅ Resumen agrupado “sin sabor” para mostrar en ticket o en una tabla compacta
 * Junta: "1 pollo - BBQ" + "1 pollo - Tamarindo" => "1 pollo"
 */
export function summarizePollosFromProducts(
  products: CutProductRow[]
): CutPolloSummaryRow[] {
  const map = new Map<string, { qty: number; subtotal: number }>();

  for (const p of products ?? []) {
    if (String(p?.category ?? "") !== "Pollos") continue;

    const base = basePolloName(p?.name); // "1 pollo" | "1/2 pollo" | "1/4 pollo"
    const prev = map.get(base) || { qty: 0, subtotal: 0 };

    prev.qty += safeNum(p?.qty);
    prev.subtotal += safeNum(p?.subtotal);

    map.set(base, prev);
  }

  const items: CutPolloSummaryRow[] = Array.from(map.entries()).map(
    ([name, x]) => ({
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
    })
  );

  // Orden rápido: enteros, medios, cuartos, resto
  const order = ["1 pollo", "1/2 pollo", "1/4 pollo"];
  items.sort((a, b) => {
    const ai = order.indexOf(String(a.name).toLowerCase());
    const bi = order.indexOf(String(b.name).toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return items;
}

// =======================
// ✅ NUEVO: Método de pago (Efectivo / Tarjeta)
// =======================

function detectPaymentMethod(v: any): "efectivo" | "tarjeta" | "otro" {
  const raw = String(v ?? "").trim().toLowerCase();

  // efectivo
  if (
    raw.includes("efect") ||
    raw.includes("cash") ||
    raw === "mxn_cash" ||
    raw === "money"
  ) {
    return "efectivo";
  }

  // tarjeta
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
 * (para no depender del backend si un total viene inflado).
 *
 * Detecta:
 * - paymentMethod / payment_method / metodoPago / metodo_pago / method / payMethod
 * - total / grandTotal / amount / paidTotal / subtotal / totalAmount
 *
 * Si tu ticket tiene otro campo real, lo agregamos aquí.
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

    // buscamos un campo de total “probable”
    const total =
      safeNum(t?.total) ||
      safeNum(t?.grandTotal) ||
      safeNum(t?.amount) ||
      safeNum(t?.paidTotal) ||
      safeNum(t?.totalAmount) ||
      safeNum(t?.subtotal) ||
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
