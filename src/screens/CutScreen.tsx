// src/pos/screens/CutScreen.tsx
import { useEffect, useMemo, useState } from "react";
import { useUi } from "../pos/hooks/useUi";
import { getTodayCancunISO } from "../pos/utils/dates";
import { PdfPreviewDrawer } from "../pos/components/PdfPreviewDrawer";
import { base64ToBlobUrl, downloadBlob } from "../pos/utils/pdf";

import { CutHeader } from "./cut/CutHeader";
import { CutFiltersBar } from "./cut/CutFiltersBar";
import { CutOverview } from "./cut/CutOverview";
import { CutDetail } from "./cut/CutDetail";
import {
  CutProductRow,
  safeNum,
  calcPolloTotalsFromProducts,
  calcPayTotalsFromTickets,
  CutPayTotals,
} from "./cut/cutHelpers";

// ✅ Ticket Drawer lateral
import { CutTicketDrawer } from "../screens/cut/CutTicketDrawer";
import { CutTicket } from "../screens/cut/CutTicket";

type Props = { onBack: () => void };

export function CutScreen({ onBack }: Props) {
  const ui = useUi();

  const [cutFrom, setCutFrom] = useState(getTodayCancunISO());
  const [cutTo, setCutTo] = useState(getTodayCancunISO());
  const [cutUseRange, setCutUseRange] = useState(false);

  const [loading, setLoading] = useState(false);
  const [cutData, setCutData] = useState<
    Awaited<ReturnType<typeof window.api.salesSummary>>["data"] | null
  >(null);

  // ==========================
  // PDF
  // ==========================
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFilename, setPdfFilename] = useState("corte.pdf");

  // ==========================
  // Ticket (drawer lateral)
  // ==========================
  const [ticketOpen, setTicketOpen] = useState(false);

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

      // ✅ DEBUG TEMPORAL (MUY IMPORTANTE)
      // Esto te va a decir cómo viene el método de pago en cada ticket.
      const t0 = res.data?.tickets?.[0];
      if (t0) {
        console.log("TICKETS[0] RAW =>", t0);

        console.table(
          (res.data?.tickets ?? []).map((t: any, i: number) => ({
            i,
            // posibles campos
            paymentMethod: t?.paymentMethod,
            payment_method: t?.payment_method,
            metodoPago: t?.metodoPago,
            metodo_pago: t?.metodo_pago,
            method: t?.method,
            payMethod: t?.payMethod,

            // anidados posibles
            payment_method_nested: t?.payment?.method,
            payment_type_nested: t?.payment?.type,
            payment_name_nested: t?.payment?.name,
            gateway: t?.payment?.gateway,

            // totales posibles
            total: t?.total,
            grandTotal: t?.grandTotal,
            amount: t?.amount,
            paidTotal: t?.paidTotal,
            totalAmount: t?.totalAmount,
            subtotal: t?.subtotal,
            totals_grand: t?.totals?.grand,
            totals_total: t?.totals?.total,
          }))
        );
      }
    } catch (e) {
      console.error(e);
      alert("No se pudo cargar el corte");
    } finally {
      setLoading(false);
    }
  }

  async function openPdfPreview() {
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);

    try {
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

      const name =
        res.filename || `corte_${cutFrom}_a_${cutUseRange ? cutTo : cutFrom}.pdf`;

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

    const iframe = document.querySelector(
      'iframe[title="PDF Preview"]'
    ) as HTMLIFrameElement | null;

    if (iframe?.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return;
    }

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

  // ✅ ticket actions
  function openTicket() {
    setTicketOpen(true);
  }

  function closeTicket() {
    setTicketOpen(false);
  }

  function printTicket() {
    window.print();
  }

  // cleanup pdf url
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

  // ==========================
  // computed
  // ==========================
  const products = useMemo(() => {
    const list = (cutData?.products ?? []) as CutProductRow[];
    return [...list].sort((a, b) => safeNum(b.qty) - safeNum(a.qty));
  }, [cutData]);

  const grandTotal = useMemo(() => safeNum(cutData?.totals?.grand), [cutData]);

  const polloTotals = useMemo(() => {
    return calcPolloTotalsFromProducts(products);
  }, [products]);

  const ticketsCount = useMemo(() => safeNum(cutData?.tickets?.length), [cutData]);

  // ✅ Pago: desde tickets
  const payTotals: CutPayTotals = useMemo(() => {
    return calcPayTotalsFromTickets(cutData?.tickets ?? []);
  }, [cutData]);

  const rangeLabel = useMemo(() => {
    const to = cutUseRange ? cutTo : cutFrom;
    return `${cutFrom} → ${to}`;
  }, [cutFrom, cutTo, cutUseRange]);

  const ticketTo = useMemo(
    () => (cutUseRange ? cutTo : cutFrom),
    [cutUseRange, cutFrom, cutTo]
  );

  return (
    <div className={`min-h-screen ${ui.page} font-sans`}>
      <header className={ui.header}>
        <CutHeader
          rangeLabel={rangeLabel}
          onPdf={openPdfPreview}
          onBack={onBack}
          onTicket={openTicket}
        />
      </header>

      <main className="mx-auto max-w-[1200px] px-5 py-5 space-y-4">
        {/* Panel General */}
        <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200">
            <div className="text-sm font-extrabold text-zinc-900">Resumen general</div>
            <div className="text-xs text-zinc-500">
              Fechas arriba (una línea). Totales abajo. Listo para corte rápido.
            </div>
          </div>

          <CutFiltersBar
            uiInputClass={ui.input}
            cutFrom={cutFrom}
            cutTo={cutTo}
            cutUseRange={cutUseRange}
            loading={loading}
            onChangeFrom={setCutFrom}
            onChangeTo={setCutTo}
            onToggleRange={setCutUseRange}
            onRefresh={loadSummary}
          />

          {!cutData ? (
            <div className="p-4 text-sm text-zinc-500">Cargando…</div>
          ) : (
            <CutOverview
              grandTotal={grandTotal}
              ticketsCount={ticketsCount}
              distinctProducts={products.length}
              polloTotals={polloTotals}
              payTotals={payTotals}
            />
          )}
        </div>

        {/* Detalle */}
        <CutDetail uiInputClass={ui.input} products={products} grandTotal={grandTotal} />
      </main>

      {/* PDF Drawer */}
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

      {/* ✅ Ticket Drawer Lateral */}
      <CutTicketDrawer
        open={ticketOpen}
        title="Corte"
        subtitle="Ticket (vista previa)"
        onClose={closeTicket}
        onPrint={printTicket}
      >
        {cutData ? (
          <CutTicket
            from={cutFrom}
            to={ticketTo}
            useRange={cutUseRange}
            grandTotal={grandTotal}
            ticketsCount={ticketsCount}
            polloTotals={polloTotals}
            products={products}
            payTotals={payTotals}
          />
        ) : (
          <div className="text-xs text-zinc-600">No hay datos para mostrar.</div>
        )}
      </CutTicketDrawer>
    </div>
  );
}
