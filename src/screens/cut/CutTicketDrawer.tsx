import { X, Printer } from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onPrint: () => void;
  children: React.ReactNode;
};

export function CutTicketDrawer({
  open,
  title = "Ticket",
  subtitle = "Vista previa",
  onClose,
  onPrint,
  children,
}: Props) {
  return (
    <div
      className={[
        "fixed inset-0 z-[9999]",
        open ? "pointer-events-auto" : "pointer-events-none",
      ].join(" ")}
    >
      {/* backdrop */}
      <div
        className={[
          "absolute inset-0 bg-black/35 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={onClose}
      />

      {/* panel */}
      <aside
        className={[
          "absolute top-0 right-0 h-full w-[520px] max-w-[92vw] bg-white border-l border-zinc-200 shadow-xl",
          "transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
          "flex flex-col",
        ].join(" ")}
      >
        {/* header */}
        <div className="px-4 py-3 border-b border-zinc-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-extrabold text-zinc-900">{title}</div>
            <div className="text-xs text-zinc-500">{subtitle}</div>
          </div>

          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 grid place-items-center"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-auto bg-zinc-50 p-4">
          <div className="mx-auto w-[58mm] bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-2">{children}</div>
          </div>

          <div className="mt-3 text-center text-xs text-zinc-500">
            Este ticket imprime solo el contenido (sin “rollote”).
          </div>
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-zinc-200 flex items-center justify-end gap-2">
          <button
            onClick={onPrint}
            className="h-10 px-3 rounded-xl border border-zinc-900 bg-zinc-900 text-white text-xs font-extrabold hover:bg-zinc-800 inline-flex items-center gap-2"
            title="Imprimir"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </aside>
    </div>
  );
}
