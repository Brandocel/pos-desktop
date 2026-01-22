// electron/ipc/sales.ipc.ts
import { ipcMain, BrowserWindow } from "electron";
import { getDb } from "../db";
import { packageIncludes } from "../db/schema";
import crypto from "crypto";

type SaleItemInput = {
  name: string;
  qty: number;
  price: number;
  category?: string;
  flavor?: string;
};

type CreateSaleInput = {
  items: SaleItemInput[];
  paymentMethod: 'cash' | 'card';
  notes?: string;
  cashReceived?: number;
  change?: number;
};

type PackageExtra = { name: string; qty: number };

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Calcula unidades de pollo según la descripción (1, 1/2, 1/4)
function polloUnitsFromName(name: string) {
  const lower = name.toLowerCase();
  if (!lower.includes("pollo")) return 0;
  if (lower.includes("1/4")) return 0.25;
  if (lower.includes("1/2")) return 0.5;
  return 1;
}

// Ajusta la cantidad de salsas al número de pollos equivalentes
function normalizeSalsas(extras: PackageExtra[]): PackageExtra[] {
  const polloUnits = extras.reduce((acc, extra) => acc + safeNum(extra.qty) * polloUnitsFromName(extra.name), 0);
  const salsaIdx = extras.findIndex((e) => e.name.toLowerCase() === "salsa");

  if (salsaIdx === -1 || polloUnits <= 0) return extras;

  const desiredSalsas = Math.max(1, Math.ceil(polloUnits));
  const cloned = extras.map((e) => ({ ...e }));
  cloned[salsaIdx] = { ...cloned[salsaIdx], qty: desiredSalsas };
  return cloned;
}

// Obtener los extras asociados a un paquete/especialidad por nombre
function getPackageExtras(db: any, packageName: string): PackageExtra[] {
  const pkg = packageIncludes.find((p) => p.packageName === packageName);
  const extras = pkg?.extras ?? [];
  return normalizeSalsas(extras);
}

function moneyMXN(v: number) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

// ✅ Conteo detallado por categoría y tipo de pollo
function buildSimpleCountsFromRows(
  rows: Array<{ item_name: string; item_qty: number; item_category?: string }>
) {
  const counts = {
    // Productos vendidos (paquetes, especialidades, miércoles, pollos individuales)
    paquetes: 0,
    especialidades: 0,
    miercoles: 0,
    pollos_individuales: 0,
    
    // Desglose de pollos (total + por tipo)
    pollo_total: 0,
    pollo_entero: 0,
    pollo_medio: 0,
    pollo_cuarto: 0,
    
    // Otros
    extras: 0,
    desechables: 0,
    otros: 0,
  };

  for (const r of rows) {
    const name = (r.item_name ?? "").toLowerCase();
    const cat = (r.item_category ?? "").toLowerCase();
    const qty = safeNum(r.item_qty);

    // Ignorar "Incluido en paquete" (ya contado en paquetes/especialidades/miércoles)
    if (cat.includes("incluido")) {
      // Pero sí contabilizar los pollos
      if (name.includes("pollo")) {
        if (name.includes("1/4")) {
          counts.pollo_cuarto += qty;
        } else if (name.includes("1/2")) {
          counts.pollo_medio += qty;
        } else {
          counts.pollo_entero += qty;
        }
        counts.pollo_total += qty;
      }
      continue;
    }

    // Categorías directas
    if (cat.includes("paquetes")) {
      counts.paquetes += qty;
      continue;
    }
    if (cat.includes("especialidades")) {
      counts.especialidades += qty;
      continue;
    }
    if (cat.includes("miércoles") || cat.includes("miercoles")) {
      counts.miercoles += qty;
      continue;
    }
    if (cat.includes("extras")) {
      counts.extras += qty;
      continue;
    }
    if (cat.includes("desechables")) {
      counts.desechables += qty;
      continue;
    }

    // Pollos por nombre (pollos individuales)
    if (name.includes("pollo")) {
      if (name.includes("1/4")) {
        counts.pollo_cuarto += qty;
      } else if (name.includes("1/2")) {
        counts.pollo_medio += qty;
      } else {
        counts.pollo_entero += qty;
      }
      counts.pollo_total += qty;
      counts.pollos_individuales += qty;
      continue;
    }

    counts.otros += qty;
  }

  return counts;
}

function buildCutPdfHtml(args: {
  rangeLabel: string;
  from: string;
  to: string;
  totals: { grand: number; tickets: number; cash: number; card: number };
  counts: ReturnType<typeof buildSimpleCountsFromRows>;
}) {
  const { rangeLabel, from, to, totals, counts } = args;

  // Tabla de productos vendidos
  const productRows = [
    ["Paquetes vendidos", counts.paquetes],
    ["Especialidades vendidas", counts.especialidades],
    ["Miércoles vendidos", counts.miercoles],
    ["Pollos individuales vendidos", counts.pollos_individuales],
  ];

  // Tabla de pollos totales
  const polloRows = [
    ["Total Pollos (equivalente en piezas)", counts.pollo_total],
    ["  └─ Enteros (1 pollo)", counts.pollo_entero],
    ["  └─ Medios (1/2 pollo)", counts.pollo_medio],
    ["  └─ Cuartos (1/4 pollo)", counts.pollo_cuarto],
  ];

  // Tabla de otros items
  const otherRows = [
    ["Extras", counts.extras],
    ["Desechables", counts.desechables],
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Corte</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 22px; color: #111; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; gap: 16px; }
    .brand { font-size: 18px; font-weight: 800; }
    .sub { font-size: 12px; color: #555; margin-top: 4px; line-height: 1.35; }

    .cards { display:grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 14px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
    .card .label { font-size: 11px; color: #555; }
    .card .value { font-size: 18px; font-weight: 800; margin-top: 6px; }

    .section { margin-top: 20px; }
    .section-title { font-size: 13px; font-weight: 800; color: #333; margin-bottom: 8px; border-bottom: 2px solid #ddd; padding-bottom: 4px; }

    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #eee; padding: 10px 8px; font-size: 13px; }
    th { text-align:left; color:#555; font-size: 11px; background: #f9f9f9; }
    td:last-child, th:last-child { text-align:right; }
    tr.indent td { padding-left: 24px; font-size: 12px; color: #666; }
    tr.total td { font-weight: 800; background: #f0f0f0; }

    .footer { margin-top: 16px; font-size: 11px; color:#666; }
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
      <div class="label">Pollos (piezas)</div>
      <div class="value">${escapeHtml(String(counts.pollo_total))}</div>
    </div>
  </div>

  <!-- PRODUCTOS VENDIDOS -->
  <div class="section">
    <div class="section-title">📦 Productos Vendidos</div>
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th>Cantidad</th>
        </tr>
      </thead>
      <tbody>
        ${productRows.map(([label, val]) => `
        <tr>
          <td>${escapeHtml(String(label))}</td>
          <td>${escapeHtml(String(val))}</td>
        </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- DESGLOSE DE POLLOS -->
  <div class="section">
    <div class="section-title">🍗 Consumo de Pollos (Total: ${counts.pollo_total} piezas)</div>
    <table>
      <thead>
        <tr>
          <th>Tipo</th>
          <th>Cantidad</th>
        </tr>
      </thead>
      <tbody>
        <tr class="total">
          <td><b>TOTAL POLLOS</b></td>
          <td><b>${escapeHtml(String(counts.pollo_total))}</b></td>
        </tr>
        ${polloRows.slice(1).map(([label, val]) => `
        <tr class="indent">
          <td>${escapeHtml(String(label))}</td>
          <td>${escapeHtml(String(val))}</td>
        </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <!-- OTROS ITEMS -->
  <div class="section">
    <div class="section-title">📋 Otros Items</div>
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th>Cantidad</th>
        </tr>
      </thead>
      <tbody>
        ${otherRows.map(([label, val]) => `
        <tr>
          <td>${escapeHtml(String(label))}</td>
          <td>${escapeHtml(String(val))}</td>
        </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <div class="footer">
    Conteo basado en categoría y nombre de producto. Pollos incluidos en paquetes, especialidades y miércoles están agregados en el total.
  </div>
</body>
</html>`;
}

export function registerSalesIpc() {
  // ✅ Crear venta
  ipcMain.handle("sales:create", (_event, payload: CreateSaleInput) => {
    const db = getDb();

    if (!payload?.items?.length) {
      return { ok: false, message: "Agrega al menos un producto." };
    }

    const saleId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const total = payload.items.reduce((acc, it) => acc + safeNum(it.qty) * safeNum(it.price), 0);
    const paymentMethod = payload.paymentMethod || 'cash';

    const insertSale = db.prepare(
      `INSERT INTO sales (id, created_at, total, payment_method, notes) VALUES (?, ?, ?, ?, ?)`
    );

    const insertItem = db.prepare(
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal, category, flavor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      insertSale.run(saleId, createdAt, total, paymentMethod, payload.notes ?? null);

      for (const it of payload.items) {
        const itemId = crypto.randomUUID();
        const subtotal = safeNum(it.qty) * safeNum(it.price);

        insertItem.run(
          itemId,
          saleId,
          it.name,
          safeNum(it.qty),
          safeNum(it.price),
          subtotal,
          it.category ?? "Sin categoría",
          it.flavor ?? null
        );

        // ✅ Si es un paquete o especialidad, agregar sus extras incluidos (precio 0)
        if ((it.category === "Paquetes" || it.category === "Especialidades" || it.category === "Miércoles") && it.qty > 0) {
          const extras = getPackageExtras(db, it.name);
          for (const extra of extras) {
            const extraId = crypto.randomUUID();
            // Multiplicar la cantidad: si Paquete Especial (qty 1) incluye "1 pollo" qty 2, insertar qty 1*2=2
            const extraQty = safeNum(it.qty) * safeNum(extra.qty);
            insertItem.run(
              extraId,
              saleId,
              extra.name,
              extraQty,
              0, // Precio 0 porque está incluido
              0, // Subtotal 0
              "Incluido en paquete", // Categoría especial
              it.flavor ?? null // Mantiene el sabor si aplica
            );
          }
        }
      }
    });

    tx();

    return { ok: true, saleId, total };
  });

  // ✅ Últimas ventas
  ipcMain.handle("sales:latest", () => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, created_at, total, notes
         FROM sales
         ORDER BY created_at DESC
         LIMIT 20`
      )
      .all();

    return { ok: true, rows };
  });

  // ✅ Resumen (para pantalla corte)
  ipcMain.handle("sales:summary", (_event, payload: { from?: string; to?: string }) => {
    const db = getDb();

    const tzOffset = "-05:00";
    const todayCancun = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Cancun" })
    );
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const fromStr = payload?.from ?? formatDate(todayCancun);
    const toStr = payload?.to ?? fromStr;

    const start = new Date(`${fromStr}T00:00:00.000${tzOffset}`);
    const end = new Date(`${toStr}T23:59:59.999${tzOffset}`);

    // Traer items para agregaciones
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

    // Tickets
    const byTicket = new Map<
    string,
    {
      saleId: string;
      createdAt: string;
      total: number;
      paymentMethod: "cash" | "card"; // ✅ NUEVO
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
  

    // Products aggregate (ignora extras incluidos gratis)
    const productsMap = new Map<
      string,
      { name: string; category: string; qty: number; subtotal: number }
    >();

    // Categories aggregate (ignora extras incluidos gratis)
    const categories = new Map<string, { qty: number; total: number }>();

    // Conteo de pollos totales (incluye incluidos en paquetes/especialidades/miércoles)
    const polloTotals = { enteros: 0, medios: 0, cuartos: 0 };

    for (const row of rows) {
      const category = row.item_category || "Sin categoría";
      const nameLower = (row.item_name || "").toLowerCase();

      // Conteo de pollos totales (incluye incluidos)
      if (nameLower.includes("pollo")) {
        if (nameLower.includes("1/4")) {
          polloTotals.cuartos += safeNum(row.item_qty);
        } else if (nameLower.includes("1/2")) {
          polloTotals.medios += safeNum(row.item_qty);
        } else {
          polloTotals.enteros += safeNum(row.item_qty);
        }
      }

      // ticket
      if (!byTicket.has(row.sale_id)) {
        byTicket.set(row.sale_id, {
          saleId: row.sale_id,
          createdAt: row.created_at,
          total: safeNum(row.sale_total),
          paymentMethod: (row.payment_method === "card" ? "card" : "cash"), // ✅ NUEVO
          notes: row.sale_notes ?? undefined,
          items: [],
        });
      }
      
      

      byTicket.get(row.sale_id)!.items.push({
        name: row.item_name,
        qty: safeNum(row.item_qty),
        price: safeNum(row.item_price),
        subtotal: safeNum(row.item_subtotal),
        category,
        flavor: row.item_flavor ?? null,
      });

      // Si es "Incluido en paquete" y precio 0, no contar en productos/categorías (extras gratis)
      const isIncludedFree = category.toLowerCase().includes("incluido") && safeNum(row.item_price) === 0;

      if (!isIncludedFree) {
        // product
        const key = `${row.item_name}__${category}`;
        if (!productsMap.has(key)) {
          productsMap.set(key, { name: row.item_name, category, qty: 0, subtotal: 0 });
        }
        const prod = productsMap.get(key)!;
        prod.qty += safeNum(row.item_qty);
        prod.subtotal += safeNum(row.item_subtotal);

        // category
        if (!categories.has(category)) categories.set(category, { qty: 0, total: 0 });
        const cat = categories.get(category)!;
        cat.qty += safeNum(row.item_qty);
        cat.total += safeNum(row.item_subtotal);
      }
    }

    // Total general desde tabla sales (más confiable)
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

    return {
      ok: true,
      data: {
        range: { from: fromStr, to: toStr },
        totals: {
          grand: safeNum(totalsRow.grand),
          cash: safeNum(totalsRow.cash_total),
          card: safeNum(totalsRow.card_total),
          categories: Array.from(categories.entries()).map(([category, v]) => ({
            category,
            qty: safeNum(v.qty),
            total: safeNum(v.total),
          })),
          polloTotals: {
            enteros: safeNum(polloTotals.enteros),
            medios: safeNum(polloTotals.medios),
            cuartos: safeNum(polloTotals.cuartos),
            total: safeNum(polloTotals.enteros + polloTotals.medios + polloTotals.cuartos),
          },
        },
        products: Array.from(productsMap.values()).sort((a, b) => b.subtotal - a.subtotal),
        tickets: Array.from(byTicket.values()),
      },
    };
  });

  // ✅ PDF corte sencillo
  ipcMain.handle("sales:cutPdf", async (_event, payload: { from?: string; to?: string }) => {
    const db = getDb();

    const tzOffset = "-05:00";
    const todayCancun = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Cancun" })
    );
    const pad = (n: number) => String(n).padStart(2, "0");
    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

    const counts = buildSimpleCountsFromRows(itemsRows);
    const rangeLabel = fromStr === toStr ? fromStr : `${fromStr} — ${toStr}`;

    const html = buildCutPdfHtml({
      rangeLabel,
      from: fromStr,
      to: toStr,
      totals: { 
        grand: safeNum(totalsRow.grand), 
        tickets: safeNum(totalsRow.tickets),
        cash: safeNum(totalsRow.cash_total),
        card: safeNum(totalsRow.card_total)
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
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
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
    const rows = db
      .prepare("SELECT id, name FROM flavors WHERE is_deleted = 0 ORDER BY name ASC")
      .all();
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

      db.prepare("INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, ?, ?)").run(
        id,
        name,
        0,
        now
      );

      return { ok: true, id, name };
    } catch (err) {
      if ((err as any)?.message?.includes("UNIQUE")) return { ok: false, message: "Este sabor ya existe." };
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
