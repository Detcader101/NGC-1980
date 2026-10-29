// SR-71A cockpits (ngc/look-sr71). The pilot's centre instrument panel is TRACED from the flight manual's figure 1-12
// ("CENTER INSTRUMENT PANEL - Forward Cockpit", SR-71A-1 p. 1-23): the panel outline and every numbered item's centre
// and size come from tools/blueprint/sr71/panel-pilot.json (figure px, scaled by the altimeter's 3ATI case, 2821 px/m),
// each instrument drawn live on one canvas atlas (gaugekit.js dials). Around it: the glare shield, side consoles with the
// throttle quadrant (left) and the stick between the knees, rudder pedals, the ejection seat, the canopy frame from inside
// and the rear-view periscope. The RSO's cockpit behind is a layout (the aft panel's big viewsight, the DEF and sensor
// panels, the ANS): from fig. 1-28 "INSTRUMENT PANEL - Aft Cockpit", not traced item by item.
// Configuration note: fig. 1-12 is the 1986 manual (change 2, 1989); the 1980 panel had the same flight and engine
// instruments; the later items (Nav Map Display 41, DAFICS) are shown as on the figure and listed in the findings.
// Frame: the model's (x right, y up, -z forward, origin the CG).
import * as THREE from 'three';
import { canvasTex, dialFace, needle, hub, txt, drum, lin, faceBg, radial, P2, TAU, D2R, SANS, MONO } from './gaugekit.js';
import { M, B, mesh } from './meshkit.js';
import { SR71M } from './sr71model.js';
import { toY, toZ } from './sr71geo.js';
import { KT, FT, LB } from './sr71fm.js';

// panel-pilot.json, inlined (generated from the traced table; the JSON is the source of record)
export const PANEL = {"pxPerM":2821,"centre":[1103,1340],"outline":[[251,1904],[251,975],[435,876],[636,876],[636,843],[697,613],[832,572],[934,489],[1211,489],[1255,686],[1525,686],[1550,861],[1956,861],[1956,1904]],
  "items":[{"n":1,"c":[336,1693],"d":139,"g":"spikeL"},{"n":1,"c":[503,1693],"d":139,"g":"spikeR"},{"n":3,"c":[657,1693],"d":139,"g":"bypL"},{"n":3,"c":[810,1693],"d":139,"g":"bypR"},{"n":4,"c":[540,1277],"d":131,"g":"cip"},{"n":6,"c":[292,1240],"d":146,"g":"temp"},{"n":10,"c":[533,1007],"d":146,"g":"cit"},{"n":11,"c":[759,1007],"d":219,"g":"asi"},{"n":16,"c":[905,598],"d":160,"g":"aoa"},{"n":17,"c":[1109,584],"d":175,"g":"sby"},{"n":19,"c":[1116,934],"d":336,"g":"adi"},{"n":22,"c":[1408,759],"d":160,"g":"clock"},{"n":24,"c":[1423,978],"d":219,"g":"alt"},{"n":25,"c":[1423,1255],"d":219,"g":"ivsi"},{"n":27,"c":[1656,1007],"d":146,"g":"rpmL"},{"n":27,"c":[1824,1007],"d":146,"g":"rpmR"},{"n":29,"c":[1656,1255],"d":124,"g":"egtL"},{"n":29,"c":[1824,1255],"d":124,"g":"egtR"},{"n":31,"c":[1649,1430],"d":131,"g":"nozL"},{"n":31,"c":[1809,1430],"d":131,"g":"nozR"},{"n":34,"c":[1649,1620],"d":146,"g":"ffL"},{"n":34,"c":[1817,1620],"d":146,"g":"ffR"},{"n":35,"c":[1649,1802],"d":146,"g":"oilL"},{"n":35,"c":[1817,1802],"d":146,"g":"oilR"},{"n":37,"c":[1459,1620],"d":139,"g":"hydLR"},{"n":38,"c":[1459,1802],"d":139,"g":"hydAB"},{"n":42,"c":[1102,1291],"d":306,"g":"hsi"},{"n":43,"c":[781,1270],"w":241,"h":248,"g":"tdi"},{"n":44,"c":[795,1481],"d":110,"g":"acc"},{"n":45,"c":[824,1816],"d":110,"g":"trimY"},{"n":47,"c":[693,1816],"d":110,"g":"trimR"},{"n":48,"c":[554,1816],"d":110,"g":"trimP"},{"n":41,"c":[1094,1678],"w":394,"h":423,"g":"map"},{"n":9,"c":[540,883],"w":40,"h":33,"g":"lampUnstL"},{"n":26,"c":[1656,883],"w":40,"h":33,"g":"lampUnstR"},{"n":21,"c":[1335,620],"w":175,"h":70,"g":"lampMC"},{"n":13,"c":[795,810],"w":55,"h":44,"g":"lampKEAS"},{"n":8,"c":[394,1066],"w":204,"h":44,"g":"chute"},{"n":50,"c":[314,1824],"d":44,"g":"swRestartL"},{"n":50,"c":[452,1824],"d":44,"g":"swRestartR"},{"n":49,"c":[419,1576],"w":120,"h":40,"g":"swSpike"},{"n":46,"c":[730,1576],"w":120,"h":40,"g":"swByp"}]};
// the panel's place: a plane 0.62 m ahead of the pilot's eye, its figure centre 0.27 m below the eye line, tilted back 12 deg
export const PANEL_POSE = { dist: 0.62, drop: 0.27, tilt: 12 * D2R };
const EYE = SR71M.EYE;
const p2m = (/** @type {number[]} */ [px, py]) => [(px - PANEL.centre[0]) / PANEL.pxPerM, -(py - PANEL.centre[1]) / PANEL.pxPerM];

// ---- the dials (slot size: 128 px cells on a 1024 atlas; big instruments take 2 x 2)
const fmt = (v, d = 0) => v.toFixed(d);
function dial(kind) {
  const D = {
    asi: (c, W, s) => {   // airspeed - Mach meter: KEAS needle (100-500 kt... the SR-71's runs to 500) and a Mach drum
      const m = lin(100, -150, 500, 150); dialFace(c, W, { map: m, v0: 100, v1: 500, major: 50, minor: 10, labels: [[100, '1'], [200, '2'], [300, '3'], [400, '4'], [500, '5']], reds: [450], title: 'KNOTS|x100', ty: 1.42 });
      drum(c, W * 0.34, W * 0.62, W * 0.32, W * 0.13, s.mach * 100, 3, '#f2f2ea'); txt(c, 'MACH', W / 2, W * 0.82, '#cfcdc0', W * 0.07);
      needle(c, W / 2, m(Math.max(100, s.keas)), W * 0.44, '#f2f2ea'); hub(c, W / 2);
    },
    alt: (c, W, s) => { const a = s.altFt, m = lin(0, 0, 1000, 360); dialFace(c, W, { map: m, v0: 0, v1: 1000, major: 100, minor: 20, labels: [...Array(10)].map((_, i) => [i * 100, String(i)]), title: 'ALT' , ty: 1.2 }); drum(c, W * 0.27, W * 0.3, W * 0.46, W * 0.14, a / 10, 5); needle(c, W / 2, m(a % 1000), W * 0.44); hub(c, W / 2); },
    ivsi: (c, W, s) => { const v = Math.max(-6, Math.min(6, s.vs / 1000)), m = v2 => 270 + Math.sign(v2) * 170 * Math.min(1, Math.abs(v2) / 6) ** 0.7; faceBg(c, W); for (const t of [-6, -4, -2, -1, 0, 1, 2, 4, 6]) radial(c, W / 2, m(t), '#ecebe2', W * 0.36, W * 0.46, W * 0.02); for (const t of [0, 2, 4, 6]) { const [x, y] = P2(W / 2, W * 0.28, m(t)); txt(c, String(t), x, y, '#ecebe2', W * 0.09); } txt(c, 'VERTICAL|SPEED'.split('|')[0], W * 0.62, W * 0.42, '#cfcdc0', W * 0.06); txt(c, '1000 FPM', W * 0.62, W * 0.58, '#cfcdc0', W * 0.06); needle(c, W / 2, m(v), W * 0.44); hub(c, W / 2); },
    adi: (c, W, s) => {   // ball: horizon, pitch ladder (5 deg), bank pointer; the flight director bars
      const R = W / 2; c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(R, R, R * 0.96, 0, TAU); c.clip();
      c.translate(R, R); c.rotate(-s.roll); const k = R * 0.022, py = s.pitch * 57.3 * k;
      c.fillStyle = '#f0ede3'; c.fillRect(-W, -W * 2 + py, W * 2, W * 2); c.fillStyle = '#26262a'; c.fillRect(-W, py, W * 2, W * 2);
      c.strokeStyle = '#26262a'; c.fillStyle = '#26262a'; c.lineWidth = 2;
      for (let p = -60; p <= 60; p += 5) { if (!p) continue; const y = py - p * k, w = p % 10 ? R * 0.14 : R * 0.28; c.strokeStyle = p > 0 ? '#26262a' : '#f0ede3'; c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); if (!(p % 10)) { c.fillStyle = c.strokeStyle; c.font = `bold ${Math.round(R * 0.09)}px ${SANS}`; c.textAlign = 'left'; c.fillText(String(Math.abs(p)), w + 3, y + 4); } }
      c.strokeStyle = '#f0ede3'; c.lineWidth = 3; c.beginPath(); c.moveTo(-W, py); c.lineTo(W, py); c.stroke(); c.restore();
      c.strokeStyle = '#e8b01a'; c.lineWidth = W * 0.025; c.beginPath(); c.moveTo(R * 0.35, R); c.lineTo(R * 0.8, R); c.lineTo(R * 0.86, R * 1.08); c.moveTo(R * 1.65, R); c.lineTo(R * 1.2, R); c.lineTo(R * 1.14, R * 1.08); c.stroke();
      c.fillStyle = '#e8b01a'; c.beginPath(); c.arc(R, R, R * 0.04, 0, TAU); c.fill();
      for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) radial(c, R, a, '#ecebe2', R * 0.86, R * 0.97, 2);
      c.save(); c.translate(R, R); c.rotate(-s.roll); c.fillStyle = '#ecebe2'; c.beginPath(); c.moveTo(0, -R * 0.84); c.lineTo(-R * 0.06, -R * 0.74); c.lineTo(R * 0.06, -R * 0.74); c.fill(); c.restore();
      c.strokeStyle = '#555'; c.lineWidth = 3; c.beginPath(); c.arc(R, R, R * 0.97, 0, TAU); c.stroke();
    },
    hsi: (c, W, s) => {   // compass card (heading up), course arrow to the waypoint, the lubber line
      const R = W / 2; faceBg(c, W); c.save(); c.translate(R, R); c.rotate(-s.hdg);
      for (let d = 0; d < 360; d += 5) { const a = d * D2R, r0 = R * (d % 10 ? 0.86 : 0.8); c.strokeStyle = '#ecebe2'; c.lineWidth = d % 30 ? 1.5 : 3; c.beginPath(); c.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0); c.lineTo(Math.sin(a) * R * 0.93, -Math.cos(a) * R * 0.93); c.stroke(); if (!(d % 30)) { c.save(); c.rotate(a); txt(c, { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] || String(d / 10), 0, -R * 0.68, '#ecebe2', R * 0.11); c.restore(); } }
      c.rotate(s.brg); c.strokeStyle = '#e8b01a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, R * 0.6); c.lineTo(0, -R * 0.55); c.stroke(); c.fillStyle = '#e8b01a'; c.beginPath(); c.moveTo(0, -R * 0.66); c.lineTo(-R * 0.07, -R * 0.52); c.lineTo(R * 0.07, -R * 0.52); c.fill(); c.restore();
      c.fillStyle = '#ecebe2'; c.beginPath(); c.moveTo(R, R * 0.04); c.lineTo(R - 6, R * 0.14); c.lineTo(R + 6, R * 0.14); c.fill();
      c.strokeStyle = '#ecebe2'; c.lineWidth = 2; c.beginPath(); c.moveTo(R - R * 0.12, R); c.lineTo(R + R * 0.12, R); c.moveTo(R, R - R * 0.1); c.lineTo(R, R + R * 0.14); c.stroke();
      drum(c, W * 0.06, W * 0.04, W * 0.2, W * 0.09, s.wptNm, 3); txt(c, 'MILES', W * 0.16, W * 0.17, '#cfcdc0', W * 0.045);
    },
    tdi: (c, W, s) => {   // the Triple Display Indicator: KEAS, altitude, Mach in counters (the SR-71's own instrument)
      c.fillStyle = '#0c0d0e'; c.fillRect(0, 0, W, W); c.strokeStyle = '#444'; c.strokeRect(1, 1, W - 2, W - 2);
      drum(c, W * 0.25, W * 0.1, W * 0.5, W * 0.14, s.keas, 3); txt(c, 'EAS-KNOTS', W / 2, W * 0.3, '#cfcdc0', W * 0.06);
      drum(c, W * 0.15, W * 0.38, W * 0.7, W * 0.14, s.altFt, 5); txt(c, 'ALTITUDE - FT', W / 2, W * 0.58, '#cfcdc0', W * 0.06);
      drum(c, W * 0.28, W * 0.66, W * 0.44, W * 0.14, s.mach * 100, 3); txt(c, 'MACH', W / 2, W * 0.86, '#cfcdc0', W * 0.06);
      for (const [x, v] of [[0.06, s.keas / 500], [0.94, s.altFt / 90000]]) { c.fillStyle = '#e8b01a'; c.fillRect(W * x - 3, W * (0.95 - 0.85 * Math.min(1, v)), 6, 4); }
    },
    aoa: (c, W, s) => { const m = lin(-5, -130, 20, 130); dialFace(c, W, { map: m, v0: -5, v1: 20, major: 5, minor: 1, labels: [[0, '0'], [5, '5'], [10, '10'], [15, '15'], [20, '20']], bands: [[10, 14, '#d8b020'], [14, 20, '#c8281a']], title: 'ANGLE OF|ATTACK', ty: 1.3 }); needle(c, W / 2, m(s.aoa), W * 0.42); hub(c, W / 2); },
    cit: (c, W, s) => { const m = lin(-50, -140, 500, 140); dialFace(c, W, { map: m, v0: 0, v1: 500, major: 100, minor: 25, labels: [[0, '0'], [100, '1'], [200, '2'], [300, '3'], [400, '4'], [500, '5']], reds: [427], title: 'COMP INLET|TEMP °C', ty: 1.32 }); needle(c, W / 2, m(s.cit), W * 0.42); hub(c, W / 2); },
    cip: (c, W, s) => { const m = lin(0, -140, 30, 140); dialFace(c, W, { map: m, v0: 0, v1: 30, major: 5, minor: 1, labels: [[0, '0'], [10, '10'], [20, '20'], [30, '30']], title: 'CIP|PSIA', ty: 1.32 }); needle(c, W / 2, m(s.cip), W * 0.42); hub(c, W / 2); },
    temp: (c, W, s) => { const m = lin(0, -140, 1000, 140); dialFace(c, W, { map: m, v0: 0, v1: 1000, major: 200, minor: 50, labels: [[0, '0'], [400, '4'], [800, '8']], title: 'SKIN|°F x100', ty: 1.32 }); needle(c, W / 2, m(s.skinF), W * 0.42); hub(c, W / 2); },
    clock: (c, W, s) => { const m = lin(0, 0, 60, 360); dialFace(c, W, { map: m, v0: 0, v1: 60, major: 5, minor: 1, labels: [[0, '12'], [15, '3'], [30, '6'], [45, '9']] }); const t = s.time; needle(c, W / 2, (t / 3600 % 12) * 30, W * 0.28); needle(c, W / 2, (t / 60 % 60) * 6, W * 0.4); needle(c, W / 2, (t % 60) * 6, W * 0.44, '#e8b01a', W * 0.02); hub(c, W / 2); },
    sby: (c, W, s) => D.adi(c, W, s),
    rpm: k => (c, W, s) => { const m = lin(0, -150, 110, 150); dialFace(c, W, { map: m, v0: 0, v1: 110, major: 10, minor: 5, labels: [[0, '0'], [50, '5'], [100, '10']], bands: [[100, 106, '#2a9a3a']], title: 'RPM|%', ty: 1.32 }); needle(c, W / 2, m(s.eng[k].n * 100), W * 0.42); hub(c, W / 2); },
    egt: k => (c, W, s) => { const m = lin(200, -140, 1000, 140); dialFace(c, W, { map: m, v0: 200, v1: 1000, major: 200, minor: 50, labels: [[200, '2'], [600, '6'], [1000, '10']], bands: [[800, 860, '#2a9a3a']], reds: [950], title: 'EGT|°C x100', ty: 1.32 }); needle(c, W / 2, m(s.eng[k].egt), W * 0.42); hub(c, W / 2); },
    noz: k => (c, W, s) => { const m = lin(0, -120, 100, 120); dialFace(c, W, { map: m, v0: 0, v1: 100, major: 25, minor: 5, labels: [[0, 'CL'], [100, 'OP']], title: 'NOZZLE', ty: 1.3 }); needle(c, W / 2, m(s.eng[k].nozzle * 100), W * 0.42); hub(c, W / 2); },
    ff: k => (c, W, s) => { const m = lin(0, -150, 30, 150); dialFace(c, W, { map: m, v0: 0, v1: 30, major: 5, minor: 1, labels: [[0, '0'], [10, '10'], [20, '20'], [30, '30']], title: 'FUEL FLOW|PPH x1000', ty: 1.32 }); drum(c, W * 0.3, W * 0.62, W * 0.4, W * 0.13, s.eng[k].ff / 100, 3); needle(c, W / 2, m(s.eng[k].ff / 1000), W * 0.42); hub(c, W / 2); },
    oil: k => (c, W, s) => { const m = lin(0, -140, 100, 140); dialFace(c, W, { map: m, v0: 0, v1: 100, major: 20, minor: 10, labels: [[0, '0'], [50, '50'], [100, '100']], title: 'OIL PRESS', ty: 1.3 }); needle(c, W / 2, m(s.eng[k].n > 0.3 ? 40 + 25 * s.eng[k].n : 60 * s.eng[k].n), W * 0.42); hub(c, W / 2); },
    hyd: (c, W, s) => { const m = lin(0, -140, 4000, 140); dialFace(c, W, { map: m, v0: 0, v1: 4000, major: 1000, minor: 500, labels: [[0, '0'], [2000, '2'], [4000, '4']], title: 'HYD|PSI x1000', ty: 1.3 }); const p = s.eng[0].n > 0.3 || s.eng[1].n > 0.3 ? 3200 : 0; needle(c, W / 2, m(p), W * 0.38); needle(c, W / 2, m(p * 0.98), W * 0.3, '#e8b01a'); hub(c, W / 2); },
    spike: k => (c, W, s) => { const m = lin(0, -130, 26, 130); dialFace(c, W, { map: m, v0: 0, v1: 26, major: 2, minor: 1, labels: [[0, 'F'], [10, '10'], [20, '20'], [26, 'A']], title: (k ? 'R' : 'L') + ' SPIKE|INCHES', ty: 1.3 }); txt(c, k ? 'R' : 'L', W / 2, W * 0.62, '#f2f2ea', W * 0.14); needle(c, W / 2, m(s.eng[k].spike * 26), W * 0.42); needle(c, W / 2, m(s.sched * 26), W * 0.34, '#e8b01a', W * 0.03); hub(c, W / 2); },
    byp: k => (c, W, s) => { const m = lin(0, -130, 1, 130); dialFace(c, W, { map: m, v0: 0, v1: 1, major: 0.25, minor: 0.125, labels: [[0, 'CL'], [1, 'OP']], title: (k ? 'R' : 'L') + ' FWD|BYPASS', ty: 1.3 }); needle(c, W / 2, m(s.eng[k].bypass), W * 0.42); hub(c, W / 2); },
    acc: (c, W, s) => { const m = lin(-2, -140, 4, 140); dialFace(c, W, { map: m, v0: -2, v1: 4, major: 1, minor: 0.5, labels: [[-2, '-2'], [0, '0'], [2, '2'], [4, '4']], reds: [3], title: 'G', ty: 1.3 }); needle(c, W / 2, m(s.nzMax), W * 0.36, '#e8b01a'); needle(c, W / 2, m(s.nz), W * 0.42); hub(c, W / 2); },
    trim: key => (c, W, s) => { const m = lin(-1, -120, 1, 120); dialFace(c, W, { map: m, v0: -1, v1: 1, major: 0.5, minor: 0.25, labels: [], title: key.toUpperCase() + '|TRIM', ty: 1.3 }); needle(c, W / 2, m(key === 'pitch' ? s.trim / 0.6 : 0), W * 0.42); hub(c, W / 2); },
    map: (c, W, s) => { c.fillStyle = '#0d120f'; c.fillRect(0, 0, W, W); c.strokeStyle = '#2e4a36'; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * W / 8, 0); c.lineTo(i * W / 8, W); c.moveTo(0, i * W / 8); c.lineTo(W, i * W / 8); c.stroke(); }
      txt(c, 'NAV MAP', W / 2, W * 0.08, '#6a9a72', W * 0.06); c.fillStyle = '#e8d070'; c.beginPath(); c.moveTo(W / 2, W / 2 - 8); c.lineTo(W / 2 - 6, W / 2 + 7); c.lineTo(W / 2 + 6, W / 2 + 7); c.fill();
      if (s.wptRel) { const [dx, dz] = s.wptRel, k = W / 2 / 60000, x = W / 2 + Math.max(-W / 2 + 6, Math.min(W / 2 - 6, dx * k)), y = W / 2 + Math.max(-W / 2 + 6, Math.min(W / 2 - 6, dz * k)); c.strokeStyle = '#e8d070'; c.beginPath(); c.arc(x, y, 6, 0, TAU); c.stroke(); }
      txt(c, `RECON ${s.recon ? 'ON' : 'OFF'}  FILM ${s.film}`, W / 2, W * 0.93, s.recon ? '#7fe08a' : '#6a9a72', W * 0.05); },
  };
  return D[kind];
}
const LAMPS = { lampUnstL: ['L UNSTART', s => s.eng[0].unstart], lampUnstR: ['R UNSTART', s => s.eng[1].unstart], lampMC: ['MASTER CAUTION', s => s.caution], lampKEAS: ['KEAS', s => s.keas > 440] };

export function buildSR71Cockpit() {
  const group = new THREE.Group(); group.name = 'sr71Cockpit';
  const atlas = canvasTex(1024, 1024); atlas.tex.anisotropy = 8;
  const panelM = M(0x111214, { flatShading: false, rk: 'dark' }), bezelM = M(0x1b1c1e, { rk: 'dark' }), faceM = new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false });
  const lampMs = {};
  // ---- the centre panel, built from the traced outline, its plane at PANEL_POSE in front of the pilot
  const pp = new THREE.Group(); pp.name = 'panelFwd'; group.add(pp);
  pp.position.set(EYE[0], EYE[1] - PANEL_POSE.drop, EYE[2] - PANEL_POSE.dist); pp.rotation.x = -PANEL_POSE.tilt;
  const sh = new THREE.Shape(PANEL.outline.map(p => new THREE.Vector2(...p2m(p))));
  mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }).translate(0, 0, -0.04), panelM, pp, 'panelFace');
  // atlas slots: big (2x2 cells) for ADI / HSI / map, single cells for the rest
  const slots = new Map(); let cell = 0; const bigK = ['adi', 'hsi', 'map', 'tdi'];
  const take = (g, big) => { if (big) { const i = [0, 2, 4, 6][bigK.indexOf(g)]; return { x: i * 128, y: 0, w: 256 }; } const k = cell++; return { x: (k % 8) * 128, y: 256 + Math.floor(k / 8) * 128, w: 128 }; };
  const gauges = [];
  for (const it of PANEL.items) {
    const [x, y] = p2m(it.c), g = it.g, lamp = LAMPS[g];
    if (lamp) {   // caption lamps: an emissive plate with the legend
      const tex = canvasTex(128, 64); txt(tex.ctx, lamp[0], 64, 32, '#111', 15); tex.tex.needsUpdate = true;
      const m = new THREE.MeshBasicMaterial({ map: tex.tex, color: 0x332a10 }); lampMs[g] = m;
      mesh(new THREE.PlaneGeometry(it.w / PANEL.pxPerM, it.h / PANEL.pxPerM).translate(x, y, 0.002), m, pp, 'lamp_' + g);
      continue;
    }
    if (g === 'chute') { mesh(new THREE.BoxGeometry(it.w / PANEL.pxPerM, it.h / PANEL.pxPerM, 0.03).translate(x, y, 0.015), M(0xe8d43a, { rk: 'paint' }), pp, 'chuteHandle'); continue; }   // the yellow DRAG CHUTE T-handle
    if (g.startsWith('sw')) { mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 8).rotateX(Math.PI / 2).translate(x, y, 0.015), M(0xc8c8c0), pp, 'switch'); continue; }
    const d = (it.d || Math.max(it.w, it.h)) / PANEL.pxPerM, big = bigK.includes(g), S = take(g, big);
    const geo = it.w ? new THREE.PlaneGeometry(it.w / PANEL.pxPerM, it.h / PANEL.pxPerM) : new THREE.CircleGeometry(d / 2 * 0.9, 32);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (S.x + uv.getX(i) * S.w) / 1024, 1 - (S.y + (1 - uv.getY(i)) * S.w) / 1024);
    mesh(geo.translate(x, y, 0.004), faceM, pp, 'gauge_' + g);
    if (!it.w) mesh(new THREE.TorusGeometry(d / 2 * 0.95, d * 0.045, 6, 28).translate(x, y, 0.004), bezelM, pp, 'bezel');
    const k = /L$|R$/.test(g) && !['hydLR'].includes(g) ? (g.endsWith('R') ? 1 : 0) : 0, base = g.replace(/[LR]$/, '').replace(/^hyd.*/, 'hyd');
    const fn = { rpm: dial('rpm')(k), egt: dial('egt')(k), noz: dial('noz')(k), ff: dial('ff')(k), oil: dial('oil')(k), spike: dial('spike')(k), byp: dial('byp')(k), trimP: dial('trim')('pitch'), trimR: dial('trim')('roll'), trimY: dial('trim')('yaw'), hyd: dial('hyd') }[base] || dial(g);
    if (fn) gauges.push({ S, fn });
  }
  // ---- glare shield along the panel's top, the side consoles, the throttle quadrant, stick, pedals, seat
  const glare = mesh(new THREE.BoxGeometry(0.32, 0.015, 0.05), panelM, group, 'glareshield'); glare.position.set(EYE[0], EYE[1] - PANEL_POSE.drop + 0.30 * Math.cos(PANEL_POSE.tilt), EYE[2] - PANEL_POSE.dist - 0.30 * Math.sin(PANEL_POSE.tilt) + 0.02);
  for (const s of [-1, 1]) { const con = mesh(new THREE.BoxGeometry(0.16, 0.06, 0.75), panelM, group, 'console'); con.position.set(EYE[0] + s * 0.36, EYE[1] - 0.48, EYE[2] - 0.15); con.rotation.z = -s * 0.15; }
  const thr = new THREE.Group(); thr.name = 'throttles'; thr.position.set(EYE[0] - 0.36, EYE[1] - 0.43, EYE[2] - 0.12); group.add(thr);
  const levers = [0, 1].map(k => { const l = new THREE.Group(); l.position.x = (k - 0.5) * 0.035; thr.add(l); mesh(new THREE.BoxGeometry(0.014, 0.12, 0.02).translate(0, 0.06, 0), M(0x2a2b2c), l, 'throttleLever'); mesh(new THREE.BoxGeometry(0.03, 0.03, 0.045).translate(0, 0.125, 0.0), M(0x1a1a1a, { rk: 'dark' }), l, 'throttleGrip'); return l; });
  const stick = new THREE.Group(); stick.name = 'stick'; stick.position.set(EYE[0], EYE[1] - 0.72, EYE[2] - 0.32); group.add(stick);
  mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42).translate(0, 0.21, 0), M(0x2a2b2c), stick, 'stickShaft'); mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.11).translate(0, 0.46, 0), M(0x151515, { rk: 'dark' }), stick, 'stickGrip');
  const seat = mesh(new THREE.BoxGeometry(0.5, 0.95, 0.12), M(0x2b2e2a, { rk: 'fabric' }), group, 'seatBack'); seat.position.set(EYE[0], EYE[1] - 0.25, EYE[2] + 0.28);
  // the canopy frame from inside: the windscreen's centre post and the bow, the periscope housing on top
  const frameM = M(0x18191b, { rk: 'dark' });
  const wsZ = toZ(5.12), wsY = toY(2.48);
  const scope = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16).translate(0, toY(2.86), toZ(6.7)), frameM, group, 'periscope');
  // ---- the RSO's cockpit (layout from fig. 1-28): panel with the viewsight scope, DEF / sensor panels, side consoles
  const ER = SR71M.EYE_RSO, rp = new THREE.Group(); rp.name = 'panelRSO'; rp.position.set(ER[0], ER[1] - 0.28, ER[2] - 0.6); rp.rotation.x = -0.15; group.add(rp);
  mesh(new THREE.BoxGeometry(0.62, 0.42, 0.04).translate(0, 0, -0.02), panelM, rp, 'rsoPanel');
  mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 24).rotateX(Math.PI / 2).translate(0, -0.03, 0.06), M(0x202224, { rk: 'dark' }), rp, 'viewsight');
  mesh(new THREE.CircleGeometry(0.065, 24).translate(0, -0.03, 0.121), new THREE.MeshBasicMaterial({ color: 0x1d3a26 }), rp, 'viewsightScreen');
  for (const [x, y, w, h] of [[-0.22, 0.12, 0.14, 0.1], [0.22, 0.12, 0.14, 0.1], [-0.22, -0.1, 0.14, 0.14], [0.22, -0.1, 0.14, 0.14]]) mesh(new THREE.BoxGeometry(w, h, 0.01).translate(x, y, 0.005), bezelM, rp, 'rsoSubpanel');
  // ---- live update
  let tAcc = 0;
  function update(A, inp, dt, extra = {}) {
    // throttles, stick
    for (let k = 0; k < 2; k++) levers[k].rotation.x = -0.5 + (inp && inp.throttle ? inp.throttle[k] : A.eng[k].thr || 0) * 1.0;
    stick.rotation.x = -(inp ? inp.pitch || 0 : 0) * 0.25; stick.rotation.z = -(inp ? inp.roll || 0 : 0) * 0.25;
    for (const [g, m] of Object.entries(lampMs)) { const on = LAMPS[g][1]({ ...A, caution: extra.caution }); m.color.setHex(on ? 0xffc040 : 0x332a10); }
    tAcc += dt; if (tAcc < 1 / 12) return; tAcc = 0;   // the dials redraw at 12 Hz
    const att = A.attitude(), s = {
      keas: A.keas, mach: A.mach, altFt: A.altFt, vs: A.vel.y * 2 * FT * 60, pitch: att.pitch, roll: att.roll, hdg: A.heading, brg: extra.brg || 0, wptNm: extra.wptNm || 0, wptRel: extra.wptRel || null,
      aoa: A.alpha * 57.3, cit: A.cit, cip: 14.7 * (A.sigma) * Math.pow(1 + 0.2 * A.mach * A.mach, 3.5) * 0.85, skinF: A.skinT * 1.8 + 32, time: extra.time || 0,
      eng: A.eng.map(e => ({ n: e.n, egt: e.egt, nozzle: e.nozzle, ff: e.ff, spike: e.spike, bypass: e.bypass, unstart: e.unstart })), sched: extra.sched || 0,
      nz: A.nz, nzMax: A.nzMax, trim: A.trim, recon: extra.recon, film: extra.film || 0,
    };
    const c = atlas.ctx;
    for (const G of gauges) { c.save(); c.translate(G.S.x, G.S.y); c.beginPath(); c.rect(0, 0, G.S.w, G.S.w); c.clip(); try { G.fn(c, G.S.w, s); } catch (e) { /* a dial's bad frame */ } c.restore(); }
    atlas.tex.needsUpdate = true;
  }
  return { group, update, panel: pp, atlas, gauges };
}
