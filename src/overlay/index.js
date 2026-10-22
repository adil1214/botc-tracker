// ISOLATED-world content script: the overlay UI + persistence.
// Receives events from the MAIN-world collector, resolves ids/seats to names,
// renders a panel, and persists the log to chrome.storage.local.

import { DIR, EV, REQ, post, parse } from '../shared/protocol.js';
import { votersFromVotes, pairsFromGroups, pairKey } from '../lib/model.js';
import { fetchRosterFromBackend } from '../lib/roster.js';
import { PANEL_CSS } from './styles.js';

const STORAGE_KEY = 'botc-tracker:current';

const state = {
  gameKey: null,
  sessionName: null,
  roster: {}, // id -> name
  selfId: null, // the logged-in user's id (highlight their name)
  storytellerIds: [], // ids of storytellers (highlight their names)
  phase: null, // {dayNumber, label, isDay}
  nominations: [], // resolved records (see collector NOMINATION_RESOLVED)
  live: null, // current live nomination or null
  callersByDay: {}, // dayNumber -> { groups: string[][] (ids), pairs: string[] }
  whispersByDay: {}, // dayNumber -> string[] (pair keys)
  archive: [], // past cleared logs: { at, sessionName, nominations, callersByDay, whispersByDay, roster }
  ui: { open: true, tab: 'votes', expanded: {}, confirmClear: false },
};

// ---- persistence -----------------------------------------------------------

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      chrome.storage?.local?.set({
        [STORAGE_KEY]: {
          gameKey: state.gameKey,
          sessionName: state.sessionName,
          roster: state.roster,
          selfId: state.selfId,
          storytellerIds: state.storytellerIds,
          phase: state.phase,
          nominations: state.nominations,
          callersByDay: state.callersByDay,
          whispersByDay: state.whispersByDay,
          archive: state.archive,
          ui: { open: state.ui.open, tab: state.ui.tab },
        },
      });
    } catch {
      /* storage may be unavailable; overlay still works in-memory */
    }
  }, 300);
}

function restore() {
  try {
    chrome.storage?.local?.get(STORAGE_KEY, (res) => {
      const saved = res && res[STORAGE_KEY];
      if (saved) {
        Object.assign(state, {
          gameKey: saved.gameKey ?? null,
          sessionName: saved.sessionName ?? null,
          roster: saved.roster ?? {},
          selfId: saved.selfId ?? null,
          storytellerIds: saved.storytellerIds ?? [],
          phase: saved.phase ?? null,
          nominations: saved.nominations ?? [],
          callersByDay: saved.callersByDay ?? {},
          whispersByDay: saved.whispersByDay ?? {},
          archive: saved.archive ?? [],
        });
        state.ui.open = saved.ui?.open ?? true;
        state.ui.tab = saved.ui?.tab ?? 'votes';
      }
      render();
      // Ask the collector (which may have loaded first) for current state.
      post(DIR.OVERLAY, REQ.SNAPSHOT, {});
    });
  } catch {
    post(DIR.OVERLAY, REQ.SNAPSHOT, {});
  }
}

// ---- name resolution -------------------------------------------------------

function nameForSeat(seatIds, seat) {
  let id = seatIds && seatIds[seat];
  if (id == null && state.domSeatIds) id = state.domSeatIds[seat];
  if (id != null && state.roster[String(id)]) return state.roster[String(id)];
  if (id != null) return `#${id}`;
  return `Seat ${seat + 1}`;
}

function nameForId(id) {
  return state.roster[String(id)] || `#${id}`;
}

function idForSeat(seatIds, seat) {
  let id = seatIds && seatIds[seat];
  if (id == null && state.domSeatIds) id = state.domSeatIds[seat];
  return id != null ? String(id) : null;
}

// A name as a styled <span>, highlighted if it's the user (nm-self) or a
// storyteller (nm-st). Used in both the Nominations and Callers tabs.
function nameSpan(id, name) {
  const cls = ['nm'];
  if (id != null && String(id) === String(state.selfId)) cls.push('nm-self');
  if (id != null && state.storytellerIds.includes(String(id))) cls.push('nm-st');
  return h('span', { class: cls.join(' '), text: name });
}

function seatNameSpan(seatIds, seat) {
  const id = idForSeat(seatIds, seat);
  return nameSpan(id, nameForSeat(seatIds, seat));
}

function idNameSpan(id) {
  return nameSpan(id, nameForId(id));
}

// Join an array of elements with a text separator into a fragment.
function joinEls(els, sep) {
  const frag = document.createDocumentFragment();
  els.forEach((el, i) => {
    if (i > 0) frag.appendChild(document.createTextNode(sep));
    frag.appendChild(el);
  });
  return frag;
}

// Primary id->name resolver: read botc.app's town-square DOM.
// Every token (seated players, storytellers, spectators-with-tiles) carries the
// user id in its class as `id-<userId>` with the clean name in `.nameplate .name`.
// `ul.circle > li` additionally gives seat order (seat index -> id).
function scrapeRoster() {
  const roster = {};
  // Broad pass: all id-<id> tokens -> id -> name. The regex rejects incidental
  // substring matches (e.g. "grid-"), keeping only real `id-<digits>` tokens.
  document.querySelectorAll('[class*="id-"]').forEach((el) => {
    const m = (el.className || '').match(/(?:^|\s)id-(\d+)/);
    if (!m) return;
    const nameEl = el.querySelector('.nameplate .name') || el.querySelector('.name');
    const name = nameEl ? nameEl.textContent.trim() : null;
    if (name && !roster[m[1]]) roster[m[1]] = name;
  });
  // Storyteller ids: tokens carrying a "storyteller" class.
  const storytellerIds = [];
  document.querySelectorAll('[class*="storyteller"]').forEach((el) => {
    const m = (el.className || '').match(/(?:^|\s)id-(\d+)/);
    if (m && !storytellerIds.includes(m[1])) storytellerIds.push(m[1]);
  });
  // Seat order from the town-square circle.
  const seatIds = [];
  const circle = document.querySelector('ul.circle, ul[class*="circle"]');
  if (circle) {
    [...circle.children].forEach((li, i) => {
      const m = (li.className || '').match(/(?:^|\s)id-(\d+)/);
      if (m) seatIds[i] = m[1];
    });
  }
  if (!Object.keys(roster).length && !seatIds.length) return null;
  return { roster, seatIds, storytellerIds };
}

// Merge freshly-scraped names into state; returns true if anything changed.
function refreshRoster() {
  const scraped = scrapeRoster();
  if (!scraped) return false;
  let changed = false;
  for (const [id, name] of Object.entries(scraped.roster)) {
    if (state.roster[id] !== name) {
      state.roster[id] = name;
      changed = true;
    }
  }
  if (scraped.seatIds.length) state.domSeatIds = scraped.seatIds;
  if (scraped.storytellerIds.length) {
    for (const id of scraped.storytellerIds) {
      if (!state.storytellerIds.includes(id)) {
        state.storytellerIds.push(id);
        changed = true;
      }
    }
  }
  if (changed) save();
  return changed;
}

async function ensureRoster() {
  if (refreshRoster()) render();
  // Backend fallback only if the DOM gave us nothing and we somehow know a name.
  if (Object.keys(state.roster).length > 0) return;
  if (!state.sessionName) return;
  const map = await fetchRosterFromBackend(state.sessionName);
  if (Object.keys(map).length) {
    state.roster = { ...map, ...state.roster };
    save();
    render();
  }
}

// ---- event handling --------------------------------------------------------

function resetGame(gameKey) {
  state.gameKey = gameKey ?? null;
  state.nominations = [];
  state.live = null;
  state.callersByDay = {};
  state.whispersByDay = {};
  state.ui.expanded = {};
}

function onEvent(type, p) {
  switch (type) {
    case EV.HELLO:
      break;
    case EV.ROSTER:
      if (p.roster && Object.keys(p.roster).length) state.roster = { ...state.roster, ...p.roster };
      if (p.sessionName) state.sessionName = p.sessionName;
      if (p.selfId) state.selfId = String(p.selfId);
      ensureRoster();
      break;
    case EV.PHASE:
      state.phase = p;
      break;
    case EV.GAME_RESET:
      archiveCurrent(); // preserve the finished game before wiping
      resetGame(p.gameKey);
      break;
    case EV.NOMINATION_LIVE:
      state.live = p;
      break;
    case EV.NOMINATION_RESOLVED: {
      state.live = null;
      const voterSeats = votersFromVotes(p.votes);
      state.nominations.push({
        dayNumber: p.dayNumber,
        nominatorSeat: p.nominatorSeat,
        nomineeSeat: p.nomineeSeat,
        type: p.type,
        voterSeats,
        votesFor: voterSeats.length,
        seatIds: p.seatIds || [],
        at: Date.now(),
      });
      break;
    }
    case EV.CALLERS_UPDATE: {
      const day = p.dayNumber ?? 0;
      const bucket = (state.callersByDay[day] = state.callersByDay[day] || { groups: [], pairs: [] });
      const pairSet = new Set(bucket.pairs);
      for (const k of pairsFromGroups(p.groups)) pairSet.add(k);
      bucket.pairs = [...pairSet];
      // Record distinct group memberships (ids), avoiding consecutive dupes.
      for (const g of p.groups) {
        if (g.members.length < 2) continue;
        const sig = g.members.join('|');
        if (!bucket.groups.some((x) => x.join('|') === sig)) bucket.groups.push(g.members.slice());
      }
      break;
    }
    case EV.WHISPER: {
      const day = p.dayNumber ?? 0;
      const set = new Set(state.whispersByDay[day] || []);
      // Pair every "from" with every "to" we observed in this tick.
      for (const a of p.from || []) for (const b of p.to || []) if (a !== b) set.add(pairKey(a, b));
      state.whispersByDay[day] = [...set];
      break;
    }
    default:
      return;
  }
  save();
  render();
}

window.addEventListener('message', (ev) => {
  const msg = parse(ev, DIR.COLLECTOR);
  if (!msg) return;
  onEvent(msg.type, msg.payload || {});
});

// ---- rendering -------------------------------------------------------------

let host = null;
let root = null;

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v != null) el.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

function byDay(records, dayOf) {
  const map = new Map();
  for (const r of records) {
    const d = dayOf(r);
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(r);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]); // newest day first
}

function renderVotes() {
  const wrap = h('div', { class: 'tabbody' });

  if (state.live) {
    const l = state.live;
    const up = votersFromVotes(l.votes).length;
    wrap.appendChild(
      h('div', { class: 'live' },
        h('span', { class: 'livedot' }),
        'LIVE — ',
        seatNameSpan(l.seatIds, l.nominatorSeat),
        ' → ',
        seatNameSpan(l.seatIds, l.nomineeSeat),
        `: ${up} hand${up === 1 ? '' : 's'} up`,
      ),
    );
  }

  if (!state.nominations.length) {
    wrap.appendChild(h('div', { class: 'empty', text: 'No nominations yet. They’ll appear here as they happen.' }));
    return wrap;
  }

  for (const [day, recs] of byDay(state.nominations, (r) => r.dayNumber ?? 0)) {
    wrap.appendChild(h('div', { class: 'dayhdr', text: day ? `Day ${day}` : 'Day —' }));
    recs.forEach((r, i) => {
      const key = `${day}:${i}`;
      const expanded = !!state.ui.expanded[key];
      const row = h('div', { class: 'nom' },
        h('div', { class: 'nomline', onclick: () => { state.ui.expanded[key] = !expanded; render(); } },
          h('span', { class: 'caret', text: expanded ? '▾' : '▸' }),
          h('span', { class: 'who' }, seatNameSpan(r.seatIds, r.nominatorSeat), ' → ', seatNameSpan(r.seatIds, r.nomineeSeat)),
          h('span', { class: 'tally', text: `${r.votesFor} vote${r.votesFor === 1 ? '' : 's'}` }),
          r.type && r.type !== 'regular' ? h('span', { class: 'badge', text: r.type }) : null,
        ),
      );
      if (expanded) {
        const voterEls = r.voterSeats.map((s) => seatNameSpan(r.seatIds, s));
        row.appendChild(
          h('div', { class: 'voters' },
            h('span', { class: 'voterslabel', text: 'Voted: ' }),
            voterEls.length ? joinEls(voterEls, ', ') : '(nobody)',
          ),
        );
      }
      wrap.appendChild(row);
    });
  }
  return wrap;
}

function renderCallers() {
  const wrap = h('div', { class: 'tabbody' });
  const days = new Set([...Object.keys(state.callersByDay), ...Object.keys(state.whispersByDay)].map(Number));
  if (!days.size) {
    wrap.appendChild(h('div', { class: 'empty', text: 'No private chats seen yet. They’ll appear during the day’s private-chat phase.' }));
    return wrap;
  }
  for (const day of [...days].sort((a, b) => b - a)) {
    wrap.appendChild(h('div', { class: 'dayhdr', text: day ? `Day ${day}` : 'Day —' }));
    const groups = (state.callersByDay[day] && state.callersByDay[day].groups) || [];
    if (groups.length) {
      wrap.appendChild(h('div', { class: 'subhdr', text: 'Chats' }));
      for (const g of groups) {
        wrap.appendChild(h('div', { class: 'grp' }, joinEls(g.map(idNameSpan), ' - ')));
      }
    }
    const whispers = state.whispersByDay[day] || [];
    if (whispers.length) {
      wrap.appendChild(h('div', { class: 'subhdr', text: 'Whispers' }));
      for (const w of whispers) {
        const [a, b] = w.split('|');
        wrap.appendChild(h('div', { class: 'grp' }, joinEls([idNameSpan(a), idNameSpan(b)], ' - ')));
      }
    }
  }
  return wrap;
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderHistory() {
  const wrap = h('div', { class: 'tabbody' });
  if (!state.archive.length) {
    wrap.appendChild(h('div', { class: 'empty', text: 'No cleared logs yet. Cleared and finished games are archived here so nothing is lost.' }));
    return wrap;
  }
  state.archive.forEach((a, i) => {
    const noms = a.nominations ? a.nominations.length : 0;
    const callerDays = a.callersByDay ? Object.keys(a.callersByDay).length : 0;
    const key = `arch:${i}`;
    const expanded = !!state.ui.expanded[key];
    const entry = h('div', { class: 'nom' },
      h('div', { class: 'nomline', onclick: () => { state.ui.expanded[key] = !expanded; render(); } },
        h('span', { class: 'caret', text: expanded ? '▾' : '▸' }),
        h('span', { class: 'who' },
          h('b', { text: a.sessionName || 'game' }),
          h('span', { class: 'archmeta', text: ` · ${fmtTime(a.at)}` }),
        ),
        h('span', { class: 'tally', text: `${noms} nom${noms === 1 ? '' : 's'}` }),
      ),
    );
    if (expanded) {
      const body = h('div', { class: 'archbody' });
      if (!noms) body.appendChild(h('div', { class: 'voters', text: '(no nominations)' }));
      for (const r of a.nominations || []) {
        const names = (seat) => {
          const id = r.seatIds && r.seatIds[seat];
          return (id != null && (a.roster?.[String(id)] || state.roster[String(id)])) || `Seat ${seat + 1}`;
        };
        body.appendChild(h('div', { class: 'archnom', text: `D${r.dayNumber ?? '—'}: ${names(r.nominatorSeat)} → ${names(r.nomineeSeat)} (${r.votesFor})` }));
      }
      body.appendChild(h('div', { class: 'archmeta2', text: `${callerDays} day(s) of chats archived` }));
      entry.appendChild(body);
    }
    wrap.appendChild(entry);
  });
  return wrap;
}

function render() {
  if (!root) return;
  refreshRoster(); // keep names current from the town-square DOM
  const app = root.getElementById('app');
  if (!app) return;
  app.innerHTML = '';

  const tab = (id, label) =>
    h('button', {
      class: `tab ${state.ui.tab === id ? 'active' : ''}`,
      onclick: () => { state.ui.tab = id; save(); render(); },
      text: label,
    });

  const header = h('div', { class: 'hdr' },
    h('span', { class: 'title', text: 'BOTC Tracker' }),
    h('span', { class: 'phase', text: state.phase ? state.phase.label : '' }),
    h('button', { class: 'iconbtn', title: 'Collapse', onclick: toggleOpen, text: state.ui.open ? '–' : '+' }),
  );

  const container = h('div', { class: `panel ${state.ui.open ? '' : 'closed'}` }, header);
  if (state.ui.open) {
    container.appendChild(
      h('div', { class: 'tabs' },
        tab('votes', 'Nominations'),
        tab('callers', 'Callers'),
        tab('history', `History${state.archive.length ? ` (${state.archive.length})` : ''}`),
      ),
    );
    const body = state.ui.tab === 'votes' ? renderVotes() : state.ui.tab === 'callers' ? renderCallers() : renderHistory();
    container.appendChild(body);
    container.appendChild(renderFooter());
  }
  app.appendChild(container);
  makeDraggable(header, host);
  clampIntoView();
}

function renderFooter() {
  if (state.ui.confirmClear) {
    return h('div', { class: 'foot confirm' },
      h('span', { class: 'confirmtext', text: 'Clear current log? It will be archived in History.' }),
      h('button', { class: 'dangerbtn', onclick: doClear, text: 'Clear' }),
      h('button', { class: 'linkbtn', onclick: () => { state.ui.confirmClear = false; render(); }, text: 'Cancel' }),
    );
  }
  return h('div', { class: 'foot' },
    h('button', {
      class: 'linkbtn',
      title: 'Clear the current log (archived to History)',
      onclick: () => { state.ui.confirmClear = true; render(); },
      text: 'Clear',
    }),
    h('span', { class: 'hint', text: state.sessionName ? state.sessionName : '' }),
  );
}

function toggleOpen() { state.ui.open = !state.ui.open; save(); render(); }

// Snapshot the current log into the archive (newest first), if it holds anything.
function archiveCurrent() {
  const hasData = state.nominations.length || Object.keys(state.callersByDay).length || Object.keys(state.whispersByDay).length;
  if (!hasData) return;
  state.archive.unshift({
    at: Date.now(),
    sessionName: state.sessionName,
    nominations: state.nominations,
    callersByDay: state.callersByDay,
    whispersByDay: state.whispersByDay,
    roster: { ...state.roster },
  });
  if (state.archive.length > 30) state.archive.length = 30; // cap
}

function doClear() {
  archiveCurrent();
  state.ui.confirmClear = false;
  resetGame(state.gameKey);
  save();
  render();
}

// ---- panel bootstrap -------------------------------------------------------

// Keep the panel fully within the viewport.
function clampIntoView() {
  if (!host) return;
  const w = host.offsetWidth;
  const hgt = host.offsetHeight;
  const maxLeft = Math.max(0, window.innerWidth - w);
  const maxTop = Math.max(0, window.innerHeight - hgt);
  const rect = host.getBoundingClientRect();
  const left = Math.min(maxLeft, Math.max(0, rect.left));
  const top = Math.min(maxTop, Math.max(0, rect.top));
  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.right = 'auto';
}

function makeDraggable(handle, hostEl) {
  if (handle._dragWired) return;
  handle._dragWired = true;
  handle.addEventListener('mousedown', (e) => {
    if (e.target.closest('.iconbtn')) return;
    e.preventDefault();
    const rect = hostEl.getBoundingClientRect();
    const offX = e.clientX - rect.left;
    const offY = e.clientY - rect.top;
    const move = (me) => {
      const maxLeft = Math.max(0, window.innerWidth - hostEl.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - hostEl.offsetHeight);
      const left = Math.min(maxLeft, Math.max(0, me.clientX - offX));
      const top = Math.min(maxTop, Math.max(0, me.clientY - offY));
      hostEl.style.left = `${left}px`;
      hostEl.style.top = `${top}px`;
      hostEl.style.right = 'auto';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

window.addEventListener('resize', clampIntoView);

function mount() {
  if (host && document.body.contains(host)) return;
  host = document.createElement('div');
  host.id = 'botc-tracker-host';
  host.style.cssText = 'position:fixed;top:64px;right:12px;z-index:2147483000;';
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = PANEL_CSS;
  const appEl = document.createElement('div');
  appEl.id = 'app';
  root.append(style, appEl);
  document.body.appendChild(host);
  render();
}

// Re-mount if botc.app ever removes our node.
const guard = new MutationObserver(() => {
  if (!document.body.contains(host)) mount();
});
try {
  guard.observe(document.body, { childList: true });
} catch {
  /* body not ready yet; mount() below handles it */
}

mount();
restore();

// Periodically scrape names (covers the window before any event fires, and
// name/seat changes mid-game). Re-render only when something actually changed.
setInterval(() => {
  if (refreshRoster()) render();
}, 3000);
