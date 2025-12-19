// electron/db/schema.ts
export const schemaSQL = `
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

// Datos iniciales de sabores
export const initialFlavors = [
  "Tamarindo",
  "BBQ",
  "Axiote",
  "Talla",
  "Pimienta",
  "Pastor",
];

// Datos iniciales de productos
export const initialProducts = [
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
  { name: "Refresco", category: "Extras", price: 0, requires_flavor: 0 },
];
