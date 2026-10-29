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
  rbox, smoothGeo, lathe, V3, alignY, rod, tube, merge, mirrorX, triCount, vnoise, fbm, hash2, glyphs, sdBox, sdPoly, bake, sweep, arcSpace,
} from './hueygeo.js';
import { UH1_TRACE } from './uh1trace.js';
import { sampler, pl, smooth01, stationList, stationKeys } from './stationtable.js';
import { CABIN, TROOP_SEATS } from './hueycabin.js';

const D2R = Math.PI / 180;
// LOD hand-over distances (m, camera to the model origin): near -> mid, mid -> far, with the dissolve bands
export const HUEY_LOD = Object.freeze({ nm: [55, 75], mf: [200, 260] });

// ------------------------------------------------------------------------------------------- reference tables
// Measured from the TM 55-1520-210-10 principal-dimensions figure (docs/ngc1980/reference/uh1, public domain): side view
// scaled by the 41 ft 5.0 in fuselage length (100.7 px/m), ground line = HUEY.GROUND, the main rotor hub 11 ft 8.65 in
// aft of the nose; front view by the 8 ft 6.6 in skid track; top view by the hub-to-tail distance. Check with
// dev/huey.html?ref=side|front|top. Model z = station aft of the CG, nose tip at z -3.69, tail at z 8.93.
const GEO = Object.freeze({
  HUB: [0, 2.00, -0.12],           // 13 ft 7.40 in to the top of the hub (front view label; the drawn hub sits 0.2 m lower, the photo agrees with the label)
  TR_HUB: [0.39, 1.39, 8.66],      // RIGHT of the fin (tractor), 10 ft 2.5 in above the ground (drawing centre 3.23 m); see findings: TM top view + 1982/1987 photos
  TR_SIDE: 1,                      // +1 right (1980 US Army UH-1H), -1 left (early production)
  GUN: CABIN.GUN,                  // M60D pintle at the aft end of the cargo doorway (hueycabin.js)
  // M158 seven-tube 2.75 in rocket launchers (fit option) on the side-mounted universal mounts at cabin-floor level,
  // below the doorway's forward part and ahead of the door gunner: pod 0.27 m across, 1.68 m long (photos + XM156 mount)
  PODS: [[-1.8, -1.13, -0.55], [1.8, -1.13, -0.55]], POD_R: 0.135, POD_L: 1.68,   // outboard of the skid line: a Marine on the sill (legs to x 1.61) clears it
  SKID: { x: 1.30, z0: -2.62, z1: 1.08, cross: [-1.71, 0.60] },   // 8 ft 6.6 in track, cross tubes from the side view
  ELEV: { z: 5.42, y: -0.22, chord: 0.775, span: 2.85 },          // 2 ft 6.5 in chord, 9 ft 4.3 in span
});
// ---- fuselage, lofted from the traced TM three-view (game/js/uh1trace.json, tools/hueytrace.mjs): the side view gives
// the upper and lower profile, the top view the half-width, the front view the cabin section (widest at y -0.65, a
// squarish roof corner, 6 % tumblehome, rounder belly); masked spans (mast, cutters, antennas, struts, the rotor
// blade over the top view) are bridged. Sections blend to round at the nose cap and the boom.
const TR_SIDE = sampler(UH1_TRACE.side, 'top', { median: 0.12 }), TR_BOT = sampler(UH1_TRACE.side, 'bottom', { median: 0.2 });
const TR_HW = sampler(UH1_TRACE.top, 'hw', { median: 0.12 });
const ROOF = 0.545, KEEL_YM = -0.65, CAB = { nT: 8, nB: 4, lean: 0.06, crown: 0.07 };
// nose cap and chin where the drawing is masked (chin cutter) or blunt (the plan view outline): read off the TM views
const NOSE_BOT = pl([[-3.72, -0.80], [-3.66, -0.82], [-3.6, -0.9], [-3.5, -0.99], [-3.35, -1.08], [-3.2, -1.145], [-3.05, -1.195], [-2.94, -1.235]]);
const NOSE_HW = z => 0.99 * Math.max(0, 1 - Math.max(0, (-3.0 - z) / 0.725) ** 2.3) ** (1 / 2.3);
const BOOM_TOP = pl([[2.6, 0.04], [3.0, 0.03], [7.7, 0.1], [7.95, 0.095], [8.02, 0.06]]);
const BOOM_HW = pl([[2.6, 0.36], [3.0, 0.30], [5.0, 0.26], [7.0, 0.215], [7.7, 0.19], [7.9, 0.13], [8.02, 0.0]]);
function fusAt(z) {
  // upper profile: windscreen and cockpit roof from the trace, the cabin roof flat under the doghouse, the aft
  // fuselage shoulder easing down to the boom root, the boom top from the trace (under the fin: extrapolated)
  // (the traced boom top is the drive-shaft cover's; the boom skin itself runs 2 .. 8 cm under it: BOOM_TOP)
  let T = z < -2.45 ? Math.min(ROOF, TR_SIDE(z)) : z < 0.84 ? ROOF : z < 2.6 ? ROOF + (BOOM_TOP(2.6) - ROOF) * smooth01(0.84, 2.6, z) ** 1.1 : BOOM_TOP(z);
  if (z < -3.7) T = -0.62;
  let B = z < -2.94 ? NOSE_BOT(z) : TR_BOT(z); if (z > 7.95) B = -0.1 - (8.02 - z) * 1.5;
  const cock = smooth01(-1.95, -1.75, z);   // the cockpit section is narrower than the cabin (top view step at the crew door's aft edge)
  let W = z < -3.0 ? NOSE_HW(z) : z < 0.8 ? Math.min(1.26, TR_HW(z)) * cock + Math.min(1.14, TR_HW(z)) * (1 - cock) : z < 2.55 ? Math.min(1.26, TR_HW(z)) : BOOM_HW(z);
  if (z >= 0.8 && z < 0.95) W = 1.26 + (TR_HW(0.95) - 1.26) * smooth01(0.8, 0.95, z);
  // section: nose cap round -> cabin squarish -> boom round
  const kn = smooth01(-3.72, -2.95, z), kb = smooth01(0.9, 2.6, z);
  const ymBoom = (T + B) / 2, ym = z < 0.9 ? KEEL_YM : KEEL_YM + (ymBoom - KEEL_YM) * kb;
  const nT = 2.4 + (CAB.nT - 2.4) * kn - (CAB.nT - 2.9) * kb, nB = 2.4 + (CAB.nB - 2.4) * kn - (CAB.nB - 2.7) * kb, lean = CAB.lean * kn * (1 - kb), crown = CAB.crown * kn * (1 - kb);
  if (z < -3.725) W = 0;   // closes the blunt nose face
  return { T, B: Math.min(B, T - 0.02), W: Math.max(0, W), ym: Math.min(T - 0.01, Math.max(B + 0.01, ym)), nT, nB, lean, crown };
}
const FUS_Z = stationList([[-3.735, -3.72, 0.015], [-3.72, -3.6, 0.02], [-3.6, -2.9, 0.035], [-2.9, -1.9, 0.1], [-1.9, 0.8, 0.27], [0.8, 1.0, 0.05], [1.0, 2.7, 0.1], [2.7, 7.7, 0.5], [7.7, 8.02, 0.04]], [-1.85, -1.62, -1.16, 0.8]);
const FUS = stationKeys(FUS_Z, fusAt);
// transmission and engine cowling ("doghouse"): top from the side trace (mast pylon span bridged, the forward vent lip
// ignored), 1.0 m wide from the front view (hw 0.50 at y 0.5 .. 0.62), its bottom following the aft fuselage roof down
const DOG_TOP = pl([[-0.92, 0.47], [-0.8, 0.56], [-0.7, 0.613], [-0.6, 0.663], [-0.5, 0.693], [0.0, 0.74], [0.5, 0.765], [2.1, 0.765], [2.2, 0.715], [2.32, 0.64], [2.42, 0.56], [2.47, 0.5]]);
const DOG_HW = pl([[-0.95, 0.0], [-0.85, 0.32], [-0.7, 0.44], [-0.5, 0.5], [2.1, 0.5], [2.3, 0.42], [2.45, 0.3], [2.5, 0.2]]);
const DOG = stationKeys(stationList([[-0.95, -0.5, 0.05], [-0.5, 2.0, 0.25], [2.0, 2.5, 0.05]]), z => { const T = DOG_TOP(z), B = Math.min(0.4, fusAt(z).T - 0.08); return { T, B, W: DOG_HW(z), ym: Math.min(T - 0.02, Math.max(B + 0.02, 0.56)), nT: 5, nB: 10, lean: 0.04 }; });
// crew doors and windows (side projection [z, y]; hueycockpit.js uses the same outlines so inside and outside agree)
const PD_UP = [[-2.74, -0.44], [-1.97, -0.44], [-1.97, 0.27], [-2.36, 0.27], [-2.74, -0.38]];
const PD_LO = [[-2.74, -0.92], [-2.30, -0.92], [-2.30, -0.56], [-2.74, -0.56]];
const PDOOR = [[-2.86, -1.02], [-1.90, -1.02], [-1.90, 0.335], [-2.40, 0.335], [-2.86, -0.47]];
const pillarZ = y => -2.86 + (y + 0.47) * (0.46 / 0.80);   // A-pillar line (front edge of the crew door), side view
const DOORWAY = { z: -0.18, hz: 0.98, y: -0.41, hy: 0.73 };   // sliding cargo door opening z -1.16 .. 0.80, sill -1.14 to header 0.32
// hinged panel forward of the sliding door, with its window
const HP_WIN = [[-1.56, -0.42], [-1.24, -0.42], [-1.24, 0.12], [-1.56, 0.12]];

// the skin for other modules (hueycockpit.js fits its glare shield and panel to it): surface(), frontAt(y)(x) = the z of
// the inner skin ahead of a point at height y and |x| (the first station whose section contains it, 3 cm inside)
let _skin = null;
export const HUEY_SKIN = {
  surface: () => (_skin ||= bodySurface(FUS)),
  frontAt(y, inset = 0.03) {
    const S = HUEY_SKIN.surface(), zs = [], ws = [];
    for (let z = FUS[0][0]; z < -1.5; z += 0.005) { const p = S.params(z); if (y > p[0] - inset || y < p[1] + inset) { zs.push(z); ws.push(-1); continue; } const P = S.at(z, S.yToPhi(z, y), {}); zs.push(z); ws.push(P.x - inset); }
    return x => { const ax = Math.abs(x); for (let i = 0; i < zs.length; i++) if (ws[i] >= ax) return zs[i]; return -1.5; };
  },
};
// signed distance (m, negative inside) of the cut-outs at a surface point (x, y, z), c = cos(phi) (up-ness)
function holeSDF(z, x, y, c, door = true) {
  const ax = Math.abs(x); let d = 1;
  if (z < -2.3 && y > -0.62 && c > -0.4) {   // windscreen: ahead of the A-pillar, either side of the centre post, below the roof bow
    const lo = -0.30 - 0.30 * (ax / 0.85) ** 2;   // TM front view: -0.3 at the centre post, -0.6 at the sides
    d = Math.max(lo - y, (z - pillarZ(Math.min(y, 0.33))) * 0.6 + 0.03, 0.035 - ax, z - (-2.47 + 0.04 * ax));
  }
  if (c > 0.3) d = Math.min(d, sdBox(ax - 0.6, z + 2.06, 0.33, 0.30, 0.07));                        // greenhouse (roof windows)
  if (Math.abs(c) < 0.92 && z > -2.85 && z < -1.85) d = Math.min(d, sdPoly(z, y, PD_UP), sdPoly(z, y, PD_LO));   // crew door windows
  if (Math.abs(c) < 0.92 && z > -1.6 && z < -1.2) d = Math.min(d, sdPoly(z, y, HP_WIN));            // hinged panel window
  if (c < -0.1 && z < -2.8) d = Math.min(d, sdBox(ax - 0.53, z + 3.24, 0.3, 0.3, 0.1));               // chin bubbles
  if (door && Math.abs(c) < 0.95 && z > DOORWAY.z - DOORWAY.hz - 0.1 && z < DOORWAY.z + DOORWAY.hz + 0.1) d = Math.min(d, sdBox(z - DOORWAY.z, y - DOORWAY.y, DOORWAY.hz, DOORWAY.hy, 0.04));
  return d;
}
const isGlass = (z, y, c) => !(z > DOORWAY.z - DOORWAY.hz - 0.05 && z < DOORWAY.z + DOORWAY.hz + 0.05 && Math.abs(c) < 0.95);

// ------------------------------------------------------------------------------------------- textures
let TEX = null;   // built once, shared by every LOD and every Huey
const OD = [80, 84, 52];          // FS 34087 olive drab, lusterless (sRGB)
const SOOT = [34, 33, 30], OIL = [42, 37, 28], BARE = [104, 104, 96], STENCIL = [24, 24, 21];   // BARE: worn-through primer/metal, dulled
const lerp3 = (o, c, t) => { o.r += (c[0] - o.r) * t; o.g += (c[1] - o.g) * t; o.b += (c[2] - o.b) * t; };
const lineMask = (d, w) => 1 - sstep(w * 0.5, w, Math.abs(d));
function buildTextures(S, D, xr, A) {
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
  const R = xr ? 1 : 1.5;   // 1536 x 768 skin, ~8 mm texels on the cabin (start-up cost ~2 s); XR: 1024 x 512
  // ---- fuselage skin
  const P = {}; let z = 0, prm = null;
  // the skin texture is in arc-length space (hueygeo.arcSpace): one texel density from the nose to the boom
  const skin = bake(1024 * R, 512 * R, (u, v, o) => {
    const phi = A.phiAt(v); if (phi === null) { o.r = OD[0]; o.g = OD[1]; o.b = OD[2]; return; }   // past this section's perimeter: unused
    const side = phi < Math.PI ? 1 : -1, c = Math.cos(phi);
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
    if (c > -0.2 && z < -3.0 && y < -0.3) pl = Math.max(pl, lineMask(sdBox(x, z + 3.36, 0.5, 0.26, 0.08), 0.005));   // nose avionics door
    if (Math.abs(c) < 0.9 && z > 1.05 && z < 2.6) { pl = Math.max(pl, lineMask(sdBox(z - 1.62, y + 0.42, 0.42, 0.22, 0.03), 0.005), lineMask(sdBox(z - 1.62, y + 0.92, 0.42, 0.18, 0.03), 0.005)); }   // aft fuselage access panels
    if (Math.abs(c) < 0.9 && z > 0.84 && z < 2.3) pl = Math.max(pl, lineMask(sdBox(z - 1.55, y + 0.02, 0.62, 0.2, 0.02), 0.005));   // hell-hole panel (gunner's well)
    for (const zs of [-1.88, -1.62, 0.86, 2.62, 3.9, 5.2, 6.5, 7.75]) pl = Math.max(pl, lineMask(z - zs, 0.005));
    if (Math.abs(c) < 0.92 && z > -1.62 && z < -1.16) pl = Math.max(pl, lineMask(z + 1.16, 0.005), lineMask(sdPoly(z, y, HP_WIN), 0.004));   // hinged panel
    if (z > 2.7) pl = Math.max(pl, lineMask(y - (prm[3] + 0.02), 0.005));                        // boom lap joint
    if (c < -0.7 && z > -3.0 && z < 2.5) pl = Math.max(pl, lineMask(ax - 0.62, 0.005));            // belly panels
    const along = Math.abs(c) > 0.7 ? x : y;
    let rv = 0;
    for (const zs of [-1.88, -1.62, 0.86, 2.62, 3.9, 5.2, 6.5, 7.75, -0.6, 0.3, 1.3, 2.0]) {
      const dz = Math.abs(z - zs - 0.014); if (dz < 0.006) { const f = Math.abs(((along / 0.045) % 1 + 1) % 1 - 0.5); if (f < 0.14) rv = Math.max(rv, 1 - dz / 0.006); }
    }
    if (Math.abs(c) < 0.85) for (const ys of [0.1, -0.62]) { const dy = Math.abs(y - ys); if (dy < 0.006 && z > -1.85 && z < 2.6) { const f = Math.abs(((z / 0.045) % 1 + 1) % 1 - 0.5); if (f < 0.14) rv = Math.max(rv, 1 - dy / 0.006); } }
    o.r *= 1 - 0.38 * pl; o.g *= 1 - 0.38 * pl; o.b *= 1 - 0.38 * pl; bump -= 0.3 * pl; bump += 0.22 * rv; o.r += 6 * rv; o.g += 6 * rv; o.b += 5 * rv;
    // oil and hydraulic streaks running down from the transmission deck and the aft fuselage
    let oil = 0;
    if (Math.abs(c) < 0.93 && y < 0.42) {
      const src = z > -0.9 && z < 2.6 ? 0.42 : -9;
      if (src > -9) {
        const fall = (src - y), str = sstep(0.6, 0.9, vnoise(z * 22 + side * 13, 0.3 + fall * 0.6)) * Math.exp(-fall / (z > 1.6 ? 0.9 : 0.45));
        oil = str * (z > 1.6 ? 0.75 : 0.45);
      }
    }
    if (c < -0.5 && z > 1.4 && z < 3.6) oil = Math.max(oil, 0.5 * sstep(0.45, 0.8, nB));   // under the engine
    lerp3(o, OIL, oil); rough -= 0.35 * oil;
    // exhaust soot along the top of the aft fuselage and the boom
    if (z > 2.3 && c > -0.1) {
      const s = Math.exp(-(z - 2.5) / 1.9) * sstep(-0.1, 0.75, c) * (0.55 + 0.45 * nA) * (z < 2.5 ? sstep(2.3, 2.5, z) : 1);
      lerp3(o, SOOT, clamp(s * 0.85, 0, 0.82)); rough += 0.1 * s;
    }
    // worn paint: door sills and edges, the step, the nose, the roof walk
    let wear = 0;
    const dDoor = sdBox(z - DOORWAY.z, y - DOORWAY.y, DOORWAY.hz, DOORWAY.hy, 0.04);
    if (Math.abs(c) < 0.95) wear = Math.max(wear, (1 - sstep(0.0, 0.07, dDoor)) * (y < -0.95 ? 1 : 0.45));
    if (Math.abs(c) < 0.97) wear = Math.max(wear, (1 - sstep(0.0, 0.03, Math.abs(sdPoly(z, y, PDOOR)))) * 0.5);
    if (z < -3.4) wear = Math.max(wear, 0.55 * sstep(-3.4, -3.69, z));
    if (c > 0.85 && z > -0.95 && z < 2.5) wear = Math.max(wear, 0.35);
    if (wear > 0 && nC * 0.6 + nB * 0.4 > 1 - wear * 0.4) { lerp3(o, BARE, 0.6); rough = 0.6; bump -= 0.04; }
    // markings: U.S. ARMY on the boom, data block (left nose), fuel filler (right, aft of the cargo door), GROUND HERE
    if (z > 3.3 && z < 4.9 && Math.abs(c) < 0.6) {
      const tx = side > 0 ? (4.75 - z) / 1.3 : (z - 3.45) / 1.3, ty = (-0.12 - y) / 0.22;
      const m = g.army(tx, ty); if (m > 0) lerp3(o, STENCIL, m * 0.92);
    }
    if (side < 0 && z > -3.2 && z < -2.8 && y > -0.84 && y < -0.66) { const m = g.data((z + 3.2) / 0.4, (-0.66 - y) / 0.18); if (m > 0) lerp3(o, STENCIL, m * 0.9); }
    if (side > 0 && z > 1.0 && z < 1.65 && Math.abs(c) < 0.8) {
      const dc = Math.hypot(z - 1.42, y + 0.25);
      if (dc < 0.075) { const ring = lineMask(dc - 0.065, 0.008); lerp3(o, [52, 54, 40], 0.6); lerp3(o, STENCIL, ring); bump = 0.62 - 0.3 * ring; if (dc < 0.012) lerp3(o, [90, 92, 86], 0.8); }
      const m = g.fuel((1.65 - z) / 0.22, (-0.1 - y) / 0.13); if (z > 1.43 && m > 0) lerp3(o, STENCIL, m * 0.9);
    }
    if (side < 0 && z > -1.62 && z < -1.27 && y < -1.12 && y > -1.2) { const m = g.ground((z + 1.62) / 0.35, (-1.12 - y) / 0.08); if (m > 0) lerp3(o, STENCIL, m * 0.85); }
    // cut-outs: alpha = signed distance ramp; under the glass a dark tinted pane (mid LOD draws no cut-outs)
    const hd = holeSDF(z, x, y, c);
    o.a = clamp(0.5 + hd / 0.03, 0, 1);
    if (hd < 0.02) {
      const gl = isGlass(z, y, c), t = sstep(0.02, -0.01, hd);
      if (gl) { lerp3(o, z > -2.05 && c > 0.3 ? [26, 54, 36] : [34, 46, 46], t); rough = mix(rough, 0.12, t); }
      else { lerp3(o, [26, 28, 24], t); }
    }
    o.bump = bump; o.rough = clamp(rough, 0.3, 1.2) / 1.2;
  }, u => { z = S.z0 + u * (S.z1 - S.z0); prm = S.params(z); A.column(z); });
  // ---- doghouse (transmission and engine cowling)
  const dog = bake(512 * R, 256 * R, (u, v, o) => {
    const phi = v * TAU, side = phi < Math.PI ? 1 : -1, c = Math.cos(phi);
    D.at(z, phi, P); const x = P.x, y = P.y;
    const nA = mix(fbm(z * 1.3, y * 1.3 + side * 7), fbm(z * 1.3 + 3, x * 1.3), c * c), nB = vnoise(z * 30 + side * 5, (c > 0.6 ? x : y) * 30);
    const k = 0.93 + 0.1 * nA; o.r = OD[0] * k * 0.97; o.g = OD[1] * k * 0.98; o.b = OD[2] * k;
    if (c > 0.35) lerp3(o, [114, 113, 88], 0.25 * sstep(0.35, 0.9, c) * (0.5 + nA));
    let bump = 0.5, rough = 1, pl = 0;
    // cowl seams and access doors
    pl = Math.max(pl, lineMask(y - 0.7, 0.005) * (Math.abs(c) < 0.9 ? 1 : 0));
    for (const zs of [-0.6, 0.15, 0.95, 1.9]) pl = Math.max(pl, lineMask(z - zs, 0.005));
    if (Math.abs(c) < 0.9) { pl = Math.max(pl, lineMask(sdBox(z - 1.42, y - 0.56, 0.4, 0.1, 0.03), 0.005)); }
    if (c > 0.6) pl = Math.max(pl, lineMask(Math.abs(x) - 0.3, 0.005) * (z > 0.2 && z < 1.9 ? 1 : 0));
    o.r *= 1 - 0.38 * pl; o.g *= 1 - 0.38 * pl; o.b *= 1 - 0.38 * pl; bump -= 0.3 * pl;
    // engine air intake screens (both sides, aft of the transmission)
    const sd = Math.abs(c) < 0.9 ? sdBox(z - 0.56, y - 0.6, 0.2, 0.11, 0.025) : 1;
    if (sd < 0) {
      const gx = Math.abs(((z / 0.011) % 1 + 1) % 1 - 0.5), gy = Math.abs(((y / 0.011) % 1 + 1) % 1 - 0.5), wire = Math.max(1 - sstep(0.12, 0.25, gx), 1 - sstep(0.12, 0.25, gy));
      o.r = mix(18, 70, wire); o.g = mix(19, 72, wire); o.b = mix(16, 62, wire); bump = 0.3 + 0.25 * wire; rough = 0.9;
    } else if (sd < 0.02) { lerp3(o, [40, 42, 30], 0.6); bump = 0.62; }
    // oil cooler / heat: soot and oil at the aft end, oil around the transmission
    if (z > 1.95) lerp3(o, SOOT, clamp(sstep(1.95, 2.5, z) * (0.5 + 0.5 * nA) * 0.85, 0, 0.85));
    if (z < -0.5 && Math.abs(c) < 0.8) { const s = sstep(0.62, 0.9, vnoise(z * 20 + side * 7, y * 3)) * 0.5; lerp3(o, OIL, s); rough -= 0.3 * s; }
    if (c > 0.7 && z > 0.3 && z < 1.9 && nB > 0.86) { lerp3(o, BARE, 0.45); rough = 0.7; }   // roof walk chips
    if (z > 0.35 && z < 0.95 && c > 0.55) { const m = g.nostep((side > 0 ? (0.95 - z) : (z - 0.35)) / 0.6, (Math.abs(x) - 0.28) / 0.12); /* read from beside the aircraft: letters' tops inboard */ if (m > 0) lerp3(o, STENCIL, m * 0.85); }
    o.bump = bump; o.rough = clamp(rough, 0.3, 1.2) / 1.2;
  }, u => { z = D.z0 + u * (D.z1 - D.z0); });
  // ---- vertical fin (two sides: u < 0.5 right, u >= 0.5 left; u maps to z 7.1..9.1, v to y -0.05..1.70)
  const fin = bake(256 * R, 256 * R, (u, v, o) => {
    const side = u < 0.5 ? 1 : -1, zz = 6.9 + (u % 0.5) * 2 * 2.0, y = -0.05 + v * 1.75;
    const nA = fbm(zz * 1.3, y * 1.3 + side * 7), k = 0.93 + 0.1 * nA; o.r = OD[0] * k; o.g = OD[1] * k; o.b = OD[2] * k;
    let pl = 0; for (const ys of [0.55, 1.05]) pl = Math.max(pl, lineMask(y - ys, 0.005));
    o.r *= 1 - 0.35 * pl; o.g *= 1 - 0.35 * pl; o.b *= 1 - 0.35 * pl; o.bump = 0.5 - 0.3 * pl;
    lerp3(o, SOOT, clamp(0.25 * (1 - sstep(0.05, 0.6, y)) * (0.5 + nA), 0, 0.4));
    const m = g.serial(side > 0 ? (8.5 - zz) / 0.6 : (zz - 7.9) / 0.6, (0.98 - y) / 0.15); if (m > 0) lerp3(o, STENCIL, m * 0.92);
    o.rough = 1 / 1.2;
  });
  // ---- sliding cargo door (u: door-local z -0.98..0.98, v: y 0.36 .. -1.16)
  const door = bake(256 * R, 256 * R, (u, v, o) => {
    const zz = -0.98 + u * 1.96, y = 0.36 - v * 1.52;
    const nA = fbm(zz * 1.3 + 40, y * 1.3), k = 0.93 + 0.1 * nA; o.r = OD[0] * k; o.g = OD[1] * k; o.b = OD[2] * k;
    let pl = lineMask(sdBox(zz, y + 0.41, 0.91, 0.68, 0.05), 0.005), wear = 0;
    pl = Math.max(pl, lineMask(y + 0.55, 0.005));
    o.r *= 1 - 0.35 * pl; o.g *= 1 - 0.35 * pl; o.b *= 1 - 0.35 * pl; let bump = 0.5 - 0.3 * pl, rough = 1;
    const hdl = sdBox(zz + 0.74, y + 0.5, 0.07, 0.035, 0.02); if (hdl < 0) { lerp3(o, [30, 31, 27], 0.8); bump = 0.3; wear = 0.6; }
    wear = Math.max(wear, 1 - sstep(0.0, 0.05, -sdBox(zz, y + 0.41, 0.98, 0.76, 0)));
    if (wear > 0 && vnoise(zz * 40, y * 40) > 1 - wear * 0.5) { lerp3(o, BARE, 0.8); rough = 0.55; }
    const oil = sstep(0.62, 0.9, vnoise(zz * 22, 2 + (0.36 - y) * 0.5)) * Math.exp(-(0.36 - y) / 0.5) * 0.35; lerp3(o, OIL, oil);
    const hd = Math.min(sdBox(zz + 0.415, y + 0.22, 0.35, 0.3, 0.06), sdBox(zz - 0.455, y + 0.22, 0.3, 0.3, 0.06));   // two windows (side view: z -0.95..-0.24, -0.03..0.58)
    o.a = clamp(0.5 + hd / 0.03, 0, 1); if (hd < 0.02) { lerp3(o, [34, 46, 46], sstep(0.02, -0.01, hd)); rough = 0.15; }
    o.bump = bump; o.rough = rough / 1.2;
  });
  // glass masks: the inverse of the cut-outs where glass belongs (u over the nose z -3.7 .. -1.0)
  const glassMask = bake(512 * R, 256 * R, (u, v, o) => {
    const zz = -3.7 + u * 2.7, phi = v * TAU, c = Math.cos(phi); S.at(zz, phi, P);
    const hd = holeSDF(zz, P.x, P.y, c, false); o.r = o.g = o.b = 255; o.a = 1; o.bump = 0.5;
    o.rough = clamp(0.5 - hd / 0.03, 0, 1);   // alphaMap reads .g of aux
  });
  TEX = { skin, dog, fin, door, glassMask, ms: performance.now() - t0 };
  return TEX;
}

// ------------------------------------------------------------------------------------------- materials + LOD
// glass that reads as glass from outside: a Fresnel term (Schlick, n = 1.5) raises the reflectance and opacity at grazing
// angles and mixes in a sky colour, so panes show without an environment map (the game's env adds to it)
function fresnel(m, sky = [0.6, 0.68, 0.74]) {
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { float hyF = 0.04 + 0.96 * pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 5.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${sky.map(v => v.toFixed(3)).join(', ')}), clamp(hyF * 1.4, 0.0, 0.75));
        gl_FragColor.a = mix(gl_FragColor.a, 0.92, clamp(hyF * 1.6, 0.0, 1.0)); }`);
  };
  m.customProgramCacheKey = () => key() + '|hyfres';
  return m;
}
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
  const AS = arcSpace(S), skinUV = (z, p) => AS.uv(z, p), PHK = n => steps(Math.PI, Math.PI + TAU, n);   // keel-seamed rings for the textured skin
  const T = buildTextures(S, Dg, xr, AS);
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
  const glassN = PM('glass', 'n', () => fresnel(rkGlass(() => null, { color: 0x7a968c, opacity: 0.38, alphaMap: T.glassMask.aux, alphaTest: 0.5, side: THREE.DoubleSide })));
  const roofGlassN = PM('roofglass', 'n', () => fresnel(rkGlass(() => null, { color: 0x2f7a46, opacity: 0.66, alphaMap: T.glassMask.aux, alphaTest: 0.5, side: THREE.DoubleSide }), [0.3, 0.5, 0.38]));
  const doorSkinN = PM('door', 'n', role(0xffffff, 'flat', { map: T.door.map, bumpMap: T.door.aux, bumpScale: 1.2, roughnessMap: T.door.aux, alphaTest: 0.5, side: THREE.DoubleSide }, army));
  const doorSkinM = PM('door', 'm', role(0xffffff, 'flat', { map: T.door.map, roughnessMap: T.door.aux }, army));
  const doorGlassN = PM('doorglass', 'n', () => fresnel(rkGlass(() => null, { color: 0x7a968c, opacity: 0.38 })));
  const noseLiningN = PM('noseLining', 'n', role(0x5a5e50, 'flat', { map: T.skin.map, alphaTest: 0.5, side: THREE.BackSide }, { ...DETAIL.army, dust: 0.1, wear: 0, streak: 0 }));
  const liningN = PM('lining', 'n', role(0x50563f, 'flat', { side: THREE.BackSide }, { ...DETAIL.army, dust: 0.15, wear: 0, streak: 0 }));
  const floorN = PM('floor', 'n', role(0x3a3d33, 'rubber', {}, { ...DETAIL.army, dust: 0.3, wear: 0 }));
  const canvasN = PM('canvas', 'n', role(0x5c5f45, 'fabric', { side: THREE.DoubleSide }));
  const B = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });

  const shellG = new THREE.Group(); shellG.name = 'shell';
  const lod0 = new THREE.Group(); lod0.name = 'lodNear'; g.add(lod0); lod0.add(shellG);
  // the nose skin, its glass and frames are shared by the outside and the cockpit (seen from inside through a lining),
  // so the glazing the pilot looks through is exactly the glazing seen from outside; 'shell' only holds the outside
  // stand-ins for the cockpit furniture, hidden while the 3D cockpit (hueycockpit.js) is shown
  const noseG = new THREE.Group(); noseG.name = 'noseShell'; lod0.add(noseG);
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
  // the nose skin (hidden from the cockpit, which has its own) ends at the post behind the crew door, z ZSPLIT
  const ZSPLIT = -1.62, D0 = DOORWAY.z - DOORWAY.hz, D1 = DOORWAY.z + DOORWAY.hz;
  const zNear = stations([[-3.69, -3.4, 0.015], [-3.4, -2.2, 0.04], [-2.2, 0.7, 0.16], [0.7, 2.9, 0.08], [2.9, 7.7, 0.25], [7.7, 8.0, 0.04]], [ZSPLIT, D0 - 0.02, D0, D1, D1 + 0.02, 7.98, 7.995]);
  const phN = PH(72);
  const zN0 = zNear.filter(z => z <= ZSPLIT), zN1 = zNear.filter(z => z >= ZSPLIT);
  const phK = PHK(72);
  mesh(gridGeo(S, zN0, phK, { uv: skinUV }), N.skin, noseG, 'noseSkin');
  mesh(gridGeo(S, zN0, phK, { off: -0.03, uv: skinUV }), noseLiningN, noseG, 'noseLining');
  mesh(gridGeo(S, zN1, phK, { uv: skinUV }), N.skin, lod0, 'fuselage');
  const zMid = stations([[-3.69, -3.4, 0.05], [-3.4, -2.2, 0.15], [-2.2, 0.7, 1.45], [0.7, 2.9, 0.3], [2.9, 7.7, 1.2], [7.7, 8.0, 0.1]]);
  mesh(gridGeo(S, zMid, PHK(40), { uv: skinUV }), Mm.skin, lod1, 'fuselageMid', 'm');
  const zFar = stations([[-3.69, -3.4, 0.14], [-3.4, -2.2, 0.4], [-2.2, 0.7, 2.9], [0.7, 2.9, 0.7], [2.9, 7.7, 4.8], [7.7, 8.0, 0.3]]);
  mesh(gridGeo(S, zFar, PHK(16), { uv: skinUV }), Fm.skin, lod2, 'fuselageFar', 'f');
  // glass (near): the same surface 6 mm inside, masked to the window shapes; green greenhouse over the pilots
  {
    const zg = stations([[-3.6, -1.15, 0.045]]), ph = PH(80), gg = gridGeo(S, zg, ph, { off: -0.006, uv: (z, p) => [(z + 3.7) / 2.7, p / TAU] });
    // groups: quads on the roof behind the windscreen bow -> green
    const idx = gg.index.array, pos = gg.attributes.position.array, clear = [], green = [];
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3; (pos[a + 2] > -2.42 && pos[a + 1] > 0.38 ? green : clear).push(idx[t], idx[t + 1], idx[t + 2]); }
    gg.setIndex([...clear, ...green]); gg.clearGroups(); gg.addGroup(0, clear.length, 0); gg.addGroup(clear.length, green.length, 1);
    const gm = mesh(gg, [glassN, roofGlassN], noseG, 'canopyGlass'); gm.renderOrder = 3;
  }
  // frames around every cut-out (swept along the zero contour of the same field), thick round-edged seals
  {
    const f = (z, ph) => { const P = S.at(z, ph, {}); return holeSDF(z, P.x, P.y, Math.cos(ph)); };
    const lines = contours(f, -3.7, 1.0, 0, TAU, 235, 720);
    const prof = stripProfile(0.05, 0.016, 0.03, 6), profDoor = stripProfile(0.07, 0.02, 0.06, 6);
    for (const L of lines) {
      const zc = L.pts.reduce((s, p) => s + p[0], 0) / L.pts.length, isDoorway = zc > -1.2;
      const geo = surfStrip(S, L, isDoorway ? profDoor : prof, 0.04);
      put(geo, isDoorway ? N.od2 : N.dark, isDoorway ? lod0 : noseG);
    }
  }
  // interior lining of the cabin (back faces, holes at the doorways) to the aft cabin bulkhead, the transmission support
  // structure between the cant bulkheads with the wells either side, floor, and the TM 55-1520-210-23 troop seating
  // (hueycabin.js: five across facing forward, two-man well seats facing outboard, two folding seats behind the crew)
  const REAR = CABIN.REAR, AFT = CABIN.AFT, WX = CABIN.WELL_X;
  {
    const pT = S.yToPhi(0, DOORWAY.y + DOORWAY.hy), pB = S.yToPhi(0, DOORWAY.y - DOORWAY.hy);
    const ph = steps(0, TAU, 80, [pT, pB, TAU - pT, TAU - pB]), zl = steps(ZSPLIT, AFT, 26, [D0, D1, -1.56, -1.24]);
    const pW0 = S.yToPhi(-1.4, 0.12), pW1 = S.yToPhi(-1.4, -0.42);   // the hinged panel's window
    const inDoor = (z, p) => (z > D0 && z < D1 && ((p > pT && p < pB) || (p > TAU - pB && p < TAU - pT))) || (z > -1.56 && z < -1.24 && ((p > pW0 && p < pW1) || (p > TAU - pW1 && p < TAU - pW0)));
    const geo = gridGeo(S, zl, ph, { off: -0.04, keep: (i, j) => !inDoor((zl[i] + zl[i + 1]) / 2, (ph[j] + ph[j + 1]) / 2) });
    mesh(geo, liningN, lod0, 'cabinLining');
    const wallM = PM('wall', 'n', role(0x50563f, 'flat', { side: THREE.DoubleSide }, { ...DETAIL.army, dust: 0.12, wear: 0, streak: 0 }));
    const rw = []; for (let k = 0; k <= 64; k++) { const P = S.at(AFT, TAU * k / 64, {}); rw.push(new THREE.Vector2(P.x * 0.965, P.y * 0.98 - 0.006)); }
    put(new THREE.ShapeGeometry(new THREE.Shape(rw), 1).translate(0, 0, AFT), wallM);   // aft cabin bulkhead (FS 166)
    // the transmission support structure: a box from the floor to the roof between the cant bulkheads (FS 127.5 - 166)
    const roofY = S.params(REAR)[0] - 0.09;
    put(rbox(2 * WX, roofY + 1.05, AFT - REAR, 0.04).translate(0, (roofY - 1.05) / 2, (REAR + AFT) / 2), wallM);
    put(rbox(2.34, 0.05, AFT - ZSPLIT, 0.01).translate(0, -1.075, (AFT + ZSPLIT) / 2), floorN);
    // floor tie-down rings
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) put(new THREE.TorusGeometry(0.022, 0.005, 5, 10).rotateX(Math.PI / 2).translate(-0.75 + i * 0.5, -1.045, -1.5 + k * 0.42), N.metal);
    // canvas seat: a sagging pan between tube rails
    const benchSeat = (x0, x1, y, z0, z1, sag, rows = 6, cols = 14) => {
      const pos = [], idx = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const u = i / cols, v = j / rows, s = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * sag; pos.push(mix(x0, x1, u), y - s, mix(z0, z1, v)); }
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setIndex(idx); q.computeVertexNormals(); return q;
    };
    const belt = PM('belt', 'n', role(0x6a684c, 'fabric')), SY = CABIN.SEAT_Y;
    // five across against the transmission support: two two-man seats with backs, a one-man seat without, between
    const B0 = REAR - 0.43, B1 = REAR - 0.03;
    for (const [x0, x1, backed] of /** @type {[number, number, boolean][]} */ ([[-1.06, -0.21, true], [-0.2, 0.2, false], [0.21, 1.06, true]])) {
      put(benchSeat(x0, x1, SY, B0, B1, 0.03), canvasN);
      put(rod([x0, SY, B0], [x1, SY, B0], 0.016, 8), N.alum); put(rod([x0, SY, B1], [x1, SY, B1], 0.016, 8), N.alum);
      for (const x of [x0 + 0.03, x1 - 0.03]) put(rod([x, -1.05, B0 + 0.02], [x, SY, B0 + 0.02], 0.014, 8), N.alum);
      if (backed) { const bk = benchSeat(x0, x1, 0, 0, 1, 0.02); bk.rotateX(-Math.PI / 2).translate(0, SY + 0.05, REAR - 0.02); put(bk, canvasN); put(rod([x0, 0.05, REAR - 0.015], [x1, 0.05, REAR - 0.015], 0.016, 8), N.alum); }
    }
    for (const T of TROOP_SEATS) if (T.kind === 'bench') put(tube([[T.x - 0.12, SY, B1], [T.x - 0.1, SY - 0.08, B1 - 0.1], [T.x - 0.1, -0.9, B0 + 0.06]], 0.012, 8, 4), belt);
    // two-man well seats without backs, along the transmission support's sides, facing outboard
    for (const s of [-1, 1]) {
      const x0 = s * (WX + 0.02), x1 = s * (WX + 0.4), z0 = REAR + 0.06, z1 = AFT - 0.06;
      put(benchSeat(Math.min(x0, x1), Math.max(x0, x1), SY, z0, z1, 0.025, 6, 8), canvasN);
      for (const x of [x0, x1]) put(rod([x, SY, z0], [x, SY, z1], 0.016, 8), N.alum);
      for (const z of [z0 + 0.03, z1 - 0.03]) put(rod([x1, -1.05, z], [x1, SY, z], 0.014, 8), N.alum);
      put(rbox(0.05, 0.4, z1 - z0, 0.02).translate(s * (WX + 0.025), SY + 0.28, (z0 + z1) / 2), PM('quilt', 'n', role(0x5d6248, 'fabric')));   // back pad on the structure
    }
    // two single folding seats with backs just aft of the crew seats, facing aft
    for (const T of TROOP_SEATS) if (T.kind === 'fold') {
      const z0 = T.z - 0.2, z1 = T.z + 0.2;
      put(benchSeat(T.x - 0.22, T.x + 0.22, SY, z0, z1, 0.025, 5, 8), canvasN);
      const bk = benchSeat(T.x - 0.22, T.x + 0.22, 0, 0, 1, 0.02); bk.rotateX(-Math.PI / 2).translate(0, SY + 0.05, z0 - 0.0).rotateY(0); put(bk.scale(1, 0.85, 1).translate(0, 0.0, 0), canvasN);
      for (const dx of [-0.22, 0.22]) { put(rod([T.x + dx, -1.05, z1 - 0.03], [T.x + dx, SY, z1 - 0.03], 0.014, 8), N.alum); put(rod([T.x + dx, SY, z0], [T.x + dx, SY + 0.6, z0], 0.014, 8), N.alum); }
    }
    // soundproofing quilt pads on the transmission support's face
    for (const x of [-0.31, 0.31]) put(rbox(0.56, 0.5, 0.05, 0.02).translate(x, 0.05, REAR - 0.03), PM('quilt', 'n', role(0x5d6248, 'fabric')));
    // fire extinguisher and first aid kit on the hinged panels forward of the doors
    put(lathe([[0, 0], [0.05, 0], [0.055, 0.02], [0.055, 0.3], [0.04, 0.34], [0.015, 0.36], [0, 0.37]], 14).translate(1.07, -1.0, -1.42), PM('redp', 'n', role(0xa4261a, 'paint')));
    put(rbox(0.08, 0.14, 0.22, 0.015).translate(-1.13, -0.1, -1.4), N.od2);
  }

  let heatM = null;   // exhaust glow (set in the block below, read by animate)
  // ======================================================================== doghouse, cowling, exhaust, boom cover
  {
    const zd = stations([[-0.97, -0.6, 0.03], [-0.6, 1.9, 0.12], [1.9, 2.5, 0.04]]);
    const dg = gridGeo(Dg, zd, PH(64)); mesh(dg, N.dog, lod0, 'doghouse');
    mesh(gridGeo(Dg, stations([[-0.97, -0.6, 0.12], [-0.6, 1.9, 0.8], [1.9, 2.5, 0.2]]), PH(24)), Mm.dog, lod1, 'doghouseMid', 'm');
    mesh(gridGeo(Dg, stations([[-0.97, 2.5, 0.7]]), PH(10)), Fm.od, lod2, 'doghouseFar', 'f');
    // aft cap of the cowling (the exhaust collector face) and the oil cooler fairing behind it
    const cap = []; for (let k = 0; k <= 32; k++) { const P = Dg.at(2.499, TAU * k / 32, {}); cap.push(new THREE.Vector2(P.x, P.y)); }
    put(new THREE.ShapeGeometry(new THREE.Shape(cap), 1).translate(0, 0, 2.499), N.dark);
    // the intake screens get a recessed frame, the cowl doors hinges and latches
    for (const s of [-1, 1]) {
      const pts = [], nrm = []; const add = (z, y) => { const ph = Dg.yToPhi(z, y, s), P = Dg.at(z, ph, {}), n = Dg.normal(z, ph, {}); pts.push(V3(P.x, P.y, P.z)); nrm.push(V3(n.x, n.y, n.z)); };
      for (let k = 0; k <= 40; k++) { const t = k / 40 * 4; const e = Math.floor(t), f = t - e, C = [[0.36, 0.49], [0.76, 0.49], [0.76, 0.71], [0.36, 0.71], [0.36, 0.49]]; add(mix(C[e][0], C[Math.min(4, e + 1)][0], f), mix(C[e][1], C[Math.min(4, e + 1)][1], f)); }
      put(sweep(pts, nrm, stripProfile(0.03, 0.012, 0.01, 4), false), N.dark);
      for (const z of [-0.5, 0.1, 1.0, 1.7]) { const ph = Dg.yToPhi(z, 0.7, s), P = Dg.at(z, ph, {}); put(rbox(0.06, 0.025, 0.02, 0.006).translate(P.x + s * 0.004, P.y, P.z), N.black); }
    }
    // tailpipe: a short bent stack pointing up and aft, heat-blued, open
    const exG = group(lod0, 'exhaust', 0, 0.56, 2.36); exG.rotation.x = -0.32;
    const pipe = lathe([[0.2, 0], [0.205, 0.05], [0.215, 0.3], [0.225, 0.42], [0.235, 0.46], [0.218, 0.46], [0.205, 0.3], [0.19, 0.06], [0.185, 0.0]], 24).rotateX(Math.PI / 2);
    mesh(pipe, PM('pipe', 'n', role(0x3d3833, 'grimy', { side: THREE.DoubleSide })), exG, 'tailpipe');
    heatM = B(0x000000); const heat = mesh(new THREE.CircleGeometry(0.19, 20), heatM, exG, 'exhaustGlow'); heat.position.z = 0.12;
    const exM = group(lod1, 'exhaustMid', 0, 0.56, 2.36); exM.rotation.x = -0.32; mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.46, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.23), PM('pipe', 'm', role(0x3d3833, 'grimy', { side: THREE.DoubleSide })), exM, 'tailpipeMid', 'm');
    // drive shaft cover along the top of the boom, in hinged sections
    const cov = []; for (const z of steps(2.62, 6.86, 22)) { const t = S.params(z)[0], ct = Math.max(t + 0.05, Math.min(t + 0.14, TR_SIDE(z))); cov.push([z, ct, t - 0.04, 0.105, t + 0.0, 2.6, 10]); }
    cov.unshift([2.52, S.params(2.52)[0] + 0.02, S.params(2.52)[0] - 0.04, 0.0, S.params(2.52)[0], 2.4, 10]);
    cov.push([6.94, S.params(6.94)[0] + 0.02, S.params(6.94)[0] - 0.04, 0.0, S.params(6.94)[0], 2.4, 10]);
    const C = bodySurface(cov);
    mesh(gridGeo(C, stations([[2.52, 2.67, 0.03], [2.67, 6.8, 0.25], [6.8, 6.94, 0.03]]), steps(0, TAU, 40)), N.od2, lod0, 'shaftCover');
    mesh(gridGeo(C, stations([[2.52, 6.94, 1.1]]), steps(0, TAU, 10)), Mm.od2, lod1, 'shaftCoverMid', 'm');
    for (const z of [3.6, 4.7, 5.85, 6.95]) { const t = S.params(z)[0]; put(lathe([[0.112, 0], [0.116, 0.004], [0.116, 0.022], [0.112, 0.026]], 16).rotateX(Math.PI / 2).scale(1, 1.0, 1).translate(0, t + 0.0, z), N.dark); }
  }

  // ======================================================================== tail: fin, gearboxes, tail skid, elevator
  // vertical fin: an airfoil loft, two textured sides (serial number both sides)
  // [y, leading edge z, chord, thickness]: swept, from the boom top (z 7.25) to the 90 degree gearbox at the tail rotor hub
  // leading edge traced from the side view (y = 0.226 + 0.92 (z - 7.1)); the trailing edge is hidden by the rotor disc
  const FINS = [[0.06, 6.92, 1.06, 0.15], [0.5, 7.40, 0.88, 0.14], [1.0, 7.94, 0.68, 0.12], [1.4, 8.38, 0.52, 0.11], [1.58, 8.58, 0.38, 0.10], [1.63, 8.63, 0.32, 0.08]];
  const finSide = (sgn, nc, lod) => {
    const pos = [], uv = [], idx = [], ys = []; for (let k = 0; k < FINS.length - 1; k++) for (let j = 0; j < 4; j++) ys.push(k + j / 4); ys.push(FINS.length - 1);
    const cs = steps(0, 1, nc).map(t => 0.5 * (1 - Math.cos(Math.PI * t)));
    const at = q => { const k = Math.min(FINS.length - 2, Math.floor(q)), f = q - k, A = FINS[k], Bf = FINS[k + 1]; return A.map((v, i) => mix(v, Bf[i], f)); };
    for (const q of ys) { const [y, le, ch, t] = at(q); for (const x of cs) { const z = le + x * ch, w = sgn * naca(x, t) * ch; pos.push(w, y, z); uv.push((sgn > 0 ? 0 : 0.5) + (z - 6.9) / 2.0 * 0.5, (y + 0.05) / 1.75); } }
    const W = cs.length; for (let i = 0; i < ys.length - 1; i++) for (let j = 0; j < W - 1; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; if (sgn > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
    const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); q.setIndex(idx); q.computeVertexNormals(); return q;
  };
  mesh(merge([finSide(1, 28), finSide(-1, 28)]), N.fin, lod0, 'fin');
  mesh(merge([finSide(1, 7), finSide(-1, 7)]), Mm.fin, lod1, 'finMid', 'm');
  mesh(merge([finSide(1, 3), finSide(-1, 3)]), Fm.od, lod2, 'finFar', 'f');
  put(airfoilLoft([{ s: 1.61, le: 8.61, chord: 0.35, t: 0.09 }, { s: 1.67, le: 8.66, chord: 0.27, t: 0.07 }], { span: 'y', chord: 'z', thick: 'x', n: 20, capA: false, capB: true }), N.od);   // tip cap
  // tail rotor drive shaft cover up the fin's leading edge, 42 and 90 degree gearboxes
  const [, tY, tZ] = GEO.TR_HUB;
  put(tube([[0, 0.16, 6.98], [0, 0.55, 7.43], [0, 1.05, 7.98], [0, tY, tZ - 0.24]], 0.062, 24, 14), N.od2);
  put(lathe([[0, -0.2], [0.1, -0.18], [0.16, -0.08], [0.17, 0.08], [0.13, 0.2], [0.07, 0.26], [0, 0.27]], 18).scale(1, 1, 0.9).rotateX(Math.PI / 2 - 0.5).translate(0, 0.14, 6.9), N.od2);   // 42 deg gearbox fairing
  const sd = GEO.TR_SIDE;
  put(lathe([[0, 0], [0.13, 0], [0.155, 0.04], [0.16, 0.14], [0.14, 0.24], [0.1, 0.3], [0.05, 0.32], [0, 0.32]], 18).rotateZ(-sd * Math.PI / 2).translate(sd * 0.02, tY, tZ + 0.02), N.od2);   // 90 deg gearbox (output face toward the rotor)
  put(lathe([[0, -0.14], [0.12, -0.12], [0.15, 0], [0.12, 0.12], [0, 0.15]], 16).scale(0.8, 1, 1.25).translate(-sd * 0.02, tY, tZ + 0.06), N.od2);
  // tail skid (stinger) under the boom end, nearly level, braced back to the boom
  put(tube([[0, -0.12, 7.6], [0, -0.22, 7.95], [0, -0.28, 8.4], [0, -0.29, 8.86]], 0.035, 20, 10), N.steel);
  put(tube([[0, -0.02, 8.0], [0, -0.16, 8.3], [0, -0.28, 8.55]], 0.028, 16, 10), N.steel);
  put(new THREE.SphereGeometry(0.042, 12, 8).translate(0, -0.29, 8.87), N.steel);
  // synchronized elevator: inverted cambered airfoil, rounded tips; pivots with the cyclic
  const EL = GEO.ELEV, elevG = group(g, 'elevator', 0, EL.y, EL.z + EL.chord * 0.25), hs = EL.span / 2, ec = EL.chord, el = -0.25 * ec;
  const ELV = sp => sp.map(([s, ch, le]) => ({ s, chord: ch, le, t: 0.13 }));
  const elevStations = ELV([[-hs, ec * 0.5, el * 0.45], [-hs + 0.05, ec * 0.83, el * 0.8], [-hs + 0.16, ec * 0.98, el], [0, ec, el], [hs - 0.16, ec * 0.98, el], [hs - 0.05, ec * 0.83, el * 0.8], [hs, ec * 0.5, el * 0.45]]);
  mesh(airfoilLoft(elevStations, { span: 'x', chord: 'z', thick: 'y', n: 28, camber: -0.02, capA: true, capB: true }), N.od2, elevG, 'elevatorSkin');
  mesh(airfoilLoft([elevStations[0], elevStations[3], elevStations[6]], { span: 'x', chord: 'z', thick: 'y', n: 8, camber: -0.02, capA: true, capB: true }), MF.od2, elevG, 'elevatorLow', 'mf');
  mesh(rod([0, 0, 0], [0, -0.1, 0], 0.04, 10).translate(0, 0.06, 0), N.dark, elevG, 'elevatorRoot');

  // ======================================================================== skids
  // skid tubes (8 ft 6.6 in track) with the upturned toe, cross tubes arched up into the belly saddles (front view)
  const SK = GEO.SKID, sx = SK.x, [cz0, cz1] = SK.cross;
  const skid = (s, rr) => tube([[s * sx, -1.50, SK.z0 - 0.04], [s * sx, -1.58, SK.z0 + 0.04], [s * sx, -1.69, SK.z0 + 0.2], [s * sx, -1.775, SK.z0 + 0.45], [s * sx, -1.795, SK.z0 + 0.8], [s * sx, -1.795, cz0], [s * sx, -1.795, cz1], [s * sx, -1.792, SK.z1 - 0.12], [s * sx, -1.775, SK.z1]], 0.051, rr ? 64 : 16, rr ? 14 : 6);
  const crossPts = z => { const yb = S.params(z)[1] - 0.075; return [[-sx, -1.795, z], [-sx + 0.01, -1.66, z], [-sx + 0.05, -1.56, z], [-sx + 0.15, -1.49, z], [-0.85, yb - 0.025, z], [-0.5, yb, z], [0, yb, z], [0.5, yb, z], [0.85, yb - 0.025, z], [sx - 0.15, -1.49, z], [sx - 0.05, -1.56, z], [sx - 0.01, -1.66, z], [sx, -1.795, z]]; };
  for (const s of [-1, 1]) {
    put(skid(s, true), N.od);
    put(new THREE.SphereGeometry(0.051, 14, 8).translate(s * sx, -1.775, SK.z1), N.od);
    put(lathe([[0, 0], [0.05, 0], [0.051, 0.01], [0, 0.012]], 14).rotateX(Math.PI / 2).rotateX(0.5).translate(s * sx, -1.495, SK.z0 - 0.05), N.od);
    put(rbox(0.07, 0.016, SK.z1 - SK.z0 - 0.75, 0.006).translate(s * sx, -1.838, (SK.z0 + 0.65 + SK.z1 - 0.1) / 2), N.alum);   // skid shoe (wear plate)
    for (const z of [cz0, cz1]) put(lathe([[0.057, -0.06], [0.061, 0], [0.057, 0.06]], 16).rotateZ(Math.PI / 2).scale(0.8, 1, 1).translate(s * sx, -1.795, z), N.dark);   // saddles
    // boarding step on the forward cross tube, outboard on its arch
    put(tube([[s * (sx - 0.1), -1.52, cz0 - 0.13], [s * (sx + 0.05), -1.56, cz0 - 0.13], [s * (sx + 0.05), -1.56, cz0 + 0.13], [s * (sx - 0.1), -1.52, cz0 + 0.13]], 0.016, 16, 8), N.alum);
    put(rbox(0.12, 0.012, 0.24, 0.004).translate(s * (sx + 0.0), -1.55, cz0), N.dark);
    mesh(skid(s, false), Mm.od, lod1, 'skidMid', 'm');
  }
  for (const z of [cz0, cz1]) { put(tube(crossPts(z), 0.055, 48, 14), N.od); mesh(tube(crossPts(z), 0.055, 10, 5), Mm.od, lod1, 'crossMid', 'm');
    const yb = S.params(z)[1]; for (const s of [-1, 1]) put(rbox(0.22, 0.12, 0.18, 0.02).translate(s * 0.6, yb - 0.03, z), N.dark); }   // belly attach fittings (saddles)
  // kick-in steps and handholds up the side to the roof (behind the cargo door)
  for (const s of [-1, 1]) {
    const on = (z, y, o = 0) => { const P = S.at(z, S.yToPhi(z, y, s), {}); return [P.x + s * o, P.y, z]; };
    for (const [y, z] of [[-0.6, 0.98], [-0.05, 1.0]]) { const p = on(z, y, -0.005); put(rbox(0.012, 0.05, 0.14, 0.006).translate(p[0], p[1], p[2]), N.black); }
    put(tube([on(0.92, 0.2), on(0.97, 0.21, 0.04), on(1.15, 0.21, 0.04), on(1.2, 0.2)], 0.011, 12, 6), N.metal);
    put(tube([on(-1.5, 0.42), on(-1.45, 0.43, 0.04), on(-1.25, 0.43, 0.04), on(-1.2, 0.42)], 0.011, 12, 6), N.metal);
  }

  // ======================================================================== sliding cargo doors (both sides) and rails
  const DZ = DOORWAY.z, DOOR_PH = [S.yToPhi(DZ, 0.36), S.yToPhi(DZ, -1.16)], DOOR_RUN = 1.82;   // open: the door's front edge stops just aft of the M60D pintle
  const doorGeo = (n, uvOn) => gridGeo(S, steps(DZ - 0.98, DZ + 0.98, n), steps(DOOR_PH[0], DOOR_PH[1], Math.round(n * 0.7)), { off: 0.024, uv: uvOn ? (z, p) => { const P = S.at(DZ, p, {}); return [(z - DZ + 0.98) / 1.96, (0.36 - P.y) / 1.52]; } : null });
  const doors = [];
  for (const s of [-1, 1]) {
    const dg = group(lod0, s > 0 ? 'cargoDoorR' : 'cargoDoorL');
    let skinG = doorGeo(24, true), glassG = gridGeo(S, steps(DZ - 0.8, DZ + 0.79, 8), steps(S.yToPhi(DZ, 0.1), S.yToPhi(DZ, -0.54), 6), { off: 0.016 });
    if (s < 0) { skinG = mirrorX(skinG); glassG = mirrorX(glassG); }
    mesh(skinG, doorSkinN, dg, 'cargoDoor'); const dgl = mesh(glassG, doorGlassN, dg, 'cargoDoorGlass'); dgl.renderOrder = 3;
    put(rbox(0.03, 0.05, 0.16, 0.01).translate(s * 1.25, -0.5, DZ - 0.74), N.black, dg);   // handle
    for (const z of [-0.85, 0.85]) { put(rbox(0.05, 0.05, 0.08, 0.015).translate(s * 1.23, 0.38, DZ + z), N.dark, dg); put(rbox(0.05, 0.05, 0.08, 0.015).translate(s * 1.235, -1.18, DZ + z), N.dark, dg); }   // rollers
    const dgm = group(lod1, s > 0 ? 'cargoDoorRMid' : 'cargoDoorLMid'); let mg = doorGeo(6, true); if (s < 0) mg = mirrorX(mg); mesh(mg, doorSkinM, dgm, 'cargoDoorMid', 'm');
    doors.push(dg, dgm);
    // rails: upper along the roof edge, lower along the floor line
    // rails: straight, from the door's front to its open position; brackets back to the skin where it tapers away
    const rz0 = DZ - 1.0, rz1 = DZ + 0.98 + DOOR_RUN;
    for (const [y, x, zEnd] of [[0.40, 1.225, rz1], [-1.19, 1.235, 1.45]]) {   // the lower rail stops where the belly curves away
      put(rbox(0.05, 0.035, zEnd - rz0, 0.012).translate(s * x, y, (rz0 + zEnd) / 2), N.steel);
      for (const z of steps(rz0 + 0.05, zEnd - 0.05, y > 0 ? 5 : 3)) { const P = S.at(z, S.yToPhi(z, clamp(y, S.params(z)[1] + 0.06, S.params(z)[0] - 0.06), s), {}), a = V3(s * x, y, z), b = V3(P.x, P.y, z); if (a.distanceTo(b) > 0.03) put(rod(a, b, 0.016, 8), N.steel); }
    }
  }

  // ======================================================================== cockpit as seen from outside (shell)
  {
    // instrument panel shroud and glare shield, pedestal, overhead console, armoured seats, cyclics
    put(rbox(2.0, 0.5, 0.12, 0.03).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.25)).translate(0, -0.4, -2.68), N.black, shellG);
    put(rbox(2.06, 0.04, 0.32, 0.018).translate(0, -0.12, -2.8), N.black, shellG);
    put(rbox(0.36, 0.42, 0.85, 0.03).translate(0, -0.85, -2.05), N.dark, shellG);
    put(rbox(0.36, 0.11, 0.7, 0.03).translate(0, 0.41, -1.9), N.dark, shellG);
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
    put(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.38, 0.02), new THREE.Vector2(0.36, 0.06), new THREE.Vector2(0.02, 0.1)]), { depth: 0.012, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-0.006, 0.49, -2.08), wsp, noseG);
    put(tube([-3.12, -2.98, -2.84, -2.7, -2.56, -2.44].map(z => [0, S.params(z)[0] + 0.022, z]), 0.012, 20, 6), wsp, noseG);
    put(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.34, 0.0), new THREE.Vector2(0.3, -0.05), new THREE.Vector2(0.02, -0.06)]), { depth: 0.012, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.006, S.params(-3.3)[1] + 0.01, -3.58), wsp, noseG);
    put(rod([0.32, 0.495, -2.2], [0.32, 0.63, -2.28], 0.012, 8), N.metal, noseG); put(rod([0.32, 0.63, -2.25], [0.32, 0.63, -2.68], 0.009, 8), N.metal, noseG);   // pitot on the roof
    for (const px of [0.32, -0.32]) {   // two pitot tubes on the roof (TM -10 fig. 2-1 items 10 and 27)
      if (px < 0) { put(rod([px, 0.495, -2.2], [px, 0.63, -2.28], 0.012, 8), N.metal, noseG); put(rod([px, 0.63, -2.25], [px, 0.63, -2.68], 0.009, 8), N.metal, noseG); }
      put(lathe([[0, 0], [0.012, 0.0], [0.012, 0.06], [0, 0.07]], 8).rotateX(-Math.PI / 2).translate(px, 0.63, -2.68), N.metal, noseG); }
    // cabin roof air scoop forward of the doghouse (the side trace's bump at FS 100-104; heater / ventilating air intake)
    put(rbox(0.34, 0.1, 0.2, 0.04).translate(0, ROOF + 0.045, -0.9), N.od2); put(rbox(0.26, 0.05, 0.012, 0.01).translate(0, ROOF + 0.05, -1.0), N.black);
    for (const s of [-1, 1]) { const P = S.at(-3.36, S.yToPhi(-3.36, -0.66, s), {}); put(rbox(0.012, 0.06, 0.12, 0.005).translate(P.x + s * 0.003, P.y, -3.36), N.black, noseG); }   // nose ventilation louvres
    // crew door hinges and handles (outside)
    for (const s of [-1, 1]) { for (const y of [-0.85, -0.05]) { const z = pillarZ(Math.min(y, -0.47)) + 0.03, P = S.at(z, S.yToPhi(z, y, s), {}); put(rbox(0.025, 0.06, 0.05, 0.008).translate(P.x + s * 0.006, y, z), N.dark, noseG); }
      put(rbox(0.025, 0.035, 0.14, 0.01).translate(s * 1.225, -0.5, -2.05), N.black, noseG); }
  }

  // ======================================================================== antennas, lights
  const ant = PM('ant', 'n', role(0x1c1d1a, 'dark'));
  // VHF whip on the cowling, FM homing / communication antennas, belly UHF blade, the ADF sense antenna
  put(lathe([[0.025, 0], [0.012, 0.03], [0.005, 0.06], [0.003, 0.9], [0, 0.92]], 8).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.6)).translate(0, 0.765, 1.5), ant);
  const blade = (h, c0, c1, sweepB) => new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(c0, 0), new THREE.Vector2(c0 - (c0 - c1) * 0.3 + sweepB, h), new THREE.Vector2(sweepB, h)]), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 2 });
  put(smoothGeo(blade(0.28, 0.32, 0.14, 0.14)).rotateY(-Math.PI / 2).rotateZ(Math.PI).translate(0.006, S.params(-0.75)[1] + 0.01, -0.6), ant);   // UHF blade under the belly
  put(smoothGeo(blade(0.22, 0.24, 0.12, 0.1)).rotateY(-Math.PI / 2).translate(-0.006, S.params(4.6)[0] + 0.0, 4.4), ant);   // transponder blade on the boom
  for (const s of [-1, 1]) {   // towel-bar FM antennas on the boom
    put(tube([[s * 0.22, S.params(5.5)[0] - 0.03, 5.5], [s * 0.24, S.params(5.5)[0] + 0.04, 5.55], [s * 0.24, S.params(6.4)[0] + 0.04, 6.35], [s * 0.22, S.params(6.4)[0] - 0.03, 6.4]], 0.01, 24, 6), ant);
  }
  put(rod([0, S.params(1.0)[1] + 0.01, 1.0], [0, -1.6, 1.3], 0.008, 6), ant);   // belly whip (FM homing sense)
  put(rbox(0.3, 0.04, 0.5, 0.02).translate(0, S.params(1.55)[1] - 0.01, 1.55), N.dark);   // ADF loop housing under the cabin
  // APR-39 radar warning spirals: nose (forward-out) and boom end (aft-out)
  for (const s of [-1, 1]) for (const [p, n] of [[[s * 0.74, -0.5, -3.42], [s * 0.7, 0, -0.7]], [[s * 0.11, 0.0, 7.97], [s * 0.6, 0, 0.8]]]) {
    const a = V3(...p), nn = V3(...n).normalize();
    put(alignY(lathe([[0.055, 0], [0.058, 0.02], [0.05, 0.04], [0.0, 0.045]], 16), a, a.clone().add(nn)), N.dark);
  }
  // landing light (belly, forward) and searchlight, beam
  const lensM = B(0x3a3a34), lens = mesh(new THREE.CircleGeometry(0.105, 20), lensM, lod0, 'landingLight');
  const LL = V3(0, S.params(-2.95)[1] - 0.02, -2.95); lens.position.copy(LL); lens.lookAt(0, LL.y - 0.8, -3.6);
  put(lathe([[0.11, 0], [0.13, 0.0], [0.135, 0.06], [0.12, 0.09], [0.11, 0.09]], 20).rotateX(-Math.PI / 2).applyMatrix4(new THREE.Matrix4().compose(LL, lens.quaternion, V3(1, 1, 1))).translate(0, 0.005, 0.005), N.dark);
  const beamM = B(0xfff2c0, { transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const beam = mesh(new THREE.CylinderGeometry(1.3, 0.1, 7, 16, 1, true).translate(0, 3.55, 0).rotateX(-Math.PI / 2), beamM, lens, 'landingBeam'); beam.rotation.y = Math.PI;
  { const y = S.at(-2.35, S.xToPhi(-2.35, 0.35, false, -1), {}).y; put(lathe([[0, -0.06], [0.08, -0.05], [0.1, 0.0], [0.1, 0.05], [0, 0.06]], 16).translate(-0.35, y - 0.04, -2.35), N.dark);   // searchlight housing (stowed)
    put(new THREE.CircleGeometry(0.075, 16).rotateX(Math.PI / 2).translate(-0.35, y - 0.105, -2.35), PM('lens', 'n', role(0xb8b8a8, 'lamp'))); }
  // anti-collision beacons (doghouse aft top, belly) and position lights (red left, green right, white tail)
  const beaconM = B(0xff2414), beaconOffM = PM('beacon', 'n', role(0x6a140e, 'lamp', { transparent: true, opacity: 0.9 }));
  const beacons = [[0, Dg.params(1.75)[0] + 0.01, 1.75], [0, S.params(1.25)[1] - 0.01, 1.25]].map(([x, y, z], i) => {
    put(lathe([[0.07, 0], [0.075, 0.02], [0.06, 0.03]], 16).rotateX(i ? Math.PI : 0).translate(x, y + (i ? 0.01 : -0.01), z), N.dark);
    const h = mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, TAU, 0, Math.PI / 2).rotateX(i ? Math.PI : 0), beaconOffM, lod0, 'beacon'); h.position.set(x, y + (i ? -0.02 : 0.02), z); return h;
  });
  const navR = B(0xff2a1a), navG = B(0x2aff5a), navOff = PM('navoff', 'n', role(0x4a4a46, 'lamp'));
  const roofNav = s => { const P = S.at(-0.75, S.xToPhi(-0.75, 1.08, true, s), {}); return [P.x + s * 0.02, P.y + 0.02, -0.75]; };
  const navs = [[...roofNav(-1), navR], [...roofNav(1), navG], [-1.235, -1.0, -1.5, navR], [1.235, -1.0, -1.5, navG], [0, -0.02, 8.02, B(0xffffff)]].map(([x, y, z, m]) => {
    const o = mesh(new THREE.SphereGeometry(0.035, 12, 6), navOff, lod0, 'navLight'); o.position.set(x, y, z); o.scale.set(1, 0.8, 1.6); o.userData.on = m; return o;
  });

  // ======================================================================== weapons: M158 pods, M60D door guns, crew
  const PR = GEO.POD_R, PLh = GEO.POD_L / 2, TS = 0.079;   // tube pitch: 2.75 in rockets in 2.9 in tubes
  const HEX = [[0, 0], ...Array.from({ length: 6 }, (_, i) => [TS * Math.cos(i * Math.PI / 3 + Math.PI / 6), TS * Math.sin(i * Math.PI / 3 + Math.PI / 6)])];
  const rnoseG = lathe([[0, 0.1], [0.012, 0.085], [0.028, 0.04], [0.034, 0]], 10).rotateX(-Math.PI / 2), noseM = PM('rnose', 'n', role(0x8c8a62, 'paint')), pods = [];
  const podProf = [[0, -PLh], [PR - 0.02, -PLh], [PR, -PLh + 0.025], [PR + 0.004, -PLh + 0.06], [PR, -PLh + 0.08], [PR, PLh - 0.22], [PR + 0.004, PLh - 0.2], [PR + 0.004, PLh - 0.15], [PR - 0.012, PLh - 0.1], [PR * 0.6, PLh - 0.03], [PR * 0.28, PLh], [0, PLh + 0.01]];
  for (const [px, py, pz] of GEO.PODS) {
    const s = Math.sign(px), z0 = pz - PLh, yb = S.params(pz)[1] + 0.25;   // floor-level hard point on the fuselage side
    put(lathe(podProf, 24).rotateX(Math.PI / 2).translate(px, py, pz), N.od2);
    put(lathe(podProf.filter((_, i) => i % 2 === 0), 8).rotateX(Math.PI / 2).translate(px, py, pz), Mm.od2, lod1, 'm');
    for (const [hx, hy] of HEX) put(new THREE.CircleGeometry(0.036, 12).rotateY(Math.PI).translate(px + hx, py + hy, z0 - 0.002), N.black);
    for (const z of [z0 + 0.1, pz + PLh - 0.2]) put(lathe([[PR, -0.02], [PR + 0.007, -0.012], [PR + 0.007, 0.012], [PR, 0.02]], 24).rotateX(Math.PI / 2).translate(px, py, z), N.dark);
    put(rbox(0.07, 0.07, 0.7, 0.015).translate(px, py + PR + 0.03, pz), N.dark);                                        // suspension lugs / rack
    const P = S.at(pz, S.yToPhi(pz, py + PR + 0.06, s), {});
    put(rbox(Math.abs(px - P.x), 0.08, 0.14, 0.02).translate((px + P.x) / 2, py + PR + 0.07, pz), N.od);               // the mount's arm out to the rack
    put(rod([P.x - s * 0.02, yb, pz + 0.3], [px - s * 0.05, py + PR + 0.05, pz + 0.05], 0.022, 10), N.od);               // drag brace
    put(rbox(0.06, 0.18, 0.22, 0.02).translate(P.x + s * 0.02, py + PR + 0.07, pz), N.dark);                            // hard point fitting
    const noses = HEX.map(([hx, hy]) => { const m = mesh(rnoseG, noseM, lod0, 'rocket'); m.position.set(px + hx, py + hy, z0 + 0.03); return m; });
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
  const [gx, gy, gz] = GEO.GUN;
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
  const gunnerG = group(lod0, 'gunner', CABIN.CREW[0], -0.74, CABIN.CREW[1]);   // on the aft place of the left well seat
  if (FIG) { const m = new THREE.Mesh(crewGeometry('heloPilot', 'seated', { arms: 'controls', seed: 4 }), crewMaterial()); m.rotation.y = Math.PI; m.name = 'gunnerBody'; gunnerG.add(m); }
  const yawR = group(lod0, 'doorGunR', -gx, gy, gz); yawR.rotation.y = -Math.PI / 2; const pR = group(yawR, 'gunPitchR'); pR.rotation.x = -0.35;
  { const loc = new Map(); m60((geo, m) => (loc.get(m) || loc.set(m, []).get(m)).push(geo)); for (const [m, gs] of loc) mesh(merge(gs), m, pR, 'm60RParts'); }
  const chief = group(lod0, 'crewChief', -CABIN.CREW[0], -0.74, CABIN.CREW[1]); chief.rotation.y = -Math.PI / 2;
  if (FIG) { const m = new THREE.Mesh(crewGeometry('heloPilot', 'seated', { arms: 'controls', seed: 2 }), crewMaterial()); m.rotation.y = Math.PI; m.name = 'crewChiefBody'; chief.add(m); }
  // mid LOD: crew silhouettes as the same figures (no dissolve on the shared crew material: toggled at the far switch)

  // ======================================================================== main rotor
  const mast = group(g, 'mast', ...GEO.HUB); mast.rotation.x = -HUEY.MAST_TILT;
  { // mast tube with the "Jesus nut", the boot where it leaves the cowling, control tubes up to the swashplate
    const mb = new Map(), mp = (geo, m) => (mb.get(m) || mb.set(m, []).get(m)).push(geo);
    mp(lathe([[0.078, -1.26], [0.078, 0.12], [0.07, 0.14], [0.07, 0.2]], 20), N.metal);
    mp(lathe([[0, 0.2], [0.085, 0.2], [0.09, 0.22], [0.09, 0.27], [0.06, 0.3], [0, 0.31]], 20), N.steel);   // mast nut
    mp(lathe([[0.2, -1.25], [0.17, -1.19], [0.13, -1.13], [0.1, -1.09], [0.085, -1.05]], 20), N.rubber);     // mast boot
    mp(rbox(0.5, 0.2, 0.46, 0.07).translate(0, -1.28, 0.02), N.od2);                                      // transmission top / pylon support fairing
    for (const a of [0, 2.1, 4.2]) { const x = Math.cos(a) * 0.2, z = Math.sin(a) * 0.2; mp(rod([x, -1.2, z], [x * 1.05, -0.8, z * 1.05], 0.012, 8), N.steel); }   // control tubes
    for (const [m, gs] of mb) mesh(merge(gs), m, mast, 'mastTube');
    mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.5, 8).translate(0, -0.5, 0), MF.metal, mast, 'mastMid', 'mf');
  }
  const swash = group(mast, 'swashplate', 0, -0.78, 0), swSpin = group(swash, 'swashSpin');
  { const sb = new Map(), sp = (geo, m) => (sb.get(m) || sb.set(m, []).get(m)).push(geo);
    sp(lathe([[0.1, -0.04], [0.24, -0.035], [0.26, -0.015], [0.26, 0.01], [0.1, 0.02]], 28), N.steel);
    for (const a of [0, 2.1, 4.2]) sp(rbox(0.06, 0.03, 0.05, 0.01).translate(Math.cos(a) * 0.27, -0.02, Math.sin(a) * 0.27), N.steel);
    for (const [m, gs] of sb) mesh(merge(gs), m, swash, 'swashLower'); }
  { const sb = new Map(), sp = (geo, m) => (sb.get(m) || sb.set(m, []).get(m)).push(geo);
    sp(lathe([[0.1, 0.02], [0.23, 0.025], [0.24, 0.045], [0.22, 0.07], [0.1, 0.075]], 28), N.metal);
    for (const s of [-1, 1]) { sp(rbox(0.08, 0.035, 0.06, 0.012).translate(s * 0.26, 0.05, s * 0.06), N.metal);
      sp(rod([s * 0.27, 0.06, s * 0.06], [s * 0.4, 0.74, s * 0.1], 0.013, 8), N.metal); sp(lathe([[0.02, -0.02], [0.022, 0], [0.02, 0.02]], 10).translate(s * 0.4, 0.74, s * 0.1), N.steel); }   // pitch links
    sp(rod([0.0, 0.07, 0.17], [0.0, 0.35, 0.22], 0.012, 8), N.steel); sp(rod([0.0, 0.35, 0.22], [0.0, 0.64, 0.12], 0.012, 8), N.steel);   // drive scissors
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

  // ======================================================================== tail rotor (right of the fin, tractor): delta-hinge hub, 2 blades;
  // built for the left side and mirrored; it turns bottom blade forward
  const trG = group(g, 'tailRotor', ...GEO.TR_HUB), trSpin = group(trG, 'trSpin');
  { const tb = new Map(), tp = (geo, m) => (tb.get(m) || tb.set(m, []).get(m)).push(geo);
    tp(lathe([[0, -0.12], [0.04, -0.12], [0.045, -0.06], [0.045, 0.08], [0.03, 0.12], [0, 0.13]], 14).rotateZ(Math.PI / 2), N.metal);
    tp(rbox(0.06, 0.32, 0.1, 0.02), N.metal);
    for (const s of [-1, 1]) { tp(rbox(0.05, 0.08, 0.05, 0.01).translate(0.0, s * 0.13, -0.06), N.steel); tp(rod([0.08, s * 0.02, -0.06], [0.01, s * 0.12, -0.06], 0.008, 6), N.steel); }   // pitch horns and links
    tp(lathe([[0.05, 0], [0.06, 0.02], [0.06, 0.05], [0.03, 0.06]], 12).rotateZ(-Math.PI / 2).translate(0.07, 0, 0), N.steel);   // crosshead
    for (const [m, gs] of tb) { const mg = merge(gs); mesh(GEO.TR_SIDE > 0 ? mirrorX(mg) : mg, m, trSpin, 'trHub'); } }
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
  const trDisc = new THREE.Mesh(new THREE.RingGeometry(0.15, HUEY.TR_R, 32).rotateY(Math.PI / 2), trDiscM); trDisc.name = 'trDisc'; trG.add(trDisc); trDisc.position.x = -0.02 * GEO.TR_SIDE * -1;
  const stubG = merge([rod([-0.13, 0, 0], [0.03, 0, 0], 0.045, 10), rbox(0.05, 0.3, 0.1, 0.01).translate(-0.1, 0.08, 0).rotateX(0.5)]);
  const trStub = mesh(GEO.TR_SIDE > 0 ? mirrorX(stubG) : stubG, N.dark, lod0, 'trStub');
  trStub.position.copy(trG.position); trStub.visible = false;

  flush();

  // far LOD: the gun/pods/skids are folded into simple shapes so the silhouette holds
  {
    const fp = [];
    for (const [px, py, pz] of GEO.PODS) fp.push(new THREE.CylinderGeometry(GEO.POD_R, GEO.POD_R, GEO.POD_L, 6).rotateX(Math.PI / 2).translate(px, py, pz));
    for (const s of [-1, 1]) fp.push(new THREE.CylinderGeometry(0.05, 0.05, GEO.SKID.z1 - GEO.SKID.z0, 4).rotateX(Math.PI / 2).translate(s * GEO.SKID.x, -1.79, (GEO.SKID.z0 + GEO.SKID.z1) / 2));
    for (const z of GEO.SKID.cross) fp.push(new THREE.BoxGeometry(2.6, 0.08, 0.08).translate(0, -1.45, z));
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
    swash.rotation.set(-tx * 0.9, 0, -ty * 0.9); swash.position.y = -0.8 + coll * 0.07;
    discG.rotation.set(-tx, 0, -ty); discG.scale.y = cone;
    const dk = broken ? 0 : sstep(0.35, 0.9, nr);
    discM.opacity = (inside ? 0.06 : 0.16) * dk; tipRingM.opacity = (inside ? 0.07 : 0.16) * dk; discG.visible = dk > 0.01;
    const lost = !!S0.tailLost; trG.visible = !lost; trStub.visible = lost && lodD < HUEY_LOD.nm[1] + 6;
    tpsi = (tpsi + nr * HUEY.OMEGA * HUEY.TR_GEAR * dt) % TAU; trSpin.rotation.x = GEO.TR_SIDE > 0 ? tpsi : -tpsi;   // bottom blade forward on the right-side rotor
    for (const p of trBlades) p.rotation.y = 0.08 - (S0.ped || 0) * 0.22;
    trDiscM.opacity = 0.07 * sstep(0.3, 0.8, nr);
    elevG.rotation.x = -clamp(tx * 1.5, -0.15, 0.15);
    // cargo doors: open (slid back over the aft cabin) unless the game says otherwise
    const want = S0.cargoDoor ?? 1; doorT += (want - doorT) * Math.min(1, 3 * dt); if (dt === 0) doorT = want;
    for (const d of doors) d.position.z = doorT * DOOR_RUN;
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
  g.traverse((/** @type {any} */ o) => {
    if (!o.isMesh || o === probe || o.name === 'landingBeam' || o.name === 'trStub' || o.name === 'muzzleFlash') return;
    const t = o.userData.hyLod === undefined ? 'all' : tagOf(o), set = t === 'all' ? ['n', 'm', 'f'] : t === 'mf' ? ['m', 'f'] : t === 'nm' ? ['n', 'm'] : [t];
    const tris = triCount(o.geometry), dr = Array.isArray(o.material) ? Math.max(1, o.geometry.groups.length) : 1;
    for (const k of set) { stats[k].tris += tris; stats[k].draws += dr; }
  });
  animate({});
  return { group: g, shell, animate, stats, parts: { mast, spin, teeter, stab, blades, disc: discG, swash, tailRotor: trG, elevator: elevG, gun: gunYaw, gunner: gunnerG, pods, beam, doors, lod: { near: lod0, mid: lod1, far: lod2 } } };
}
