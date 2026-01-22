/// <reference types="vite/client" />

export {};

type PolloTotalsDto = {
  total: number;
  enteros: number;
  medios: number;
  cuartos: number;
};

type SalesSummaryResponse = {
  ok: boolean;
  data?: {
    range: { from: string; to: string };
    totals: {
      grand: number;

      // ✅ lo que ya tienes
      categories: Array<{ category: string; qty: number; total: number }>;

      // ✅ NUEVO: viene del backend (si existe)
      // Se deja opcional para no romper si el backend aún no lo manda.
      polloTotals?: PolloTotalsDto;

      // ✅ Extra: por si tu backend algún día lo manda con otro nombre
      // (no estorba, y te evita errores)
      pollosTotals?: PolloTotalsDto;
      pollo?: PolloTotalsDto;
      pollos?: PolloTotalsDto;
    };

    products: Array<{
      name: string;
      category: string;
      qty: number;
      subtotal: number;
    }>;

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
        flavor?: string | null;
      }>;

      // ✅ por si luego agregas método de pago aquí
      paymentMethod?: string;
      payment_method?: string;
      metodoPago?: string;
      metodo_pago?: string;
      method?: string;
      payMethod?: string;
      payment?: any;
      pago?: any;
      tipoPago?: any;
    }>;
  };
  message?: string;
};

type CutPdfResponse = {
  ok: boolean;
  base64?: string;
  filename?: string;
  message?: string;
};

declare global {
  interface Window {
    api: {
      // ✅ CORTE / RESUMEN
      salesSummary: (payload: { from?: string; to?: string }) => Promise<SalesSummaryResponse>;

      // ✅ PDF del corte
      salesCutPdf: (payload: { from?: string; to?: string }) => Promise<CutPdfResponse>;

      // ✅ Venta
      createSale: (payload: {
        items: Array<{
          name: string;
          qty: number;
          price: number;
          category?: string;
          flavor?: string;
        }>;
        notes?: string;
        cashReceived?: number;
        change?: number;
        total?: number; // opcional
      }) => Promise<{ ok: boolean; message?: string; saleId?: string; total?: number; data?: any }>;

      latestSales: () => Promise<{ ok: boolean; rows: any[] }>;

      getFlavors: () => Promise<{ ok: boolean; rows: any[] }>;

      flavors: {
        list: (payload: {
          page?: number;
          pageSize?: number;
          search?: string;
          showDeleted?: boolean;
        }) => Promise<{
          ok: boolean;
          data: Array<{ id: string; name: string; is_deleted: number; created_at: string }>;
          pagination: { page: number; pageSize: number; total: number; totalPages: number };
        }>;
        create: (payload: { name: string }) => Promise<{ ok: boolean; message?: string; id?: string; name?: string }>;
        delete: (payload: { id: string }) => Promise<{ ok: boolean; message?: string }>;
        restore: (payload: { id: string }) => Promise<{ ok: boolean; message?: string }>;
      };

      products: {
        list: (payload: {
          page?: number;
          pageSize?: number;
          category?: string;
          search?: string;
          showDeleted?: boolean;
        }) => Promise<{
          ok: boolean;
          data: Array<{
            id: string;
            name: string;
            category: string;
            price: number;
            requires_flavor: number;
            flavor_id: string | null;
            is_deleted: number;
            created_at: string;
            included_extras: string[];
          }>;
          pagination: { page: number; pageSize: number; total: number; totalPages: number };
        }>;

        categories: () => Promise<{ ok: boolean; categories: string[] }>;

        salesList: () => Promise<{
          ok: boolean;
          products: Array<{
            id: string;
            name: string;
            category: string;
            price: number;
            requires_flavor: number;
            flavor_id: string | null;
            included_extras: string[];
            isPromoPack?: boolean;
            description?: string;
          }>;
        }>;

        create: (payload: {
          name: string;
          category: string;
          price: number;
          requires_flavor: boolean;
          flavor_id?: string;
          included_extras?: string[];
        }) => Promise<{ ok: boolean; message?: string; id?: string }>;

        update: (payload: {
          id: string;
          name: string;
          category: string;
          price: number;
          requires_flavor: boolean;
          flavor_id?: string;
          included_extras?: string[];
        }) => Promise<{ ok: boolean; message?: string }>;

        delete: (payload: { id: string }) => Promise<{ ok: boolean; message?: string }>;
        restore: (payload: { id: string }) => Promise<{ ok: boolean; message?: string }>;
      };
    };

    ipcRenderer: {
      on: typeof import("electron").ipcRenderer.on;
      off: typeof import("electron").ipcRenderer.off;
      send: typeof import("electron").ipcRenderer.send;
      invoke: typeof import("electron").ipcRenderer.invoke;
    };
  }
}
