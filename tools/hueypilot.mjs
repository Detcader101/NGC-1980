// hueypilot.mjs - shared helpers for the Huey benches: load the flight model in plain node and a simple autopilot that
// trims it (hover / level flight / climb / autorotation) so its controls and gauges can be compared with published data.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
export const FM = await import('../game/js/hueyfm.js');
export const THREE = await import('../game/vendor/three.module.min.js');
export const DT = 1 / 60, deg = r => r * 180 / Math.PI, clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const sea = { groundY: () => -500, water: () => true };
export const land = { groundY: () => 0, water: () => false };

// a Huey at alt (m) with speed (m/s) along heading 0 (-z), governed, fuel% given
export function air(G = 9.81, { alt = 300, speed = 0, fuel = 100, coll = 0.42 } = {}) {
  const H = FM.createHueySim(G); H.reset(new THREE.Vector3(0, alt, 0), 0, false, 1); H.vel.set(0, 0, -speed); H.fuelKg = FM.UH1H.FUEL_KG * fuel / 100; H.c.coll = coll;
  return H;
}
export const ctl0 = () => ({ coll: 0.42, cx: 0, cy: 0, pedal: -0.25, throttle: 1, gov: 'AUTO', fuel: true });
// body-ish read-outs in the horizontal frame
export function state(H) {
  const f = H.forward(new THREE.Vector3()); f.y = 0; f.normalize(); const r = new THREE.Vector3(-f.z, 0, f.x);
  const a = H.attitude();
  return { u: H.vel.dot(f), v: H.vel.dot(r), vz: H.vel.y, pitch: a.pitch, roll: -a.roll, hdg: H.heading(), p: -H.w.z, q: H.w.x, r: -H.w.y };
}
// autopilot: holds a ground speed, vertical speed (or collective to hold rotor rpm in autorotation), heading, no drift
export function pilot(o = {}) {
  const P = { V: o.V ?? 0, vz: o.vz ?? 0, hdg: o.hdg ?? 0, i: { c: o.c0 ?? 0.42, lon: 0, lat: 0, ped: o.ped0 ?? -0.25, th: 0.06, ph: 0 }, rpmHold: !!o.rpmHold, freeColl: o.coll };
  P.ctl = ctl0();
  P.step = (H, dt) => {
    const s = state(H), c = P.ctl, I = P.i;
    // speed -> pitch attitude target (outer loop, slow), lateral drift -> bank target
    I.th = clamp(I.th + (s.u - P.V) * 0.004 * dt, -0.3, 0.3);
    const thT = clamp(I.th + (s.u - P.V) * 0.02, -0.25, 0.3);
    I.ph = clamp(I.ph - s.v * 0.004 * dt, -0.2, 0.2);
    const phT = P.wingsLevel ? 0 : clamp(I.ph - s.v * 0.02, -0.3, 0.3);
    I.lon = clamp(I.lon + (thT - s.pitch) * 1.2 * dt, -1, 1); I.lat = clamp(I.lat + (phT - s.roll) * 1.5 * dt, -1, 1);
    c.cy = clamp(I.lon + (thT - s.pitch) * 3 - s.q * 1.2, -1, 1);
    c.cx = clamp(I.lat + (phT - s.roll) * 3 - s.p * 0.8, -1, 1);
    let dh = P.hdg - s.hdg; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    I.ped = clamp(I.ped + (dh * 1.0 - s.r) * 0.8 * dt, -1, 1); c.pedal = clamp(I.ped + dh * 1.5 - s.r * 1.2, -1, 1);
    if (P.rpmHold) { I.c = clamp(I.c + (H.rpm - 1.0) * 1.5 * dt, 0, 1); c.coll = clamp(I.c + (H.rpm - 1.0) * 2, 0, 1); }
    else if (P.freeColl !== undefined) c.coll = P.freeColl;
    else { I.c = clamp(I.c + (P.vz - s.vz) * 0.05 * dt, 0, 1); c.coll = clamp(I.c + (P.vz - s.vz) * 0.08, 0, 1); }
    return c;
  };
  return P;
}
export function fly(H, secs, ctlFn, env = sea, each) {
  for (let t = 0; t < secs; t += DT) { const c = typeof ctlFn === 'function' ? ctlFn(H, t) : ctlFn; const e = H.step(DT, c, env); if (each) each(H, t, e); if (H.dead) return H.dead; }
  return null;
}
// trim: fly with the autopilot, then average the last `avg` seconds
export function trim(H, P, secs = 40, avg = 6, env = sea) {
  const acc = {}; let n = 0;
  const keys = { coll: () => H.c.coll, lon: () => H.c.lon, lat: () => H.c.lat, ped: () => H.c.ped, psi: () => H.torque, pitch: () => state(H).pitch, roll: () => state(H).roll, vz: () => H.vel.y, u: () => state(H).u, v: () => state(H).v, rpm: () => H.rpm, n1: () => H.n1, egt: () => H.egt, gasP: () => H.gasP, tailT: () => H.tailT, qRotor: () => H.qRotor, qTail: () => H.qTail, tx: () => H.tx, ty: () => H.ty, stall: () => H.stall, r: () => state(H).r };
  fly(H, secs, (H) => P.step(H, DT), env, (H, t) => { if (t > secs - avg) { n++; for (const k in keys) acc[k] = (acc[k] || 0) + keys[k](); } });
  for (const k in acc) acc[k] /= n;
  return acc;
}
export const U = FM.UH1H;
export const rootDeg = coll => deg(U.COLL_MIN + U.COLL_SPAN * coll);
export const tailDeg = ped => deg(U.TR_PITCH0 - U.TR_PITCH_K * ped);
// scripted autorotation landing: glide at 100% NR, flare below fa m (pitch ~ k * speed), cushion with the collective below ca m
export function autoLand(H, fa, k, ca, verbose) {
  const PL = pilot({ V: 36 }); trim(H, PL, 3, 1, land);
  const A2 = pilot({ V: 36, rpmHold: true, c0: 0.12 }); Object.assign(A2.i, { lon: PL.i.lon, lat: PL.i.lat, ped: PL.i.ped, th: PL.i.th, ph: PL.i.ph }); A2.ctl.fuel = false;
  let phase = 'glide', td = null;
  const res = fly(H, 70, (H, t) => {
    const s = state(H), agl = H.agl;
    if (phase === 'glide' && agl < fa) phase = 'flare';
    if (phase === 'flare' && agl < ca) phase = 'cushion';
    if (verbose && phase !== 'glide' && Math.abs(t % 0.5) < DT / 2) console.log(`${t.toFixed(1)} ${phase} agl ${agl.toFixed(1)} u ${s.u.toFixed(1)} vz ${s.vz.toFixed(1)} pitch ${deg(s.pitch).toFixed(0)} NR ${(H.rpm * 324).toFixed(0)} coll ${(H.c.coll * 100).toFixed(0)} T/W ${(H.thrust / (H.mass * 9.81)).toFixed(2)} li ${H.li.toFixed(3)} lc ${H.lc.toFixed(3)} mu ${H.mu.toFixed(3)} tx ${deg(H.tx).toFixed(1)} lon ${H.c.lon.toFixed(2)}`);
    if (phase === 'glide') return A2.step(H, DT);
    const c = A2.ctl; c.fuel = false;
    const thT = phase === 'cushion' ? clamp(0.02 + agl * 0.025, 0.02, 0.18) : clamp(0.05 + k * s.u, 0.05, 0.4);
    A2.i.lon = clamp(A2.i.lon + (thT - s.pitch) * 0.8 * DT, -1, 1); c.cy = clamp(A2.i.lon + (thT - s.pitch) * 2.5 - s.q * 1.5, -1, 1);
    if (phase === 'flare') c.coll = clamp(c.coll + Math.max(0, H.rpm - 1.04) * 3 * DT - (H.rpm < 0.93 ? 0.3 * DT : 0), 0, 1);
    else { const tgt = -Math.max(0.4, agl * 0.6); c.coll = clamp(c.coll + (tgt - s.vz) * 5 * DT, 0, 1); }
    c.cx = clamp(A2.i.lat + (-s.roll) * 3 - s.p * 0.8, -1, 1); c.pedal = clamp(A2.i.ped - s.r * 1.5, -1, 1);
    return c;
  }, land, (H, t, e) => { if (e && !td) td = { e, vy: H.vel.y, hs: Math.hypot(H.vel.x, H.vel.z), t }; });
  return td || { e: res };
}
