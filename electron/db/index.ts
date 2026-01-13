import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";
import { schemaSQL, initialFlavors, initialProducts, packageIncludes } from "./schema";
import crypto from "crypto";

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;

  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "pos.sqlite");

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSQL);

  migrateSaleItems();
  migrateSales();

  // Insertar sabores iniciales si no existen
  seedFlavors();
  // Insertar productos iniciales si no existen
  seedProducts();
  // Asociar extras a paquetes
  seedPackageIncludes();

  return db;
}

function seedFlavors() {
  if (!db) return;

  const countFlavors = db
    .prepare("SELECT COUNT(*) as count FROM flavors WHERE is_deleted = 0")
    .get() as { count: number };

  if (countFlavors.count === 0) {
    const insert = db.prepare(
      "INSERT INTO flavors (id, name, is_deleted, created_at) VALUES (?, ?, ?, ?)"
    );

    const now = new Date().toISOString();
    for (const flavorName of initialFlavors) {
      const id = crypto.randomUUID();
      insert.run(id, flavorName, 0, now);
    }
  }
}

// Migración ligera: asegura columnas nuevas en sale_items
function migrateSaleItems() {
  if (!db) return;
  const cols = db.prepare("PRAGMA table_info(sale_items);").all() as Array<{ name: string }>;
  const hasCategory = cols.some((c) => c.name === "category");
  const hasFlavor = cols.some((c) => c.name === "flavor");

  const alterStatements: string[] = [];
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

// Migración para agregar payment_method a sales
function migrateSales() {
  if (!db) return;
  const cols = db.prepare("PRAGMA table_info(sales);").all() as Array<{ name: string }>;
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

  const countProducts = db
    .prepare("SELECT COUNT(*) as count FROM products WHERE is_deleted = 0")
    .get() as { count: number };

  if (countProducts.count === 0) {
    const insert = db.prepare(
      "INSERT INTO products (id, name, category, price, requires_flavor, is_deleted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );

    const now = new Date().toISOString();
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

// Asociar extras a paquetes
function seedPackageIncludes() {
  if (!db) return;

  // Verificar si ya existen asociaciones
  const countAssocs = db
    .prepare("SELECT COUNT(*) as count FROM product_included_extras")
    .get() as { count: number };

  if (countAssocs.count > 0) return; // Ya existen, no hacer nada

  const insertAssoc = db.prepare(
    "INSERT INTO product_included_extras (id, product_id, extra_id) VALUES (?, ?, ?)"
  );

  for (const pkg of packageIncludes) {
    // Obtener ID del paquete (buscar también en Especialidades y Miércoles)
    const packageRow = db
      .prepare("SELECT id FROM products WHERE name = ? AND is_deleted = 0")
      .get(pkg.packageName) as { id: string } | undefined;

    if (!packageRow) continue;

    // Obtener IDs de los extras (pkg.extras ahora es array de { name, qty })
    for (const extra of pkg.extras) {
      const extraName = extra.name;
      const extraRow = db
        .prepare("SELECT id FROM products WHERE name = ? AND is_deleted = 0")
        .get(extraName) as { id: string } | undefined;

      if (!extraRow) continue;

      // Crear asociación
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

