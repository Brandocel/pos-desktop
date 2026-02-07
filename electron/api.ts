// electron/api.ts - Type definitions para la API expuesta

export interface CreateSalePayload {
  items: {
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
  }[];
  paymentMethod: "cash" | "card";   // ✅ NUEVO
  notes?: string;
  cashReceived?: number;
  change?: number;
}


export interface CreateSaleResponse {
  ok: boolean;
  message?: string;
  saleId?: string;
  total?: number;
}

export interface SaleRecord {
  id: string;
  created_at: string;
  total: number;
  notes: string | null;
}

export interface LatestSalesResponse {
  ok: boolean;
  rows: SaleRecord[];
}

export interface Flavor {
  id: string;
  name: string;
}

export interface FlavorAdmin {
  id: string;
  name: string;
  is_deleted: number;
  created_at: string;
}

export interface GetFlavorsResponse {
  ok: boolean;
  rows: Flavor[];
}

export interface FlavorListPayload {
  page?: number;
  pageSize?: number;
  search?: string;
  showDeleted?: boolean;
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

export interface CreateFlavorPayload {
  name: string;
}

export interface CreateFlavorResponse {
  ok: boolean;
  message?: string;
  id?: string;
  name?: string;
}

export interface DeleteFlavorPayload {
  id: string;
}

export interface DeleteFlavorResponse {
  ok: boolean;
  message?: string;
}

export interface RestoreFlavorPayload {
  id: string;
}

export interface RestoreFlavorResponse {
  ok: boolean;
  message?: string;
}

export interface SettingGetPayload {
  key: string;
}

export interface SettingSetPayload {
  key: string;
  value: string;
}

export interface SettingGetResponse {
  ok: boolean;
  value?: string;
  message?: string;
}

export interface SettingSetResponse {
  ok: boolean;
  value?: string;
  message?: string;
}

export const api = {
  createSale: async (payload: CreateSalePayload): Promise<CreateSaleResponse> => {
    throw new Error("Not implemented in type definition");
  },
  latestSales: async (): Promise<LatestSalesResponse> => {
    throw new Error("Not implemented in type definition");
  },
  getFlavors: async (): Promise<GetFlavorsResponse> => {
    throw new Error("Not implemented in type definition");
  },
  flavors: {
    list: async (payload: FlavorListPayload): Promise<FlavorListResponse> => {
      throw new Error("Not implemented in type definition");
    },
    create: async (payload: CreateFlavorPayload): Promise<CreateFlavorResponse> => {
      throw new Error("Not implemented in type definition");
    },
    delete: async (payload: DeleteFlavorPayload): Promise<DeleteFlavorResponse> => {
      throw new Error("Not implemented in type definition");
    },
    restore: async (payload: RestoreFlavorPayload): Promise<RestoreFlavorResponse> => {
      throw new Error("Not implemented in type definition");
    },
  },
  settings: {
    get: async (payload: SettingGetPayload): Promise<SettingGetResponse> => {
      throw new Error("Not implemented in type definition");
    },
    set: async (payload: SettingSetPayload): Promise<SettingSetResponse> => {
      throw new Error("Not implemented in type definition");
    },
  },
};

export type ApiType = typeof api;
