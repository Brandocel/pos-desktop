import { X, CheckCircle2 } from "lucide-react";
import type { Product } from "../types";

export function FlavorModal({
  open,
  product,
  flavors,
  picked,
  pickedList,
  slots,
  onPick,
  onPickSlot,
  onClose,
  onConfirm,
}: {
  open: boolean;
  ui: any;
  product?: Product;
  flavors: string[];
  picked: string;
  pickedList: string[];
  slots: number;
  onPick: (f: string) => void;
  onPickSlot: (slot: number, flavor: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const title = product?.name ? `Sabores · ${product.name}` : "Seleccionar sabor";
  const hasMulti = (slots ?? 1) > 1;

  const safePickedList =
    pickedList?.length === slots
      ? pickedList
      : Array.from({ length: slots }, (_, i) => pickedList?.[i] ?? picked ?? flavors?.[0] ?? "");

  const canConfirm =
    flavors.length === 0
      ? true
      : hasMulti
      ? safePickedList.every((x) => !!x)
      : !!picked;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      {/* overlay */}
      <button
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Cerrar"
      />

      {/* card */}
      <div className="relative w-full max-w-[760px] bg-white border border-zinc-300 shadow-2xl">
        {/* header */}
        <div className="px-5 py-4 border-b border-zinc-300 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-zinc-900">{title}</div>
            <div className="text-xs text-zinc-500 mt-1">
              {hasMulti ? `Elige ${slots} sabores (uno por porción)` : "Elige 1 sabor"}
            </div>
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
        <div className="p-5 space-y-4">
          {flavors.length === 0 ? (
            <div className="border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-700">
              No hay sabores cargados. Puedes confirmar para continuar.
            </div>
          ) : hasMulti ? (
            <div className="space-y-4">
              {Array.from({ length: slots }).map((_, slotIdx) => {
                const cur = safePickedList[slotIdx] || "";
                return (
                  <div key={slotIdx} className="border border-zinc-300">
                    <div className="px-4 py-3 border-b border-zinc-300 flex items-center justify-between">
                      <div className="text-xs font-extrabold text-zinc-900">Sabor #{slotIdx + 1}</div>
                      <div className="text-xs text-zinc-500">
                        Seleccionado: <b className="text-zinc-800">{cur || "—"}</b>
                      </div>
                    </div>

                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {flavors.map((f) => {
                        const active = cur === f;
                        return (
                          <button
                            key={`${slotIdx}-${f}`}
                            type="button"
                            onClick={() => onPickSlot(slotIdx, f)}
                            className={[
                              "text-left border px-3 py-2 transition",
                              active
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-extrabold">{f}</span>
                              {active ? <CheckCircle2 className="w-4 h-4" /> : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {flavors.map((f) => {
                const active = picked === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onPick(f)}
                    className={[
                      "text-left border px-4 py-3 transition",
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-extrabold">{f}</div>
                      {active ? <CheckCircle2 className="w-4 h-4" /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
