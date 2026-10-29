// MAIN-world content script.
// Reaches botc.app's Vue 3 / Vuex store, subscribes to mutations, and posts
// nomination / vote / callers / phase events to the ISOLATED-world overlay.
//
// Runs in the page world (manifest "world":"MAIN") because the Vuex store is
// only reachable via page-set expando properties (el.__vue_app__), which an
// isolated content script cannot see.
//
// SAFETY: every store access is wrapped so a shape change in a future botc.app
// version degrades gracefully and never throws inside the Vuex subscriber.

import { DIR, EV, REQ, post, parse } from './shared/protocol.js';
import {
  phaseToDay,
  normalizeNomination,
  groupUserChannels,
} from './lib/model.js';

const LOG = '[botc-tracker]';
let store = null;
let unsubscribe = null;

// ---- store discovery -------------------------------------------------------

function findStore() {
  // The Vue 3 app sets __vue_app__ on its root element; the Vuex store is on
  // the app's global properties.
  const els = document.querySelectorAll('body *');
  for (const el of els) {
    const app = el.__vue_app__;
    if (app) {
      try {
        const s = app._context.config.globalProperties.$store;
        if (s && s.state && typeof s.subscribe === 'function') return s;
      } catch {
        /* keep scanning */
      }
    }
  }
  return null;
}

function init() {
  if (store) return;
  const found = findStore();
  if (!found) return; // try again on next tick
  store = found;
  attach(store);
}

// ---- state tracking --------------------------------------------------------

let pending = null; // nomination currently in progress
let lastPhase = null;
let lastGameKey = null;
let lastCallersSig = '';

function gameKey(state) {
  try {
    const h = state.game && state.game.history;
    if (h && h[0] && h[0].time) return String(h[0].time);
  } catch {
    /* ignore */
  }
  return null;
}

// Best-effort id -> name roster from the store (shape is not documented; try a
// few likely containers). The overlay falls back to the backend API if empty.
function extractRoster(state) {
  const roster = {};
  const addFrom = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const u of arr) {
      if (u && u.id != null) {
        const name = u.username || u.name;
        if (name) roster[String(u.id)] = String(name);
      }
    }
  };
  try {
    const sess = state.session || {};
    addFrom(sess.players);
    addFrom(sess.users);
    addFrom(sess.usersAll);
    addFrom(sess.spectators);
    addFrom(sess.storytellers);
  } catch {
    /* ignore */
  }
  return roster;
}

function sessionName(state) {
  try {
    return (state.session && (state.session.name || state.session.sessionName)) || null;
  } catch {
    return null;
  }
}

// The logged-in user's own id, so the overlay can highlight their name.
function selfId(state) {
  try {
    const u = state.user && state.user.user;
    return u && u.id != null ? String(u.id) : null;
  } catch {
    return null;
  }
}

// seat index -> player id, from state.players.players
function seatIds(state) {
  try {
    const arr = state.players && state.players.players;
    if (Array.isArray(arr)) return arr.map((p) => (p && p.id != null ? String(p.id) : null));
  } catch {
    /* ignore */
  }
  return [];
}

function emitRosterAndPhase(state) {
  post(DIR.COLLECTOR, EV.ROSTER, {
    roster: extractRoster(state),
    sessionName: sessionName(state),
    seatIds: seatIds(state),
    selfId: selfId(state),
  });
  emitPhase(state, true);
}

function emitPhase(state, force) {
  try {
    const phase = state.game && state.game.phase;
    if (phase == null) return;
    if (!force && phase === lastPhase) return;
    lastPhase = phase;
    post(DIR.COLLECTOR, EV.PHASE, { ...phaseToDay(phase) });
  } catch {
    /* ignore */
  }
}

function currentDay(state) {
  try {
    return phaseToDay(state.game && state.game.phase).dayNumber;
  } catch {
    return null;
  }
}

function handleGameReset(state) {
  const key = gameKey(state);
  if (key && key !== lastGameKey) {
    lastGameKey = key;
    pending = null;
    lastCallersSig = '';
    post(DIR.COLLECTOR, EV.GAME_RESET, { gameKey: key });
    emitRosterAndPhase(state);
  }
}

function handleVote(state) {
  const v = state.vote;
  if (!v) return;
  const pair = normalizeNomination(v.nomination);

  if (pair) {
    if (!pending) {
      pending = {
        nominatorSeat: pair[0],
        nomineeSeat: pair[1],
        type: v.nominationType || 'regular',
        dayNumber: currentDay(state),
        startedAt: Date.now(),
      };
    }
    // Keep the latest snapshot while the vote is live (used at finalize time).
    pending.votes = Array.isArray(v.votes) ? Array.from(v.votes) : [];
    pending.locked = v.locked;
    post(DIR.COLLECTOR, EV.NOMINATION_LIVE, {
      nominatorSeat: pending.nominatorSeat,
      nomineeSeat: pending.nomineeSeat,
      type: pending.type,
      dayNumber: pending.dayNumber,
      votes: pending.votes,
      locked: pending.locked,
      seatIds: seatIds(state),
    });
  } else if (pending) {
    // Nomination cleared -> finalize with the last live snapshot.
    post(DIR.COLLECTOR, EV.NOMINATION_RESOLVED, {
      nominatorSeat: pending.nominatorSeat,
      nomineeSeat: pending.nomineeSeat,
      type: pending.type,
      dayNumber: pending.dayNumber,
      votes: pending.votes || [],
      startedAt: pending.startedAt,
      seatIds: seatIds(state),
    });
    pending = null;
  }
}

function handleChat(state) {
  const chat = state.chat;
  if (!chat) return;
  try {
    // Private calls/whispers happen in both the night and the day. This build
    // only tracks day-time callers, so ignore all chat activity unless we're in
    // a day phase (even phase); night calls are never recorded or shown.
    const { dayNumber, isDay } = phaseToDay(state.game && state.game.phase);
    if (!isDay) return;
    const uc = chat.userChannels;
    const entries = uc instanceof Map ? Array.from(uc.entries()) : Object.entries(uc || {});
    const groups = groupUserChannels(entries);
    const sig = JSON.stringify(groups.map((g) => g.members));
    if (sig !== lastCallersSig) {
      lastCallersSig = sig;
      post(DIR.COLLECTOR, EV.CALLERS_UPDATE, { groups, dayNumber });
    }
    // Whispers (1-on-1). whisperFrom/whisperTo are id-keyed objects.
    const wf = Object.keys(chat.whisperFrom || {});
    const wt = Object.keys(chat.whisperTo || {});
    if (wf.length || wt.length) {
      post(DIR.COLLECTOR, EV.WHISPER, { from: wf, to: wt, dayNumber });
    }
  } catch {
    /* ignore */
  }
}

function onMutation(mutation, state) {
  try {
    handleGameReset(state);
    const type = (mutation && mutation.type) || '';
    if (type.startsWith('vote/') || type === 'vote') handleVote(state);
    if (type.startsWith('chat/')) handleChat(state);
    if (type.startsWith('game/') || type === 'game') emitPhase(state, false);
  } catch (e) {
    // Never throw inside the subscriber.
    console.warn(LOG, 'mutation handler error', e);
  }
}

function attach(s) {
  if (unsubscribe) unsubscribe();
  unsubscribe = s.subscribe(onMutation);
  console.log(LOG, 'collector attached to Vuex store');
  post(DIR.COLLECTOR, EV.HELLO, {});
  lastGameKey = gameKey(s.state);
  emitRosterAndPhase(s.state);
  // Emit an initial callers/vote snapshot so a freshly-loaded overlay is current.
  handleChat(s.state);
  handleVote(s.state);
}

// Overlay can ask us to re-emit current state (e.g. it loaded after us).
window.addEventListener('message', (ev) => {
  const msg = parse(ev, DIR.OVERLAY);
  if (!msg) return;
  if (msg.type === REQ.SNAPSHOT && store) {
    emitRosterAndPhase(store.state);
    handleChat(store.state);
    handleVote(store.state);
  }
});

// Poll for the store until the SPA has mounted (and re-acquire if it remounts).
const poll = setInterval(() => {
  if (!store) {
    init();
  } else if (!findStoreMatches(store)) {
    // App remounted (new Vue app instance) -> re-attach.
    store = null;
    init();
  }
}, 1000);

function findStoreMatches(s) {
  try {
    return !!(s && s.state && s.state.game !== undefined);
  } catch {
    return false;
  }
}

init();

// Clean up the interval if the page is torn down.
window.addEventListener('pagehide', () => clearInterval(poll), { once: true });
