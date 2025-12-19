import { useMemo } from "react";

export function useQuickCash(total: number) {
  return useMemo(() => {
    const t = total;
    if (t <= 0) return [50, 100, 200, 500];
    const options = new Set<number>([
      Math.ceil(t / 10) * 10,
      Math.ceil(t / 50) * 50,
      Math.ceil(t / 100) * 100,
      Math.ceil(t / 200) * 200,
      Math.ceil(t / 500) * 500,
    ]);
    return Array.from(options).filter((n) => n > 0).slice(0, 5);
  }, [total]);
}
