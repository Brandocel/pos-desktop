import { app, BrowserWindow } from "electron";
import path from "node:path";
import { registerSalesIpc } from "./ipc/sales.ipc";
import { registerProductsIpc } from "./ipc/products.ipc";

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // ✅ IMPORTANTE: ahora cargamos preload.cjs (no .mjs)
      preload: path.join(process.cwd(), "dist-electron", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ✅ DEV: usar VITE_DEV_SERVER_URL si existe, si no, fallback a localhost
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173/";

  if (!app.isPackaged) {
    win.loadURL(devUrl);
    // (Opcional) abrir DevTools en dev
    // win.webContents.openDevTools({ mode: "detach" });
  } else {
    // ✅ PROD: cargar el build real
    win.loadFile(path.join(process.cwd(), "dist", "index.html"));
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(() => {
  try {
    registerSalesIpc(); // ✅ registra IPC para SQLite
    registerProductsIpc(); // ✅ registra IPC para Productos
    createWindow();
  } catch (err) {
    console.error("❌ Error al iniciar Electron:", err);
  }
});
