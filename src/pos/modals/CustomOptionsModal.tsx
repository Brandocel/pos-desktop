import { X, CheckCircle2 } from "lucide-react";
import type { Product } from "../types";

type Opt = { name: string; extraName: string };

export function CustomOptionsModal({
  open,
  product,
  label,
  options,
  picked,
  onPick,
  onClose,
  onConfirm,
}: {
  open: boolean;
  ui: any;
  product?: Product;
  label: string;
  options: Opt[];
  picked: string;
  onPick: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const title = product?.name ? `Opciones · ${product.name}` : "Opciones";
  const canConfirm = !!picked;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* overlay */}
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
      />

      {/* card */}
      <div className="relative w-full max-w-[560px] bg-white border border-zinc-300 shadow-2xl">
        {/* header */}
        <div className="px-5 py-4 border-b border-zinc-300 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-zinc-900">{title}</div>
            <div className="text-xs text-zinc-500 mt-1">{label}</div>
          </div>

          <button
            onClick={onClose}
            className="h-9 w-9 border border-zinc-300 bg-white hover:bg-zinc-100 grid place-items-center"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* body */}
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map((o) => {
              const active = picked === o.extraName;

              return (
                <button
                  key={o.extraName}
                  type="button"
                  onClick={() => onPick(o.extraName)}
                  className={[
                    "text-left border px-4 py-3 transition",
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-extrabold">{o.name}</div>
                    {active ? <CheckCircle2 className="w-4 h-4" /> : null}
                  </div>
                  <div className={active ? "text-xs text-white/80 mt-1" : "text-xs text-zinc-500 mt-1"}>
                    Se agregará como: <b>{o.extraName}</b>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t border-zinc-300 flex items-center justify-end gap-2 bg-white">
          <button
            onClick={onClose}
            className="h-10 px-4 text-xs font-extrabold border border-zinc-300 bg-white hover:bg-zinc-100 transition"
          >
            Cancelar
          </button>

          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="h-10 px-4 text-xs font-extrabold border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
