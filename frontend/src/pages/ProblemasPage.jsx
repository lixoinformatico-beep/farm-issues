import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { TIPOLOGIAS, ESTADOS, StatusPill, PriorityDot, formatDate } from "@/lib/constants";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import CreateProblemaSheet from "@/components/CreateProblemaSheet";
import ProblemaDetailSheet from "@/components/ProblemaDetailSheet";
import { Plus, MagnifyingGlass, FunnelSimple, FileArrowDown, X } from "@phosphor-icons/react";

const ALL = "__all__";

const PRIORITY_RANK = { Baixa: 0, Media: 1, Alta: 2, Critica: 3 };
const ESTADO_RANK = { Aberto: 0, "Em Curso": 1, Resolvido: 2 };

const getSortValue = (p, key) => {
  switch (key) {
    case "prioridade": return PRIORITY_RANK[p.prioridade] ?? -1;
    case "estado": return ESTADO_RANK[p.estado] ?? -1;
    case "atribuido": return (p.atribuido_a_name || "").toLowerCase();
    case "data_prevista": return p.data_prevista || "";
    case "created_at": return p.created_at || "";
    default: return (p[key] || "").toString().toLowerCase();
  }
};

const SortableTh = ({ label, colKey, sortKey, sortDir, onSort }) => (
  <th className="px-5 py-3">
    <button
      onClick={() => onSort(colKey)}
      className="inline-flex items-center gap-1 hover:text-[#384C37] transition-colors"
    >
      {label}
      <span className="text-[9px] w-2 inline-block">
        {sortKey === colKey ? (sortDir === "asc" ? "▲" : "▼") : ""}
      </span>
    </button>
  </th>
);

export default function ProblemasPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState(ALL);
  const [tipologia, setTipologia] = useState(ALL);
  const [farmacia, setFarmacia] = useState("");
  const [laboratorio, setLaboratorio] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortKey) return items;
    const arr = [...items];
    arr.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let cmp;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "pt");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [items, sortKey, sortDir]);

  const filtersActive = [estado !== ALL, tipologia !== ALL, !!farmacia, !!laboratorio, !!q].filter(Boolean).length;

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (estado !== ALL) params.estado = estado;
      if (tipologia !== ALL) params.tipologia = tipologia;
      if (farmacia) params.farmacia = farmacia;
      if (laboratorio) params.laboratorio = laboratorio;
      const { data } = await api.get("/problemas", { params });
      setItems(data);
    } catch {
      // ignore: 401 já está a redirecionar; outros erros mostrados via interceptor
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchData, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, estado, tipologia, farmacia, laboratorio]);

  const handleExport = async () => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/problemas/export/csv`;
    const res = await fetch(url, { credentials: "include" });
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `problemas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const clearFilters = () => {
    setQ(""); setEstado(ALL); setTipologia(ALL); setFarmacia(""); setLaboratorio("");
  };

  const stats = useMemo(() => ({
    total: items.length,
    abertos: items.filter((i) => i.estado === "Aberto").length,
    em_curso: items.filter((i) => i.estado === "Em Curso").length,
    resolvidos: items.filter((i) => i.estado === "Resolvido").length,
  }), [items]);

  return (
    <div className="p-8 max-w-[1500px]" data-testid="problemas-page">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <p className="label-mini mb-1">Registo</p>
          <h1 className="text-3xl font-medium tracking-tight">Pedidos de Apoio</h1>
          <p className="text-sm text-[#5C665D] mt-1">
            {stats.total} resultado{stats.total !== 1 && "s"} ·{" "}
            <span className="text-[#B84A39]">{stats.abertos} abertos</span> ·{" "}
            <span className="text-[#B48231]">{stats.em_curso} em curso</span> ·{" "}
            <span className="text-[#426B4F]">{stats.resolvidos} resolvidos</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="export-csv-btn"
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-[#E5E3DB] bg-white hover:bg-[#F0EFEB] rounded-sm transition-colors"
          >
            <FileArrowDown size={16} /> Exportar CSV
          </button>
          <button
            data-testid="new-problema-btn"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm transition-colors"
            style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}
          >
            <Plus size={16} weight="bold" /> Novo pedido de apoio
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="surface-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <FunnelSimple size={14} className="text-[#8A938B]" />
          <span className="label-mini">Filtros</span>
          {filtersActive > 0 && (
            <button data-testid="clear-filters-btn" onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 text-xs text-[#5C665D] hover:text-[#1E231F]">
              <X size={12} /> Limpar ({filtersActive})
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A938B]" />
            <input
              data-testid="search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar farmácia, laboratório, descrição..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-[#E5E3DB] rounded-sm text-sm focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]"
            />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger data-testid="filter-estado" className="h-9 bg-white border-[#E5E3DB] rounded-sm text-sm">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os estados</SelectItem>
              {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tipologia} onValueChange={setTipologia}>
            <SelectTrigger data-testid="filter-tipologia" className="h-9 bg-white border-[#E5E3DB] rounded-sm text-sm">
              <SelectValue placeholder="Tipologia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as tipologias</SelectItem>
              {TIPOLOGIAS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <input
            data-testid="filter-farmacia"
            value={farmacia}
            onChange={(e) => setFarmacia(e.target.value)}
            placeholder="Farmácia"
            className="px-3 py-2 bg-white border border-[#E5E3DB] rounded-sm text-sm focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="surface-card overflow-hidden">
        {loading ? (
          <p className="py-16 text-center text-sm text-[#8A938B]">A carregar pedidos de apoio...</p>
        ) : items.length === 0 ? (
          <div className="py-16 text-center" data-testid="empty-state">
            <p className="text-sm text-[#5C665D]">Nenhum pedido de apoio encontrado.</p>
            <button onClick={() => setCreateOpen(true)}
              className="mt-3 inline-flex items-center gap-2 text-sm text-[#384C37] hover:underline">
              <Plus size={14} /> Criar o primeiro
            </button>
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="problemas-table">
            <thead>
              <tr className="text-left label-mini border-b border-[#E5E3DB]">
                <SortableTh label="Farmácia" colKey="farmacia" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Laboratório" colKey="laboratorio" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Consultor" colKey="consultor" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Atribuído" colKey="atribuido" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Tipologia" colKey="tipologia" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Prioridade" colKey="prioridade" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Estado" colKey="estado" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Prevista" colKey="data_prevista" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh label="Criado" colKey="created_at" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((p) => (
                <tr
                  key={p.id}
                  data-testid={`problema-row-${p.id}`}
                  onClick={() => { setSelected(p); setDetailOpen(true); }}
                  className="data-row border-b border-[#E5E3DB] last:border-0 cursor-pointer"
                >
                  <td className="px-5 py-3 text-[#1E231F] font-medium">{p.farmacia}</td>
                  <td className="px-5 py-3 text-[#343A35]">{p.laboratorio}</td>
                  <td className="px-5 py-3 text-[#343A35]">{p.consultor}</td>
                  <td className="px-5 py-3 text-[#343A35]">{p.atribuido_a_name || <span className="text-[#8A938B]">—</span>}</td>
                  <td className="px-5 py-3 text-[#343A35]">{p.tipologia}</td>
                  <td className="px-5 py-3"><PriorityDot prioridade={p.prioridade} /></td>
                  <td className="px-5 py-3"><StatusPill estado={p.estado} /></td>
                  <td className="px-5 py-3 text-[#5C665D] mono text-xs">{p.data_prevista ? formatDate(p.data_prevista) : "—"}</td>
                  <td className="px-5 py-3 text-[#5C665D] mono text-xs">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateProblemaSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => fetchData()}
      />
      <ProblemaDetailSheet
        problema={selected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={() => fetchData()}
      />
    </div>
  );
}
