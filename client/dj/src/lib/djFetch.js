/**
 * djFetch — drop-in fetch() wrapper for the DJ client.
 *
 * - Injects "Authorization: Bearer <token>" when a session token is stored.
 * - On a 401 (token expired after server restart) it clears the session and
 *   reloads the page so the PIN overlay is shown again.
 * - Open endpoints (library, queue GET, requests POST, etc.) ignore the header,
 *   so using djFetch everywhere is safe and correct.
 */

export const SESSION_KEY = 'kantahan_dj_session';
export const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 hours

export function getToken() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { token, at } = JSON.parse(raw);
    if (!token || !at || Date.now() - at >= SESSION_TTL) return null;
    return token;
  } catch {
    return null;
  }
}

/** Call after a successful PIN verify with the token returned by the server. */
export function setSession(token) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ at: Date.now(), token: token ?? null }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function isSessionValid() {
  return !!getToken();
}

export async function djFetch(url, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    // Token has expired (server restarted). Clear session and re-show PIN overlay.
    clearSession();
    window.location.reload();
    // Never resolve — caller must not proceed after a forced reload.
    return new Promise(() => {});
  }

  return res;
}
