// electron/db/index.ts
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import crypto from "crypto";

import { schemaSQL, initialFlavors, initialProducts, packageIncludes } from "./schema";

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;

  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "pos.sqlite");

  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(schemaSQL);

  // Migraciones (no tocan ventas)
  migrateSaleItems();
  migrateSales();

  // ✅ SINCRONIZA CATÁLOGO seguro
  // - backup automático
  // - transaction
  // - soft delete lo que no está en schema.ts
  // - upsert + update precios/categoría/requires_flavor
  syncCatalogSafe();

  return db;
}

/**
 * ✅ RESETEA SOLO EL CATÁLOGO (NO TOCA VENTAS) - MODO SEGURO
 * - NO borra sales
 * - NO borra sale_items
 * - SOLO soft-delete lo que sobra y revive lo que exista en schema
 * - Rehace associations
 */
export function resetCatalog() {
  const database = getDb();

  // ✅ backup antes (seguridad)
  const backup = backupDbFile(path.join(app.getPath("userData"), "pos.sqlite"));
  if (backup) console.log("✅ Backup creado:", backup);

  const tx = database.transaction(() => {
    // sincroniza catálogo completo
    syncCatalogSafe();
  });

  tx();

  const total = database
    .prepare("SELECT COUNT(*) as c FROM products WHERE is_deleted = 0")
    .get() as { c: number };

  console.log(`✅ Catálogo sincronizado. Productos activos: ${total.c}`);
  return { ok: true, products: total.c };
}

/** ---------------------------
 * Helpers
 * --------------------------*/

function normalizeName(s: string) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^paquete\s+/g, "");
}

function nowISO() {
  return new Date().toISOString();
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ✅ BACKUP SEGURO del archivo sqlite antes de modificar catálogo
 */
function backupDbFile(dbFilePath: string) {
  try {
    if (!dbFilePath || !fs.existsSync(dbFilePath)) return null;

    const dir = path.dirname(dbFilePath);
    const backupDir = path.join(dir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `pos-backup-${stamp}.sqlite`);

    fs.copyFileSync(dbFilePath, backupPath);
    return backupPath;
  } catch (e) {
    console.error("No se pudo crear backup:", e);
    return null;
  }
}

/** ---------------------------
 * ✅ SINCRONIZACIÓN SEGURA DE CATÁLOGO
 * --------------------------*/

function syncCatalogSafe() {
  if (!db) return;

  const database = db;

  const tx = database.transaction(() => {
    // 0) Normaliza “lo que debe existir”
    const wantedFlavors = new Set(initialFlavors.map((f) => String(f).trim()));
    const wantedProducts = new Map(
      initialProducts.map((p) => [
        normalizeName(p.name),
        {
          name: String(p.name).trim(),
          category: String(p.category).trim(),
          price: safeNum(p.price),
          requires_flavor: safeNum((p as any).requires_flavor) ? 1 : 0,
        },
      ])
    );

    // =========================
    // 1) FLAVORS (upsert + soft delete)
    // =========================
    const allFlavors = database
      .prepare(`SELECT id, name, is_deleted FROM flavors`)
      .all() as Array<{ id: string; name: string; is_deleted: number }>;

    const flavorByName = new Map<string, { id: string; is_deleted: number }>();
    for (const f of allFlavors) flavorByName.set(String(f.name).trim(), { id: f.id, is_deleted: safeNum(f.is_deleted) });

    const insertFlavor = database.prepare(
      `INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, 0, ?)`
    );
    const reviveFlavor = database.prepare(`UPDATE flavors SET is_deleted = 0 WHERE id = ?`);
    const softDeleteFlavor = database.prepare(`UPDATE flavors SET is_deleted = 1 WHERE id = ?`);

    // Inserta o revive los que están en schema.ts
    for (const flavorNameRaw of initialFlavors) {
      const flavorName = String(flavorNameRaw).trim();
      if (!flavorName) continue;

      const existing = flavorByName.get(flavorName);
      if (!existing) {
        insertFlavor.run(crypto.randomUUID(), flavorName, nowISO());
      } else if (existing.is_deleted === 1) {
        reviveFlavor.run(existing.id);
      }
    }

    // Soft delete lo que NO está
    for (const f of allFlavors) {
      const name = String(f.name).trim();
      if (!wantedFlavors.has(name) && safeNum(f.is_deleted) === 0) {
        softDeleteFlavor.run(f.id);
      }
    }

    // =========================
    // 2) PRODUCTS (upsert + update + soft delete)
    // =========================
    const allProducts = database
      .prepare(`SELECT id, name, category, price, requires_flavor, is_deleted FROM products`)
      .all() as Array<{
        id: string;
        name: string;
        category: string;
        price: number | null;
        requires_flavor: number | null;
        is_deleted: number;
      }>;

    const productByKey = new Map<string, (typeof allProducts)[number]>();
    for (const p of allProducts) productByKey.set(normalizeName(p.name), p);

    const insertProduct = database.prepare(
      `INSERT INTO products (id, name, category, price, requires_flavor, flavor_id, is_deleted, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, 0, ?)`
    );

    const updateProduct = database.prepare(
      `UPDATE products
       SET category = ?,
           price = ?,
           requires_flavor = ?,
           is_deleted = 0
       WHERE id = ?`
    );

    const softDeleteProduct = database.prepare(`UPDATE products SET is_deleted = 1 WHERE id = ?`);

    // Inserta o actualiza los que están en schema.ts
    for (const [key, desired] of wantedProducts.entries()) {
      const existing = productByKey.get(key);

      if (!existing) {
        insertProduct.run(
          crypto.randomUUID(),
          desired.name,
          desired.category,
          desired.price,
          desired.requires_flavor,
          nowISO()
        );
        continue;
      }

      const existingCategory = String(existing.category ?? "").trim();
      const existingPrice = safeNum(existing.price);
      const existingReq = safeNum(existing.requires_flavor) ? 1 : 0;
      const existingDeleted = safeNum(existing.is_deleted);

      const needsUpdate =
        existingCategory !== desired.category ||
        existingPrice !== desired.price ||
        existingReq !== desired.requires_flavor ||
        existingDeleted !== 0;

      if (needsUpdate) {
        updateProduct.run(
          desired.category,
          desired.price,
          desired.requires_flavor,
          existing.id
        );
      }
    }

    // Soft delete lo que NO está en schema.ts
    for (const p of allProducts) {
      const key = normalizeName(p.name);
      if (!wantedProducts.has(key) && safeNum(p.is_deleted) === 0) {
        softDeleteProduct.run(p.id);
      }
    }

    // =========================
    // 3) PACKAGE INCLUDES
    // =========================
    // tu tabla no guarda qty, así que guardamos solo relación.
    database.prepare("DELETE FROM product_included_extras").run();

    const getProductIdByName = database.prepare(
      "SELECT id FROM products WHERE name = ? AND is_deleted = 0"
    );

    const insertAssoc = database.prepare(
      "INSERT INTO product_included_extras (id, product_id, extra_id) VALUES (?, ?, ?)"
    );

    for (const pkg of packageIncludes) {
      const packageRow = getProductIdByName.get(String(pkg.packageName).trim()) as { id: string } | undefined;
      if (!packageRow) continue;

      for (const extra of pkg.extras) {
        const extraRow = getProductIdByName.get(String(extra.name).trim()) as { id: string } | undefined;
        if (!extraRow) continue;

        try {
          insertAssoc.run(crypto.randomUUID(), packageRow.id, extraRow.id);
        } catch (err) {
          console.warn(`No se pudo asociar ${extra.name} a ${pkg.packageName}:`, err);
        }
      }
    }

    console.log("✅ Catálogo sincronizado (safe): insert/update/soft-delete + includes");
  });

  tx();
}

/** ---------------------------
 * Migraciones existentes
 * --------------------------*/

function migrateSaleItems() {
  if (!db) return;

  const cols = db.prepare("PRAGMA table_info(sale_items);").all() as Array<{ name: string }>;
  const hasCategory = cols.some((c) => c.name === "category");
  const hasFlavor = cols.some((c) => c.name === "flavor");

  const alterStatements: string[] = [];

  if (!hasCategory) {
    alterStatements.push(
      "ALTER TABLE sale_items ADD COLUMN category TEXT NOT NULL DEFAULT 'Sin categoría'"
    );
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

  const cols = db.prepare("PRAGMA table_info(sales);").all() as Array<{ name: string }>;
  const hasPaymentMethod = cols.some((c) => c.name === "payment_method");

  if (!hasPaymentMethod) {
    try {
      db.prepare(
        "ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'"
      ).run();
      console.log("✅ Migración: columna payment_method agregada a sales");
    } catch (err) {
      console.warn("Migración sales omitida:", err);
    }
  }
}
