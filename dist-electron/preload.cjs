"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
});
electron.contextBridge.exposeInMainWorld("api", {
  createSale: (payload) => electron.ipcRenderer.invoke("sales:create", payload),
  latestSales: () => electron.ipcRenderer.invoke("sales:latest"),
  salesSummary: (payload) => electron.ipcRenderer.invoke("sales:summary", payload),
  getFlavors: () => electron.ipcRenderer.invoke("flavors:list"),
  // ✅ Admin APIs
  flavors: {
    list: (payload) => electron.ipcRenderer.invoke("flavors:admin:list", payload),
    create: (payload) => electron.ipcRenderer.invoke("flavors:create", payload),
    delete: (payload) => electron.ipcRenderer.invoke("flavors:delete", payload),
    restore: (payload) => electron.ipcRenderer.invoke("flavors:restore", payload)
  },
  products: {
    list: (payload) => electron.ipcRenderer.invoke("products:admin:list", payload),
    categories: () => electron.ipcRenderer.invoke("products:categories"),
    salesList: () => electron.ipcRenderer.invoke("products:sales:list"),
    create: (payload) => electron.ipcRenderer.invoke("products:create", payload),
    update: (payload) => electron.ipcRenderer.invoke("products:update", payload),
    delete: (payload) => electron.ipcRenderer.invoke("products:delete", payload),
    restore: (payload) => electron.ipcRenderer.invoke("products:restore", payload)
  }
});
