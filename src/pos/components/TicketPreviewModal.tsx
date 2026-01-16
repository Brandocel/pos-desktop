import React from "react";
import { X, Printer } from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onPrint: () => void;
  children: React.ReactNode; // aquí renderizas tu Ticket
};

export function TicketPreviewModal({ open, title = "Ticket", onClose, onPrint, children }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-[720px] bg-white rounded-2xl shadow-xl overflow-hidden border border-zinc-200">
          {/* header */}
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <div className="font-extrabold text-zinc-900">{title}</div>

            <div className="flex items-center gap-2">
              <button
                onClick={onPrint}
                className="h-9 px-3 rounded-xl border border-zinc-900 bg-zinc-900 text-white text-xs font-extrabold hover:bg-zinc-800 inline-flex items-center gap-2"
                title="Imprimir"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>

              <button
                onClick={onClose}
                className="h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-extrabold hover:bg-zinc-50 inline-flex items-center gap-2"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
                Cerrar
              </button>
            </div>
          </div>

          {/* body */}
          <div className="p-4 bg-zinc-50">
            {/* “moldura” para simular ticket real */}
            <div className="mx-auto w-[58mm] bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-2">
                {children}
              </div>
            </div>

            <div className="mt-3 text-center text-xs text-zinc-500">
              Vista previa en ancho térmico. Al imprimir solo saldrá el ticket.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
