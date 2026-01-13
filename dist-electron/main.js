import { app, ipcMain, BrowserWindow, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import crypto from "crypto";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const schemaSQL = `
  CREATE TABLE IF NOT EXISTS flavors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    requires_flavor INTEGER NOT NULL DEFAULT 0,
    flavor_id TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (flavor_id) REFERENCES flavors(id)
  );

  CREATE TABLE IF NOT EXISTS product_included_extras (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    extra_id TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (extra_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(product_id, extra_id)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL,
    name TEXT NOT NULL,
    qty REAL NOT NULL,
    price REAL NOT NULL,
    subtotal REAL NOT NULL,
    category TEXT NOT NULL DEFAULT 'Sin categoría',
    flavor TEXT,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  );
`;
const initialFlavors = [
  "Tamarindo",
  "Cacahuate",
  "BBQ",
  "Chile de Árbol",
  "Habanero"
];
const initialProducts = [
  // POLLOS (requieren sabor)
  { name: "1/4 pollo", category: "Pollos", price: 78, requires_flavor: 1 },
  { name: "1/2 pollo", category: "Pollos", price: 135, requires_flavor: 1 },
  { name: "1 pollo", category: "Pollos", price: 245, requires_flavor: 1 },
  // ESPECIALIDADES (NO requieren sabor)
  { name: "Veracruz 1 pollo", category: "Especialidades", price: 255, requires_flavor: 0 },
  { name: "Veracruz 1/2 pollo", category: "Especialidades", price: 145, requires_flavor: 0 },
  { name: "Peninsular 1 pollo", category: "Especialidades", price: 255, requires_flavor: 0 },
  { name: "Peninsular 1/2 pollo", category: "Especialidades", price: 145, requires_flavor: 0 },
  // PAQUETES (requieren sabor)
  { name: "Acompañes", category: "Paquetes", price: 95, requires_flavor: 1 },
  { name: "Amigo", category: "Paquetes", price: 190, requires_flavor: 1 },
  { name: "Sorpresa", category: "Paquetes", price: 280, requires_flavor: 1 },
  { name: "Primavera", category: "Paquetes", price: 285, requires_flavor: 1 },
  { name: "Pirata", category: "Paquetes", price: 305, requires_flavor: 1 },
  { name: "Pirata Con espagueti", category: "Paquetes", price: 305, requires_flavor: 1 },
  { name: "Taquitos", category: "Paquetes", price: 300, requires_flavor: 1 },
  { name: "Apollo", category: "Paquetes", price: 345, requires_flavor: 1 },
  { name: "Paquete Especial", category: "Paquetes", price: 380, requires_flavor: 1 },
  { name: "Tesoro", category: "Paquetes", price: 570, requires_flavor: 1 },
  // MIÉRCOLES (requieren sabor)
  { name: "Súper Miércoles", category: "Miércoles", price: 209, requires_flavor: 1 },
  // EXTRAS (NO requieren sabor)
  { name: "Spaghetti", category: "Extras", price: 40, requires_flavor: 0 },
  { name: "Ensalada de coditos", category: "Extras", price: 60, requires_flavor: 0 },
  { name: "Arroz", category: "Extras", price: 30, requires_flavor: 0 },
  { name: "Frijol", category: "Extras", price: 20, requires_flavor: 0 },
  { name: "Purée de papa", category: "Extras", price: 45, requires_flavor: 0 },
  { name: "Papa al horno", category: "Extras", price: 30, requires_flavor: 0 },
  { name: "Postre", category: "Extras", price: 25, requires_flavor: 0 },
  { name: "Tortillas", category: "Extras", price: 20, requires_flavor: 0 },
  { name: "Salsa", category: "Extras", price: 20, requires_flavor: 0 },
  { name: "Tacos dorados (4 pzas)", category: "Extras", price: 60, requires_flavor: 0 },
  { name: "Desechable", category: "Extras", price: 5, requires_flavor: 0 },
  // BEBIDAS (NO requieren sabor)
  { name: "Agua fresca 1L", category: "Bebidas", price: 45, requires_flavor: 0 },
  { name: "Agua fresca 500 ml", category: "Bebidas", price: 30, requires_flavor: 0 },
  { name: "Refresco 2L", category: "Bebidas", price: 50, requires_flavor: 0 },
  { name: "Refresco 600 ml", category: "Bebidas", price: 30, requires_flavor: 0 }
];
const packageIncludes = [
  {
    packageName: "Acompañes",
    extras: [{ name: "1/4 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Amigo",
    extras: [{ name: "1/2 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }, { name: "Postre", qty: 1 }]
  },
  {
    packageName: "Sorpresa",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Papa al horno", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Primavera",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Ensalada de coditos", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Pirata",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Purée de papa", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }, { name: "Postre", qty: 1 }]
  },
  {
    packageName: "Pirata Con espagueti",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Spaghetti", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }, { name: "Postre", qty: 1 }]
  },
  {
    packageName: "Taquitos",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Tacos dorados (4 pzas)", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Apollo",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Paquete Especial",
    extras: [{ name: "1 pollo", qty: 2 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Tesoro",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Purée de papa", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }, { name: "Postre", qty: 1 }]
  },
  // ESPECIALIDADES (con sus acompañamientos)
  {
    packageName: "Veracruz 1 pollo",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Veracruz 1/2 pollo",
    extras: [{ name: "1/2 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Peninsular 1 pollo",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  {
    packageName: "Peninsular 1/2 pollo",
    extras: [{ name: "1/2 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  },
  // MIÉRCOLES (con sus acompañamientos)
  {
    packageName: "Súper Miércoles",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }]
  }
];
let db = null;
function getDb() {
  if (db) return db;
  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "pos.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSQL);
  migrateSaleItems();
  migrateSales();
  seedFlavors();
  seedProducts();
  seedPackageIncludes();
  return db;
}
function seedFlavors() {
  if (!db) return;
  const countFlavors = db.prepare("SELECT COUNT(*) as count FROM flavors WHERE is_deleted = 0").get();
  if (countFlavors.count === 0) {
    const insert = db.prepare(
      "INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, ?, ?)"
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const flavorName of initialFlavors) {
      const id = crypto.randomUUID();
      insert.run(id, flavorName, 0, now);
    }
  }
}
function migrateSaleItems() {
  if (!db) return;
  const cols = db.prepare("PRAGMA table_info(sale_items);").all();
  const hasCategory = cols.some((c) => c.name === "category");
  const hasFlavor = cols.some((c) => c.name === "flavor");
  const alterStatements = [];
  if (!hasCategory) {
    alterStatements.push("ALTER TABLE sale_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Sin categoría'");
  }
  if (!hasFlavor) {
    alterStatements.push("ALTER TABLE sale_items ADD COLUMN flavor TEXT");
  }
  for (const stmt of alterStatements) {
    try {
      db.prepare(stmt).run();
    } catch (err) {
      console.warn("Migración sale_items omitida:", err);
    }
  }
}
function migrateSales() {
  if (!db) return;
  const cols = db.prepare("PRAGMA table_info(sales);").all();
  const hasPaymentMethod = cols.some((c) => c.name === "payment_method");
  if (!hasPaymentMethod) {
    try {
      db.prepare("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'").run();
      console.log("✅ Migración: columna payment_method agregada a sales");
    } catch (err) {
      console.warn("Migración sales omitida:", err);
    }
  }
}
function seedProducts() {
  if (!db) return;
  const countProducts = db.prepare("SELECT COUNT(*) as count FROM products WHERE is_deleted = 0").get();
  if (countProducts.count === 0) {
    const insert = db.prepare(
      "INSERT INTO products (id, name, category, price, requires_flavor, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const product of initialProducts) {
      const id = crypto.randomUUID();
      insert.run(
        id,
        product.name,
        product.category,
        product.price,
        product.requires_flavor,
        0,
        now
      );
    }
  }
}
function seedPackageIncludes() {
  if (!db) return;
  const countAssocs = db.prepare("SELECT COUNT(*) as count FROM product_included_extras").get();
  if (countAssocs.count > 0) return;
  const insertAssoc = db.prepare(
    "INSERT INTO product_included_extras (id, product_id, extra_id) VALUES (?, ?, ?)"
  );
  for (const pkg of packageIncludes) {
    const packageRow = db.prepare("SELECT id FROM products WHERE name = ? AND is_deleted = 0").get(pkg.packageName);
    if (!packageRow) continue;
    for (const extra of pkg.extras) {
      const extraName = extra.name;
      const extraRow = db.prepare("SELECT id FROM products WHERE name = ? AND is_deleted = 0").get(extraName);
      if (!extraRow) continue;
      try {
        const assocId = crypto.randomUUID();
        insertAssoc.run(assocId, packageRow.id, extraRow.id);
      } catch (err) {
        console.warn(`No se pudo asociar ${extraName} a ${pkg.packageName}:`, err);
      }
    }
  }
  console.log("✅ Paquetes y extras asociados correctamente");
}
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function escapeHtml(s) {
  return (s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function getPackageExtras(db2, packageName) {
  const pkg = packageIncludes.find((p) => p.packageName === packageName);
  return pkg?.extras ?? [];
}
function moneyMXN(v) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(v);
  } catch {
    return `$${v.toFixed(2)}`;
  }
}
function buildSimpleCountsFromRows(rows) {
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
    otros: 0
  };
  for (const r of rows) {
    const name = (r.item_name ?? "").toLowerCase();
    const cat = (r.item_category ?? "").toLowerCase();
    const qty = safeNum(r.item_qty);
    if (cat.includes("incluido")) {
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
function buildCutPdfHtml(args) {
  const { rangeLabel, from, to, totals, counts } = args;
  const productRows = [
    ["Paquetes vendidos", counts.paquetes],
    ["Especialidades vendidas", counts.especialidades],
    ["Miércoles vendidos", counts.miercoles],
    ["Pollos individuales vendidos", counts.pollos_individuales]
  ];
  const polloRows = [
    ["Total Pollos (equivalente en piezas)", counts.pollo_total],
    ["  └─ Enteros (1 pollo)", counts.pollo_entero],
    ["  └─ Medios (1/2 pollo)", counts.pollo_medio],
    ["  └─ Cuartos (1/4 pollo)", counts.pollo_cuarto]
  ];
  const otherRows = [
    ["Extras", counts.extras],
    ["Desechables", counts.desechables]
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
      <div class="sub">Generado: ${escapeHtml((/* @__PURE__ */ new Date()).toLocaleString("es-MX"))}</div>
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
function registerSalesIpc() {
  ipcMain.handle("sales:create", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.items?.length) {
      return { ok: false, message: "Agrega al menos un producto." };
    }
    const saleId = crypto.randomUUID();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const total = payload.items.reduce((acc, it) => acc + safeNum(it.qty) * safeNum(it.price), 0);
    const paymentMethod = payload.paymentMethod || "cash";
    const insertSale = db2.prepare(
      `INSERT INTO sales (id, created_at, total, payment_method, notes) VALUES (?, ?, ?, ?, ?)`
    );
    const insertItem = db2.prepare(
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal, category, flavor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = db2.transaction(() => {
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
        if ((it.category === "Paquetes" || it.category === "Especialidades" || it.category === "Miércoles") && it.qty > 0) {
          const extras = getPackageExtras(db2, it.name);
          for (const extra of extras) {
            const extraId = crypto.randomUUID();
            const extraQty = safeNum(it.qty) * safeNum(extra.qty);
            insertItem.run(
              extraId,
              saleId,
              extra.name,
              extraQty,
              0,
              // Precio 0 porque está incluido
              0,
              // Subtotal 0
              "Incluido en paquete",
              // Categoría especial
              it.flavor ?? null
              // Mantiene el sabor si aplica
            );
          }
        }
      }
    });
    tx();
    return { ok: true, saleId, total };
  });
  ipcMain.handle("sales:latest", () => {
    const db2 = getDb();
    const rows = db2.prepare(
      `SELECT id, created_at, total, notes
         FROM sales
         ORDER BY created_at DESC
         LIMIT 20`
    ).all();
    return { ok: true, rows };
  });
  ipcMain.handle("sales:summary", (_event, payload) => {
    const db2 = getDb();
    const tzOffset = "-05:00";
    const todayCancun = new Date(
      (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "America/Cancun" })
    );
    const pad = (n) => String(n).padStart(2, "0");
    const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fromStr = payload?.from ?? formatDate(todayCancun);
    const toStr = payload?.to ?? fromStr;
    const start = /* @__PURE__ */ new Date(`${fromStr}T00:00:00.000${tzOffset}`);
    const end = /* @__PURE__ */ new Date(`${toStr}T23:59:59.999${tzOffset}`);
    const rows = db2.prepare(
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
    ).all(start.toISOString(), end.toISOString());
    const byTicket = /* @__PURE__ */ new Map();
    const productsMap = /* @__PURE__ */ new Map();
    const categories = /* @__PURE__ */ new Map();
    const polloTotals = { enteros: 0, medios: 0, cuartos: 0 };
    for (const row of rows) {
      const category = row.item_category || "Sin categoría";
      const nameLower = (row.item_name || "").toLowerCase();
      if (nameLower.includes("pollo")) {
        if (nameLower.includes("1/4")) {
          polloTotals.cuartos += safeNum(row.item_qty);
        } else if (nameLower.includes("1/2")) {
          polloTotals.medios += safeNum(row.item_qty);
        } else {
          polloTotals.enteros += safeNum(row.item_qty);
        }
      }
      if (!byTicket.has(row.sale_id)) {
        byTicket.set(row.sale_id, {
          saleId: row.sale_id,
          createdAt: row.created_at,
          total: safeNum(row.sale_total),
          notes: row.sale_notes ?? void 0,
          items: []
        });
      }
      byTicket.get(row.sale_id).items.push({
        name: row.item_name,
        qty: safeNum(row.item_qty),
        price: safeNum(row.item_price),
        subtotal: safeNum(row.item_subtotal),
        category,
        flavor: row.item_flavor ?? null
      });
      const isIncludedFree = category.toLowerCase().includes("incluido") && safeNum(row.item_price) === 0;
      if (!isIncludedFree) {
        const key = `${row.item_name}__${category}`;
        if (!productsMap.has(key)) {
          productsMap.set(key, { name: row.item_name, category, qty: 0, subtotal: 0 });
        }
        const prod = productsMap.get(key);
        prod.qty += safeNum(row.item_qty);
        prod.subtotal += safeNum(row.item_subtotal);
        if (!categories.has(category)) categories.set(category, { qty: 0, total: 0 });
        const cat = categories.get(category);
        cat.qty += safeNum(row.item_qty);
        cat.total += safeNum(row.item_subtotal);
      }
    }
    const totalsRow = db2.prepare(
      `SELECT 
          COALESCE(SUM(total),0) as grand, 
          COUNT(*) as tickets,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_total
         FROM sales
         WHERE created_at BETWEEN ? AND ?`
    ).get(start.toISOString(), end.toISOString());
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
            total: safeNum(v.total)
          })),
          polloTotals: {
            enteros: safeNum(polloTotals.enteros),
            medios: safeNum(polloTotals.medios),
            cuartos: safeNum(polloTotals.cuartos),
            total: safeNum(polloTotals.enteros + polloTotals.medios + polloTotals.cuartos)
          }
        },
        products: Array.from(productsMap.values()).sort((a, b) => b.subtotal - a.subtotal),
        tickets: Array.from(byTicket.values())
      }
    };
  });
  ipcMain.handle("sales:cutPdf", async (_event, payload) => {
    const db2 = getDb();
    const tzOffset = "-05:00";
    const todayCancun = new Date(
      (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "America/Cancun" })
    );
    const pad = (n) => String(n).padStart(2, "0");
    const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const fromStr = payload?.from ?? formatDate(todayCancun);
    const toStr = payload?.to ?? fromStr;
    const start = /* @__PURE__ */ new Date(`${fromStr}T00:00:00.000${tzOffset}`);
    const end = /* @__PURE__ */ new Date(`${toStr}T23:59:59.999${tzOffset}`);
    const totalsRow = db2.prepare(
      `SELECT 
          COALESCE(SUM(total),0) as grand, 
          COUNT(*) as tickets,
          COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) as cash_total,
          COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) as card_total
         FROM sales
         WHERE created_at BETWEEN ? AND ?`
    ).get(start.toISOString(), end.toISOString());
    const itemsRows = db2.prepare(
      `SELECT si.name as item_name, si.qty as item_qty, si.category as item_category
         FROM sales s
         JOIN sale_items si ON si.sale_id = s.id
         WHERE s.created_at BETWEEN ? AND ?`
    ).all(start.toISOString(), end.toISOString());
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
      counts
    });
    const pdfWin = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true }
    });
    await pdfWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    });
    pdfWin.destroy();
    return {
      ok: true,
      base64: pdfBuffer.toString("base64"),
      filename: `corte_${fromStr}_${toStr}.pdf`
    };
  });
  ipcMain.handle("flavors:list", () => {
    const db2 = getDb();
    const rows = db2.prepare("SELECT id, name FROM flavors WHERE is_deleted = 0 ORDER BY name ASC").all();
    return { ok: true, rows };
  });
  ipcMain.handle(
    "flavors:admin:list",
    (_event, payload) => {
      const db2 = getDb();
      const { page = 1, pageSize = 10, search = "", showDeleted = false } = payload;
      let whereClause = "";
      const params = [];
      if (!showDeleted) whereClause = "WHERE is_deleted = 0";
      if (search.trim()) {
        const searchTerm = `%${search.toLowerCase()}%`;
        whereClause = whereClause ? `${whereClause} AND LOWER(name) LIKE ?` : "WHERE LOWER(name) LIKE ?";
        params.push(searchTerm);
      }
      const countQuery = `SELECT COUNT(*) as total FROM flavors ${whereClause}`;
      const total = db2.prepare(countQuery).all(...params)[0].total;
      const offset = (page - 1) * pageSize;
      const query = `
        SELECT id, name, is_deleted, created_at
        FROM flavors
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      const rows = db2.prepare(query).all(...params, pageSize, offset);
      return {
        ok: true,
        data: rows,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      };
    }
  );
  ipcMain.handle("flavors:create", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.name?.trim()) return { ok: false, message: "El nombre del sabor es requerido." };
    const name = payload.name.trim();
    try {
      const id = crypto.randomUUID();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db2.prepare("INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, ?, ?)").run(
        id,
        name,
        0,
        now
      );
      return { ok: true, id, name };
    } catch (err) {
      if (err?.message?.includes("UNIQUE")) return { ok: false, message: "Este sabor ya existe." };
      return { ok: false, message: "Error al crear sabor." };
    }
  });
  ipcMain.handle("flavors:delete", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.id) return { ok: false, message: "ID requerido." };
    db2.prepare("UPDATE flavors SET is_deleted = 1 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
  ipcMain.handle("flavors:restore", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.id) return { ok: false, message: "ID requerido." };
    db2.prepare("UPDATE flavors SET is_deleted = 0 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
}
function registerProductsIpc() {
  ipcMain.handle(
    "products:admin:list",
    (_event, payload) => {
      const db2 = getDb();
      const { page = 1, pageSize = 10, category, search = "", showDeleted = false } = payload;
      let whereClause = "";
      const params = [];
      if (!showDeleted) {
        whereClause = "WHERE is_deleted = 0";
      }
      if (category) {
        if (whereClause) {
          whereClause += " AND category = ?";
        } else {
          whereClause = "WHERE category = ?";
        }
        params.push(category);
      }
      if (search.trim()) {
        const searchTerm = `%${search.toLowerCase()}%`;
        if (whereClause) {
          whereClause += " AND LOWER(name) LIKE ?";
        } else {
          whereClause = "WHERE LOWER(name) LIKE ?";
        }
        params.push(searchTerm);
      }
      const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
      const countStmt = db2.prepare(countQuery);
      const countResult = countStmt.all(...params)[0];
      const total = countResult.total;
      const offset = (page - 1) * pageSize;
      const query = `
        SELECT p.id, p.name, p.category, p.price, p.requires_flavor, p.flavor_id, p.is_deleted, p.created_at,
               GROUP_CONCAT(pie.extra_id) as included_extras
        FROM products p
        LEFT JOIN product_included_extras pie ON p.id = pie.product_id
        ${whereClause}
        GROUP BY p.id
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `;
      const stmt = db2.prepare(query);
      const rows = stmt.all(...params, pageSize, offset);
      const totalPages = Math.ceil(total / pageSize);
      return {
        ok: true,
        data: rows.map((r) => ({
          ...r,
          included_extras: r.included_extras ? r.included_extras.split(",") : []
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages
        }
      };
    }
  );
  ipcMain.handle("products:categories", () => {
    const db2 = getDb();
    const rows = db2.prepare(
      "SELECT DISTINCT category FROM products WHERE is_deleted = 0 ORDER BY category ASC"
    ).all();
    return { ok: true, categories: rows.map((r) => r.category) };
  });
  ipcMain.handle("products:sales:list", () => {
    const db2 = getDb();
    const query = `
      SELECT p.id, p.name, p.category, p.price, p.requires_flavor, p.flavor_id,
             GROUP_CONCAT(pie.extra_id) as included_extras
      FROM products p
      LEFT JOIN product_included_extras pie ON p.id = pie.product_id
      WHERE p.is_deleted = 0
      GROUP BY p.id
      ORDER BY p.category, p.name
    `;
    const rows = db2.prepare(query).all();
    return {
      ok: true,
      products: rows.map((r) => ({
        ...r,
        included_extras: r.included_extras ? r.included_extras.split(",") : []
      }))
    };
  });
  ipcMain.handle(
    "products:create",
    (_event, payload) => {
      const db2 = getDb();
      if (!payload?.name?.trim() || !payload?.category?.trim()) {
        return { ok: false, message: "Nombre y categoría son requeridos." };
      }
      try {
        const id = crypto.randomUUID();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        db2.prepare(
          "INSERT INTO products (id, name, category, price, requires_flavor, flavor_id, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          id,
          payload.name.trim(),
          payload.category,
          payload.price || 0,
          payload.requires_flavor ? 1 : 0,
          payload.flavor_id || null,
          0,
          now
        );
        if (payload.included_extras && payload.included_extras.length > 0) {
          const insertExtra = db2.prepare(
            "INSERT INTO product_included_extras (id, product_id, extra_id) VALUES (?, ?, ?)"
          );
          for (const extraId of payload.included_extras) {
            insertExtra.run(crypto.randomUUID(), id, extraId);
          }
        }
        return { ok: true, id };
      } catch (err) {
        if (err?.message?.includes("UNIQUE")) {
          return { ok: false, message: "Este producto ya existe." };
        }
        console.error(err);
        return { ok: false, message: "Error al crear producto." };
      }
    }
  );
  ipcMain.handle(
    "products:update",
    (_event, payload) => {
      const db2 = getDb();
      if (!payload?.id || !payload?.name?.trim()) {
        return { ok: false, message: "ID y nombre son requeridos." };
      }
      try {
        db2.prepare(
          "UPDATE products SET name = ?, category = ?, price = ?, requires_flavor = ?, flavor_id = ? WHERE id = ?"
        ).run(
          payload.name.trim(),
          payload.category,
          payload.price || 0,
          payload.requires_flavor ? 1 : 0,
          payload.flavor_id || null,
          payload.id
        );
        db2.prepare("DELETE FROM product_included_extras WHERE product_id = ?").run(payload.id);
        if (payload.included_extras && payload.included_extras.length > 0) {
          const insertExtra = db2.prepare(
            "INSERT INTO product_included_extras (id, product_id, extra_id) VALUES (?, ?, ?)"
          );
          for (const extraId of payload.included_extras) {
            insertExtra.run(crypto.randomUUID(), payload.id, extraId);
          }
        }
        return { ok: true };
      } catch (err) {
        console.error(err);
        return { ok: false, message: "Error al actualizar producto." };
      }
    }
  );
  ipcMain.handle("products:delete", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }
    db2.prepare("UPDATE products SET is_deleted = 1 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
  ipcMain.handle("products:restore", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }
    db2.prepare("UPDATE products SET is_deleted = 0 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = path.dirname(__filename$1);
let win = null;
function showFatalError(title, details) {
  try {
    dialog.showMessageBoxSync({
      type: "error",
      title,
      message: "Ocurrió un problema al iniciar la aplicación.\n\nPor favor toma una captura de esta pantalla y contacta al equipo de desarrollo.",
      detail: details,
      buttons: ["Cerrar"]
    });
  } catch {
    console.error(title, details);
  }
}
function writeCrashLog(err) {
  try {
    const userData = app.getPath("userData");
    const logDir = path.join(userData, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, `fatal-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.log`);
    fs.writeFileSync(
      file,
      [
        "=== POLLO PIRATA POS - FATAL ERROR ===",
        `date: ${(/* @__PURE__ */ new Date()).toISOString()}`,
        `appVersion: ${app.getVersion()}`,
        `platform: ${process.platform} ${process.arch}`,
        "",
        String(err?.stack || err?.message || err)
      ].join("\n"),
      "utf-8"
    );
    return file;
  } catch (e) {
    console.error("No se pudo escribir log fatal:", e);
    return null;
  }
}
function createWindow() {
  const preloadPath = path.join(__dirname$1, "preload.cjs");
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    const logFile = writeCrashLog({ message: `did-fail-load ${code} ${desc} ${url}` });
    showFatalError(
      "Error al cargar la aplicación",
      `No se pudo cargar la pantalla.

Detalle: ${code} - ${desc}
URL: ${url}

Log: ${logFile ?? "no disponible"}`
    );
    app.quit();
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173/";
  if (!app.isPackaged) {
    win.loadURL(devUrl);
    return;
  }
  const indexHtml = path.join(app.getAppPath(), "dist", "index.html");
  win.loadFile(indexHtml).catch((err) => {
    const logFile = writeCrashLog(err);
    showFatalError(
      "Error al iniciar",
      `No se pudo abrir la interfaz.

Archivo: ${indexHtml}

Log: ${logFile ?? "no disponible"}

${String(
        err?.message || err
      )}`
    );
    app.quit();
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
  win = null;
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
  try {
    registerSalesIpc();
    registerProductsIpc();
    createWindow();
  } catch (err) {
    const logFile = writeCrashLog(err);
    showFatalError(
      "Error crítico",
      `La app falló al iniciar módulos internos.

Log: ${logFile ?? "no disponible"}

${String(
        err?.stack || err?.message || err
      )}`
    );
    app.quit();
  }
});
