// SEALIFE: the seabirds over the archipelago's sea. Pure simulation (no THREE, no DOM, no game imports; node-testable
// by tools/fishbench.mjs). sealife.js draws them and tells them where the food is.
//
// Birds go where the sea gives food away, and from a long way off that is what marks it for a pilot:
// - a BAIT BALL driven to the top (fishsim.js): gannets wheel 15-30 m up and plunge, terns hover and drop, gulls swoop
//   and pick at the top and sit on the water squabbling;
// - DEAD FISH floating after a blast: gulls come in, pick and sit;
// - a TRAWLER working (its discards) and a ship under way (what her wake turns up): gulls follow astern.
// They fly in from out of sight (~200 m off, never popping in), leave the same way when the food is gone, flush off the
// water and scatter climbing from a helicopter or a jet passing low or a boat coming at them, and ride the live waves
// when they sit (surf(), the drawn sea).
//
// Numbers (real birds; the flight is a point mass that banks to turn, flaps to climb or hold height, glides otherwise):
//   YELLOW-LEGGED GULL Larus michahellis: span 1.4 m, cruise ~10 m/s, wingbeat ~3 Hz (Pennycuick 1990 J Exp Biol 150:
//     gulls 2.8-3.4 Hz, INFERRED for this species); surface-feeds (dips, picks, sits).
//   COMMON TERN Sterna hirundo: span 0.8 m, ~9 m/s, ~3.4 Hz (INFERRED); hovers 4-8 m up and plunges shallow (< 1 m).
//   NORTHERN GANNET Morus bassanus: span 1.75 m, ~14 m/s, ~3.6 Hz (INFERRED); plunges from 10-30 m, wings swept back
//     as it speeds up and fully folded before it hits, entering at ~20-24 m/s (Lee & Reddish 1981 Nature 293 - CONFIRMED
//     order), down 2-5 m (Capuska et al. 2011 - INFERRED), then floats, and runs along the top to take off.
const TAU = Math.PI * 2, G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

export const BIRD_SPECIES = [
  { key: 'gull', name: 'YELLOW-LEGGED GULL', span: 1.4, len: 0.6, cruise: 10, flapHz: 3.0, orbit: [8, 16], feed: 'pick', sits: true },
  { key: 'tern', name: 'COMMON TERN', span: 0.8, len: 0.36, cruise: 9, flapHz: 3.4, orbit: [5, 10], feed: 'hover', sits: false },
  { key: 'gannet', name: 'NORTHERN GANNET', span: 1.75, len: 0.95, cruise: 14, flapHz: 3.6, orbit: [14, 28], feed: 'plunge', sits: true },
];
export const BIRD_INDEX = Object.fromEntries(BIRD_SPECIES.map((s, i) => [s.key, i]));
export const BIRDS = { MAX: 64, SPAWN_D: [170, 230], GONE_D: 330, FADE: 1.2 };

// states
const FLY = 0, PLUNGE = 1, UNDER = 2, SIT = 3, TAKEOFF = 4, HOVER = 5, DIVE = 6, PICK = 7, LEAVE = 8;
export const BIRD_STATE = ['fly', 'plunge', 'under', 'sit', 'takeoff', 'hover', 'dive', 'pick', 'leave'];

export function createSeaBirds({ seed = 77, surf = null } = {}) {
  const r = rng(seed), _so = { e: 0, sx: 0, sz: 0 };
  const top = (x, z) => { if (surf) { surf(x, z, _so); return _so.e; } _so.e = _so.sx = _so.sz = 0; return 0; };
  const B = { birds: [], t: 0, ms: 0, events: [], nEv: 0, light: 1, sea: 0.5, max: BIRDS.MAX, stats: { spawned: 0, plunges: 0, dips: 0, flushed: 0, left: 0 } };
  const event = (kind, x, y, z, s, sp) => { let e = B.events[B.nEv]; if (!e) { e = { kind: '', x: 0, y: 0, z: 0, s: 0, sp: 0 }; B.events.push(e); } if (B.nEv >= 64) return; B.nEv++; e.kind = kind; e.x = x; e.y = y; e.z = z; e.s = s; e.sp = sp; };

  // how many birds of which kind a focus draws. kind: 'ball' (k 0..1), 'dead' (k ~ fish floating / 20), 'boat', 'wake'
  function wants(f) {
    if (B.light < 0.25) return null;   // (they roost at night)
    const storm = B.sea > 0.8 ? 0.4 : 1;
    if (f.kind === 'ball') { const n = Math.round((4 + 14 * f.k) * storm); return [Math.round(n * 0.35), Math.round(n * 0.3), n - Math.round(n * 0.35) - Math.round(n * 0.3)]; }   // gull, tern, gannet
    if (f.kind === 'dead') return [Math.round((3 + 8 * Math.min(1, f.k)) * storm), 0, 0];
    if (f.kind === 'boat') return [Math.round(6 * storm), 0, 0];
    if (f.kind === 'wake') return [Math.round(3 * storm), 0, 0];
    return null;
  }
  function spawn(spi, f, cam) {
    if (B.birds.length >= B.max) return null;
    const sp = BIRD_SPECIES[spi];
    // from out of sight: 170-230 m from the focus, on the far side from the camera (or off to one side)
    const ax = f.x - cam.x, az = f.z - cam.z, al = Math.hypot(ax, az) || 1, side = (r() - 0.5) * 2.2;
    const ux = ax / al * Math.cos(side) - az / al * Math.sin(side), uz = az / al * Math.cos(side) + ax / al * Math.sin(side);
    const d = BIRDS.SPAWN_D[0] + r() * (BIRDS.SPAWN_D[1] - BIRDS.SPAWN_D[0]);
    let x = f.x + ux * d, z = f.z + uz * d; if (Math.hypot(x - cam.x, z - cam.z) < 150) { x = f.x - ux * d; z = f.z - uz * d; }
    const y = 18 + r() * 22, hx = f.x - x, hz = f.z - z, hl = Math.hypot(hx, hz) || 1;
    const b = { sp: spi, x, y, z, vx: hx / hl * sp.cruise, vy: 0, vz: hz / hl * sp.cruise, st: FLY, t: 0, f: f.id, fx: f.x, fz: f.z, ph: r() * TAU, amp: 1, fold: 0, roll: 0, fade: 0,
      orbit: sp.orbit[0] + r() * (sp.orbit[1] - sp.orbit[0]), dir: r() < 0.5 ? 1 : -1, alt: 0, u: r(), next: 3 + r() * 8, sitY: 0, flushT: 0, yaw: Math.atan2(hx, hz), pitch: 0 };
    b.alt = spi === 2 ? 15 + r() * 15 : spi === 1 ? 5 + r() * 5 : 7 + r() * 9;
    B.birds.push(b); B.stats.spawned++; return b;
  }

  // the flight: steer the velocity towards (tx, ty, tz) at speed v with the bird's turn rate (bank-limited)
  function steer(b, sp, tx, ty, tz, v, h, climb = 3) {
    const dx = tx - b.x, dz = tz - b.z, dl = Math.hypot(dx, dz) || 1;
    const hs = Math.hypot(b.vx, b.vz) || 1e-3, want = Math.atan2(dx, dz), cur = Math.atan2(b.vx, b.vz);
    let da = want - cur; da = Math.atan2(Math.sin(da), Math.cos(da));
    const maxW = G * Math.tan(0.9) / Math.max(hs, 3), w = clamp(da * 2, -maxW, maxW);   // up to ~50 deg of bank
    const nh = cur + w * h, ns = hs + (v - hs) * Math.min(1, h * 0.8);
    b.vx = Math.sin(nh) * ns; b.vz = Math.cos(nh) * ns;
    b.vy += ((clamp((ty - b.y) * 0.8, -climb * 1.5, climb) - b.vy)) * Math.min(1, h * 2);
    b.roll += (clamp(Math.atan(w * hs / G), -0.9, 0.9) - b.roll) * Math.min(1, h * 4);
    return dl;
  }
  const flushFrom = (b, threats) => {   // the nearest thing that frightens it, within its reach
    for (const t of threats) { const d = Math.hypot(b.x - t.x, b.y - t.y, b.z - t.z); if (d < t.r) return t; }
    return null;
  };

  B.update = (dt, cam, { foci = [], threats = [] } = {}) => {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    B.nEv = 0; B.t += dt;
    const byId = B._byId || (B._byId = new Map()); byId.clear(); for (const f of foci) byId.set(f.id, f);
    // recruit: each focus near enough to matter draws its birds in, one every ~0.4 s
    B.spawnT = (B.spawnT || 0) - dt;
    if (B.spawnT <= 0) {
      B.spawnT = 0.4;
      for (const f of foci) {
        if (Math.hypot(f.x - cam.x, f.z - cam.z) > 600) continue;
        const w = wants(f); if (!w) continue;
        const have = [0, 0, 0]; for (const b of B.birds) if (b.f === f.id && b.st !== LEAVE) have[b.sp]++;
        for (let s = 0; s < 3; s++) if (have[s] < w[s]) { spawn(s, f, cam); break; }
      }
    }
    // a bird is drawn only after it has flown in: fade 0 -> 1 over FADE s (it is far off and small anyway)
    let left = Math.min(dt, 0.25);
    while (left > 1e-6) {
      const h = Math.min(1 / 30, left); left -= h;
      for (let i = B.birds.length - 1; i >= 0; i--) {
        const b = B.birds[i], sp = BIRD_SPECIES[b.sp];
        b.t += h; b.fade = Math.min(1, b.fade + h / BIRDS.FADE);
        let f = byId.get(b.f);
        if (f) { b.fx = f.x; b.fz = f.z; }
        if (!f && b.st === FLY) { b.st = LEAVE; b.t = 0; B.stats.left++; }
        // flush: a low aircraft or a boat coming at it - up off the water, away and climbing
        const thr = threats.length ? flushFrom(b, threats) : null;
        if (thr && b.flushT <= 0) {
          b.flushT = 3 + r() * 2; B.stats.flushed++;
          if (b.st === SIT) { b.st = TAKEOFF; b.t = 0; }
          else if (b.st !== UNDER && b.st !== TAKEOFF) { b.st = FLY; b.t = 0; }
          b.ex = b.x - thr.x; b.ez = b.z - thr.z;
        }
        b.flushT -= h;
        const surfY = top(b.x, b.z), sx = _so.sx, sz = _so.sz;
        let flap = 0.45;   // how hard the wings beat 0..1 (0: a glide, wings held out)
        switch (b.st) {
          case LEAVE: {   // off out of sight, climbing a little
            const ax = b.x - cam.x, az = b.z - cam.z, al = Math.hypot(ax, az) || 1;
            steer(b, sp, b.x + ax / al * 100, 30, b.z + az / al * 100, sp.cruise * 1.1, h);
            if (al > BIRDS.GONE_D) { B.birds.splice(i, 1); continue; }
            flap = 0.6; break;
          }
          case FLY: {
            if (b.flushT > 0 && b.ex !== undefined) { const el = Math.hypot(b.ex, b.ez) || 1; steer(b, sp, b.x + b.ex / el * 50, b.y + 15, b.z + b.ez / el * 50, sp.cruise * 1.3, h, 5); flap = 1; break; }
            // circle the focus: an orbit point running round it (boats and wakes: astern of them, moving with them)
            let cx = b.fx, cz = b.fz, rad = b.orbit, alt = b.alt;
            if (f && (f.kind === 'boat' || f.kind === 'wake')) { const fl = Math.hypot(f.vx || 0, f.vz || 0) || 1; cx -= (f.vx || 0) / fl * (12 + 20 * b.u); cz -= (f.vz || 0) / fl * (12 + 20 * b.u); rad = 5 + 8 * b.u; alt = 4 + 8 * b.u; }
            const ang = b.t * (sp.cruise / Math.max(rad, 4)) * 0.8 * b.dir + b.u * TAU;
            const tx = cx + Math.cos(ang) * rad, tz = cz + Math.sin(ang) * rad;
            const d = steer(b, sp, tx, surfY + alt, tz, sp.cruise, h);
            flap = b.vy > 0.6 ? 1 : (Math.sin(b.t * 0.9 + b.u * 7) > 0.2 ? 0.55 : 0);   // flap-and-glide
            // feed: when over the food and it is at the top
            b.next -= h;
            const near = Math.hypot(b.x - b.fx, b.z - b.fz) < rad + 6 && d < 40;
            if (f && near && b.next <= 0 && b.flushT <= 0) {
              b.next = 4 + r() * 9;
              const ok = f.kind === 'ball' ? f.k > 0.25 : f.kind !== 'wake' || r() < 0.4;
              if (ok) {
                b.tx = b.fx + (r() - 0.5) * (f.r || 3) * 1.6; b.tz = b.fz + (r() - 0.5) * (f.r || 3) * 1.6;
                if (f.kind === 'boat' || f.kind === 'wake') { const fl = Math.hypot(f.vx || 0, f.vz || 0) || 1; b.tx = b.fx - (f.vx || 0) / fl * (10 + 25 * r()); b.tz = b.fz - (f.vz || 0) / fl * (10 + 25 * r()); }
                if (sp.feed === 'plunge' && f.kind === 'ball') { b.st = PLUNGE; b.t = 0; }
                else if (sp.feed === 'hover') { b.st = HOVER; b.t = 0; b.hy = surfY + 4 + 4 * r(); }
                else { b.st = PICK; b.t = 0; }
              }
            }
            break;
          }
          case PLUNGE: {   // gannet: tip over, fall, sweep the wings back, fold, in
            const dx = b.tx - b.x, dz = b.tz - b.z, hd = Math.hypot(dx, dz) || 1, hs = Math.hypot(b.vx, b.vz);
            const k = Math.min(1, h * 2.5); b.vx += (dx / hd * Math.min(hs, 6) - b.vx) * k; b.vz += (dz / hd * Math.min(hs, 6) - b.vz) * k;
            b.vy -= G * h * (b.t < 0.4 ? 0.5 : 1); b.vy = Math.max(b.vy, -26);
            b.fold = clamp((-b.vy - 6) / 12, 0.25, 1); flap = 0; b.roll *= 0.9;
            if (b.y <= surfY) { event('plunge', b.x, surfY, b.z, 1, b.sp); B.stats.plunges++; b.st = UNDER; b.t = 0; b.dep = 2 + 3 * r(); b.vy = Math.max(b.vy, -20); }
            break;
          }
          case UNDER: {   // under: the momentum takes it down, it pursues for a few s, then floats up
            b.vx *= Math.exp(-h * 3); b.vz *= Math.exp(-h * 3);
            const ty = surfY - b.dep; b.vy += ((b.t < 1.2 ? (ty - b.y) * 4 : (surfY + 0.2 - b.y) * 1.5) - b.vy) * Math.min(1, h * 3); b.fold = 1; flap = 0;
            if (b.t > 1.2 && b.y > surfY - 0.1) { b.st = SIT; b.t = 0; b.sitT = 2 + 6 * r(); event('surface', b.x, surfY, b.z, 0.4, b.sp); }
            break;
          }
          case SIT: {   // on the water, riding the swell, drifting a little; then up again
            b.vx *= Math.exp(-h * 2); b.vz *= Math.exp(-h * 2); b.vy = 0; b.y += (surfY + 0.04 - b.y) * Math.min(1, b.t < 0.4 ? h * 10 : 1); b.fold = Math.min(1, b.fold + h * 3); flap = 0;
            b.sitT = (b.sitT ?? 4) - h;
            if (b.sitT <= 0 || (!f && b.t > 2)) { b.st = TAKEOFF; b.t = 0; }
            break;
          }
          case TAKEOFF: {   // run along the top flapping hard, then climb away (into the circle again)
            const hs = Math.hypot(b.vx, b.vz), cur = hs > 0.2 ? Math.atan2(b.vx, b.vz) : b.yaw, ns = Math.min(sp.cruise, hs + h * 6);
            b.vx = Math.sin(cur) * ns; b.vz = Math.cos(cur) * ns; b.fold = Math.max(0, b.fold - h * 4); flap = 1;
            if (b.t < 0.9) { b.y = surfY + 0.06; b.vy = 0; if ((b.t * 8 | 0) !== ((b.t - h) * 8 | 0)) event('patter', b.x, surfY, b.z, 0.2, b.sp); }
            else b.vy += (2.5 - b.vy) * Math.min(1, h * 3);
            if (b.t > 2.2) { b.st = FLY; b.t = 0; }
            break;
          }
          case HOVER: {   // tern: hang over the spot, head to wind, then drop
            b.vx *= Math.exp(-h * 3); b.vz *= Math.exp(-h * 3); b.vy += ((b.hy - b.y) * 2 - b.vy) * Math.min(1, h * 3); flap = 1; b.amp = 1.3;
            const dx = b.tx - b.x, dz = b.tz - b.z; b.vx += dx * h * 2; b.vz += dz * h * 2;
            if (b.t > 1.2 + b.u * 2) { b.st = DIVE; b.t = 0; }
            break;
          }
          case DIVE: {   // tern's shallow plunge: in up to the shoulders and straight out again
            b.vy -= G * h * 1.2; b.fold = clamp(b.t * 3, 0, 0.8); flap = 0;
            b.vx += (b.tx - b.x) * h * 3 - b.vx * h; b.vz += (b.tz - b.z) * h * 3 - b.vz * h;
            if (b.y <= surfY + 0.05) { event('dip', b.x, surfY, b.z, 0.5, b.sp); B.stats.dips++; b.st = TAKEOFF; b.t = 1; b.y = surfY + 0.1; b.vy = 2; b.fold = 0.3; }
            break;
          }
          case PICK: {   // gull: a steep glide down to the top, a dip of the bill, up; sometimes it settles there
            const d = steer(b, sp, b.tx, surfY + 0.25, b.tz, sp.cruise * 0.7, h, 4); flap = b.t < 0.4 ? 0.6 : 0.1;
            if (d < 2.5 && b.y < surfY + 0.8) {
              event('dip', b.x, surfY, b.z, 0.3, b.sp); B.stats.dips++;
              if (sp.sits && f && f.kind !== 'boat' && b.y < surfY + 0.35 && r() < 0.35) { b.st = SIT; b.t = 0; b.sitT = 3 + 8 * r(); b.vx *= 0.4; b.vz *= 0.4; }
              else { b.st = FLY; b.t = 0; b.vy = 3; }
            }
            if (b.t > 8) { b.st = FLY; b.t = 0; }
            break;
          }
        }
        if (b.st !== SIT && b.st !== UNDER && b.st !== PLUNGE && b.st !== DIVE) b.fold = Math.max(0, b.fold - h * 2);
        // keep apart (a flock, not one bird)
        for (let j = 0; j < B.birds.length; j++) { const o = B.birds[j]; if (o === b) continue; const ex = b.x - o.x, ey = b.y - o.y, ez = b.z - o.z, d2 = ex * ex + ey * ey + ez * ez; if (d2 < 9 && d2 > 1e-4) { const k = (9 - d2) / 9 * h * 4; b.vx += ex * k; b.vz += ez * k; if (b.st === FLY) b.vy += ey * k; } }
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
        if (b.st === FLY || b.st === LEAVE || b.st === HOVER) b.y = Math.max(b.y, surfY + 1.5);   // flying birds never touch the water
        b.amp += ((flap > 0 ? 1 : 0) - b.amp) * Math.min(1, h * 5);
        b.ph = (b.ph + TAU * sp.flapHz * (flap > 0 ? (0.8 + 0.4 * flap) : 0) * h) % TAU;
        if (flap <= 0 && Math.abs(Math.sin(b.ph)) > 0.15) b.ph = (b.ph + TAU * sp.flapHz * h) % TAU;   // a glide: finish the stroke, wings level
        const hs = Math.hypot(b.vx, b.vz);
        if (hs > 0.3) b.yaw = Math.atan2(b.vx, b.vz);
        b.pitch = b.st === SIT ? Math.atan(-(sx * Math.sin(b.yaw) + sz * Math.cos(b.yaw))) : Math.atan2(b.vy, Math.max(hs, 0.5)) * (b.st === PLUNGE || b.st === DIVE ? 1 : 0.5);
        if (b.st === SIT) b.roll = Math.atan(sx * Math.cos(b.yaw) - sz * Math.sin(b.yaw));
      }
    }
    B.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  };

  // A (x, y, z, span)  B (yaw, pitch, roll, species)  C (wing phase, flap amplitude 0..1, fold 0..1, fade)  D (local sea
  // top y, sitting / swimming 0/1, -, -). view as fishsim's write (cull behind the camera and under a pixel).
  B.write = (O, view) => {
    O.n = 0;
    for (const b of B.birds) {
      if (O.n >= O.max) break;
      const sp = BIRD_SPECIES[b.sp];
      if (view) { const dx = b.x - view.x, dy = b.y - view.y, dz = b.z - view.z, d = Math.hypot(dx, dy, dz) + 1e-6; if ((dx * view.fx + dy * view.fy + dz * view.fz) / d < view.cos || sp.span / d * view.px < 0.8) continue; }
      const j = O.n * 4, tp = top(b.x, b.z);
      O.A[j] = b.x; O.A[j + 1] = b.y; O.A[j + 2] = b.z; O.A[j + 3] = sp.span;
      O.B[j] = b.yaw; O.B[j + 1] = b.pitch; O.B[j + 2] = b.roll; O.B[j + 3] = b.sp;
      O.C[j] = b.ph; O.C[j + 1] = Math.min(1.3, b.amp); O.C[j + 2] = b.fold; O.C[j + 3] = b.fade;
      O.D[j] = tp; O.D[j + 1] = b.st === SIT || b.st === UNDER ? 1 : 0; O.D[j + 2] = 0; O.D[j + 3] = 0;
      O.n++;
    }
    return O;
  };
  B.state = b => BIRD_STATE[b.st];
  B.clear = () => { B.birds.length = 0; };
  B.hash = () => { let h = 0; for (const b of B.birds) for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz, b.st]) h = (Math.imul(h, 31) + Math.round(v * 1000)) | 0; return h; };
  return B;
}
