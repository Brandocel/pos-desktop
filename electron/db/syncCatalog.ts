// electron/db/syncCatalog.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { initialFlavors, initialProducts, packageIncludes } from "./schema";

// ---------- helpers ----------
function uid(prefix: string) {
  // crypto.randomUUID() existe en Node moderno (Electron moderno). Si tu Electron es viejo, avísame.
  return `${prefix}_${crypto.randomUUID()}`;
}
function nowISO() {
  return new Date().toISOString();
}
function norm(s: any) {
  return String(s ?? "").trim();
}
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------- backup seguro ----------
export function backupDbFile(dbFilePath: string) {
  try {
    if (!dbFilePath || !fs.existsSync(dbFilePath)) return null;

    const dir = path.dirname(dbFilePath);
    const backupDir = path.join(dir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `db-backup-${stamp}.sqlite`);

    fs.copyFileSync(dbFilePath, backupPath);
    return backupPath;
  } catch (e) {
    console.error("[DB] No se pudo crear backup:", e);
    return null;
  }
}

/**
 * Sincroniza catálogo de forma SEGURA:
 * - Inserta faltantes
 * - Actualiza price/category/requires_flavor si cambió
 * - Marca is_deleted=1 lo que NO está en schema.ts
 *
 * NOTA: No borra ventas (sales / sale_items) -> seguro.
 */
export function syncCatalogSafe(db: Database) {
  const tx = db.transaction(() => {
    // =========================
    // 1) FLAVORS
    // =========================
    const wantedFlavors = new Set(initialFlavors.map(norm));

    const flavorsDb = db
      .prepare(`SELECT id, name, is_deleted FROM flavors`)
      .all() as Array<{ id: string; name: string; is_deleted: number }>;

    const flavorByName = new Map<string, { id: string; is_deleted: number }>();
    for (const f of flavorsDb) flavorByName.set(norm(f.name), { id: f.id, is_deleted: safeNum(f.is_deleted) });

    const insertFlavor = db.prepare(`
      INSERT INTO flavors (id, name, is_deleted, created_at)
      VALUES (@id, @name, 0, @created_at)
    `);

    const setFlavorActive = db.prepare(`UPDATE flavors SET is_deleted = 0 WHERE id = ?`);
    const setFlavorDeleted = db.prepare(`UPDATE flavors SET is_deleted = 1 WHERE id = ?`);

    // upsert / revive
    for (const nameRaw of initialFlavors) {
      const name = norm(nameRaw);
      if (!name) continue;

      const existing = flavorByName.get(name);
      if (!existing) {
        insertFlavor.run({ id: uid("flv"), name, created_at: nowISO() });
      } else if (existing.is_deleted === 1) {
        setFlavorActive.run(existing.id);
      }
    }

    // soft delete los que ya no existen en schema.ts
    for (const f of flavorsDb) {
      const name = norm(f.name);
      if (!wantedFlavors.has(name) && safeNum(f.is_deleted) === 0) {
        setFlavorDeleted.run(f.id);
      }
    }

    // =========================
    // 2) PRODUCTS
    // =========================
    const wantedProducts = new Map(
      initialProducts.map((p) => [
        norm(p.name),
        {
          name: norm(p.name),
          category: norm(p.category),
          price: safeNum(p.price),
          requires_flavor: safeNum(p.requires_flavor) ? 1 : 0,
        },
      ])
    );

    const productsDb = db
      .prepare(`SELECT id, name, category, price, requires_flavor, is_deleted FROM products`)
      .all() as Array<{
        id: string;
        name: string;
        category: string;
        price: number;
        requires_flavor: number;
        is_deleted: number;
      }>;

    const productByName = new Map<string, (typeof productsDb)[number]>();
    for (const p of productsDb) productByName.set(norm(p.name), p);

    const insertProduct = db.prepare(`
      INSERT INTO products (
        id, name, category, price, requires_flavor, flavor_id, is_deleted, created_at
      ) VALUES (
        @id, @name, @category, @price, @requires_flavor, NULL, 0, @created_at
      )
    `);

    const updateProduct = db.prepare(`
      UPDATE products
      SET category = @category,
          price = @price,
          requires_flavor = @requires_flavor,
          is_deleted = 0
      WHERE id = @id
    `);

    const setProductActive = db.prepare(`UPDATE products SET is_deleted = 0 WHERE id = ?`);
    const setProductDeleted = db.prepare(`UPDATE products SET is_deleted = 1 WHERE id = ?`);

    // upsert / update
    for (const [name, desired] of wantedProducts.entries()) {
      if (!name) continue;

      const existing = productByName.get(name);

      if (!existing) {
        insertProduct.run({
          id: uid("prd"),
          name: desired.name,
          category: desired.category,
          price: desired.price,
          requires_flavor: desired.requires_flavor,
          created_at: nowISO(),
        });
        continue;
      }

      if (safeNum(existing.is_deleted) === 1) setProductActive.run(existing.id);

      const needsUpdate =
        norm(existing.category) !== desired.category ||
        safeNum(existing.price) !== desired.price ||
        safeNum(existing.requires_flavor) !== desired.requires_flavor;

      if (needsUpdate) {
        updateProduct.run({
          id: existing.id,
          category: desired.category,
          price: desired.price,
          requires_flavor: desired.requires_flavor,
        });
      }
    }

    // soft delete lo que NO está en schema.ts
    for (const p of productsDb) {
      const name = norm(p.name);
      if (!wantedProducts.has(name) && safeNum(p.is_deleted) === 0) {
        setProductDeleted.run(p.id);
      }
    }

    // =========================
    // 3) PACKAGE INCLUDES (Opcional seguro)
    // =========================
    // Tu tabla product_included_extras NO trae qty en el schema actual,
    // pero tu array sí. Aquí se guarda sin qty para no romper.
    //
    // Importante: limpiamos y recreamos solo las relaciones.
    // Esto NO afecta ventas porque sales_items ya guarda texto/precio.
    const getProductIdByName = db.prepare(`SELECT id FROM products WHERE name = ? AND is_deleted = 0`);

    db.prepare(`DELETE FROM product_included_extras`).run();

    const insertInclude = db.prepare(`
      INSERT INTO product_included_extras (id, product_id, extra_id)
      VALUES (@id, @product_id, @extra_id)
    `);

    for (const pack of packageIncludes) {
      const packIdRow = getProductIdByName.get(norm(pack.packageName)) as { id: string } | undefined;
      if (!packIdRow) continue;

      for (const ex of pack.extras) {
        const extraIdRow = getProductIdByName.get(norm(ex.name)) as { id: string } | undefined;
        if (!extraIdRow) continue;

        insertInclude.run({
          id: uid("inc"),
          product_id: packIdRow.id,
          extra_id: extraIdRow.id,
        });
      }
    }
  });

  tx();
}
