import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import api, { formatApiError } from "@/lib/api";
import { TIPOLOGIAS, PRIORIDADES, ESTADOS } from "@/lib/constants";
import { toast } from "sonner";

const UNASSIGNED = "__none__";

const Field = ({ label, children, required }) => (
  <div>
    <label className="label-mini block mb-1.5">{label}{required && <span className="text-[#B84A39]">*</span>}</label>
    {children}
  </div>
);

const inputCls = "w-full px-3 py-2 bg-white border border-[#E5E3DB] rounded-sm text-sm focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]";
const selectTriggerCls = "w-full h-9 bg-white border-[#E5E3DB] rounded-sm text-sm focus:ring-1 focus:ring-[#384C37]";

const empty = {
  farmacia: "", laboratorio: "", consultor: "",
  descricao: "", tipologia: "TFO", prioridade: "Media",
  estado: "Aberto", data_prevista: "", atribuido_a_id: UNASSIGNED,
};

export default function CreateProblemaSheet({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState(empty);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
    }
  }, [open]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.data_prevista) delete payload.data_prevista;
      if (!payload.atribuido_a_id || payload.atribuido_a_id === UNASSIGNED) delete payload.atribuido_a_id;
      const { data } = await api.post("/problemas", payload);
      toast.success("Problema criado com sucesso");
      onCreated?.(data);
      onOpenChange(false);
      setForm(empty);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl bg-[#F4F3EF] border-l border-[#E5E3DB] p-0 overflow-y-auto"
      >
        <SheetHeader className="px-6 py-5 border-b border-[#E5E3DB] bg-white">
          <p className="label-mini">Novo registo</p>
          <SheetTitle className="text-2xl font-medium tracking-tight" style={{ fontFamily: "Chivo" }}>
            Registar problema
          </SheetTitle>
          <SheetDescription className="text-sm text-[#5C665D]">
            Registo de um novo problema reportado por uma farmácia.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-4" data-testid="create-problema-form">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Farmácia" required>
              <input data-testid="form-farmacia" required className={inputCls}
                value={form.farmacia} onChange={(e) => update("farmacia", e.target.value)}
                placeholder="Ex: Farmácia Central" />
            </Field>
            <Field label="Laboratório" required>
              <input data-testid="form-laboratorio" required className={inputCls}
                value={form.laboratorio} onChange={(e) => update("laboratorio", e.target.value)}
                placeholder="Ex: Bayer" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Consultor" required>
              <input data-testid="form-consultor" required className={inputCls}
                value={form.consultor} onChange={(e) => update("consultor", e.target.value)}
                placeholder="Nome do consultor" />
            </Field>
            <Field label="Atribuir a">
              <Select value={form.atribuido_a_id} onValueChange={(v) => update("atribuido_a_id", v)}>
                <SelectTrigger data-testid="form-atribuido" className={selectTriggerCls}>
                  <SelectValue placeholder="Sem atribuição" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Sem atribuição</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Descrição" required>
            <textarea data-testid="form-descricao" required rows={4} className={inputCls}
              value={form.descricao} onChange={(e) => update("descricao", e.target.value)}
              placeholder="Descreva o problema em detalhe..." />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Tipologia" required>
              <Select value={form.tipologia} onValueChange={(v) => update("tipologia", v)}>
                <SelectTrigger data-testid="form-tipologia" className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOLOGIAS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select value={form.prioridade} onValueChange={(v) => update("prioridade", v)}>
                <SelectTrigger data-testid="form-prioridade" className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.estado} onValueChange={(v) => update("estado", v)}>
                <SelectTrigger data-testid="form-estado" className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent>{ESTADOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Data prevista de resolução">
            <input data-testid="form-data-prevista" type="date" className={inputCls}
              value={form.data_prevista} onChange={(e) => update("data_prevista", e.target.value)} />
          </Field>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#E5E3DB]">
            <button type="button" onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm border border-[#E5E3DB] hover:bg-[#F0EFEB] rounded-sm transition-colors">
              Cancelar
            </button>
            <button data-testid="form-submit" type="submit" disabled={loading}
              className="px-5 py-2 text-sm font-medium rounded-sm transition-colors disabled:opacity-60"
              style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}>
              {loading ? "A guardar..." : "Criar problema"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
