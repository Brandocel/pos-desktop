export type Category =
  | "Pollos"
  | "Especialidades"
  | "Paquetes"
  | "Miércoles"
  | "Extras"
  | "Desechables"
  | "Bebidas";

export type Product = {
  id: string;
  name: string;
  category: Category;
  price: number;
  requiresFlavor?: boolean;  // Pollos y Paquetes lo requieren
  isPromoPack?: boolean;     // Miércoles: normal vs promo
  description?: string;      // “qué incluye”
};

export type CartItemComponent = {
  slot: number;
  portion: string;
  flavor?: string;
  isSpecialty?: boolean;
  specialty?: string;
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

    // ✅ NUEVO: lista de sabores (cuando hay varios slots)
    flavorList?: string[];

    // ✅ NUEVO: lista de especialidades por slot
    specialtyList?: string[];

    // ✅ NUEVO: porciones del paquete
    portionList?: string[];

    // ✅ NUEVO: detalle por porcion (slot)
    components?: CartItemComponent[];

    // ✅ NUEVO: upgrade (por paquete)
    upgradeCount?: number;
    upgradePrice?: number;

    // ✅ NUEVO: opción personalizada (puré/espagueti/etc)
    customOption?: string;

    promo?: boolean;
    category?: Category;
  };
};

