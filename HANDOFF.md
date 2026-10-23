# Handoff — BOTC Tracker

Paste this into a fresh session to continue work. It is self-contained.

## What this is

A Chrome MV3 extension at `C:\Users\User\Desktop\projects\botc-tracker` that, during a live game of
**Blood on the Clocktower on botc.app**, tracks and displays in an in-page overlay:

1. **Nominations** (per day): who nominated whom, vote count, and the full voter list on expand. This is the
   cheat sheet for the **Town Crier** (did a Minion nominate?) and **Flowergirl** (did the Demon vote?). The
   tool only logs public facts; it does not know other players' roles.
2. **Voters** (per day): the de-duplicated set of players who voted that day (union across all of the
   day's nominations), with a count.
3. **Callers** ("who talked to who"): private voice-chat groups shown as `name1, name2`, plus whispers.
   Clicking a name toggles a highlight on that player across the whole Callers tab, so you can pick
   someone and see every chat they were in at a glance.
4. **History**: finished/cleared games are archived (lobby name + `N1 N2` night labels + nominations).

Sibling repo `../botc-friends` targets the same site (lobby friend-highlighting only); we reused its
manifest + `/backend/token`→`/backend/sessions` pattern, nothing else.

## Status

- Works end-to-end; all data paths were validated against a real botc.app v3.57.3 game via Claude-in-Chrome.
- `npm run build` → `build/`, `npm test` (9 passing), `npm run lint` (clean). Git initialized; latest commit
  covers the History lobby-name/night-labels work.
- Loaded as an unpacked extension from the **`build/`** folder (not the project root — that was a user
  stumbling point; only `build/` has the manifest).

## Build / test / load / iterate

```bash
cd C:\Users\User\Desktop\projects\botc-tracker
npm install --legacy-peer-deps   # plain `npm install` crashes on this machine: arborist "edgesOut" bug on vitest optional peers
npm run build                     # -> build/   (esbuild bundles each content script into a self-contained IIFE)
npm test                          # vitest, pure logic in src/lib/model.js
npm run lint
```

Load: `chrome://extensions` → Developer mode → **Load unpacked** → select **`build/`**.
**After ANY code change you must click the reload ↻ on the extension card AND refresh the botc.app tab** —
this repeatedly looked like "the fix didn't work" when the old build was just still cached.

## Architecture

botc.app is a **Vue 3 + Vuex** SPA; authoritative live state is in the Vuex store (localStorage is NOT updated
live for non-hosts, and the app's own `vote.history` can be empty — so we subscribe to the store and build our
own log). Two content scripts, bridged by `window.postMessage`:

- `src/collector.js` — **MAIN world** (`"world":"MAIN"` in manifest; required to see the page's Vue app).
  Finds the store via `el.__vue_app__._context.config.globalProperties.$store` (scan `body *` for
  `__vue_app__`). `store.subscribe((mutation,state)=>…)` emits NOMINATION_LIVE/RESOLVED, CALLERS_UPDATE,
  WHISPER, PHASE, GAME_RESET, ROSTER (with `selfId`). All store access is wrapped in try/catch so a future
  botc.app change degrades instead of breaking the site.
- `src/overlay/index.js` — **ISOLATED world**. Receives events, resolves names from the DOM, renders the
  shadow-DOM panel, persists to `chrome.storage.local` (key `botc-tracker:current`).
- `src/shared/protocol.js` — postMessage channel/event constants.
- `src/lib/model.js` — pure, tested logic (phaseToDay, normalizeNomination, votersFromVotes,
  finalizeNomination, groupUserChannels, pairsFromGroups).
- `src/lib/session.js` — backend fetch for the lobby name (see "Unverified" below).
- `src/overlay/styles.js` — panel CSS (shadow-scoped).
- `scripts/build.mjs` — esbuild build + copies `public/manifest.json`.

## Validated botc.app internals (the hard-won part)

- **Nominations/votes** — `store.state.vote`:
  - `nomination` = `[nominatorSeatIndex, nomineeSeatIndex]` while active, else `false` (reads back array-like,
    `{0:a,1:b}` — `normalizeNomination` handles both).
  - `votes` = array length #players, per **seat index**: `1`=voted yes, `0`=no, `null`=dead/can't vote.
  - `locked` = ST's counting-marker position; `isInProgress`; `nominationType` (`regular`|exile).
  - Mutations: `vote/nomination`, `vote/castVote`, `vote/lockVote`. Do NOT use `vote.history` (often empty).
- **Players/seats** — `store.state.players.players`: `{id, role, status, seat, …}` in seat order. No names here.
- **id → name** — from the DOM, NOT the store: `ul.circle > li` is one `<li>` per seat (seat order) with class
  `id-<userId>`. The clean name is in `.nameplate .name` **inside a `<span>`**; sibling `<div>`s hold
  video/voice placeholder copy ("This player has their camera paused…", "…listening in the voice chat"). Read
  the span (`scrapeRoster`/`nameplateName` in overlay), never the element's full textContent. A broad
  `[class*="id-"]` pass also catches storyteller tokens (`[class*="storyteller"]` → their ids).
- **Self id** (highlight the user's own name) — `store.state.user.user.id` (collector emits it as `selfId`).
- **Callers** — `store.state.chat.userChannels` is a **Map** userId→room (`""`=public); group by shared room.
  Whispers: `chat.whisperFrom`/`whisperTo`. Spectators in a call have NO board token, so they can't be named
  from the DOM — they render as a generic `👁 viewer` chip (user chose this over backend name resolution).
- **Phase/day** — `store.state.game.phase` (int; `phaseToDay`: even=Day N, odd=Night N; `dayNumber =
  floor((phase-1)/2)+1`). `game.history` has phase/death events; `game.history[0].time` is used as the
  game-reset key.
- **Lobby name** — NOT in the in-game DOM and NOT at `state.session.name`/`.sessionName` (both undefined).
  Only source is the backend session list, matched by self id (`src/lib/session.js`).

## Features implemented

Nominations tab (live + per-day log, expandable voters) · Voters tab (per-day unique voter set +
count; pure `uniqueVotersByDay` in model.js) · Callers tab (`name1, name2` groups + whispers;
click a name to toggle a teal `nm-pick` highlight across the tab — ephemeral, cleared on game reset) ·
History tab (lobby name / storyteller fallback, `N1 N2` nights, expandable; per-entry ✕ delete +
confirmed "Clear history" bulk-wipe in the footer when the tab is active) · name highlights (self = gold
`nm-self`, storyteller = purple `nm-st`) · spectator `👁 viewer` chip · confirm-before-Clear with auto-archive
(manual Clear and on game reset) · draggable panel clamped to the viewport · persistence across refresh.

## Open / unverified / decisions to revisit

- **Lobby-name fetch is UNVERIFIED.** Claude-in-Chrome blanks any script that reads the auth token, so the
  `/backend/sessions` call in `src/lib/session.js` (and the token flow) could not be tested in-session. It
  follows botc-friends' working pattern. If History shows the "`<Storyteller>'s game`" fallback instead of the
  real lobby name, debug `fetchSessionName` (check status codes, `usersAll` presence, and the self-id/seat
  match) in the user's own browser console (no filter there).
- **N vs D labels**: History uses `N1 N2` (round-by-night, per the user's request). Nominations happen in the
  day phase, so switching to `D1 D2` is a trivial change if the user prefers it. The Nominations tab still
  uses "Day N" headers (intentional, but inconsistent with History's N — confirm preference).
- **Spectator names**: deliberately NOT resolved (user asked for an icon instead). The backend roster path was
  removed. If they later want names, re-introduce a `/backend/sessions` `usersAll` lookup.
- **Ghost votes / dead-player vote nuance**: v1 counts a voter as any seat with `votes[i]===1` at resolve.
- botc.app is closed-source; selectors/mutation names can change between versions. Console warnings are tagged
  `[botc-tracker]`.

## How to verify live (what worked)

Use Claude-in-Chrome. Open the user's botc.app game tab, then in the MAIN world:
`const store = [...document.querySelectorAll('body *')].find(e=>e.__vue_app__).__vue_app__._context.config.globalProperties.$store`
and read `store.state.vote`, `store.state.chat.userChannels` (`Array.from(map.entries())`), `store.state.game.phase`.
Resolve names by scraping `ul.circle > li` (id in class, name in `.nameplate .name span`).
**Gotcha**: the tool blanks the entire result of any script that touches `localStorage['token']` or enumerates
`state.session` — keep probes away from those, and verify token-dependent code (session.js) in the real
browser console instead.

## Immediate next step if asked to continue

Confirm the lobby-name fetch actually resolves in the user's browser (console-test `fetchSessionName`), and
confirm the N-vs-D label preference. Otherwise the feature set is complete and working.
