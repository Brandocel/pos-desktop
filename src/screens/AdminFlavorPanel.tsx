import { useEffect, useMemo, useRef, useState } from "react";

interface Flavor {
  id: string;
  name: string;
  is_deleted: number;
  created_at: string;
}

interface ListResponse {
  ok: boolean;
  data: Flavor[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: string; kind: ToastKind; title: string; message?: string };

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function AdminFlavorPanel() {
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  const [newFlavorName, setNewFlavorName] = useState("");

  const [upgradePrice, setUpgradePrice] = useState<number>(20);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeSaving, setUpgradeSaving] = useState(false);
  const [upgradeDirty, setUpgradeDirty] = useState(false);

  // Toast system (sin libs)
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

  useEffect(() => {
    async function loadUpgradePrice() {
      try {
        setUpgradeLoading(true);
        const res = await window.api.settings?.get({ key: "specialty_upgrade_price" });
        if (res?.ok && res?.value != null) {
          const val = Number(res.value);
          if (Number.isFinite(val)) {
            setUpgradePrice(val);
            setUpgradeDirty(false);
          }
        }
      } catch (err) {
        console.error(err);
        pushToast("error", "No se pudo cargar", "Error al leer el precio de upgrade.");
      } finally {
        setUpgradeLoading(false);
      }
    }
    loadUpgradePrice();
  }, []);

  const canCreate = useMemo(() => newFlavorName.trim().length >= 2, [newFlavorName]);

  const loadFlavors = async (pageNum: number = 1, searchTerm: string = "") => {
    try {
      setLoading(true);
      const response = (await window.api.flavors?.list({
        page: pageNum,
        pageSize: 10,
        search: searchTerm,
        showDeleted,
      })) as ListResponse;

      if (response.ok) {
        setFlavors(response.data);
        setPagination(response.pagination);
      } else {
        pushToast("error", "No se pudo cargar", "Ocurrió un error al cargar sabores.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error de conexión", "Revisa tu API / bridge de Electron.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlavors(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, showDeleted]);

  const handleCreateFlavor = async () => {
    const name = newFlavorName.trim();
    if (!name) {
      pushToast("error", "Nombre requerido", "Escribe el nombre del sabor.");
      return;
    }

    try {
      setCreating(true);
      const response = (await window.api.flavors.create({ name })) as {
        ok: boolean;
        message?: string;
      };

      if (response.ok) {
        pushToast("success", "Sabor creado", `"${name}" se agregó al catálogo.`);
        setNewFlavorName("");
        setPage(1);
        await loadFlavors(1, search);
      } else {
        pushToast("error", "No se pudo crear", response.message || "Intenta de nuevo.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error de conexión", "No se pudo crear el sabor.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteFlavor = async (id: string, flavorName?: string) => {
    const ok = window.confirm(`¿Eliminar este sabor${flavorName ? `: "${flavorName}"` : ""}?`);
    if (!ok) return;

    try {
      const response = (await window.api.flavors.delete({ id })) as { ok: boolean; message?: string };
      if (response.ok) {
        pushToast("success", "Sabor eliminado", flavorName ? `"${flavorName}" se movió a eliminados.` : undefined);
        await loadFlavors(page, search);
      } else {
        pushToast("error", "No se pudo eliminar", response.message || "Intenta de nuevo.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error al eliminar", "Revisa tu conexión / API.");
    }
  };

  const handleRestoreFlavor = async (id: string, flavorName?: string) => {
    try {
      const response = (await window.api.flavors.restore({ id })) as { ok: boolean; message?: string };
      if (response.ok) {
        pushToast("success", "Sabor restaurado", flavorName ? `"${flavorName}" volvió a estar activo.` : undefined);
        await loadFlavors(page, search);
      } else {
        pushToast("error", "No se pudo restaurar", response.message || "Intenta de nuevo.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error al restaurar", "Revisa tu conexión / API.");
    }
  };

  const handleSaveUpgradePrice = async () => {
    try {
      setUpgradeSaving(true);
      const res = await window.api.settings?.set({
        key: "specialty_upgrade_price",
        value: String(Number(upgradePrice) || 0),
      });

      if (res?.ok) {
        pushToast("success", "Upgrade actualizado", "Se guardo el nuevo precio.");
        setUpgradeDirty(false);
      } else {
        pushToast("error", "No se pudo guardar", res?.message || "Intenta de nuevo.");
      }
    } catch (err) {
      console.error(err);
      pushToast("error", "Error de conexion", "No se pudo guardar el precio.");
    } finally {
      setUpgradeSaving(false);
    }
  };

  // Paginación compacta: muestra [1] ... [p-1] [p] [p+1] ... [last]
  const pageButtons = useMemo(() => {
    const total = pagination.totalPages || 0;
    if (total <= 1) return [];
    const current = page;

    const items: (number | "dots")[] = [];
    const add = (x: number | "dots") => items.push(x);

    add(1);
    if (current - 2 > 2) add("dots");

    for (let p = current - 1; p <= current + 1; p++) {
      if (p > 1 && p < total) add(p);
    }

    if (current + 2 < total) add("dots");
    if (total > 1) add(total);

    // remove duplicates
    return items.filter((v, i) => items.indexOf(v) === i);
  }, [pagination.totalPages, page]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* TOASTS */}
      <div className="fixed right-4 top-4 z-[9999] w-[360px] max-w-[92vw] space-y-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "border bg-white px-3 py-2 shadow-sm",
              "rounded-none", // ✅ sin redondeado
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

      <div className="mx-auto max-w-[980px] px-4 py-5">
        {/* Header */}
        <div className="mb-4">
          <div className="text-xs text-zinc-500">Administración</div>
          <div className="text-3xl font-extrabold tracking-tight">Gestionar Sabores</div>
          <div className="text-sm text-zinc-600 mt-1">Crea y administra el catálogo de sabores.</div>
        </div>

        {/* Panel: Crear */}
        <div className="border border-zinc-200 bg-white rounded-none mb-4">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold tracking-tight">Precio de upgrade</div>
              <div className="text-xs text-zinc-500">Especialidades por porcion.</div>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Precio</label>
              <input
                type="number"
                value={upgradePrice}
                onChange={(e) => {
                  setUpgradePrice(Number(e.target.value));
                  setUpgradeDirty(true);
                }}
                className={[
                  "h-10 w-full px-3 border bg-white text-sm outline-none",
                  "border-zinc-200 focus:border-zinc-400",
                  "rounded-none",
                ].join(" ")}
                disabled={upgradeLoading}
              />
              <div className="text-[11px] text-zinc-500 mt-1">Valor actual por upgrade.</div>
            </div>

            <button
              onClick={handleSaveUpgradePrice}
              disabled={upgradeSaving || upgradeLoading || !upgradeDirty}
              className={[
                "h-10 px-4 text-xs font-extrabold border",
                "rounded-none",
                !upgradeSaving && !upgradeLoading && upgradeDirty
                  ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                  : "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed",
              ].join(" ")}
              type="button"
            >
              {upgradeSaving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>

        {/* Panel: Crear */}
        <div className="border border-zinc-200 bg-white rounded-none">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold tracking-tight">Crear sabor</div>
              <div className="text-xs text-zinc-500">Presiona Enter para guardar.</div>
            </div>
            <button
              onClick={() => {
                setNewFlavorName("");
                pushToast("info", "Formulario limpio", "Listo para capturar un nuevo sabor.");
              }}
              className="h-9 px-3 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
              type="button"
            >
              Limpiar
            </button>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Nombre</label>
                <input
                  type="text"
                  value={newFlavorName}
                  onChange={(e) => setNewFlavorName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateFlavor();
                  }}
                  placeholder="Ej: Adobado"
                  className={[
                    "h-10 w-full px-3 border bg-white text-sm outline-none",
                    "border-zinc-200 focus:border-zinc-400",
                    "rounded-none", // ✅ sin redondeado
                  ].join(" ")}
                  disabled={creating}
                />
                <div className="text-[11px] text-zinc-500 mt-1">
                  Mínimo 2 caracteres. Evita duplicados.
                </div>
              </div>

              <button
                onClick={handleCreateFlavor}
                disabled={!canCreate || creating}
                className={[
                  "h-10 px-4 text-xs font-extrabold border",
                  "rounded-none",
                  canCreate && !creating
                    ? "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800"
                    : "border-zinc-200 bg-zinc-100 text-zinc-400 cursor-not-allowed",
                ].join(" ")}
                type="button"
              >
                {creating ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>

        {/* Panel: filtros */}
        <div className="mt-4 border border-zinc-200 bg-white rounded-none">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-extrabold tracking-tight">Listado</div>
              <div className="text-xs text-zinc-500">
                Total: <span className="font-extrabold text-zinc-700">{pagination.total}</span> • Página{" "}
                <span className="font-extrabold text-zinc-700">{pagination.page}</span> de{" "}
                <span className="font-extrabold text-zinc-700">{pagination.totalPages || 1}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
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

              <button
                onClick={() => {
                  loadFlavors(page, search);
                  pushToast("info", "Actualizado", "Se refrescó el listado.");
                }}
                className="h-9 px-3 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
                type="button"
              >
                Refrescar
              </button>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Buscar</label>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nombre…"
                className="h-10 w-full px-3 border border-zinc-200 bg-white text-sm outline-none focus:border-zinc-400 rounded-none"
              />
            </div>

            <button
              onClick={() => {
                setSearch("");
                setPage(1);
                pushToast("info", "Búsqueda limpia", "Mostrando todos los sabores.");
              }}
              className="h-10 px-4 text-xs font-extrabold border border-zinc-200 bg-white hover:bg-zinc-50 rounded-none"
              type="button"
            >
              Limpiar búsqueda
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-4 border border-zinc-200 bg-white rounded-none overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
            <div className="text-sm font-extrabold tracking-tight">Sabores</div>
            {loading ? <div className="text-xs text-zinc-500">Cargando…</div> : null}
          </div>

          {/* Estados */}
          {!loading && flavors.length === 0 ? (
            <div className="p-10 text-center">
              <div className="text-base font-extrabold tracking-tight">Sin resultados</div>
              <div className="text-sm text-zinc-500 mt-1">
                {search.trim()
                  ? "No encontramos sabores con ese nombre."
                  : "Aún no hay sabores registrados."}
              </div>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-extrabold text-zinc-700">Creado</th>
                    <th className="px-4 py-3 text-right text-xs font-extrabold text-zinc-700">Acciones</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-200">
                  {loading && flavors.length === 0 ? (
                    Array.from({ length: 6 }).map((_, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-4">
                          <div className="h-4 w-40 bg-zinc-100 animate-pulse" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-4 w-20 bg-zinc-100 animate-pulse" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="h-4 w-24 bg-zinc-100 animate-pulse" />
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="h-8 w-24 bg-zinc-100 animate-pulse ml-auto" />
                        </td>
                      </tr>
                    ))
                  ) : (
                    flavors.map((flavor) => {
                      const active = flavor.is_deleted === 0;
                      return (
                        <tr key={flavor.id} className="hover:bg-zinc-50 transition">
                          <td className="px-4 py-4 text-sm font-extrabold text-zinc-900">{flavor.name}</td>

                          <td className="px-4 py-4 text-sm">
                            <span
                              className={[
                                "inline-flex items-center gap-2 text-[11px] font-extrabold px-2 py-1 border",
                                "rounded-none",
                                active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700",
                              ].join(" ")}
                            >
                              <span className={active ? "text-emerald-600" : "text-rose-600"}>●</span>
                              {active ? "Activo" : "Eliminado"}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-sm text-zinc-600">{formatDateMX(flavor.created_at)}</td>

                          <td className="px-4 py-4 text-right">
                            {active ? (
                              <button
                                onClick={() => handleDeleteFlavor(flavor.id, flavor.name)}
                                className="h-9 px-3 text-xs font-extrabold border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-none"
                                type="button"
                              >
                                Eliminar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestoreFlavor(flavor.id, flavor.name)}
                                className="h-9 px-3 text-xs font-extrabold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-none"
                                type="button"
                              >
                                Restaurar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Footer / Paginación */}
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

        {/* Micro ayuda */}
        <div className="mt-3 text-[11px] text-zinc-500">
          Tip: Puedes crear sabores rápido con <span className="font-extrabold text-zinc-700">Enter</span>. Usa{" "}
          <span className="font-extrabold text-zinc-700">Ver eliminados</span> para restaurar.
        </div>
      </div>
    </div>
  );
}
