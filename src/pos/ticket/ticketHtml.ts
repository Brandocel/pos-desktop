import { money } from "../utils/money";
import { escapeHtml } from "../utils/escapeHtml";

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
  notes?: string;
  saleId?: string | number;
}) {
  const { businessName, date, items, total, cashReceived, change, notes, saleId } = params;

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
        <div class="col qty">${i.qty}</div>
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
    @page { size: 80mm auto; margin: 6mm; }
    html, body { padding: 0; margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
    .wrap { width: 80mm; }
    .center { text-align: center; }
    .muted { color: #666; font-size: 12px; }
    .title { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
    .meta { font-size: 12px; margin: 2px 0; }
    .hr { border-top: 1px dashed #999; margin: 8px 0; }
    .row { display: grid; grid-template-columns: 1fr 22px 60px 70px; gap: 6px; align-items: baseline; }
    .row.header { font-weight: 800; font-size: 12px; }
    .row.item { font-size: 12px; padding: 3px 0; }
    .row.detail { font-size: 11px; color: #555; padding: 2px 0; }
    .row.detail .name { padding-left: 10px; }
    .row.detail .sub { font-weight: 700; color: #111; }
    .col.qty, .col.price, .col.sub { text-align: right; }
    .totals { font-size: 13px; }
    .totals .line { display: flex; justify-content: space-between; margin: 3px 0; }
    .totals .big { font-size: 16px; font-weight: 900; }
    .notes { font-size: 12px; margin-top: 6px; white-space: pre-wrap; }
    .foot { margin-top: 10px; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="center">
      <div class="title">${escapeHtml(businessName)}</div>
      <div class="muted">Ticket de venta</div>
      <div class="meta">${escapeHtml(date)}</div>
      ${saleId ? `<div class="meta muted">Folio: ${escapeHtml(String(saleId))}</div>` : ""}
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
      <div class="line"><span>Efectivo</span><span>${money(cashReceived)}</span></div>
      <div class="line"><span>Cambio</span><span>${money(change)}</span></div>
    </div>

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
