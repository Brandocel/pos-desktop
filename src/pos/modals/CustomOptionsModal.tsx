import type { Product } from "../types";

export function CustomOptionsModal(props: {
  open: boolean;
  ui: any;
  product?: Product;
  label: string;
  options: Array<{ name: string; extraName: string }>;
  picked: string;
  onPick: (extraName: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { open, ui, product, label, options, picked, onPick, onClose, onConfirm } = props;
  if (!open) return null;

  return (
    <div className={ui.modalOverlay} onMouseDown={onClose}>
      <div className={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-base font-extrabold text-zinc-900">{label}</div>
        <div className="text-sm text-zinc-500 mt-1">{product?.name}</div>

        <div className="mt-4 flex flex-col gap-2">
          {options.map((opt) => {
            const active = opt.extraName === picked;
            return (
              <button
                key={opt.extraName}
                onClick={() => onPick(opt.extraName)}
                className={[
                  "px-4 py-3 rounded-xl text-sm font-extrabold border transition text-left",
                  active
                    ? "border-zinc-400 bg-zinc-200 text-zinc-900 ring-2 ring-zinc-200"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400",
                ].join(" ")}
              >
                {opt.name}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className={ui.smallBtn}>Cancelar</button>
          <button onClick={onConfirm} className={ui.primaryStrong}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
