// src/screens/cut/CutTicket.tsx
import { money } from "../../pos/utils/money";

// ✅ helpers
import {
  safeNum,
  summarizePollosFromProducts,
  calcPolloTotalsFromProducts,
  CutPayTotals, // ✅ nuevo tipo
} from "../../screens/cut/cutHelpers"; // ajusta ruta si cambia

// ✅ lucide icons
import {
  Drumstick,
  ChefHat,
  Salad,
  Trash2,
  ReceiptText,
  CalendarDays,
  Hash,
  BadgeDollarSign,
  CreditCard,
  Banknote,
} from "lucide-react";

type Row = { name: string; category: string; qty: number; subtotal: number };

type Props = {
  from: string;
  to: string;
  useRange: boolean;
  grandTotal: number;
  ticketsCount: number;

  // ✅ puedes pasarlo o recalcularlo aquí (recomendado recalcular)
  polloTotals?: { total: number; enteros: number; medios: number; cuartos: number };

  products: Row[];

  // ✅ NUEVO: pago (desde CutScreen ya viene calculado de tickets)
  payTotals: CutPayTotals;
};

// ---------- helpers ----------
function normalizeCategory(c: any) {
  const s = String(c ?? "").trim();
  if (s === "Desechable") return "Desechables";
  return s || "Sin categoría";
}

function groupByCategory(products: Row[]) {
  const grouped = new Map<string, Row[]>();
  for (const p of products ?? []) {
    const cat = normalizeCategory(p.category);
    const arr = grouped.get(cat) || [];
    arr.push(p);
    grouped.set(cat, arr);
  }
  return grouped;
}

function sortTicketRows(rows: Row[]) {
  return [...rows].sort((a, b) => {
    const dq = safeNum(b.qty) - safeNum(a.qty);
    if (dq !== 0) return dq;
    return String(a.name).localeCompare(String(b.name));
  });
}

function sumQty(rows: Row[]) {
  return rows.reduce((acc, r) => acc + safeNum(r.qty), 0);
}

type TicketRow = { name: string; qty: number };

function toTicketRows(rows: Row[]): TicketRow[] {
  return rows.map((r) => ({
    name: String(r.name ?? "").trim(),
    qty: safeNum(r.qty),
  }));
}

function IconBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-4 h-4">{icon}</span>
      <span className="font-extrabold">{label}</span>
    </div>
  );
}

function TicketSection({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: TicketRow[];
}) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="no-break">
      <div className="flex items-center justify-between">
        <IconBadge icon={icon} label={title} />
      </div>

      <div className="mt-2 space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex justify-between gap-2">
            <span className="font-bold truncate">{r.name}</span>
            <span className="font-extrabold tabular-nums">{safeNum(r.qty)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-black my-2" />
    </div>
  );
}

// ---------- component ----------
export function CutTicket({
  from,
  to,
  useRange,
  grandTotal,
  ticketsCount,
  polloTotals,
  products,
  payTotals,
}: Props) {
  const dateLabel = useRange ? `${from} a ${to}` : `${from}`;

  // ✅ Pollos sin sabor (1 pollo / 1/2 / 1/4)
  const pollos = summarizePollosFromProducts(products as any);

  // ✅ Totales de pollos: mejor recalcular desde products para evitar discrepancias
  const pollo = polloTotals ?? calcPolloTotalsFromProducts(products as any);

  // ✅ Agrupar por categoría para secciones extra
  const grouped = groupByCategory(products);

  const especialidades = sortTicketRows(grouped.get("Especialidades") || []);
  const extras = sortTicketRows(grouped.get("Extras") || []);
  const desechables = sortTicketRows(grouped.get("Desechables") || []);

  return (
    <div id="ticket-print" className="text-[11px] leading-4 text-black">
      {/* Header */}
      <div className="text-center no-break">
        <div className="font-extrabold text-[13px]">POLLO PIRATA</div>

        <div className="mt-1 inline-flex items-center justify-center gap-2">
          <ReceiptText className="w-4 h-4" />
          <span className="font-extrabold">CORTE / PRODUCCIÓN</span>
        </div>

        <div className="mt-1 inline-flex items-center justify-center gap-2 text-[10px]">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>{dateLabel}</span>
        </div>

        <div className="border-t border-dashed border-black my-2" />
      </div>

      {/* Totales */}
      <div className="no-break">
        <div className="flex justify-between items-center gap-2">
          <span className="inline-flex items-center gap-2 font-bold">
            <BadgeDollarSign className="w-4 h-4" />
            Total vendido
          </span>
          <span className="font-extrabold tabular-nums">{money(grandTotal)}</span>
        </div>

        <div className="flex justify-between items-center gap-2">
          <span className="inline-flex items-center gap-2">
            <Hash className="w-4 h-4" />
            Tickets
          </span>
          <span className="font-bold tabular-nums">{safeNum(ticketsCount)}</span>
        </div>

        {/* ✅ NUEVO: Pago */}
        <div className="mt-1 space-y-1">
          <div className="flex justify-between items-center gap-2">
            <span className="inline-flex items-center gap-2">
              <Banknote className="w-4 h-4" />
              Efectivo
            </span>
            <span className="font-extrabold tabular-nums">
              {money(safeNum(payTotals.efectivoTotal))} ({safeNum(payTotals.efectivoCount)})
            </span>
          </div>

          <div className="flex justify-between items-center gap-2">
            <span className="inline-flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Tarjeta
            </span>
            <span className="font-extrabold tabular-nums">
              {money(safeNum(payTotals.tarjetaTotal))} ({safeNum(payTotals.tarjetaCount)})
            </span>
          </div>

          {safeNum(payTotals.otrosCount) > 0 && (
            <div className="flex justify-between items-center gap-2">
              <span className="inline-flex items-center gap-2">Otros</span>
              <span className="font-extrabold tabular-nums">
                {money(safeNum(payTotals.otrosTotal))} ({safeNum(payTotals.otrosCount)})
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-black my-2" />
      </div>

      {/* Pollos (sin sabor) */}
      <div className="no-break">
        <div className="flex items-center gap-2 font-extrabold">
          <Drumstick className="w-4 h-4" />
          <span>POLLOS (sin sabor)</span>
        </div>

        <div className="text-[10px] mt-1">
          Unidades: {safeNum(pollo.total)} · Enteros: {safeNum(pollo.enteros)} · Medios:{" "}
          {safeNum(pollo.medios)} · Cuartos: {safeNum(pollo.cuartos)}
        </div>

        <div className="mt-2 space-y-1">
          {pollos.map((p) => (
            <div key={p.name} className="flex justify-between gap-2">
              <span className="font-bold">{p.name}</span>
              <span className="font-extrabold tabular-nums">{safeNum(p.qty)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-black my-2" />
      </div>

      {/* Especialidades */}
      <TicketSection
        title={`ESPECIALIDADES (${sumQty(especialidades)})`}
        icon={<ChefHat className="w-4 h-4" />}
        rows={toTicketRows(especialidades)}
      />

      {/* Extras */}
      <TicketSection
        title={`EXTRAS (${sumQty(extras)})`}
        icon={<Salad className="w-4 h-4" />}
        rows={toTicketRows(extras)}
      />

      {/* Desechables */}
      <TicketSection
        title={`DESECHABLES (${sumQty(desechables)})`}
        icon={<Trash2 className="w-4 h-4" />}
        rows={toTicketRows(desechables)}
      />

      {/* Footer */}
      <div className="text-center text-[10px] no-break">
        <div>Impreso desde POS Desktop</div>
        <div className="mt-1">— Fin —</div>
      </div>
    </div>
  );
}
