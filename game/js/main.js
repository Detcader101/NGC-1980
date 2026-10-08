import * as THREE from 'three';
import { buildLevel } from './level.js';
import { buildCaveMesh, makeTurret, makeTank, makePod, makeRope } from './cave3d.js';
import { Sfx } from './audio.js';
import { HELI, EYE, buildHeliMesh, buildCockpit, createHeliSim, createHeliInput } from './heli.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const params = new URLSearchParams(location.search);
const sfx = new Sfx();

// ---------------------------------------------------------------- input
const keys = new Set();
let chaseCam = params.has('chase'), cockpitCam = params.has('cockpit'), bigMap = false;
const _cf = { x: 0, z: -1 };
let keyboardOnly = params.has('kb');
const FIRE_KEYS = ['KeyF', 'KeyX'];
addEventListener('keydown', e => {
  if ((e.ctrlKey && !e.code.startsWith('Control')) || e.altKey || e.metaKey) return;   // Ctrl alone is collective-down
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  sfx.init();
  if (e.repeat) return;
  if (e.code === 'KeyH') HI.toggleSas();
  if (e.code === 'KeyJ') HI.startCalibration();
  if (e.code === 'KeyM') { bigMap = !bigMap; setMapSize(); }
  if (e.code === 'KeyV') { cockpitCam = !cockpitCam; if (!cockpitCam && document.pointerLockElement) document.exitPointerLock(); say(cockpitCam ? 'COCKPIT VIEW' : (chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA'), 1.2); }
  if (e.code === 'KeyC') { cockpitCam = false;  chaseCam = !chaseCam; Z.hd = Math.atan2(Z.facing.x, -Z.facing.y); say(chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA', 1.2); }
  if (e.code === 'KeyK') { keyboardOnly = !keyboardOnly; say(keyboardOnly ? 'KEYBOARD ONLY' : 'CONTROLLER ENABLED', 1.5); }
  if (e.code === 'KeyP' && (G.state === 'play' || G.state === 'paused')) { G.state = G.state === 'paused' ? 'play' : 'paused'; say(G.state === 'paused' ? 'PAUSED' : '', G.state === 'paused' ? 999 : 0); }
  if (['Enter', 'Space'].includes(e.code)) pressStart();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let mouseFire = false;
addEventListener('mousedown', e => { if (e.button === 0) { mouseFire = true; sfx.init(); } });
addEventListener('mouseup', () => mouseFire = false);
const kd = (...c) => c.some(k => keys.has(k));
const THR_AXIS = params.has('throttle') ? +params.get('throttle') : -1;
const dz = v => Math.abs(v) < 0.12 ? 0 : Math.sign(v) * (Math.abs(v) - 0.12) / 0.88;
let padWasStart = false;

function readPad() {
  if (keyboardOnly) return null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let best = null;
  for (const p of pads) if (p && p.connected) { best = p; if (p.axes.length >= 2) break; }
  return best;
}
function readInput() {
  const kx = (kd('ArrowRight', 'KeyD') ? 1 : 0) - (kd('ArrowLeft', 'KeyA') ? 1 : 0);
  const ky = (kd('ArrowDown', 'KeyS') ? 1 : 0) - (kd('ArrowUp', 'KeyW') ? 1 : 0);
  const inp = {
    x: kx, y: ky,
    thrK: kd('Space', 'ShiftLeft', 'ShiftRight') ? 1 : 0,
    thrUp: kd('ArrowUp', 'KeyW') ? 1 : 0,       // extra thrust keys in Thrust mode
    beam: kd('ArrowDown', 'KeyS') ? 1 : 0,
    fire: kd(...FIRE_KEYS) || mouseFire,
    start: false,
  };
  const p = readPad();
  if (p) {
    const gx = dz(p.axes[0] || 0), gy = dz(p.axes[1] || 0);
    if (gx !== 0) inp.x = gx;
    if (gy !== 0) inp.y = gy;
    const b = i => p.buttons[i] && p.buttons[i].pressed;
    if (b(0) || b(5)) inp.fire = true;
    if (b(1) || b(2) || b(7)) inp.thrK = 1;
    if (b(3) || b(4) || b(6)) inp.beam = 1;
    if (THR_AXIS >= 0 && p.axes[THR_AXIS] !== undefined) inp.thrK = Math.max(inp.thrK, clamp((1 - p.axes[THR_AXIS]) / 2, 0, 1));
    inp.start = p.buttons.some(x => x && x.pressed);
  }
  return inp;
}

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
// cockpit free look: click the view to capture the mouse (Esc releases it and the head re-centres; middle click centres)
const head = { yaw: 0, pitch: 0 };
canvas.addEventListener('click', () => { if (cockpitCam && G.state === 'play' && !document.pointerLockElement) canvas.requestPointerLock?.(); });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  head.yaw = clamp(head.yaw - e.movementX * 0.0025, -2.5, 2.5); head.pitch = clamp(head.pitch - e.movementY * 0.0025, -1.1, 0.8);
});
addEventListener('mousedown', e => { if (e.button === 1 && document.pointerLockElement === canvas) { head.yaw = head.pitch = 0; e.preventDefault(); } });
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const PR_MAX = params.has('res') ? +params.get('res') : Math.min(devicePixelRatio, 1.5);
let pixRatio = PR_MAX; renderer.setPixelRatio(pixRatio);
{
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  $('gpuinfo').textContent = 'GPU: ' + (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown');
}
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

class Cloud {
  constructor(scene, max, size, atten) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.obj = new THREE.Points(g, new THREE.PointsMaterial({
      size, sizeAttenuation: atten, map: dotTex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.obj.frustumCulled = false; scene.add(this.obj);
  }
  begin() { this.n = 0; }
  add(x, y, z, r, g, b) {
    if (this.n >= this.max) return; const i = this.n++ * 3;
    this.pos[i] = x; this.pos[i + 1] = y; this.pos[i + 2] = z; this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = b;
  }
  end() { this.geo.setDrawRange(0, this.n); this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; }
}
function emit(arr, x, y, z, vx, vy, vz, life, r, g, b, grav = 0) {
  const p = { x, y, z, vx, vy, vz, life, max: life, r, g, b, grav };
  if (arr.length >= 1500) arr[(Math.random() * arr.length) | 0] = p; else arr.push(p);
}
function stepParts(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i]; p.life -= dt;
    if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
    p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
}
function drawParts(arr, cloud) {
  for (const p of arr) { const f = p.life / p.max; cloud.add(p.x, p.y, p.z, p.r * f, p.g * f, p.b * f); }
}
function explode(arr, x, y, z, n, sp, is2d) {
  for (let i = 0; i < n; i++) {
    const a = rnd(Math.PI * 2), e = is2d ? 0 : rnd(-1, 1), s = rnd(0.2, 1) * sp;
    const c = Math.cos(a), sn = Math.sin(a), h = Math.sqrt(1 - e * e);
    const hot = Math.random();
    emit(arr, x, y, z, c * h * s, is2d ? sn * s : e * s, is2d ? 0 : sn * h * s, rnd(0.5, 1.4), 1, 0.4 + hot * 0.6, hot * 0.4, is2d ? 3 : 9);
  }
}

// ---------------------------------------------------------------- game state
const G = { res: 150, cargo: 0, state: 'title', mode: 'zarch', score: 0, hi: 0, lives: 3, fuel: 100, visit: 0, tr: null, msgT: 0, over: false };
try { G.hi = +(localStorage.getItem('tz_hi') || 0); } catch (e) {}
function addScore(n) { G.score += n; if (G.score > G.hi) { G.hi = G.score; try { localStorage.setItem('tz_hi', G.hi); } catch (e) {} } }
function say(t, secs = 2) { const m = $('msg'); m.textContent = t; m.style.opacity = t ? 1 : 0; G.msgT = secs; }

// ================================================================ ZARCH
const PAD_H = 6, BASE_R = 18, GRAV = 9.0, THRUST = 21, MAXLEAN = 0.8, BOUND = 360;
const rawH = (x, z) => 14 * Math.sin(x * .035 + 1.3) * Math.cos(z * .04) + 9 * Math.sin(x * .09 + z * .07) + 5 * Math.sin(z * .13 - x * .05) + 2.5 * Math.sin(x * .31) * Math.sin(z * .27) + 8;
// Every base is a pad on the surface with a shaft down into its own Thrust cave, which lives underground in the plane
// z = base.z under the pad. CS = world units per cave cell. Home is friendly (reservoir + intake pad); the four enemy
// bases sit in the N/E/S/W sectors with turrets, fuel tanks to loot and a pod to steal.
const CS = 1.6, CAVE_SINK = 0.15, CAVE_OX = 32.5, CAVE_DEPTH = 6, HOLE_R = 9, STRIP_X = 76, STRIP_Z = 9;
// the home refuel pad sits beside the shaft on solid ground (no hole), clear of the cave strip
const PAD = { x: 0, z: 30, r: 8.5 };
const BASES = [{ kind: 'home', name: 'HOME BASE', x: 0, z: 0, h: PAD_H }];
for (const [x, z, n] of [[0, -240, 'NORTH'], [240, 0, 'EAST'], [0, 240, 'SOUTH'], [-240, 0, 'WEST']])
  BASES.push({ kind: 'enemy', name: n + ' BASE', x, z, h: clamp(Math.round(rawH(x, z)), 4, 16) });
const stripW = (x, z, b) => smooth(0, 14, Math.hypot(Math.max(Math.abs(x - b.x) - STRIP_X, 0), Math.max(Math.abs(z - b.z) - STRIP_Z, 0)));
const terrainH = (x, z) => {
  let h = rawH(x, z);
  for (const b of BASES) h = lerp(b.h, h, smooth(BASE_R, 60, Math.hypot(x - b.x, z - b.z)));   // flat apron round the shaft
  h = lerp(PAD_H, h, smooth(12, 34, Math.hypot(x - PAD.x, z - PAD.z)));                        // flat home refuel pad
  for (const b of BASES) h = lerp(Math.max(h, b.h), h, stripW(x, z, b));                      // ground over the cave
  return h;
};
const holeOf = (x, z) => BASES.find(b => Math.hypot(x - b.x, z - b.z) < HOLE_R);
const inHole = (x, z) => !!holeOf(x, z);
const groundY = (x, z) => inHole(x, z) ? -1e4 : Math.max(terrainH(x, z), 0);
const baseUniform = BASES.map(b => new THREE.Vector4(b.x, b.z, b.h, b.kind === 'enemy' ? 1 : 0));

const zScene = new THREE.Scene();
const HORIZON = new THREE.Color(0xbfd9f2);
// One draw distance for everything (the retro look and the fps lever): terrain grid, fog, far clip and sky dome all
// end together, so nothing - trees, enemies, beacons - hangs in the sky past the edge of the ground.
const DRAW = 250;
zScene.fog = new THREE.Fog(HORIZON, DRAW * 0.5, DRAW);
const zCam = new THREE.PerspectiveCamera(62, 1, 0.5, DRAW + 15);
zScene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9));
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); zScene.add(sun);

const sky = new THREE.Mesh(new THREE.SphereGeometry(DRAW * 0.97, 24, 12), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main(){vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec3 vP; void main(){float h=normalize(vP).y; vec3 hz=vec3(.75,.85,.95), zn=vec3(.22,.42,.85); gl_FragColor=vec4(mix(hz,zn,smoothstep(0.,.55,h)),1.);}',
}));
sky.renderOrder = -10; zScene.add(sky);

const TG = 2.5, TN = Math.ceil(DRAW * 2.1 / TG);
const terrainGeo = new THREE.PlaneGeometry(TG * TN, TG * TN, TN, TN); terrainGeo.rotateX(-Math.PI / 2);
const terrain = new THREE.Mesh(terrainGeo, new THREE.ShaderMaterial({
  uniforms: { uFog: { value: HORIZON }, uSun: { value: new THREE.Vector3(.5, 1, .3) }, uBases: { value: baseUniform } },
  vertexShader: `
    varying vec3 vW; varying float vRaw; uniform vec4 uBases[${BASES.length}];
    float rawH(vec2 p){return 14.*sin(p.x*.035+1.3)*cos(p.y*.04)+9.*sin(p.x*.09+p.y*.07)+5.*sin(p.y*.13-p.x*.05)+2.5*sin(p.x*.31)*sin(p.y*.27)+8.;}
    void main(){
      vec4 w=modelMatrix*vec4(position,1.);
      float h=rawH(w.xz);
      for(int i=0;i<${BASES.length};i++){ vec4 b=uBases[i]; h=mix(b.z,h,smoothstep(${BASE_R.toFixed(1)},60.,length(w.xz-b.xy))); }
      h=mix(${PAD_H.toFixed(1)},h,smoothstep(12.,34.,length(w.xz-vec2(${PAD.x.toFixed(1)},${PAD.z.toFixed(1)}))));
      for(int i=0;i<${BASES.length};i++){ vec4 b=uBases[i]; vec2 sd=max(abs(w.xz-b.xy)-vec2(${STRIP_X.toFixed(1)},${STRIP_Z.toFixed(1)}),0.); h=mix(max(h,b.z),h,smoothstep(0.,14.,length(sd))); }
      vRaw=h; w.y=max(h,0.); vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w;
    }`,
  fragmentShader: `
    varying vec3 vW; varying float vRaw; uniform vec3 uFog; uniform vec3 uSun; uniform vec4 uBases[${BASES.length}];
    void main(){
      for(int i=0;i<${BASES.length};i++){ if(length(vW.xz-uBases[i].xy)<${HOLE_R.toFixed(1)}) discard; }
      vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
      float l=max(dot(n,normalize(uSun)),0.)*.75+.4;
      vec2 g=floor(vW.xz/6.); float chk=mod(g.x+g.y,2.);
      vec3 land=mix(vec3(.17,.5,.15),vec3(.25,.6,.19),chk);
      vec3 rock=mix(vec3(.45,.37,.27),vec3(.52,.43,.32),chk);
      vec3 c=mix(land,rock,smoothstep(24.,38.,vW.y));
      c=mix(vec3(.78,.72,.45),c,smoothstep(0.,3.,vW.y));
      c*=l;
      if(vRaw<=0.) c=mix(vec3(.04,.18,.5),vec3(.07,.25,.6),chk)*(.8+.2*n.y);
      for(int i=0;i<${BASES.length};i++){ vec4 b=uBases[i]; float d=length(vW.xz-b.xy);
        if(d<${BASE_R.toFixed(1)}){ vec3 pc=mix(vec3(.5,.52,.58),vec3(.36,.3,.3),b.w)*l;
          if(d<${(HOLE_R + 2.2).toFixed(1)}){ float a=atan(vW.z-b.y,vW.x-b.x); pc=mix(vec3(.12,.12,.14),mix(vec3(.95,.8,.1),vec3(.85,.15,.1),b.w),step(.5,fract(a*3.82)))*l; }   // hazard ring round the shaft mouth
          c=pc; } }
      { float d=length(vW.xz-vec2(${PAD.x.toFixed(1)},${PAD.z.toFixed(1)}));
        if(d<${(PAD.r + 2.5).toFixed(1)}){ vec3 pc=vec3(.5,.52,.58)*l; if(d<${PAD.r.toFixed(1)}){float r=d/${PAD.r.toFixed(1)}; pc=mix(vec3(.15,.16,.2),vec3(.95,.8,.1),step(.5,fract(r*4.)))*l;} c=pc; } }
      float fd=length((viewMatrix*vec4(vW,1.)).xyz);
      gl_FragColor=vec4(mix(c,uFog,smoothstep(${(DRAW * 0.5).toFixed(1)},${(DRAW * 0.97).toFixed(1)},fd)),1.);
    }`,
}));
terrain.frustumCulled = false; zScene.add(terrain);

// trees
{
  let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const geo = new THREE.ConeGeometry(1.3, 5, 6); geo.translate(0, 2.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x1f7a2a, flatShading: true }), 1400);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); let n = 0;
  for (let i = 0; i < 6000 && n < 1400; i++) {
    const x = (r() * 2 - 1) * BOUND, z = (r() * 2 - 1) * BOUND, h = terrainH(x, z);
    if (h < 2.5 || h > 24 || Math.hypot(x - PAD.x, z - PAD.z) < 16 || BASES.some(b => Math.hypot(x - b.x, z - b.z) < 30 || stripW(x, z, b) < 1)) continue;
    const k = 0.7 + r() * 1.1; sc.set(k, k * (0.8 + r() * 0.6), k);
    m.compose(new THREE.Vector3(x, h, z), q, sc); mesh.setMatrixAt(n++, m);
  }
  mesh.count = n; zScene.add(mesh);
}
// base
const baseGroup = new THREE.Group(); baseGroup.position.set(0, PAD_H, 0); zScene.add(baseGroup);
{
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 45; baseGroup.add(beam); BASES[0].beam = beam;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.7, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffee66 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(PAD.x, 0.25, PAD.z); baseGroup.add(ring); baseGroup.userData.ring = ring;
  const mat = new THREE.MeshPhongMaterial({ color: 0x8a92a0, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(4 + (i % 3), 3 + (i % 4) * 1.5, 4), mat);
    b.position.set(Math.cos(a) * 14.5, 1.5 + (i % 4) * 0.7, Math.sin(a) * 14.5); b.rotation.y = -a; baseGroup.add(b);
  }
}

for (const b of BASES) if (b.kind === 'enemy') {
  const g = new THREE.Group(); g.position.set(b.x, b.h, b.z); zScene.add(g); b.surface = g;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4030, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 45; g.add(beam); b.beam = beam;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 2.3, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff3020 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring);
  const mat = new THREE.MeshPhongMaterial({ color: 0x4a3a3a, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + 0.3, m = new THREE.Mesh(new THREE.BoxGeometry(3.5 + (i % 2) * 2, 4 + (i % 3) * 2, 3.5), mat);
    m.position.set(Math.cos(a) * 14, 2 + (i % 3), Math.sin(a) * 14); m.rotation.y = -a; g.add(m);
  }
}

const funnelMat = new THREE.MeshLambertMaterial({ color: 0x4a3c31, side: THREE.DoubleSide, flatShading: true });
for (const b of BASES) {
  const f = new THREE.Mesh(new THREE.CylinderGeometry(HOLE_R, 4.4, 7, 28, 1, true), funnelMat);
  f.position.set(b.x, b.h - 3.5, b.z); zScene.add(f); b.funnel = f;
}

// player ship (zarch)
const heliModel = buildHeliMesh(), shipMesh = heliModel.group, cockpit = buildCockpit(), heliNose = shipMesh.getObjectByName('nose');
shipMesh.add(cockpit.group);
zScene.add(shipMesh);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const shipShadow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20).rotateX(-Math.PI / 2), shadowMat); zScene.add(shipShadow);

const reticle = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0xff4466, transparent: true, opacity: 0.9, depthTest: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.1, 24), m), dot = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), m);
  reticle.add(ring, dot); reticle.renderOrder = 10; ring.renderOrder = dot.renderOrder = 10; zScene.add(reticle);
}
const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xff4466, transparent: true, opacity: 0.5, depthTest: false }));
aimLine.renderOrder = 10; zScene.add(aimLine);
const zParts = [], zBullets = [], enemies = [];
const zPartCloud = new Cloud(zScene, 1600, 1.1, true), zBulCloud = new Cloud(zScene, 400, 2.2, true);
const H = createHeliSim(GRAV), _aimR = new THREE.Vector3();
const HI = createHeliInput({ keyDown: kd, readPad, say: (t, s) => say(t, s) });
const Z = {
  pos: new THREE.Vector3(PAD.x, PAD_H + 0.9, PAD.z), vel: new THREE.Vector3(), lean: new THREE.Vector2(), facing: new THREE.Vector2(0, -1),
  aim: new THREE.Vector3(0, 0, -1), aimOff: new THREE.Vector2(), hd: 0, sector: -1, round: 0, throttle: 0, landed: true, alive: true, deadT: 0, fireCd: 0, wave: 0, waveT: 2,
};
const enemyMat = new THREE.MeshPhongMaterial({ color: 0xdd2222, emissive: 0x440808, flatShading: true });
const enemyRing = new THREE.MeshBasicMaterial({ color: 0xff8844 });
// The map is a 3x3 grid of sectors. The centre one holds the home base and is a safe zone (land, refuel, repair).
// Flying into an uncleared sector launches that sector's wave; its ships stay and patrol there, so you can always
// fall back home. Clear all eight and a new, tougher round begins.
const SECT = (2 * BOUND) / 3, HOME = 4;
const SECT_NAMES = ['NORTH-WEST', 'NORTH', 'NORTH-EAST', 'WEST', 'HOME', 'EAST', 'SOUTH-WEST', 'SOUTH', 'SOUTH-EAST'];
const sectorOf = (x, z) => clamp(Math.floor((x + BOUND) / SECT), 0, 2) + 3 * clamp(Math.floor((z + BOUND) / SECT), 0, 2);
const sectorCentre = i => [-BOUND + SECT * ((i % 3) + 0.5), -BOUND + SECT * (Math.floor(i / 3) + 0.5)];
const sectors = Array.from({ length: 9 }, () => ({ state: 'idle' }));   // idle -> active -> cleared
function resetSectors() { for (const sc of sectors) sc.state = 'idle'; sectors[HOME].state = 'cleared'; }
function spawnEnemy(area) {
  const [cx, cz] = sectorCentre(area);
  const x = clamp(cx + rnd(-0.4, 0.4) * SECT, -BOUND, BOUND), zz = clamp(cz + rnd(-0.4, 0.4) * SECT, -BOUND, BOUND);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.8).scale(1.4, 0.7, 1.4), enemyMat));
  g.add(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 4, 20).rotateX(Math.PI / 2), enemyRing));
  g.position.set(x, groundY(x, zz) + 28, zz); zScene.add(g);
  enemies.push({ mesh: g, vel: new THREE.Vector3(), fireT: rnd(1, 3), ph: rnd(6.28), hp: 1, area });
}
function clearEnemies() { for (const e of enemies) zScene.remove(e.mesh); enemies.length = 0; }
function resetZarch(fromPad) {
  H.reset(new THREE.Vector3(PAD.x, PAD_H - HELI.SKID_Y, PAD.z), 0, fromPad, fromPad ? 0 : 1); HI.setCollective(0);
  Z.pos.set(PAD.x, PAD_H + (fromPad ? 0.9 : 2.5), PAD.z); Z.vel.set(0, fromPad ? 0 : 14, 0); Z.lean.set(0, 0); Z.landed = fromPad;
  Z.alive = true; shipMesh.visible = true; shipShadow.visible = true; zBullets.length = 0;
  for (const e of enemies) {
    const dx = e.mesh.position.x, dz = e.mesh.position.z, d = Math.hypot(dx, dz);
    if (d < 90) { const k = 110 / Math.max(d, 1); e.mesh.position.x = dx * k; e.mesh.position.z = dz * k; }
  }
}
// Emergency landing: set down safely anywhere with an empty tank and a logistics team flies out a fuel drop.
// It takes a while and only brings 25% - enough for a last-chance run home. A parachute crate drops beside you
// on the surface for the last few seconds. Crashing (or getting shot) while waiting cancels it.
const RESCUE_TIME = 25, RESCUE_FUEL = 25;
const crate = (() => {
  const g = new THREE.Group(); g.visible = false;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), new THREE.MeshLambertMaterial({ color: 0x6b5a2e, emissive: 0x1a1508 })));
  const chute = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x553322, side: THREE.DoubleSide }));
  chute.position.y = 4; g.add(chute); g.userData.chute = chute;
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.6, 3), new THREE.MeshBasicMaterial({ color: 0xdddddd })); l.position.set(x * 0.9, 2.2, z * 0.9); l.rotation.set(z * 0.25, 0, -x * 0.25); g.add(l); }
  zScene.add(g); return g;
})();
function updateRescue(dt, landed, inCave) {
  const R = G.rescue;
  if (!R) {
    if (landed && G.fuel < 0.5 && G.state === 'play') { G.rescue = { t: RESCUE_TIME, cave: inCave }; say('EMERGENCY LANDING  -  LOGISTICS TEAM DISPATCHED', 3); sfx.dock(); }
    return;
  }
  R.t -= dt;
  if (!R.cave && R.t < 6 && !crate.visible) {   // the drop: a crate on a chute lands a few metres off the nose
    const f = H.forward(); R.cx = Z.pos.x + f.x * 7 + 3; R.cz = Z.pos.z + f.z * 7; crate.visible = true; crate.userData.chute.visible = true;
  }
  if (crate.visible) {
    const gy = groundY(R.cx, R.cz), y = gy + 0.5 + Math.max(0, R.t) * 9;
    crate.position.set(R.cx, y, R.cz); crate.rotation.y += dt * 0.3; crate.userData.chute.visible = R.t > 0;
  }
  if (R.t <= 0) {
    G.fuel = Math.max(G.fuel, RESCUE_FUEL); G.rescue = null; sfx.refuel?.(); sfx.pickup();
    say(`FUEL DROP DELIVERED  -  ${RESCUE_FUEL}%  -  MAKE IT BACK TO BASE`, 3.5);
    setTimeout(() => { crate.visible = false; }, 8000);
  }
}
function cancelRescue() { if (G.rescue) { G.rescue = null; crate.visible = false; } }

function killPlayerZ(why) {
  cancelRescue();
  if (!Z.alive) return;
  Z.alive = false; Z.deadT = 2.4; shipMesh.visible = false; shipShadow.visible = false;
  explode(zParts, Z.pos.x, Z.pos.y, Z.pos.z, 120, 28, false); sfx.boom(1.2); sfx.engine(0);
  say(why, 2);
  G.lives--; if (G.lives < 0) gameOver();
}

function updateZarch(dt, inp) {
  const P = Z.pos;
  if (Z.alive && !params.has('peace')) {   // ?peace: no waves (automated tests)
    const here = sectorOf(P.x, P.z);
    if (here !== Z.sector) {
      Z.sector = here;
      const sc = sectors[here];
      if (here === HOME) say('HOME SECTOR  -  SAFE ZONE', 1.6);
      else if (sc.state === 'idle') {
        sc.state = 'active'; Z.wave++;
        const n = Math.min(2 + Z.round * 2 + Math.floor(Z.wave / 3), 10);
        for (let i = 0; i < n; i++) spawnEnemy(here);
        say(`${SECT_NAMES[here]} SECTOR  -  ${n} HOSTILES`, 2);
      } else if (sc.state === 'cleared') say(`${SECT_NAMES[here]} SECTOR  -  CLEAR`, 1.2);
    }
  }
  for (let i = 0; i < 9; i++) if (sectors[i].state === 'active' && !enemies.some(e => e.area === i)) {
    sectors[i].state = 'cleared'; addScore(500); say(`${SECT_NAMES[i]} SECTOR CLEARED  +500`, 2);
    if (sectors.every(sc => sc.state === 'cleared')) { Z.round++; resetSectors(); Z.sector = -1; say(`ALL SECTORS CLEAR  -  ROUND ${Z.round + 1} INCOMING`, 3); }
  }
  let lm = 0;
  if (!Z.alive) {
    Z.deadT -= dt;
    if (Z.deadT <= 0 && !G.over) { G.fuel = 100; G.cargo = 0; resetZarch(true); }
  } else {
    const ctl = HI.read(dt);
    const ev = H.step(dt, ctl, { groundY, fuel: G.fuel, water: terrainH(H.pos.x, H.pos.z) <= 0 });
    P.copy(H.pos); Z.vel.copy(H.vel); Z.landed = H.landed; Z.throttle = H.coll * H.rpm; Z.ctl = ctl;
    const fw = H.forward(), fl = Math.hypot(fw.x, fw.z); if (fl > 0.15) Z.facing.set(fw.x / fl, fw.z / fl);
    {
      const k = 1 - Math.exp(-6 * dt);
      Z.aimOff.x = lerp(Z.aimOff.x, -(ctl.hatX || 0) * 0.26, k); Z.aimOff.y = lerp(Z.aimOff.y, (ctl.hatY || 0) * 0.26, k);
      Z.aim.copy(fw).applyAxisAngle(H.up(), Z.aimOff.x).applyAxisAngle(_aimR.set(1, 0, 0).applyQuaternion(H.q), Z.aimOff.y);
    }
    G.fuel = Math.max(0, G.fuel - HELI.BURN * (0.15 + 0.85 * H.coll) * H.rpm * dt);
    if (G.fuel <= 0 && !H.landed) say('FUEL EXHAUSTED  -  AUTOROTATE AND SET DOWN SAFELY', 0.5);
    updateRescue(dt, H.landed, false);
    sfx.engine(H.rpm * (0.25 + 0.75 * H.coll));
    if (H.landed && Math.hypot(P.x - PAD.x, P.z - PAD.z) < PAD.r) {
      const fill = Math.min(G.res, 20 * dt, 100 - G.fuel); G.res -= fill; G.fuel += fill;
      if (fill > 0) Z.refuelling = true; else if (Z.refuelling) { Z.refuelling = false; say(G.res < 1 ? 'RESERVOIR EMPTY  -  LOOT ENEMY FUEL' : 'TANKS FULL', 1.6); }
    }
    else if (ev === 'water') killPlayerZ('DITCHED IN THE WATER');
    else if (ev === 'rotor') killPlayerZ('ROTOR STRIKE');
    else if (ev === 'crash') killPlayerZ('CRASHED');
    if (!Z.alive) return;
    // rotor downwash: dust (or spray over water) blown out radially under the disc
    if (H.agl < 12 && H.rpm > 0.5 && H.coll > 0.2) {
      const gy = groundY(P.x, P.z), wet = terrainH(P.x, P.z) <= 0, k = (1 - H.agl / 12) * H.coll;
      for (let i = 0; i < 3; i++) if (Math.random() < k) {
        const a = rnd(6.283), sp = rnd(8, 16);
        emit(zParts, P.x + Math.cos(a) * 1.5, gy + 0.3, P.z + Math.sin(a) * 1.5, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, 0.7, wet ? .6 : .55, wet ? .75 : .48, wet ? .9 : .35, 2);
      }
    }
    for (const ax of ['x', 'z']) if (Math.abs(P[ax]) > BOUND) { P[ax] = Math.sign(P[ax]) * BOUND; Z.vel[ax] = 0; say('TURN BACK', 0.8); }
    Z.fireCd -= dt;
    if ((inp.fire || ctl.fire) && Z.fireCd <= 0) {
      Z.fireCd = 0.14; sfx.shot();
      const bv = Z.aim.clone().multiplyScalar(75).addScaledVector(Z.vel, 0.5);
      zBullets.push({ p: P.clone().addScaledVector(Z.aim, 3.2), v: bv, life: 1.8, own: true });
    }
    { const hb = holeOf(P.x, P.z); if (hb && P.y < hb.h - 0.5 && Z.vel.y < 0) { enterCave(hb); return; } }
    if (Math.abs(P.x) > BOUND || Math.abs(P.z) > BOUND) { H.pos.x = clamp(H.pos.x, -BOUND, BOUND); H.pos.z = clamp(H.pos.z, -BOUND, BOUND); }
  }
  for (let i = zBullets.length - 1; i >= 0; i--) {
    const b = zBullets[i]; b.life -= dt; b.v.y -= GRAV * 0.25 * dt; b.p.addScaledVector(b.v, dt);
    let dead = b.life <= 0 || b.p.y < groundY(b.p.x, b.p.z);
    if (dead && b.life > 0) explode(zParts, b.p.x, b.p.y, b.p.z, 6, 6, false);
    if (!dead && b.own) {
      for (const e of enemies) if (e.mesh.position.distanceTo(b.p) < 3.6) { e.hp--; dead = true; break; }
    } else if (!dead && !b.own && Z.alive && b.p.distanceTo(P) < 2.1) { dead = true; killPlayerZ('SHOT DOWN'); }
    if (dead) { zBullets[i] = zBullets[zBullets.length - 1]; zBullets.pop(); }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], ep = e.mesh.position; e.ph += dt;
    if (e.hp <= 0) {
      explode(zParts, ep.x, ep.y, ep.z, 70, 22, false); sfx.boom(0.8); addScore(150);
      zScene.remove(e.mesh); enemies.splice(i, 1); continue;
    }
    const pSec = sectorOf(P.x, P.z), hunting = Z.alive && pSec === e.area && pSec !== HOME;
    const [acx, acz] = sectorCentre(e.area);
    const tx = hunting ? P.x : acx + Math.cos(e.ph * 0.3) * SECT * 0.3, tz = hunting ? P.z : acz + Math.sin(e.ph * 0.3) * SECT * 0.3;
    const dx = tx - ep.x, dz = tz - ep.z, hd = Math.hypot(dx, dz) || 1, sp = (hunting ? 15 : 10) + Z.round * 2;
    const near = hunting && hd < 40 ? -1 : 1;
    const wantV = new THREE.Vector3((dx / hd) * sp * near + Math.cos(e.ph * 1.3) * 5, 0, (dz / hd) * sp * near + Math.sin(e.ph * 1.1) * 5);
    wantV.y = (groundY(ep.x, ep.z) + 26 + Math.sin(e.ph) * 5 - ep.y) * 1.2;
    e.vel.lerp(wantV, 1 - Math.exp(-1.5 * dt)); ep.addScaledVector(e.vel, dt);
    ep.x = clamp(ep.x, -BOUND, BOUND); ep.z = clamp(ep.z, -BOUND, BOUND);
    e.mesh.rotation.y += dt * 2;
    e.fireT -= dt;
    if (hunting && e.fireT <= 0 && hd < 100) {
      e.fireT = Math.max(0.9, 2.4 - Z.round * 0.3) + rnd(1); sfx.enemyShot();
      const t = ep.distanceTo(P) / 48, aim = P.clone().addScaledVector(Z.vel, t * 0.5);
      aim.x += rnd(-5, 5); aim.z += rnd(-5, 5);
      zBullets.push({ p: ep.clone(), v: aim.sub(ep).normalize().multiplyScalar(48), life: 3, own: false });
    }
    if (Z.alive && ep.distanceTo(P) < 3.2) { e.hp = 0; killPlayerZ('RAMMED'); }
  }
  stepParts(zParts, dt);
}

function refuelAtBase() {
  sfx.dock(); sfx.engine(0);
  if (G.fuel < 99) say('REFUELLED', 1.5);
  G.fuel = 100;
}

// ================================================================ THRUST
const T_THRUST = 17, T_ROT = 3.4, ROPE = 4.2, PODM = 0.35, T_VIEWH = 30;
const T = { guide: 0, base: null, lvl: null, w: 0, ge: 0, onPad: false, yawF: -Math.PI / 2, face: 1, roll: 0, zOff: 0, q0: new THREE.Quaternion(), qLast: new THREE.Quaternion(), x: 0, y: 0, vx: 0, vy: 0, ang: 0, landed: true, alive: true, deadT: 0, fireCd: 0, pod: null, bullets: [], tb: [], parts: [], turrets: [], tanks: [], cam: new THREE.Vector2(), beamOn: false, thrOn: 0, hadPod: false };
const podMesh = makePod(), rope = makeRope();
const beam3 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ffee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
let caveGroup = null, tPartCloud = null, tBulCloud = null;
const caveToWorld = (x, y, out, b = T.base) => out.set(b.x + (x - CAVE_OX) * CS, b.h - CAVE_SINK + (y - T.lvl.H) * CS, b.z);
const sol = (x, y) => { const L = T.lvl; if (x < 0 || x >= L.W || y < 0) return 1; if (y >= L.H) return 0; return L.solid[Math.floor(y) * L.W + Math.floor(x)]; };
const isPad = (x, y) => { const L = T.lvl; if (x < 0 || x >= L.W || y < 0 || y >= L.H) return false; return L.pad[Math.floor(y) * L.W + Math.floor(x)] === 1; };

// Build every base's cave once. Geometry is shared; each base keeps its own turrets/tanks/pod state, so a looted
// tank stays empty and a destroyed turret stays dead. The home cave is friendly: no turrets, a big reservoir tank and
// a blue intake pad where carried fuel is pumped into the reservoir.
const CARGO_MAX = 100, RES_MAX = 300;
function buildCaves() {
  let proto = null;
  BASES.forEach((b, i) => {
    const L = b.L = buildLevel(i);
    if (!proto) proto = buildCaveMesh(L, { depth: CAVE_DEPTH });
    const grp = b.group = new THREE.Group(); grp.scale.setScalar(CS); grp.position.set(b.x - CAVE_OX * CS, b.h - CAVE_SINK - L.H * CS, b.z); zScene.add(grp);
    const mesh = proto.clone(); grp.add(mesh);
    const dyn = new THREE.Group(); grp.add(dyn);
    b.st = { turrets: [], tanks: [], pod: null, podTaken: false };
    if (b.kind === 'home') {
      mesh.traverse(o => { if (o.isMesh && o.material.color && o.material.color.getHex() === 0x1abf59) { o.material = o.material.clone(); o.material.color.setHex(0x2a7fff); o.material.emissive.setHex(0x0a2a70); } });
      const res = makeTank(); res.scale.setScalar(2.2); res.position.set(L.tanks[1].x, L.padTop + 1.8, -1); dyn.add(res); b.resTank = res;
      b.st.pod = { x: -99, y: -99, vx: 0, vy: 0, attached: false }; b.st.podTaken = true;
    } else {
      b.st.turrets = L.turrets.map(t => ({ ...t, cd: rnd(0.5, 2), alive: true, ang: 0, mesh: null }));
      b.st.tanks = L.tanks.map(t => ({ ...t, mesh: null, max: t.fuel }));
      for (const t of b.st.turrets) { t.mesh = makeTurret(); t.mesh.position.set(t.x, t.y, 0); dyn.add(t.mesh); }
      for (const t of b.st.tanks) { t.mesh = makeTank(); t.mesh.position.set(t.x, t.y, 0); dyn.add(t.mesh); }
      b.st.pod = { x: L.orb.x, y: L.orb.y, vx: 0, vy: 0, attached: false };
    }
  });
  useCave(BASES[0]);
}
function useCave(b) {   // point the shared cave state + effects at base b
  T.base = b; T.lvl = b.L; caveGroup = b.group;
  T.turrets = b.st.turrets; T.tanks = b.st.tanks; T.pod = b.st.pod;
  if (!tPartCloud) { tPartCloud = new Cloud(caveGroup, 1600, 1.0, true); tBulCloud = new Cloud(caveGroup, 300, 1.9, true); }
  caveGroup.add(podMesh, rope.obj, beam3, tPartCloud.obj, tBulCloud.obj);
  T.bullets.length = 0; T.tb.length = 0; T.parts.length = 0;
}
function resetBases() {   // new game: restock every enemy base
  for (const b of BASES) if (b.kind === 'enemy') {
    for (const t of b.st.turrets) { t.alive = true; t.mesh.visible = true; }
    for (const t of b.st.tanks) { t.fuel = t.max; t.mesh.userData.bar.scale.y = 1; }
    Object.assign(b.st.pod, { x: b.L.orb.x, y: b.L.orb.y, vx: 0, vy: 0, attached: false }); b.st.podTaken = false;
  }
}
// Fly into the shaft from the surface: the same ship carries on, locked to the cave plane.
function enterCave(b) {
  useCave(b);
  const L = T.lvl, P = Z.pos;
  G.mode = 'thrust';
  T.x = (P.x - b.x) / CS + CAVE_OX; T.y = (P.y - b.h + CAVE_SINK) / CS + L.H; T.vx = Z.vel.x / CS; T.vy = Z.vel.y / CS;
  T.vy = Math.max(T.vy, -5); T.vx = clamp(T.vx, -2, 2); T.guide = 1.2; T.q0.copy(shipMesh.quaternion);
  { const u = H.up(); T.ang = clamp(Math.atan2(u.x, u.y), -0.3, 0.3); } T.w = 0; T.zOff = P.z - b.z; T.landed = false; T.alive = true; T.thrOn = Z.throttle;
  T.face = Z.facing.x < 0 ? -1 : 1; T.yawF = -T.face * Math.PI / 2;
  say(b.kind === 'home' ? 'HOME BASE  -  LAND ON THE BLUE PAD TO UNLOAD FUEL' : `${b.name}  -  LOOT THE FUEL, STEAL THE POD`, 3);
}
// Climb out of the shaft: hand the ship back to the 3D flight model with its momentum.
function exitCave() {
  const had = T.pod.attached;
  if (had) { addScore(1500); say('POD STOLEN  +1500', 2.5); sfx.dock(); T.base.st.podTaken = true; }
  else say('BACK ON THE SURFACE', 1.5);
  T.pod.attached = false;
  caveToWorld(T.x, T.y, Z.pos); Z.vel.set(T.vx * CS, T.vy * CS, 0);
  H.pos.copy(Z.pos); H.vel.copy(Z.vel); H.q.copy(T.qLast); H.w.set(0, 0, 0); H.landed = false;
  Z.facing.set(T.face, 0); Z.landed = false; Z.alive = true; Z.throttle = T.thrOn;
  G.mode = 'zarch';
}
// after a crash anywhere: a fresh helicopter, cold on the home pad. A pod on the line drops back where it came from.
function respawnHome() {
  if (T.pod && T.pod.attached) Object.assign(T.pod, { attached: false, x: T.lvl.orb.x, y: T.lvl.orb.y, vx: 0, vy: 0 });
  T.alive = true; T.landed = false; G.fuel = 100; G.cargo = 0;
  G.mode = 'zarch'; resetZarch(true); say('NEW HELICOPTER ON THE HOME PAD', 2);
}
function shipPts() {
  // helicopter outline in cave cells (0.7 scale): nose, tail, rotor tips, then the two skid ends (which may touch down)
  const s = Math.sin(T.ang), c = Math.cos(T.ang), f = T.face;
  return [[1.7 * f, 0.1], [-2.6 * f, 0.5], [-1.65, 1.0], [1.65, 1.0], [0.9 * f, -0.75], [-0.9 * f, -0.75]].map(([lx, ly]) => [T.x + lx * c + ly * s, T.y - lx * s + ly * c]);
}
function crashThrust(why) {
  cancelRescue();
  if (!T.alive) return;
  T.alive = false; T.deadT = 2.2; shipMesh.visible = false;
  explode(T.parts, T.x, T.y, 0, 90, 14, true); sfx.boom(1); sfx.engine(0); say(why, 2);
  G.lives--; if (G.lives < 0) gameOver();
}
function los(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 0.4);
  for (let i = 1; i < n; i++) { const t = i / n; if (sol(ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
  return true;
}

function updateThrust(dt, inp) {
  const L = T.lvl;
  if (!T.alive) { T.deadT -= dt; if (T.deadT <= 0 && !G.over) respawnHome(); stepParts(T.parts, dt); return; }
  const ctl = HI.read(dt); Z.ctl = ctl;
  if (G.fuel > 0) H.rpm = Math.min(1, H.rpm + 0.4 * dt); else H.rpm = Math.max(0, H.rpm - (0.06 + 0.2 * ctl.coll) * dt);
  const auth = H.rpm * H.rpm, thr = ctl.coll * auth, beam = !!ctl.winch;
  T.thrOn = thr; T.beamOn = beam;
  sfx.engine(T.landed && thr < 0.05 ? 0 : thr);
  T.fireCd -= dt;
  if ((inp.fire || ctl.fire) && T.fireCd <= 0) {
    T.fireCd = 0.18; sfx.shot();
    // the gun points along the nose: horizontal, tipped by the disc tilt
    const nx = T.face * Math.cos(T.ang), ny = -T.face * T.face * Math.sin(T.ang) * T.face;
    T.bullets.push({ x: T.x + nx * 2, y: T.y + ny * 2, vx: nx * 24 + T.vx * .5, vy: ny * 24 + T.vy * .5, life: 1.4 });
  }
  const n = Math.ceil(dt / (1 / 240)), h = dt / n, pod = T.pod;
  for (let it = 0; it < n && T.alive; it++) {
    const lift = thr * HELI.TMAX * 7 * (1 + 0.22 * T.ge);
    if (T.guide > 0) { T.guide -= h; T.landed = false; T.x += (CAVE_OX - T.x) * Math.min(1, 5 * h); T.vx *= 1 - Math.min(1, 4 * h); T.ang *= 1 - Math.min(1, 3 * h); }   // the funnel lines you up on the shaft
    if (T.landed) { if (lift > 7) { T.landed = false; T.onPad = false; } else { T.vx = T.vy = 0; T.w = 0; T.ang *= 0.9; break; } }
    {   // disc tilt rate follows the cyclic; stability assist levels it hands-off
      let want = ctl.cx * HELI.RATE.roll; if (ctl.sas) want += -T.ang * 1.6 * (1 - Math.min(1, Math.abs(ctl.cx) * 2.5));
      T.w += (want - T.w) * HELI.RESP * auth * h; T.ang += T.w * h;
    }
    if (pod.attached) { pod.len = Math.max(ROPE, pod.len - 3 * h); pod.grace = Math.max(0, pod.grace - h); }
    let ax = Math.sin(T.ang) * lift, ay = Math.cos(T.ang) * lift - 7;
    if (pod.attached) {
      const dx = pod.x - T.x, dy = pod.y - T.y, d = Math.hypot(dx, dy) || 1;
      let pax = 0, pay = -7;
      if (d > pod.len) {
        const nx = dx / d, ny = dy / d, rv = (pod.vx - T.vx) * nx + (pod.vy - T.vy) * ny;
        const f = Math.min(40, Math.max(0, 60 * (d - pod.len) + 3 * rv));
        ax += nx * f * PODM; ay += ny * f * PODM; pax -= nx * f; pay -= ny * f;
      }
      pod.vx += pax * h; pod.vy += pay * h;
      const ox = pod.x, oy = pod.y; pod.x += pod.vx * h; pod.y += pod.vy * h;
      let hit = false; for (let k = 0; k < 8 && !hit; k++) { const a = k / 8 * Math.PI * 2; if (sol(pod.x + Math.cos(a) * .7, pod.y + Math.sin(a) * .7)) hit = true; }
      if (hit) { pod.x = ox; pod.y = oy; pod.vx *= -0.3; pod.vy *= -0.3; pod.scrape = 0.3; }
    }
    T.vx += (ax - T.vx * 0.05) * h; T.vy += (ay - T.vy * 0.05) * h; T.x += T.vx * h; T.y += T.vy * h;
    // ground effect: how close the skids are to rock below (0..1)
    T.ge = 0; for (let d = 0.5; d < 4; d += 0.5) if (sol(T.x, T.y - 0.8 - d)) { T.ge = 1 - d / 4; break; }
    const pts = shipPts(); let bad = null, skid = false;
    for (let i = 0; i < pts.length; i++) {
      if (!sol(pts[i][0], pts[i][1])) continue;
      if (i >= 4) skid = true; else bad = i >= 2 ? 'ROTOR STRIKE' : 'CRASHED';
    }
    if (T.guide > 0) { bad = null; skid = false; }   // no wall strikes or rim landings while the funnel lines you up
    if (bad) { crashThrust(bad); break; }
    if (skid) {   // a helicopter can set down on any ledge; only the pad refuels
      if (T.vy > -4 && Math.abs(T.vx) < 3.5 && Math.abs(T.ang) < 0.4) { T.y -= T.vy * h; T.vx = T.vy = 0; T.w = 0; T.landed = true; T.onPad = pts.slice(4).some(p => isPad(p[0], p[1] - 0.05)); }
      else { crashThrust('HARD LANDING'); break; }
    }
    if (T.y > L.H + 1) { exitCave(); return; }
  }
  if (!T.alive) return;
  updateRescue(dt, T.landed, true);
  if (T.landed && T.onPad && T.base.kind === 'home') {
    const unload = Math.min(G.cargo, 30 * dt, RES_MAX - G.res); G.cargo -= unload; G.res += unload;
    const fill = Math.min(G.res, 25 * dt, 100 - G.fuel); G.res -= fill; G.fuel += fill;
    if (unload > 0) { T.unloaded = (T.unloaded || 0) + unload; if (G.cargo <= 0.01) { say(`FUEL UNLOADED  -  RESERVOIR ${Math.round(G.res)}`, 2); addScore(Math.round(T.unloaded * 5)); T.unloaded = 0; } }
  }
  if (Math.abs(T.vx) > 1.5) T.face = Math.sign(T.vx);
  if (thr > 0.1) {
    const s = Math.sin(T.ang), c = Math.cos(T.ang);
    // rotor downwash kicks dust off the rock below when close (ground effect range)
    if (T.ge > 0) { let gy = T.y - 0.8; while (!sol(T.x, gy) && gy > T.y - 5) gy -= 0.25;
      for (let i = 0; i < 2; i++) { const d = Math.random() < 0.5 ? -1 : 1; emit(T.parts, T.x + d * rnd(0.3, 1.5), gy + 0.4, 0, d * rnd(5, 10), rnd(0.3, 1.5), 0, 0.5, .55, .48, .38, 2); } }
  }
  G.fuel = Math.max(0, G.fuel - HELI.BURN * (0.15 + 0.85 * ctl.coll) * H.rpm * dt);
  if (beam && G.fuel > 0) {
    G.fuel = Math.max(0, G.fuel - 0.8 * dt);
    const bx = T.x - Math.sin(T.ang) * 3.5, by = T.y - Math.cos(T.ang) * 3.5;
    if (!pod.attached && Math.hypot(pod.x - bx, pod.y - by) < 4.5) { pod.attached = true; pod.len = Math.max(ROPE, Math.hypot(pod.x - T.x, pod.y - T.y)); pod.grace = 0; T.hadPod = true; addScore(500); sfx.pickup(); say('POD SECURED  -  GET OUT!', 2.5); }
    for (const tk of T.tanks) if (tk.fuel > 0 && Math.hypot(tk.x - bx, tk.y - by) < 4.5) {
      const toCargo = Math.min(tk.fuel, 30 * dt, CARGO_MAX - G.cargo), toTank = Math.min(tk.fuel - toCargo, 30 * dt - toCargo, 100 - G.fuel);
      const take = toCargo + Math.max(0, toTank); tk.fuel -= take; G.cargo += toCargo; G.fuel += Math.max(0, toTank);
      if (take > 0 && tk.fuel <= 0.01) say('TANK DRAINED  -  TAKE IT HOME', 1.5);
      tk.mesh.userData.bar.scale.y = Math.max(0.01, tk.fuel / tk.max);
      if (take > 0) emit(T.parts, tk.x, tk.y, 0, (T.x - tk.x) * 2, (T.y - tk.y) * 2, 0, 0.4, .3, 1, .5, 0);
    }
  }
  for (let i = T.bullets.length - 1; i >= 0; i--) {
    const b = T.bullets[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.life <= 0 || sol(b.x, b.y);
    if (!dead) for (const t of T.turrets) if (t.alive && Math.hypot(t.x - b.x, t.y - b.y) < 1.0) {
      t.alive = false; t.mesh.visible = false; explode(T.parts, t.x, t.y, 0, 40, 9, true); sfx.boom(0.6); addScore(100); dead = true; break;
    }
    if (dead) { if (b.life > 0) explode(T.parts, b.x, b.y, 0, 5, 4, true); T.bullets[i] = T.bullets[T.bullets.length - 1]; T.bullets.pop(); }
  }
  for (const t of T.turrets) {
    if (!t.alive) continue;
    const dx = T.x - t.x, dy = T.y - t.y, d = Math.hypot(dx, dy);
    t.ang = Math.atan2(dy, dx);
    t.cd -= dt;
    if (d < 22 && t.cd <= 0 && los(t.x, t.y, T.x, T.y)) {
      t.cd = Math.max(0.9, 2.4 - BASES.indexOf(T.base) * 0.2) + rnd(0.6); sfx.enemyShot();
      const lead = d / 11, ax = T.x + T.vx * lead * .5 - t.x, ay = T.y + T.vy * lead * .5 - t.y, al = Math.hypot(ax, ay) || 1;
      T.tb.push({ x: t.x + ax / al * 1.2, y: t.y + ay / al * 1.2, vx: ax / al * 11, vy: ay / al * 11, life: 4 });
    }
  }
  for (let i = T.tb.length - 1; i >= 0; i--) {
    const b = T.tb[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.life <= 0 || sol(b.x, b.y);
    if (!dead && T.alive && Math.hypot(b.x - T.x, b.y - T.y) < 0.85) { dead = true; crashThrust('SHOT DOWN'); }
    if (dead) { T.tb[i] = T.tb[T.tb.length - 1]; T.tb.pop(); }
  }
  stepParts(T.parts, dt);
}
// ================================================================ flow
function gameOver() {
  G.over = true;
  setTimeout(() => { if (G.over) { G.state = 'title'; $('title').style.display = 'flex'; $('title').querySelector('h1').textContent = 'GAME OVER'; G.mode = 'zarch'; } }, 2500);
}
function startTransition(label, swap) { G.state = 'trans'; G.tr = { t: 0, phase: 0, swap }; $('fadeText').textContent = label; }
function newGame() {
  cancelRescue();
  G.score = 0; G.lives = 3; G.fuel = 100; G.visit = 0; G.mode = 'zarch'; G.over = false; G.state = 'play';
  G.res = 150; G.cargo = 0; resetBases(); clearEnemies(); Z.wave = 0; Z.round = 0; Z.sector = -1; resetSectors(); zParts.length = 0; resetZarch(true); say('ROTOR SPOOLING  -  RAISE COLLECTIVE TO LIFT', 3);
  $('title').style.display = 'none'; $('title').querySelector('h1').textContent = 'THRUST / ZARCH'; say('');
}
function pressStart() { if (G.state === 'title') newGame(); }

// ---------------------------------------------------------------- hud / render
const radar = $('radar').getContext('2d');
function setMapSize() {
  const c = $('radar'); c.classList.toggle('big', bigMap);
  c.width = bigMap ? innerWidth : 150; c.height = bigMap ? innerHeight : 150;
}
addEventListener('resize', () => { if (bigMap) setMapSize(); });
function drawMap() {
  const W = radar.canvas.width, H = radar.canvas.height; radar.clearRect(0, 0, W, H);
  const half = bigMap ? Math.min(W, H) * 0.45 / BOUND : 70 / 300, cx = W / 2, cy = H / 2;
  const ox = bigMap ? 0 : Z.pos.x, oz = bigMap ? 0 : Z.pos.z, lim = bigMap ? 1e9 : 72;
  const px = x => cx + (x - ox) * half, py = z => cy + (z - oz) * half;
  const dot = (x, z, c, sz) => { const X = px(x), Y = py(z); if (Math.hypot(X - cx, Y - cy) > lim) return; radar.fillStyle = c; radar.fillRect(X - sz / 2, Y - sz / 2, sz, sz); };
  if (bigMap) {
    radar.strokeStyle = '#4aa'; radar.lineWidth = 1; radar.strokeRect(px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half);
    radar.font = '13px monospace';
    for (let i = 0; i < 9; i++) {
      const x0 = -BOUND + SECT * (i % 3), z0 = -BOUND + SECT * Math.floor(i / 3), st = sectors[i].state;
      radar.fillStyle = i === HOME ? 'rgba(255,230,80,.08)' : st === 'cleared' ? 'rgba(60,255,120,.10)' : st === 'active' ? 'rgba(255,60,60,.14)' : 'rgba(0,0,0,0)';
      radar.fillRect(px(x0), py(z0), SECT * half, SECT * half); radar.strokeRect(px(x0), py(z0), SECT * half, SECT * half);
      radar.fillStyle = i === HOME ? '#ff8' : st === 'cleared' ? '#6f8' : st === 'active' ? '#f66' : '#8aa';
      radar.fillText(i === HOME ? 'HOME  (SAFE)' : `${SECT_NAMES[i]}  ${st === 'idle' ? '?' : st === 'active' ? 'HOSTILE' : 'CLEAR'}`, px(x0) + 6, py(z0) + 16);
    }
  }
  // refuel station (base pad): ring + label; pinned to the radar edge when out of range
  let bx = px(PAD.x), by = py(PAD.z); const bd = Math.hypot(bx - cx, by - cy), pinned = bd > lim;
  if (pinned) { bx = cx + (bx - cx) / bd * lim; by = cy + (by - cy) / bd * lim; }
  radar.strokeStyle = '#ff0'; radar.fillStyle = '#ff0'; radar.lineWidth = 2;
  radar.beginPath(); radar.arc(bx, by, bigMap ? 9 : 6, 0, 6.283); radar.stroke();
  radar.beginPath(); radar.arc(bx, by, bigMap ? 3 : 2, 0, 6.283); radar.fill();
  if (bigMap) { radar.font = '14px monospace'; radar.fillText('REFUEL / BASE', bx + 14, by + 5); }
  if (pinned) { radar.font = 'bold 9px monospace'; radar.fillText('F', bx - 3, by + 3); }
  for (const b of BASES) if (b.kind === 'enemy') {
    const X = px(b.x), Y = py(b.z); if (Math.hypot(X - cx, Y - cy) > lim) continue;
    radar.strokeStyle = '#f53'; radar.lineWidth = 2; radar.beginPath(); radar.arc(X, Y, bigMap ? 8 : 5, 0, 6.283); radar.stroke();
    if (bigMap) { radar.fillStyle = '#f86'; radar.font = '13px monospace'; radar.fillText(b.name + (b.st && b.st.podTaken ? '  (POD TAKEN)' : ''), X + 12, Y + 4); }
  }
  for (const e of enemies) dot(e.mesh.position.x, e.mesh.position.z, '#f44', bigMap ? 6 : 4);
  for (const b of zBullets) if (!b.own) dot(b.p.x, b.p.z, '#fa4', 2);
  // player: triangle pointing along the nose
  const X = px(Z.pos.x), Y = py(Z.pos.z), fx = Z.facing.x, fz = Z.facing.y, sz = bigMap ? 8 : 5;
  radar.fillStyle = '#4ff'; radar.beginPath();
  radar.moveTo(X + fx * sz, Y + fz * sz); radar.lineTo(X - fx * sz - fz * sz * .6, Y - fz * sz + fx * sz * .6); radar.lineTo(X - fx * sz + fz * sz * .6, Y - fz * sz - fx * sz * .6); radar.fill();
}
const _hud = {};
function setText(id, v) { if (_hud[id] !== v) { _hud[id] = v; $(id).textContent = v; } }
function setStyle(id, k, v) { const key = id + k; if (_hud[key] !== v) { _hud[key] = v; $(id).style[k] = v; } }
function updateHud() {
  setText('score', String(G.score)); setText('hi', String(G.hi));
  setText('lives', '▲'.repeat(Math.max(0, G.lives)));
  setStyle('fuel', 'width', clamp(G.fuel, 0, 100).toFixed(1) + '%');
  setText('modeTag', (G.mode === 'zarch' ? 'ZARCH' : 'THRUST  ·  ' + (T.base ? T.base.name : '')) + `   RESERVOIR ${Math.round(G.res)}/${RES_MAX}  CARGO ${Math.round(G.cargo)}`);
  setText('pad', readPad() ? 'CONTROLLER' : (keyboardOnly ? 'KEYBOARD ONLY' : 'KEYBOARD'));
  setStyle('radar', 'display', G.mode === 'zarch' ? 'block' : 'none');
  if (G.mode === 'zarch') {
    const hb = holeOf(Z.pos.x, Z.pos.z), alt = Z.pos.y - 0.9 - (hb ? hb.h : groundY(Z.pos.x, Z.pos.z)), bd = Math.hypot(Z.pos.x, Z.pos.z);
    const ias = Math.hypot(Z.vel.x, Z.vel.z) * 1.944, hdg = ((H.heading() * 180 / Math.PI) + 360) % 360, c = Z.ctl || {};
    setText('alt', `COLL ${(H.coll * 100).toFixed(0)}%  RPM ${(H.rpm * 100).toFixed(0)}%  IAS ${ias.toFixed(0)}kt  VS ${Z.vel.y.toFixed(1)}  AGL ${Math.max(0, hb ? Z.pos.y + HELI.SKID_Y - hb.h : H.agl).toFixed(0)}m  HDG ${hdg.toFixed(0).padStart(3, '0')}  ${c.sas ? 'SAS' : 'MANUAL'}  [${c.source || ''}]${H.vrs > 0.4 ? '  VORTEX RING!' : ''}`);
    setText('hint', G.rescue ? `EMERGENCY LANDING  -  FUEL DROP IN ${Math.max(0, Math.ceil(G.rescue.t))}s` : H.landed && H.rpm < 0.9 && G.fuel > 0 ? 'ROTOR SPOOLING...' : H.landed && Math.hypot(Z.pos.x - PAD.x, Z.pos.z - PAD.z) < PAD.r && G.res < 1 && G.fuel < 99 ? 'RESERVOIR EMPTY  -  LOOT FUEL FROM ENEMY BASES, UNLOAD IT IN THE HOME CAVE' : Z.sector >= 0 && sectors[Z.sector].state === 'active' ? `${SECT_NAMES[Z.sector]} SECTOR  -  ${enemies.filter(e => e.area === Z.sector).length} HOSTILES LEFT` : (bd < 60 && !Z.landed ? 'LAND ON THE PAD TO REFUEL FROM THE RESERVOIR  -  DESCEND THE SHAFT TO UNLOAD CARGO' : ''));
    drawMap();
  } else {
    const c = Z.ctl || {};
    setText('alt', `COLL ${(c.coll * 100 || 0).toFixed(0)}%  RPM ${(H.rpm * 100).toFixed(0)}%  VS ${T.vy.toFixed(1)}  ${c.sas ? 'SAS' : 'MANUAL'}  ${T.pod && T.pod.attached ? 'POD ON THE LINE' : ''}`);
    setText('hint', G.rescue ? `EMERGENCY LANDING  -  FUEL RUN IN ${Math.max(0, Math.ceil(G.rescue.t))}s` : '');
  }
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); zCam.aspect = w / h; zCam.updateProjectionMatrix();
}
// dynamic resolution: if frames run long (GPU-bound, e.g. a 4K screen) step the render resolution down, and back up
// when there is headroom. Hysteresis + a cooldown keep it from hunting. Off with ?res=N (fixed ratio N).
const dynRes = { ms: 16.7, cool: 0 };
function updateDynRes(frameMs) {
  if (params.has('res') || frameMs > 250) return;
  dynRes.ms += (frameMs - dynRes.ms) * 0.05; dynRes.cool -= frameMs;
  if (dynRes.cool > 0) return;
  let pr = pixRatio;
  if (dynRes.ms > 19.5 && pr > 0.6) pr = Math.max(0.6, pr - 0.15);
  else if (dynRes.ms < 14.5 && pr < PR_MAX) pr = Math.min(PR_MAX, pr + 0.1);
  if (pr !== pixRatio) { pixRatio = pr; renderer.setPixelRatio(pr); resize(); dynRes.cool = 1500; }
}
addEventListener('resize', resize); resize();

const _u = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _tgt = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _yAx = new THREE.Vector3(0, 1, 0), _zAx = new THREE.Vector3(0, 0, 1), _xAx = new THREE.Vector3(1, 0, 0);
// camA is the 3D flight camera (fixed or chase); camS the side-on cave camera. zCam renders a blend of the two, so
// diving into the shaft swings the view round to the 2.5D side view with no cut.
const camA = new THREE.PerspectiveCamera(), camS = new THREE.PerspectiveCamera(), SIDE_FOV = 38, SIDE_VIEWH = 30 * CS;
let camB = 0;
function updateCamsAndMeshes(dt, time) {
  const P = Z.pos, inCave = G.mode === 'thrust' && !!T.lvl;
  if (inCave) {   // keep Z.pos on the ship so the 3D camera keeps following it through the swing
    caveToWorld(T.x, T.y, P); T.zOff *= Math.exp(-5 * dt); P.z = T.base.z + T.zOff;
  }
  heliModel.animate(H.rpm, dt, time);
  for (const b of BASES) {
    b.funnel.visible = camB < 0.5;
    const d = Math.hypot(zCam.position.x - b.x, zCam.position.z - b.z), f = 1 - smooth(DRAW * 0.45, DRAW * 0.85, d);
    b.beam.visible = f > 0.01; b.beam.material.opacity = (b.kind === 'home' ? 0.35 : 0.3) * f;
  }
  for (const b of BASES) if (b.group) b.group.visible = b === T.base && inCave || Math.hypot(zCam.position.x - b.x, zCam.position.z - b.z) < 140;
  baseGroup.userData.ring.material.color.setHSL((time * 0.5) % 1, 1, 0.6);
  if (G.state === 'title') {
    const a = time * 0.15; camA.position.set(Math.cos(a) * 40, PAD_H + 14, Math.sin(a) * 40); camA.lookAt(0, PAD_H + 3, 0);
  } else if (cockpitCam && !inCave && Z.alive) {
    // pilot's eye, rigidly in the airframe (rotor vibration adds a hint of shake at high collective)
    camA.position.copy(EYE).applyQuaternion(H.q).add(H.pos); camA.quaternion.copy(H.q).multiply(_q2.setFromAxisAngle(_yAx, head.yaw)).multiply(_q2.setFromAxisAngle(_xAx, -0.13 + head.pitch));   // eyes slightly down onto the panel, plus free look
    if (document.pointerLockElement !== canvas) { const k = Math.exp(-5 * dt); head.yaw *= k; head.pitch *= k; }
    const sh = 0.004 * H.rpm * (0.3 + H.coll); camA.position.x += (Math.random() - 0.5) * sh; camA.position.y += (Math.random() - 0.5) * sh;
  } else if (chaseCam && !inCave) {
    const k = 1 - Math.exp(-3 * dt); _cf.x = lerp(_cf.x, Z.facing.x, k); _cf.z = lerp(_cf.z, Z.facing.y, k);
    const m = Math.hypot(_cf.x, _cf.z) || 1; _cf.x /= m; _cf.z /= m;
    _tgt.set(P.x - _cf.x * 22, P.y + 8, P.z - _cf.z * 22); camA.position.lerp(_tgt, 1 - Math.exp(-6 * dt));
    camA.position.y = Math.max(camA.position.y, groundY(camA.position.x, camA.position.z) + 3);
    camA.lookAt(P.x + _cf.x * 14, P.y - 1, P.z + _cf.z * 14);
  } else {
    _tgt.set(P.x, P.y + 9, P.z + 20); camA.position.lerp(_tgt, 1 - Math.exp(-5 * dt));
    camA.position.y = Math.max(camA.position.y, groundY(camA.position.x, camA.position.z) + 3);
    camA.lookAt(P.x * 0.9 + camA.position.x * 0.1, P.y - 1, P.z - 12);
  }
  // side camera: clamp to the level (plus its rock margin) so the view never leaves the rock
  if (T.lvl) {
    const L = T.lvl, hh = 15, hw = hh * zCam.aspect;
    const k = 1 - Math.exp(-4 * dt);
    T.cam.x = lerp(T.cam.x, T.x + T.vx * 0.3, k); T.cam.y = lerp(T.cam.y, T.y + T.vy * 0.3, k);
    const cx = clamp(T.cam.x, hw - 10, L.W - hw + 10), cy = clamp(T.cam.y, hh - 10, L.H + 6 - hh);
    caveToWorld(cx, cy, camS.position); camS.position.z = T.base.z + SIDE_VIEWH / 2 / Math.tan(SIDE_FOV / 2 * Math.PI / 180);
    camS.quaternion.identity();
  }
  camB = clamp(camB + (inCave ? dt : -dt) / 1.3, 0, 1);
  const e = smooth(0, 1, camB);
  if (e <= 0) { zCam.position.copy(camA.position); zCam.quaternion.copy(camA.quaternion); }
  else {
    // arc the camera out in front of the cave face while it swings, rather than cutting through the rock
    // quadratic Bezier via a point above the cave front at surface height: the camera rises clear of the hills,
    // then sinks straight down through the ground into the side view; it turns to face the cave early
    _tgt.set(camS.position.x, PAD_H + 16, camS.position.z);
    const a = (1 - e) * (1 - e), b = 2 * e * (1 - e), cc = e * e;
    zCam.position.set(a * camA.position.x + b * _tgt.x + cc * camS.position.x, a * camA.position.y + b * _tgt.y + cc * camS.position.y, a * camA.position.z + b * _tgt.z + cc * camS.position.z);
    zCam.quaternion.slerpQuaternions(camA.quaternion, camS.quaternion, smooth(0, 0.6, e));
  }
  const fov = lerp(62, SIDE_FOV, e); if (Math.abs(zCam.fov - fov) > 0.01) { zCam.fov = fov; zCam.updateProjectionMatrix(); }
  zScene.fog.color.copy(HORIZON).multiplyScalar(1 - 0.85 * e); zScene.fog.near = lerp(DRAW * 0.5, DRAW * 0.8, e);
  sky.position.copy(zCam.position);
  terrain.position.set(Math.round(zCam.position.x / TG) * TG, 0, Math.round(zCam.position.z / TG) * TG);

  shipShadow.visible = Z.alive && !inCave;
  if (inCave && T.alive) {
    // side view: the nose points along the thrust like the classic Thrust triangle, top of the ship faces the camera;
    // blended from the 3D attitude while the camera swings so the ship visibly pitches into it
    // side-on helicopter: nose toward its direction of travel (yaws round when it turns), disc tilted by T.ang
    T.yawF = lerp(T.yawF, -T.face * Math.PI / 2, 1 - Math.exp(-5 * dt));
    _q.setFromAxisAngle(_zAx, -T.ang); _q2.setFromAxisAngle(_yAx, T.yawF); _q.multiply(_q2);
    shipMesh.quaternion.slerpQuaternions(T.q0, _q, e); T.qLast.copy(_q); shipMesh.position.copy(P);
    shipMesh.scale.setScalar(lerp(1, 0.7, e));
  } else if (Z.alive) {
    shipMesh.quaternion.copy(H.q);
    if (e > 0) shipMesh.quaternion.slerp(T.qLast, e);   // still turning back from the side view after the climb out
    shipMesh.position.copy(P); shipMesh.scale.setScalar(lerp(1, 0.7, e));
    const gy = groundY(P.x, P.z), alt = P.y - gy;
    shipShadow.position.set(P.x, gy + 0.12, P.z); const sc = 1 + alt * 0.02; shipShadow.scale.set(sc, 1, sc); shadowMat.opacity = clamp(0.5 - alt * 0.006, 0.12, 0.5);
  }
  const inCockpit = cockpitCam && !inCave && e < 0.01 && Z.alive && G.state !== 'title';
  cockpit.group.visible = inCockpit; heliNose.visible = !inCockpit;
  const near = inCockpit ? 0.06 : 0.5; if (zCam.near !== near) { zCam.near = near; zCam.updateProjectionMatrix(); }
  if (inCockpit) cockpit.update(H, Z.ctl || {}, dt, G.fuel < 15 ? 'LOW FUEL' : (H.rpm < 0.85 && !H.landed ? 'LOW RPM' : (H.vrs > 0.4 ? 'VORTEX RING' : '')));
  reticle.visible = Z.alive && !inCave && G.state !== 'title'; aimLine.visible = reticle.visible && !inCockpit;
  if (reticle.visible) {
    reticle.position.copy(P).addScaledVector(Z.aim, 16); reticle.quaternion.copy(zCam.quaternion);
    const a = aimLine.geometry.attributes.position; a.setXYZ(0, P.x + Z.aim.x * 3, P.y + Z.aim.y * 3, P.z + Z.aim.z * 3); a.setXYZ(1, reticle.position.x, reticle.position.y, reticle.position.z); a.needsUpdate = true; aimLine.geometry.computeBoundingSphere();
  }
  zPartCloud.begin(); drawParts(zParts, zPartCloud); zPartCloud.end();
  zBulCloud.begin(); for (const b of zBullets) zBulCloud.add(b.p.x, b.p.y, b.p.z, b.own ? .4 : 1, b.own ? 1 : .5, b.own ? 1 : .2); zBulCloud.end();
  beam3.visible = rope.obj.visible = false;
  if (T.lvl) {
    const pod = T.pod, zo = inCave ? T.zOff / CS : 0;
    podMesh.position.set(pod.x, pod.y, 0); podMesh.visible = T.base.kind === 'enemy' && !T.base.st.podTaken;
    if (BASES[0].resTank) BASES[0].resTank.userData.bar.scale.y = Math.max(0.01, G.res / RES_MAX);
    beam3.visible = false;
    if (beam3.visible) { beam3.position.set(T.x - Math.sin(T.ang) * 3.6, T.y - Math.cos(T.ang) * 3.6, zo); beam3.rotation.z = -T.ang; }
    rope.obj.visible = inCave && pod.attached;
    if (rope.obj.visible) rope.set(T.x, T.y, zo, pod.x, pod.y, 0);
    for (const t of T.turrets) if (t.alive) t.mesh.userData.barrel.rotation.z = t.ang;
    tPartCloud.begin(); drawParts(T.parts, tPartCloud); tPartCloud.end();
    tBulCloud.begin();
    for (const b of T.bullets) tBulCloud.add(b.x, b.y, 0, .5, 1, 1);
    for (const b of T.tb) tBulCloud.add(b.x, b.y, 0, 1, .4, .2);
    tBulCloud.end();
  }
}

let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const now0 = performance.now();
  updateDynRes(now - last);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  fpsAcc += dt; fpsN++; if (fpsAcc > 1) { $('dbg').textContent = `${Math.round(fpsN / fpsAcc)} fps  ·  res ${Math.round(pixRatio * 100)}%`; fpsAcc = 0; fpsN = 0; }
  const inp = readInput();
  if (inp.start && !padWasStart) { sfx.init(); pressStart(); }
  padWasStart = inp.start;
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0 && G.state !== 'paused') say(''); }
  if (G.state === 'play') {
    if (G.mode === 'zarch') updateZarch(dt, inp); else updateThrust(dt, inp);
  } else if (G.state === 'trans') {
    const tr = G.tr; tr.t += dt; const D = 0.8;
    if (tr.phase === 0) { $('fade').style.opacity = Math.min(1, tr.t / D); if (tr.t >= D) { tr.swap(); tr.phase = 1; tr.t = 0; } }
    else { $('fade').style.opacity = Math.max(0, 1 - tr.t / D); if (tr.t >= D) { G.state = 'play'; $('fade').style.opacity = 0; $('fadeText').textContent = ''; } }
    stepParts(zParts, dt);
  } else if (G.state === 'title') { stepParts(zParts, dt); }
  const t1 = performance.now();
  updateCamsAndMeshes(dt, now / 1000);
  updateHud();
  const t2 = performance.now();
  renderer.render(zScene, zCam);
  const t3 = performance.now(), pk = 0.05;   // smoothed per-frame CPU cost: sim, scene/HUD prep, render submit
  PROF.sim += ((t1 - now0) - PROF.sim) * pk; PROF.prep += ((t2 - t1) - PROF.prep) * pk; PROF.render += ((t3 - t2) - PROF.render) * pk;
}
const PROF = { sim: 0, prep: 0, render: 0 };
buildCaves(); resetZarch(true);
requestAnimationFrame(frame);
if (params.has('debug')) { window.__G = { G, Z, T, H, HI, THREE, head, PROF, renderer, newGame, enemies, sectors, BASES, enterCave, respawnHome, exitCave, get camB() { return camB; } }; if (params.has('auto')) newGame(); if (params.has('thrust')) { newGame(); Z.pos.set(0, PAD_H - 1, 0); Z.vel.set(0, -4, 0); enterCave(BASES[+params.get('thrust') || 0]); } }
