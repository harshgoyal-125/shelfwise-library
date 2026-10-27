const KEY = 'shelfwise_token';
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export async function api(path, { method = 'GET', body } = {}) {
  const t = getToken();
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && t) { setToken(null); window.dispatchEvent(new Event('shelfwise-logout')); }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const isStaff = (u) => u && (u.role === 'admin' || u.role === 'librarian');
export const ROLE_LABEL = { admin: 'Admin', librarian: 'Librarian', faculty: 'Faculty', student: 'Student' };
