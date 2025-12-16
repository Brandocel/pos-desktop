import Database from "better-sqlite3";
import path from "node:path";
import { app } from "electron";
import { schemaSQL } from "./schema";

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;

  const userData = app.getPath("userData");
  const dbPath = path.join(userData, "pos.sqlite");

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(schemaSQL);

  return db;
}
