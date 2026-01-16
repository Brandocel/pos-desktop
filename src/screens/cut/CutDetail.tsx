// src/pos/screens/cut/CutDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { money } from "../../pos/utils/money";
import { CutProductRow, normText, safeNum } from "./cutHelpers";

// ✅ Icons
import {
  Search,
  ChevronDown,
  ChevronUp,
  Drumstick,
  Package,
  Soup,
  CalendarClock,
  Salad,
  CupSoda,
  Trash2,
  Boxes,
} from "lucide-react";

type Props = {
  uiInputClass: string;
  products: CutProductRow[];
  grandTotal: number;
};

type CatUI = {
  key: string;
  label: string;
  icon: React.ReactNode;
  headerClass: string;
  panelBorder: string;
  rowHover: string;
};

function basePolloName(name: string) {
  // ✅ Quita " - Sabor" / "– Sabor" si viene pegado al nombre
  const raw = String(name ?? "").trim();

  // Separadores comunes: " - ", " – ", "-"
  const seps = [" - ", " – ", " — ", "-"];
  for (const sep of seps) {
    const idx = raw.indexOf(sep);
    if (idx > -1) return raw.slice(0, idx).trim();
  }
  return raw;
}


export function CutDetail({ uiInputClass, products, grandTotal }: Props) {
  // UX
  const [detailQuery, setDetailQuery] = useState("");
  const [onlyProduction, setOnlyProduction] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ✅ Mapa UI por categoría (colores + iconos)
  const catUI: Record<string, CatUI> = useMemo(
    () => ({
      Pollos: {
        key: "Pollos",
        label: "Pollos",
        icon: <Drumstick className="w-4 h-4" />,
        headerClass: "bg-orange-100 text-orange-900",
        panelBorder: "border-orange-200",
        rowHover: "hover:bg-orange-50",
      },
      Paquetes: {
        key: "Paquetes",
        label: "Paquetes",
        icon: <Package className="w-4 h-4" />,
        headerClass: "bg-amber-100 text-amber-900",
        panelBorder: "border-amber-200",
        rowHover: "hover:bg-amber-50",
      },
      Especialidades: {
        key: "Especialidades",
        label: "Especialidades",
        icon: <Soup className="w-4 h-4" />,
        headerClass: "bg-purple-100 text-purple-900",
        panelBorder: "border-purple-200",
        rowHover: "hover:bg-purple-50",
      },
      Miércoles: {
        key: "Miércoles",
        label: "Miércoles",
        icon: <CalendarClock className="w-4 h-4" />,
        headerClass: "bg-sky-100 text-sky-900",
        panelBorder: "border-sky-200",
        rowHover: "hover:bg-sky-50",
      },
      Extras: {
        key: "Extras",
        label: "Extras",
        icon: <Salad className="w-4 h-4" />,
        headerClass: "bg-emerald-100 text-emerald-900",
        panelBorder: "border-emerald-200",
        rowHover: "hover:bg-emerald-50",
      },
      Bebidas: {
        key: "Bebidas",
        label: "Bebidas",
        icon: <CupSoda className="w-4 h-4" />,
        headerClass: "bg-blue-100 text-blue-900",
        panelBorder: "border-blue-200",
        rowHover: "hover:bg-blue-50",
      },
      Desechables: {
        key: "Desechables",
        label: "Desechables",
        icon: <Trash2 className="w-4 h-4" />,
        headerClass: "bg-zinc-100 text-zinc-900",
        panelBorder: "border-zinc-200",
        rowHover: "hover:bg-zinc-50",
      },
    }),
    []
  );

  const productionOrder = useMemo(
    () => ["Pollos", "Paquetes", "Especialidades", "Miércoles", "Extras", "Bebidas", "Desechables"],
    []
  );

  // ✅ 1) Primero: normalizamos rows (para pollos, quitamos sabor en display y también en filtros)
  // ✅ 2) Luego: agrupamos pollos por unidad (1/4, 1/2, 1)
  const normalized = useMemo(() => {
    const rows = (products ?? []).map((p) => {
      const cat = String(p.category ?? "Sin categoría").trim();

      if (cat === "Pollos") {
        const base = basePolloName(p.name);
        return {
          ...p,
          category: "Pollos",
          name: base, // ✅ aquí ya sin sabor
        };
      }

      // Homologar "Desechable" -> "Desechables"
      if (cat === "Desechable") {
        return { ...p, category: "Desechables" };
      }

      return { ...p, category: cat };
    });

    return rows;
  }, [products]);

  // ✅ Agrupación final: Pollos se agrupa por name base (ya sin sabor)
  const groupedRows = useMemo(() => {
    // key: category|name
    const map = new Map<string, CutProductRow>();

    for (const r of normalized) {
      const key = `${r.category}|||${r.name}`;
      const prev = map.get(key);

      if (!prev) {
        map.set(key, { ...r });
      } else {
        map.set(key, {
          ...prev,
          qty: safeNum(prev.qty) + safeNum(r.qty),
          subtotal: safeNum(prev.subtotal) + safeNum(r.subtotal),
        });
      }
    }

    // a array ordenado por qty desc
    const out = Array.from(map.values()).sort((a, b) => safeNum(b.qty) - safeNum(a.qty));
    return out;
  }, [normalized]);

  // filtro buscador
  const filteredProducts = useMemo(() => {
    const q = normText(detailQuery);
    if (!q) return groupedRows;

    return groupedRows.filter((p) => {
      const hay = `${p.name} ${p.category}`;
      return normText(hay).includes(q);
    });
  }, [groupedRows, detailQuery]);

  // agrupar por categoría
  const productsByCategory = useMemo(() => {
    const grouped: Record<string, CutProductRow[]> = {};
    for (const p of filteredProducts) {
      const cat = String(p.category ?? "Sin categoría");
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }
    return grouped;
  }, [filteredProducts]);

  const categoriesOrdered = useMemo(() => {
    const cats = Object.keys(productsByCategory);

    const main = productionOrder.filter((c) => cats.includes(c));
    const rest = cats.filter((c) => !productionOrder.includes(c)).sort((a, b) => a.localeCompare(b));
    const ordered = [...main, ...rest];

    if (onlyProduction && !detailQuery.trim()) {
      return ordered.filter((c) => productionOrder.includes(c));
    }

    return ordered;
  }, [productsByCategory, onlyProduction, detailQuery, productionOrder]);

  function toggleCategory(cat: string) {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    for (const c of Object.keys(productsByCategory)) next[c] = false;
    setCollapsed(next);
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    for (const c of Object.keys(productsByCategory)) next[c] = true;
    setCollapsed(next);
  }

  // init collapsed (al cargar)
  useEffect(() => {
    const cats = Object.keys(productsByCategory);
    const next: Record<string, boolean> = {};
    for (const c of cats) next[c] = !(c === "Pollos" || c === "Extras");
    setCollapsed(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const pill =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-200 bg-zinc-50 text-xs font-extrabold text-zinc-800";
  const actionBtn =
    "h-9 px-3 rounded-xl border border-zinc-200 bg-white text-xs font-extrabold hover:bg-zinc-50 transition inline-flex items-center gap-2";

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
      {/* header */}
      <div className="px-4 py-3 border-b border-zinc-200 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-extrabold text-zinc-900">Detalle específico</div>
          <div className="text-xs text-zinc-500">
            Por categoría y producto. En <b>Pollos</b> no importa el sabor, solo la unidad.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          <label className={`${pill} cursor-pointer select-none`}>
            <input
              type="checkbox"
              className="mr-2"
              checked={onlyProduction}
              onChange={(e) => setOnlyProduction(e.target.checked)}
            />
            Solo producción
          </label>

          <button onClick={expandAll} className={actionBtn} title="Expandir todo">
            <ChevronDown className="w-4 h-4" />
            Expandir
          </button>

          <button onClick={collapseAll} className={actionBtn} title="Colapsar todo">
            <ChevronUp className="w-4 h-4" />
            Colapsar
          </button>
        </div>
      </div>

      {/* body */}
      <div className="p-4">
        {/* buscador */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={detailQuery}
            onChange={(e) => setDetailQuery(e.target.value)}
            placeholder="Buscar en el detalle… (ej: pollo, arroz, refresco)"
            className={`${uiInputClass} pl-9`}
          />
        </div>

        <div className="mt-4">
          {filteredProducts.length === 0 ? (
            <div className="text-sm text-zinc-500">No hay resultados para ese filtro / rango.</div>
          ) : (
            <div className="space-y-4">
              {categoriesOrdered.map((category) => {
                const items = productsByCategory[category] || [];
                if (items.length === 0) return null;

                const ui = catUI[category] || {
                  key: category,
                  label: category,
                  icon: <Boxes className="w-4 h-4" />,
                  headerClass: "bg-zinc-100 text-zinc-900",
                  panelBorder: "border-zinc-200",
                  rowHover: "hover:bg-zinc-50",
                };

                const isClosed = !!collapsed[category];
                const categoryTotal = items.reduce((acc, p) => acc + safeNum(p.subtotal), 0);
                const categoryQty = items.reduce((acc, p) => acc + safeNum(p.qty), 0);

                return (
                  <div
                    key={category}
                    className={`border rounded-2xl overflow-hidden bg-white ${ui.panelBorder}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className={[
                        "w-full px-4 py-3 flex items-center justify-between gap-3 border-b border-zinc-200",
                        ui.headerClass,
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center gap-2 font-extrabold text-sm">
                          {ui.icon}
                          {ui.label}
                        </span>

                        <span className="text-xs font-semibold opacity-80">
                          · {categoryQty} items · {money(categoryTotal)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold opacity-80">
                          {isClosed ? "Mostrar" : "Ocultar"}
                        </span>
                        {isClosed ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </div>
                    </button>

                    {!isClosed && (
                      <div className="overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="text-xs text-zinc-500 bg-zinc-50">
                            <tr className="border-b border-zinc-200">
                              <th className="text-left py-2 px-4">Producto</th>
                              <th className="text-right py-2 px-4">Cantidad</th>
                              <th className="text-right py-2 px-4">Subtotal</th>
                            </tr>
                          </thead>

                          <tbody>
                            {items.map((p, idx) => (
                              <tr
                                key={`${category}-${p.name}-${idx}`}
                                className={`border-b border-zinc-100 ${ui.rowHover}`}
                              >
                                <td className="py-2 px-4 font-semibold text-zinc-900">
                                  {/* ✅ Pollos ya viene sin sabor */}
                                  {p.name}
                                </td>
                                <td className="py-2 px-4 text-right font-extrabold text-zinc-900">
                                  {safeNum(p.qty)}
                                </td>
                                <td className="py-2 px-4 text-right font-extrabold text-zinc-900">
                                  {money(safeNum(p.subtotal))}
                                </td>
                              </tr>
                            ))}
                          </tbody>

                          <tfoot>
                            <tr className="font-extrabold bg-zinc-50">
                              <td className="py-2 px-4">Subtotal {ui.label}</td>
                              <td className="py-2 px-4 text-right">{categoryQty}</td>
                              <td className="py-2 px-4 text-right">{money(categoryTotal)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* total general */}
              <div className="bg-zinc-900 text-white px-4 py-3 rounded-2xl font-extrabold flex justify-between">
                <span>TOTAL GENERAL</span>
                <span>{money(grandTotal)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
