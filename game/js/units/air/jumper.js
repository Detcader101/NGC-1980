// 1980 US paratrooper (Marine force recon / Army airborne) and the MC1-1 steerable round canopy he jumps with.
// The figure is deliberately a separate builder with a small rig contract, so the INFANTRY agent's soldier model can
// replace it: drop.js only uses { group, body, legs[2], arms[2], pose(name, t), setKit(k) } from buildParatrooper().
//
// Kit (bible: M1 steel helmet, OG-107 / ERDL woodland, ALICE): M1 helmet with the ERDL-pattern cover and a chin strap,
// ERDL leaf-pattern jungle utilities (or plain OG-107 sateen), black jump boots, the T-10 harness, the T-10 reserve on the
// chest, the MC1-1 main in its pack tray on the back, the ALICE pack hung below the reserve, the M16A1 in its M1950
// weapons case down the left side. Repair team: the ALICE carries the tools; the figure is 1.78 m tall.
// Canopy (FM 3-21.220 / TM 10-1670-1: CONFIRMED): MC1-1 35 ft nominal diameter (10.7 m), 30 gores, olive drab nylon,
// a TU-shaped cut-out of the rear gores for ~8 kt forward drive, two steering toggles on the rear risers; descent
// ~18 ft/s at a 250 lb jumper (sea level), a 360 deg turn in ~9 s. Inflated diameter ~0.7 x nominal = 7.5 m (INFERRED);
// lines 25 ft (7.6 m) from the skirt to the connector links (INFERRED from the T-10 family).
// Frame: +y up, the jumper faces -z, origin between his feet.
import * as THREE from 'three';

const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const boxG = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const mesh = (geo, mat, parent, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; parent && parent.add(m); return m; };
const group = (parent, name, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent && parent.add(o); return o; };

// ERDL leaf pattern (green-dominant 1980 issue) as a small canvas texture shared by every jumper
let erdlTex = null;
function erdl() {
  if (erdlTex) return erdlTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#6b7448'; x.fillRect(0, 0, 64, 64);
  const blot = (col, n, s) => { x.fillStyle = col; for (let i = 0; i < n; i++) { x.beginPath(); const cx = Math.random() * 64, cy = Math.random() * 64; x.ellipse(cx, cy, s * (0.5 + Math.random()), s * (0.3 + Math.random() * 0.5), Math.random() * 3, 0, 7); x.fill(); } };
  blot('#3f4a2b', 14, 6); blot('#7a6a45', 9, 4); blot('#1f2219', 10, 2.5);
  erdlTex = new THREE.CanvasTexture(c); erdlTex.wrapS = erdlTex.wrapT = THREE.RepeatWrapping; erdlTex.colorSpace = THREE.SRGBColorSpace; erdlTex.magFilter = THREE.NearestFilter;
  return erdlTex;
}
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const t = erdl();
  return MATS = {
    erdl: new THREE.MeshLambertMaterial({ map: t, flatShading: true }), og: M(0x56603d), skin: M(0xc79b78), skin2: M(0x8a5f43),
    helmet: new THREE.MeshLambertMaterial({ map: t, color: 0xb8c0a0, flatShading: true }), boot: M(0x161616), web: M(0x4d5634),
    reserve: M(0x5a6440), pack: M(0x4a5233), metal: M(0x777b7e), black: M(0x1c1c1c), tool: M(0x7c2c1c), alice: M(0x4f5a38), strap: M(0x3a4128),
  };
}

// the figure: legs and arms pivot at hip and shoulder; body pivots at the hips (so it can tip into the exit position)
export function buildParatrooper(o = {}) {
  const K = mats(), shirt = o.og ? K.og : K.erdl, g = group(null, 'paratrooper');
  const body = group(g, 'body', 0, 0.94, 0);   // hip pivot
  const add = (geo, m, p = body, n) => mesh(geo, m, p, n);
  // torso + harness
  add(boxG(0.4, 0.58, 0.24, 0, 0.3, 0), shirt, body, 'torso');
  for (const s of [-1, 1]) add(boxG(0.06, 0.62, 0.27, s * 0.12, 0.3, 0), K.web);                      // main lift webs
  add(boxG(0.42, 0.06, 0.27, 0, 0.12, 0), K.web); add(boxG(0.42, 0.05, 0.27, 0, 0.42, 0), K.web);     // chest strap, waist band
  add(boxG(0.06, 0.06, 0.06, 0, 0.2, -0.17), K.metal);                                                 // quick release box
  // main pack tray on the back, reserve on the chest, ALICE below it, weapons case left
  add(boxG(0.38, 0.52, 0.2, 0, 0.32, 0.22), K.pack, body, 'mainPack');
  add(boxG(0.34, 0.2, 0.16, 0, 0.14, -0.21), K.reserve, body, 'reserve'); add(boxG(0.06, 0.03, 0.03, 0.12, 0.14, -0.3), K.metal);
  const alice = add(boxG(0.36, 0.36, 0.2, 0, -0.18, -0.27), K.alice, body, 'alice'); add(boxG(0.3, 0.06, 0.04, 0, -0.06, -0.38), K.strap);
  add(boxG(0.09, 0.85, 0.12, -0.26, -0.12, 0.02), K.web, body, 'weaponsCase');
  // head: face, M1 helmet with the ERDL cover, chin strap; arms
  const head = group(body, 'head', 0, 0.68, 0);
  add(boxG(0.17, 0.2, 0.19, 0, 0, 0), K.skin, head); add(boxG(0.1, 0.04, 0.02, 0, -0.02, -0.1), K.skin2, head);
  add(new THREE.SphereGeometry(0.16, 9, 5, 0, Math.PI * 2, 0, 1.5).scale(1, 0.85, 1.08).translate(0, 0.04, 0.0), K.helmet, head, 'helmet');
  add(new THREE.CylinderGeometry(0.168, 0.172, 0.03, 10).translate(0, 0.03, 0.01), K.helmet, head);   // rim
  for (const s of [-1, 1]) add(boxG(0.01, 0.16, 0.025, s * 0.09, -0.06, 0), K.web, head);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const a = group(body, 'arm', s * 0.25, 0.53, 0);
    add(boxG(0.12, 0.3, 0.13, 0, -0.15, 0), shirt, a); add(boxG(0.1, 0.28, 0.11, 0, -0.43, 0), shirt, a); add(boxG(0.09, 0.09, 0.1, 0, -0.62, 0), K.skin, a);
    arms.push(a);
    const l = group(g, 'leg', s * 0.11, 0.92, 0);
    add(boxG(0.16, 0.44, 0.18, 0, -0.22, 0), shirt, l); add(boxG(0.14, 0.4, 0.15, 0, -0.62, 0), shirt, l);
    add(boxG(0.14, 0.12, 0.27, 0, -0.86, -0.04), K.boot, l);
    legs.push(l);
  }
  // repair kit: a toolbox strapped below the reserve (it rides on the lowering line after the canopy opens)
  const kit = group(body, 'kit', 0, -0.42, -0.3); add(boxG(0.36, 0.18, 0.18, 0, 0, 0), K.tool, kit); add(boxG(0.3, 0.03, 0.04, 0, 0.1, 0), K.black, kit);
  const rig = { group: g, body, head, arms, legs, kit, alice };
  // poses: stand (in the hold), door (in the door, hands on the edges), exit (tight body position: chin down, elbows in,
  // hands on the reserve, feet together), canopy (hands up on the toggles / risers, feet and knees together), run, work
  rig.pose = (name, t = 0) => {
    body.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    for (const l of legs) l.rotation.set(0, 0, 0);
    for (const a of arms) a.rotation.set(0, 0, 0);
    kit.position.set(0, -0.42, -0.3);
    if (name === 'door') { arms[0].rotation.set(-0.3, 0, 1.2); arms[1].rotation.set(-0.3, 0, -1.2); legs[0].rotation.x = -0.25; body.rotation.x = 0.15; }
    else if (name === 'exit') { body.rotation.x = 0.35; head.rotation.x = 0.4; arms[0].rotation.set(-1.6, 0, -0.3); arms[1].rotation.set(-1.6, 0, 0.3); legs[0].rotation.x = legs[1].rotation.x = 0.25; }
    else if (name === 'canopy') { arms[0].rotation.set(0, 0, -2.75); arms[1].rotation.set(0, 0, 2.75); legs[0].rotation.x = legs[1].rotation.x = -0.12; kit.position.set(0, -2.4, -0.1); }
    else if (name === 'plf') { body.rotation.x = 0.5; legs[0].rotation.x = legs[1].rotation.x = -0.9; arms[0].rotation.set(-2.4, 0, -0.4); arms[1].rotation.set(-2.4, 0, 0.4); }
  };
  rig.setKit = k => { kit.visible = !!k; };
  rig.pose('stand');
  return rig;
}

// MC1-1: an olive drab dome of 30 gores with the TU cut-out in the rear, suspension lines to four risers, toggles
export function buildMC1Canopy() {
  const g = group(null, 'mc1-1'), dome = group(g, 'dome', 0, 7.9, 0);
  const R = 3.75, H = 2.3, N = 30, rings = 6;
  const od = M(0x5a6038, { side: THREE.DoubleSide }), od2 = M(0x4e5431, { side: THREE.DoubleSide }), apexM = M(0x3f4429, { side: THREE.DoubleSide });
  // dome surface: gore k spans angle [k, k+1]; ring j from the apex (j = 0) to the skirt (j = rings); profile is a
  // flattened hemisphere with the skirt pulled in a little, as an inflated round canopy looks
  const P = (k, j) => { const a = (k / N) * Math.PI * 2, t = j / rings, polar = t * Math.PI * 0.5 * 1.08, r = R * Math.sin(polar) * (j === rings ? 0.93 : 1), y = H * Math.cos(polar); return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  // TU cut-out: rear gores (around +z, the jumper faces -z), the "T" bar across rings 2-3 and the two "U" legs down
  const isHole = (k, j) => { const dk = Math.min(Math.abs(k - 0), Math.abs(k - N)) + 0.5 - 0.5, kk = (k + N / 2) % N - N / 2 + 0.5;   // kk: gore offset from the rear centre
    const ak = Math.abs(kk); return (j === 2 && ak < 4) || ((j === 3 || j === 4) && ak > 2.5 && ak < 4); };
  const pos = [[], [], []];
  for (let k = 0; k < N; k++) for (let j = 0; j < rings; j++) {
    if (isHole(k, j)) continue;
    const a = P(k, j), b = P(k + 1, j), c = P(k + 1, j + 1), d = P(k, j + 1), m = j === 0 ? 2 : k % 2;
    pos[m].push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  [od, od2, apexM].forEach((m, i) => { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos[i], 3)); ge.computeVertexNormals(); mesh(ge, m, dome, 'canopyPanels'); });
  // vent cap at the apex
  mesh(new THREE.CircleGeometry(0.28, 10).rotateX(-Math.PI / 2).translate(0, H + 0.02, 0), apexM, dome, 'vent');
  // suspension lines: every second gore seam to the nearest of four riser ends (connector links ~0.7 m above the shoulders)
  const links = [[-0.18, 2.25, -0.08], [0.18, 2.25, -0.08], [-0.18, 2.25, 0.12], [0.18, 2.25, 0.12]];
  const lp = [];
  for (let k = 0; k < N; k += 1) {
    const s = P(k, rings), sw = [s[0], s[1] + 7.9, s[2]];
    const li = (s[0] < 0 ? 0 : 1) + (s[2] < 0 ? 0 : 2);
    lp.push(...sw, ...links[li]);
  }
  for (const L of links) lp.push(L[0], L[1], L[2], L[0] * 0.8, 1.55, L[2] * 0.5);   // risers down to the shoulder
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xc8c8b8, transparent: true, opacity: 0.55 })); lines.name = 'lines'; g.add(lines);
  const toggles = [-1, 1].map(s => { const t = mesh(boxG(0.03, 0.12, 0.03), M(0x1c1c1c), g, 'toggle'); t.position.set(s * 0.2, 2.05, 0.15); return t; });
  // inflation 0..1 (a streamer, then the skirt opens), breathing, steering (one toggle down)
  const anim = { open: 1 };
  const animate = (time, open = 1, steer = 0) => {
    const o = Math.max(0.05, Math.min(1, open)), w = o * o * (3 - 2 * o), br = 1 + 0.025 * Math.sin(time * 2.3) * w;
    dome.scale.set((0.12 + 0.88 * w) * br, 0.6 + 0.4 * w + 0.6 * (1 - w), (0.12 + 0.88 * w) * br);
    lines.scale.set(0.15 + 0.85 * w, 1, 0.15 + 0.85 * w);
    dome.rotation.z = steer * 0.12; dome.rotation.x = 0.06;   // the canopy leans into a turn, and back over the drive
    toggles[0].position.y = 2.05 - Math.max(0, -steer) * 0.5; toggles[1].position.y = 2.05 - Math.max(0, steer) * 0.5;
  };
  animate(0, 1, 0);
  return { group: g, dome, lines, animate, anim };
}
