import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { registerSalesIpc } from "./ipc/sales.ipc";
import { registerProductsIpc } from "./ipc/products.ipc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;

function showFatalError(title: string, details: string) {
  try {
    // Mensaje para cliente final (bonito y accionable)
    dialog.showMessageBoxSync({
      type: "error",
      title,
      message:
        "Ocurrió un problema al iniciar la aplicación.\n\n" +
        "Por favor toma una captura de esta pantalla y contacta al equipo de desarrollo.",
      detail: details,
      buttons: ["Cerrar"],
    });
  } catch {
    // por si dialog falla
    console.error(title, details);
  }
}

function writeCrashLog(err: any) {
  try {
    const userData = app.getPath("userData"); // carpeta segura por usuario
    const logDir = path.join(userData, "logs");
    fs.mkdirSync(logDir, { recursive: true });

    const file = path.join(logDir, `fatal-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
    fs.writeFileSync(
      file,
      [
        "=== POLLO PIRATA POS - FATAL ERROR ===",
        `date: ${new Date().toISOString()}`,
        `appVersion: ${app.getVersion()}`,
        `platform: ${process.platform} ${process.arch}`,
        "",
        String(err?.stack || err?.message || err),
      ].join("\n"),
      "utf-8"
    );

    return file;
  } catch (e) {
    console.error("No se pudo escribir log fatal:", e);
    return null;
  }
}

function createWindow() {
  // ✅ preload real (en PROD está dentro de resources/app.asar/dist-electron/preload.cjs)
  const preloadPath = path.join(__dirname, "preload.cjs");

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ✅ Captura errores de carga (para evitar “pantalla blanca silenciosa”)
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    const logFile = writeCrashLog({ message: `did-fail-load ${code} ${desc} ${url}` });
    showFatalError(
      "Error al cargar la aplicación",
      `No se pudo cargar la pantalla.\n\nDetalle: ${code} - ${desc}\nURL: ${url}\n\nLog: ${logFile ?? "no disponible"}`
    );
    app.quit();
  });

  // ✅ DEV
  const devUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173/";

  if (!app.isPackaged) {
    win.loadURL(devUrl);
    // win.webContents.openDevTools({ mode: "detach" });
    return;
  }

  // ✅ PROD: NUNCA uses process.cwd() aquí
  // app.getAppPath() apunta al root dentro del app.asar
  const indexHtml = path.join(app.getAppPath(), "dist", "index.html");

  win.loadFile(indexHtml).catch((err) => {
    const logFile = writeCrashLog(err);
    showFatalError(
      "Error al iniciar",
      `No se pudo abrir la interfaz.\n\nArchivo: ${indexHtml}\n\nLog: ${logFile ?? "no disponible"}\n\n${String(
        err?.message || err
      )}`
    );
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
  win = null;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(() => {
  try {
    registerSalesIpc();
    registerProductsIpc();
    createWindow();
  } catch (err) {
    const logFile = writeCrashLog(err);
    showFatalError(
      "Error crítico",
      `La app falló al iniciar módulos internos.\n\nLog: ${logFile ?? "no disponible"}\n\n${String(
        (err as any)?.stack || (err as any)?.message || err
      )}`
    );
    app.quit();
  }
});
