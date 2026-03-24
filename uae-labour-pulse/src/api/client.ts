/**
 * API client — typed fetch wrapper for the Observator backend.
 * All API calls go through this module for consistent error handling and auth.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api";

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    window.location.href = "/login";
    throw new ApiError(401, "Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail || body.error || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    let url = `${API_BASE}${path}`;
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (qs) url += `?${qs}`;
    }
    const res = await fetch(url, {
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PUT",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: { ...getAuthHeaders() },
    });
    return handleResponse<T>(res);
  },

  async upload<T>(path: string, file: File, onProgress?: (pct: number) => void): Promise<T> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    return handleResponse<T>(res);
  },

  /** Create an SSE connection for streaming */
  stream(path: string, body: unknown): EventSource | ReadableStream {
    // Use fetch + ReadableStream for POST SSE
    const controller = new AbortController();
    const promise = fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    return {
      promise,
      abort: () => controller.abort(),
    } as any;
  },
};

export { ApiError, API_BASE };
