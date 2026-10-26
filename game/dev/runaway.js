// RUNAWAY ground-forces sandbox: a 430 m island where STRIDER squads, an RW-7 hover tank and seized MBTs patrol,
// take cover and fight 1980 dummy targets that shoot back. Everything runs on the pure sandbox (sandbox.js); this page
// only renders it: terrain, units, tracers, blasts, a free camera, a debug overlay of the AI and the sound.
// Query: ?scenario=assault|combined|flank|outnumbered|defend|patrol|lineup  &seed=  &speed=  &paused  &overlay=0
//        &cam=x,y,z,yaw,pitch  &follow=<unit id>  &res=0.5  &debug (bridge: window.__RW)
//        &track uses the live game's full tracked MBT adapter instead of the lightweight preview drive.
import * as THREE from 'three';
import { createSandbox, setupScenario } from '../js/units/runaway/sandbox.js';
import { createTrackDrive } from '../js/units/groundwar/mbttrack.js';
import { buildStrider } from '../js/units/runaway/stridermodel.js';
import { buildHoverTank } from '../js/units/runaway/hovertankmodel.js';
import { buildMBT } from '../js/units/runaway/mbtmodel.js';
import { Kit, RW, rwMats } from '../js/units/runaway/rwkit.js';
import { RwAudio } from '../js/units/runaway/rwaudio.js';

const Q = new URLSearchParams(location.search);
const SCEN = ['assault', 'combined', 'flank', 'outnumbered', 'defend', 'patrol'];
const res = +(Q.get('res') || 1);
const renderer = new THREE.WebGLRenderer({ antialias: res >= 1 }); renderer.setPixelRatio(Math.min(2, devicePixelRatio) * Math.min(1, res)); document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); const SKY = 0x9fb8ca; scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 180, 700);
scene.add(new THREE.HemisphereLight(0xd6ebff, 0x56603e, 0.95));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.15); sun.position.set(0.45, 1, 0.25); scene.add(sun);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
const ov = document.getElementById('ov'), og = ov.getContext('2d'), panel = document.getElementById('panel');
function size() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); ov.width = w; ov.height = h; }
addEventListener('resize', size); size();

// ------------------------------------------------------------------------------------------------ world
let B = null, scenario = Q.get('scenario') || 'assault', seed = +(Q.get('seed') || 1980);
const worldGroup = new THREE.Group(); scene.add(worldGroup);
function buildWorld() {
  worldGroup.clear();
  const isl = B.isl, H = isl.height, N = 220, S = 520;
  const g = new THREE.PlaneGeometry(S, S, N, N).rotateX(-Math.PI / 2), p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = H(x, z); p.setY(i, y);
    const n = B.world.normal(x, z, 1.2), sl = Math.acos(n[1]) * 57.3, nz = Math.sin(x * 0.37 + z * 0.21) * 0.5 + Math.sin(x * 0.11 - z * 0.17) * 0.5;
    if (y < 0.6) c.setHex(0xb8a77f); else if (y < 1.6) c.setHex(0xa5a070).lerp(new THREE.Color(0x6f7a45), (y - 0.6));
    else c.setHex(0x637a3c).lerp(new THREE.Color(0x4f6234), 0.5 + 0.5 * nz).lerp(new THREE.Color(0x7a7a5e), Math.min(1, Math.max(0, (sl - 20) / 12)));
    if (y < -0.5) c.setHex(0x8d8466);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  worldGroup.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f6e86, transparent: true, opacity: 0.86 })); water.position.y = 0.05; worldGroup.add(water);
  // obstacles: dry-stone walls, roofless crofts, boulders
  const k = new Kit(), stone = [0x8d8b80, 0x7e7c72, 0x9a978a];
  let si = 0;
  for (const o of B.world.obstacles) {
    if (o.mat === 'rock') { k.add(new THREE.DodecahedronGeometry(o.r, 0).scale(1, o.h / o.r * 0.62, 1).rotateY(o.seed * 6), stone[si++ % 3], new THREE.Matrix4().makeTranslation(o.x, o.y + o.h * 0.35, o.z)); continue; }
    const m = new THREE.Matrix4().makeRotationY(o.yaw).setPosition(o.x, o.y, o.z);
    if (o.mat === 'wall') {
      const len = Math.max(o.hx, o.hz) * 2, along = o.hx > o.hz, n = Math.max(2, Math.round(len / 0.7));
      for (let i = 0; i < n; i++) { const u = -len / 2 + (i + 0.5) * len / n, hh = o.h * (0.85 + 0.25 * Math.sin(i * 2.7 + o.x)); const box = new THREE.BoxGeometry(along ? len / n * 1.05 : 0.6, hh, along ? 0.6 : len / n * 1.05).translate(along ? u : 0, hh / 2 - 0.15, along ? 0 : u); k.add(box, stone[(i + si) % 3], m); }
      si++;
    } else {   // croft: four stone walls with a door gap, gable stubs, no roof
      const t = 0.5, hx = o.hx, hz = o.hz, h = o.h;
      const wall = (w, d, x, z, hh = h) => k.add(new THREE.BoxGeometry(w, hh, d).translate(x, hh / 2 - 0.2, z), 0x8a877b, m);
      wall(hx * 2, t, 0, -hz + t / 2); wall(t, hz * 2, -hx + t / 2, 0); wall(t, hz * 2, hx - t / 2, 0);
      wall(hx * 0.7, t, -hx * 0.65, hz - t / 2); wall(hx * 0.7, t, hx * 0.65, hz - t / 2);
      wall(t, 1.2, -hx + t / 2, 0, h + 1.1); wall(t, 1.2, hx - t / 2, 0, h + 1.1);
      k.add(new THREE.BoxGeometry(hx * 2 - 1, 0.05, hz * 2 - 1).translate(0, 0.02, 0), 0x5b5446, m);
    }
  }
  const om = new THREE.Mesh(k.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })); worldGroup.add(om);
  // pine wood (instanced)
  const tg = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0), tm = new THREE.MeshLambertMaterial({ color: 0x2f4a2a, flatShading: true });
  const trees = new THREE.InstancedMesh(tg, tm, isl.trees.length), M4 = new THREE.Matrix4();
  isl.trees.forEach((t, i) => trees.setMatrixAt(i, M4.compose(new THREE.Vector3(t.x, H(t.x, t.z) + 1.2, t.z), new THREE.Quaternion(), new THREE.Vector3(t.r, t.h, t.r))));
  worldGroup.add(trees);
  // the pad (objective)
  const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8b8b84 }));
  const pp = isl.spawn.pad; pad.position.set(pp[0], H(pp[0], pp[1]) + 0.08, pp[1]); worldGroup.add(pad);
}

// ------------------------------------------------------------------------------------------------ 1980 dummies (dev stand-ins)
const DM = (() => {
  const mats = rwMats(), od = 0x4d5236, od2 = 0x3f4430, skin = 0xc19a7a, steel = 0x4a4f3a;
  const soldier = (kind) => {
    const k = new Kit();
    k.box(0.34, 0.5, 0.22, 0, 1.2, 0, od);                 // torso + ALICE webbing
    k.box(0.3, 0.22, 0.12, 0, 1.25, 0.16, od2);            // pack
    k.box(0.3, 0.12, 0.2, 0, 0.92, 0, od2);                // belt
    for (const s of [-1, 1]) { k.box(0.13, 0.86, 0.15, s * 0.09, 0.45, 0, od); k.box(0.1, 0.5, 0.1, s * 0.22, 1.18, -0.05, od, [0.5, 0, 0]); }
    k.box(0.18, 0.2, 0.2, 0, 1.55, 0, skin);
    k.sphere(0.15, 0, 1.66, 0, steel, 1, 0.6, 1.08, 8, 5);   // M1 helmet
    if (kind === 'mg') k.box(0.08, 0.1, 1.1, 0.12, 1.22, -0.45, 0x1f1f1f);
    else if (kind === 'at') k.cyl(0.04, 0.04, 0.8, 6, 0.12, 1.35, -0.2, 0x5a5f3c, [Math.PI / 2, 0, 0]);
    else k.box(0.05, 0.08, 0.95, 0.12, 1.2, -0.4, 0x1c1c1c);
    return k.build(mats.body, mats.glow, 'dummy' + kind);
  };
  const tank = () => {   // an M60A3-ish stand-in (the TANK agent builds the real one)
    const k = new Kit();
    k.box(3.6, 1.1, 6.9, 0, 1.0, 0, 0x55603f); k.box(3.2, 0.2, 2.0, 0, 1.2, -3.6, 0x4d5739, [-0.5, 0, 0]);
    k.prism([[-1.2, -1.6], [1.2, -1.6], [1.6, -0.2], [1.5, 1.6], [-1.5, 1.6], [-1.6, -0.2]], 1.55, 0.85, 0x5a6542, 0.85);
    k.cyl(0.12, 0.1, 4.6, 10, 0, 2.0, -3.7, 0x4d5739, [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { k.box(0.6, 0.85, 6.6, s * 1.55, 0.45, 0, 0x2b2c27); for (let i = 0; i < 6; i++) k.cyl(0.33, 0.33, 0.5, 10, s * 1.55, 0.36, -2.6 + i * 1.05, 0x3a3d33, [0, 0, Math.PI / 2]); }
    k.box(0.5, 0.5, 0.6, 0.6, 2.6, 0.2, 0x4d5739);
    return k.build(mats.body, mats.glow, 'dummyTank');
  };
  const P = { inf: soldier('inf'), mg: soldier('mg'), at: soldier('at'), vehicle: tank() };
  return kind => P[kind].clone();
})();

// ------------------------------------------------------------------------------------------------ FX
const FX = (() => {
  const g = new THREE.Group(); scene.add(g);
  // tracers: instanced stretched boxes along the projectiles' velocity
  const trGeo = new THREE.BoxGeometry(0.06, 0.06, 1).translate(0, 0, -0.5);
  const trMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = new THREE.InstancedMesh(trGeo, trMat, 600); tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3); tracers.frustumCulled = false; g.add(tracers);
  // particles (sparks, dust, smoke, flashes): one Points cloud, CPU-updated
  const NP = 4000, pos = new Float32Array(NP * 3), colA = new Float32Array(NP * 3), sizeA = new Float32Array(NP), alphaA = new Float32Array(NP), alpha0 = new Float32Array(NP), vel = new Float32Array(NP * 3), life = new Float32Array(NP), life0 = new Float32Array(NP), grow = new Float32Array(NP), drag = new Float32Array(NP), grav = new Float32Array(NP), size0 = new Float32Array(NP);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(colA, 3)); pg.setAttribute('size', new THREE.BufferAttribute(sizeA, 1)); pg.setAttribute('alpha', new THREE.BufferAttribute(alphaA, 1));
  const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { scale: { value: 600 } },
    vertexShader: 'attribute float size; attribute float alpha; varying vec3 vC; varying float vA; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * 300. / -mv.z; vA = size > 0. ? alpha : 0.; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float r = dot(d,d); if (r > .25 || vA < .01) discard; gl_FragColor = vec4(vC, vA * (1. - r * 4.)); }' });
  const pts = new THREE.Points(pg, pm); pts.frustumCulled = false; g.add(pts);
  let pi = 0;
  // (a: peak opacity - dust and smoke are thin, sparks are solid; everything fades out over its life)
  const spawn = (x, y, z, vx, vy, vz, s, l, r, gg, b, o = {}) => { const i = pi++ % NP; pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); colA.set([r, gg, b], i * 3); size0[i] = s; sizeA[i] = s; life[i] = life0[i] = l; grow[i] = o.grow ?? 0; drag[i] = o.drag ?? 1; grav[i] = o.grav ?? 0; alpha0[i] = o.a ?? (o.grow ? 0.45 : 1); alphaA[i] = alpha0[i]; };
  // beams (coilgun, PD): short-lived additive lines
  const beams = [];
  const beam = (a, b, color, w, t) => { const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, w, L).translate(0, 0, -L / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(a[0], a[1], a[2]); m.lookAt(a[0] - d.x, a[1] - d.y, a[2] - d.z); g.add(m); beams.push({ m, t, t0: t }); };
  const flashes = [];
  const flashMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const flash = (x, y, z, s, c, t = 0.06) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), flashMat(c)); m.position.set(x, y, z); m.scale.setScalar(s); g.add(m); flashes.push({ m, t, t0: t, s }); };
  const R = Math.random;
  return {
    tracers,
    projectiles(proj) {
      const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, -1), v = new THREE.Vector3(), c = new THREE.Color();
      let n = 0;
      for (const p of proj) {
        if (n >= 600) break;
        const sp = Math.hypot(p.vx, p.vy, p.vz); v.set(p.vx / sp, p.vy / sp, p.vz / sp); q.setFromUnitVectors(Z, v);
        const len = p.ammo === 'coil120' ? 30 : p.heat ? 1.2 : p.ammo === 'needle' ? 9 : 6, w = p.ammo === 'coil120' ? 4 : p.heat ? 3 : 1;
        M4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(w, w, len)); tracers.setMatrixAt(n, M4);
        c.setHex(p.side === 2 ? (p.ammo === 'xm7' ? 0xfff1b0 : 0xb8f6ff) : p.heat ? 0xffb050 : 0xff9a50); tracers.setColorAt(n, c);
        if (p.heat) spawn(p.x, p.y, p.z, R() - 0.5, R() * 0.5, R() - 0.5, 0.5, 0.8, 0.7, 0.7, 0.68, { grow: 1.2, drag: 0.9 });
        n++;
      }
      tracers.count = n; tracers.instanceMatrix.needsUpdate = true; if (tracers.instanceColor) tracers.instanceColor.needsUpdate = true;
    },
    event(e) {
      switch (e.e) {
        case 'shot': {
          const big = e.ammo === 'coil120' || e.ammo === 'mbt120' || e.ammo === 'tankgun';
          flash(e.x + e.dx * 0.4, e.y + e.dy * 0.4, e.z + e.dz * 0.4, big ? 1.4 : 0.22, e.side === 2 && e.ammo !== 'xm7' && e.ammo !== 'mbt120' ? 0x9ff0ff : 0xffd080);
          if (e.ammo === 'coil120') { beam([e.x, e.y, e.z], [e.x + e.dx * 140, e.y + e.dy * 140, e.z + e.dz * 140], 0xc8f8ff, 0.25, 0.18); for (let i = 0; i < 30; i++) spawn(e.x + e.dx * i * 0.6, e.y + e.dy * i * 0.6, e.z + e.dz * i * 0.6, (R() - .5) * 2, R() * 1.5, (R() - .5) * 2, 0.9, 1.6, 0.75, 0.82, 0.86, { grow: 1.5, drag: 0.95 }); }
          if (big || e.ammo === 'law') for (let i = 0; i < 18; i++) spawn(e.x, e.y, e.z, (R() - .5) * 5 + e.dx * 6, R() * 2, (R() - .5) * 5 + e.dz * 6, 1.4, 1.4, 0.72, 0.7, 0.62, { grow: 2.5, drag: 0.92 });
          break;
        }
        case 'impact': {
          const n = e.unit ? 5 : 7;
          for (let i = 0; i < n; i++) spawn(e.x, e.y, e.z, (R() - .5) * 3, R() * 3, (R() - .5) * 3, e.unit ? 0.12 : 0.35, e.unit ? 0.25 : 0.9, e.unit ? 1 : 0.6, e.unit ? 0.9 : 0.55, e.unit ? 0.6 : 0.42, { grav: e.unit ? 9 : 2, grow: e.unit ? 0 : 0.6, drag: 0.9 });
          break;
        }
        case 'hit': for (let i = 0; i < 6; i++) spawn(e.x, e.y, e.z, (R() - .5) * 6, R() * 4, (R() - .5) * 6, 0.1, 0.3, e.pen === false ? 1 : 0.6, e.pen === false ? 0.95 : 0.9, e.pen === false ? 0.7 : 1, { grav: 9 }); break;
        case 'blast': {
          flash(e.x, e.y + 0.5, e.z, 2.5 * (e.big || 1), 0xffc070, 0.14);
          for (let i = 0; i < 40; i++) spawn(e.x, e.y + 0.3, e.z, (R() - .5) * 9, R() * 7, (R() - .5) * 9, 1.0 + R(), 2.2 + R() * 2, 0.34, 0.32, 0.29, { grow: 1.6, drag: 0.9, grav: -0.4 });
          for (let i = 0; i < 25; i++) spawn(e.x, e.y + 0.3, e.z, (R() - .5) * 16, R() * 14, (R() - .5) * 16, 0.18, 0.9, 1, 0.7, 0.3, { grav: 9 });
          break;
        }
        case 'destroyed': {
          flash(e.x, e.y, e.z, e.kind === 'strider' ? 1.2 : 3, 0xffd090, 0.2);
          for (let i = 0; i < (e.kind === 'strider' ? 30 : 70); i++) spawn(e.x, e.y, e.z, (R() - .5) * 8, R() * 8, (R() - .5) * 8, 0.8 + R() * 1.5, 3 + R() * 3, 0.2, 0.2, 0.2, { grow: 1.2, drag: 0.93, grav: -0.6 });
          break;
        }
        case 'pd': beam(e.from, [e.x, e.y, e.z], 0xd8fbff, 0.08, 0.08); if (e.ok) flash(e.x, e.y, e.z, 1.2, 0xffffff, 0.1); break;
        case 'step': if ((e.v || 0) > 1.4 || e.stumble > 0.4) for (let i = 0; i < 2; i++) spawn(e.x, e.y + 0.05, e.z, (R() - .5) * 1.2, R() * 0.5, (R() - .5) * 1.2, 0.22, 0.7, 0.62, 0.58, 0.47, { grow: 0.7, drag: 0.9, a: 0.3 }); break;
        case 'thud': for (let i = 0; i < 14; i++) spawn(e.x, e.y - 0.8, e.z, (R() - .5) * 3, R() * 1.2, (R() - .5) * 3, 0.6, 1.5, 0.6, 0.57, 0.46, { grow: 1, drag: 0.9 }); break;
      }
    },
    dust(x, y, z, k) { if (R() < k) spawn(x + (R() - .5) * 4, y + 0.1, z + (R() - .5) * 7, (R() - .5) * 6, R() * 1.0, (R() - .5) * 6, 0.7, 1.2, 0.66, 0.62, 0.52, { grow: 1.2, drag: 0.93, a: 0.22 }); },
    update(dt) {
      for (let i = 0; i < NP; i++) {
        if (life[i] <= 0) { if (sizeA[i]) sizeA[i] = 0; continue; }
        life[i] -= dt; const f = Math.pow(drag[i], dt * 60);
        vel[i * 3] *= f; vel[i * 3 + 1] = vel[i * 3 + 1] * f - grav[i] * dt; vel[i * 3 + 2] *= f;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const lf = life[i] / life0[i]; sizeA[i] = life[i] > 0 ? size0[i] * (1 + grow[i] * (1 - lf) * 3) : 0; alphaA[i] = alpha0[i] * Math.min(1, lf * 2.5) * Math.min(1, (1 - lf) * 12 + 0.2);
      }
      pg.attributes.position.needsUpdate = true; pg.attributes.size.needsUpdate = true; pg.attributes.color.needsUpdate = true; pg.attributes.alpha.needsUpdate = true;
      for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t -= dt; b.m.material.opacity = Math.max(0, b.t / b.t0); if (b.t <= 0) { g.remove(b.m); b.m.geometry.dispose(); beams.splice(i, 1); } }
      for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.t -= dt; f.m.material.opacity = Math.max(0, f.t / f.t0); f.m.scale.setScalar(f.s * (1.4 - 0.4 * f.t / f.t0)); if (f.t <= 0) { g.remove(f.m); flashes.splice(i, 1); } }
    },
    clear() { life.fill(0); for (const b of beams) g.remove(b.m); beams.length = 0; for (const f of flashes) g.remove(f.m); flashes.length = 0; },
  };
})();

// ------------------------------------------------------------------------------------------------ units <-> models
const unitGroup = new THREE.Group(); scene.add(unitGroup);
let views = new Map();
function start(name, sd = seed) {
  scenario = name; seed = sd;
  B = setupScenario(createSandbox({ seed, mbtDrive: Q.has('track') ? createTrackDrive : undefined }), name);
  buildWorld(); unitGroup.clear(); views = new Map(); FX.clear();
  for (const m of B.units) {
    let V;
    if (m.kind === 'strider') { V = buildStrider({ weapon: m.weaponName, tag: m.tag }); unitGroup.add(V.group); }
    else if (m.kind === 'hovertank') { V = buildHoverTank({ tag: 'RW7-' + m.id }); unitGroup.add(V.group, V.shadow); }
    else { V = buildMBT(m.mbtType, { tag: m.mbtType === 'm1a2' ? 'RW-A1 ' + m.id : 'RW-T9 ' + m.id }); unitGroup.add(V.group); }
    views.set(m, V);
  }
  for (const d of B.dummies) { const V = DM(d.kind); unitGroup.add(V); views.set(d, V); }
  lastLog = 0; follow = null;
  if (!camSet) { const c = B.isl.spawn.pad; cam.p.set(c[0] + 60, 70, c[1] + 150); cam.yaw = 0.35; cam.pitch = -0.35; }
}
function syncViews(dt) {
  for (const m of B.units) {
    const V = views.get(m), s = m.sim;
    if (m.kind === 'strider') V.update(s, dt, B.time);
    else if (m.kind === 'hovertank') { V.update(s, dt, B.time, B.isl.height(s.p[0], s.p[2])); if (s.alive) FX.dust(s.p[0], B.isl.height(s.p[0], s.p[2]), s.p[2], 0.35 + s.speed * 0.05); }
    else V.update(s, dt, B.time);
  }
  for (const d of B.dummies) {
    const V = views.get(d); V.position.set(d.x, d.y, d.z); V.rotation.set(d.alive ? 0 : -Math.PI / 2 * 0.98, d.yaw, 0, 'YXZ');
    if (d.kind !== 'vehicle') V.scale.y = d.alive && d.crouch ? 0.62 : 1;
    if (!d.alive && d.kind === 'vehicle') { V.rotation.set(0, d.yaw, 0.05); V.position.y = d.y - 0.3; }
  }
}

// ------------------------------------------------------------------------------------------------ camera
const cam = { p: new THREE.Vector3(60, 70, 180), yaw: 0.3, pitch: -0.35, speed: 25 };
let camSet = false, follow = null;
if (Q.get('cam')) { const [x, y, z, yw, pt] = Q.get('cam').split(',').map(Number); cam.p.set(x, y, z); cam.yaw = yw || 0; cam.pitch = pt || 0; camSet = true; }
const keys = new Set();
addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'KeyF') { const alive = B.units.filter(m => m.alive); const i = alive.indexOf(follow); follow = alive[(i + 1) % alive.length] || null; }
  if (e.code === 'KeyG') follow = null;
  if (e.code === 'KeyO') overlay = !overlay;
  if (e.code === 'KeyP' || e.code === 'Space') paused = !paused;
  if (e.code === 'BracketLeft') tscale = Math.max(0.125, tscale / 2);
  if (e.code === 'BracketRight') tscale = Math.min(8, tscale * 2);
  if (e.code === 'KeyR') start(scenario, seed);
  const n = '123456'.indexOf(e.key); if (n >= 0) start(SCEN[n], seed);
});
addEventListener('keyup', e => keys.delete(e.code));
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; initAudio(); });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag) return; cam.yaw -= (e.clientX - drag.x) * 0.004; cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; });
addEventListener('wheel', e => { cam.speed = Math.max(3, Math.min(200, cam.speed * Math.exp(-e.deltaY * 0.001))); });
function updateCamera(dt) {
  const f = new THREE.Vector3(-Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch)), r = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const sp = cam.speed * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1) * dt;
  if (keys.has('KeyW')) cam.p.addScaledVector(f, sp); if (keys.has('KeyS')) cam.p.addScaledVector(f, -sp);
  if (keys.has('KeyD')) cam.p.addScaledVector(r, sp); if (keys.has('KeyA')) cam.p.addScaledVector(r, -sp);
  if (keys.has('KeyE')) cam.p.y += sp; if (keys.has('KeyQ')) cam.p.y -= sp;
  if (follow) {
    if (!follow.alive && follow.kind !== 'strider') follow = null;
    else { const d = follow.vehicle ? 22 : 7, h = follow.vehicle ? 7 : 2.6, t = new THREE.Vector3(follow.x, follow.y + (follow.vehicle ? 2 : 1.5), follow.z); const want = t.clone().addScaledVector(f, -d); want.y = Math.max(want.y, t.y + h * 0.3); cam.p.lerp(want, Math.min(1, dt * 4)); }
  }
  const gy = B.isl.height(cam.p.x, cam.p.z) + 1.2; if (cam.p.y < gy) cam.p.y = gy;
  camera.position.copy(cam.p); camera.lookAt(cam.p.clone().add(f));
}

// ------------------------------------------------------------------------------------------------ debug overlay
let overlay = Q.get('overlay') !== '0';
const dbgLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: false })); dbgLines.renderOrder = 10; scene.add(dbgLines);
const proj = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return v.z > 1 ? null : [(v.x + 1) / 2 * ov.width, (1 - v.y) / 2 * ov.height]; };
const STATE_COL = { advance: '#9fe8ff', contact: '#ffd060', flank: '#ff9a40', assault: '#ff5a40', retreat: '#c080ff', regroup: '#80ffa0', defend: '#80c0ff', hold: '#cccccc', dead: '#666' };
function drawOverlay() {
  og.clearRect(0, 0, ov.width, ov.height);
  const L = [], C = [], add = (a, b, c) => { L.push(...a, ...b); const col = new THREE.Color(c); C.push(col.r, col.g, col.b, col.r, col.g, col.b); };
  if (overlay) {
    og.font = '11px Consolas, monospace'; og.textAlign = 'center';
    for (const S of B.ai.squads) {
      const col = STATE_COL[S.state] || '#fff';
      for (const m of S.members) {
        const a = m.ai; if (!a) continue;
        const top = m.y + (m.vehicle ? 4 : 2.5), p = proj(m.x, top, m.z); if (!p) continue;
        if (Math.hypot(m.x - cam.p.x, m.z - cam.p.z) > 420) continue;
        og.fillStyle = m.alive ? col : '#777';
        const lead = m.id === S.leaderNow ? ' [LINK]' : '';
        og.fillText(`${S.id}·${m.id} ${m.alive ? a.state : 'destroyed'}${lead}`, p[0], p[1] - 12);
        if (m.alive) { og.fillStyle = '#dfe'; og.fillText(`${m.kind === 'strider' ? m.sim.mode : m.kind} hp${(m.hp * 100).toFixed(0)} sup${(a.supp * 100).toFixed(0)}${a.fire ? ' FIRE' : ''}`, p[0], p[1]); }
        if (!m.alive) continue;
        if (a.move) add([m.x, m.y + 0.3, m.z], [a.move[0], B.isl.height(a.move[0], a.move[1]) + 0.3, a.move[1]], 0x60ff90);
        if (a.aim) add([m.x, m.y + m.eye, m.z], a.aim, a.fire ? 0xff5040 : 0xffd060);
        if (a.cover) add([a.cover.x, a.cover.y, a.cover.z], [a.cover.x + a.cover.nx * 1.2, a.cover.y + a.cover.h, a.cover.z + a.cover.nz * 1.2], 0x40a0ff);
      }
      if (S.threat) { const ty = B.isl.height(S.threat[0], S.threat[1]); add([S.threat[0], ty, S.threat[1]], [S.threat[0], ty + 12, S.threat[1]], 0xff4040); }
      if (S.state === 'flank' && S.flank) { const fy = B.isl.height(S.flank.x, S.flank.z); add([S.flank.x - 3, fy + 0.5, S.flank.z], [S.flank.x + 3, fy + 0.5, S.flank.z], 0xff9a40); add([S.flank.x, fy + 0.5, S.flank.z - 3], [S.flank.x, fy + 0.5, S.flank.z + 3], 0xff9a40); add([S.cx, B.isl.height(S.cx, S.cz) + 1, S.cz], [S.flank.x, fy + 1, S.flank.z], 0xff9a40); }
      for (const k of S.know.values()) { const ky = B.isl.height(k.px ?? k.x, k.pz ?? k.z); add([k.px - 1, ky + 0.2, k.pz - 1], [k.px + 1, ky + 0.2, k.pz + 1], k.seen ? 0xff2020 : 0xff9090); add([k.px + 1, ky + 0.2, k.pz - 1], [k.px - 1, ky + 0.2, k.pz + 1], k.seen ? 0xff2020 : 0xff9090); }
    }
    for (const d of B.dummies) { if (!d.alive) continue; const p = proj(d.x, d.y + 2.3, d.z); if (!p || Math.hypot(d.x - cam.p.x, d.z - cam.p.z) > 300) continue; og.fillStyle = '#ffcf9a'; og.fillText(`1980 ${d.kind} ${d.hp.toFixed(0)}${d.target ? ' >' + d.target.id : ''}${d.supp > 0.6 ? ' SUPP' : ''}`, p[0], p[1]); }
  }
  dbgLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(L, 3)); dbgLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  // panel
  const st = B.stats, lines = [`RUNAWAY GROUND SANDBOX - ${scenario.toUpperCase()}  seed ${seed}  t ${B.time.toFixed(1)} s  x${tscale}${paused ? '  PAUSED' : ''}`];
  for (const S of B.ai.squads) lines.push(`${S.id} ${S.state.toUpperCase().padEnd(8)} ${S.note.padEnd(26)} ratio ${S.ratio > 50 ? '-' : S.ratio.toFixed(2)}  known ${S.know.size}  up ${S.members.filter(m => m.alive && m.up).length}/${S.members.length}${S.linkDown > 0 ? '  LINK DOWN ' + S.linkDown.toFixed(1) : ''}${S.freeze > 0 ? '  FREEZE' : ''}`);
  lines.push(`1980: ${B.dummies.filter(d => d.alive).length}/${B.dummies.length} up   shots RW ${st.shots[2]} / 1980 ${st.shots[1]}   hits ${st.hits[2]} / ${st.hits[1]}   kills ${st.kills[2]} / ${st.kills[1]}   falls ${st.falls}  stumbles ${st.stumbles}  PD ${st.pd}`);
  if (overlay) for (const l of B.ai.log.slice(-6)) lines.push(`  ${l.t.toFixed(1)} ${l.sq} ${l.st} ${l.note || ''}`);
  if (follow) lines.push(`following ${follow.kind} ${follow.id}`);
  panel.textContent = lines.join('\n');
}

// ------------------------------------------------------------------------------------------------ audio
let audio = null;
function initAudio() {
  if (audio) return; try { const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(); audio = new RwAudio(ctx, ctx.destination); document.getElementById('audio').classList.add('hide'); } catch (e) { audio = null; }
}
document.getElementById('audio').onclick = initAudio;

// ------------------------------------------------------------------------------------------------ loop
let paused = Q.has('paused'), tscale = +(Q.get('speed') || 1), acc = 0, last = performance.now(), lastLog = 0;
const STEP = 1 / 30;
function tick(dtReal) {
  const evs = [];
  if (!paused) {
    acc += Math.min(0.25, dtReal) * tscale;
    while (acc >= STEP) { acc -= STEP; for (const e of B.step(STEP)) evs.push(e); }
    // data-link chatter: squad decisions become machine chirps at the squad centroid
    for (; lastLog < B.ai.log.length; lastLog++) { const l = B.ai.log[lastLog], S = B.ai.squads.find(s => s.id === l.sq); if (S && S.cx !== undefined) evs.push({ e: 'chirp', kind: l.st === 'LINK LOST' ? 'lost' : l.st === 'contact' || l.st === 'flank' ? 'contact' : 'ack', x: S.cx, y: B.isl.height(S.cx, S.cz) + 2, z: S.cz }); }
  }
  for (const e of evs) { FX.event(e); if (audio) audio.event(e); }
  FX.projectiles(B.proj); FX.update(paused ? 0 : Math.min(0.05, dtReal) * tscale);
  syncViews(paused ? 0 : dtReal * tscale);
  updateCamera(Math.min(0.05, dtReal));
  if (audio) { audio.listener(cam.p.x, cam.p.y, cam.p.z); audio.loops(B.units.filter(m => m.alive).map(m => ({ kind: m.kind, x: m.x, y: m.y, z: m.z, servo: m.sim.servo || 0, fan: m.sim.fan ? (m.sim.fan[0] + m.sim.fan[1] + m.sim.fan[2] + m.sim.fan[3]) / 4 : 0, speed: m.sim.speed || 0, engine: m.sim.drive?.engine || 0, type: m.mbtType, charge: m.sim.charge ?? 1 }))); }
  drawOverlay();
  renderer.render(scene, camera);
}
let frames = 0;
function frame(now) { const dt = (now - last) / 1000; last = now; tick(dt); frames++; requestAnimationFrame(frame); }
start(scenario, seed);
if (Q.get('follow')) follow = B.units.find(m => m.id === +Q.get('follow')) || null;
requestAnimationFrame(frame);
// ?debug bridge for headless scenes (tools/scenes/runaway*.mjs)
window.__RW = {
  get B() { return B; }, get audio() { return audio; }, get frames() { return frames; }, THREE, scene, camera, cam, views, FX,
  start, step(n = 1) { for (let i = 0; i < n; i++) for (const e of B.step(STEP)) { FX.event(e); } syncViews(STEP * n); },
  // advance the sim by `secs` without rendering every step (fast-forward), then render once
  run(secs) { const n = Math.round(secs / STEP); for (let i = 0; i < n; i++) { const evs = B.step(STEP); if (i > n - 90) { for (const e of evs) FX.event(e); FX.update(STEP); } } syncViews(STEP); FX.projectiles(B.proj); drawOverlay(); renderer.render(scene, camera); return { t: B.time, stats: B.stats }; },
  look(x, y, z, yaw, pitch) { cam.p.set(x, y, z); cam.yaw = yaw; cam.pitch = pitch; follow = null; updateCamera(0); drawOverlay(); renderer.render(scene, camera); },
  lookAt(tx, ty, tz, dist, yaw, pitch) { const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]; cam.p.set(tx - f[0] * dist, ty - f[1] * dist, tz - f[2] * dist); cam.yaw = yaw; cam.pitch = pitch; follow = null; updateCamera(0); drawOverlay(); renderer.render(scene, camera); },
  follow(id) { follow = B.units.find(m => m.id === id) || null; },
  set paused(v) { paused = v; }, get paused() { return paused; }, set overlay(v) { overlay = v; }, set tscale(v) { tscale = v; },
  render() { drawOverlay(); renderer.render(scene, camera); },
};

// Rendered-frame benchmark bridge: this fixture shares production unit code.
if (Q.has('debug')) window.__BENCH = { renderer, host: 'dev-runaway', mode: 'preview', get state() { return paused ? 'paused' : 'live'; } };
