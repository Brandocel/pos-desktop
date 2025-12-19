// electron/preload.ts
import { ipcRenderer, contextBridge } from "electron";
import type { ApiType } from "./api";

// Exponemos 2 cosas:
// 1) ipcRenderer (como tu template)
// 2) api (funciones limpias)
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...rest) => listener(event, ...rest));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...rest] = args;
    return ipcRenderer.off(channel, ...rest);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...rest] = args;
    return ipcRenderer.send(channel, ...rest);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...rest] = args;
    return ipcRenderer.invoke(channel, ...rest);
  },
});

// ✅ API directa para tu POS
contextBridge.exposeInMainWorld(
  "api",
  {
    // ✅ ventas
    createSale: (payload: {
      items: { name: string; qty: number; price: number; category?: string; flavor?: string }[];
      notes?: string;
      cashReceived?: number;
      change?: number;
      total?: number; // opcional por si lo mandas
    }) => ipcRenderer.invoke("sales:create", payload),

    latestSales: () => ipcRenderer.invoke("sales:latest"),

    // ✅ corte/resumen
    salesSummary: (payload: { from?: string; to?: string }) =>
      ipcRenderer.invoke("sales:summary", payload),

    // ✅ PDF del corte
    salesCutPdf: (payload: { from?: string; to?: string }) =>
      ipcRenderer.invoke("sales:cutPdf", payload),

    // ✅ sabores (cliente)
    getFlavors: () => ipcRenderer.invoke("flavors:list"),

    // ✅ sabores (admin)
    flavors: {
      list: (payload: { page?: number; pageSize?: number; search?: string; showDeleted?: boolean }) =>
        ipcRenderer.invoke("flavors:admin:list", payload),
      create: (payload: { name: string }) => ipcRenderer.invoke("flavors:create", payload),
      delete: (payload: { id: string }) => ipcRenderer.invoke("flavors:delete", payload),
      restore: (payload: { id: string }) => ipcRenderer.invoke("flavors:restore", payload),
    },

    // ✅ productos (admin + ventas)
    products: {
      list: (payload: {
        page?: number;
        pageSize?: number;
        category?: string;
        search?: string;
        showDeleted?: boolean;
      }) => ipcRenderer.invoke("products:admin:list", payload),

      categories: () => ipcRenderer.invoke("products:categories"),

      salesList: () => ipcRenderer.invoke("products:sales:list"),

      create: (payload: {
        name: string;
        category: string;
        price: number;
        requires_flavor: boolean;
        flavor_id?: string;
        included_extras?: string[];
      }) => ipcRenderer.invoke("products:create", payload),

      update: (payload: {
        id: string;
        name: string;
        category: string;
        price: number;
        requires_flavor: boolean;
        flavor_id?: string;
        included_extras?: string[];
      }) => ipcRenderer.invoke("products:update", payload),

      delete: (payload: { id: string }) => ipcRenderer.invoke("products:delete", payload),
      restore: (payload: { id: string }) => ipcRenderer.invoke("products:restore", payload),
    },
  } as ApiType
);
