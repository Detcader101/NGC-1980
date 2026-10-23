// NGC-1980 inventory screen: Tarkov-style gear UI as an HTML overlay in the game's style (Consolas, cyan on navy).
// Mouse-driven (drag and drop, R rotates while dragging, Shift-drag splits a stack, Ctrl-click quick-moves,
// double-click inspects / opens, right-click menu); keyboard / gamepad cursor optional (arrows / d-pad move,
// Enter / A pick up and drop, R / X rotate, I / Y inspect, Q / RB quick move, Esc / B cancel or close).
//
//   const ui = createInvUI({ inv, parent, med?, by?, onUse?, onDrop?, onChange?, onTab?, tabs? });
//   ui.open(loot?)   loot = a crate instance or a dead soldier's root (searched over time)
//   ui.close() / ui.toggle() / ui.isOpen() / ui.render() / ui.tick(dt) (call while open; also self-ticks via rAF)
// Items are the inventory.js instances; nothing here owns game state.
import { ITEMS, ROUNDS, MATS, ERA_LABEL, S as SRC } from './items.js';
import * as I from './inventory.js';

// --------------------------------------------------------------------------------------------------------- icons
// Each icon: [viewBoxW, viewBoxH, svg]. Drawn for the item's natural (unrotated) footprint; 'c' = main colour,
// 'k' = dark detail. Simple flat silhouettes in the house style.
const c = 'var(--ic,#d9dcc6)', k = 'var(--ik,#4b5240)', red = '#d8434a', cy = '#5ef', brass = '#d8b25a';
const ICON = {
  rifle: [100, 40, `<path fill="${c}" d="M2 15h14l6-3h22v-6h4v2h18v-2h4v5h6l2 2h18v3H76v3l-6 1-14 0-2 4h-4l-2-4h-4l-3 12h-6l2-12h-7l-14 6H2z"/><path fill="${k}" d="M48 19h7l-2 15h-5z M70 13h6v3h-6z"/><rect fill="${k}" x="31" y="11" width="13" height="2"/>`],
  rifle203: [100, 40, `<path fill="${c}" d="M2 15h14l6-3h22v-6h4v2h18v-2h4v5h6l2 2h18v3H76v3l-6 1-14 0-2 4h-4l-2-4h-4l-3 12h-6l2-12h-7l-14 6H2z"/><rect fill="${k}" x="50" y="20" width="26" height="7" rx="1"/><path fill="${k}" d="M44 21h6l-2 13h-5z"/>`],
  m4: [80, 40, `<path fill="${c}" d="M2 14h16l4-2h16v-4h26v4h4v3h10v3H68v4l-8 1H46l-2 4h-4l-1-4h-3l-3 11h-6l2-11h-5l-5 4H8l-6-2z"/><rect fill="${cy}" x="54" y="9" width="8" height="3"/><path fill="${k}" d="M42 19h6l-1 15h-5z"/>`],
  ak: [80, 40, `<path fill="${c}" d="M2 18l18-5h22v-3h18l2 3h16v3H62v4l-10 2h-6l-4 4h-4l-3 10h-6l3-10h-6l-14 4H4z"/><path fill="${k}" d="M44 20l8 0l-3 12q-6 2-9-1z"/>`],
  mg: [120, 40, `<path fill="${c}" d="M2 14h18l6-2h30v-3h20v3h20l2 2h20v3H98l-2 4H76l-6 2H52l-3 10h-6l2-10h-6l-16 5H2z"/><rect fill="${k}" x="58" y="20" width="14" height="10"/><path fill="${k}" d="M84 21l3 10 2 0-2-10z"/>`],
  pistol: [40, 20, `<path fill="${c}" d="M2 3h34v6H17l-2 2h-3l-3 8H3l3-8H2z"/><rect fill="${k}" x="9" y="6" width="3" height="2"/>`],
  law: [80, 20, `<rect fill="#6b7350" x="2" y="6" width="74" height="8" rx="2"/><rect fill="${k}" x="2" y="5" width="6" height="10"/><rect fill="${k}" x="70" y="5" width="6" height="10"/><rect fill="${k}" x="30" y="3" width="6" height="3"/>`],
  rwgun: [80, 40, `<path fill="#e8ecef" d="M4 16l20-6h40l12 4-2 6H54l-8 6h-6l-4 10h-7l4-12H20L6 22z"/><path fill="${cy}" d="M26 13h30v2H26z"/>`],
  mag20: [20, 40, `<path fill="${c}" d="M4 3h12v30l-1 4H5l-1-4z"/><rect fill="${k}" x="6" y="6" width="8" height="2"/><rect fill="${brass}" x="6" y="1" width="8" height="3"/>`],
  mag30: [20, 40, `<path fill="${c}" d="M3 2h11l2 18q1 9 1 16H6q-1-7-2-16z"/><rect fill="${brass}" x="4" y="0" width="9" height="3"/>`],
  magak: [20, 40, `<path fill="${c}" d="M3 2h11l3 14q2 10 1 20H8q0-9-2-18z"/>`],
  magp: [20, 20, `<path fill="${c}" d="M6 2h8v16H6z"/><rect fill="${brass}" x="7" y="1" width="6" height="2"/>`],
  belt: [40, 40, `${[0, 1, 2, 3, 4].map(i => `<g transform="translate(${4 + i * 7} 6) rotate(${i * 6 - 12})"><rect fill="${brass}" x="0" y="0" width="5" height="24" rx="2"/><rect fill="${k}" x="-1" y="18" width="7" height="3"/></g>`).join('')}`],
  cell: [20, 20, `<rect fill="#e8ecef" x="4" y="3" width="12" height="14" rx="2"/><rect fill="${cy}" x="7" y="6" width="6" height="2"/>`],
  round: [20, 20, `${[3, 8, 13].map(x => `<rect fill="${brass}" x="${x}" y="5" width="4" height="11" rx="1"/><path fill="#b07a3a" d="M${x} 5l2-4 2 4z"/>`).join('')}`],
  roundt: [20, 20, `${[3, 8, 13].map(x => `<rect fill="${brass}" x="${x}" y="5" width="4" height="11" rx="1"/><path fill="#e44" d="M${x} 5l2-4 2 4z"/>`).join('')}`],
  roundp: [20, 20, `${[3, 9].map(x => `<rect fill="${brass}" x="${x}" y="7" width="6" height="9" rx="1"/><path fill="#999" d="M${x} 7q3-6 6 0z"/>`).join('')}`],
  needle: [20, 20, `${[4, 8, 12, 16].map(x => `<rect fill="#dfe" x="${x}" y="3" width="1.5" height="14"/>`).join('')}`],
  r40: [20, 20, `<rect fill="${brass}" x="5" y="9" width="10" height="9" rx="1"/><path fill="#5d6b46" d="M5 9q5-9 10 0z"/><rect fill="${k}" x="5" y="9" width="10" height="2"/>`],
  bando: [40, 40, `<path fill="#8a8a5c" d="M3 8h34v24H3z"/>${[0, 1, 2].map(i => `<rect fill="#6e6e48" x="${5 + i * 11}" y="10" width="9" height="20"/>`).join('')}<path fill="#a9a774" d="M3 8l17 -6 17 6z"/>`],
  can: [60, 40, `<rect fill="#5d6b46" x="4" y="8" width="52" height="28" rx="2"/><rect fill="${k}" x="4" y="6" width="52" height="5"/><rect fill="#d6d29a" x="10" y="17" width="26" height="3"/><rect fill="${k}" x="24" y="2" width="12" height="4" rx="2"/>`],
  box: [20, 20, `<rect fill="#a08a5a" x="3" y="5" width="14" height="11"/><rect fill="#e2d3a3" x="5" y="9" width="10" height="2"/>`],
  grenade: [20, 20, `<circle fill="#5d6b46" cx="10" cy="12" r="6.5"/><path fill="${c}" d="M8 3h5v3H8z M13 4l4 6-1 1-4-5z"/><circle fill="none" stroke="${c}" cx="6" cy="4" r="2"/>`],
  smoke: [20, 20, `<rect fill="#5d6b46" x="6" y="4" width="8" height="14" rx="1"/><rect fill="${c}" x="6" y="9" width="8" height="2"/><path fill="${c}" d="M8 2h5v3H8z"/>`],
  claymore: [40, 40, `<path fill="#5d6b46" d="M4 12q16-6 32 0v14q-16-6-32 0z"/><path stroke="${c}" stroke-width="2" d="M10 25l-3 10 M30 25l3 10"/><text x="20" y="21" font-size="5" text-anchor="middle" fill="${c}" font-family="monospace">FRONT</text>`],
  pouch: [20, 20, `<path fill="#6b7350" d="M3 4h14v13H3z"/><path fill="#7d865e" d="M3 4h14l-1 6H4z"/><rect fill="${k}" x="9" y="8" width="2" height="3"/>`],
  aidcase: [20, 20, `<rect fill="#6b7350" x="4" y="4" width="12" height="12" rx="2"/><path fill="${c}" d="M9 6h2v3h3v2h-3v3H9v-3H6V9h3z"/>`],
  belt2: [60, 40, `<path fill="#6b7350" d="M2 20h56v6H2z"/><path fill="#7d865e" d="M14 2l6 18h-4L10 2z M46 2l-6 18h4l6-18z"/><rect fill="${c}" x="27" y="19" width="6" height="8"/><rect fill="#6b7350" x="6" y="26" width="10" height="9"/><rect fill="#6b7350" x="44" y="26" width="10" height="9"/>`],
  vest: [60, 60, `<path fill="#6b7350" d="M14 4h10q6 8 12 0h10l8 10v40H6V14z"/><path fill="${k}" d="M30 10v44" stroke="${k}"/><rect fill="#5c6345" x="10" y="34" width="12" height="12"/><rect fill="#5c6345" x="38" y="34" width="12" height="12"/>`],
  carrier: [60, 60, `<path fill="#4c4f46" d="M12 6h12q6 6 12 0h12l6 10v38H6V16z"/><rect fill="#3c3f38" x="14" y="28" width="32" height="12"/>${[0, 1, 2].map(i => `<rect fill="#55594d" x="${15 + i * 11}" y="29" width="9" height="11"/>`).join('')}<rect fill="${cy}" x="44" y="10" width="8" height="2"/>`],
  carapace: [60, 60, `<path fill="#e6eaed" d="M12 6l18-3 18 3 8 12-4 34H8L4 18z"/><path fill="none" stroke="#9ab" d="M12 20h36M10 34h40M30 6v46"/><path fill="${cy}" d="M28 12h4v3h-4z"/>`],
  helmet: [40, 40, `<path fill="#5d6b46" d="M4 28q0-22 16-22t16 22z"/><path fill="#4b5639" d="M2 27h36v4H2z"/><path stroke="${k}" fill="none" d="M10 16q10-6 20 0"/>`],
  helmet2: [40, 40, `<path fill="#6d6a55" d="M4 30q0-24 16-24t16 24l-4 2H8z"/><rect fill="${k}" x="15" y="10" width="10" height="5" rx="1"/>`],
  pack: [40, 40, `<path fill="#6b7350" d="M6 6h28l2 30H4z"/><path fill="#7d865e" d="M6 6h28l-2 8H8z"/><rect fill="#5c6345" x="6" y="22" width="9" height="11"/><rect fill="#5c6345" x="16" y="22" width="8" height="11"/><rect fill="#5c6345" x="25" y="22" width="9" height="11"/>`],
  medbag: [60, 40, `<path fill="#6b7350" d="M4 10h52v26H4z"/><path fill="#7d865e" d="M4 10h52l-3 7H7z"/><circle fill="#eee" cx="30" cy="26" r="7"/><path fill="${red}" d="M28 21h4v3.5h3.5v4H32V32h-4v-3.5h-3.5v-4H28z"/>`],
  ifak: [40, 40, `<rect fill="#655e48" x="4" y="6" width="32" height="28" rx="3"/><path fill="${red}" d="M17 13h6v5h5v6h-5v5h-6v-5h-5v-6h5z"/>`],
  etool: [40, 40, `<path fill="${c}" d="M6 6h14l2 14H8z"/><rect fill="${k}" x="12" y="20" width="4" height="16"/><path fill="${c}" d="M22 6h12l-2 14h-8z" opacity=".7"/>`],
  knife: [20, 40, `<path fill="#c9cdd0" d="M9 2l3 3v18H8V5z"/><rect fill="${k}" x="6" y="23" width="8" height="2"/><rect fill="#3e3a33" x="8" y="25" width="4" height="12" rx="1"/>`],
  compass: [20, 20, `<circle fill="#5d6b46" cx="10" cy="10" r="7"/><circle fill="#d8d8c0" cx="10" cy="10" r="4.5"/><path fill="${red}" d="M10 6l1 4h-2z"/>`],
  flashlight: [20, 40, `<rect fill="#5d6b46" x="6" y="12" width="8" height="24" rx="1"/><path fill="#5d6b46" d="M6 12l-2-8h12l-2 8z"/><circle fill="#ffd" cx="10" cy="5" r="3"/>`],
  p38: [20, 20, `<rect fill="#bbb" x="4" y="8" width="12" height="4" rx="1"/><path fill="#bbb" d="M12 8l3-4 1 1-3 3z"/>`],
  cloth: [40, 40, `<path fill="#5d6b46" d="M4 10q16-6 32 0v20q-16 6-32 0z"/><path stroke="#4b5639" fill="none" d="M4 20q16-6 32 0"/>`],
  radio: [60, 80, `<rect fill="#5d6b46" x="6" y="10" width="48" height="66" rx="2"/><rect fill="${k}" x="12" y="16" width="36" height="22"/><circle fill="${c}" cx="20" cy="50" r="5"/><circle fill="${c}" cx="40" cy="50" r="5"/><rect fill="${c}" x="44" y="0" width="2" height="12"/>`],
  core: [20, 20, `<polygon fill="#e8ecef" points="10,2 17,6 17,14 10,18 3,14 3,6"/><circle fill="${cy}" cx="10" cy="10" r="3"/>`],
  canteen: [20, 40, `<rect fill="#5d6b46" x="3" y="8" width="14" height="28" rx="4"/><rect fill="#2f3427" x="7" y="2" width="6" height="7" rx="1"/>`],
  bladder: [40, 40, `<path fill="#5d6b46" d="M6 8q14-6 28 0v24q-14 6-28 0z"/><rect fill="#2f3427" x="16" y="2" width="8" height="6"/>`],
  pills: [20, 20, `<rect fill="#ddd" x="5" y="5" width="10" height="12" rx="2"/><rect fill="#8a6" x="5" y="3" width="10" height="4" rx="1"/>`],
  ration: [40, 20, `<rect fill="#5d6b46" x="2" y="3" width="36" height="14"/><text x="20" y="13" font-size="6" text-anchor="middle" fill="#d9dcc6" font-family="monospace">MEAL</text>`],
  pouchfood: [20, 40, `<path fill="#4b5639" d="M3 4h14v32H3z"/><rect fill="#d9dcc6" x="5" y="14" width="10" height="6"/>`],
  mre: [40, 20, `<path fill="#6a4e33" d="M2 4h36v12H2z"/><text x="20" y="13" font-size="6" text-anchor="middle" fill="#e2d1b0" font-family="monospace">MRE</text>`],
  dressing: [20, 20, `<rect fill="#5d6b46" x="3" y="5" width="14" height="10" rx="1"/><rect fill="#e9e6d6" x="6" y="7" width="8" height="6"/>`],
  dressing2: [20, 20, `<rect fill="#5d6b46" x="2" y="3" width="16" height="14" rx="1"/><rect fill="#e9e6d6" x="4" y="5" width="12" height="10"/><path fill="${red}" d="M9 7h2v2h2v2h-2v2H9v-2H7V9h2z"/>`],
  cravat: [20, 20, `<path fill="#e9e6d6" d="M2 5h16L10 17z"/><path fill="none" stroke="#b9b6a6" d="M5 7h10"/>`],
  tq: [20, 20, `<rect fill="#5d6b46" x="2" y="8" width="16" height="4"/><rect fill="#bbb" x="12" y="6" width="4" height="8"/>`],
  cat: [20, 20, `<path fill="#222" d="M2 7h16v6H2z"/><rect fill="#333" x="7" y="3" width="3" height="14" rx="1"/><rect fill="${red}" x="14" y="8" width="3" height="4"/>`],
  splint: [20, 60, `<rect fill="none" stroke="#c9cdd0" stroke-width="2" x="5" y="3" width="10" height="54"/>${[10, 18, 26, 34, 42, 50].map(y => `<path stroke="#c9cdd0" d="M5 ${y}h10"/>`).join('')}`],
  sam: [20, 40, `<rect fill="#e07a2a" x="4" y="4" width="12" height="32" rx="5"/><path stroke="#2f5d9a" stroke-width="3" d="M4 20h12"/>`],
  syrette: [20, 20, `<rect fill="#ddd" x="3" y="8" width="11" height="5" rx="2"/><rect fill="#bbb" x="14" y="10" width="5" height="1"/><rect fill="${red}" x="3" y="8" width="3" height="5"/>`],
  lozenge: [20, 20, `<rect fill="#ddd" x="9" y="7" width="2" height="11"/><circle fill="#d9d" cx="10" cy="6" r="4"/>`],
  ampoule: [20, 20, `<rect fill="#ddd" x="7" y="4" width="6" height="12" rx="3"/><rect fill="#fff" x="8" y="6" width="4" height="4"/>`],
  ivbag: [20, 40, `<path fill="#cfe7f2" d="M3 4h14v20q-7 6-14 0z" opacity=".85"/><rect fill="#2b6" x="5" y="8" width="10" height="2"/><path stroke="#cfe7f2" fill="none" d="M10 27v10"/>`],
  needle: [20, 20, `<rect fill="#ddd" x="3" y="9" width="8" height="3"/><rect fill="#ef8" x="11" y="9" width="2" height="3"/><rect fill="#ccc" x="13" y="10" width="6" height="1"/>`],
  gauze: [20, 20, `<rect fill="#3a5d3a" x="3" y="4" width="14" height="12" rx="1"/><rect fill="#e9e6d6" x="5" y="8" width="10" height="4"/>`],
  seal: [20, 20, `<rect fill="#ddd" x="3" y="3" width="14" height="14" rx="3"/><circle fill="none" stroke="${red}" cx="10" cy="10" r="4"/>`],
  injector: [20, 20, `<rect fill="#f4f6f8" x="3" y="7" width="13" height="6" rx="3"/><rect fill="${cy}" x="5" y="9" width="7" height="2"/><rect fill="#bcd" x="16" y="9.5" width="3" height="1"/>`],
  crate: [60, 40, `<rect fill="#7a6a48" x="2" y="4" width="56" height="32"/><path stroke="#5a4c30" d="M2 14h56M2 26h56"/>`],
};
ITEMS.ground = { id: 'ground', name: 'GROUND', short: 'GROUND', cat: 'crate', tags: ['crate'], static: true, w: 8, h: 6, kg: 0, stack: 1, era: '1980', icon: 'crate', grids: [{ w: 8, h: 7, label: '' }] };
export function iconSVG(id, w, h, rot = 0) {
  const d = ITEMS[id]; const [vw, vh, raw] = ICON[d?.icon] || ICON.box; const inner = raw.replace(/fill="(var\([^"]*\))"/g, 'style="fill:$1"');
  const W = rot ? h : w, H = rot ? w : h;   // the drawing box before rotation
  return `<svg class="ic${d?.era === 'rw' ? ' rw' : ''}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" style="width:${W}px;height:${H}px;${rot ? `transform:translate(-50%,-50%) rotate(90deg);position:absolute;left:50%;top:50%` : ''}">${inner}</svg>`;
}

// ----------------------------------------------------------------------------------------------------------- style
export const CSS = `
.ngc-ov{position:fixed;inset:0;z-index:40;display:none;flex-direction:column;background:radial-gradient(ellipse at 50% 40%,rgba(4,24,40,.94),rgba(0,6,14,.97));color:#9ff;font:13px/1.35 Consolas,"Courier New",monospace;user-select:none;text-shadow:0 0 4px #0cf5;pointer-events:auto}
.ngc-ov.on{display:flex}.ngc-ov *{box-sizing:border-box}
.ngc-ov .hd{display:flex;align-items:center;gap:16px;padding:8px 16px;border-bottom:1px solid #2a6a70;background:rgba(0,20,30,.6)}
.ngc-ov .tab{font-size:18px;letter-spacing:5px;color:#7aa;cursor:pointer;padding:2px 8px;border:1px solid transparent}
.ngc-ov .tab.on{color:#fff;border-color:#3a8;background:rgba(0,90,120,.45);text-shadow:0 0 10px #0af}
.ngc-ov .wt{flex:1;display:flex;align-items:center;gap:10px;justify-content:flex-end;color:#bde}
.ngc-ov .wt b{color:#fff;font-size:16px}.ngc-ov .wbar{width:180px;height:10px;border:1px solid #4aa;position:relative;background:rgba(0,30,40,.6)}
.ngc-ov .wbar i{position:absolute;left:0;top:0;bottom:0}.ngc-ov .wbar u{position:absolute;top:-3px;bottom:-3px;border-left:1px solid #ff8a}
.ngc-ov .help{padding:3px 16px;color:#6aa;font-size:10.5px;letter-spacing:.5px;border-top:1px solid #1a4a50;background:rgba(0,14,22,.7)}
.ngc-ov .help b{color:#ff8;font-weight:normal}
.ngc-inv .bd{flex:1;display:flex;gap:14px;padding:10px 14px;min-height:0}
.ngc-inv .col{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#2a6a70 transparent}
.ngc-inv .col.eq{width:290px;flex:none}.ngc-inv .col.rig{flex:1}.ngc-inv .col.loot{width:360px;flex:none}
.cat-weapon .ic{--ic:#a9ada2;--ik:#2c302a}
.ngc-inv h4{margin:0 0 3px;font-size:12px;letter-spacing:2px;color:#ff8;font-weight:normal;display:flex;justify-content:space-between;border-bottom:1px solid #4aa5;padding-bottom:2px}
.ngc-inv h4 span{color:#8ab;letter-spacing:0}
.ngc-inv .sec{background:rgba(0,30,44,.45);border:1px solid #234c55;padding:6px 8px}
.ngc-inv .row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.ngc-inv .gw{display:flex;flex-direction:column;gap:2px}.ngc-inv .gl{font-size:10px;color:#6aa;letter-spacing:1px;height:12px;white-space:nowrap}
.ngc-inv .grid{position:relative;background-color:rgba(0,16,24,.75);background-image:linear-gradient(#1d4650 1px,transparent 1px),linear-gradient(90deg,#1d4650 1px,transparent 1px);border:1px solid #2f6a74;flex:none}
.ngc-inv .slot{position:relative;border:1px solid #2f6a74;background:rgba(0,16,24,.75);flex:none}
.ngc-inv .slot .sl{position:absolute;left:4px;top:2px;font-size:10px;color:#4a8a90;letter-spacing:1px;pointer-events:none}
.ngc-inv .it{position:absolute;border:1px solid #6a8a80;overflow:hidden;cursor:grab;transition:box-shadow .1s}
.ngc-inv .it:hover{border-color:#cfe;box-shadow:0 0 8px #8ff6;z-index:2}
.ngc-inv .it .nm{position:absolute;left:2px;right:3px;top:1px;text-align:right;overflow:hidden;text-overflow:clip;font-size:9.5px;color:#e8f4f0;text-shadow:0 0 2px #000,0 0 3px #000;pointer-events:none;letter-spacing:.3px;white-space:nowrap}
.ngc-inv .it .ct{position:absolute;right:3px;bottom:1px;font-size:11px;color:#fff;text-shadow:0 0 2px #000,0 0 3px #000;pointer-events:none}
.ngc-inv .it .era{position:absolute;left:2px;bottom:1px;font-size:8px;padding:0 2px;pointer-events:none}
.ngc-inv .it .era.modern{color:#000;background:#fb4}.ngc-inv .it .era.rw{color:#003;background:#5ef}
.ngc-inv .it .erac{position:absolute;left:0;bottom:0;border:5px solid transparent;border-left-color:#fb4;border-bottom-color:#fb4;pointer-events:none}.ngc-inv .it .erac.rw{border-left-color:#5ef;border-bottom-color:#5ef}
.ngc-inv .slot.mini .nm,.ngc-inv .slot.mini .sl{display:none}
.ngc-inv .it .bar{position:absolute;left:2px;right:2px;bottom:0;height:2px;background:#0006}.ngc-inv .it .bar i{display:block;height:100%;background:#8f8}
.ngc-inv .it .q{position:absolute;left:3px;top:1px;font-size:10px;color:#ff8;pointer-events:none}
.ngc-inv .it.unseen{background:rgba(20,30,34,.9)!important;cursor:default}.ngc-inv .it.unseen *{display:none}
.ngc-inv .it.unseen:after{content:'?';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#4a6a70;font-size:18px}
.ngc-inv .it.dragsrc{opacity:.25}.ngc-inv .it.sel{outline:2px solid #ff8;z-index:3}
.ngc-inv .ic{display:block;margin:auto;filter:drop-shadow(0 1px 1px #0008);pointer-events:none}.ngc-inv .ic.rw{filter:drop-shadow(0 0 3px #5ef8)}
.cat-weapon{background:rgba(62,82,58,.6)}.cat-mag,.cat-ammo{background:rgba(96,80,42,.55)}.cat-grenade{background:rgba(96,52,40,.55)}
.cat-med{background:rgba(104,36,46,.55)}.cat-food,.cat-drink{background:rgba(44,74,92,.55)}.cat-armour,.cat-pack,.cat-rig,.cat-pouch,.cat-container{background:rgba(70,78,56,.55)}
.cat-tool,.cat-misc,.cat-loot{background:rgba(64,66,78,.55)}.cat-crate{background:rgba(90,76,50,.55)}
.ngc-inv .ghost{position:fixed;z-index:60;pointer-events:none;opacity:.85;box-shadow:0 0 14px #0cf8}
.ngc-inv .hl{position:absolute;pointer-events:none;z-index:5;border:2px solid}.ngc-inv .hl.ok{border-color:#6f6;background:#3f33}.ngc-inv .hl.no{border-color:#f55;background:#f333}
.ngc-inv .tip{position:fixed;z-index:61;pointer-events:none;background:rgba(0,10,20,.95);border:1px solid #4aa;padding:3px 7px;color:#ff8;font-size:12px;letter-spacing:1px;white-space:nowrap}
.ngc-inv .menu{position:fixed;z-index:62;background:rgba(0,14,26,.97);border:1px solid #4aa;min-width:170px;box-shadow:0 0 18px #000a}
.ngc-inv .menu div{padding:4px 12px;cursor:pointer;letter-spacing:1px}.ngc-inv .menu div:hover{background:#0a5a6a;color:#fff}.ngc-inv .menu div.off{color:#456;cursor:default;background:none}
.ngc-inv .win{position:fixed;z-index:50;background:rgba(0,14,26,.96);border:1px solid #4aa;box-shadow:0 0 24px #000c;min-width:200px}
.ngc-inv .win .wh{display:flex;justify-content:space-between;gap:12px;padding:4px 8px;background:rgba(0,60,80,.6);cursor:move;color:#fff;letter-spacing:2px}
.ngc-inv .win .wh span{cursor:pointer;color:#ff8}.ngc-inv .win .wb{padding:8px}
.ngc-inv .insp{width:420px}.ngc-inv .insp .big{height:120px;display:flex;align-items:center;justify-content:center;background:rgba(0,30,44,.5);border:1px solid #234c55;margin-bottom:8px;position:relative}
.ngc-inv .insp table{width:100%;border-collapse:collapse;font-size:12px}.ngc-inv .insp td{padding:1px 4px;border-bottom:1px solid #123a40;vertical-align:top}.ngc-inv .insp td:first-child{color:#6aa;width:38%}
.ngc-inv .insp td b{color:#fff;font-weight:normal}.ngc-inv .insp .desc{color:#bde;margin:8px 0;font-size:12px;text-shadow:none}.ngc-inv .insp .src{color:#678;font-size:10px;margin-top:6px;text-shadow:none}
.ngc-inv .split input{width:100%;accent-color:#3fd}.ngc-inv .btn{display:inline-block;padding:3px 12px;border:1px solid #3a8;background:rgba(0,40,60,.7);color:#9ff;cursor:pointer;letter-spacing:1px;margin-top:6px}
.ngc-inv .btn:hover{background:#0a5a6a;color:#fff}
.ngc-inv .quick{display:flex;gap:3px}
.ngc-inv .qs{width:36px;height:42px;border:1px solid #2f6a74;background:rgba(0,16,24,.75);position:relative}.ngc-inv .qs .k{position:absolute;left:3px;top:1px;color:#ff8;font-size:11px}
.ngc-inv .qs .it{position:absolute;inset:0;cursor:pointer;border:none}
.ngc-inv .srch{height:4px;background:#0006;margin:3px 0}.ngc-inv .srch i{display:block;height:100%;background:#ff8}
.ngc-inv .status{position:absolute;left:50%;transform:translateX(-50%);bottom:46px;color:#ff8;font-size:14px;letter-spacing:2px;text-shadow:0 0 6px #a60;pointer-events:none}
.ngc-inv .cur{position:absolute;pointer-events:none;z-index:6;border:2px dashed #ff8;box-shadow:0 0 8px #ff8}
.ngc-inv .ground{min-height:120px}
`;
export function injectCSS(id, css) { if (typeof document === 'undefined' || document.getElementById(id)) return; const s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s); }
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const kg = v => v < 1 ? (v * 1000).toFixed(0) + ' g' : v.toFixed(2) + ' kg';
export const encColor = st => ({ LIGHT: '#4f6', 'FIGHTING LOAD': '#8f6', 'APPROACH LOAD': '#fd2', OVERLOADED: '#f92', CRITICAL: '#f42', IMMOBILE: '#f22' }[st] || '#4df');

// ------------------------------------------------------------------------------------------------------- the UI
export function createInvUI(opt) {
  injectCSS('ngc-inv-css', CSS);
  const CELL = opt.cell || 36;
  const root = document.createElement('div'); root.className = 'ngc-ov ngc-inv'; (opt.parent || document.body).appendChild(root);
  const S = { inv: opt.inv, loot: null, open: false, drag: null, sel: null, cursor: null, wins: [], menu: null, status: '', statusT: 0, ground: I.newItem('ground') };
  const by = () => (opt.by ? opt.by() : { self: true, skill: opt.med?.skill || 'rifleman' });
  const D = it => ITEMS[it.id];
  const changed = () => { opt.onChange && opt.onChange(); render(); };
  const say = (t, s = 2.5) => { S.status = t; S.statusT = s; const e = root.querySelector('.status'); if (e) e.textContent = t; };

  // -------------------------------------------------------------------------------------------------- rendering
  function itemTile(it, w, h, extra = '') {
    const d = D(it); const dm = I.dims(it);
    let ct = '';
    if (d.stack > 1) ct = it.n;
    else if (d.mag) ct = w < 50 ? I.magCount(it) : `${I.magCount(it)}/${d.mag.cap}`;
    else if (d.box) ct = I.magCount(it);
    else if (d.weapon && it.slots?.mag) ct = `${I.magCount(it.slots.mag)}`;
    else if (d.water) ct = `${(it.water / 1000).toFixed(2)} L`;
    else if (it.uses > 1) ct = `x${it.uses}`;
    let bar = '';
    if (d.armour) bar = `<div class="bar"><i style="width:${(it.dur / d.armour.durMax * 100).toFixed(0)}%;background:${it.dur / d.armour.durMax > 0.5 ? '#8f8' : it.dur / d.armour.durMax > 0.25 ? '#fd2' : '#f52'}"></i></div>`;
    if (d.mag) bar = `<div class="bar"><i style="width:${(I.magCount(it) / d.mag.cap * 100).toFixed(0)}%;background:${'#fd6'}"></i></div>`;
    const q = S.inv.quick?.indexOf(it.uid); const qk = q >= 0 ? `<span class="q">${(q + 1) % 10}</span>` : '';
    const era = d.era !== '1980' ? (w < 50 ? `<span class="erac ${d.era}"></span>` : `<span class="era ${d.era}">${d.era === 'rw' ? 'RW' : 'SEIZED'}</span>`) : '';
    const pw = w - 6, ph = h - 6;
    return `<div class="it cat-${d.cat}${it.unseen ? ' unseen' : ''}${S.sel === it ? ' sel' : ''}" data-uid="${it.uid}" style="${extra}width:${w}px;height:${h}px" title="">${iconSVG(it.id, Math.max(8, pw * (it.r ? 0.92 : 0.94)), Math.max(8, ph * 0.86), it.r)}<span class="nm">${esc(d.short || d.name)}</span>${ct !== '' ? `<span class="ct">${ct}</span>` : ''}${qk}${era}${bar}</div>`;
  }
  function gridHTML(c, g, label) {
    const gd = D(c).grids[g]; const W = gd.w * CELL, H = gd.h * CELL;
    const items = c.grids[g].map(o => { const dm = I.dims(o); return itemTile(o, dm.w * CELL - 1, dm.h * CELL - 1, `left:${o.x * CELL}px;top:${o.y * CELL}px;`); }).join('');
    return `<div class="gw"><div class="gl">${esc(label ?? gd.label ?? '')}</div><div class="grid" data-c="${c.uid}" data-g="${g}" style="width:${W + 1}px;height:${H + 1}px;background-size:${CELL}px ${CELL}px">${items}</div></div>`;
  }
  function slotHTML(c, s, w, h, label, cls = '') {
    const it = c.slots[s];
    return `<div class="slot ${cls}" data-c="${c.uid}" data-s="${s}" style="width:${w}px;height:${h}px">${it ? itemTile(it, w - 2, h - 2, 'left:0;top:0;') : `<span class="sl">${esc(label)}</span>`}</div>`;
  }
  const containerGrids = (c, labelPrefix = '') => (D(c).grids || []).map((_, g) => gridHTML(c, g, (labelPrefix && !g ? labelPrefix + ' ' : '') + (D(c).grids[g].label || ''))).join('');
  const secHead = (title, it) => `<h4>${esc(title)}<span>${it ? kg(I.weight(it)) : ''}</span></h4>`;

  function render() {
    if (!S.open) return;
    const inv = S.inv, total = I.totalWeight(inv), enc = I.encumbrance(total, opt.bodyKg || 75);
    const tabs = (opt.tabs || ['GEAR']).map(t => `<span class="tab${t === 'GEAR' ? ' on' : ''}" data-tab="${t}">${t}</span>`).join('');
    const eq = inv.slots, Q = 2 * CELL + 6, E = Math.round(CELL * 1.72);
    // left: equipment, weapons, quick slots, load
    const quick = (inv.quick || Array(10).fill(null)).map((u, i) => { if (i < 3) return ''; const it = I.quick(inv, i); return `<div class="qs" data-q="${i}"><span class="k">${(i + 1) % 10}</span>${it ? itemTile(it, 34, 40, 'left:0;top:0;') : ''}</div>`; }).join('');
    const rounds = ['556', '45', '762n'].map(cal => { const n = I.countRounds(inv, cal); return n ? `${cal === '556' ? '5.56' : cal === '45' ? '.45' : '7.62'} <b style="color:#fff">${n}</b>` : ''; }).filter(Boolean).join(' &middot; ');
    const left = `<div class="sec">${secHead('EQUIPMENT')}<div class="row">
      ${slotHTML(inv, 'helmet', E, E, 'HELMET')}${slotHTML(inv, 'vest', E, E, 'ARMOUR')}${slotHTML(inv, 'belt', E, E, 'BELT')}${slotHTML(inv, 'pack', E, E, 'PACK')}</div></div>
      <div class="sec">${secHead('WEAPONS')}<div class="row" style="flex-direction:column;gap:5px">${slotHTML(inv, 'primary', 6 * CELL + 30, 2 * CELL + 4, 'PRIMARY')}${slotHTML(inv, 'secondary', 6 * CELL + 30, CELL + 14, 'SLUNG / BACK')}
      <div class="row" style="gap:5px">${slotHTML(inv, 'holster', 3 * CELL, CELL + 12, 'HOLSTER')}${weaponSlots(eq.primary)}${weaponSlots(eq.holster)}</div></div></div>
      <div class="sec">${secHead('POCKETS', eq.pockets)}<div class="row" style="gap:5px">${eq.pockets ? containerGrids(eq.pockets) : ''}</div></div>
      <div class="sec">${secHead('QUICK SLOTS')}<div class="quick">${quick}</div></div>
      <div class="sec">${secHead('LOAD')}<div style="color:#bde;font-size:12px">${(enc.frac * 100).toFixed(0)}% OF BODY MASS &middot; WALK x${enc.walkMul}<br>SPRINT ${enc.canSprint ? 'x' + enc.sprintMul : 'NO'} &middot; STAMINA DRAIN x${enc.staminaDrainMul}<br>${rounds}</div></div>`;
    // centre: pockets + vest, belt, pack
    let mid = '';
    if (eq.belt) {
      const b = eq.belt; let h = `<div class="sec">${secHead(D(b).name, b)}<div class="row" style="gap:10px">`;
      for (const s of Object.keys(D(b).slots)) {
        const p = b.slots[s];
        h += `<div class="gw"><div class="gl">${esc(D(b).slots[s].label)}</div><div class="row" style="gap:3px">${slotHTML(b, s, CELL + 2, CELL + 2, '+', 'mini')}${p?.grids ? D(p).grids.map((_, g) => gridHTML(p, g, '')).join('') : ''}</div></div>`;
      }
      mid += h + '</div></div>';
    }
    mid += '<div class="row" style="gap:8px">';
    if (eq.pack) { const p = eq.pack, G = D(p).grids; mid += `<div class="sec">${secHead(D(p).name, p)}<div class="row">${gridHTML(p, 0)}<div class="row" style="flex-direction:column;gap:2px">${G.slice(1).map((_, i) => gridHTML(p, i + 1)).join('')}</div></div></div>`; }
    if (eq.vest?.grids) mid += `<div class="sec">${secHead(D(eq.vest).short, eq.vest)}<div class="row">${containerGrids(eq.vest)}</div></div>`;
    mid += '</div>';
    // right: loot or ground
    let right = '';
    if (S.loot) {
      const L = S.loot, isBody = L.id === 'soldier', left0 = [...I.walk(L)].filter(o => o.unseen).length, tot = [...I.walk(L)].length;
      right += `<div class="sec">${secHead(isBody ? (L.name || 'BODY') : D(L).name, L)}${left0 ? `<div class="gl">SEARCHING... ${tot - left0}/${tot}</div><div class="srch"><i style="width:${((tot - left0) / Math.max(1, tot) * 100).toFixed(0)}%"></i></div>` : ''}`;
      if (isBody) {
        right += `<div class="row">${['helmet', 'vest', 'belt', 'pack'].map(s => slotHTML(L, s, Q, Q, s.toUpperCase())).join('')}${slotHTML(L, 'primary', 6 * CELL + 6, 2 * CELL + 4, 'PRIMARY')}${slotHTML(L, 'holster', 3 * CELL, CELL + 12, 'HOLSTER')}</div>`;
        for (const c of I.containers(L)) if (c !== L) right += `<div class="gl" style="margin-top:6px">${esc(D(c).short)}</div><div class="row">${containerGrids(c)}</div>`;
      } else right += `<div class="row">${containerGrids(L)}</div>`;
      right += '</div>';
    } else {
      right += `<div class="sec ground">${secHead('GROUND')}<div class="gl">DRAG HERE TO DROP</div><div class="row">${gridHTML(S.ground, 0, '')}</div></div>`;
    }
    root.innerHTML = `<div class="hd">${tabs}<div class="wt">${esc(enc.state)} <b>${total.toFixed(1)} KG</b><div class="wbar"><i style="width:${Math.min(100, enc.frac * 100)}%;background:${encColor(enc.state)}"></i>${[0.33, 0.47, 0.8].map(f => `<u style="left:${f * 100}%"></u>`).join('')}</div></div></div>
      <div class="bd"><div class="col eq">${left}</div><div class="col rig">${mid}</div><div class="col loot">${right}</div></div>
      <div class="help"><b>DRAG</b> MOVE &middot; <b>R</b> ROTATE WHILE DRAGGING &middot; <b>SHIFT-DRAG</b> SPLIT &middot; <b>CTRL-CLICK</b> QUICK MOVE &middot; <b>DOUBLE-CLICK</b> INSPECT / OPEN &middot; <b>RIGHT-CLICK</b> MENU &middot; <b>4-0</b> OVER AN ITEM: QUICK SLOT &middot; DROP ROUNDS ON A MAGAZINE: LOAD &middot; <b>ESC</b> CLOSE</div>
      <div class="status">${esc(S.statusT > 0 ? S.status : '')}</div>`;
    for (const w of S.wins) root.appendChild(w.el), w.refresh && w.refresh();
    if (S.cursor) drawCursor();
  }
  function weaponSlots(w) {
    if (!w?.slots) return '';
    return Object.keys(w.slots).map(s => slotHTML(w, s, CELL + 8, s === 'gl' ? CELL + 8 : 2 * CELL + 4, s === 'mag' ? 'MAG' : s.toUpperCase())).join('');
  }

  // --------------------------------------------------------------------------------------------------- lookup
  function byUid(uid) {
    uid = +uid;
    for (const r of [S.inv, S.loot, S.ground, ...S.wins.map(w => w.c)]) { if (!r) continue; if (r.uid === uid) return r; const f = I.find(r, o => o.uid === uid); if (f) return f; }
    return null;
  }
  const ownerRoot = it => I.rootOf(it);
  function canInteract(it) { return it && !it.unseen && !D(it).fixed && !D(it).static; }

  // ---------------------------------------------------------------------------------------------------- drag
  function startDrag(it, e, split) {
    const el = e.target.closest('.it'); const r = el.getBoundingClientRect(); const dm = I.dims(it);
    S.drag = { it, rot: it.r, gx: Math.min(dm.w - 1, Math.floor((e.clientX - r.left) / CELL)), gy: Math.min(dm.h - 1, Math.floor((e.clientY - r.top) / CELL)), split, x: e.clientX, y: e.clientY };
    el.classList.add('dragsrc');
    const g = document.createElement('div'); g.className = 'ngc-inv'; g.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60'; root.appendChild(g); S.drag.layer = g;
    updateGhost(e);
  }
  function updateGhost(e) {
    const d = S.drag; if (!d) return; const it = d.it, D0 = D(it);
    const w = (d.rot ? D0.h : D0.w) * CELL - 1, h = (d.rot ? D0.w : D0.h) * CELL - 1;
    const gx = d.rot !== it.r ? d.gy : d.gx, gy = d.rot !== it.r ? d.gx : d.gy;
    const saveR = it.r; it.r = d.rot; const html = itemTile(it, w, h, ''); it.r = saveR;
    d.layer.innerHTML = `<div class="ghost" style="left:${e.clientX - gx * CELL - CELL / 2}px;top:${e.clientY - gy * CELL - CELL / 2}px">${html}</div>`;
    d.layer.firstChild.firstChild.style.position = 'relative';
    // target
    const t = target(e); d.t = t;
    let tip = '';
    root.querySelectorAll('.hl').forEach(x => x.remove());
    if (t?.kind === 'grid') {
      const gel = t.el, err = t.err;
      const hl = document.createElement('div'); hl.className = 'hl ' + (err ? 'no' : 'ok');
      hl.style.cssText = `left:${t.x * CELL}px;top:${t.y * CELL}px;width:${w + 1}px;height:${h + 1}px`; gel.appendChild(hl); if (err) tip = err;
    } else if (t?.kind === 'slot' || t?.kind === 'item') {
      const hl = document.createElement('div'); hl.className = 'hl ' + (t.err ? 'no' : 'ok'); hl.style.cssText = 'inset:0;'; t.el.appendChild(hl); tip = t.err || t.label || '';
    }
    if (tip) d.layer.insertAdjacentHTML('beforeend', `<div class="tip" style="left:${e.clientX + 16}px;top:${e.clientY + 18}px">${esc(tip)}</div>`);
  }
  // what's under the cursor for the dragged item
  function target(e) {
    const d = S.drag, it = d.it;
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const itemEl = els.find(x => x.classList?.contains('it') && !x.classList.contains('dragsrc') && !x.closest('.ghost'));
    if (itemEl) {
      const o = byUid(itemEl.dataset.uid);
      if (o && o !== it && !o.unseen) {
        const od = D(o), id = D(it);
        if (I.canMerge(it, o)) return { kind: 'item', el: itemEl, o, act: 'merge', label: 'STACK' };
        if (od.mag && (id.round || id.box || id.mag)) { const cal = id.round ? ROUNDS[id.round].cal : id.box ? ROUNDS[id.box.round].cal : null; return { kind: 'item', el: itemEl, o, act: 'load', err: cal && cal !== od.mag.cal ? 'WRONG CALIBRE' : I.magCount(o) >= od.mag.cap ? 'FULL' : '', label: 'LOAD ROUNDS' }; }
        if (od.weapon && id.mag && o.slots?.mag !== undefined) return { kind: 'item', el: itemEl, o, act: 'attach', err: I.slotError(o, 'mag', it) === 'WRONG ITEM' ? 'WRONG MAGAZINE' : '', label: o.slots.mag ? 'SWAP MAGAZINE' : 'ATTACH MAGAZINE' };
        if (od.weapon && o.slots?.gl !== undefined && id.tags.includes('r40')) return { kind: 'item', el: itemEl, o, act: 'gl', err: o.slots.gl ? 'LOADED' : '', label: 'LOAD M203' };
        if (o.grids && !od.static) { const f = I.findFree(o, { ...it, r: d.rot }); return { kind: 'item', el: itemEl, o, act: 'into', err: I.isWithin(o, it) ? 'INSIDE ITSELF' : f ? '' : 'NO ROOM', label: 'PUT IN ' + od.short }; }
      }
    }
    const slotEl = els.find(x => x.classList?.contains('slot'));
    if (slotEl) { const c = byUid(slotEl.dataset.c); const s = slotEl.dataset.s; if (c) { let err = I.slotError(c, s, it); if (err === 'OCCUPIED' && c.slots[s] === it) err = ''; return { kind: 'slot', el: slotEl, c, s, err: err === 'OCCUPIED' ? '' : err, swap: err === 'OCCUPIED' }; } }
    const qEl = els.find(x => x.classList?.contains('qs'));
    if (qEl) return { kind: 'slot', el: qEl, q: +qEl.dataset.q, err: '', label: 'QUICK SLOT ' + ((+qEl.dataset.q + 1) % 10) };
    const gEl = els.find(x => x.classList?.contains('grid'));
    if (gEl) {
      const c = byUid(gEl.dataset.c), g = +gEl.dataset.g; if (!c) return null;
      const r = gEl.getBoundingClientRect(); const D0 = D(it);
      const gx = d.rot !== it.r ? d.gy : d.gx, gy = d.rot !== it.r ? d.gx : d.gy;
      // anchor on the grabbed cell, then clamp into the grid so an overhang near an edge still snaps in
      const gd = D(c).grids[g], iw = d.rot ? D0.h : D0.w, ih = d.rot ? D0.w : D0.h;
      const x = Math.max(0, Math.min(gd.w - iw, Math.round((e.clientX - r.left - CELL / 2) / CELL - gx))), y = Math.max(0, Math.min(gd.h - ih, Math.round((e.clientY - r.top - CELL / 2) / CELL - gy)));
      const err = I.placeError(c, g, it, x, y, d.rot);
      return { kind: 'grid', el: gEl, c, g, x, y, err };
    }
    return null;
  }
  function endDrag(e) {
    const d = S.drag; S.drag = null; d.layer.remove(); root.querySelectorAll('.hl').forEach(x => x.remove());
    const t = d.t; const it = d.it;
    if (!t || t.err) { if (t?.err) say(t.err); render(); return; }
    let moving = it;
    if (d.split && it.n > 1) { askSplit(it, n => { const part = I.split(it, n); if (part) { part.r = d.rot; doDrop(part, t, d, true); } }); render(); return; }
    doDrop(moving, t, d, false);
  }
  function doDrop(it, t, d, fresh) {
    const was = I.parentOf(it);
    let err = '';
    if (t.kind === 'grid') err = I.placeIn(t.c, t.g, it, t.x, t.y, d.rot);
    else if (t.kind === 'slot' && t.q != null) { I.bindQuick(S.inv, t.q, it); say('QUICK SLOT ' + ((t.q + 1) % 10) + ': ' + D(it).short); if (fresh) I.autoStore(S.inv, it); }
    else if (t.kind === 'slot') {
      if (t.swap) { const old = t.c.slots[t.s]; const p = I.parentOf(it); I.detach(old); err = I.slotIn(t.c, t.s, it); if (!err) { if (p?.g != null && !I.placeError(p.c, p.g, old, it.x, it.y, old.r)) I.placeIn(p.c, p.g, old, it.x, it.y, old.r); else if (!I.autoStore(S.inv, old)) dropToGround(old); } else I.slotIn(t.c, t.s, old); }
      else err = I.slotIn(t.c, t.s, it);
    } else if (t.kind === 'item') {
      const o = t.o;
      if (t.act === 'merge') I.merge(it, o);
      else if (t.act === 'load') { const r = I.loadMag(o, it); say(r.error || `LOADED ${r.loaded} RDS (${r.seconds.toFixed(0)} S)`); opt.onTimed && opt.onTimed('load', r.seconds); }
      else if (t.act === 'attach') { const old = o.slots.mag; if (old) I.detach(old); err = I.slotIn(o, 'mag', it); if (old) { if (!I.autoStore(S.inv, old)) dropToGround(old); } say(err || 'MAGAZINE IN'); }
      else if (t.act === 'gl') err = I.slotIn(o, 'gl', it);
      else if (t.act === 'into') { const f = I.findFree(o, it); if (f) err = I.placeIn(o, f.g, it, f.x, f.y, f.r); else err = 'NO ROOM'; }
    }
    if (err) { say(err); if (fresh) { if (!I.autoStore(S.inv, it)) dropToGround(it); } }
    else if (S.ground.grids[0].includes(it) && opt.onDrop) opt.onDrop(it);
    I.prune(S.inv); changed();
  }
  function dropToGround(it) { const f = I.findFree(S.ground, it); if (f) I.placeIn(S.ground, f.g, it, f.x, f.y, f.r); else I.detach(it); opt.onDrop && opt.onDrop(it); }

  // ----------------------------------------------------------------------------------------------- dialogs
  function win(title, body, x, y, cls = '', c = null) {
    const el = document.createElement('div'); el.className = 'win ' + cls; el.style.left = x + 'px'; el.style.top = y + 'px';
    el.innerHTML = `<div class="wh">${esc(title)}<span data-close>&times;</span></div><div class="wb">${body}</div>`;
    const w = { el, c }; S.wins.push(w); root.appendChild(el);
    el.querySelector('[data-close]').onclick = () => closeWin(w);
    const hd = el.querySelector('.wh'); hd.onpointerdown = e => { if (e.target.dataset.close != null) return; const ox = e.clientX - el.offsetLeft, oy = e.clientY - el.offsetTop; const mv = ev => { el.style.left = ev.clientX - ox + 'px'; el.style.top = ev.clientY - oy + 'px'; }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); };
    return w;
  }
  function closeWin(w) { w.el.remove(); S.wins = S.wins.filter(x => x !== w); }
  function openContainer(c, x, y) {
    if (S.wins.some(w => w.c === c)) return;
    const w = win(D(c).name, '', x, y, '', c);
    w.refresh = () => { w.el.querySelector('.wb').innerHTML = `<div class="row">${containerGrids(c)}</div><div class="gl" style="margin-top:4px">${kg(I.weight(c))}</div>`; };
    w.refresh();
  }
  function inspect(it, x, y) {
    const d = D(it), rows = [];
    const add = (k, v) => rows.push(`<tr><td>${k}</td><td><b>${v}</b></td></tr>`);
    add('CATEGORY', d.cat.toUpperCase() + (d.era !== '1980' ? ` &middot; <span style="color:${d.era === 'rw' ? '#5ef' : '#fb4'}">${ERA_LABEL[d.era]}</span>` : ''));
    add('WEIGHT', kg(I.weight(it)) + (I.weight(it) !== d.kg ? ` (EMPTY ${kg(d.kg)})` : ''));
    add('SIZE', `${d.w} x ${d.h}${d.stack > 1 ? ` &middot; STACKS TO ${d.stack}` : ''}`);
    if (d.weapon) { add('CALIBRE', d.weapon.cal); if (d.weapon.rpm) add('RATE', d.weapon.rpm + ' RPM'); add('MODES', d.weapon.modes.join(' / ').toUpperCase()); if (it.slots?.mag) add('MAGAZINE', `${I.magCount(it.slots.mag)} / ${D(it.slots.mag).mag.cap}`); }
    if (d.mag) { add('CAPACITY', `${I.magCount(it)} / ${d.mag.cap}`); add('LOADING', `${d.mag.loadS} S / ROUND (THUMB)`); if (it.ammo?.length) add('ROUNDS', it.ammo.slice().reverse().map(([r, n]) => `${n} x ${ROUNDS[r].name}`).join('<br>')); }
    const rd = ROUNDS[d.round || d.box?.round];
    if (rd) { add('ROUND', rd.name); add('DAMAGE / PEN', `${rd.dmg} / ${rd.pen}`); add('CARTRIDGE', `${rd.cartG} G`); if (d.box) add('CONTENTS', `${I.magCount(it)} RDS${d.box.clip ? ` ON ${d.box.clip}-RD CLIPS` : ''}`); }
    if (d.armour) { add('DURABILITY', `${it.dur.toFixed(0)} / ${d.armour.durMax}`); for (const L of d.armour.layers) add(`CLASS ${MATS[L.mat].cls} ${MATS[L.mat].name}`, Object.entries(L.zones).map(([z, v]) => `${z.toUpperCase()} ${(v * 100).toFixed(0)}%`).join(', ') + `<br><span style="color:#8ab">${L.faces.join(' / ').toUpperCase()}</span>`); }
    if (d.med) { const m = d.med; add('USE', m.kind.toUpperCase() + (m.who === 'corpsman' ? ' &middot; <span style="color:#f88">CORPSMAN ONLY</span>' : '')); if (m.time) { const t = v => typeof v === 'object' ? `ARM ${v.arm} S / LEG ${v.leg} S` : v + ' S'; add('TIME', `SELF ${t(m.time.self)} &middot; BUDDY ${t(m.time.buddy)}`); } if (m.mg) add('DOSE', m.mg + ' MG'); if (m.kcal) add('ENERGY', m.kcal + ' KCAL'); if (m.ml) add('VOLUME', m.ml + ' ML @ ' + m.mlPerMin + ' ML/MIN'); if (m.tq) add('SUCCESS', `ARM ${(m.tq.p.arm * 100).toFixed(0)}% &middot; LEG ${(m.tq.p.leg * 100).toFixed(0)}%`); if (it.uses > 1) add('USES LEFT', it.uses); }
    if (d.water) add('WATER', `${it.water} / ${d.water} ML`);
    if (d.grids) add('GRIDS', d.grids.map(g => `${g.w}x${g.h}${g.label ? ' ' + g.label : ''}`).join(', '));
    const src = d.src ? d.src.split(/[ ,(]/)[0] : ''; const srcText = SRC[src] ? `${SRC[src]}` : d.src || '';
    const w = win(d.name, `<div class="big">${iconSVG(it.id, 380, 110, 0)}</div><table>${rows.join('')}</table>${d.desc ? `<div class="desc">${esc(d.desc)}</div>` : ''}<div class="src">${d.tag || ''}${srcText ? ' &middot; ' + esc(srcText) : ''}</div>`, x, y, 'insp');
    return w;
  }
  function askSplit(it, cb) {
    const half = Math.floor(it.n / 2);
    const w = win('SPLIT ' + D(it).short, `<div class="split">TAKE <b id="sv" style="color:#fff">${half}</b> OF ${it.n}<input type="range" min="1" max="${it.n - 1}" value="${half}"><span class="btn" data-ok>OK</span> <span class="btn" data-no>CANCEL</span></div>`, innerWidth / 2 - 120, innerHeight / 2 - 50);
    const r = w.el.querySelector('input'); r.oninput = () => w.el.querySelector('#sv').textContent = r.value;
    w.el.querySelector('[data-ok]').onclick = () => { closeWin(w); cb(+r.value); };
    w.el.querySelector('[data-no]').onclick = () => closeWin(w);
  }
  function menu(it, x, y) {
    closeMenu(); const d = D(it), items = [];
    const mine = I.isWithin(it, S.inv);
    items.push(['INSPECT', () => inspect(it, Math.min(x, innerWidth - 440), Math.min(y, innerHeight - 420))]);
    if (it.grids && !d.static) items.push(['OPEN', () => openContainer(it, x, y)]);
    if (d.med || d.water) items.push([d.med?.kind === 'drink' ? 'DRINK' : d.med?.kind === 'eat' ? 'EAT' : 'USE', () => useItem(it), !mine]);
    if (d.mag && I.magCount(it)) items.push(['UNLOAD', () => { const r = I.unloadMag(it); for (const s of r.stacks) if (!I.autoStore(S.inv, s)) dropToGround(s); say(`UNLOADED (${r.seconds.toFixed(0)} S)`); changed(); }]);
    if (d.mag && I.magCount(it) < d.mag.cap) items.push(['FILL FROM RIG', () => { let tot = 0, secs = 0; for (const src of I.findAll(S.inv, (o, od) => o !== it && ((od.round && ROUNDS[od.round].cal === d.mag.cal) || (od.box && ROUNDS[od.box.round].cal === d.mag.cal)))) { const r = I.loadMag(it, src); tot += r.loaded; secs += r.seconds; if (I.magCount(it) >= d.mag.cap) break; } say(tot ? `LOADED ${tot} RDS (${secs.toFixed(0)} S)` : 'NO ROUNDS'); I.prune(S.inv); changed(); }]);
    if (d.weapon && it.slots?.mag) items.push(['RELOAD', () => { const r = I.reload(S.inv, it); say(r ? `RELOADED ${I.magCount(r.mag)} RDS` : 'NO MAGAZINE'); changed(); }]);
    if (d.stack > 1 && it.n > 1) items.push(['SPLIT', () => askSplit(it, n => { const p = I.split(it, n); if (p && !I.autoStore(S.inv, p, { exclude: null })) dropToGround(p); changed(); })]);
    if (!d.weapon || d.weapon) items.push(['BIND QUICK SLOT', () => { const k = S.inv.quick.findIndex((u, i) => i >= 3 && u == null); if (k >= 0) { I.bindQuick(S.inv, k, it); say('QUICK SLOT ' + ((k + 1) % 10)); changed(); } }, !mine]);
    items.push([mine ? 'DROP' : 'TAKE', () => { if (mine) { I.detach(it); dropToGround(it); } else if (!I.autoStore(S.inv, it)) say('NO ROOM'); changed(); }, d.fixed]);
    const m = document.createElement('div'); m.className = 'menu'; m.style.left = x + 'px'; m.style.top = y + 'px';
    for (const [t, f, off] of items) { const e = document.createElement('div'); e.textContent = t; if (off) e.className = 'off'; else e.onclick = () => { closeMenu(); f(); }; m.appendChild(e); }
    root.appendChild(m); S.menu = m;
  }
  const closeMenu = () => { S.menu?.remove(); S.menu = null; };
  function useItem(it) {
    if (opt.onUse) return opt.onUse(it);
    const M = opt.med; if (!M) return;
    const tg = M.autoTarget(it, by()); if (tg === undefined) { say(M.treatOptions(it, null, by()).reason || 'NOTHING TO TREAT'); return; }
    const r = M.startTreatment({ item: it, region: tg, by: { ...by(), has: t => I.hasItem(S.inv, t) } }); say(r.ok ? `${r.label} (${r.time} S)` : r.reason);
  }
  function quickMove(it) {
    if (I.isWithin(it, S.inv)) {
      const dst = S.loot && S.loot.id !== 'soldier' ? S.loot : S.ground; const f = I.findFree(dst, it); if (f) { I.placeIn(dst, f.g, it, f.x, f.y, f.r); if (dst === S.ground && opt.onDrop) opt.onDrop(it); } else say('NO ROOM');
    } else if (!I.autoStore(S.inv, it)) say('NO ROOM');
    changed();
  }

  // ---------------------------------------------------------------------------------------------------- input
  root.addEventListener('pointerdown', e => {
    if (!e.target.closest('.menu')) closeMenu();
    const tab = e.target.closest('.tab'); if (tab) { opt.onTab && opt.onTab(tab.dataset.tab); return; }
    const el = e.target.closest('.it'); if (!el || e.target.closest('.ghost') || e.target.closest('.insp')) return;
    const it = byUid(el.dataset.uid); if (!it) return;
    if (e.button === 2) { e.preventDefault(); if (!it.unseen) menu(it, e.clientX, e.clientY); return; }
    if (e.button !== 0 || !canInteract(it)) return;
    S.sel = it;
    const now = performance.now(); if (lastDown.uid === it.uid && now - lastDown.t < 450 && !e.target.closest('.win')) { lastDown.uid = -1; dbl(it, e); return; } lastDown = { uid: it.uid, t: now };
    if (e.ctrlKey) { quickMove(it); return; }
    const sx = e.clientX, sy = e.clientY, split = e.shiftKey;
    const mv = ev => { if (!S.drag && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) startDrag(it, e, split); if (S.drag) updateGhost(ev); };
    const up = ev => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (S.drag) endDrag(ev); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  // double-click by item uid (the DOM may be re-rendered between the clicks while a body is searched)
  let lastDown = { uid: -1, t: 0 };
  function dbl(it, e) {
    if (it.grids && !D(it).static && !D(it).fixed && !['pack', 'rig'].includes(D(it).cat)) openContainer(it, Math.min(e.clientX, innerWidth - 300), Math.min(e.clientY, innerHeight - 300));
    else inspect(it, Math.min(e.clientX, innerWidth - 440), Math.min(e.clientY - 40, innerHeight - 440));
  }
  root.addEventListener('contextmenu', e => e.preventDefault());
  const onKey = e => {
    if (!S.open) return;
    if (S.drag && e.code === 'KeyR') { const D0 = D(S.drag.it); if (D0.w !== D0.h) { S.drag.rot = 1 - S.drag.rot; updateGhost({ clientX: lastX, clientY: lastY }); } e.preventDefault(); return; }
    if (e.code === 'Escape') { if (S.drag) { S.drag.layer.remove(); S.drag = null; render(); } else if (S.menu) closeMenu(); else if (S.wins.length) closeWin(S.wins[S.wins.length - 1]); else api.close(); e.preventDefault(); e.stopPropagation(); return; }
    if (/^Digit[4-90]$/.test(e.code)) { const hov = document.querySelectorAll('.ngc-inv .it:hover'); const el = hov[hov.length - 1]; const k = (+e.code.slice(5) + 9) % 10; if (el) { const it = byUid(el.dataset.uid); if (it && I.isWithin(it, S.inv)) { I.bindQuick(S.inv, k, it); say('QUICK SLOT ' + ((k + 1) % 10) + ': ' + D(it).short); changed(); } } e.preventDefault(); return; }
    if (cursorKey(e)) { e.preventDefault(); e.stopPropagation(); }
  };
  let lastX = 0, lastY = 0; addEventListener('pointermove', e => { lastX = e.clientX; lastY = e.clientY; });
  addEventListener('keydown', onKey, true);

  // ------------------------------------------------------------------------------------ keyboard / gamepad cursor
  // A cell cursor over every grid on screen: arrows move (jumping between grids by screen position), Enter picks up /
  // drops (rotation with R), I inspects, Q quick-moves. The gamepad maps onto the same keys in tick().
  function cells() { return [...root.querySelectorAll('.grid')].map(g => ({ g, r: g.getBoundingClientRect() })); }
  function drawCursor() {
    root.querySelectorAll('.cur').forEach(x => x.remove());
    const cs = cells(); const C = S.cursor; if (!C) return; const g = cs.find(x => x.g.dataset.c == C.c && x.g.dataset.g == C.g); if (!g) return;
    const el = document.createElement('div'); el.className = 'cur'; const held = C.held, D0 = held ? D(held) : null;
    const w = held ? (C.rot ? D0.h : D0.w) : 1, h = held ? (C.rot ? D0.w : D0.h) : 1;
    el.style.cssText = `left:${C.x * CELL}px;top:${C.y * CELL}px;width:${w * CELL + 1}px;height:${h * CELL + 1}px;${held ? 'border-style:solid' : ''}`;
    g.g.appendChild(el);
  }
  function cursorKey(e) {
    const k = e.code; const nav = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (!nav && !['Enter', 'KeyI', 'KeyQ', 'KeyR'].includes(k)) return false;
    const cs = cells(); if (!cs.length) return false;
    if (!S.cursor) { const g = cs[0].g; S.cursor = { c: +g.dataset.c, g: +g.dataset.g, x: 0, y: 0, held: null, rot: 0 }; drawCursor(); return true; }
    const C = S.cursor, cur = cs.find(x => x.g.dataset.c == C.c && x.g.dataset.g == C.g) || cs[0];
    const cont = byUid(C.c), gd = cont && D(cont).grids[C.g];
    if (nav) {
      const nx = C.x + nav[0], ny = C.y + nav[1];
      if (gd && nx >= 0 && ny >= 0 && nx < gd.w && ny < gd.h) { C.x = nx; C.y = ny; }
      else {   // jump to the nearest grid in that direction
        const px = cur.r.left + (C.x + 0.5) * CELL, py = cur.r.top + (C.y + 0.5) * CELL; let best = null, bd = 1e9;
        for (const o of cs) { if (o === cur) continue; const ox = Math.max(o.r.left, Math.min(px, o.r.right)), oy = Math.max(o.r.top, Math.min(py, o.r.bottom)); const dx = ox - px, dy = oy - py; if (dx * nav[0] + dy * nav[1] <= 0) continue; const dd = Math.abs(dx * nav[0] + dy * nav[1]) + 2 * Math.abs(dx * nav[1] + dy * nav[0]); if (dd < bd) { bd = dd; best = { o, ox, oy }; } }
        if (best) { C.c = +best.o.g.dataset.c; C.g = +best.o.g.dataset.g; C.x = Math.min(Math.floor((best.ox - best.o.r.left) / CELL), Math.round(best.o.r.width / CELL) - 1); C.y = Math.min(Math.floor((best.oy - best.o.r.top) / CELL), Math.round(best.o.r.height / CELL) - 1); C.x = Math.max(0, C.x); C.y = Math.max(0, C.y); }
      }
    } else if (k === 'KeyR' && C.held) C.rot = 1 - C.rot;
    else if (k === 'Enter') {
      if (C.held) { const err = I.placeIn(cont, C.g, C.held, C.x, C.y, C.rot); if (err) say(err); else { C.held = null; changed(); } }
      else { const it = cont && I.itemAt(cont, C.g, C.x, C.y); if (it && canInteract(it)) { C.held = it; C.rot = it.r; say('HOLDING ' + D(it).short + ' - ENTER TO PLACE'); } }
    } else { const it = cont && I.itemAt(cont, C.g, C.x, C.y); if (it && !it.unseen) { if (k === 'KeyI') inspect(it, innerWidth / 2 - 210, 80); else quickMove(it); } }
    drawCursor(); return true;
  }
  const padPrev = {};
  function pollPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; if (!pads.length) return;
    const p = pads[0], b = i => !!p.buttons[i]?.pressed;
    const map = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 0: 'Enter', 2: 'KeyR', 3: 'KeyI', 5: 'KeyQ', 1: 'Escape' };
    for (const i in map) { const now = b(+i); if (now && !padPrev[i]) onKey({ code: map[i], preventDefault() {}, stopPropagation() {} }); padPrev[i] = now; }
  }

  // ---------------------------------------------------------------------------------------------------- loop
  let raf = 0, last = 0;
  function tick(dt) {
    if (!S.open) return;
    if (S.statusT > 0) { S.statusT -= dt; if (S.statusT <= 0) { const e = root.querySelector('.status'); if (e) e.textContent = ''; } }
    if (S.loot && !S.loot.searched) { const before = [...I.walk(S.loot)].filter(o => o.unseen).length; I.searchStep(S.loot, dt); const after = [...I.walk(S.loot)].filter(o => o.unseen).length; if (after !== before && !S.drag) render(); }
    pollPad();
  }
  function loop(t) { const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t; if (!opt.manualTick) tick(dt); if (S.open) raf = requestAnimationFrame(loop); }

  const api = {
    el: root, S,
    open(loot = null) { S.loot = loot; S.open = true; root.classList.add('on'); render(); last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
    close() { S.open = false; root.classList.remove('on'); for (const w of [...S.wins]) closeWin(w); closeMenu(); S.cursor = null; cancelAnimationFrame(raf); opt.onClose && opt.onClose(); },
    toggle(loot) { S.open ? api.close() : api.open(loot); }, isOpen: () => S.open,
    render, tick, inspect, openContainer, say, setInv(inv) { S.inv = inv; render(); },
    ground: () => S.ground, byUid,
    destroy() { api.close(); removeEventListener('keydown', onKey, true); root.remove(); },
  };
  return api;
}
