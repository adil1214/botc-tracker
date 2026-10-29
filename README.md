# BOTC Tracker

A Chrome extension that tracks **nominators, voters, and private-chat "callers"** during a live game of
Blood on the Clocktower on [botc.app](https://botc.app). Built to help players of roles like the
**Town Crier** (did a *Minion* nominate today?) and **Flowergirl** (did the *Demon* vote today?) remember the
day's public facts — plus an auto-detected "who talked to who" view from the in-app voice chat.

The extension only reads public game state and logs it for you; it does not know other players' roles.

## What it shows

An in-page overlay panel (top-right, draggable, collapsible) with two tabs:

- **Nominations** — grouped by day. Each row: `nominator → nominee: N votes`. Click a row to expand the full
  list of who voted. A live nomination shows hands going up in real time.
- **Callers** — per day, the private-chat groups ("A, B, C") and whispers ("A ↔ B"), auto-detected from
  botc.app's built-in voice rooms.

## Install (developer / unpacked)

```bash
npm install --legacy-peer-deps   # --legacy-peer-deps avoids an npm 10 arborist bug on vitest's optional peers
npm run build                     # outputs the loadable extension into build/
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this project's **`build/`** folder.
4. Open or reload a game at `https://botc.app/play`. The panel appears top-right.

## How it works

botc.app is a Vue 3 + Vuex app whose authoritative live state lives in its Vuex store (localStorage is not
updated live for non-hosts). The extension therefore reads the store directly:

- **`collector.js`** runs in the page's **MAIN world** (`"world": "MAIN"` in the manifest, Chrome 111+) so it
  can reach the store via `el.__vue_app__._context.config.globalProperties.$store`. It `store.subscribe(...)`s
  to mutations and emits events:
  - nominations/votes from `state.vote` (`nomination = [nominatorSeat, nomineeSeat]`; `votes[i]` is `1`=voted,
    `0`=no, `null`=dead),
  - private-chat groupings from `state.chat.userChannels` (a `Map` of userId → room; grouped by shared room),
  - phase/day from `state.game.phase`.
- **`overlay.js`** runs in the **ISOLATED world**: it receives those events via `window.postMessage`, resolves
  player ids to names from the town-square DOM (`ul.circle > li.id-<id>` → `.nameplate .name`), renders the
  panel in a shadow root, and persists the log to `chrome.storage.local` (restored across refreshes).

All store access is defensive — if a future botc.app version renames a module/mutation, the collector logs a
warning and degrades instead of breaking the site.

## Verify

1. Load unpacked (above) and open a Day-phase game.
2. Confirm the panel shows player names (not `Seat N`).
3. Watch a nomination → the **Nominations** tab shows `nominator → nominee`, live hands, and the final voter
   list; expand a row to see who voted.
4. During the private-chat phase, the **Callers** tab lists the groups and whispers.
5. Refresh mid-game → the log is restored. A new game resets the live view (use **Clear** to wipe manually).

## Development

```bash
npm run watch   # rebuild on change (then hit "reload" on the extension card)
npm test        # unit tests for the pure logic (src/lib/model.js)
npm run lint
```

## Project layout

```
public/manifest.json     MV3 manifest (two content scripts: MAIN collector + ISOLATED overlay)
src/collector.js         MAIN-world Vuex subscriber -> emits nomination/vote/callers/phase events
src/overlay/index.js     ISOLATED-world UI: receives events, resolves names, renders panel, persists
src/overlay/styles.js    panel CSS (scoped in a shadow root)
src/lib/model.js         pure, tested logic (vote parsing, caller grouping, phase->day)
src/lib/session.js       backend lobby-name fallback (/backend/token -> /backend/sessions)
src/shared/protocol.js   postMessage protocol between the two content scripts
scripts/build.mjs        esbuild bundler (one self-contained IIFE per content script) + static copy
tests/model.test.js      unit tests, incl. a fixture captured from a real botc.app game
```

## Caveats

- botc.app is closed-source; store module/mutation names can change between versions. The data shapes here
  were validated against **v3.57.3**. If tracking stops working after an update, check the browser console for
  `[botc-tracker]` warnings — the selectors/field names in `src/collector.js` and `scrapeRoster()` in
  `src/overlay/index.js` are the places to adjust.
- Dead players' ghost-vote nuances are not specially handled in v1; a voter is any seat whose hand is up
  (`votes[i] === 1`) when the nomination resolves.
