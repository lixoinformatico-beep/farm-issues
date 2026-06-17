import React, { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api, { formatApiError, API } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ESTADOS, TIPOLOGIAS, PRIORIDADES, StatusPill, PriorityDot, formatDate, formatDateTime } from "@/lib/constants";
import {
  ArrowRight, ChatTeardropDots, Calendar, User, Buildings, Flask, Tag,
  Paperclip, UploadSimple, Trash, ClockClockwise, Pencil, Plus,
} from "@phosphor-icons/react";
import { toast } from "sonner";

const UNASSIGNED = "__none__";

const Info = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-2.5 py-2">
    <Icon size={14} className="text-[#8A938B] mt-0.5 shrink-0" />
    <div className="min-w-0">
      <p className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">{label}</p>
      <p className="text-sm text-[#1E231F] mt-0.5 truncate">{value || "—"}</p>
    </div>
  </div>
);

const ACTION_LABELS = {
  criou: { label: "criou o problema", icon: Plus },
  atualizou: { label: "atualizou", icon: Pencil },
  atribuiu: { label: "atribuiu", icon: User },
  ponto_situacao: { label: "adicionou ponto de situação", icon: ChatTeardropDots },
  anexo_adicionado: { label: "adicionou anexo", icon: Paperclip },
  anexo_removido: { label: "removeu anexo", icon: Trash },
};

const formatBytes = (b) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export default function ProblemaDetailSheet({ problema, open, onOpenChange, onUpdated }) {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [novoTexto, setNovoTexto] = useState("");
  const [novoEstado, setNovoEstado] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const editInputCls = "w-full mt-1 px-3 py-2 bg-white border border-[#E5E3DB] rounded-sm text-sm focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]";

  const refresh = async () => {
    if (!problema?.id) return;
    const r = await api.get(`/problemas/${problema.id}`);
    setData(r.data);
  };

  useEffect(() => {
    if (!problema?.id || !open) return;
    setEditing(false);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, u] = await Promise.all([api.get(`/problemas/${problema.id}`), api.get("/users")]);
        if (!cancelled) { setData(p.data); setUsers(u.data); }
      } catch (e) {
        if (!cancelled) toast.error(formatApiError(e.response?.data?.detail));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [problema?.id, open]);

  const canEdit = isAdmin || data?.criado_por_id === currentUser?.id;

  const startEdit = () => {
    setEditForm({
      farmacia: data.farmacia || "",
      laboratorio: data.laboratorio || "",
      consultor: data.consultor || "",
      tipologia: data.tipologia || "TFO",
      prioridade: data.prioridade || "Media",
      descricao: data.descricao || "",
      data_prevista: data.data_prevista || "",
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const fields = ["farmacia", "laboratorio", "consultor", "tipologia", "prioridade", "descricao", "data_prevista"];
      const payload = {};
      fields.forEach((k) => {
        if ((editForm[k] || "") !== (data[k] || "")) payload[k] = editForm[k];
      });
      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }
      await api.patch(`/problemas/${problema.id}`, payload);
      await refresh();
      onUpdated?.();
      setEditing(false);
      toast.success("Pedido de apoio atualizado");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddFollowup = async (e) => {
    e.preventDefault();
    if (!novoTexto.trim()) return;
    try {
      const payload = { texto: novoTexto };
      if (novoEstado && novoEstado !== data.estado) payload.novo_estado = novoEstado;
      await api.post(`/problemas/${problema.id}/followups`, payload);
      await refresh();
      setNovoTexto("");
      setNovoEstado("");
      onUpdated?.();
      toast.success("Ponto de situação adicionado");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const handleStatusChange = async (estado) => {
    if (!canEdit) return toast.error("Sem permissões para editar");
    try {
      await api.patch(`/problemas/${problema.id}`, { estado });
      await refresh();
      onUpdated?.();
      toast.success(`Estado alterado para ${estado}`);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const handleAssign = async (atribuido_a_id) => {
    if (!canEdit) return toast.error("Sem permissões para editar");
    try {
      const payload = { atribuido_a_id: atribuido_a_id === UNASSIGNED ? null : atribuido_a_id };
      await api.patch(`/problemas/${problema.id}`, payload);
      await refresh();
      onUpdated?.();
      toast.success("Atribuição atualizada");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ficheiro demasiado grande (máx 10MB)");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/problemas/${problema.id}/attachments`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refresh();
      toast.success("Anexo carregado");
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (aid, name) => {
    if (!window.confirm(`Eliminar anexo "${name}"?`)) return;
    try {
      await api.delete(`/attachments/${aid}`);
      await refresh();
      toast.success("Anexo eliminado");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const handleOpenAttachment = async (a) => {
    try {
      const res = await api.get(`/attachments/${a.id}/download`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: a.content_type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Falha ao abrir o anexo");
    }
  };

  const handleDeleteProblema = async () => {
    if (!window.confirm("Eliminar este pedido de apoio definitivamente?")) return;
    try {
      await api.delete(`/problemas/${problema.id}`);
      toast.success("Pedido de apoio eliminado");
      onUpdated?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl bg-[#F4F3EF] border-l border-[#E5E3DB] p-0 overflow-y-auto"
      >
        <SheetHeader className="px-6 py-5 border-b border-[#E5E3DB] bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label-mini">Problema · {data?.id?.slice(0, 8)}</p>
              <SheetTitle className="text-2xl font-medium tracking-tight mt-1 truncate" style={{ fontFamily: "Chivo" }}>
                {data?.farmacia || problema?.farmacia}
              </SheetTitle>
              <SheetDescription className="text-sm text-[#5C665D] mt-1">
                {data?.laboratorio} · {data?.tipologia}
              </SheetDescription>
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
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span className="label-mini">Alterar estado</span>
                <div className="flex gap-2" data-testid="status-quick-actions">
                  {ESTADOS.map((s) => (
                    <button key={s}
                      onClick={() => handleStatusChange(s)}
                      data-testid={`quick-status-${s.replace(' ', '-').toLowerCase()}`}
                      disabled={data.estado === s || !canEdit}
                      className={`text-xs px-3 py-1.5 border rounded-sm transition-colors ${
                        data.estado === s
                          ? "border-[#384C37] bg-[#384C37] text-white"
                          : "border-[#E5E3DB] hover:bg-[#F0EFEB] text-[#343A35]"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Details + Assign */}
            <div className="surface-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="label-mini">Detalhes</span>
                <div className="flex items-center gap-1">
                  {canEdit && !editing && (
                    <button onClick={startEdit}
                      data-testid="edit-problema-btn"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#384C37] hover:bg-[#EAEFE9] rounded-sm">
                      <Pencil size={12} /> Editar
                    </button>
                  )}
                  {editing && (
                    <>
                      <button onClick={handleSaveEdit} disabled={savingEdit}
                        data-testid="save-problema-btn"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-white bg-[#384C37] hover:opacity-90 rounded-sm disabled:opacity-60">
                        {savingEdit ? "A guardar..." : "Guardar"}
                      </button>
                      <button onClick={() => setEditing(false)} disabled={savingEdit}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-[#E5E3DB] hover:bg-[#F0EFEB] rounded-sm">
                        Cancelar
                      </button>
                    </>
                  )}
                  {isAdmin && !editing && (
                    <button onClick={handleDeleteProblema}
                      data-testid="delete-problema-btn"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#B84A39] hover:bg-[#FBEAE7] rounded-sm">
                      <Trash size={12} /> Eliminar
                    </button>
                  )}
                </div>
              </div>
              {editing ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
                  <div>
                    <label className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">Farmácia</label>
                    <input className={editInputCls} value={editForm.farmacia}
                      onChange={(e) => setEditForm((f) => ({ ...f, farmacia: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">Laboratório</label>
                    <input className={editInputCls} value={editForm.laboratorio}
                      onChange={(e) => setEditForm((f) => ({ ...f, laboratorio: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">Consultor</label>
                    <input className={editInputCls} value={editForm.consultor}
                      onChange={(e) => setEditForm((f) => ({ ...f, consultor: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">Tipologia</label>
                    <Select value={editForm.tipologia} onValueChange={(v) => setEditForm((f) => ({ ...f, tipologia: v }))}>
                      <SelectTrigger className="h-9 mt-1 bg-white border-[#E5E3DB] rounded-sm text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIPOLOGIAS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">Prioridade</label>
                    <Select value={editForm.prioridade} onValueChange={(v) => setEditForm((f) => ({ ...f, prioridade: v }))}>
                      <SelectTrigger className="h-9 mt-1 bg-white border-[#E5E3DB] rounded-sm text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORIDADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B]">Data prevista</label>
                    <input type="date" className={editInputCls} value={editForm.data_prevista || ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, data_prevista: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4">
                  <Info icon={Buildings} label="Farmácia" value={data.farmacia} />
                  <Info icon={Flask} label="Laboratório" value={data.laboratorio} />
                  <Info icon={User} label="Consultor" value={data.consultor} />
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
                  <Info icon={User} label="Criado por" value={data.criado_por} />
                </div>
              )}

              {/* Assignment */}
              <div className="pt-4 border-t border-[#E5E3DB]">
                <p className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B] mb-2">Atribuído a</p>
                <Select
                  value={data.atribuido_a_id || UNASSIGNED}
                  onValueChange={handleAssign}
                  disabled={!canEdit}
                >
                  <SelectTrigger data-testid="assign-select"
                                 className="h-9 bg-white border-[#E5E3DB] rounded-sm text-sm max-w-md">
                    <SelectValue placeholder="Sem atribuição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Sem atribuição</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 mt-4 border-t border-[#E5E3DB]">
                <p className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[#8A938B] mb-2">Descrição</p>
                {editing ? (
                  <textarea
                    className={editInputCls + " min-h-[120px] resize-y"}
                    value={editForm.descricao}
                    onChange={(e) => setEditForm((f) => ({ ...f, descricao: e.target.value }))}
                  />
                ) : (
                  <p className="text-sm text-[#1E231F] whitespace-pre-wrap leading-relaxed">{data.descricao}</p>
                )}
              </div>
            </div>

            {/* Tabs: Follow-ups | Anexos | Histórico */}
            <Tabs defaultValue="followups" className="w-full">
              <TabsList className="bg-white border border-[#E5E3DB] rounded-sm p-1 h-auto">
                <TabsTrigger value="followups" data-testid="tab-followups"
                             className="rounded-sm data-[state=active]:bg-[#384C37] data-[state=active]:text-white text-xs px-3 py-1.5">
                  <ChatTeardropDots size={14} className="mr-1.5" /> Pontos de situação ({data.follow_ups?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="anexos" data-testid="tab-anexos"
                             className="rounded-sm data-[state=active]:bg-[#384C37] data-[state=active]:text-white text-xs px-3 py-1.5">
                  <Paperclip size={14} className="mr-1.5" /> Anexos ({data.attachments?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="audit" data-testid="tab-audit"
                             className="rounded-sm data-[state=active]:bg-[#384C37] data-[state=active]:text-white text-xs px-3 py-1.5">
                  <ClockClockwise size={14} className="mr-1.5" /> Histórico ({data.audit_logs?.length || 0})
                </TabsTrigger>
              </TabsList>

              {/* Follow-ups */}
              <TabsContent value="followups">
                <div className="surface-card p-5">
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

                  <form onSubmit={handleAddFollowup} className="mt-6 pt-5 border-t border-[#E5E3DB] space-y-3"
                        data-testid="add-followup-form">
                    <span className="label-mini block">Adicionar ponto de situação</span>
                    <textarea
                      data-testid="followup-texto"
                      required rows={3}
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
              </TabsContent>

              {/* Anexos */}
              <TabsContent value="anexos">
                <div className="surface-card p-5">
                  <div className="space-y-2 mb-4" data-testid="attachments-list">
                    {data.attachments?.length === 0 ? (
                      <p className="text-sm text-[#8A938B] py-4 text-center" data-testid="no-attachments">
                        Sem anexos. Adicione PDFs, imagens ou documentos relacionados com este problema.
                      </p>
                    ) : data.attachments?.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 p-3 border border-[#E5E3DB] rounded-sm bg-white"
                           data-testid={`attachment-${a.id}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 border border-[#E5E3DB] flex items-center justify-center shrink-0 bg-[#F4F3EF]">
                            <Paperclip size={14} className="text-[#5C665D]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#1E231F] truncate">{a.original_filename}</p>
                            <p className="text-[11px] text-[#8A938B] mono">
                              {formatBytes(a.size)} · {a.uploaded_by} · {formatDate(a.created_at)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            data-testid={`download-${a.id}`}
                            onClick={() => handleOpenAttachment(a)}
                            className="px-2 py-1 text-xs border border-[#E5E3DB] hover:bg-[#F0EFEB] rounded-sm"
                          >
                            Abrir
                          </button>
                          {(isAdmin || a.uploaded_by_id === currentUser?.id) && (
                            <button
                              data-testid={`delete-attachment-${a.id}`}
                              onClick={() => handleDeleteAttachment(a.id, a.original_filename)}
                              className="px-2 py-1 text-xs text-[#B84A39] hover:bg-[#FBEAE7] rounded-sm"
                            >
                              <Trash size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-[#E5E3DB]">
                    <input
                      ref={fileRef}
                      type="file"
                      onChange={handleUpload}
                      className="hidden"
                      data-testid="attachment-input"
                    />
                    <button
                      data-testid="upload-attachment-btn"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm border border-dashed border-[#384C37] hover:bg-[#EAF0EC] rounded-sm transition-colors disabled:opacity-60"
                      style={{ color: "#384C37" }}
                    >
                      <UploadSimple size={14} />
                      {uploading ? "A carregar..." : "Adicionar anexo (máx 10MB)"}
                    </button>
                  </div>
                </div>
              </TabsContent>

              {/* Audit log */}
              <TabsContent value="audit">
                <div className="surface-card p-5" data-testid="audit-list">
                  {data.audit_logs?.length === 0 ? (
                    <p className="text-sm text-[#8A938B] py-4 text-center">Sem histórico.</p>
                  ) : (
                    <div className="relative space-y-4">
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#E5E3DB]" />
                      {data.audit_logs?.slice().reverse().map((log) => {
                        const meta = ACTION_LABELS[log.action] || { label: log.action, icon: ClockClockwise };
                        const Icon = meta.icon;
                        return (
                          <div key={log.id} className="relative pl-7" data-testid="audit-entry">
                            <span className="absolute left-0 top-1 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center"
                                  style={{ backgroundColor: "#E5E3DB" }}>
                              <Icon size={8} className="text-[#5C665D]" />
                            </span>
                            <div className="flex items-baseline justify-between gap-2 flex-wrap">
                              <p className="text-sm">
                                <span className="font-medium text-[#1E231F]">{log.user_name}</span>
                                <span className="text-[#5C665D]"> {meta.label}</span>
                              </p>
                              <span className="text-[11px] mono text-[#8A938B]">{formatDateTime(log.created_at)}</span>
                            </div>
                            {log.details && Object.keys(log.details).length > 0 && (
                              <div className="mt-1 text-xs text-[#5C665D] bg-[#F4F3EF] border border-[#E5E3DB] rounded-sm p-2 mono">
                                {Object.entries(log.details).map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-[#8A938B]">{k}:</span>{" "}
                                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
