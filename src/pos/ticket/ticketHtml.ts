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
  items: Array<{
    name: string;
    qty: number;
    price: number;
    subtotal: number;
    details?: Array<{ label: string; amount?: number }>;
  }>;
  total: number;
  cashReceived: number;
  change: number;
  paymentMethod?: "cash" | "card";
  extrasDetailed?: Array<{ name: string; qty: number }>;
  extrasIncludedDetailed?: Array<{ name: string; qty: number }>;
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
    paymentMethod,
    extrasDetailed,
    extrasIncludedDetailed,
    notes,
    saleId,
  } = params;

  const metodoLabel =
    paymentMethod === "card" ? "Tarjeta" : paymentMethod === "cash" ? "Efectivo" : "";

  const pollo = buildPolloSummary(
    items.map((i) => ({ name: i.name, qty: i.qty }))
  );
  const showPolloBlock = safeNum(pollo.porcionesTotal) > 0;

  const includedQty = sumQty(extrasIncludedDetailed ?? []);
  const extrasPaid = (extrasDetailed ?? []).filter((e) => !isDesechableName(e.name));
  const desechablesPaid = (extrasDetailed ?? []).filter((e) => isDesechableName(e.name));
  const extrasPaidQty = sumQty(extrasPaid);
  const desechablesPaidQty = sumQty(desechablesPaid);

  const showExtrasBlock =
    safeNum(includedQty) > 0 ||
    safeNum(extrasPaidQty) > 0 ||
    safeNum(desechablesPaidQty) > 0;

  function formatDetailAmount(v?: number) {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || n === 0) return "";
    const sign = n > 0 ? "+" : "";
    return `${sign}${money(n)}`;
  }

  const rows = items
    .map((i) => {
      const baseRow = `
      <div class="row item">
        <div class="col name">${escapeHtml(i.name)}</div>
        <div class="col qty">${escapeHtml(String(i.qty))}</div>
        <div class="col price">${money(i.price)}</div>
        <div class="col sub">${money(i.subtotal)}</div>
      </div>
    `;

      const detailRows = (i.details || [])
        .map(
          (d) => `
      <div class="row detail">
        <div class="col name">${escapeHtml(d.label)}</div>
        <div class="col qty"></div>
        <div class="col price"></div>
        <div class="col sub">${formatDetailAmount(d.amount)}</div>
      </div>
    `
        )
        .join("");

      return baseRow + detailRows;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ticket</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 4mm;
    }

    html, body {
      padding: 0;
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-size: 15px;
      line-height: 1.35;
    }

    .wrap {
      width: 72mm;
      margin: 0 auto;
      padding: 4px 2px 8px;
    }

    .center {
      text-align: center;
    }

    .muted {
      color: #555;
      font-size: 15px;
    }

    .tiny {
      font-size: 13px;
      margin-top: 2px;
    }

    .title {
      font-size: 24px;
      font-weight: 900;
      margin: 0 0 6px;
      line-height: 1.15;
    }

    .meta {
      font-size: 15px;
      margin: 3px 0;
      line-height: 1.3;
    }

    .hr {
      border-top: 1px dashed #999;
      margin: 10px 0;
    }

    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 34px 68px 78px;
      gap: 6px;
      align-items: start;
    }

    .row.header {
      font-weight: 900;
      font-size: 15px;
      padding-bottom: 2px;
    }

    .row.item {
      font-size: 15px;
      padding: 4px 0;
    }

    .row.detail {
      font-size: 13px;
      color: #444;
      padding: 2px 0 3px;
    }

    .row.detail .name {
      padding-left: 10px;
    }

    .row.detail .sub {
      font-weight: 700;
      color: #111;
    }

    .col {
      min-width: 0;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .col.name {
      line-height: 1.28;
    }

    .col.qty,
    .col.price,
    .col.sub {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .totals {
      font-size: 17px;
    }

    .totals .line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      margin: 5px 0;
    }

    .totals .big {
      font-size: 22px;
      font-weight: 900;
      line-height: 1.15;
    }

    .box {
      border: 1px solid #cfcfcf;
      border-radius: 12px;
      padding: 10px;
      font-size: 15px;
    }

    .box-title {
      font-weight: 900;
      font-size: 16px;
      margin-bottom: 8px;
      line-height: 1.2;
    }

    .box .line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      margin: 4px 0;
      font-size: 15px;
    }

    .box .big {
      font-weight: 900;
      font-size: 17px;
    }

    .notes {
      font-size: 15px;
      margin-top: 6px;
      white-space: pre-wrap;
      line-height: 1.35;
    }

    .foot {
      margin-top: 12px;
      font-size: 15px;
      text-align: center;
      line-height: 1.3;
    }

    .strong {
      font-weight: 900;
    }
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
      <div class="line">
        <span class="strong">Total</span>
        <span class="big">${money(total)}</span>
      </div>

      ${
        paymentMethod === "card"
          ? `
            <div class="line">
              <span>Pagado con</span>
              <span>${money(total)}</span>
            </div>
          `
          : `
            <div class="line">
              <span>Efectivo</span>
              <span>${money(cashReceived)}</span>
            </div>
            <div class="line">
              <span>Cambio</span>
              <span>${money(change)}</span>
            </div>
          `
      }
    </div>

    ${
      showPolloBlock
        ? `
      <div class="hr"></div>
      <div class="box">
        <div class="box-title">POLLOS (conteo general)</div>
        <div class="line">
          <span>Total porciones</span>
          <span class="big">${escapeHtml(String(pollo.porcionesTotal))}</span>
        </div>
        <div class="line">
          <span>Equivalente (pollos)</span>
          <span class="big">${escapeHtml(String(pollo.equivalenteTotal.toFixed(2)))}</span>
        </div>
        <div class="hr" style="margin:7px 0;"></div>
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
        <div class="line">
          <span>Incluidos (gratis)</span>
          <span class="big">${escapeHtml(String(includedQty))}</span>
        </div>
        <div class="line">
          <span>Extras pagados</span>
          <span class="big">${escapeHtml(String(extrasPaidQty))}</span>
        </div>
        <div class="line">
          <span>Desechables pagados</span>
          <span class="big">${escapeHtml(String(desechablesPaidQty))}</span>
        </div>
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