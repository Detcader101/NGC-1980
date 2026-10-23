// waspai.js - the RW-3 WASP's mind: agile, precise, uncanny. Pure JS (guidance only; pilot.js does the flying).
// Behaviours (all expressed as a desired velocity / height / heading for the pilot, so the ducted-fan physics decides
// what the machine can actually do):
//   guard   - hold a station over its home with slow, mechanical sensor sweeps (yaw steps, not smooth turns)
//   ambush  - drop behind cover (the terrain between it and the threat), hover low and still, wait for the target
//             to come into reach, then pop up and attack
//   strafe  - attack runs: run in fast on an offset line, fire while the nose is on, overfly, break away and come
//             back from a new bearing
//   snipe   - hover at standoff and side-slip, keeping the weapon on the target (between strafing passes)
//   swarm   - raid groups take evenly spaced slots on a ring round the target and turn with it in lock-step; they
//             attack one after another
// Weapon release is decided here but kept at game level (the war's 'b' rounds, like the old saucer's gun).
import { clamp, wrap } from './rb.js';

export const WASP_PILOT = { kv: 0.9, aMax: 9, tilt: 0.9, th: [1.6, 0.7, 0.25], ph: [1.6, 0.7, 0.25], vz: [0.07, 0.06], coll0: 0.55, psi: [2.0, 1.6], r: [0.9, 0.6], trimI: 0.012, rate: 1.4 };
const TAU = Math.PI * 2;
const hdgTo = (dx, dz) => Math.atan2(-dx, -dz);

// world: { groundY(x, z), los(ax, ay, az, bx, by, bz) -> bool, floorAlong(x, z, ux, uz, L) }
// me: { x, y, z, vx, vy, vz, yaw }, tgt: { x, y, z, vx, vy, vz } | null, o: { id 0..1, slot, slots, home: [x, z], raid, time }
export function createWaspAI(o = {}) {
  const AI = {
    mode: 'guard', t: 0, cmd: { vx: 0, vz: 0, vy: 0, hdg: 0 }, fire: false, aimOk: false, phase: 0, pass: null, hide: null, sweep: 0, o,
    set(m) { if (m !== AI.mode) { AI.mode = m; AI.t = 0; AI.pass = null; } },
    step(me, tgt, dt, world, ctx = {}) {
      AI.t += dt; const c = AI.cmd; AI.fire = false; AI.aimOk = false;
      const gy = world.groundY(me.x, me.z), agl = me.y - gy;
      const floorAhead = (ux, uz, L) => world.floorAlong(me.x, me.z, ux, uz, L);
      if (!tgt) {   // ---- guard: hold the home station, sweep the sensors in steps
        const [hx, hz] = o.home || [me.x, me.z], ring = o.slots > 1 ? 18 : 0, a = (o.slot || 0) / Math.max(1, o.slots || 1) * TAU + (ctx.time || 0) * 0.05;
        const px = hx + Math.cos(a) * ring, pz = hz + Math.sin(a) * ring, hold = Math.max(world.groundY(px, pz), 0) + 26 + 3 * Math.sin((ctx.time || 0) * 0.3 + (o.id || 0) * 6);
        const dx = px - me.x, dz = pz - me.z, d = Math.hypot(dx, dz);
        const sp = Math.min(30, d * 0.4);
        c.vx = d > 0.5 ? dx / d * sp : 0; c.vz = d > 0.5 ? dz / d * sp : 0;
        c.vy = clamp((hold - me.y) * 0.5, -4, 5);
        AI.sweep -= dt; if (AI.sweep <= 0) { AI.sweep = 1.8 + Math.random() * 2.4; AI.look = me.yaw + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.2); }   // mechanical look-round
        c.hdg = d > 25 ? hdgTo(dx, dz) : AI.look ?? me.yaw;
        AI.set('guard');
        return c;
      }
      const dx = tgt.x - me.x, dz = tgt.z - me.z, dy = tgt.y - me.y, dh = Math.hypot(dx, dz), d = Math.hypot(dh, dy), ux = dx / (dh || 1), uz = dz / (dh || 1);
      const reach = ctx.reach ?? 110, low = Math.max(gy, 0) + 7;
      // ---- choose the behaviour
      if (AI.mode === 'guard') AI.set(ctx.ambush && d > reach * 1.2 ? 'ambush' : o.slots > 1 ? 'swarm' : 'strafe');
      if (AI.mode === 'ambush' && (d < reach * 0.9 || AI.t > 40)) AI.set('strafe');
      if (AI.mode === 'snipe' && AI.t > 4 + (o.id || 0) * 3) AI.set(o.slots > 1 ? 'swarm' : 'strafe');
      switch (AI.mode) {
        case 'ambush': {   // find low ground with the terrain between us and the target: hover there, still
          if (!AI.hide || AI.t % 6 < dt) {
            let best = null, bs = -1e9;
            for (let k = 0; k < 12; k++) {   // candidate spots fanned out round us, away from the target
              const a = Math.atan2(-uz, -ux) + (k - 5.5) * 0.3, r = 25 + 15 * (k % 3);
              const px = me.x + Math.cos(a) * r, pz = me.z + Math.sin(a) * r, py = Math.max(world.groundY(px, pz), 0) + 6;
              const hidden = !world.los(px, py, pz, tgt.x, tgt.y, tgt.z), dist = Math.hypot(tgt.x - px, tgt.z - pz);
              const s = (hidden ? 100 : 0) - Math.abs(dist - reach * 1.3) * 0.5;
              if (s > bs) { bs = s; best = { x: px, y: py, z: pz }; }
            }
            AI.hide = best;
          }
          const hx = AI.hide.x - me.x, hz = AI.hide.z - me.z, hd = Math.hypot(hx, hz), sp = Math.min(25, hd * 0.5);
          c.vx = hd > 0.5 ? hx / hd * sp : 0; c.vz = hd > 0.5 ? hz / hd * sp : 0; c.vy = clamp((AI.hide.y - me.y) * 0.6, -5, 4);
          c.hdg = hdgTo(dx, dz);   // still, facing where the target will come from
          break;
        }
        case 'strafe': {   // run in on an offset line, fire, overfly, break and come round from a new bearing
          if (!AI.pass) { const side = Math.random() < 0.5 ? -1 : 1, off = 14 + Math.random() * 10; AI.pass = { side, off, start: AI.t, done: false, bearing: Math.atan2(dz, dx) + side * (0.4 + Math.random() * 0.5) }; }
          const P = AI.pass, sx = -uz * P.side * P.off, sz = ux * P.side * P.off;   // aim point offset to one side
          if (!P.done) {
            const ax = tgt.x + sx - me.x, az = tgt.z + sz - me.z, ad = Math.hypot(ax, az), sp = clamp(ad * 0.6, 18, 42);
            c.vx = ax / (ad || 1) * sp + (tgt.vx || 0) * 0.5; c.vz = az / (ad || 1) * sp + (tgt.vz || 0) * 0.5;
            c.vy = clamp((Math.max(tgt.y + 12, floorAhead(ux, uz, 60) + 14) - me.y) * 0.5, -6, 6);
            c.hdg = hdgTo(dx, dz);
            if (d < 30 || (AI.t - P.start) > 14) P.done = AI.t;
          } else {   // break away and open the range before the next pass
            const bx = Math.cos(P.bearing), bz = Math.sin(P.bearing);
            c.vx = -bx * 34; c.vz = -bz * 34; c.vy = clamp((Math.max(tgt.y + 22, floorAhead(-bx, -bz, 80) + 18) - me.y) * 0.5, -5, 6);
            c.hdg = hdgTo(-bx, -bz);
            if (AI.t - P.done > 3.5 && d > 70) { AI.pass = null; if (Math.random() < 0.45) AI.set('snipe'); }
          }
          break;
        }
        case 'snipe': {   // hover at standoff, slide sideways, weapon on
          const stand = 70 + 15 * Math.sin((o.id || 0) * 9), slide = Math.sin(AI.t * 0.9 + (o.id || 0) * 4) * 9;
          const px = tgt.x - ux * stand + -uz * slide, pz = tgt.z - uz * stand + ux * slide, ex = px - me.x, ez = pz - me.z;
          c.vx = clamp(ex * 0.8, -22, 22) + (tgt.vx || 0); c.vz = clamp(ez * 0.8, -22, 22) + (tgt.vz || 0);
          c.vy = clamp((Math.max(tgt.y + 6, low + 4) - me.y) * 0.7, -5, 5); c.hdg = hdgTo(dx, dz);
          break;
        }
        case 'swarm': {   // evenly spaced slots on a ring round the target, turning together; attack in turn
          const n = Math.max(1, o.slots || 1), k = o.slot || 0, R = 48, w = 0.32, a = (ctx.time || 0) * w + k / n * TAU;
          const px = tgt.x + Math.cos(a) * R, pz = tgt.z + Math.sin(a) * R, ex = px - me.x, ez = pz - me.z;
          c.vx = clamp(ex * 0.9, -30, 30) - Math.sin(a) * R * w + (tgt.vx || 0); c.vz = clamp(ez * 0.9, -30, 30) + Math.cos(a) * R * w + (tgt.vz || 0);
          c.vy = clamp((Math.max(tgt.y + 10 + 4 * Math.sin(a * 2), low + 6) - me.y) * 0.6, -5, 5); c.hdg = hdgTo(dx, dz);
          // one at a time breaks off for a strafing pass (whose turn it is rotates every 7 s)
          if (Math.floor((ctx.time || 0) / 7) % n === k && AI.t > 3) AI.set('strafe');
          break;
        }
      }
      // keep clear: of the target (14 m) and of the rest of the swarm (10 m) - a firm push away, eerily precise
      // (judged on where both will be in 1.2 s as well as now: momentum carries a ducted fan a long way)
      const push = (q, r) => {
        for (const la of [0, 1.2]) {
          const ax = me.x + me.vx * la - (q.x + (q.vx || 0) * la), ay = me.y + me.vy * la - (q.y + (q.vy || 0) * la), az = me.z + me.vz * la - (q.z + (q.vz || 0) * la), dd = Math.hypot(ax, ay, az) || 1e-3;
          if (dd < r) { const k = (r - dd) * 3.2 / dd; c.vx += ax * k; c.vy += ay * k * 0.6; c.vz += az * k; }
        }
      };
      push(tgt, 16);
      if (ctx.others) for (const q of ctx.others) if (q !== me && q.x !== undefined) push(q, 15);
      // never into the ground
      const fl = floorAhead(Math.sign(c.vx) * Math.min(1, Math.abs(c.vx) / 10) || 0, Math.sign(c.vz) * Math.min(1, Math.abs(c.vz) / 10) || 0, 40);
      if (me.y < fl + 5) c.vy = Math.max(c.vy, (fl + 7 - me.y) * 1.2);
      // weapon: the nose (and the stinger) on the lead point inside reach, a clear line
      const herr = Math.abs(wrap(hdgTo(dx, dz) - me.yaw));
      AI.aimOk = d < reach && herr < 0.35 && AI.mode !== 'ambush' && !(AI.pass && AI.pass.done);
      AI.fire = AI.aimOk && (ctx.los ? ctx.los : true);
      return c;
    },
  };
  return AI;
}

// tilt limit from the thrust available: never lean further than full power can still hold 1 g (+ margin when sinking).
// The ducted fan's thrust also falls with the axial inflow (fast and tilted), which the fan model includes.
export function waspTiltLimit(S, st, cmd, G = 9.81) {
  const Tmax = S.flowFor(S.P_MAX ?? 260e3, S.rho, 0).T, need = S.mass * G * (1.12 + Math.max(0, (cmd.vy ?? 0) - st.vy) * 0.04);
  return clamp(Math.acos(clamp(need / Tmax, 0, 0.99)), 0.12, 0.9);
}
