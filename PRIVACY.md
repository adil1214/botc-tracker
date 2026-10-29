# Privacy Policy — BOTC Tracker

_Last updated: 29 October 2026_

BOTC Tracker is a browser extension that runs only on **botc.app**. It is built so
that everything stays on your own device.

## What the extension accesses
- The live game state shown on the botc.app page you are viewing: player names as
  displayed on screen, nominations, votes, and which players share a
  private-chat / voice room. This is read only while you are on botc.app.
- It makes network requests **only to botc.app's own backend** (the same server the
  site already uses) to look up the current lobby/session name. No requests are made
  to any other domain, and none are made to the developer.

## What it stores
- A log of the current game's nominations, votes, and private-chat groupings is
  saved **on your device** using the browser's `chrome.storage.local`. This lets the
  overlay survive page refreshes. You can erase it at any time with the panel's
  **Clear** button, or by removing the extension.

## What it does NOT do
- It does not send your data, the game state, or any personal information to the
  developer or to any third-party server.
- It does not use analytics, tracking, or advertising.
- It does not sell or share any data.
- It does not read the content of private chat messages — only which players are
  grouped together in a room.

## Permissions
- `storage` — to save the game log locally (above).
- Host access to `*://botc.app/*` — so the extension can run and read game state on
  botc.app, and nowhere else.

## Contact
Questions or concerns: **botc-tracker@proton.me**

---
_This extension is not affiliated with Blood on the Clocktower or The Pandemonium
Institute. Blood on the Clocktower is a trademark of Steven Medway and The
Pandemonium Institute._
