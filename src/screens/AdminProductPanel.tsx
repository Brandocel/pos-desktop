import { useEffect, useMemo, useRef, useState } from "react";

const FLAVOR_REQUIRED_CATEGORIES = ["Pollos", "Paquetes", "Miércoles"];
const STORED_FLAVOR_CATEGORY = "Especialidades";

type ProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  requires_flavor: number;
  flavor_id: string | null;
  is_deleted: number;
  created_at: string;
  included_extras: string[];
};

type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

type ListResponse = {
  ok: boolean;
  data: ProductRow[];
  pagination: Pagination;
};

type FlavorOption = { id: string; name: string };

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: string; kind: ToastKind; title: string; message?: string };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function money(n: number) {
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function formatDateMX(value: string) {
  try {
    return new Date(value).toLocaleDateString("es-MX", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return value;
  }
}

// compact pagination: [1] ... [p-1] [p] [p+1] ... [last]
function buildPageButtons(current: number, total: number): (number | "dots")[] {
  if (total <= 1) return [];
  const items: (number | "dots")[] = [];
  const add = (x: number | "dots") => items.push(x);

  add(1);
  if (current - 2 > 2) add("dots");

  for (let p = current - 1; p <= current + 1; p++) {
    if (p > 1 && p < total) add(p);
  }

  if (current + 2 < total) add("dots");
  if (total > 1) add(total);

  return items.filter((v, i) => items.indexOf(v) === i);
}

export function AdminProductPanel() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [flavors, setFlavors] = useState<FlavorOption[]>([]);
  const [extras, setExtras] = useState<ProductRow[]>([]);

  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);

  // Toast system
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<Record<string, number>>({});

  function pushToast(kind: ToastKind, title: string, message?: string) {
    const id = uid();
    const t: ToastItem = { id, kind, title, message };
    setToasts((prev) => [t, ...prev].slice(0, 4));

    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      delete toastTimers.current[id];
    }, 2600);

    toastTimers.current[id] = timer;
  }

  function removeToast(id: string) {
    const timer = toastTimers.current[id];
    if (timer) window.clearTimeout(timer);
    delete toastTimers.current[id];
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }

  useEffect(() => {
    return () => {
      Object.values(toastTimers.current).forEach((t) => window.clearTimeout(t));
      toastTimers.current = {};
    };
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "",
    price: 0,
    flavor_id: "",
    included_extras: [] as string[],
  });

  const requiresFlavor = useMemo(
    () => FLAVOR_REQUIRED_CATEGORIES.includes(form.category),
    [form.category]
  );

  const storesFlavor = useMemo(
    () => form.category === STORED_FLAVOR_CATEGORY,
    [form.category]
  );

  const canSubmit = useMemo(() => {
    if (!form.name.trim()) return false;
    if (!form.category.trim()) return false;
    if (storesFlavor && !form.flavor_id) return false;
    return true;
  }, [form.name, form.category, form.flavor_id, storesFlavor]);

  const flavorNameById = useMemo(() => {
    const map = new Map<string, string>();
    flavors.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [flavors]);

  const extraNameById = useMemo(() => {
    const map = new Map<string, string>();
    extras.forEach((e) => map.set(e.id, e.name));
    return map;
  }, [extras]);

  const selectedExtrasNames = useMemo(() => {
    return form.included_extras
      .map((id) => extraNameById.get(id))
      .filter(Boolean) as string[];
  }, [form.included_extras, extraNameById]);

  const loadProducts = async (nextPage = 1) => {
    try {
      setLoadingList(true);
      const resp = (await window.api.products.list({
        page: nextPage,
        pageSize: 10,
        category: categoryFilter || undefined,
        search,
        showDeleted,
      })) as ListResponse;

      if (resp.ok) {
        setProducts(resp.data);
        setPagination(resp.pagination);
      } else {
        pushToast("error", "No se pudo cargar", "Error al cargar productos.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error de conexión", "Revisa tu API / bridge de Electron.");
    } finally {
      setLoadingList(false);
    }
  };

  const loadMeta = async () => {
    try {
      const [catResp, flavorsResp, extrasResp] = await Promise.all([
        window.api.products.categories() as Promise<{ ok: boolean; categories: string[] }>,
        window.api.getFlavors() as Promise<{ ok: boolean; rows: FlavorOption[] }>,
        window.api.products.list({
          page: 1,
          pageSize: 200,
          category: "Extras",
          showDeleted: false,
        }) as Promise<ListResponse>,
      ]);

      if (catResp?.ok) setCategories(catResp.categories || []);
      if (flavorsResp?.ok) setFlavors(flavorsResp.rows || []);
      if (extrasResp?.ok) setExtras(extrasResp.data || []);
    } catch (err) {
      console.error(err);
      pushToast("error", "Meta no disponible", "No se pudieron cargar categorías/sabores/extras.");
    }
  };

  useEffect(() => {
    loadProducts(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, showDeleted, categoryFilter]);

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: "", category: "", price: 0, flavor_id: "", included_extras: [] });
  };

  const onEdit = (p: ProductRow) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category,
      price: p.price,
      flavor_id: p.flavor_id || "",
      included_extras: p.included_extras || [],
    });

    pushToast("info", "Modo edición", `Editando "${p.name}".`);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const handleSubmit = async () => {
    const name = form.name.trim();
    const category = form.category.trim();

    if (!name) return pushToast("error", "Nombre requerido", "Escribe el nombre del producto.");
    if (!category) return pushToast("error", "Categoría requerida", "Selecciona o escribe una categoría.");
    if (storesFlavor && !form.flavor_id) {
      return pushToast("error", "Sabor requerido", "Para Especialidades debes seleccionar un sabor fijo.");
    }

    const payload = {
      name,
      category,
      price: Number(form.price) || 0,
      requires_flavor: requiresFlavor,
      flavor_id: storesFlavor ? form.flavor_id || undefined : undefined,
      included_extras: category === "Extras" ? [] : form.included_extras,
    };

    try {
      setSaving(true);

      let resp: any;
      if (editingId) {
        resp = await window.api.products.update({
          ...payload,
          id: editingId,
          flavor_id: payload.flavor_id || undefined,
        });
      } else {
        resp = await window.api.products.create(payload);
      }

      if (resp.ok) {
        pushToast(
          "success",
          editingId ? "Producto actualizado" : "Producto creado",
          `"${name}" • ${category} • ${money(payload.price)}`
        );

        resetForm();
        setPage(1);
        await loadProducts(1);
      } else {
        pushToast("error", "No se pudo guardar", resp.message || "Intenta de nuevo.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error de conexión", "No se pudo guardar el producto.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name?: string) => {
    const ok = confirm(`¿Eliminar este producto${name ? `: "${name}"` : ""}?`);
    if (!ok) return;

    try {
      const resp = await window.api.products.delete({ id });
      if (resp?.ok) {
        pushToast("success", "Producto eliminado", name ? `"${name}" se movió a eliminados.` : undefined);
        await loadProducts(page);
      } else {
        pushToast("error", "No se pudo eliminar", resp?.message || "Intenta de nuevo.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error al eliminar", "Revisa tu conexión / API.");
    }
  };

  const handleRestore = async (id: string, name?: string) => {
    try {
      const resp = await window.api.products.restore({ id });
      if (resp?.ok) {
        pushToast("success", "Producto restaurado", name ? `"${name}" volvió a estar activo.` : undefined);
        await loadProducts(page);
      } else {
        pushToast("error", "No se pudo restaurar", resp?.message || "Intenta de nuevo.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error al restaurar", "Revisa tu conexión / API.");
    }
  };

  const toggleExtra = (id: string) => {
    setForm((prev) => {
      const exists = prev.included_extras.includes(id);
      const next = exists ? prev.included_extras.filter((x) => x !== id) : [...prev.included_extras, id];
      return { ...prev, included_extras: next };
    });
  };

  const pageButtons = useMemo(() => buildPageButtons(page, pagination.totalPages || 0), [page, pagination.totalPages]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* TOASTS */}
      <div className="fixed right-4 top-4 z-[9999] w-[360px] max-w-[92vw] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "border bg-white px-3 py-2 shadow-sm",
              "rounded-none",
              t.kind === "success" ? "border-emerald-200" : "",
              t.kind === "error" ? "border-rose-200" : "",
              t.kind === "info" ? "border-zinc-200" : "",
            ].join(" ")}
            role="status"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold tracking-tight">
                  {t.kind === "success" ? "✅ " : t.kind === "error" ? "⛔ " : "ℹ️ "}
                  {t.title}
                </div>
                {t.message ? <div className="text-xs text-zinc-600 mt-0.5">{t.message}</div> : null}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-xs font-extrabold text-zinc-500 hover:text-zinc-800"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-[1200px] px-4 py-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs text-zinc-500">Administración</div>
            <div className="text-3xl font-extrabold tracking-tight">Gestionar Productos</div>
            <div className="text-sm text-zinc-600 mt-1">
              Crea, edita y administra productos, sabores fijos y extras incluidos.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                loadMeta();
                pushToast("info", "Meta actualizada", "Categorías/sabores/extras fueron refrescados.");
              }}
              className="h-9 px-3 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
              type="button"
            >
              Refrescar meta
            </button>

            {editingId ? (
              <button
                onClick={() => {
                  resetForm();
                  pushToast("info", "Edición cancelada", "Volviste a modo crear.");
                }}
                className="h-9 px-3 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
                type="button"
              >
                Cancelar edición
              </button>
            ) : null}
          </div>
        </div>

        {/* FORM */}
        <div ref={formRef} className="border border-zinc-200 bg-white rounded-none">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-extrabold tracking-tight">{editingId ? "Editar producto" : "Crear producto"}</div>
              <div className="text-xs text-zinc-500">
                {requiresFlavor ? "Este producto pedirá sabor al vender." : "Captura el producto y guarda."}
              </div>
            </div>

            {editingId ? (
              <span className="text-[11px] font-extrabold px-2 py-1 border border-amber-200 bg-amber-50 text-amber-700 rounded-none">
                Editando
              </span>
            ) : null}
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Nombre</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  className="h-10 w-full px-3 border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 rounded-none"
                  placeholder="Ej. Paquete Acompañes"
                  disabled={saving}
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Categoría</label>
                <input
                  list="categories-list"
                  value={form.category}
                  onChange={(e) => {
                    const newCategory = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      category: newCategory,
                      included_extras: newCategory === "Extras" ? [] : prev.included_extras,
                      flavor_id: newCategory === STORED_FLAVOR_CATEGORY ? prev.flavor_id : "",
                    }));
                  }}
                  className="h-10 w-full px-3 border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 rounded-none"
                  placeholder="Pollos / Especialidades / Paquetes / Miércoles / Extras"
                  disabled={saving}
                />
                <datalist id="categories-list">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>

                <div className="text-[11px] text-zinc-500 mt-1">
                  {storesFlavor ? "Especialidades: requiere sabor fijo." : requiresFlavor ? "Pedirá sabor al vender." : "No requiere sabor."}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">Precio base</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  className="h-10 w-full px-3 border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 rounded-none"
                  placeholder="0"
                  disabled={saving}
                />
                <div className="text-[11px] text-zinc-500 mt-1">Se mostrará como {money(Number(form.price || 0))}</div>
              </div>
            </div>

            {/* Sabor fijo */}
            {storesFlavor ? (
              <div className="border border-zinc-200 bg-zinc-50 rounded-none p-3">
                <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-3 items-end">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Sabor fijo (Especialidades)</label>
                    <select
                      value={form.flavor_id}
                      onChange={(e) => setForm({ ...form, flavor_id: e.target.value })}
                      className="h-10 w-full px-3 border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 rounded-none"
                      disabled={saving}
                    >
                      <option value="">-- Selecciona sabor --</option>
                      {flavors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-sm text-zinc-600">
                    Se guardará este sabor en BD para la categoría <b>Especialidades</b>.
                  </div>
                </div>
              </div>
            ) : null}

            {/* Extras incluidos */}
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-extrabold tracking-tight">Extras incluidos</div>
                  <div className="text-xs text-zinc-500">
                    Solo si NO es categoría <b>Extras</b>.
                  </div>
                </div>

                <div className="text-xs text-zinc-600">
                  Seleccionados: <span className="font-extrabold text-zinc-800">{form.included_extras.length}</span>
                </div>
              </div>

              {form.category === "Extras" ? (
                <div className="border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm rounded-none">
                  Los productos de categoría <b>Extras</b> no pueden incluir otros extras.
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {extras.map((ex) => {
                    const checked = form.included_extras.includes(ex.id);
                    return (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => toggleExtra(ex.id)}
                        className={[
                          "px-3 py-2 border text-left text-sm transition rounded-none",
                          checked
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                        ].join(" ")}
                        disabled={saving}
                        title={checked ? "Quitar extra" : "Agregar extra"}
                      >
                        <div className="font-extrabold text-sm">{ex.name}</div>
                        <div className="text-[11px] opacity-80">{money(ex.price)}</div>
                      </button>
                    );
                  })}

                  {extras.length === 0 ? (
                    <div className="text-xs text-zinc-500">No hay extras definidos.</div>
                  ) : null}
                </div>
              )}

              {selectedExtrasNames.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-2">
                  {selectedExtrasNames.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center gap-2 px-2 py-1 text-[11px] font-extrabold border border-zinc-200 bg-white rounded-none"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <button
                onClick={() => {
                  resetForm();
                  pushToast("info", "Formulario limpio", "Listo para capturar un producto nuevo.");
                }}
                className="h-10 px-4 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
                type="button"
                disabled={saving}
              >
                Limpiar
              </button>

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || saving}
                className={[
                  "h-10 px-5 text-xs font-extrabold border rounded-none",
                  canSubmit && !saving
                    ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                    : "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed",
                ].join(" ")}
                type="button"
              >
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear producto"}
              </button>
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <div className="border border-zinc-200 bg-white rounded-none">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-extrabold tracking-tight">Filtros</div>
              <div className="text-xs text-zinc-500">
                Total: <span className="font-extrabold text-zinc-700">{pagination.total}</span> • Página{" "}
                <span className="font-extrabold text-zinc-700">{pagination.page}</span> de{" "}
                <span className="font-extrabold text-zinc-700">{pagination.totalPages || 1}</span>
              </div>
            </div>

            <button
              onClick={() => {
                loadProducts(page);
                pushToast("info", "Actualizado", "Se refrescó el listado.");
              }}
              className="h-9 px-3 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
              type="button"
            >
              Refrescar
            </button>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs text-zinc-500 mb-1">Buscar</label>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="h-10 w-full px-3 border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 rounded-none"
                placeholder="Nombre…"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Categoría</label>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                  pushToast("info", "Filtro categoría", e.target.value ? `Categoría: ${e.target.value}` : "Todas las categorías.");
                }}
                className="h-10 w-full px-3 border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 rounded-none"
              >
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-xs font-extrabold text-zinc-700 select-none">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked);
                  setPage(1);
                  pushToast("info", "Filtro aplicado", e.target.checked ? "Mostrando eliminados." : "Ocultando eliminados.");
                }}
                className="h-4 w-4 border border-zinc-300 rounded-none"
              />
              Ver eliminados
            </label>
          </div>
        </div>

        {/* TABLE */}
        <div className="border border-zinc-200 bg-white rounded-none overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm font-extrabold tracking-tight">Productos</div>
            {loadingList ? <div className="text-xs text-zinc-500">Cargando…</div> : null}
          </div>

          {!loadingList && products.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-base font-extrabold tracking-tight">Sin resultados</div>
              <div className="text-sm text-zinc-500 mt-1">
                {search.trim() || categoryFilter ? "Prueba con otros filtros." : "Aún no hay productos registrados."}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[980px]">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Nombre</th>
                      <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Categoría</th>
                      <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Precio</th>
                      <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Extras incluidos</th>
                      <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Sabor</th>
                      <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Estado</th>
                      <th className="px-4 py-3 text-right text-xs font-extrabold text-zinc-700">Acciones</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-200">
                    {loadingList && products.length === 0 ? (
                      Array.from({ length: 6 }).map((_, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-4"><div className="h-4 w-44 bg-zinc-100 animate-pulse" /></td>
                          <td className="px-4 py-4"><div className="h-4 w-24 bg-zinc-100 animate-pulse" /></td>
                          <td className="px-4 py-4"><div className="h-4 w-20 bg-zinc-100 animate-pulse" /></td>
                          <td className="px-4 py-4"><div className="h-4 w-60 bg-zinc-100 animate-pulse" /></td>
                          <td className="px-4 py-4"><div className="h-4 w-28 bg-zinc-100 animate-pulse" /></td>
                          <td className="px-4 py-4"><div className="h-4 w-20 bg-zinc-100 animate-pulse" /></td>
                          <td className="px-4 py-4 text-right"><div className="h-9 w-36 bg-zinc-100 animate-pulse ml-auto" /></td>
                        </tr>
                      ))
                    ) : (
                      products.map((p) => {
                        const active = p.is_deleted === 0;

                        const fixedFlavorName = p.flavor_id ? flavorNameById.get(p.flavor_id) : undefined;
                        const flavorCell = fixedFlavorName
                          ? fixedFlavorName
                          : p.requires_flavor
                          ? "(al vender)"
                          : "-";

                        const extrasNames =
                          (p.included_extras || [])
                            .map((id) => extraNameById.get(id))
                            .filter(Boolean)
                            .slice(0, 4) as string[];

                        const extrasMore = Math.max(0, (p.included_extras?.length || 0) - extrasNames.length);

                        return (
                          <tr key={p.id} className="hover:bg-zinc-50 transition">
                            <td className="px-4 py-3">
                              <div className="font-extrabold text-zinc-900">{p.name}</div>
                              <div className="text-[11px] text-zinc-500">Creado: {formatDateMX(p.created_at)}</div>
                            </td>

                            <td className="px-4 py-3 text-zinc-700">{p.category}</td>

                            <td className="px-4 py-3 text-zinc-700">{money(p.price)}</td>

                            <td className="px-4 py-3">
                              {extrasNames.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {extrasNames.map((n) => (
                                    <span
                                      key={n}
                                      className="inline-flex items-center px-2 py-1 text-[11px] font-extrabold border border-zinc-200 bg-white rounded-none"
                                    >
                                      {n}
                                    </span>
                                  ))}
                                  {extrasMore ? (
                                    <span className="inline-flex items-center px-2 py-1 text-[11px] font-extrabold border border-zinc-200 bg-zinc-50 rounded-none">
                                      +{extrasMore}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-zinc-500">-</span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-zinc-700">{flavorCell}</td>

                            <td className="px-4 py-3">
                              <span
                                className={[
                                  "inline-flex items-center gap-2 text-[11px] font-extrabold px-2 py-1 border rounded-none",
                                  active
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700",
                                ].join(" ")}
                              >
                                <span className={active ? "text-emerald-600" : "text-rose-600"}>●</span>
                                {active ? "Activo" : "Eliminado"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex gap-2">
                                <button
                                  onClick={() => onEdit(p)}
                                  className="h-9 px-3 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
                                  type="button"
                                >
                                  Editar
                                </button>

                                {active ? (
                                  <button
                                    onClick={() => handleDelete(p.id, p.name)}
                                    className="h-9 px-3 text-xs font-extrabold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-none"
                                    type="button"
                                  >
                                    Eliminar
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleRestore(p.id, p.name)}
                                    className="h-9 px-3 text-xs font-extrabold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-none"
                                    type="button"
                                  >
                                    Restaurar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 ? (
                <div className="px-4 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between gap-3 flex-wrap">
                  <button
                    onClick={() => setPage((p) => clamp(p - 1, 1, pagination.totalPages))}
                    disabled={page === 1}
                    className={[
                      "h-9 px-3 text-xs font-extrabold border rounded-none",
                      page === 1
                        ? "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed"
                        : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                    ].join(" ")}
                    type="button"
                  >
                    ← Anterior
                  </button>

                  <div className="flex items-center gap-1">
                    {pageButtons.map((p, idx) =>
                      p === "dots" ? (
                        <span key={`d-${idx}`} className="px-2 text-xs text-zinc-500 select-none">
                          …
                        </span>
                      ) : (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={[
                            "h-9 min-w-[36px] px-2 text-xs font-extrabold border rounded-none",
                            p === page
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                          ].join(" ")}
                          type="button"
                        >
                          {p}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    onClick={() => setPage((p) => clamp(p + 1, 1, pagination.totalPages))}
                    disabled={page === pagination.totalPages}
                    className={[
                      "h-9 px-3 text-xs font-extrabold border rounded-none",
                      page === pagination.totalPages
                        ? "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed"
                        : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                    ].join(" ")}
                    type="button"
                  >
                    Siguiente →
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Micro help */}
        <div className="text-[11px] text-zinc-500">
          Tip: <span className="font-extrabold text-zinc-700">Especialidades</span> guarda sabor fijo;{" "}
          <span className="font-extrabold text-zinc-700">Pollos/Paquetes/Miércoles</span> piden sabor al vender.
        </div>
      </div>
    </div>
  );
}
