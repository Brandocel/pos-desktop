import { useEffect, useMemo, useState } from "react";
import type { CartItem, Category, Product } from "../pos/types";
import { MAIN_CATEGORIES } from "../pos/categories";
import { money } from "../pos/utils/money";
import { useCart } from "../pos/hooks/useCart";
import { useQuickCash } from "../pos/hooks/useQuickCash";
import { useUi } from "../pos/hooks/useUi";
import { printTicket } from "../pos/ticket/printTicket";

// ✅ Modales
import { FlavorModal } from "../pos/modals/FlavorModal";
import { DesechablesModal } from "../pos/modals/DesechablesModal";

// ✅ Admin panels
import { AdminFlavorPanel } from "../screens/AdminFlavorPanel";
import { AdminProductPanel } from "../screens/AdminProductPanel";
import { SidePanel } from "../pos/components/SidePanel";

// ✅ Corte
import { CutScreen } from "../screens/CutScreen";

// ✅ Icons (librería)
import {
  Settings,
  FileText,
  Search,
  Trash2,
  Minus,
  Plus,
  X,
} from "lucide-react";

type View = "sales" | "admin-flavors" | "admin-products" | "cut";
type FlavorModalState = { open: boolean; product?: Product };

// ✅ Helper para unir categorías en UI
function normalizeMainCategory(cat: Category): Category[] {
  if (cat === "Paquetes") return ["Paquetes", "Miércoles"];
  return [cat];
}

/** ✅ Normaliza strings que puedan venir “sucios” desde UI/BD */
function normalizeCategoryValue(value: string): Category {
  const v = (value ?? "").trim();

  if (v === "Miercoles") return "Miércoles";
  if (v === "Especialidad") return "Especialidades";
  if (v === "Paquete") return "Paquetes";

  return v as Category;
}

/** ✅ Para el label del buscador */
function getCategoryLabel(cat: Category) {
  const c = normalizeCategoryValue(cat);
  if (c === "Paquetes") return "Paquetes";
  return c;
}

export function SalesScreen() {
  const ui = useUi();

  const [view, setView] = useState<View>("sales");

  const isAdminView = view === "admin-flavors" || view === "admin-products";
  const isCutView = view === "cut";

  // ✅ overlay abierto (admin o corte)
  const isOverlayOpen = isAdminView || isCutView;

  // ✅ mantener ventas visible detrás cuando hay overlay
  const showSalesUI = view === "sales" || isOverlayOpen;

  // catálogo
  const [category, setCategory] = useState<Category>(() => normalizeCategoryValue("Pollos"));
  const [query, setQuery] = useState("");
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [dbFlavors, setDbFlavors] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // carrito
  const { cart, total, upsertItem, inc, dec, remove, clear } = useCart();

  // pago
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [cashReceived, setCashReceived] = useState(0);
  const change = useMemo(() => Math.max(0, cashReceived - total), [cashReceived, total]);
  const quickCash = useQuickCash(total);

  // UX
  const [lastTappedProductId, setLastTappedProductId] = useState<string | null>(null);
  const [selectedTicketKey, setSelectedTicketKey] = useState<string | null>(null);

  // Modales
  const [flavorModal, setFlavorModal] = useState<FlavorModalState>({ open: false });
  const [pickedFlavor, setPickedFlavor] = useState("");
  const [desOpen, setDesOpen] = useState(false);
  const [desUso, setDesUso] = useState("");
  const [desPrecio, setDesPrecio] = useState<number>(0);

  // ===== Cargar catálogo (productos + sabores)
  useEffect(() => {
    async function load() {
      try {
        const [productsRes, flavorsRes] = await Promise.all([
          window.api.products.salesList(),
          window.api.getFlavors(),
        ]);

        if (productsRes.ok && productsRes.products) {
          const mapped: Product[] = productsRes.products.map((p: any) => ({
            id: String(p.id),
            name: p.name,
            category: normalizeCategoryValue(p.category) as Category,
            price: p.price,
            requiresFlavor: p.requires_flavor === 1,
            isPromoPack: !!p.isPromoPack,
            description: p.description,
          }));
          setDbProducts(mapped);
        }

        if (flavorsRes.ok && flavorsRes.rows) {
          const names = flavorsRes.rows.map((f: any) => f.name);
          setDbFlavors(names);
          if (names.length > 0) setPickedFlavor(names[0]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingData(false);
      }
    }
    load();
  }, []);

  // ===== filtros
  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dbProducts;
    return dbProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, dbProducts]);

  const productsMain = useMemo(() => {
    const cats = normalizeMainCategory(category);
    return filteredCatalog.filter((p) => cats.includes(p.category));
  }, [filteredCatalog, category]);

  const productsExtras = useMemo(
    () => filteredCatalog.filter((p) => p.category === "Extras"),
    [filteredCatalog]
  );

  const productsDesechables = useMemo(
    () => filteredCatalog.filter((p) => p.category === "Desechables"),
    [filteredCatalog]
  );

  function clearSale() {
    clear();
    setCashReceived(0);
    setPaymentMethod('cash');
    setNotes("");
    setQuery("");
    setSelectedTicketKey(null);
  }

  function addProduct(product: Product) {
    setLastTappedProductId(product.id);
    window.setTimeout(() => setLastTappedProductId(null), 260);

    if (product.category === "Desechables") {
      setDesUso(product.name || "");
      setDesPrecio(product.price || 0);
      setDesOpen(true);
      return;
    }

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

    upsertItem({
      key: `des__${uso}__${precio}`,
      name: `Desechables - ${uso}`,
      baseName: "Desechables",
      qty: 1,
      price: precio,
      subtotal: precio,
      meta: { category: "Desechables" },
    });

    setDesOpen(false);
  }

  async function chargeAndSave() {
    if (cart.length === 0) return;

    const payload = {
      items: cart.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        category: i.meta?.category,
        flavor: i.meta?.flavor,
      })),
      paymentMethod,
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

    const saleDate = new Date().toLocaleString("es-MX");

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
  }

  useEffect(() => {
    setSelectedTicketKey(null);
  }, [category]);

  return (
    <>
      {/* ======================== SALES (FONDO) ======================== */}
      {showSalesUI && (
        <div
          className={[
            `min-h-screen ${ui.page} font-sans`,
            // ✅ si hay overlay abierto, bloquea clicks en ventas (fondo)
            isOverlayOpen ? "pointer-events-none select-none" : "",
          ].join(" ")}
          aria-hidden={isOverlayOpen}
        >
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar producto… (busca en todo)"
                    className={ui.input + " pl-9"}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                    {getCategoryLabel(category)}
                  </div>
                </div>
              </div>

              <div className="min-w-[320px] flex items-center justify-between lg:justify-end gap-3">
                <div className="text-right">
                  <div className="text-xs text-zinc-500">Fecha y hora</div>
                  <div className="text-sm font-semibold text-zinc-700">
                    {new Date().toLocaleString("es-MX")}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setView("admin-flavors")}
                    className="h-10 px-3 rounded-xl text-xs font-extrabold border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 transition inline-flex items-center gap-2"
                    title="Administración"
                  >
                    <Settings className="w-4 h-4" />
                    Admin
                  </button>

                  <button
                    onClick={() => setView("cut")}
                    className="h-10 px-3 rounded-xl text-xs font-extrabold border border-zinc-700 bg-zinc-700 text-white hover:bg-zinc-600 transition inline-flex items-center gap-2"
                    title="Corte"
                  >
                    <FileText className="w-4 h-4" />
                    Corte
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* BODY */}
          <main className="mx-auto max-w-[1400px] px-5 py-5 grid grid-cols-1 lg:grid-cols-[1.35fr_.85fr] gap-5">
            {/* LEFT */}
            <section className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MAIN_CATEGORIES.map((c) => {
                  const normalizedC = normalizeCategoryValue(c);
                  const active = normalizeCategoryValue(category) === normalizedC;

                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(normalizedC)}
                      className={[
                        ui.btn,
                        active ? ui.btnActive : ui.btnIdle,
                        "h-11 rounded-2xl px-4 text-sm font-extrabold border transition flex items-center justify-center gap-2 relative select-none",
                        active
                          ? "bg-zinc-700 border-zinc-700 text-white shadow-sm"
                          : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      <span
                        className={[
                          "absolute left-2 top-1/2 -translate-y-1/2 h-6 w-1.5 rounded-full transition",
                          active ? "bg-white/70" : "bg-transparent",
                        ].join(" ")}
                      />
                      {c}
                    </button>
                  );
                })}
              </div>

              <div className={ui.panel}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
                  <div>
                    <div className="text-sm font-extrabold text-zinc-900">
                      Productos • {category === "Paquetes" ? "Paquetes + Miércoles" : category}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Toca para agregar • {productsMain.length} resultados
                    </div>
                  </div>

                  <button onClick={() => setQuery("")} className={ui.smallBtn}>
                    Limpiar búsqueda
                  </button>
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[58vh] overflow-auto">
                  {loadingData && <div className="text-xs text-zinc-500">Cargando catálogo…</div>}

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
                          <div className="text-sm font-extrabold text-zinc-800">{p.price ? money(p.price) : "—"}</div>
                        </div>

                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {p.requiresFlavor ? <span className={ui.chip}>Requiere sabor</span> : null}
                          {p.isPromoPack ? <span className={ui.chipPromo}>PROMO</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={ui.panel}>
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-extrabold text-zinc-900">Extras y Desechables</div>
                    <div className="text-xs text-zinc-500">Se agregan al ticket sin cambiar categoría</div>
                  </div>

                  <button
                    onClick={() => {
                      setDesUso("");
                      setDesPrecio(0);
                      setDesOpen(true);
                    }}
                    className={ui.primaryStrong}
                  >
                    + Desechables (captura)
                  </button>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            <div className="font-extrabold text-sm text-zinc-800">{p.price ? money(p.price) : "—"}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

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
                            <div className="font-extrabold text-sm text-zinc-800">{p.price ? money(p.price) : "—"}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT */}
            <aside className={`${ui.panel} overflow-hidden flex flex-col`}>
              <div className="px-4 py-4 border-b border-zinc-200 flex items-center justify-between">
                <div>
                  <div className="text-sm font-extrabold tracking-tight text-zinc-900">Ticket</div>
                  <div className="text-xs text-zinc-500">Productos seleccionados</div>
                </div>

                <button
                  onClick={clearSale}
                  disabled={cart.length === 0}
                  className={`${ui.smallBtn} disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2`}
                >
                  <Trash2 className="w-4 h-4" />
                  Vaciar
                </button>
              </div>

              <div className="p-4 flex-1 overflow-auto">
                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
                    <div className="text-base font-extrabold text-zinc-900">Sin productos</div>
                    <div className="text-sm text-zinc-500 mt-1">Selecciona un producto para agregarlo</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item: CartItem) => {
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
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-extrabold text-sm truncate text-zinc-900">{item.name}</div>

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
                              <div className="text-sm font-extrabold text-zinc-900">{money(item.subtotal)}</div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  remove(item.key);
                                }}
                                className={ui.ghostBtn + " inline-flex items-center gap-1"}
                              >
                                <X className="w-4 h-4" />
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
                                aria-label="Disminuir"
                              >
                                <Minus className="w-4 h-4" />
                              </button>

                              <div className="min-w-[38px] text-center font-extrabold text-zinc-800">{item.qty}</div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  inc(item.key);
                                }}
                                className={ui.qtyBtn}
                                aria-label="Aumentar"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="text-xs text-zinc-500">
                              Unitario: <span className="font-extrabold text-zinc-800">{money(item.price)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-zinc-200 space-y-4 bg-white">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-zinc-600">Total</div>
                  <div className="text-xl font-extrabold tracking-tight text-zinc-900">{money(total)}</div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {/* MÉTODO DE PAGO */}
                  <div>
                    <div className="text-xs text-zinc-500 mb-2">Método de pago</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={[
                          "h-11 px-4 rounded-xl text-sm font-extrabold border transition flex items-center justify-center gap-2",
                          paymentMethod === 'cash'
                            ? "bg-zinc-700 border-zinc-700 text-white shadow-sm"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        💵 Efectivo
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={[
                          "h-11 px-4 rounded-xl text-sm font-extrabold border transition flex items-center justify-center gap-2",
                          paymentMethod === 'card'
                            ? "bg-zinc-700 border-zinc-700 text-white shadow-sm"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        💳 Tarjeta
                      </button>
                    </div>
                  </div>

                  {/* EFECTIVO RECIBIDO (solo si es efectivo) */}
                  {paymentMethod === 'cash' && (
                    <>
                      <div>
                        <div className="text-xs text-zinc-500 mb-1">Efectivo recibido</div>
                        <input
                          type="number"
                          value={cashReceived}
                          onChange={(e) => setCashReceived(Number(e.target.value))}
                          placeholder="0"
                          className={ui.input}
                        />

                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {quickCash.map((v) => (
                            <button key={v} onClick={() => setCashReceived(v)} className={ui.primaryStrong}>
                              {money(v)}
                            </button>
                          ))}
                          <button onClick={() => setCashReceived(total)} className={ui.primaryStrong} disabled={total <= 0}>
                            Exacto
                          </button>
                        </div>
                      </div>

                      <div className={`${ui.footerBox} flex items-center justify-between`}>
                        <div className="text-xs text-zinc-500">Cambio</div>
                        <div className="text-sm font-extrabold text-zinc-800">{money(change)}</div>
                      </div>
                    </>
                  )}

                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Notas (opcional)</div>
                    <input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ej: sin cebolla…"
                      className={ui.input}
                    />
                  </div>
                </div>

                <button disabled={cart.length === 0} onClick={chargeAndSave} className={ui.primary}>
                  Cobrar & Guardar (imprime ticket)
                </button>
              </div>
            </aside>
          </main>

          {/* MODALES */}
          <FlavorModal
            open={flavorModal.open}
            ui={ui}
            product={flavorModal.product}
            flavors={dbFlavors}
            picked={pickedFlavor}
            onPick={setPickedFlavor}
            onClose={() => setFlavorModal({ open: false })}
            onConfirm={confirmFlavor}
          />

          <DesechablesModal
            open={desOpen}
            ui={ui}
            uso={desUso}
            precio={desPrecio}
            onUso={setDesUso}
            onPrecio={setDesPrecio}
            onClose={() => setDesOpen(false)}
            onConfirm={confirmDesechables}
          />
        </div>
      )}

      {/* ======================== ADMIN SIDE PANEL ======================== */}
      <SidePanel
        open={isAdminView}
        onClose={() => setView("sales")}
        title="Administración"
        subtitle="Sabores y productos"
        widthClassName="w-[820px] max-w-[95vw]"
        headerRight={
          <div className="inline-flex items-center p-1 rounded-xl border border-zinc-200 bg-zinc-50">
            <button
              type="button"
              onClick={() => setView("admin-flavors")}
              className={[
                "h-9 px-4 rounded-lg text-xs font-extrabold whitespace-nowrap transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300",
                view === "admin-flavors"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-800 hover:bg-white",
              ].join(" ")}
            >
              Sabores
            </button>

            <button
              type="button"
              onClick={() => setView("admin-products")}
              className={[
                "h-9 px-4 rounded-lg text-xs font-extrabold whitespace-nowrap transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300",
                view === "admin-products"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-800 hover:bg-white",
              ].join(" ")}
            >
              Productos
            </button>
          </div>
        }
      >
        <div className="p-4">{view === "admin-flavors" ? <AdminFlavorPanel /> : <AdminProductPanel />}</div>
      </SidePanel>

      {/* ======================== CUT SIDE PANEL (IGUAL QUE ADMIN) ======================== */}
      <SidePanel
        open={isCutView}
        onClose={() => setView("sales")}
        title="Corte"
        subtitle="Resumen de ventas"
        widthClassName="w-[980px] max-w-[95vw]"
      >
        <div className="p-0">
          {/* CutScreen ya tiene su header, pero aquí lo estamos metiendo dentro del panel.
              Si quieres, te lo adapto a versión "CutPanel" sin header duplicado. */}
          <CutScreen onBack={() => setView("sales")} />
        </div>
      </SidePanel>
    </>
  );
}
