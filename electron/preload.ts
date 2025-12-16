import { ipcRenderer, contextBridge } from "electron";

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
    items: { name: string; qty: number; price: number }[];
    notes?: string;
  }) => ipcRenderer.invoke("sales:create", payload),

  latestSales: () => ipcRenderer.invoke("sales:latest"),
});
