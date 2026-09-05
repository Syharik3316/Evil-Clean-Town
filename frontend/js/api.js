const API_BASE = "/api/v1";

function getTokens() {
  return {
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
  };
}

function setTokens(access, refresh) {
  localStorage.setItem("access_token", access);
  if (refresh) localStorage.setItem("refresh_token", refresh);
}

function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  cachedUser = null;
}

function isLoggedIn() {
  return !!getTokens().access;
}

async function refreshTokens() {
  const { refresh } = getTokens();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch (e) {
    return false;
  }
}

async function apiFetch(path, options = {}) {
  const { access } = getTokens();
  const headers = options.headers ? { ...options.headers } : {};
  if (access) headers["Authorization"] = `Bearer ${access}`;
  if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && access) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getTokens().access}`;
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }
  return res;
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    let detail = `Ошибка запроса (${res.status})`;
    let body = null;
    try {
      body = await res.json();
      if (body.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch (e) {}
    throw new ApiError(detail, res.status, body);
  }
  if (res.status === 204) return null;
  return res.json();
}

const api = {
  get: (path) => apiJson(path),
  post: (path, body) => apiJson(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (path, body) => apiJson(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path) => apiJson(path, { method: "DELETE" }),
  postForm: (path, formData) => apiJson(path, { method: "POST", body: formData }),
};

let cachedUser = null;

async function currentUser(force = false) {
  if (!isLoggedIn()) return null;
  if (cachedUser && !force) return cachedUser;
  try {
    cachedUser = await api.get("/users/me");
  } catch (e) {
    cachedUser = null;
  }
  return cachedUser;
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = "/login";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
