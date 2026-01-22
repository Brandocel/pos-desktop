// src/pos/screens/cut/CutOverview.tsx
import { Boxes, Drumstick, Hash, CreditCard, Banknote } from "lucide-react";
import { money } from "../../pos/utils/money";
import { safeNum, CutPayTotals } from "./cutHelpers";

type Props = {
  grandTotal: number;
  ticketsCount: number;
  distinctProducts: number;

  // ✅ ESTE debe venir directo del backend (data.totals.polloTotals)
  polloTotals: { total: number; enteros: number; medios: number; cuartos: number };

  // ✅ Totales por pago
  payTotals: CutPayTotals;
};

export function CutOverview({
  grandTotal,
  ticketsCount,
  distinctProducts,
  polloTotals,
  payTotals,
}: Props) {
  const pill =
    "inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-xs font-extrabold text-zinc-800";

  const metricCard =
    "bg-white border border-zinc-200 rounded-2xl shadow-sm px-4 py-3 flex flex-col justify-between min-h-[104px]";
  const metricLabel = "text-[11px] text-zinc-500 font-semibold";
  const metricValue = "text-[26px] leading-[28px] font-extrabold text-zinc-900";
  const metricSub = "text-[11px] text-zinc-500 font-semibold mt-1";

  const smallCard =
    "bg-white border border-zinc-200 rounded-2xl shadow-sm px-4 py-3 flex flex-col justify-between min-h-[104px]";
  const smallTitle = "text-[11px] text-zinc-700 font-extrabold inline-flex items-center gap-2";
  const smallValue = "text-[22px] leading-[26px] font-extrabold text-zinc-900";
  const smallSub = "text-[11px] text-zinc-500 font-semibold mt-1";

  return (
    <div className="p-4">
      {/* pills */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className={pill}>
          <Hash className="w-4 h-4" /> Tickets: {safeNum(ticketsCount)}
        </span>
        <span className={pill}>
          <Boxes className="w-4 h-4" /> Distintos: {safeNum(distinctProducts)}
        </span>
      </div>

      {/* ✅ Total + Pago + Pollos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
        {/* Total */}
        <div className={metricCard}>
          <div>
            <div className={metricLabel}>Total vendido</div>
            <div className={metricValue}>{money(grandTotal)}</div>
          </div>
          <div className={metricSub}>Corte del día / rango</div>
        </div>

        {/* Efectivo */}
        <div className={smallCard}>
          <div>
            <div className={smallTitle}>
              <Banknote className="w-4 h-4" />
              Efectivo
            </div>
            <div className={smallValue}>{money(safeNum(payTotals.efectivoTotal))}</div>
          </div>
          <div className={smallSub}>Tickets: {safeNum(payTotals.efectivoCount)}</div>
        </div>

        {/* Tarjeta */}
        <div className={smallCard}>
          <div>
            <div className={smallTitle}>
              <CreditCard className="w-4 h-4" />
              Tarjeta
            </div>
            <div className={smallValue}>{money(safeNum(payTotals.tarjetaTotal))}</div>
          </div>
          <div className={smallSub}>Tickets: {safeNum(payTotals.tarjetaCount)}</div>
        </div>

        {/* Pollos */}
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm px-4 py-3 flex flex-col justify-between min-h-[104px] lg:col-span-1">
          <div className="text-[11px] text-zinc-700 font-extrabold inline-flex items-center gap-2">
            <Drumstick className="w-4 h-4" />
            Pollos (sin sabor)
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2">
            {[
              { label: "Total", value: polloTotals.total },
              { label: "Enteros", value: polloTotals.enteros },
              { label: "Medios", value: polloTotals.medios },
              { label: "Cuartos", value: polloTotals.cuartos },
            ].map((x) => (
              <div
                key={x.label}
                className="bg-zinc-50 border border-zinc-200 rounded-xl px-2 py-1.5"
              >
                <div className="text-[10px] text-zinc-600 font-semibold">{x.label}</div>
                <div className="text-base font-extrabold text-zinc-900 leading-5">
                  {safeNum(x.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 text-[10px] text-zinc-500">
            Lista para producción (conteo rápido).
          </div>
        </div>
      </div>

      {/* ✅ Otros */}
      {safeNum(payTotals.otrosCount) > 0 && (
        <div className="mt-3 text-xs text-zinc-500">
          Otros métodos: {money(safeNum(payTotals.otrosTotal))} · Tickets:{" "}
          {safeNum(payTotals.otrosCount)}
        </div>
      )}
    </div>
  );
}
