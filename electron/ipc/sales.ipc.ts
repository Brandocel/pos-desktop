// electron/ipc/sales.ipc.ts
import { ipcMain, BrowserWindow } from "electron";
import { getDb } from "../db";
import { packageIncludes, productCustomOptions } from "../db/schema";
import crypto from "crypto";

/**
 * ✅ Arreglos incluidos:
 * 1) Conteo de pollo EXACTO sin doble conteo:
 *    - Solo cuenta pollo si category es "Pollos" o "Incluido en paquete"
 *    - NO cuenta Especialidades aunque el nombre contenga "pollo"
 *
 * 2) Debug imprimible en consola (para cuadrar):
 *    - Actívalo con: CUT_DEBUG=1 (en tu env)
 *
 * 3) FIX REAL del mismatch:
 *    - packageIncludes match por nombre NORMALIZADO (no exacto)
 *    - Esto evita que "Peninsular 1 Pollo" no encuentre "Peninsular 1 pollo"
 *
 * 4) PDF sin cortes feos:
 *    - break-inside avoid
 *    - thead repetible
 *    - cards cambian a 2 columnas en impresión
 *
 * ✅ NUEVO (update 1):
 * 5) Corte PDF más detallado:
 *    - Desglose de EXTRAS/Desechables (por producto) con totales y por método (efectivo / tarjeta)
 *
 * ✅ NUEVO (update 2):
 * 6) Productos vendidos por método (efectivo / tarjeta):
 *    - Paquetes, Especialidades, Miércoles, Pollos individuales
 *    - PDF y summary incluyen el split
 *
 * ✅ NUEVO (update 3):
 * 7) Consumo de pollos (porciones) por método (efectivo / tarjeta):
 *    - Enteros / Medios / Cuartos / Total porciones / Equivalente
 *    - PDF y summary incluyen el split
 *
 * ✅ NUEVO (update 4):
 * 8) Desglose DETALLADO de Paquetes y Especialidades (por producto) con split (efectivo / tarjeta):
 *    - Agrupa por “baseName” (antes de " - ") para que no se duplique por variaciones
 *    - Se incluye en summary y en PDF
 */

type SaleItemInput = {
  name: string;
  qty: number;
  price: number;
  category?: string;
  flavor?: string;
  customOption?: string;
};

type CreateSaleInput = {
  items: SaleItemInput[];
  paymentMethod: "cash" | "card";
  notes?: string;
  cashReceived?: number;
  change?: number;
};

type PackageExtra = { name: string; qty: number };

// =======================
// Debug toggle
// =======================
const CUT_DEBUG = String(process.env.CUT_DEBUG ?? "") === "1";
function dbg(...args: any[]) {
  if (CUT_DEBUG) console.log(...args);
}

// =======================
// Helpers base
// =======================
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normText(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ✅ Normalizador más fuerte para llaves (paquetes/especialidades)
function normKey(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneyMXN(v: number) {
  const n = safeNum(v);
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

// =======================
// Tipos: pagos y agregados
// =======================
type Payment = "cash" | "card";

type ExtraAgg = {
  name: string;
  qty: number;
  total: number;
  cashQty: number;
  cashTotal: number;
  cardQty: number;
  cardTotal: number;
};

type SplitQty = {
  totalQty: number;
  cashQty: number;
  cardQty: number;
};

type ProductsByPayment = {
  paquetes: SplitQty;
  especialidades: SplitQty;
  miercoles: SplitQty;
  pollos_individuales: SplitQty;
};

function emptySplit(): SplitQty {
  return { totalQty: 0, cashQty: 0, cardQty: 0 };
}

function incSplit(target: SplitQty, qty: number, pm: Payment) {
  const q = safeNum(qty);
  target.totalQty += q;
  if (pm === "cash") target.cashQty += q;
  else target.cardQty += q;
}

// =======================
// ✅ NUEVO: Pollo / Porciones por método (cash/card)
// =======================
type PolloByPayment = {
  enteros: SplitQty;
  medios: SplitQty;
  cuartos: SplitQty;
  porcionesTotal: SplitQty;
  equivalenteTotal: {
    total: number;
    cash: number;
    card: number;
  };
};

function emptyPolloByPayment(): PolloByPayment {
  return {
    enteros: emptySplit(),
    medios: emptySplit(),
    cuartos: emptySplit(),
    porcionesTotal: emptySplit(),
    equivalenteTotal: { total: 0, cash: 0, card: 0 },
  };
}

// =======================
// ✅ NUEVO: Desglose DETALLADO de Paquetes y Especialidades (por producto) con split
// =======================
type MainItemAgg = {
  name: string; // display
  qty: number;
  total: number;
  cashQty: number;
  cashTotal: number;
  cardQty: number;
  cardTotal: number;
};

function pushMainAgg(
  map: Map<string, MainItemAgg>,
  name: string,
  qty: number,
  subtotal: number,
  pm: Payment
) {
  const key = normKey(name);
  if (!map.has(key)) {
    map.set(key, {
      name,
      qty: 0,
      total: 0,
      cashQty: 0,
      cashTotal: 0,
      cardQty: 0,
      cardTotal: 0,
    });
  }

  const row = map.get(key)!;
  row.qty += safeNum(qty);
  row.total += safeNum(subtotal);

  if (pm === "cash") {
    row.cashQty += safeNum(qty);
    row.cashTotal += safeNum(subtotal);
  } else {
    row.cardQty += safeNum(qty);
    row.cardTotal += safeNum(subtotal);
  }
}

function sortMainAgg(list: MainItemAgg[]) {
  return [...list].sort((a, b) => {
    const d1 = safeNum(b.total) - safeNum(a.total);
    if (d1 !== 0) return d1;
    return safeNum(b.qty) - safeNum(a.qty);
  });
}

// =======================
// ✅ Desglose por método (cash/card) para Extras/Desechables (DETALLADO)
// =======================
function isExtraOrDesechableCategory(catRaw: string) {
  const c = normText(catRaw);
  return c.includes("extras") || c.includes("desechables");
}

function isDesechableName(name: string) {
  const n = normText(name);
  return n.includes("desechable") || n.includes("desechables");
}

function pushExtraAgg(
  map: Map<string, ExtraAgg>,
  name: string,
  qty: number,
  subtotal: number,
  paymentMethod: Payment
) {
  const key = normKey(name);

  if (!map.has(key)) {
    map.set(key, {
      name,
      qty: 0,
      total: 0,
      cashQty: 0,
      cashTotal: 0,
      cardQty: 0,
      cardTotal: 0,
    });
  }

  const row = map.get(key)!;
  row.qty += safeNum(qty);
  row.total += safeNum(subtotal);

  if (paymentMethod === "cash") {
    row.cashQty += safeNum(qty);
    row.cashTotal += safeNum(subtotal);
  } else {
    row.cardQty += safeNum(qty);
    row.cardTotal += safeNum(subtotal);
  }
}

function sortExtrasAgg(list: ExtraAgg[]) {
  // Orden: más vendido por total, luego qty
  return [...list].sort((a, b) => {
    const d1 = safeNum(b.total) - safeNum(a.total);
    if (d1 !== 0) return d1;
    return safeNum(b.qty) - safeNum(a.qty);
  });
}

// =======================
// Pollo: detección y conversión
// =======================
type PolloKind = "entero" | "medio" | "cuarto";

function getPolloKindFromName(name: string): PolloKind | null {
  const n = normText(name);
  if (!n.includes("pollo")) return null;
  if (n.includes("1/4")) return "cuarto";
  if (n.includes("1/2")) return "medio";
  return "entero";
}

// Equivalente a pollos completos
function polloEquivalent(kind: PolloKind, qty: number) {
  if (kind === "entero") return qty * 1;
  if (kind === "medio") return qty * 0.5;
  return qty * 0.25;
}

// =======================
// ✅ NUEVO: construir pollo por método (cash/card)
// Regla: solo cuenta pollo si category es Pollos o Incluido en paquete
// =======================
function buildPolloByPaymentFromRows(
  rows: Array<{ item_name: string; item_qty: number; item_category?: string; payment_method: string }>
): PolloByPayment {
  const out = emptyPolloByPayment();

  for (const r of rows) {
    const name = r.item_name ?? "";
    const qty = safeNum(r.item_qty);
    const catRaw = r.item_category ?? "Sin categoría";
    const catN = normText(catRaw);
    const pm: Payment = r.payment_method === "card" ? "card" : "cash";

    const kind = getPolloKindFromName(name);
    if (!kind) continue;

    const isIncluded = catN.includes("incluido");
    const isPolloCategory = catN === "pollos" || catN.includes("pollos");
    if (!(isPolloCategory || isIncluded)) continue;

    if (kind === "entero") incSplit(out.enteros, qty, pm);
    if (kind === "medio") incSplit(out.medios, qty, pm);
    if (kind === "cuarto") incSplit(out.cuartos, qty, pm);

    incSplit(out.porcionesTotal, qty, pm);

    const eq = polloEquivalent(kind, qty);
    out.equivalenteTotal.total += eq;
    if (pm === "cash") out.equivalenteTotal.cash += eq;
    else out.equivalenteTotal.card += eq;
  }

  return out;
}

// =======================
// Ajuste de salsas (tu lógica)
// =======================
function polloUnitsFromName(name: string) {
  const kind = getPolloKindFromName(name);
  if (!kind) return 0;
  if (kind === "cuarto") return 0.25;
  if (kind === "medio") return 0.5;
  return 1;
}

function normalizeSalsas(extras: PackageExtra[]): PackageExtra[] {
  const polloUnits = extras.reduce((acc, extra) => acc + safeNum(extra.qty) * polloUnitsFromName(extra.name), 0);
  const salsaIdx = extras.findIndex((e) => normText(e.name) === "salsa");
  if (salsaIdx === -1 || polloUnits <= 0) return extras;

  const desiredSalsas = Math.max(1, Math.ceil(polloUnits));
  const cloned = extras.map((e) => ({ ...e }));
  cloned[salsaIdx] = { ...cloned[salsaIdx], qty: safeNum(desiredSalsas) };
  return cloned;
}

// =======================
// ✅ FIX REAL: índice de packageIncludes por llave NORMALIZADA
// =======================
const packageIncludesIndex = (() => {
  const m = new Map<string, PackageExtra[]>();
  for (const p of packageIncludes) {
    const key = normKey(p.packageName);
    const extras = (p.extras ?? []).map((e) => ({ name: e.name, qty: safeNum(e.qty) }));
    m.set(key, extras);
  }
  return m;
})();

/**
 * ✅ Ahora busca la receta por nombre NORMALIZADO
 */
function getPackageExtras(_db: any, packageName: string, baseName?: string, customOption?: string): PackageExtra[] {
  const base = (baseName || packageName || "").trim();
  const key = normKey(base);

  let extras = packageIncludesIndex.get(key) ?? [];

  // opción personalizada: reemplazar el extra correspondiente
  if (customOption && baseName) {
    const customConfig = productCustomOptions[baseName];
    if (customConfig) {
      const allOptionExtras = customConfig.options.map((o) => o.extraName);
      extras = extras.map((e) => {
        if (allOptionExtras.includes(e.name)) return { ...e, name: customOption };
        return e;
      });
    }
  }

  return normalizeSalsas(extras);
}

// =======================
// Conteo correcto (SIN DOBLE CONTEO)
// =======================
type CountSummary = {
  // Vendidos principales (NO incluidos)
  paquetes: number;
  especialidades: number;
  miercoles: number;
  pollos_individuales: number;

  // Pollos consumidos (incluye incluidos + pollos vendidos)
  pollo_entero: number;
  pollo_medio: number;
  pollo_cuarto: number;

  // Totales
  pollo_porciones_total: number; // enteros + medios + cuartos (en tu sistema, suma de qty tal cual)
  pollo_equivalente_total: number; // equivalente en pollos completos

  // Otros
  extras: number;
  desechables: number;
  otros: number;
};

function buildCountsFromRows(rows: Array<{ item_name: string; item_qty: number; item_category?: string }>): CountSummary {
  const counts: CountSummary = {
    paquetes: 0,
    especialidades: 0,
    miercoles: 0,
    pollos_individuales: 0,

    pollo_entero: 0,
    pollo_medio: 0,
    pollo_cuarto: 0,

    pollo_porciones_total: 0,
    pollo_equivalente_total: 0,

    extras: 0,
    desechables: 0,
    otros: 0,
  };

  for (const r of rows) {
    const name = r.item_name ?? "";
    const nameN = normText(name);
    const catRaw = r.item_category ?? "";
    const catN = normText(catRaw);
    const qty = safeNum(r.item_qty);

    const isIncluded = catN.includes("incluido"); // "Incluido en paquete"
    const isPolloCategory = catN === "pollos" || catN.includes("pollos");
    const polloKind = getPolloKindFromName(name);

    // ✅ POLLO: SOLO SI (Pollos) o (Incluido)
    if (polloKind && (isPolloCategory || isIncluded)) {
      if (polloKind === "entero") counts.pollo_entero += qty;
      if (polloKind === "medio") counts.pollo_medio += qty;
      if (polloKind === "cuarto") counts.pollo_cuarto += qty;

      counts.pollo_porciones_total += qty;
      counts.pollo_equivalente_total += polloEquivalent(polloKind, qty);

      // Pollos individuales: solo los vendidos en categoría Pollos (no incluidos)
      if (isPolloCategory && !isIncluded) counts.pollos_individuales += qty;

      continue;
    }

    // ✅ Si es incluido (pero no es pollo válido), NO lo contamos en nada
    if (isIncluded) continue;

    // ✅ Conteos principales (solo productos principales)
    if (catN.includes("paquetes")) {
      counts.paquetes += qty;
      continue;
    }
    if (catN.includes("especialidades")) {
      counts.especialidades += qty;
      continue;
    }
    if (catN.includes("miercoles") || catN.includes("miércoles")) {
      counts.miercoles += qty;
      continue;
    }
    if (catN.includes("extras")) {
      if (nameN.includes("desechable")) counts.desechables += qty;
      else counts.extras += qty;
      continue;
    }
    if (catN.includes("desechables")) {
      counts.desechables += qty;
      continue;
    }

    counts.otros += qty;
  }

  return counts;
}

// =======================
// ✅ Productos vendidos por método (cash/card)
// =======================
function buildProductsByPaymentFromRows(
  rows: Array<{ item_name: string; item_qty: number; item_category?: string; payment_method: string; item_price?: number }>
): ProductsByPayment {
  const out: ProductsByPayment = {
    paquetes: emptySplit(),
    especialidades: emptySplit(),
    miercoles: emptySplit(),
    pollos_individuales: emptySplit(),
  };

  for (const r of rows) {
    const name = r.item_name ?? "";
    const catRaw = r.item_category ?? "Sin categoría";
    const catN = normText(catRaw);
    const qty = safeNum(r.item_qty);
    const pm: Payment = r.payment_method === "card" ? "card" : "cash";

    const isIncluded = catN.includes("incluido");
    if (isIncluded) continue; // nunca contamos incluidos

    const isPolloCategory = catN === "pollos" || catN.includes("pollos");
    const polloKind = getPolloKindFromName(name);

    // ✅ Pollos individuales vendidos (solo categoría Pollos)
    if (polloKind && isPolloCategory) {
      incSplit(out.pollos_individuales, qty, pm);
      continue;
    }

    // ✅ Paquetes / Especialidades / Miércoles (solo categoría)
    if (catN.includes("paquetes")) {
      incSplit(out.paquetes, qty, pm);
      continue;
    }
    if (catN.includes("especialidades")) {
      incSplit(out.especialidades, qty, pm);
      continue;
    }
    if (catN.includes("miercoles") || catN.includes("miércoles")) {
      incSplit(out.miercoles, qty, pm);
      continue;
    }
  }

  return out;
}

// =======================
// Seguro al guardar: validar incluidos
// =======================
function expectedIncludedFromMainItems(mainItems: SaleItemInput[]) {
  const expectedMap = new Map<string, number>(); // key: normalizedName -> qty

  for (const it of mainItems) {
    const qtyMain = safeNum(it.qty);
    if (qtyMain <= 0) continue;

    const catN = normText(it.category ?? "Sin categoría");
    const isBundle = catN === "paquetes" || catN === "especialidades" || catN === "miercoles" || catN === "miércoles";
    if (!isBundle) continue;

    const baseName = (it.name.split(" - ")[0]?.trim() || it.name).trim();
    const extras = getPackageExtras(null as any, it.name, baseName, it.customOption);

    for (const ex of extras) {
      const exQty = safeNum(ex.qty) * qtyMain;
      const key = normText(ex.name);
      expectedMap.set(key, (expectedMap.get(key) ?? 0) + exQty);
    }
  }

  return expectedMap;
}

function actualIncludedFromDbRows(rows: Array<{ name: string; qty: number; category: string; price: number }>) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const catN = normText(r.category);
    const isIncluded = catN.includes("incluido");
    const isFree = safeNum(r.price) === 0;
    if (!isIncluded || !isFree) continue;

    const key = normText(r.name);
    map.set(key, (map.get(key) ?? 0) + safeNum(r.qty));
  }
  return map;
}

function compareExpectedVsActual(expected: Map<string, number>, actual: Map<string, number>) {
  const errors: string[] = [];
  for (const [key, expQty] of expected.entries()) {
    const actQty = actual.get(key) ?? 0;
    const diff = Math.abs(expQty - actQty);
    if (diff > 1e-9) errors.push(`Incluido "${key}" esperado=${expQty} actual=${actQty}`);
  }
  return errors;
}

// =======================
// ✅ ICONOS (SVG inline estilo Lucide) — compatibles con HTML/PDF
// =======================
function svgIcon(pathD: string) {
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${pathD}"/></svg>`;
}
const ICONS = {
  receipt: svgIcon(
    "M5 3h14v18l-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1V3zm4 4h6m-6 4h10m-10 4h8"
  ),
  wallet: svgIcon(
    "M20 7H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zm0 0V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2m16 6h-5"
  ),
  card: svgIcon("M3 7h18M5 11h14M7 15h6M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"),
  list: svgIcon("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"),
  package: svgIcon("M21 8l-9-5-9 5 9 5 9-5zm-18 2v10l9 5 9-5V10"),
  chicken: svgIcon("M9 10c0 3 2 5 5 5s5-2 5-5-2-5-5-5-5 2-5 5zm-5 6c1.5 0 3-1 4-2"),
  plus: svgIcon("M12 5v14m-7-7h14"),
};

// =======================
// PDF HTML (UPDATED)
// =======================
function buildCutPdfHtml(args: {
  rangeLabel: string;
  from: string;
  to: string;
  totals: { grand: number; tickets: number; cash: number; card: number };
  counts: CountSummary;
  productsByPayment: ProductsByPayment;
  polloByPayment: PolloByPayment;
  extrasDetailed: ExtraAgg[];

  // ✅ NUEVO: detalle por producto
  paquetesDetailed: MainItemAgg[];
  especialidadesDetailed: MainItemAgg[];
}) {
  const {
    rangeLabel,
    from,
    to,
    totals,
    counts,
    productsByPayment,
    polloByPayment,
    extrasDetailed,
    paquetesDetailed,
    especialidadesDetailed,
  } = args;

  const productRows: Array<[string, SplitQty]> = [
    ["Paquetes vendidos", productsByPayment.paquetes],
    ["Especialidades vendidas", productsByPayment.especialidades],
    ["Miércoles vendidos", productsByPayment.miercoles],
    ["Pollos individuales vendidos", productsByPayment.pollos_individuales],
  ];

  const otherRows: Array<[string, number]> = [
    ["Extras (sin incluidos)", counts.extras],
    ["Desechables (sin incluidos)", counts.desechables],
    ["Otros", counts.otros],
  ];

  const extrasOnly = extrasDetailed.filter((e) => !isDesechableName(e.name) && safeNum(e.total) > 0);
  const desechablesOnly = extrasDetailed.filter((e) => isDesechableName(e.name) && safeNum(e.total) > 0);

  const extrasGrand = extrasDetailed.reduce((a, e) => a + safeNum(e.total), 0);
  const extrasCash = extrasDetailed.reduce((a, e) => a + safeNum(e.cashTotal), 0);
  const extrasCard = extrasDetailed.reduce((a, e) => a + safeNum(e.cardTotal), 0);

  const pkSubtotal = {
    qty: paquetesDetailed.reduce((a, x) => a + safeNum(x.qty), 0),
    total: paquetesDetailed.reduce((a, x) => a + safeNum(x.total), 0),
    cash: paquetesDetailed.reduce((a, x) => a + safeNum(x.cashTotal), 0),
    card: paquetesDetailed.reduce((a, x) => a + safeNum(x.cardTotal), 0),
  };

  const espSubtotal = {
    qty: especialidadesDetailed.reduce((a, x) => a + safeNum(x.qty), 0),
    total: especialidadesDetailed.reduce((a, x) => a + safeNum(x.total), 0),
    cash: especialidadesDetailed.reduce((a, x) => a + safeNum(x.cashTotal), 0),
    card: especialidadesDetailed.reduce((a, x) => a + safeNum(x.cardTotal), 0),
  };

  const genDate = new Date().toLocaleString("es-MX");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Corte</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 18px; color: #111; }

    .muted { color: #666; }
    .mono { font-variant-numeric: tabular-nums; }
    .row { display:flex; align-items:flex-start; justify-content:space-between; gap: 14px; }
    .brand { font-size: 18px; font-weight: 900; letter-spacing: -0.2px; }
    .sub { font-size: 12px; color: #555; margin-top: 4px; line-height: 1.35; }

    .i { width: 16px; height: 16px; stroke: #111; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vertical-align: -3px; margin-right: 6px; }

    .cards { display:grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 14px; }
    .card { border: 1px solid #e5e5e5; border-radius: 12px; padding: 10px; background: #fff; }
    .label { font-size: 11px; color: #555; display:flex; align-items:center; gap: 6px; }
    .value { font-size: 16px; font-weight: 900; margin-top: 6px; }

    .section { margin-top: 18px; }
    .section-title {
      font-size: 12px;
      font-weight: 900;
      color: #111;
      margin-bottom: 8px;
      border-bottom: 2px solid #eee;
      padding-bottom: 6px;
      display:flex;
      align-items:center;
      gap: 6px;
    }

    table { width: 100%; border-collapse: collapse; border: 1px solid #eee; border-radius: 10px; overflow: hidden; }
    thead th { background: #f7f7f7; }
    th, td { border-bottom: 1px solid #eee; padding: 9px 8px; font-size: 12px; }
    th { text-align:left; color:#555; font-size: 11px; font-weight: 800; }
    td:last-child, th:last-child { text-align:right; }
    .right { text-align:right; }
    tr.total td { font-weight: 900; background: #f2f2f2; }

    .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pill { display:inline-block; padding: 2px 8px; border: 1px solid #e5e5e5; border-radius: 999px; font-size: 10px; font-weight: 800; color:#333; background:#fafafa; }

    .footer { margin-top: 14px; font-size: 11px; color:#666; line-height: 1.35; }

    @page { size: A4; margin: 12mm; }

    .card, .section, .row { break-inside: avoid; page-break-inside: avoid; }
    table { break-inside: auto; page-break-inside: auto; }
    tr, td, th { break-inside: avoid; page-break-inside: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }

    @media print {
      body { padding: 0; }
      .cards { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .value { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="row">
    <div>
      <div class="brand">Pollo Pirata POS — Corte</div>
      <div class="sub">Rango: <b>${escapeHtml(rangeLabel)}</b></div>
      <div class="sub">Fechas: ${escapeHtml(from)} a ${escapeHtml(to)}</div>
      <div class="sub">Generado: ${escapeHtml(genDate)}</div>
    </div>
    <div class="right">
      <div class="sub muted">Desglose por método</div>
      <div class="sub mono"><b>Efectivo:</b> ${escapeHtml(moneyMXN(totals.cash))}</div>
      <div class="sub mono"><b>Tarjeta:</b> ${escapeHtml(moneyMXN(totals.card))}</div>
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="label">${ICONS.receipt}Total vendido</div>
      <div class="value mono">${escapeHtml(moneyMXN(totals.grand))}</div>
    </div>
    <div class="card">
      <div class="label">${ICONS.wallet}Efectivo</div>
      <div class="value mono">${escapeHtml(moneyMXN(totals.cash))}</div>
    </div>
    <div class="card">
      <div class="label">${ICONS.card}Tarjeta</div>
      <div class="value mono">${escapeHtml(moneyMXN(totals.card))}</div>
    </div>
    <div class="card">
      <div class="label">${ICONS.list}Tickets</div>
      <div class="value mono">${escapeHtml(String(totals.tickets))}</div>
    </div>
    <div class="card">
      <div class="label">${ICONS.chicken}Pollos (porciones)</div>
      <div class="value mono">${escapeHtml(String(counts.pollo_porciones_total))}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${ICONS.package}Productos vendidos (por método)</div>
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="right">Total</th>
          <th class="right">Efectivo</th>
          <th class="right">Tarjeta</th>
        </tr>
      </thead>
      <tbody>
        ${productRows
          .map(
            ([label, split]) => `
          <tr>
            <td>${escapeHtml(label)}</td>
            <td class="mono right">${escapeHtml(String(safeNum(split.totalQty)))}</td>
            <td class="mono right">${escapeHtml(String(safeNum(split.cashQty)))}</td>
            <td class="mono right">${escapeHtml(String(safeNum(split.cardQty)))}</td>
          </tr>`
          )
          .join("")}
        <tr class="total">
          <td><b>Total (productos)</b></td>
          <td class="mono right"><b>${escapeHtml(
            String(
              safeNum(productsByPayment.paquetes.totalQty) +
                safeNum(productsByPayment.especialidades.totalQty) +
                safeNum(productsByPayment.miercoles.totalQty) +
                safeNum(productsByPayment.pollos_individuales.totalQty)
            )
          )}</b></td>
          <td class="mono right"><b>${escapeHtml(
            String(
              safeNum(productsByPayment.paquetes.cashQty) +
                safeNum(productsByPayment.especialidades.cashQty) +
                safeNum(productsByPayment.miercoles.cashQty) +
                safeNum(productsByPayment.pollos_individuales.cashQty)
            )
          )}</b></td>
          <td class="mono right"><b>${escapeHtml(
            String(
              safeNum(productsByPayment.paquetes.cardQty) +
                safeNum(productsByPayment.especialidades.cardQty) +
                safeNum(productsByPayment.miercoles.cardQty) +
                safeNum(productsByPayment.pollos_individuales.cardQty)
            )
          )}</b></td>
        </tr>
      </tbody>
    </table>
  </div>

  ${
    paquetesDetailed.length
      ? `
  <div class="section">
    <div class="section-title">${ICONS.package}Paquetes (detalle por producto)</div>
    <table>
      <thead>
        <tr>
          <th>Paquete</th>
          <th class="right">Cant.</th>
          <th class="right">Total</th>
          <th class="right">Efectivo</th>
          <th class="right">Tarjeta</th>
        </tr>
      </thead>
      <tbody>
        ${paquetesDetailed
          .map(
            (p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td class="mono right">${escapeHtml(String(safeNum(p.qty)))}</td>
            <td class="mono right">${escapeHtml(moneyMXN(p.total))}</td>
            <td class="mono right">${escapeHtml(moneyMXN(p.cashTotal))}</td>
            <td class="mono right">${escapeHtml(moneyMXN(p.cardTotal))}</td>
          </tr>`
          )
          .join("")}
        <tr class="total">
          <td><b>Subtotal paquetes</b></td>
          <td class="mono right"><b>${escapeHtml(String(pkSubtotal.qty))}</b></td>
          <td class="mono right"><b>${escapeHtml(moneyMXN(pkSubtotal.total))}</b></td>
          <td class="mono right"><b>${escapeHtml(moneyMXN(pkSubtotal.cash))}</b></td>
          <td class="mono right"><b>${escapeHtml(moneyMXN(pkSubtotal.card))}</b></td>
        </tr>
      </tbody>
    </table>
  </div>`
      : `
  <div class="section">
    <div class="section-title">${ICONS.package}Paquetes (detalle por producto)</div>
    <div class="sub muted">Sin paquetes vendidos en este rango.</div>
  </div>`
  }

  ${
    especialidadesDetailed.length
      ? `
  <div class="section">
    <div class="section-title">${ICONS.package}Especialidades (detalle por producto)</div>
    <table>
      <thead>
        <tr>
          <th>Especialidad</th>
          <th class="right">Cant.</th>
          <th class="right">Total</th>
          <th class="right">Efectivo</th>
          <th class="right">Tarjeta</th>
        </tr>
      </thead>
      <tbody>
        ${especialidadesDetailed
          .map(
            (p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td class="mono right">${escapeHtml(String(safeNum(p.qty)))}</td>
            <td class="mono right">${escapeHtml(moneyMXN(p.total))}</td>
            <td class="mono right">${escapeHtml(moneyMXN(p.cashTotal))}</td>
            <td class="mono right">${escapeHtml(moneyMXN(p.cardTotal))}</td>
          </tr>`
          )
          .join("")}
        <tr class="total">
          <td><b>Subtotal especialidades</b></td>
          <td class="mono right"><b>${escapeHtml(String(espSubtotal.qty))}</b></td>
          <td class="mono right"><b>${escapeHtml(moneyMXN(espSubtotal.total))}</b></td>
          <td class="mono right"><b>${escapeHtml(moneyMXN(espSubtotal.cash))}</b></td>
          <td class="mono right"><b>${escapeHtml(moneyMXN(espSubtotal.card))}</b></td>
        </tr>
      </tbody>
    </table>
  </div>`
      : `
  <div class="section">
    <div class="section-title">${ICONS.package}Especialidades (detalle por producto)</div>
    <div class="sub muted">Sin especialidades vendidas en este rango.</div>
  </div>`
  }

  <div class="section">
    <div class="section-title">${ICONS.chicken}Consumo de pollos (por método)</div>
    <table>
      <thead>
        <tr>
          <th>Tipo</th>
          <th class="right">Total</th>
          <th class="right">Efectivo</th>
          <th class="right">Tarjeta</th>
        </tr>
      </thead>
      <tbody>
        <tr class="total">
          <td><b>Total porciones</b></td>
          <td class="mono right"><b>${escapeHtml(String(safeNum(polloByPayment.porcionesTotal.totalQty)))}</b></td>
          <td class="mono right"><b>${escapeHtml(String(safeNum(polloByPayment.porcionesTotal.cashQty)))}</b></td>
          <td class="mono right"><b>${escapeHtml(String(safeNum(polloByPayment.porcionesTotal.cardQty)))}</b></td>
        </tr>

        <tr>
          <td>Porciones (enteros + medios + cuartos)</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.porcionesTotal.totalQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.porcionesTotal.cashQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.porcionesTotal.cardQty)))}</td>
        </tr>

        <tr>
          <td>Equivalente (pollos completos)</td>
          <td class="mono right">${escapeHtml(String(polloByPayment.equivalenteTotal.total.toFixed(2)))}</td>
          <td class="mono right">${escapeHtml(String(polloByPayment.equivalenteTotal.cash.toFixed(2)))}</td>
          <td class="mono right">${escapeHtml(String(polloByPayment.equivalenteTotal.card.toFixed(2)))}</td>
        </tr>

        <tr>
          <td>Enteros (1 pollo)</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.enteros.totalQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.enteros.cashQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.enteros.cardQty)))}</td>
        </tr>

        <tr>
          <td>Medios (1/2 pollo)</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.medios.totalQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.medios.cashQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.medios.cardQty)))}</td>
        </tr>

        <tr>
          <td>Cuartos (1/4 pollo)</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.cuartos.totalQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.cuartos.cashQty)))}</td>
          <td class="mono right">${escapeHtml(String(safeNum(polloByPayment.cuartos.cardQty)))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">${ICONS.list}Otros items</div>
    <table>
      <thead><tr><th>Concepto</th><th class="right">Cantidad</th></tr></thead>
      <tbody>
        ${otherRows
          .map(
            ([label, val]) => `
          <tr>
            <td>${escapeHtml(String(label))}</td>
            <td class="mono right">${escapeHtml(String(val))}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">${ICONS.plus}Extras y desechables (detalle por producto)</div>

    <div class="grid2">
      <div class="card">
        <div class="label"><span class="pill">TOTAL (Extras + Desechables)</span></div>
        <div class="value mono">${escapeHtml(moneyMXN(extrasGrand))}</div>
        <div class="sub mono"><b>Efectivo:</b> ${escapeHtml(moneyMXN(extrasCash))}</div>
        <div class="sub mono"><b>Tarjeta:</b> ${escapeHtml(moneyMXN(extrasCard))}</div>
      </div>

      <div class="card">
        <div class="label"><span class="pill">NOTA</span></div>
        <div class="sub muted">Aquí se desglosa por producto vendido en categorías <b>Extras</b> y <b>Desechables</b>.</div>
        <div class="sub muted">Los “Incluido en paquete” (gratis) nunca entran en este detalle.</div>
      </div>
    </div>

    ${
      extrasOnly.length
        ? `
    <div class="section" style="margin-top:12px;">
      <div class="section-title">${ICONS.plus}Extras (detalle)</div>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th class="right">Cant.</th>
            <th class="right">Total</th>
            <th class="right">Efectivo</th>
            <th class="right">Tarjeta</th>
          </tr>
        </thead>
        <tbody>
          ${extrasOnly
            .map(
              (e) => `
            <tr>
              <td>${escapeHtml(e.name)}</td>
              <td class="mono right">${escapeHtml(String(safeNum(e.qty)))}</td>
              <td class="mono right">${escapeHtml(moneyMXN(e.total))}</td>
              <td class="mono right">${escapeHtml(moneyMXN(e.cashTotal))}</td>
              <td class="mono right">${escapeHtml(moneyMXN(e.cardTotal))}</td>
            </tr>
          `
            )
            .join("")}
          <tr class="total">
            <td><b>Subtotal extras</b></td>
            <td class="mono right"><b>${escapeHtml(String(extrasOnly.reduce((a, x) => a + safeNum(x.qty), 0)))}</b></td>
            <td class="mono right"><b>${escapeHtml(moneyMXN(extrasOnly.reduce((a, x) => a + safeNum(x.total), 0)))}</b></td>
            <td class="mono right"><b>${escapeHtml(moneyMXN(extrasOnly.reduce((a, x) => a + safeNum(x.cashTotal), 0)))}</b></td>
            <td class="mono right"><b>${escapeHtml(moneyMXN(extrasOnly.reduce((a, x) => a + safeNum(x.cardTotal), 0)))}</b></td>
          </tr>
        </tbody>
      </table>
    </div>`
        : `
    <div class="section" style="margin-top:12px;">
      <div class="sub muted">Sin extras vendidos en este rango.</div>
    </div>`
    }

    ${
      desechablesOnly.length
        ? `
    <div class="section" style="margin-top:12px;">
      <div class="section-title">${ICONS.plus}Desechables (detalle)</div>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th class="right">Cant.</th>
            <th class="right">Total</th>
            <th class="right">Efectivo</th>
            <th class="right">Tarjeta</th>
          </tr>
        </thead>
        <tbody>
          ${desechablesOnly
            .map(
              (e) => `
            <tr>
              <td>${escapeHtml(e.name)}</td>
              <td class="mono right">${escapeHtml(String(safeNum(e.qty)))}</td>
              <td class="mono right">${escapeHtml(moneyMXN(e.total))}</td>
              <td class="mono right">${escapeHtml(moneyMXN(e.cashTotal))}</td>
              <td class="mono right">${escapeHtml(moneyMXN(e.cardTotal))}</td>
            </tr>
          `
            )
            .join("")}
          <tr class="total">
            <td><b>Subtotal desechables</b></td>
            <td class="mono right"><b>${escapeHtml(String(desechablesOnly.reduce((a, x) => a + safeNum(x.qty), 0)))}</b></td>
            <td class="mono right"><b>${escapeHtml(moneyMXN(desechablesOnly.reduce((a, x) => a + safeNum(x.total), 0)))}</b></td>
            <td class="mono right"><b>${escapeHtml(moneyMXN(desechablesOnly.reduce((a, x) => a + safeNum(x.cashTotal), 0)))}</b></td>
            <td class="mono right"><b>${escapeHtml(moneyMXN(desechablesOnly.reduce((a, x) => a + safeNum(x.cardTotal), 0)))}</b></td>
          </tr>
        </tbody>
      </table>
    </div>`
        : `
    <div class="section" style="margin-top:12px;">
      <div class="sub muted">Sin desechables vendidos en este rango.</div>
    </div>`
    }
  </div>

  <div class="footer">
    <b>Regla:</b> El pollo se cuenta solo desde categorías <i>Pollos</i> o <i>Incluido en paquete</i>.
    <br/>
    Así evitamos doble conteo cuando una especialidad se llama “Veracruz 1 pollo”.
  </div>
</body>
</html>`;
}

// =======================
// IPC
// =======================
export function registerSalesIpc() {
  // ✅ Crear venta (con seguro de consistencia)
  ipcMain.handle("sales:create", (_event, payload: CreateSaleInput) => {
    const db = getDb();

    if (!payload?.items?.length) {
      return { ok: false, message: "Agrega al menos un producto." };
    }

    const saleId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const paymentMethod = payload.paymentMethod === "card" ? "card" : "cash";
    const total = payload.items.reduce((acc, it) => acc + safeNum(it.qty) * safeNum(it.price), 0);

    const insertSale = db.prepare(
      `INSERT INTO sales (id, created_at, total, payment_method, notes) VALUES (?, ?, ?, ?, ?)`
    );

    const insertItem = db.prepare(
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal, category, flavor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const selectInsertedItems = db.prepare(
      `SELECT name, qty, category, price
       FROM sale_items
       WHERE sale_id = ?`
    );

    const tx = db.transaction(() => {
      // 1) Insert sale
      insertSale.run(saleId, createdAt, safeNum(total), paymentMethod, payload.notes ?? null);

      // 2) Insert main items
      for (const it of payload.items) {
        const itemId = crypto.randomUUID();
        const qty = safeNum(it.qty);
        const price = safeNum(it.price);
        const subtotal = qty * price;

        insertItem.run(
          itemId,
          saleId,
          it.name,
          qty,
          price,
          subtotal,
          it.category ?? "Sin categoría",
          it.flavor ?? null
        );

        // 3) Insert included extras for bundles
        const catN = normText(it.category ?? "Sin categoría");
        const isBundle = catN === "paquetes" || catN === "especialidades" || catN === "miercoles" || catN === "miércoles";

        if (isBundle && qty > 0) {
          const baseName = (it.name.split(" - ")[0]?.trim() || it.name).trim();

          if (CUT_DEBUG) {
            dbg("[SALE][BUNDLE] buscando receta:", {
              itemName: it.name,
              baseName,
              key: normKey(baseName),
              category: it.category,
              qty,
            });
          }

          const extras = getPackageExtras(db, it.name, baseName, it.customOption);

          if (!extras.length) {
            console.warn("❌ [SALE] NO SE ENCONTRÓ packageIncludes para:", {
              itemName: it.name,
              baseName,
              key: normKey(baseName),
              category: it.category,
            });
          } else if (CUT_DEBUG) {
            dbg("✅ [SALE] packageIncludes OK:", {
              itemName: it.name,
              baseName,
              extras,
            });
          }

          for (const extra of extras) {
            const extraId = crypto.randomUUID();
            const extraQty = qty * safeNum(extra.qty);
            insertItem.run(extraId, saleId, extra.name, extraQty, 0, 0, "Incluido en paquete", it.flavor ?? null);
          }
        }
      }

      // 4) Seguro: validar incluidos
      const expected = expectedIncludedFromMainItems(payload.items);
      const inserted = selectInsertedItems.all(saleId) as Array<{
        name: string;
        qty: number;
        category: string;
        price: number;
      }>;
      const actual = actualIncludedFromDbRows(inserted);
      const errors = compareExpectedVsActual(expected, actual);

      if (errors.length) {
        throw new Error("Venta inconsistente. Rollback.\n" + errors.join("\n"));
      }
    });

    try {
      tx();
      return { ok: true, saleId, total: safeNum(total) };
    } catch (err: any) {
      console.error("[sales:create] ERROR:", err?.message || err);
      return {
        ok: false,
        message:
          "No se guardó la venta (seguro activado). Se detectó inconsistencia en incluidos.\n" +
          String(err?.message ?? err),
      };
    }
  });

  // ✅ Resumen (para pantalla corte)
  ipcMain.handle("sales:summary", (_event, payload: { from?: string; to?: string }) => {
    const db = getDb();

    const tzOffset = "-05:00";
    const todayCancun = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Cancun" }));
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const fromStr = payload?.from ?? formatDate(todayCancun);
    const toStr = payload?.to ?? fromStr;

    const start = new Date(`${fromStr}T00:00:00.000${tzOffset}`);
    const end = new Date(`${toStr}T23:59:59.999${tzOffset}`);

    dbg("\n==============================");
    dbg("[CUT] sales:summary payload:", payload);
    dbg("[CUT] from/to:", fromStr, toStr);
    dbg("[CUT] start/end ISO:", start.toISOString(), end.toISOString());
    dbg("==============================");

    const rows = db
      .prepare(
        `SELECT
          s.id as sale_id,
          s.created_at as created_at,
          s.total as sale_total,
          s.payment_method as payment_method,
          s.notes as sale_notes,
          si.name as item_name,
          si.qty as item_qty,
          si.price as item_price,
          si.subtotal as item_subtotal,
          si.category as item_category,
          si.flavor as item_flavor
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.created_at BETWEEN ? AND ?
        ORDER BY s.created_at DESC`
      )
      .all(start.toISOString(), end.toISOString()) as Array<{
      sale_id: string;
      created_at: string;
      sale_total: number;
      payment_method: string;
      sale_notes?: string;
      item_name: string;
      item_qty: number;
      item_price: number;
      item_subtotal: number;
      item_category?: string;
      item_flavor?: string | null;
    }>;

    dbg("[CUT] rows:", rows.length);

    const byTicket = new Map<
      string,
      {
        saleId: string;
        createdAt: string;
        total: number;
        paymentMethod: "cash" | "card";
        notes?: string;
        items: Array<{
          name: string;
          qty: number;
          price: number;
          subtotal: number;
          category: string;
          flavor?: string | null;
        }>;
      }
    >();

    const productsMap = new Map<string, { name: string; category: string; qty: number; subtotal: number }>();
    const categories = new Map<string, { qty: number; total: number }>();

    const extrasAggMap = new Map<string, ExtraAgg>();

    // ✅ NUEVO: maps para detalle de paquetes/especialidades
    const paquetesAggMap = new Map<string, MainItemAgg>();
    const especialidadesAggMap = new Map<string, MainItemAgg>();

    const countRows: Array<{ item_name: string; item_qty: number; item_category?: string }> = [];

    // ✅ Para construir splits (productos + pollos) por método
    const rowsForPaymentSplit: Array<{
      item_name: string;
      item_qty: number;
      item_category?: string;
      payment_method: string;
      item_price: number;
      item_subtotal: number;
    }> = [];

    for (const row of rows) {
      const category = row.item_category || "Sin categoría";
      const price = safeNum(row.item_price);
      const catN = normText(category);

      countRows.push({ item_name: row.item_name, item_qty: safeNum(row.item_qty), item_category: category });
      rowsForPaymentSplit.push({
        item_name: row.item_name,
        item_qty: safeNum(row.item_qty),
        item_category: category,
        payment_method: row.payment_method,
        item_price: price,
        item_subtotal: safeNum(row.item_subtotal),
      });

      if (!byTicket.has(row.sale_id)) {
        byTicket.set(row.sale_id, {
          saleId: row.sale_id,
          createdAt: row.created_at,
          total: safeNum(row.sale_total),
          paymentMethod: row.payment_method === "card" ? "card" : "cash",
          notes: row.sale_notes ?? undefined,
          items: [],
        });
      }

      byTicket.get(row.sale_id)!.items.push({
        name: row.item_name,
        qty: safeNum(row.item_qty),
        price,
        subtotal: safeNum(row.item_subtotal),
        category,
        flavor: row.item_flavor ?? null,
      });

      const isIncludedFree = catN.includes("incluido") && price === 0;

      if (!isIncludedFree) {
        const key = `${row.item_name}__${category}`;
        if (!productsMap.has(key)) productsMap.set(key, { name: row.item_name, category, qty: 0, subtotal: 0 });
        const prod = productsMap.get(key)!;
        prod.qty += safeNum(row.item_qty);
        prod.subtotal += safeNum(row.item_subtotal);

        if (!categories.has(category)) categories.set(category, { qty: 0, total: 0 });
        const cat = categories.get(category)!;
        cat.qty += safeNum(row.item_qty);
        cat.total += safeNum(row.item_subtotal);

        const pm: Payment = row.payment_method === "card" ? "card" : "cash";

        // ✅ Extras/Desechables
        if (isExtraOrDesechableCategory(category)) {
          pushExtraAgg(extrasAggMap, row.item_name, safeNum(row.item_qty), safeNum(row.item_subtotal), pm);
        }

        // ✅ NUEVO: detalle de Paquetes / Especialidades (por producto)
        const baseName = (row.item_name.split(" - ")[0]?.trim() || row.item_name).trim();

        if (catN.includes("paquetes")) {
          pushMainAgg(paquetesAggMap, baseName, safeNum(row.item_qty), safeNum(row.item_subtotal), pm);
        } else if (catN.includes("especialidades")) {
          pushMainAgg(especialidadesAggMap, baseName, safeNum(row.item_qty), safeNum(row.item_subtotal), pm);
        }
      }
    }

    const totalsRow = db
      .prepare(
        `SELECT 
          COALESCE(SUM(total),0) as grand, 
          COUNT(*) as tickets,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_total
         FROM sales
         WHERE created_at BETWEEN ? AND ?`
      )
      .get(start.toISOString(), end.toISOString()) as {
      grand: number;
      tickets: number;
      cash_total: number;
      card_total: number;
    };

    const counts = buildCountsFromRows(countRows);

    // ✅ SPLIT de productos vendidos por método
    const productsByPayment = buildProductsByPaymentFromRows(rowsForPaymentSplit);

    // ✅ SPLIT de pollos (porciones) por método
    const polloByPayment = buildPolloByPaymentFromRows(rowsForPaymentSplit);

    const paquetesDetailed = sortMainAgg(Array.from(paquetesAggMap.values()));
    const especialidadesDetailed = sortMainAgg(Array.from(especialidadesAggMap.values()));

    if (CUT_DEBUG) {
      dbg("\n[CUT][PRODUCTS SPLIT] productos vendidos por método:", productsByPayment);
      dbg("\n[CUT][POLLO SPLIT] pollos por método:", polloByPayment);

      dbg("\n[CUT][PAQUETES DETALLE] ===");
      for (const p of paquetesDetailed)
        dbg("  ", p.name, "qty=", p.qty, "total=", p.total, "cash=", p.cashTotal, "card=", p.cardTotal);

      dbg("\n[CUT][ESPECIALIDADES DETALLE] ===");
      for (const p of especialidadesDetailed)
        dbg("  ", p.name, "qty=", p.qty, "total=", p.total, "cash=", p.cashTotal, "card=", p.cardTotal);

      dbg("\n[CUT][EXTRAS] === DETALLE POR PRODUCTO (cash/card) ===");
      for (const e of sortExtrasAgg(Array.from(extrasAggMap.values()))) {
        dbg("  ", e.name, "qty=", e.qty, "total=", e.total, "cash=", e.cashTotal, "card=", e.cardTotal);
      }
      dbg("========================================\n");
    }

    return {
      ok: true,
      data: {
        range: { from: fromStr, to: toStr },
        totals: {
          grand: safeNum(totalsRow.grand),
          cash: safeNum(totalsRow.cash_total),
          card: safeNum(totalsRow.card_total),
          tickets: safeNum(totalsRow.tickets),

          // ✅ productos vendidos por método (cantidades)
          productsByPayment,

          // ✅ NUEVO: detalle por producto (paquetes/especialidades)
          paquetesDetailed,
          especialidadesDetailed,

          // ✅ pollos/porciones por método (cantidades + equivalente)
          polloByPayment,

          categories: Array.from(categories.entries()).map(([category, v]) => ({
            category,
            qty: safeNum(v.qty),
            total: safeNum(v.total),
          })),

          // mantiene tus totales “globales” como antes
          polloTotals: {
            enteros: counts.pollo_entero,
            medios: counts.pollo_medio,
            cuartos: counts.pollo_cuarto,
            porcionesTotal: counts.pollo_porciones_total,
            equivalenteTotal: Number(counts.pollo_equivalente_total.toFixed(2)),
          },

          extrasDetailed: sortExtrasAgg(Array.from(extrasAggMap.values())),
        },

        products: Array.from(productsMap.values()).sort((a, b) => b.subtotal - a.subtotal),
        tickets: Array.from(byTicket.values()),
      },
    };
  });

  // ✅ PDF corte
  ipcMain.handle("sales:cutPdf", async (_event, payload: { from?: string; to?: string }) => {
    const db = getDb();

    const tzOffset = "-05:00";
    const todayCancun = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Cancun" }));
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const fromStr = payload?.from ?? formatDate(todayCancun);
    const toStr = payload?.to ?? fromStr;

    const start = new Date(`${fromStr}T00:00:00.000${tzOffset}`);
    const end = new Date(`${toStr}T23:59:59.999${tzOffset}`);

    const totalsRow = db
      .prepare(
        `SELECT 
          COALESCE(SUM(total),0) as grand, 
          COUNT(*) as tickets,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_total
         FROM sales
         WHERE created_at BETWEEN ? AND ?`
      )
      .get(start.toISOString(), end.toISOString()) as {
      grand: number;
      tickets: number;
      cash_total: number;
      card_total: number;
    };

    const itemsRows = db
      .prepare(
        `SELECT si.name as item_name, si.qty as item_qty, si.category as item_category
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         WHERE s.created_at BETWEEN ? AND ?`
      )
      .all(start.toISOString(), end.toISOString()) as Array<{
      item_name: string;
      item_qty: number;
      item_category?: string;
    }>;

    // ✅ Rows con payment_method para construir splits (productos + pollos + extras + detalle)
    const rowsWithPay = db
      .prepare(
        `SELECT
          s.payment_method as payment_method,
          si.name as item_name,
          si.qty as item_qty,
          si.price as item_price,
          si.subtotal as item_subtotal,
          si.category as item_category
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.created_at BETWEEN ? AND ?`
      )
      .all(start.toISOString(), end.toISOString()) as Array<{
      payment_method: string;
      item_name: string;
      item_qty: number;
      item_price: number;
      item_subtotal: number;
      item_category?: string;
    }>;

    const counts = buildCountsFromRows(itemsRows);
    const rangeLabel = fromStr === toStr ? fromStr : `${fromStr} — ${toStr}`;

    // ✅ Extras detailed (cash/card)
    const extrasAggMap = new Map<string, ExtraAgg>();

    // ✅ NUEVO: detalle de paquetes/especialidades en PDF
    const paquetesAggMap = new Map<string, MainItemAgg>();
    const especialidadesAggMap = new Map<string, MainItemAgg>();

    for (const r of rowsWithPay) {
      const category = r.item_category || "Sin categoría";
      const catN = normText(category);
      const price = safeNum(r.item_price);

      const isIncludedFree = catN.includes("incluido") && price === 0;
      if (isIncludedFree) continue;

      const pm: Payment = r.payment_method === "card" ? "card" : "cash";
      const baseName = (r.item_name.split(" - ")[0]?.trim() || r.item_name).trim();

      // Extras/Desechables
      if (isExtraOrDesechableCategory(category)) {
        pushExtraAgg(extrasAggMap, r.item_name, safeNum(r.item_qty), safeNum(r.item_subtotal), pm);
      }

      // ✅ Detalle paquetes/especialidades
      if (catN.includes("paquetes")) {
        pushMainAgg(paquetesAggMap, baseName, safeNum(r.item_qty), safeNum(r.item_subtotal), pm);
      } else if (catN.includes("especialidades")) {
        pushMainAgg(especialidadesAggMap, baseName, safeNum(r.item_qty), safeNum(r.item_subtotal), pm);
      }
    }

    const extrasDetailed = sortExtrasAgg(Array.from(extrasAggMap.values()));

    // ✅ Productos vendidos split (cash/card)
    const productsByPayment = buildProductsByPaymentFromRows(rowsWithPay);

    // ✅ Pollos/porciones split (cash/card)
    const polloByPayment = buildPolloByPaymentFromRows(rowsWithPay);

    // ✅ NUEVO: detalle listas para PDF
    const paquetesDetailed = sortMainAgg(Array.from(paquetesAggMap.values()));
    const especialidadesDetailed = sortMainAgg(Array.from(especialidadesAggMap.values()));

    const html = buildCutPdfHtml({
      rangeLabel,
      from: fromStr,
      to: toStr,
      totals: {
        grand: safeNum(totalsRow.grand),
        tickets: safeNum(totalsRow.tickets),
        cash: safeNum(totalsRow.cash_total),
        card: safeNum(totalsRow.card_total),
      },
      counts,
      productsByPayment,
      polloByPayment,
      extrasDetailed,

      paquetesDetailed,
      especialidadesDetailed,
    });

    const pdfWin = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });

    await pdfWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));

    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.55, bottom: 0.55, left: 0.55, right: 0.55 },
    });

    pdfWin.destroy();

    return {
      ok: true,
      base64: pdfBuffer.toString("base64"),
      filename: `corte_${fromStr}_${toStr}.pdf`,
    };
  });

  // ✅ flavors:list
  ipcMain.handle("flavors:list", () => {
    const db = getDb();
    const rows = db.prepare("SELECT id, name FROM flavors WHERE is_deleted = 0 ORDER BY name ASC").all();
    return { ok: true, rows };
  });

  // ✅ flavors admin list
  ipcMain.handle(
    "flavors:admin:list",
    (_event, payload: { page: number; pageSize: number; search?: string; showDeleted?: boolean }) => {
      const db = getDb();
      const { page = 1, pageSize = 10, search = "", showDeleted = false } = payload;

      let whereClause = "";
      const params: (string | number)[] = [];

      if (!showDeleted) whereClause = "WHERE is_deleted = 0";

      if (search.trim()) {
        const searchTerm = `%${search.toLowerCase()}%`;
        whereClause = whereClause ? `${whereClause} AND LOWER(name) LIKE ?` : "WHERE LOWER(name) LIKE ?";
        params.push(searchTerm);
      }

      const countQuery = `SELECT COUNT(*) as total FROM flavors ${whereClause}`;
      const total = (db.prepare(countQuery).all(...params)[0] as { total: number }).total;

      const offset = (page - 1) * pageSize;
      const query = `
        SELECT id, name, is_deleted, created_at
        FROM flavors
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      const rows = db.prepare(query).all(...params, pageSize, offset) as Array<{
        id: string;
        name: string;
        is_deleted: number;
        created_at: string;
      }>;

      return {
        ok: true,
        data: rows,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    }
  );

  ipcMain.handle("flavors:create", (_event, payload: { name: string }) => {
    const db = getDb();

    if (!payload?.name?.trim()) return { ok: false, message: "El nombre del sabor es requerido." };

    const name = payload.name.trim();

    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare("INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, ?, ?)").run(id, name, 0, now);
      return { ok: true, id, name };
    } catch (err: any) {
      if (String(err?.message ?? "").includes("UNIQUE")) return { ok: false, message: "Este sabor ya existe." };
      return { ok: false, message: "Error al crear sabor." };
    }
  });

  ipcMain.handle("flavors:delete", (_event, payload: { id: string }) => {
    const db = getDb();
    if (!payload?.id) return { ok: false, message: "ID requerido." };
    db.prepare("UPDATE flavors SET is_deleted = 1 WHERE id = ?").run(payload.id);
    return { ok: true };
  });

  ipcMain.handle("flavors:restore", (_event, payload: { id: string }) => {
    const db = getDb();
    if (!payload?.id) return { ok: false, message: "ID requerido." };
    db.prepare("UPDATE flavors SET is_deleted = 0 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
}
