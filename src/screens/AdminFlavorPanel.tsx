import { useEffect, useState } from "react";

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

export function AdminFlavorPanel() {
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [newFlavorName, setNewFlavorName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Cargar sabores
  const loadFlavors = async (pageNum: number = 1, searchTerm: string = "") => {
    try {
      setLoading(true);
      setError("");
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
        setError("Error al cargar sabores");
      }
    } catch (err) {
      setError("Error de conexión");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlavors(page, search);
  }, [page, search, showDeleted]);

  // Crear sabor
  const handleCreateFlavor = async () => {
    if (!newFlavorName.trim()) {
      setError("El nombre es requerido");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = (await window.api.flavors.create({ name: newFlavorName })) as {
        ok: boolean;
        message?: string;
      };

      if (response.ok) {
        setSuccess("Sabor creado exitosamente");
        setNewFlavorName("");
        setPage(1);
        setTimeout(() => {
          loadFlavors(1, search);
          setSuccess("");
        }, 500);
      } else {
        setError(response.message || "Error al crear sabor");
      }
    } catch (err) {
      setError("Error de conexión");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Eliminar sabor
  const handleDeleteFlavor = async (id: string) => {
    if (window.confirm("¿Eliminar este sabor?")) {
      try {
        setError("");
        const response = (await window.api.flavors.delete({ id })) as { ok: boolean };
        if (response.ok) {
          setSuccess("Sabor eliminado");
          setTimeout(() => {
            loadFlavors(page, search);
            setSuccess("");
          }, 500);
        }
      } catch (err) {
        setError("Error al eliminar");
        console.error(err);
      }
    }
  };

  // Restaurar sabor
  const handleRestoreFlavor = async (id: string) => {
    try {
      setError("");
      const response = (await window.api.flavors.restore({ id })) as { ok: boolean };
      if (response.ok) {
        setSuccess("Sabor restaurado");
        setTimeout(() => {
          loadFlavors(page, search);
          setSuccess("");
        }, 500);
      }
    } catch (err) {
      setError("Error al restaurar");
      console.error(err);
    }
  };

  return (
    <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Gestionar Sabores</h1>
          <p className="text-gray-600">Crea, edita y administra el catálogo de sabores</p>
        </div>

        {/* Alertas */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {/* Crear nuevo sabor */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Agregar Nuevo Sabor</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newFlavorName}
              onChange={(e) => setNewFlavorName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleCreateFlavor()}
              placeholder="Nombre del sabor..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              onClick={handleCreateFlavor}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
            >
              {loading ? "..." : "Guardar"}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Presiona Enter o usa el botón Guardar.</p>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Búsqueda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Nombre del sabor..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Ver eliminados */}
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => {
                    setShowDeleted(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Ver eliminados</span>
              </label>
            </div>

            {/* Info */}
            <div className="flex items-end justify-end">
              <span className="text-sm text-gray-600">
                Total: {pagination.total} | Página {pagination.page} de {pagination.totalPages}
              </span>
            </div>
          </div>
        </div>

        {/* Tabla de sabores */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loading && flavors.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : flavors.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay sabores</div>
          ) : (
            <>
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Creado
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {flavors.map((flavor) => (
                    <tr key={flavor.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {flavor.name}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            flavor.is_deleted === 0
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {flavor.is_deleted === 0 ? "Activo" : "Eliminado"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(flavor.created_at).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {flavor.is_deleted === 0 ? (
                          <button
                            onClick={() => handleDeleteFlavor(flavor.id)}
                            className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition font-medium"
                          >
                            Eliminar
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRestoreFlavor(flavor.id)}
                            className="px-3 py-1 text-sm bg-green-50 text-green-600 rounded hover:bg-green-100 transition font-medium"
                          >
                            Restaurar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Paginación */}
              {pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center bg-gray-50">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 transition"
                  >
                    ← Anterior
                  </button>

                  <div className="flex gap-2">
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`px-3 py-2 rounded transition ${
                          p === page
                            ? "bg-blue-600 text-white"
                            : "bg-gray-200 text-gray-800 hover:bg-gray-300"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                    disabled={page === pagination.totalPages}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 transition"
                  >
                    Siguiente →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
