import { ipcMain } from "electron";
import { resetCatalog } from "../db";

export function registerDbIpc() {
  ipcMain.handle("db:resetCatalog", async () => {
    const result = resetCatalog();
    return result; // { ok: true, products: number }
  });
}
