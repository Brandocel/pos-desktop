/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string;
    VITE_PUBLIC: string;
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import("electron").IpcRenderer;

  api: {
    createSale: (payload: {
      items: { name: string; qty: number; price: number }[];
      notes?: string;
    }) => Promise<{ ok: boolean; message?: string; saleId?: string; total?: number }>;

    latestSales: () => Promise<{ ok: boolean; rows?: any[] }>;
  };
}
