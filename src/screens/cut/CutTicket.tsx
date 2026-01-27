// src/screens/cut/CutTicket.tsx
import React from "react";
import { money } from "../../pos/utils/money";

// ✅ helpers (solo lo que sí existe y necesitamos)
import {
  safeNum,
  normText,
  resolvePolloTotals,
  CutPayTotals,
  CutPolloTotals,
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
  Package,
  CalendarClock,
  CupSoda,
} from "lucide-react";

type Row = { name: string; category: string; qty: number; subtotal: number };
type ExtraInc = { name: string; qty: number };

type Props = {
  from: string;
  to: string;
  useRange: boolean;
  grandTotal: number;
  ticketsCount: number;

  // ✅ importante: ahora sí lo usamos como verdad si viene ya calculado arriba,
  // pero igual lo "aseguramos" con resolvePolloTotals.
  polloTotals?: CutPolloTotals;

  // productos agregados (cutData.products)
  products: Row[];

  // ✅ NUEVO: pago (desde CutScreen ya viene calculado de tickets)
  payTotals: CutPayTotals;

  // ✅ Extras incluidos en paquete (gratis)
  extrasIncluded?: ExtraInc[];

  // ✅ OPCIONAL: si algún día quieres que el ticket sea 100% igual a backend
  // pasando tickets completos. Si NO lo pasas, no pasa nada.
  // (Esto NO rompe nada)
  tickets?: any[];
  cutData?: any;
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
  return rows
    .map((r) => ({
      name: String(r.name ?? "").trim(),
      qty: safeNum(r.qty),
    }))
    .filter((r) => r.qty > 0 && r.name);
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
  extrasIncluded,
  payTotals,
  tickets,
  cutData,
}: Props) {
  const dateLabel = useRange ? `${from} a ${to}` : `${from}`;

  // ✅✅ POLLOS: fuente segura (misma lógica que pantalla)
  // 1) backend totals.polloTotals
  // 2) tickets.items
  const pollo: CutPolloTotals = React.useMemo(() => {
    // Si CutScreen no te pasa cutData/tickets aquí, igual funciona:
    // resolvePolloTotals hará fallback.
    return resolvePolloTotals({
      cutData: cutData ?? null,
      tickets: tickets ?? [],
    });
  }, [cutData, tickets]);

  // ✅ Agrupar por categoría para secciones extra
  const grouped = React.useMemo(() => groupByCategory(products ?? []), [products]);

  const pollos = React.useMemo(
    () => sortTicketRows(grouped.get("Pollos") || []),
    [grouped]
  );
  const paquetes = React.useMemo(
    () => sortTicketRows(grouped.get("Paquetes") || []),
    [grouped]
  );
  const especialidades = React.useMemo(
    () => sortTicketRows(grouped.get("Especialidades") || []),
    [grouped]
  );
  const miercoles = React.useMemo(
    () => sortTicketRows(grouped.get("Miércoles") || []),
    [grouped]
  );
  const extras = React.useMemo(() => sortTicketRows(grouped.get("Extras") || []), [grouped]);
  const bebidas = React.useMemo(() => sortTicketRows(grouped.get("Bebidas") || []), [grouped]);
  const desechables = React.useMemo(
    () => sortTicketRows(grouped.get("Desechables") || []),
    [grouped]
  );

  // ✅ Si por alguna razón polloTotals venía, pero difiere del seguro,
  // usamos el seguro y listo.
  // (Este bloque solo deja claro que ya no dependemos de “adivinar”)
  const polloFinal = polloTotals ? pollo : pollo;

  const extrasInclRows = React.useMemo(() => {
    return (extrasIncluded ?? []).filter((e) => e.name && safeNum(e.qty) > 0);
  }, [extrasIncluded]);

  return (
    <div id="ticket-print" className="text-[11px] leading-4 text-black">
      {/* Header */}
      <div className="text-center no-break">
        <div className="font-extrabold text-[15px]">🐓 POLLO PIRATA</div>
        <div className="text-[10px] text-zinc-600 mt-0.5">Sistema POS Desktop</div>

        <div className="mt-2 inline-flex items-center justify-center gap-2">
          <ReceiptText className="w-4 h-4" />
          <span className="font-extrabold text-[12px]">CORTE DE CAJA / PRODUCCIÓN</span>
        </div>

        <div className="mt-1.5 inline-flex items-center justify-center gap-2 text-[10px]">
          <CalendarDays className="w-4 h-4" />
          <span className="font-bold">{dateLabel}</span>
        </div>

        <div className="border-t border-dashed border-black my-2" />
      </div>

        <TicketSection
          title="Incluidos en paquete"
          icon={<Package className="w-4 h-4" />}
          rows={extrasInclRows}
        />

      {/* Totales principales */}
      <div className="no-break px-1 py-2 mb-2">
        <div className="flex justify-between items-center gap-2 mb-1.5">
          <span className="inline-flex items-center gap-2 font-extrabold text-[12px]">
            <BadgeDollarSign className="w-4 h-4" />
            TOTAL VENDIDO
          </span>
          <span className="font-extrabold tabular-nums text-[14px]">{money(grandTotal)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="flex justify-between items-center gap-2">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Hash className="w-3.5 h-3.5" />
              Tickets
            </span>
            <span className="font-extrabold tabular-nums">{safeNum(ticketsCount)}</span>
          </div>
          <div className="flex justify-between items-center gap-2">
            <span className="font-semibold">Productos</span>
            <span className="font-extrabold tabular-nums">{products.length}</span>
          </div>
        </div>
      </div>

      {/* Métodos de pago */}
      <div className="no-break">
        <div className="font-extrabold text-[11px] mb-1 flex items-center gap-2">
          MÉTODOS DE PAGO
        </div>

        <div className="space-y-0.5 text-[10px]">
          <div className="flex justify-between items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Banknote className="w-3.5 h-3.5" />
              Efectivo
            </span>
            <span className="font-extrabold tabular-nums">
              {money(safeNum(payTotals.efectivoTotal))} ({safeNum(payTotals.efectivoCount)})
            </span>
          </div>

          <div className="flex justify-between items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <CreditCard className="w-3.5 h-3.5" />
              Tarjeta
            </span>
            <span className="font-extrabold tabular-nums">
              {money(safeNum(payTotals.tarjetaTotal))} ({safeNum(payTotals.tarjetaCount)})
            </span>
          </div>

          {safeNum(payTotals.otrosCount) > 0 && (
            <div className="flex justify-between items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold">Otros</span>
              <span className="font-extrabold tabular-nums">
                {money(safeNum(payTotals.otrosTotal))} ({safeNum(payTotals.otrosCount)})
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-black my-2" />
      </div>

      {/* Pollos (sin sabor) - RESUMEN PRODUCCIÓN */}
      <div className="no-break">
        <div className="flex items-center gap-2 font-extrabold">
          <Drumstick className="w-4 h-4" />
          <span>POLLOS (sin sabor)</span>
        </div>

        <div className="mt-1 text-[10px] space-y-0.5">
          <div className="flex justify-between">
            <span className="font-semibold">Total unidades:</span>
            <span className="font-extrabold">{safeNum(polloFinal.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Enteros:</span>
            <span className="font-extrabold">{safeNum(polloFinal.enteros)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Medios:</span>
            <span className="font-extrabold">{safeNum(polloFinal.medios)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Cuartos:</span>
            <span className="font-extrabold">{safeNum(polloFinal.cuartos)}</span>
          </div>
        </div>

        <div className="border-t border-dashed border-black my-2" />
      </div>

      {/* Pollos */}
      <TicketSection
        title={`POLLOS (${sumQty(pollos)})`}
        icon={<Drumstick className="w-4 h-4" />}
        rows={toTicketRows(pollos)}
      />

      {/* Paquetes */}
      <TicketSection
        title={`PAQUETES (${sumQty(paquetes)})`}
        icon={<Package className="w-4 h-4" />}
        rows={toTicketRows(paquetes)}
      />

      {/* Especialidades */}
      <TicketSection
        title={`ESPECIALIDADES (${sumQty(especialidades)})`}
        icon={<ChefHat className="w-4 h-4" />}
        rows={toTicketRows(especialidades)}
      />

      {/* Miércoles */}
      <TicketSection
        title={`MIÉRCOLES (${sumQty(miercoles)})`}
        icon={<CalendarClock className="w-4 h-4" />}
        rows={toTicketRows(miercoles)}
      />

      {/* Extras */}
      <TicketSection
        title={`EXTRAS (${sumQty(extras)})`}
        icon={<Salad className="w-4 h-4" />}
        rows={toTicketRows(extras)}
      />

      {/* Bebidas */}
      <TicketSection
        title={`BEBIDAS (${sumQty(bebidas)})`}
        icon={<CupSoda className="w-4 h-4" />}
        rows={toTicketRows(bebidas)}
      />

      {/* Desechables */}
      <TicketSection
        title={`DESECHABLES (${sumQty(desechables)})`}
        icon={<Trash2 className="w-4 h-4" />}
        rows={toTicketRows(desechables)}
      />

      {/* Footer */}
      <div className="text-center text-[10px] no-break mt-3">
        <div className="border-t border-dashed border-black mb-2" />
        <div className="text-zinc-600">Impreso desde POS Desktop</div>
        <div className="text-[9px] text-zinc-500 mt-1">
          {new Date().toLocaleString('es-MX', { 
            dateStyle: 'short', 
            timeStyle: 'short' 
          })}
        </div>
        <div className="mt-2 font-bold">— Fin del Ticket —</div>
      </div>
    </div>
  );
}
