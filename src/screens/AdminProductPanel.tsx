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

export function AdminProductPanel() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [flavors, setFlavors] = useState<FlavorOption[]>([]);
  const [extras, setExtras] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "",
    price: 0,
    flavor_id: "",
    included_extras: [] as string[],
  });

  const requiresFlavor = useMemo(() => FLAVOR_REQUIRED_CATEGORIES.includes(form.category), [form.category]);
  const storesFlavor = useMemo(() => form.category === STORED_FLAVOR_CATEGORY, [form.category]);

  const loadProducts = async (nextPage = 1) => {
    try {
      setLoading(true);
      setError("");
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
        setError("Error al cargar productos");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const loadMeta = async () => {
    try {
      const [catResp, flavorsResp, extrasResp] = await Promise.all([
        window.api.products.categories() as Promise<{ ok: boolean; categories: string[] }>,
        window.api.getFlavors() as Promise<{ ok: boolean; rows: FlavorOption[] }>,
        window.api.products.list({ page: 1, pageSize: 200, category: "Extras", showDeleted: false }) as Promise<ListResponse>,
      ]);

      if (catResp?.ok) setCategories(catResp.categories);
      if (flavorsResp?.ok) setFlavors(flavorsResp.rows || []);
      if (extrasResp?.ok) setExtras(extrasResp.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadProducts(page);
  }, [page, search, showDeleted, categoryFilter]);

  useEffect(() => {
    loadMeta();
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

    // Lleva al usuario al formulario al editar
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("El nombre es requerido");
      return;
    }
    if (!form.category.trim()) {
      setError("La categoría es requerida");
      return;
    }
    if (storesFlavor && !form.flavor_id) {
      setError("Selecciona un sabor para esta especialidad");
      return;
    }

    const payload = {
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price) || 0,
      requires_flavor: requiresFlavor,
      flavor_id: storesFlavor ? form.flavor_id || null : null,
      included_extras: form.included_extras,
    };

    try {
      setLoading(true);
      setError("");
      let resp: any;
      if (editingId) {
        resp = await window.api.products.update({ ...payload, id: editingId });
      } else {
        resp = await window.api.products.create(payload);
      }

      if (resp.ok) {
        setSuccess(editingId ? "Producto actualizado" : "Producto creado");
        resetForm();
        setPage(1);
        loadProducts(1);
        setTimeout(() => setSuccess(""), 800);
      } else {
        setError(resp.message || "Error al guardar");
      }
    } catch (err) {
      console.error(err);
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este producto?")) return;
    await window.api.products.delete({ id });
    loadProducts(page);
  };

  const handleRestore = async (id: string) => {
    await window.api.products.restore({ id });
    loadProducts(page);
  };

  const toggleExtra = (id: string) => {
    setForm((prev) => {
      const exists = prev.included_extras.includes(id);
      return {
        ...prev,
        included_extras: exists
          ? prev.included_extras.filter((x) => x !== id)
          : [...prev.included_extras, id],
      };
    });
  };

  return (
    <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestionar Productos</h1>
            <p className="text-gray-600">Crea, edita y administra productos, sabores fijos y extras incluidos</p>
          </div>
          {editingId && (
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-200 text-sm font-bold"
            >
              Cancelar edición
            </button>
          )}
        </div>

        {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded">{error}</div>}
        {success && <div className="p-3 bg-green-50 text-green-700 border border-green-200 rounded">{success}</div>}

        {/* Formulario */}
        <div ref={formRef} className="bg-white rounded-xl shadow-md p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-700">Nombre</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="Ej. Paquete Acompañes"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Categoría</label>
              <input
                list="categories-list"
                value={form.category}
                onChange={(e) => {
                  const newCategory = e.target.value;
                  setForm({ 
                    ...form, 
                    category: newCategory,
                    included_extras: newCategory === "Extras" ? [] : form.included_extras
                  });
                }}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="Pollos / Especialidades / Paquetes / Miércoles / Extras"
              />
              <datalist id="categories-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-sm text-gray-700">Precio base</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 border rounded-lg"
                placeholder="0"
              />
            </div>
          </div>

          {editingId && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Editando producto
            </div>
          )}

          {/* Sabor fijo para Especialidades */}
          {storesFlavor && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-700">Sabor (fijo)</label>
                <select
                  value={form.flavor_id}
                  onChange={(e) => setForm({ ...form, flavor_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                >
                  <option value="">-- Selecciona sabor --</option>
                  {flavors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end text-sm text-gray-600">
                Este sabor se guardará en BD para las especialidades.
              </div>
            </div>
          )}

          <div className="text-sm text-gray-700 font-semibold">Extras incluidos (solo productos que no sean de categoría Extras)</div>
          {form.category === "Extras" ? (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Los productos de categoría "Extras" no pueden incluir otros extras
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {extras.map((ex) => (
                <label key={ex.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.included_extras.includes(ex.id)}
                    onChange={() => toggleExtra(ex.id)}
                    className="w-4 h-4"
                  />
                  <span>{ex.name}</span>
                </label>
              ))}
              {extras.length === 0 && <div className="text-xs text-gray-500">No hay extras definidos</div>}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={resetForm}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200"
            >
              Limpiar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-black text-white hover:bg-gray-800 disabled:bg-gray-400 font-bold"
            >
              {editingId ? "Guardar cambios" : "Crear producto"}
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-md p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm text-gray-700">Buscar</label>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
              placeholder="Nombre..."
            />
          </div>
          <div>
            <label className="text-sm text-gray-700">Categoría</label>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
              }}
              className="w-full mt-1 px-3 py-2 border rounded-lg"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => {
                setShowDeleted(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4"
            />
            Ver eliminados
          </label>
          <div className="ml-auto text-sm text-gray-600">
            Total: {pagination.total} | Página {pagination.page} de {pagination.totalPages || 1}
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {loading && products.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Cargando...</div>
          ) : products.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No hay productos</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-left">Precio</th>
                  <th className="px-4 py-3 text-left">Extras incluidos</th>
                  <th className="px-4 py-3 text-left">Sabor fijo</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => {
                  const statusLabel = p.is_deleted ? "Eliminado" : "Activo";
                  const statusClass = p.is_deleted
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700";
                  const flavorName = flavors.find((f) => f.id === p.flavor_id)?.name;
                  const extrasNames = p.included_extras
                    .map((id) => extras.find((ex) => ex.id === id)?.name)
                    .filter(Boolean)
                    .join(", ") || "-";
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-gray-700">{p.category}</td>
                      <td className="px-4 py-3 text-gray-700">${p.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-gray-700">{extrasNames}</td>
                      <td className="px-4 py-3 text-gray-700">{flavorName || (p.requires_flavor ? "(al vender)" : "-")}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          onClick={() => onEdit(p)}
                          className="px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                        >
                          Editar
                        </button>
                        {p.is_deleted ? (
                          <button
                            onClick={() => handleRestore(p.id)}
                            className="px-3 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100"
                          >
                            Restaurar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50 text-sm">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded bg-gray-200 text-gray-800 disabled:opacity-50"
              >
                ← Anterior
              </button>
              <div className="flex gap-2">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded ${p === page ? "bg-blue-600 text-white" : "bg-gray-200"}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 rounded bg-gray-200 text-gray-800 disabled:opacity-50"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
