import type { Product } from "../types";

export function FlavorModal(props: {
  open: boolean;
  ui: any;
  product?: Product;
  flavors: string[];
  picked: string;
  onPick: (f: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { open, ui, product, flavors, picked, onPick, onClose, onConfirm } = props;
  if (!open) return null;

  return (
    <div className={ui.modalOverlay} onMouseDown={onClose}>
      <div className={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-base font-extrabold text-zinc-900">Selecciona sabor</div>
        <div className="text-sm text-zinc-500 mt-1">{product?.name} • Elige el sabor</div>

        <div className="mt-4 flex flex-wrap gap-2">
          {flavors.map((f) => {
            const active = f === picked;
            return (
              <button
                key={f}
                onClick={() => onPick(f)}
                className={[
                  "px-3 py-2 rounded-full text-xs font-extrabold border transition",
                  active
                    ? "border-zinc-400 bg-zinc-200 text-zinc-900 ring-2 ring-zinc-200"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400",
                ].join(" ")}
              >
                {f}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={ui.smallBtn}>Cancelar</button>
          <button onClick={onConfirm} className={ui.primaryStrong}>Agregar</button>
        </div>
      </div>
    </div>
  );
}
