import { money } from "../utils/money";
import { escapeHtml } from "../utils/escapeHtml";

type PolloKind = "entero" | "medio" | "cuarto";

function normText(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getPolloKindFromName(name: string): PolloKind | null {
  const n = normText(name);
  if (!n.includes("pollo")) return null;

  if (n.includes("1/4") || n.includes("cuarto")) return "cuarto";
  if (n.includes("1/2") || n.includes("medio")) return "medio";
  return "entero";
}

function polloEquivalent(kind: PolloKind, qty: number) {
  if (kind === "entero") return qty * 1;
  if (kind === "medio") return qty * 0.5;
  return qty * 0.25;
}

function isDesechableName(name: string) {
  const n = normText(name);
  return n.includes("desechable") || n.includes("desechables");
}

function sumQty(list: Array<{ qty: number }>) {
  return list.reduce((a, x) => a + safeNum(x.qty), 0);
}

/**
 * ✅ Pollo summary robusto:
 * - Si hay category: respeta regla (Pollos o Incluido)
 * - Si NO hay category: cuenta por nombre (para tickets de producción)
 */
function buildPolloSummary(items: Array<{ name: string; qty: number; category?: string }>) {
  let enteros = 0;
  let medios = 0;
  let cuartos = 0;

  let porcionesTotal = 0;
  let equivalenteTotal = 0;

  for (const it of items) {
    const name = it.name ?? "";
    const qty = safeNum(it.qty);
    if (qty <= 0) continue;

    const kind = getPolloKindFromName(name);
    if (!kind) continue;

    const hasCategory = (it.category ?? "").trim().length > 0;

    if (hasCategory) {
      const catN = normText(it.category ?? "");
      const isIncluded = catN.includes("incluido");
      const isPolloCategory = catN === "pollos" || catN.includes("pollos");

      // ✅ regla exacta
      if (!(isPolloCategory || isIncluded)) continue;
    }
    // ✅ si no hay categoría: lo contamos (ticket producción suele traer solo pollos)

    if (kind === "entero") enteros += qty;
    if (kind === "medio") medios += qty;
    if (kind === "cuarto") cuartos += qty;

    porcionesTotal += qty;
    equivalenteTotal += polloEquivalent(kind, qty);
  }

  return {
    enteros,
    medios,
    cuartos,
    porcionesTotal,
    equivalenteTotal: Number(equivalenteTotal.toFixed(2)),
  };
}

export function buildTicketHTML(params: {
  businessName: string;
  date: string;

  items: Array<{ name: string; qty: number; price: number; subtotal: number; category?: string }>;

  total: number;
  cashReceived: number;
  change: number;
  paymentMethod?: "cash" | "card";

  // ✅ NUEVO: para conteo general como PDF
  extrasDetailed?: Array<{ name: string; qty: number }>;          // pagados
  extrasIncludedDetailed?: Array<{ name: string; qty: number }>;  // incluidos gratis sin pollo

  notes?: string;
  saleId?: string | number;
}) {
  const {
    businessName,
    date,
    items,
    total,
    cashReceived,
    change,
    notes,
    saleId,
    paymentMethod,
    extrasDetailed = [],
    extrasIncludedDetailed = [],
  } = params;

  const pollo = buildPolloSummary(items);

  // ✅ Conteo general de extras (idéntico lógica a tu PDF)
  const extrasPaidOnly = extrasDetailed.filter((e) => !isDesechableName(e.name));
  const desechablesPaidOnly = extrasDetailed.filter((e) => isDesechableName(e.name));

  const extrasPaidQty = sumQty(extrasPaidOnly);
  const desechablesPaidQty = sumQty(desechablesPaidOnly);
  const includedQty = sumQty(extrasIncludedDetailed);

  const rows = items
    .map(
      (i) => `
      <div class="row item">
        <div class="col name">
          ${escapeHtml(i.name)}
          ${i.category ? `<div class="muted tiny">${escapeHtml(i.category)}</div>` : ""}
        </div>
        <div class="col qty">${safeNum(i.qty)}</div>
        <div class="col price">${money(safeNum(i.price))}</div>
        <div class="col sub">${money(safeNum(i.subtotal))}</div>
      </div>
    `
    )
    .join("");

  const showPolloBlock = pollo.porcionesTotal > 0 || pollo.equivalenteTotal > 0;
  const showExtrasBlock = includedQty > 0 || extrasPaidQty > 0 || desechablesPaidQty > 0;

  const metodoLabel =
    paymentMethod === "card" ? "Tarjeta" : paymentMethod === "cash" ? "Efectivo" : null;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ticket</title>
  <style>
    @page { size: 80mm auto; margin: 6mm; }
    html, body { padding: 0; margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .wrap { width: 80mm; }
    .center { text-align: center; }
    .muted { color: #666; font-size: 12px; }
    .tiny { font-size: 10px; margin-top: 2px; }
    .title { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
    .meta { font-size: 12px; margin: 2px 0; }
    .hr { border-top: 1px dashed #999; margin: 8px 0; }

    .row { display: grid; grid-template-columns: 1fr 22px 60px 70px; gap: 6px; align-items: baseline; }
    .row.header { font-weight: 800; font-size: 12px; }
    .row.item { font-size: 12px; padding: 3px 0; }
    .col.qty, .col.price, .col.sub { text-align: right; }

    .totals { font-size: 13px; }
    .totals .line { display: flex; justify-content: space-between; margin: 3px 0; }
    .totals .big { font-size: 16px; font-weight: 900; }

    .box {
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 8px;
      font-size: 12px;
    }
    .box-title { font-weight: 900; margin-bottom: 6px; }
    .box .line { display: flex; justify-content: space-between; margin: 2px 0; }
    .box .big { font-weight: 900; }

    .notes { font-size: 12px; margin-top: 6px; white-space: pre-wrap; }
    .foot { margin-top: 10px; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center">
      <div class="title">${escapeHtml(businessName)}</div>
      <div class="muted">Ticket</div>
      <div class="meta">${escapeHtml(date)}</div>
      ${saleId ? `<div class="meta muted">Folio: ${escapeHtml(String(saleId))}</div>` : ""}
      ${metodoLabel ? `<div class="meta muted">Método: ${escapeHtml(metodoLabel)}</div>` : ""}
    </div>

    <div class="hr"></div>

    <div class="row header">
      <div class="col name">Producto</div>
      <div class="col qty">#</div>
      <div class="col price">P.U.</div>
      <div class="col sub">Importe</div>
    </div>

    ${rows}

    <div class="hr"></div>

    <div class="totals">
      <div class="line"><span>Total</span><span class="big">${money(total)}</span></div>

      ${
        paymentMethod === "card"
          ? `<div class="line"><span>Pagado con</span><span>${money(total)}</span></div>`
          : `
            <div class="line"><span>Efectivo</span><span>${money(cashReceived)}</span></div>
            <div class="line"><span>Cambio</span><span>${money(change)}</span></div>
          `
      }
    </div>

    ${
      showPolloBlock
        ? `
      <div class="hr"></div>
      <div class="box">
        <div class="box-title">POLLOS (conteo general)</div>
        <div class="line"><span>Total porciones</span><span class="big">${escapeHtml(String(pollo.porcionesTotal))}</span></div>
        <div class="line"><span>Equivalente (pollos)</span><span class="big">${escapeHtml(String(pollo.equivalenteTotal.toFixed(2)))}</span></div>
        <div class="hr" style="margin:6px 0;"></div>
        <div class="line"><span>Enteros</span><span>${escapeHtml(String(pollo.enteros))}</span></div>
        <div class="line"><span>Medios</span><span>${escapeHtml(String(pollo.medios))}</span></div>
        <div class="line"><span>Cuartos</span><span>${escapeHtml(String(pollo.cuartos))}</span></div>
      </div>
    `
        : ""
    }

    ${
      showExtrasBlock
        ? `
      <div class="hr"></div>
      <div class="box">
        <div class="box-title">EXTRAS (conteo general)</div>
        <div class="line"><span>Incluidos (gratis)</span><span class="big">${escapeHtml(String(includedQty))}</span></div>
        <div class="line"><span>Extras pagados</span><span class="big">${escapeHtml(String(extrasPaidQty))}</span></div>
        <div class="line"><span>Desechables pagados</span><span class="big">${escapeHtml(String(desechablesPaidQty))}</span></div>
      </div>
    `
        : ""
    }

    ${notes ? `<div class="hr"></div><div class="notes"><b>Notas:</b>\n${escapeHtml(notes)}</div>` : ""}

    <div class="hr"></div>
    <div class="foot">Gracias por su compra</div>
  </div>

  <script>
    window.onload = () => {
      setTimeout(() => {
        window.print();
        setTimeout(() => window.close(), 250);
      }, 200);
    };
  </script>
</body>
</html>`;
}
