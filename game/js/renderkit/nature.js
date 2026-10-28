// RENDERKIT nature (ngc/depth-nature): trees, scrub, ground clutter and the terrain's near detail.
//
// The user (2026-10-27, first person at the home island HQ): "add more depth and drag it away from this roblox low tech
// look". Before this module a tree was one flat green 6-sided cone and the ground was flat colour. Now:
// - Trees: four species (fir, maritime / Aleppo pine, oak, maquis scrub; world/forest.js treeKind picks by geology and
//   altitude), each a trunk and irregular, offset canopy layers / clumps with a darker inner canopy (baked AO toward the
//   trunk and under each layer), soft outward normals (foliage, not facets), leaf mottling, sun-side translucency, and a
//   gentle wind sway on the game clock. Per instance: size, yaw, lean and colour.
//   ngc/look-nature: the detail and mid crowns are clustered leaf cards (a generated leaf atlas, alpha-to-coverage edges,
//   sphere normals, sun-side translucency) over a small dark hull; the fir is star skirts fringed with branch sprays.
//   Village, garden and hedgerow trees (world/chunkgen.js) are instances of these species too.
// - LOD: detail mesh near, a ~30-triangle mid mesh out to the world's near radius, the old far impostors past it
//   (chunk sF pyramids in the wild, a static instanced far set in the zone), all cross-faded with the complementary
//   screen-door masks of world/visibility.js (detail | mid | far never overlap, never leave a gap).
// - Clutter: grass tufts, maquis bushes, rocks and stones in a camera-centred ring of 8 m cells, placed deterministically
//   from the ground type by a host callback (off roads, pads, bases, buildings and water), each instance shrinking into
//   the ground at its own distance (no pops), sitting on the RENDERED terrain surface (triangle-exact in the zone).
// - NATURE_TERRAIN_GLSL: dry-grass and soil patches, grass grain, pebbles, a perturbed normal that catches the sun,
//   rock strata with undercut ledges, the dark intertidal band on rocky shores, wet sand and a swash lace line.
// Everything is instanced through ONE material factory (Lambert, so the light agent's shadows and the scene lights
// apply as on every other world object) with a custom per-instance transform: aP = (x, y, z, scale), aR = (yaw, tilt x,
// tilt z, seed), aC = colour (linear). A customDepthMaterial carries the same transform for shadow maps.
// Tiers (?rknature=low|med|high, saved choice tz_rknature, XR forces low at session start): see NATURE_TIERS.
import * as THREE from 'three';
import { FOG_GLSL } from '../fog.js';
import { LOD } from '../world/visibility.js';
import { RK_TERRAIN_GLSL } from './world.js';
import { FIR, PINE, BROAD, SCRUB } from '../world/forest.js';

// ------------------------------------------------------------------------------------------------- tiers
// detailR: full trees within (cross-fade band +-band); clutterR: the clutter ring; grass/rocks/bush: density factors;
// micro: terrain near detail (0 = off: the low tier's terrain costs what RK world cost); microR: its radius.
export const NATURE_TIERS = Object.freeze({
  low: Object.freeze({ detailR: 90, band: 30, clutterR: 38, grass: 0.35, rocks: 0.6, bush: 0.5, micro: 0, microR: 0, liteMid: false }),
  med: Object.freeze({ detailR: 170, band: 45, clutterR: 70, grass: 0.7, rocks: 0.85, bush: 0.8, micro: 1, microR: 110 }),
  high: Object.freeze({ detailR: 260, band: 60, clutterR: 105, grass: 1, rocks: 1, bush: 1, micro: 1, microR: 170 }),
});
export function natureTierName() {
  let q = null, saved = null;
  try { q = new URLSearchParams(location.search).get('rknature'); } catch (e) {}
  try { saved = localStorage.getItem('tz_rknature'); } catch (e) {}
  const v = (q ?? saved ?? 'high').trim().toLowerCase();
  return NATURE_TIERS[v] ? v : 'high';
}

// ------------------------------------------------------------------------------------------------- geometry
const lin = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // sRGB hex -> linear (ColorManagement)
const mulc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// a tiny deterministic random (geometry is built once; the same every load)
const prng = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

class Builder {   // non-indexed triangles: position, normal, color (linear, AO baked), aSway (m above the root), aLeaf (0/1),
  // aLUv (leaf atlas uv) and aCard (1: a leaf card, alpha-tested against the atlas; 0: solid)
  constructor() { this.p = []; this.n = []; this.c = []; this.s = []; this.l = []; this.uv = []; this.k = []; }
  // nrm: per-vertex normals or null (face normal); bend: 0..1 how far the face normal is pulled to `nrm`
  tri(a, b, c, col, nrm = null, bend = 0, leaf = 0, cols = null, uvs = null) {
    const f = norm3(cross3(sub3(b, a), sub3(c, a)));
    [a, b, c].forEach((v, i) => {
      const m = nrm ? norm3(mixc(f, nrm[i], bend)) : f;
      this.p.push(...v); this.n.push(...m); this.c.push(...(cols ? cols[i] : col)); this.s.push(Math.max(0, v[1])); this.l.push(leaf);
      this.uv.push(...(uvs ? uvs[i] : [0, 0])); this.k.push(uvs ? 1 : 0);
    });
  }
  // ngc/look-nature: a leaf card, the quad o +- U +- V showing atlas tile `tile` (LEAF_TILES), normals bent to point away
  // from `centre` (a crown shades as one soft volume, not card by card), AO baked from where the corner sits in the crown
  card(o, U, V, tile, shade, centre, r, bend = 0.8) {
    const q = [sub3(sub3(o, U), V), sub3(add3(o, U), V), add3(add3(o, U), V), add3(sub3(o, U), V)];
    const u0 = tile / LEAF_TILES, u1 = (tile + 1) / LEAF_TILES, flip = r() < 0.5;
    let uv = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]; if (flip) uv = [uv[1], uv[0], uv[3], uv[2]];
    const nr = q.map(v => norm3(sub3(v, centre))), cl = q.map(shade);
    this.tri(q[0], q[1], q[2], null, [nr[0], nr[1], nr[2]], bend, 1, [cl[0], cl[1], cl[2]], [uv[0], uv[1], uv[2]]);
    this.tri(q[0], q[2], q[3], null, [nr[0], nr[2], nr[3]], bend, 1, [cl[0], cl[2], cl[3]], [uv[0], uv[2], uv[3]]);
  }
  // a leaf cluster: three crossed cards round o (one across `out`, two along it, turned at random about it), size sz
  cluster(o, out, sz, tile, shade, centre, r, n = 3) {
    const up = Math.abs(out[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], t0 = norm3(cross3(out, up)), b0 = cross3(out, t0), a = r() * Math.PI;
    const t = add3(mulc(t0, Math.cos(a)), mulc(b0, Math.sin(a))), b = cross3(out, t), k = sz * (0.85 + r() * 0.3);
    this.card(o, mulc(t, k), mulc(b, k), tile, shade, centre, r);
    if (n > 1) this.card(add3(o, mulc(out, -0.15 * k)), mulc(t, k), mulc(out, k * 0.8), tile, shade, centre, r);
    if (n > 2) this.card(add3(o, mulc(out, -0.15 * k)), mulc(b, k), mulc(out, k * 0.8), tile, shade, centre, r);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(this.l, 1));
    g.setAttribute('aLUv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.k, 1));
    g.computeBoundingSphere();
    return g;
  }
  get tris() { return this.p.length / 9; }
  // a tapered trunk (or branch) from a to b, seg sides
  trunk(a, b, r0, r1, seg, col) {
    const d = norm3(sub3(b, a)), up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], u = norm3(cross3(d, up)), w = cross3(d, u);
    const ring = (o, r, i) => { const t = i / seg * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t); return [o[0] + (u[0] * cs + w[0] * sn) * r, o[1] + (u[1] * cs + w[1] * sn) * r, o[2] + (u[2] * cs + w[2] * sn) * r]; };
    for (let i = 0; i < seg; i++) {
      const p0 = ring(a, r0, i), p1 = ring(a, r0, i + 1), q0 = ring(b, r1, i), q1 = ring(b, r1, i + 1);
      const n0 = norm3(sub3(p0, a)), n1 = norm3(sub3(p1, a));
      const dark = mulc(col, 0.8);
      this.tri(p0, q0, p1, col, [n0, n0, n1], 0.8, 0, [dark, col, dark]); this.tri(p1, q0, q1, col, [n1, n0, n1], 0.8, 0, [dark, col, col]);
    }
  }
  // a foliage clump: a jittered icosahedron (detail 0, 20 triangles; oct = true: an octahedron, 8) with soft normals that
  // point away from `centre` (the canopy's middle), darker toward the trunk axis and underneath
  clump(o, rx, ry, rz, col, r, centre, axisR, oct = false) {
    const base = oct ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
    const P = base.attributes.position, V = [];
    const seen = new Map();   // shared corners jitter the same way (no cracks)
    for (let i = 0; i < P.count; i++) {
      const k = P.getX(i).toFixed(3) + ',' + P.getY(i).toFixed(3) + ',' + P.getZ(i).toFixed(3);
      if (!seen.has(k)) { const j = 0.78 + r() * 0.4; seen.set(k, [o[0] + P.getX(i) * rx * j, o[1] + P.getY(i) * ry * (P.getY(i) < 0 ? 0.85 : 1) * j, o[2] + P.getZ(i) * rz * j]); }
      V.push(seen.get(k));
    }
    base.dispose();
    const shadeOf = v => {
      const rad = Math.min(1, Math.hypot(v[0], v[2]) / axisR), below = Math.max(0, Math.min(1, (o[1] - v[1]) / ry));
      const core = Math.min(1, Math.hypot(v[0] - centre[0], (v[1] - centre[1]) * 1.2, v[2] - centre[2]) / axisR);   // deep inside the crown: shaded
      return mulc(col, (0.55 + 0.45 * rad) * (0.45 + 0.55 * core) * (1 - 0.3 * below) * (0.9 + r() * 0.2));
    };
    for (let i = 0; i < V.length; i += 3) {
      const t = [V[i], V[i + 1], V[i + 2]];
      const nr = t.map(v => norm3(mixc(norm3(sub3(v, o)), norm3(sub3(v, centre)), 0.55)));
      this.tri(t[0], t[1], t[2], col, nr, 0.85, 1, t.map(shadeOf));
    }
  }
  // a crown: n clumps on an ellipsoid shell (radii A, round C) plus a core clump, each clump's size k * A.x
  crown(C, A, n, k, P, r, oct = false) {
    const ga = Math.PI * (3 - Math.sqrt(5)), ax = Math.max(A[0], A[2]);
    this.clump(C, A[0] * 0.62, A[1] * 0.6, A[2] * 0.62, mulc(P.leaf, 0.8), r, C, ax, oct);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 1.55, rad = Math.sqrt(Math.max(0, 1 - y * y)), th = i * ga + r() * 0.6, d = 0.55 + r() * 0.2;
      const o = [C[0] + Math.cos(th) * rad * A[0] * d, C[1] + y * A[1] * d, C[2] + Math.sin(th) * rad * A[2] * d], rr = A[0] * k * (0.8 + r() * 0.4);
      this.clump(o, rr, rr * (0.75 + r() * 0.25), rr * (0.85 + r() * 0.3), mixc(P.leaf, P.leaf2, Math.max(0, Math.min(1, 0.5 + y * 0.5 + (r() - 0.5) * 0.4))), r, C, ax, oct);
    }
  }
  // ngc/look-nature: a broadleaf / pine crown as n leaf clusters (crossed cards, tile) on an ellipsoid shell round C (radii
  // A) over a dark low-poly hull that keeps the crown from reading hollow; cluster size szK * A.x. top: 0..1 how far the
  // clusters keep to the upper shell (the pine's umbrella). Normals point away from C: the crown shades as one volume.
  cardCrown(C, A, n, szK, P, r, tile, { top = 0, hullOct = false, per = 3, hull = 0.46 } = {}) {
    const ga = Math.PI * (3 - Math.sqrt(5)), ax = Math.max(A[0], A[2]);
    this.clump(C, A[0] * hull, A[1] * hull * 0.92, A[2] * hull, mulc(P.leaf, 0.78), r, C, ax, hullOct);
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * (1.6 - top * 0.75), rad = Math.sqrt(Math.max(0, 1 - y * y)), th = i * ga + r() * 0.7, d = 0.72 + r() * 0.2;
      const dir = [Math.cos(th) * rad, y, Math.sin(th) * rad], o = [C[0] + dir[0] * A[0] * d, C[1] + dir[1] * A[1] * d, C[2] + dir[2] * A[2] * d];
      const out = norm3([dir[0] / A[0], dir[1] / A[1], dir[2] / A[2]]);
      const col = mixc(P.leaf, P.leaf2, Math.max(0, Math.min(1, 0.45 + y * 0.45 + (r() - 0.5) * 0.5)));
      const shade = v => { const q = [(v[0] - C[0]) / A[0], (v[1] - C[1]) / A[1], (v[2] - C[2]) / A[2]], rr = Math.min(1.2, Math.hypot(q[0], q[1], q[2]));
        return mulc(col, (0.42 + 0.58 * Math.min(1, rr)) * (0.78 + 0.22 * Math.max(-1, Math.min(1, q[1]))) * (0.92 + r() * 0.16)); };
      this.cluster(o, out, ax * szK, tile, shade, C, r, per);
    }
  }
  // the fir's drooping branch sprays round one tier: a card from near the trunk out past each star tip
  fringe(y0, h, R, seg, col, r, droop) {
    const ph = r() * Math.PI * 2, centre = [0, y0 + h * 0.25, 0];
    for (let i = 0; i < seg; i++) {
      const t = ph + (i + 0.5 + (r() - 0.5) * 0.4) / seg * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), L = R * (1.0 + r() * 0.25), lift = (i % 2) * h * 0.22;
      const a = [c * R * 0.15, y0 + h * 0.18 + lift, sn * R * 0.15], b = [c * L, y0 + lift * 0.6 - droop * h * (0.7 + r() * 0.5), sn * L];
      const o = mulc(add3(a, b), 0.5), V = mulc(sub3(b, a), 0.5), roll = (r() - 0.5) * 1.3, w = R * (0.4 + r() * 0.12);
      const side = [-sn, 0, c], U = mulc(norm3(add3(mulc(side, Math.cos(roll)), [0, Math.sin(roll), 0])), w);
      const shade = v => mulc(col, (0.5 + 0.5 * Math.min(1, Math.hypot(v[0], v[2]) / R)) * (0.9 + r() * 0.2));
      this.card(o, U, V, 2, shade, centre, r, 0.7);
    }
  }
  // one conifer tier: a star-shaped skirt (tips out and drooping, notches in and higher) round the trunk, apex offset
  tier(y0, h, R, seg, col, r, under = true, droop = 0.35) {
    const ax = (r() - 0.5) * R * 0.25, az = (r() - 0.5) * R * 0.25, apex = [ax, y0 + h, az], ring = [];
    const ph = r() * Math.PI * 2;
    for (let i = 0; i < seg * 2; i++) {
      const t = ph + i / (seg * 2) * Math.PI * 2, tip = i % 2 === 0, rr = R * (tip ? 0.88 + r() * 0.3 : 0.55 + r() * 0.1);
      ring.push([Math.cos(t) * rr, y0 + (tip ? -droop * h * (0.6 + r() * 0.6) : h * 0.12), Math.sin(t) * rr]);
    }
    const top = mulc(col, 1.08), skirt = mulc(col, 0.72), inner = mulc(col, 0.42), centre = [0, y0 + h * 0.3, 0];
    const nOf = v => norm3([v[0], (v[1] - y0) * 0.6 + R * 0.6, v[2]]);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      this.tri(apex, b, a, col, [norm3([0, 1, 0]), nOf(b), nOf(a)], 0.75, 1, [top, i % 2 ? skirt : col, i % 2 ? col : skirt]);
      if (under) { const c = [0, y0 + h * 0.05, 0]; this.tri(c, a, b, inner, [[0, -1, 0], norm3([a[0], -0.3, a[2]]), norm3([b[0], -0.3, b[2]])], 0.6, 1, [inner, mulc(skirt, 0.8), mulc(skirt, 0.8)]); }
    }
    void centre;
  }
}

// species palettes (sRGB hex -> linear): leaf, leaf variation, trunk
const PAL = {
  [FIR]: { leaf: lin(0x2b4a2c), leaf2: lin(0x3a5f37), trunk: lin(0x5c4a3b) },   // (bark lighter: ngc/look-nature)
  [PINE]: { leaf: lin(0x45652f), leaf2: lin(0x587540), trunk: lin(0x80604a) },
  [BROAD]: { leaf: lin(0x4b7330), leaf2: lin(0x668a39), trunk: lin(0x736a5e) },
  [SCRUB]: { leaf: lin(0x5a7438), leaf2: lin(0x74804a), trunk: lin(0x5a4a3a) },
};
// The trees are built to a unit size that matches the old cone at scale 1 (5 m tall, 1.3 m radius): the hosts keep their
// scales (the colliders and the felling code know trees by them).
function treeGeo(kind, level) {
  const B = new Builder(), r = prng(kind * 101 + (level === 'detail' ? 7 : 3)), P = PAL[kind];
  const detail = level === 'detail', lite = level === 'lite';   // lite: the mid LOD with octahedron clumps (the low tier, the zone's far set)
  // ngc/look-nature: detail and mid crowns are leaf cards (cardCrown / fringe) over a dark hull; lite (the zone's far set,
  // past ~520 m) keeps the clump crowns, which read the same at that size
  if (lite) return treeGeoLite(kind, B, r, P);
  if (kind === FIR) {   // fir: a straight trunk, tiers of star skirts (the body) fringed with drooping branch sprays
    B.trunk([0, -0.4, 0], [0, 4.6, 0], 0.17, 0.05, detail ? 6 : 4, P.trunk);
    const n = detail ? 5 : 3, seg = 5;
    for (let k = 0; k < n; k++) {
      const f = k / n, y0 = 0.9 + f * 3.2, R = 1.75 * (1 - f * 0.78), h = 1.25 + (1 - f) * 0.5, col = mixc(P.leaf, P.leaf2, f * 0.7);
      B.tier(y0, h + (k === n - 1 ? 0.6 : 0), R * 0.7, seg, mulc(col, 0.62), r, false, detail ? 0.3 : 0.22);   // (the shaded inner mass)
      B.fringe(y0, h, R, detail ? 10 : 6, col, r, detail ? 0.42 : 0.3);   // (the silhouette: needle sprays)
      if (detail && k === n - 1) B.fringe(y0 + h * 0.55, h * 0.6, R * 0.55, 4, col, r, 0.2);   // (the leader's tuft)
    }
  } else if (kind === PINE) {   // maritime pine: a tall, slightly bent trunk, bare limbs, an umbrella of needle tufts on top
    const top = [0.22, 4.4, 0.08];
    B.trunk([0, -0.4, 0], [0.12, 2.2, 0], 0.17, 0.12, detail ? 6 : 4, P.trunk);
    B.trunk([0.12, 2.2, 0], top, 0.12, 0.06, detail ? 6 : 4, P.trunk);
    if (detail) { B.trunk([0.15, 3.0, 0], [-0.75, 3.95, 0.5], 0.07, 0.03, 4, P.trunk); B.trunk([0.18, 3.2, 0], [0.95, 4.05, -0.5], 0.07, 0.03, 4, P.trunk); B.trunk([0.2, 3.6, 0.05], [0.1, 4.3, 0.95], 0.05, 0.03, 3, P.trunk); }
    B.cardCrown([0.18, 4.6, 0.04], [1.55, 1.0, 1.45], detail ? 10 : 5, detail ? 0.56 : 0.76, P, r, 1, { top: 0.55, hullOct: !detail, hull: 0.42, per: detail ? 3 : 2 });
  } else if (kind === BROAD) {   // oak: short trunk, two limbs, a domed crown of leafy clusters
    B.trunk([0, -0.4, 0], [0, 1.9, 0], 0.22, 0.16, detail ? 6 : 4, P.trunk);
    if (detail) { B.trunk([0, 1.7, 0], [-0.7, 3.0, 0.35], 0.1, 0.05, 4, P.trunk); B.trunk([0, 1.7, 0], [0.7, 3.1, -0.3], 0.1, 0.05, 4, P.trunk); }
    B.cardCrown([0, 3.4, 0], [2.05, 1.7, 1.95], detail ? 12 : 6, detail ? 0.55 : 0.76, P, r, 0, { hullOct: !detail, per: detail ? 3 : 2 });
  } else {   // maquis scrub (lentisk, myrtle, broom): a low cushion of leafy clusters, no trunk to speak of. Unit: ~1.2 m tall.
    B.cardCrown([0, 0.42, 0], [0.95, 0.55, 0.9], detail ? 7 : 3, detail ? 0.55 : 0.8, P, r, 0, { top: 0.35, hullOct: true, per: detail ? 3 : 2 });
  }
  return B;
}
function treeGeoLite(kind, B, r, P) {   // (the depth-nature clump crowns, octahedra: the far set)
  if (kind === FIR) {
    B.trunk([0, -0.4, 0], [0, 4.6, 0], 0.17, 0.05, 4, P.trunk);
    for (let k = 0; k < 3; k++) { const f = k / 3, y0 = 0.9 + f * 3.2, R = 1.75 * (1 - f * 0.78), h = 1.25 + (1 - f) * 0.5; B.tier(y0, h + (k === 2 ? 0.6 : 0), R, 5, mixc(P.leaf, P.leaf2, f * 0.7), r, false, 0.25); }
  } else if (kind === PINE) {
    B.trunk([0, -0.4, 0], [0.12, 2.2, 0], 0.17, 0.12, 4, P.trunk); B.trunk([0.12, 2.2, 0], [0.22, 4.4, 0.08], 0.12, 0.06, 4, P.trunk);
    B.crown([0.18, 4.6, 0.04], [1.55, 1.0, 1.45], 3, 0.66, P, r, true);
  } else if (kind === BROAD) {
    B.trunk([0, -0.4, 0], [0, 1.9, 0], 0.22, 0.16, 4, P.trunk); B.crown([0, 3.4, 0], [2.05, 1.7, 1.95], 3, 0.62, P, r, true);
  } else {
    [[0, 0.5, 0, 0.9, 0.6], [0.4, 0.3, 0.4, 0.55, 0.4]].forEach(([x, y, z, rr, ry], i) => B.clump([x, y, z], rr, ry, rr, mixc(P.leaf, P.leaf2, i / 3), r, [0, 0.3, 0], 0.9, true));
  }
  return B;
}
// clutter: grass tuft (blades, normals up so they light like the ground they grow from), bush (= scrub detail),
// rock (a flattened faceted boulder, half buried), stone (a pebble)
function tuftGeo(r) {
  const B = new Builder(), n = 10, g0 = [1, 1, 1];   // (ngc/look-nature: 13 -> 10 blades, a little wider: tufts were most of the high tier's triangles)
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + r() * 0.6, rr = 0.06 + r() * 0.12, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = 0.28 + r() * 0.4, w = 0.026 + r() * 0.018;
    const lean = 0.12 + r() * 0.22, tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const up = [Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35], root = [0.42, 0.46, 0.4], tip = [1.5, 1.42, 0.95];   // dark, self-shaded roots; sun-bleached, yellower tips: grass reads by its contrast, not its hue
    const a0 = [x - px, 0, z - pz], a1 = [x + px, 0, z + pz], m0 = [x + (tx - x) * 0.45 - px * 0.7, h * 0.5, z + (tz - z) * 0.45 - pz * 0.7], m1 = [x + (tx - x) * 0.45 + px * 0.7, h * 0.5, z + (tz - z) * 0.45 + pz * 0.7], t = [tx, h, tz];
    const mid = [0.95, 0.98, 0.85];
    B.tri(a0, a1, m1, g0, [up, up, up], 1, 1, [root, root, mid]); B.tri(a0, m1, m0, g0, [up, up, up], 1, 1, [root, mid, mid]);
    B.tri(m0, m1, t, g0, [up, up, up], 1, 1, [mid, mid, tip]);
  }
  for (let i = 0; i < 15; i++) r();   // (the 3 dropped blades' draws: the rocks built next from the same stream keep their shapes)
  return B;
}
function rockGeo(r, oct = false) {
  const B = new Builder(), base = oct ? new THREE.OctahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0), P = base.attributes.position, seen = new Map(), V = [];
  for (let i = 0; i < P.count; i++) {
    const k = P.getX(i).toFixed(3) + ',' + P.getY(i).toFixed(3) + ',' + P.getZ(i).toFixed(3);
    if (!seen.has(k)) { const j = 0.75 + r() * 0.5; seen.set(k, [P.getX(i) * j * 1.1, P.getY(i) * j * 0.8, P.getZ(i) * j * 0.95]); }
    V.push(seen.get(k));
  }
  base.dispose();
  for (let i = 0; i < V.length; i += 3) {
    const t = [V[i], V[i + 1], V[i + 2]], cols = t.map(v => [1, 1, 1].map(() => 0.72 + 0.28 * Math.max(0, Math.min(1, v[1] + 0.45)) + (r() - 0.5) * 0.08));
    B.tri(t[0], t[1], t[2], [1, 1, 1], null, 0, 0, cols);
  }
  B.s = B.s.map(() => 0);   // rocks do not sway
  return B;
}

// ------------------------------------------------------------------------------------------------- leaf atlas
// ngc/look-nature: three 256 px tiles drawn once at start: 0 a broadleaf spray (oval leaves on twigs, denser in the middle,
// a ragged edge), 1 pine needle tufts (bursts of long needles), 2 a fir branch spray (a twig with side twigs and short
// needles, base at v = 0, tip at v = 1). RGB is a grey shade that multiplies the vertex colour (leaf-to-leaf contrast), A the
// leaf mask; transparent texels carry a mid grey so the mip chain does not darken the edges.
export const LEAF_TILES = 3;
function leafAtlas() {
  const T = 256;
  if (typeof document === 'undefined') { const t = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1); t.needsUpdate = true; return t; }
  const cv = document.createElement('canvas'); cv.width = T * LEAF_TILES; cv.height = T;
  const g = cv.getContext('2d'), r = prng(4242), grey = (a, b) => { const v = Math.round(a + r() * (b - a)); return `rgb(${v},${v},${v})`; };
  // 0: broadleaf
  g.save(); g.translate(T / 2, T / 2);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + r() * 0.5, L = 70 + r() * 35; g.strokeStyle = grey(70, 95); g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + 0.3) * L * 0.5, Math.sin(a + 0.3) * L * 0.5, Math.cos(a) * L, Math.sin(a) * L); g.stroke(); }
  for (let i = 0; i < 300; i++) {
    const a = r() * Math.PI * 2, rad = 116 * Math.sqrt(r()), edge = 0.74 + 0.16 * Math.sin(a * 5 + 1.3) + 0.1 * Math.sin(a * 11 + 0.4);
    if (rad > 116 * edge) continue;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad, L = 12 + r() * 9, W = L * (0.4 + r() * 0.12), rot = a + (r() - 0.5) * 1.6;
    const v = Math.round(130 + r() * 110 - y * 0.15); g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.ellipse(x, y, L / 2, W / 2, rot, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(255,255,255,0.18)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x - Math.cos(rot) * L * 0.4, y - Math.sin(rot) * L * 0.4); g.lineTo(x + Math.cos(rot) * L * 0.4, y + Math.sin(rot) * L * 0.4); g.stroke();
  }
  g.restore();
  // 1: pine needle tufts
  g.save(); g.translate(T * 1.5, T / 2); g.lineCap = 'round';
  const tufts = Array.from({ length: 9 }, (_, i) => { const a = i / 9 * Math.PI * 2 + r(), d = i ? 38 + r() * 40 : 0; return [Math.cos(a) * d, Math.sin(a) * d]; });
  for (const [x, y] of tufts) { g.strokeStyle = grey(70, 90); g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke(); }
  for (const [x, y] of tufts) for (let j = 0; j < 70; j++) {
    const a = r() * Math.PI * 2, L = 22 + r() * 28; g.strokeStyle = grey(125, 235); g.lineWidth = 1.3 + r() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L * 0.85); g.stroke();
  }
  g.restore();
  // 2: fir branch spray (canvas y = v * T: base at the top row, tip at the bottom)
  g.save(); g.translate(T * 2.5, 0); g.lineCap = 'round';
  const wOf = t => 116 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t)), 0.7) * (1 - 0.5 * t);
  g.strokeStyle = grey(70, 85); g.lineWidth = 3; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, T - 6); g.stroke();
  for (let y = 8; y < T - 10; y += 9 + r() * 5) for (const sd of [-1, 1]) {
    const t = y / T, w = wOf(t) * (0.8 + r() * 0.25), ex = sd * w, ey = y + w * 0.55;
    g.strokeStyle = grey(75, 95); g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, y); g.lineTo(ex, Math.min(T - 2, ey)); g.stroke();
    for (let k = 0.05; k < 1; k += 0.06) { const px = ex * k, py = y + (ey - y) * k; for (const q of [-1, 1]) {
      const a = Math.atan2(ey - y, ex) + q * (0.8 + r() * 0.5), L = 9 + r() * 7; g.strokeStyle = grey(120, 230); g.lineWidth = 1.9;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * L, Math.min(T - 1, py + Math.sin(a) * L)); g.stroke(); } }
  }
  g.restore();
  const img = g.getImageData(0, 0, cv.width, T), d = img.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] < 8) { d[i] = d[i + 1] = d[i + 2] = 170; d[i + 3] = 0; }
  const t = new THREE.DataTexture(d, cv.width, T, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace; t.name = 'RenderKit/nature-leaves'; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------------------------------- material
// kind: 'detail' | 'mid' | 'far' (screen-door LOD bands) | 'clutter' (shrinks into the ground by distance)
const LOD_GLSL = `float natDoor(){ return fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715)))); }`;
const VERT_HEAD = `
  attribute vec4 aP, aR; attribute vec3 aC; attribute float aSway, aLeaf, aCard; attribute vec2 aLUv;
  uniform float uWind, uClutR, uNatGain;
  varying vec3 vNW; varying float vLeaf; varying vec3 vNN; varying vec2 vLUv; varying float vCard;
  mat3 natRot(vec4 r){
    float c=cos(r.x), s=sin(r.x); mat3 Y=mat3(c,0.,-s, 0.,1.,0., s,0.,c);
    vec3 t=vec3(r.y,0.,r.z); float a=length(t); if(a<1e-4) return Y;
    vec3 k=t/a; mat3 K=mat3(0.,k.z,-k.y, -k.z,0.,k.x, k.y,-k.x,0.);
    return (mat3(1.)+sin(a)*K+(1.-cos(a))*(K*K))*Y;
  }`;
function patchVertex(src, kind) {
  const shrink = kind === 'clutter'
    ? `{ float rk=fract(aR.w*7.31), Ri=uClutR*(.38+.62*(1.-rk)); natS*=1.-smoothstep(Ri*.72,Ri,length(aP.xyz-cameraPosition)); }`
    : '';
  return VERT_HEAD + '\n' + src
    .replace('#include <beginnormal_vertex>', `mat3 natR=natRot(aR); vec3 objectNormal=natR*normal;
      #ifdef USE_TANGENT
      vec3 objectTangent=vec3(tangent.xyz);
      #endif`)
    .replace('#include <begin_vertex>', `
      #ifndef NAT_HAS_R
      mat3 natR=natRot(aR);
      #endif
      float natS=aP.w; ${shrink}
      vec3 transformed=natR*(position*natS)+aP.xyz;
      { // wind: a slow sway of the whole crown (grows with height squared) and a quick flutter of the foliage
        float h=aSway*natS, ph=dot(aP.xz,vec2(.131,.173))+aR.w*6.283;
        float sw=sin(uWind*1.13+ph)*.6+sin(uWind*2.31+ph*1.7)*.25+sin(uWind*.37+ph*.3)*.4;
        vec2 wd=vec2(.8,.6)*(sw*.012*h*h/(1.+.04*h*h)) + vec2(.6,-.8)*sin(uWind*.97+ph*1.3)*.004*h*h/(1.+.04*h*h);
        wd+=aLeaf*.035*vec2(sin(uWind*5.1+dot(position,vec3(3.1,2.3,1.7))+ph),cos(uWind*4.3+dot(position,vec3(1.9,2.9,3.7))+ph))*min(h,3.);
        transformed.xz+=wd;
      }
      vNW=transformed; vLeaf=aLeaf; vLUv=aLUv; vCard=aCard;`)
    .replace('#include <color_vertex>', `#include <color_vertex>
      #ifdef USE_COLOR
      vColor.rgb*=aC*uNatGain;
      #endif`)
    .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\n vNN=normalize(objectNormal);');
}
export function natureMaterial({ kind = 'detail', fog = null, uTime = null, shared, side = THREE.FrontSide, gain = 1 }) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  const uGain = { value: gain };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared.uniforms, { uNatGain: uGain });
    if (fog) { sh.uniforms.uFogT = fog.uniforms.uFogT; sh.uniforms.uFogB = fog.uniforms.uFogB; sh.uniforms.uTime = uTime; }
    sh.vertexShader = '#define NAT_HAS_R\n' + patchVertex(sh.vertexShader, kind);
    const door = kind === 'detail' ? 'if(natDoor()>=wD) discard;'
      : kind === 'mid' ? 'float sdm=natDoor(); if(sdm<wD||sdm>=wN) discard;'
        : kind === 'far' ? 'if(natDoor()<wN) discard;' : '';
    if (side === THREE.DoubleSide) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));   // (both faces light by the bent normals)
    sh.fragmentShader = `varying vec3 vNW; varying float vLeaf; varying vec3 vNN; varying vec2 vLUv; varying float vCard; uniform sampler2D uLeafTex; uniform vec4 uNatLod; uniform vec3 uNatSun, uNatSunCol; uniform float uWind;
      ${fog ? 'uniform sampler2D uFogT; uniform float uFogB; uniform float uTime;\n' + FOG_GLSL : ''}
      ${LOD_GLSL}\n` + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        { float d=length(vNW-cameraPosition), wD=1.-smoothstep(uNatLod.x,uNatLod.y,d), wN=1.-smoothstep(uNatLod.z,uNatLod.w,d); ${door} }
        ${side === THREE.DoubleSide ? 'if(vCard<.5&&!gl_FrontFacing) discard;   // (double-sided for the cards only: trunks and hulls skip their back faces)' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if(vCard>.5){   // a leaf card: the atlas mask, sharpened to a one-pixel edge for alpha-to-coverage (MSAA) and held up in the
          // smaller mips (a mipped mask thins a crown out with distance), and the leaf-to-leaf shade
          vec4 lt=texture2D(uLeafTex,vLUv); vec2 ts=fwidth(vLUv)*vec2(${256 * LEAF_TILES}.,256.);
          float la=min(1.,lt.a*(1.+.3*max(0.,log2(max(ts.x,ts.y))))), aw=max(fwidth(la),.03);
          la=clamp((la-.5)/aw+.5,0.,1.); if(la<.3) discard;
          diffuseColor.a=la; diffuseColor.rgb*=lt.rgb*1.35;
        }
        if(vLeaf>.5){   // leaf mottling: clusters of lit and shaded foliage (world-space, so it does not swim with the sway)
          vec3 q=vNW*1.9; float m=sin(q.x+sin(q.y*1.3+q.z*.7)*1.7)*sin(q.z*1.1+sin(q.x*.9-q.y)*1.5)*.5+.5;
          diffuseColor.rgb*=mix(.8+.4*m,.9+.2*m,vCard);
        }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if(vLeaf>.5){   // light through the leaves: sun behind the canopy, and a little wrap on the shaded side
          vec3 V=normalize(vNW-cameraPosition); float back=pow(max(dot(V,uNatSun),0.),5.), wrap=max(0.,-dot(normalize(vNN),uNatSun))*.12;
          // leaf cards: thin leaves glow yellow-green against the sun (stronger, wider) and at the crown's sun-side rim
          float sv=max(dot(V,uNatSun),0.), cb=vCard*(pow(sv,3.)*.55+pow(sv,12.)*.5);
          gl_FragColor.rgb+=diffuseColor.rgb*uNatSunCol*(back*.45*(1.-vCard)+wrap+cb*vec3(1.05,1.2,.55));
        }`)
      .replace('#include <fog_fragment>', (fog ? 'gl_FragColor.rgb = fogOfWar(gl_FragColor.rgb, vNW.xz, uTime);\n' : '') + '#include <fog_fragment>');
  };
  m.customProgramCacheKey = () => 'rknature-' + kind + (fog ? 'F' : '') + side;
  m.alphaToCoverage = true;   // ngc/look-nature: leaf-card edges (the world target and XR are MSAA)
  m.userData.gain = uGain;
  return m;
}
function depthMaterial(shared, kind) {   // (mid: the cards cast as whole quads, no atlas fetch: those shadows are a few pixels)
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, shared.uniforms, { uNatGain: { value: 1 } }); sh.vertexShader = patchVertex(sh.vertexShader, kind);
    sh.fragmentShader = 'varying vec2 vLUv; varying float vCard; uniform sampler2D uLeafTex;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + (kind === 'mid' ? '' : ' if(vCard>.5&&texture2D(uLeafTex,vLUv).a<.5) discard;')); };
  m.side = THREE.DoubleSide;
  m.customProgramCacheKey = () => 'rknature-depth-' + kind;
  return m;
}

// one instanced set (one geometry, one material, a growable instance buffer)
function instanced(geo, mat, cap, depth) {
  const g = new THREE.InstancedBufferGeometry();
  for (const k of Object.keys(geo.attributes)) g.setAttribute(k, geo.attributes[k]);
  const mk = (n, w) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * w), w); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const set = { cap, n: 0, P: null, R: null, C: null };
  const alloc = n => { set.cap = n; set.P = mk(n, 4); set.R = mk(n, 4); set.C = mk(n, 3); g.setAttribute('aP', set.P); g.setAttribute('aR', set.R); g.setAttribute('aC', set.C); };
  alloc(cap); g.instanceCount = 0;
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.castShadow = false; mesh.receiveShadow = true;
  if (depth) mesh.customDepthMaterial = depth;
  set.mesh = mesh; set.tris = geo.attributes.position.count / 3;
  set.ensure = n => { if (n <= set.cap) return; const P = set.P.array, R = set.R.array, C = set.C.array, k = set.n; alloc(Math.ceil(n * 1.5)); set.P.array.set(P.subarray(0, k * 4)); set.R.array.set(R.subarray(0, k * 4)); set.C.array.set(C.subarray(0, k * 3)); };   // (the old buffers are left to the GC: disposing the geometry mid-frame lost the set)
  set.begin = () => { set.n = 0; };
  set.push = (src, i) => {   // src: { d: Float32Array (x y z s yaw tx tz seed), c: Float32Array (r g b) }
    if (set.n >= set.cap) set.ensure(set.n + 1);
    const n = set.n++; set.P.array.set(src.d.subarray(i * 8, i * 8 + 4), n * 4); set.R.array.set(src.d.subarray(i * 8 + 4, i * 8 + 8), n * 4); set.C.array.set(src.c.subarray(i * 3, i * 3 + 3), n * 3);
  };
  set.end = () => {
    g.instanceCount = set.n; mesh.visible = set.n > 0;
    for (const a of [set.P, set.R, set.C]) { a.clearUpdateRanges(); a.addUpdateRange(0, set.n * a.itemSize); a.needsUpdate = true; }
  };
  return set;
}

// ------------------------------------------------------------------------------------------------- shared state
// One uniform block for every nature material: the wind clock (advanced by the game's dt, so it stops in the pause
// menu), the LOD distances, the sun (direction + colour, for the translucency), the clutter radius.
export function createNatureShared(tierName = natureTierName()) {
  const uniforms = {
    uWind: { value: 0 }, uClutR: { value: 60 }, uNatLod: { value: new THREE.Vector4() },
    uNatSun: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() }, uNatSunCol: { value: new THREE.Color(1, 0.94, 0.82) },
    uLeafTex: { value: leafAtlas() },   // ngc/look-nature: the leaf cards' atlas
  };
  const S = { uniforms, tierName, tier: NATURE_TIERS[tierName] };
  S.setTier = name => { if (!NATURE_TIERS[name]) return false; S.tierName = name; S.tier = NATURE_TIERS[name]; S.apply(); return true; };
  S.apply = () => { const t = S.tier; uniforms.uNatLod.value.set(t.detailR - t.band, t.detailR + t.band, LOD.near - LOD.blend, LOD.near + LOD.blend); uniforms.uClutR.value = t.clutterR; };
  S.apply();
  return S;
}

// ------------------------------------------------------------------------------------------------- forest
// Sources of trees: the zone's (static, built at start: main.js) and the wild chunks' (added and dropped by world/life.js
// as they stream). Each tree: x y z scale yaw tiltX tiltZ seed + a colour + a species. Every frame the camera moved more
// than a few metres, the detail and mid sets are refilled from the trees in reach (nearest chunks' bounding boxes first:
// a few thousand trees, ~0.2-0.5 ms). The zone also gets a static far set (the jet sees the whole zone).
// ------------------------------------------------------------------------------------------------- the view cone
// (ngc/look-nature) The instanced sets are drawn without frustum culling (one draw per set), so before this every tree and
// tuft round the eye went through the vertex stage, behind the player too: at the HQ ~60 % of nature's draw cost, and the
// reason foot.mjs's game-time waits ran out under SwiftShader. Each refill now keeps what lies in a cone round the view
// (the half-diagonal field of view + CONE_MARGIN), as spheres (a tree with its shadow, a clutter cell); a turn of more
// than CONE_TURN refills. The host gives the eye { position, dir, tanD } (tanD 0 / missing: no cone, the whole ring).
export const CONE_MARGIN = 0.4, CONE_TURN = 0.16;
function viewCone(cam) {
  if (!cam.tanD || !cam.dir) return null;
  const a = Math.atan(cam.tanD) + CONE_MARGIN; if (a >= Math.PI * 0.98) return null;
  return { x: cam.position.x, y: cam.position.y, z: cam.position.z, dx: cam.dir.x, dy: cam.dir.y, dz: cam.dir.z, a };
}
function inCone(C, x, y, z, r) {
  if (!C) return true;
  const vx = x - C.x, vy = y - C.y, vz = z - C.z, d2 = vx * vx + vy * vy + vz * vz;
  if (d2 <= r * r) return true;
  const d = Math.sqrt(d2), b = C.a + Math.asin(r / d);
  return b >= Math.PI || (vx * C.dx + vy * C.dy + vz * C.dz) / d >= Math.cos(b);
}
// has the view turned (or zoomed) enough since the last refill that the cone needs refilling?
function coneMoved(cam, last) {
  if (!cam.dir || !cam.tanD) return false;
  const moved = last.tanD === undefined || cam.dir.x * last.x + cam.dir.y * last.y + cam.dir.z * last.z < Math.cos(CONE_TURN) || Math.abs(Math.atan(cam.tanD) - Math.atan(last.tanD)) > CONE_TURN * 0.5;
  return moved;
}
const coneMark = (cam, last) => { if (cam.dir) { last.x = cam.dir.x; last.y = cam.dir.y; last.z = cam.dir.z; last.tanD = cam.tanD; } };

export function createForest({ scene, fog = null, uTime = null, shared }) {
  const K = [FIR, PINE, BROAD, SCRUB];
  const root = new THREE.Group(); root.name = 'rk-nature-forest'; scene.add(root);
  const mats = {}, sets = { detail: {}, mid: {}, lite: {}, far: {} }, geos = {};
  for (const lvl of ['detail', 'mid', 'lite', 'far']) {
    mats[lvl] = natureMaterial({ kind: lvl === 'lite' ? 'mid' : lvl, fog, uTime, shared, gain: 1.4, side: lvl === 'detail' || lvl === 'mid' ? THREE.DoubleSide : THREE.FrontSide });   // (cards: both faces)
    const depth = depthMaterial(shared, lvl === 'lite' ? 'mid' : lvl);
    for (const k of K) {
      const g = geos[lvl + k] = treeGeo(k, lvl === 'far' ? 'lite' : lvl).geometry();
      sets[lvl][k] = instanced(g, mats[lvl], lvl === 'detail' ? 2500 : 4000, depth); root.add(sets[lvl][k].mesh);
      sets[lvl][k].mesh.userData.rkShadow = lvl === 'far' ? 'receive' : 'both';   // RENDERKIT light: trees cast (customDepthMaterial carries the instance transform); the far set only receives
    }
  }
  const sources = new Map();
  let dirty = true, farDirty = true, lastReach = 0; const last = new THREE.Vector3(1e9, 0, 0), lastDir = {};
  const stats = { trees: 0, detail: 0, mid: 0, far: 0, ms: 0, rebuilds: 0, tris: 0 };
  // trees: Float32Array x y z s per tree (+ optional kinds Uint8Array, seeds), far: draw past the near radius too (zone)
  function add(id, d, kinds, { far = false } = {}) {
    const n = kinds.length, D = new Float32Array(n * 8), C = new Float32Array(n * 3);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = d[i * 4], y = d[i * 4 + 1], z = d[i * 4 + 2], s = d[i * 4 + 3];
      const h1 = fract(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453), h2 = fract(h1 * 91.7 + 0.31), h3 = fract(h2 * 53.3 + 0.77);
      const lean = 0.03 + 0.07 * h3, la = h2 * 6.283;
      D.set([x, y - 0.05, z, s, h1 * 6.283, Math.cos(la) * lean, Math.sin(la) * lean, h3], i * 8);
      // colour: a per-tree shift between greener / yellower and lighter / darker (summer stands are not one green)
      const k = kinds[i], warm = h2 - 0.5, lum = 0.86 + 0.28 * h1;
      C.set([lum * (1 + warm * 0.22), lum * (1 + warm * 0.06), lum * (1 - warm * 0.2)], i * 3);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      void k;
    }
    sources.set(id, { d: D, c: C, k: kinds, n, x0, z0, x1, z1, far });
    dirty = true; if (far) farDirty = true;
    return sources.get(id);
  }
  function remove(id) { if (sources.delete(id)) dirty = true; }
  // lay a tree over (a tank pushed it): tilt about the horizontal axis across the push
  function fell(id, i, dx, dz) {
    const s = sources.get(id); if (!s) return; const l = Math.hypot(dx, dz) || 1;
    s.d[i * 8 + 5] = dz / l * 1.35; s.d[i * 8 + 6] = -dx / l * 1.35; dirty = true; if (s.far) farDirty = true;
  }
  function rebuild(cx, cy, cz, reach, C) {
    const t0 = performance.now(), T = shared.tier, dOut = T.detailR + T.band + 12, mOut = Math.min(LOD.near + LOD.blend, reach) + 12, mIn = T.detailR - T.band - 12;
    const M = T.liteMid ? sets.lite : sets.mid;   // the mid trees: icosahedron clumps, or octahedra on the low tier
    for (const k of K) { sets.detail[k].begin(); sets.mid[k].begin(); sets.lite[k].begin(); }
    let nd = 0, nm = 0;
    for (const s of sources.values()) {
      const bx = Math.max(s.x0 - cx, 0, cx - s.x1), bz = Math.max(s.z0 - cz, 0, cz - s.z1);
      if (bx * bx + bz * bz > mOut * mOut) continue;
      const D = s.d;
      for (let i = 0; i < s.n; i++) {
        const dx = D[i * 8] - cx, dy = D[i * 8 + 1] - cy, dz = D[i * 8 + 2] - cz, dd = dx * dx + dy * dy + dz * dz;
        if (dd > mOut * mOut) continue;
        const sc = D[i * 8 + 3]; if (!inCone(C, D[i * 8], D[i * 8 + 1] + 2.5 * sc, D[i * 8 + 2], 7 * sc + 3)) continue;   // (the crown and its shadow)
        const k = s.k[i];
        if (dd < dOut * dOut) { sets.detail[k].push(s, i); nd++; }
        if (dd > mIn * mIn || mIn < 0) { M[k].push(s, i); nm++; }
      }
    }
    let tris = 0;
    for (const k of K) { sets.detail[k].end(); sets.mid[k].end(); sets.lite[k].end(); tris += sets.detail[k].n * sets.detail[k].tris + M[k].n * M[k].tris; }
    {   // the zone's far set: only past the near band (inside it the far material discards every pixel) and in the cone
      farDirty = false; const fIn = Math.max(0, LOD.near - LOD.blend - 12);
      for (const k of K) sets.far[k].begin();
      for (const s of sources.values()) if (s.far) for (let i = 0; i < s.n; i++) {
        if (s.k[i] === SCRUB) continue;
        const D = s.d, dx = D[i * 8] - cx, dy = D[i * 8 + 1] - cy, dz = D[i * 8 + 2] - cz, sc = D[i * 8 + 3];
        if (dx * dx + dy * dy + dz * dz < fIn * fIn || !inCone(C, D[i * 8], D[i * 8 + 1] + 2.5 * sc, D[i * 8 + 2], 4 * sc + 2)) continue;
        sets.far[s.k[i]].push(s, i);
      }
      for (const k of K) sets.far[k].end();
    }
    for (const k of K) tris += sets.far[k].n * sets.far[k].tris;
    Object.assign(stats, { detail: nd, mid: nm, far: K.reduce((a, k) => a + sets.far[k].n, 0), ms: +(performance.now() - t0).toFixed(2), tris, trees: [...sources.values()].reduce((a, s) => a + s.n, 0) });
    stats.rebuilds++;
  }
  function update(cam) {
    const p = cam.position;
    // the mid set reaches the world near radius or the far clip, whichever is nearer (on foot the haze ends at ~265 m);
    // the zone's far set exists only for views that reach past the near band (the jet)
    const reach = cam.far || 1e4, farOn = reach > LOD.near - LOD.blend;
    if (dirty || p.distanceToSquared(last) > 36 || Math.abs(reach - lastReach) > 40 || coneMoved(cam, lastDir)) { dirty = false; last.copy(p); lastReach = reach; coneMark(cam, lastDir); rebuild(p.x, p.y, p.z, reach, viewCone(cam)); }
    for (const k of K) sets.far[k].mesh.visible = farOn && sets.far[k].n > 0;
    stats.farOn = farOn;
  }
  const F = { add, remove, fell, update, stats, root, sources, sets, markDirty: () => { dirty = true; farDirty = true; } };
  return F;
}
const fract = x => x - Math.floor(x);

// ------------------------------------------------------------------------------------------------- clutter
// The host supplies sample(x, z) -> null (nothing grows here) or { y: rendered ground height, s: surface code, rock: [r g b]
// linear or null } where s is one of CL_* below. Cells (8 m) are generated once while in reach and cached.
export const CL = Object.freeze({ GRASS: 0, SAND: 1, ROCK: 2, SHINGLE: 3, MUD: 4, DIRT: 5, DUNE: 6 });
const CELL = 8;
export function createClutter({ scene, fog = null, uTime = null, shared, sample }) {
  const root = new THREE.Group(); root.name = 'rk-nature-clutter'; scene.add(root);
  const types = ['tuft', 'bush', 'rock', 'stone'], r = prng(1980);
  const geo = { tuft: tuftGeo(r).geometry(), bush: treeGeo(SCRUB, 'detail').geometry(), rock: rockGeo(r).geometry(), stone: rockGeo(r, true).geometry() };
  // tufts take the terrain's own grass colour at their root (the RK world palette and noise), so they grow out of the
  // ground instead of sitting on it as a second green; aC then only shifts them (dry, fresh)
  const grassMat = natureMaterial({ kind: 'clutter', fog, uTime, shared, side: THREE.DoubleSide, gain: 1.9 });
  {   // (the colour needs only the RK world noise functions, not the world shader: also right with ?rk=nature)
    const ob = grassMat.onBeforeCompile;
    grassMat.onBeforeCompile = sh => {
      ob(sh);
      // both faces of a blade light as the ground does (DOUBLE_SIDED would turn the back face normal down: black blades)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
      sh.vertexShader = sh.vertexShader.replace('attribute vec4 aP, aR;', RK_TERRAIN_GLSL + '\n attribute vec4 aP, aR;')
        .replace('vColor.rgb*=aC*uNatGain;', `{ vec2 P=aP.xz; float m1=rkN2(P*.011), m2=rkN2(P*.047+3.1), m3=rkN2(P*.23+7.7), v=m1*.55+m2*.3+m3*.15;
            vec3 g=mix(mix(vec3(.14,.37,.12),vec3(.22,.5,.16),smoothstep(.25,.65,v)),vec3(.36,.5,.2),smoothstep(.5,.85,m1+max(aP.y,0.)*.0008));
            float dry=smoothstep(.55,.8,rkN2(P*.06+11.)+.15*rkN2(P*.3)); g=mix(g,vec3(.52,.5,.27),dry*.55);
            g=pow(g,vec3(2.2)); vColor.rgb*=g*aC*uNatGain*(.78+.44*fract(aR.w*13.7)); }   // (+ a per-tuft brightness)`);
    };
    grassMat.customProgramCacheKey = () => 'rknature-grass' + (fog ? 'F' : '');
  }
  const mats = { tuft: grassMat, bush: natureMaterial({ kind: 'clutter', fog, uTime, shared, gain: 1.4, side: THREE.DoubleSide }), rock: natureMaterial({ kind: 'clutter', fog, uTime, shared, gain: 1.5 }) };
  mats.stone = mats.rock;
  const sets = {}; for (const t of types) { sets[t] = instanced(geo[t], mats[t], t === 'tuft' ? 20000 : 3000, depthMaterial(shared, 'clutter')); root.add(sets[t].mesh); sets[t].mesh.userData.rkShadow = t === 'rock' || t === 'bush' ? 'both' : 'receive'; }   // (grass and stones do not cast: 15k tiny casters)
  const cells = new Map(), key = (i, j) => i * 65536 + j, ringCache = [];
  const stats = { cells: 0, tuft: 0, bush: 0, rock: 0, stone: 0, genMs: 0, ms: 0, tris: 0 };
  let lastI = 1e9, lastJ = 1e9, lastY = 1e9, dirty = true; const lastDir = {};
  const STONE = lin(0x9a968c), STRAW = [1.35, 1.12, 0.5];   // STRAW: a tint on the grass colour (dry summer tufts, marram on the dunes)
  // one cell: everything that grows in it (whatever the tier: the tier picks by rank at assembly)
  function gen(ci, cj) {
    const h = (a, b) => fract(Math.sin((ci * 127.1 + cj * 311.7) + a * 74.7 + b * 13.13) * 43758.5453);
    const out = { tuft: [], bush: [], rock: [], stone: [] };
    const put = (t, x, y, z, s, seed, c, tilt = 0.06) => { const a = seed * 6.283, b = fract(seed * 17.3) * 6.283; out[t].push(x, y, z, s, a, Math.cos(b) * tilt * fract(seed * 5.1), Math.sin(b) * tilt * fract(seed * 5.1), seed, c[0], c[1], c[2]); };
    for (let k = 0; k < 34; k++) {
      const x = (ci + h(k, 1)) * CELL, z = (cj + h(k, 2)) * CELL, q = sample(x, z); if (!q) continue;
      const u = h(k, 3), w = h(k, 4), s = q.s;
      // how much of each grows on this surface (per candidate; 26 candidates a cell = ~0.4 /m2 at most)
      const tuftP = s === CL.GRASS ? 0.85 : s === CL.MUD ? 0.8 : s === CL.DUNE ? 0.35 : s === CL.DIRT ? 0.25 : s === CL.ROCK ? 0.12 : 0;
      const stoneP = s === CL.SHINGLE ? 0.9 : s === CL.ROCK ? 0.45 : s === CL.DIRT ? 0.3 : s === CL.SAND ? 0.06 : 0.07;
      const rockP = s === CL.ROCK ? 0.09 : s === CL.SHINGLE ? 0.04 : s === CL.GRASS ? 0.008 : 0.004;
      const bushP = s === CL.GRASS ? 0.012 : s === CL.ROCK ? 0.018 : s === CL.DUNE ? 0.01 : 0;
      if (u < tuftP) {
        const dry = s === CL.DUNE ? 0.85 : w < 0.25 ? 0.55 : 0, c = mixc([1, 1, 1], STRAW, dry);
        put('tuft', x, q.y - 0.04, z, (s === CL.MUD ? 1.3 : s === CL.DUNE ? 1.1 : 0.5) + w * 0.55, h(k, 5), c, 0.15);
      } else if (u < tuftP + stoneP) {
        const rc = q.rock || STONE; put('stone', x, q.y - 0.02, z, 0.07 + w * w * 0.22, h(k, 6), mulc(rc, 0.85 + h(k, 7) * 0.3), 0.4);
      } else if (u < tuftP + stoneP + rockP) {
        const rc = q.rock || STONE; put('rock', x, q.y - 0.25 * (0.35 + w), z, 0.35 + w * w * 1.1, h(k, 6), mulc(rc, 0.8 + h(k, 7) * 0.3), 0.25);
      } else if (u < tuftP + stoneP + rockP + bushP) {
        put('bush', x, q.y - 0.1, z, 0.55 + w * 0.8, h(k, 8), [1.2 + w * 0.25, 1.25 + h(k, 9) * 0.15, 1.05], 0.08);
      }
    }
    // the cell's height span (the cone test treats a cell as a sphere round its middle)
    let y0 = Infinity, y1 = -Infinity; for (const t of types) for (let o = 1; o < out[t].length; o += 11) { y0 = Math.min(y0, out[t][o]); y1 = Math.max(y1, out[t][o]); }
    const c = { y: y0 <= y1 ? (y0 + y1) / 2 : 0, dy: y0 <= y1 ? (y1 - y0) / 2 : 0 }; for (const t of types) c[t] = new Float32Array(out[t]); return c;
  }
  // the set is refilled when the camera crosses a cell or climbs/descends a few metres (the ring is 3D: from 200 m up there
  // is nothing in reach, and nothing is drawn)
  function update(cam) {
    const t0 = performance.now(), T = shared.tier, R = T.clutterR, p = cam.position;
    const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), yq = Math.round(p.y / 4);
    const turned = coneMoved(cam, lastDir);
    if (!dirty && !turned && ci === lastI && cj === lastJ && yq === lastY) { stats.ms = 0; return; }
    coneMark(cam, lastDir); const C = viewCone(cam);
    const ground = sample(p.x, p.z), above = Math.max(0, p.y - (ground ? ground.y : 0));
    const reach = above < R ? Math.sqrt(R * R - above * above) : 0, n = Math.ceil(reach / CELL) + 1;
    let gen0 = performance.now(), genBudget = 0;
    for (const t of types) sets[t].begin();
    const dens = { tuft: T.grass, bush: T.bush, rock: T.rocks, stone: T.rocks };
    let complete = true;
    // nearest cells first: when the generation budget runs out, what exists is what is under your feet
    const order = ringCache[n] ||= Array.from({ length: (2 * n + 1) ** 2 }, (_, k) => [k % (2 * n + 1) - n, Math.floor(k / (2 * n + 1)) - n]).sort((a, b) => a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1]);
    if (reach > 0) for (const [di, dj] of order) {
      const i = ci + di, j = cj + dj, x = (i + 0.5) * CELL - p.x, z = (j + 0.5) * CELL - p.z;
      if (x * x + z * z > (reach + CELL) * (reach + CELL)) continue;
      let c = cells.get(key(i, j));
      if (!c) { if (genBudget > 6) { complete = false; continue; } const g0 = performance.now(); c = gen(i, j); cells.set(key(i, j), c); genBudget += performance.now() - g0; }
      c.used = true;   // (cells out of the cone are generated too, nearest first, so a turn finds them ready)
      if (!inCone(C, (i + 0.5) * CELL, c.y, (j + 0.5) * CELL, CELL * 0.71 + 2.5 + c.dy)) continue;
      for (const t of types) { const a = c[t], d = dens[t]; for (let o = 0; o < a.length; o += 11) if (fract(a[o + 7] * 7.31) < d) pushRaw(sets[t], a, o); }
    }
    for (const t of types) { sets[t].end(); stats[t] = sets[t].n; }
    // forget cells well out of reach
    if (cells.size > 4 * (2 * n + 2) ** 2 + 64) for (const [k, c] of cells) { if (!c.used) cells.delete(k); }
    for (const c of cells.values()) c.used = false;
    lastI = ci; lastJ = cj; lastY = yq; dirty = !complete;
    stats.cells = cells.size; stats.genMs = +genBudget.toFixed(2); stats.ms = +(performance.now() - t0).toFixed(2); void gen0;
    stats.tris = types.reduce((a, t) => a + sets[t].n * sets[t].tris, 0);
  }
  function pushRaw(set, a, o) {
    if (set.n >= set.cap) set.ensure(set.n + 1);
    const n = set.n++; set.P.array.set(a.subarray(o, o + 4), n * 4); set.R.array.set(a.subarray(o + 4, o + 8), n * 4); set.C.array.set(a.subarray(o + 8, o + 11), n * 3);
  }
  return { update, stats, root, sets, reset: () => { cells.clear(); dirty = true; }, markDirty: () => { dirty = true; } };
}

// ------------------------------------------------------------------------------------------------- terrain detail
// Compiled into main.js's terrain shader with RK_NATURE (needs RK_WORLD: rkN2 / rkH2). In: the composed ground colour c,
// its normal n, world position P, the surface weights (grass, rock, sand, soil, snow), the slope, the eye distance.
// Out: c with patches, grain and pebbles; n tilted by the grain / pebbles / strata so the sun picks them out. Each band
// fades out where a pixel covers more than ~a third of its wavelength (fwidth), so nothing shimmers at a distance.
export const NATURE_TERRAIN_GLSL = /* glsl */`
    uniform float uNatK, uNatR;
    float rnBand(float pf, float freq){ return 1.-smoothstep(.22,.65,pf*freq); }
    void rnDetail(inout vec3 c, inout vec3 n, vec3 P, float wG, float wR, float wS, float wSoil, float wSn, float sl, float dist, float t){
      vec2 xz=P.xz; float pf=max(length(dFdx(xz)),length(dFdy(xz)));
      // --- every distance (cheap): dry summer grass and bare soil in patches, so a hillside is not one green
      float dry=smoothstep(.5,.82,rkN2(xz*.06+11.)*.8+rkN2(xz*.31+2.)*.2);
      float soil=smoothstep(.72,.84,rkN2(xz*.19+3.)*.72+rkN2(xz*.83+9.)*.28+sl*.35);
      vec3 straw=vec3(.56,.52,.3)*(.9+.2*rkN2(xz*.7));
      c=mix(c,mix(c,straw,.6),dry*wG);
      c=mix(c,vec3(.43,.36,.25)*(.85+.3*rkN2(xz*1.3)),soil*wG*.6);
      // --- the shore: the dark intertidal band on rock (weed and wet stone), wet sand that comes and goes with the swash
      float tide=1.15+.25*rkN2(xz*.15)+.08*sin(t*.4+xz.x*.03);
      float inter=(1.-smoothstep(tide-.35,tide,P.y))*wR;
      c=mix(c,mix(vec3(.11,.12,.09),vec3(.16,.2,.11),rkN2(xz*1.7))*(.8+.4*rkN2(xz*5.)),inter*.85);
      float swash=.35+.18*sin(t*.55+rkN2(xz*.05)*6.)+.2*rkN2(xz*.4);
      float wet=(1.-smoothstep(swash*.4,swash+.1,P.y))*wS;
      c*=1.-.22*wet;
      if(dist>uNatR||uNatK<=0.) return;
      float near=(1.-smoothstep(uNatR*.6,uNatR,dist))*uNatK;
      // --- grass grain: two crossed streak noises (blades), and a bump field that tilts the normal
      float fG=rnBand(pf,3.5)*near*wG*(1.-soil*.6);
      if(fG>.01){
        vec2 q=vec2(xz.x*.8+xz.y*.6,-xz.x*.6+xz.y*.8);
        float bl=rkN2(vec2(q.x*6.,q.y*1.4))*.55+rkN2(vec2(q.y*7.,q.x*1.7)+4.)*.45;
        c*=mix(1.,.8+.4*bl,fG);
        float e=.12, b0=rkN2(xz*2.1)+.5*rkN2(xz*5.3), bx=rkN2((xz+vec2(e,0.))*2.1)+.5*rkN2((xz+vec2(e,0.))*5.3), bz=rkN2((xz+vec2(0.,e))*2.1)+.5*rkN2((xz+vec2(0.,e))*5.3);
        n=normalize(n+vec3(b0-bx,0.,b0-bz)/e*.045*fG);
      }
      // --- pebbles on soil, sand and rock: a jittered dot per 0.4 m cell, a little dome that catches the light
      float fP=rnBand(pf,10.)*near*clamp(wSoil+soil*wG+wS*.12+wR*.8,0.,1.);
      if(fP>.01){
        vec2 g=xz*2.5, gi=floor(g), gf=fract(g)-.5; float hs=rkH2(gi);
        vec2 o=(vec2(rkH2(gi+7.1),rkH2(gi+13.3))-.5)*.5; float rr=.1+.16*rkH2(gi+3.7);
        vec2 dv=(gf-o)/rr; float pb=(1.-smoothstep(.65,1.,length(dv)))*step(.45,hs)*fP;
        c=mix(c,mix(vec3(.55,.53,.5),vec3(.72,.7,.66),rkH2(gi+1.9))*(wR>.5?.8:1.),pb*.75);
        c*=1.-.1*fP*step(.45,hs)*smoothstep(.8,1.,length(dv))*(1.-smoothstep(1.,1.25,length(dv)));
        n=normalize(n+vec3(dv.x,0.,dv.y)*pb*.5);
      }
      // --- rock: strata (bands of differing tone), dark undercuts below each ledge, vertical joints, ledge tops tilted up
      float fR=near*wR;
      if(fR>.01){
        float sy0=P.y*.6+rkN2(xz*.05)*3.+rkN2(xz*.45)*.4, layer=floor(sy0), sy=layer+pow(fract(sy0),.6+.9*rkH2(vec2(layer,2.1))), st=fract(sy);
        float steep=smoothstep(.25,.6,sl);
        float tone=.86+.28*rkH2(vec2(layer,7.3));
        float under=(1.-smoothstep(0.,.18,st))*steep, ledge=smoothstep(.75,.95,st)*steep;
        vec2 hd=length(n.xz)>1e-3?normalize(n.xz):vec2(1.,0.);
        float joint=smoothstep(.82,.95,rkN2(vec2(dot(xz,vec2(-hd.y,hd.x))*1.6,P.y*.25+layer*3.)))*steep*rnBand(pf,1.6);
        c*=mix(1.,tone*(1.-.5*under)*(1.-.45*joint)*(1.+.12*ledge),fR);
        n=normalize(n+vec3(0.,(ledge*.9-under*.6)*fR*rnBand(pf,.9),0.)+vec3(hd.x,0.,hd.y)*under*.3*fR);
        float gr=rnBand(pf,4.)*fR; if(gr>.01){ float e=.15, r0=rkN2(xz*3.)+rkN2(vec2(xz.x,P.y)*2.3)*.5, rx=rkN2((xz+vec2(e,0.))*3.)+rkN2(vec2(xz.x+e,P.y)*2.3)*.5, rz=rkN2((xz+vec2(0.,e))*3.)+rkN2(vec2(xz.x,P.y)*2.3)*.5;
          c*=1.+(r0-.75)*.18*gr; n=normalize(n+vec3(r0-rx,0.,r0-rz)/e*.08*gr); }
      }
      // --- sand: ripples on the dry sand, a faint sheen on the wet
      float fS=rnBand(pf,3.)*near*wS*(1.-wet);
      if(fS>.01){ float rp=sin(dot(xz,vec2(.8,.6))*3.+rkN2(xz*.6)*4.); n=normalize(n+vec3(.8,0.,.6)*cos(dot(xz,vec2(.8,.6))*3.+rkN2(xz*.6)*4.)*.06*fS); c*=1.+rp*.04*fS; }
      // --- snow: wind crust (a faint bump only)
      if(wSn>.01){ float fN=rnBand(pf,1.5)*near*wSn; n=normalize(n+vec3(rkN2(xz*1.5)-.5,0.,rkN2(xz*1.5+9.)-.5)*.12*fN); }
    }
    // the swash lace: a thin broken foam line that runs up the sand and slides back (sea side, near the eye)
    float rnLace(vec2 p, float d, float t, float dist){
      if(dist>uNatR*1.4||d>.9) return 0.;
      float run=.18+.22*(.5+.5*sin(t*.55+rkN2(p*.05)*6.));
      float edge=1.-smoothstep(0.,.08,abs(d-run*.9));
      float lace=smoothstep(.45,.7,rkN2(p*1.3+vec2(t*.2,-t*.13))*.6+rkN2(p*4.1-t*.3)*.4);
      return clamp(edge*.9+(1.-smoothstep(0.,run,d))*lace*.55,0.,1.)*(1.-smoothstep(uNatR,uNatR*1.4,dist));
    }
`;
