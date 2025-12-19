// electron/ipc/sales.ipc.ts
import { ipcMain, BrowserWindow } from "electron";
import { getDb } from "../db";
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
  notes?: string;
  cashReceived?: number;
  change?: number;
};

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

function moneyMXN(v: number) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

// ✅ Conteo simple por categoría y/o por nombre
function buildSimpleCountsFromRows(
  rows: Array<{ item_name: string; item_qty: number; item_category?: string }>
) {
  const counts = {
    paquetes: 0,
    miercoles: 0,
    pollo_entero: 0,
    pollo_medio: 0,
    pollo_cuarto: 0,
    extras: 0,
    desechables: 0,
    otros: 0,
  };

  for (const r of rows) {
    const name = (r.item_name ?? "").toLowerCase();
    const cat = (r.item_category ?? "").toLowerCase();
    const qty = safeNum(r.item_qty);

    // Categorías directas (si existen)
    if (cat.includes("extras")) {
      counts.extras += qty;
      continue;
    }
    if (cat.includes("desechables")) {
      counts.desechables += qty;
      continue;
    }
    if (cat.includes("paquetes")) {
      counts.paquetes += qty;
      continue;
    }
    if (cat.includes("miércoles") || cat.includes("miercoles")) {
      counts.miercoles += qty;
      continue;
    }

    // Pollos por nombre
    if (name.includes("pollo")) {
      if (name.includes("1/4") || name.includes("cuarto")) {
        counts.pollo_cuarto += qty;
        continue;
      }
      if (name.includes("1/2") || name.includes("medio")) {
        counts.pollo_medio += qty;
        continue;
      }
      // default: entero
      counts.pollo_entero += qty;
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
  totals: { grand: number; tickets: number };
  counts: ReturnType<typeof buildSimpleCountsFromRows>;
}) {
  const { rangeLabel, from, to, totals, counts } = args;

  const rows = [
    ["Paquetes", counts.paquetes],
    ["Miércoles", counts.miercoles],
    ["Pollo Entero", counts.pollo_entero],
    ["Pollo 1/2", counts.pollo_medio],
    ["Pollo 1/4", counts.pollo_cuarto],
    ["Extras", counts.extras],
    ["Desechables", counts.desechables],
    ["Otros", counts.otros],
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

    .cards { display:grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 12px; }
    .card .label { font-size: 11px; color: #555; }
    .card .value { font-size: 18px; font-weight: 800; margin-top: 6px; }

    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border-bottom: 1px solid #eee; padding: 10px 8px; font-size: 13px; }
    th { text-align:left; color:#555; font-size: 11px; }
    td:last-child, th:last-child { text-align:right; }
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
      <div class="label">Tickets</div>
      <div class="value">${escapeHtml(String(totals.tickets))}</div>
    </div>
    <div class="card">
      <div class="label">Periodo</div>
      <div class="value">${escapeHtml(rangeLabel)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Concepto</th>
        <th>Cantidad</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(([label, val]) => `
        <tr>
          <td><b>${escapeHtml(String(label))}</b></td>
          <td>${escapeHtml(String(val))}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="footer">
    Conteo basado en categoría y/o nombre de producto (pollo 1/4, 1/2, entero).
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

    const insertSale = db.prepare(
      `INSERT INTO sales (id, created_at, total, notes) VALUES (?, ?, ?, ?)`
    );

    const insertItem = db.prepare(
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal, category, flavor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
      insertSale.run(saleId, createdAt, total, payload.notes ?? null);

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

    // Products aggregate
    const productsMap = new Map<
      string,
      { name: string; category: string; qty: number; subtotal: number }
    >();

    // Categories aggregate
    const categories = new Map<string, { qty: number; total: number }>();

    for (const row of rows) {
      const category = row.item_category || "Sin categoría";

      // ticket
      if (!byTicket.has(row.sale_id)) {
        byTicket.set(row.sale_id, {
          saleId: row.sale_id,
          createdAt: row.created_at,
          total: safeNum(row.sale_total),
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

    // Total general desde tabla sales (más confiable)
    const totalsRow = db
      .prepare(
        `SELECT COALESCE(SUM(total),0) as grand, COUNT(*) as tickets
         FROM sales
         WHERE created_at BETWEEN ? AND ?`
      )
      .get(start.toISOString(), end.toISOString()) as { grand: number; tickets: number };

    return {
      ok: true,
      data: {
        range: { from: fromStr, to: toStr },
        totals: {
          grand: safeNum(totalsRow.grand),
          categories: Array.from(categories.entries()).map(([category, v]) => ({
            category,
            qty: safeNum(v.qty),
            total: safeNum(v.total),
          })),
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
        `SELECT COALESCE(SUM(total),0) as grand, COUNT(*) as tickets
         FROM sales
         WHERE created_at BETWEEN ? AND ?`
      )
      .get(start.toISOString(), end.toISOString()) as { grand: number; tickets: number };

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
      totals: { grand: safeNum(totalsRow.grand), tickets: safeNum(totalsRow.tickets) },
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
