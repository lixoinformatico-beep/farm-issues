import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import api, { formatApiError } from "@/lib/api";
import { ESTADOS, StatusPill, PriorityDot, formatDate, formatDateTime } from "@/lib/constants";
import { ArrowRight, ChatTeardropDots, Calendar, User, Buildings, Flask, Tag } from "@phosphor-icons/react";
import { toast } from "sonner";

const Info = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2.5 py-2">
    <Icon size={14} className="text-[#8A938B] mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">{label}</p>
      <p className="text-sm text-[#1E231F] mt-0.5 truncate">{value || "—"}</p>
    </div>
  </div>
);

export default function ProblemaDetailSheet({ problema, open, onOpenChange, onUpdated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [novoTexto, setNovoTexto] = useState("");
  const [novoEstado, setNovoEstado] = useState("");

  useEffect(() => {
    if (!problema?.id || !open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api.get(`/problemas/${problema.id}`);
        if (!cancelled) setData(r.data);
      } catch (e) {
        if (!cancelled) toast.error(formatApiError(e.response?.data?.detail));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [problema?.id, open]);

  const handleAddFollowup = async (e) => {
    e.preventDefault();
    if (!novoTexto.trim()) return;
    try {
      const payload = { texto: novoTexto };
      if (novoEstado && novoEstado !== data.estado) payload.novo_estado = novoEstado;
      await api.post(`/problemas/${problema.id}/followups`, payload);
      const updated = await api.get(`/problemas/${problema.id}`);
      setData(updated.data);
      setNovoTexto("");
      setNovoEstado("");
      onUpdated?.();
      toast.success("Ponto de situação adicionado");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const handleStatusChange = async (estado) => {
    try {
      await api.patch(`/problemas/${problema.id}`, { estado });
      const updated = await api.get(`/problemas/${problema.id}`);
      setData(updated.data);
      onUpdated?.();
      toast.success(`Estado alterado para ${estado}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl bg-[#F4F3EF] border-l border-[#E5E3DB] p-0 overflow-y-auto"
      >
        <SheetHeader className="px-6 py-5 border-b border-[#E5E3DB] bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label-mini">Problema · {data?.id?.slice(0, 8)}</p>
              <SheetTitle className="text-2xl font-medium tracking-tight mt-1 truncate" style={{ fontFamily: "Chivo" }}>
                {data?.farmacia || problema?.farmacia}
              </SheetTitle>
              <p className="text-sm text-[#5C665D] mt-1">{data?.laboratorio} · {data?.tipologia}</p>
            </div>
            {data && <StatusPill estado={data.estado} testid="detail-estado" />}
          </div>
        </SheetHeader>

        {loading || !data ? (
          <p className="p-10 text-center text-sm text-[#8A938B]">A carregar...</p>
        ) : (
          <div className="p-6 space-y-6">
            {/* Quick status change */}
            <div className="surface-card p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="label-mini">Alterar estado</span>
                <div className="flex gap-2" data-testid="status-quick-actions">
                  {ESTADOS.map((s) => (
                    <button key={s}
                      onClick={() => handleStatusChange(s)}
                      data-testid={`quick-status-${s.replace(' ', '-').toLowerCase()}`}
                      disabled={data.estado === s}
                      className={`text-xs px-3 py-1.5 border rounded-sm transition-colors ${
                        data.estado === s
                          ? "border-[#384C37] bg-[#384C37] text-white"
                          : "border-[#E5E3DB] hover:bg-[#F0EFEB] text-[#343A35]"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="surface-card p-5">
              <span className="label-mini mb-3 block">Detalhes</span>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
                <Info icon={Buildings} label="Farmácia" value={data.farmacia} />
                <Info icon={Flask} label="Laboratório" value={data.laboratorio} />
                <Info icon={User} label="Consultor" value={data.consultor} />
                <Info icon={User} label="Atribuído a" value={data.atribuido_a} />
                <Info icon={Tag} label="Tipologia" value={data.tipologia} />
                <div className="flex items-start gap-2.5 py-2">
                  <Tag size={14} className="text-[#8A938B] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">Prioridade</p>
                    <div className="mt-1"><PriorityDot prioridade={data.prioridade} /></div>
                  </div>
                </div>
                <Info icon={Calendar} label="Data prevista" value={data.data_prevista ? formatDate(data.data_prevista) : "—"} />
                <Info icon={Calendar} label="Criado em" value={formatDateTime(data.created_at)} />
              </div>
              <div className="pt-4 border-t border-[#E5E3DB]">
                <p className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B] mb-2">Descrição</p>
                <p className="text-sm text-[#1E231F] whitespace-pre-wrap leading-relaxed">{data.descricao}</p>
              </div>
            </div>

            {/* Timeline */}
            <div className="surface-card p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="label-mini">Pontos de situação ({data.follow_ups?.length || 0})</span>
                <ChatTeardropDots size={14} className="text-[#8A938B]" />
              </div>

              {data.follow_ups?.length === 0 && (
                <p className="text-sm text-[#8A938B] py-4 text-center" data-testid="no-followups">
                  Ainda não há pontos de situação registados.
                </p>
              )}

              <div className="relative space-y-5" data-testid="followups-timeline">
                {data.follow_ups?.length > 0 && (
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#E5E3DB]" />
                )}
                {data.follow_ups?.map((fu) => (
                  <div key={fu.id} className="relative pl-7" data-testid="followup-item">
                    <span className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                          style={{ backgroundColor: "#384C37" }} />
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <span className="text-sm font-medium text-[#1E231F]">{fu.autor}</span>
                      <span className="text-xs mono text-[#8A938B]">{formatDateTime(fu.created_at)}</span>
                    </div>
                    {fu.novo_estado && fu.novo_estado !== fu.estado_anterior && (
                      <div className="flex items-center gap-2 mb-2 text-xs">
                        <StatusPill estado={fu.estado_anterior} />
                        <ArrowRight size={12} className="text-[#8A938B]" />
                        <StatusPill estado={fu.novo_estado} />
                      </div>
                    )}
                    <p className="text-sm text-[#343A35] whitespace-pre-wrap leading-relaxed bg-[#F4F3EF] border border-[#E5E3DB] rounded-sm p-3">
                      {fu.texto}
                    </p>
                  </div>
                ))}
              </div>

              {/* Add follow-up form */}
              <form onSubmit={handleAddFollowup} className="mt-6 pt-5 border-t border-[#E5E3DB] space-y-3"
                    data-testid="add-followup-form">
                <span className="label-mini block">Adicionar ponto de situação</span>
                <textarea
                  data-testid="followup-texto"
                  required
                  rows={3}
                  value={novoTexto}
                  onChange={(e) => setNovoTexto(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-[#E5E3DB] rounded-sm text-sm
                             focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]"
                  placeholder="Descreva o ponto de situação ou avanço..."
                />
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Select value={novoEstado} onValueChange={setNovoEstado}>
                      <SelectTrigger data-testid="followup-estado"
                                     className="h-9 bg-white border-[#E5E3DB] rounded-sm text-sm">
                        <SelectValue placeholder="Manter estado atual" />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((s) => <SelectItem key={s} value={s}>Alterar para: {s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <button
                    data-testid="followup-submit"
                    type="submit"
                    className="px-4 py-2 text-sm font-medium rounded-sm transition-colors"
                    style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}>
                    Adicionar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
