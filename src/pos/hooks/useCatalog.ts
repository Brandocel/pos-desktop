import { useEffect, useMemo, useState } from "react";
import type { Category, Product } from "../types";

export function useCatalog() {
  const [category, setCategory] = useState<Category>("Pollos");
  const [query, setQuery] = useState("");

  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [dbFlavors, setDbFlavors] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [productsRes, flavorsRes] = await Promise.all([
          window.api.products.salesList() as unknown as { ok: boolean; products?: any[] },
          window.api.getFlavors() as unknown as { ok: boolean; rows?: any[] },
        ]);

        if (productsRes.ok && productsRes.products) {
          const mapped: Product[] = productsRes.products.map((p) => ({
            id: String(p.id),
            name: p.name,
            category: p.category as Category,
            price: p.price,
            requiresFlavor: p.requires_flavor === 1,
            isPromoPack: !!p.isPromoPack,
            description: p.description,
          }));
          setDbProducts(mapped);
        }

        if (flavorsRes?.ok && flavorsRes.rows) {
          setDbFlavors(flavorsRes.rows.map((f: any) => f.name));
        }
      } catch (err) {
        console.error("Error cargando datos:", err);
      } finally {
        setLoadingData(false);
      }
    }
    loadData();
  }, []);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dbProducts;
    return dbProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, dbProducts]);

  const productsMain = useMemo(
    () => filteredCatalog.filter((p) => p.category === category),
    [filteredCatalog, category]
  );

  const productsExtras = useMemo(
    () => filteredCatalog.filter((p) => p.category === "Extras"),
    [filteredCatalog]
  );

  const productsDesechables = useMemo(
    () => filteredCatalog.filter((p) => p.category === "Desechables"),
    [filteredCatalog]
  );

  return {
    loadingData,
    category,
    setCategory,
    query,
    setQuery,
    dbProducts,
    dbFlavors,
    productsMain,
    productsExtras,
    productsDesechables,
  };
}
