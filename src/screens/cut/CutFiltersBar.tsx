// src/pos/screens/cut/CutFiltersBar.tsx
import { RefreshCw } from "lucide-react";

type Props = {
  uiInputClass: string;
  cutFrom: string;
  cutTo: string;
  cutUseRange: boolean;
  loading: boolean;
  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
  onToggleRange: (v: boolean) => void;
  onRefresh: () => void;
};

export function CutFiltersBar({
  uiInputClass,
  cutFrom,
  cutTo,
  cutUseRange,
  loading,
  onChangeFrom,
  onChangeTo,
  onToggleRange,
  onRefresh,
}: Props) {
  const primaryBtn =
    "h-10 px-4 rounded-xl border border-zinc-900 bg-zinc-900 text-white text-xs font-extrabold hover:bg-zinc-800 transition inline-flex items-center gap-2 justify-center";

  // 👇 input con altura uniforme (por si tu ui.input varía)
  const input = `${uiInputClass} h-10`;

  return (
    <div className="px-4 py-4 border-b border-zinc-200">
      {/* ✅ UNA FILA (desktop) / 2 filas (móvil) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        {/* Desde */}
        <div className="md:col-span-3">
          <label className="block text-xs text-zinc-500 font-semibold mb-1">
            Desde
          </label>
          <input
            type="date"
            value={cutFrom}
            onChange={(e) => onChangeFrom(e.target.value)}
            className={input}
          />
        </div>

        {/* Hasta */}
        <div className="md:col-span-3">
          <label className="block text-xs text-zinc-500 font-semibold mb-1">
            Hasta
          </label>
          <input
            type="date"
            value={cutTo}
            onChange={(e) => onChangeTo(e.target.value)}
            disabled={!cutUseRange}
            className={input + (cutUseRange ? "" : " opacity-50 cursor-not-allowed")}
          />
        </div>

        {/* Checkbox (alineado en la misma fila) */}
        <div className="md:col-span-3 md:flex md:items-center md:justify-start">
          <label className="flex items-center gap-2 text-xs text-zinc-700 font-semibold select-none h-10">
            <input
              type="checkbox"
              checked={cutUseRange}
              onChange={(e) => onToggleRange(e.target.checked)}
              className="w-4 h-4"
            />
            Usar rango
            <span className="text-[11px] text-zinc-500 font-medium hidden lg:inline">
              (varios días)
            </span>
          </label>
        </div>

        {/* Acción */}
        <div className="md:col-span-3 md:flex md:justify-end">
          <button onClick={onRefresh} className={primaryBtn} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Cargando…" : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Tip abajo, más discreto */}
      <div className="mt-3 text-[11px] text-zinc-500">
        Tip: si no usas rango, el corte se calcula para una sola fecha.
      </div>
    </div>
  );
}
