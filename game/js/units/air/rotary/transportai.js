// transportai.js - the mission brain of an AI transport (CH-46 Sea Knight, MV-22 Osprey): lift off a (moving) deck,
// fly to the landing zone over the terrain, a decelerating approach down a glide path, a vertical descent to touchdown,
// unload, lift off, fly home and land back on the deck. Pure JS: no game imports, runs in node (tools/rotarymission.mjs).
//
// It only produces guidance - a desired world velocity, climb rate and heading (+ hints like the wanted airspeed for
// the tiltrotor's nacelles). The aircraft's own pilot (pilot.js / the tiltrotor controller) turns that into stick,
// collective and pedals, and the flight model does the flying. No position is ever set.
import { clamp, wrap } from './rb.js';

// the approach: closing speed from the distance (a sqrt profile = constant deceleration that stops over the point),
// height from the glide path near the LZ and the terrain ahead far from it
export function approach(st, tgt, o, world, out = {}) {
  const dx = tgt.x - st.x, dz = tgt.z - st.z, d = Math.hypot(dx, dz) || 1e-6, ux = dx / d, uz = dz / d;
  // too high above the hover point to get down in time at vDesc: slow down (a steep approach, flown slowly)
  const above = st.y - (tgt.y + o.hover), steep = above > 8 ? Math.max(4, (d - o.stop) * o.vDesc * 0.8 / above) : 1e9;
  const vs = Math.sqrt(2 * o.aDec * Math.max(0, d - o.stop)), Vc = Math.min(o.cruise, vs, d * (o.kpos ?? 0.22), steep);   // linear close in: the position loop stays slower than the velocity loop
  out.vx = (tgt.vx || 0) + ux * Vc; out.vz = (tgt.vz || 0) + uz * Vc;
  // on the braking curve: feed the deceleration forward so the pilot raises the nose in time (the loop only trims it)
  const brake = vs < o.cruise && vs < d * (o.kpos ?? 0.22) && d > 12 ? o.aDec : 0;
  out.ax = -ux * brake; out.az = -uz * brake; out.dist = d; out.closing = Vc;
  // terrain floor along the way (look-ahead grows with speed) and close round the aircraft
  const look = Math.min(d, 60 + 6 * Math.hypot(st.vx, st.vz));
  const clr = o.hover - 1 + (o.clear - o.hover + 1) * clamp((d - o.flat) / 120, 0, 1);   // clearance shrinks to the hover height on short final
  const floor = world.floorAlong(st.x, st.z, ux, uz, look) + clr;
  const glide = tgt.y + o.hover + Math.max(0, d - o.flat) * Math.tan(o.glide);
  const cruiseH = Math.max(floor, world.floorAlong(st.x, st.z, ux, uz, Math.min(d, 400)) + o.agl);
  const hDes = Math.max(Math.min(cruiseH, glide), floor);
  out.hDes = hDes;
  // descent limit: slow, steep descents put a rotor in its own wake (vortex ring) - below ~40 kt keep it under
  // o.vDescSlow (the V-22's ~800 fpm below 40 KCAS rule; a good habit for the CH-46 too)
  const vd = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0)) < 20 ? Math.min(o.vDesc, o.vDescSlow ?? 3.5) : o.vDesc;
  out.vy = clamp((hDes - st.y) * o.kh, -vd, o.vClimb) + (tgt.vy || 0);
  // heading: along the track while far, the landing heading in the last part
  const trackHdg = Math.atan2(-out.vx + (tgt.vx || 0), -out.vz + (tgt.vz || 0));
  out.hdg = d > o.hdgDist ? (Vc > 3 ? trackHdg : null) : tgt.hdg;
  if (out.hdg === null || out.hdg === undefined) out.hdg = st.yaw;
  // slow and pointing the wrong way (just off the deck): turn onto the track in the hover first, then go
  const gs = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0)), herr = Math.abs(wrap(trackHdg - st.yaw));
  if (d > o.hdgDist && gs < 12 && herr > 0.5) { out.hdg = trackHdg; out.vx = (tgt.vx0 ?? st.vx * 0.9); out.vz = (tgt.vz0 ?? st.vz * 0.9); out.ax = out.az = 0; out.turning = true; }
  out.speed = Vc;
  return out;
}
// hold a point (relative to a moving deck) while climbing or descending
export function hold(st, tgt, vy, k = 0.22, out = {}) {
  out.vx = (tgt.vx || 0) + clamp((tgt.x - st.x) * k, -4, 4); out.vz = (tgt.vz || 0) + clamp((tgt.z - st.z) * k, -4, 4);
  out.vy = vy; out.hdg = tgt.hdg ?? st.yaw; out.ax = out.az = 0; out.speed = 0; return out;
}

// o: { cruise, aDec, stop, glide, flat, hover, agl, clear, kh, vDesc, vClimb, hdgDist, liftAgl, spool }
// hooks: lz() / home() -> { x, y (ground), z, hdg, vx, vz } | null; unload(ai, dt) -> true when done; parked(ai)
export function createTransportAI(o, hooks) {
  const AI = {
    phase: 'spool', t: 0, cmd: {}, o, hooks, spot: null, err: 0, maxSink: 0, landedAt: null, log: [],
    set(p) { if (p !== AI.phase) { AI.log.push([+AI.tAll.toFixed(1), p]); AI.phase = p; AI.t = 0; } },
    tAll: 0,
    // ngc/bugsweep: the landing spot's acceleration (a deck spot swings round as the carrier turns), filtered from its
    // velocity (the deck moves once a frame, the pilot steps at 30 Hz) - fed forward so the pilot keeps over the spot
    ta: { vx: 0, vz: 0, ax: 0, az: 0, ok: false },
    track(tgt, dt) {
      const T = AI.ta, vx = tgt.vx || 0, vz = tgt.vz || 0;
      if (T.ok && dt > 0) { const k = Math.min(1, dt / 0.8); T.ax += (clamp((vx - T.vx) / dt, -3, 3) - T.ax) * k; T.az += (clamp((vz - T.vz) / dt, -3, 3) - T.az) * k; } else T.ax = T.az = 0;
      T.vx = vx; T.vz = vz; T.ok = true; return T;
    },
    // st: pilot.stateOf(); sim: { agl, landed, body: { contacts } } (or sim.contacts); world: { floorAlong, groundY }
    step(st, sim, dt, world) {
      AI.t += dt; AI.tAll += dt;
      const c = AI.cmd; c.collFix = undefined; c.ground = false; c.pitch = undefined; c.roll = undefined; const vyPrev = c.vy ?? 0;
      switch (AI.phase) {
        case 'spool': {   // engines to flight rpm, rotors spinning up on the deck
          AI.spot = AI.spot || { x: st.x, z: st.z, hdg: st.yaw };
          const h = hooks.home && hooks.home(); hold(st, { ...AI.spot, vx: h ? h.vx : 0, vz: h ? h.vz : 0 }, 0, 0, c);
          c.collFix = 0; c.ground = true;
          if (AI.t > o.spool) AI.set('lift');
          break;
        }
        case 'lift': case 'lift2': {   // straight up off the deck / pad, keeping station over it, then away
          const h = AI.phase === 'lift' ? (hooks.home && hooks.home()) : null, sp = AI.spot;
          const tgt = { x: sp.x, z: sp.z, hdg: sp.hdg, vx: h ? h.vx : 0, vz: h ? h.vz : 0 };
          if (h) { sp.x += (h.vx || 0) * dt; sp.z += (h.vz || 0) * dt; }   // the deck moves on
          hold(st, tgt, sim.agl < 1 ? 1.2 : clamp((o.liftAgl + 2 - sim.agl) * 0.6, 0.5, 3), 0.22, c);
          if (sim.agl > o.liftAgl) AI.set(AI.phase === 'lift' ? 'transit' : 'rtb');
          break;
        }
        case 'transit': case 'rtb': {
          const tgt = AI.phase === 'transit' ? hooks.lz() : hooks.home && hooks.home();
          if (!tgt) { AI.set('hover'); break; }
          approach(st, tgt, o, world, c);
          { const T = AI.track(tgt, dt); c.ax += T.ax; c.az += T.az; }
          const rel = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0));
          if (c.dist < o.stop + 1.5 && rel < 1.5 && Math.abs(st.y - (tgt.y + o.hover)) < 3) AI.set(AI.phase === 'transit' ? 'descend' : 'descend2');
          break;
        }
        case 'descend': case 'descend2': {   // vertical descent over the spot, slowing toward the ground
          const tgt = AI.phase === 'descend' ? hooks.lz() : hooks.home && hooks.home();
          if (!tgt) { AI.set('hover'); break; }
          const agl = sim.agl, off = Math.hypot(tgt.x - st.x, tgt.z - st.z), rel = Math.hypot(st.vx - (tgt.vx || 0), st.vz - (tgt.vz || 0));
          // ngc/bugsweep: don't sink the last few metres while still sliding across the spot (a moving, turning deck):
          // hold ~3 m until settled over it, then put it down. Touching a wheel while chasing the spot with the cyclic
          // pivoted the aircraft about that wheel (dynamic rollover) - the Sea Knights / Ospreys rolled over on the deck
          // On a deck, also wait (up to 25 s) for it to stop swinging round - a carrier in a turn heels outward while the
          // aircraft banks inward to follow the spot (an LSO's quiescent period)
          const T = AI.track(tgt, dt), settled = off < 2.5 && rel < 0.7 && (Math.hypot(T.ax, T.az) < 0.2 || AI.t > 25);
          hold(st, tgt, settled || agl > 3.5 ? -clamp(0.25 + agl * 0.3, 0.3, 2.2) : clamp((3 - agl) * 0.6, -0.4, 0.8), 0.22, c);
          c.ax = T.ax; c.az = T.az;
          if (off > 6 && agl > 2) AI.set(AI.phase === 'descend' ? 'transit' : 'rtb');   // blown off the spot: go round
          // down: on the wheels (or any wheel on, low): stop flying the spot, stick to neutral, collective down (ground /
          // parked) - a pilot doesn't reposition with a wheel on the deck
          // (the wheels on the deck are sim.body.contacts: the flight models have no sim.contacts, so this check never fired
          // and the AI kept flying the spot with a wheel down until the sim called it landed - ngc/bugsweep)
          const wheels = sim.body ? sim.body.contacts : (sim.contacts || 0);
          if (sim.landed || wheels >= 3 || (wheels >= 1 && agl < 0.4)) { AI.landedAt = { x: st.x, z: st.z, off, t: AI.tAll }; AI.spot = { x: st.x, z: st.z, hdg: st.yaw }; AI.c0 = sim.c ? (sim.c.coll ?? sim.c.tcl ?? 0.35) : 0.35; AI.set(AI.phase === 'descend' ? 'ground' : 'parked'); }
          break;
        }
        case 'ground': case 'parked': {   // collective down, sit on the wheels; unload / stow
          const tgt = AI.phase === 'parked' ? hooks.home && hooks.home() : null;
          hold(st, { x: st.x, z: st.z, hdg: st.yaw, vx: tgt ? tgt.vx : 0, vz: tgt ? tgt.vz : 0 }, -0.5, 0, c);
          // collective down from where it was at touchdown (ngc/bugsweep: it used to drop to 0.35 at once - a hover needs
          // ~0.5 - and the aircraft fell the rest of the way onto the wheels with one already down)
          c.collFix = Math.max(0, Math.min(AI.c0 ?? 0.35, 0.7) - AI.t * 0.3); c.ground = true;
          if (AI.phase === 'ground' && AI.t > 1.5 && hooks.unload(AI, dt)) { AI.spot = { x: st.x, z: st.z, hdg: st.yaw }; AI.set('lift2'); }
          if (AI.phase === 'parked' && AI.t > 1.5 && hooks.parked) hooks.parked(AI);
          break;
        }
        case 'hover': default: {   // nothing to do: hold here
          hold(st, { x: st.x, z: st.z, hdg: st.yaw }, clamp((20 - sim.agl) * 0.3, -1, 1), 0.3, c);
          if (AI.t > 1 && hooks.home && hooks.home()) AI.set('rtb');
        }
      }
      c.vy = vyPrev + clamp((c.vy ?? 0) - vyPrev, -(o.vyRate ?? 1.5) * dt, (o.vyRate ?? 1.5) * dt);   // no steps in the climb / descent command
      return c;
    },
    goHome() { if (!['rtb', 'descend2', 'parked'].includes(AI.phase)) AI.set(AI.phase === 'ground' || AI.phase === 'spool' ? 'lift2' : 'rtb'); },
  };
  return AI;
}
export { wrap };
