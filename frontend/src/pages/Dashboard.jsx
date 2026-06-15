import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { StatusPill, formatDate } from "@/lib/constants";
import { TrendUp, TrendDown, Buildings, Tag, Warning } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartTooltip, Cell, PieChart, Pie } from "recharts";

const KPI = ({ label, value, accent, testid, icon: Icon }) => (
  <div className="surface-card p-5" data-testid={testid}>
    <div className="flex items-start justify-between mb-3">
      <span className="label-mini">{label}</span>
      {Icon && <Icon size={16} className="text-[#8A938B]" />}
    </div>
    <p className="text-4xl font-medium tracking-tight" style={{ color: accent || "#1E231F", fontFamily: "Chivo" }}>
      {value ?? "—"}
    </p>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/stats"), api.get("/problemas")])
      .then(([s, p]) => {
        setStats(s.data);
        setRecent(p.data.slice(0, 6));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tipoColors = ["#384C37", "#7A9A6E", "#B48231", "#B84A39"];

  return (
    <div className="p-8 max-w-[1400px]" data-testid="dashboard-page">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="label-mini mb-1">Visão geral</p>
          <h1 className="text-3xl font-medium tracking-tight">Dashboard</h1>
        </div>
        <p className="text-xs text-[#8A938B] mono">
          {new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPI label="Total" value={stats?.total} testid="kpi-total" icon={Tag} />
        <KPI label="Abertos" value={stats?.abertos} accent="#B84A39" testid="kpi-abertos" icon={Warning} />
        <KPI label="Em Curso" value={stats?.em_curso} accent="#B48231" testid="kpi-em-curso" icon={TrendUp} />
        <KPI label="Resolvidos" value={stats?.resolvidos} accent="#426B4F" testid="kpi-resolvidos" icon={TrendDown} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Tipologia */}
        <div className="surface-card p-5 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <span className="label-mini">Por tipologia</span>
            <Tag size={14} className="text-[#8A938B]" />
          </div>
          {stats?.by_tipologia?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={stats.by_tipologia} dataKey="total" nameKey="tipologia"
                     innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {stats.by_tipologia.map((_, i) => (
                    <Cell key={i} fill={tipoColors[i % tipoColors.length]} />
                  ))}
                </Pie>
                <RechartTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #E5E3DB", borderRadius: 2, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-[#8A938B] py-8 text-center">Sem dados</p>}
          <div className="mt-3 space-y-1.5">
            {stats?.by_tipologia?.map((t, i) => (
              <div key={t.tipologia} className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tipoColors[i % tipoColors.length] }} />
                  <span className="text-[#343A35]">{t.tipologia}</span>
                </span>
                <span className="mono text-[#5C665D]">{t.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top farmácias */}
        <div className="surface-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <span className="label-mini">Top farmácias por volume</span>
            <Buildings size={14} className="text-[#8A938B]" />
          </div>
          {stats?.by_farmacia?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.by_farmacia} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: "#8A938B" }} stroke="#E5E3DB" />
                <YAxis type="category" dataKey="farmacia" tick={{ fontSize: 11, fill: "#343A35" }} stroke="#E5E3DB" width={110} />
                <RechartTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #E5E3DB", borderRadius: 2, fontSize: 12 }} />
                <Bar dataKey="abertos" stackId="a" fill="#B84A39" />
                <Bar dataKey="em_curso" stackId="a" fill="#B48231" />
                <Bar dataKey="resolvidos" stackId="a" fill="#426B4F" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-[#8A938B] py-8 text-center">Sem dados</p>}
          <div className="flex gap-4 mt-3 text-[11px] text-[#5C665D]">
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ backgroundColor: "#B84A39" }} />Abertos</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ backgroundColor: "#B48231" }} />Em Curso</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2" style={{ backgroundColor: "#426B4F" }} />Resolvidos</span>
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="surface-card">
        <div className="px-5 py-4 border-b border-[#E5E3DB] flex items-center justify-between">
          <span className="label-mini">Problemas recentes</span>
        </div>
        {loading ? (
          <p className="text-sm text-[#8A938B] py-10 text-center">A carregar...</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-[#8A938B] py-10 text-center" data-testid="dashboard-empty">Ainda sem problemas registados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left label-mini border-b border-[#E5E3DB]">
                <th className="px-5 py-2.5">Farmácia</th>
                <th className="px-5 py-2.5">Laboratório</th>
                <th className="px-5 py-2.5">Tipologia</th>
                <th className="px-5 py-2.5">Estado</th>
                <th className="px-5 py-2.5">Criado</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="data-row border-b border-[#E5E3DB] last:border-0">
                  <td className="px-5 py-3 text-[#1E231F] font-medium">{p.farmacia}</td>
                  <td className="px-5 py-3 text-[#343A35]">{p.laboratorio}</td>
                  <td className="px-5 py-3 text-[#343A35]">{p.tipologia}</td>
                  <td className="px-5 py-3"><StatusPill estado={p.estado} /></td>
                  <td className="px-5 py-3 text-[#5C665D] mono text-xs">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
