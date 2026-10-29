// The command radio is a compact working panel. Colours and type belong to the task force's
// paper orders / painted equipment, with readable state labels instead of imaginary frequencies.
export const COMMAND_DESK_CSS = `
#radioCommand{--radio-ink:#eeeedd;--radio-muted:#a8b5aa;--radio-line:#536158;--radio-amber:#edc67d;position:fixed;right:170px;bottom:16px;z-index:18;color:var(--radio-ink);font:13px/1.45 system-ui,sans-serif;pointer-events:auto;text-shadow:none;max-width:calc(100vw - 24px)}
#radioCommand *{box-sizing:border-box}
#radioCommand [hidden]{display:none!important}
#radioCommand button,#radioCommand input,#radioCommand select{font:inherit;color:inherit;border:1px solid var(--radio-line);background:#172a2e;border-radius:3px;min-height:34px}
#radioCommand button{padding:6px 10px;cursor:pointer;text-align:center}
#radioCommand button:hover:not(:disabled){background:#2a403c;border-color:#9ba994}
#radioCommand button:disabled{opacity:.45;cursor:default}
#radioCommand :is(button,input,select,summary):focus-visible{outline:2px solid var(--radio-amber);outline-offset:2px}
#radioCommand input,#radioCommand select{padding:6px 8px;width:100%;min-width:0}
#radioCommand input{cursor:text}#radioCommand select{cursor:pointer}
#radioCommand small{font-size:11px;color:var(--radio-muted)}
#radioCommand p{margin:7px 0}#radioCommand h3{margin:0;font-size:18px;font-weight:600;letter-spacing:.02em}#radioCommand h4{margin:0 0 6px;font-size:13px}
#radioCommand .radio-dock{display:flex;gap:6px;align-items:center;justify-content:flex-end}
#radioCommand [data-toggle]{background:#1d2c26;border-color:#748570;letter-spacing:.06em;font-size:12px;padding:8px 12px}
#radioCommand [data-dock-status]{max-width:180px;font-size:11px;color:var(--radio-amber);background:#17231fe8;border-radius:3px;padding:3px 7px}
#radioCommand:has(.radio-desk:not([hidden])){right:16px}
#radioCommand:has(.radio-desk:not([hidden])) .radio-dock{display:none}
#radioCommand .radio-desk{width:510px;max-width:calc(100vw - 32px);height:min(650px,calc(100vh - 105px));height:min(650px,calc(100dvh - 105px));display:flex;flex-direction:column;border:1px solid #7c8774;border-radius:5px;background:#17231ff7;box-shadow:0 8px 35px #0008;overflow:hidden}
#radioCommand .radio-heading{padding:13px 15px 10px;border-bottom:1px solid var(--radio-line);background:linear-gradient(120deg,#2b372a,#1d2c29);display:flex;align-items:center;justify-content:space-between;gap:12px}
#radioCommand .radio-heading small{letter-spacing:.12em;font-size:10px;text-transform:uppercase;color:#c3c8b4}
#radioCommand .radio-heading [data-close]{background:transparent;font-size:19px;width:34px;min-width:34px;padding:0;line-height:1}
#radioCommand .radio-tabs{display:flex;gap:0;padding:0 8px;background:#0f1e23;border-bottom:1px solid var(--radio-line)}
#radioCommand .radio-tabs button{border:0;border-radius:0;background:transparent;color:var(--radio-muted);min-height:38px;flex:1;font-size:12px;border-bottom:2px solid transparent;padding:8px 6px}
#radioCommand .radio-tabs button[aria-selected=true]{color:var(--radio-ink);border-bottom-color:var(--radio-amber);background:#ffffff05}
#radioCommand .radio-pages{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:13px 15px;scrollbar-width:thin;scrollbar-color:#657460 #14201d}
#radioCommand [data-page]{min-height:100%}
#radioCommand .radio-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px}
#radioCommand label{display:block;font-size:12px;color:#c2c9bb}
#radioCommand label>span{display:block;margin-bottom:4px}
#radioCommand .radio-fields select{margin-top:4px;color:var(--radio-ink)}
#radioCommand [data-station-note]{margin:-3px 0 10px;font-size:11px;color:var(--radio-muted)}
#radioCommand [data-order-note]{font-size:11px;color:var(--radio-amber);margin:5px 0 8px}
#radioCommand .radio-call{margin:9px 0;padding:10px 12px;border-left:2px solid #9eaa8f;background:#0e1b1ce6}
#radioCommand .radio-call small{display:block;text-transform:uppercase;letter-spacing:.1em;font-size:9px;margin-bottom:4px}
#radioCommand [data-preview]{font-size:14px;line-height:1.5;color:#eef0df;margin:0;overflow-wrap:anywhere}
#radioCommand .radio-call-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 12px}
#radioCommand .radio-call-actions button{background:#344337;border-color:#849177;color:#f3f1dc}
#radioCommand .radio-call-actions small{max-width:240px}
#radioCommand form{border-top:1px solid #39473e;padding-top:10px;margin-top:10px}
#radioCommand .radio-written{display:flex;gap:6px;margin-top:4px}
#radioCommand .radio-written input{font-size:12px;flex:1}
#radioCommand .radio-written button{flex:none}
#radioCommand .radio-pending{padding:11px 12px;margin:0 0 11px;background:#443a24;border:1px solid #b7975b;border-radius:3px}
#radioCommand .radio-pending h4{color:#ffdda1}
#radioCommand .radio-pending p{font-size:12px;overflow-wrap:anywhere}
#radioCommand .radio-pending .radio-buttons{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
#radioCommand .radio-pending button:first-child{border-color:#c4b27b;background:#535436}
#radioCommand .radio-foot{border-top:1px solid #61705e;padding:10px 15px;background:#101e21;flex:none}
#radioCommand .radio-talk-row{display:flex;align-items:center;gap:8px}
#radioCommand [data-talk]{flex:1;font-weight:600;letter-spacing:.02em;background:#344337;border-color:#91a27f;touch-action:none;user-select:none;-webkit-user-select:none}
#radioCommand [data-talk][aria-pressed=true]{background:#5a4925;border-color:#dfbc74;color:#ffe1a0}
#radioCommand [data-transmission]{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:#798e72;box-shadow:0 0 0 3px #798e721c}
#radioCommand[data-speaking=true] [data-transmission]{background:#e5b566;box-shadow:0 0 0 3px #e5b56624}
#radioCommand output{display:block;font-size:12px;line-height:1.4;color:var(--radio-amber);margin:8px 0 4px;max-height:64px;overflow:auto;overflow-wrap:anywhere}
#radioCommand .radio-footer-note{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--radio-muted)}
#radioCommand [data-heard]{display:block;overflow-wrap:anywhere;color:#afbbb4;font-size:11px;margin:7px 0}
#radioCommand .radio-empty{color:var(--radio-muted);font-size:12px;padding:20px 8px;text-align:center;line-height:1.6}
#radioCommand .radio-list{list-style:none;margin:0;padding:0}
#radioCommand .radio-entry{padding:10px 0;border-bottom:1px solid #3c4941;overflow-wrap:anywhere}
#radioCommand .radio-entry:last-child{border-bottom:0}
#radioCommand .radio-entry .radio-entry-head{display:flex;gap:8px;align-items:baseline;justify-content:space-between;margin-bottom:4px;font-size:11px;color:var(--radio-muted)}
#radioCommand .radio-entry strong{font-size:12px;color:#dce2d0;font-weight:600}
#radioCommand .radio-entry p{font-size:12px;margin:4px 0}
#radioCommand .radio-entry time{font-variant-numeric:tabular-nums;font-size:10px;white-space:nowrap}
#radioCommand .radio-entry[data-state=awaiting] strong,#radioCommand .radio-entry[data-state=failed] strong{color:var(--radio-amber)}
#radioCommand .radio-entry[data-state=complete] strong{color:#b6cd9f}
#radioCommand .radio-state{text-transform:uppercase;font-size:9px;letter-spacing:.06em;border:1px solid #61705e;border-radius:2px;padding:1px 4px;white-space:nowrap}
#radioCommand .radio-settings-block{border-bottom:1px solid #3c4941;padding:0 0 12px;margin-bottom:12px}
#radioCommand .radio-settings-block:last-child{border-bottom:0;margin-bottom:0}
#radioCommand .radio-settings-block .radio-buttons{display:flex;flex-wrap:wrap;gap:6px}
#radioCommand .radio-settings-block meter{width:100%;height:9px;display:block;margin:7px 0}
#radioCommand input[type=range]{padding:0;min-height:22px;cursor:pointer;accent-color:#a6b891}
#radioCommand .radio-help{padding-top:9px;margin-top:9px;border-top:1px solid #3c4941;color:var(--radio-muted);font-size:11px}
#radioCommand details>summary{cursor:pointer;min-height:28px;line-height:28px;color:#c8d1bd}
#radioCommand [data-board]{width:100%;text-align:left;margin-top:8px;background:#1f302d}
@media(max-width:620px){#radioCommand{right:12px;bottom:12px}#radioCommand:has(.radio-desk:not([hidden])){right:12px}#radioCommand .radio-desk{max-width:calc(100vw - 24px);height:calc(100vh - 24px);height:calc(100dvh - 24px)}#radioCommand .radio-heading{padding:11px 12px 8px}#radioCommand .radio-pages,#radioCommand .radio-foot{padding:10px 12px}#radioCommand .radio-call-actions{align-items:flex-start}#radioCommand .radio-call-actions small{max-width:160px}}
@media(max-width:360px){#radioCommand .radio-fields{grid-template-columns:1fr}#radioCommand .radio-tabs button{font-size:11px;padding:7px 4px}}
`;
