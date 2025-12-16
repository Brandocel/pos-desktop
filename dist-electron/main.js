import { app, ipcMain, BrowserWindow } from "electron";
import path from "node:path";
import Database from "better-sqlite3";
import crypto from "crypto";
const schemaSQL = `
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
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  );
`;
let db = null;
function getDb() {
  if (db) return db;
  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "pos.sqlite");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSQL);
  return db;
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
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const tx = db2.transaction(() => {
      insertSale.run(saleId, createdAt, total, payload.notes ?? null);
      for (const it of payload.items) {
        const itemId = crypto.randomUUID();
        const subtotal = it.qty * it.price;
        insertItem.run(itemId, saleId, it.name, it.qty, it.price, subtotal);
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
    createWindow();
  } catch (err) {
    console.error("❌ Error al iniciar Electron:", err);
  }
});
