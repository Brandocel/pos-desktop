import { useEffect, useMemo, useState } from "react";
import { useUi } from "../pos/hooks/useUi";
import { getTodayCancunISO } from "../pos/utils/dates";
import { money } from "../pos/utils/money";
import { PdfPreviewDrawer } from "../pos/components/PdfPreviewDrawer";
import { base64ToBlobUrl, downloadBlob } from "../pos/utils/pdf";

type Props = { onBack: () => void };

// helpers
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function CutScreen({ onBack }: Props) {
  const ui = useUi();

  const [cutFrom, setCutFrom] = useState(getTodayCancunISO());
  const [cutTo, setCutTo] = useState(getTodayCancunISO());
  const [cutUseRange, setCutUseRange] = useState(false);

  const [loading, setLoading] = useState(false);
  const [cutData, setCutData] = useState<Awaited<ReturnType<typeof window.api.salesSummary>>["data"] | null>(null);

  // PDF preview drawer state
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFilename, setPdfFilename] = useState("corte.pdf");

  async function loadSummary() {
    setLoading(true);
    try {
      const res = await window.api.salesSummary({
        from: cutFrom,
        to: cutUseRange ? cutTo : cutFrom,
      });

      if (!res.ok || !res.data) {
        alert(res.message || "Error al cargar corte");
        return;
      }
      setCutData(res.data);
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar el corte");
    } finally {
      setLoading(false);
    }
  }

  // Generar PDF
  async function openPdfPreview() {
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);

    try {
      // limpia url anterior
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setPdfBlob(null);

      const res = await window.api.salesCutPdf({
        from: cutFrom,
        to: cutUseRange ? cutTo : cutFrom,
      });

      if (!res.ok || !res.base64) {
        setPdfError(res.message || "No se pudo generar el PDF");
        return;
      }

      const name = res.filename || `corte_${cutFrom}_a_${cutUseRange ? cutTo : cutFrom}.pdf`;
      const { url, blob } = base64ToBlobUrl(res.base64, "application/pdf");

      setPdfFilename(name);
      setPdfBlob(blob);
      setPdfUrl(url);
    } catch (e: any) {
      console.error(e);
      setPdfError(e?.message || "Error generando el PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  function closePdf() {
    setPdfOpen(false);
  }

  function printPdf() {
    if (!pdfUrl) return;
    // La forma más estable: abrir print desde el iframe del drawer
    // Como el iframe está dentro del drawer, el navegador/electron normalmente permite:
    const iframe = document.querySelector('iframe[title="PDF Preview"]') as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    }
    // fallback: abrir nueva ventana con pdfUrl y print
    const w = window.open(pdfUrl, "_blank");
    if (w) {
      w.focus();
      w.print();
    }
  }

  function downloadPdf() {
    if (!pdfBlob) return;
    downloadBlob(pdfBlob, pdfFilename);
  }

  // cleanup blob url
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grandTotal = useMemo(() => safeNum(cutData?.totals?.grand), [cutData]);
  const cashTotal = useMemo(() => safeNum(cutData?.totals?.cash), [cutData]);
  const cardTotal = useMemo(() => safeNum(cutData?.totals?.card), [cutData]);

  // ✅ Lo que tú quieres: “cuántos de cada cosa”
  const products = useMemo(() => {
    const list = (cutData?.products ?? []) as Array<{ name: string; category: string; qty: number; subtotal: number }>;
    // Ordena por cantidad primero (para corte de producción)
    return [...list].sort((a, b) => safeNum(b.qty) - safeNum(a.qty));
  }, [cutData]);
  // Agrupar productos por categoría para mejor visualización
  const productsByCategory = useMemo(() => {
    const grouped: Record<string, Array<{ name: string; qty: number; subtotal: number }>> = {};
    for (const p of products) {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    }
    return grouped;
  }, [products]);

  // ✅ TOTALES DE POLLOS (incluye individuales + incluidos en paquetes)
  const polloTotals = useMemo(() => {
    const t = cutData?.totals?.polloTotals;
    return {
      enteros: safeNum(t?.enteros),
      medios: safeNum(t?.medios),
      cuartos: safeNum(t?.cuartos),
      total: safeNum(t?.total),
    };
  }, [cutData]);
  const rangeLabel = useMemo(() => {
    const to = cutUseRange ? cutTo : cutFrom;
    return `${cutFrom} → ${to}`;
  }, [cutFrom, cutTo, cutUseRange]);

  return (
    <div className={`min-h-screen ${ui.page} font-sans`}>
      {/* HEADER */}
      <header className={ui.header}>
        <div className="mx-auto max-w-[1200px] px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-extrabold text-zinc-900 flex items-center gap-2">
              🧾 Corte (cantidades)
              <span className="text-xs font-semibold text-zinc-500">{rangeLabel}</span>
            </div>
            <div className="text-xs text-zinc-500">
              Aquí ves cuántos productos se vendieron (pollos, paquetes, extras, desechables…).
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openPdfPreview}
              className="h-10 px-3 rounded-xl border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 transition text-xs font-extrabold"
              title="Ver PDF"
            >
              📄 Ver PDF
            </button>

            <button
              onClick={onBack}
              className="h-10 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-extrabold hover:bg-zinc-50 transition"
            >
              ← Volver
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-5 space-y-4">
        {/* FILTROS */}
        <div className={ui.panel}>
          <div className="px-4 py-3 border-b border-zinc-200 flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Desde</label>
              <input type="date" value={cutFrom} onChange={(e) => setCutFrom(e.target.value)} className={ui.input} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-500">Hasta</label>
              <input
                type="date"
                value={cutTo}
                onChange={(e) => setCutTo(e.target.value)}
                disabled={!cutUseRange}
                className={ui.input + (cutUseRange ? "" : " opacity-50 cursor-not-allowed")}
              />

              <label className="flex items-center gap-2 text-xs text-zinc-600 mt-1 select-none">
                <input type="checkbox" checked={cutUseRange} onChange={(e) => setCutUseRange(e.target.checked)} />
                Usar rango
              </label>
            </div>

            <div className="flex gap-2 items-end">
              <button onClick={loadSummary} className={ui.primaryStrong} disabled={loading}>
                {loading ? "Cargando…" : "Actualizar"}
              </button>
            </div>
          </div>

          <div className="p-4">
            {!cutData ? (
              <div className="text-sm text-zinc-500">Cargando…</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div className={ui.footerBox}>
                  <div className="text-xs text-zinc-500">Total vendido</div>
                  <div className="text-2xl font-extrabold text-zinc-900">{money(grandTotal)}</div>
                </div>

                <div className={ui.footerBox}>
                  <div className="text-xs text-zinc-500">💵 Efectivo</div>
                  <div className="text-xl font-extrabold text-green-700">{money(cashTotal)}</div>
                </div>

                <div className={ui.footerBox}>
                  <div className="text-xs text-zinc-500">💳 Tarjeta</div>
                  <div className="text-xl font-extrabold text-blue-700">{money(cardTotal)}</div>
                </div>

                <div className={ui.footerBox}>
                  <div className="text-xs text-zinc-500">Tickets</div>
                  <div className="text-xl font-extrabold text-zinc-900">{cutData.tickets.length}</div>
                </div>

                <div className={ui.footerBox}>
                  <div className="text-xs text-zinc-500">Productos distintos</div>
                  <div className="text-xl font-extrabold text-zinc-900">{products.length}</div>
                </div>

                {/* NUEVO: Totales de pollos (incluye los incluidos) */}
                <div className={ui.footerBox + " md:col-span-2 bg-orange-50 border border-orange-200"}>
                  <div className="text-xs text-orange-800 font-semibold">🍗 Pollos (todas las fuentes)</div>
                  <div className="text-lg font-extrabold text-orange-900">Total: {safeNum(polloTotals.total)}</div>
                  <div className="text-xs text-orange-800 mt-1">
                    Enteros: {safeNum(polloTotals.enteros)} · Medios: {safeNum(polloTotals.medios)} · Cuartos: {safeNum(polloTotals.cuartos)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TABLA DE CANTIDADES */}
        <div className={ui.panel}>
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-extrabold text-zinc-900">Cantidades por categoría y producto</div>
              <div className="text-xs text-zinc-500">Desglose para producción y corte.</div>
            </div>
          </div>

          <div className="p-4 overflow-auto">
            {!cutData ? (
              <div className="text-sm text-zinc-500">Cargando…</div>
            ) : products.length === 0 ? (
              <div className="text-sm text-zinc-500">No hay ventas en el rango.</div>
            ) : (
              <div className="space-y-4">
                {/* Primero mostrar categorías en orden de importancia */}
                {['Pollos', 'Paquetes', 'Especialidades', 'Miércoles', 'Extras', 'Bebidas', 'Desechable'].map(
                  (category) => {
                    if (!productsByCategory[category] || productsByCategory[category].length === 0) return null;
                    const items = productsByCategory[category];
                    const categoryTotal = items.reduce((acc, p) => acc + safeNum(p.subtotal), 0);

                    // Detectar si es pollos para usar formato especial
                    const isPollos = category === 'Pollos';

                    return (
                      <div key={category} className="border border-zinc-200 rounded-lg overflow-hidden">
                        <div className={`px-4 py-2 font-extrabold text-sm ${
                          isPollos ? 'bg-orange-100 text-orange-900' : 'bg-zinc-100 text-zinc-900'
                        }`}>
                          {category === 'Pollos' ? '🍗 ' : ''}
                          {category}
                        </div>
                        <table className="w-full text-sm">
                          <thead className="text-xs text-zinc-500 bg-zinc-50">
                            <tr className="border-t border-zinc-200">
                              <th className="text-left py-2 px-4">Producto</th>
                              <th className="text-right py-2 px-4">Cantidad</th>
                              <th className="text-right py-2 px-4">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((p, idx) => (
                              <tr key={`${category}-${p.name}-${idx}`} className="border-t border-zinc-100">
                                <td className="py-2 px-4 font-semibold text-zinc-900">{p.name}</td>
                                <td className="py-2 px-4 text-right font-extrabold text-zinc-900">{safeNum(p.qty)}</td>
                                <td className="py-2 px-4 text-right font-extrabold text-zinc-900">{money(safeNum(p.subtotal))}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className={`font-extrabold ${isPollos ? 'bg-orange-50' : 'bg-zinc-50'}`}>
                              <td className="py-2 px-4">Subtotal {category}</td>
                              <td className="py-2 px-4 text-right">{items.reduce((acc, p) => acc + safeNum(p.qty), 0)}</td>
                              <td className="py-2 px-4 text-right">{money(categoryTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  }
                )}

                {/* Mostrar otras categorías no listadas */}
                {Object.entries(productsByCategory).map(([category, items]) => {
                  if (['Pollos', 'Paquetes', 'Especialidades', 'Miércoles', 'Extras', 'Bebidas', 'Desechable'].includes(category)) {
                    return null;
                  }
                  const categoryTotal = items.reduce((acc, p) => acc + safeNum(p.subtotal), 0);
                  return (
                    <div key={category} className="border border-zinc-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2 font-extrabold text-sm bg-zinc-100 text-zinc-900">{category}</div>
                      <table className="w-full text-sm">
                        <thead className="text-xs text-zinc-500 bg-zinc-50">
                          <tr className="border-t border-zinc-200">
                            <th className="text-left py-2 px-4">Producto</th>
                            <th className="text-right py-2 px-4">Cantidad</th>
                            <th className="text-right py-2 px-4">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p, idx) => (
                            <tr key={`${category}-${p.name}-${idx}`} className="border-t border-zinc-100">
                              <td className="py-2 px-4 font-semibold text-zinc-900">{p.name}</td>
                              <td className="py-2 px-4 text-right font-extrabold text-zinc-900">{safeNum(p.qty)}</td>
                              <td className="py-2 px-4 text-right font-extrabold text-zinc-900">{money(safeNum(p.subtotal))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-extrabold bg-zinc-50">
                            <td className="py-2 px-4">Subtotal {category}</td>
                            <td className="py-2 px-4 text-right">{items.reduce((acc, p) => acc + safeNum(p.qty), 0)}</td>
                            <td className="py-2 px-4 text-right">{money(categoryTotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })}

                {/* TOTAL GENERAL */}
                <div className="bg-zinc-900 text-white px-4 py-3 rounded-lg font-extrabold flex justify-between">
                  <span>TOTAL GENERAL</span>
                  <span>{money(grandTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ✅ Drawer preview tipo “Ticket” como tu imagen */}
      <PdfPreviewDrawer
        open={pdfOpen}
        title="Corte"
        subtitle="Preview PDF"
        pdfUrl={pdfUrl}
        filename={pdfFilename}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        onPrint={printPdf}
        onDownload={downloadPdf}
      />
    </div>
  );
}
