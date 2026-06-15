import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import { Lock, EnvelopeSimple } from "@phosphor-icons/react";
import logo from "@/assets/logo.png";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@farmacias.pt");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && user !== null && user !== false) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex" style={{ backgroundColor: "#F4F3EF" }}>
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
           style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}>
        <div className="flex items-center gap-3">
          <img src={logo} alt="PremiumFarma" className="w-10 h-10 object-contain shrink-0 bg-white rounded-sm p-0.5" />
          <span className="label-mini" style={{ color: "#E8E5DA", letterSpacing: "0.25em" }}>
            Gestão de Problemas
          </span>
        </div>

        <div className="space-y-6">
          <h1 className="text-5xl xl:text-6xl font-medium leading-[0.95] tracking-tight">
            Acompanhar.<br/>
            Resolver.<br/>
            <span className="italic font-light">Documentar.</span>
          </h1>
          <p className="text-base max-w-md" style={{ color: "#CFD3CB" }}>
            Plataforma interna para registo e acompanhamento de problemas
            levantados pelas farmácias, em colaboração com os consultores.
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs label-mini" style={{ color: "#9CA89D" }}>
          <span>v1.0</span>
          <span>·</span>
          <span>Acesso reservado</span>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <img src={logo} alt="PremiumFarma" className="w-9 h-9 object-contain shrink-0" />
            <span className="label-mini">Gestão de Problemas</span>
          </div>

          <div className="mb-8">
            <p className="label-mini mb-2">Bem-vindo</p>
            <h2 className="text-3xl font-medium tracking-tight">Iniciar sessão</h2>
            <p className="text-sm text-[#5C665D] mt-2">Aceda à sua área de consultor.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="label-mini block mb-2">Email</label>
              <div className="relative">
                <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A938B]" />
                <input
                  data-testid="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#E5E3DB] rounded-sm text-sm
                             focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]"
                  placeholder="email@farmacia.pt"
                />
              </div>
            </div>

            <div>
              <label className="label-mini block mb-2">Palavra-passe</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A938B]" />
                <input
                  data-testid="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#E5E3DB] rounded-sm text-sm
                             focus:outline-none focus:border-[#384C37] focus:ring-1 focus:ring-[#384C37]"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div data-testid="login-error" className="px-3 py-2 text-xs border border-[#F3C5BD] bg-[#FBEAE7] text-[#B84A39] rounded-sm">
                {error}
              </div>
            )}

            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium tracking-wide rounded-sm transition-colors
                         disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = "#2B3A2A")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#384C37")}
            >
              {loading ? "A entrar..." : "Entrar"}
            </button>
          </form>

          <div className="mt-10 pt-6 border-t border-[#E5E3DB]">
            <p className="text-xs text-[#8A938B]">
              Conta demo: <span className="mono text-[#1E231F]">admin@farmacias.pt</span> / <span className="mono">admin123</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
