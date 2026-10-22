// Message protocol between the MAIN-world collector and the ISOLATED-world overlay.
// They communicate via window.postMessage on the same page.

export const CHANNEL = 'botc-tracker';

// Direction tags so each side ignores its own messages.
export const DIR = {
  COLLECTOR: 'collector', // collector -> overlay
  OVERLAY: 'overlay', // overlay -> collector
};

// Event types emitted by the collector.
export const EV = {
  HELLO: 'HELLO', // collector is alive / store acquired
  ROSTER: 'ROSTER', // id -> name map (+ session name) from the store
  PHASE: 'PHASE', // phase/day changed
  GAME_RESET: 'GAME_RESET', // a new game started (new session/game id)
  NOMINATION_LIVE: 'NOMINATION_LIVE', // a nomination is in progress (live vote)
  NOMINATION_RESOLVED: 'NOMINATION_RESOLVED', // a nomination finished; final record
  CALLERS_UPDATE: 'CALLERS_UPDATE', // current private-chat groupings
  WHISPER: 'WHISPER', // 1-on-1 whisper observed
};

// Requests the overlay can send to the collector.
export const REQ = {
  SNAPSHOT: 'SNAPSHOT', // please re-emit current roster/phase/live state
};

export function post(dir, type, payload) {
  try {
    window.postMessage({ channel: CHANNEL, dir, type, payload }, '*');
  } catch {
    /* ignore */
  }
}

// Returns the validated message payload if `ev` is one of ours from `fromDir`, else null.
export function parse(ev, fromDir) {
  if (ev.source !== window) return null;
  const d = ev.data;
  if (!d || d.channel !== CHANNEL || d.dir !== fromDir) return null;
  return d;
}
