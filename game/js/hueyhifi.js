// UH-1H "Huey", hi-fi exterior (ngc/look-huey): the RenderKit 'surface' build of hueymodel.js (?rk=0 keeps the classic
// low-poly model). Same local frame, same API, same part names and hooks:
//   +x right, +y up, nose along -z, origin at the CG, ground under the skids at y = -1.84.
//   buildHueyHiFi(HUEY) -> { group, shell, animate(S, dt, time, inside), parts, stats }
// Built from public reference (Bell 205 / UH-1H drawings, TM 55-1520-210-10 principal dimensions, museum photographs):
// 48 ft main rotor, 21 in chord, 8 ft 6 in tail rotor, 57 ft 1 in overall with the rotors turning, 1.88 x 1.22 m cargo
// door opening, 2.6 m skid tread. The fuselage is lofted from cross sections (superellipse halves, monotone cubic
// between stations) with analytic normals; windows, doorways and the windscreen are cut by a signed-distance field baked
// into the skin texture (alpha test), so outlines are exact curves on a smooth surface, and the frames are swept along
// the same field's zero contour. Paint, panel lines, rivets, wear, exhaust soot, oil streaks and 1980 Army markings are
// generated per texel from the 3D surface point (hueygeo.js bake); no image assets.
// LODs: near (full), mid (no interior, no cut-outs, coarse lofts), far (a few hundred triangles) with complementary
// screen-door dissolves (the same hash as world/visibility.js), switched by the camera distance seen at render time.
import * as THREE from 'three';
import { pbr, glass as rkGlass, DETAIL } from './renderkit/gamemats.js';
import { crewGeometry, crewMaterial } from './interiors/crewfig.js';
import { FIG } from './units/infantry/meshkit.js';
import {
  TAU, clamp, sstep, mix, bodySurface, gridGeo, steps, stations, contours, surfStrip, stripProfile, airfoilLoft, naca,
  rbox, smoothGeo, lathe, V3, alignY, rod, tube, merge, mirrorX, triCount, vnoise, fbm, hash2, glyphs, sdBox, sdPoly, bake, sweep,
} from './hueygeo.js';

const D2R = Math.PI / 180;
// LOD hand-over distances (m, camera to the model origin): near -> mid, mid -> far, with the dissolve bands
export const HUEY_LOD = Object.freeze({ nm: [55, 75], mf: [200, 260] });

// ------------------------------------------------------------------------------------------- reference tables
// fuselage stations [z, top, bottom, half width, widest-line y, upper exponent, lower exponent]
const FUS = [
  [-3.93, -0.48, -0.52, 0.0, -0.50, 2.2, 2.2],
  [-3.89, -0.34, -0.67, 0.34, -0.50, 2.3, 2.3],
  [-3.78, -0.22, -0.82, 0.62, -0.51, 2.5, 2.5],
  [-3.58, -0.155, -0.95, 0.84, -0.50, 2.8, 2.9],
  [-3.30, -0.13, -1.04, 1.00, -0.48, 3.2, 3.6],
  [-2.98, -0.105, -1.10, 1.11, -0.45, 3.9, 4.8],
  [-2.70, 0.085, -1.135, 1.17, -0.42, 5.0, 6.5],
  [-2.42, 0.29, -1.15, 1.20, -0.38, 6.5, 8],
  [-2.16, 0.44, -1.15, 1.21, -0.35, 8.5, 9],
  [-1.90, 0.47, -1.15, 1.21, -0.34, 9, 9],
  [2.90, 0.47, -1.15, 1.21, -0.34, 9, 9],
  [3.25, 0.475, -0.95, 1.12, -0.25, 7, 5],
  [3.70, 0.49, -0.58, 0.88, -0.05, 5, 3.2],
  [4.20, 0.51, -0.28, 0.60, 0.12, 3.6, 2.6],
  [4.80, 0.535, -0.13, 0.45, 0.21, 3.0, 2.4],
  [6.20, 0.565, 0.03, 0.33, 0.30, 2.7, 2.3],
  [7.60, 0.59, 0.17, 0.24, 0.38, 2.5, 2.3],
  [8.80, 0.61, 0.28, 0.17, 0.445, 2.4, 2.2],
  [9.02, 0.60, 0.33, 0.10, 0.46, 2.3, 2.2],
  [9.07, 0.57, 0.40, 0.0, 0.48, 2.2, 2.2],
];
// transmission fairing + engine cowling ("doghouse") on the roof
const DOG = [
  [-1.32, 0.47, 0.40, 0.0, 0.45, 2.5, 8],
  [-1.20, 0.66, 0.40, 0.42, 0.50, 2.6, 8],
  [-0.96, 0.90, 0.40, 0.60, 0.55, 2.8, 9],
  [-0.60, 1.10, 0.40, 0.69, 0.60, 3.2, 10],
  [-0.10, 1.20, 0.40, 0.73, 0.62, 3.6, 10],
  [0.80, 1.23, 0.40, 0.745, 0.62, 3.8, 10],
  [1.60, 1.22, 0.40, 0.73, 0.62, 3.8, 10],
  [2.20, 1.17, 0.40, 0.66, 0.62, 3.4, 10],
  [2.65, 1.08, 0.40, 0.54, 0.62, 3.0, 10],
  [2.95, 0.98, 0.40, 0.40, 0.62, 2.8, 10],
  [3.08, 0.93, 0.40, 0.30, 0.62, 2.6, 10],
];
// crew doors and windows (side projection [z, y]; matches hueycockpit.js so inside and outside agree)
const PD_UP = [[-2.64, -0.3], [-1.25, -0.3], [-1.25, 0.37], [-2.0, 0.37], [-2.64, -0.06]];
const PD_LO = [[-2.6, -0.92], [-2.1, -0.92], [-2.1, -0.5], [-2.6, -0.5]];
const PDOOR = [[-2.79, -1.12], [-1.13, -1.12], [-1.13, 0.445], [-1.99, 0.445], [-2.79, -0.115]];
const pillarZ = y => -2.80 + (y + 0.12) * (0.78 / 0.56);   // A-pillar line, side view
const DOORWAY = { z: 0, hz: 0.95, y: -0.36, hy: 0.72 };    // cargo door opening 1.90 x 1.44 m (sill to header)

// signed distance (m, negative inside) of the cut-outs at a surface point (x, y, z), c = cos(phi) (up-ness)
function holeSDF(z, x, y, c, door = true) {
  const ax = Math.abs(x); let d = 1;
  if (z < -1.85 && y > -0.25) {   // windscreen: above the sill, ahead of the A-pillar, either side of the centre post
    d = Math.max(-0.10 - y, (z - pillarZ(y)) * 0.6 + 0.025, 0.032 - ax, z - (-2.12 + 0.06 * ax));
  }
  if (c > 0.3) d = Math.min(d, sdBox(ax - 0.63, z + 1.74, 0.37, 0.28, 0.06));                   // greenhouse
  if (Math.abs(c) < 0.92 && z > -2.75 && z < -1.2) d = Math.min(d, sdPoly(z, y, PD_UP) + 0.0, sdPoly(z, y, PD_LO));   // crew door windows
  if (c < -0.2 && z < -2.55) d = Math.min(d, sdBox(ax - 0.585, z + 3.08, 0.385, 0.42, 0.12));    // chin bubbles
  if (door && Math.abs(c) < 0.95 && z > -1.1 && z < 1.1) d = Math.min(d, sdBox(z - DOORWAY.z, y - DOORWAY.y, DOORWAY.hz, DOORWAY.hy, 0.04));
  return d;
}
const isGlass = (z, y, c) => !(z > -1.1 && z < 1.1 && Math.abs(c) < 0.95);

// ------------------------------------------------------------------------------------------- textures
let TEX = null;   // built once, shared by every LOD and every Huey
const OD = [80, 84, 52];          // FS 34087 olive drab, lusterless (sRGB)
const SOOT = [34, 33, 30], OIL = [42, 37, 28], BARE = [148, 150, 146], STENCIL = [24, 24, 21];
const lerp3 = (o, c, t) => { o.r += (c[0] - o.r) * t; o.g += (c[1] - o.g) * t; o.b += (c[2] - o.b) * t; };
const lineMask = (d, w) => 1 - sstep(w * 0.5, w, Math.abs(d));
function buildTextures(S, D, xr) {
  if (TEX) return TEX;
  const t0 = performance.now();
  const g = {
    army: glyphs('U.S. ARMY', { font: 'bold 74px Arial, "Liberation Sans", sans-serif', W: 640, H: 96 }),
    data: glyphs(['U.S. ARMY  UH-1H', 'SERIAL NO. 72-21509', 'SERVICE WITH JP-4 / JP-5', 'OIL MIL-L-7808'], { font: 'bold 22px Arial, "Liberation Sans", sans-serif', W: 320, H: 112, align: 'left' }),
    fuel: glyphs(['FUEL', 'JP-4'], { font: 'bold 40px Arial, "Liberation Sans", sans-serif', W: 160, H: 96 }),
    nostep: glyphs('NO STEP', { font: 'bold 40px Arial, "Liberation Sans", sans-serif', W: 256, H: 56 }),
    serial: glyphs('72-21509', { font: 'bold 80px Arial, "Liberation Sans", sans-serif', W: 512, H: 100 }),
    ground: glyphs('GROUND HERE', { font: 'bold 30px Arial, "Liberation Sans", sans-serif', W: 256, H: 44 }),
    step: glyphs('STEP', { font: 'bold 40px Arial, "Liberation Sans", sans-serif', W: 128, H: 56 }),
  };
  const R = xr ? 1 : 2;   // XR: half resolution
  // ---- fuselage skin
  const P = {}; let z = 0, prm = null;
  const skin = bake(1024 * R, 512 * R, (u, v, o) => {
    const phi = v * TAU, side = phi < Math.PI ? 1 : -1, c = Math.cos(phi);
    S.at(z, phi, P); const x = P.x, y = P.y, ax = Math.abs(x);
    // noise coordinates continuous across the top and keel
    const wTop = c * c, nA = mix(fbm(z * 1.3, y * 1.3 + side * 7), fbm(z * 1.3 + 3, x * 1.3), wTop), nB = mix(vnoise(z * 9, y * 9 + side * 11), vnoise(z * 9 + 5, x * 9), wTop);
    const nC = mix(vnoise(z * 40, y * 40 + side * 3), vnoise(z * 40 + 7, x * 40), wTop);
    // base paint with per-panel tone and touch-ups
    const pid = hash2(Math.floor((z + 5) / 0.62), Math.floor((y + 2) / (Math.abs(c) > 0.75 ? 9 : 0.45)) + (c > 0.75 ? 50 : c < -0.75 ? 90 : side * 20));
    let k = 0.93 + 0.1 * nA + 0.05 * (pid - 0.5);
    o.r = OD[0] * k; o.g = OD[1] * k; o.b = OD[2] * k;
    if (pid > 0.86) { o.r *= 0.9; o.g *= 0.97; o.b *= 0.86; }                         // fresher touch-up paint
    if (c > 0.35) lerp3(o, [114, 113, 88], 0.22 * sstep(0.35, 0.9, c) * (0.5 + nA));    // sun-faded top
    if (c < -0.45) lerp3(o, [66, 60, 46], 0.4 * sstep(-0.45, -0.9, c) * (0.4 + nA));    // belly grime
    let bump = 0.5, rough = 1;
    // panel lines (bump grooves) and rivet rows
    let pl = 0;
    if (Math.abs(c) < 0.97) pl = Math.max(pl, lineMask(sdPoly(z, y, PDOOR), 0.006));
    if (c > 0.15 && z < -2.9) pl = Math.max(pl, lineMask(sdBox(x, z + 3.36, 0.46, 0.3, 0.05), 0.005));          // nose avionics door
    if (Math.abs(c) < 0.9 && z > 2.95 && z < 3.9) pl = Math.max(pl, lineMask(sdBox(z - 3.4, y + 0.2, 0.32, 0.36, 0.03), 0.005));   // aft fuselage access
    if (Math.abs(c) < 0.9 && z > 1.2 && z < 2.9) pl = Math.max(pl, lineMask(sdBox(z - 2.05, y - 0.05, 0.6, 0.26, 0.02), 0.005));   // door track fairing
    for (const zs of [-1.12, -0.97, 0.97, 2.92, 4.02, 5.25, 6.5, 7.75]) pl = Math.max(pl, lineMask(z - zs, 0.005));
    if (z > 4.02) pl = Math.max(pl, lineMask(y - (prm[3] + 0.02), 0.005));                       // boom lap joint
    if (c < -0.7 && z > -2.5 && z < 3.0) pl = Math.max(pl, lineMask(ax - 0.62, 0.005));            // belly panels
    const along = Math.abs(c) > 0.7 ? x : y;
    let rv = 0;
    for (const zs of [-1.12, -0.97, 0.97, 2.92, 4.02, 5.25, 6.5, 7.75, -0.4, 0.4, 1.6, 2.3]) {
      const dz = Math.abs(z - zs - 0.014); if (dz < 0.006) { const f = Math.abs(((along / 0.045) % 1 + 1) % 1 - 0.5); if (f < 0.14) rv = Math.max(rv, 1 - dz / 0.006); }
    }
    if (Math.abs(c) < 0.85) for (const ys of [0.1, -0.62]) { const dy = Math.abs(y - ys); if (dy < 0.006 && z > -2.0 && z < 2.9) { const f = Math.abs(((z / 0.045) % 1 + 1) % 1 - 0.5); if (f < 0.14) rv = Math.max(rv, 1 - dy / 0.006); } }
    o.r *= 1 - 0.38 * pl; o.g *= 1 - 0.38 * pl; o.b *= 1 - 0.38 * pl; bump -= 0.3 * pl; bump += 0.22 * rv; o.r += 6 * rv; o.g += 6 * rv; o.b += 5 * rv;
    // oil and hydraulic streaks running down from the transmission deck and the aft fuselage
    let oil = 0;
    if (Math.abs(c) < 0.93 && y < 0.42) {
      const src = z > -1.0 && z < 4.2 ? 0.42 : -9;
      if (src > -9) {
        const fall = (src - y), str = sstep(0.6, 0.9, vnoise(z * 22 + side * 13, 0.3 + fall * 0.6)) * Math.exp(-fall / (z > 2.9 ? 0.9 : 0.45));
        oil = str * (z > 2.9 ? 0.75 : 0.45);
      }
    }
    if (c < -0.5 && z > 2.6 && z < 5) oil = Math.max(oil, 0.5 * sstep(0.45, 0.8, nB));   // under the engine
    lerp3(o, OIL, oil); rough -= 0.35 * oil;
    // exhaust soot along the top of the aft fuselage and the boom
    if (z > 3.0 && c > -0.1) {
      const s = Math.exp(-(z - 3.15) / 1.9) * sstep(-0.1, 0.75, c) * (0.55 + 0.45 * nA) * (z < 3.15 ? sstep(3.0, 3.15, z) : 1);
      lerp3(o, SOOT, clamp(s * 0.85, 0, 0.82)); rough += 0.1 * s;
    }
    // worn paint: door sills and edges, the step, the nose, the roof walk
    let wear = 0;
    const dDoor = sdBox(z - DOORWAY.z, y - DOORWAY.y, DOORWAY.hz, DOORWAY.hy, 0.04);
    if (Math.abs(c) < 0.95) wear = Math.max(wear, (1 - sstep(0.0, 0.07, dDoor)) * (y < -0.95 ? 1 : 0.45));
    if (Math.abs(c) < 0.97) wear = Math.max(wear, (1 - sstep(0.0, 0.03, Math.abs(sdPoly(z, y, PDOOR)))) * 0.5);
    if (z < -3.55) wear = Math.max(wear, 0.55 * sstep(-3.55, -3.9, z));
    if (c > 0.85 && z > -1.0 && z < 2.9) wear = Math.max(wear, 0.35);
    if (wear > 0 && nC * 0.6 + nB * 0.4 > 1 - wear * 0.55) { lerp3(o, BARE, 0.85); rough = 0.55; bump -= 0.04; }
    // markings: U.S. ARMY on the boom, data block (left nose), fuel filler (right, aft of the cargo door), GROUND HERE
    if (z > 4.2 && z < 5.7 && Math.abs(c) < 0.6) {
      const tx = side > 0 ? (5.62 - z) / 1.26 : (z - 4.36) / 1.26, ty = (0.355 - y) / 0.21;
      const m = g.army(tx, ty); if (m > 0) lerp3(o, STENCIL, m * 0.92);
    }
    if (side < 0 && z > -3.25 && z < -2.85 && y > -0.6 && y < -0.42) { const m = g.data((z + 3.25) / 0.4, (-0.42 - y) / 0.18); if (m > 0) lerp3(o, STENCIL, m * 0.9); }
    if (side > 0 && z > 2.2 && z < 2.85 && Math.abs(c) < 0.8) {
      const dc = Math.hypot(z - 2.62, y + 0.2);
      if (dc < 0.075) { const ring = lineMask(dc - 0.065, 0.008); lerp3(o, [52, 54, 40], 0.6); lerp3(o, STENCIL, ring); bump = 0.62 - 0.3 * ring; if (dc < 0.012) lerp3(o, [90, 92, 86], 0.8); }
      const m = g.fuel((2.85 - z) / 0.22 - 0.0, (-0.05 - y) / 0.13 + 0.0); if (z > 2.63 && m > 0) lerp3(o, STENCIL, m * 0.9);
    }
    if (side < 0 && z > -0.9 && z < -0.55 && y < -0.86 && y > -0.94) { const m = g.ground((z + 0.9) / 0.35, (-0.86 - y) / 0.08); if (m > 0) lerp3(o, STENCIL, m * 0.85); }
    // cut-outs: alpha = signed distance ramp; under the glass a dark tinted pane (mid LOD draws no cut-outs)
    const hd = holeSDF(z, x, y, c);
    o.a = clamp(0.5 + hd / 0.03, 0, 1);
    if (hd < 0.02) {
      const gl = isGlass(z, y, c), t = sstep(0.02, -0.01, hd);
      if (gl) { lerp3(o, z > -2.05 && c > 0.3 ? [26, 54, 36] : [34, 46, 46], t); rough = mix(rough, 0.12, t); }
      else { lerp3(o, [26, 28, 24], t); }
    }
    o.bump = bump; o.rough = clamp(rough, 0.3, 1.2) / 1.2;
  }, u => { z = S.z0 + u * (S.z1 - S.z0); prm = S.params(z); });
  // ---- doghouse (transmission and engine cowling)
  const dog = bake(512 * R, 256 * R, (u, v, o) => {
    const phi = v * TAU, side = phi < Math.PI ? 1 : -1, c = Math.cos(phi);
    D.at(z, phi, P); const x = P.x, y = P.y;
    const nA = mix(fbm(z * 1.3, y * 1.3 + side * 7), fbm(z * 1.3 + 3, x * 1.3), c * c), nB = vnoise(z * 30 + side * 5, (c > 0.6 ? x : y) * 30);
    const k = 0.93 + 0.1 * nA; o.r = OD[0] * k * 0.97; o.g = OD[1] * k * 0.98; o.b = OD[2] * k;
    if (c > 0.35) lerp3(o, [114, 113, 88], 0.25 * sstep(0.35, 0.9, c) * (0.5 + nA));
    let bump = 0.5, rough = 1, pl = 0;
    // cowl seams and access doors
    pl = Math.max(pl, lineMask(y - 0.98, 0.005) * (Math.abs(c) < 0.9 ? 1 : 0));
    for (const zs of [-0.95, 0.15, 1.15, 2.3]) pl = Math.max(pl, lineMask(z - zs, 0.005));
    if (Math.abs(c) < 0.9) { pl = Math.max(pl, lineMask(sdBox(z - 1.75, y - 0.72, 0.42, 0.16, 0.03), 0.005)); }
    if (c > 0.6) pl = Math.max(pl, lineMask(Math.abs(x) - 0.3, 0.005) * (z > 0.2 && z < 2.6 ? 1 : 0));
    o.r *= 1 - 0.38 * pl; o.g *= 1 - 0.38 * pl; o.b *= 1 - 0.38 * pl; bump -= 0.3 * pl;
    // engine air intake screens (both sides, aft of the transmission)
    const sd = Math.abs(c) < 0.9 ? sdBox(z - 0.62, y - 0.73, 0.38, 0.17, 0.03) : 1;
    if (sd < 0) {
      const gx = Math.abs(((z / 0.011) % 1 + 1) % 1 - 0.5), gy = Math.abs(((y / 0.011) % 1 + 1) % 1 - 0.5), wire = Math.max(1 - sstep(0.12, 0.25, gx), 1 - sstep(0.12, 0.25, gy));
      o.r = mix(18, 70, wire); o.g = mix(19, 72, wire); o.b = mix(16, 62, wire); bump = 0.3 + 0.25 * wire; rough = 0.9;
    } else if (sd < 0.02) { lerp3(o, [40, 42, 30], 0.6); bump = 0.62; }
    // oil cooler / heat: soot and oil at the aft end, oil around the transmission
    if (z > 2.2) lerp3(o, SOOT, clamp(sstep(2.2, 3.08, z) * (0.5 + 0.5 * nA) * 0.85, 0, 0.85));
    if (z < -0.5 && Math.abs(c) < 0.8) { const s = sstep(0.62, 0.9, vnoise(z * 20 + side * 7, y * 3)) * 0.5; lerp3(o, OIL, s); rough -= 0.3 * s; }
    if (c > 0.7 && z > 0.3 && z < 2.4 && nB > 0.72) { lerp3(o, BARE, 0.7); rough = 0.6; }   // roof walk chips
    if (z > 0.35 && z < 0.95 && c > 0.55) { const m = g.nostep((side > 0 ? (0.95 - z) : (z - 0.35)) / 0.6, (0.42 - Math.abs(x)) / 0.12 * (side > 0 ? 1 : 1)); if (m > 0) lerp3(o, STENCIL, m * 0.85); }
    o.bump = bump; o.rough = clamp(rough, 0.3, 1.2) / 1.2;
  }, u => { z = D.z0 + u * (D.z1 - D.z0); });
  // ---- vertical fin (two sides: u < 0.5 right, u >= 0.5 left; u maps to z 7.35..9.35, v to y 0.35..2.55)
  const fin = bake(256 * R, 256 * R, (u, v, o) => {
    const side = u < 0.5 ? 1 : -1, zz = 7.35 + (u % 0.5) * 2 * 2.0, y = 0.35 + v * 2.2;
    const nA = fbm(zz * 1.3, y * 1.3 + side * 7), k = 0.93 + 0.1 * nA; o.r = OD[0] * k; o.g = OD[1] * k; o.b = OD[2] * k;
    let pl = 0; for (const ys of [0.95, 1.55]) pl = Math.max(pl, lineMask(y - ys, 0.005));
    o.r *= 1 - 0.35 * pl; o.g *= 1 - 0.35 * pl; o.b *= 1 - 0.35 * pl; o.bump = 0.5 - 0.3 * pl;
    lerp3(o, SOOT, clamp(0.25 * (1 - sstep(0.4, 1.2, y)) * (0.5 + nA), 0, 0.4));
    const m = g.serial(side > 0 ? (8.95 - zz) / 0.82 : (zz - 8.13) / 0.82, (1.62 - y) / 0.2); if (m > 0) lerp3(o, STENCIL, m * 0.92);
    o.rough = 1 / 1.2;
  });
  // ---- sliding cargo door (u: door z -0.97..0.97, v: y 0.39 .. -1.11)
  const door = bake(256 * R, 256 * R, (u, v, o) => {
    const zz = -0.97 + u * 1.94, y = 0.39 - v * 1.5;
    const nA = fbm(zz * 1.3 + 40, y * 1.3), k = 0.93 + 0.1 * nA; o.r = OD[0] * k; o.g = OD[1] * k; o.b = OD[2] * k;
    let pl = lineMask(sdBox(zz, y + 0.36, 0.9, 0.68, 0.05), 0.005), wear = 0;
    pl = Math.max(pl, lineMask(y + 0.48, 0.005));
    o.r *= 1 - 0.35 * pl; o.g *= 1 - 0.35 * pl; o.b *= 1 - 0.35 * pl; let bump = 0.5 - 0.3 * pl, rough = 1;
    const hdl = sdBox(zz + 0.72, y + 0.42, 0.07, 0.035, 0.02); if (hdl < 0) { lerp3(o, [30, 31, 27], 0.8); bump = 0.3; wear = 0.6; }
    wear = Math.max(wear, 1 - sstep(0.0, 0.05, -sdBox(zz, y + 0.36, 0.97, 0.75, 0)));
    if (wear > 0 && vnoise(zz * 40, y * 40) > 1 - wear * 0.5) { lerp3(o, BARE, 0.8); rough = 0.55; }
    const oil = sstep(0.62, 0.9, vnoise(zz * 22, 2 + (0.39 - y) * 0.5)) * Math.exp(-(0.39 - y) / 0.5) * 0.35; lerp3(o, OIL, oil);
    const hd = Math.min(sdBox(zz + 0.47, y, 0.35, 0.22, 0.05), sdBox(zz - 0.47, y, 0.35, 0.22, 0.05));
    o.a = clamp(0.5 + hd / 0.03, 0, 1); if (hd < 0.02) { lerp3(o, [34, 46, 46], sstep(0.02, -0.01, hd)); rough = 0.15; }
    o.bump = bump; o.rough = rough / 1.2;
  });
  // glass masks: the inverse of the cut-outs where glass belongs (u over the nose z -3.95 .. -1.15)
  const glassMask = bake(512 * R, 256 * R, (u, v, o) => {
    const zz = -3.95 + u * 2.8, phi = v * TAU, c = Math.cos(phi); S.at(zz, phi, P);
    const hd = holeSDF(zz, P.x, P.y, c, false); o.r = o.g = o.b = 255; o.a = 1; o.bump = 0.5;
    o.rough = clamp(0.5 - hd / 0.03, 0, 1);   // alphaMap reads .g of aux
  });
  TEX = { skin, dog, fin, door, glassMask, ms: performance.now() - t0 };
  return TEX;
}

// ------------------------------------------------------------------------------------------- materials + LOD
function lodify(m, U) {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = function (sh, r) {
    prev.call(this, sh, r); sh.uniforms.hyLod = U;
    sh.fragmentShader = 'uniform vec2 hyLod;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      { float hySD = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(.06711056, .00583715)))); if (hySD < hyLod.x || hySD >= hyLod.y) discard; }`);
  };
  m.customProgramCacheKey = () => key() + '|hylod';
  return m;
}

// ------------------------------------------------------------------------------------------- the model
export function buildHueyHiFi(HUEY, { xr = false } = {}) {
  const g = new THREE.Group(); g.name = 'huey';
  const S = bodySurface(FUS), Dg = bodySurface(DOG);
  const T = buildTextures(S, Dg, xr);
  const U = { n: { value: new THREE.Vector2(0, 2) }, m: { value: new THREE.Vector2(2, 2) }, f: { value: new THREE.Vector2(2, 2) }, mf: { value: new THREE.Vector2(2, 2) }, nm: { value: new THREE.Vector2(0, 2) } };
  const reg = { n: [], m: [], f: [], mf: [], nm: [] };
  const stats = { texMs: T.ms };
  const army = { ...DETAIL.army, dust: 0.08, streak: 0.08 };
  // material factory: pbr role materials (gamemats) + the LOD dissolve; one instance per (key, lod)
  const mcache = new Map();
  const PM = (key, lod, make) => { const k = key + '@' + lod; if (!mcache.has(k)) mcache.set(k, lodify(make(), U[lod])); return mcache.get(k); };
  const role = (color, r, o = {}, detail = null) => () => pbr(() => null, color, { ...o, rk: { role: r, detail } }, r);
  const mats = lod => ({
    skin: PM('skin', lod, role(0xffffff, 'flat', { map: T.skin.map, bumpMap: T.skin.aux, bumpScale: 1.2, roughnessMap: T.skin.aux, ...(lod === 'n' ? { alphaTest: 0.5 } : {}) }, army)),
    dog: PM('dog', lod, role(0xffffff, 'flat', { map: T.dog.map, bumpMap: T.dog.aux, bumpScale: 1.2, roughnessMap: T.dog.aux }, army)),
    fin: PM('fin', lod, role(0xffffff, 'flat', { map: T.fin.map, bumpMap: T.fin.aux, bumpScale: 1.0, roughnessMap: T.fin.aux }, army)),
    od: PM('od', lod, role(0x4d5230, 'flat', {}, army)),
    od2: PM('od2', lod, role(0x464b2b, 'flat', {}, army)),
    dark: PM('dark', lod, role(0x25271f, 'dark')),
    black: PM('black', lod, role(0x141512, 'dark')),
    rubber: PM('rubber', lod, role(0x1a1a18, 'rubber')),
    metal: PM('metal', lod, role(0x6c7072, 'metal')),
    steel: PM('steel', lod, role(0x3c3f41, 'grimy')),
    alum: PM('alum', lod, role(0x9a9c98, 'grimy')),
    blade: PM('blade', lod, role(0x2c2e2b, 'paint', {}, { ...DETAIL.air, panel: 0, dust: 0.05, wear: 0.05, streak: 0 })),
    tip: PM('tip', lod, role(0xd8b21c, 'paint')),
    red: PM('red', lod, role(0xa81c14, 'paint')), white: PM('white', lod, role(0xe2e2dc, 'paint')),
  });
  const N = mats('n'), Mm = mats('m'), Fm = mats('f'), MF = mats('mf'), NM = mats('nm');
  const glassN = PM('glass', 'n', () => rkGlass(() => null, { color: 0x8fb5a2, opacity: 0.3, alphaMap: T.glassMask.aux, alphaTest: 0.5, side: THREE.DoubleSide }));
  const roofGlassN = PM('roofglass', 'n', () => rkGlass(() => null, { color: 0x2f7a46, opacity: 0.62, alphaMap: T.glassMask.aux, alphaTest: 0.5, side: THREE.DoubleSide }));
  const doorSkinN = PM('door', 'n', role(0xffffff, 'flat', { map: T.door.map, bumpMap: T.door.aux, bumpScale: 1.2, roughnessMap: T.door.aux, alphaTest: 0.5, side: THREE.DoubleSide }, army));
  const doorSkinM = PM('door', 'm', role(0xffffff, 'flat', { map: T.door.map, roughnessMap: T.door.aux }, army));
  const doorGlassN = PM('doorglass', 'n', () => rkGlass(() => null, { color: 0x8fb5a2, opacity: 0.32 }));
  const liningN = PM('lining', 'n', role(0x50563f, 'flat', { side: THREE.BackSide }, { ...DETAIL.army, dust: 0.15, wear: 0, streak: 0 }));
  const floorN = PM('floor', 'n', role(0x3a3d33, 'rubber', {}, { ...DETAIL.army, dust: 0.3, wear: 0 }));
  const canvasN = PM('canvas', 'n', role(0x5c5f45, 'fabric', { side: THREE.DoubleSide }));
  const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });

  const shellG = new THREE.Group(); shellG.name = 'shell';
  const lod0 = new THREE.Group(); lod0.name = 'lodNear'; g.add(lod0); lod0.add(shellG);
  const lod1 = new THREE.Group(); lod1.name = 'lodMid'; g.add(lod1);
  const lod2 = new THREE.Group(); lod2.name = 'lodFar'; g.add(lod2);
  reg.n.push(lod0); reg.m.push(lod1); reg.f.push(lod2);
  const inLod = p => { for (let q = p; q; q = q.parent) if (q === lod0 || q === lod1 || q === lod2) return true; return false; };
  const mesh = (geo, mat, parent, name, lod = 'n') => {
    const o = new THREE.Mesh(geo, mat); if (name) o.name = name; parent.add(o); o.userData.hyLod = lod;
    if (!inLod(parent)) reg[lod].push(o);   // inside a LOD group the group switches it
    return o;
  };
  const group = (parent, name, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
  // static parts collect per (material, lod) and become one mesh each
  const buckets = new Map();
  const put = (geo, mat, parent = lod0, lod = 'n') => { const k = mat.uuid + parent.uuid; if (!buckets.has(k)) buckets.set(k, { mat, parent, lod, geos: [] }); buckets.get(k).geos.push(geo); return geo; };
  const flush = () => { for (const { mat, parent, lod, geos } of buckets.values()) mesh(merge(geos.map(q => q.index ? q : q)), mat, parent, parent === shellG ? 'cockpitExterior' : 'airframe', lod); buckets.clear(); };

  // ======================================================================== fuselage skin (near / mid / far)
  const PH = n => steps(0, TAU, n);
  const zNear = stations([[-3.93, -3.6, 0.02], [-3.6, -1.9, 0.04], [-1.9, 2.9, 0.16], [2.9, 4.6, 0.06], [4.6, 9.07, 0.12]], [-1.05, -0.97, -0.95, 0.95, 0.97, 9.0, 9.04]);
  const phN = PH(96);
  const zN0 = zNear.filter(z => z <= -1.05), zN1 = zNear.filter(z => z >= -1.05);
  mesh(gridGeo(S, zN0, phN), N.skin, shellG, 'noseSkin');
  mesh(gridGeo(S, zN1, phN), N.skin, lod0, 'fuselage');
  const zMid = stations([[-3.93, -3.6, 0.06], [-3.6, -1.9, 0.14], [-1.9, 2.9, 1.2], [2.9, 4.6, 0.25], [4.6, 9.07, 0.6]]);
  mesh(gridGeo(S, zMid, PH(40)), Mm.skin, lod1, 'fuselageMid', 'm');
  const zFar = stations([[-3.93, -3.6, 0.16], [-3.6, -1.9, 0.42], [-1.9, 2.9, 4.8], [2.9, 4.6, 0.6], [4.6, 9.07, 2.2]]);
  mesh(gridGeo(S, zFar, PH(16)), Fm.skin, lod2, 'fuselageFar', 'f');
  // glass (near): the same surface 6 mm inside, masked to the window shapes; green greenhouse over the pilots
  {
    const zg = stations([[-3.6, -1.2, 0.03]]), ph = PH(160), gg = gridGeo(S, zg, ph, { off: -0.006, uv: (z, p) => [(z + 3.95) / 2.8, p / TAU] });
    // groups: quads on the roof behind the windscreen bow -> green
    const idx = gg.index.array, pos = gg.attributes.position.array, clear = [], green = [];
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3; (pos[a + 2] > -2.08 && pos[a + 1] > 0.3 ? green : clear).push(idx[t], idx[t + 1], idx[t + 2]); }
    gg.setIndex([...clear, ...green]); gg.clearGroups(); gg.addGroup(0, clear.length, 0); gg.addGroup(clear.length, green.length, 1);
    const gm = mesh(gg, [glassN, roofGlassN], shellG, 'canopyGlass'); gm.renderOrder = 3;
  }
  // frames around every cut-out (swept along the zero contour of the same field), thick round-edged seals
  {
    const f = (z, ph) => { const P = S.at(z, ph, {}); return holeSDF(z, P.x, P.y, Math.cos(ph)); };
    const lines = contours(f, -3.75, 1.15, 0, TAU, 245, 720);
    const prof = stripProfile(0.05, 0.016, 0.03, 6), profDoor = stripProfile(0.07, 0.02, 0.06, 6);
    for (const L of lines) {
      const zc = L.pts.reduce((s, p) => s + p[0], 0) / L.pts.length, isDoorway = zc > -1.1;
      const geo = surfStrip(S, L, isDoorway ? profDoor : prof, 0.025);
      put(geo, isDoorway ? N.od2 : N.dark, isDoorway ? lod0 : shellG);
    }
  }
  // interior lining of the cabin (back faces, holes at the doorways), rear wall, floor
  {
    const pT = S.yToPhi(0, DOORWAY.y + DOORWAY.hy), pB = S.yToPhi(0, DOORWAY.y - DOORWAY.hy);
    const ph = steps(0, TAU, 80, [pT, pB, TAU - pT, TAU - pB]), zl = steps(-1.05, 2.3, 24, [-0.95, 0.95]);
    const inDoor = (z, p) => z > -0.95 && z < 0.95 && ((p > pT && p < pB) || (p > TAU - pB && p < TAU - pT));
    const geo = gridGeo(S, zl, ph, { off: -0.04, keep: (i, j) => !inDoor((zl[i] + zl[i + 1]) / 2, (ph[j] + ph[j + 1]) / 2) });
    mesh(geo, liningN, lod0, 'cabinLining');
    const rw = []; for (let k = 0; k <= 64; k++) { const P = S.at(2.3, TAU * k / 64, {}); rw.push(new THREE.Vector2(P.x * 0.965, P.y * 0.98 - 0.006)); }
    put(new THREE.ShapeGeometry(new THREE.Shape(rw), 1).translate(0, 0, 2.3), PM('wall', 'n', role(0x50563f, 'flat', { side: THREE.DoubleSide }, { ...DETAIL.army, dust: 0.12, wear: 0, streak: 0 })));
    put(rbox(2.34, 0.05, 3.3, 0.01).translate(0, -1.075, 0.675), floorN);
    // floor tie-down rings, a grid of 5 x 4
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) put(new THREE.TorusGeometry(0.022, 0.005, 5, 10).rotateX(Math.PI / 2).translate(-0.75 + i * 0.5, -1.045, -0.6 + k * 0.7), N.metal);
    // the troop bench across the rear wall: tube frame, sagging canvas seat and back
    const benchSeat = (x0, x1, y, z0, z1, sag, rows = 6, cols = 14) => {
      const pos = [], idx = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const u = i / cols, v = j / rows, s = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * sag; pos.push(mix(x0, x1, u), y - s, mix(z0, z1, v)); }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setIndex(idx); q.computeVertexNormals(); return q;
    };
    put(benchSeat(-1.05, 1.05, -0.6, 1.82, 2.22, 0.035), canvasN);
    const back = benchSeat(-1.05, 1.05, 0, 0, 1, 0.025); back.rotateX(-Math.PI / 2).translate(0, -0.55, 2.26); put(back, canvasN);
    for (const z of [1.8]) put(rod([-1.07, -0.6, z], [1.07, -0.6, z], 0.016, 8), N.alum);
    put(rod([-1.07, -0.6, 2.24], [1.07, -0.6, 2.24], 0.016, 8), N.alum); put(rod([-1.07, 0.05, 2.27], [1.07, 0.05, 2.27], 0.016, 8), N.alum);
    for (const x of [-1.0, -0.35, 0.35, 1.0]) put(rod([x, -1.05, 1.82], [x, -0.6, 1.82], 0.014, 8), N.alum);
    // seat belts hanging off the bench
    for (const x of [-0.8, -0.27, 0.27, 0.8]) put(tube([[x, -0.6, 2.22], [x + 0.03, -0.68, 2.12], [x + 0.02, -0.9, 2.05]], 0.012, 8, 4), PM('belt', 'n', role(0x6a684c, 'fabric')));
    // transmission well / soundproofing quilt pattern panels on the rear wall: a few rounded pads
    for (const x of [-0.55, 0, 0.55]) put(rbox(0.5, 0.5, 0.05, 0.02).translate(x, 0.0, 2.28), PM('quilt', 'n', role(0x5d6248, 'fabric')));
    // fire extinguisher, first aid kit on the bulkhead posts
    put(lathe([[0, 0], [0.05, 0], [0.055, 0.02], [0.055, 0.3], [0.04, 0.34], [0.015, 0.36], [0, 0.37]], 14).translate(1.05, -0.95, -0.92), PM('redp', 'n', role(0xa4261a, 'paint')));
    put(rbox(0.22, 0.14, 0.08, 0.015).translate(-1.06, -0.1, -0.95), N.od2);
  }

  // ======================================================================== doghouse, cowling, exhaust, boom cover
  {
    const zd = stations([[-1.32, -0.9, 0.03], [-0.9, 2.2, 0.12], [2.2, 3.08, 0.05]]);
    const dg = gridGeo(Dg, zd, PH(64)); mesh(dg, N.dog, lod0, 'doghouse');
    mesh(gridGeo(Dg, stations([[-1.32, -0.9, 0.12], [-0.9, 2.2, 0.8], [2.2, 3.08, 0.3]]), PH(24)), Mm.dog, lod1, 'doghouseMid', 'm');
    mesh(gridGeo(Dg, stations([[-1.32, 3.08, 0.8]]), PH(10)), Fm.od, lod2, 'doghouseFar', 'f');
    // aft cap of the cowling (the exhaust collector face) and the oil cooler fairing behind it
    const cap = []; for (let k = 0; k <= 32; k++) { const P = Dg.at(3.079, TAU * k / 32, {}); cap.push(new THREE.Vector2(P.x, P.y)); }
    put(new THREE.ShapeGeometry(new THREE.Shape(cap), 1).translate(0, 0, 3.079), N.dark);
    // the intake screens get a recessed frame, the cowl doors hinges and latches
    for (const s of [-1, 1]) {
      const pts = [], nrm = []; const add = (z, y) => { const ph = Dg.yToPhi(z, y, s), P = Dg.at(z, ph, {}), n = Dg.normal(z, ph, {}); pts.push(V3(P.x, P.y, P.z)); nrm.push(V3(n.x, n.y, n.z)); };
      for (let k = 0; k <= 40; k++) { const t = k / 40 * 4; const e = Math.floor(t), f = t - e, C = [[0.24, 0.56], [1.0, 0.56], [1.0, 0.9], [0.24, 0.9], [0.24, 0.56]]; add(mix(C[e][0], C[Math.min(4, e + 1)][0], f), mix(C[e][1], C[Math.min(4, e + 1)][1], f)); }
      put(sweep(pts, nrm, stripProfile(0.03, 0.012, 0.01, 4), false), N.dark);
      for (const z of [-0.8, 0.0, 1.3, 2.1]) { const ph = Dg.yToPhi(z, 0.97, s), P = Dg.at(z, ph, {}); put(rbox(0.06, 0.025, 0.02, 0.006).translate(P.x + s * 0.004, P.y, P.z), N.black); }
    }
    // tailpipe: a short bent stack pointing up and aft, heat-blued, open
    const exG = group(lod0, 'exhaust', 0, 0.74, 3.02); exG.rotation.x = -0.24;
    const pipe = lathe([[0.2, 0], [0.205, 0.05], [0.215, 0.3], [0.225, 0.42], [0.235, 0.46], [0.218, 0.46], [0.205, 0.3], [0.19, 0.06], [0.185, 0.0]], 24).rotateX(Math.PI / 2);
    mesh(pipe, PM('pipe', 'n', role(0x3d3833, 'grimy', { side: THREE.DoubleSide })), exG, 'tailpipe');
    const heatM = B(0x000000), heat = mesh(new THREE.CircleGeometry(0.19, 20), heatM, exG, 'exhaustGlow'); heat.position.z = 0.12;
    const exM = group(lod1, 'exhaustMid', 0, 0.74, 3.02); exM.rotation.x = -0.24; mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.46, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.23), PM('pipe', 'm', role(0x3d3833, 'grimy', { side: THREE.DoubleSide })), exM, 'tailpipeMid', 'm');
    // drive shaft cover along the top of the boom, in hinged sections
    const cov = []; for (const z of steps(3.15, 7.55, 22)) { const t = S.params(z)[0]; cov.push([z, t + 0.105, t - 0.04, 0.105, t + 0.0, 2.6, 10]); }
    cov.unshift([3.05, S.params(3.05)[0] + 0.02, S.params(3.05)[0] - 0.04, 0.0, S.params(3.05)[0], 2.4, 10]);
    cov.push([7.62, S.params(7.62)[0] + 0.02, S.params(7.62)[0] - 0.04, 0.0, S.params(7.62)[0], 2.4, 10]);
    const C = bodySurface(cov);
    mesh(gridGeo(C, stations([[3.05, 3.2, 0.03], [3.2, 7.5, 0.25], [7.5, 7.62, 0.03]]), steps(0, TAU, 40)), N.od2, lod0, 'shaftCover');
    mesh(gridGeo(C, stations([[3.05, 7.62, 1.1]]), steps(0, TAU, 10)), Mm.od2, lod1, 'shaftCoverMid', 'm');
    for (const z of [4.1, 5.2, 6.35, 7.4]) { const t = S.params(z)[0]; put(lathe([[0.112, 0], [0.116, 0.004], [0.116, 0.022], [0.112, 0.026]], 16).rotateX(Math.PI / 2).scale(1, 1.0, 1).translate(0, t + 0.0, z), N.dark); }
    // oil cooler grille on the aft fuselage behind the cowling
    put(rbox(0.5, 0.03, 0.34, 0.01).translate(0, 0.485, 3.42), N.dark);
    for (let i = 0; i < 9; i++) put(rbox(0.46, 0.012, 0.012, 0.004).translate(0, 0.505, 3.28 + i * 0.035), N.black);
  }

  // ======================================================================== tail: fin, gearboxes, tail skid, elevator
  // vertical fin: an airfoil loft, two textured sides (serial number both sides)
  const FINS = [[0.42, 7.40, 1.62, 0.15], [0.7, 7.62, 1.40, 0.14], [1.4, 8.08, 0.99, 0.12], [2.05, 8.45, 0.65, 0.11], [2.3, 8.6, 0.48, 0.10], [2.38, 8.67, 0.36, 0.08]];
  const finSide = (sgn, nc, lod) => {
    const pos = [], uv = [], idx = [], ys = []; for (let k = 0; k < FINS.length - 1; k++) for (let j = 0; j < 4; j++) ys.push(k + j / 4); ys.push(FINS.length - 1);
    const cs = steps(0, 1, nc).map(t => 0.5 * (1 - Math.cos(Math.PI * t)));
    const at = q => { const k = Math.min(FINS.length - 2, Math.floor(q)), f = q - k, A = FINS[k], Bf = FINS[k + 1]; return A.map((v, i) => mix(v, Bf[i], f)); };
    for (const q of ys) { const [y, le, ch, t] = at(q); for (const x of cs) { const z = le + x * ch, w = sgn * naca(x, t) * ch; pos.push(w, y, z); uv.push((sgn > 0 ? 0 : 0.5) + (z - 7.35) / 2.0 * 0.5, (y - 0.35) / 2.2); } }
    const W = cs.length; for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < W - 1; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; if (sgn > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
    const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); q.setIndex(idx); q.computeVertexNormals(); return q;
  };
  mesh(merge([finSide(1, 28), finSide(-1, 28)]), N.fin, lod0, 'fin');
  mesh(merge([finSide(1, 7), finSide(-1, 7)]), Mm.fin, lod1, 'finMid', 'm');
  mesh(merge([finSide(1, 3), finSide(-1, 3)]), Fm.od, lod2, 'finFar', 'f');
  put(airfoilLoft([{ s: 2.36, le: 8.66, chord: 0.38, t: 0.09 }, { s: 2.42, le: 8.70, chord: 0.3, t: 0.07 }], { span: 'y', chord: 'z', thick: 'x', n: 20, capA: false, capB: true }), N.od);   // tip cap
  // tail rotor drive shaft cover up the fin's leading edge, 42 and 90 degree gearboxes
  put(tube([[0, 0.66, 7.56], [0, 1.0, 7.79], [0, 1.6, 8.15], [0, 2.03, 8.47]], 0.062, 24, 14), N.od2);
  put(lathe([[0, -0.2], [0.1, -0.18], [0.16, -0.08], [0.17, 0.08], [0.13, 0.2], [0.07, 0.26], [0, 0.27]], 18).scale(1, 1, 0.9).rotateX(Math.PI / 2 - 0.5).translate(0, 0.7, 7.5), N.od2);   // 42 deg gearbox fairing
  put(lathe([[0, 0], [0.13, 0], [0.155, 0.04], [0.16, 0.14], [0.14, 0.24], [0.1, 0.3], [0.05, 0.32], [0, 0.32]], 18).rotateZ(Math.PI / 2).translate(-0.02, 2.03, 8.68), N.od2);   // 90 deg gearbox (left face)
  put(lathe([[0, -0.14], [0.12, -0.12], [0.15, 0], [0.12, 0.12], [0, 0.15]], 16).scale(0.8, 1, 1.25).translate(0.02, 2.03, 8.72), N.od2);
  // tail skid (stinger) under the boom end
  put(tube([[0, 0.25, 7.95], [0, 0.0, 8.25], [0, -0.32, 8.55], [0, -0.42, 8.62]], 0.035, 20, 10), N.steel);
  put(tube([[0, 0.3, 8.75], [0, -0.1, 8.68], [0, -0.42, 8.62]], 0.03, 16, 10), N.steel);
  put(new THREE.SphereGeometry(0.045, 12, 8).translate(0, -0.43, 8.63), N.steel);
  // synchronized elevator: inverted cambered airfoil, rounded tips; pivots with the cyclic
  const elevG = group(g, 'elevator', 0, 0.19, 5.74);
  const ELV = sp => sp.map(([s, ch, le]) => ({ s, chord: ch, le, t: 0.13 }));
  const elevStations = ELV([[-1.36, 0.32, -0.12], [-1.32, 0.52, -0.25], [-1.22, 0.6, -0.31], [0, 0.62, -0.32], [1.22, 0.6, -0.31], [1.32, 0.52, -0.25], [1.36, 0.32, -0.12]]);
  mesh(airfoilLoft(elevStations, { span: 'x', chord: 'z', thick: 'y', n: 28, camber: -0.02, capA: true, capB: true }), N.od2, elevG, 'elevatorSkin');
  mesh(airfoilLoft([elevStations[0], elevStations[3], elevStations[6]], { span: 'x', chord: 'z', thick: 'y', n: 8, camber: -0.02, capA: true, capB: true }), MF.od2, elevG, 'elevatorLow', 'mf');
  mesh(rod([0, 0, 0], [0, -0.1, 0], 0.04, 10).translate(0, 0.06, 0), N.dark, elevG, 'elevatorRoot');

  // ======================================================================== skids
  const skid = (s, rr) => tube([[s * 1.3, -1.36, -2.66], [s * 1.3, -1.5, -2.6], [s * 1.3, -1.66, -2.42], [s * 1.3, -1.77, -2.12], [s * 1.3, -1.795, -1.7], [s * 1.3, -1.795, 0], [s * 1.3, -1.795, 2.4], [s * 1.3, -1.785, 2.62], [s * 1.3, -1.76, 2.7]], 0.051, rr ? 64 : 16, rr ? 14 : 6);
  const crossPts = z => [[-1.3, -1.795, z], [-1.29, -1.6, z], [-1.24, -1.36, z], [-1.08, -1.21, z], [-0.7, -1.165, z], [0, -1.155, z], [0.7, -1.165, z], [1.08, -1.21, z], [1.24, -1.36, z], [1.29, -1.6, z], [1.3, -1.795, z]];
  for (const s of [-1, 1]) {
    put(skid(s, true), N.od);
    put(new THREE.SphereGeometry(0.051, 14, 8).translate(s * 1.3, -1.76, 2.7), N.od);
    put(lathe([[0, 0], [0.05, 0], [0.051, 0.01], [0, 0.012]], 14).rotateX(Math.PI / 2).translate(s * 1.3, -1.36, -2.67), N.od);
    put(rbox(0.07, 0.016, 4.1, 0.006).translate(s * 1.3, -1.838, 0.2), N.alum);                    // skid shoe (wear plate)
    for (const z of [-1.0, 1.2]) put(lathe([[0.075, -0.06], [0.08, 0], [0.075, 0.06]], 16).rotateZ(Math.PI / 2).scale(0.8, 1, 1).translate(s * 1.3, -1.795, z), N.dark);   // saddles
    // boarding step on the forward cross tube
    put(tube([[s * 1.24, -1.36, -1.12], [s * 1.36, -1.4, -1.12], [s * 1.36, -1.4, -0.88], [s * 1.24, -1.36, -0.88]], 0.016, 16, 8), N.alum);
    put(rbox(0.12, 0.012, 0.22, 0.004).translate(s * 1.335, -1.39, -1.0), N.dark);
    mesh(skid(s, false), Mm.od, lod1, 'skidMid', 'm');
  }
  for (const z of [-1.0, 1.2]) { put(tube(crossPts(z), 0.055, 48, 14), N.od); mesh(tube(crossPts(z), 0.055, 10, 5), Mm.od, lod1, 'crossMid', 'm');
    for (const s of [-1, 1]) put(rbox(0.22, 0.05, 0.18, 0.02).translate(s * 0.62, -1.15, z), N.dark); }   // belly attach fittings
  // kick-in steps and handholds up the side to the roof (behind the cargo door)
  for (const s of [-1, 1]) {
    for (const [y, z] of [[-0.55, 1.08], [0.05, 1.12]]) { put(rbox(0.012, 0.05, 0.14, 0.006).translate(s * 1.205, y, z), N.black); }
    put(tube([[s * 1.21, 0.33, 1.02], [s * 1.25, 0.34, 1.07], [s * 1.25, 0.34, 1.25], [s * 1.21, 0.33, 1.3]], 0.011, 12, 6), N.metal);
    put(tube([[s * 1.0, 0.465, -1.55], [s * 1.02, 0.5, -1.5], [s * 1.02, 0.5, -1.3], [s * 1.0, 0.465, -1.25]], 0.011, 12, 6), N.metal);
  }

  // ======================================================================== sliding cargo doors (both sides) and rails
  const DOOR_PH = [S.yToPhi(0, 0.39), S.yToPhi(0, -1.11)];
  const doorGeo = (n, uvOn) => gridGeo(S, steps(-0.97, 0.97, n), steps(DOOR_PH[0], DOOR_PH[1], Math.round(n * 0.7)), { off: 0.024, uv: uvOn ? (z, p) => { const P = S.at(0, p, {}); return [(z + 0.97) / 1.94, (0.39 - P.y) / 1.5]; } : null });
  const doors = [];
  for (const s of [-1, 1]) {
    const dg = group(lod0, s > 0 ? 'cargoDoorR' : 'cargoDoorL');
    let skinG = doorGeo(24, true), glassG = gridGeo(S, steps(-0.86, 0.86, 8), steps(S.yToPhi(0, 0.25), S.yToPhi(0, -0.25), 6), { off: 0.016 });
    if (s < 0) { skinG = mirrorX(skinG); glassG = mirrorX(glassG); }
    mesh(skinG, doorSkinN, dg, 'cargoDoor'); const dgl = mesh(glassG, doorGlassN, dg, 'cargoDoorGlass'); dgl.renderOrder = 3;
    put(rbox(0.03, 0.05, 0.16, 0.01).translate(s * 1.245, -0.42, -0.72), N.black, dg);   // handle
    for (const z of [-0.85, 0.85]) { put(rbox(0.05, 0.05, 0.08, 0.015).translate(s * 1.23, 0.41, z), N.dark, dg); put(rbox(0.05, 0.05, 0.08, 0.015).translate(s * 1.235, -1.12, z), N.dark, dg); }   // rollers
    const dgm = group(lod1, s > 0 ? 'cargoDoorRMid' : 'cargoDoorLMid'); let mg = doorGeo(6, true); if (s < 0) mg = mirrorX(mg); mesh(mg, doorSkinM, dgm, 'cargoDoorMid', 'm');
    doors.push(dg, dgm);
    // rails: upper along the roof edge, lower along the floor line
    put(rbox(0.05, 0.035, 4.0, 0.012).translate(s * 1.225, 0.415, 0.98), N.steel); put(rbox(0.05, 0.035, 4.0, 0.012).translate(s * 1.235, -1.125, 0.98), N.steel);
    for (const z of [-0.95, 0.4, 1.8, 2.9]) put(rbox(0.03, 0.06, 0.05, 0.01).translate(s * 1.215, 0.39, z), N.steel);
  }

  // ======================================================================== cockpit as seen from outside (shell)
  {
    // instrument panel shroud and glare shield, pedestal, overhead console, armoured seats, cyclics
    put(rbox(2.0, 0.5, 0.12, 0.03).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.25)).translate(0, -0.4, -2.68), N.black, shellG);
    put(rbox(2.06, 0.04, 0.32, 0.018).translate(0, -0.12, -2.8), N.black, shellG);
    put(rbox(0.36, 0.42, 0.85, 0.03).translate(0, -0.85, -2.05), N.dark, shellG);
    put(rbox(0.36, 0.11, 0.7, 0.03).translate(0, 0.39, -1.76), N.dark, shellG);
    // instrument faces visible through the windscreen: a dark panel face with a few pale dials
    const dial = B(0x8a8d86);
    for (const [x, y] of [[0.4, 0.14], [0.555, 0.14], [0.71, 0.14], [0.4, 0.005], [0.555, 0.005], [0.71, 0.005], [-0.4, 0.14], [-0.555, 0.14], [-0.71, 0.14], [0.1, 0.15], [-0.03, 0.15], [0.235, 0.145]]) {
      put(new THREE.CircleGeometry(0.05, 14).translate(x, y - 0.4 + 0.397 - 0.397, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.25)).translate(0, -0.397, -2.615), dial, shellG);
    }
    for (const s of [-1, 1]) {
      const x = s * 0.55;
      put(rbox(0.52, 0.08, 0.5, 0.03).translate(x, -0.64, -1.88), N.dark, shellG);                       // seat pan
      put(rbox(0.54, 0.72, 0.09, 0.03).applyMatrix4(new THREE.Matrix4().makeRotationX(0.1)).translate(x, -0.3, -1.6), PM('armour', 'n', role(0x515a3c, 'armor', {}, army)), shellG);   // armoured back
      put(rbox(0.07, 0.64, 0.52, 0.02).translate(x + s * 0.3, -0.33, -1.85), PM('armour', 'n', role(0x515a3c, 'armor', {}, army)), shellG);     // sliding side armour
      put(rod([x, -1.04, -2.08], [x, -0.42, -2.1], 0.016, 10), N.black, shellG); put(rbox(0.045, 0.12, 0.05, 0.015).translate(x, -0.38, -2.11), N.black, shellG);   // cyclic
    }
    if (FIG) for (const s of [-1, 1]) { const m = new THREE.Mesh(crewGeometry('heloPilot', 'seated', { arms: 'controls', seed: s > 0 ? 3 : 1 }), crewMaterial()); m.position.set(s * 0.5, -0.62, -1.6); m.rotation.y = Math.PI; m.name = 'pilot'; shellG.add(m); }
    // nose details: wire strike protection (roof cutter, windscreen deflector, chin cutter), pitot, nose vents
    const wsp = PM('wsps', 'n', role(0x8b8e88, 'metal'));
    put(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.38, 0.02), new THREE.Vector2(0.36, 0.06), new THREE.Vector2(0.02, 0.1)]), { depth: 0.012, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-0.006, 0.47, -2.0).rotateX(0), wsp, shellG);
    put(tube([-3.0, -2.85, -2.7, -2.55, -2.4, -2.25].map(z => [0, S.params(z)[0] + 0.022, z]), 0.012, 20, 6), wsp, shellG);
    put(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.34, 0.0), new THREE.Vector2(0.3, -0.05), new THREE.Vector2(0.02, -0.06)]), { depth: 0.012, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.006, -1.13, -2.9), wsp, shellG);
    put(rod([0.32, 0.47, -1.9], [0.32, 0.6, -1.98], 0.012, 8), N.metal, shellG); put(rod([0.32, 0.6, -1.95], [0.32, 0.6, -2.35], 0.009, 8), N.metal, shellG);
    put(lathe([[0, 0], [0.012, 0.0], [0.012, 0.06], [0, 0.07]], 8).rotateX(-Math.PI / 2).translate(0.32, 0.6, -2.35), N.metal, shellG);
    for (const s of [-1, 1]) put(rbox(0.012, 0.06, 0.12, 0.005).translate(s * 0.995, -0.62, -3.38).rotateY(0), N.black, shellG);   // nose ventilation louvres
    // crew door hinges and handles (outside)
    for (const s of [-1, 1]) { for (const y of [-0.85, 0.05]) put(rbox(0.025, 0.06, 0.05, 0.008).translate(s * 1.205, y, -2.74 + (y + 0.85) * 0.0), N.dark, shellG);
      put(rbox(0.025, 0.035, 0.14, 0.01).translate(s * 1.215, -0.4, -1.3), N.black, shellG); }
  }

  // ======================================================================== antennas, lights
  const ant = PM('ant', 'n', role(0x1c1d1a, 'dark'));
  // VHF whip on the cowling, FM homing / communication antennas, belly UHF blade, the ADF sense antenna
  put(lathe([[0.025, 0], [0.012, 0.03], [0.005, 0.06], [0.003, 0.9], [0, 0.92]], 8).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.6)).translate(0, 1.18, 1.65), ant);
  const blade = (h, c0, c1, sweepB) => new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(c0, 0), new THREE.Vector2(c0 - (c0 - c1) * 0.3 + sweepB, h), new THREE.Vector2(sweepB, h)]), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 2 });
  put(smoothGeo(blade(0.28, 0.32, 0.14, 0.14)).rotateY(-Math.PI / 2).rotateZ(Math.PI).translate(0.006, -1.15, -0.45), ant);   // UHF blade under the belly
  put(smoothGeo(blade(0.22, 0.24, 0.12, 0.1)).rotateY(-Math.PI / 2).translate(-0.006, S.params(4.6)[0] + 0.0, 4.4), ant);   // transponder blade on the boom
  for (const s of [-1, 1]) {   // towel-bar FM antennas on the boom
    put(tube([[s * 0.22, S.params(5.5)[0] - 0.03, 5.5], [s * 0.24, S.params(5.5)[0] + 0.04, 5.55], [s * 0.24, S.params(6.4)[0] + 0.04, 6.35], [s * 0.22, S.params(6.4)[0] - 0.03, 6.4]], 0.01, 24, 6), ant);
  }
  put(rod([0, -1.15, 0.5], [0, -1.42, 0.82], 0.008, 6), ant);   // belly whip (FM homing sense)
  put(rbox(0.3, 0.04, 0.5, 0.02).translate(0, -1.165, 1.8), N.dark);   // ADF loop housing under the cabin
  // APR-39 radar warning spirals: nose (forward-out) and boom end (aft-out)
  for (const s of [-1, 1]) for (const [p, n] of [[[s * 0.86, -0.56, -3.44], [s * 0.7, 0, -0.7]], [[s * 0.15, 0.48, 8.96], [s * 0.6, 0, 0.8]]]) {
    const a = V3(...p), nn = V3(...n).normalize();
    put(alignY(lathe([[0.055, 0], [0.058, 0.02], [0.05, 0.04], [0.0, 0.045]], 16), a, a.clone().add(nn)), N.dark);
  }
  // landing light (belly, forward) and searchlight, beam
  const lensM = B(0x3a3a34), lens = mesh(new THREE.CircleGeometry(0.105, 20), lensM, lod0, 'landingLight');
  lens.position.set(0, -1.19, -2.75); lens.lookAt(0, -2.0, -3.4);
  put(lathe([[0.11, 0], [0.13, 0.0], [0.135, 0.06], [0.12, 0.09], [0.11, 0.09]], 20).rotateX(-Math.PI / 2).applyMatrix4(new THREE.Matrix4().compose(V3(0, -1.19, -2.75), lens.quaternion, V3(1, 1, 1))).translate(0, 0.005, 0.005), N.dark);
  const beamM = B(0xfff2c0, { transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = mesh(new THREE.CylinderGeometry(1.3, 0.1, 7, 16, 1, true).translate(0, 3.55, 0).rotateX(-Math.PI / 2), beamM, lens, 'landingBeam'); beam.rotation.y = Math.PI;
  put(lathe([[0, -0.06], [0.08, -0.05], [0.1, 0.0], [0.1, 0.05], [0, 0.06]], 16).translate(-0.35, -1.22, -2.4), N.dark);   // searchlight housing (stowed)
  put(new THREE.CircleGeometry(0.075, 16).rotateX(Math.PI / 2).translate(-0.35, -1.285, -2.4), PM('lens', 'n', role(0xb8b8a8, 'lamp')));
  // anti-collision beacons (doghouse aft top, belly) and position lights (red left, green right, white tail)
  const beaconM = B(0xff2414), beaconOffM = PM('beacon', 'n', role(0x6a140e, 'lamp', { transparent: true, opacity: 0.9 }));
  const beacons = [[0, 1.2, 2.05], [0, -1.18, 1.55]].map(([x, y, z], i) => {
    put(lathe([[0.07, 0], [0.075, 0.02], [0.06, 0.03]], 16).rotateX(i ? Math.PI : 0).translate(x, y + (i ? 0.01 : -0.01), z), N.dark);
    const h = mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, TAU, 0, Math.PI / 2).rotateX(i ? Math.PI : 0), beaconOffM, lod0, 'beacon'); h.position.set(x, y + (i ? -0.02 : 0.02), z); return h;
  });
  const navR = B(0xff2a1a), navG = B(0x2aff5a), navOff = PM('navoff', 'n', role(0x4a4a46, 'lamp'));
  const navs = [[-1.13, 0.47, -0.75, navR], [1.13, 0.47, -0.75, navG], [-1.21, -1.02, -1.5, navR], [1.21, -1.02, -1.5, navG], [0, 0.66, 9.08, B(0xffffff)]].map(([x, y, z, m]) => {
    const o = mesh(new THREE.SphereGeometry(0.035, 12, 6), navOff, lod0, 'navLight'); o.position.set(x, y, z); o.scale.set(1, 0.8, 1.6); o.userData.on = m; return o;
  });

  // ======================================================================== weapons: M158 pods, M60D door guns, crew
  const HEX = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [0.128 * Math.cos(i * Math.PI / 3 + Math.PI / 6), 0.128 * Math.sin(i * Math.PI / 3 + Math.PI / 6)])];
  const noseG = lathe([[0, 0.12], [0.02, 0.1], [0.04, 0.05], [0.045, 0]], 10).rotateX(-Math.PI / 2), noseM = PM('rnose', 'n', role(0x8c8a62, 'paint')), pods = [];
  const podProf = [[0, -0.76], [0.17, -0.76], [0.2, -0.73], [0.205, -0.68], [0.2, -0.66], [0.2, 0.55], [0.205, 0.57], [0.205, 0.62], [0.19, 0.66], [0.13, 0.75], [0.06, 0.8], [0, 0.81]];
  for (const [px, py, pz] of HUEY.PODS) {
    const s = Math.sign(px), z0 = pz - 0.76;
    put(lathe(podProf, 24).rotateX(Math.PI / 2).translate(px, py, pz), N.od2);
    put(lathe(podProf.filter((_, i) => i % 2 === 0), 8).rotateX(Math.PI / 2).translate(px, py, pz), Mm.od2, lod1, 'm');
    for (const [hx, hy] of HEX) put(new THREE.CircleGeometry(0.05, 12).rotateY(Math.PI).translate(px + hx, py + hy, z0 - 0.002), N.black);
    for (const z of [z0 + 0.12, pz + 0.55]) put(lathe([[0.205, -0.03], [0.212, -0.02], [0.212, 0.02], [0.205, 0.03]], 24).rotateX(Math.PI / 2).translate(px, py, z), N.dark);
    put(rbox(0.1, 0.12, 0.6, 0.02).translate(px, py + 0.25, pz), N.dark);
    put(rbox(Math.abs(px) - 1.1, 0.09, 0.16, 0.025).translate(s * (1.1 + Math.abs(px)) / 2, py + 0.33, pz), N.od);
    put(rod([s * 1.2, -0.9, pz], [s * 1.47, py + 0.3, pz], 0.03, 10), N.od); put(rod([s * 1.2, -0.85, pz + 0.5], [s * 1.47, py + 0.3, pz], 0.025, 10), N.od);
    const noses = HEX.map(([hx, hy]) => { const m = mesh(noseG, noseM, lod0, 'rocket'); m.position.set(px + hx, py + hy, z0 + 0.03); return m; });
    pods.push(noses);
  }
  // M60D on the pintle: receiver, butt with spade grips, barrel with flash hider, feed tray, ammo can + chute
  const m60 = (pp, parent) => {
    const bk = N.black, st = N.steel;
    pp(rbox(0.07, 0.1, 0.42, 0.012).translate(0, 0.02, 0), bk); pp(rbox(0.055, 0.1, 0.22, 0.012).translate(0, 0.0, 0.32), bk);
    pp(lathe([[0.017, 0], [0.017, 0.52], [0.022, 0.53], [0.022, 0.6], [0.0, 0.6]], 12).rotateX(-Math.PI / 2).translate(0, 0.03, -0.2), bk);   // barrel + flash hider
    pp(lathe([[0.03, 0], [0.032, 0.02], [0.032, 0.14], [0.03, 0.16]], 12).rotateX(-Math.PI / 2).translate(0, 0.03, -0.26), st);   // barrel jacket
    pp(rbox(0.03, 0.03, 0.3, 0.008).translate(0, -0.01, -0.36), bk); pp(rbox(0.06, 0.05, 0.18, 0.01).translate(0, -0.02, -0.28), bk);
    for (const s2 of [-1, 1]) pp(tube([[s2 * 0.04, 0.0, 0.42], [s2 * 0.07, 0.0, 0.47], [s2 * 0.07, -0.08, 0.47]], 0.012, 10, 6), bk);   // spade grips
    pp(rbox(0.09, 0.03, 0.1, 0.01).translate(0, 0.075, -0.02), bk);
    pp(rbox(0.11, 0.17, 0.25, 0.012).translate(0.11, -0.1, -0.02), N.od2);   // ammo can
    pp(tube([[0.06, -0.02, -0.04], [0.09, 0.0, -0.06], [0.11, -0.02, -0.06]], 0.018, 8, 6), N.dark);
    pp(rbox(0.05, 0.06, 0.06, 0.01).translate(0, -0.06, 0), st);
  };
  const [gx, gy, gz] = HUEY.GUN;
  const pintle = s => { const x = s * Math.abs(gx);
    put(rod([x + s * -0.08, -1.05, gz], [x + s * -0.08, 0.44, gz], 0.025, 12), N.steel);
    put(rod([x + s * -0.08, gy - 0.06, gz], [x, gy - 0.06, gz], 0.02, 10), N.steel);
    put(lathe([[0.035, -0.05], [0.04, -0.04], [0.04, 0.04], [0.035, 0.05]], 12).translate(x, gy - 0.06, gz), N.steel); };
  pintle(-1); pintle(1);
  const gunYaw = group(lod0, 'doorGun', gx, gy, gz), gunPitch = group(gunYaw, 'gunPitch'), gunBody = group(gunPitch, 'm60');
  { const loc = new Map(); m60((geo, m) => (loc.get(m) || loc.set(m, []).get(m)).push(geo)); for (const [m, gs] of loc) mesh(merge(gs), m, gunBody, 'm60Parts'); }
  const flashM = B(0xffc860, { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const flash = mesh(merge([new THREE.PlaneGeometry(0.22, 0.5).rotateX(Math.PI / 2), new THREE.PlaneGeometry(0.22, 0.5).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)]).translate(0, 0.03, -1.05), flashM, gunBody, 'muzzleFlash');
  // gunner / crew chief seats (tube frame, canvas), inboard of the pintles, facing out
  const gunSeat = s => { const x = s * (Math.abs(gx) - 0.52);
    put(rbox(0.44, 0.06, 0.42, 0.02).translate(x, -0.77, gz + 0.06), canvasN); put(rbox(0.06, 0.5, 0.42, 0.02).translate(x - s * 0.24, -0.5, gz + 0.06), canvasN);
    for (const dz of [-0.18, 0.18]) for (const dx of [-0.18, 0.18]) put(rod([x + dx, -1.05, gz + 0.06 + dz], [x + dx, -0.8, gz + 0.06 + dz], 0.012, 8), N.alum); };
  gunSeat(-1); gunSeat(1);
  const gunnerG = group(lod0, 'gunner', gx + 0.5, -0.74, gz + 0.04);
  if (FIG) { const m = new THREE.Mesh(crewGeometry('heloPilot', 'seated', { arms: 'controls', seed: 4 }), crewMaterial()); m.rotation.y = Math.PI; m.name = 'gunnerBody'; gunnerG.add(m); }
  const yawR = group(lod0, 'doorGunR', -gx, gy, gz); yawR.rotation.y = -Math.PI / 2; const pR = group(yawR, 'gunPitchR'); pR.rotation.x = -0.35;
  { const loc = new Map(); m60((geo, m) => (loc.get(m) || loc.set(m, []).get(m)).push(geo)); for (const [m, gs] of loc) mesh(merge(gs), m, pR, 'm60RParts'); }
  const chief = group(lod0, 'crewChief', -gx - 0.5, -0.74, gz + 0.04); chief.rotation.y = -Math.PI / 2;
  if (FIG) { const m = new THREE.Mesh(crewGeometry('heloPilot', 'seated', { arms: 'controls', seed: 2 }), crewMaterial()); m.rotation.y = Math.PI; m.name = 'crewChiefBody'; chief.add(m); }
  // mid LOD: crew silhouettes as the same figures (no dissolve on the shared crew material: toggled at the far switch)

  // ======================================================================== main rotor
  const mast = group(g, 'mast', ...HUEY.HUB); mast.rotation.x = -HUEY.MAST_TILT;
  { // mast tube with the "Jesus nut", the boot where it leaves the cowling, control tubes up to the swashplate
    const mb = new Map(), mp = (geo, m) => (mb.get(m) || mb.set(m, []).get(m)).push(geo);
    mp(lathe([[0.078, -0.86], [0.078, 0.12], [0.07, 0.14], [0.07, 0.2]], 20), N.metal);
    mp(lathe([[0, 0.2], [0.085, 0.2], [0.09, 0.22], [0.09, 0.27], [0.06, 0.3], [0, 0.31]], 20), N.steel);   // mast nut
    mp(lathe([[0.2, -0.86], [0.17, -0.8], [0.13, -0.74], [0.1, -0.7], [0.085, -0.66]], 20), N.rubber);     // mast boot
    for (const a of [0, 2.1, 4.2]) { const x = Math.cos(a) * 0.2, z = Math.sin(a) * 0.2; mp(rod([x, -0.86, z], [x * 1.05, -0.6, z * 1.05], 0.012, 8), N.steel); }
    for (const [m, gs] of mb) mesh(merge(gs), m, mast, 'mastTube');
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.1, 8).translate(0, -0.3, 0), MF.metal, mast, 'mastMid', 'mf');
  }
  const swash = group(mast, 'swashplate', 0, -0.55, 0), swSpin = group(swash, 'swashSpin');
  { const sb = new Map(), sp = (geo, m) => (sb.get(m) || sb.set(m, []).get(m)).push(geo);
    sp(lathe([[0.1, -0.04], [0.24, -0.035], [0.26, -0.015], [0.26, 0.01], [0.1, 0.02]], 28), N.steel);
    for (const a of [0, 2.1, 4.2]) sp(rbox(0.06, 0.03, 0.05, 0.01).translate(Math.cos(a) * 0.27, -0.02, Math.sin(a) * 0.27), N.steel);
    for (const [m, gs] of sb) mesh(merge(gs), m, swash, 'swashLower'); }
  { const sb = new Map(), sp = (geo, m) => (sb.get(m) || sb.set(m, []).get(m)).push(geo);
    sp(lathe([[0.1, 0.02], [0.23, 0.025], [0.24, 0.045], [0.22, 0.07], [0.1, 0.075]], 28), N.metal);
    for (const s of [-1, 1]) { sp(rbox(0.08, 0.035, 0.06, 0.012).translate(s * 0.26, 0.05, s * 0.06), N.metal);
      sp(rod([s * 0.27, 0.06, s * 0.06], [s * 0.4, 0.5, s * 0.1], 0.013, 8), N.metal); sp(lathe([[0.02, -0.02], [0.022, 0], [0.02, 0.02]], 10).translate(s * 0.4, 0.5, s * 0.1), N.steel); }   // pitch links
    sp(rod([0.0, 0.07, 0.17], [0.0, 0.42, 0.12], 0.012, 8), N.steel);   // drive scissors
    for (const [m, gs] of sb) mesh(merge(gs), m, swSpin, 'swashUpper'); }
  const spin = group(mast, 'rotorHub'), teeter = group(spin, 'teeter');
  { const hb = new Map(), hp = (geo, m) => (hb.get(m) || hb.set(m, []).get(m)).push(geo);
    hp(rbox(0.86, 0.1, 0.24, 0.035), N.metal);                                                             // yoke
    hp(lathe([[0.1, -0.08], [0.11, -0.05], [0.11, 0.05], [0.1, 0.08]], 20).rotateZ(Math.PI / 2), N.steel); // trunnion
    for (const s of [-1, 1]) {
      hp(lathe([[0.07, 0], [0.085, 0.02], [0.09, 0.08], [0.085, 0.3], [0.07, 0.36], [0.06, 0.4]], 16).rotateZ(-s * Math.PI / 2).translate(s * 0.4, 0, 0.02), N.metal);   // grip
      hp(rbox(0.32, 0.03, 0.2, 0.01).translate(s * 0.75, 0.035, 0.03), N.metal); hp(rbox(0.32, 0.03, 0.2, 0.01).translate(s * 0.75, -0.035, 0.03), N.metal);   // blade bolt plates
      for (const dx of [0.68, 0.84]) hp(lathe([[0.016, -0.06], [0.02, -0.055], [0.02, 0.055], [0.016, 0.06]], 10).translate(s * dx, 0, 0.03), N.steel);
      hp(rbox(0.06, 0.04, 0.2, 0.012).translate(s * 0.45, -0.01, s * 0.15), N.metal);                    // pitch horn
    }
    for (const [m, gs] of hb) mesh(merge(gs), m, teeter, 'yoke');
    mesh(new THREE.BoxGeometry(0.9, 0.1, 0.24), MF.metal, teeter, 'yokeMid', 'mf');
  }
  // blades: NACA 0012, 21 in chord, ~10 deg washout, quarter-chord pitch axis; yellow tip band; root doublers
  const blades = [], DROOP = -0.045, R = HUEY.R, CH = HUEY.CHORD, LE0 = -0.25 * CH;
  const bStations = (r0, r1, n) => steps(r0, r1, n).map(r => ({ s: r, chord: CH, le: LE0, pivot: 0.25, t: 0.12, twist: -10 * D2R * (r / R - 0.75) }));
  const bodyStations = [{ s: 0.86, chord: CH * 0.8, le: LE0 * 0.8, pivot: 0.25, t: 0.2, twist: 0.05 }, { s: 1.15, chord: CH, le: LE0, pivot: 0.25, t: 0.15, twist: 0.05 }, ...bStations(1.5, R - 0.32, 14)];
  const bladeBody = airfoilLoft(bodyStations, { span: 'x', chord: 'z', thick: 'y', n: 28, capA: true, capB: false });
  const bladeTip = airfoilLoft([...bStations(R - 0.32, R - 0.01, 3), { s: R, chord: CH * 0.9, le: LE0 * 0.9, pivot: 0.25, t: 0.06, twist: -10 * D2R * 0.25 }], { span: 'x', chord: 'z', thick: 'y', n: 28, capA: false, capB: true });
  const bladeLow = airfoilLoft([bodyStations[1], ...bStations(3, R, 2)], { span: 'x', chord: 'z', thick: 'y', n: 6, capA: true, capB: true });
  const tabG = rbox(0.18, 0.004, 0.05, 0.002).translate(5.6, 0, 0.75 * CH + 0.02);   // trim tab
  for (const k of [0, 1]) {
    const arm = group(teeter, 'bladeArm' + k); arm.rotation.y = k * Math.PI;
    const flap = group(arm, 'flap' + k), pitch = group(flap, 'pitch' + k);
    const bodyM = mesh(bladeBody, N.blade, pitch, 'blade'), tip = mesh(bladeTip, N.tip, pitch, 'bladeTip');
    mesh(merge([rbox(0.5, 0.075, 0.42, 0.02).translate(0.98, 0, 0.06), tabG.clone()]), N.dark, pitch, 'bladeRoot');
    mesh(bladeLow, MF.blade, pitch, 'bladeLow', 'mf');
    blades.push({ flap, pitch, body: bodyM, tip, low: null });
  }
  // stabilizer bar: rides above the hub at 90 deg to the blades, weights at the tips, damper cylinders
  const stab = group(spin, 'stabBar', 0, 0.3, 0);
  { const sb = new Map(), sp = (geo, m) => (sb.get(m) || sb.set(m, []).get(m)).push(geo);
    sp(rod([0, 0, -1.3], [0, 0, 1.3], 0.02, 10), N.metal);
    for (const s of [-1, 1]) sp(lathe([[0.02, 0], [0.04, 0.04], [0.055, 0.12], [0.06, 0.3], [0.058, 0.38], [0.04, 0.43], [0, 0.45]], 16).rotateX(s * Math.PI / 2).translate(0, 0, s * 0.9), N.black);
    sp(rbox(0.12, 0.1, 0.22, 0.03), N.metal);
    for (const s of [-1, 1]) { sp(rod([s * 0.1, -0.02, -0.15], [s * 0.1, -0.02, 0.15], 0.03, 12), N.steel); sp(rod([s * 0.1, -0.02, s * 0.12], [s * 0.38, -0.25, s * 0.12], 0.012, 8), N.steel); }   // dampers, mixing links
    for (const [m, gs] of sb) mesh(merge(gs), m, stab, 'stabBarParts'); }
  { const pb = new Map(), pp = (geo, m) => (pb.get(m) || pb.set(m, []).get(m)).push(geo);
    pp(rbox(0.06, 0.3, 0.06, 0.015).translate(0, 0.15, 0), N.metal); for (const s of [-1, 1]) pp(rod([0, 0.02, s * 0.12], [0, 0.26, s * 0.5], 0.015, 8), N.metal);
    for (const [m, gs] of pb) mesh(merge(gs), m, spin, 'stabMount'); }
  // motion-blur disc: a shallow cone in the tip-path plane (as the classic model)
  const discG = group(mast, 'rotorDisc');
  const ringGeo = (r0, r1, n = 64) => {
    const pos = [];
    for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, P = (r, a) => [r * Math.cos(a), r, r * Math.sin(a)]; pos.push(...P(r0, a0), ...P(r1, a1), ...P(r1, a0), ...P(r0, a0), ...P(r0, a1), ...P(r1, a1)); }
    const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.computeVertexNormals(); return q;
  };
  const discM = B(0x1a1c1a, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }), tipRingM = B(0xd8b020, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const disc = new THREE.Mesh(ringGeo(0.9, R - 0.32), discM); disc.name = 'disc'; discG.add(disc);
  const tipRing = new THREE.Mesh(ringGeo(R - 0.32, R), tipRingM); tipRing.name = 'discTips'; discG.add(tipRing);
  disc.renderOrder = tipRing.renderOrder = 2;

  // ======================================================================== tail rotor (left of the fin): delta-hinge hub, 2 blades
  const trG = group(g, 'tailRotor', ...HUEY.TR_HUB), trSpin = group(trG, 'trSpin');
  { const tb = new Map(), tp = (geo, m) => (tb.get(m) || tb.set(m, []).get(m)).push(geo);
    tp(lathe([[0, -0.12], [0.04, -0.12], [0.045, -0.06], [0.045, 0.08], [0.03, 0.12], [0, 0.13]], 14).rotateZ(Math.PI / 2), N.metal);
    tp(rbox(0.06, 0.32, 0.1, 0.02), N.metal);
    for (const s of [-1, 1]) { tp(rbox(0.05, 0.08, 0.05, 0.01).translate(0.0, s * 0.13, -0.06), N.steel); tp(rod([0.08, s * 0.02, -0.06], [0.01, s * 0.12, -0.06], 0.008, 6), N.steel); }   // pitch horns and links
    tp(lathe([[0.05, 0], [0.06, 0.02], [0.06, 0.05], [0.03, 0.06]], 12).rotateZ(-Math.PI / 2).translate(0.07, 0, 0), N.steel);   // crosshead
    for (const [m, gs] of tb) mesh(merge(gs), m, trSpin, 'trHub'); }
  const TRC = 0.214, trSt = (r0, r1, n, t = 0.12) => steps(r0, r1, n).map(s => ({ s, chord: TRC, le: -0.25 * TRC + 0.03, pivot: 0.25, t, twist: 0 }));
  const trBlades = [0, 1].map(k => {
    const arm = group(trSpin, 'trArm' + k); arm.rotation.x = k * Math.PI;
    const p = group(arm, 'trPitch' + k), Rr = HUEY.TR_R;
    const seg = (st, m, n, cA, cB) => mesh(airfoilLoft(st, { span: 'y', chord: 'z', thick: 'x', n: 16, capA: cA, capB: cB }), m, p, n);
    seg([{ s: 0.1, chord: 0.12, le: -0.03 + 0.03, pivot: 0.25, t: 0.25, twist: 0 }, ...trSt(0.22, Rr - 0.36, 4)], N.blade, 'trBlade', true, false);
    seg(trSt(Rr - 0.36, Rr - 0.2, 1), N.white, 'trWhite', false, false);
    seg(trSt(Rr - 0.2, Rr, 2), N.red, 'trRed', false, true);
    mesh(airfoilLoft(trSt(0.15, Rr, 1), { span: 'y', chord: 'z', thick: 'x', n: 6, capA: true, capB: true }), MF.blade, p, 'trBladeLow', 'mf');
    return p;
  });
  const trDiscM = B(0x2a2a2a, { transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const trDisc = new THREE.Mesh(new THREE.RingGeometry(0.15, HUEY.TR_R, 32).rotateY(Math.PI / 2), trDiscM); trDisc.name = 'trDisc'; trG.add(trDisc); trDisc.position.x = -0.02;
  const trStub = mesh(merge([rod([-0.13, 0, 0], [0.03, 0, 0], 0.045, 10), rbox(0.05, 0.3, 0.1, 0.01).translate(-0.1, 0.08, 0).rotateX(0.5)]), N.dark, lod0, 'trStub');
  trStub.position.copy(trG.position); trStub.visible = false;

  flush();

  // far LOD: the gun/pods/skids are folded into simple shapes so the silhouette holds
  {
    const fp = [];
    for (const [px, py, pz] of HUEY.PODS) fp.push(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 6).rotateX(Math.PI / 2).translate(px, py, pz));
    for (const s of [-1, 1]) fp.push(new THREE.CylinderGeometry(0.05, 0.05, 5.0, 4).rotateX(Math.PI / 2).translate(s * 1.3, -1.79, 0.1));
    for (const z of [-1.0, 1.2]) fp.push(new THREE.BoxGeometry(2.6, 0.08, 0.08).translate(0, -1.3, z));
    mesh(merge(fp), Fm.od2, lod2, 'farParts', 'f');
  }
  // the probe: an empty draw that learns the camera distance every time the model is drawn
  let minD = 0;
  const probe = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  probe.frustumCulled = false; probe.geometry.setDrawRange(0, 0); probe.name = 'lodProbe'; probe.userData.rkShadow = 'none'; g.add(probe);
  const _cp = new THREE.Vector3(), _gp = new THREE.Vector3();
  const setW = d => {
    const wN = 1 - sstep(HUEY_LOD.nm[0], HUEY_LOD.nm[1], d), wF = sstep(HUEY_LOD.mf[0], HUEY_LOD.mf[1], d), a = wN, b = 1 - wF;
    U.n.value.set(0, a >= 1 ? 2 : a); U.m.value.set(a, b); U.f.value.set(b <= 0 ? -1 : b, 2); U.mf.value.set(a, 2); U.nm.value.set(0, b >= 1 ? 2 : b);
  };
  probe.onBeforeRender = (r, sc, cam) => {
    _cp.setFromMatrixPosition(cam.matrixWorld); g.getWorldPosition(_gp);
    const s = Math.max(1e-3, g.matrixWorld.getMaxScaleOnAxis()), d = _cp.distanceTo(_gp) / s;   // cave view (0.36 scale) keeps the near model
    setW(d); minD = Math.min(minD, d);
  };
  const vis = d => {
    const vn = d < HUEY_LOD.nm[1] + 6, vm = d > HUEY_LOD.nm[0] - 6 && d < HUEY_LOD.mf[1] + 15, vf = d > HUEY_LOD.mf[0] - 15;
    for (const o of reg.n) o.visible = vn; for (const o of reg.m) o.visible = vm; for (const o of reg.f) o.visible = vf;
    for (const o of reg.mf) o.visible = vm || vf; for (const o of reg.nm) o.visible = vn || vm;
  };

  // ======================================================================== animation (no allocations)
  let psi = 0, tpsi = 0, gYaw = Math.PI / 2, gPitch = -0.2, doorT = 1, lodD = 0;
  const qW = new THREE.Quaternion(), vA = new THREE.Vector3();
  const shell = [shellG];
  function animate(S0 = {}, dt = 0, time = 0, inside = false) {
    const nr = S0.nr || 0, tx = S0.tx || 0, ty = S0.ty || 0, coll = S0.coll || 0;
    // LOD: the nearest distance any camera drew the model from since the last frame
    if (Number.isFinite(minD)) lodD = minD; minD = Infinity; if (inside) lodD = 0; vis(lodD); if (inside) setW(0);
    psi = (psi + nr * HUEY.OMEGA * dt) % TAU;
    spin.rotation.y = psi; swSpin.rotation.y = psi;
    const s = Math.sin(psi), c = Math.cos(psi), kr = sstep(0.15, 0.75, nr), cone = DROOP + ((S0.cone ?? 0.05) - DROOP) * kr;
    teeter.rotation.z = -tx * s - ty * c;
    stab.rotation.x = -(tx * c - ty * s) * 0.85;
    const broken = (S0.rotorHp ?? 1) <= 0, pitch = 0.03 + coll * 0.2;
    for (const b of blades) { b.flap.rotation.z = cone; b.pitch.rotation.x = pitch; b.body.scale.x = broken ? 0.32 : 1; b.tip.visible = !broken; }
    swash.rotation.set(-tx * 0.9, 0, -ty * 0.9); swash.position.y = -0.58 + coll * 0.07;
    discG.rotation.set(-tx, 0, -ty); discG.scale.y = cone;
    const dk = broken ? 0 : sstep(0.35, 0.9, nr);
    discM.opacity = (inside ? 0.06 : 0.16) * dk; tipRingM.opacity = (inside ? 0.07 : 0.16) * dk; discG.visible = dk > 0.01;
    const lost = !!S0.tailLost; trG.visible = !lost; trStub.visible = lost && lodD < HUEY_LOD.nm[1] + 6;
    tpsi = (tpsi + nr * HUEY.OMEGA * HUEY.TR_GEAR * dt) % TAU; trSpin.rotation.x = -tpsi;
    for (const p of trBlades) p.rotation.y = 0.08 - (S0.ped || 0) * 0.22;
    trDiscM.opacity = 0.07 * sstep(0.3, 0.8, nr);
    elevG.rotation.x = -clamp(tx * 1.5, -0.15, 0.15);
    // cargo doors: open (slid back over the aft cabin) unless the game says otherwise
    const want = S0.cargoDoor ?? 1; doorT += (want - doorT) * Math.min(1, 3 * dt); if (dt === 0) doorT = want;
    for (const d of doors) d.position.z = doorT * 1.92;
    // door gun
    let yT = Math.PI / 2, pT = -0.3;
    if (S0.aim && S0.aim.lengthSq() > 0.5) {
      g.getWorldQuaternion(qW); vA.copy(S0.aim).applyQuaternion(qW.invert());
      if (vA.x < 0.1) { yT = clamp(Math.atan2(-vA.x, -vA.z), 0.35, Math.PI - 0.25); pT = clamp(Math.asin(clamp(vA.y, -1, 1)), -1.0, 0.55); }
    }
    const kg = 1 - Math.exp(-12 * dt); gYaw += (yT - gYaw) * kg; gPitch += (pT - gPitch) * kg;
    gunYaw.rotation.y = gYaw; gunPitch.rotation.x = gPitch;
    gunnerG.rotation.y = Math.PI / 2 + (gYaw - Math.PI / 2) * 0.55;
    const fire = !!S0.firing;
    flash.visible = fire && ((time * 37) % 1) < 0.6; if (flash.visible) { flash.rotation.z = time * 97 % 6.28; flash.scale.setScalar(0.7 + ((time * 53) % 1) * 0.6); }
    gunBody.position.z = fire ? 0.025 * Math.abs(Math.sin(time * 70)) : 0;
    const rk = Math.round(S0.rockets ?? 16), left = Math.min(7, Math.ceil(rk / 2)), right = Math.min(7, Math.floor(rk / 2));
    for (let i = 0; i < 7; i++) { pods[0][i].visible = i < left; pods[1][i].visible = i < right; }
    lensM.color.setHex(S0.light ? 0xfff6d8 : 0x3a3a34); beam.visible = !!S0.light; beamM.opacity = inside ? 0.04 : 0.1;
    const live = !!S0.run || nr > 0.05, fl = live && (time % 1.0) < 0.1;
    for (const b of beacons) { b.material = fl ? beaconM : beaconOffM; b.scale.setScalar(fl ? 1.5 : 1); }
    for (const n of navs) n.material = live ? n.userData.on : navOff;
    const h = clamp(((S0.n1 || 0) - 0.45) / 0.55, 0, 1); heatM.color.setRGB(0.08 + 0.55 * h, 0.03 + 0.16 * h, 0.02 + 0.03 * h);
    for (const o of shell) o.visible = !inside;
  }
  // budgets per LOD: triangles and draw calls of what each LOD band draws (dynamic parts counted where they are drawn)
  const tagOf = o => { for (let q = o; q; q = q.parent) { if (q === lod0) return 'n'; if (q === lod1) return 'm'; if (q === lod2) return 'f'; } return o.userData.hyLod || 'all'; };
  for (const k of ['n', 'm', 'f']) stats[k] = { tris: 0, draws: 0 };
  g.traverse(o => {
    if (!o.isMesh || o === probe || o.name === 'landingBeam' || o.name === 'trStub' || o.name === 'muzzleFlash') return;
    const t = o.userData.hyLod === undefined ? 'all' : tagOf(o), set = t === 'all' ? ['n', 'm', 'f'] : t === 'mf' ? ['m', 'f'] : t === 'nm' ? ['n', 'm'] : [t];
    const tris = triCount(o.geometry), dr = Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
    for (const k of set) { stats[k].tris += tris; stats[k].draws += dr; }
  });
  animate({});
  return { group: g, shell, animate, stats, parts: { mast, spin, teeter, stab, blades, disc: discG, swash, tailRotor: trG, elevator: elevG, gun: gunYaw, gunner: gunnerG, pods, beam, doors, lod: { near: lod0, mid: lod1, far: lod2 } } };
}
