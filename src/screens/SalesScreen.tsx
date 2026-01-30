import { useEffect, useMemo, useState } from "react";
import type { CartItem, Category, Product } from "../pos/types";
import { MAIN_CATEGORIES } from "../pos/categories";
import { money } from "../pos/utils/money";
import { useCart } from "../pos/hooks/useCart";
import { useQuickCash } from "../pos/hooks/useQuickCash";
import { useUi } from "../pos/hooks/useUi";
import { printTicket } from "../pos/ticket/printTicket";
import { packageIncludes, productCustomOptions } from "../../electron/db/schema";

// ✅ Modales
import { FlavorModal } from "../pos/modals/FlavorModal";
import { CustomOptionsModal } from "../pos/modals/CustomOptionsModal";

// ✅ Admin panels
import { AdminFlavorPanel } from "../screens/AdminFlavorPanel";
import { AdminProductPanel } from "../screens/AdminProductPanel";
import { SidePanel } from "../pos/components/SidePanel";

// ✅ Corte
import { CutScreen } from "../screens/CutScreen";

// ✅ Icons (COMPLETO)
import {
  Settings,
  FileText,
  Search,
  Trash2,
  Minus,
  Plus,
  X,
  Banknote,
  CreditCard,
  Receipt,
  Eraser,
  PlusCircle,
} from "lucide-react";

type View = "sales" | "admin-flavors" | "admin-products" | "cut";
type FlavorModalState = { open: boolean; product?: Product };

// ✅ Helper para unir categorías en UI
function normalizeMainCategory(cat: Category): Category[] {
  if (cat === "Paquetes") return ["Paquetes", "Miércoles"];
  return [cat];
}

function normalizeCategoryValue(value: string): Category {
  const v = (value ?? "").trim();
  if (v === "Miercoles") return "Miércoles";
  if (v === "Especialidad") return "Especialidades";
  if (v === "Paquete") return "Paquetes";
  return v as Category;
}

function getCategoryLabel(cat: Category) {
  const c = normalizeCategoryValue(cat);
  if (c === "Paquetes") return "Paquetes";
  return c;
}

// ✅ helper para cash: redondear hacia arriba al billete más cercano disponible
function pickNearestCashUp(total: number, options: number[]) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  const sorted = [...options].sort((a, b) => a - b);
  const found = sorted.find((v) => v >= t);
  return found ?? t; // si ninguno alcanza, usa exacto
}

export function SalesScreen() {
  const ui = useUi();

  const [view, setView] = useState<View>("sales");
  const isAdminView = view === "admin-flavors" || view === "admin-products";
  const isCutView = view === "cut";
  const isOverlayOpen = isAdminView || isCutView;
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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [cashReceived, setCashReceived] = useState(0);
  const change = useMemo(() => Math.max(0, cashReceived - total), [cashReceived, total]);
  const quickCash = useQuickCash(total);

  // ✅✅ VALIDACIONES EFECTIVO (lo que pediste)
  // 1) Si hay total y es efectivo => cashReceived mínimo = total
  useEffect(() => {
    if (paymentMethod !== "cash") return;

    if (total <= 0) {
      if (cashReceived !== 0) setCashReceived(0);
      return;
    }

    if (!Number.isFinite(cashReceived) || cashReceived < total) {
      // aquí puedes elegir:
      // - setCashReceived(total)  => exacto
      // - setCashReceived(pickNearestCashUp(total, quickCash)) => billete superior si existe
      setCashReceived(total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, total]);

  // 2) Si cambias a tarjeta, el efectivo recibido no importa => lo dejamos en 0
  useEffect(() => {
    if (paymentMethod === "card") {
      if (cashReceived !== 0) setCashReceived(0);
    }
  }, [paymentMethod]);

  // UX
  const [lastTappedProductId, setLastTappedProductId] = useState<string | null>(null);
  const [selectedTicketKey, setSelectedTicketKey] = useState<string | null>(null);

  // Modales
  const [flavorModal, setFlavorModal] = useState<FlavorModalState>({ open: false });
  const [pickedFlavor, setPickedFlavor] = useState("");

  // Custom options modal
  type CustomOptionsState = {
    open: boolean;
    product?: Product;
    customOptions?: { label: string; options: Array<{ name: string; extraName: string }> };
  };
  const [customOptionsModal, setCustomOptionsModal] = useState<CustomOptionsState>({ open: false });
  const [pickedCustomOption, setPickedCustomOption] = useState("");
  const [pendingCustomOption, setPendingCustomOption] = useState<string | undefined>(undefined);

  // ✅ Desechables directo
  const [desAmount, setDesAmount] = useState<number>(0);
  const [desNote, setDesNote] = useState<string>("");
  const [pickedFlavors, setPickedFlavors] = useState<string[]>([]);
  const [flavorSlots, setFlavorSlots] = useState(1);

  // ==========================
  // ✅ Helpers para opciones custom (Pirata / Paquete Pirata / acentos)
  // ==========================
  function normKey(s: string) {
    return (s ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/\s+/g, " ");
  }

  function simplifyProductName(name: string) {
    let n = (name ?? "").trim();
    n = n.replace(/^paquete\s+/i, "");
    n = n.replace(/^super\s+/i, "");
    n = n.replace(/^súper\s+/i, "");
    n = n.replace(/\s+/g, " ").trim();
    return n;
  }

  const customOptionsIndex = useMemo(() => {
    const idx = new Map<string, { label: string; options: Array<{ name: string; extraName: string }> }>();
    Object.entries(productCustomOptions).forEach(([key, val]) => {
      idx.set(normKey(key), val as any);
    });
    return idx;
  }, []);

  function getCustomOptionsForProduct(productName?: string) {
    if (!productName) return undefined;

    // 1) exacto
    const direct = (productCustomOptions as any)[productName];
    if (direct) return direct;

    // 2) normalizado
    const byNorm = customOptionsIndex.get(normKey(productName));
    if (byNorm) return byNorm;

    // 3) quitando "Paquete", "Súper", etc.
    const simp = simplifyProductName(productName);
    const bySimp = (productCustomOptions as any)[simp];
    if (bySimp) return bySimp;

    const bySimpNorm = customOptionsIndex.get(normKey(simp));
    if (bySimpNorm) return bySimpNorm;

    return undefined;
  }

  function getPrettyCustomOptionLabel(baseName?: string, extraName?: string) {
    if (!baseName || !extraName) return "";
    const opts = getCustomOptionsForProduct(baseName);
    const found = opts?.options?.find((o: { extraName: string }) => o.extraName === extraName);
    return found?.name || extraName;
  }

  // ===== Cargar catálogo
  useEffect(() => {
    async function load() {
      try {
        const [productsRes, flavorsRes] = await Promise.all([window.api.products.salesList(), window.api.getFlavors()]);

        if (productsRes.ok && (productsRes as any).products) {
          const mapped: Product[] = (productsRes as any).products.map((p: any) => ({
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

        if (flavorsRes.ok && (flavorsRes as any).rows) {
          const names = (flavorsRes as any).rows.map((f: any) => f.name);
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

  const productsExtras = useMemo(() => filteredCatalog.filter((p) => p.category === "Extras"), [filteredCatalog]);

  function clearSale() {
    clear();
    setCashReceived(0);
    setPaymentMethod("cash");
    setNotes("");
    setQuery("");
    setSelectedTicketKey(null);
    setDesAmount(0);
    setDesNote("");
    setPendingCustomOption(undefined);
  }

  function polloUnitsFromName(name: string) {
    const lower = name.toLowerCase();
    if (!lower.includes("pollo")) return 0;
    if (lower.includes("1/4")) return 0.25;
    if (lower.includes("1/2")) return 0.5;
    return 1;
  }

  function flavorSlotsForProduct(name: string) {
    const pkg = packageIncludes.find((p) => p.packageName === name);
    if (!pkg) return 1;
    const units = pkg.extras.reduce((acc, extra) => acc + polloUnitsFromName(extra.name) * (extra.qty ?? 1), 0);
    return Math.max(1, Math.ceil(units || 1));
  }

  function addProduct(product: Product) {
    setLastTappedProductId(product.id);
    window.setTimeout(() => setLastTappedProductId(null), 240);

    // ✅ Custom options robusto (Pirata / Paquete Pirata)
    const customOpts = getCustomOptionsForProduct(product.name);
    if (customOpts) {
      setPickedCustomOption(customOpts.options[0]?.extraName || "");
      setCustomOptionsModal({ open: true, product, customOptions: customOpts });
      return;
    }

    if (product.requiresFlavor) {
      const slots = flavorSlotsForProduct(product.name);
      setFlavorSlots(slots);

      if (dbFlavors.length > 0) {
        const first = dbFlavors[0];
        setPickedFlavor(first);
        setPickedFlavors(Array.from({ length: slots }, () => first));
      }

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

    const chosen = (flavorSlots > 1 ? pickedFlavors : [pickedFlavor]).filter(Boolean);
    const flavorLabel = chosen.length > 0 ? chosen.join(" / ") : "Sin sabor";
    const flavorValue = chosen.length > 0 ? chosen.join(" | ") : undefined;

    // ✅ etiqueta bonita de extra
    const customOptLabel = pendingCustomOption
      ? ` (${getPrettyCustomOptionLabel(p.name, pendingCustomOption)})`
      : "";

    const display = `${p.name} - ${flavorLabel}${customOptLabel}${suffixPromo}`;
    const key = `${p.id}__${flavorValue ?? "nosabor"}__${pendingCustomOption || "noopt"}__${isPromo ? "promo" : "normal"}`;

    upsertItem({
      key,
      name: display,
      baseName: p.name,
      qty: 1,
      price: p.price,
      subtotal: p.price,
      meta: {
        flavor: flavorValue,
        flavorList: chosen,
        customOption: pendingCustomOption,
        promo: isPromo,
        category: p.category,
      },
    });

    setFlavorModal({ open: false });
    setPendingCustomOption(undefined);
  }

  function handlePickFlavor(f: string) {
    setPickedFlavor(f);
    setPickedFlavors((prev) => {
      const next = prev.length ? [...prev] : Array.from({ length: flavorSlots }, () => f);
      next[0] = f;
      return next;
    });
  }

  function handlePickFlavorSlot(slot: number, flavor: string) {
    setPickedFlavors((prev) => {
      const arr = prev.length ? [...prev] : Array.from({ length: flavorSlots }, () => "");
      arr[slot] = flavor;
      if (slot === 0) setPickedFlavor(flavor);
      return arr;
    });
  }

  function confirmCustomOption() {
    const p = customOptionsModal.product;
    if (!p) return;

    // Store custom option for later use in flavor confirmation
    setPendingCustomOption(pickedCustomOption);

    // After choosing custom option, check if product requires flavor
    if (p.requiresFlavor) {
      const slots = flavorSlotsForProduct(p.name);
      setFlavorSlots(slots);

      if (dbFlavors.length > 0) {
        const first = dbFlavors[0];
        setPickedFlavor(first);
        setPickedFlavors(Array.from({ length: slots }, () => first));
      }

      setCustomOptionsModal({ open: false });
      setFlavorModal({ open: true, product: p });
      return;
    }

    // If no flavor required, add directly
    const optName = getPrettyCustomOptionLabel(p.name, pickedCustomOption);
    const display = `${p.name} - ${optName}`;
    const key = `${p.id}__${pickedCustomOption}`;

    upsertItem({
      key,
      name: display,
      baseName: p.name,
      qty: 1,
      price: p.price,
      subtotal: p.price,
      meta: { customOption: pickedCustomOption, category: p.category },
    });

    setCustomOptionsModal({ open: false });
    setPendingCustomOption(undefined);
  }

  // ✅ Agregar desechables directo
  function addDesechablesDirect() {
    const precio = Number(desAmount) || 0;
    if (precio <= 0) return;

    const note = desNote.trim();
    const name = note ? `Desechables - ${note}` : "Desechables";

    upsertItem({
      key: `des__direct__${note || "na"}__${precio}`,
      name,
      baseName: "Desechables",
      qty: 1,
      price: precio,
      subtotal: precio,
      meta: { category: "Desechables" },
    });

    setDesAmount(0);
    setDesNote("");
  }

  async function chargeAndSave() {
    if (cart.length === 0) return;

    // ✅ Seguridad: en efectivo no permitir cobrar si cashReceived < total
    if (paymentMethod === "cash") {
      const cr = Number(cashReceived) || 0;
      if (total > 0 && cr < total) {
        alert("El efectivo recibido no puede ser menor al total.");
        setCashReceived(total);
        return;
      }
    }

    const payload = {
      items: cart.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        category: i.meta?.category,
        flavor: i.meta?.flavor,
        customOption: i.meta?.customOption,
      })),
      paymentMethod,
      notes: notes.trim() || undefined,
      cashReceived,
      total,
      change,
    };

    const res = await window.api.createSale(payload);
    if (!res.ok) {
      alert((res as any).message || "Error guardando venta");
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

  // ✅ ESTILO CUADRADO (SIN ROUNDED / SIN RING / SIN “TARJETA SUAVE”)
  const panelClean = "bg-white border border-zinc-300 overflow-hidden";
  const sectionHead = "px-5 py-4 border-b border-zinc-300 flex items-center justify-between gap-3";
  const subCard = "bg-white border border-zinc-300 overflow-hidden";
  const btnSoft = "h-9 px-3 text-xs font-extrabold border border-zinc-300 bg-white hover:bg-zinc-100 transition";

  // ✅ chips cuadrados
  const chip = "px-2 py-1 bg-zinc-100 text-zinc-700 font-semibold text-[11px]";
  const chipPromo = "px-2 py-1 bg-amber-100 text-amber-900 font-extrabold text-[11px]";

  return (
    <>
      {showSalesUI && (
        <div
          className={[
            `min-h-screen ${ui.page} font-sans`,
            isOverlayOpen ? "pointer-events-none select-none" : "",
          ].join(" ")}
          aria-hidden={isOverlayOpen}
        >
          {/* TOP BAR */}
          <header className={ui.header}>
            <div className="mx-auto max-w-[1440px] px-6 py-4 flex items-center gap-4">
              {/* brand */}
              <div className="flex items-center gap-3 min-w-[260px]">
                <div className="h-10 w-10 bg-zinc-100 border border-zinc-300 flex items-center justify-center">
                  <div className="h-2.5 w-2.5 bg-zinc-600" />
                </div>
                <div className="leading-tight">
                  <div className="text-lg font-extrabold tracking-tight text-zinc-900">Pollo Pirata POS</div>
                  <div className="text-xs text-zinc-500">Captura rápida de ventas • sin inventario</div>
                </div>
              </div>

              {/* search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar producto… (busca en todo)"
                    className={`${ui.input} pl-9`}
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                    {getCategoryLabel(category)}
                  </div>
                </div>
              </div>

              {/* actions */}
              <div className="min-w-[320px] flex items-center justify-end gap-3">
                <div className="text-right">
                  <div className="text-xs text-zinc-500">Fecha y hora</div>
                  <div className="text-sm font-semibold text-zinc-700">{new Date().toLocaleString("es-MX")}</div>
                </div>

                <button
                  onClick={() => setView("admin-flavors")}
                  className="h-10 px-4 text-xs font-extrabold border border-zinc-300 bg-white hover:bg-zinc-100 transition inline-flex items-center gap-2"
                  title="Administración"
                >
                  <Settings className="w-4 h-4" />
                  Admin
                </button>

                <button
                  onClick={() => setView("cut")}
                  className="h-10 px-4 text-xs font-extrabold border border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 transition inline-flex items-center gap-2"
                  title="Corte"
                >
                  <FileText className="w-4 h-4" />
                  Corte
                </button>
              </div>
            </div>
          </header>

          {/* BODY */}
          <main className="mx-auto max-w-[1440px] px-6 py-6 grid grid-cols-1 lg:grid-cols-[1.32fr_.88fr] gap-6">
            {/* LEFT */}
            <section className="space-y-5">
              {/* categorías */}
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
                        "h-11 px-4 text-sm font-extrabold transition flex items-center justify-center relative select-none border",
                        active
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-white hover:bg-zinc-100 border-zinc-300 text-zinc-800",
                      ].join(" ")}
                      aria-pressed={active}
                    >
                      <span
                        className={[
                          "absolute left-0 top-0 bottom-0 w-1.5",
                          active ? "bg-zinc-700" : "bg-transparent",
                        ].join(" ")}
                      />
                      {c}
                    </button>
                  );
                })}
              </div>

              {/* productos */}
              <div className={panelClean}>
                <div className={sectionHead}>
                  <div>
                    <div className="text-sm font-extrabold text-zinc-900">
                      Productos • {category === "Paquetes" ? "Paquetes + Miércoles" : category}
                    </div>
                    <div className="text-xs text-zinc-500">Toca para agregar • {productsMain.length} resultados</div>
                  </div>

                  <button onClick={() => setQuery("")} className={btnSoft}>
                    <span className="inline-flex items-center gap-2">
                      <Eraser className="w-4 h-4" />
                      Limpiar búsqueda
                    </span>
                  </button>
                </div>

                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[56vh] overflow-auto">
                  {loadingData && <div className="text-xs text-zinc-500">Cargando catálogo…</div>}

                  {productsMain.map((p) => {
                    const flash = lastTappedProductId === p.id;

                    return (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className={[
                          "text-left bg-white border border-zinc-300 hover:bg-zinc-50 transition px-4 py-3",
                          flash ? "border-zinc-500 bg-zinc-50" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-extrabold leading-snug text-zinc-900">{p.name}</div>
                          <div className="text-sm font-extrabold text-zinc-800">{p.price ? money(p.price) : "—"}</div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.requiresFlavor ? <span className={chip}>Requiere sabor</span> : null}
                          {p.isPromoPack ? <span className={chipPromo}>PROMO</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* extras + desechables */}
              <div className={panelClean}>
                <div className={sectionHead}>
                  <div>
                    <div className="text-sm font-extrabold text-zinc-900">Extras y Desechables</div>
                    <div className="text-xs text-zinc-500">Extras desde lista • Desechables se captura directo</div>
                  </div>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* EXTRAS */}
                  <div className={subCard}>
                    <div className="px-4 py-3 border-b border-zinc-300 flex items-center justify-between">
                      <div className="text-sm font-extrabold text-zinc-900">Extras</div>
                      <div className="text-xs text-zinc-500">{productsExtras.length} items</div>
                    </div>

                    <div className="p-3 grid grid-cols-1 gap-2 max-h-[260px] overflow-auto">
                      {productsExtras.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addProduct(p)}
                          className="text-left bg-white border border-zinc-300 hover:bg-zinc-50 px-3 py-2 transition"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-extrabold text-sm text-zinc-900">{p.name}</div>
                            <div className="font-extrabold text-sm text-zinc-800">{p.price ? money(p.price) : "—"}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* DESECHABLES DIRECTO */}
                  <div className={subCard}>
                    <div className="px-4 py-3 border-b border-zinc-300">
                      <div className="text-sm font-extrabold text-zinc-900">Desechables (captura directa)</div>
                      <div className="text-xs text-zinc-500">Ingresa el monto y agrégalo al ticket</div>
                    </div>

                    <div className="p-4 space-y-3">
                      <div>
                        <div className="text-xs text-zinc-500 mb-1">Concepto (opcional)</div>
                        <input
                          value={desNote}
                          onChange={(e) => setDesNote(e.target.value)}
                          placeholder="Ej: bolsas / platos / vasos…"
                          className={ui.input}
                        />
                      </div>

                      <div>
                        <div className="text-xs text-zinc-500 mb-1">Monto</div>
                        <input
                          type="number"
                          value={desAmount}
                          onChange={(e) => setDesAmount(Number(e.target.value))}
                          placeholder="0"
                          className={ui.input}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addDesechablesDirect();
                          }}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={addDesechablesDirect}
                          disabled={(Number(desAmount) || 0) <= 0}
                          className="h-10 px-4 bg-zinc-900 text-white text-xs font-extrabold hover:bg-zinc-800 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                        >
                          <PlusCircle className="w-4 h-4" />
                          Agregar
                        </button>

                        <button
                          onClick={() => {
                            setDesAmount(0);
                            setDesNote("");
                          }}
                          className={btnSoft}
                          title="Limpiar"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Eraser className="w-4 h-4" />
                            Limpiar
                          </span>
                        </button>
                      </div>

                      <div className="text-[11px] text-zinc-500">
                        Tip: Presiona <b>Enter</b> para agregar rápido.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* RIGHT */}
            <aside className={`${panelClean} flex flex-col`}>
              <div className={sectionHead}>
                <div>
                  <div className="text-sm font-extrabold tracking-tight text-zinc-900">Ticket</div>
                  <div className="text-xs text-zinc-500">Productos seleccionados</div>
                </div>

                <button
                  onClick={clearSale}
                  disabled={cart.length === 0}
                  className="h-9 px-3 text-xs font-extrabold border border-zinc-300 bg-white hover:bg-zinc-100 transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Vaciar
                </button>
              </div>

              <div className="p-5 flex-1 overflow-auto">
                {cart.length === 0 ? (
                  <div className="bg-zinc-50 border border-zinc-300 p-7 text-center">
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
                            "bg-white border border-zinc-300 px-4 py-3 cursor-pointer transition",
                            selected ? "bg-zinc-50 border-zinc-500" : "hover:bg-zinc-50",
                          ].join(" ")}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-extrabold text-sm truncate text-zinc-900">{item.name}</div>

                              <div className="mt-1 flex flex-wrap gap-2">
                                {item.meta?.flavor ? (
                                  <span className={chip}>
                                    Sabor: <b>{item.meta.flavor}</b>
                                  </span>
                                ) : null}

                                {/* ✅ Chip de Extra (bonito) */}
                                {item.meta?.customOption ? (
                                  <span className={chip}>
                                    Extra: <b>{getPrettyCustomOptionLabel(item.baseName, item.meta.customOption)}</b>
                                  </span>
                                ) : null}

                                {item.meta?.promo ? <span className={chipPromo}>PROMO</span> : null}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-extrabold text-zinc-900">{money(item.subtotal)}</div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  remove(item.key);
                                }}
                                className="mt-1 inline-flex items-center gap-1 text-xs font-extrabold text-zinc-700 hover:text-zinc-900"
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
                                className="h-9 w-9 bg-white border border-zinc-300 hover:bg-zinc-100 grid place-items-center"
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
                                className="h-9 w-9 bg-white border border-zinc-300 hover:bg-zinc-100 grid place-items-center"
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

              <div className="p-5 border-t border-zinc-300 space-y-4 bg-white">
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
                        onClick={() => setPaymentMethod("cash")}
                        className={[
                          "h-11 px-4 rounded-xl text-sm font-extrabold border transition flex items-center justify-center gap-2",
                          paymentMethod === "cash"
                            ? "bg-zinc-700 border-zinc-700 text-white shadow-sm"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        <Banknote className="w-4 h-4" />
                        Efectivo
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod("card")}
                        className={[
                          "h-11 px-4 rounded-xl text-sm font-extrabold border transition flex items-center justify-center gap-2",
                          paymentMethod === "card"
                            ? "bg-zinc-700 border-zinc-700 text-white shadow-sm"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        <CreditCard className="w-4 h-4" />
                        Tarjeta
                      </button>
                    </div>
                  </div>

                  {/* EFECTIVO RECIBIDO (solo si es efectivo) */}
                  {paymentMethod === "cash" && (
                    <>
                      <div>
                        <div className="text-xs text-zinc-500 mb-1">Efectivo recibido</div>
                        <input
                          type="number"
                          value={cashReceived}
                          min={total > 0 ? total : 0}
                          onChange={(e) => {
                            const v = Number(e.target.value);

                            if (!Number.isFinite(v)) {
                              setCashReceived(0);
                              return;
                            }

                            // ✅ nunca permitir menor al total cuando hay productos
                            if (total > 0 && v < total) {
                              setCashReceived(total);
                              return;
                            }

                            setCashReceived(v);
                          }}
                          placeholder={total > 0 ? String(total) : "0"}
                          className={ui.input}
                        />

                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {quickCash.map((v) => (
                            <button
                              key={v}
                              onClick={() => {
                                // ✅ si el botón es menor al total, sube a exacto
                                setCashReceived(v < total ? total : v);
                              }}
                              className={ui.primaryStrong}
                            >
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
                  <span className="inline-flex items-center gap-2 justify-center">
                    <Receipt className="w-4 h-4" />
                    Cobrar & Guardar (imprime ticket)
                  </span>
                </button>
              </div>
            </aside>
          </main>

          {/* MODAL SABOR */}
          <FlavorModal
            open={flavorModal.open}
            ui={ui}
            product={flavorModal.product}
            flavors={dbFlavors}
            picked={pickedFlavor}
            pickedList={pickedFlavors}
            slots={flavorSlots}
            onPick={handlePickFlavor}
            onPickSlot={handlePickFlavorSlot}
            onClose={() => setFlavorModal({ open: false })}
            onConfirm={confirmFlavor}
          />

          {/* MODAL OPCIONES PERSONALIZADAS */}
          <CustomOptionsModal
            open={customOptionsModal.open}
            ui={ui}
            product={customOptionsModal.product}
            label={customOptionsModal.customOptions?.label || "Elige una opción"}
            options={customOptionsModal.customOptions?.options || []}
            picked={pickedCustomOption}
            onPick={setPickedCustomOption}
            onClose={() => setCustomOptionsModal({ open: false })}
            onConfirm={confirmCustomOption}
          />
        </div>
      )}

      {/* ADMIN SIDE PANEL */}
      <SidePanel
        open={isAdminView}
        onClose={() => setView("sales")}
        title="Administración"
        subtitle="Sabores y productos"
        widthClassName="w-[820px] max-w-[95vw]"
        headerRight={
          <div className="inline-flex items-center p-1 border border-zinc-300 bg-zinc-50">
            <button
              type="button"
              onClick={() => setView("admin-flavors")}
              className={[
                "h-9 px-4 text-xs font-extrabold whitespace-nowrap transition border",
                view === "admin-flavors"
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-100",
              ].join(" ")}
            >
              Sabores
            </button>

            <button
              type="button"
              onClick={() => setView("admin-products")}
              className={[
                "h-9 px-4 text-xs font-extrabold whitespace-nowrap transition border -ml-px",
                view === "admin-products"
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-100",
              ].join(" ")}
            >
              Productos
            </button>
          </div>
        }
      >
        <div className="p-4">{view === "admin-flavors" ? <AdminFlavorPanel /> : <AdminProductPanel />}</div>
      </SidePanel>

      {/* CUT SIDE PANEL */}
      <SidePanel
        open={isCutView}
        onClose={() => setView("sales")}
        title="Corte"
        subtitle="Resumen de ventas"
        widthClassName="w-[980px] max-w-[95vw]"
      >
        <div className="p-0">
          <CutScreen onBack={() => setView("sales")} />
        </div>
      </SidePanel>
    </>
  );
}
