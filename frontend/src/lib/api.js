import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // One automatic retry for idempotent reads that hit a transient 5xx / network drop.
    const config = error.config;
    const status = error.response?.status;
    if (config && config.method === "get" && !config._retried && (!status || status >= 500)) {
      config._retried = true;
      return api(config);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("staff");
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const login = (email, password) =>
  api.post("/auth/login", { email, password }).then((r) => r.data);

export const listTickets = (params = {}) =>
  api.get("/tickets", { params }).then((r) => r.data);

export const getTicket = (id) => api.get(`/tickets/${id}`).then((r) => r.data);

export const createTicket = (payload) =>
  api.post("/tickets", payload).then((r) => r.data);

export const retryTicket = (id) =>
  api.post(`/tickets/${id}/retry`).then((r) => r.data);

export const getMetrics = () => api.get("/dashboard/metrics").then((r) => r.data);

export const listEscalations = (params = {}) =>
  api.get("/dashboard/escalations", { params }).then((r) => r.data);

export const listAudit = (params = {}) =>
  api.get("/dashboard/audit", { params }).then((r) => r.data);

export const listPolicies = (params = {}) =>
  api.get("/policies", { params }).then((r) => r.data);
