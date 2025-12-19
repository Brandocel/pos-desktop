import { useEffect, useMemo, useState } from "react";
import type { CartItem, Category, Product } from "../pos/types";
import { AdminFlavorPanel } from "./AdminFlavorPanel";
import { AdminProductPanel } from "./AdminProductPanel";

/** SOLO categorías principales (estas SÍ cambian la lista principal) */
const MAIN_CATEGORIES: Category[] = ["Pollos", "Especialidades", "Paquetes", "Miércoles"];

type View = "sales" | "admin-flavors" | "admin-products" | "cut";

function money(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

type FlavorModalState = { open: boolean; product?: Product };
type DesModalState = { open: boolean };

/** ✅ Escape HTML (sin replaceAll, compatible con TS target viejito) */
function escapeHtml(str: string) {
  return str
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&#039;");
}

/** ✅ Genera HTML de ticket (80mm) */
function buildTicketHTML(params: {
  businessName: string;
  date: string;
  items: Array<{ name: string; qty: number; price: number; subtotal: number }>;
  total: number;
  cashReceived: number;
  change: number;
  notes?: string;
  saleId?: string | number;
}) {
  const { businessName, date, items, total, cashReceived, change, notes, saleId } = params;

  const rows = items
    .map(
      (i) => `
      <div class="row item">
        <div class="col name">${escapeHtml(i.name)}</div>
        <div class="col qty">${i.qty}</div>
        <div class="col price">${money(i.price)}</div>
        <div class="col sub">${money(i.subtotal)}</div>
      </div>
    `
    )
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

    ${
      notes
        ? `<div class="hr"></div><div class="notes"><b>Notas:</b>\n${escapeHtml(notes)}</div>`
        : ""
    }

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

/** ✅ Abre ventana y imprime */
function printTicket(params: Parameters<typeof buildTicketHTML>[0]) {
  const html = buildTicketHTML(params);
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) {
    alert("No se pudo abrir la ventana de impresión. Revisa permisos/setting de Electron.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function SalesScreen() {
  const [view, setView] = useState<View>("sales");
  const [category, setCategory] = useState<Category>("Pollos");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");

  // Datos de BD
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [dbFlavors, setDbFlavors] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savingSale, setSavingSale] = useState(false);

  // Corte
  const getTodayCancun = () => {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Cancun" }));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  };

  const [cutFrom, setCutFrom] = useState<string>(getTodayCancun());
  const [cutTo, setCutTo] = useState<string>(getTodayCancun());
  const [cutUseRange, setCutUseRange] = useState<boolean>(false);
  const [cutLoading, setCutLoading] = useState(false);
  const [cutData, setCutData] = useState<
    | null
    | {
        range: { from: string; to: string };
        totals: { grand: number; categories: Array<{ category: string; qty: number; total: number }> };
        products: Array<{ name: string; category: string; qty: number; subtotal: number }>;
        tickets: Array<{
          saleId: string;
          createdAt: string;
          total: number;
          notes?: string;
          items: Array<{ name: string; qty: number; price: number; subtotal: number; category: string; flavor?: string }>;
        }>;
      }
  >(null);

  // Pago
  const [cashReceived, setCashReceived] = useState<number>(0);

  // Modales
  const [flavorModal, setFlavorModal] = useState<FlavorModalState>({ open: false });
  const [pickedFlavor, setPickedFlavor] = useState<string>("");
  
    const isAdminView = view === "admin-flavors" || view === "admin-products";

  const [desModal, setDesModal] = useState<DesModalState>({ open: false });
  const [desUso, setDesUso] = useState("");
  const [desPrecio, setDesPrecio] = useState<number>(0);

  // UX: resaltar producto tocado (flash)
  const [lastTappedProductId, setLastTappedProductId] = useState<string | null>(null);
  // UX: resaltar item del ticket seleccionado
  const [selectedTicketKey, setSelectedTicketKey] = useState<string | null>(null);

  // Cargar productos y sabores de la BD
  useEffect(() => {
    async function loadData() {
      try {
        const [productsRes, flavorsRes] = await Promise.all([
          window.api.products.salesList() as { ok: boolean; products?: any[] },
          window.api.getFlavors() as { ok: boolean; rows?: any[] },
        ]);

        console.log("Respuesta productos:", productsRes);
        console.log("Respuesta sabores:", flavorsRes);

        if (productsRes.ok && productsRes.products) {
          const mapped: Product[] = productsRes.products.map((p) => ({
            id: String(p.id),
            name: p.name,
            category: p.category as Category,
            price: p.price,
            requiresFlavor: p.requires_flavor === 1,
          }));
          console.log("Productos mapeados:", mapped);
          setDbProducts(mapped);
        }

        if (flavorsRes?.ok && flavorsRes.rows) {
          const names = flavorsRes.rows.map((f: any) => f.name);
          console.log("Sabores:", names);
          setDbFlavors(names);
          if (names.length > 0) setPickedFlavor(names[0]);
        }
      } catch (err) {
        console.error("Error cargando datos:", err);
      } finally {
        setLoadingData(false);
      }
    }
    loadData();
  }, []);

  /** 🔎 Búsqueda global: si hay query, busca en TODO el catálogo */
  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dbProducts;
    return dbProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, dbProducts]);

  /** ✅ Productos de la categoría principal */
  const productsMain = useMemo(() => {
    return filteredCatalog.filter((p) => p.category === category);
  }, [filteredCatalog, category]);

  /** ✅ Extras siempre visibles */
  const productsExtras = useMemo(() => {
    return filteredCatalog.filter((p) => p.category === "Extras");
  }, [filteredCatalog]);

  /** ✅ Desechables (si tienes items en catálogo) */
  const productsDesechables = useMemo(() => {
    return filteredCatalog.filter((p) => p.category === "Desechables");
  }, [filteredCatalog]);

  const total = useMemo(() => cart.reduce((a, b) => a + b.subtotal, 0), [cart]);
  const change = useMemo(() => Math.max(0, cashReceived - total), [cashReceived, total]);

  function upsertItem(newItem: CartItem) {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.key === newItem.key);
      if (idx >= 0) {
        const copy = [...prev];
        const merged = { ...copy[idx] };
        merged.qty += newItem.qty;
        merged.subtotal = merged.qty * merged.price;
        copy[idx] = merged;
        return copy;
      }
      return [newItem, ...prev];
    });
  }

  function addProduct(product: Product) {
    setLastTappedProductId(product.id);
    window.setTimeout(() => setLastTappedProductId(null), 260);

    // Desechables: captura libre (si lo tocan desde lista)
    if (product.category === "Desechables") {
      setDesUso(product.name || "");
      setDesPrecio(product.price || 0);
      setDesModal({ open: true });
      return;
    }

    // Requiere sabor
    if (product.requiresFlavor) {
      if (dbFlavors.length > 0) setPickedFlavor(dbFlavors[0]);
      setFlavorModal({ open: true, product });
      return;
    }

    upsertItem({
      key: product.id,
      name: product.name,
      baseName: product.name,
      qty: 1,
      price: product.price,
      subtotal: product.price,
      meta: { category: product.category },
    });
  }

  function confirmFlavor() {
    const p = flavorModal.product;
    if (!p) return;

    const isPromo = !!p.isPromoPack;
    const suffixPromo = isPromo ? " (PROMO)" : "";
    const display = `${p.name} - ${pickedFlavor}${suffixPromo}`;
    const key = `${p.id}__${pickedFlavor}__${isPromo ? "promo" : "normal"}`;

    upsertItem({
      key,
      name: display,
      baseName: p.name,
      qty: 1,
      price: p.price,
      subtotal: p.price,
      meta: { flavor: pickedFlavor, promo: isPromo, category: p.category },
    });

    setFlavorModal({ open: false });
  }

  function confirmDesechables() {
    const uso = desUso.trim() || "Desechables";
    const precio = Number(desPrecio) || 0;

    const display = `Desechables - ${uso}`;
    const key = `des__${uso}__${precio}`;

    upsertItem({
      key,
      name: display,
      baseName: "Desechables",
      qty: 1,
      price: precio,
      subtotal: precio,
      meta: { category: "Desechables" },
    });

    setDesModal({ open: false });
  }

  function inc(key: string) {
    setCart((prev) =>
      prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1, subtotal: (i.qty + 1) * i.price } : i))
    );
  }

  function dec(key: string) {
    setCart((prev) =>
      prev.map((i) =>
        i.key === key
          ? { ...i, qty: Math.max(1, i.qty - 1), subtotal: Math.max(1, i.qty - 1) * i.price }
          : i
      )
    );
  }

  function remove(key: string) {
    setCart((prev) => prev.filter((i) => i.key !== key));
    setSelectedTicketKey((k) => (k === key ? null : k));
  }

  function clearSale() {
    setCart([]);
    setCashReceived(0);
    setNotes("");
    setQuery("");
    setSelectedTicketKey(null);
  }

  async function loadCut() {
    setCutLoading(true);
    try {
      const res = await window.api.salesSummary({ from: cutFrom, to: cutUseRange ? cutTo : cutFrom });
      console.log("salesSummary", res);
      if (!res.ok || !res.data) {
        alert(res.message || "Error al cargar corte");
        return;
      }
      setCutData(res.data);
    } catch (err: any) {
      console.error(err);
      alert("No se pudo cargar el corte");
    } finally {
      setCutLoading(false);
    }
  }

  function printCut() {
    if (!cutData) return;
    const { range, totals, products, tickets } = cutData;
    const rowsProducts = products
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.category)}</td><td>${p.qty}</td><td>${money(p.subtotal)}</td></tr>`
      )
      .join("");
    const rowsCats = totals.categories
      .map((c) => `<tr><td>${escapeHtml(c.category)}</td><td>${c.qty}</td><td>${money(c.total)}</td></tr>`)
      .join("");

    const html = `<!doctype html>
    <html><head><meta charset="utf-8"><title>Corte</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;padding:16px;color:#111}
      h1,h2{margin:0 0 8px 0}
      table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12px}
      th,td{border:1px solid #ddd;padding:6px;text-align:left}
      th{background:#f3f4f6}
      .muted{color:#555;font-size:12px}
    </style></head><body>
      <h1>Corte de ventas</h1>
      <div class="muted">Del ${escapeHtml(range.from)} al ${escapeHtml(range.to)}</div>
      <h2>Total: ${money(totals.grand)}</h2>

      <h3>Totales por categoría</h3>
      <table><thead><tr><th>Categoría</th><th>Cant.</th><th>Total</th></tr></thead><tbody>${rowsCats}</tbody></table>

      <h3>Productos</h3>
      <table><thead><tr><th>Producto</th><th>Categoría</th><th>Cant.</th><th>Total</th></tr></thead><tbody>${rowsProducts}</tbody></table>

      <h3>Tickets</h3>
      ${tickets
        .map(
          (t) => `
          <div style="margin:12px 0; padding:8px; border:1px solid #ddd; border-radius:8px;">
            <div><strong>Folio:</strong> ${escapeHtml(t.saleId)}</div>
            <div><strong>Fecha:</strong> ${escapeHtml(t.createdAt)}</div>
            <div><strong>Total:</strong> ${money(t.total)}</div>
            ${t.notes ? `<div><strong>Notas:</strong> ${escapeHtml(t.notes)}</div>` : ""}
            <table><thead><tr><th>Producto</th><th>Categoría</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>
              ${t.items
                .map(
                  (i) =>
                    `<tr><td>${escapeHtml(i.name)}${i.flavor ? " (" + escapeHtml(i.flavor) + ")" : ""}</td><td>${escapeHtml(i.category)}</td><td>${i.qty}</td><td>${money(i.price)}</td><td>${money(i.subtotal)}</td></tr>`
                )
                .join("")}
            </tbody></table>
          </div>`
        )
        .join("")}
    </body></html>`;

    const w = window.open("", "_blank", "width=920,height=720");
    if (!w) {
      alert("No se pudo abrir la ventana de impresión");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.print();
  }

  async function chargeAndSave() {
    if (cart.length === 0) return;

    setSavingSale(true);
    try {
      const saleDate = new Date().toLocaleString("es-MX");

      const payload = {
        items: cart.map((i) => ({
          name: i.name,
          qty: i.qty,
          price: i.price,
          category: i.meta?.category,
          flavor: i.meta?.flavor,
        })),
        notes: notes.trim() || undefined,
        cashReceived,
        total,
        change,
      };

      const res = await window.api.createSale(payload);

      if (!res.ok) {
        alert(res.message || "Error guardando venta");
        return;
      }

      // ✅ Imprime ticket SOLO si guardó
      printTicket({
        businessName: "Pollo Pirata POS",
        date: saleDate,
        saleId: (res as any)?.data?.id ?? (res as any)?.data?.folio ?? (res as any)?.saleId,
        items: cart.map((i) => ({ name: i.name, qty: i.qty, price: i.price, subtotal: i.subtotal })),
        total,
        cashReceived,
        change,
        notes: notes.trim() || undefined,
      });

      clearSale();
    } catch (err: any) {
      console.error(err);
      alert("No se pudo guardar la venta");
    } finally {
      setSavingSale(false);
    }
  }

  // Efectivo rápido
  const quickCash = useMemo(() => {
    const t = total;
    if (t <= 0) return [50, 100, 200, 500];
    const options = new Set<number>([
      Math.ceil(t / 10) * 10,
      Math.ceil(t / 50) * 50,
      Math.ceil(t / 100) * 100,
      Math.ceil(t / 200) * 200,
      Math.ceil(t / 500) * 500,
    ]);
    return Array.from(options).filter((n) => n > 0).slice(0, 5);
  }, [total]);

  useEffect(() => {
    setSelectedTicketKey(null);
  }, [category]);

  useEffect(() => {
    if (view === "cut" && !cutData) {
      loadCut();
    }
  }, [view]);

  // Paleta blanco/gris (sin negro)
  const ui = {
    page: "bg-zinc-50 text-zinc-800",
    panel: "rounded-2xl border border-zinc-200 bg-white shadow-[0_10px_30px_rgba(0,0,0,.06)]",
    header: "sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur",
    input:
      "w-full rounded-xl bg-white border border-zinc-300 px-4 py-3 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200",

    // Tabs
    btn: "relative rounded-2xl px-4 py-3 text-sm font-extrabold border transition select-none",
    btnIdle: "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400",
    btnActive:
      "bg-zinc-200 border-zinc-300 text-zinc-900 ring-2 ring-zinc-200 shadow-[0_10px_25px_rgba(0,0,0,.06)]",

    smallBtn:
      "text-xs font-extrabold px-3 py-2 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 hover:border-zinc-400 transition",
    ghostBtn: "text-xs font-extrabold text-zinc-500 hover:text-zinc-700",

    chip:
      "px-2 py-1 rounded-full border border-zinc-300 bg-zinc-50 text-zinc-700 font-semibold",
    chipPromo:
      "px-2 py-1 rounded-full border border-zinc-300 bg-zinc-200 text-zinc-800 font-extrabold",

    card:
      "relative text-left rounded-2xl border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 transition p-4 flex flex-col gap-2 active:scale-[0.99] active:bg-zinc-100",
    ticketItem:
      "relative rounded-2xl border border-zinc-200 bg-white p-3 transition hover:bg-zinc-50",

    qtyBtn:
      "h-9 w-9 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 hover:border-zinc-400 transition font-extrabold text-zinc-700",

    footerBox: "rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3",

    primary:
      "w-full rounded-2xl px-4 py-4 font-extrabold text-sm tracking-tight bg-zinc-200 text-zinc-900 hover:bg-zinc-300 transition disabled:opacity-40 disabled:cursor-not-allowed",
    primaryStrong:
      "px-3 py-2 rounded-xl text-xs font-extrabold border border-zinc-300 bg-zinc-200 text-zinc-900 hover:bg-zinc-300 transition disabled:opacity-40",

    modalOverlay:
      "fixed inset-0 z-50 bg-zinc-900/20 backdrop-blur-sm flex items-center justify-center p-4",
    modal:
      "w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_25px_80px_rgba(0,0,0,.18)]",
  };

  return (
    <>
      {isAdminView && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="fixed top-4 right-4 z-50 flex gap-2 items-center">
            <div className="rounded-lg bg-white shadow-lg flex overflow-hidden text-sm font-semibold">
              <button
                onClick={() => setView("admin-flavors")}
                className={`px-3 py-2 ${view === "admin-flavors" ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"}`}
              >
                Sabores
              </button>
              <button
                onClick={() => setView("admin-products")}
                className={`px-3 py-2 ${view === "admin-products" ? "bg-zinc-900 text-white" : "text-zinc-800 hover:bg-zinc-100"}`}
              >
                Productos
              </button>
            </div>
            <button
              onClick={() => setView("sales")}
              className="px-4 py-2 bg-white text-gray-900 rounded-lg shadow-lg hover:bg-gray-100 font-semibold"
            >
              ← Volver a Ventas
            </button>
          </div>

          <div className="pt-16">
            {view === "admin-flavors" ? <AdminFlavorPanel /> : <AdminProductPanel />}
          </div>
        </div>
      )}

      {view === "cut" && (
        <div className={`min-h-screen ${ui.page} font-sans`}> 
          <header className={ui.header}>
            <div className="mx-auto max-w-[1200px] px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-extrabold text-zinc-900">Corte de ventas</div>
                <div className="text-xs text-zinc-500">Selecciona rango y consulta resumen</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setView("sales")}
                  className="px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm font-semibold hover:bg-zinc-50"
                >
                  ← Volver a ventas
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1200px] px-5 py-5 space-y-4">
            <div className={ui.panel}>
              <div className="px-4 py-3 border-b border-zinc-200 flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-500">Desde</label>
                  <input
                    type="date"
                    value={cutFrom}
                    onChange={(e) => setCutFrom(e.target.value)}
                    className={ui.input}
                  />
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
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={cutUseRange}
                      onChange={(e) => setCutUseRange(e.target.checked)}
                    />
                    Usar rango (si no, solo un día)
                  </label>
                </div>
                <div className="flex gap-2 items-end">
                  <button onClick={loadCut} className={ui.primaryStrong} disabled={cutLoading}>
                    {cutLoading ? "Cargando…" : "Actualizar"}
                  </button>
                  <button onClick={printCut} className={ui.smallBtn} disabled={!cutData}>
                    Imprimir corte
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-4">
                {!cutData ? (
                  <div className="text-sm text-zinc-500">Selecciona rango y pulsa Actualizar.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className={ui.footerBox}>
                        <div className="text-xs text-zinc-500">Total general</div>
                        <div className="text-xl font-extrabold text-zinc-900">{money(cutData.totals.grand)}</div>
                        <div className="text-[11px] text-zinc-500">{cutData.range.from} a {cutData.range.to}</div>
                      </div>
                      <div className={ui.footerBox}>
                        <div className="text-xs text-zinc-500">Categorías</div>
                        <div className="text-sm font-semibold text-zinc-800">{cutData.totals.categories.length}</div>
                        <div className="text-[11px] text-zinc-500">Agrupadas por catálogo</div>
                      </div>
                      <div className={ui.footerBox}>
                        <div className="text-xs text-zinc-500">Tickets</div>
                        <div className="text-sm font-semibold text-zinc-800">{cutData.tickets.length}</div>
                        <div className="text-[11px] text-zinc-500">Ventas en el rango</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-zinc-200 bg-white">
                        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                          <div className="text-sm font-extrabold text-zinc-900">Totales por categoría</div>
                        </div>
                        <div className="p-3 space-y-2 max-h-[320px] overflow-auto">
                          {cutData.totals.categories.map((c) => (
                            <div key={c.category} className="flex items-center justify-between text-sm">
                              <div className="font-semibold text-zinc-800">{c.category}</div>
                              <div className="text-right">
                                <div className="font-extrabold text-zinc-900">{money(c.total)}</div>
                                <div className="text-[11px] text-zinc-500">{c.qty} uds</div>
                              </div>
                            </div>
                          ))}
                          {cutData.totals.categories.length === 0 && (
                            <div className="text-xs text-zinc-500">Sin ventas en este rango.</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-zinc-200 bg-white">
                        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                          <div className="text-sm font-extrabold text-zinc-900">Productos más vendidos</div>
                        </div>
                        <div className="p-3 space-y-2 max-h-[320px] overflow-auto">
                          {cutData.products.map((p) => (
                            <div key={p.name} className="flex items-center justify-between text-sm">
                              <div>
                                <div className="font-semibold text-zinc-800">{p.name}</div>
                                <div className="text-[11px] text-zinc-500">{p.category}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-extrabold text-zinc-900">{money(p.subtotal)}</div>
                                <div className="text-[11px] text-zinc-500">{p.qty} uds</div>
                              </div>
                            </div>
                          ))}
                          {cutData.products.length === 0 && (
                            <div className="text-xs text-zinc-500">No hay productos en el rango.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white">
                      <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                        <div className="text-sm font-extrabold text-zinc-900">Tickets</div>
                        <div className="text-xs text-zinc-500">{cutData.tickets.length} resultados</div>
                      </div>
                      <div className="p-4 space-y-3 max-h-[420px] overflow-auto">
                        {cutData.tickets.map((t) => (
                          <div key={t.saleId} className="rounded-xl border border-zinc-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-extrabold text-zinc-900">Folio: {t.saleId}</div>
                                <div className="text-[11px] text-zinc-500">{new Date(t.createdAt).toLocaleString("es-MX")}</div>
                                {t.notes ? <div className="text-[11px] text-zinc-500 mt-1">Notas: {t.notes}</div> : null}
                              </div>
                              <div className="text-right text-sm font-extrabold text-zinc-900">{money(t.total)}</div>
                            </div>

                            <div className="mt-2 space-y-1 text-xs">
                              {t.items.map((i, idx) => (
                                <div
                                  key={`${t.saleId}-${idx}`}
                                  className="flex items-center justify-between border border-zinc-200 rounded-lg px-2 py-1"
                                >
                                  <div className="min-w-0">
                                    <div className="font-semibold text-zinc-800 truncate">{i.name}</div>
                                    <div className="text-[11px] text-zinc-500">{i.category}{i.flavor ? ` • ${i.flavor}` : ""}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-extrabold text-zinc-900">{money(i.subtotal)}</div>
                                    <div className="text-[11px] text-zinc-500">{i.qty} x {money(i.price)}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {cutData.tickets.length === 0 && (
                          <div className="text-xs text-zinc-500">No hay tickets en el rango.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      )}

      {view === "sales" && (
        <div className={`min-h-screen ${ui.page} font-sans`}>
      {/* TOP BAR */}
      <header className={ui.header}>
        <div className="mx-auto max-w-[1400px] px-5 py-4 flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-[280px]">
            <div className="h-10 w-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-extrabold tracking-tight text-zinc-900">
                Pollo Pirata POS
              </div>
              <div className="text-xs text-zinc-500">Captura rápida de ventas • sin inventario</div>
            </div>
          </div>

          <div className="flex-1">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto… (busca en todo)"
                className={ui.input}
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                {category}
              </div>
            </div>
          </div>

          <div className="min-w-[220px] text-right space-y-2">
            <div>
              <div className="text-xs text-zinc-500">Fecha y hora</div>
              <div className="text-sm font-semibold text-zinc-700">
                {new Date().toLocaleString("es-MX")}
              </div>
            </div>
            <button
              onClick={() => setView("admin-flavors")}
              className="block w-full px-3 py-2 text-xs font-semibold bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition"
            >
              ⚙️ Administración
            </button>
            <button
              onClick={() => setView("cut")}
              className="block w-full px-3 py-2 text-xs font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition"
            >
              📄 Corte
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <main className="mx-auto max-w-[1400px] px-5 py-5 grid grid-cols-1 lg:grid-cols-[1.35fr_.85fr] gap-5">
        {/* LEFT */}
        <section className="space-y-4">
          {/* Tabs principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MAIN_CATEGORIES.map((c) => {
              const active = c === category;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={[ui.btn, active ? ui.btnActive : ui.btnIdle].join(" ")}
                >
                  <span
                    className={[
                      "absolute left-2 top-1/2 -translate-y-1/2 h-6 w-1.5 rounded-full transition",
                      active ? "bg-zinc-700" : "bg-transparent",
                    ].join(" ")}
                  />
                  {c}
                </button>
              );
            })}
          </div>

          {/* Productos categoría principal */}
          <div className={ui.panel}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <div>
                <div className="text-sm font-extrabold text-zinc-900">Productos • {category}</div>
                <div className="text-xs text-zinc-500">
                  Toca para agregar • {productsMain.length} resultados
                </div>
              </div>

              <button onClick={() => setQuery("")} className={ui.smallBtn}>
                Limpiar búsqueda
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[58vh] overflow-auto">
              {productsMain.map((p) => {
                const flash = lastTappedProductId === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className={[ui.card, flash ? "ring-2 ring-zinc-400 bg-zinc-50" : ""].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-extrabold leading-snug text-zinc-900">{p.name}</div>
                      <div className="text-sm font-extrabold text-zinc-800">
                        {p.price ? money(p.price) : "—"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-[11px]">
                      {p.requiresFlavor ? <span className={ui.chip}>Requiere sabor</span> : null}
                      {p.isPromoPack ? <span className={ui.chipPromo}>PROMO</span> : null}
                      {p.description ? (
                        <span className="text-zinc-500">{p.description}</span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>

                    <div className="mt-1 text-[11px] text-zinc-500">
                      Categoría: <span className="text-zinc-700 font-semibold">{p.category}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ✅ HASTA ABAJO: Extras y Desechables siempre */}
          <div className={ui.panel}>
            <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <div className="text-sm font-extrabold text-zinc-900">Extras y Desechables</div>
                <div className="text-xs text-zinc-500">
                  Se agregan al ticket sin cambiar categoría
                </div>
              </div>

              <button
                onClick={() => {
                  setDesUso("");
                  setDesPrecio(0);
                  setDesModal({ open: true });
                }}
                className={ui.primaryStrong}
              >
                + Desechables (captura)
              </button>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Extras */}
              <div className="rounded-2xl border border-zinc-200 bg-white">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div className="text-sm font-extrabold text-zinc-900">Extras</div>
                  <div className="text-xs text-zinc-500">{productsExtras.length} items</div>
                </div>
                <div className="p-3 grid grid-cols-1 gap-2 max-h-[220px] overflow-auto">
                  {productsExtras.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="text-left rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 px-3 py-2 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-extrabold text-sm text-zinc-900">{p.name}</div>
                        <div className="font-extrabold text-sm text-zinc-800">
                          {p.price ? money(p.price) : "—"}
                        </div>
                      </div>
                    </button>
                  ))}
                  {productsExtras.length === 0 ? (
                    <div className="text-xs text-zinc-500 px-1 py-2">No hay extras en el catálogo.</div>
                  ) : null}
                </div>
              </div>

              {/* Desechables */}
              <div className="rounded-2xl border border-zinc-200 bg-white">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div className="text-sm font-extrabold text-zinc-900">Desechables</div>
                  <div className="text-xs text-zinc-500">{productsDesechables.length} items</div>
                </div>
                <div className="p-3 grid grid-cols-1 gap-2 max-h-[220px] overflow-auto">
                  {productsDesechables.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="text-left rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 px-3 py-2 transition"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-extrabold text-sm text-zinc-900">{p.name}</div>
                        <div className="font-extrabold text-sm text-zinc-800">
                          {p.price ? money(p.price) : "—"}
                        </div>
                      </div>
                    </button>
                  ))}
                  {productsDesechables.length === 0 ? (
                    <div className="text-xs text-zinc-500 px-1 py-2">
                      Usa “+ Desechables (captura)” para capturar libre.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT */}
        <aside className={`${ui.panel} overflow-hidden flex flex-col`}>
          {/* Ticket header */}
          <div className="px-4 py-4 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold tracking-tight text-zinc-900">Ticket</div>
              <div className="text-xs text-zinc-500">Productos seleccionados</div>
            </div>

            <button
              onClick={clearSale}
              disabled={cart.length === 0}
              className={`${ui.smallBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Vaciar
            </button>
          </div>

          {/* Ticket body */}
          <div className="p-4 flex-1 overflow-auto">
            {cart.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
                <div className="text-base font-extrabold text-zinc-900">Sin productos</div>
                <div className="text-sm text-zinc-500 mt-1">
                  Selecciona un producto para agregarlo al ticket
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const selected = selectedTicketKey === item.key;
                  return (
                    <div
                      key={item.key}
                      onClick={() => setSelectedTicketKey(item.key)}
                      className={[
                        ui.ticketItem,
                        selected ? "ring-2 ring-zinc-300 bg-zinc-50 border-zinc-300" : "",
                      ].join(" ")}
                      role="button"
                      tabIndex={0}
                    >
                      <span
                        className={[
                          "absolute left-2 top-1/2 -translate-y-1/2 h-6 w-1.5 rounded-full transition",
                          selected ? "bg-zinc-700" : "bg-transparent",
                        ].join(" ")}
                      />

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-extrabold text-sm truncate text-zinc-900">
                            {item.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                            {item.meta?.flavor ? (
                              <span className={ui.chip}>
                                Sabor: <b>{item.meta.flavor}</b>
                              </span>
                            ) : null}
                            {item.meta?.promo ? <span className={ui.chipPromo}>PROMO</span> : null}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-extrabold text-zinc-900">
                            {money(item.subtotal)}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(item.key);
                            }}
                            className={ui.ghostBtn}
                          >
                            Quitar
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              dec(item.key);
                            }}
                            className={ui.qtyBtn}
                          >
                            −
                          </button>
                          <div className="min-w-[38px] text-center font-extrabold text-zinc-800">
                            {item.qty}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              inc(item.key);
                            }}
                            className={ui.qtyBtn}
                          >
                            +
                          </button>
                        </div>

                        <div className="text-xs text-zinc-500">
                          Unitario:{" "}
                          <span className="font-extrabold text-zinc-800">{money(item.price)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ticket footer */}
          <div className="p-4 border-t border-zinc-200 space-y-4 bg-white">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-zinc-600">Total</div>
              <div className="text-xl font-extrabold tracking-tight text-zinc-900">
                {money(total)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Efectivo recibido</div>
                <input
                  type="number"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(Number(e.target.value))}
                  placeholder="0"
                  className={ui.input}
                />

                <div className="mt-2 flex flex-wrap gap-2">
                  {quickCash.map((v) => (
                    <button key={v} onClick={() => setCashReceived(v)} className={ui.primaryStrong}>
                      {money(v)}
                    </button>
                  ))}
                  <button
                    onClick={() => setCashReceived(total)}
                    className={ui.primaryStrong}
                    disabled={total <= 0}
                  >
                    Exacto
                  </button>
                </div>
              </div>

              <div className={`${ui.footerBox} flex items-center justify-between`}>
                <div className="text-xs text-zinc-500">Cambio</div>
                <div className="text-sm font-extrabold text-zinc-800">{money(change)}</div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">Notas (opcional)</div>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ej: sin cebolla, cliente frecuente…"
                  className={ui.input}
                />
              </div>
            </div>

            <button
              disabled={cart.length === 0 || savingSale}
              onClick={chargeAndSave}
              className={ui.primary}
            >
              {savingSale ? "Guardando…" : "Cobrar & Guardar (imprime ticket)"}
            </button>
          </div>
        </aside>
      </main>

      {/* MODAL SABOR */}
      {flavorModal.open && (
        <div className={ui.modalOverlay} onMouseDown={() => setFlavorModal({ open: false })}>
          <div className={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-base font-extrabold text-zinc-900">Selecciona sabor</div>
            <div className="text-sm text-zinc-500 mt-1">
              {flavorModal.product?.name} • Elige el sabor
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {dbFlavors.map((f) => {
                const active = f === pickedFlavor;
                return (
                  <button
                    key={f}
                    onClick={() => setPickedFlavor(f)}
                    className={[
                      "px-3 py-2 rounded-full text-xs font-extrabold border transition",
                      active
                        ? "border-zinc-400 bg-zinc-200 text-zinc-900 ring-2 ring-zinc-200"
                        : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 hover:border-zinc-400",
                    ].join(" ")}
                  >
                    {f}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setFlavorModal({ open: false })} className={ui.smallBtn}>
                Cancelar
              </button>
              <button onClick={confirmFlavor} className={ui.primaryStrong}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DESECHABLES */}
      {desModal.open && (
        <div className={ui.modalOverlay} onMouseDown={() => setDesModal({ open: false })}>
          <div className={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className="text-base font-extrabold text-zinc-900">Desechables (captura libre)</div>
            <div className="text-sm text-zinc-500 mt-1">Captura el uso y el precio.</div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Uso</div>
                <input
                  value={desUso}
                  onChange={(e) => setDesUso(e.target.value)}
                  placeholder="Platos / Vasos / Bolsas…"
                  className={ui.input}
                />
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">Precio</div>
                <input
                  type="number"
                  value={desPrecio}
                  onChange={(e) => setDesPrecio(Number(e.target.value))}
                  placeholder="0"
                  className={ui.input}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDesModal({ open: false })} className={ui.smallBtn}>
                Cancelar
              </button>
              <button onClick={confirmDesechables} className={ui.primaryStrong}>
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )}
    </>
  );
}
