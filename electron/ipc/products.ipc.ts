// electron/ipc/products.ipc.ts
import { ipcMain } from "electron";
import { getDb } from "../db";
import crypto from "crypto";

export function registerProductsIpc() {
  // ✅ Listar productos con paginación y búsqueda
  ipcMain.handle(
    "products:admin:list",
    (
      _event,
      payload: {
        page: number;
        pageSize: number;
        category?: string;
        search?: string;
        showDeleted?: boolean;
      }
    ) => {
      const db = getDb();
      const { page = 1, pageSize = 10, category, search = "", showDeleted = false } = payload;

      let whereClause = "";
      const params: (string | number)[] = [];

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

      // Total de registros
      const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
      const countStmt = db.prepare(countQuery);
      const countResult = countStmt.all(...params)[0] as { total: number };
      const total = countResult.total;

      // Datos paginados
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
      const stmt = db.prepare(query);
      const rows = stmt.all(...params, pageSize, offset) as Array<{
        id: string;
        name: string;
        category: string;
        price: number;
        requires_flavor: number;
        flavor_id: string | null;
        is_deleted: number;
        created_at: string;
        included_extras: string | null;
      }>;

      const totalPages = Math.ceil(total / pageSize);

      return {
        ok: true,
        data: rows.map((r) => ({
          ...r,
          included_extras: r.included_extras ? r.included_extras.split(",") : [],
        })),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      };
    }
  );

  // ✅ Obtener categorías únicas
  ipcMain.handle("products:categories", () => {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT DISTINCT category FROM products WHERE is_deleted = 0 ORDER BY category ASC"
      )
      .all() as Array<{ category: string }>;
    return { ok: true, categories: rows.map((r) => r.category) };
  });

  // ✅ Obtener productos para ventas (activos)
  ipcMain.handle("products:sales:list", () => {
    const db = getDb();
    const query = `
      SELECT p.id, p.name, p.category, p.price, p.requires_flavor, p.flavor_id,
             GROUP_CONCAT(pie.extra_id) as included_extras
      FROM products p
      LEFT JOIN product_included_extras pie ON p.id = pie.product_id
      WHERE p.is_deleted = 0
      GROUP BY p.id
      ORDER BY p.category, p.name
    `;
    const rows = db.prepare(query).all() as Array<{
      id: string;
      name: string;
      category: string;
      price: number;
      requires_flavor: number;
      flavor_id: string | null;
      included_extras: string | null;
    }>;

    return {
      ok: true,
      products: rows.map((r) => ({
        ...r,
        included_extras: r.included_extras ? r.included_extras.split(",") : [],
      })),
    };
  });

  // ✅ Crear producto
  ipcMain.handle(
    "products:create",
    (
      _event,
      payload: {
        name: string;
        category: string;
        price: number;
        requires_flavor: boolean;
        flavor_id?: string;
        included_extras?: string[];
      }
    ) => {
      const db = getDb();

      if (!payload?.name?.trim() || !payload?.category?.trim()) {
        return { ok: false, message: "Nombre y categoría son requeridos." };
      }

      try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        db.prepare(
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

        // Agregar extras incluidos si los hay
        if (payload.included_extras && payload.included_extras.length > 0) {
          const insertExtra = db.prepare(
            "INSERT INTO product_included_extras (id, product_id, extra_id) VALUES (?, ?, ?)"
          );
          for (const extraId of payload.included_extras) {
            insertExtra.run(crypto.randomUUID(), id, extraId);
          }
        }

        return { ok: true, id };
      } catch (err) {
        if ((err as any)?.message?.includes("UNIQUE")) {
          return { ok: false, message: "Este producto ya existe." };
        }
        console.error(err);
        return { ok: false, message: "Error al crear producto." };
      }
    }
  );

  // ✅ Actualizar producto
  ipcMain.handle(
    "products:update",
    (
      _event,
      payload: {
        id: string;
        name: string;
        category: string;
        price: number;
        requires_flavor: boolean;
        flavor_id?: string;
        included_extras?: string[];
      }
    ) => {
      const db = getDb();

      if (!payload?.id || !payload?.name?.trim()) {
        return { ok: false, message: "ID y nombre son requeridos." };
      }

      try {
        db.prepare(
          "UPDATE products SET name = ?, category = ?, price = ?, requires_flavor = ?, flavor_id = ? WHERE id = ?"
        ).run(
          payload.name.trim(),
          payload.category,
          payload.price || 0,
          payload.requires_flavor ? 1 : 0,
          payload.flavor_id || null,
          payload.id
        );

        // Actualizar extras incluidos
        db.prepare("DELETE FROM product_included_extras WHERE product_id = ?").run(payload.id);

        if (payload.included_extras && payload.included_extras.length > 0) {
          const insertExtra = db.prepare(
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

  // ✅ Eliminar producto (lógico)
  ipcMain.handle("products:delete", (_event, payload: { id: string }) => {
    const db = getDb();

    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }

    db.prepare("UPDATE products SET is_deleted = 1 WHERE id = ?").run(payload.id);
    return { ok: true };
  });

  // ✅ Restaurar producto
  ipcMain.handle("products:restore", (_event, payload: { id: string }) => {
    const db = getDb();

    if (!payload?.id) {
      return { ok: false, message: "ID requerido." };
    }

    db.prepare("UPDATE products SET is_deleted = 0 WHERE id = ?").run(payload.id);
    return { ok: true };
  });
}
