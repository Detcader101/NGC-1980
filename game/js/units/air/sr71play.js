// The SR-71A as a flyable aircraft (ngc/look-sr71): input (HOTAS / pedals / gamepad / keyboard), the flight model
// (sr71fm.js) with the autopilot, the J58s and inlets (start on the start cart, AB past the throttle detent, spike /
// bypass AUTO or MANUAL, unstarts and the RESTART switches), gear, drag chute, canopy, the reconnaissance sensors, the
// threat (a long-range SAM that the SR-71 outruns at speed and height), the view from altitude (sr71sky.js), cameras,
// read-outs, sound. Engine-agnostic of the game: the host (craftsr71.js in the game, dev/sr71-fly.js on the test page)
// hands in the world through ctx and hooks.
//
// ctx: { scene, keyDown(...codes), CTL? (hotas.js: state.stick/rudder/throttle/actions/pressed), sfx?, say?, feed?,
//        env: { groundY(x, z), water(x, z) }, hooks?: {
//          reconTargets() -> [{ x, y, z, kind, name, side, u }]   things the cameras can photograph (enemy units, sites)
//          onRecon(found[], pass)                                  a pass photographed these (the game marks / reveals)
//          samSites() -> [{ x, y, z, name }]                       enemy long-range SAM sites (launch at us)
//          onLost(why), onEvent(e) }, mapTex?, bound? }
// Keys (pilot): W/S pitch, A/D roll, Q/E rudder, Shift/Space and Ctrl/Z throttles (they stop at the MIL detent: press
// again to go past it into AB), G gear, C drag chute (again: jettison), B / . brakes, I engine start (cart), O engines
// off, U canopy, ` autopilot (ATT -> KEAS -> MACH -> ALT -> OFF), ; ' pitch trim, R inlet restart, SHIFT+M spikes AUTO/MAN
// (then , . move them), K the cameras (OBC + TEOC) ON/OFF, T time compression (x1/x2/x4/x8 on long legs), V view,
// [ ] pilot / RSO seat, N lights.
import * as THREE from 'three';
import { createSR71Sim, SR71, KT, FT, LB, K_EQ, spikeSched, worldHOfFt } from './sr71fm.js';
import { buildSR71Model, SR71M } from './sr71model.js';
import { buildSR71Cockpit } from './sr71cockpit.js';
import { createSR71Sound } from './sr71sound.js';
import { createHighView } from './sr71sky.js';
import { G as GEO, toY, toZ } from './sr71geo.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, D2R = Math.PI / 180;
export const SR71CFG = {
  // (ngc/sr71-fix) the cameras work from 20,000 ft (the strip narrows with height: 0.7 km either side there, 2.4 km at
  // 80,000 ft) with the wings within 15 deg of level (OBC: the scan is across track); was 60,000 ft / 10 deg, which a
  // player who had not finished the 30 min climb never saw work
  RECON_MIN_FT: 20000, RECON_MAX_BANK: 15 * D2R,
  // GAME scaling: the OBC's real swath (~72 nm at 80,000 ft) would cover the whole control zone from anywhere near it;
  // here the photographed strip is ~12 % of the height to each side (2.4 km at the cruise height), so a pass must be flown
  SWATH_K: 0.12, SWATH_MIN: 400, SWATH_MAX: 3200,
  SAM: { range: 45000, ceiling: worldHOfFt(90000), boost: 12, speed0: 120, accel: 55, vmax: 560, life: 70, turn: 4.0 * 9.81, kill: 60 },   // world units: an SA-2 class missile (Mach ~3.5 real at burnout)
  TIME_K: [1, 2, 4, 8],
};
const AP_MODES = ['off', 'att', 'keas', 'mach', 'alt'];

export function createSR71Play(ctx) {
  const scene = ctx.scene, kd = ctx.keyDown || (() => false), say = ctx.say || (() => {}), feed = ctx.feed || (() => {}), H = ctx.hooks || {};
  const A = createSR71Sim(9.80665);
  const model = buildSR71Model({ serial: ctx.serial || '17964' }); scene.add(model.group);
  const cockpit = buildSR71Cockpit(); model.group.add(cockpit.group); cockpit.group.visible = false;
  // the cockpit's inside walls: the body loft's skin over the cockpits, seen from inside (back faces), dark
  const sky = createHighView(scene, { mapTex: ctx.mapTex || null, bound: ctx.bound || 1280 });
  const snd = ctx.sfx ? createSR71Sound(ctx.sfx) : null;
  const P = {
    A, model, cockpit, sky, snd, seat: 0, view: 'chase', active: false, alive: true, exists: false, thr: 0, thrDetent: true, kb: { pitch: 0, roll: 0, yaw: 0 },
    ctl: { pitch: 0, roll: 0, yaw: 0, throttle: [0, 0], brakeL: 0, brakeR: 0, trimRate: 0 }, timeK: 0, lights: true, cart: 0, starting: false,
    recon: { on: false, film: 0, frames: 0, pass: null, seen: new Set(), last: 0, swath: 0, ok: false, why: '', marks: [], trail: [], strips: [], passes: 0 }, sams: [], rwr: 0, warn: 0, caution: false, cautions: [],
    look: { yaw: 0, pitch: 0 }, chase: { yaw: 0, pitch: 0.12, dist: 42 }, wpt: null, time: 0,
  };
  const env = ctx.env || { groundY: () => 0, water: () => false };
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _c = new THREE.Vector3();

  // ---------------------------------------------------------------- placing it
  P.placeOnGround = (x, y, z, yaw = 0, o = {}) => {
    A.resetGround(x, y, z, yaw, { running: !!o.hot }); A.fuel = (o.fuelLb ?? 65000) / LB; A.canopyCmd = A.canopy = o.hot ? 0 : 1;
    P.thr = 0; P.exists = true; P.alive = true; model.group.visible = true; P.recon.film = 0; P.recon.on = false; P.sams.length = 0; P.timeK = 0; P.thrDetent = true;
    return P;
  };
  P.placeInAir = (x, y, z, yaw = 0, o = {}) => {
    const ft = o.ft ?? 25000, h = o.y ?? worldHOfFt(ft), sig = Math.exp(-h / 6000);
    const T = h > 11000 ? 216.65 : 288.15 - 0.0065 * h, aS = Math.sqrt(1.4 * 287.05 * T), V = o.mach ? o.mach * aS / K_EQ : (o.keas ?? 350) / KT * Math.sqrt(1.225 / (4.9 * sig));
    const thr = o.thr ?? (o.mach > 2 ? 0.8 : 0.6);
    A.reset(new THREE.Vector3(x, h, z), yaw, V, { fuel: (o.fuelLb ?? 60000) / LB, gear: 0, thr, pitch: o.pitch ?? (o.mach > 2 ? 0.1 : 0.05), skinT: o.mach > 2 ? 300 : 15 });
    P.thr = thr; P.thrDetent = thr <= 0.66; P.exists = true; P.alive = true; model.group.visible = true; P.sams.length = 0; samCd = 8; return P;
  };
  P.stow = () => { P.exists = false; model.group.visible = false; sky.update({ position: _v.set(0, 0, 0), far: 1 }, false); P.silence(); };

  // ---------------------------------------------------------------- input
  let thrLastHw;
  function readControls(dt) {
    const st = ctx.CTL && ctx.CTL.state || {}, kbx = (kd('KeyD', 'ArrowRight') ? 1 : 0) - (kd('KeyA', 'ArrowLeft') ? 1 : 0), kby = (kd('KeyS', 'ArrowDown') ? 1 : 0) - (kd('KeyW', 'ArrowUp') ? 1 : 0), kbz = (kd('KeyE') ? 1 : 0) - (kd('KeyQ') ? 1 : 0);
    const ramp = (cur, tgt, r) => cur + clamp(tgt - cur, -r * dt, r * dt);
    P.kb.roll = ramp(P.kb.roll, kbx, kbx ? 2.5 : 6); P.kb.pitch = ramp(P.kb.pitch, kby, kby ? 1.2 : 5); P.kb.yaw = ramp(P.kb.yaw, kbz, 4);
    const c = P.ctl, stick = st.stick;
    c.roll = stick && Math.abs(stick.x) > 0.001 ? stick.x : P.kb.roll; c.pitch = stick && Math.abs(stick.y) > 0.001 ? stick.y : P.kb.pitch;
    c.yaw = Math.abs(st.rudder || 0) > 0.001 ? st.rudder : P.kb.yaw;
    // throttles: keys move both; the MIL detent stops them until the key is pressed again (as the real quadrant's detent)
    const up = kd('ShiftLeft', 'ShiftRight', 'Space', 'PageUp'), dn = kd('ControlLeft', 'KeyZ', 'PageDown');
    if (up || dn) { let t = clamp(P.thr + ((up ? 1 : 0) - (dn ? 1 : 0)) * 0.35 * dt, 0, 1); if (up && P.thrDetent && P.thr <= 0.66 && t > 0.66) t = 0.66; P.thr = t; P.thrSrc = 'kb'; }
    if (!up) { if (P.thr >= 0.66 - 1e-6 && P.thr <= 0.6601) P.thrDetent = false; if (P.thr < 0.6) P.thrDetent = true; }
    if (st.throttle !== null && st.throttle !== undefined) { if (thrLastHw === undefined) thrLastHw = st.throttle; if (Math.abs(st.throttle - thrLastHw) > 0.02) { P.thrSrc = 'hotas'; thrLastHw = st.throttle; } if (P.thrSrc === 'hotas') { P.thr = st.throttle; thrLastHw = st.throttle; } }
    c.throttle[0] = A.eng[0].run ? P.thr : 0; c.throttle[1] = A.eng[1].run ? P.thr : 0;
    const wb = kd('KeyB', 'Period') || (st.actions && st.actions.wheelbrake) ? 1 : 0;
    c.brakeL = Math.max(st.brakeL || 0, wb); c.brakeR = Math.max(st.brakeR || 0, wb);
    c.trimRate = (kd('Quote') ? 1 : 0) - (kd('Semicolon') ? 1 : 0);
    const pr = st.pressed || {}; if (pr.gear) P.cmd('gear'); if (pr.view) P.cmd('view');
    return c;
  }
  P.cmd = (what) => {
    switch (what) {
      case 'gear': if (A.onGround && A.gearCmd) { say('WEIGHT ON WHEELS  -  GEAR HANDLE LOCKED', 1.2); break; } A.gearCmd = A.gearCmd ? 0 : 1; snd?.gear(); say(A.gearCmd ? 'GEAR DOWN' : 'GEAR UP', 1); break;
      case 'chute': if (A.chute === 'stowed') { if (A.deployChute()) { snd?.chute(); say('DRAG CHUTE', 1); } else say(`DRAG CHUTE TORN AWAY  -  ${Math.round(A.kias)} KIAS (LIMIT 210)`, 2); } else if (A.chute === 'deployed') { A.jettisonChute(); say('CHUTE JETTISONED', 1); } break;
      case 'start': if (A.eng.every(e => e.run)) { say('BOTH ENGINES RUNNING', 1); break; } if (!A.onGround) { say('AIR START: WINDMILL ABOVE 450 KEAS, TEB  -  NOT MODELLED', 2); break; } P.starting = true; say('START CART CONNECTED  -  CRANKING THE LEFT J58  (TEB IGNITION)', 2.5); break;
      case 'stop': for (let k = 0; k < 2; k++) A.stopEngine(k); P.starting = false; say('THROTTLES OFF  -  ENGINES SHUT DOWN', 1.5); break;
      case 'canopy': if (!A.onGround && A.canopyCmd === 0) { say('CANOPY: NOT IN FLIGHT', 1); break; } A.canopyCmd = A.canopyCmd ? 0 : 1; break;
      case 'ap': { const i = (AP_MODES.indexOf(A.ap.on ? A.ap.pitch : 'off') + 1) % AP_MODES.length, m = AP_MODES[i]; A.ap.on = m !== 'off'; if (A.ap.on) { A.ap.pitch = m; A.ap.roll = 'hdg'; A.ap.hdg = A.heading; A.ap.att = A.attitude().pitch; A.ap.keas = Math.round(A.keas); A.ap.mach = Math.round(A.mach * 100) / 100; A.ap.alt = A.pos.y; } say(A.ap.on ? `AUTOPILOT  ${m === 'att' ? 'ATTITUDE' : m === 'keas' ? 'KEAS ' + A.ap.keas : m === 'mach' ? 'MACH ' + A.ap.mach.toFixed(2) : 'ALTITUDE ' + Math.round(A.altFt / 100) * 100 + ' FT'}  +  HEADING HOLD` : 'AUTOPILOT OFF', 1.6); break; }
      case 'restart': A.restartArm = true; for (const e of A.eng) e.restart = Math.max(e.restart, 3.5); say('INLET RESTART', 1.2); break;
      case 'spikemode': A.spikeMode = A.spikeMode === 'auto' ? 'manual' : 'auto'; A.spikeManual = A.eng.map(e => e.spike); say(`SPIKES ${A.spikeMode.toUpperCase()}${A.spikeMode === 'manual' ? '  -  , / . TO MOVE THEM (SCHEDULE ' + Math.round(spikeSched(A.mach) * 26) + ' IN)' : ''}`, 1.8); break;
      case 'recon': { P.recon.on = !P.recon.on; if (!P.recon.on && P.recon.pass) endPass(); reconState(); const R = P.recon; snd?.chime(); say(R.on ? (R.ok ? `CAMERAS ON  -  RUNNING  ·  STRIP ${(R.swath * 2 / 1000).toFixed(1)} KM` : `CAMERAS ON  -  NOT RUNNING: ${R.why}`) : `CAMERAS OFF  -  ${Math.round(R.frames)} FRAMES ON THE FILM`, 2.2); break; }
      case 'time': { const L = SR71CFG.TIME_K, why = A.onGround ? 'ON THE GROUND' : A.altFt < 20000 ? 'BELOW 20,000 FT' : P.sams.length ? 'MISSILE IN THE AIR' : ''; if (why) { P.timeK = 0; say('TIME x1  -  ' + why, 1.2); break; } P.timeK = (P.timeK + 1) % L.length; say(`TIME x${L[P.timeK]}`, 1); break; }
      case 'lights': P.lights = !P.lights; break;
      case 'view': P.view = P.view === 'cockpit' ? 'chase' : 'cockpit'; break;
    }
  };
  // (ngc/sr71-fix) M is the game's map (main.js): it used to be swallowed here as the spike AUTO / MAN key, so the big
  // map never opened in the SR-71; the spikes are SHIFT+M now
  P.key = (code, e) => {
    if (code === 'KeyM') { if (e && e.shiftKey) { P.cmd('spikemode'); return true; } return false; }
    const m = { KeyG: 'gear', KeyC: 'chute', KeyI: 'start', KeyO: 'stop', KeyU: 'canopy', Backquote: 'ap', KeyR: 'restart', KeyK: 'recon', KeyT: 'time', KeyN: 'lights', KeyV: 'view' }[code];
    if (m) { P.cmd(m); return true; }
    if (code === 'BracketLeft' || code === 'BracketRight') { P.seat = code === 'BracketRight' ? 1 : 0; say(P.seat ? 'RSO  -  RECONNAISSANCE SYSTEMS OFFICER (K CAMERAS)' : 'PILOT', 1.2); return true; }
    if ((code === 'Comma' || code === 'Period') && A.spikeMode === 'manual') { const d = code === 'Comma' ? -1 / 26 : 1 / 26; A.spikeManual = A.spikeManual.map(v => clamp(v + d, 0, 1)); return true; }
    return ['Semicolon', 'Quote', 'KeyB'].includes(code);
  };

  // ---------------------------------------------------------------- the start: the cart cranks one J58 at a time
  function starting(dt) {
    P.cart = Math.max(0, P.cart - dt * 0.2);
    if (!P.starting) return;
    const k = A.eng[0].run ? 1 : 0, e = A.eng[k];
    if (A.eng.every(x => x.run)) { P.starting = false; say('BOTH J58s AT IDLE  -  CART DISCONNECTED', 2); return; }
    P.cart = 1; if (!e.start && !e.run) A.startEngine(k);
  }

  // ---------------------------------------------------------------- reconnaissance: the OBC / TEOC strip under the track
  const _swT = [];
  // whether the cameras can run now, and why not (the HUD, the cockpit lamps and the K message say it)
  function reconState() {
    const R = P.recon, att = A.attitude();
    R.swath = clamp(A.pos.y * SR71CFG.SWATH_K, SR71CFG.SWATH_MIN, SR71CFG.SWATH_MAX);
    R.why = !R.on ? 'OFF' : A.onGround ? 'ON THE GROUND' : A.altFt < SR71CFG.RECON_MIN_FT ? `BELOW 20,000 FT (${Math.round(A.altFt / 1000)},000)` : Math.abs(att.roll) >= SR71CFG.RECON_MAX_BANK ? `NOT LEVEL (BANK ${Math.round(Math.abs(att.roll) * 57.3)}°)` : '';
    R.ok = R.on && !R.why;
  }
  P.reconStatus = () => { const R = P.recon; return !R.on ? 'CAMERAS OFF (K)' : R.ok ? `CAMERAS RUNNING  ·  STRIP ${(R.swath * 2 / 1000).toFixed(1)} KM  ·  ${R.pass ? R.pass.found.length : 0} TARGETS THIS PASS` : `CAMERAS ON  ·  NOT RUNNING: ${R.why}`; };
  function recon(dt) {
    const R = P.recon; reconState();
    // the track, for the maps (a point every 2 s, the last ~30 min)
    if (!A.onGround && (!R.trail.length || P.time - R.trail[R.trail.length - 1].t > 2)) { R.trail.push({ x: A.pos.x, z: A.pos.z, t: P.time, on: R.ok }); if (R.trail.length > 900) R.trail.shift(); }
    if (!R.ok) { if (R.pass && P.time - R.last > 4) endPass(); return; }
    R.last = P.time; R.frames += dt * 2;   // the OBC cycles about 2 frames a second
    R.film += dt * 0.6;   // film used (ft, notional): ~10,500 ft of film on the OBC's spool (INFERRED)
    if (!R.pass) { R.pass = { t0: P.time, found: [], seen: new Set(), x0: A.pos.x, z0: A.pos.z }; R.strips.push(R.cur = { x0: A.pos.x, z0: A.pos.z, x1: A.pos.x, z1: A.pos.z, w: R.swath, t: P.time }); }
    R.cur.x1 = A.pos.x; R.cur.z1 = A.pos.z; R.cur.w = R.swath;
    const list = H.reconTargets ? H.reconTargets() : [];
    for (const t of list) {
      const dx = t.x - A.pos.x, dz = t.z - A.pos.z, d = Math.hypot(dx, dz);
      if (d > R.swath || R.pass.seen.has(t.u || t)) continue;
      R.pass.seen.add(t.u || t); R.seen.add(t.u || t); R.pass.found.push(t);
      // the photo: where it was and when (each target once per pass; a later pass refreshes it)
      const k = R.marks.findIndex(m => m.u === (t.u || t)); const mk = { x: t.x, z: t.z, kind: t.kind, name: t.name || '', u: t.u || t, t: P.time };
      if (k >= 0) R.marks[k] = mk; else R.marks.push(mk);
    }
  }
  function endPass() {
    const R = P.recon, p = R.pass; R.pass = null; if (!p) return;
    const n = p.found.length;
    if (H.onRecon) H.onRecon(p.found, { from: [p.x0, p.z0], to: [A.pos.x, A.pos.z], swath: R.swath, t: P.time - p.t0 });
    const kinds = {}; for (const t of p.found) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
    R.passes++;
    feed(n ? `RECON PASS COMPLETE: ${n} TARGETS PHOTOGRAPHED  -  ${Object.entries(kinds).map(([k, v]) => v + ' ' + k.toUpperCase()).join(', ')}` : 'RECON PASS COMPLETE: NOTHING ON THE FILM', n ? 'good' : 'info');
  }
  P.reconSources = () => {   // the strip being photographed now (a live sight source for the host's fog of war)
    const R = P.recon; if (!R.ok) return null;
    _swT.length = 0; A.forward(_f); _f.y = 0; _f.normalize();
    for (let i = -1; i <= 1; i++) _swT.push({ x: A.pos.x + _f.x * i * R.swath, z: A.pos.z + _f.z * i * R.swath, r: R.swath });
    return _swT;
  };

  // ---------------------------------------------------------------- the threat: long-range SAMs (SA-2 class at game scale)
  let samCd = 20; P.samSoon = () => { samCd = 2; };
  function threats(dt) {
    const S = SR71CFG.SAM; samCd -= dt;
    if (H.samSites && samCd <= 0 && !A.onGround && P.sams.length < 2) {
      samCd = 8;
      for (const s of H.samSites()) {
        const dx = A.pos.x - s.x, dz = A.pos.z - s.z, d = Math.hypot(dx, dz);
        if (d > S.range || A.pos.y > S.ceiling) continue;
        // the site fires when the target is coming at it (a closing geometry) and in reach of the missile's climb
        A.forward(_f); const closing = -(_f.x * dx + _f.z * dz) / (d || 1);
        if (closing < 0.2 && d > 12000) continue;
        P.sams.push({ p: new THREE.Vector3(s.x, (s.y || 0) + 5, s.z), v: new THREE.Vector3(0, S.speed0, 0), t: 0, site: s, miss: 1e9 }); samCd = 30;
        P.rwr = 2; feed(`SAM LAUNCH  -  ${s.name || 'SITE'}  ${Math.round(d / 1000)} KM`, 'bad'); say('SAM LAUNCH  -  ACCELERATE AND CLIMB', 2); break;
      }
    }
    P.rwr = P.sams.length ? 2 : 0;
    for (let i = P.sams.length - 1; i >= 0; i--) {
      const m = P.sams[i]; m.t += dt;
      const sp = m.v.length(), boost = m.t < S.boost, vT = boost ? Math.min(S.vmax, sp + S.accel * dt) : sp - (0.02 * sp + 9.8 * Math.max(0, m.v.y / (sp || 1))) * dt;
      // proportional navigation on the lead point, the turn limited by the speed (a coasting missile turns less)
      _c.copy(A.pos).addScaledVector(A.vel, clamp(m.p.distanceTo(A.pos) / Math.max(sp, 50), 0, 30)).sub(m.p).normalize();
      _v.copy(m.v).normalize(); const turn = S.turn * clamp(sp / S.vmax, 0.2, 1) * dt / Math.max(sp, 1);
      _v.lerp(_c, clamp(turn * 8, 0, 1)).normalize(); m.v.copy(_v).multiplyScalar(Math.max(0, vT));
      m.p.addScaledVector(m.v, dt);
      const d = m.p.distanceTo(A.pos); m.miss = Math.min(m.miss, d);
      if (d < S.kill) { P.sams.splice(i, 1); const ecm = 0.35; if (Math.random() > ecm) { A.damage += 0.6 + Math.random() * 0.6; feed('SAM DETONATION  -  SR-71 HIT', 'bad'); if (A.damage >= 1) P.lose('SHOT DOWN BY A SAM'); } else feed('SAM DETONATED  -  DEF SYSTEMS (ECM) DEFEATED IT', 'good'); continue; }
      if (m.t > S.life || vT < 60 || (m.t > S.boost + 4 && d > m.miss + 3000)) { P.sams.splice(i, 1); feed(`SAM FELL SHORT  -  MISS ${(m.miss / 1000).toFixed(1)} KM`, 'good'); }
    }
  }
  P.lose = why => { if (!P.alive) return; P.alive = false; feed(`SR-71 LOST  -  ${why}`, 'bad'); H.onLost && H.onLost(why); };

  // ---------------------------------------------------------------- caution lights (the annunciator words for the HUD)
  function cautions() {
    const c = [];
    if (A.eng[0].unstart) c.push('L UNSTART'); if (A.eng[1].unstart) c.push('R UNSTART');
    if (A.cit > SR71.CIT_MAX) c.push('CIT ' + Math.round(A.cit) + ' C');
    if (A.keas > SR71.KEAS_MAX) c.push('KEAS');
    if (A.fuel * LB < SR71.RTB_FUEL * LB) c.push('FUEL LOW');
    if (A.eng.some(e => e.damaged)) c.push('ENGINE DAMAGE');
    if (!A.onGround && A.gear > 0.02 && A.keas > SR71.V_GEAR) c.push('GEAR');
    if (P.rwr === 2) c.push('SAM');
    if (A.leak > 0) c.push('FUEL LEAK (COLD)');
    const nw = c.length && !P.caution; P.cautions = c; P.caution = c.length > 0; if (nw) snd?.chime();
    P.warn = A.eng.some(e => e.unstart) ? 2 : c.length ? 1 : 0;
  }

  // ---------------------------------------------------------------- the frame
  P.update = (dt, o = {}) => {
    if (!P.exists) return;
    P.time += dt; const active = o.active !== false;
    const c = active && P.alive ? readControls(dt) : (P.ctl.throttle[0] = P.ctl.throttle[1] = A.eng[0].run ? P.thr : 0, P.ctl.pitch = P.ctl.roll = P.ctl.yaw = 0, P.ctl.brakeL = P.ctl.brakeR = A.onGround ? 1 : 0, P.ctl);
    if (P.override) P.override(c);   // (tests / a scripted pilot: edits the controls after the inputs are read)
    if (P.seat === 1 && active) { c.pitch = 0; c.roll = 0; c.yaw = 0; }   // the RSO has no flight controls: the pilot (autopilot) holds her
    starting(dt);
    const k = SR71CFG.TIME_K[P.timeK] || 1; if (k > 1 && (A.onGround || A.altFt < 20000 || P.sams.length)) P.timeK = 0;
    const steps = SR71CFG.TIME_K[P.timeK] || 1;
    for (let i = 0; i < steps && P.alive; i++) {
      const evs = A.step(dt, c, env);
      for (const e of evs) {
        if (e.e === 'unstart') { snd?.unstart(); say(`${e.k ? 'RIGHT' : 'LEFT'} INLET UNSTART`, 1.5); H.onEvent && H.onEvent(e); }
        else if (e.e === 'restarted') { if (e.k === 1) say('INLETS RESTARTED', 1); }
        else if (e.e === 'teb') snd?.lightoff();
        else if (e.e === 'running') say(`${e.k ? 'RIGHT' : 'LEFT'} J58 RUNNING`, 1.2);
        else if (e.e === 'chuteFail') say('DRAG CHUTE FAILED', 1.5);
        else if (e.e === 'overstress') feed(`OVERSTRESS  ${e.g.toFixed(1)} G`, 'bad');
        else if (e.e === 'overspeed') say('KEAS LIMIT  -  450', 1.2);
        else if (e.e === 'engineDamage') feed(`${e.k ? 'RIGHT' : 'LEFT'} ENGINE DAMAGED  -  CIT OVER 427 C`, 'bad');
        else if (e.e === 'crash' || e.e === 'ditch') P.lose(e.e === 'ditch' ? 'DITCHED' : 'CRASHED');
        else if (e.e === 'touchdown' && o.active !== false) say(`TOUCHDOWN  ${Math.round(e.kias)} KIAS`, 1.2);
      }
      if (A.damage >= 1) P.lose('BROKE UP');
      if (!P.alive) break;
    }
    if (P.alive) { recon(dt * steps); threats(dt * steps); cautions(); }
  };

  // ---------------------------------------------------------------- render: model, cockpit, sky, sound
  const anim = { surf: null };
  P.render = (dt, time, inside, camera) => {
    if (!P.exists) return;
    model.group.position.copy(A.pos); model.group.quaternion.copy(A.q);
    A.lights = P.lights;
    model.animate(A, dt, time, inside);
    cockpit.group.visible = inside;
    if (inside) {
      const w = P.wpt; let brg = 0, nm = 0, rel = null; if (w) { const dx = w.x - A.pos.x, dz = w.z - A.pos.z; brg = Math.atan2(-dx, -dz) - A.heading; nm = Math.hypot(dx, dz) * 2 / 1852; rel = [dx, dz]; }
      const R = P.recon, gsp = Math.hypot(A.vel.x, A.vel.z);
      // (ngc/sr71-fix) the Nav Map (moving map) and the OBC panel get the cameras' state, the track, the strips, the photos
      cockpit.update(A, P.ctl, dt, { brg, wptNm: nm, wptRel: rel, time: P.time, sched: spikeSched(A.mach), recon: R.on, reconOk: R.ok, film: Math.round(R.frames), filmRemain: Math.max(0, 2000 - Math.round(R.frames / 3.5)), caution: P.caution,
        map: { x: A.pos.x, z: A.pos.z, bound: ctx.bound || 2560, range: A.onGround || gsp < 60 ? 3000 : clamp(gsp * 40, 6000, 30000), trail: R.trail, strips: R.strips, marks: R.marks, swath: R.swath, ok: R.ok } });
    }
    if (camera) sky.update(camera, true, time);
    if (snd) snd.update({ n: A.eng.map(e => e.n), ab: A.eng.map(e => e.ab), keas: A.keas, mach: A.mach, sigma: A.sigma, inside, canopy: A.canopy, on: 1, cart: P.cart, unstart: A.eng.some(e => e.unstart), warn: P.warn, rwr: P.rwr });
  };
  P.silence = () => snd?.silence();
  // ---------------------------------------------------------------- cameras
  P.cockpitCam = (cam, dt, head) => {
    const E = P.seat ? SR71M.EYE_RSO : SR71M.EYE;
    cam.position.set(...E).applyQuaternion(A.q).add(A.pos);
    cam.quaternion.copy(A.q).multiply(_q.setFromEuler(_e.set((head ? head.pitch : 0) - 0.12, head ? head.yaw : 0, 0, 'YXZ')));
    cam.near = 0.05;
  };
  const chaseP = new THREE.Vector3(); let chaseInit = false;
  P.snapChase = () => { chaseInit = false; };
  P.chaseCam = (cam, dt) => {
    const C = P.chase; A.forward(_f); A.up(_u);
    _v.copy(A.pos).addScaledVector(_f, -C.dist * Math.cos(C.pitch)).addScaledVector(_u, 6 + C.dist * Math.sin(C.pitch));
    if (C.yaw) { _v.sub(A.pos).applyAxisAngle(_u, C.yaw).add(A.pos); }
    // the offset from the aircraft is what lags (a little), not the position: at Mach 3 a lagging camera would fall far behind
    _v.sub(A.pos); const k = chaseInit ? 1 - Math.exp(-6 * dt) : 1; chaseInit = true; chaseP.lerp(_v, k); cam.position.copy(A.pos).add(chaseP);
    cam.up.copy(_u); cam.lookAt(_c.copy(A.pos).addScaledVector(_f, 6)); cam.near = 0.3;
  };
  // ---------------------------------------------------------------- read-outs
  P.hudLine = () => {
    const att = A.attitude();
    return `KEAS ${Math.round(A.keas)}  M ${A.mach.toFixed(2)}  ${Math.round(A.altFt / 100) * 100} FT  ${(A.vel.y * K_EQ * FT * 60 >= 0 ? '+' : '') + Math.round(A.vel.y * K_EQ * FT * 60 / 100) * 100} FPM  HDG ${String(Math.round(((-A.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0')}  AOA ${(A.alpha * 57.3).toFixed(1)}  ${A.nz.toFixed(1)}G  THR ${P.thr > 0.66 ? 'AB ' + Math.round((P.thr - 0.66) / 0.34 * 100) + '%' : Math.round(P.thr / 0.66 * 100) + '% MIL'}  CIT ${Math.round(A.cit)}C  FUEL ${Math.round(A.fuel * LB / 100) * 100} LB${A.ap.on ? '  AP ' + A.ap.pitch.toUpperCase() : ''}${P.timeK ? '  TIME x' + SR71CFG.TIME_K[P.timeK] : ''}  ${P.seat ? 'RSO' : 'PILOT'}`;
  };
  P.hint = () => {
    if (!A.eng.some(e => e.run) && !P.starting) return 'I START (CART)  ·  SHIFT / CTRL THROTTLES (PAST THE MIL DETENT: AB)  ·  G GEAR  ·  C CHUTE  ·  ` AUTOPILOT  ·  K CAMERAS  ·  V VIEW';
    if (A.onGround && A.kias < 60) return 'THROTTLES TO MAX AB  ·  ROTATE AT ~210 KIAS (8-10°)  ·  GEAR UP BY 300 KEAS  ·  . BRAKES';
    const R = P.recon;
    const lines = [P.cautions.join('  ')];
    if (R.on) lines.push(P.reconStatus());
    if (A.mach > 0.95 && A.mach < 1.3) lines.push('TRANSONIC: DIVE TO ~30,000 FT AT MAX AB, THEN 450 KEAS CLIMB');
    if (!A.onGround && A.altFt < 3000 && A.gear < 0.5 && A.keas < 260) lines.push('GEAR!  ·  FINAL 175 KIAS, TOUCHDOWN 155, CHUTE BELOW 210');
    return lines.filter(Boolean).join('  ·  ');
  };
  return P;
}
