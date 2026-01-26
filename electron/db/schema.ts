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

// Datos iniciales de sabores
export const initialFlavors = [
  "Tamarindo",
  "Axiote",
  "BBQ",
  "Talla",
  "Pimienta",
  "Pastor",
];

// Datos iniciales de productos
export const initialProducts = [
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
  // { name: "Refresco 2L", category: "Bebidas", price: 50, requires_flavor: 0 },
  // { name: "Refresco 600 ml", category: "Bebidas", price: 30, requires_flavor: 0 },
];

// Asociaciones: qué extras incluye cada paquete con cantidades
// Formato: { packageName: "Nombre del paquete", extras: [{ name: "Extra", qty: 1 }, ...] }
export const packageIncludes = [
  {
    packageName: "Acompañes",
    extras: [{ name: "1/4 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Amigo",
    extras: [{ name: "1/2 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }, { name: "Postre", qty: 1 }],
  },
  {
    packageName: "Sorpresa",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Papa al horno", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Primavera",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Ensalada de coditos", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Pirata",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Purée de papa", qty: 1 }, { name: "Spaghetti", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }, { name: "Postre", qty: 1 }],
  },
  {
    packageName: "Taquitos",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Tacos dorados (4 pzas)", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Apollo",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "1/2 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Paquete Especial",
    extras: [{ name: "1 pollo", qty: 2 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Tesoro",
    extras: [{ name: "1 pollo", qty: 2 }, { name: "Purée de papa", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }, { name: "Postre", qty: 1 }],
  },
  
  // ESPECIALIDADES (con sus acompañamientos)
  {
    packageName: "Veracruz 1 pollo",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Veracruz 1/2 pollo",
    extras: [{ name: "1/2 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Peninsular 1 pollo",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
  {
    packageName: "Peninsular 1/2 pollo",
    extras: [{ name: "1/2 pollo", qty: 1 }, { name: "Arroz", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },

  // MIÉRCOLES (con sus acompañamientos)
  {
    packageName: "Súper Miércoles",
    extras: [{ name: "1 pollo", qty: 1 }, { name: "Frijol", qty: 1 }, { name: "Tortillas", qty: 1 }, { name: "Salsa", qty: 1 }],
  },
];

// Opciones personalizables para productos
// Permite elegir entre variantes de acompañamientos u otros extras
export const productCustomOptions: Record<string, { label: string; options: Array<{ name: string; extraName: string }> }> = {
  "Pirata": {
    label: "Elige tu acompañamiento",
    options: [
      { name: "Con puré de papa", extraName: "Purée de papa" },
      { name: "Con espagueti", extraName: "Spaghetti" },
    ],
  },
};
