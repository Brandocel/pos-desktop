export function DesechablesModal(props: {
    open: boolean;
    ui: any;
    uso: string;
    precio: number;
    onUso: (v: string) => void;
    onPrecio: (v: number) => void;
    onClose: () => void;
    onConfirm: () => void;
  }) {
    const { open, ui, uso, precio, onUso, onPrecio, onClose, onConfirm } = props;
    if (!open) return null;
  
    return (
      <div className={ui.modalOverlay} onMouseDown={onClose}>
        <div className={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
          <div className="text-base font-extrabold text-zinc-900">Desechables (captura libre)</div>
          <div className="text-sm text-zinc-500 mt-1">Captura el uso y el precio.</div>
  
          <div className="mt-4 space-y-3">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Uso</div>
              <input value={uso} onChange={(e) => onUso(e.target.value)} placeholder="Platos / Vasos / Bolsas…" className={ui.input} />
            </div>
  
            <div>
              <div className="text-xs text-zinc-500 mb-1">Precio</div>
              <input type="number" value={precio} onChange={(e) => onPrecio(Number(e.target.value))} placeholder="0" className={ui.input} />
            </div>
          </div>
  
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className={ui.smallBtn}>Cancelar</button>
            <button onClick={onConfirm} className={ui.primaryStrong}>Agregar</button>
          </div>
        </div>
      </div>
    );
  }
  