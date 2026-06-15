import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import ProblemasPage from "@/pages/ProblemasPage";
import Relatorios from "@/pages/Relatorios";
import UtilizadoresPage from "@/pages/UtilizadoresPage";

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F4F3EF" }}>
        <p className="text-sm text-[#5C665D] mono">A verificar sessão...</p>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  return children;
};

const AdminRoute = ({ children }) => {
  const { user } = useAuth();
  if (user && user.role === "admin") return children;
  return <Navigate to="/" replace />;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/problemas" element={<ProblemasPage />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/utilizadores" element={<AdminRoute><UtilizadoresPage /></AdminRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
