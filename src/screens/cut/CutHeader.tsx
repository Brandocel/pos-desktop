import { ArrowLeft, FileText, ReceiptText } from "lucide-react";

type Props = {
  rangeLabel: string;
  onPdf: () => void;
  onBack: () => void;
  onTicket: () => void;
};

export function CutHeader({ rangeLabel, onPdf, onBack, onTicket }: Props) {
  const primaryBtn =
    "h-10 px-3 rounded-xl border border-zinc-900 bg-zinc-900 text-white text-xs font-extrabold hover:bg-zinc-800 transition inline-flex items-center gap-2";
  const actionBtn =
    "h-10 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-extrabold hover:bg-zinc-50 transition inline-flex items-center gap-2";

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-lg font-extrabold text-zinc-900 flex items-center gap-2">
          <ReceiptText className="w-5 h-5" />
          Corte (eficiente)
          <span className="text-xs font-semibold text-zinc-500">{rangeLabel}</span>
        </div>
        <div className="text-xs text-zinc-500">
          Arriba lo general. Abajo el detalle. Ticket imprime sin rollote.
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onTicket} className={actionBtn} title="Ver Ticket">
          <ReceiptText className="w-4 h-4" />
          Ticket
        </button>

        <button onClick={onPdf} className={primaryBtn} title="Ver PDF">
          <FileText className="w-4 h-4" />
          Ver PDF
        </button>

        <button onClick={onBack} className={actionBtn} title="Volver">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </button>
      </div>
    </div>
  );
}
