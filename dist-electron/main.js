import { app, ipcMain, BrowserWindow } from "electron";
import path from "node:path";
import Database from "better-sqlite3";
import crypto from "crypto";
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
  "BBQ",
  "Axiote",
  "Talla",
  "Pimienta",
  "Pastor"
];
const initialProducts = [
  // Pollos (requieren sabor)
  { name: "1/4 Pollo", category: "Pollos", price: 0, requires_flavor: 1 },
  { name: "1/2 Pollo", category: "Pollos", price: 0, requires_flavor: 1 },
  { name: "Pollo Entero", category: "Pollos", price: 0, requires_flavor: 1 },
  // Especialidades (NO requieren sabor, pero pueden tener uno fijo)
  { name: "Veracruz 1 Pollo", category: "Especialidades", price: 0, requires_flavor: 0 },
  { name: "Veracruz 1/2", category: "Especialidades", price: 0, requires_flavor: 0 },
  { name: "Peninsular 1 Pollo", category: "Especialidades", price: 0, requires_flavor: 0 },
  { name: "Peninsular 1/2", category: "Especialidades", price: 0, requires_flavor: 0 },
  // Paquetes (requieren sabor)
  { name: "Paquete Acompañes", category: "Paquetes", price: 0, requires_flavor: 1 },
  { name: "Paquete Amigo", category: "Paquetes", price: 0, requires_flavor: 1 },
  { name: "Paquete Pirata", category: "Paquetes", price: 0, requires_flavor: 1 },
  // Miércoles (requieren sabor)
  { name: "Miércoles - Paquete Normal", category: "Miércoles", price: 0, requires_flavor: 1 },
  { name: "Miércoles - Paquete PROMO", category: "Miércoles", price: 0, requires_flavor: 1 },
  // Extras (NO requieren sabor, NO se incluyen)
  { name: "Spaghetti", category: "Extras", price: 0, requires_flavor: 0 },
  { name: "Arroz", category: "Extras", price: 0, requires_flavor: 0 },
  { name: "Frijol", category: "Extras", price: 0, requires_flavor: 0 },
  { name: "Refresco", category: "Extras", price: 0, requires_flavor: 0 }
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
  seedFlavors();
  seedProducts();
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
function registerSalesIpc() {
  ipcMain.handle("sales:create", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.items?.length) {
      return { ok: false, message: "Agrega al menos un producto." };
    }
    const saleId = crypto.randomUUID();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const total = payload.items.reduce((acc, it) => acc + it.qty * it.price, 0);
    const insertSale = db2.prepare(
      `INSERT INTO sales (id, created_at, total, notes) VALUES (?, ?, ?, ?)`
    );
    const insertItem = db2.prepare(
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal, category, flavor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const tx = db2.transaction(() => {
      insertSale.run(saleId, createdAt, total, payload.notes ?? null);
      for (const it of payload.items) {
        const itemId = crypto.randomUUID();
        const subtotal = it.qty * it.price;
        insertItem.run(
          itemId,
          saleId,
          it.name,
          it.qty,
          it.price,
          subtotal,
          it.category ?? "Sin categoría",
          it.flavor ?? null
        );
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
  ipcMain.handle(
    "sales:summary",
    (_event, payload) => {
      const db2 = getDb();
      const tzOffset = "-05:00";
      const todayCancun = new Date(
        (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "America/Cancun" })
      );
      const pad = (n) => String(n).padStart(2, "0");
      const formatDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const fromStr = payload?.from ?? formatDate(todayCancun);
      const toStr = payload?.to ?? formatDate(todayCancun);
      const start = /* @__PURE__ */ new Date(`${fromStr}T00:00:00.000${tzOffset}`);
      const end = /* @__PURE__ */ new Date(`${toStr}T23:59:59.999${tzOffset}`);
      const rows = db2.prepare(
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
      ).all(toISODate(start), toISODate(end));
      const byTicket = /* @__PURE__ */ new Map();
      const productsMap = /* @__PURE__ */ new Map();
      const categories = /* @__PURE__ */ new Map();
      let grandTotal = 0;
      for (const row of rows) {
        grandTotal += row.item_subtotal;
        const category = row.item_category || "Sin categoría";
        if (!byTicket.has(row.sale_id)) {
          byTicket.set(row.sale_id, {
            saleId: row.sale_id,
            createdAt: row.created_at,
            total: row.sale_total,
            notes: row.sale_notes ?? void 0,
            items: []
          });
        }
        byTicket.get(row.sale_id).items.push({
          name: row.item_name,
          qty: row.item_qty,
          price: row.item_price,
          subtotal: row.item_subtotal,
          category,
          flavor: row.item_flavor ?? void 0
        });
        if (!productsMap.has(row.item_name)) {
          productsMap.set(row.item_name, {
            name: row.item_name,
            category,
            qty: 0,
            subtotal: 0
          });
        }
        const prod = productsMap.get(row.item_name);
        prod.qty += row.item_qty;
        prod.subtotal += row.item_subtotal;
        if (!categories.has(category)) {
          categories.set(category, { qty: 0, total: 0 });
        }
        const cat = categories.get(category);
        cat.qty += row.item_qty;
        cat.total += row.item_subtotal;
      }
      return {
        ok: true,
        data: {
          range: { from: fromStr, to: toStr },
          totals: {
            grand: grandTotal,
            categories: Array.from(categories.entries()).map(([category, v]) => ({
              category,
              qty: v.qty,
              total: v.total
            }))
          },
          products: Array.from(productsMap.values()).sort((a, b) => b.subtotal - a.subtotal),
          tickets: Array.from(byTicket.values())
        }
      };
    }
  );
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
      if (!showDeleted) {
        whereClause = "WHERE is_deleted = 0";
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
      const countQuery = `SELECT COUNT(*) as total FROM flavors ${whereClause}`;
      const countStmt = db2.prepare(countQuery);
      const countResult = countStmt.all(...params)[0];
      const total = countResult.total;
      const offset = (page - 1) * pageSize;
      const query = `
        SELECT id, name, is_deleted, created_at
        FROM flavors
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      const stmt = db2.prepare(query);
      const rows = stmt.all(...params, pageSize, offset);
      const totalPages = Math.ceil(total / pageSize);
      return {
        ok: true,
        data: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages
        }
      };
    }
  );
  ipcMain.handle("flavors:create", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.name?.trim()) {
      return { ok: false, message: "El nombre del sabor es requerido." };
    }
    const name = payload.name.trim();
    try {
      const id = crypto.randomUUID();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db2.prepare(
        "INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, ?, ?)"
      ).run(id, name, 0, now);
      return { ok: true, id, name };
    } catch (err) {
      if (err?.message?.includes("UNIQUE")) {
        return { ok: false, message: "Este sabor ya existe." };
      }
      return { ok: false, message: "Error al crear sabor." };
    }
  });
  ipcMain.handle("flavors:delete", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }
    db2.prepare("UPDATE flavors SET is_deleted = 1 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
  ipcMain.handle("flavors:restore", (_event, payload) => {
    const db2 = getDb();
    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }
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
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // ✅ IMPORTANTE: ahora cargamos preload.cjs (no .mjs)
      preload: path.join(process.cwd(), "dist-electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173/";
  if (!app.isPackaged) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(process.cwd(), "dist", "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
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
    console.error("❌ Error al iniciar Electron:", err);
  }
});
