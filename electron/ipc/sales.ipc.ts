// electron/ipc/sales.ipc.ts
import { ipcMain } from "electron";
import { getDb } from "../db";
import crypto from "crypto";

type SaleItemInput = { name: string; qty: number; price: number };
type CreateSaleInput = { items: SaleItemInput[]; notes?: string };

export function registerSalesIpc() {
  ipcMain.handle("sales:create", (_event, payload: CreateSaleInput) => {
    const db = getDb();

    if (!payload?.items?.length) {
      return { ok: false, message: "Agrega al menos un producto." };
    }

    const saleId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const total = payload.items.reduce((acc, it) => acc + it.qty * it.price, 0);

    const insertSale = db.prepare(
      `INSERT INTO sales (id, created_at, total, notes) VALUES (?, ?, ?, ?)`
    );

    const insertItem = db.prepare(
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
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
}
