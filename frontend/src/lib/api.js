import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// Endpoints onde 401 é esperado (não redirecionar)
const SILENT_401 = ["/auth/me", "/auth/login"];

// Interceptor: 401 -> redirecionar para /login (exceto endpoints "silenciosos")
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || "";
    if (status === 401 && !SILENT_401.some((p) => url.includes(p))) {
      // Sessão expirou ou foi invalidada
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
      // Devolver promessa pendente para evitar unhandled rejections enquanto navega
      return new Promise(() => {});
    }
    return Promise.reject(error);
  },
);

export function formatApiError(detail) {
  if (detail == null) return "Algo correu mal. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
