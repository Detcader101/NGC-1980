// Flight-deck crew: instanced people in coloured jerseys (USN 1980: yellow = aircraft directors, blue = plane
// handlers / tractor drivers, green = catapult & arresting gear / maintenance, red = ordnance / crash & salvage,
// purple = fuel ("grapes"), brown = plane captains, white = safety / LSO / medical). Cranial helmets in the jersey
// colour, goggles, float coats. Four InstancedMeshes for any number of people: jersey parts (tinted per person),
// head + belt (neutral), arms (2 per person, tinted) and legs (2 per person). Simple procedural animation:
// idle (breathing, weight shifts, a look round), walk (along a loop of points), signal (a yellow shirt marshalling),
// kneel (at a wheel: chocks and chains), lso (paddles / pickle held up), talk (gestures).
// Frame: the ship's (x starboard, y up, z aft). Each member: { x, z, y, yaw, jersey, mode, path, speed }.
import * as THREE from 'three';
import { Kit, rng, pbr } from './navkit.js';
import { Kit as FKit, FIG, figMat } from '../infantry/meshkit.js';   // RENDERKIT figures

export const JERSEY = { yellow: 0xe8c21c, blue: 0x2a52b8, green: 0x2f8a3a, red: 0xc0281e, purple: 0x6a2c8c, brown: 0x6b4423, white: 0xe8e8e2, cyan: 0x40d8ff };
const SKIN = [0xc89a74, 0x9b6a48, 0xe0b48e, 0x6e4a32];
const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _c2 = new THREE.Color();

// RENDERKIT figures (ngc/depth-figures): the same four instanced parts and pivots, rounded and smooth-shaded: a float
// coat over the jersey with its reflective bands, the cranial (shell, ear cups, goggles up on the front), a face, capsule
// sleeves with gloved hands, dungarees and rounded boots. ~1.6k triangles a person (classic ~0.27k), still 4 draw calls.
function geosFig() {
  const j = new FKit(), b = new FKit(), a = new FKit(), l = new FKit();
  j.rbox(0.42, 0.56, 0.25, 0.09, 0xffffff, [0, 1.2, 0], [0, 0, 0], 1);                       // float coat / jersey
  for (const y of [1.12, 1.36]) j.rslab(0.436, 0.266, 0.055, 0.095, 0xb8b8b8, [0, y, 0]);     // reflective bands
  j.sphere(0.128, 0xffffff, [0, 1.68, 0.008], 12, [1.06, 0.92, 1.12], [0, 0, 0], undefined, [0, Math.PI * 2], [0, Math.PI * 0.56]);   // cranial shell
  for (const s of [-1, 1]) j.ellip(0.03, 0.05, 0.05, 0xffffff, [s * 0.112, 1.61, 0.0], [0, 0, 0], 6);                          // ear cups (cranial colour)
  b.ellip(0.078, 0.098, 0.094, 0xc89a74, [0, 1.625, -0.006], [0, 0, 0], 10);                                                    // head / face
  b.ellip(0.062, 0.06, 0.07, 0xc89a74, [0, 1.565, -0.03], [0.3, 0, 0], 8);                                                       // jaw
  b.capsule([0, 1.635, -0.096], [0, 1.6, -0.108], 0.008, 0.012, 0xc89a74, 6, undefined, null, 2);                              // nose
  b.capsule([-0.075, 1.705, -0.08], [0.075, 1.705, -0.08], 0.018, 0.018, 0x1a1c1e, 8, undefined, [1, 0.8], 2);                 // goggles up on the cranial
  b.capsule([0, 1.48, 0], [0, 1.55, -0.01], 0.05, 0.048, 0xc89a74, 8, undefined, null, 2);                                     // neck
  b.rslab(0.4, 0.24, 0.07, 0.08, 0x2b2b26, [0, 0.92, 0]);                                                                       // belt
  b.rbox(0.38, 0.13, 0.23, 0.07, 0x33384a, [0, 0.98, 0], [0, 0, 0], 1);                                                        // trousers seat
  a.capsule([0, 0.02, 0], [0, -0.5, 0], 0.06, 0.046, 0xffffff, 7, undefined, null, 2, 1);                                       // sleeve (pivot: shoulder)
  a.ellip(0.036, 0.055, 0.045, 0x3a3a3a, [0, -0.575, -0.008], [0, 0, 0], 8);                                                    // glove
  a.capsule([0, -0.54, -0.035], [0, -0.6, -0.05], 0.012, 0.011, 0x3a3a3a, 6, undefined, null, 2);                               // thumb
  l.capsule([0, 0.04, 0], [0, -0.78, 0], 0.088, 0.062, 0x33384a, 7, undefined, null, 2, 1);                                     // dungarees (pivot: hip)
  l.rbox(0.11, 0.11, 0.27, 0.04, 0x151515, [0, -0.85, -0.045], [0, 0, 0], 1);                                                  // boot
  return { j: j.geometry(), b: b.geometry(), a: a.geometry(), l: l.geometry() };
}
function geos() {
  if (FIG) return geosFig();
  // jersey: torso (float coat), cranial helmet shell; pivot = feet at the origin, facing -z
  const j = new Kit({ wear: 0 });
  j.box(0.44, 0.58, 0.26, 0xffffff, 0, 1.2, 0);                 // float coat / jersey
  j.box(0.46, 0.06, 0.28, 0xb8b8b8, 0, 1.12, 0);                // reflective band
  j.box(0.46, 0.06, 0.28, 0xb8b8b8, 0, 1.36, 0);
  j.sphere(0.135, 0xffffff, 0, 1.69, 0.01, 1.05, 0.9, 1.1, 8, 5); // cranial shell
  const b = new Kit({ wear: 0 });
  b.box(0.17, 0.2, 0.17, 0xc89a74, 0, 1.6, 0);                 // face (tinted per person by skin via a second colour? kept neutral)
  b.box(0.2, 0.06, 0.06, 0x1a1c1e, 0, 1.64, -0.09);             // goggles
  b.box(0.06, 0.1, 0.1, 0x2a2a2a, -0.11, 1.62, 0.0); b.box(0.06, 0.1, 0.1, 0x2a2a2a, 0.11, 1.62, 0.0);   // ear defenders
  b.box(0.4, 0.08, 0.24, 0x2b2b26, 0, 0.92, 0);                 // belt
  b.box(0.38, 0.1, 0.22, 0x33384a, 0, 0.98, 0);                 // trousers seat
  const a = new Kit({ wear: 0 });                                // arm: pivot at the shoulder, hangs down -y
  a.box(0.12, 0.52, 0.13, 0xffffff, 0, -0.26, 0);
  a.box(0.11, 0.12, 0.12, 0x3a3a3a, 0, -0.58, 0);                // glove (darkened by the tint)
  const l = new Kit({ wear: 0 });                                // leg: pivot at the hip
  l.box(0.16, 0.78, 0.18, 0x33384a, 0, -0.39, 0);                // dungarees
  l.box(0.16, 0.12, 0.28, 0x151515, 0, -0.84, -0.04);            // boot
  return { j: j.geometry(), b: b.geometry(), a: a.geometry(), l: l.geometry() };
}
let G = null;

export function createCrew(members, { seed = 5 } = {}) {
  G ||= geos();
  const n = members.length, r = rng(seed);
  const mat = FIG ? figMat('fabric', { roughness: 0.8 }) : pbr(() => new THREE.MeshLambertMaterial({ vertexColors: true }), undefined, { vertexColors: true, rk: 'fabric' });   // RENDERKIT surface: jerseys, cranials
  const mk = (g, k) => { const m = new THREE.InstancedMesh(g, mat, n * k); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; return m; };
  const J = mk(G.j, 1), B = mk(G.b, 1), A = mk(G.a, 2), L = mk(G.l, 2);
  const group = new THREE.Group(); group.name = 'deckcrew'; group.add(J, B, A, L);
  for (let i = 0; i < n; i++) {
    const p = members[i];
    p.ph = r() * 100; p.look = 0; p.lookT = r() * 6; p.seg = 0; p.s = 0; p.speed ??= 1.2 + r() * 0.3; p.y ??= 0; p.yaw ??= 0;
    p.x0 = p.x; p.z0 = p.z; p.yaw0 = p.yaw;
    _c.setHex(JERSEY[p.jersey] ?? p.jersey ?? 0xffffff); J.setColorAt(i, _c); A.setColorAt(2 * i, _c); A.setColorAt(2 * i + 1, _c);
    B.setColorAt(i, _c.setRGB(1, 1, 1).lerp(_c2.setHex(SKIN[(r() * SKIN.length) | 0]), 0.3));
    L.setColorAt(2 * i, _c.setRGB(1, 1, 1)); L.setColorAt(2 * i + 1, _c);
  }
  const crew = { group, members, J, B, A, L, scatter: null };
  // write one person's matrices: root (x, y, z, yaw), body lean / drop, arm and leg swings (rad, + = forward)
  function pose(i, x, y, z, yaw, lean, drop, aL, aR, aLz, aRz, lL, lR) {
    _q.setFromEuler(_e.set(lean, yaw, 0, 'YXZ'));
    _m.compose(_v.set(x, y - drop, z), _q, _s);
    J.setMatrixAt(i, _m); B.setMatrixAt(i, _m);
    for (let k = 0; k < 2; k++) {
      const sd = k ? 1 : -1;
      _l.compose(_v.set(sd * 0.29, 1.45, 0), _q.setFromEuler(_e.set(k ? aR : aL, 0, (k ? aRz : aLz) * sd, 'XYZ')), _s); _r.multiplyMatrices(_m, _l); A.setMatrixAt(2 * i + k, _r);
      _l.compose(_v.set(sd * 0.1, 0.9, 0), _q.setFromEuler(_e.set(k ? lR : lL, 0, 0)), _s); _r.multiplyMatrices(_m, _l); L.setMatrixAt(2 * i + k, _r);
    }
  }
  // avoid(x, z) -> [dx, dz] | null: a push away from danger (rotor wash, a landing aircraft) in the ship's frame
  crew.update = (dt, t, avoid = null) => {
    for (let i = 0; i < n; i++) {
      const p = members[i]; p.ph += dt;
      let { x, z, yaw } = p, lean = 0, drop = 0, aL = 0, aR = 0, aLz = 0.06, aRz = 0.06, lL = 0, lR = 0;
      const push = p.mode !== 'seated' && p.director === undefined && avoid && !avoid.soft && avoid(x, z);   // directors are placed by deckops.js; pedestrians use the soft avoidance below
      if (push) {   // clear the area: walk briskly away, crouched against the downwash
        const len = Math.hypot(push[0], push[1]) || 1, sp = 2.4 * dt;
        p.x += push[0] / len * sp; p.z += push[1] / len * sp; x = p.x; z = p.z;
        yaw = p.yaw = Math.atan2(-push[0], -push[1]); p.fled = 4;
        const w = p.ph * 9; lean = -0.25; lL = Math.sin(w) * 0.6 - lean; lR = -Math.sin(w) * 0.6 - lean; aL = -lL * 0.5; aR = lL * 0.5;   // (QA: lean - is forward, into the wash; legs relative to it)
        pose(i, x, p.y, z, yaw, lean, 0.04, aL, aR, aLz, aRz, lL, lR); continue;
      }
      if (p.fled > 0) {   // drift back to the post once it is clear
        p.fled -= dt;
        if (p.fled <= 0 && p.mode !== 'walk') { const dx = p.x0 - p.x, dz = p.z0 - p.z, d = Math.hypot(dx, dz); if (d > 0.3) { p.fled = 0.01; const sp = Math.min(d, 1.3 * dt); p.x += dx / d * sp; p.z += dz / d * sp; p.yaw = Math.atan2(-dx, -dz); const w = p.ph * 6.5; lL = Math.sin(w) * 0.5; pose(i, p.x, p.y, p.z, p.yaw, 0, 0, -lL * 0.6, lL * 0.6, aLz, aRz, lL, -lL); continue; } else p.yaw = p.yaw0; }
      }
      switch (p.mode) {
        case 'walk': {
          const P = p.path, a = P[p.seg], b = P[(p.seg + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
          p.s += p.speed * dt; if (p.s >= L) { p.s -= L; p.seg = (p.seg + 1) % P.length; }
          const k = p.s / L; x = p.x = a[0] + dx * k; z = p.z = a[1] + dz * k; yaw = Math.atan2(-dx, -dz);
          const w = p.ph * p.speed * 5.2; lL = Math.sin(w) * 0.5; lR = -lL; aL = -lL * 0.7; aR = lL * 0.7; drop = -Math.abs(Math.cos(w)) * 0.03 + 0.03;
          break;
        }
        case 'march': {   // (DECK OPS) walking where the deck ops put him (x, z, yaw set from outside)
          const w = p.ph * 6.2; lL = Math.sin(w) * 0.5; lR = -lL; aL = -lL * 0.7; aR = lL * 0.7; drop = -Math.abs(Math.cos(w)) * 0.03 + 0.03;
          break;
        }
        case 'signal': {   // marshalling: both arms up, alternating "come ahead"
          const w = p.ph * 2.6; aL = 2.6 + Math.sin(w) * 0.5; aR = 2.6 - Math.sin(w) * 0.5; aLz = 0.3; aRz = 0.3; lean = 0.03;
          yaw += Math.sin(p.ph * 0.3) * 0.2; break;
        }
        case 'kneel': {    // at a wheel: one knee down, working with the hands
          // QA (ngc/qa-ship): was drop 0.45, legs +1.45 / -0.35 with lean +0.3 (which tips the body BACK: + about x is aft):
          // the front leg stuck out level at hip height, the back one sank 0.3 m into the deck. One-piece legs (0.9 m hip to
          // sole) in a kneel: torso forward, the front leg down to its foot, the back one down to the knee-on-deck line,
          // both ending on the deck (hip 0.9 cos 0.25 - 0.3 = 0.57 m = 0.9 cos 0.88; leg angles are relative to the lean)
          drop = 0.3; lean = -0.25; lL = 0.88 + 0.25; lR = -0.88 + 0.25; aL = 1.1 + Math.sin(p.ph * 3) * 0.2; aR = 1.2 - Math.sin(p.ph * 3.3) * 0.2; break;
        }
        case 'lso': {      // the pickle held up, eyes aft on the groove
          aR = 1.9 + Math.sin(p.ph * 0.7) * 0.08; aRz = 0.1; aL = -0.2; yaw += Math.sin(p.ph * 0.4) * 0.15; break;
        }
        case 'seated': {   // driving a tractor: p.at() gives the seat (x, y, z, yaw) in the ship frame
          const a = p.at(); x = p.x = a[0]; z = p.z = a[2]; yaw = a[3]; p.ySeat = a[1];
          drop = 0.42; lL = 1.45; lR = 1.45; aL = 0.9 + Math.sin(p.ph * 1.3) * 0.05; aR = 0.9; aLz = aRz = 0.12; break;
        }
        case 'talk': {
          aR = 0.6 + Math.max(0, Math.sin(p.ph * 1.7)) * 0.7; aRz = 0.25; aL = Math.sin(p.ph * 0.9) * 0.1; yaw += Math.sin(p.ph * 0.5) * 0.25; break;
        }
        default: {         // idle: breathing, a weight shift now and then, look around
          p.lookT -= dt; if (p.lookT <= 0) { p.lookT = 3 + (p.ph * 7.3 % 6); p.look = ((p.ph * 13.7) % 1.6) - 0.8; }
          const sh = Math.sin(p.ph * 0.37); lL = sh * 0.05; lR = -sh * 0.05;
          aL = Math.sin(p.ph * 1.1) * 0.03; aR = -aL; lean = Math.sin(p.ph * 1.6) * 0.012;
          p.yawS = (p.yawS ?? 0) + (p.look - (p.yawS ?? 0)) * Math.min(1, dt * 1.5); yaw += p.yawS;
          if (p.hands) { aL = -0.2; aR = -0.2; aLz = 0.5; aRz = 0.5; }   // hands on hips
        }
      }
      // QA (ngc/qa-ship): someone on foot (or a vehicle) close by - step aside onto a circle round him (avoid.soft = its
      // radius). Only the drawn spot moves (posts and paths stay), so he slides back as you walk on; walkers go round you.
      if (avoid && avoid.soft && p.mode !== 'seated') { const s = avoid(x, z); if (s) { const d = Math.hypot(s[0], s[1]) || 0.01, k = avoid.soft / d; x = x + s[0] * (k - 1); z = z + s[1] * (k - 1); } }
      pose(i, x, p.mode === 'seated' ? p.ySeat : p.y, z, yaw, lean, drop, aL, aR, aLz, aRz, lL, lR);
    }
    J.instanceMatrix.needsUpdate = B.instanceMatrix.needsUpdate = A.instanceMatrix.needsUpdate = L.instanceMatrix.needsUpdate = true;
  };
  crew.update(0, 0);
  return crew;
}
