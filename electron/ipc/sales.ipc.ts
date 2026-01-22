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
  cloned[salsaIdx] = { ...cloned[salsaIdx], qty: desiredSalsas };
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
 * Esto corrige el bug de:
 * "Peninsular 1 Pollo" (UI) vs "Peninsular 1 pollo" (schema)
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
  pollo_porciones_total: number; // enteros + medios + cuartos
  pollo_equivalente_total: number; // equivalente en pollos completos

  // Otros
  extras: number;
  desechables: number;
  otros: number;
};

/**
 * ✅ REGLA CLAVE PARA NO CONTAR DOBLE:
 * Solo consideramos pollo si:
 *  - category es "Pollos" (pollo vendido directo)
 *  - o category contiene "incluido" (pollo insertado como incluido)
 *
 * Porque Especialidades se llaman "Veracruz 1 pollo" y eso NO debe contarse
 * como pollo: el pollo real viene en el item "Incluido en paquete".
 */
function buildCountsFromRows(
  rows: Array<{ item_name: string; item_qty: number; item_category?: string }>
): CountSummary {
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
// Seguro al guardar: validar incluidos
// =======================
function expectedIncludedFromMainItems(mainItems: SaleItemInput[]) {
  const expectedMap = new Map<string, number>(); // key: normalizedName -> qty

  for (const it of mainItems) {
    const qtyMain = safeNum(it.qty);
    if (qtyMain <= 0) continue;

    const catN = normText(it.category ?? "Sin categoría");

    const isBundle =
      catN === "paquetes" ||
      catN === "especialidades" ||
      catN === "miercoles" ||
      catN === "miércoles";

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
// PDF HTML anti-cortes
// =======================
function buildCutPdfHtml(args: {
  rangeLabel: string;
  from: string;
  to: string;
  totals: { grand: number; tickets: number; cash: number; card: number };
  counts: CountSummary;
}) {
  const { rangeLabel, from, to, totals, counts } = args;

  const productRows: Array<[string, number]> = [
    ["Paquetes vendidos", counts.paquetes],
    ["Especialidades vendidas", counts.especialidades],
    ["Miércoles vendidos", counts.miercoles],
    ["Pollos individuales vendidos", counts.pollos_individuales],
  ];

  const polloRows: Array<[string, number | string]> = [
    ["Porciones (enteros + medios + cuartos)", counts.pollo_porciones_total],
    ["Equivalente (pollos completos)", counts.pollo_equivalente_total.toFixed(2)],
    ["Enteros (1 pollo)", counts.pollo_entero],
    ["Medios (1/2 pollo)", counts.pollo_medio],
    ["Cuartos (1/4 pollo)", counts.pollo_cuarto],
  ];

  const otherRows: Array<[string, number]> = [
    ["Extras (sin incluidos)", counts.extras],
    ["Desechables (sin incluidos)", counts.desechables],
    ["Otros", counts.otros],
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Corte</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 18px; color: #111; }

    .top { display:flex; justify-content:space-between; align-items:flex-start; gap: 16px; }
    .brand { font-size: 18px; font-weight: 800; }
    .sub { font-size: 12px; color: #555; margin-top: 4px; line-height: 1.35; }

    .cards { display:grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 14px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 10px; background: #fff; }
    .card .label { font-size: 11px; color: #555; }
    .card .value { font-size: 16px; font-weight: 800; margin-top: 6px; }

    .section { margin-top: 18px; }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      color: #333;
      margin-bottom: 8px;
      border-bottom: 2px solid #ddd;
      padding-bottom: 4px;
    }

    table { width: 100%; border-collapse: collapse; border: 1px solid #eee; border-radius: 10px; overflow: hidden; }
    thead th { background: #f7f7f7; }
    th, td { border-bottom: 1px solid #eee; padding: 9px 8px; font-size: 12px; }
    th { text-align:left; color:#555; font-size: 11px; }
    td:last-child, th:last-child { text-align:right; }
    tr.total td { font-weight: 800; background: #f0f0f0; }

    .footer { margin-top: 14px; font-size: 11px; color:#666; line-height: 1.35; }

    @page { size: A4; margin: 12mm; }

    .card, .section, .top { break-inside: avoid; page-break-inside: avoid; }
    table { break-inside: auto; page-break-inside: auto; }
    tr, td, th { break-inside: avoid; page-break-inside: avoid; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }

    @media print {
      body { padding: 0; }
      .cards { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .card .value { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <div class="brand">Pollo Pirata POS — Corte</div>
      <div class="sub">Rango: <b>${escapeHtml(rangeLabel)}</b></div>
      <div class="sub">Fechas: ${escapeHtml(from)} a ${escapeHtml(to)}</div>
      <div class="sub">Generado: ${escapeHtml(new Date().toLocaleString("es-MX"))}</div>
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="label">Total vendido</div>
      <div class="value">${escapeHtml(moneyMXN(totals.grand))}</div>
    </div>
    <div class="card">
      <div class="label">Efectivo</div>
      <div class="value">${escapeHtml(moneyMXN(totals.cash))}</div>
    </div>
    <div class="card">
      <div class="label">Tarjeta</div>
      <div class="value">${escapeHtml(moneyMXN(totals.card))}</div>
    </div>
    <div class="card">
      <div class="label">Tickets</div>
      <div class="value">${escapeHtml(String(totals.tickets))}</div>
    </div>
    <div class="card">
      <div class="label">Pollos (porciones)</div>
      <div class="value">${escapeHtml(String(counts.pollo_porciones_total))}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📦 Productos Vendidos</div>
    <table>
      <thead><tr><th>Concepto</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${productRows.map(([label, val]) => `
          <tr>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(String(val))}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">🍗 Consumo de Pollos</div>
    <table>
      <thead><tr><th>Tipo</th><th>Cantidad</th></tr></thead>
      <tbody>
        <tr class="total">
          <td><b>Total porciones</b></td>
          <td><b>${escapeHtml(String(counts.pollo_porciones_total))}</b></td>
        </tr>
        ${polloRows.map(([label, val]) => `
          <tr>
            <td>${escapeHtml(String(label))}</td>
            <td>${escapeHtml(String(val))}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">📋 Otros Items</div>
    <table>
      <thead><tr><th>Concepto</th><th>Cantidad</th></tr></thead>
      <tbody>
        ${otherRows.map(([label, val]) => `
          <tr>
            <td>${escapeHtml(String(label))}</td>
            <td>${escapeHtml(String(val))}</td>
          </tr>`).join("")}
      </tbody>
    </table>
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

        const isBundle =
          catN === "paquetes" ||
          catN === "especialidades" ||
          catN === "miercoles" ||
          catN === "miércoles";

        if (isBundle && qty > 0) {
          const baseName = (it.name.split(" - ")[0]?.trim() || it.name).trim();

          // ✅ Debug de match de receta
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

          // ✅ Si NO hay extras, ES AQUÍ donde te estaba fallando por mismatch de nombre
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

            insertItem.run(
              extraId,
              saleId,
              extra.name,
              extraQty,
              0,
              0,
              "Incluido en paquete",
              it.flavor ?? null
            );
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

    // Items (para tickets + agregaciones)
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

    // Tickets
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

    // Products aggregate (NO incluye incluidos gratis)
    const productsMap = new Map<string, { name: string; category: string; qty: number; subtotal: number }>();
    const categories = new Map<string, { qty: number; total: number }>();

    const countRows: Array<{ item_name: string; item_qty: number; item_category?: string }> = [];

    for (const row of rows) {
      const category = row.item_category || "Sin categoría";
      const price = safeNum(row.item_price);
      const catN = normText(category);

      countRows.push({ item_name: row.item_name, item_qty: safeNum(row.item_qty), item_category: category });

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

      // Ignorar incluidos gratis para agregados por producto/categoría
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
      }
    }

    // Totales confiables desde sales
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

    // =======================
    // DEBUG: imprime exactamente qué pollos cuenta y cuáles ignora
    // =======================
    if (CUT_DEBUG) {
      const polloCounted = new Map<string, number>(); // key: name|cat -> qty
      const polloIgnored = new Map<string, number>(); // name|cat -> qty

      for (const r of countRows) {
        const name = r.item_name ?? "";
        const cat = r.item_category ?? "Sin categoría";
        const qty = safeNum(r.item_qty);

        const kind = getPolloKindFromName(name);
        if (!kind) continue;

        const catN = normText(cat);
        const isIncluded = catN.includes("incluido");
        const isPolloCategory = catN.includes("pollos");

        const key = `${name} | ${cat}`;
        if (isPolloCategory || isIncluded) {
          polloCounted.set(key, (polloCounted.get(key) ?? 0) + qty);
        } else {
          polloIgnored.set(key, (polloIgnored.get(key) ?? 0) + qty);
        }
      }

      dbg("\n[CUT][POLLO] === CONTADOS (Pollos + Incluidos) ===");
      for (const [k, v] of [...polloCounted.entries()].sort((a, b) => b[1] - a[1])) dbg("  ", k, "=>", v);

      dbg("[CUT][POLLO] === IGNORADOS (evitar doble conteo) ===");
      for (const [k, v] of [...polloIgnored.entries()].sort((a, b) => b[1] - a[1])) dbg("  ", k, "=>", v);

      dbg("[CUT][POLLO] Totales:", {
        enteros: counts.pollo_entero,
        medios: counts.pollo_medio,
        cuartos: counts.pollo_cuarto,
        porciones: counts.pollo_porciones_total,
        equivalente: Number(counts.pollo_equivalente_total.toFixed(2)),
      });

      dbg("\n[CUT] === RESUMEN POR TICKET (solo cosas tipo pollo) ===");
      for (const t of byTicket.values()) {
        let pEnt = 0,
          pMed = 0,
          pCua = 0;

        for (const it of t.items) {
          const kind = getPolloKindFromName(it.name);
          if (!kind) continue;

          const catN = normText(it.category);
          const isIncluded = catN.includes("incluido");
          const isPolloCategory = catN.includes("pollos");

          if (!(isPolloCategory || isIncluded)) continue;

          const q = safeNum(it.qty);
          if (kind === "entero") pEnt += q;
          if (kind === "medio") pMed += q;
          if (kind === "cuarto") pCua += q;
        }

        if (pEnt || pMed || pCua) {
          dbg(`  Ticket ${t.saleId} ${t.createdAt} total=${t.total} => enteros=${pEnt} medios=${pMed} cuartos=${pCua}`);
        }
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

          categories: Array.from(categories.entries()).map(([category, v]) => ({
            category,
            qty: safeNum(v.qty),
            total: safeNum(v.total),
          })),

          polloTotals: {
            enteros: counts.pollo_entero,
            medios: counts.pollo_medio,
            cuartos: counts.pollo_cuarto,
            porcionesTotal: counts.pollo_porciones_total,
            equivalenteTotal: Number(counts.pollo_equivalente_total.toFixed(2)),
          },
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

    // Totales
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

    // Rows para conteos
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

    const counts = buildCountsFromRows(itemsRows);
    const rangeLabel = fromStr === toStr ? fromStr : `${fromStr} — ${toStr}`;

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
