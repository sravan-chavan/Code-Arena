// ============================================================
// CodeArena API Client
// Centralized fetch wrapper for talking to the backend.
//
// In the browser, requests go to NEXT_PUBLIC_API_URL (baked in
// at build time). This should point at Nginx, e.g.
//   http://localhost:8080/api
// The frontend must NEVER talk to Express (port 4000) directly.
// ============================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

const TOKEN_KEY = 'codearena_token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearToken() {
  setToken(null);
}

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Low-level request helper. Adds the Authorization header automatically
 * when a token is present, and normalizes backend error responses
 * ({ success: false, message }) into thrown ApiError instances.
 */
async function request(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const url = `${API_BASE_URL}${path}`;

  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (auth) {
    const token = getToken();
    if (token) {
      finalHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // Backend / Nginx unreachable
    throw new ApiError(
      'Unable to reach the server. Please check your connection and try again.',
      0,
      null
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response (e.g. Nginx error page) — fall through with null data
  }

  if (!response.ok || data?.success === false) {
    const message =
      data?.message ||
      (response.status === 401
        ? 'Authentication required.'
        : response.status === 403
        ? 'You do not have permission to do that.'
        : 'Something went wrong. Please try again.');
    throw new ApiError(message, response.status, data);
  }

  return data?.data !== undefined ? data.data : data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};

export { ApiError, API_BASE_URL };
