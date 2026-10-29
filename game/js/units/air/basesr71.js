// (ngc/look-airbases) The SR-71A at the air base: an adapter that gives the look-sr71 craft (craftsr71.js, `sr71C`) the
// base aircraft contract of basecraft.js (baseSlot, spawnAt, parkAt, sortie, handIn, flying, crew), registers the
// field's pavement as rollable strips, and adds the way home: N flies an SR-71 approach (an initial fix 9 km out at
// 1,600 ft, 250 then 200 KEAS, gear down, a 175 KEAS final on a 3 deg path, flare to a 155 KIAS touchdown, the drag
// chute below 205 KIAS, brakes below 80, nose wheel on the centreline). Stopped on the base with the engines off (O),
// or SHIFT+O at once, the ground crew tows her into her shelter and the sortie ends.
// Keys added on top of the SR-71's own: N home (SHIFT+N: the SR-71's lights), SHIFT+L tow to the runway (engines
// running), SHIFT+O hand in. The aircraft's own keys (I start cart, ` autopilot, G gear, C chute, O engines off...) stay.
import { homeEnd, departEnd } from './basecraft.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
const TAN3 = Math.tan(3 * Math.PI / 180);

// ------------------------------------------------------------------------------------------------ the way home (pure)
// A: the sr71fm sim, H: the mode's state ({} to start), L: the AIRBASE layout. Writes the controls into c (the
// SR-71's ctl: pitch, roll, yaw, throttle[2], brakeL, brakeR) and drives A.ap (its own pitch / heading autopilot).
// Returns the phase. tools/airbasebench.mjs flies it in node.
export function sr71Home(A, H, L, dt, groundY, c, say = null) {
  const _p = [0, 0], [u, v] = L.toL(A.pos.x, A.pos.z, _p), e = H.end || (H.end = homeEnd(L, u)), d = e.dir;
  const along = (u - e.u) * d, agl = A.pos.y - groundY(A.pos.x, A.pos.z), gs = Math.hypot(A.vel.x, A.vel.z);
  const trk = gs > 5 ? Math.atan2(-A.vel.x, -A.vel.z) : A.heading;
  H.thr ??= clamp(c.throttle[0] || 0.5, 0.2, 0.66);
  const speed = (kt, lo = 0.12, hi = 0.66) => { H.thr = clamp(H.thr + (kt - A.keas) * 0.0012 * dt * 4 - A.vel.y * 0.0005, lo, hi); c.throttle[0] = c.throttle[1] = H.thr; };
  if (H.rollout || (H.flare && A.onGround)) {   // ---- rollout: power off, the chute, the brakes, the nose wheel on the centreline
    H.rollout = true; A.ap.on = false; c.throttle[0] = c.throttle[1] = 0; H.thr = 0;
    const att = A.attitude(); c.pitch = clamp((0 - att.pitch) * 1.5, -0.3, 0.3); c.roll = 0;
    if (A.chute === 'stowed' && A.kias < 205) A.deployChute();
    if (gs < 3 && A.chute === 'deployed') A.jettisonChute();
    const [qx, qz] = L.toW(u + d * 150, 0); c.yaw = clamp(angDiff(Math.atan2(-(qx - A.pos.x), -(qz - A.pos.z)), A.heading) * 3, -1, 1);
    c.brakeL = c.brakeR = A.kias < 80 ? 1 : 0;
    return 'rollout';
  }
  if (H.flare) {   // ---- flare: the bench's 155 KIAS touchdown law (flight-path angle, wings level), autopilot off
    A.ap.on = false;
    const att = A.attitude(), gamma = Math.atan2(A.vel.y, gs);
    c.pitch = clamp((-0.012 - gamma) * 5 - A.w.y * 2 + 0.05, -1, 1); c.roll = clamp(-att.roll * 2 - A.w.x * 0.5, -0.5, 0.5);
    const [qx, qz] = L.toW(u + d * 400, 0); c.yaw = clamp(angDiff(Math.atan2(-(qx - A.pos.x), -(qz - A.pos.z)), A.heading) * 2, -0.6, 0.6);
    speed(150, 0, 0.5); c.brakeL = c.brakeR = 0;
    return 'flare';
  }
  // ---- en route / final: the SR-71's own autopilot (altitude hold + heading hold), power for the speed
  let hdg, alt, kt;
  const sp = Math.max(30, gs); let fl = groundY(A.pos.x, A.pos.z);
  for (const k of [8, 16, 30, 45]) fl = Math.max(fl, groundY(A.pos.x + A.vel.x / sp * k * sp, A.pos.z + A.vel.z / sp * k * sp));
  // landing weight: she lands with ~10-15,000 lb of JP-7 (the flight manual's normal landing fuel); heavier, the way home
  // dumps the rest on the way to the fix (the SR-71 has a fuel dump; the rate is fast-forwarded for the game)
  if (!H.final && A.fuel * 2.20462 > 18000) { if (!H.dumping) { H.dumping = true; say?.('SR-71: DUMPING FUEL TO LANDING WEIGHT'); } A.fuel = Math.max(15000 / 2.20462, A.fuel - 450 / 2.20462 * dt); }
  if (!H.final) {
    const [fx, fz] = L.toW(e.u - d * 9000, 0), dist = Math.hypot(fx - A.pos.x, fz - A.pos.z);
    hdg = Math.atan2(-(fx - A.pos.x), -(fz - A.pos.z)); alt = Math.max(L.E + 490, fl + 250);
    kt = dist < 5000 ? 200 : 250;
    if (agl < 150 && A.vel.y > -2) { hdg = trk; alt = Math.max(alt, A.pos.y + 200); }   // off the runway: straight ahead first
    if (agl > 60 && A.keas > 230) A.gearCmd = 0;
    if (dist < 5000 && A.keas < 280) A.gearCmd = 1;
    if (dist < 800 || (along < -3000 && along > -9200 && Math.abs(v) < 300 && Math.abs(angDiff(trk, L.yawOf(d, 0))) < 0.4)) { H.final = true; A.gearCmd = 1; say?.(`SR-71: ESTABLISHED ON FINAL, RUNWAY ${String(e.num).padStart(2, '0')}`); }
  } else {
    const [px, pz] = L.toW(u + d * 1100, 0); hdg = Math.atan2(-(px - A.pos.x), -(pz - A.pos.z));
    const toAim = -(along - 300);
    alt = L.E + Math.min(490, Math.max(0, toAim) * TAN3) + 1.95;
    if (toAim > 3000) alt = Math.max(alt, fl + 120);
    kt = toAim > 6000 ? 200 : toAim > 1500 ? 175 : 165; A.gearCmd = 1;
    if (agl < 14 && along > -700) H.flare = true;
  }
  A.ap.on = true; A.ap.pitch = 'alt'; A.ap.alt = alt; A.ap.roll = 'hdg'; A.ap.hdg = hdg;
  c.pitch = 0; c.roll = 0; c.yaw = 0; c.brakeL = c.brakeR = 0;
  speed(kt, 0.08, H.final ? 0.66 : 0.8);
  return H.final ? 'final' : 'enroute';
}

// ------------------------------------------------------------------------------------------------ the adapter
// ctx: basecraft's BASE_CTX (AIRBASE, crafts, say, feed, onSortieEnd, params, terrainH). sr71: the registered craft.
export function attachSR71(ctx, sr71) {
  const L = ctx.AIRBASE, D = sr71, P = sr71.P, A = sr71.sim, { say, feed, crafts } = ctx;
  const groundY = (x, z) => Math.max(ctx.terrainH(x, z), 0);
  // the field's pavement as rollable strips (flat, never sea): runway + overruns, taxiways, ramp, shelter floors
  const yaw = Math.atan2(L.ax, L.az);
  for (const [, u0, u1, v0, v1] of L.paved) { const [x, z] = L.toW((u0 + u1) / 2, (v0 + v1) / 2); D.addStrip({ x, z, yaw, len: u1 - u0, wid: v1 - v0, y: L.E, mesh: false }); }
  const present0 = D.present, exit0 = D.exit, update0 = D.update, idle0 = D.idle, key0 = D.key, hud0 = D.hud;
  Object.assign(D, {
    baseSlot: 'sr71', startSpot: 'park', farView: true, out: false, crew: false, home: null,
    sortie: { airborne: false, onBase: true, stopped: true, done: false, stopT: 0 },
    defaultMode: () => ctx.params?.has('quick') ? 'hot' : 'cold',
  });
  D.present = () => D.out && present0();
  D.flying = () => D.present() && !A.onGround;
  D.spawnAt = (sp, mode = 'cold') => {
    D.placeOnGround(sp.x, L.E, sp.z, sp.yaw, { hot: mode !== 'cold', fuelLb: 65000 });
    D.out = true; D.crew = false; D.home = null; P.override = override; A.ap.on = false;
    Object.assign(D.sortie, { airborne: false, onBase: true, stopped: true, done: false, stopT: 0 });
    return true;
  };
  D.parkAt = sp => { D.placeOnGround(sp.x, L.E, sp.z, sp.yaw, { hot: false }); D.out = false; D.crew = false; D.home = null; P.silence(); };
  D.lineUp = () => {
    const e = departEnd(L, L.toL(A.pos.x, A.pos.z, [0, 0])[0]), [x, z] = L.toW(e.u + e.dir * 80, 0);
    D.placeOnGround(x, L.E, z, L.yawOf(e.dir, 0), { hot: true, fuelLb: A.fuel * 2.20462 }); A.canopyCmd = 0;
    say(`TOWED TO RUNWAY ${String(e.num).padStart(2, '0')}, ENGINES RUNNING  -  SHIFT TO FULL AB, ROTATE AT ~190 KIAS (S)`, 3);
  };
  // the controls hook (sr71play.js P.override): the way home, unless the pilot moves the stick
  function override(c) {
    if (!D.home) return;
    if (!D.crew && crafts.active === D && (Math.abs(c.pitch) > 0.15 || Math.abs(c.roll) > 0.15)) { D.home = null; A.ap.on = false; say('HOME AUTOPILOT OFF  -  YOU HAVE CONTROL', 1.4); return; }
    D.home.phase = sr71Home(A, D.home, L, D.lastDt || 1 / 60, groundY, c, m => feed(m, 'info'));
    P.thr = c.throttle[0];
  }
  P.override = override;
  D.exit = next => {
    if (D.present() && !A.onGround) { D.crew = true; D.home ||= {}; feed(`SR-71: THE CREW IS FLYING HER HOME TO ${L.name}`, 'info'); return; }   // never parks in the air
    exit0(next);
    if (D.present() && L.onPavement(A.pos.x, A.pos.z, 30)) D.sortie.done = true;
  };
  function track(dt) {
    D.lastDt = dt;
    const so = D.sortie, gs = Math.hypot(A.vel.x, A.vel.z);
    if (!A.onGround && A.pos.y - groundY(A.pos.x, A.pos.z) > 15) so.airborne = true;
    so.onBase = A.onGround && !!L.onPavement(A.pos.x, A.pos.z, 10); so.stopped = so.onBase && gs < 1;
    so.stopT = so.stopped ? so.stopT + dt : 0;
    // the base's own air defence (a HAWK battery, 1980 USAF practice at forward bases): no enemy SAM reaches her within
    // 15 km of the field below 20,000 ft - the zone's SA-2 sites (45 km) would otherwise fire at her on the runway
    if (P.sams.length && Math.hypot(A.pos.x - L.x, A.pos.z - L.z) < 15000 && A.altFt < 20000) { P.sams.length = 0; P.rwr = 0; if (crafts.active === D) feed(`${L.name} HAWK BATTERY: SAM ENGAGED AND DESTROYED`, 'good'); }
    // hangars, tanks and buildings stop her (the flight model only knows the ground)
    if (A.onGround) { const b = L.hitBuilding(A.pos.x, A.pos.z, 3); if (b && gs > 0.3) { A.vel.set(0, 0, 0); if (crafts.active === D) say(`STOP  -  THE ${b.name} IS IN THE WAY`, 1.4); } }
    if (D.home && D.home.phase === 'rollout' && gs < 0.5) { D.home = null; if (D.crew) so.done = true; else say('STOPPED  -  O ENGINES OFF (THE CREW TOWS HER IN)  ·  SHIFT+O HAND HER IN NOW', 3); }
    if (so.done || (so.airborne && so.stopT > 2 && A.eng.every(e => !e.run))) handIn();
  }
  D.update = (dt, inp) => { if (!D.out) return; for (let i = 0; i < (D.warp || 1) && D.present(); i++) { update0(dt, inp); if (D.present()) track(dt); } };   // (warp: tests only)
  D.idle = dt => { if (!D.present()) return; idle0(dt); if (D.present()) track(dt); };
  function handIn() {
    const mine = crafts.active === D; D.parkAt(L.spot('sr71', 'park'));
    feed(`${L.name}: SR-71A IN HER SHELTER  -  SORTIE COMPLETE`, 'good'); ctx.onSortieEnd?.(D, mine);
  }
  D.handIn = () => { if (!D.present()) return 'NOT OUT'; if (!D.sortie.onBase || !D.sortie.stopped) return 'STOP ON THE BASE FIRST'; handIn(); return ''; };
  D.key = (code, e) => {
    const shift = e && e.shiftKey;
    if (code === 'KeyN' && !shift) { if (A.onGround) { say('HOME AUTOPILOT: IN THE AIR', 1.2); return true; } D.home = {}; say(`HOME AUTOPILOT: ${L.name}  -  APPROACH, CHUTE, STOP (STICK TO TAKE OVER)`, 2.4); return true; }
    if (code === 'KeyN' && shift) return key0('KeyN', e);
    if (code === 'KeyL' && shift) { if (A.onGround && L.onPavement(A.pos.x, A.pos.z, 30) && Math.hypot(A.vel.x, A.vel.z) < 2) D.lineUp(); else say('TOW TO THE RUNWAY: STOPPED ON THE BASE ONLY', 1.4); return true; }
    if (code === 'KeyO' && shift) { const w = D.handIn(); if (w) say(w === 'STOP ON THE BASE FIRST' ? 'HAND HER IN: STOPPED ON THE BASE' : w, 1.6); return true; }
    return key0(code, e);
  };
  D.hud = () => {
    const h = hud0(), so = D.sortie, d = Math.hypot(A.pos.x - L.x, A.pos.z - L.z);
    let hint = h.hint;
    if (D.home) hint = D.home.phase === 'final' ? `HOME AUTOPILOT  -  FINAL RUNWAY ${String(D.home.end.num).padStart(2, '0')}, 175 KEAS  ·  STICK TO TAKE OVER` : D.home.phase === 'rollout' ? 'ROLLOUT  -  DRAG CHUTE, BRAKES' : `HOME AUTOPILOT  -  ${L.name} ${(d / 1000).toFixed(1)} km`;
    else if (A.onGround && so.airborne && so.stopped) hint = 'SORTIE COMPLETE  -  O ENGINES OFF: THE CREW TOWS HER IN  ·  SHIFT+O AT ONCE';
    else if (A.onGround && !so.airborne && so.onBase && !A.eng.some(e => e.run)) hint = 'IN THE SHELTER  -  I: START CART (BOTH J58s)  ·  SHIFT+L: TOWED TO THE RUNWAY, ENGINES RUNNING';
    else if (!A.onGround && !hint) hint = `${L.name} ${(d / 1000).toFixed(1)} km  ·  N: HOME AUTOPILOT AND LANDING`;
    return { ...h, hint };
  };
  return D;
}
