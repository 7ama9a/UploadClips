const CFG = window.__7UPLOAD_CONFIG || { api: "", frontend: "" };
const API_BASE = (CFG.api || "").replace(/\/$/, "");

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

function mediaUrl(path) {
  if (!path) return path;
  if (path.startsWith("http")) return path;
  return apiUrl(path);
}

function getToken() {
  return localStorage.getItem("7upload_token");
}

function setToken(token) {
  if (token) localStorage.setItem("7upload_token", token);
  else localStorage.removeItem("7upload_token");
}

function captureTokenFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  if (!token) return false;
  setToken(token);
  params.delete("token");
  const qs = params.toString();
  history.replaceState({}, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
  return true;
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  return fetch(apiUrl(path), { ...options, headers });
}

function loginUrl() {
  return apiUrl("/auth/discord");
}

function logoutUrl() {
  return apiUrl("/auth/logout");
}

function socketUrl() {
  return API_BASE || undefined;
}
