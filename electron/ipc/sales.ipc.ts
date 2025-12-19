// electron/ipc/sales.ipc.ts
import { ipcMain } from "electron";
import { getDb } from "../db";
import crypto from "crypto";

type SaleItemInput = {
  name: string;
  qty: number;
  price: number;
  category?: string;
  flavor?: string;
};
type CreateSaleInput = { items: SaleItemInput[]; notes?: string; cashReceived?: number; change?: number };

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
      `INSERT INTO sale_items (id, sale_id, name, qty, price, subtotal, category, flavor)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const tx = db.transaction(() => {
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

  ipcMain.handle(
    "sales:summary",
    (_event, payload: { from?: string; to?: string }) => {
      const db = getDb();
      const tzOffset = "-05:00"; // Horario Cancún (sin DST)
      const todayCancun = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Cancun" })
      );
      const pad = (n: number) => String(n).padStart(2, "0");
      const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      const fromStr = payload?.from ?? formatDate(todayCancun);
      const toStr = payload?.to ?? formatDate(todayCancun);

      const start = new Date(`${fromStr}T00:00:00.000${tzOffset}`);
      const end = new Date(`${toStr}T23:59:59.999${tzOffset}`);

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
        .all(toISODate(start), toISODate(end)) as Array<{
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

      const productsMap = new Map<
        string,
        { name: string; category: string; qty: number; subtotal: number }
      >();

      const categories = new Map<string, { qty: number; total: number }>();
      let grandTotal = 0;

      for (const row of rows) {
        grandTotal += row.item_subtotal;
        const category = row.item_category || "Sin categoría";

        // tickets
        if (!byTicket.has(row.sale_id)) {
          byTicket.set(row.sale_id, {
            saleId: row.sale_id,
            createdAt: row.created_at,
            total: row.sale_total,
            notes: row.sale_notes ?? undefined,
            items: [],
          });
        }
        byTicket.get(row.sale_id)!.items.push({
          name: row.item_name,
          qty: row.item_qty,
          price: row.item_price,
          subtotal: row.item_subtotal,
          category,
          flavor: row.item_flavor ?? undefined,
        });

        // products aggregate
        if (!productsMap.has(row.item_name)) {
          productsMap.set(row.item_name, {
            name: row.item_name,
            category,
            qty: 0,
            subtotal: 0,
          });
        }
        const prod = productsMap.get(row.item_name)!;
        prod.qty += row.item_qty;
        prod.subtotal += row.item_subtotal;

        // category aggregate
        if (!categories.has(category)) {
          categories.set(category, { qty: 0, total: 0 });
        }
        const cat = categories.get(category)!;
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
              total: v.total,
            })),
          },
          products: Array.from(productsMap.values()).sort((a, b) => b.subtotal - a.subtotal),
          tickets: Array.from(byTicket.values()),
        },
      };
    }
  );

  ipcMain.handle("flavors:list", () => {
    const db = getDb();
    const rows = db
      .prepare("SELECT id, name FROM flavors WHERE is_deleted = 0 ORDER BY name ASC")
      .all();
    return { ok: true, rows };
  });

  // ✅ Listar sabores con paginación y búsqueda (incluyendo eliminados)
  ipcMain.handle(
    "flavors:admin:list",
    (
      _event,
      payload: { page: number; pageSize: number; search?: string; showDeleted?: boolean }
    ) => {
      const db = getDb();
      const { page = 1, pageSize = 10, search = "", showDeleted = false } = payload;

      let whereClause = "";
      const params: (string | number)[] = [];

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

      // Total de registros
      const countQuery = `SELECT COUNT(*) as total FROM flavors ${whereClause}`;
      const countStmt = db.prepare(countQuery);
      const countResult = countStmt.all(...params)[0] as { total: number };
      const total = countResult.total;

      // Datos paginados
      const offset = (page - 1) * pageSize;
      const query = `
        SELECT id, name, is_deleted, created_at
        FROM flavors
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;
      const stmt = db.prepare(query);
      const rows = stmt.all(...params, pageSize, offset) as Array<{
        id: string;
        name: string;
        is_deleted: number;
        created_at: string;
      }>;

      const totalPages = Math.ceil(total / pageSize);

      return {
        ok: true,
        data: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      };
    }
  );

  // ✅ Crear nuevo sabor
  ipcMain.handle("flavors:create", (_event, payload: { name: string }) => {
    const db = getDb();

    if (!payload?.name?.trim()) {
      return { ok: false, message: "El nombre del sabor es requerido." };
    }

    const name = payload.name.trim();

    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      db.prepare(
        "INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, ?, ?)"
      ).run(id, name, 0, now);

      return { ok: true, id, name };
    } catch (err) {
      if ((err as any)?.message?.includes("UNIQUE")) {
        return { ok: false, message: "Este sabor ya existe." };
      }
      return { ok: false, message: "Error al crear sabor." };
    }
  });

  // ✅ Eliminar sabor (eliminado lógico)
  ipcMain.handle("flavors:delete", (_event, payload: { id: string }) => {
    const db = getDb();

    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }

    db.prepare("UPDATE flavors SET is_deleted = 1 WHERE id = ?").run(payload.id);
    return { ok: true };
  });

  // ✅ Restaurar sabor
  ipcMain.handle("flavors:restore", (_event, payload: { id: string }) => {
    const db = getDb();

    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }

    db.prepare("UPDATE flavors SET is_deleted = 0 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
}
