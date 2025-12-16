export type Category =
  | "Pollos"
  | "Especialidades"
  | "Paquetes"
  | "Miércoles"
  | "Extras"
  | "Desechables";

export type Product = {
  id: string;
  name: string;
  category: Category;
  price: number;
  requiresFlavor?: boolean;  // Pollos y Paquetes lo requieren
  isPromoPack?: boolean;     // Miércoles: normal vs promo
  description?: string;      // “qué incluye”
};

export type CartItem = {
  key: string;               // único en carrito (incluye sabor/promo)
  name: string;              // lo que se guarda (incluye sabor/promo si aplica)
  baseName: string;          // nombre “limpio” (útil para el corte después)
  qty: number;
  price: number;
  subtotal: number;
  meta?: {
    flavor?: string;
    promo?: boolean;
    category?: Category;
  };
};
