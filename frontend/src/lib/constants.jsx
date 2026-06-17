// Shared constants for the application
export const TIPOLOGIAS = ["TFO", "Simplex", "Encomendas", "Preço Plataforma", "Parametrizações", "Outros"];
export const PRIORIDADES = ["Baixa", "Media", "Alta", "Critica"];
export const ESTADOS = ["Aberto", "Em Curso", "Resolvido"];

export const ESTADO_STYLES = {
  "Aberto": { bg: "#FBEAE7", text: "#B84A39", border: "#F3C5BD", dot: "#B84A39" },
  "Em Curso": { bg: "#FDF3E1", text: "#B48231", border: "#F6DAB0", dot: "#B48231" },
  "Resolvido": { bg: "#EAF0EC", text: "#426B4F", border: "#C7D8CE", dot: "#426B4F" },
};

export const PRIORIDADE_STYLES = {
  "Baixa": { text: "#5C665D", dot: "#8A938B" },
  "Media": { text: "#384C37", dot: "#384C37" },
  "Alta": { text: "#B48231", dot: "#B48231" },
  "Critica": { text: "#B84A39", dot: "#B84A39" },
};

export const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
};

export const formatDateTime = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
};

export const StatusPill = ({ estado, testid }) => {
  const s = ESTADO_STYLES[estado] || ESTADO_STYLES["Aberto"];
  return (
    <span
      data-testid={testid}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-sm border"
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {estado}
    </span>
  );
};

export const PriorityDot = ({ prioridade }) => {
  const s = PRIORIDADE_STYLES[prioridade] || PRIORIDADE_STYLES["Media"];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {prioridade}
    </span>
  );
};

