// Full id -> name resolver via botc.app's backend. Unlike the town-square DOM
// (which only has seated players), the backend's `usersAll` includes everyone
// connected — storytellers AND spectators — so spectators who join a voice call
// get real names instead of #ids. Same flow botc-friends uses.
//
// Runs in the ISOLATED content script, which shares the page origin and cookies,
// so relative /backend/* fetches work.

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

async function fetchJson(url, accessToken) {
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: '*/*' },
      credentials: 'include',
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function buildFromSession(session) {
  if (!session || typeof session !== 'object') return null;
  const usersAll = session.usersAll || [];
  if (!usersAll.length) return null;
  const roster = {};
  for (const u of usersAll) {
    if (u && u.id != null && u.username) roster[String(u.id)] = String(u.username);
  }
  const playerIds = new Set((session.players || []).map((p) => String(p.id)));
  const storytellerIds = (session.storytellers || []).map((p) => String(p.id));
  const stSet = new Set(storytellerIds);
  const spectatorIds = usersAll
    .map((u) => String(u.id))
    .filter((id) => !playerIds.has(id) && !stSet.has(id));
  return { roster, spectatorIds, storytellerIds };
}

// Find the current game in the session list by self id, else by seated-id overlap.
function matchSession(list, selfId, seatIds) {
  const seated = new Set((seatIds || []).filter(Boolean).map(String));
  if (selfId) {
    const bySelf = list.find((g) => (g.usersAll || []).some((u) => String(u.id) === String(selfId)));
    if (bySelf) return bySelf;
  }
  if (seated.size) {
    let best = null;
    let bestHits = 0;
    for (const g of list) {
      const pids = new Set((g.players || []).map((p) => String(p.id)));
      let hits = 0;
      for (const id of seated) if (pids.has(id)) hits++;
      if (hits > bestHits) {
        bestHits = hits;
        best = g;
      }
    }
    if (best && bestHits >= Math.min(3, seated.size)) return best;
  }
  return null;
}

/**
 * @param {{selfId?:string, seatIds?:Array<string|null>, sessionName?:string}} ctx
 * @returns {Promise<{roster:Record<string,string>, spectatorIds:string[], storytellerIds:string[]}|null>}
 */
export async function fetchFullRoster(ctx = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  // Prefer the by-name endpoint (works for private games too).
  if (ctx.sessionName) {
    const one = await fetchJson(`/backend/sessions/${encodeURIComponent(ctx.sessionName)}`, accessToken);
    const built = buildFromSession(one);
    if (built) return built;
  }

  // Fall back to scanning the public session list.
  const list = await fetchJson('/backend/sessions', accessToken);
  if (Array.isArray(list)) {
    const session = matchSession(list, ctx.selfId, ctx.seatIds);
    const built = buildFromSession(session);
    if (built) return built;
  }
  return null;
}
