import * as THREE from 'three';
import { buildLevel } from './level.js';
import { buildCaveMesh, makeTurret, makeTank, makePod, makeRope } from './cave3d.js';
import { Sfx } from './audio.js';
import { createDamage, PARTS } from './damage.js';
import { HELI, EYE, buildHeliMesh, buildCockpit, createHeliSim, createHeliInput, createHeliSystems, fuelBurnPct } from './heli.js';
import { BOUND, ISLANDS, islandH, createNav } from './world.js';
import { createWar, COST } from './war.js';
import { CARRIER } from './ships.js';
import { createFog, FOG_GLSL, fogPatch } from './fog.js';
import { createFx } from './fx.js';
import { createControls } from './hotas.js';
import { createJetPlay } from './jetplay.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const params = new URLSearchParams(location.search);
const sfx = new Sfx();

// ---------------------------------------------------------------- input
const keys = new Set();
// flight controls: HOTAS, rudder pedals and gamepads with per-device bindings (hotas.js); J in the jet opens the panel
const CTL = createControls({ say: (t, s) => say(t, s) });
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
  if (CTL.isOpen) return;   // the controls panel has the keyboard
  if (G.craft === 'jet' && G.state === 'play') {   // flying the HORNET: its own switches (see jetplay.js)
    if (e.code === 'KeyJ') { CTL.toggle(); return; }
    if (e.code === 'KeyY') { swapToHeli(); return; }
    if (JP.key(e.code)) return;
    if (['KeyH', 'KeyI', 'KeyO', 'KeyU', 'KeyL', 'KeyN'].includes(e.code)) return;
  }
  if (e.code === 'KeyY' && G.state === 'play') say('5: TAKE A JET (LANDED ON THE ALBATROSS)', 1.6);
  if (e.code === 'KeyH') doSwitch('sas');
  const sw = { KeyI: 'engine', KeyO: 'fire', KeyU: 'hyd', KeyL: 'radio', KeyN: 'light' }[e.code];
  if (sw) doSwitch(sw);
  if (e.code === 'KeyJ') HI.startCalibration();   // the controls panel: bind and calibrate HOTAS / pedals (hotas.js)
  if (e.code === 'KeyT') toggleFreeLook();
  if (e.code === 'KeyM') { bigMap = !bigMap; setMapSize(); if (bigMap && document.pointerLockElement) document.exitPointerLock(); }
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) command(+e.code.slice(5));
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
  const d = CTL.state && CTL.state.devices && CTL.state.devices.find(d => d.role === 'stick' || d.role === 'gamepad');
  if (d && pads[d.index] && pads[d.index].connected) return pads[d.index];
  let best = null;   // never the rudder pedals: with pedals plugged in they may come first
  for (const p of pads) if (p && p.connected && !/b679|rudder|pedal/i.test(p.id)) { best = p; if (p.axes.length >= 2) break; }
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
  const p = G.craft === 'jet' ? null : readPad();   // the jet reads its HOTAS through CTL
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
// cockpit switches: what the crosshair / cursor is over, and click to operate it
const switchRay = new THREE.Raycaster(), mouseNdc = new THREE.Vector2();
let switchHover = null;
let mouseAimT = -1e9;
addEventListener('mousemove', e => { mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouseAimT = performance.now(); });
function pickSwitch() {
  const ck = G.craft === 'jet' ? JP.cockpit : cockpit;
  if (!ck.group.visible) return null;
  switchRay.setFromCamera(document.pointerLockElement === canvas ? _ndc0 : mouseNdc, zCam);
  const hit = switchRay.intersectObjects(ck.hitBoxes, false)[0];
  return hit && hit.distance < 2.5 ? hit.object.userData.sw : null;
}
const _ndc0 = new THREE.Vector2(0, 0);
addEventListener('mousedown', e => {
  if (e.button !== 0 || G.state !== 'play') return;
  const id = pickSwitch(); if (!id) return;
  e.stopImmediatePropagation(); e.preventDefault(); if (G.craft === 'jet') JP.click(id); else doSwitch(id);
}, { capture: true });
// cockpit free look: click the view to capture the mouse (Esc releases it and the head re-centres; middle click centres)
const head = { yaw: 0, pitch: 0 };
let freeLook = true;   // T toggles: off releases the mouse and locks the view to the centre (the cursor then works the switches)
function toggleFreeLook() {
  freeLook = !freeLook;
  if (freeLook) { if (cockpitCam && G.state === 'play') canvas.requestPointerLock?.(); say('FREE LOOK ON  -  MOUSE TO LOOK', 1.4); }
  else { if (document.pointerLockElement) document.exitPointerLock(); say('FREE LOOK OFF  -  VIEW LOCKED TO CENTRE', 1.4); }
}
canvas.addEventListener('click', () => { if (cockpitCam && freeLook && G.state === 'play' && !document.pointerLockElement) canvas.requestPointerLock?.(); });
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas || !freeLook) return;
  head.yaw = clamp(head.yaw - e.movementX * 0.0025, -2.5, 2.5); head.pitch = clamp(head.pitch - e.movementY * 0.0025, -1.1, 0.8);
});
addEventListener('mousedown', e => { if (e.button === 1 && document.pointerLockElement === canvas) { head.yaw = head.pitch = 0; e.preventDefault(); } });
addEventListener('wheel', e => { if (G.craft === 'jet' && cockpitCam) JP.zoom = clamp(JP.zoom + (e.deltaY < 0 ? 0.25 : -0.25), 0, 1); }, { passive: true });
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
const ROCKETS_MAX = 16, BOMBS_MAX = 6;
const G = { craft: 'heli', jets: 2, jetDownT: 0, light: false, n2: 0, res: 250, mat: 90, rockets: ROCKETS_MAX, bombs: BOMBS_MAX, cargo: 0, state: 'title', mode: 'zarch', score: 0, hi: 0, lives: 3, fuel: 100, visit: 0, tr: null, msgT: 0, over: false };
try { G.hi = +(localStorage.getItem('tz_hi') || 0); } catch (e) {}
function addScore(n) { G.score += n; if (G.score > G.hi) { G.hi = G.score; try { localStorage.setItem('tz_hi', G.hi); } catch (e) {} } }
let war = null;   // the island war (created once the world exists)
function say(t, secs = 2) { const m = $('msg'); m.textContent = t; m.style.opacity = t ? 1 : 0; G.msgT = secs; }

// ================================================================ ZARCH
const PAD_R = 8.5, BASE_R = 18, GRAV = 9.0, THRUST = 21, MAXLEAN = 0.8;
// The world is an archipelago (world.js). Cave islands (home HQ, enemy fortresses, enemy HQ) each have a shaft down
// into their own Thrust cave, which lives underground in the plane z = base.z under the shaft. CS = world units per
// cave cell. Every island has a landing pad: beside the shaft on cave islands, in the middle of the others.
const CS = 1.6, CAVE_SINK = 0.15, CAVE_OX = 32.5, CAVE_DEPTH = 6, HOLE_R = 9, STRIP_X = 76, STRIP_Z = 9;
// tier = how well defended the cave is: 1 light (2 turrets) .. 4 heavy (5 turrets, faster fire); 0 = home
const TIER_NAMES = ['', 'LIGHT', 'MEDIUM', 'STRONG', 'HEAVY'];
const BASES = ISLANDS.filter(I => I.cave).sort((a, b) => a.tier - b.tier).map(I => I.base = { kind: I.owner === 1 ? 'home' : 'enemy', name: I.name, tier: I.tier, x: I.x, z: I.z, h: clamp(Math.round(islandH(I.x, I.z)), 4, 16), isl: I });
const HOME_B = BASES[0], PAD_H = HOME_B.h;
const PADS = ISLANDS.map(I => I.pad = I.cave ? { x: I.x, z: I.z + 30, h: I.base.h, r0: 12, r1: 34, r: PAD_R, isl: I } : { x: I.x, z: I.z, h: clamp(Math.round(islandH(I.x, I.z)), 3, 14), r0: 30, r1: 52, r: PAD_R, isl: I });
const PAD = HOME_B.isl.pad;   // the home refuel pad
const RES_MAX = 600;          // the fleet's fuel stores
const stripW = (x, z, b) => smooth(0, 14, Math.hypot(Math.max(Math.abs(x - b.x) - STRIP_X, 0), Math.max(Math.abs(z - b.z) - STRIP_Z, 0)));
const terrainH = (x, z) => {
  let h = islandH(x, z);
  for (const b of BASES) h = lerp(b.h, h, smooth(BASE_R, 60, Math.hypot(x - b.x, z - b.z)));   // flat apron round the shaft
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r1) h = lerp(p.h, h, smooth(p.r0, p.r1, d)); }   // flat pads
  for (const b of BASES) h = lerp(Math.max(h, b.h), h, stripW(x, z, b));                      // ground over the cave
  return h;
};
const holeOf = (x, z) => BASES.find(b => Math.hypot(x - b.x, z - b.z) < HOLE_R);
const inHole = (x, z) => !!holeOf(x, z);
const groundY = (x, z) => inHole(x, z) ? -1e4 : Math.max(terrainH(x, z), 0, war ? war.deckY(x, z) : -1e9);   // ship decks count as ground
const isWater = (x, z) => terrainH(x, z) <= 0;
const waterAt = (x, z) => isWater(x, z) && !(war && war.deckY(x, z) > -1e8);
const baseUniform = BASES.map(b => new THREE.Vector4(b.x, b.z, b.h, b.kind === 'enemy' ? 1 : 0));
const SIDE_COL = [new THREE.Color(0.8, 0.8, 0.74), new THREE.Color(0.2, 0.75, 1.0), new THREE.Color(0.95, 0.18, 0.1)];   // neutral, player, enemy
const padUniform = PADS.map(p => SIDE_COL[p.isl.owner].clone());

const zScene = new THREE.Scene();
const HORIZON = new THREE.Color(0xbfd9f2);
// One draw distance for everything (the retro look and the fps lever): terrain grid, fog, far clip and sky dome all
// end together, so nothing - trees, enemies, beacons - hangs in the sky past the edge of the ground.
const DRAW = 250;
// The jet sees further: view.draw grows with altitude while you fly it (fog, far clip, sky and terrain all follow it),
// and a coarse far-terrain ring fills in past the fine grid.
const view = { draw: DRAW };
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

// The terrain is a grid that follows the camera. Its heights come from a heightmap baked once at load with one texel
// per grid vertex (so the mesh matches terrainH exactly at every vertex), and a second small texture tells each pixel
// which pad / shaft apron (if any) it is near, so the shader only ever shades one of them.
const TG = 2.5, TN = Math.ceil(DRAW * 2.1 / TG), HM_N = Math.round(2 * BOUND / TG) + 1, DEC_C = 4, DEC_N = Math.ceil(2 * BOUND / DEC_C);
const hmTex = (() => {
  const a = new Float32Array(HM_N * HM_N);
  for (let j = 0; j < HM_N; j++) for (let i = 0; i < HM_N; i++) a[j * HM_N + i] = terrainH(-BOUND + i * TG, -BOUND + j * TG);
  const t = new THREE.DataTexture(a, HM_N, HM_N, THREE.RedFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const decorTex = (() => {   // r = nearest pad index + 1, g = nearest shaft index + 1 (0 = none near)
  const a = new Uint8Array(DEC_N * DEC_N * 4);
  for (let j = 0; j < DEC_N; j++) for (let i = 0; i < DEC_N; i++) {
    const x = -BOUND + (i + 0.5) * DEC_C, z = -BOUND + (j + 0.5) * DEC_C, k = (j * DEC_N + i) * 4;
    PADS.forEach((p, n) => { if (Math.hypot(x - p.x, z - p.z) < 33) a[k] = n + 1; });
    BASES.forEach((b, n) => { if (Math.hypot(x - b.x, z - b.z) < 25) a[k + 1] = n + 1; });
  }
  const t = new THREE.DataTexture(a, DEC_N, DEC_N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const fog = createFog(BOUND); fog.enabled = false; fog.update([]);
const terrainGeo = new THREE.PlaneGeometry(TG * TN, TG * TN, TN, TN); terrainGeo.rotateX(-Math.PI / 2);
const terrainUni = {
  uFog: { value: HORIZON }, uSun: { value: new THREE.Vector3(.5, 1, .3) }, uBases: { value: baseUniform }, uPadCol: { value: padUniform }, uTime: { value: 0 },
  uPadP: { value: PADS.map(p => new THREE.Vector4(p.x, p.z, p.isl.cave ? 1 : 0, 0)) }, uHM: { value: hmTex }, uDecor: { value: decorTex }, ...fog.uniforms,
  uFogN: { value: DRAW * 0.5 }, uFogF: { value: DRAW * 0.97 }, uNear: { value: new THREE.Vector3(0, 0, 0) },
};
const terrainVS = `
    varying vec3 vW; varying float vRaw; uniform sampler2D uHM;
    void main(){
      vec4 w=modelMatrix*vec4(position,1.);
      float h=texture2D(uHM,((w.xz+${BOUND.toFixed(1)})/${TG.toFixed(1)}+.5)/${HM_N.toFixed(1)}).r;
      vRaw=h; w.y=max(h,0.); vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w;
    }`;
const terrainFS = `
    varying vec3 vW; varying float vRaw; uniform vec3 uFog; uniform vec3 uSun; uniform vec4 uBases[${BASES.length}]; uniform vec3 uPadCol[${PADS.length}]; uniform vec4 uPadP[${PADS.length}];
    uniform float uTime; uniform sampler2D uDecor, uFogT; uniform float uFogB, uFogN, uFogF; uniform vec3 uNear;
    ${FOG_GLSL}
    void main(){
      #ifdef FAR
      if(max(abs(vW.x-uNear.x),abs(vW.z-uNear.y))<uNear.z) discard;   // the fine grid covers this
      #endif
      vec2 dc=texture2D(uDecor,(vW.xz+${BOUND.toFixed(1)})/${(2 * BOUND).toFixed(1)}).rg*255.;
      int pi=int(dc.r+.5)-1, bi=int(dc.g+.5)-1;
      if(bi>=0 && length(vW.xz-uBases[bi].xy)<${HOLE_R.toFixed(1)}) discard;   // the shaft
      vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
      float l=max(dot(n,normalize(uSun)),0.)*.75+.4;
      vec2 g=floor(vW.xz/6.); float chk=mod(g.x+g.y,2.);
      vec3 land=mix(vec3(.17,.5,.15),vec3(.25,.6,.19),chk);
      vec3 rock=mix(vec3(.45,.37,.27),vec3(.52,.43,.32),chk);
      vec3 c=mix(land,rock,smoothstep(24.,38.,vW.y));
      c=mix(vec3(.78,.72,.45),c,smoothstep(0.,3.,vW.y));
      c*=l;
      if(vRaw<=0.){   // sea: shallows to deep water, rolling glints, surf on the beaches
        float d=-vRaw, t=uTime; vec2 p=vW.xz;
        float a1=p.x*.19+t*1.3+sin(p.y*.05), a2=p.y*.23-t*1.1+sin(p.x*.07), a3=(p.x+p.y)*.11+t*.7;
        vec3 wn=normalize(vec3(cos(a1)*.12+cos(a3)*.07, 1., cos(a2)*.14+cos(a3)*.07));
        vec3 wc=mix(vec3(.09,.45,.55),vec3(.02,.13,.36),smoothstep(0.,9.,d));
        vec3 V=normalize(cameraPosition-vW), L=normalize(uSun);
        float fr=1.-max(dot(V,wn),0.); fr*=fr; fr*=fr;
        wc=mix(wc,vec3(.62,.76,.9),fr*.55);
        float sp=max(dot(reflect(-L,wn),V),0.); sp*=sp; sp*=sp; sp*=sp; sp*=sp; sp*=sp; sp*=sp;   // ~^64
        wc+=vec3(1.,.95,.8)*sp*1.3;
        float foam=(1.-smoothstep(0.,1.4,d))*(.55+.45*sin(d*8.-t*2.4+sin(a1)));
        c=mix(wc*(.92+.05*(sin(a1)+sin(a2))),vec3(.88,.94,1.),clamp(foam,0.,1.)*.75);
      }
      if(bi>=0){ vec4 b=uBases[bi]; float d=length(vW.xz-b.xy);
        if(d<${BASE_R.toFixed(1)}){ vec3 pc=mix(vec3(.5,.52,.58),vec3(.36,.3,.3),b.w)*l;
          if(d<${(HOLE_R + 2.2).toFixed(1)}){ float a=atan(vW.z-b.y,vW.x-b.x); pc=mix(vec3(.12,.12,.14),mix(vec3(.2,.75,1.),vec3(.85,.15,.1),b.w),step(.5,fract(a*3.82)))*l; }   // hazard ring round the shaft mouth
          c=pc; } }
      if(pi>=0){ vec4 q=uPadP[pi]; float d=length(vW.xz-q.xy);
        if(q.z<.5 && d<26.){ vec2 tl=abs(fract(vW.xz/4.)-.5); c=mix(vec3(.4,.41,.43),vec3(.33,.34,.36),step(.46,max(tl.x,tl.y)))*l; }   // concrete apron
        if(d<${(PAD_R + 2.5).toFixed(1)}){ vec3 pc=vec3(.5,.52,.58)*l; if(d<${PAD_R.toFixed(1)}){float r=d/${PAD_R.toFixed(1)}; pc=mix(vec3(.15,.16,.2),uPadCol[pi],step(.5,fract(r*4.)))*l;} c=pc; } }
      c=fogOfWar(c,vW.xz,uTime);
      float fd=length((viewMatrix*vec4(vW,1.)).xyz);
      gl_FragColor=vec4(mix(c,uFog,smoothstep(uFogN,uFogF,fd)),1.);
    }`;
const terrain = new THREE.Mesh(terrainGeo, new THREE.ShaderMaterial({ uniforms: terrainUni, vertexShader: terrainVS, fragmentShader: terrainFS }));
terrain.frustumCulled = false; zScene.add(terrain);
const FAR_C = 16, FAR_N = 190;   // far ring: 12 m cells out to ~1.5 km, only drawn while the view reaches past the fine grid
const farTerrain = new THREE.Mesh(new THREE.PlaneGeometry(FAR_C * FAR_N, FAR_C * FAR_N, FAR_N, FAR_N).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: terrainUni, vertexShader: terrainVS, fragmentShader: terrainFS, defines: { FAR: 1 } }));
farTerrain.frustumCulled = false; farTerrain.visible = false; zScene.add(farTerrain);
const _nrm = new THREE.Vector3();
const normalAt = (x, z) => { const e = 1.5; return isWater(x, z) ? new THREE.Vector3(0, 1, 0) : _nrm.set(terrainH(x - e, z) - terrainH(x + e, z), 2 * e, terrainH(x, z - e) - terrainH(x, z + e)).normalize().clone(); };
const fx = createFx(zScene, { groundY: (x, z) => Math.max(terrainH(x, z), 0), isWater, normalAt });

// trees
{
  let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const geo = new THREE.ConeGeometry(1.3, 5, 6); geo.translate(0, 2.5, 0);
  const mesh = new THREE.InstancedMesh(geo, fogPatch(new THREE.MeshLambertMaterial({ color: 0x1f7a2a, flatShading: true }), fog, terrainUni.uTime), 3200);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); let n = 0;
  for (let i = 0; i < 60000 && n < 3200; i++) {
    const x = (r() * 2 - 1) * BOUND, z = (r() * 2 - 1) * BOUND, h = terrainH(x, z);
    if (h < 2.5 || h > 24 || PADS.some(p => Math.hypot(x - p.x, z - p.z) < (p.isl.cave ? 16 : 34)) || BASES.some(b => Math.hypot(x - b.x, z - b.z) < 30 || stripW(x, z, b) < 1)) continue;
    const k = 0.7 + r() * 1.1; sc.set(k, k * (0.8 + r() * 0.6), k);
    m.compose(new THREE.Vector3(x, h, z), q, sc); mesh.setMatrixAt(n++, m);
  }
  mesh.count = n; zScene.add(mesh);
}
// base
const baseGroup = new THREE.Group(); baseGroup.position.set(HOME_B.x, PAD_H, HOME_B.z); zScene.add(baseGroup);
{
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 45; baseGroup.add(beam); BASES[0].beam = beam;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.7, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffee66 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(PAD.x - HOME_B.x, 0.25, PAD.z - HOME_B.z); baseGroup.add(ring); baseGroup.userData.ring = ring;
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
  const ring = new THREE.Mesh(new THREE.TorusGeometry(HOLE_R + 2.3, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff3020 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.25; g.add(ring); b.ring = ring;
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
const heliModel = buildHeliMesh(), shipMesh = heliModel.group, cockpit = buildCockpit(), heliShell = heliModel.shell;
shipMesh.add(cockpit.group);
zScene.add(shipMesh);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const shipShadow = new THREE.Mesh(new THREE.CircleGeometry(3.4, 20).rotateX(-Math.PI / 2), shadowMat); zScene.add(shipShadow);

// bomb sight: where a bomb dropped now would land
const bombSight = (() => {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, depthTest: false });
  g.add(new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28).rotateX(-Math.PI / 2), m));
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.5).rotateX(-Math.PI / 2), m); const a = i * Math.PI / 2; t.position.set(Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25); t.rotation.y = -a; g.add(t); }
  for (const c of g.children) c.renderOrder = 11;
  g.visible = false; zScene.add(g); return g;
})();
const _bs = new THREE.Vector3(), _bv = new THREE.Vector3();
function updateBombSight(hide) {
  bombSight.visible = false;
  if (hide || !Z.alive || G.state !== 'play' || G.bombs <= 0 || H.landed || H.agl < 6) return;
  _bs.copy(H.pos); _bs.y -= 1.7; _bv.copy(H.vel);
  for (let i = 0; i < 200; i++) { _bv.y -= 9 * 0.04; _bs.addScaledVector(_bv, 0.04); const gy = groundY(_bs.x, _bs.z); if (_bs.y <= gy) { _bs.y = gy + 0.3; bombSight.visible = true; break; } }
  if (bombSight.visible) { bombSight.position.copy(_bs); bombSight.scale.setScalar(clamp(_bs.distanceTo(zCam.position) * 0.04, 1.5, 9)); }
}
const reticle = new THREE.Group();
{
  const m = new THREE.MeshBasicMaterial({ color: 0xff5a70, transparent: true, opacity: 0.95, depthTest: false });
  // built in screen pixels and scaled by distance every frame, so it stays a crisp, fixed-size mark at any range
  const dot = new THREE.Mesh(new THREE.CircleGeometry(2, 10), m); dot.renderOrder = 10; reticle.add(dot);
  for (let i = 0; i < 4; i++) {   // hairlines with a gap round the dot
    const l = new THREE.Mesh(new THREE.PlaneGeometry(2, 8), m); const a = i * Math.PI / 2;
    l.position.set(Math.sin(a) * 9, Math.cos(a) * 9, 0); l.rotation.z = -a; l.renderOrder = 10; reticle.add(l);
  }
  reticle.renderOrder = 10; zScene.add(reticle);
}
const aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xff5a70, transparent: true, opacity: 0.28, depthTest: false }));
aimLine.renderOrder = 10; zScene.add(aimLine);
const D = createDamage();
const H = createHeliSim(), _aimR = new THREE.Vector3();   // the UH-1H (hueyfm.js via heli.js)
const HI = createHeliInput({ keyDown: kd, CTL, hwOn: () => !keyboardOnly, say: (t, s) => say(t, s) });
const SY = createHeliSystems({ D, G, say: (t, s) => say(t, s) });   // electrics, engine start, governor, cautions
const Z = {
  pos: new THREE.Vector3(PAD.x, PAD_H + 0.9, PAD.z), vel: new THREE.Vector3(), lean: new THREE.Vector2(), facing: new THREE.Vector2(0, -1),
  aim: new THREE.Vector3(0, 0, -1), aimOff: new THREE.Vector2(), hd: 0, sector: -1, round: 0, throttle: 0, landed: true, alive: true, deadT: 0, fireCd: 0, wave: 0, waveT: 2,
};
// ---------------------------------------------------------------- the island war (war.js)
const nav = createNav(terrainH);
const seaSpot = (x, z) => { const [wx, wz] = nav.nearestWater(x, z); return [wx, wz, Math.atan2(wx, wz)]; };   // facing the map centre
const PSTORE = { get fuel() { return G.res; }, set fuel(v) { G.res = v; }, get mat() { return G.mat; }, set mat(v) { G.mat = v; }, get fuelMax() { return RES_MAX; } };
const PL = {
  pos: Z.pos, vel: Z.vel, get alive() { return G.craft === 'jet' ? JP.alive && !JP.ejected : G.mode === 'zarch' ? Z.alive : T.alive; },
  get landed() { return G.craft === 'heli' && G.mode === 'zarch' && Z.alive && H.landed; }, get inCave() { return G.mode !== 'zarch'; },
  get hitR() { return G.craft === 'jet' ? 4.5 : HELI.HIT_R; }, get sight() { return G.craft === 'jet' ? 220 : 0; },
  get sources() {   // the jet's radar: a wide patch of sight ahead of the nose
    if (G.craft !== 'jet' || !JP.alive) return null; const f = JP.J.forward(_rk); const l = Math.hypot(f.x, f.z) || 1;
    return [{ x: Z.pos.x + f.x / l * 420, z: Z.pos.z + f.z / l * 420, r: 320 }];
  },
};
const feedItems = [];
function feed(t, kind = 'info') { feedItems.unshift({ t, kind, at: performance.now() }); feedItems.length = Math.min(feedItems.length, 6); }
function islandOwnerChanged(I, was) {
  padUniform[PADS.indexOf(I.pad)].copy(SIDE_COL[I.owner]);
  const b = I.base; if (!b) return;
  baseUniform[BASES.indexOf(b)].w = I.owner === 2 ? 1 : 0;
  if (b.beam) b.beam.material.color.setHex(I.owner === 1 ? 0x66ddff : 0xff4030);
  if (b.ring) b.ring.material.color.setHex(I.owner === 1 ? 0x33bbff : 0xff3020);
  if (!b.st || b.kind !== 'enemy') return;
  if (I.owner === 1) { for (const t of b.st.turrets) { t.alive = false; t.mesh.visible = false; } b.st.podTaken = true; }   // the garrison has surrendered
  else if (I.owner === 2 && was === 1) restockBase(b);
}
function warOver(result, why) {
  if (G.over) return; G.over = true; say(result === 'win' ? `VICTORY  -  ${why}` : `DEFEAT  -  ${why}`, 6);
  setTimeout(() => showEnd(result === 'win' ? 'VICTORY' : 'DEFEAT', why), 5000);
}
function showEnd(title, why) {
  G.state = 'title'; G.mode = 'zarch'; $('title').style.display = 'flex'; $('title').querySelector('h1').textContent = title;
  $('result').textContent = `${why}  -  SCORE ${G.score}`; if (document.pointerLockElement) document.exitPointerLock();
}
war = createWar({
  scene: zScene, fx, sfx, terrainH, isWater, nav, ISLANDS, BASES, G: PSTORE, feed, addScore, ear: zCam.position,
  carrierStart: seaSpot(-300, 280), enemyStart: seaSpot(300, -280),
  player: () => PL, hurtPlayer: (a, why) => hurtHeli(a, why), onOwner: islandOwnerChanged, onEnd: warOver,
});
// ---------------------------------------------------------------- the HORNET (jetplay.js)
const jetGroundY = (x, z) => Math.max(terrainH(x, z), 0, war.deckY(x, z));   // no shaft holes for a jet: the apron is solid
const JP = createJetPlay({
  scene: zScene, war, fx, sfx, say, feed, CTL, GRAV, CARRIER, BOUND, keyDown: kd, groundY: jetGroundY, waterAt, addScore,
  takeFuel: u => { const t = Math.max(0, Math.min(u, G.res)); G.res -= t; return t; },
  onCarrier: (x, z) => { const u = war.shipAt(x, z); return !!u && u === war.carrier && u.sinking === undefined; },
  onLost: (why, ejected) => jetLost(why, ejected), onEject: () => {}, toggleView: () => { cockpitCam = !cockpitCam; if (!cockpitCam) JP.snapChase(); },
  selectedIsland: () => selIsl, drawMap: (c, k) => drawJetMap(c, k), catClear: () => { const c = war.carrier; return !!c && laneClear(c, c.yaw) > 320; },
});
// open water ahead of the carrier's bow along heading yaw: how far (m) before land comes up
function laneClear(c, yaw, max = 700) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), bx = c.p.x - Math.sin(c.yaw) * 66, bz = c.p.z - Math.cos(c.yaw) * 66;
  for (let d = 0; d <= max; d += 15) if (terrainH(bx + fx * d, bz + fz * d) > -1 || Math.abs(bx + fx * d) > BOUND || Math.abs(bz + fz * d) > BOUND) return d;
  return max + 1;
}
// before a launch the ALBATROSS steams onto the nearest heading with a clear run ahead (as carriers turn into the wind)
function turnIntoClear() {
  const c = war.carrier; if (!c || laneClear(c, c.yaw) > 320) return false;
  let best = null;
  for (let k = 1; k <= 24 && !best; k++) for (const s of [1, -1]) { const y = c.yaw + s * k * Math.PI / 12; if (laneClear(c, y) > 600) { best = y; break; } }
  if (best === null) return false;
  war.orderCarrier(c.p.x - Math.sin(best) * 500, c.p.z - Math.cos(best) * 500); feed('ALBATROSS: TURNING INTO CLEAR WATER FOR THE LAUNCH'); return true;
}
// 5 on the ALBATROSS deck: climb into a Hornet on the catapult (or back to the cat if you are already in one)
function launchJet() {
  if (G.mode !== 'zarch') { say('CLIMB OUT OF THE CAVE FIRST', 1.6); return; }
  const c = war.carrier; if (!c || c.sinking !== undefined) { say('NO CARRIER  -  NO JETS', 1.6); return; }
  if (G.craft === 'jet') { if (JP.stoppedOnDeck() || JP.J.cat) { JP.respot(); turnIntoClear(); } else say('TRAP ON THE ALBATROSS FIRST: GEAR, FLAPS FULL, HOOK DOWN', 2); return; }
  const svc = Z.alive && H.landed ? serviceAt(Z.pos.x, Z.pos.z) : null;
  if (!svc || !svc.deck) { say('LAND ON THE ALBATROSS TO TAKE A JET', 1.8); return; }
  if (G.jets <= 0) { if (G.mat < COST.jet) { say(`NO HORNETS LEFT  -  A NEW ONE COSTS ${COST.jet} MATERIEL`, 2); return; } G.mat -= COST.jet; G.jets++; feed('NEW HORNET DELIVERED TO THE ALBATROSS', 'good'); }
  G.jets--; G.craft = 'jet'; shipMesh.visible = false; shipShadow.visible = false; sfx.engine(0); cancelRescue();
  if (!JP.launch()) { G.craft = 'heli'; G.jets++; shipMesh.visible = true; return; }
  JP.snapChase(); head.yaw = head.pitch = 0; turnIntoClear();
}
// Y on the deck: stow the Hornet, back into the helicopter
function swapToHeli() {
  if (!JP.stoppedOnDeck() && !(JP.J.cat && JP.J.cat.state === 'hold')) { say('STOP ON THE ALBATROSS DECK FIRST', 1.6); return; }
  G.jets++; JP.stow(); G.craft = 'heli'; resetZarch(true); say('HORNET STOWED  -  HELICOPTER ON DECK', 2);
}
// the jet is gone: ejected (pilot rescued) or crashed (pilot lost: that costs a life too)
function jetLost(why, ejected) {
  G.jetDownT = ejected ? 0.5 : 3; feed(ejected ? 'HORNET LOST  -  PILOT RECOVERED' : 'HORNET AND PILOT LOST', 'bad');
  if (ejected) say(why, 2.5);
  else { G.lives--; if (G.lives < 0) gameOver(); }
}
function updateJet(dt, inp) {
  JP.update(dt, inp);
  const J = JP.J, E = JP.ejected;
  Z.pos.copy(E ? E.pos : J.pos); Z.vel.copy(E ? E.vel : J.vel); Z.landed = J.onGround;
  const fw = J.forward(_rk), fl = Math.hypot(fw.x, fw.z); if (fl > 0.15) Z.facing.set(fw.x / fl, fw.z / fl);
  if (JP.alive && !E) advise(dt);
  if (G.jetDownT > 0) {
    G.jetDownT -= dt;
    if (G.jetDownT <= 0 && !G.over) { JP.stow(); G.craft = 'heli'; G.fuel = 100; G.cargo = 0; D.reset(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; resetZarch(true); say(war.carrier && war.carrier.sinking === undefined ? 'HELICOPTER ON THE ALBATROSS' : 'HELICOPTER ON THE HOME PAD', 2); }
  }
}
// the AMPCD moving map (drawn in world metres; k = pixels per metre)
function drawJetMap(c, k) {
  c.imageSmoothingEnabled = true; c.drawImage(landImg, -BOUND, -BOUND, 2 * BOUND, 2 * BOUND); c.drawImage(fogImg, -BOUND, -BOUND, 2 * BOUND, 2 * BOUND);
  c.lineWidth = 2 / k;
  for (const I of ISLANDS) { if (!fog.exploredAt(I.pad.x, I.pad.z)) continue; c.strokeStyle = I.seen < 0 ? '#999' : OWN_COL[I.seen]; c.beginPath(); if (I.cave) c.rect(I.pad.x - 14, I.pad.z - 14, 28, 28); else c.arc(I.pad.x, I.pad.z, 14, 0, 6.283); c.stroke(); if (I === selIsl) { c.strokeStyle = '#ff8'; c.beginPath(); c.arc(I.pad.x, I.pad.z, 26, 0, 6.283); c.stroke(); } }
  for (const u of war.units) {
    if (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z)) continue; c.fillStyle = u.side === 1 ? '#6ef' : '#f64';
    if (u.dims) { c.save(); c.translate(u.p.x, u.p.z); c.rotate(-u.yaw); c.fillRect(-u.dims.W / 2, -u.dims.L / 2, u.dims.W, u.dims.L); c.restore(); } else c.fillRect(u.p.x - 6, u.p.z - 6, 12, 12);
  }
}
// commands (any time; the big map shows what is selected): 1 capture drone, 2 AA gun, 3 helicopter
let selIsl = null;
function command(n) {
  if (G.state !== 'play') return;
  if (n === 5) { launchJet(); return; }
  if (n === 4) { say(war.sendEscort(), 2); return; }
  if (n === 3) { if (G.mat < COST.heli) say('NOT ENOUGH MATERIEL FOR A HELICOPTER', 1.6); else { G.mat -= COST.heli; G.lives++; say('NEW HELICOPTER IN THE HANGAR', 1.6); sfx.dock(); } return; }
  if (!selIsl) { say('SELECT AN ISLAND ON THE MAP FIRST (M)', 1.8); return; }
  say(n === 1 ? war.sendDrone(selIsl) : war.orderAA(selIsl), 2);
}
// where a fresh helicopter starts: the carrier deck while it is afloat, else the home pad
function spawnSpot() {
  const c = war && war.carrier;
  if (c && c.sinking === undefined && !params.has('homepad')) { const lx = -3, lz = 26, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw); return { x: c.p.x + lx * cs + lz * sn, z: c.p.z - lx * sn + lz * cs, y: CARRIER.DECK, yaw: c.yaw }; }
  return { x: PAD.x, z: PAD.z, y: PAD_H, yaw: 0 };
}
function resetZarch(fromPad) {
  const sp = spawnSpot();
  // on the deck / pad: hot at flight idle, the throttle rolls on by itself (?cold: cold and dark, start it yourself)
  const cold = fromPad && params.has('cold');
  H.reset(new THREE.Vector3(sp.x, sp.y - HELI.SKID_Y, sp.z), sp.yaw, fromPad, cold ? -1 : fromPad ? 0 : 1); HI.setCollective(0); SY.reset(cold);
  if (!fromPad) SY.grip = 1, SY.auto = null;
  Z.pos.copy(H.pos); Z.vel.set(0, 0, 0); Z.lean.set(0, 0); Z.landed = fromPad;
  Z.alive = true; shipMesh.visible = true; shipShadow.visible = true;
}
// Emergency landing: set down safely anywhere with an empty tank and a logistics team flies out a fuel drop.
// It takes a while and only brings half a tank - enough for a last-chance run home. A parachute crate drops beside you
// on the surface for the last few seconds. Crashing (or getting shot) while waiting cancels it.
const RESCUE_TIME = 25, RESCUE_FUEL = 50;
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
    else if (landed && D.critical() && G.state === 'play' && !G.rescueHinted) { G.rescueHinted = true; say('DAMAGED  -  PRESS L TO CALL LOGISTICS FOR A FIELD REPAIR', 3); }
    if (!landed) G.rescueHinted = false;
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
    G.fuel = Math.max(G.fuel, RESCUE_FUEL); const fixed = D.damaged(); D.fieldRepair(); G.rescue = null; sfx.refuel?.(); sfx.pickup();
    say(`${fixed ? 'FIELD REPAIR DONE  -  ' : ''}FUEL DROP ${RESCUE_FUEL}%  -  MAKE IT BACK TO BASE`, 3.5);
    setTimeout(() => { crate.visible = false; }, 8000);
  }
}
function doSwitch(id) {
  if (typeof cockpit !== 'undefined') cockpit.press(id);
  sfx.ui?.('select');
  if (id === 'engine') toggleEngine();
  else if (id === 'hyd') { D.hydBoost = !D.hydBoost; say(D.hydBoost ? 'HYDRAULIC BOOST ON' : 'HYDRAULIC BOOST OFF', 1.4); }
  else if (id === 'sas') HI.toggleSas();
  else if (id === 'light') { G.light = !G.light; say(G.light ? 'LANDING LIGHT ON' : 'LANDING LIGHT OFF', 1.2); }
  else if (id === 'radio') callLogistics();
  else if (id === 'fire') { const r = D.extinguish(); say(r === 'FIRE OUT' ? 'FIRE EXTINGUISHED' : r, 1.6); if (r === 'FIRE OUT') sfx.refuel?.(); }
  else if (['bat', 'gen', 'inv', 'gov', 'trim', 'lowrpm', 'starter', 'mc'].includes(id)) {   // Huey systems (heli.js)
    const on = SY.toggle(id), name = { bat: 'BATTERY', gen: 'MAIN GENERATOR', inv: 'INVERTER', gov: 'GOVERNOR', trim: 'FORCE TRIM', lowrpm: 'LOW RPM AUDIO', starter: 'STARTER' }[id];
    if (name) say(id === 'gov' ? `GOVERNOR ${on}${on === 'EMER' ? '  -  MANAGE THE RPM WITH THE THROTTLE (PGUP / PGDN)' : ''}` : id === 'starter' ? (on ? 'STARTER ENGAGED  -  RELEASES AT 40% N1' : 'STARTER RELEASED') : `${name} ${on ? 'ON' : 'OFF'}`, 1.6);
  }
}
// I: cut the fuel (autorotate) / with the engine stopped, the whole start sequence on one key (battery, starter to 40% N1,
// light-off, idle, throttle open: ~10 s). The cockpit switches and Home / PgUp / PgDn do it by hand.
function toggleEngine() {
  if (D.engineSwitch && (H.run || SY.auto)) { D.engineSwitch = false; SY.cut(); say('MAIN FUEL OFF  -  ENGINE CUT  -  AUTOROTATE', 1.8); return; }
  if (D.hp.engine <= 0.05) { D.engineSwitch = !D.engineSwitch; say('ENGINE WILL NOT START', 1.6); return; }
  if (H.run) { D.engineSwitch = true; say('MAIN FUEL ON', 1.2); return; }
  SY.quickStart(); say('ENGINE START  -  STARTER ENGAGED', 1.8);
}
// enemy fire / rams: break a part instead of killing outright
function hurtHeli(amount, why, part) {
  if (G.bench) return;
  if (G.craft === 'jet') { JP.hurt(amount, why); return; }
  const p = D.hit(amount, part), name = PARTS.find(q => q.id === p).name;
  sfx.hit?.() ?? sfx.boom(0.3);
  const m = D.mods();
  const msg = p === 'tail' && m.tail === 0 ? 'TAIL ROTOR SHOT AWAY  -  CUT THE ENGINE OR FLY FAST' : p === 'engine' && D.fire ? 'ENGINE FIRE  -  PRESS O TO EXTINGUISH' :
    p === 'rotor' && m.lift === 0 ? 'MAIN ROTOR DESTROYED' : p === 'fuel' && D.hp.fuel < 0.75 ? 'FUEL TANK HIT  -  LEAKING' : `${why}  -  ${name} HIT`;
  say(msg, 2);
}
function callLogistics() {
  const landed = G.mode === 'zarch' ? H.landed : T.landed, alive = G.mode === 'zarch' ? Z.alive : T.alive;
  if (G.rescue) { say(`LOGISTICS ALREADY INBOUND  -  ${Math.ceil(G.rescue.t)}s`, 1.5); return; }
  if (!alive || !landed) { say('LAND FIRST TO CALL LOGISTICS', 1.5); return; }
  if (!D.damaged() && G.fuel >= RESCUE_FUEL) { say('NOTHING TO FIX  -  TANKS ABOVE HALF', 1.5); return; }
  G.rescue = { t: RESCUE_TIME, cave: G.mode !== 'zarch' }; say('LOGISTICS TEAM DISPATCHED  -  FUEL AND FIELD REPAIR', 2.5); sfx.dock();
}
function cancelRescue() { if (G.rescue) { G.rescue = null; crate.visible = false; } }

function killPlayerZ(why) {
  cancelRescue();
  if (!Z.alive) return;
  Z.alive = false; Z.deadT = 2.4; shipMesh.visible = false; shipShadow.visible = false;
  fx.explode(Z.pos.x, Z.pos.y, Z.pos.z, 2.4, { fire: 45, debris: 16, color: 0x55613d, oil: true }); sfx.boom(1.2); sfx.engine(0);
  say(why, 2);
  G.lives--; if (G.lives < 0) gameOver();
}

// refuel / repair / rearm / unload cargo: on any friendly pad or our carrier's deck
function serviceAt(x, z) {
  const u = war.shipAt(x, z); if (u && u === war.carrier && u.sinking === undefined) return { name: 'ALBATROSS', deck: true };
  for (const p of PADS) if (p.isl.owner === 1 && Math.hypot(x - p.x, z - p.z) < p.r + 1) return { name: p.isl.name, pad: p };
  return null;
}
function service(svc, dt) {
  const fill = Math.min(G.res, 20 * dt, 100 - G.fuel); G.res -= fill; G.fuel += fill;
  if (G.cargo > 0) { const u = Math.min(G.cargo, 30 * dt, RES_MAX - G.res); G.cargo -= u; G.res += u; Z.unloaded = (Z.unloaded || 0) + u; if (G.cargo <= 0.01 && Z.unloaded > 0) { say(`FUEL UNLOADED  -  STORES ${Math.round(G.res)}`, 2); addScore(Math.round(Z.unloaded * 5)); Z.unloaded = 0; } }
  if (D.damaged()) { D.repair(0.25 * dt); if (!D.damaged()) say('REPAIRS COMPLETE', 1.5); }
  Z.rearmT = (Z.rearmT || 0) - dt;
  const arming = G.rockets < ROCKETS_MAX || G.bombs < BOMBS_MAX;
  if (arming && Z.rearmT <= 0) { Z.rearmT = 0.35; if (G.rockets < ROCKETS_MAX) G.rockets = Math.min(ROCKETS_MAX, G.rockets + 2); else G.bombs++; sfx.blip?.(700, 900, 0.05, 'square', 0.05); }
  if (fill > 0 || arming) Z.refuelling = true; else if (Z.refuelling) { Z.refuelling = false; say(G.res < 1 ? 'FUEL STORES EMPTY  -  TAKE FUEL ISLANDS OR LOOT ENEMY CAVES' : `${svc.name}  -  FUELLED AND ARMED`, 1.6); }
}
const _rk = new THREE.Vector3();
// the advisor: every so often, the next thing worth doing
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const bearing = (dx, dz) => COMPASS[Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8];
function advise(dt) {
  G.advT = (G.advT ?? 12) - dt; if (G.advT > 0) return; G.advT = 45;
  const P = Z.pos, b = war.battleship;
  if (b && b.sinking === undefined) { feed(`ADVISOR: THE BATTLESHIP IS ${Math.round(Math.hypot(b.p.x - P.x, b.p.z - P.z))}m ${bearing(b.p.x - P.x, b.p.z - P.z)}  -  BOMB IT (B) BEFORE IT REACHES THE ALBATROSS`, 'bad'); return; }
  if (war.E.bship > 55) { feed(`ADVISOR: ENEMY BATTLESHIP ${Math.floor(war.E.bship)}% BUILT  -  BOMB THEIR FACTORIES AND THE IRONHOLD SHIPYARD`, 'bad'); return; }
  let best = null, bd = 1e9;
  for (const I of ISLANDS) if (I.owner !== 1 && !I.cave) { const d = Math.hypot(I.pad.x - P.x, I.pad.z - P.z) * (I.owner === 0 ? 1 : 1.6); if (d < bd) { bd = d; best = I; } }
  if (best) {
    const d = Math.round(Math.hypot(best.pad.x - P.x, best.pad.z - P.z)), dir = bearing(best.pad.x - P.x, best.pad.z - P.z);
    feed(best.owner === 0 ? `ADVISOR: ${best.name} (${KIND_NAME[best.kind]}) IS UNCLAIMED, ${d}m ${dir}  -  LAND ON ITS PAD OR SEND A DRONE (M, 1)` : `ADVISOR: ${best.name} IS ENEMY-HELD, ${d}m ${dir}  -  SILENCE ITS GUNS, THEN LAND ON IT`);
    return;
  }
  const f = ISLANDS.find(I => I.cave && I.owner === 2); if (f) feed(`ADVISOR: STEAL THE POD FROM THE CAVE UNDER ${f.name} TO TAKE IT`);
}
// ---------------------------------------------------------------- the Huey's moving parts, panel and sound (heli.js)
const _hl = { nr: 0, tx: 0, ty: 0, cone: 0.05, coll: 0, ped: 0, rockets: 0, light: false, aim: new THREE.Vector3(), firing: false, tailLost: false, rotorHp: 1, run: false, n1: 0 };
function heliLook() {   // what the exterior model animates
  return Object.assign(_hl, { nr: H.rpm, tx: H.tx, ty: H.ty, cone: 0.03 + 0.03 * Math.min(1.5, H.thrust / (H.mass * 9.81)), coll: H.c.coll, ped: H.c.ped, rockets: G.rockets, light: G.light,
    firing: Z.fireCd > 0.06, tailLost: D.hp.tail <= 0, rotorHp: D.hp.rotor, run: H.run, n1: H.n1 }), _hl.aim.copy(Z.aim), _hl;
}
const _hp = { sw: {}, ctl: {} };
function heliPanel(hover) {   // everything the cockpit shows (hueycockpit.js)
  const a = H.attitude(), m = D.mods();
  return Object.assign(_hp, {
    ias: H.ias, alt: H.pos.y * 3.28084, vsi: H.vel.y * 196.85, pitch: a.pitch, roll: -a.roll, hdg: H.heading(), slip: H.slip, turn: -H.w.y, agl: H.agl, landed: H.landed,
    nr: H.rpm, n2: H.n2, n1: H.n1, torque: H.torque, egt: H.egt, engOilP: SY.engOilP, engOilT: SY.engOilT, xmsnOilP: SY.xmsnOilP, xmsnOilT: SY.xmsnOilT,
    fuelLb: G.fuel / 100 * 1358, fuelPct: G.fuel, volts: SY.volts, amps: SY.amps, ac: SY.ac, hydPsi: m.hydOk ? 1000 * Math.min(1, H.rpm * 1.5) : 0,
    throttle: SY.grip, cautions: SY.cautions, masterCaution: SY.masterCaution, rpmWarn: SY.rpmWarn, fire: D.fire, hover, avionics: D.hp.avionics, vrs: H.vrs, stall: H.stall,
  }), Object.assign(_hp.sw, { bat: SY.bat, gen: SY.gen, inv: SY.inv, engine: D.engineSwitch, gov: SY.gov, hyd: D.hydBoost, trim: SY.trim, light: G.light, sas: HI.sas, lowrpm: SY.lowRpmAudio, starter: H.starter }),
    Object.assign(_hp.ctl, { cx: H.c.lat, cy: H.c.lon, pedal: H.c.ped, coll: H.c.coll }), _hp;
}
function hueyLine(ias, hdg, agl, c) {   // the numbers line under the external views
  const flags = [H.vrs > 0.4 && 'VORTEX RING!', SY.rpmWarn && 'RPM!', H.stall > 0.3 && 'BLADE STALL!', H.torque > 52 && 'OVERTORQUE', SY.gov === 'EMER' && 'GOV EMER'].filter(Boolean).join('  ');
  return `NR ${(H.rpm * 100).toFixed(0)}%  TQ ${H.torque.toFixed(0)} PSI  N1 ${(H.n1 * 100).toFixed(0)}%  EGT ${H.egt.toFixed(0)}°  IAS ${ias.toFixed(0)}kt  VS ${(H.vel.y * 196.85 / 100).toFixed(0) * 100}fpm  AGL ${agl.toFixed(0)}m  HDG ${hdg.toFixed(0).padStart(3, '0')}  COLL ${(H.coll * 100).toFixed(0)}%  ${c.sas ? 'ASSIST' : 'MANUAL'}  [${c.source || ''}]${flags ? '  ' + flags : ''}`;
}
function hueyHint() {   // what to do next, from the start sequence to the emergencies
  const n1 = Math.round(H.n1 * 100);
  if (!H.run && H.n1 < 0.1 && !SY.auto && !H.starter) return D.hp.engine <= 0.05 ? 'ENGINE DEAD  -  AUTOROTATE, OR CALL LOGISTICS ON THE GROUND (L)' : !H.landed ? 'ENGINE OUT  -  COLLECTIVE DOWN, KEEP 324 RPM, 70 KT, FLARE AT ~100 FT, CUSHION WITH THE COLLECTIVE' : 'ENGINE OFF  -  I: QUICK START  ·  BY HAND: BAT, MAIN FUEL, THROTTLE TO IDLE (PGUP), HOLD STARTER (HOME) TO 40% N1';
  if (H.hung) return `HUNG START  -  N1 ${n1}%  -  HOLD THE STARTER (HOME) TO 40% N1`;
  if (!H.run || H.starter) return `STARTING  -  N1 ${n1}%  EGT ${H.egt.toFixed(0)}°C${H.run ? '  -  LIGHT-OFF' : ''}${H.n1 > 0.4 ? '  -  RELEASE THE STARTER' : ''}`;
  if (H.landed && SY.grip < 0.95) return SY.auto === 'rollon' ? `THROTTLE ROLLING ON  -  NR ${Math.round(H.rpm * 100)}%` : 'FLIGHT IDLE  -  OPEN THE THROTTLE (PGUP) TO 6600 RPM';
  if (H.landed && H.rpm < 0.95) return `ROTOR COMING UP TO 324 RPM  -  NR ${Math.round(H.rpm * 100)}%`;
  if (H.landed) return '';
  if (!H.driven && H.rpm > 0.3) return 'AUTOROTATION  -  COLLECTIVE TO HOLD 324 RPM, 70 KT, FLARE AT ~100 FT, CUSHION WITH THE COLLECTIVE';
  if (H.vrs > 0.5) return 'VORTEX RING STATE  -  FORWARD CYCLIC: FLY OUT OF YOUR OWN DOWNWASH';
  if (H.stall > 0.3) return 'RETREATING BLADE STALL  -  SLOW DOWN, LOWER THE COLLECTIVE';
  if (SY.rpmWarn && H.rpm < 0.93) return 'LOW ROTOR RPM  -  LOWER THE COLLECTIVE';
  if (H.torque > 52) return 'OVERTORQUE  -  50 PSI IS THE LIMIT';
  return '';
}
function hueySound() {   // blade slap, turbine, low rotor rpm horn (audio.js)
  if (!sfx.huey) { sfx.engine(H.rpm * (0.25 + 0.75 * H.coll)); return; }
  sfx.huey({ nr: H.rpm, n1: H.n1, load: H.thrust / (H.mass * 9.81), torque: H.torque, vib: H.vib, horn: SY.horn, inside: cockpit.group.visible, spd: Math.hypot(H.vel.x, H.vel.z), on: G.state === 'play' && G.craft === 'heli' && (G.mode === 'zarch' ? Z.alive : T.alive) });
}
function updateZarch(dt, inp) {
  if (G.craft === 'jet') { updateJet(dt, inp); return; }
  const P = Z.pos;
  if (Z.alive) advise(dt);
  if (!Z.alive) {
    Z.deadT -= dt;
    if (Z.deadT <= 0 && !G.over) { G.fuel = 100; G.cargo = 0; D.reset(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; resetZarch(true); say(war.carrier && war.carrier.sinking === undefined ? 'NEW HELICOPTER ON THE ALBATROSS' : 'NEW HELICOPTER ON THE HOME PAD', 2); }
  } else {
    const M = D.mods(), ctl = HI.read(dt, H, { trim: SY.trim, mods: M });
    SY.starterKey = kd('Home');   // Home: starter (hold), PgUp / PgDn: throttle twist grip
    Object.assign(ctl, SY.controls(dt, H, (kd('PageUp') ? 1 : 0) - (kd('PageDown') ? 1 : 0)));
    H.extraMass = G.cargo * 3;    // fuel drums from the caves
    const ev = H.step(dt, ctl, { groundY, fuel: G.fuel, water: waterAt, surfVel: war.surfVel, mods: M });
    SY.update(dt, H, H.landed);
    for (const e of H.events) {
      if (e.e === 'overtemp') { D.hit(0.2, 'engine'); say('ENGINE OVERTEMP  -  EGT PAST 760°C', 2); }
      if (e.e === 'flameout' && D.engineSwitch && G.fuel > 0 && D.hp.engine > 0.05 && !SY.quick) say('FLAME-OUT  -  AUTOROTATE', 1.6);
    }
    if (H.mastBump > 0.25) { H.mastBump = 0; D.hit(0.3, 'rotor'); say('MAST BUMPING  -  LOW G: EASE THE CYCLIC, COLLECTIVE UP', 2.5); sfx.boom(0.3); }
    G.fuel = Math.max(0, G.fuel - D.update(dt));
    P.copy(H.pos); Z.vel.copy(H.vel); Z.landed = H.landed; Z.throttle = H.coll * H.rpm; Z.ctl = ctl;
    const fw = H.forward(), fl = Math.hypot(fw.x, fw.z); if (fl > 0.15) Z.facing.set(fw.x / fl, fw.z / fl);
    {
      const k = 1 - Math.exp(-6 * dt);
      Z.aimOff.x = lerp(Z.aimOff.x, -(ctl.hatX || 0) * 0.26, k); Z.aimOff.y = lerp(Z.aimOff.y, (ctl.hatY || 0) * 0.26, k);
      Z.aim.copy(fw).applyAxisAngle(H.up(), Z.aimOff.x).applyAxisAngle(_aimR.set(1, 0, 0).applyQuaternion(H.q), Z.aimOff.y);
    }
    G.fuel = Math.max(0, G.fuel - fuelBurnPct(H) * dt);   // the T53 fuel flow, scaled to the game tank (heli.js)
    if (G.fuel <= 0 && !H.landed) say('FUEL EXHAUSTED  -  AUTOROTATE AND SET DOWN SAFELY', 0.5);
    updateRescue(dt, H.landed, false);
    hueySound();
    const svc = H.landed ? serviceAt(P.x, P.z) : null; Z.svc = svc;
    if (svc) service(svc, dt);
    else if (ev === 'water') killPlayerZ('DITCHED IN THE WATER');
    else if (ev === 'rotor') killPlayerZ('ROTOR STRIKE');
    else if (ev === 'tailstrike') { D.hp.tail = 0; say('TAIL STRIKE  -  TAIL ROTOR GONE', 2.2); sfx.boom(0.5); }
    else if (ev === 'hardland') { D.hit(0.35, 'skids'); D.hit(0.15, 'xmsn'); say('HARD LANDING  -  SKIDS AND GEARBOX DAMAGED', 2); sfx.boom(0.4); }
    else if (ev === 'crash') killPlayerZ('CRASHED');
    if (!Z.alive) return;
    // rotor downwash: dust (or spray over water) blown out radially under the disc
    if (H.agl < 20 && H.rpm > 0.5 && H.thrust > 8000) {   // the 48 ft disc throws dust (spray) out to a rotor diameter
      const gy = groundY(P.x, P.z), wet = waterAt(P.x, P.z), k = (1 - H.agl / 20) * Math.min(1, H.thrust / 40000);
      for (let i = 0; i < 4; i++) if (Math.random() < k) {
        const a = rnd(6.283), sp = rnd(10, 20), rr = rnd(2, 6);
        if (wet) fx.mix.spawn(P.x + Math.cos(a) * rr, gy + 0.3, P.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.1), 0.7, 3, .85, .92, .97, 0.4, 2, 1.4, 0.3);
        else fx.mix.spawn(P.x + Math.cos(a) * rr, gy + 0.3, P.z + Math.sin(a) * rr, Math.cos(a) * sp, rnd(0.5, 2.5), Math.sin(a) * sp, rnd(0.6, 1.2), 0.8, 3.4, .55, .48, .36, 0.45, 1.5, 1.5, 0.3);
      }
      Z.washT = (Z.washT || 0) - dt;
      if (wet && Z.washT <= 0 && k > 0.2) { Z.washT = 0.18; fx.water.add({ x: P.x, y: 0.1, z: P.z, size: 3, grow: 12, a: 0.45 * k, life: 1.1, tile: 1, pow: 1.5 }); }
    }
    for (const ax of ['x', 'z']) if (Math.abs(P[ax]) > BOUND) { P[ax] = Math.sign(P[ax]) * BOUND; Z.vel[ax] = 0; say('TURN BACK', 0.8); }
    // weapons: door gun (F / trigger), rocket pods (G / button 3), bombs (B / button 5)
    Z.fireCd -= dt; Z.rkCd = (Z.rkCd || 0) - dt; Z.bmCd = (Z.bmCd || 0) - dt;
    if ((inp.fire || ctl.fire) && Z.fireCd <= 0) {
      Z.fireCd = 0.14; sfx.shot();
      war.fireBullet(P.clone().addScaledVector(Z.aim, 5), Z.aim.clone().multiplyScalar(75).addScaledVector(Z.vel, 0.5));
    }
    if ((kd('KeyG') || ctl.rocket) && Z.rkCd <= 0) {
      if (G.rockets > 0) {
        Z.rkCd = 0.2; G.rockets--; Z.rkSide = -(Z.rkSide || 1);
        const p0 = P.clone().add(_rk.set(1.7 * Z.rkSide, -0.4, -0.6).applyQuaternion(H.q));
        war.fireRocket(p0, Z.aim.clone().multiplyScalar(105).add(Z.vel)); fx.flash(p0.x, p0.y, p0.z, 0.35);
      } else { Z.rkCd = 1; say('ROCKETS EMPTY  -  REARM ON THE CARRIER OR A FRIENDLY PAD', 1.4); }
    }
    if ((kd('KeyB') || ctl.bomb) && Z.bmCd <= 0) {
      if (G.bombs > 0) { Z.bmCd = 0.45; G.bombs--; war.dropBomb(P.clone().add(_rk.set(0, -2.3, 0)), Z.vel.clone()); }
      else { Z.bmCd = 1; say('BOMBS GONE  -  REARM ON THE CARRIER OR A FRIENDLY PAD', 1.4); }
    }
    { const hb = holeOf(P.x, P.z); if (hb && P.y < hb.h - 0.5 && Z.vel.y < 0) { enterCave(hb); return; } }
    if (Math.abs(P.x) > BOUND || Math.abs(P.z) > BOUND) { H.pos.x = clamp(H.pos.x, -BOUND, BOUND); H.pos.z = clamp(H.pos.z, -BOUND, BOUND); }
  }
}

function refuelAtBase() {
  sfx.dock(); sfx.engine(0);
  if (G.fuel < 99) say('REFUELLED', 1.5);
  G.fuel = 100;
}

// ================================================================ THRUST
const T_THRUST = 17, T_ROT = 3.4, ROPE = 4.2, PODM = 0.35, T_VIEWH = 30;
const T = { spin: 0, guide: 0, base: null, lvl: null, w: 0, ge: 0, onPad: false, yawF: -Math.PI / 2, face: 1, roll: 0, zOff: 0, q0: new THREE.Quaternion(), qLast: new THREE.Quaternion(), x: 0, y: 0, vx: 0, vy: 0, ang: 0, landed: true, alive: true, deadT: 0, fireCd: 0, pod: null, bullets: [], tb: [], parts: [], turrets: [], tanks: [], cam: new THREE.Vector2(), beamOn: false, thrOn: 0, hadPod: false };
const podMesh = makePod(), rope = makeRope();
const beam3 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.8, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ffee, transparent: true, opacity: 0.22, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
let caveGroup = null, tPartCloud = null, tBulCloud = null;
const caveToWorld = (x, y, out, b = T.base) => out.set(b.x + (x - CAVE_OX) * CS, b.h - CAVE_SINK + (y - T.lvl.H) * CS, b.z);
const sol = (x, y) => { const L = T.lvl; if (x < 0 || x >= L.W || y < 0) return 1; if (y >= L.H) return 0; return L.solid[Math.floor(y) * L.W + Math.floor(x)]; };
const isPad = (x, y) => { const L = T.lvl; if (x < 0 || x >= L.W || y < 0 || y >= L.H) return false; return L.pad[Math.floor(y) * L.W + Math.floor(x)] === 1; };

// Build every base's cave once. Geometry is shared; each base keeps its own turrets/tanks/pod state, so a looted
// tank stays empty and a destroyed turret stays dead. The home cave is friendly: no turrets, a big reservoir tank and
// a blue intake pad where carried fuel is pumped into the reservoir.
const CARGO_MAX = 100;
function buildCaves() {
  let proto = null;
  BASES.forEach((b, i) => {
    const L = b.L = buildLevel(b.tier);
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
function restockBase(b) {   // an enemy cave fortress gets its garrison, fuel and command pod back
  for (const t of b.st.turrets) { t.alive = true; t.mesh.visible = true; }
  for (const t of b.st.tanks) { t.fuel = t.max; t.mesh.userData.bar.scale.y = 1; }
  Object.assign(b.st.pod, { x: b.L.orb.x, y: b.L.orb.y, vx: 0, vy: 0, attached: false }); b.st.podTaken = false;
}
function resetBases() { for (const b of BASES) if (b.kind === 'enemy') restockBase(b); }   // new game
// Fly into the shaft from the surface: the same ship carries on, locked to the cave plane.
function enterCave(b) {
  useCave(b); T.caveT = 0;
  const L = T.lvl, P = Z.pos;
  G.mode = 'thrust';
  T.x = (P.x - b.x) / CS + CAVE_OX; T.y = (P.y - b.h + CAVE_SINK) / CS + L.H; T.vx = Z.vel.x / CS; T.vy = Z.vel.y / CS;
  T.vy = Math.max(T.vy, -5); T.vx = clamp(T.vx, -2, 2); T.guide = 1.2; T.q0.copy(shipMesh.quaternion);
  { const u = H.up(); T.ang = clamp(Math.atan2(u.x, u.y), -0.3, 0.3); } T.w = 0; T.zOff = P.z - b.z; T.landed = false; T.alive = true; T.thrOn = Z.throttle;
  T.face = Z.facing.x < 0 ? -1 : 1; T.yawF = -T.face * Math.PI / 2;
  say(b.kind === 'home' ? 'HOME BASE  -  LAND ON THE BLUE PAD TO UNLOAD FUEL' : b.isl.owner === 1 ? `${b.name}  -  OURS NOW, THE GARRISON HAS GONE` : `${b.name} (${TIER_NAMES[b.tier]})  -  STEAL THE POD TO TAKE THE ISLAND`, 3);
}
// Climb out of the shaft: hand the ship back to the 3D flight model with its momentum.
function exitCave() {
  const had = T.pod.attached;
  if (had) { addScore(1500); say('POD STOLEN  -  THE ISLAND IS OURS', 2.5); sfx.dock(); T.base.st.podTaken = true; war.setOwner(T.base.isl, 1, 'POD STOLEN'); }
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
  T.alive = true; T.landed = false; G.fuel = 100; G.cargo = 0; D.reset();
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

// Door gun in the cave swivels: the POV hat points it in 8 directions and fires while held; otherwise it follows the mouse
// cursor (click fires) while the mouse is in use, else it points along the nose.
const _mray = new THREE.Raycaster();
function caveAim(ctl) {
  let ax = T.face * Math.cos(T.ang), ay = -T.face * Math.sin(T.ang);
  T.hatFire = false; T.aimSrc = 'nose';
  if (ctl.hatX || ctl.hatY) { const l = Math.hypot(ctl.hatX, ctl.hatY); ax = ctl.hatX / l; ay = ctl.hatY / l; T.hatFire = true; T.aimSrc = 'hat'; }
  else if (!document.pointerLockElement && (mouseFire || performance.now() - mouseAimT < 3000)) {
    _mray.setFromCamera(mouseNdc, zCam); const o = _mray.ray.origin, d = _mray.ray.direction, b = T.base;
    const t = Math.abs(d.z) > 1e-4 ? (b.z - o.z) / d.z : -1;
    if (t > 0) {
      const dx = (o.x + d.x * t - b.x) / CS + CAVE_OX - T.x, dy = (o.y + d.y * t - b.h + CAVE_SINK) / CS + T.lvl.H - T.y, l = Math.hypot(dx, dy);
      if (l > 0.8) { ax = dx / l; ay = dy / l; T.aimSrc = 'mouse'; }
    }
  }
  T.aimX = ax; T.aimY = ay;
}
function updateThrust(dt, inp) {
  const L = T.lvl;
  if (!T.alive) { T.deadT -= dt; if (T.deadT <= 0 && !G.over) respawnHome(); stepParts(T.parts, dt); return; }
  const ctl = HI.read(dt); Z.ctl = ctl;
  const M = D.mods();
  SY.starterKey = kd('Home'); Object.assign(ctl, SY.controls(dt, H, (kd('PageUp') ? 1 : 0) - (kd('PageDown') ? 1 : 0)));
  // the same rotor and engine, in axial flight: climb speed and the rock under the skids (ground effect) -> thrust / weight
  const zr = T.ge > 0 ? HELI.ROTOR_R * (0.55 + (1 - T.ge) * 1.5) : Infinity;
  const tw = T.landed && ctl.coll < 0.05 ? 0 : H.axial(dt, ctl, { mods: M, fuel: G.fuel }, T.landed ? 0 : T.vy * CS, zr);
  if (T.landed && ctl.coll < 0.05) H.axial(dt, ctl, { mods: M, fuel: G.fuel }, 0, HELI.ROTOR_R * 0.55);
  SY.update(dt, H, T.landed);
  G.fuel = Math.max(0, G.fuel - D.update(dt));
  const auth = H.rpm * H.rpm * M.lift, thr = Math.max(0, tw), beam = !!ctl.winch;
  T.spin = M.tail === 0 && H.driven ? H.torque / 40 : 0;   // no tail rotor: the airframe spins (visual) and the disc wanders
  T.thrOn = H.coll * H.rpm; T.beamOn = beam;
  hueySound();
  T.fireCd -= dt; T.caveT += dt;
  caveAim(ctl);
  if ((inp.fire || ctl.fire || T.hatFire) && T.fireCd <= 0) {
    T.fireCd = 0.15; sfx.shot();
    T.bullets.push({ x: T.x + T.aimX * 2, y: T.y + T.aimY * 2, vx: T.aimX * 26 + T.vx * .5, vy: T.aimY * 26 + T.vy * .5, life: 1.4 });
  }
  const n = Math.ceil(dt / (1 / 240)), h = dt / n, pod = T.pod;
  for (let it = 0; it < n && T.alive; it++) {
    const lift = thr * 7;   // the cave's gravity is 7 cells/s2: thrust / weight 1 = hover
    if (T.guide > 0) { T.guide -= h; T.landed = false; T.x += (CAVE_OX - T.x) * Math.min(1, 5 * h); T.vx *= 1 - Math.min(1, 4 * h); T.ang *= 1 - Math.min(1, 3 * h); }   // the funnel lines you up on the shaft
    if (T.landed) { if (lift > 7) { T.landed = false; T.onPad = false; } else { T.vx = T.vy = 0; T.w = 0; T.ang *= 0.9; break; } }
    {   // disc tilt rate follows the cyclic; stability assist levels it hands-off
      let want = ctl.cx * HELI.RATE.roll; if (ctl.sas && M.hydOk) want += -T.ang * 1.6 * (1 - Math.min(1, Math.abs(ctl.cx) * 2.5));
      T.w += ((want - T.w) * HELI.RESP * auth * M.hyd + T.spin * Math.sin(performance.now() * 0.004) * 2.2) * h; T.ang += T.w * h;
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
      else if (T.vy > -7 && Math.abs(T.vx) < 6 && Math.abs(T.ang) < 0.7) { T.y -= T.vy * h; T.vx = T.vy = 0; T.w = 0; T.landed = true; D.hit(0.35, 'skids'); D.hit(0.15, 'xmsn'); say('HARD LANDING  -  SKIDS AND GEARBOX DAMAGED', 2); }
      else { crashThrust('HARD LANDING'); break; }
    }
    if (T.y > L.H + 1) { exitCave(); return; }
  }
  if (!T.alive) return;
  updateRescue(dt, T.landed, true);
  if (T.landed && T.onPad && T.base.kind === 'home') {
    const unload = Math.min(G.cargo, 30 * dt, RES_MAX - G.res); G.cargo -= unload; G.res += unload;
    const fill = Math.min(G.res, 25 * dt, 100 - G.fuel); G.res -= fill; G.fuel += fill;
    if (D.damaged()) D.repair(0.25 * dt);
    if (unload > 0) { T.unloaded = (T.unloaded || 0) + unload; if (G.cargo <= 0.01) { say(`FUEL UNLOADED  -  RESERVOIR ${Math.round(G.res)}`, 2); addScore(Math.round(T.unloaded * 5)); T.unloaded = 0; } }
  }
  if (Math.abs(T.vx) > 1.5) T.face = Math.sign(T.vx);
  if (thr > 0.1) {
    const s = Math.sin(T.ang), c = Math.cos(T.ang);
    // rotor downwash kicks dust off the rock below when close (ground effect range)
    if (T.ge > 0) { let gy = T.y - 0.8; while (!sol(T.x, gy) && gy > T.y - 5) gy -= 0.25;
      for (let i = 0; i < 2; i++) { const d = Math.random() < 0.5 ? -1 : 1; emit(T.parts, T.x + d * rnd(0.3, 1.5), gy + 0.4, 0, d * rnd(5, 10), rnd(0.3, 1.5), 0, 0.5, .55, .48, .38, 2); } }
  }
  G.fuel = Math.max(0, G.fuel - fuelBurnPct(H) * dt);
  if (beam && G.fuel > 0) {
    G.fuel = Math.max(0, G.fuel - 0.8 * dt);
    const bx = T.x - Math.sin(T.ang) * 3.5, by = T.y - Math.cos(T.ang) * 3.5, BR = 5.5;
    if (!pod.attached && Math.hypot(pod.x - bx, pod.y - by) < BR) { pod.attached = true; pod.len = Math.max(ROPE, Math.hypot(pod.x - T.x, pod.y - T.y)); pod.grace = 0; T.hadPod = true; addScore(500); sfx.pickup(); say('POD SECURED  -  GET OUT!', 2.5); }
    for (const tk of T.tanks) if (tk.fuel > 0 && Math.hypot(tk.x - bx, tk.y - by) < BR) {
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
    if (d < 18 && t.cd <= 0 && los(t.x, t.y, T.x, T.y)) {
      t.cd = 3.1 - T.base.tier * 0.3 + rnd(0.8); sfx.enemyShot();
      const lead = d / 10, ax = T.x + T.vx * lead * .4 - t.x, ay = T.y + T.vy * lead * .4 - t.y, al = Math.hypot(ax, ay) || 1;
      T.tb.push({ x: t.x + ax / al * 1.2, y: t.y + ay / al * 1.2, vx: ax / al * 10, vy: ay / al * 10, life: 4 });
    }
  }
  for (let i = T.tb.length - 1; i >= 0; i--) {
    const b = T.tb[i]; b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = b.life <= 0 || sol(b.x, b.y);
    if (!dead && T.alive && Math.hypot(b.x - T.x, b.y - T.y) < 1.2) { dead = true; hurtHeli(0.16, 'HIT'); }
    if (dead) { T.tb[i] = T.tb[T.tb.length - 1]; T.tb.pop(); }
  }
  stepParts(T.parts, dt);
}
// ================================================================ flow
function gameOver() {
  G.over = true;
  setTimeout(() => { if (G.over) showEnd('DEFEAT', 'NO HELICOPTERS LEFT'); }, 2500);
}
function startTransition(label, swap) { G.state = 'trans'; G.tr = { t: 0, phase: 0, swap }; $('fadeText').textContent = label; }
function newGame() {
  cancelRescue(); D.reset(); JP.stow(); G.craft = 'heli'; G.jets = 2; G.jetDownT = 0;
  G.score = 0; G.lives = 3; G.fuel = 100; G.visit = 0; G.mode = 'zarch'; G.over = false; G.state = 'play';
  G.res = 250; G.mat = 90; G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; G.cargo = 0; selIsl = null; feedItems.length = 0; G.advT = 12;
  fx.clear(); war.reset(); resetBases(); fog.reset(); fog.enabled = !params.has('nofog'); resetZarch(true);
  $('title').style.display = 'none'; $('title').querySelector('h1').textContent = 'THRUST / ZARCH'; $('result').textContent = '';
  say('ROTOR SPOOLING  -  RAISE COLLECTIVE TO LIFT', 3);
  feed('COMMAND: TAKE THE ISLANDS BEFORE THE ENEMY DOES  -  M FOR THE MAP'); feed('THE ENEMY CARRIER KRAKEN IS SOMEWHERE NORTH-EAST');
}
function pressStart() { if (G.state === 'title') newGame(); }

// ---------------------------------------------------------------- hud / render
const radar = $('radar').getContext('2d');
function setMapSize() {
  const c = $('radar'); c.classList.toggle('big', bigMap);
  c.width = bigMap ? innerWidth : 150; c.height = bigMap ? innerHeight : 150;
}
addEventListener('resize', () => { if (bigMap) setMapSize(); });
// The map: the sea and islands, the fog of war (black where never seen, dim where not watched now), islands as you
// last saw them, your units always, enemy units only inside your sight. The big map (M) is the command screen.
const landImg = (() => {
  const N = 320, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = terrainH(-BOUND + (i + 0.5) * 2 * BOUND / N, -BOUND + (j + 0.5) * 2 * BOUND / N), k = (j * N + i) * 4;
    let col;
    if (h <= 0) { const d = clamp(-h / 10, 0, 1); col = [lerp(28, 8, d), lerp(92, 34, d), lerp(118, 78, d)]; }
    else if (h < 2.5) col = [176, 164, 112];
    else { const t = clamp((h - 6) / 28, 0, 1); col = [lerp(48, 120, t), lerp(118, 102, t), lerp(50, 80, t)]; }
    im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
  }
  x.putImageData(im, 0, 0); return c;
})();
const fogImg = document.createElement('canvas'); fogImg.width = fogImg.height = fog.N;
const fogCtx = fogImg.getContext('2d'), fogData = fogCtx.createImageData(fog.N, fog.N);
function updateFogImg() {
  const d = fogData.data;
  for (let k = 0; k < fog.N * fog.N; k++) { const e = fog.enabled ? fog.exp[k] : 1, v = fog.enabled ? fog.vis[k] : 1; d[k * 4] = 4; d[k * 4 + 1] = 8; d[k * 4 + 2] = 16; d[k * 4 + 3] = (1 - e) * 240 + e * (1 - v) * 110; }
  fogCtx.putImageData(fogData, 0, 0);
}
const shipName = u => ({ battleship: 'BATTLESHIP', freighter: 'FREIGHTER' }[u.type] || (u.side === 1 ? 'ALBATROSS' : 'KRAKEN'));
const KIND_TAG = { hq: 'HQ', fortress: 'C', fuel: 'F', factory: 'M', radar: 'R' };
const OWN_COL = ['#e8e4d0', '#4cf', '#f54'];
let mapView = null;
function drawMap() {
  const W = radar.canvas.width, Hh = radar.canvas.height; radar.clearRect(0, 0, W, Hh);
  const big = bigMap, half = big ? Math.min(W, Hh - 120) * 0.47 / BOUND : 72 / 260, cx = W / 2, cy = big ? (Hh - 60) / 2 : Hh / 2;
  const ox = big ? 0 : Z.pos.x, oz = big ? 0 : Z.pos.z;
  const px = x => cx + (x - ox) * half, py = z => cy + (z - oz) * half;
  mapView = { half, cx, cy, ox, oz };
  radar.save();
  if (!big) { radar.beginPath(); radar.arc(cx, cy, 74, 0, 6.283); radar.clip(); }
  else { radar.fillStyle = 'rgba(2,8,16,.88)'; radar.fillRect(0, 0, W, Hh); }
  radar.imageSmoothingEnabled = true;
  radar.drawImage(landImg, px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half);
  radar.drawImage(fogImg, px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half);
  if (big) { radar.strokeStyle = 'rgba(120,220,255,.35)'; radar.lineWidth = 1; radar.strokeRect(px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half); }
  // islands, as last seen
  for (const I of ISLANDS) {
    if (!fog.exploredAt(I.x, I.z) && !fog.exploredAt(I.pad.x, I.pad.z)) continue;
    const X = px(I.pad.x), Y = py(I.pad.z), own = I.seen, col = own < 0 ? '#999' : OWN_COL[own], r = big ? 10 : 5;
    radar.strokeStyle = col; radar.fillStyle = col; radar.lineWidth = big ? 2.5 : 1.5;
    radar.beginPath(); if (I.cave) radar.rect(X - r, Y - r, 2 * r, 2 * r); else radar.arc(X, Y, r, 0, 6.283); radar.stroke();
    if (I.cap && fog.visibleAt(I.pad.x, I.pad.z)) { radar.strokeStyle = OWN_COL[I.cap.side]; radar.lineWidth = 3; radar.beginPath(); radar.arc(X, Y, r + 4, -1.571, -1.571 + 6.283 * I.cap.t); radar.stroke(); }
    if (big) {
      radar.font = 'bold 11px monospace'; radar.textAlign = 'center'; radar.fillText(KIND_TAG[I.kind], X, Y + 4);
      radar.font = '12px monospace'; radar.textAlign = 'left';
      const vis = fog.visibleAt(I.pad.x, I.pad.z), aa = vis && own > 0 ? war.aliveAA(I) : -1;
      radar.fillText(`${I.name}${own < 0 ? '  ?' : ''}${aa > 0 ? '  ' + '▲'.repeat(aa) : ''}`, X + 14, Y + 4);
      if (I === selIsl) { radar.strokeStyle = '#ff8'; radar.lineWidth = 2; radar.setLineDash([4, 4]); radar.beginPath(); radar.arc(X, Y, 18, 0, 6.283); radar.stroke(); radar.setLineDash([]); }
    }
  }
  // the carrier's course
  const c = war.carrier;
  if (c && c.path.length && c.sinking === undefined) {
    radar.strokeStyle = 'rgba(80,200,255,.7)'; radar.lineWidth = big ? 2 : 1; radar.setLineDash([6, 5]); radar.beginPath(); radar.moveTo(px(c.p.x), py(c.p.z));
    for (const [x, z] of c.path) radar.lineTo(px(x), py(z)); radar.stroke(); radar.setLineDash([]);
    const [gx, gz] = c.path[c.path.length - 1]; radar.beginPath(); radar.arc(px(gx), py(gz), big ? 6 : 3, 0, 6.283); radar.stroke();
  }
  // units
  for (const u of war.units) {
    if (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z)) continue;
    const X = px(u.p.x), Y = py(u.p.z), col = u.side === 1 ? '#6ef' : '#f64';
    if (u.dims) {
      radar.save(); radar.translate(X, Y); radar.rotate(-u.yaw); radar.fillStyle = u.sinking !== undefined ? '#555' : col;
      const l = Math.max(big ? 12 : 7, u.dims.L * half), w = Math.max(big ? 4 : 3, u.dims.W * half); radar.fillRect(-w / 2, -l / 2, w, l); radar.restore();
      if (big) { radar.fillStyle = col; radar.font = 'bold 12px monospace'; radar.fillText(shipName(u), X + 12, Y - 8); }
    } else { radar.fillStyle = col; const sz = big ? (u.type === 'transport' ? 7 : 5) : 3; radar.fillRect(X - sz / 2, Y - sz / 2, sz, sz); }
  }
  // you: an arrow along the nose
  const X = px(Z.pos.x), Y = py(Z.pos.z), fx_ = Z.facing.x, fz = Z.facing.y, sz = big ? 9 : 5;
  radar.fillStyle = '#fff'; radar.beginPath();
  radar.moveTo(X + fx_ * sz, Y + fz * sz); radar.lineTo(X - fx_ * sz - fz * sz * .6, Y - fz * sz + fx_ * sz * .6); radar.lineTo(X - fx_ * sz + fz * sz * .6, Y - fz * sz - fx_ * sz * .6); radar.fill();
  radar.restore();
  if (big) {
    radar.font = '14px monospace'; radar.textAlign = 'center'; radar.fillStyle = '#bfe';
    radar.fillText('CLICK THE SEA: SAIL THE ALBATROSS THERE   ·   CLICK AN ISLAND: SELECT IT   ·   M: CLOSE', W / 2, Hh - 70);
    radar.fillStyle = '#ff8';
    radar.fillText(`1: CAPTURE DRONE (${COST.drone})  ·  2: AA GUN ON OUR ISLAND (${COST.aa})  ·  3: NEW HELICOPTER (${COST.heli})  ·  4: ESCORT FIGHTER (${COST.escort})     MATERIEL ${Math.floor(G.mat)}`, W / 2, Hh - 46);
    radar.font = '12px monospace'; radar.fillStyle = '#8ab';
    radar.fillText('HQ  HEADQUARTERS     C  CAVE FORTRESS (STEAL ITS POD)     F  FUEL     M  MATERIEL (FACTORY)     R  RADAR     ▲ AA GUNS', W / 2, Hh - 24);
    if (selIsl) {
      const I = selIsl, own = I.seen, info = [`${I.name}`, `${own < 0 ? 'UNKNOWN' : ['NEUTRAL', 'OURS', 'ENEMY'][own]}  ·  ${{ hq: 'HEADQUARTERS', fortress: 'CAVE FORTRESS', fuel: 'OIL - FUEL', factory: 'FACTORY - MATERIEL', radar: 'RADAR - LONG SIGHT' }[I.kind]}`];
      if (fog.visibleAt(I.pad.x, I.pad.z) && own > 0) info.push(`AA GUNS ${war.aliveAA(I)}`);
      info.push(I.cave ? 'TAKE IT: STEAL THE POD FROM ITS CAVE' : own === 1 ? 'PRESS 2 FOR AN AA GUN' : 'TAKE IT: SILENCE ITS GUNS, LAND ON THE PAD OR PRESS 1');
      radar.textAlign = 'left'; radar.font = 'bold 15px monospace';
      info.forEach((t, i) => { radar.fillStyle = i === 0 ? OWN_COL[Math.max(0, own)] : '#cde'; radar.fillText(t, 24, 90 + i * 22); });
    }
    radar.textAlign = 'left';
  }
}
$('radar').addEventListener('mousedown', e => {
  if (!bigMap || !mapView) return;
  e.stopPropagation(); e.preventDefault();
  const v = mapView, rc = $('radar').getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
  const wx = v.ox + (mx - v.cx) / v.half, wz = v.oz + (my - v.cy) / v.half;
  const I = ISLANDS.find(I => (fog.exploredAt(I.x, I.z) || fog.exploredAt(I.pad.x, I.pad.z)) && Math.hypot(v.cx + (I.pad.x - v.ox) * v.half - mx, v.cy + (I.pad.z - v.oz) * v.half - my) < 16);
  if (I) { selIsl = I; sfx.blip?.(500, 700, 0.06, 'square', 0.06); return; }
  if (war.orderCarrier(wx, wz)) { feed('ALBATROSS: COURSE SET'); sfx.blip?.(400, 300, 0.08, 'square', 0.06); }
});
$('radar').addEventListener('contextmenu', e => e.preventDefault());
const _hud = {};
function setText(id, v) { if (_hud[id] !== v) { _hud[id] = v; $(id).textContent = v; } }
function setStyle(id, k, v) { const key = id + k; if (_hud[key] !== v) { _hud[key] = v; $(id).style[k] = v; } }
const crossEl = (() => {
  const e = document.createElement('div'); e.style.cssText = 'position:absolute;left:50%;top:50%;width:25px;height:25px;margin:-12px 0 0 -12px;display:none';
  e.innerHTML = '<svg width="25" height="25" viewBox="0 0 25 25" style="filter:drop-shadow(0 0 1px #000)"><circle cx="12.5" cy="12.5" r="1.3" fill="#ffe8a0"/><path d="M12.5 1v7M12.5 17v7M1 12.5h7M17 12.5h7" stroke="#ffe8a0" stroke-width="1" opacity=".85"/></svg>';
  $('hud').appendChild(e); return e;
})();
const gfxEl = (() => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:none'; $('hud').prepend(e); return e; })();
const cautionEl = (() => { const e = document.createElement('div'); e.id = 'caution'; e.style.cssText = 'position:absolute;left:16px;bottom:100px;font-size:15px;letter-spacing:1px;font-weight:bold'; $('hud').appendChild(e); return e; })();
// what the island pad under / near you is doing: capture progress, guns in the way, services
function padHint() {
  if (Z.svc) return G.res < 1 && G.fuel < 98 ? 'FUEL STORES EMPTY  -  TAKE FUEL ISLANDS OR LOOT ENEMY CAVES' : G.fuel < 97 || D.damaged() || G.rockets < ROCKETS_MAX || G.bombs < BOMBS_MAX ? `${Z.svc.name}  -  REFUELLING, REPAIRING, REARMING` : `${Z.svc.name}  -  READY  ·  M FOR THE MAP`;
  for (const I of ISLANDS) {
    if (I.owner === 1 || Math.hypot(Z.pos.x - I.pad.x, Z.pos.z - I.pad.z) > 45) continue;
    if (I.cave) return I.owner === 2 ? `${I.name}  -  DESCEND THE SHAFT AND STEAL THE POD TO TAKE IT` : '';
    const aa = war.aliveAA(I);
    if (aa > 0) return `${I.name}  -  ${aa} AA GUN${aa > 1 ? 'S' : ''} DEFENDING  -  KNOCK ${aa > 1 ? 'THEM' : 'IT'} OUT FIRST`;
    if (H.landed && I.cap && I.cap.side === 1) return `CAPTURING ${I.name}  ${Math.floor(I.cap.t * 100)}%`;
    return `${I.name}  -  LAND ON THE PAD TO TAKE IT`;
  }
  return '';
}
// floating labels over nearby islands and ships, so you can read the war without the map
const tagBox = (() => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; $('hud').prepend(e); return e; })();
const tagPool = [], _tv = new THREE.Vector3();
const KIND_NAME = { hq: 'HEADQUARTERS', fortress: 'CAVE FORTRESS', fuel: 'FUEL', factory: 'FACTORY', radar: 'RADAR' };
function updateTags() {
  let n = 0;
  const put = (x, y, z, html, d) => {
    _tv.set(x, y, z).project(zCam); if (_tv.z > 1 || Math.abs(_tv.x) > 1.05 || Math.abs(_tv.y) > 1.05) return;
    if (n >= tagPool.length) { const e = document.createElement('div'); e.style.cssText = 'position:absolute;left:0;top:0;width:240px;margin-left:-120px;text-align:center;font-size:12px;line-height:1.35;white-space:nowrap;text-shadow:0 0 3px #000,0 0 5px #000'; tagBox.appendChild(e); tagPool.push(e); }
    const e = tagPool[n++]; if (e._h !== html) { e._h = html; e.innerHTML = html; }
    e.style.display = 'block'; e.style.transform = `translate(${((_tv.x + 1) / 2 * innerWidth).toFixed(0)}px,${((1 - _tv.y) / 2 * innerHeight - 30).toFixed(0)}px)`; e.style.opacity = clamp(1.4 - d / 380, 0.25, 1).toFixed(2);
  };
  if (G.state === 'play' && G.mode === 'zarch' && !bigMap && camB < 0.05) {
    const cx = zCam.position.x, cz = zCam.position.z;
    for (const I of ISLANDS) {
      const p = I.pad, d = Math.hypot(p.x - cx, p.z - cz); if (d > 430 || d < 25 || !fog.exploredAt(p.x, p.z)) continue;
      const vis = fog.visibleAt(p.x, p.z), own = vis ? I.owner : I.seen, col = own < 0 ? '#aaa' : OWN_COL[own], aa = vis && own > 0 ? war.aliveAA(I) : 0;
      const st = own < 0 ? 'UNKNOWN' : own === 1 ? (I.cap && I.cap.side === 2 ? '<span style="color:#f86">UNDER ATTACK</span>' : 'OURS') : own === 2 ? (I.cave ? 'ENEMY  ·  STEAL THE POD' : aa ? `ENEMY  ·  ${'▲'.repeat(aa)} AA` : 'ENEMY  ·  UNDEFENDED') : 'NEUTRAL  ·  LAND TO TAKE';
      put(p.x, p.h + 22, p.z, `<b style="color:${col}">${I.name}</b>  <span style="color:#9ab">${KIND_NAME[I.kind]}  ${Math.round(d)}m</span><br><span style="color:#cde">${st}</span>`, d);
    }
    for (const u of war.units) {
      if (!u.dims || u.sinking !== undefined || (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z))) continue;
      const d = Math.hypot(u.p.x - cx, u.p.z - cz); if (d > 520 || d < 60) continue;
      put(u.p.x, u.dims.DECK + 30, u.p.z, `<b style="color:${OWN_COL[u.side]}">${shipName(u)}</b>  <span style="color:#9ab">${Math.round(100 * u.hp / u.hpMax)}%  ${Math.round(d)}m</span>`, d);
    }
  }
  for (let i = n; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}
function updateHud() {
  updateTags();
  {   // in the cockpit the instruments carry fuel / rpm / speed, so the bottom text block steps aside and the map moves up
    const ck = cockpit.group.visible || JP.cockpit.group.visible; setStyle('bot', 'display', ck || bigMap ? 'none' : 'block');
    for (const id of ['tl', 'hint', 'feed', 'war']) setStyle(id, 'display', bigMap ? 'none' : 'block');   // the command map has its own read-outs
    setStyle('radar', 'bottom', ck && !bigMap ? 'auto' : ''); setStyle('radar', 'top', ck && !bigMap ? '64px' : ''); setStyle('feed', 'top', ck ? '236px' : '');
  }
  crossEl.style.display = document.pointerLockElement === canvas && (cockpit.group.visible || JP.cockpit.group.visible) ? 'block' : 'none';
  {   // g effects in the jet cockpit: grey tunnel closing in, black at G-LOC, red-out under negative g
    const gf = JP.cockpit.group.visible || (G.craft === 'jet' && JP.gloc > 0) ? JP.gfx() : { grey: 0, red: 0 };
    const k = (gf.grey * 100) | 0, r = (gf.red * 100) | 0, key = k * 1000 + r;
    if (gfxEl._k !== key) { gfxEl._k = key; gfxEl.style.display = key ? 'block' : 'none'; gfxEl.style.background = `radial-gradient(circle at 50% 45%, rgba(${r ? 120 : 0},0,0,${gf.red * 0.55}) ${Math.max(0, 62 - gf.grey * 70)}%, rgba(${r ? 90 : 0},0,0,${Math.min(1, 0.15 + gf.grey * 1.1 + gf.red * 0.4)}) ${Math.max(8, 95 - gf.grey * 80)}%)`; gfxEl.style.backdropFilter = gf.grey > 0.2 ? `grayscale(${Math.min(1, gf.grey * 1.4)})` : ''; }
  }
  { const list = G.state === 'play' && !cockpit.group.visible ? D.cautions(G.fuel, H.rpm, G.mode === 'zarch' ? H.landed : T.landed) : [], blink = (performance.now() % 600) < 300;
    const html = list.map(c => `<span style="color:${c.warn ? (blink ? '#ff3a2a' : '#7a1810') : '#ffb020'};margin-right:12px">${c.t}</span>`).join('');
    if (cautionEl._h !== html) { cautionEl._h = html; cautionEl.innerHTML = html; } }
  setText('score', String(G.score)); setText('hi', String(G.hi));
  setText('lives', '▲'.repeat(Math.max(0, G.lives))); setText('jets', `${G.jets} IN THE HANGAR${G.craft === 'jet' ? '  ·  1 FLYING' : ''}`);
  setStyle('fuel', 'width', clamp(G.craft === 'jet' ? JP.J.fuel / 27.2 : G.fuel, 0, 100).toFixed(1) + '%');
  setText('modeTag', `FUEL STORES ${Math.round(G.res)}/${RES_MAX}   MATERIEL ${Math.floor(G.mat)}${G.cargo > 0.5 ? '   CARGO ' + Math.round(G.cargo) : ''}`);
  setText('weap', G.craft === 'jet' ? JP.weapLine() : `ROCKETS ${G.rockets}   BOMBS ${G.bombs}`);
  {   // the war at a glance
    const n = [0, 0, 0]; for (const I of ISLANDS) n[I.owner]++;
    const c = war.carrier, b = war.battleship, eb = war.E.bship;
    const html = `<span style="color:#4cf">OURS ${n[1]}</span> &nbsp; <span style="color:#f54">ENEMY ${n[2]}</span> &nbsp; <span style="color:#ddd">FREE ${n[0]}</span>` +
      ` &nbsp;·&nbsp; ALBATROSS <b style="color:${c && c.hp / c.hpMax < 0.4 ? '#f54' : '#9ff'}">${c ? Math.max(0, Math.round(100 * c.hp / c.hpMax)) : 0}%</b>` +
      (b && b.sinking === undefined ? ` &nbsp;·&nbsp; <b style="color:#f54">BATTLESHIP AT SEA ${Math.round(100 * b.hp / b.hpMax)}%</b>` : ` &nbsp;·&nbsp; ENEMY BATTLESHIP <b style="color:${eb > 70 ? '#f54' : '#fb6'}">${Math.floor(eb)}%</b>`);
    if (_hud.war !== html) { _hud.war = html; $('war').innerHTML = html; }
    const now = performance.now(), fh = feedItems.filter(f => now - f.at < 14000).map(f => `<div style="color:${f.kind === 'good' ? '#7f9' : f.kind === 'bad' ? '#f86' : '#cde'};opacity:${Math.min(1, (14000 - (now - f.at)) / 2000).toFixed(2)}">${f.t}</div>`).join('');
    if (_hud.feed !== fh) { _hud.feed = fh; $('feed').innerHTML = fh; }
  }
  setText('pad', keyboardOnly ? 'KEYBOARD ONLY' : CTL.state.source && CTL.state.source !== 'NONE' ? `${CTL.state.source}${CTL.state.hasPedals ? ' + PEDALS' : ''}  ·  J CONTROLS` : readPad() ? 'CONTROLLER' : 'KEYBOARD');
  setStyle('radar', 'display', G.mode === 'zarch' ? 'block' : 'none');
  setStyle('bot', 'width', G.craft === 'jet' ? '440px' : '300px'); setStyle('hint', 'left', G.craft === 'jet' ? '470px' : '');
  if (G.craft === 'jet') {
    setText('alt', JP.hudLine());
    setText('hint', switchHover ? `${JP.cockpit.labelOf(switchHover)}  -  CLICK` : JP.hint());
    if (performance.now() - (Z.mapT || 0) > (bigMap ? 60 : 120)) { Z.mapT = performance.now(); drawMap(); }
  } else if (G.mode === 'zarch') {
    const hb = holeOf(Z.pos.x, Z.pos.z), alt = Z.pos.y - 0.9 - (hb ? hb.h : groundY(Z.pos.x, Z.pos.z)), bd = Math.hypot(Z.pos.x - HOME_B.x, Z.pos.z - HOME_B.z);
    const ias = Math.hypot(Z.vel.x, Z.vel.z) * 1.944, hdg = ((H.heading() * 180 / Math.PI) + 360) % 360, c = Z.ctl || {};
    setText('alt', hueyLine(ias, hdg, Math.max(0, hb ? Z.pos.y + HELI.SKID_Y - hb.h : H.agl), c));
    setText('hint', switchHover ? `${cockpit.labelOf(switchHover)}  -  CLICK` : G.rescue ? `EMERGENCY LANDING  -  FUEL DROP IN ${Math.max(0, Math.ceil(G.rescue.t))}s` : hueyHint() || padHint());
    if (performance.now() - (Z.mapT || 0) > (bigMap ? 60 : 120)) { Z.mapT = performance.now(); drawMap(); }
  } else {
    const c = Z.ctl || {};
    setText('alt', `COLL ${(H.coll * 100).toFixed(0)}%  NR ${(H.rpm * 100).toFixed(0)}%  TQ ${H.torque.toFixed(0)} PSI  VS ${T.vy.toFixed(1)}  ${c.sas ? 'ASSIST' : 'MANUAL'}  ${T.pod && T.pod.attached ? 'POD ON THE LINE' : ''}${SY.rpmWarn ? '  RPM!' : ''}`);
    const nearTank = T.tanks.some(t => t.fuel > 0 && Math.hypot(t.x - T.x, t.y - T.y) < 10) && G.cargo < CARGO_MAX;
    setText('hint', switchHover ? `${switchHover.toUpperCase()}  -  CLICK TO OPERATE` : G.rescue ? `EMERGENCY LANDING  -  FUEL RUN IN ${Math.max(0, Math.ceil(G.rescue.t))}s` : nearTank && !T.beamOn ? 'HOVER OVER THE TANK AND HOLD S / R (WINCH) TO DRAIN IT' : G.cargo >= CARGO_MAX ? 'CARGO FULL  -  CLIMB OUT AND TAKE IT HOME' : T.caveT < 8 ? 'HAT OR MOUSE AIMS THE DOOR GUN' : '');
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
const lightPool = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
lightPool.renderOrder = 3; zScene.add(lightPool);
const _ld = new THREE.Vector3();
function updateLandingLight(inCave) {
  lightPool.visible = false;
  if (!G.light || inCave || !Z.alive || G.state !== 'play') return;   // (inCave is also passed true while flying the jet)
  _ld.set(0, -0.8, -0.6).applyQuaternion(H.q).normalize();   // fixed light under the nose, angled forward-down
  for (let t = 1; t < 70; t += 1) {
    const x = H.pos.x + _ld.x * t, y = H.pos.y + _ld.y * t, z = H.pos.z + _ld.z * t, gy = groundY(x, z);
    if (y <= gy) { lightPool.visible = true; lightPool.position.set(x, gy + 0.15, z); const k = 1.2 + t * 0.22; lightPool.scale.set(k, 1, k * 1.4); lightPool.material.opacity = 0.45 * (1 - t / 75); return; }
  }
}
const _wv0 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _yAx = new THREE.Vector3(0, 1, 0), _zAx = new THREE.Vector3(0, 0, 1), _xAx = new THREE.Vector3(1, 0, 0);
// camA is the 3D flight camera (fixed or chase); camS the side-on cave camera. zCam renders a blend of the two, so
// diving into the shaft swings the view round to the 2.5D side view with no cut.
const camA = new THREE.PerspectiveCamera(), camS = new THREE.PerspectiveCamera(), SIDE_FOV = 38, SIDE_VIEWH = 30 * CS;
let camB = 0;
function updateCamsAndMeshes(dt, time) {
  const P = Z.pos, inCave = G.mode === 'thrust' && !!T.lvl, jet = G.craft === 'jet' && G.state !== 'title';
  { const want = jet ? clamp(480 + zCam.position.y * 1.3, 480, 1400) : DRAW; view.draw += (want - view.draw) * Math.min(1, 1.5 * dt); if (Math.abs(view.draw - want) < 1) view.draw = want; }
  if (inCave) {   // keep Z.pos on the ship so the 3D camera keeps following it through the swing
    caveToWorld(T.x, T.y, P); T.zOff *= Math.exp(-5 * dt); P.z = T.base.z + T.zOff;
  }
  heliModel.animate(heliLook(), dt, time, cockpit.group.visible);
  if (Z.alive && G.state === 'play' && (D.fire || D.hp.engine < 0.5) && Math.random() < (D.fire ? 0.9 : 0.35)) {
    const p = _wv0.set(0, 1.3, 1.4).applyQuaternion(shipMesh.quaternion).add(shipMesh.position);
    if (D.fire) fx.add.spawn(p.x, p.y, p.z, rnd(-1, 1), rnd(2, 4), rnd(-1, 1), rnd(0.3, 0.6), 1, 0.3, 1, rnd(.4, .6), .1, 0.9, -1.5, 1);
    fx.trail(p.x, p.y, p.z, D.fire ? 1.2 : 0.8);
  }
  for (const b of BASES) {
    b.funnel.visible = camB < 0.5;
    const d = Math.hypot(zCam.position.x - b.x, zCam.position.z - b.z), f = 1 - smooth(view.draw * 0.45, view.draw * 0.85, d);
    b.beam.visible = f > 0.01; b.beam.material.opacity = (b.kind === 'home' ? 0.35 : 0.3) * f;
  }
  for (const b of BASES) if (b.group) b.group.visible = b === T.base && inCave || Math.hypot(zCam.position.x - b.x, zCam.position.z - b.z) < 140;
  baseGroup.userData.ring.material.color.setHSL((time * 0.5) % 1, 1, 0.6);
  if (G.state === 'title') {
    const a = time * 0.07, c = war.carrier.p; camA.position.set(c.x + Math.cos(a) * 95, 30, c.z + Math.sin(a) * 95); camA.lookAt(c.x, 8, c.z);   // the ALBATROSS on station
  } else if (jet) {
    if (cockpitCam && JP.alive && !JP.ejected) {
      const h = CTL.state.actions && CTL.state.actions.lookhat !== false;   // POV hat looks around the cockpit
      if (h && (CTL.state.hatX || CTL.state.hatY)) { head.yaw = clamp(head.yaw - CTL.state.hatX * 2.2 * dt, -2.6, 2.6); head.pitch = clamp(head.pitch + CTL.state.hatY * 1.6 * dt, -1.1, 0.9); }
      else if (!freeLook || (document.pointerLockElement !== canvas && !h)) { const k = Math.exp(-6 * dt); head.yaw *= k; head.pitch *= k; }   // T (free look off) re-centres
      JP.cockpitCam(camA, dt, head);
    } else JP.chaseCam(camA, dt);
  } else if (cockpitCam && !inCave && Z.alive) {
    // pilot's eye, rigidly in the airframe, with the Huey's two-per-rev bounce (stronger with load, ETL shudder, blade stall)
    camA.position.copy(EYE).applyQuaternion(H.q).add(H.pos); camA.quaternion.copy(H.q).multiply(_q2.setFromAxisAngle(_yAx, head.yaw)).multiply(_q2.setFromAxisAngle(_xAx, HELI.EYE_PITCH + head.pitch));   // eyes down a little to the panel, plus free look
    if (document.pointerLockElement !== canvas || !freeLook) { const k = Math.exp(-6 * dt); head.yaw *= k; head.pitch *= k; }   // released or free look off: back to centre and stay there
    const sh = (0.002 + 0.02 * H.vib + 0.03 * D.mods().vib) * H.rpm, b2 = 0.004 * (0.3 + H.coll + 2 * H.vib) * H.rpm * Math.sin(time * 2 * H.omega); camA.position.x += (Math.random() - 0.5) * sh; camA.position.y += (Math.random() - 0.5) * sh + b2;
  } else if (chaseCam && !inCave) {
    const k = 1 - Math.exp(-3 * dt); _cf.x = lerp(_cf.x, Z.facing.x, k); _cf.z = lerp(_cf.z, Z.facing.y, k);
    const m = Math.hypot(_cf.x, _cf.z) || 1; _cf.x /= m; _cf.z /= m;
    _tgt.set(P.x - _cf.x * 30, P.y + 10, P.z - _cf.z * 30); camA.position.lerp(_tgt, 1 - Math.exp(-6 * dt));
    camA.position.y = Math.max(camA.position.y, groundY(camA.position.x, camA.position.z) + 3);
    camA.lookAt(P.x + _cf.x * 14, P.y - 1, P.z + _cf.z * 14);
  } else {
    _tgt.set(P.x, P.y + 12, P.z + 28); camA.position.lerp(_tgt, 1 - Math.exp(-5 * dt));
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
    _tgt.set(camS.position.x, (T.base ? T.base.h : PAD_H) + 16, camS.position.z);
    const a = (1 - e) * (1 - e), b = 2 * e * (1 - e), cc = e * e;
    zCam.position.set(a * camA.position.x + b * _tgt.x + cc * camS.position.x, a * camA.position.y + b * _tgt.y + cc * camS.position.y, a * camA.position.z + b * _tgt.z + cc * camS.position.z);
    zCam.quaternion.slerpQuaternions(camA.quaternion, camS.quaternion, smooth(0, 0.6, e));
  }
  const jetCk = jet && cockpitCam && JP.alive && !JP.ejected, zoomK = jetCk ? Math.max(JP.zoom, CTL.state.actions && CTL.state.actions.zoom ? 1 : 0) : 0;
  const fov = lerp(jetCk ? lerp(74, 30, zoomK) : 62, SIDE_FOV, e); if (Math.abs(zCam.fov - fov) > 0.01) { zCam.fov = fov; zCam.updateProjectionMatrix(); }
  zScene.fog.color.copy(HORIZON).multiplyScalar(1 - 0.85 * e); zScene.fog.near = lerp(view.draw * 0.5, DRAW * 0.8, e); zScene.fog.far = lerp(view.draw, DRAW, e);
  terrainUni.uFogN.value = view.draw * 0.5; terrainUni.uFogF.value = view.draw * 0.97;
  if (Math.abs(zCam.far - (view.draw + 15)) > 2) { zCam.far = view.draw + 15; zCam.updateProjectionMatrix(); }
  sky.scale.setScalar(view.draw / DRAW);
  if (fx.shake > 0.01) { const k = fx.shake * (cockpit.group.visible ? 0.1 : 0.4); zCam.position.x += rnd(-k, k); zCam.position.y += rnd(-k, k); zCam.position.z += rnd(-k, k); }
  fx.ear.copy(zCam.position); terrainUni.uTime.value = time;
  sky.position.copy(zCam.position);
  terrain.position.set(Math.round(zCam.position.x / TG) * TG, 0, Math.round(zCam.position.z / TG) * TG);
  farTerrain.visible = view.draw > DRAW + 20; terrainUni.uNear.value.set(terrain.position.x, terrain.position.z, TG * TN / 2 - 3);
  if (farTerrain.visible) farTerrain.position.set(Math.round(zCam.position.x / FAR_C) * FAR_C, 0, Math.round(zCam.position.z / FAR_C) * FAR_C);

  shipShadow.visible = Z.alive && !inCave && G.craft === 'heli'; if (G.craft === 'jet') shipMesh.visible = false;
  if (inCave && T.alive) {
    // side view: the nose points along the thrust like the classic Thrust triangle, top of the ship faces the camera;
    // blended from the 3D attitude while the camera swings so the ship visibly pitches into it
    // side-on helicopter: nose toward its direction of travel (yaws round when it turns), disc tilted by T.ang
    if (T.spin > 0.05) T.yawF += T.spin * 5 * dt;   // tail rotor gone: it pirouettes
    else T.yawF = lerp(T.yawF, -T.face * Math.PI / 2 + Math.round((T.yawF + T.face * Math.PI / 2) / (2 * Math.PI)) * 2 * Math.PI, 1 - Math.exp(-5 * dt));
    _q.setFromAxisAngle(_zAx, -T.ang); _q2.setFromAxisAngle(_yAx, T.yawF); _q.multiply(_q2);
    shipMesh.quaternion.slerpQuaternions(T.q0, _q, e); T.qLast.copy(_q); shipMesh.position.copy(P);
    shipMesh.scale.setScalar(lerp(1, HELI.CAVE_SCALE, e));   // drawn small enough to fit the cave outline (shipPts), skids on its skid line
    shipMesh.position.addScaledVector(_u.set(0, 1, 0).applyQuaternion(shipMesh.quaternion), (HELI.CAVE_SKID - HELI.SKID_Y * lerp(1, HELI.CAVE_SCALE, e)) * e);
  } else if (Z.alive && G.craft === 'heli') {
    shipMesh.quaternion.copy(H.q);
    if (e > 0) shipMesh.quaternion.slerp(T.qLast, e);   // still turning back from the side view after the climb out
    shipMesh.position.copy(P); shipMesh.scale.setScalar(lerp(1, HELI.CAVE_SCALE, e));
    const gy = groundY(P.x, P.z), alt = P.y - gy;
    shipShadow.position.set(P.x, gy + 0.12, P.z); const sc = 2.4 + alt * 0.03; shipShadow.scale.set(sc, 1, sc); shadowMat.opacity = clamp(0.5 - alt * 0.006, 0.12, 0.5);
  }
  const inCockpit = cockpitCam && !inCave && e < 0.01 && Z.alive && G.state !== 'title' && G.craft === 'heli';
  cockpit.group.visible = inCockpit; for (const o of heliShell) o.visible = !inCockpit;   // seen from inside, the outer shell only gets in the way
  const near = inCockpit || jetCk ? 0.05 : 0.5; if (zCam.near !== near) { zCam.near = near; zCam.updateProjectionMatrix(); }
  updateLandingLight(inCave || jet); updateBombSight(inCave || e > 0.05 || jet);
  switchHover = inCockpit || jetCk ? pickSwitch() : null;
  if (G.craft === 'jet') JP.render(dt, time, jetCk, switchHover);
  if (inCockpit) cockpit.update(H, dt, heliPanel(switchHover));
  const caveAimOn = inCave && T.alive && T.aimX !== undefined && e > 0.9 && G.state === 'play';
  reticle.visible = (Z.alive && !inCave && G.state !== 'title' && !jet) || caveAimOn; aimLine.visible = reticle.visible && !inCockpit;
  if (caveAimOn) _wv0.set(T.aimX, T.aimY, 0); else _wv0.copy(Z.aim);
  if (reticle.visible) {
    reticle.position.copy(P).addScaledVector(_wv0, caveAimOn ? 7 * CS * 0.7 : 40);   // far enough out that it never sits on the helicopter reticle.quaternion.copy(zCam.quaternion);
    reticle.scale.setScalar(2 * reticle.position.distanceTo(zCam.position) * Math.tan(zCam.fov * Math.PI / 360) / innerHeight);
    const a = aimLine.geometry.attributes.position, s0 = caveAimOn ? 2.2 : 3; a.setXYZ(0, P.x + _wv0.x * s0, P.y + _wv0.y * s0, P.z + _wv0.z * s0); a.setXYZ(1, reticle.position.x, reticle.position.y, reticle.position.z); a.needsUpdate = true; aimLine.geometry.computeBoundingSphere();
  }
  beam3.visible = rope.obj.visible = false;
  if (T.lvl) {
    const pod = T.pod, zo = inCave ? T.zOff / CS : 0;
    podMesh.position.set(pod.x, pod.y, 0); podMesh.visible = T.base.kind === 'enemy' && !T.base.st.podTaken;
    if (BASES[0].resTank) BASES[0].resTank.userData.bar.scale.y = Math.max(0.01, G.res / RES_MAX);
    beam3.visible = inCave && T.alive && T.beamOn && G.fuel > 0;
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

let last = performance.now(), fpsAcc = 0, fpsN = 0, fogT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const now0 = performance.now();
  updateDynRes(now - last);
  const rdt = (now - last) / 1000, dt = Math.min(rdt, 0.1); last = now;   // the sims substep, so they keep real time down to 10 fps
  fpsAcc += rdt; fpsN++; if (fpsAcc > 1) { $('dbg').textContent = `${Math.round(fpsN / fpsAcc)} fps  ·  res ${Math.round(pixRatio * 100)}%`; fpsAcc = 0; fpsN = 0; }
  CTL.poll(dt);
  const inp = readInput();
  if (inp.start && !padWasStart) { sfx.init(); pressStart(); }
  padWasStart = inp.start;
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0 && G.state !== 'paused') say(''); }
  if (G.state === 'play') {
    if (G.mode === 'zarch') updateZarch(dt, inp); else updateThrust(dt, inp);
    war.update(dt, PL, params.has('peace'));
    fogT -= dt; if (fogT <= 0) { fogT = 0.25; fog.update(war.visionSources(PL)); war.setVisibility(fog); updateFogImg(); }
  } else if (G.state === 'trans') {
    const tr = G.tr; tr.t += dt; const D = 0.8;
    if (tr.phase === 0) { $('fade').style.opacity = Math.min(1, tr.t / D); if (tr.t >= D) { tr.swap(); tr.phase = 1; tr.t = 0; } }
    else { $('fade').style.opacity = Math.max(0, 1 - tr.t / D); if (tr.t >= D) { G.state = 'play'; $('fade').style.opacity = 0; $('fadeText').textContent = ''; } }
  }
  fx.update(dt);
  const t1 = performance.now();
  updateCamsAndMeshes(dt, now / 1000);
  updateHud();
  const t2 = performance.now();
  fx.setView(zCam, renderer.domElement.height, zScene.fog);
  renderer.render(zScene, zCam);
  const t3 = performance.now(), pk = 0.05;   // smoothed per-frame CPU cost: sim, scene/HUD prep, render submit
  PROF.sim += ((t1 - now0) - PROF.sim) * pk; PROF.prep += ((t2 - t1) - PROF.prep) * pk; PROF.render += ((t3 - t2) - PROF.render) * pk;
}
const PROF = { sim: 0, prep: 0, render: 0 };
buildCaves(); war.reset(); resetZarch(true); updateFogImg();
requestAnimationFrame(frame);
if (params.has('debug')) { window.__G = { G, Z, T, H, HI, SY, HELI, D, JP, CTL, view, launchJet, swapToHeli, get cockpitCam() { return cockpitCam; }, set cockpitCam(v) { cockpitCam = v; }, THREE, fx, PL, ISLANDS, PADS, PAD, HOME_B, terrainH, head, hurtHeli, cockpit, zCam, PROF, renderer, newGame, war, fog, nav, BASES, command, get selIsl() { return selIsl; }, set selIsl(v) { selIsl = v; }, enterCave, respawnHome, exitCave, get camB() { return camB; } }; if (params.has('auto')) newGame(); if (params.has('thrust')) { newGame(); const b = BASES[+params.get('thrust') || 0]; Z.pos.set(b.x, b.h - 1, b.z); Z.vel.set(0, -4, 0); enterCave(b); } }
