import { ipcRenderer, contextBridge } from "electron";
import type { ApiType } from "./api";

// Exponemos 2 cosas:
// 1) ipcRenderer (como tu template)
// 2) api (funciones limpias: createSale, latestSales)
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args));
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
});

// ✅ API directa para tu POS
contextBridge.exposeInMainWorld("api", {
  createSale: (payload: {
    items: { name: string; qty: number; price: number; category?: string; flavor?: string }[];
    notes?: string;
    cashReceived?: number;
    change?: number;
  }) => ipcRenderer.invoke("sales:create", payload),

  latestSales: () => ipcRenderer.invoke("sales:latest"),

  salesSummary: (payload: { from?: string; to?: string }) => ipcRenderer.invoke("sales:summary", payload),

  getFlavors: () => ipcRenderer.invoke("flavors:list"),

  // ✅ Admin APIs
  flavors: {
    list: (payload: { page?: number; pageSize?: number; search?: string; showDeleted?: boolean }) =>
      ipcRenderer.invoke("flavors:admin:list", payload),
    create: (payload: { name: string }) => ipcRenderer.invoke("flavors:create", payload),
    delete: (payload: { id: string }) => ipcRenderer.invoke("flavors:delete", payload),
    restore: (payload: { id: string }) => ipcRenderer.invoke("flavors:restore", payload),
  },

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
} as ApiType);
