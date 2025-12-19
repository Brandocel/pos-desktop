export {};

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
    api: Window["api"] & {
      // ✅ forzamos que exista aunque otro type lo haya definido antes
      salesSummary: (params: { from: string; to: string }) => Promise<ApiRes<SalesSummaryData>>;
    };
  }
}
