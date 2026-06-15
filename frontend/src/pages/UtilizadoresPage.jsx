import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Plus, Trash, Crown, User as UserIcon } from "@phosphor-icons/react";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

const inputCls = "w-full px-3 py-2 bg-white border border-[#E5E3DB] rounded-sm text-sm focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]";

export default function UtilizadoresPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "consultor" });
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    const { data } = await api.get("/users");
    setUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/users");
        if (!cancelled) setUsers(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/users", form);
      toast.success("Utilizador criado");
      setForm({ email: "", password: "", name: "", role: "consultor" });
      setCreateOpen(false);
      fetchUsers();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (uid, name) => {
    if (!window.confirm(`Eliminar utilizador ${name}?`)) return;
    try {
      await api.delete(`/users/${uid}`);
      toast.success("Utilizador eliminado");
      fetchUsers();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <div className="p-8 max-w-[1200px]" data-testid="utilizadores-page">
      <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
        <div>
          <p className="label-mini mb-1">Equipa</p>
          <h1 className="text-3xl font-medium tracking-tight">Utilizadores</h1>
          <p className="text-sm text-[#5C665D] mt-1">{users.length} utilizador{users.length !== 1 && "es"} registado{users.length !== 1 && "s"}</p>
        </div>
        <button
          data-testid="new-user-btn"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm transition-colors"
          style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}
        >
          <Plus size={16} weight="bold" /> Novo utilizador
        </button>
      </div>

      <div className="surface-card overflow-hidden">
        {loading ? (
          <p className="py-12 text-center text-sm text-[#8A938B]">A carregar...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left label-mini border-b border-[#E5E3DB]">
                <th className="px-5 py-3">Nome</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Função</th>
                <th className="px-5 py-3">Criado em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="data-row border-b border-[#E5E3DB] last:border-0" data-testid={`user-row-${u.id}`}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium"
                           style={{ backgroundColor: u.role === "admin" ? "#384C37" : "#7A9A6E", color: "#FFFFFF" }}>
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <span className="font-medium text-[#1E231F]">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[#343A35] mono text-xs">{u.email}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-sm border"
                          style={u.role === "admin"
                            ? { backgroundColor: "#EAF0EC", color: "#384C37", borderColor: "#C7D8CE" }
                            : { backgroundColor: "#F0EFEB", color: "#5C665D", borderColor: "#E5E3DB" }}>
                      {u.role === "admin" ? <Crown size={11} /> : <UserIcon size={11} />}
                      {u.role === "admin" ? "Admin" : "Consultor"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[#5C665D] mono text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("pt-PT") : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {u.id !== currentUser.id && (
                      <button
                        data-testid={`delete-user-${u.id}`}
                        onClick={() => handleDelete(u.id, u.name)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#B84A39] hover:bg-[#FBEAE7] rounded-sm transition-colors"
                      >
                        <Trash size={12} /> Eliminar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-white border-[#E5E3DB] rounded-sm max-w-md">
          <DialogHeader>
            <p className="label-mini">Novo registo</p>
            <DialogTitle className="text-2xl font-medium tracking-tight" style={{ fontFamily: "Chivo" }}>
              Criar utilizador
            </DialogTitle>
            <DialogDescription className="text-sm text-[#5C665D]">
              Os utilizadores poderão iniciar sessão com o email e palavra-passe definidos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2" data-testid="create-user-form">
            <div>
              <label className="label-mini block mb-1.5">Nome</label>
              <input data-testid="user-form-name" required className={inputCls}
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label-mini block mb-1.5">Email</label>
              <input data-testid="user-form-email" required type="email" className={inputCls}
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label-mini block mb-1.5">Palavra-passe</label>
              <input data-testid="user-form-password" required type="password" minLength={6} className={inputCls}
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="label-mini block mb-1.5">Função</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-form-role" className="h-9 bg-white border-[#E5E3DB] rounded-sm text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="consultor">Consultor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreateOpen(false)}
                className="px-4 py-2 text-sm border border-[#E5E3DB] hover:bg-[#F0EFEB] rounded-sm">
                Cancelar
              </button>
              <button data-testid="user-form-submit" type="submit" disabled={submitting}
                className="px-5 py-2 text-sm font-medium rounded-sm disabled:opacity-60"
                style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}>
                {submitting ? "A criar..." : "Criar"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
