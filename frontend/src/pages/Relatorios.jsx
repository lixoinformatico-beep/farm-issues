import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { FileArrowDown, ChartBar } from "@phosphor-icons/react";
import { StatusPill } from "@/lib/constants";

export default function Relatorios() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data));
  }, []);

  const handleExport = async () => {
    const url = `${process.env.REACT_APP_BACKEND_URL}/api/problemas/export/csv`;
    const res = await fetch(url, { credentials: "include" });
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `problemas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  return (
    <div className="p-8 max-w-[1400px]" data-testid="relatorios-page">
      <div className="mb-8">
        <p className="label-mini mb-1">Análise</p>
        <h1 className="text-3xl font-medium tracking-tight">Relatórios</h1>
      </div>

      <div className="surface-card p-6 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-medium tracking-tight">Exportação CSV</h2>
            <p className="text-sm text-[#5C665D] mt-1">
              Descarregue todos os problemas registados em formato CSV (separador <span className="mono">;</span>) para Excel ou Numbers.
            </p>
          </div>
          <button
            data-testid="relatorios-export-btn"
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-sm transition-colors"
            style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}
          >
            <FileArrowDown size={16} weight="bold" /> Descarregar relatório
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="surface-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ChartBar size={14} className="text-[#8A938B]" />
          <span className="label-mini">Resumo por farmácia</span>
        </div>
        {!stats?.by_farmacia?.length ? (
          <p className="text-sm text-[#8A938B] py-6 text-center">Sem dados para mostrar.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left label-mini border-b border-[#E5E3DB]">
                <th className="py-2.5">Farmácia</th>
                <th className="py-2.5 text-right">Total</th>
                <th className="py-2.5 text-right">Abertos</th>
                <th className="py-2.5 text-right">Em Curso</th>
                <th className="py-2.5 text-right">Resolvidos</th>
                <th className="py-2.5 text-right">Taxa resolução</th>
              </tr>
            </thead>
            <tbody>
              {stats.by_farmacia.map((f) => {
                const taxa = f.total > 0 ? Math.round((f.resolvidos / f.total) * 100) : 0;
                return (
                  <tr key={f.farmacia} className="data-row border-b border-[#E5E3DB] last:border-0">
                    <td className="py-3 text-[#1E231F] font-medium">{f.farmacia}</td>
                    <td className="py-3 text-right mono">{f.total}</td>
                    <td className="py-3 text-right mono text-[#B84A39]">{f.abertos}</td>
                    <td className="py-3 text-right mono text-[#B48231]">{f.em_curso}</td>
                    <td className="py-3 text-right mono text-[#426B4F]">{f.resolvidos}</td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <span className="mono text-xs text-[#5C665D]">{taxa}%</span>
                        <div className="w-20 h-1.5 bg-[#E5E3DB] rounded-sm overflow-hidden">
                          <div className="h-full" style={{ width: `${taxa}%`, backgroundColor: "#426B4F" }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
