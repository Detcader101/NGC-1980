// SR-71A BLACKBIRD as a craft (craft.js): the part the game host sees (ngc/look-sr71). units/air/sr71play.js flies it.
// The aircraft lives OUTSIDE the control zone: it is parked in a hangar at an air base (the bases are another
// workstream: see "API for the bases agent" in docs/ngc1980/findings/look-sr71.md), taxied out, flown on a strategic
// reconnaissance pass over the zone at Mach 3 / 80,000 ft and brought back. Until the bases land, ?fly=sr71 (or
// ?fly=sr71air) puts one on a strip outside the zone (or in the air) and hands it to the player.
//
// What the war sees (pl): a fast, high target the zone's guns cannot reach (they lose it above a few km: pl.detect falls
// with height); the cameras' strip as a live sight source; photographed enemy units and sites become intel (fog.js
// fog.intel: those areas stay revealed for SR71_INTEL_S). Long-range SAM sites (enemy radar islands) fire at it; at
// speed and height it outruns them (sr71play.js threats()).
//
// API (the bases agent):   const sr71 = crafts.register(createSR71Craft(ctx));   // main.js does this
//   sr71.group                        the model's root (THREE.Group) - in ctx.scene already
//   sr71.sim                          the flight model state (sr71fm.js): pos, vel, q, fuel, gear, onGround, keas, mach...
//   sr71.placeOnGround(x, y, z, yaw, { hot, fuelLb })   park it (y = the floor under the wheels; yaw: nose at (-sin, -cos))
//   sr71.placeInAir(x, y, z, yaw, { ft | y, mach | keas, fuelLb })
//   sr71.enter(seat = 0)              the player takes it (crafts.control('sr71', seat, 'spawn'))
//   sr71.exit()                       parks it where it is (the host calls it when the player gets out)
//   sr71.stow()                       remove it from the world (back in the hangar: the bases' model shows instead)
//   sr71.present(), sr71.status(), sr71.bounds() (a parked footprint for walkers and vehicles), sr71.onLanded = cb(def)
//   sr71.towTo(x, z, yaw)             (for a hangar tug: moves a parked aircraft; no physics)
import * as THREE from 'three';
import { createSR71Play } from './units/air/sr71play.js';
import { SR71, LB } from './units/air/sr71fm.js';
import { mergeUnit } from './renderkit/merge.js';

export const SR71_INTEL_S = 600;   // photo intel keeps an area revealed for 10 min (GAME: the film is read out at once)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ctx: { scene, war, G, Z, CTL, keyDown, hwOn, say, feed, sfx, crafts, head, terrainH, waterAt, fog?, camZ(), view: { locked() },
//        onUnitLost?(id, why, mine), autoNext?(), mapTex?, bound? }
export function createSR71Craft(ctx) {
  const { war, G, Z, say, feed, crafts, head } = ctx;
  // runways it can use: strips added with addStrip (a flat floor and no sea there); elsewhere the terrain or the sea
  const strips = [];
  const stripAt = (x, z) => { for (const S of strips) { const dx = x - S.x, dz = z - S.z, a = dx * S.c - dz * S.s, b = dx * S.s + dz * S.c; if (Math.abs(a) <= S.wid / 2 && Math.abs(b) <= S.len / 2) return S; } return null; };
  const groundY = (x, z) => { const S = strips.length ? stripAt(x, z) : null; return S ? S.y : Math.max(ctx.terrainH(x, z), 0); };
  const P = createSR71Play({
    scene: ctx.scene, keyDown: ctx.keyDown, CTL: ctx.CTL, sfx: ctx.sfx, say, feed, mapTex: ctx.mapTex, bound: ctx.bound,
    env: { groundY, water: (x, z) => !(strips.length && stripAt(x, z)) && ctx.waterAt(x, z) && groundY(x, z) <= 0.01 },
    hooks: {
      reconTargets, onRecon,
      samSites: () => war.islands.filter(I => I.owner === 2 && (I.kind === 'radar' || I.kind === 'hq')).map(I => ({ x: I.x, y: 0, z: I.z, name: I.name })),
      onLost: why => lost(why), onEvent: e => { if (e.e === 'unstart' && crafts.active === D) ctx.shake?.(0.6); },
    },
  });
  const A = P.A;
  mergeUnit(P.model.group, [P.model, P.cockpit], { name: 'sr71' });   // ngc/perf-render: static parts merged, every moving part kept
  P.model.group.visible = false;
  const D = {
    id: 'sr71', label: 'SR-71A BLACKBIRD', kind: 'air', P, group: P.model.group, sim: A, jetLike: false,
    // the crew climb the boarding ladder on the left side to the cockpit sills (the RSO's behind the pilot's)
    seats: [
      { id: 'pilot', label: 'PILOT', role: 'driver', door: [-1.4, 0.0, -15.2], exit: [-3.2, -1.95, -15.2], reach: 3.0 },
      { id: 'rso', label: 'RSO', role: 'crew', door: [-1.4, 0.0, -13.2], exit: [-3.2, -1.95, -13.2], reach: 3.0 },
    ],
    parked: false, downT: 0, onLanded: null,
  };
  const _f = new THREE.Vector3();
  const yawOf = () => { A.forward(_f); return Math.atan2(-_f.x, -_f.z); };
  // ---------------------------------------------------------------- API
  D.placeOnGround = (x, y, z, yaw = 0, o = {}) => { P.placeOnGround(x, y ?? groundY(x, z), z, yaw, o); D.parked = !o.hot; D.downT = 0; if ('out' in D) D.out = true; /* (ngc/sr71-fix) the air base's 'out of her shelter' flag: placed = out (its parkAt clears it after) */ P.model.group.visible = true; return D; };
  D.placeInAir = (x, y, z, yaw = 0, o = {}) => { P.placeInAir(x, y, z, yaw, { ...o, y: o.y ?? (o.ft === undefined ? y : undefined) }); D.parked = false; D.downT = 0; if ('out' in D) D.out = true; return D; };
  // a runway (the bases build their own and call this with its rectangle so the SR-71 rolls on it; mesh: false to draw
  // nothing): centre x, z, heading yaw (along the runway), length, width, floor height y
  D.addStrip = ({ x, z, yaw = 0, len = 1200, wid = 45, y = 0, mesh = true }) => {
    const S = { x, z, len, wid, y, c: Math.cos(yaw), s: Math.sin(yaw) }; strips.push(S);
    if (mesh) { const g = new THREE.Group(); g.name = 'sr71Strip'; g.position.set(x, y + 0.02, z); g.rotation.y = yaw; ctx.scene.add(g); S.mesh = g;
      const asph = new THREE.Mesh(new THREE.PlaneGeometry(wid, len).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3d40 })); g.add(asph);
      const base = new THREE.Mesh(new THREE.BoxGeometry(wid + 30, 6, len + 60).translate(0, -3.05, 0), new THREE.MeshLambertMaterial({ color: 0x8a8670 })); g.add(base);
      for (let i = -len / 2 + 30; i < len / 2 - 30; i += 50) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe0e0d8 })); m.position.set(0, 0.03, i); g.add(m); } }
    return S;
  };
  D.stow = () => { P.stow(); D.parked = false; if (crafts.active === D) ctx.autoNext?.(); };
  D.towTo = (x, z, yaw) => { if (!A.onGround) return false; A.pos.x = x; A.pos.z = z; A.pos.y = groundY(x, z) + 1.97 - 0.045; A.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw); A.vel.set(0, 0, 0); A.w.set(0, 0, 0); return true; };
  D.present = () => P.exists && P.alive;
  D.status = () => !P.exists ? '' : !P.alive ? 'LOST' : A.onGround ? (A.eng.some(e => e.run) ? 'ON THE GROUND, ENGINES RUNNING' : 'PARKED') : `${Math.round(A.altFt / 1000)}k FT  M ${A.mach.toFixed(1)}${P.recon.on ? (P.recon.ok ? '  CAMERAS RUNNING' : '  CAMERAS ON') : ''}${P.recon.marks.length ? '  ' + P.recon.marks.length + ' PHOTOGRAPHED' : ''}`;
  D.frame = out => { out.x = A.pos.x; out.y = A.pos.y; out.z = A.pos.z; out.yaw = yawOf(); return out; };
  D.bounds = () => { if (!(D.present() && A.onGround)) return null; const y = yawOf(), c = Math.cos(y), s = Math.sin(y), b = D._b ||= {}, off = 1.0; b.x = A.pos.x + off * s; b.z = A.pos.z + off * c; b.yaw = y; b.hl = 16.4; b.hw = 2.2; b.y0 = A.pos.y - 1.97; b.y1 = A.pos.y + 1.2; b.def = D; return b; };
  // ---------------------------------------------------------------- in and out
  D.enter = (seat = 0, from) => {
    if (from === undefined) return crafts.control('sr71', seat, 'spawn');   // (called by the bases' code: take it)
    if (!D.present()) return false;
    P.seat = seat === 1 ? 1 : 0; resetLook(); P.snapChase(); D.parked = false;
    if (from === 'foot' || from === 'spawn') { A.canopyCmd = 0; say(`IN THE SR-71  -  ${P.seat ? 'RSO' : 'PILOT'}  ·  ${A.eng.some(e => e.run) ? 'ENGINES RUNNING' : 'I: START CART'}  ·  [ ] SEAT  ·  V VIEW  ·  Y CLIMB OUT`, 2.6); }
    return true;
  };
  D.setSeat = i => { P.seat = i ? 1 : 0; resetLook(); return true; };
  D.key = (code, e) => { if (code === 'KeyV') resetLook(); return P.key(code, e); };
  D.canExit = () => A.onGround && Math.hypot(A.vel.x, A.vel.z) < 0.5 ? '' : 'STOP ON THE GROUND FIRST';
  D.exitSpots = () => { const s = D.seats[crafts.seat] || D.seats[0], w = crafts.toWorld(D, s.exit), w2 = crafts.toWorld(D, [3.2, -1.95, -15]); return [w, w2].filter(Boolean).map(p => ({ x: p.x, y: p.y, z: p.z, yaw: yawOf() })); };
  D.exit = () => { A.canopyCmd = 1; P.thr = 0; D.parked = true; P.silence(); A.ap.on = false; };
  D.idle = dt => { if (!D.present()) return; P.update(dt, { active: false }); };
  // ---------------------------------------------------------------- flying
  let wasGround = true;
  D.update = (dt, inp) => {
    if (!P.exists) return;
    P.update(dt, { active: true });
    Z.pos.copy(A.pos); Z.vel.copy(A.vel); Z.landed = A.onGround;
    A.forward(_f); const fl = Math.hypot(_f.x, _f.z); if (fl > 0.15 && Z.facing) Z.facing.set(_f.x / fl, _f.z / fl);
    if (A.onGround && !wasGround && Math.hypot(A.vel.x, A.vel.z) < 30) { /* rolling out */ }
    if (A.onGround && Math.hypot(A.vel.x, A.vel.z) < 0.5 && !wasGround) { wasGround = true; D.onLanded?.(D); }
    if (!A.onGround) wasGround = false;
    if (D.downT > 0) { D.downT -= dt; if (D.downT <= 0) { P.stow(); ctx.autoNext?.(); } }
  };
  function lost(why) {
    const mine = crafts.active === D; feed(`SR-71 LOST  -  ${why}`, 'bad'); ctx.fx?.boom?.(A.pos.x, A.pos.y, A.pos.z, 3);
    ctx.onUnitLost?.('sr71', why, mine); if (mine) D.downT = 3; else P.stow();
  }
  // ---------------------------------------------------------------- views, HUD
  let view = 'chase';
  D.firstPerson = () => P.view === 'cockpit';
  D.fov = ck => ck;
  // (ngc/sr71-fix) the mouse: main.js routes captured-mouse movement to look() for every craft that is not the Huey or a
  // carrier jet (craftLooks()); before this the SR-71 had no look(), so the mouse did nothing and the head was moved only
  // by a HOTAS hat - one resting off-centre (some POV axes read -1 at rest) walked the view to the floor. Now: the mouse
  // turns the head in the cockpit and orbits the chase camera; the hat counts only when it moves away from its rest value
  // (read when you get in); the head re-centres on every enter and seat change; NaN can never reach the camera.
  const SENS = 0.0025, hatRest = { x: 0, y: 0, set: false };
  const resetLook = () => { head.yaw = head.pitch = 0; const st = ctx.CTL && ctx.CTL.state; hatRest.x = st ? st.hatX || 0 : 0; hatRest.y = st ? st.hatY || 0 : 0; hatRest.set = true; };
  D.look = (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (P.view === 'cockpit') { head.yaw = clamp(head.yaw - dx * SENS, -2.4, 2.4); head.pitch = clamp(head.pitch - dy * SENS, -1.0, 0.8); }
    else { P.chase.yaw = clamp(P.chase.yaw - dx * 0.004, -Math.PI, Math.PI); P.chase.pitch = clamp(P.chase.pitch + dy * 0.003, -0.5, 1.2); }
  };
  D.camera = (cam, dt) => {
    if (!Number.isFinite(head.yaw) || !Number.isFinite(head.pitch)) head.yaw = head.pitch = 0;
    if (P.view === 'cockpit') {
      const st = ctx.CTL && ctx.CTL.state, h = st && st.actions && st.actions.lookhat !== false;
      if (!hatRest.set) resetLook();
      const hx = st ? (st.hatX || 0) - hatRest.x : 0, hy = st ? (st.hatY || 0) - hatRest.y : 0;
      if (st && Math.abs((st.hatX || 0)) < 0.2 && Math.abs((st.hatY || 0)) < 0.2) { hatRest.x = 0; hatRest.y = 0; }   // a centred hat is the rest
      if (h && (Math.abs(hx) > 0.5 || Math.abs(hy) > 0.5)) { head.yaw = clamp(head.yaw - hx * 2.2 * dt, -2.4, 2.4); head.pitch = clamp(head.pitch + hy * 1.6 * dt, -1.0, 0.8); }
      else if (!ctx.view.locked() && !D.holdLook) { const k = Math.exp(-6 * dt); head.yaw *= k; head.pitch *= k; }   // (holdLook: tests)
      P.cockpitCam(cam, dt, head);
    } else P.chaseCam(cam, dt);
    void view;
  };
  D.render = (dt, time, fp) => { if (!P.exists) return; const cam = ctx.camZ(); P.render(dt, time, crafts.active === D && P.view === 'cockpit', cam); if (crafts.active !== D) P.sky.update(cam, false); };
  D.silence = () => P.silence();
  D.hud = () => ({ line: P.hudLine(), hint: P.hint(), weap: P.reconStatus(), fuel: A.fuel / SR71.FUEL_MAX * 100, fuelLabel: 'JP-7' });
  D.menuNote = () => `SR-71 JP-7 ${Math.round(A.fuel * LB)} LB`;
  // ---------------------------------------------------------------- what war.js sees
  D.pl = {
    alive: () => D.present() && !D.downT, inCave: false, landed: () => A.onGround, hitR: 7,
    sight: () => A.pos.y < 3000 ? 300 : 0,   // the crew look out at low level; from 80,000 ft only the cameras see
    sources: () => P.reconSources(),
    detect: () => clamp(1 - (A.pos.y - 1500) / 6000, 0.03, 1),   // the zone's guns and their radars lose it with height
  };
  D.hurt = (amount, why) => { A.damage += amount * 0.8; if (A.damage >= 1) P.lose(why || 'SHOT DOWN'); };
  // ---------------------------------------------------------------- reconnaissance: what the cameras can see, and intel
  function reconTargets() {
    const out = [];
    for (const u of war.units) if (u.side === 2 && !u.dead && !u.gone && u.p) out.push({ x: u.p.x, z: u.p.z, kind: u.type || 'unit', u });
    for (const I of war.islands) {
      if (I.owner !== 2) continue;
      out.push({ x: I.x, z: I.z, kind: 'island', u: I, name: I.name });
      for (const s of I.structs || []) if (!s.dead && s.mesh) { const p = s.mesh.getWorldPosition ? s.mesh.getWorldPosition(new THREE.Vector3()) : null; if (p) out.push({ x: p.x, z: p.z, kind: s.kind || 'site', u: s }); }
    }
    const GS = war.ground && war.ground.state; if (GS && GS.units) for (const g of GS.units) if (g.side === 2 && !g.dead) out.push({ x: g.x, z: g.z, kind: g.kind || 'squad', u: g });
    return out;
  }
  function onRecon(found, pass) {
    const fog = ctx.fog; if (!fog) return;
    fog.intel ||= [];
    const until = performance.now() / 1000 + SR71_INTEL_S;
    // the strip: circles along the track (the photographed ground is explored and watched)
    const [x0, z0] = pass.from, [x1, z1] = pass.to, L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / pass.swath));
    for (let i = 0; i <= n; i++) fog.intel.push({ x: x0 + (x1 - x0) * i / n, z: z0 + (z1 - z0) * i / n, r: pass.swath, until });
    for (const t of found) fog.intel.push({ x: t.x, z: t.z, r: 180, until });
    if (found.length) feed(`PHOTO INTEL: ${found.filter(t => t.kind === 'island').map(t => t.name).join(', ') || 'TARGETS'} MARKED FOR ${SR71_INTEL_S / 60} MIN`, 'info');
  }
  D.onRecon = onRecon;
  // ---------------------------------------------------------------- the maps (ngc/sr71-fix): main.js drawMap calls these
  // follow: while she flies, the big map stays on her (unless you drag it) and the minimap zooms out to ~5 km
  D.mapFollow = () => crafts.active === D && D.present() && !A.onGround ? { mini: 0.055, zoom: 0.4 } : null;
  const TAG = { hq: 'HQ', aa: 'AA', radar: 'R', fuel: 'F', factory: 'M', fortress: 'C', island: 'I', carrier: 'K', battleship: 'L', freighter: 'S', shipyard: 'Y' };
  D.mapOverlay = (r, px, py, half, big, W, Hh) => {
    if (!P.exists && !P.recon.marks.length) return;
    const R = P.recon, now = P.time;
    r.save();
    // the photographed strips (photo intel) - cyan bands, fading over SR71_INTEL_S
    for (const S of R.strips) {
      const age = now - S.t; if (age > SR71_INTEL_S + 30) continue;
      const a = Math.max(0.15, 1 - age / SR71_INTEL_S), dx = S.x1 - S.x0, dz = S.z1 - S.z0, L = Math.hypot(dx, dz) || 1, nx = -dz / L * S.w, nz = dx / L * S.w;
      r.fillStyle = `rgba(80,220,255,${0.16 * a})`; r.strokeStyle = `rgba(120,235,255,${0.7 * a})`; r.lineWidth = big ? 1.5 : 1;
      r.beginPath(); r.moveTo(px(S.x0 + nx), py(S.z0 + nz)); r.lineTo(px(S.x1 + nx), py(S.z1 + nz)); r.lineTo(px(S.x1 - nx), py(S.z1 - nz)); r.lineTo(px(S.x0 - nx), py(S.z0 - nz)); r.closePath(); r.fill(); r.stroke();
      if (big) { r.fillStyle = `rgba(150,240,255,${a})`; r.font = 'bold 11px monospace'; r.textAlign = 'left'; r.fillText('PHOTO INTEL ' + Math.max(0, Math.round((SR71_INTEL_S - age) / 60)) + ' MIN', px(S.x0 + nx) + 4, py(S.z0 + nz) - 4); }
    }
    // the photographed targets where the film saw them: red diamonds with their kind
    for (const m of R.marks) {
      const age = now - m.t; if (age > SR71_INTEL_S) continue;
      const X = px(m.x), Y = py(m.z), q = big ? 6 : 3, a = 1 - 0.6 * age / SR71_INTEL_S;
      r.strokeStyle = `rgba(255,110,80,${a})`; r.fillStyle = `rgba(255,110,80,${0.35 * a})`; r.lineWidth = big ? 2 : 1;
      r.beginPath(); r.moveTo(X, Y - q); r.lineTo(X + q, Y); r.lineTo(X, Y + q); r.lineTo(X - q, Y); r.closePath(); r.fill(); r.stroke();
      if (big && half > 0.04) { r.fillStyle = `rgba(255,160,130,${a})`; r.font = '10px monospace'; r.textAlign = 'left'; r.fillText((TAG[m.kind] || String(m.kind).slice(0, 3).toUpperCase()) + (m.name ? ' ' + m.name : ''), X + q + 3, Y + 3); }
    }
    if (P.exists && P.alive) {
      // her track (dotted; cyan where the cameras ran) and the strip being photographed now
      r.lineWidth = big ? 1.5 : 1; r.setLineDash([4, 4]);
      for (let i = 1; i < R.trail.length; i++) { const p = R.trail[i - 1], q = R.trail[i]; r.strokeStyle = q.on ? 'rgba(120,235,255,.9)' : 'rgba(255,255,255,.55)'; r.beginPath(); r.moveTo(px(p.x), py(p.z)); r.lineTo(px(q.x), py(q.z)); r.stroke(); }
      r.setLineDash([]);
      if (R.ok) { A.forward(_f); const f = Math.hypot(_f.x, _f.z) || 1, fx = _f.x / f, fz = _f.z / f, w = R.swath; r.strokeStyle = 'rgba(120,235,255,.95)'; r.lineWidth = 2; r.beginPath(); r.moveTo(px(A.pos.x - fz * w), py(A.pos.z + fx * w)); r.lineTo(px(A.pos.x + fz * w), py(A.pos.z - fx * w)); r.stroke(); }
      // off the map: an arrow on the edge pointing at her, with the range
      const X = px(A.pos.x), Y = py(A.pos.z), m = 18, inside = X > m && Y > m && X < W - m && Y < Hh - m;
      if (!inside && big) {
        const cx = W / 2, cy = Hh / 2, dx = X - cx, dy = Y - cy, k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (Hh / 2 - m) / Math.abs(dy || 1e-6)), ex = cx + dx * k, ey = cy + dy * k, an = Math.atan2(dy, dx);
        r.translate(ex, ey); r.rotate(an); r.fillStyle = '#9ef'; r.beginPath(); r.moveTo(10, 0); r.lineTo(-8, -7); r.lineTo(-8, 7); r.fill(); r.setTransform(1, 0, 0, 1, 0, 0);
        r.fillStyle = '#9ef'; r.font = 'bold 12px monospace'; r.textAlign = an > Math.PI / 2 || an < -Math.PI / 2 ? 'left' : 'right'; r.fillText('SR-71 ' + (Math.hypot(A.pos.x - (cx - 0), A.pos.z) / 1000 > 0 ? Math.round(Math.hypot(dx, dy) / half / 1000) : 0) + ' KM', ex + (an > Math.PI / 2 || an < -Math.PI / 2 ? 14 : -14), ey - 10);
      } else if (crafts.active !== D) {   // parked / flown by someone else: a mark
        r.strokeStyle = '#9ef'; r.lineWidth = big ? 2 : 1.2; r.beginPath(); r.arc(X, Y, big ? 6 : 3.5, 0, 6.283); r.stroke();
      }
    }
    r.restore();
  };
  return D;
}
export { createSR71Craft as createSR71 };
