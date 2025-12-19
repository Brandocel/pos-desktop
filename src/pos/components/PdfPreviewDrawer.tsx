import { useEffect, useMemo, useRef } from "react";
import {
  X,
  Printer,
  Download,
  Copy,
  FileText,
  Eye,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  subtitle?: string;
  pdfUrl?: string | null; // blob url
  filename?: string;
  loading?: boolean;
  error?: string | null;

  onClose: () => void;
  onPrint?: () => void;
  onDownload?: () => void;
  onCopyLink?: () => void; // opcional
};

export function PdfPreviewDrawer({
  open,
  title = "Preview PDF",
  subtitle,
  pdfUrl,
  filename = "corte.pdf",
  loading = false,
  error = null,
  onClose,
  onPrint,
  onDownload,
  onCopyLink,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canShowPdf = useMemo(() => !!pdfUrl && !loading && !error, [pdfUrl, loading, error]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      {/* overlay */}
      <button
        aria-label="Cerrar overlay"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />

      {/* drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl border-l border-zinc-200 flex flex-col">
        {/* header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-base font-extrabold text-zinc-900 truncate flex items-center gap-2">
              <FileText className="h-4 w-4 text-zinc-700" />
              {title}
            </div>
            {subtitle ? (
              <div className="text-xs text-zinc-500 truncate">{subtitle}</div>
            ) : null}
          </div>

          <button
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition grid place-items-center text-zinc-700"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            {/* estados */}
            {loading ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 flex items-start gap-3">
                <Loader2 className="h-5 w-5 text-zinc-600 animate-spin mt-0.5" />
                <div>
                  <div className="text-sm font-extrabold text-zinc-900">Generando PDF…</div>
                  <div className="text-xs text-zinc-500 mt-1">Espera un momento.</div>
                </div>
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-rose-700 mt-0.5" />
                <div>
                  <div className="text-sm font-extrabold text-rose-900">No se pudo mostrar el PDF</div>
                  <div className="text-xs text-rose-700 mt-1">{error}</div>
                </div>
              </div>
            ) : !pdfUrl ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 flex items-start gap-3">
                <Eye className="h-5 w-5 text-zinc-600 mt-0.5" />
                <div>
                  <div className="text-sm font-extrabold text-zinc-900">Sin PDF</div>
                  <div className="text-xs text-zinc-500 mt-1">Aún no se ha generado el documento.</div>
                </div>
              </div>
            ) : null}

            {/* preview */}
            {canShowPdf ? (
              <div className="mt-4 rounded-2xl border border-zinc-200 overflow-hidden bg-white">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-zinc-600 truncate flex items-center gap-2">
                    <FileText className="h-4 w-4 text-zinc-500" />
                    {filename}
                  </div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    Vista previa
                  </div>
                </div>

                {/* altura tipo ticket */}
                <div className="h-[78vh] bg-zinc-100">
                  <iframe
                    ref={iframeRef}
                    src={pdfUrl || undefined}
                    title="PDF Preview"
                    className="w-full h-full"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* footer actions */}
        <div className="px-5 py-4 border-t border-zinc-200 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500 truncate">
            {canShowPdf ? "Listo. Puedes imprimir o descargar." : "—"}
          </div>

          <div className="flex items-center gap-2">
            {onCopyLink ? (
              <button
                onClick={onCopyLink}
                className="h-10 px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition text-xs font-extrabold inline-flex items-center gap-2"
                title="Copiar"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            ) : null}

            <button
              onClick={onPrint}
              disabled={!canShowPdf}
              className="h-10 px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 transition text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              title="Imprimir"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>

            <button
              onClick={onDownload}
              disabled={!canShowPdf}
              className="h-10 px-3 rounded-xl border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 transition text-xs font-extrabold disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
              title="Descargar"
            >
              <Download className="h-4 w-4" />
              Descargar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
