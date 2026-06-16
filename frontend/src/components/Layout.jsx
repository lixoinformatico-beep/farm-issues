import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ChartPieSlice, ListChecks, SignOut, FileArrowDown, UsersThree } from "@phosphor-icons/react";
import { Toaster } from "@/components/ui/sonner";
import logo from "@/assets/logo.png";

const NavItem = ({ to, icon: Icon, label, testid }) => (
  <NavLink
    to={to}
    end={to === "/"}
    data-testid={testid}
    className={({ isActive }) =>
      `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors border-l-2 ${
        isActive
          ? "bg-[#F0EFEB] border-[#384C37] text-[#1E231F] font-medium"
          : "border-transparent text-[#5C665D] hover:bg-[#F0EFEB] hover:text-[#1E231F]"
      }`
    }
  >
    <Icon size={18} weight={undefined} />
    <span>{label}</span>
  </NavLink>
);

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F4F3EF" }}>
      {/* Sidebar */}
      <aside className="w-60 border-r border-[#E5E3DB] bg-white flex flex-col" data-testid="sidebar">
        <div className="px-5 py-5 border-b border-[#E5E3DB]">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="PremiumFarma" className="w-9 h-9 object-contain shrink-0" />
            <div>
              <p className="text-sm font-semibold tracking-tight text-[#1E231F] leading-none" style={{ fontFamily: "Chivo" }}>
                Farma·Issues
              </p>
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#8A938B] mt-1">Consultoria</p>
            </div>
          </div>
        </div>

        <nav className="py-4 flex-1">
          <p className="label-mini px-4 mb-2">Navegação</p>
          <NavItem to="/" icon={ChartPieSlice} label="Dashboard" testid="nav-dashboard" />
          <NavItem to="/problemas" icon={ListChecks} label="Problemas" testid="nav-problemas" />
          <NavItem to="/relatorios" icon={FileArrowDown} label="Relatórios" testid="nav-relatorios" />
          {user?.role === "admin" && (
            <NavItem to="/utilizadores" icon={UsersThree} label="Utilizadores" testid="nav-utilizadores" />
          )}
        </nav>

        <div className="border-t border-[#E5E3DB] p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                 style={{ backgroundColor: "#384C37", color: "#FFFFFF" }}>
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[#1E231F] truncate font-medium" data-testid="user-name">{user?.name}</p>
              <p className="text-[11px] text-[#8A938B] truncate">
                {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : ""} · {user?.email}
              </p>
            </div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs border border-[#E5E3DB] hover:bg-[#F0EFEB] rounded-sm transition-colors text-[#5C665D]"
          >
            <SignOut size={14} />
            Terminar sessão
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
