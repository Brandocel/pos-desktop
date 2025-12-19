import { useMemo, useState } from "react";
import type { CartItem } from "../types";

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const total = useMemo(() => cart.reduce((a, b) => a + b.subtotal, 0), [cart]);

  function upsertItem(newItem: CartItem) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.key === newItem.key);
      if (idx >= 0) {
        const copy = [...prev];
        const merged = { ...copy[idx] };
        merged.qty += newItem.qty;
        merged.subtotal = merged.qty * merged.price;
        copy[idx] = merged;
        return copy;
      }
      return [newItem, ...prev];
    });
  }

  function inc(key: string) {
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price } : i))
    );
  }

  function dec(key: string) {
    setCart((prev) =>
      prev.map((i) =>
        i.key === key
          ? { ...i, qty: Math.max(1, i.qty - 1), subtotal: Math.max(1, i.qty - 1) * i.price }
          : i
      )
    );
  }

  function remove(key: string) {
    setCart((prev) => prev.filter((i) => i.key !== key));
  }

  function clear() {
    setCart([]);
  }

  return { cart, setCart, total, upsertItem, inc, dec, remove, clear };
}
