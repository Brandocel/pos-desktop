import { X, CheckCircle2 } from "lucide-react";
import type { Product } from "../types";

export function FlavorModal({
  open,
  product,
  flavors,
  specialties,
  upgradePrice,
  allowUpgrade,
  portionLabels,
  upgradeSlots,
  pickedSpecialties,
  picked,
  pickedList,
  slots,
  onPick,
  onPickSlot,
  onToggleUpgradeSlot,
  onPickSpecialtySlot,
  onClose,
  onConfirm,
}: {
  open: boolean;
  ui: any;
  product?: Product;
  flavors: string[];
  specialties: string[];
  upgradePrice: number;
  allowUpgrade: boolean;
  portionLabels: string[];
  upgradeSlots: boolean[];
  pickedSpecialties: string[];
  picked: string;
  pickedList: string[];
  slots: number;
  onPick: (f: string) => void;
  onPickSlot: (slot: number, flavor: string) => void;
  onToggleUpgradeSlot: (slot: number, enabled: boolean) => void;
  onPickSpecialtySlot: (slot: number, specialty: string) => void;
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

  const safeSpecialtyList =
    pickedSpecialties?.length === slots
      ? pickedSpecialties
      : Array.from({ length: slots }, (_, i) => pickedSpecialties?.[i] ?? specialties?.[0] ?? "");

  const safeUpgradeSlots =
    upgradeSlots?.length === slots
      ? upgradeSlots
      : Array.from({ length: slots }, () => false);

  function slotIsValid(slotIdx: number) {
    if (!allowUpgrade || !safeUpgradeSlots[slotIdx]) return !!safePickedList[slotIdx];
    return !!safeSpecialtyList[slotIdx];
  }

  const canConfirm =
    flavors.length === 0
      ? true
      : hasMulti
      ? safePickedList.every((_, idx) => slotIsValid(idx))
      : slotIsValid(0);

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
                const curSpecialty = safeSpecialtyList[slotIdx] || "";
                const isUpgrade = allowUpgrade && safeUpgradeSlots[slotIdx];
                const portionLabel = portionLabels?.[slotIdx] || "Porcion";
                return (
                  <div key={slotIdx} className="border border-zinc-300">
                    <div className="px-4 py-3 border-b border-zinc-300 flex items-center justify-between">
                      <div className="text-xs font-extrabold text-zinc-900">
                        Porcion #{slotIdx + 1} ({portionLabel})
                      </div>
                      <div className="text-xs text-zinc-500">
                        Seleccionado: <b className="text-zinc-800">{isUpgrade ? `Especialidad ${curSpecialty || "—"}` : cur || "—"}</b>
                      </div>
                    </div>

                    {allowUpgrade ? (
                      <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between">
                        <label className="inline-flex items-center gap-2 text-xs font-extrabold text-zinc-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4 border border-zinc-300"
                            checked={isUpgrade}
                            onChange={(e) => onToggleUpgradeSlot(slotIdx, e.target.checked)}
                          />
                          Upgrade a especialidad
                        </label>
                        <div className="text-[11px] text-zinc-500">
                          +${upgradePrice.toFixed(2)} por porcion
                        </div>
                      </div>
                    ) : null}

                    {isUpgrade ? (
                      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {specialties.map((s) => {
                          const active = curSpecialty === s;
                          return (
                            <button
                              key={`${slotIdx}-sp-${s}`}
                              type="button"
                              onClick={() => onPickSpecialtySlot(slotIdx, s)}
                              className={[
                                "text-left border px-3 py-2 transition",
                                active
                                  ? "border-zinc-900 bg-zinc-900 text-white"
                                  : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900",
                              ].join(" ")}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-extrabold">{s}</span>
                                {active ? <CheckCircle2 className="w-4 h-4" /> : null}
                              </div>
                            </button>
                          );
                        })}
                        {specialties.length === 0 ? (
                          <div className="text-xs text-zinc-500">No hay especialidades.</div>
                        ) : null}
                      </div>
                    ) : (
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
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {allowUpgrade ? (
                <div className="px-4 py-3 border border-zinc-200 bg-zinc-50 flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-xs font-extrabold text-zinc-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4 border border-zinc-300"
                      checked={!!safeUpgradeSlots[0]}
                      onChange={(e) => onToggleUpgradeSlot(0, e.target.checked)}
                    />
                    Upgrade a especialidad
                  </label>
                  <div className="text-[11px] text-zinc-500">+${upgradePrice.toFixed(2)} por porcion</div>
                </div>
              ) : null}

              {allowUpgrade && safeUpgradeSlots[0] ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {specialties.map((s) => {
                    const active = safeSpecialtyList[0] === s;
                    return (
                      <button
                        key={`sp-${s}`}
                        type="button"
                        onClick={() => onPickSpecialtySlot(0, s)}
                        className={[
                          "text-left border px-4 py-3 transition",
                          active
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-900",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-extrabold">{s}</div>
                          {active ? <CheckCircle2 className="w-4 h-4" /> : null}
                        </div>
                      </button>
                    );
                  })}
                  {specialties.length === 0 ? (
                    <div className="text-xs text-zinc-500">No hay especialidades.</div>
                  ) : null}
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
