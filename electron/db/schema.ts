// electron/db/schema.ts
export const schemaSQL = `
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
