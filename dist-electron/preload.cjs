"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...rest) => listener(event, ...rest));
  },
  off(...args) {
    const [channel, ...rest] = args;
    return electron.ipcRenderer.off(channel, ...rest);
  },
  send(...args) {
    const [channel, ...rest] = args;
    return electron.ipcRenderer.send(channel, ...rest);
  },
  invoke(...args) {
    const [channel, ...rest] = args;
    return electron.ipcRenderer.invoke(channel, ...rest);
  }
});
electron.contextBridge.exposeInMainWorld(
  "api",
  {
    // ✅ ventas
    createSale: (payload) => electron.ipcRenderer.invoke("sales:create", payload),
    latestSales: () => electron.ipcRenderer.invoke("sales:latest"),
    // ✅ corte/resumen
    salesSummary: (payload) => electron.ipcRenderer.invoke("sales:summary", payload),
    // ✅ PDF del corte
    salesCutPdf: (payload) => electron.ipcRenderer.invoke("sales:cutPdf", payload),
    // ✅ sabores (cliente)
    getFlavors: () => electron.ipcRenderer.invoke("flavors:list"),
    // ✅ sabores (admin)
    flavors: {
      list: (payload) => electron.ipcRenderer.invoke("flavors:admin:list", payload),
      create: (payload) => electron.ipcRenderer.invoke("flavors:create", payload),
      delete: (payload) => electron.ipcRenderer.invoke("flavors:delete", payload),
      restore: (payload) => electron.ipcRenderer.invoke("flavors:restore", payload)
    },
    // ✅ productos (admin + ventas)
    products: {
      list: (payload) => electron.ipcRenderer.invoke("products:admin:list", payload),
      categories: () => electron.ipcRenderer.invoke("products:categories"),
      salesList: () => electron.ipcRenderer.invoke("products:sales:list"),
      create: (payload) => electron.ipcRenderer.invoke("products:create", payload),
      update: (payload) => electron.ipcRenderer.invoke("products:update", payload),
      delete: (payload) => electron.ipcRenderer.invoke("products:delete", payload),
      restore: (payload) => electron.ipcRenderer.invoke("products:restore", payload)
    }
  }
);
