// src/types/api.ts - Type definitions para la API del Electron

export interface CreateSaleItemPayload {
  name: string;
  qty: number;
  price: number;
  category?: string;
  flavor?: string | null;
}

export interface CreateSalePayload {
  items: CreateSaleItemPayload[];
  paymentMethod: "cash" | "card";
  notes?: string;
  cashReceived?: number;
  change?: number;
  total?: number; // opcional (si quieres mandarlo calculado desde UI)
}

export interface CreateSaleResponse {
  ok: boolean;
  message?: string;
  saleId?: string;
  total?: number;
  data?: any;
}

export interface FlavorAdmin {
  id: string;
  name: string;
  is_deleted: number;
  created_at: string;
}

export interface FlavorListResponse {
  ok: boolean;
  data: FlavorAdmin[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateFlavorResponse {
  ok: boolean;
  message?: string;
  id?: string;
  name?: string;
}

export interface DeleteFlavorResponse {
  ok: boolean;
  message?: string;
}

// ✅ Sales Summary (Corte)
export type PolloTotals = {
  enteros: number;
  medios: number;
  cuartos: number;
  total: number;
};

export type SalesSummaryCategoryTotal = {
  category: string;
  qty: number;
  total: number;
};

export type SalesSummaryProductRow = {
  name: string;
  category: string;
  qty: number;
  subtotal: number;
};

export type SalesSummaryTicketItem = {
  name: string;
  qty: number;
  price: number;
  subtotal: number;
  category: string;
  flavor?: string | null;
};

export type SalesSummaryTicket = {
  saleId: string;
  createdAt: string;
  total: number;
  notes?: string;

  // pagos (por si viene en algunos tickets)
  paymentMethod?: string;
  payment_method?: string;
  metodoPago?: string;
  metodo_pago?: string;
  method?: string;
  payMethod?: string;
  payment?: any;
  pago?: string;
  tipoPago?: string;

  items: SalesSummaryTicketItem[];
};

export type SalesSummaryData = {
  range: { from: string; to: string };
  totals: {
    grand: number;

    // ✅ pueden venir (tu PDF los muestra)
    cash?: number;
    card?: number;

    categories: SalesSummaryCategoryTotal[];

    // ✅ el que estás usando para comparar UI vs DB
    polloTotals?: PolloTotals;
  };
  products: SalesSummaryProductRow[];
  tickets: SalesSummaryTicket[];
};

export type ApiOk<T> = { ok: true; data: T; message?: string };
export type ApiFail = { ok: false; message?: string };
export type ApiRes<T> = ApiOk<T> | ApiFail;

export type SalesSummaryResponse = ApiRes<SalesSummaryData>;

// ✅ PDF Corte
export interface CutPdfResponse {
  ok: boolean;
  base64?: string;
  filename?: string;
  message?: string;
}

export interface Api {
  // ✅ Venta
  createSale: (payload: CreateSalePayload) => Promise<CreateSaleResponse>;
  latestSales: () => Promise<{ ok: boolean; rows: any[] }>;

  // ✅ Flavors
  getFlavors: () => Promise<{ ok: boolean; rows: any[] }>;
  flavors: {
    list: (payload: {
      page?: number;
      pageSize?: number;
      search?: string;
      showDeleted?: boolean;
    }) => Promise<FlavorListResponse>;
    create: (payload: { name: string }) => Promise<CreateFlavorResponse>;
    delete: (payload: { id: string }) => Promise<DeleteFlavorResponse>;
    restore: (payload: { id: string }) => Promise<DeleteFlavorResponse>;
  };

  // ✅ Corte / Resumen
  salesSummary: (payload: { from: string; to: string }) => Promise<SalesSummaryResponse>;

  // ✅ PDF del corte
  salesCutPdf: (payload: { from?: string; to?: string }) => Promise<CutPdfResponse>;
}
