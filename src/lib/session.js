// Fetch the lobby/session name from botc.app's backend. The name isn't exposed
// in the in-game DOM or at a known store field, but the session list carries it.
// Matched to the current game by the user's own id, else by seated-player overlap.
// (Same token flow botc-friends uses; runs in the ISOLATED content script.)

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
    return (await r.json()).accessToken || null;
  } catch {
    return null;
  }
}

/**
 * @param {{selfId?:string, seatIds?:Array<string|null>}} ctx
 * @returns {Promise<string|null>}
 */
export async function fetchSessionName(ctx = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  try {
    const r = await fetch('/backend/sessions', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: '*/*' },
      credentials: 'include',
    });
    if (!r.ok) return null;
    const list = await r.json();
    if (!Array.isArray(list)) return null;
    const seated = new Set((ctx.seatIds || []).filter(Boolean).map(String));
    let g = ctx.selfId && list.find((x) => (x.usersAll || []).some((u) => String(u.id) === String(ctx.selfId)));
    if (!g && seated.size) g = list.find((x) => (x.players || []).some((p) => seated.has(String(p.id))));
    return g && typeof g.name === 'string' ? g.name : null;
  } catch {
    return null;
  }
}
