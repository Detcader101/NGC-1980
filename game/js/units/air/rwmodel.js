// RUNAWAY aircraft models, house style, real (or, for the SHRIKE, setting-true) proportions:
//   RW-4 SHRIKE   futuristic fighter drone (BIBLE: sleek, asymmetric, matte ceramic and dark composite, pale cyan
//                 emissive seams, no pilot, no windows, a sensor cluster where a cockpit would be). 11.5 m, span 8.2 m.
//   MQ-9 REAPER   seized modern UAV: 11 m long, 20.1 m span, V-tail with ventral fin, three-blade pusher, sensor ball;
//                 weathered USAF grey with the RUNAWAY refit (cyan IFF strips, a bolted-on sensor pod, painted-out
//                 markings with machine stencils over them).
//   SHAHED-style  one-way delta drone: 3.5 m long, 2.5 m span, tip fins, two-blade pusher, drab paint, RUNAWAY stencil.
// animate(sim) poses the moving parts from the sim (airframe A for the SHRIKE / REAPER, point-mass D for the SHAHED).
import * as THREE from 'three';
import { M, B, V, slab, loft, merge, cylZ, boxG, mesh, rod, hinged, tube, addM, canvasTex, decal, drawRunawayMark } from './meshkit.js';
import { SHRIKE, REAPER } from './rwfm.js';

const cyanM = () => B(0x8ff8ff);
const rwTex = (text) => canvasTex('rwmark' + text, 256, 64, (x, w, h) => { x.clearRect(0, 0, w, h); drawRunawayMark(x, w, h, text); });

// ============================================================================================ RW-4 SHRIKE
export function buildShrikeModel() {
  const g = new THREE.Group(); g.name = 'shrike';
  const ceramM = M(0xd6d3cb, { shininess: 6 }), compM = M(0x2a2d32, { shininess: 10 }), darkM = M(0x111316), seamM = cyanM(), lensM = M(0x0a1418, { emissive: 0x0b4048, shininess: 90 });
  // body: a flat chined blended delta, lofted from diamond sections (half profile: top, chine, keel)
  const P = [
    [-6.2, [[0, -0.05], [0, -0.05], [0, -0.05]]],
    [-5.4, [[0, 0.16], [0.42, -0.02], [0, -0.2]]],
    [-4.2, [[0, 0.36], [0.78, 0.0], [0, -0.36]]],
    [-2.6, [[0, 0.52], [1.25, 0.02], [0, -0.48]]],
    [-0.8, [[0, 0.62], [1.6, 0.03], [0, -0.55]]],
    [1.2, [[0, 0.58], [1.55, 0.03], [0, -0.52]]],
    [3.4, [[0, 0.44], [1.15, 0.02], [0, -0.4]]],
    [5.0, [[0, 0.26], [0.75, 0.0], [0, -0.26]]],
    [5.5, [[0, 0.18], [0.6, 0.0], [0, -0.2]]],
  ];
  const rings = P.map(([z, h]) => { const r = [...h.map(([x, y]) => [x, y, z]), ...h.slice(0, 2).reverse().map(([x, y]) => [-x, y, z])]; r.push(r[0]); return r; });
  mesh(loft(rings, (r, k) => (k === 0 || k === 3 ? 0 : 1)), [ceramM, compM], g, 'body');
  // the wing: cranked delta, ceramic top panels with a dark composite leading edge; asymmetric dorsal intake on the right
  for (const s of [-1, 1]) {
    mesh(slab([[0.9, -3.0, .16], [2.2, -0.9, .14], [4.1, 2.0, .08], [4.1, 3.0, .06], [3.2, 3.6, .07], [1.0, 3.8, .12]], (a, b, w) => [s * a, 0.02 + w, b]), ceramM, g, 'wing');
    mesh(slab([[0.9, -3.0, .17], [2.2, -0.9, .15], [4.1, 2.0, .09], [3.9, 2.15, .09], [2.0, -0.75, .15], [0.85, -2.7, .17]], (a, b, w) => [s * a, 0.02 + w, b]), compM, g, 'wingLE');
    // emissive seams: along the chine and the wing leading edge, and across the wing where the ceramic meets the composite
    tube([[s * 0.3, 0.0, -5.7], [s * 0.78, 0.04, -4.2], [s * 1.25, 0.06, -2.6], [s * 1.6, 0.07, -0.8], [s * 1.55, 0.07, 1.2], [s * 1.15, 0.06, 3.4]], 0.022, seamM, g, 'seam', 16);
    tube([[s * 1.0, 0.15, -2.75], [s * 2.15, 0.13, -0.7], [s * 3.95, 0.09, 2.05]], 0.02, seamM, g, 'seam', 10);
    tube([[s * 3.3, 0.1, 3.5], [s * 4.05, 0.08, 2.9]], 0.02, seamM, g, 'seam', 4);
  }
  // asymmetric dorsal intake: a flattened scoop on the right shoulder, fairing back into the spine
  mesh(loft([[-1.9, 0.18, 0.55], [-1.2, 0.36, 0.5], [0.6, 0.4, 0.42], [2.4, 0.28, 0.3], [3.4, 0.12, 0.18]].map(([z, hgt, hw]) => [[0.55 - hw, 0.5, z], [0.55 - hw * 0.8, 0.5 + hgt, z], [0.55 + hw * 0.8, 0.5 + hgt * 0.9, z], [0.55 + hw, 0.48, z]])), compM, g, 'dorsalIntake');
  mesh(new THREE.PlaneGeometry(0.85, 0.17).rotateY(Math.PI).translate(0.55, 0.6, -1.92), M(0x05080a, { emissive: 0x06363c }), g, 'intakeMouth');
  // sensor cluster instead of a cockpit: an asymmetric group of lenses, cyan ring
  const sc = new THREE.Group(); sc.position.set(-0.12, 0.3, -4.1); g.add(sc);
  mesh(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.4), compM, sc, 'sensorHump');
  for (const [x, y, z, r] of [[0, 0.12, -0.35, 0.11], [0.17, 0.08, -0.18, 0.07], [-0.15, 0.1, -0.12, 0.06], [0.05, 0.18, 0.02, 0.05]]) mesh(new THREE.SphereGeometry(r, 8, 6).translate(x, y, z), lensM, sc, 'lens');
  mesh(new THREE.TorusGeometry(0.16, 0.018, 4, 16).rotateX(Math.PI / 2 - 0.3).translate(0, 0.13, -0.33), seamM, sc, 'lensRing');
  // canted ruddervators and elevons
  const surf = {};
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', cant = 0.62;
    const map = (z, v, w) => [s * (0.55 + v * Math.sin(cant) + w * Math.cos(cant)), 0.3 + v * Math.cos(cant) - w * Math.sin(cant), z];
    mesh(slab([[2.8, 0, .1], [4.2, 1.5, .06], [5.0, 1.5, .05], [4.9, 0, .08]], map), compM, g, 'fin' + S);
    surf['rud' + S] = hinged(g, slab([[4.9, 0.05, .06], [5.0, 1.45, .04], [5.45, 1.45, .03], [5.5, 0.05, .04]], map), ceramM, V(...map(4.9, 0.05, 0)), V(...map(5.0, 1.45, 0)), 'ruddervator' + S);
    mesh(new THREE.BoxGeometry(0.03, 0.03, 1.4).translate(...map(4.4, 1.47, 0.05)), seamM, g, 'seam');
    const p0 = V(s * 1.05, 0.02, 3.75), p1 = V(s * 3.3, 0.02, 3.55);
    surf['elev' + S] = hinged(g, slab([[1.05, 3.75, .06], [3.3, 3.55, .05], [3.25, 4.25, .03], [1.05, 4.35, .04]], (a, b, w) => [s * a, 0.02 + w, b]), compM, ...(s > 0 ? [p0, p1] : [p1, p0]), 'elevon' + S);
  }
  // flat 2D nozzle with a cyan-white exhaust glow
  mesh(boxG(1.1, 0.34, 0.6, 0, 0.02, 5.6), darkM, g, 'nozzle');
  const glowM = addM(0x7fe8ff), glow = mesh(new THREE.BoxGeometry(0.9, 0.16, 1).translate(0, 0, 0.5), glowM, g, 'exhaust'); glow.position.set(0, 0.02, 5.92);
  mesh(new THREE.PlaneGeometry(0.95, 0.2).translate(0, 0.02, 5.91), M(0x0c1214, { emissive: 0x2a8a96 }), g, 'nozzleFace');
  // missile bay doors (closed) with a seam, IFF strip
  mesh(boxG(1.4, 0.02, 2.2, 0, -0.56, -0.4), compM, g, 'bayDoors'); mesh(boxG(0.02, 0.025, 2.2, 0, -0.575, -0.4), seamM, g, 'bayseam');
  const tx = decal(rwTex('RW-4'), 1.4, 0.35, g, 'stencil'); tx.position.set(-2.4, 0.075, 0.9); tx.rotation.set(-Math.PI / 2, 0, -0.35);
  // gear (only when lowered)
  const gearG = new THREE.Group(); g.add(gearG); gearG.name = 'gear';
  for (const p of SHRIKE.GEAR) { rod(V(p[0], -0.4, p[2]), V(p[0], p[1] + 0.3, p[2]), 0.09, M(0x8a8f95), gearG); mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10).rotateZ(Math.PI / 2).translate(p[0], p[1] + 0.3, p[2]), M(0x1b1b1b), gearG, 'tyre'); }
  function animate(A, dt = 0, time = 0) {
    const S = A.surf || {}, el = S.stab || 0, ail = S.ail || 0, rud = S.rud || 0;
    surf.elevR.rotation.x = -(el + ail); surf.elevL.rotation.x = -(el - ail);
    surf.rudR.rotation.x = rud - el * 0.4; surf.rudL.rotation.x = rud + el * 0.4;
    const n = A.eng ? A.eng[0].n : 0.8, k = Math.max(0, (n - 0.6) / 0.4);
    glow.scale.set(1, 1, 0.5 + 3 * k * (1 + 0.08 * Math.sin(time * 37))); glowM.opacity = 0.08 + 0.25 * k;
    seamM.color.setHSL(0.5, 1, 0.72 + 0.12 * Math.sin(time * 2.2));   // the seams breathe
    gearG.visible = (A.gear ?? 0) > 0.5;
  }
  animate({});
  return { group: g, animate, nozzles: [V(0, 0.02, 6.0)], tips: [V(-4.1, 0.05, 2.6), V(4.1, 0.05, 2.6)], parts: { surf } };
}

// ============================================================================================ MQ-9 REAPER
export function buildReaperModel() {
  const g = new THREE.Group(); g.name = 'reaper';
  const greyM = M(0x8d9398), lightM = M(0xa3a9ad), darkM = M(0x2a2d30), blackM = M(0x0f1011), patchM = M(0x6e7479), cyanS = cyanM(), podM = M(0x1d2023);
  // fuselage: bulbous satcom nose, slender body, tapering to the pusher; half profile [top, side, keel]
  const P = [
    [-5.45, [[0, 0.05], [0, 0.05], [0, 0.05]]],
    [-5.2, [[0, 0.32], [0.28, 0.08], [0, -0.22]]],
    [-4.6, [[0, 0.55], [0.42, 0.12], [0, -0.32]]],
    [-3.8, [[0, 0.6], [0.45, 0.1], [0, -0.36]]],
    [-2.6, [[0, 0.46], [0.42, 0.04], [0, -0.38]]],
    [0.0, [[0, 0.42], [0.4, 0.02], [0, -0.38]]],
    [2.6, [[0, 0.34], [0.3, 0.02], [0, -0.3]]],
    [4.6, [[0, 0.2], [0.17, 0.02], [0, -0.17]]],
    [5.1, [[0, 0.14], [0.12, 0.02], [0, -0.12]]],
  ];
  const rings = P.map(([z, h]) => { const r = [...h.map(([x, y]) => [x, y, z]), ...h.slice(0, 2).reverse().map(([x, y]) => [-x, y, z])]; r.push(r[0]); return r; });
  mesh(loft(rings), greyM, g, 'fuselage');
  // straight high-aspect wing (20.1 m), slightly tapered; ailerons and flaps
  const surf = {};
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', map = (a, b, w) => [s * a, 0.18 + a * 0.012 + w, b], LE = x => -0.85 + x * 0.025, TE = x => 0.55 - x * 0.03;
    mesh(slab([[0.35, LE(0.35), .2], [10.05, LE(10.05), .07], [10.05, TE(10.05), .05], [7.2, TE(7.2) - 0.3, .07], [3.0, TE(3.0) - 0.32, .12], [0.35, TE(0.35) - 0.32, .16]], map), lightM, g, 'wing' + S);
    const hp = (x, z) => V(...map(x, z, 0)), pair = (a, b) => s > 0 ? [a, b] : [b, a];
    surf['ail' + S] = hinged(g, slab([[7.2, TE(7.2) - 0.3, .06], [10.0, TE(10.0) - 0.3, .04], [10.0, TE(10.0), .03], [7.2, TE(7.2), .04]], map), lightM, ...pair(hp(7.2, TE(7.2) - 0.3), hp(10.0, TE(10.0) - 0.3)), 'ail' + S);
    surf['flap' + S] = hinged(g, slab([[0.5, TE(0.5) - 0.32, .1], [7.1, TE(7.1) - 0.3, .07], [7.1, TE(7.1), .05], [0.5, TE(0.5), .06]], map), lightM, ...pair(hp(0.5, TE(0.5) - 0.32), hp(7.1, TE(7.1) - 0.3)), 'flap' + S);
    // RUNAWAY refit: cyan IFF strip near the tip, old marking painted out with a darker patch
    mesh(boxG(0.7, 0.02, 1.25, s * 8.8, 0.32, -0.25), cyanS, g, 'iff');
    mesh(boxG(1.1, 0.012, 0.8, s * 5.2, 0.29, -0.3), patchM, g, 'paintedOut');
  }
  // V-tail (two upper surfaces at ~45°) with ruddervators, ventral fin
  for (const s of [-1, 1]) {
    const S = s < 0 ? 'L' : 'R', cant = 0.78, map = (z, v, w) => [s * (v * Math.sin(cant) + w * Math.cos(cant)), 0.2 + v * Math.cos(cant) - w * Math.sin(cant), z];
    mesh(slab([[3.5, 0.1, .1], [4.4, 2.2, .06], [4.95, 2.2, .05], [4.85, 0.1, .08]], map), greyM, g, 'vtail' + S);
    surf['rv' + S] = hinged(g, slab([[4.85, 0.15, .05], [4.95, 2.1, .04], [5.25, 2.1, .03], [5.2, 0.15, .04]], map), greyM, V(...map(4.85, 0.15, 0)), V(...map(4.95, 2.1, 0)), 'ruddervator' + S);
    mesh(new THREE.BoxGeometry(0.02, 0.025, 0.5).translate(...map(4.6, 1.9, 0.05)), cyanS, g, 'iffTail');
  }
  mesh(slab([[3.6, 0, .08], [4.9, 0, .06], [5.0, 1.15, .05], [4.6, 1.15, .05]], (z, v, w) => [w, -0.15 - v, z]), greyM, g, 'ventralFin');
  // pusher prop: three blades, spinner; a spinning disc at speed
  const prop = new THREE.Group(); prop.position.set(0, 0.02, 5.3); g.add(prop);
  mesh(new THREE.ConeGeometry(0.16, 0.45, 10).rotateX(Math.PI / 2).translate(0, 0, 0.22), darkM, prop, 'spinner');
  for (let k = 0; k < 3; k++) { const b = mesh(boxG(0.13, 1.25, 0.04, 0, 0.66, 0), blackM, prop, 'blade'); b.rotation.z = k * Math.PI * 2 / 3; b.children; }
  const discM = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = mesh(new THREE.CircleGeometry(1.3, 20), discM, prop, 'propDisc');
  // sensor ball under the nose (MTS-B), RUNAWAY sensor pod bolted under the left wing, satcom dome bump, antennas
  const ball = new THREE.Group(); ball.position.set(0, -0.48, -4.05); g.add(ball);
  mesh(cylZ(0.16, 0.16, 0.25, 8).rotateX(Math.PI / 2).translate(0, 0.15, 0), darkM, ball, 'ballMount');
  mesh(new THREE.SphereGeometry(0.27, 10, 8), M(0x3a3f44, { shininess: 50 }), ball, 'ball');
  mesh(new THREE.CircleGeometry(0.11, 10).translate(0, 0, -0.272).rotateY(Math.PI), M(0x0a1a22, { emissive: 0x0a3040, shininess: 99 }), ball, 'aperture');
  const pod = mesh(merge([cylZ(0.18, 0.18, 2.1, 8), new THREE.SphereGeometry(0.18, 8, 6).translate(0, 0, -1.05)]), podM, g, 'rwPod'); pod.position.set(-3.6, -0.15, -0.3);
  mesh(new THREE.TorusGeometry(0.185, 0.02, 4, 12).translate(0, 0, -0.5), cyanS, pod, 'podRing'); rod(V(-3.6, 0.12, -0.3), V(-3.6, -0.02, -0.3), 0.08, darkM, g, 'podPylon');
  for (const [x, z] of [[0, -1.0], [0.18, 1.5]]) mesh(boxG(0.03, 0.32, 0.18, x, 0.55, z), darkM, g, 'antenna');
  const st = decal(rwTex('RW-Q9'), 1.2, 0.3, g, 'stencil'); st.position.set(0.42, 0.05, -1.8); st.rotation.y = Math.PI / 2;
  const st2 = decal(rwTex('RW-Q9'), 1.2, 0.3, g, 'stencil'); st2.position.set(-0.42, 0.05, -1.8); st2.rotation.y = -Math.PI / 2;
  const gearG = new THREE.Group(); g.add(gearG);
  for (const p of REAPER.GEAR) { rod(V(p[0], -0.3, p[2]), V(p[0], p[1] + 0.22, p[2]), 0.06, M(0x8a8f95), gearG); mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10).rotateZ(Math.PI / 2).translate(p[0], p[1] + 0.22, p[2]), M(0x1b1b1b), gearG, 'tyre'); }
  let spin = 0;
  function animate(A, dt = 0, time = 0) {
    const S = A.surf || {}, ail = S.ail || 0, el = S.stab || 0, rud = S.rud || 0;
    surf.ailR.rotation.x = -ail; surf.ailL.rotation.x = ail; surf.flapR.rotation.x = surf.flapL.rotation.x = (S.flap || 0) * 0.5;
    surf.rvR.rotation.x = rud - el * 0.7; surf.rvL.rotation.x = rud + el * 0.7;
    const n = Math.max(0, A.eng ? A.eng[0].n : (A.prop ?? 0.6)); spin += dt * 170 * n; prop.rotation.z = spin;
    discM.opacity = Math.min(0.35, n * 0.5); for (const c of prop.children) if (c.name === 'blade') c.visible = n < 0.25;
    ball.rotation.y = Math.sin(time * 0.2) * 1.2; gearG.visible = (A.gear ?? 0) > 0.5;
  }
  animate({});
  return { group: g, animate, nozzles: [V(0, 0.02, 5.4)], tips: [V(-10, 0.3, -0.4), V(10, 0.3, -0.4)], parts: { surf, prop, ball } };
}

// ============================================================================================ SHAHED-style
export function buildShahedModel() {
  const g = new THREE.Group(); g.name = 'shahed';
  const drabM = M(0x8b8a7a), darkM = M(0x3a3b36), blackM = M(0x121212), cyanS = cyanM();
  mesh(slab([[0, -1.3, .1], [1.25, 1.05, .05], [1.25, 1.3, .045], [0.32, 1.2, .1], [-0.32, 1.2, .1], [-1.25, 1.3, .045], [-1.25, 1.05, .05]], (a, b, w) => [a, 0.02 + w, b]), drabM, g, 'delta');
  mesh(merge([cylZ(0.2, 0.17, 2.4, 8).translate(0, 0.08, -0.1), new THREE.SphereGeometry(0.2, 8, 6).scale(1, 1, 1.4).translate(0, 0.08, -1.3)]), drabM, g, 'body');
  for (const s of [-1, 1]) mesh(slab([[0.75, 0, .04], [1.3, 0, .03], [1.32, 0.42, .03], [1.0, 0.42, .03]], (z, v, w) => [s * 1.24 + w, v - 0.05, z]), darkM, g, 'tipFin');
  mesh(boxG(0.32, 0.26, 0.4, 0, 0.12, 1.0), darkM, g, 'engine');   // the piston engine at the back
  const prop = new THREE.Group(); prop.position.set(0, 0.12, 1.28); g.add(prop);
  for (let k = 0; k < 2; k++) { const b = mesh(boxG(0.07, 0.75, 0.02, 0, 0.36, 0), blackM, prop, 'blade'); b.rotation.z = k * Math.PI; }
  const discM = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }); mesh(new THREE.CircleGeometry(0.75, 14), discM, prop, 'propDisc');
  mesh(boxG(0.012, 0.25, 0.012, 0.12, 0.33, -0.2), blackM, g, 'antenna');
  for (const s of [-1, 1]) mesh(boxG(0.5, 0.012, 0.12, s * 0.75, 0.075, 0.75), cyanS, g, 'rwStrip');
  const st = decal(rwTex('RW-S'), 0.7, 0.18, g, 'stencil'); st.position.set(0, 0.29, 0.1); st.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  let spin = 0;
  function animate(D, dt = 0) {
    const n = Math.max(0, Math.min(1, D.ctl ? D.ctl.thr : 1));
    spin += dt * 140 * n; prop.rotation.z = spin;
    discM.opacity = 0.25 * n;
    for (const c of prop.children) if (c.name === 'blade') c.visible = n < 0.25;
  }
  return { group: g, animate, nozzles: [V(0, 0.12, 1.3)], parts: { prop } };
}
