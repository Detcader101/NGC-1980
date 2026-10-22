// PLACEHOLDER: the old helicopter cockpit, until the real UH-1H cockpit lands.
// API: buildHueyCockpit() -> { group, hitBoxes, labelOf(id), press(id), update(H, dt, S) }
import * as THREE from 'three';
// --------------------------------------------------------------------------------------------- cockpit
// First-person cockpit (pilot sits right, like a Huey): instrument panel with live gauges drawn to a canvas texture,
// glare shield, door pillars and roof frame, plus the cyclic and collective levers moving with the pilot's inputs.
// Everything sits in heli-local space, so it rides along with the airframe.
export const HUEY_EYE = new THREE.Vector3(0.42, 0.62, -0.95), HUEY_EYE_PITCH = -0.22;
function buildOld() {
  const g = new THREE.Group(); g.visible = false;
  // interior fill light: the cabin is mostly lit from the windows, so give every surface a little self-light
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(0.45), ...o });
  const frameM = M(0x2a2e28), panelM = M(0x1c1f1c), olive = M(0x4a5536);
  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  // Cabin interior: walls at x = +-0.86, floor y = -0.5, roof y = 1.02. The windscreen runs from the front edge of the
  // glare shield (y 0.27, z -2.1) back up to the roof beam (y 1.0, z -1.45); the A-pillars and centre post lie on it.
  const WS = { y0: 0.27, z0: -2.1, y1: 1.0, z1: -1.45 }, wsLen = Math.hypot(WS.y1 - WS.y0, WS.z1 - WS.z0), wsAng = Math.atan2(WS.z1 - WS.z0, WS.y1 - WS.y0);
  const wsY = (WS.y0 + WS.y1) / 2, wsZ = (WS.z0 + WS.z1) / 2;
  // instrument panel + glare shield across the cabin, below the eye line
  box(1.68, 0.035, 0.18, frameM, 0, 0.25, -2.03, 0.05);
  // pedestal / centre console, floor
  box(0.34, 0.36, 0.7, panelM, 0, -0.25, -1.3);
  box(1.7, 0.05, 1.75, olive, 0, -0.5, -0.33);   // floor (chin windows in front of it)
  // A-pillars and centre post along the windscreen, roof frame, overhead console, door rear posts
  for (const x of [0.82, 0, -0.82]) box(x ? 0.06 : 0.045, wsLen, 0.06, frameM, x, wsY, wsZ, wsAng);
  box(1.68, 0.06, 0.06, frameM, 0, 1.0, -1.45); box(0.06, 0.06, 1.6, frameM, 0.82, 1.0, -0.7); box(0.06, 0.06, 1.6, frameM, -0.82, 1.0, -0.7);
  box(0.5, 0.08, 0.6, panelM, 0, 0.97, -0.9);
  box(0.06, 1.5, 0.06, frameM, 0.82, 0.25, -0.1); box(0.06, 1.5, 0.06, frameM, -0.82, 0.25, -0.1);
  // ---- the rest of the cabin, so free-look finds a whole cockpit: doors, rear wall, roof, seats, glass
  const wallM = M(0x3d4630), seatM = M(0x2b2b26), padM = M(0x55503f);
  for (const sx of [1, -1]) {
    box(0.04, 0.58, 2.0, wallM, 0.86 * sx, -0.21, -1.1);             // lower door panel below the window, up to the nose
    box(0.05, 0.05, 2.0, frameM, 0.84 * sx, 0.07, -1.1);              // window sill
    box(0.04, 1.5, 0.62, wallM, 0.86 * sx, 0.25, 0.24);              // solid cabin wall behind the door
    // seat: pan, back, headrest
    box(0.5, 0.08, 0.5, padM, 0.42 * sx, -0.22, -0.45); box(0.5, 0.75, 0.08, padM, 0.42 * sx, 0.18, -0.17, -0.12);
    box(0.28, 0.2, 0.08, seatM, 0.42 * sx, 0.66, -0.11, -0.12); box(0.46, 0.25, 0.4, seatM, 0.42 * sx, -0.38, -0.45);
  }
  box(1.7, 1.5, 0.05, wallM, 0, 0.25, 0.56);                          // rear bulkhead
  box(0.6, 0.35, 0.02, M(0x101410), 0, 0.55, 0.53);                   // dark cargo-bay window in the bulkhead
  box(1.72, 0.04, 1.45, wallM, 0, 1.03, -0.15);                       // roof lining (the front part is the greenhouse glass)
  box(0.18, 0.3, 0.12, seatM, 0, 0.88, 0.1);                          // overhead circuit-breaker box
  // co-pilot's cyclic, static, and a fire extinguisher by the door
  const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 6), frameM); cs.position.set(-0.42, -0.18, -1.15); g.add(cs);
  const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), M(0xaa1810)); ext.position.set(-0.7, -0.3, 0.4); g.add(ext);
  // glass: faint tint on the windscreen, door windows, greenhouse roof and chin windows (read as glass, barely block the view)
  const glass = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });
  // every pane sits exactly in its frame: nothing pokes into the cabin or past the walls
  const pane = (geo, x, y, z, rx = 0, ry = 0) => { const p = new THREE.Mesh(geo, glass); p.position.set(x, y, z); p.rotation.set(rx, ry, 0); p.renderOrder = 5; g.add(p); };
  pane(new THREE.PlaneGeometry(1.64, wsLen), 0, wsY, wsZ, wsAng);    // windscreen, glare shield to roof beam
  {   // door windows: sill up to the roof rail, the front edge follows the A-pillar
    const pts = [[-0.1, 0.08], [-2.08, 0.08], [WS.z0 + 0.02, WS.y0], [WS.z1, WS.y1 - 0.02], [-0.1, WS.y1 - 0.02]].map(([z, y]) => new THREE.Vector2(-z, y));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts)); geo.rotateY(Math.PI / 2);   // shape x = -z  ->  local z
    pane(geo, 0.855, 0, 0); pane(geo, -0.855, 0, 0);
  }
  pane(new THREE.PlaneGeometry(1.64, 0.57), 0, 1.0, -1.165, -Math.PI / 2);                     // greenhouse, roof beam to roof lining
  {   // chin windows: from the bottom of the instrument panel down to the front of the floor
    const y0 = -0.3, z0 = -1.87, y1 = -0.48, z1 = -1.2;
    pane(new THREE.PlaneGeometry(1.6, Math.hypot(y1 - y0, z1 - z0)), 0, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, y1 - y0) - Math.PI);
  }
  // ---- instruments: two-row panel. Top row = flight instruments (straight ahead), lower row = engine & systems
  // (glance down). Drawn to one canvas texture at ~20 Hz.
  box(1.66, 0.56, 0.05, panelM, 0, -0.04, -1.97, -0.35);         // taller panel face behind the gauges
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 416;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const gauges = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.5525), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  gauges.position.set(0.16, -0.0325, -1.94); gauges.rotation.x = -0.35; g.add(gauges);
  // caution / warning annunciator strip along the glare shield, right in the pilot's eye line
  const acv = document.createElement('canvas'); acv.width = 1024; acv.height = 160;
  const atex = new THREE.CanvasTexture(acv); atex.colorSpace = THREE.SRGBColorSpace;
  const ann = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.1125), new THREE.MeshBasicMaterial({ map: atex, toneMapped: false }));
  ann.position.set(0.39, 0.33, -2.04); ann.rotation.x = -0.25; g.add(ann);
  const actx = acv.getContext('2d');
  const ANN = ['ENG FIRE', 'ENG OUT', 'TAIL ROTOR', 'XMSN', 'HYD PRESS', 'FUEL LEAK', 'LOW FUEL', 'LOW RPM', 'ROTOR DMG', 'AVIONICS'];

  // ---- switch panel on the centre pedestal (look down-left). Each switch has an invisible hit box for clicking.
  const pcv = document.createElement('canvas'); pcv.width = 256; pcv.height = 512;
  const ptex = new THREE.CanvasTexture(pcv); ptex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.64), new THREE.MeshBasicMaterial({ map: ptex, toneMapped: false }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(0, -0.068, -1.3); g.add(plate);
  const SW = [
    { id: 'engine', label: 'ENGINE' }, { id: 'hyd', label: 'HYD BOOST' }, { id: 'sas', label: 'SAS' },
    { id: 'light', label: 'LDG LIGHT' }, { id: 'radio', label: 'LOGISTICS', button: true }, { id: 'fire', label: 'FIRE EXT', button: true, red: true },
  ];
  const hitM = new THREE.MeshBasicMaterial({ visible: false }), switches = [];
  SW.forEach((s, i) => {
    const z = -1.56 + i * 0.1, piv = new THREE.Group(); piv.position.set(0.07, -0.065, z); g.add(piv);
    const m = s.button ? new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.018, 10), M(s.red ? 0xcc1a10 : 0x2a6acc)) : new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.05, 6), M(0xd0d0c8));
    m.position.y = s.button ? 0.009 : 0.025; piv.add(m);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.085), hitM); hit.position.set(0, -0.05, z); hit.userData.sw = s.id; g.add(hit);   // thin, so a slanted look never grabs the neighbour
    switches.push({ ...s, piv, hit, on: false, flash: 0 });
  });
  function drawPlate(hover) {
    const c = pcv.getContext('2d'); c.fillStyle = '#20231f'; c.fillRect(0, 0, 256, 512);
    c.strokeStyle = '#555c50'; c.lineWidth = 3; c.strokeRect(4, 4, 248, 504);
    c.font = 'bold 22px Consolas, monospace'; c.textAlign = 'left';
    switches.forEach((s, i) => {
      const y = 48 + i * 80;
      if (s.id === hover) { c.fillStyle = 'rgba(255,220,80,.18)'; c.fillRect(8, y - 34, 240, 66); }
      c.fillStyle = '#e8e4d0'; c.fillText(s.label, 14, y);
      c.font = '16px Consolas, monospace'; c.fillStyle = s.button ? '#9a9' : (s.on ? '#7f7' : '#a99');
      c.fillText(s.button ? 'PUSH' : (s.on ? 'ON' : 'OFF'), 14, y + 22); c.font = 'bold 22px Consolas, monospace';
    });
    ptex.needsUpdate = true;
  }

  // cyclic between the pilot's knees, collective by the left hand
  const stickPivot = new THREE.Group(); stickPivot.position.set(0.42, -0.45, -1.15); g.add(stickPivot);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.55, 6), frameM); stick.position.y = 0.27; stickPivot.add(stick);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), M(0x111111)); grip.position.y = 0.56; stickPivot.add(grip);
  const collPivot = new THREE.Group(); collPivot.position.set(0.12, -0.4, -0.75); g.add(collPivot);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).rotateX(Math.PI / 2), frameM); lever.position.z = -0.3; collPivot.add(lever);
  const ctx = cv.getContext('2d'); let acc = 1, plateKey = '';
  function dial(cx, cy, r, label, val, max, unit, { ticks = 10, red = null, needle2 = null } = {}) {
    ctx.fillStyle = '#0b0d0b'; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, 6.283); ctx.fill();
    const ang = v => -Math.PI * 1.25 + Math.min(1, Math.max(0, v / max)) * Math.PI * 1.5;
    if (red !== null) { ctx.strokeStyle = '#c02818'; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, ang(red), ang(max)); ctx.stroke(); }
    ctx.strokeStyle = '#d8d8c8'; ctx.lineWidth = 3;
    for (let i = 0; i <= ticks; i++) { const a = -Math.PI * 1.25 + i / ticks * Math.PI * 1.5; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
    const needle = (v, col, w) => { const a = ang(v); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); ctx.stroke(); };
    if (needle2 !== null) needle(needle2, '#7fd0ff', Math.max(3, r * 0.04));
    needle(val, '#ffd040', Math.max(3, r * 0.055));
    ctx.fillStyle = '#d8d8c8'; ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(r * 0.24)}px Consolas, monospace`; ctx.fillText(label, cx, cy + r * 0.5);
    ctx.font = `bold ${Math.round(r * 0.28)}px Consolas, monospace`; ctx.fillText(unit, cx, cy - r * 0.37);
  }
  function off(cx, cy, r) {   // failed instrument: OFF flag
    ctx.fillStyle = '#0b0d0b'; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, 6.283); ctx.fill();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.4); ctx.fillStyle = '#d02818'; ctx.fillRect(-r * 0.5, -r * 0.14, r, r * 0.28);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r * 0.22)}px Consolas, monospace`; ctx.textAlign = 'center'; ctx.fillText('OFF', 0, r * 0.08); ctx.restore();
  }
  function horizon(cx, cy, r, pitch, roll) {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-roll); const offy = pitch * 180;
    ctx.fillStyle = '#3a78c8'; ctx.fillRect(-200, -400 + offy, 400, 400); ctx.fillStyle = '#7a5428'; ctx.fillRect(-200, offy, 400, 400);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; for (let p = -2; p <= 2; p++) if (p) { ctx.beginPath(); ctx.moveTo(-22, offy - p * 30); ctx.lineTo(22, offy - p * 30); ctx.stroke(); }
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-200, offy); ctx.lineTo(200, offy); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 50, cy); ctx.lineTo(cx - 16, cy); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx + 16, cy); ctx.lineTo(cx + 50, cy); ctx.stroke();
  }
  return {
    group: g,
    hitBoxes: switches.map(s => s.hit),
    // st: { fuel, cautions:[{t,warn}], engineOn, hydOn, sasOn, lightOn, egt, oil, hydPsi, n2, avionics, hover }
    update(H, ctl, dt, st = {}) {
      // levers follow the pilot's hands every frame; switch levers follow their state
      stickPivot.rotation.set((ctl.cy || 0) * 0.3, 0, -(ctl.cx || 0) * 0.3); collPivot.rotation.x = (H.coll || 0) * 0.45;
      const on = { engine: st.engineOn, hyd: st.hydOn, sas: st.sasOn, light: st.lightOn };
      for (const s of switches) { if (!s.button) { s.on = !!on[s.id]; s.piv.rotation.x = s.on ? -0.55 : 0.55; } else s.piv.position.y = -0.065 - (s.flash > 0 ? 0.008 : 0); s.flash -= dt; }
      const key = switches.map(s => +s.on).join('') + (st.hover || '');
      if (key !== plateKey) { plateKey = key; drawPlate(st.hover); }
      acc += dt; if (acc < 0.05) return; acc = 0;
      const flaky = (st.avionics ?? 1) < 0.4, dead = i => flaky && ((performance.now() / 700 + i * 1.7) % 3) < 1.2;   // failing avionics drop gauges in and out
      ctx.fillStyle = '#1c1f1c'; ctx.fillRect(0, 0, 1024, 416);
      // top row: flight instruments
      const att = H.attitude(), ias = Math.hypot(H.vel.x, H.vel.z) * 1.944;
      dead(0) ? off(110, 128, 92) : dial(110, 128, 92, 'IAS kt', ias, 120, Math.round(ias));
      dead(1) ? off(315, 128, 92) : horizon(315, 128, 96, att.pitch, att.roll);
      dead(2) ? off(520, 128, 92) : dial(520, 128, 92, 'ALT m', Math.max(0, H.agl) % 100, 100, Math.max(0, Math.round(H.agl)));
      dead(3) ? off(720, 128, 92) : dial(720, 128, 92, 'VSI', H.vel.y + 10, 20, (H.vel.y >= 0 ? '+' : '') + H.vel.y.toFixed(1));
      // dual tachometer: yellow = rotor (NR), blue = engine (N2); split needles mean the engine isn't driving the rotor
      dead(4) ? off(915, 128, 92) : dial(915, 128, 92, 'NR / N2 %', H.rpm, 1.1, Math.round(H.rpm * 100), { red: 1.04, needle2: st.n2 ?? H.rpm });
      // lower row: engine and systems
      const fuel = st.fuel ?? 0;
      dial(110, 316, 58, 'FUEL %', fuel, 100, Math.round(fuel), { ticks: 8 });
      dial(270, 316, 58, 'TORQUE %', H.coll * H.rpm * 100, 110, Math.round(H.coll * H.rpm * 100), { ticks: 11, red: 100 });
      dial(430, 316, 58, 'EGT °C', st.egt ?? 0, 900, Math.round(st.egt ?? 0), { ticks: 9, red: 760 });
      dial(590, 316, 58, 'XMSN psi', st.oil ?? 0, 80, Math.round(st.oil ?? 0), { ticks: 8 });
      dial(750, 316, 58, 'HYD psi', st.hydPsi ?? 0, 1200, Math.round(st.hydPsi ?? 0), { ticks: 6 });
      // compass + clock
      const hdg = ((H.heading() * 180 / Math.PI) + 360) % 360, t = new Date();
      ctx.fillStyle = '#000'; ctx.fillRect(412, 2, 200, 26); ctx.fillStyle = '#d8d8c8'; ctx.font = 'bold 20px Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(hdg)).padStart(3, '0') + '°', 512, 22);
      ctx.fillStyle = '#000'; ctx.fillRect(860, 288, 130, 56); ctx.fillStyle = '#7fd07f'; ctx.font = 'bold 26px Consolas, monospace';
      ctx.fillText(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, 925, 326);
      tex.needsUpdate = true;
      // annunciator: amber cautions, flashing red warnings
      const lit = new Map((st.cautions || []).map(c => [c.t.startsWith('XMSN') ? 'XMSN' : c.t === 'ENG OFF' ? 'ENG OUT' : c.t === 'T/R DMG' ? 'TAIL ROTOR' : c.t, c]));
      const blink = (performance.now() % 500) < 250, w = 1024 / 5;
      actx.fillStyle = '#0a0b0a'; actx.fillRect(0, 0, 1024, 160);
      ANN.forEach((n, i) => {
        const c = lit.get(n), x = (i % 5) * w + 4, y = Math.floor(i / 5) * 80 + 4;
        actx.fillStyle = !c ? '#1d1f1c' : c.warn ? (blink ? '#ff2a1a' : '#5a0c06') : '#e8a010'; actx.fillRect(x, y, w - 8, 72);
        actx.fillStyle = c ? '#111' : '#6a6d66'; actx.font = 'bold 34px Consolas, monospace'; actx.textAlign = 'center'; actx.fillText(n, x + (w - 8) / 2, y + 48);
      });
      atex.needsUpdate = true;
    },
    press(id) { const s = switches.find(q => q.id === id); if (s) s.flash = 0.15; },
  };
}

export function buildHueyCockpit() {
  const o = buildOld();
  return { group: o.group, hitBoxes: o.hitBoxes, press: o.press, labelOf: id => id.toUpperCase(),
    update(H, dt, S) { o.update({ ...H, attitude: () => H.attitude(), heading: () => H.heading(), coll: H.coll, rpm: H.rpm, vel: H.vel, agl: H.agl }, S.ctl || {}, dt, { fuel: S.fuelPct, cautions: (S.cautions || []).map(t => ({ t, warn: false })), engineOn: S.sw.engine, hydOn: S.sw.hyd, sasOn: S.sw.sas, lightOn: S.sw.light, n2: S.n2, egt: S.egt, oil: S.xmsnOilP, hydPsi: S.sw.hyd ? 1000 : 0, avionics: S.avionics, hover: S.hover }); } };
}
