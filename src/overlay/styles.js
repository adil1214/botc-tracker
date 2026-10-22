// Styles for the overlay panel. Scoped inside the shadow root, so these class
// names can't clash with botc.app and botc.app's CSS can't reach inside.
export const PANEL_CSS = `
:host, * { box-sizing: border-box; }
.panel {
  width: 300px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: 13px;
  color: #ece6d8;
  background: rgba(22, 16, 14, 0.96);
  border: 1px solid #6b4f2a;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.panel.closed { width: auto; }
.hdr {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px;
  background: linear-gradient(#3a2a18, #2a1d12);
  border-bottom: 1px solid #6b4f2a;
  cursor: move; user-select: none;
}
.title { font-weight: 700; letter-spacing: .3px; color: #e8c37a; white-space: nowrap; }
.phase { margin-left: auto; font-size: 11px; color: #c9a86a; white-space: nowrap; }
.iconbtn {
  width: 20px; height: 20px; line-height: 1;
  border: 1px solid #6b4f2a; border-radius: 4px;
  background: #2a1d12; color: #e8c37a; cursor: pointer; font-size: 14px;
}
.iconbtn:hover { background: #3a2a18; }
.tabs { display: flex; gap: 0; border-bottom: 1px solid #4a371f; }
.tab {
  flex: 1; padding: 6px 8px; cursor: pointer;
  background: transparent; color: #b9a988; border: none; border-bottom: 2px solid transparent;
  font-size: 12px; font-weight: 600;
}
.tab:hover { color: #ece6d8; }
.tab.active { color: #e8c37a; border-bottom-color: #e8c37a; }
.tabbody { overflow-y: auto; padding: 6px 8px; }
.empty { color: #8c7f68; padding: 14px 6px; text-align: center; line-height: 1.5; }
.dayhdr {
  margin: 8px 0 3px; padding-bottom: 2px;
  color: #e8c37a; font-weight: 700; font-size: 12px;
  border-bottom: 1px solid #4a371f;
}
.subhdr { margin: 6px 0 2px; color: #c9a86a; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; }
.nom { padding: 1px 0; }
.nomline { display: flex; align-items: center; gap: 6px; padding: 3px 2px; cursor: pointer; border-radius: 4px; }
.nomline:hover { background: rgba(255, 255, 255, 0.05); }
.caret { width: 10px; color: #a98f5e; }
.who { flex: 1; }
.who b { color: #f3ead6; font-weight: 600; }
.tally { color: #d8b878; font-variant-numeric: tabular-nums; white-space: nowrap; }
.badge {
  font-size: 10px; text-transform: uppercase; letter-spacing: .3px;
  color: #1a120c; background: #c9a86a; border-radius: 3px; padding: 1px 4px;
}
.voters { padding: 2px 2px 6px 18px; color: #cfc3a6; line-height: 1.5; }
.voterslabel { color: #9a8a6a; }
.grp { padding: 2px 2px 2px 4px; color: #e0d6bf; line-height: 1.6; }

/* name chips + highlights (self, storyteller) */
.nm { color: #efe6d2; }
.nm-self {
  color: #ffd86b; font-weight: 700;
  background: rgba(255, 200, 80, 0.14); border-radius: 3px; padding: 0 3px;
}
.nm-st {
  color: #b9a3ff; font-weight: 600;
  background: rgba(150, 130, 255, 0.14); border-radius: 3px; padding: 0 3px;
}
.nm-self.nm-st { color: #ffd86b; background: rgba(150, 130, 255, 0.2); }
.nm-viewer { color: #8f9aa6; font-style: italic; }
.who .nm { font-weight: 600; }
.live {
  display: flex; align-items: center; gap: 7px;
  margin: 4px 2px 8px; padding: 6px 8px;
  background: rgba(180, 60, 40, 0.18); border: 1px solid #8a3b2a; border-radius: 5px;
  color: #f2d2c4; font-weight: 600;
}
.livedot { width: 8px; height: 8px; border-radius: 50%; background: #e0533a; animation: pulse 1.1s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.foot {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 10px; border-top: 1px solid #4a371f; background: #241910;
}
.linkbtn { background: none; border: none; color: #c98f6a; cursor: pointer; font-size: 11px; padding: 0; }
.linkbtn:hover { color: #e0a884; text-decoration: underline; }
.hint { margin-left: auto; color: #7c6f58; font-size: 11px; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* confirm-before-clear bar */
.foot.confirm { background: rgba(140, 45, 30, 0.35); }
.confirmtext { flex: 1; color: #f0cfc2; font-size: 11px; }
.dangerbtn {
  border: 1px solid #b4472e; border-radius: 4px; background: #8a2f1c; color: #fff;
  cursor: pointer; font-size: 11px; font-weight: 600; padding: 2px 8px;
}
.dangerbtn:hover { background: #a83a22; }

/* history tab */
.archmeta { color: #9a8a6a; font-weight: 400; font-size: 11px; }
.archbody { padding: 2px 2px 6px 18px; }
.archnom { color: #d7ccb2; line-height: 1.5; font-variant-numeric: tabular-nums; }
.archmeta2 { color: #8c7f68; font-size: 11px; margin-top: 3px; }
`;
