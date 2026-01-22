// src/screens/cut/CutTicket.tsx
import React from "react";
import { money } from "../../pos/utils/money";

// ✅ helpers (solo lo que sí existe y necesitamos)
import {
  safeNum,
  normText,
  calcPolloTotalsFromProducts,
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
} from "lucide-react";

type Row = { name: string; category: string; qty: number; subtotal: number };

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

/**
 * ✅ Resumen de pollos "sin sabor"
 * Este resumen es solo para listar 1 pollo / 1/2 / 1/4 en el ticket.
 * Lo hacemos aquí para NO depender de exports faltantes.
 */
function summarizePollosLocal(products: Row[]) {
  const out = new Map<string, number>();

  const add = (key: string, qty: number) => {
    if (!qty) return;
    const prev = out.get(key) || 0;
    out.set(key, prev + qty);
  };

  for (const p of products ?? []) {
    const name = String(p?.name ?? "").toLowerCase();
    const cat = normText(p?.category);

    // En ticket de producción normalmente se esperan pollos desde:
    // Pollos, Paquetes, Especialidades (y si quieres, también Miércoles).
    const isRelevant =
      cat === "pollos" || cat === "paquetes" || cat === "especialidades" || cat === "miercoles";

    if (!isRelevant) continue;

    // solo detectamos piezas por texto del nombre
    const qty = safeNum(p?.qty);
    if (qty <= 0) continue;

    const base = name.split(" - ")[0].trim();

    // casos:
    // "1/4 pollo"
    // "1/2 pollo"
    // "1 pollo"
    // "veracruz 1 pollo"
    // "tesoro - bbq / pastor" (no trae 1 pollo en el nombre, por eso el TOTAL no sale de aquí)
    // Este bloque es solo para mostrar cuando sí hay pollos por nombre.
    if (base.includes("1/4") || base.includes("cuarto")) add("1/4 Pollo", qty);
    else if (base.includes("1/2") || base.includes("medio")) add("1/2 Pollo", qty);
    else if (base.includes("1 pollo")) add("1 pollo", qty);
  }

  const order = ["1 pollo", "1/2 pollo", "1/4 pollo"];
  return Array.from(out.entries())
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => {
      const ai = order.indexOf(String(a.name).toLowerCase());
      const bi = order.indexOf(String(b.name).toLowerCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
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
  tickets,
  cutData,
}: Props) {
  const dateLabel = useRange ? `${from} a ${to}` : `${from}`;

  // ✅✅ POLLOS: fuente segura (misma lógica que pantalla)
  // 1) backend totals.polloTotals
  // 2) tickets.items
  // 3) fallback desde products
  const pollo: CutPolloTotals = React.useMemo(() => {
    // Si CutScreen no te pasa cutData/tickets aquí, igual funciona:
    // resolvePolloTotals hará fallback hasta products.
    return resolvePolloTotals({
      cutData: cutData ?? null,
      tickets: tickets ?? [],
      products: products ?? [],
    });
  }, [cutData, tickets, products]);

  // ✅ Resumen "por tipo" (solo para listar en ticket)
  const pollosList = React.useMemo(() => summarizePollosLocal(products ?? []), [products]);

  // ✅ Agrupar por categoría para secciones extra
  const grouped = React.useMemo(() => groupByCategory(products ?? []), [products]);

  const especialidades = React.useMemo(
    () => sortTicketRows(grouped.get("Especialidades") || []),
    [grouped]
  );
  const extras = React.useMemo(() => sortTicketRows(grouped.get("Extras") || []), [grouped]);
  const desechables = React.useMemo(
    () => sortTicketRows(grouped.get("Desechables") || []),
    [grouped]
  );

  // ✅ Si por alguna razón polloTotals venía, pero difiere del seguro,
  // usamos el seguro y listo.
  // (Este bloque solo deja claro que ya no dependemos de “adivinar”)
  const polloFinal = polloTotals ? pollo : pollo;

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

        {/* ✅ Pago */}
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
          Unidades: {safeNum(polloFinal.total)} · Enteros: {safeNum(polloFinal.enteros)} · Medios:{" "}
          {safeNum(polloFinal.medios)} · Cuartos: {safeNum(polloFinal.cuartos)}
        </div>

        {/* Lista (si existe) */}
        {pollosList.length > 0 && (
          <div className="mt-2 space-y-1">
            {pollosList.map((p) => (
              <div key={p.name} className="flex justify-between gap-2">
                <span className="font-bold">{p.name}</span>
                <span className="font-extrabold tabular-nums">{safeNum(p.qty)}</span>
              </div>
            ))}
          </div>
        )}

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
