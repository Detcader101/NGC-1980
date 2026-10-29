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
    // (ngc/sr71-fix) the Nav Map Display (item 41) as a moving map: heading up, the aircraft at the centre a little low,
    // the control zone's square, the photo-intel strips and photographed targets, the track (cyan where the cameras ran),
    // the strip being photographed now, the waypoint; the range ring's distance at the top. s.map from sr71play.js
    map: (c, W, s) => {
      const M = s.map; c.fillStyle = '#0c120e'; c.fillRect(0, 0, W, W);
      if (!M) { txt(c, 'NAV MAP', W / 2, W / 2, '#6a9a72', W * 0.07); return; }
      const R = M.range, k = W * 0.45 / R, cx = W / 2, cy = W * 0.6, h = s.hdg;
      const sx = (x, z) => { const dx = x - M.x, dz = z - M.z, ca = Math.cos(-h), sa = Math.sin(-h); return [cx + (dx * ca - dz * sa) * k, cy + (dx * sa + dz * ca) * k]; };
      c.save(); c.beginPath(); c.rect(0, 0, W, W); c.clip();
      c.strokeStyle = '#1f3a28'; c.lineWidth = 1; for (const r of [0.5, 1]) { c.beginPath(); c.arc(cx, cy, R * r * k, 0, TAU); c.stroke(); }
      const B = M.bound; c.strokeStyle = '#d8b84a'; c.lineWidth = 1.5; c.beginPath(); [[-B, -B], [B, -B], [B, B], [-B, B]].forEach(([x, z], i) => { const [X, Y] = sx(x, z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.stroke();
      for (const S of M.strips) { const dx = S.x1 - S.x0, dz = S.z1 - S.z0, L = Math.hypot(dx, dz) || 1, nx = -dz / L * S.w, nz = dx / L * S.w; c.fillStyle = 'rgba(80,220,255,.22)'; c.beginPath(); [[S.x0 + nx, S.z0 + nz], [S.x1 + nx, S.z1 + nz], [S.x1 - nx, S.z1 - nz], [S.x0 - nx, S.z0 - nz]].forEach(([x, z], i) => { const [X, Y] = sx(x, z); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.fill(); }
      c.lineWidth = 1.5; for (let i = 1; i < M.trail.length; i++) { const p = M.trail[i - 1], q = M.trail[i], [X0, Y0] = sx(p.x, p.z), [X1, Y1] = sx(q.x, q.z); c.strokeStyle = q.on ? '#7fe8ff' : '#7f9a84'; c.beginPath(); c.moveTo(X0, Y0); c.lineTo(X1, Y1); c.stroke(); }
      for (const m of M.marks) { const [X, Y] = sx(m.x, m.z); c.fillStyle = '#ff7050'; c.beginPath(); c.moveTo(X, Y - 4); c.lineTo(X + 4, Y); c.lineTo(X, Y + 4); c.lineTo(X - 4, Y); c.fill(); }
      if (M.ok) { const w = M.swath * k; c.fillStyle = 'rgba(127,232,255,.25)'; c.fillRect(cx - w, cy - W * 0.08, 2 * w, W * 0.08); c.strokeStyle = '#7fe8ff'; c.beginPath(); c.moveTo(cx - w, cy); c.lineTo(cx + w, cy); c.stroke(); }
      if (s.wptRel) { const [X, Y] = sx(M.x + s.wptRel[0], M.z + s.wptRel[1]); c.strokeStyle = '#e8d070'; c.beginPath(); c.arc(X, Y, 6, 0, TAU); c.stroke(); }
      c.restore();
      c.fillStyle = '#e8e8d8'; c.beginPath(); c.moveTo(cx, cy - 9); c.lineTo(cx - 6, cy + 7); c.lineTo(cx + 6, cy + 7); c.fill();
      txt(c, (R * 2 / 1000).toFixed(0) + ' KM', W * 0.13, W * 0.06, '#8fbf98', W * 0.05); txt(c, 'HDG ' + String(Math.round(((-h * 57.3) % 360 + 360) % 360)).padStart(3, '0'), W * 0.84, W * 0.06, '#8fbf98', W * 0.05);
      txt(c, s.recon ? (s.reconOk ? 'CAMERAS RUN  ' : 'CAMERAS STBY  ') + 'FILM ' + s.film : 'CAMERAS OFF', W / 2, W * 0.95, s.reconOk ? '#7fe8ff' : '#6a9a72', W * 0.05);
    },  };
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
  // ---- (ngc/sr71-fix) the rest of both cockpits, rebuilt from the flight manual's figures and the cockpit photos
  // (docs/ngc1980/reference/sr71: figs. 1-13 side panels, 1-14 / 1-15 consoles, 1-17 aft panel, 1-18 / 1-19 aft consoles,
  // 4-29 the OBC control panel; photos: NMUSAF / Udvar-Hazy / Brian Shul). Panel and console faces are the figures
  // themselves turned into panel art (tools/blueprint/sr71/panelart.mjs: black faces, white legends, 2821 px/m as fig. 1-12)
  // on planes at the places the figures' cockpit insets show: the two instrument side panels fold back from the centre
  // panel into the V the photos show, the consoles run beside the seat at elbow height. Colours from the photos: black
  // panel faces and canopy interior, grey (FS 36231-ish) console sides and tub, the black stick grip, a dark seat.
  const ART = { fwdSideL: [0.321, 0.411], fwdSideR: [0.323, 0.471], fwdConsoleL: [0.279, 0.695], fwdConsoleR: [0.235, 0.574], aftPanel: [0.561, 0.295], aftConsoleL: [0.302, 0.534], aftConsoleR: [0.254, 0.515] };
  const base = (typeof location !== 'undefined' && location.pathname.includes('/dev/')) ? '../img/sr71/' : 'img/sr71/';
  const loader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
  const artM = id => { const m = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }); if (loader) loader.load(base + id + '.png', t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; m.map = t; m.needsUpdate = true; }); else m.color.setHex(0x151618); return m; };
  // a panel plane w x h (m) whose corner (ax, ay in 0..1 of the plane, 0,0 = left bottom) sits at the group's origin
  const artPlane = (id, parent, ax, ay) => { const [w, h] = ART[id], g = new THREE.PlaneGeometry(w, h).translate(w * (0.5 - ax), h * (0.5 - ay), 0); return mesh(g, artM(id), parent, 'art_' + id); };
  const greyM = M(0x6f7479, { rk: 'paint' }), blackM = M(0x141517, { rk: 'dark' });
  // instrument side panels (fig. 1-13): hinged on the centre panel's lower corners, folded 52 deg toward the pilot
  const sideL = new THREE.Group(); sideL.position.set(-0.302, -0.20, -0.002); sideL.rotation.y = 0.78; pp.add(sideL); artPlane('fwdSideL', sideL, 1, 0);
  const sideR = new THREE.Group(); sideR.position.set(0.302, 0.211, -0.002); sideR.rotation.y = -0.78; pp.add(sideR); artPlane('fwdSideR', sideR, 0, 1);
  // the hood / glare shield over the three panels: a V of black plates following their top edges (Shul photo)
  for (const [x0, y0, x1, y1] of [[-0.24, 0.17, -0.06, 0.30], [-0.06, 0.30, 0.06, 0.30], [0.06, 0.30, 0.24, 0.17]]) {
    const L = Math.hypot(x1 - x0, y1 - y0), hd = mesh(new THREE.BoxGeometry(L, 0.01, 0.07).translate(0, 0, 0.035), blackM, pp, 'glareshield'); hd.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); hd.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  }
  // consoles (figs. 1-14 / 1-15): flat tops at elbow height beside the seat, front ends under the side panels; grey bodies
  const consoles = (E, idL, idR, zF) => {
    for (const [id, s] of [[idL, -1], [idR, 1]]) {
      const [w, h] = ART[id], cg = new THREE.Group(); cg.position.set(E[0] + s * (0.27 + w / 2), E[1] - 0.50, E[2] + zF); cg.rotation.x = -Math.PI / 2; cg.rotation.z = 0; group.add(cg);
      const top = artPlane(id, cg, 0.5, 1); top.rotation.z = 0;   // the figure's top edge is forward
      const body = mesh(new THREE.BoxGeometry(w + 0.02, h, 0.42).translate(0, -h / 2, -0.215), greyM, cg, 'consoleBody'); void body;
    }
  };
  consoles(EYE, 'fwdConsoleL', 'fwdConsoleR', -0.52);
  // the throttle quadrant (fig. 1-14 items 3-7): two levers side by side in the quadrant's slot, AB past the detent
  const thr = new THREE.Group(); thr.name = 'throttles'; thr.position.set(EYE[0] - 0.27 - 0.279 / 2 + 0.279 * (0.62 - 0.5), EYE[1] - 0.50, EYE[2] - 0.52 + 0.695 * 0.40); group.add(thr);
  mesh(new THREE.BoxGeometry(0.10, 0.04, 0.24).translate(0, 0.02, 0), M(0x2a2c2f, { rk: 'dark' }), thr, 'throttleQuadrant');
  const levers = [0, 1].map(k => { const l = new THREE.Group(); l.position.set((k - 0.5) * 0.04, 0.03, 0); thr.add(l); mesh(new THREE.BoxGeometry(0.012, 0.14, 0.022).translate(0, 0.07, 0), M(0x8a8c8e, { rk: 'metal' }), l, 'throttleLever'); mesh(new THREE.BoxGeometry(0.026, 0.04, 0.045).translate(0, 0.15, -0.01), M(0x161616, { rk: 'dark' }), l, 'throttleGrip'); return l; });
  // the stick (photos: a long black stick from the floor, the grip with trigger and trim hat), rudder pedals
  const stick = new THREE.Group(); stick.name = 'stick'; stick.position.set(EYE[0], EYE[1] - 0.95, EYE[2] - 0.36); group.add(stick);
  mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.42).translate(0, 0.21, 0), M(0x1c1d1f, { rk: 'dark' }), stick, 'stickShaft');
  mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.13, 10).translate(0, 0.47, 0.01).rotateX(-0.15), M(0x111111, { rk: 'dark' }), stick, 'stickGrip');
  mesh(new THREE.BoxGeometry(0.012, 0.025, 0.02).translate(0, 0.47, -0.035), M(0x222222), stick, 'stickTrigger');
  const pedals = [-1, 1].map(s => { const p = mesh(new THREE.BoxGeometry(0.09, 0.14, 0.03).rotateX(-0.5), M(0x2a2b2c), group, 'rudderPedal'); p.position.set(EYE[0] + s * 0.14, EYE[1] - 0.95, EYE[2] - 0.92); return p; });
  const pedZ0 = EYE[2] - 0.92;
  // the SR-1 seat (fig. 1-83 text: headrest with the inertia reel, survival kit in the bucket, the D-ring forward): dark
  const seatAt = (E, name) => {
    const sg = new THREE.Group(); sg.name = name; sg.position.set(E[0], E[1], E[2]); group.add(sg); const seatM = M(0x30342e, { rk: 'fabric' });
    mesh(new THREE.BoxGeometry(0.44, 0.58, 0.10).translate(0, -0.50, 0.30), seatM, sg, 'seatBack');
    mesh(new THREE.BoxGeometry(0.30, 0.18, 0.12).translate(0, -0.08, 0.28), seatM, sg, 'seatHeadrest');
    mesh(new THREE.BoxGeometry(0.48, 0.16, 0.5).translate(0, -0.84, -0.02), M(0x3a3d39, { rk: 'paint' }), sg, 'seatBucket');
    mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 14, Math.PI).rotateZ(Math.PI).translate(0, -0.76, -0.27), M(0xe0c020), sg, 'seatDRing');
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.03, 0.3, 0.46).translate(s * 0.25, -0.66, -0.02), M(0x2a2d29, { rk: 'paint' }), sg, 'seatSide');
  };
  seatAt(EYE, 'seatPilot');
  // the tubs: a floor ~1 m under each eye, grey side walls up to the sills, and the bulkhead between the two cockpits
  // (the cockpits are separate: the RSO sees his panel and the bulkhead, not the pilot's seat)
  const tubM = M(0x777c81, { rk: 'paint', side: THREE.DoubleSide });
  for (const [E, z0, z1] of /** @type {[number[], number, number][]} */ ([[EYE, -1.0, 0.55], [SR71M.EYE_RSO, -0.75, 0.55]])) {
    mesh(new THREE.BoxGeometry(0.86, 0.02, z1 - z0).translate(E[0], E[1] - 1.02, E[2] + (z0 + z1) / 2), tubM, group, 'tubFloor');
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.02, 0.52, z1 - z0).translate(E[0] + s * 0.43, E[1] - 0.76, E[2] + (z0 + z1) / 2), tubM, group, 'tubWall');
  }
  mesh(new THREE.BoxGeometry(0.9, 1.15, 0.03).translate(EYE[0], EYE[1] - 0.45, EYE[2] + 0.56), M(0x2a2c2f, { rk: 'paint' }), group, 'bulkhead');
  // the canopy from inside: the windscreen's frame posts and the rear-view periscope (the walls are the black skin)
  const frameM = M(0x0f1012, { rk: 'dark' });
  const scope = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16).translate(0, toY(2.86), toZ(6.7)), frameM, group, 'periscope');
  // ---- the RSO's cockpit: fig. 1-17's panel (the viewsight under its round hood at the top, the radar / display
  // screen below it, the two triangular side panels), the aft consoles with the NOSE OBC panel (fig. 4-29) on the right
  const ER = SR71M.EYE_RSO, rp = new THREE.Group(); rp.name = 'panelRSO'; rp.position.set(ER[0], ER[1] - 0.30, ER[2] - 0.62); rp.rotation.x = -0.18; group.add(rp);
  artPlane('aftPanel', rp, 0.5, 0.5);
  // viewsight (item 13): a hood over a 9 in round display; the display screen (item 14): both live (sr71 views)
  const scr = canvasTex(256, 256), scrM = new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false });
  const vsC = [(747 - 752) / 2821 * 1.459, -(470 - 585) / 2821 * 1.459];   // fig. px (display) -> panel m (centre at the crop's middle)
  mesh(new THREE.CylinderGeometry(0.115, 0.12, 0.10, 32, 1, true).rotateX(Math.PI / 2).translate(vsC[0], vsC[1], 0.05), blackM, rp, 'viewsightHood');
  const vsScreen = mesh(new THREE.CircleGeometry(0.11, 32).translate(vsC[0], vsC[1], 0.004), scrM, rp, 'viewsightScreen');
  const scr2 = canvasTex(256, 256), scr2M = new THREE.MeshBasicMaterial({ map: scr2.tex, toneMapped: false });
  mesh(new THREE.PlaneGeometry(310 * 1.459 / 2821, 280 * 1.459 / 2821).translate((750 - 752) / 2821 * 1.459, -(710 - 585) / 2821 * 1.459, 0.004), scr2M, rp, 'rsoDisplay');
  consoles(ER, 'aftConsoleL', 'aftConsoleR', -0.40);
  seatAt(ER, 'seatRSO');
  // the NOSE OBC control panel (fig. 4-29) in the radar panel's place at the head of the right aft console: FILM REMAIN
  // counter, POWER (OBC / ON - FAIL), OPERATE (OPR / SRT - STP), MODE (10 / 55), FILM DRIVE, SELF TEST - live
  const obc = canvasTex(512, 160), obcM = new THREE.MeshBasicMaterial({ map: obc.tex, toneMapped: false });
  const obcMesh = mesh(new THREE.PlaneGeometry(0.235, 0.073).rotateX(-Math.PI / 2), obcM, group, 'obcPanel');
  obcMesh.position.set(ER[0] + 0.27 + 0.254 / 2, ER[1] - 0.497, ER[2] - 0.40 + 0.04);
  function drawOBC(o) {
    const c = obc.ctx, W = 512, H = 160; c.fillStyle = '#141517'; c.fillRect(0, 0, W, H); c.strokeStyle = '#555'; c.strokeRect(2, 2, W - 4, H - 4);
    txt(c, 'NOSE OBC', 22, H / 2, '#d6d4c8', 12, 'center'); c.save(); c.translate(22, H / 2); c.rotate(-Math.PI / 2); c.restore();
    txt(c, 'FILM REMAIN', 120, 26, '#d6d4c8', 14); drum(c, 70, 38, 100, 30, o.remain, 4);
    const lamp = (x, y, top, bot, onTop, onBot, colTop, colBot) => { c.fillStyle = '#0a0a0a'; c.fillRect(x - 34, y - 26, 68, 52); c.strokeStyle = '#777'; c.strokeRect(x - 34, y - 26, 68, 52);
      c.fillStyle = onTop ? colTop : '#262626'; c.fillRect(x - 30, y - 22, 60, 22); c.fillStyle = onBot ? colBot : '#262626'; c.fillRect(x - 30, y + 2, 60, 20);
      txt(c, top, x, y - 11, onTop ? '#101010' : '#8a8a80', 12); txt(c, bot, x, y + 12, onBot ? '#101010' : '#8a8a80', 11); };
    txt(c, 'POWER', 260, 18, '#d6d4c8', 14); lamp(260, 56, 'OBC', 'ON  FAIL', o.on, o.on, '#e8e8e0', '#4ce06a');
    txt(c, 'OPERATE', 370, 18, '#d6d4c8', 14); lamp(370, 56, 'OPR', 'SRT STP', o.run, o.on && !o.run, '#e8e8e0', '#e8b030');
    txt(c, 'MODE', 370, 92, '#d6d4c8', 13); lamp(370, 126, '', '10  55', false, o.on, '#e8e8e0', '#e8e8e0');
    lamp(150, 126, 'SELF', 'TEST', false, false, '#e8e8e0', '#e8e8e0'); lamp(260, 126, 'FILM', 'DRIVE', o.run, o.run, '#f0f0e8', '#f0f0e8');
    obc.tex.needsUpdate = true;
  }
  function drawViewsight(s) {   // the viewsight: the ground straight below, drift lines, the camera's strip edges
    const c = scr.ctx, W = 256; c.fillStyle = '#0b1a10'; c.fillRect(0, 0, W, W);
    const t = (s.time || 0) * (s.gs || 0) * 0.002; c.strokeStyle = 'rgba(120,200,140,.25)';
    for (let i = -6; i <= 6; i++) { const y = ((i * 40 + t * 60) % 480 + 480) % 480 - 240 + W / 2; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + 10); c.stroke(); }
    c.strokeStyle = '#8fe0a0'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(W / 2, 20); c.lineTo(W / 2, W - 20); c.moveTo(30, W / 2); c.lineTo(W - 30, W / 2); c.stroke();
    if (s.recon) { c.strokeStyle = s.reconOk ? '#7fe8ff' : '#55707a'; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(48, 0); c.lineTo(48, W); c.moveTo(W - 48, 0); c.lineTo(W - 48, W); c.stroke(); c.setLineDash([]); }
    txt(c, s.reconOk ? 'OBC RUN' : s.recon ? 'OBC STBY' : 'OBC OFF', W / 2, W - 30, s.reconOk ? '#7fe8ff' : '#6a9a72', 14);
    scr.tex.needsUpdate = true;
  }
  // ---- live update
  let tAcc = 0;
  function update(A, inp, dt, extra = {}) {
    // throttles, stick
    // (ngc/sr71-fix) signs checked against the inputs: throttle forward = the lever's top forward (-z: rotation.x < 0);
    // stick aft (pitch +, nose up) = the grip toward the pilot (+z: rotation.x > 0); stick right = the grip to +x
    // (rotation.z < 0); right pedal (yaw +) = the right pedal forward
    for (let k = 0; k < 2; k++) levers[k].rotation.x = 0.5 - (inp && inp.throttle ? inp.throttle[k] : A.eng[k].thr || 0) * 1.0;
    stick.rotation.x = (inp ? inp.pitch || 0 : 0) * 0.25; stick.rotation.z = -(inp ? inp.roll || 0 : 0) * 0.25;
    const yw = inp ? inp.yaw || 0 : 0; pedals[0].position.z = pedZ0 + yw * 0.05; pedals[1].position.z = pedZ0 - yw * 0.05;
    for (const [g, m] of Object.entries(lampMs)) { const on = LAMPS[g][1]({ ...A, caution: extra.caution }); m.color.setHex(on ? 0xffc040 : 0x332a10); }
    tAcc += dt; if (tAcc < 1 / 12) return; tAcc = 0;   // the dials redraw at 12 Hz
    const att = A.attitude(), s = {
      keas: A.keas, mach: A.mach, altFt: A.altFt, vs: A.vel.y * 2 * FT * 60, pitch: att.pitch, roll: att.roll, hdg: A.heading, brg: extra.brg || 0, wptNm: extra.wptNm || 0, wptRel: extra.wptRel || null,
      aoa: A.alpha * 57.3, cit: A.cit, cip: 14.7 * (A.sigma) * Math.pow(1 + 0.2 * A.mach * A.mach, 3.5) * 0.85, skinF: A.skinT * 1.8 + 32, time: extra.time || 0,
      eng: A.eng.map(e => ({ n: e.n, egt: e.egt, nozzle: e.nozzle, ff: e.ff, spike: e.spike, bypass: e.bypass, unstart: e.unstart })), sched: extra.sched || 0,
      nz: A.nz, nzMax: A.nzMax, trim: A.trim, recon: extra.recon, reconOk: extra.reconOk, film: extra.film || 0, map: extra.map || null,
    };
    const c = atlas.ctx;
    for (const G of gauges) { c.save(); c.translate(G.S.x, G.S.y); c.beginPath(); c.rect(0, 0, G.S.w, G.S.w); c.clip(); try { G.fn(c, G.S.w, s); } catch (e) { /* a dial's bad frame */ } c.restore(); }
    atlas.tex.needsUpdate = true;
    const mc = scr2.ctx; mc.save(); try { dial('map')(mc, 256, s); } catch (e) {} mc.restore(); scr2.tex.needsUpdate = true;   // the RSO display: the same moving map
    drawViewsight({ ...s, gs: Math.hypot(A.vel.x, A.vel.z), reconOk: extra.reconOk });
    drawOBC({ on: !!extra.recon, run: !!extra.reconOk, remain: extra.filmRemain ?? 2000 });
  }
  return { group, update, panel: pp, atlas, gauges, rsoPanel: rp };
}
