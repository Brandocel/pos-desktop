// src/pos/screens/CutScreen.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify"; // ✅ NUEVO
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
  calcPayTotalsFromTickets,
  CutPayTotals,

  // ✅ POLLOS SEGUROS (fuente real)
  resolvePolloTotals,

  // ✅ PARA COMPARAR CON DB SIN INVENTAR
  getPolloTotalsFromBackend,
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

  // ✅ Anti-spam (toast mismatch)
  const lastMismatchToastKeyRef = useRef<string>("");
  // ✅ Anti-spam (console logs)
  const lastConsoleKeyRef = useRef<string>("");

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

      // ✅ Debug de pagos (solo para ver estructura)
      const t0 = res.data?.tickets?.[0];
      if (t0) {
        console.log("TICKETS[0] RAW =>", t0);
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

  // ✅ Descargar Ticket como TXT (útil en caja / respaldo)
  function downloadTicketTxt() {
    if (!cutData) return;

    const to = cutUseRange ? cutTo : cutFrom;
    const dateLabel = cutUseRange ? `${cutFrom} a ${to}` : `${cutFrom}`;

    const gt = safeNum(cutData?.totals?.grand);
    const tc = safeNum(cutData?.tickets?.length);

    const polloResolved = resolvePolloTotals({
      cutData,
      tickets: cutData?.tickets ?? [],
      products: cutData?.products ?? [],
    });

    const pay = calcPayTotalsFromTickets(cutData?.tickets ?? []);

    const lines: string[] = [];
    lines.push("POLLO PIRATA POS — CORTE / TICKET");
    lines.push(`Fecha(s): ${dateLabel}`);
    lines.push("----------------------------------------");
    lines.push(`Total vendido: ${gt.toFixed(2)}`);
    lines.push(`Tickets: ${tc}`);
    lines.push("----------------------------------------");
    lines.push(
      `EFECTIVO: ${safeNum(pay.efectivoTotal).toFixed(2)} (tickets: ${safeNum(
        pay.efectivoCount
      )})`
    );
    lines.push(
      `TARJETA:  ${safeNum(pay.tarjetaTotal).toFixed(2)} (tickets: ${safeNum(
        pay.tarjetaCount
      )})`
    );
    if (safeNum(pay.otrosCount) > 0) {
      lines.push(
        `OTROS:    ${safeNum(pay.otrosTotal).toFixed(2)} (tickets: ${safeNum(
          pay.otrosCount
        )})`
      );
    }
    lines.push("----------------------------------------");
    lines.push("CONSUMO DE POLLOS (sin sabor)");
    lines.push(`TOTAL:   ${safeNum(polloResolved.total)}`);
    lines.push(`ENTEROS: ${safeNum(polloResolved.enteros)}`);
    lines.push(`MEDIOS:  ${safeNum(polloResolved.medios)}`);
    lines.push(`CUARTOS: ${safeNum(polloResolved.cuartos)}`);
    lines.push("----------------------------------------");

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const filename = `corte_ticket_${cutFrom}_a_${to}.txt`;
    downloadBlob(blob, filename);
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
  const products: CutProductRow[] = useMemo(() => {
    const list = (cutData?.products ?? []) as CutProductRow[];
    return [...list].sort((a, b) => safeNum(b.qty) - safeNum(a.qty));
  }, [cutData]);

  const grandTotal = useMemo(() => safeNum(cutData?.totals?.grand), [cutData]);

  const ticketsCount = useMemo(() => safeNum(cutData?.tickets?.length), [cutData]);

  // ✅ Pago
  const payTotals: CutPayTotals = useMemo(() => {
    return calcPayTotalsFromTickets(cutData?.tickets ?? []);
  }, [cutData]);

  // ✅✅✅ POLLOS (FUENTE REAL + SEGURO)
  const polloTotals = useMemo(() => {
    return resolvePolloTotals({
      cutData,
      tickets: cutData?.tickets ?? [],
      products,
    });
  }, [cutData, products]);

  // ✅✅✅ CONSOLE LOG: imprimir EXACTO lo que trae DB (backend) vs UI (resuelto)
  // (sin spam, solo cuando cambie el corte o cambien los totales)
  useEffect(() => {
    if (!cutData) return;

    const backendTotals = getPolloTotalsFromBackend(cutData); // <- lo que viene de DB en el summary
    const key = JSON.stringify({
      from: cutFrom,
      to: cutUseRange ? cutTo : cutFrom,
      backend: backendTotals ?? null,
      ui: polloTotals ?? null,
      ticketsLen: safeNum(cutData?.tickets?.length),
      grand: safeNum(cutData?.totals?.grand),
    });

    if (key === lastConsoleKeyRef.current) return;
    lastConsoleKeyRef.current = key;

    console.groupCollapsed(
      `🧾 CORTE DEBUG (${cutFrom} → ${cutUseRange ? cutTo : cutFrom})`
    );
    console.log("RAW cutData.totals =>", cutData?.totals);
    console.log("DB polloTotals (backend) =>", backendTotals);
    console.log("UI polloTotals (resuelto) =>", polloTotals);

    // extra: te imprime qué items están sumando como pollos (para detectar duplicados)
    const polloItems = (cutData?.tickets ?? []).flatMap((t: any) =>
      (t?.items ?? [])
        .filter((it: any) => {
          const n = String(it?.name ?? "").toLowerCase();
          return n.includes("pollo") || n.includes("1/2") || n.includes("1/4") || n.includes("cuarto") || n.includes("medio");
        })
        .map((it: any) => ({
          saleId: t?.saleId,
          createdAt: t?.createdAt,
          name: it?.name,
          qty: it?.qty,
          category: it?.category,
          subtotal: it?.subtotal,
        }))
    );

    console.table(polloItems);

    console.log("Tickets count =>", safeNum(cutData?.tickets?.length));
    console.log("Products count =>", safeNum(cutData?.products?.length));

    console.groupEnd();
  }, [cutData, polloTotals, cutFrom, cutTo, cutUseRange]);

  // ✅ Toast cuando NO cuadra UI vs DB (sin spam)
  useEffect(() => {
    if (!cutData) return;

    const backendTotals = getPolloTotalsFromBackend(cutData);
    if (!backendTotals) return;

    const diff =
      Math.abs(safeNum(backendTotals.enteros) - safeNum(polloTotals.enteros)) +
      Math.abs(safeNum(backendTotals.medios) - safeNum(polloTotals.medios)) +
      Math.abs(safeNum(backendTotals.cuartos) - safeNum(polloTotals.cuartos));

    if (diff <= 0) return;

    const key = JSON.stringify({
      db: backendTotals,
      ui: polloTotals,
      from: cutFrom,
      to: cutUseRange ? cutTo : cutFrom,
      tickets: safeNum(cutData?.tickets?.length),
    });

    if (key === lastMismatchToastKeyRef.current) return;
    lastMismatchToastKeyRef.current = key;



    toast.warning(
      `⚠️ Conteo de POLLOS no cuadra (UI vs DB). DB: E${backendTotals.enteros}/M${backendTotals.medios}/C${backendTotals.cuartos} — UI: E${polloTotals.enteros}/M${polloTotals.medios}/C${polloTotals.cuartos}. Revisa tickets/items o incluidos.`,
      {
        toastId: `pollo-mismatch-${safeNum(backendTotals.total)}-${safeNum(
          polloTotals.total
        )}-${safeNum(cutData?.tickets?.length)}`,
        autoClose: 8000,
      }
    );
  }, [cutData, polloTotals, cutFrom, cutTo, cutUseRange]);

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
        // ✅ NUEVO: Imprimir/Descargar como Ticket
        onPrintTicket={() => {
          setPdfOpen(false);
          setTicketOpen(true);
        }}
        onDownloadTicket={downloadTicketTxt}
      />

      {/* Ticket Drawer */}
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
