// src/types/api.ts - Type definitions para la API del Electron

export interface CreateSalePayload {
  items: { name: string; qty: number; price: number }[];
  paymentMethod: 'cash' | 'card';
  notes?: string;
}

export interface CreateSaleResponse {
  ok: boolean;
  message?: string;
  saleId?: string;
  total?: number;
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

export interface Api {
  createSale: (payload: CreateSalePayload) => Promise<CreateSaleResponse>;
  latestSales: () => Promise<{ ok: boolean; rows: any[] }>;
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
}
