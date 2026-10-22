// Fallback id -> name resolver: ask botc.app's backend for the session roster.
// Runs in the ISOLATED content script, which shares the page origin and cookies,
// so relative /backend/* fetches work the same way botc-friends does it.

async function getAccessToken() {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const r = await fetch('/backend/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.accessToken || null;
  } catch {
    return null;
  }
}

/**
 * @param {string|null} sessionName
 * @returns {Promise<Record<string,string>>} id -> username (empty on any failure)
 */
export async function fetchRosterFromBackend(sessionName) {
  if (!sessionName) return {};
  const accessToken = await getAccessToken();
  if (!accessToken) return {};
  try {
    const r = await fetch(`/backend/sessions/${encodeURIComponent(sessionName)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: '*/*' },
      credentials: 'include',
    });
    if (!r.ok) return {};
    const data = await r.json();
    const map = {};
    const add = (arr) => {
      if (!Array.isArray(arr)) return;
      for (const u of arr) {
        if (u && u.id != null && u.username) map[String(u.id)] = String(u.username);
      }
    };
    add(data.usersAll);
    add(data.players);
    add(data.storytellers);
    return map;
  } catch {
    return {};
  }
}
