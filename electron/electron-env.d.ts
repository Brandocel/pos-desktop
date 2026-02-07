/// <reference types="vite-plugin-electron/electron-env" />

export {};

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string;
    VITE_PUBLIC: string;
  }
}

type ApiOk<T> = { ok: true; data?: T; message?: string };
type ApiFail = { ok: false; message?: string };
type ApiRes<T> = ApiOk<T> | ApiFail;

type SalesSummaryData = {
  range: { from: string; to: string };
  totals: {
    grand: number;
    categories: Array<{ category: string; qty: number; total: number }>;
  };
  products: Array<{ name: string; category: string; qty: number; subtotal: number }>;
  tickets: Array<{
    saleId: string;
    createdAt: string;
    total: number;
    notes?: string;
    items: Array<{
      name: string;
      qty: number;
      price: number;
      subtotal: number;
      category: string;
      flavor?: string;
    }>;
  }>;
};

declare global {
  interface Window {
    ipcRenderer: import("electron").IpcRenderer;

    api: {
      // ✅ Productos
      products: {
        salesList: () => Promise<{ ok: boolean; products?: any[]; message?: string }>;
      };

      // ✅ Sabores
      getFlavors: () => Promise<{ ok: boolean; rows?: Array<{ name: string }>; message?: string }>;
      flavors: any;

      // ✅ Guardar venta (ponlo como realmente lo usas)
      createSale: (payload: {
        items: Array<{
          name: string;
          qty: number;
          price: number;
          category?: string;
          flavor?: string;
          customOption?: string;
          components?: Array<{
            slot: number;
            portion: string;
            flavor?: string;
            isSpecialty?: boolean;
            specialty?: string;
          }>;
        }>;
        paymentMethod?: "cash" | "card";
        notes?: string;
        cashReceived: number;
        total: number;
        change: number;
      }) => Promise<{ ok: boolean; message?: string; saleId?: string; total?: number; data?: any }>;

      // ✅ Últimas ventas
      latestSales: () => Promise<{ ok: boolean; rows?: any[]; message?: string }>;

      // ✅ CORTE / RESUMEN (ESTO ARREGLA TU ERROR)
      salesSummary: (params: { from: string; to: string }) => Promise<{ ok: boolean; data?: any; message?: string }>;

      settings: {
        get: (payload: { key: string }) => Promise<{ ok: boolean; value?: string; message?: string }>;
        set: (payload: { key: string; value: string }) => Promise<{ ok: boolean; value?: string; message?: string }>;
      };
    };
  }
}
