// In dev this stays '/api' and goes through the Vite proxy (same-origin).
// In production the frontend and backend are on different domains, so the
// build needs VITE_API_BASE set to the deployed backend's URL.
const API_BASE = import.meta.env.VITE_API_BASE || '/api'

function authHeader() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Token ${token}` } : {}
}

async function request(path, { method = 'GET', body, params } = {}) {
  let url = `${API_BASE}${path}`
  if (params) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    ).toString()
    if (query) url += `?${query}`
  }

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  // The token in localStorage can go stale without this tab knowing (logged
  // out in another tab, storage cleared, etc.) — treat any 401 as "signed
  // out" so the UI reflects it instead of just failing whatever fetch hit it.
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.dispatchEvent(new Event('auth:unauthorized'))
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.detail || `Request failed: ${res.status}`)
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
}
