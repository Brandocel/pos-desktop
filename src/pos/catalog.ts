import type { Product } from "./types";

export const FLAVORS = [
  "Tamarindo",
  "BBQ",
  "Axiote",
  "Talla",
  "Pimienta",
  "Pastor",
]; // editable :contentReference[oaicite:8]{index=8}

export const CATALOG: Product[] = [
  // Pollos (requieren sabor) :contentReference[oaicite:9]{index=9}
  { id: "p-1_4", name: "1/4 Pollo", category: "Pollos", price: 0, requiresFlavor: true },
  { id: "p-1_2", name: "1/2 Pollo", category: "Pollos", price: 0, requiresFlavor: true },
  { id: "p-1",   name: "Pollo Entero", category: "Pollos", price: 0, requiresFlavor: true },

  // Especialidades (NO sabor) :contentReference[oaicite:10]{index=10}
  { id: "e-ver-1",   name: "Veracruz 1 Pollo", category: "Especialidades", price: 0 },
  { id: "e-ver-1_2", name: "Veracruz 1/2",     category: "Especialidades", price: 0 },
  { id: "e-pen-1",   name: "Peninsular 1 Pollo", category: "Especialidades", price: 0 },
  { id: "e-pen-1_2", name: "Peninsular 1/2",     category: "Especialidades", price: 0 },

  // Paquetes (requieren sabor + mostrar incluye) :contentReference[oaicite:11]{index=11}
  { id: "paq-acom", name: "Paquete Acompañes", category: "Paquetes", price: 0, requiresFlavor: true, description: "Incluye: (definir)" },
  { id: "paq-ami",  name: "Paquete Amigo",     category: "Paquetes", price: 0, requiresFlavor: true, description: "Incluye: (definir)" },
  { id: "paq-pir",  name: "Paquete Pirata",    category: "Paquetes", price: 0, requiresFlavor: true, description: "Incluye: (definir)" },

  // Miércoles (normal vs promo) :contentReference[oaicite:12]{index=12}
  { id: "mie-nor",  name: "Miércoles - Paquete Normal", category: "Miércoles", price: 0, requiresFlavor: true, isPromoPack: false },
  { id: "mie-pro",  name: "Miércoles - Paquete PROMO",  category: "Miércoles", price: 0, requiresFlavor: true, isPromoPack: true },

  // Extras (individuales) :contentReference[oaicite:13]{index=13}
  { id: "x-spag", name: "Spaghetti", category: "Extras", price: 0 },
  { id: "x-arro", name: "Arroz",     category: "Extras", price: 0 },
  { id: "x-frij", name: "Frijol",    category: "Extras", price: 0 },
  { id: "x-ref",  name: "Refresco",  category: "Extras", price: 0 },

  // Desechables (campo libre: precio + uso) :contentReference[oaicite:14]{index=14}
  { id: "des", name: "Desechables (captura libre)", category: "Desechables", price: 0 },
];
