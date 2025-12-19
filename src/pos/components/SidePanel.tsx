import React, { useEffect } from "react";

type SidePanelProps = {
  open: boolean;
  onClose: () => void;

  title?: string;
  subtitle?: string;

  /** ancho del panel (Tailwind) */
  widthClassName?: string; // ej: "w-[720px]" o "max-w-[720px] w-full"

  /** contenido del header a la derecha (tabs, botones, etc.) */
  headerRight?: React.ReactNode;

  children: React.ReactNode;
};

export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  widthClassName = "w-[760px] max-w-[92vw]",
  headerRight,
  children,
}: SidePanelProps) {
  // ESC para cerrar
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // bloquear scroll del body
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={[
          "absolute right-0 top-0 h-full",
          widthClassName,
          "bg-white shadow-[0_25px_80px_rgba(0,0,0,.35)]",
          "border-l border-zinc-200",
          "flex flex-col",
          "animate-[slideIn_.18s_ease-out]",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
      >
        {/* Header fijo */}
        <div className="px-4 py-3 border-b border-zinc-200 bg-white/95 backdrop-blur flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <div className="text-sm font-extrabold text-zinc-900 truncate">
                {title}
              </div>
            ) : null}
            {subtitle ? (
              <div className="text-xs text-zinc-500 truncate">{subtitle}</div>
            ) : null}
          </div>

          {/* ✅ Fix completo del layout del header-right:
              - evita que se “corte” o se vea “doble”
              - asegura altura consistente
              - el botón cerrar no empuja el segmented
          */}
          <div className="flex items-center gap-2 shrink-0">
            {headerRight ? (
              <div className="shrink-0">{headerRight}</div>
            ) : null}

            <button
              onClick={onClose}
              className={[
                "h-9 w-9 inline-flex items-center justify-center",
                "rounded-xl border border-zinc-200 bg-white",
                "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300",
              ].join(" ")}
              title="Cerrar"
              aria-label="Cerrar"
            >
              ✖
            </button>
          </div>
        </div>

        {/* Body scrolleable */}
        <div className="flex-1 overflow-auto bg-zinc-50">{children}</div>
      </div>

      {/* Animación Tailwind custom */}
      <style>
        {`
          @keyframes slideIn {
            from { transform: translateX(16px); opacity: .6; }
            to   { transform: translateX(0); opacity: 1; }
          }
        `}
      </style>
    </div>
  );
}
