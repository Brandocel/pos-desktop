/// <reference types="vite/client" />

declare global {
  interface Window {
    api: {
      createSale: (payload: {
        items: { name: string; qty: number; price: number }[];
        notes?: string;
      }) => Promise<{ ok: boolean; message?: string; saleId?: string; total?: number }>;

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
        create: (payload: { name: string }) => Promise<{ ok: boolean; message?: string; id?: string }>;
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
  }

    salesSummary: (payload: { from?: string; to?: string }) => Promise<{
      ok: boolean;
      data?: {
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
          items: Array<{ name: string; qty: number; price: number; subtotal: number; category: string; flavor?: string }>;
        }>;
      };
      message?: string;
    }>;
}

export {};