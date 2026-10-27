import * as THREE from 'three';
import { buildLevel } from './level.js';
import { buildCaveMesh, makeTurret, makeTank, makePod, makeRope } from './cave3d.js';
import { Sfx } from './audio.js';
import { createDamage, PARTS } from './damage.js';
import { HELI, EYE, buildHeliMesh, buildCockpit, createHeliSim, createHeliInput, createHeliSystems, fuelBurnPct } from './heli.js';
import { BOUND, ISLANDS, islandH, createNav, SEA_FLOOR, inZone, fleetStart } from './world.js';
import { createWar, COST } from './war.js';
import { createSpectator } from './sim/spectator.js';   // SIM MODE
import { createMarkerLayer, mapBar } from './ui/markerlayer.js';   // UNIT MARKERS (ngc/healthbars): icon + health bar over every unit
import { hpOf } from './ui/unitmarkers.js';
import { CARRIER } from './ships.js';
import { createFog, FOG_GLSL, fogPatch } from './fog.js';
import { RK } from './renderkit/adopt.js';
import { useSceneEnvironment, RKS as RK_SURF } from './renderkit/gamemats.js';   // RENDERKIT surface: shared unit materials (scene environment hand-over)
import { padGLSL, shaftRingGLSL, bindXR as bindDetailXR, applyWorldDetail } from './renderkit/detail.js';   // RENDERKIT materials (ngc/depth-materials)
import { createGamePost, postQuality } from './renderkit/gamepost.js';   // RENDERKIT post: desktop AO, bloom, filmic grade (never in XR)
import { RKUI, UIC, applyUI } from './renderkit/ngcui.js';   // RENDERKIT ui: design-system menus / overlays / HUD (classic colours with ?rk=0)
import { RK_TERRAIN_GLSL, RK_SKY_GLSL, createWorldUniforms, createWorldSky, linearOutput } from './renderkit/world.js';   // RENDERKIT world
import { createSunShadows, SUN_SHADOW_GLSL, BALANCE as RKL_BAL, matchOverlayLights } from './renderkit/light.js';   // RENDERKIT light: sun shadows + light balance
import { drawDistance, radialFog } from './world/visibility.js';
import { zoneGrid, SURF_NAMES, GEOLOGY, geologyOf, zoneSurf } from './world/terrain.js';   // (zoneSurf: RENDERKIT nature clutter)
import { createNatureShared, createForest, createClutter, NATURE_TERRAIN_GLSL, CL } from './renderkit/nature.js';   // RENDERKIT nature
import { treeKind, PINE, BROAD, SCRUB, natureHash } from './world/forest.js';   // RENDERKIT nature: species by geology / altitude
import { RK_HAZE_GLSL, RK_CLOUD_GLSL, installAtmosphere, createAtmosphere } from './renderkit/atmosphere.js';
import { createTerrainMaterial, RT_GLSL, RT_GRASS_GLSL, TERRAIN_ON, TER_LAYERS, TL as RTL, rkN2js, sstep } from './renderkit/terrainmat.js'; import { createOutcrops } from './renderkit/outcrops.js';   // RENDERKIT terrain: generated ground textures, splatting, smooth normals   // RENDERKIT sky
radialFog(THREE);
const RKW = RK.on('world');   // RENDERKIT world: terrain / sea / sky / scene.environment (renderkit/world.js); off = the classic shaders
// RENDERKIT sky: clouds, sun, aerial perspective on every material (Three's fog chunks, patched before anything compiles)
// and the land past the draw distance (renderkit/atmosphere.js). Off: the fog fades to one colour as before.
const RKS = RK.on('sky');
const RKN = RK.on('nature');   // RENDERKIT nature: trees, scrub, ground clutter, terrain near detail (renderkit/nature.js)
if (RKS) installAtmosphere();
import { createFx } from './fx.js';
import { createControls } from './hotas.js';
import { createXR } from './xr/runtime.js';
import { createXRBench } from './xr/bench.js';   // ?xrbench: the one-click in-headset VR benchmark
import { createJetPlay } from './jetplay.js';
import { createDrop } from './drop.js';
import { createHelm } from './helm.js';
// FOUNDATION: crafts (the registry), the ground host, the soldier on foot, ground vehicles, the HORNET's adapter
import { createCraftHost } from './craft.js';
import { createGround } from './ground.js';
import { createFootCraft } from './foot.js';
import { createMarine } from './marine.js';   // wave 2 (ngc/foot2): the 1980 Marine on foot
import { createDispenser, createRwrCue, RWR } from './units/defence/cm.js';   // ngc/cmpolish: flares / chaff, radar warning
import { createVehicleCraft } from './vehicle.js';
import { createJetCraft } from './craftjet.js';
import { createTomcatCraft } from './crafttomcat.js';   // TOMCAT: the flyable F-14A (crafttomcat.js, units/air/tomcatplay.js)
import { createCH46Craft } from './units/air/rotary/ch46craft.js';   // ngc/ch46fly: the flyable CH-46E Sea Knight
import { DECK_OPS } from './units/naval/deckops.js';
const isJet = () => G.craft === 'jet' || G.craft === 'tomcat';   // TOMCAT: the fixed-wing crafts share the HORNET's hooks below
// COMMANDER: the player commands the task force - the fleet ledger (lives -> unit counts), the command board (\),
// the Huey's AI crew and the jets' wingman who fly a unit the commander leaves
import { createFleet } from './units/commander/fleet.js';
import { createCommander } from './units/commander/board.js';
import { createTechUI } from './techui.js';   // TECH TREE: the RESEARCH page (the tree itself is war.tech, techtree.js)
import { createHeliAI } from './units/commander/heliai.js';
import { createWingman, wingmanEnv } from './units/commander/wingman.js';
import { createAirlift } from './units/air/airlift/airlift.js';   // AIRLIFT: the Huey's cargo hook (sling loads) and troop lift
import { createAirdrop, AIR_COST } from './units/air/airlift/airdrop.js';   // AIRLIFT: C-130 heavy drop of vehicles from the command board
import { createMotorPool } from './units/wheeled/motorpool.js';   // ngc/wheeledgame: the M151A2, M35A2 and 1980 civilian cars (replace the TEST CAR)
import { createSeaUniforms, updateSeaUniforms, SEA_VS_DECL, SEA_VS, SEA_FS_DECL, SEA_FS_NORMAL, SEA_FS_FOAM, SEA_FS_WATER, SEA_FS_UNDER } from './units/naval/seasurface.js';   // SEAWORLD: the sea surface
import { createSeaLife } from './units/naval/sealife.js';   // SEALIFE (ngc/waterfish): fish, the sea bed, the view under water
import { createWorldSolid } from './world/solid.js';   // SEAWORLD: buildings as colliders, piers and bridges as floors
import { createInteriors } from './interiors/interiors.js';   // ngc/interiors: enterable buildings, doors / hatches, the ALBATROSS inside
import { createSeats } from './interiors/seats.js';           // ngc/interiors: passenger seats in the Huey / CH-46, the people in the seats
import { DOORS } from './interiors/doors.js';
import { createWorldLife } from './world/life.js'; import { clearedAt, clearingAt, structAngle as natStructAngle } from './world/net.js';   // WORLD: the lived-in world (towns, roads, traffic, people, faction structures)
// ARMOUR (wave 2): the M60A3 TTS and M113A2 as crafts on the island world, their sights, the LCM-8 delivery
import { createArmorWorld } from './units/armor/armorworld.js';
import { createArmorCraft } from './units/armor/armorcraft.js';
import { createSight } from './units/armor/armorsight.js';
import { createArmorDelivery } from './units/armor/armordelivery.js';
import { planHards, hardsH, onHard } from './units/armor/landinghard.js';
import { buildHardMesh } from './units/armor/lcm8.js';

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
let XR = null, XRB = null;   // XRB: ?xrbench (xr/bench.js)
let chaseCam = params.has('chase'), cockpitCam = params.has('cockpit'), bigMap = false;
const _cf = { x: 0, z: -1 };
let keyboardOnly = params.has('kb');
const FIRE_KEYS = ['KeyF', 'KeyX'];
addEventListener('keydown', e => {
  if ((e.ctrlKey && !e.code.startsWith('Control')) || e.altKey || e.metaKey) return;   // Ctrl alone is collective-down
  // COMMANDER: the command board has the keyboard while it is open (the unit you are in gets nothing; the war goes on)
  if (commander.isOpen && G.state === 'play' && !CTL.isOpen) { if (e.repeat || commander.key(e)) { e.preventDefault(); sfx.init(); return; } }
  if (airdrop.watching && G.state === 'play' && !CTL.isOpen && !e.repeat && airdrop.key(e.code)) { e.preventDefault(); return; }   // AIRLIFT: watching a C-130 drop (V views, \ / Esc back)
  if (techUI.isOpen && G.state === 'play' && !CTL.isOpen) { if (e.repeat || techUI.key(e)) { e.preventDefault(); sfx.init(); return; } }   // TECH TREE
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  sfx.init();
  if (e.repeat) return;
  if (CTL.isOpen) return;   // the controls panel has the keyboard
  if (G.state === 'paused') { menuKey(e); return; }
  if (e.code === 'Escape' && G.state === 'play') { openMenu(); return; }
  if (e.code === 'F8' && G.state === 'play') { e.preventDefault(); say(`UNIT MARKERS: ${markers.cycle()}`, 1.5); return; }   // UNIT MARKERS: all / damaged only / off
  // FOUNDATION key routing: Y gets in / out, [ ] change seat, then the craft you are in has first pick of every key
  // (jetplay.js, foot.js, vehicle.js ...); what it leaves falls through to the helicopter and the global keys below.
  if (G.state === 'play' && commandKey(e.code, e.shiftKey)) return;   // COMMANDER: \ the command board, / the next unit out
  if (G.state === 'play' && G.mode === 'zarch') {
    if (((e.code === 'Digit6' && e.shiftKey) || e.code === 'F6') && !e.repeat) { e.preventDefault(); say(war.upgradeCarrier({ free: true, instant: true }), 2.5); return; }   // SHIFT+6 (or F6 where the browser lets it through): the SKY CARRIER now, free, from any unit (6 alone is the 300-materiel refit)
    if (motorKey(e.code)) return;   // ngc/wheeledgame: 7 then 1 / 2 picks the motor pool's delivery
    if (e.code === 'KeyY') { getInOut(); return; }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { crafts.cycleSeat(e.code === 'BracketRight' ? 1 : -1); return; }
    if (e.code === 'KeyU' && G.craft !== 'heli' && G.craft !== 'jet' && liftConsole()) return;   // SEAWORLD: run a deck-edge lift (before the craft: foot / vehicles swallow U)
    if (G.craft !== 'heli' && crafts.active && crafts.active.key(e.code, e)) return;
  }
  if (G.craft === 'heli') {   // the Huey's switches (heli.js / damage.js)
    if (G.state === 'play' && G.mode === 'zarch' && airlift.key(e.code)) return;   // AIRLIFT: . troops (R, the cargo hook, comes through the controls)
    if (e.code === 'KeyH') { if (drop.flying) drop.toggleAP(); else doSwitch('sas'); }
    const sw = { KeyI: 'engine', KeyO: 'fire', KeyU: 'hyd', KeyL: 'radio', KeyN: 'light' }[e.code];
    if (sw) doSwitch(sw);
    const cmk = HUEY_CM_KEYS[e.code]; if (cmk && G.mode === 'zarch' && Z.alive && !drop.controlling && !helm.active) cmH.press(cmk);   // CM: M130 flares / chaff
  }
  if (e.code === 'KeyJ') HI.startCalibration();   // the controls panel: bind and calibrate HOTAS / pedals (hotas.js)
  if (e.code === 'KeyT' && (G.craft === 'heli' || isJet())) toggleFreeLook();
  if (e.code === 'KeyM') { bigMap = !bigMap; setMapSize(); if (bigMap && document.pointerLockElement) document.exitPointerLock(); }
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'].includes(e.code)) command(+e.code.slice(5));   // TOMCAT: 8; ARMOUR: 9 M60A3, 0 M113A2
  if (e.code === 'Tab') { e.preventDefault(); toggleHelm(); }
  if (G.craft !== 'heli' && !isJet()) { /* foot / vehicles: V and C belong to the craft (above) */ }
  else if (e.code === 'KeyV' && drop.flying) drop.toggleView();
  else if (e.code === 'KeyV' && helm.active) helm.toggleView();
  else if (e.code === 'KeyV') { cockpitCam = !cockpitCam; if (!cockpitCam && document.pointerLockElement) document.exitPointerLock(); say(cockpitCam ? 'COCKPIT VIEW' : (chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA'), 1.2); }
  if (e.code === 'KeyC' && G.craft === 'heli') { cockpitCam = false;  chaseCam = !chaseCam; Z.hd = Math.atan2(Z.facing.x, -Z.facing.y); say(chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA', 1.2); }
  if (e.code === 'KeyK') { keyboardOnly = !keyboardOnly; say(keyboardOnly ? 'KEYBOARD ONLY' : 'CONTROLLER ENABLED', 1.5); }
  if (e.code === 'KeyP' && G.state === 'play') openMenu();
  if (['Enter', 'Space'].includes(e.code)) pressStart();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let mouseFire = false;
addEventListener('mousedown', e => { if (e.button === 0 && !XR?.motionInput) { mouseFire = true; sfx.init(); } });
addEventListener('mouseup', () => mouseFire = false);
const kd = (...c) => c.some(k => keys.has(k));
const THR_AXIS = params.has('throttle') ? +params.get('throttle') : -1;
const dz = v => Math.abs(v) < 0.12 ? 0 : Math.sign(v) * (Math.abs(v) - 0.12) / 0.88;
let padWasStart = false;

// On foot only a standard game controller drives the soldier: the HOTAS stick, throttle and rudder pedals are flight
// controls and never move, aim or fire the infantryman (they stay bound for the aircraft and vehicles).
function readGamepad() {
  if (XR?.pad) return XR.pad;
  if (keyboardOnly) return null;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [], devs = (CTL.state && CTL.state.devices) || [];
  for (const p of pads) {
    if (!p || !p.connected || p.mapping !== 'standard') continue;
    if (/044f|thrustmaster|t\.?flight|hotas|throttle|rudder|pedal|joystick/i.test(p.id)) continue;
    if (devs.some(d => d.index === p.index && d.role && d.role !== 'gamepad')) continue;
    return p;
  }
  return null;
}
function readPad() {
  if (XR?.motionInput) return G.craft === 'heli' ? null : XR.pad;
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
  const p = G.craft === 'heli' ? readPad() : null;   // the jet reads its HOTAS through CTL; foot / vehicles read input.pad
  if (p) {
    const gx = dz(p.axes[0] || 0), gy = dz(p.axes[1] || 0);
    if (gx !== 0) inp.x = gx;
    if (gy !== 0) inp.y = gy;
    const b = i => p.buttons[i] && p.buttons[i].pressed;
    if (b(0) || b(5)) inp.fire = true;
    if (b(1) || b(2) || b(7)) inp.thrK = 1;
    if (b(3) || b(4) || b(6)) inp.beam = 1;
    if (THR_AXIS >= 0 && p.axes[THR_AXIS] !== undefined) inp.thrK = Math.max(inp.thrK, clamp((1 - p.axes[THR_AXIS]) / 2, 0, 1));
    if(!p.xr) inp.start = p.buttons.some(x => x && x.pressed);
  }
  if (XR?.motionInput) { inp.fire ||= !!XR.input.actions.fire; inp.x = XR.input.stick.x; inp.y = XR.input.stick.y; }
  return inp;
}

// ---------------------------------------------------------------- renderer
const canvas = $('gl');
// cockpit switches: what the crosshair / cursor is over, and click to operate it
const switchRay = new THREE.Raycaster(), mouseNdc = new THREE.Vector2();
let switchHover = null;
let switchClick = false;
let mouseAimT = -1e9;
addEventListener('mousemove', e => { mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouseAimT = performance.now(); });
function pickSwitch(ray = null) {
  const ck = drop.cockpitView ? drop.deck : G.craft === 'jet' ? JP.cockpit : G.craft === 'tomcat' ? tomcatC.cockpitObj() : G.craft === 'heli' ? cockpit : armCk() || (crafts.active && crafts.active.switches ? crafts.active.switches() : null);   // ARMOUR crew stations; ngc/wheeledgame: a craft's own switches
  if (!ck || !ck.group.visible) return null;
  if (ray) switchRay.ray.copy(ray); else switchRay.setFromCamera(document.pointerLockElement === canvas ? _ndc0 : mouseNdc, zCam);
  const hit = switchRay.intersectObjects(ck.hitBoxes, false)[0];
  return hit && hit.distance < 2.5 ? hit.object.userData.sw : null;
}
const _ndc0 = new THREE.Vector2(0, 0);
function operateSwitch(id, alternate = false) {
  if (drop.cockpitView) drop.clickSwitch(id,alternate); else if (G.craft === 'jet') JP.click(id); else if (G.craft === 'tomcat') tomcatC.click(id); else if (armCk()) crafts.active.click(id); else if (G.craft !== 'heli' && crafts.active && crafts.active.click) crafts.active.click(id); else doSwitch(id);
}
addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  switchClick = false;
  if (G.state !== 'play' || e.target !== canvas) return;
  const id = pickSwitch(); if (!id) return;
  switchClick = true;
  e.stopImmediatePropagation(); e.preventDefault(); operateSwitch(id);
}, { capture: true });
function armCk() { const a = crafts.active; return a && (a === m60C || a === m113C) && G.state === 'play' ? a.cockpitObj() : null; }   // ARMOUR: clickable crew stations (armorstations.js)
// cockpit free look: click the view to capture the mouse (Esc releases it and the head re-centres; middle click centres)
const head = { yaw: 0, pitch: 0 };
let freeLook = true;   // T toggles: off releases the mouse and locks the view to the centre (the cursor then works the switches)
function toggleFreeLook() {
  freeLook = !freeLook;
  if (freeLook) { if (cockpitCam && G.state === 'play') canvas.requestPointerLock?.(); say('FREE LOOK ON  -  MOUSE TO LOOK', 1.4); }
  else { if (document.pointerLockElement) document.exitPointerLock(); say('FREE LOOK OFF  -  VIEW LOCKED TO CENTRE', 1.4); }
}
// on foot and in ground vehicles the mouse always looks (the craft's look()); in the aircraft it moves the head
const craftLooks = () => G.craft !== 'heli' && !isJet() && crafts.active && G.mode === 'zarch';
canvas.addEventListener('click', () => {
  // A switch's mousedown already consumed the action; its following click must not capture the cursor.
  if (switchClick) { switchClick = false; return; }
  if ((((cockpitCam || helm.bridgeView || drop.cockpitView) && freeLook) || craftLooks()) && G.state === 'play' && !document.pointerLockElement) canvas.requestPointerLock?.();
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas) return;
  if (craftLooks()) { if (G.state === 'play') crafts.active.look(e.movementX, e.movementY); return; }
  if (!freeLook) return;
  head.yaw = clamp(head.yaw - e.movementX * 0.0025, -2.5, 2.5); head.pitch = clamp(head.pitch - e.movementY * 0.0025, -1.1, 0.8);
});
addEventListener('mousedown', e => { if (e.button === 1 && document.pointerLockElement === canvas) { head.yaw = head.pitch = 0; e.preventDefault(); } });
addEventListener('wheel', e => { if (G.craft === 'jet' && cockpitCam) JP.zoom = clamp(JP.zoom + (e.deltaY < 0 ? 0.25 : -0.25), 0, 1); else if (G.craft === 'tomcat' && cockpitCam) tomcatC.zoom(e.deltaY < 0 ? 0.25 : -0.25); }, { passive: true });
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const PR_MAX = params.has('res') ? +params.get('res') : Math.min(devicePixelRatio, 1.5);
let pixRatio = PR_MAX; renderer.setPixelRatio(pixRatio);
// RENDERKIT post: toneMapping stays NoToneMapping (the game's look, display-referred; see renderkit/gamepost.js).
// The post targets follow the drawing buffer each frame, so dynamic resolution needs nothing extra.
// ?rkpost=low|medium|high picks the tier (renderkit/gamepost.js POST_TIERS), ?rkpost=off leaves the post out.
const rkPost = RK.on('post') && postQuality() !== 'off' ? createGamePost(renderer, { reducedMotion: () => !!fx?.reducedMotion }) : null;
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
const G = { craft: 'heli', heliStowed: false, crewDownT: 0, jetDownT: 0, tomcatDownT: 0, light: false, n2: 0, res: 250, mat: 90, rockets: ROCKETS_MAX, bombs: BOMBS_MAX, cargo: 0, state: 'title', mode: 'zarch', score: 0, hi: 0, fuel: 100, visit: 0, tr: null, msgT: 0, over: false };
// COMMANDER: the fleet (units/commander/fleet.js) - reserves of every unit type. The old counters stay as views of it:
// G.lives = Hueys in reserve (it was the spare helicopters), G.jets / G.tomcats = jets in the hangar.
const fleet = createFleet();
for (const [k, id] of [['lives', 'heli'], ['jets', 'jet'], ['tomcats', 'tomcat']]) Object.defineProperty(G, k, { get: () => fleet.n[id], set: v => { fleet.n[id] = v; }, enumerable: true });
try { G.hi = +(localStorage.getItem('tz_hi') || 0); } catch (e) {}
// first-person (cockpit) field of view, vertical degrees: the Huey, the Hornet (its zoom scales from it) and the
// dropship flight deck; set in the pause menu, remembered per browser
const CK_FOV = { min: 40, max: 100, def: 70 };
let ckFov = CK_FOV.def; try { ckFov = clamp(+(localStorage.getItem('tz_ckfov') || CK_FOV.def), CK_FOV.min, CK_FOV.max) || CK_FOV.def; } catch (e) {}
function setCkFov(v) { ckFov = clamp(Math.round(v), CK_FOV.min, CK_FOV.max); try { localStorage.setItem('tz_ckfov', ckFov); } catch (e) {} }
// SEAWORLD: the sea state (pause menu SEA STATE slider, 0-7) and WEATHER DRIFT (the sea wanders round it over a war),
// remembered per browser. A ?sea= in the URL wins (and leaves the drift off unless ?seadrift), so tests are repeatable.
const SEA_PREF = { def: 4, ss: 4, drift: false };
try { const v = localStorage.getItem('tz_sea'); if (v !== null && Number.isFinite(+v)) SEA_PREF.ss = clamp(Math.round(+v), 0, 7); SEA_PREF.drift = localStorage.getItem('tz_seadrift') === '1'; } catch (e) {}
function setSeaPref(v) { SEA_PREF.ss = clamp(Math.round(v), 0, 7); try { localStorage.setItem('tz_sea', SEA_PREF.ss); } catch (e) {} if (war) war.setSea(SEA_PREF.ss); }
function setSeaDrift(on) { SEA_PREF.drift = !!on; try { localStorage.setItem('tz_seadrift', on ? '1' : '0'); } catch (e) {} if (war) war.setSeaDrift(SEA_PREF.drift); }
// the pause menu's sliders: value, range, label, the small print, the step for LEFT / RIGHT
const SLIDERS = {
  fov: { min: CK_FOV.min, max: CK_FOV.max, nudge: 5, get: () => ckFov, set: v => setCkFov(v), show: v => `${v}°`, small: `FIRST-PERSON VIEWS: HUEY, HORNET, DROPSHIP, ON FOOT, VEHICLES  ·  LEFT / RIGHT  ·  DEFAULT ${CK_FOV.def}°` },
  sea: { min: 0, max: 7, nudge: 1, get: () => SEA_PREF.ss, set: v => setSeaPref(v), show: v => `${v}  ${war ? war.sea.name : ''}${SEA_PREF.drift && war ? `  (NOW ${war.sea.ss.toFixed(1)})` : ''}`, small: `SWELL, WHITECAPS AND HOW THE SHIPS PITCH AND ROLL  ·  0 GLASSY ... 7 HIGH  ·  DEFAULT ${4}` },
};
function addScore(n) { G.score += n; if (G.score > G.hi) { G.hi = G.score; try { localStorage.setItem('tz_hi', G.hi); } catch (e) {} } }
let war = null;   // the island war (created once the world exists)
let SIM = null;   // SIM MODE (?sim): CPU vs CPU, you watch (sim/spectator.js)
let markerFP = '';   // UNIT MARKERS: the first-person view this frame ('' outside; see markerView)
const sayMsg = (t, s) => say(t, s);
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
const terrainH0 = (x, z) => {   // (ARMOUR: terrainH below is this plus the landing hards)
  let h = islandH(x, z);
  for (const b of BASES) h = lerp(b.h, h, smooth(BASE_R, 60, Math.hypot(x - b.x, z - b.z)));   // flat apron round the shaft
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r1) h = lerp(p.h, h, smooth(p.r0, p.r1, d)); }   // flat pads
  for (const b of BASES) h = lerp(Math.max(h, b.h), h, stripW(x, z, b));                      // ground over the cave
  return h;
};
// ARMOUR: a LANDING HARD on each island (landinghard.js): a concrete ramp at 1 in 5 from the sea bed up through the cliffs,
// where an LCM-8 puts an M60A3 / M113A2 ashore and an M113 drives down to swim. Part of the terrain for everyone.
const HARDS = planHards(ISLANDS, terrainH0, {
  pads: PADS, holes: BASES, cleared: (x, z) => clearedAt(x, z),
  keepOut: I => { if (I.name !== 'IRONHOLD') return []; const a = Math.atan2(-I.z, -I.x); for (let r = 20; r < I.r + 60; r += 2) { const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r; if (terrainH0(x, z) < 2.5) return [{ x, z, r: 40 }]; } return []; },   // the RUNAWAY shipyard (war.js coastPoint)
});
const terrainH = (x, z) => hardsH(HARDS, x, z, terrainH0(x, z));
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
// RENDERKIT sky: the fog's near distance is only the start of the end-of-world dissolve; the aerial perspective does the rest
// (FOG_TN: where the terrain starts turning into the far land; from 0.6 the fog of war's dimming has faded out by the
// draw distance as it did under the classic fog, instead of leaving a dark band on the horizon)
const FOG_N = RK.on('sky') ? 0.8 : 0.5, FOG_TN = RK.on('sky') ? 0.6 : 0.5;
zScene.fog = new THREE.Fog(HORIZON, DRAW * FOG_N, DRAW);
const zCam = new THREE.PerspectiveCamera(62, 1, 0.5, DRAW + 15);
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a34, 0.9); zScene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 1.1); sun.position.set(0.5, 1, 0.3); zScene.add(sun);
// RENDERKIT light: two-cascade sun shadows that follow the camera, and a warmer sun against a cooler, weaker sky
// (renderkit/light.js; the terrain / sea shader reads the same maps under RK_LIGHT). Off: no shadow maps, the values above.
const rkLight = RK.on('light') ? createSunShadows({ renderer, scene: zScene, sun, hemi, groundY: (x, z) => groundY(x, z) }) : null;

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
const SURF_W = { grass: [0,0,0,0], sand: [255,0,0,0], wetsand: [255,0,0,0], rock: [0,255,0,0], mud: [0,0,255,0], dirt: [0,0,0,255], shingle: [0,150,0,105], marsh: [0,0,150,0] };
const surfTex = (() => {
  const Z = zoneGrid(), a = new Uint8Array(HM_N * HM_N * 4), weights = SURF_NAMES.map(n => SURF_W[n]);
  for (let j=0;j<HM_N;j++) for(let i=0;i<HM_N;i++) {
    const zi=Math.round((-BOUND+i*TG+Z.E)/Z.C), zj=Math.round((-BOUND+j*TG+Z.E)/Z.C);
    a.set(weights[Z.s[zj*Z.N+zi]], (j*HM_N+i)*4);
  }
  const t = new THREE.DataTexture(a, HM_N, HM_N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
const decorTex = (() => {   // r = nearest pad index + 1, g = nearest shaft index + 1 (0 = none near)
  const a = new Uint8Array(DEC_N * DEC_N * 4);
  for (let j = 0; j < DEC_N; j++) for (let i = 0; i < DEC_N; i++) {
    const x = -BOUND + (i + 0.5) * DEC_C, z = -BOUND + (j + 0.5) * DEC_C, k = (j * DEC_N + i) * 4;
    PADS.forEach((p, n) => { if (Math.hypot(x - p.x, z - p.z) < 33) a[k] = n + 1; });
    BASES.forEach((b, n) => { if (Math.hypot(x - b.x, z - b.z) < 25) a[k + 1] = n + 1; });
    let bd = 200; ISLANDS.forEach((I, n) => { const d = Math.hypot(x-I.x,z-I.z)-I.r; if(d<bd){bd=d;a[k+2]=n+1;} });
  }
  const t = new THREE.DataTexture(a, DEC_N, DEC_N, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
// Past the control zone the world goes on for ever (world.js: continents, mountain ranges, forests). Inside the zone
// the terrain reads the baked core heightmap above; outside it reads two heightmaps baked around the camera by a
// worker (terrainworker.js) from the same height function the physics uses: 2 km at 4 m and 8 km at 16 m. They are
// re-baked as you travel. The near window blends from its previous coverage; forests stream in stable world chunks.
const HW_N = 512;
const HW = [{ c: 4, recentre: 280, trees: 0, uni: 'uHMNo' }, { c: 16, recentre: 1000, trees: 0, uni: 'uHMFo' }].map(L => {
  const tex = new THREE.DataTexture(new Float32Array(HW_N * HW_N).fill(SEA_FLOOR), HW_N, HW_N, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true; return { ...L, tex, cx: 1e9, cz: 1e9, busy: false };
});
const previousNear = new THREE.DataTexture(HW[0].tex.image.data.slice(), HW_N, HW_N, THREE.RedFormat, THREE.FloatType);
previousNear.minFilter = previousNear.magFilter = THREE.NearestFilter; previousNear.needsUpdate = true;
const terrainWorker = new Worker(new URL('./terrainworker.js', import.meta.url), { type: 'module' });
terrainWorker.onmessage = ({ data: d }) => {
  const L = HW[d.id]; L.busy = false;
  if (d.id === 0 && L.ready) {
    previousNear.image = { ...L.tex.image }; previousNear.needsUpdate = true;
    terrainUni.uHMNpo.value.copy(terrainUni.uHMNo.value); terrainUni.uHMNblend.value = 0;
  }
  L.tex.image.data = d.h; L.tex.needsUpdate = true; L.ready = true; terrainUni[L.uni].value.set(d.ox, d.oz, d.c);
  if (d.id === 1) { buildFarMap(d); atmo?.farHeights(d); }   // RENDERKIT sky: the land past the draw distance
};
function terrainStream(x, z, dt = 0) {
  terrainUni.uHMNblend.value = Math.min(1, terrainUni.uHMNblend.value + dt / 1.2);
  HW.forEach((L, id) => {
    if (L.busy || (id === 0 && terrainUni.uHMNblend.value < 1)) return;
    const step = L.c * 32, cx = Math.round(x / step) * step, cz = Math.round(z / step) * step;
    if (Math.abs(cx - L.cx) < L.recentre && Math.abs(cz - L.cz) < L.recentre) return;
    L.busy = true; L.cx = cx; L.cz = cz;
    terrainWorker.postMessage({ id, n: HW_N, c: L.c, ox: cx - HW_N / 2 * L.c, oz: cz - HW_N / 2 * L.c, trees: L.trees });
  });
}
// a small colour map of the far window for the minimap and the jet's moving map
const farMap = { cv: document.createElement('canvas'), ox: 0, oz: 0, size: 0, ready: false };
function buildFarMap(d) {
  const N = 256, k = d.n / N, cv = farMap.cv; cv.width = cv.height = N; const x = cv.getContext('2d'), im = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = d.h[(j * k | 0) * d.n + (i * k | 0)], o = (j * N + i) * 4;
    const col = h <= 0 ? [lerp(28, 8, clamp(-h / 30, 0, 1)), lerp(92, 34, clamp(-h / 30, 0, 1)), lerp(118, 78, clamp(-h / 30, 0, 1))] : h < 3 ? [176, 164, 112] : h < 160 ? [lerp(48, 70, h / 160), lerp(118, 100, h / 160), lerp(50, 52, h / 160)] : h < 440 ? [lerp(110, 140, (h - 160) / 280), lerp(100, 128, (h - 160) / 280), lerp(80, 110, (h - 160) / 280)] : [230, 234, 240];
    im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255;
  }
  x.putImageData(im, 0, 0); Object.assign(farMap, { ox: d.ox, oz: d.oz, size: d.n * d.c, ready: true });
}
const fog = createFog(BOUND, 224); fog.enabled = false; fog.update([]);
const terrainGeo = new THREE.PlaneGeometry(TG * TN, TG * TN, TN, TN); terrainGeo.rotateX(-Math.PI / 2);
// RENDERKIT terrain: generated ground layers (renderkit/terrainmat.js; built on the GPU over the first frames)
const rkTer = RKW && TERRAIN_ON ? createTerrainMaterial(renderer) : null;
if (rkTer && params.has('debug')) window.__rkTerrain = rkTer;
const terrainUni = {
  uFog: { value: HORIZON.clone().convertLinearToSRGB() }, uSun: { value: sun.position.clone() } /* RENDERKIT light may lower the sun; classic (.5, 1, .3) */, uBases: { value: baseUniform }, uPadCol: { value: padUniform }, uTime: { value: 0 },
  uPadP: { value: PADS.map(p => new THREE.Vector4(p.x, p.z, p.isl.cave ? 1 : 0, Math.atan2(p.x, p.z))) },   /* w: the pad yaw (padSpot), RENDERKIT materials turn the H to it */ uHM: { value: hmTex }, uDecor: { value: decorTex }, ...fog.uniforms,
  uHMN: { value: HW[0].tex }, uHMF: { value: HW[1].tex }, uHMNo: { value: new THREE.Vector3(-1e6, -1e6, 4) }, uHMFo: { value: new THREE.Vector3(-1e6, -1e6, 16) },
  uHMNprev: { value: previousNear }, uHMNpo: { value: new THREE.Vector3(-1e6, -1e6, 4) }, uHMNblend: { value: 1 },
  uFogN: { value: DRAW * 0.5 }, uFogF: { value: DRAW * 0.97 }, uNear: { value: new THREE.Vector3(0, 0, 0) },
  uSurf: { value: surfTex }, uSandC: { value: ISLANDS.map(I => new THREE.Color(...GEOLOGY[geologyOf(I)].sand)) }, uRockC: { value: ISLANDS.map(I => new THREE.Color(...GEOLOGY[geologyOf(I)].rock)) },
  ...createSeaUniforms(),   // SEAWORLD: the live sea's waves, whitecaps, ships for the hull foam
  ...(RKW ? createWorldUniforms() : {}),   // RENDERKIT world: the sky the sea reflects, the sun's colour
  ...(rkLight ? rkLight.uniforms() : {}),   // RENDERKIT light: the two shadow cascades
  ...(RKN ? { uNatK: { value: 1 }, uNatR: { value: 170 } } : {}),   // RENDERKIT nature: terrain near detail strength / radius (tier)
  ...(rkTer ? { ...rkTer.uniforms, uGeoS: { value: ISLANDS.map(I => ['limestone', 'sandstone'].includes(geologyOf(I)) ? 1 : 0) } } : {}),   // RENDERKIT terrain: the layers; uGeoS 1 = stratified cliffs, 0 = granite / basalt blocks
};
const RKL_DEF = rkLight ? { RK_LIGHT: 1, RKL_SUN: RKL_BAL.terrSun.toFixed(3), RKL_AMB: RKL_BAL.terrAmb.toFixed(3) } : {};   // RENDERKIT light
const terrainVS = `
    varying vec3 vW; varying float vRaw; uniform sampler2D uHM, uHMN, uHMF, uHMNprev; uniform vec3 uHMNo, uHMFo, uNear, uHMNpo; uniform float uHMNblend;
    #ifdef RK_TERRAIN
    varying vec3 vN;   // RENDERKIT terrain: a smooth normal from the heights (no 2.5-24 m facets)
    #endif
    ${SEA_VS_DECL}
    #ifdef FAR
    const float CELL=24.0;   // FAR_C (declared further down)
    #else
    const float CELL=${TG.toFixed(1)};
    #endif
    float bil(sampler2D t, vec2 g){   // bilinear by hand (float textures may not filter); g in texel units
      vec2 i=floor(g), f=g-i; float n=${HW_N.toFixed(1)};
      float a=texture2D(t,(i+.5)/n).r, b=texture2D(t,(i+vec2(1.5,.5))/n).r, c=texture2D(t,(i+vec2(.5,1.5))/n).r, d=texture2D(t,(i+1.5)/n).r;
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }
    float nearH(sampler2D tex,vec2 g,float farH){
      float edge=min(min(g.x,g.y),min(${(HW_N - 1).toFixed(1)}-g.x,${(HW_N - 1).toFixed(1)}-g.y));
      return edge>1.?mix(farH,bil(tex,g),smoothstep(1.,34.,edge)):farH;
    }
    float hOut(vec2 p){
      float farH=bil(uHMF,(p-uHMFo.xy)/uHMFo.z), h=nearH(uHMN,(p-uHMNo.xy)/uHMNo.z,farH);
      if(uHMNblend<1.) h=mix(nearH(uHMNprev,(p-uHMNpo.xy)/uHMNpo.z,farH),h,smoothstep(0.,1.,uHMNblend));
      return h;
    }
    float hAt(vec2 p){ return max(abs(p.x),abs(p.y))<${BOUND.toFixed(1)} ? texture2D(uHM,((p+${BOUND.toFixed(1)})/${TG.toFixed(1)}+.5)/${HM_N.toFixed(1)}).r : hOut(p); }
    float coarseH(vec2 p){
      vec2 a=floor(p/24.)*24., f=fract(p/24.);
      float h00=hAt(a),h10=hAt(a+vec2(24.,0.)),h01=hAt(a+vec2(0.,24.)),h11=hAt(a+vec2(24.));
      return f.x+f.y<=1.?h00+(h10-h00)*f.x+(h01-h00)*f.y:h11+(h01-h11)*(1.-f.x)+(h10-h11)*(1.-f.y);
    }
    void main(){
      vec4 w=modelMatrix*vec4(position,1.);
      float h=hAt(w.xz), drawCell=CELL;
      #ifndef FAR
      float edge=max(abs(w.x-uNear.x),abs(w.z-uNear.y));
      float morph=smoothstep(uNear.z-70.,uNear.z,edge);
      if(morph>0.) h=mix(h,coarseH(w.xz),morph);
      drawCell=mix(CELL,24.,morph);
      #endif
      vRaw=h; w.y=max(h,0.);
      #ifdef RK_TERRAIN
      { // RENDERKIT terrain: central differences over the drawn lattice (2.5 m zone / 4 m worker map / 24 m far), sea level clamped
        float e=max(drawCell,max(abs(w.x),abs(w.z))<${BOUND.toFixed(1)}?CELL:4.);
        vN=normalize(vec3(max(hAt(w.xz-vec2(e,0.)),0.)-max(hAt(w.xz+vec2(e,0.)),0.),2.*e,max(hAt(w.xz-vec2(0.,e)),0.)-max(hAt(w.xz+vec2(0.,e)),0.))); }
      #endif
      ${SEA_VS.replaceAll('CELL', 'drawCell')}
      vW=w.xyz;
      gl_Position=projectionMatrix*viewMatrix*w;
    }`;
const terrainFS = `
    varying vec3 vW; varying float vRaw; uniform vec3 uFog; uniform vec3 uSun; uniform vec4 uBases[${BASES.length}]; uniform vec3 uPadCol[${PADS.length}]; uniform vec4 uPadP[${PADS.length}];
    uniform float uTime; uniform sampler2D uDecor, uFogT; uniform float uFogB, uFogN, uFogF; uniform vec3 uNear;
    uniform sampler2D uSurf; uniform vec3 uSandC[${ISLANDS.length}], uRockC[${ISLANDS.length}];
    ${FOG_GLSL}
    ${SEA_FS_DECL}
    // RENDERKIT light: the sun's shadow (rkSunShadow) and the light balance; without RK_LIGHT the classic .75 / .4
    #ifdef RK_LIGHT
    #include <packing>
    ${SUN_SHADOW_GLSL}
    #else
    #define RKL_SUN .75
    #define RKL_AMB .4
    #endif
    #ifdef RK_WORLD
    ${RK_TERRAIN_GLSL}
    ${RK_SKY_GLSL}
    #endif
    #if defined(RK_NATURE) && defined(RK_WORLD)   // (RK_NATURE needs the RK world noise; a test may strip RK_WORLD alone)
    ${NATURE_TERRAIN_GLSL}
    #endif
    #if defined(RK_TERRAIN) && defined(RK_WORLD)   // RENDERKIT terrain: the generated layers and the splat
    varying vec3 vN; uniform float uGeoS[${ISLANDS.length}];
    ${RT_GRASS_GLSL}
    ${RT_GLSL}
    #endif
    #ifdef RK_SKY
    ${RK_HAZE_GLSL}
    ${RK_CLOUD_GLSL}
    #endif
    void main(){
      #ifdef FAR
      if(max(abs(vW.x-uNear.x),abs(vW.z-uNear.y))<uNear.z) discard;   // the fine grid covers this
      #endif
      vec3 dc=texture2D(uDecor,(vW.xz+${BOUND.toFixed(1)})/${(2 * BOUND).toFixed(1)}).rgb*255.;
      int pi=int(dc.r+.5)-1, bi=int(dc.g+.5)-1, gi=int(dc.b+.5)-1;
      if(bi>=0 && length(vW.xz-uBases[bi].xy)<${HOLE_R.toFixed(1)}) discard;   // the shaft
      vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
      #if defined(RK_TERRAIN) && defined(RK_WORLD)
      n=normalize(vN);   // RENDERKIT terrain: the smooth normal (lighting, shadows, the far land); the bump comes later
      #endif
      float rkSh=1.;   // RENDERKIT light: 1 lit, 0 in the sun's shadow
      #ifdef RK_LIGHT
      rkSh=rkSunShadow(vW,n);
      #ifdef RK_SKY
      rkSh*=mix(.12,1.,clamp((rkCloudShade(vW)-.62)/.38,0.,1.));   // RENDERKIT light+sky: a cloud blocks most of the direct sun (the ambient stays)
      #endif
      #endif
      float l=max(dot(n,normalize(uSun)),0.)*RKL_SUN*rkSh+RKL_AMB;
      vec2 g=floor(vW.xz/6.); float chk=mod(g.x+g.y,2.);
      #ifdef RK_WORLD
      // RENDERKIT world: createTerrainMaterial's slope / altitude / shoreline / snow blending with FBM variation, on the
      // game's palette. Macro patches (~90 m, ~21 m) everywhere; a ~4 m grain only near the eye (no far shimmer, less cost).
      float rkD=length(cameraPosition-vW), rkM1=rkN2(vW.xz*.011), rkM2=rkN2(vW.xz*.047+3.1);
      float rkM3=rkD<170.?mix(rkN2(vW.xz*.23+7.7),.5,smoothstep(70.,170.,rkD)):.5;
      float rkVar=rkM1*.55+rkM2*.3+rkM3*.15, rkSl=1.-n.y;
      vec3 rkGr=mix(mix(vec3(.14,.37,.12),vec3(.22,.5,.16),smoothstep(.25,.65,rkVar)),vec3(.36,.5,.2),smoothstep(.5,.85,rkM1+max(vW.y,0.)*.0008));
      rkGr*=mix(.955,1.045,chk);   // the Zarch checker, kept at half contrast: the speed and height cue
      vec3 rkRo=mix(vec3(.42,.36,.28),vec3(.55,.5,.43),rkM2)*(.88+.24*rkM3)*(1.+.05*sin(vW.y*.4+rkM2*6.));   // + faint strata
      float wild=step(${BOUND.toFixed(1)},max(abs(vW.x),abs(vW.z)));
      float rk=mix(smoothstep(24.,38.,vW.y),max(smoothstep(170.,300.,vW.y+60.*(rkM1-.5)+18.*sin(vW.x*.013+vW.z*.009)),smoothstep(.2,.4,rkSl+.12*(rkM2-.5))),wild);
      vec3 c=mix(rkGr,rkRo,rk);
      float rkSnow=wild*smoothstep(440.,520.,vW.y+120.*(rkM1-.5)+30.*(rkM2-.5))*(1.-smoothstep(.3,.75,rkSl+.2*(rkM2-.5)));
      c=mix(c,vec3(.93,.95,.98)*(.95+.05*rkM3),rkSnow);
      c=mix(mix(vec3(.62,.56,.37),vec3(.8,.74,.5),smoothstep(.15,1.2,vW.y))*(.94+.12*rkM3),c,smoothstep(0.,3.+2.5*(rkM2-.5),vW.y));   // wet sand at the waterline
      #if defined(RK_NATURE) && defined(RK_WORLD)   // (RK_NATURE needs the RK world noise; a test may strip RK_WORLD alone)
      // RENDERKIT nature: what the ground is made of here (weights for rnDetail); the zone's surface map overrides below
      float rnS=1.-smoothstep(0.,3.+2.5*(rkM2-.5),vW.y), rnR=rk*(1.-rkSnow)*(1.-rnS), rnSn=rkSnow*(1.-rnS), rnSoil=0., rnG=max(0.,1.-rnR-rnSn-rnS);
      #endif
      #else
      vec3 land=mix(vec3(.17,.5,.15),vec3(.25,.6,.19),chk);
      vec3 rock=mix(vec3(.45,.37,.27),vec3(.52,.43,.32),chk);
      float wild=step(${BOUND.toFixed(1)},max(abs(vW.x),abs(vW.z)));
      float rk=mix(smoothstep(24.,38.,vW.y),max(smoothstep(170.,300.,vW.y+18.*sin(vW.x*.013+vW.z*.009)),smoothstep(.8,.62,n.y)),wild);
      vec3 c=mix(land*mix(1.,.8+.2*sin(vW.x*.0021)*sin(vW.z*.0017),wild),rock,rk);
      c=mix(c,vec3(.93,.95,.98),wild*smoothstep(430.,500.,vW.y+30.*sin(vW.x*.011)*cos(vW.z*.009))*smoothstep(.45,.7,n.y));
      c=mix(vec3(.78,.72,.45),c,smoothstep(0.,3.,vW.y));
      #endif
      if(wild<.5 && vRaw>0.) {
        vec4 sw=texture2D(uSurf,((vW.xz+${BOUND.toFixed(1)})/${TG.toFixed(1)}+.5)/${HM_N.toFixed(1)});
        vec3 sd=gi>=0?uSandC[gi]:vec3(.86,.79,.6), rkC=gi>=0?uRockC[gi]:vec3(.55,.53,.5);
        float grass=max(0.,1.-dot(sw,vec4(1.)));
        sd*=mix(.72,1.,smoothstep(0.,.8,vRaw));
        #ifdef RK_WORLD
        // RENDERKIT world: the per-point surface types and island geology stay; they gain grain, and steep grass shows rock
        sd*=.93+.14*rkM3; rkC*=.86+.28*rkM2;
        float rkCl=grass*smoothstep(.3,.5,rkSl+.1*(rkM2-.5));
        c=(rkGr*(grass-rkCl)+rkC*(rkCl+sw.g)+sd*sw.r+vec3(.31,.27,.18)*(.85+.3*rkM2)*sw.b+vec3(.47,.38,.26)*(.88+.24*rkM2)*sw.a)/max(1.,grass+dot(sw,vec4(1.)));
        #if defined(RK_NATURE) && defined(RK_WORLD)   // (RK_NATURE needs the RK world noise; a test may strip RK_WORLD alone)
        { float rnT=max(1.,grass+dot(sw,vec4(1.))); rnG=(grass-rkCl)/rnT; rnR=(rkCl+sw.g)/rnT; rnS=sw.r/rnT; rnSoil=(sw.b+sw.a)/rnT; rnSn=0.; }   // RENDERKIT nature
        #endif
        #else
        c=(mix(vec3(.2,.43,.14),vec3(.29,.5,.17),chk*.45)*grass+sd*sw.r+rkC*sw.g+vec3(.31,.27,.18)*sw.b+vec3(.47,.38,.26)*sw.a)/max(1.,grass+dot(sw,vec4(1.)));
        #endif
      }
      float rtR=1., rtAO=1., rtOn=0.;   // RENDERKIT terrain: roughness, cavity AO, splat drawn (the lighting below reads them)
      #if defined(RK_TERRAIN) && defined(RK_WORLD)
      // RENDERKIT terrain: what the ground is made of here, as weights over the generated layers (renderkit/terrainmat.js
      // TL order: grass dry meadow soil mud forest cliff granite sand wetsand snow gravel tarmac track), then the splat
      if(vRaw>0. && uTer.x>.5){
        float W[14]; vec3 TI[14]; for(int L=0;L<14;L++){ W[L]=0.; TI[L]=vec3(1.); }
        vec2 xz=vW.xz; float y=vW.y, nA=rkN2(xz*.43+17.);
        float beach=1.-smoothstep(0.,3.+2.5*(rkM2-.5),y), rockW=rk*(1.-rkSnow)*(1.-beach), snowW=rkSnow*(1.-beach);
        float soilN=smoothstep(.72,.86,rkN2(xz*.19+3.)*.72+rkN2(xz*.83+9.)*.28+rkSl*.35);   // bare soil patches (nature's)
        float scree=wild*smoothstep(.16,.28,rkSl)*(1.-smoothstep(.34,.48,rkSl))*smoothstep(.5,.7,rkN2(xz*.05+1.7));   // loose stone at the foot of slopes
        float forestF=wild*smoothstep(.62,.8,rkN2(xz*.013+8.2))*smoothstep(40.,120.,y)*(1.-smoothstep(380.,450.,y));
        float mudW=0., soilW=0., gravW=0., sandW=beach, strata=wild>.5?step(.5,rkN2(xz*.0011+2.)):(gi>=0?uGeoS[gi]:1.);
        vec3 rkT=wild>.5?mix(vec3(.84,.78,.7),vec3(1.1,1.08,1.07),rkM2):vec3(1.), sdT=vec3(1.);
        if(wild<.5){   // the zone: the per-point surface types and island geology (the sims' surfaces) decide
          vec4 sw=texture2D(uSurf,((vW.xz+${BOUND.toFixed(1)})/${TG.toFixed(1)}+.5)/${HM_N.toFixed(1)});
          float sh=clamp(min(sw.g/.59,sw.a/.41),0.,1.);   // shingle is stored as rock .59 + dirt .41
          float g=max(0.,1.-dot(sw,vec4(1.))), cl=g*smoothstep(.3,.5,rkSl+.1*(rkM2-.5));
          rockW=sw.g*(1.-sh)+cl; sandW=sw.r; mudW=sw.b; soilW=sw.a*(1.-sh); gravW=sh; beach=0.; snowW=0.;
          rkT=(gi>=0?uRockC[gi]:vec3(.55,.53,.5))/RT_BASE[7]*(.92+.16*rkM2);
          sdT=(gi>=0?uSandC[gi]:vec3(.86,.79,.6))/RT_BASE[8];
        }
        float grassW=max(0.,1.-rockW-snowW-sandW-mudW-soilW-gravW);
        vec3 gw=rtGrassW(xz,y);
        float sp=grassW*soilN*.75, fo=grassW*forestF*(1.-soilN), gr=grassW-sp-fo;
        W[0]=gr*gw.x; W[1]=gr*gw.y; W[2]=gr*gw.z; W[3]=soilW+sp; W[4]=mudW; W[5]=fo;
        W[6]=rockW*strata*(1.-scree*.6); W[7]=rockW*(1.-strata)*(1.-scree*.6); W[11]=gravW+rockW*scree*.6;
        float wet=1.-smoothstep(.25,.9+.3*sin(uTime*.55+rkN2(xz*.05)*6.)*.5+.3*nA,y);   // the swash: wet sand comes and goes
        W[8]=sandW*(1.-wet); W[9]=sandW*wet; W[10]=snowW;
        for(int L=0;L<14;L++) W[L]*=.75+.5*(L<3?nA:1.-nA);   // ragged edges between the families
        TI[6]=rkT; TI[7]=rkT; TI[8]=sdT; TI[9]=sdT; TI[11]=mix(vec3(1.),rkT,.5);
        RtOut o=rtSplat(vW,n,W,TI,rkD,1.);
        float m=rtMacro(xz);
        c=o.a*(.86+.28*m)*mix(vec3(1.),vec3(1.06,1.03,.9),smoothstep(.55,.9,m));   // the same macro variation as rtGrassMean (the tufts)
        // the shore: the dark intertidal band on rock (weed and wet stone)
        float tide=1.15+.25*rkN2(xz*.15)+.08*sin(uTime*.4+xz.x*.03), inter=(1.-smoothstep(tide-.35,tide,y))*(W[6]+W[7]+W[11])/max(.001,dot(vec4(W[6],W[7],W[11],grassW+sandW+mudW+soilW),vec4(1.)));
        c=mix(c,mix(vec3(.11,.12,.09),vec3(.16,.2,.11),rkN2(xz*1.7))*(.8+.4*rkN2(xz*5.)),inter*.8); o.r=mix(o.r,.3,inter);
        n=o.n; rtR=o.r; rtAO=o.ao; rtOn=1.;
      }
      #endif
      #if defined(RK_NATURE) && defined(RK_WORLD)   // (RK_NATURE needs the RK world noise; a test may strip RK_WORLD alone)
      if(vRaw>0. && rtOn<.5) rnDetail(c,n,vW,rnG,rnR,rnS,rnSoil,rnSn,rkSl,rkD,uTime);   // RENDERKIT nature: patches, grain, pebbles, strata, shore (n tilted); (RENDERKIT terrain: replaced by the layers)
      #endif
      #ifdef RK_WORLD
      c*=rkSunCol*max(dot(n,normalize(uSun)),0.)*RKL_SUN*rkSh*mix(1.,rtAO,.45)+mix(vec3(.6,.64,.55),vec3(.98,1.01,1.06),n.y*.5+.5)*RKL_AMB*rtAO;   // RENDERKIT world: the sun's colour + hemisphere ambient (RENDERKIT terrain: x cavity AO)
      #if defined(RK_TERRAIN) && defined(RK_WORLD)
      if(rtOn>.5) c+=rtSpec(n,normalize(cameraPosition-vW),normalize(uSun),rtR,rkSunCol)*rkSh;   // RENDERKIT terrain: wet sand, mud, snow, tarmac catch the sun
      #endif
      #else
      c*=l;
      #endif
      if(vRaw<=0.){   // sea: shallows to deep water, the swell (SEAWORLD: the live sea), whitecaps, surf, hull foam
        float d=-vRaw, t=uTime; vec2 p=vW.xz;
        float a1=p.x*.19+t*1.3+sin(p.y*.05), a2=p.y*.23-t*1.1+sin(p.x*.07), a3=(p.x+p.y)*.11+t*.7;
        ${SEA_FS_NORMAL}
        #ifdef RK_WORLD
        { float rkf=(1.-smoothstep(40.,140.,length(cameraPosition-vW)))*rk;   // RENDERKIT world: the kit water's optical ripple, near only
          if(rkf>.001){ vec2 P=p*.65; vec2 s=vec2(cos(P.x+t*.7)+.35*cos(dot(P,vec2(1.7,1.1))-t),sin(P.y*1.3+t*.5)+.25*sin(dot(P,vec2(.8,2.1))+t))*.16*rkf;
            wn=normalize(wn+vec3(s.x,0.,s.y)); wg=normalize(wg+vec3(s.x,0.,s.y)); } }
        #endif
        ${SEA_FS_WATER}   // SEALIFE: clarity - the bed through the water (was a flat shallows-to-deep ramp)
        wc=mix(wc,vec3(.1,.2,.27),sk*.4);   // a rough sea is darker and greyer
        vec3 V=normalize(cameraPosition-vW), L=normalize(uSun);
        #ifdef RK_WORLD
        float rkF=.02+.98*pow(1.-max(dot(V,wn),0.),5.);   // RENDERKIT world: Schlick Fresnel (water F0 .02) reflecting the drawn sky
        vec3 rkR=reflect(-V,wn); rkR.y=abs(rkR.y);
        wc=mix(wc,rkSkyRay(rkR)*mix(1.,.82,sk),min(rkF*.7,.6));   // (.7, cap .6: the shallows and the bed stay readable at low angles)
        #else
        float fr=1.-max(dot(V,wn),0.); fr*=fr; fr*=fr;
        wc=mix(wc,vec3(.62,.76,.9),fr*.55);
        #endif
        wc*=.86+.2*max(dot(wn,L),0.);   // SEAWORLD: the swell's faces turned to the sun are lighter
        float sp=max(dot(reflect(-L,wg),V),0.); sp*=sp; sp*=sp; sp*=sp; sp*=sp; sp*=sp; sp*=sp;   // ~^64, on the glitter normal
        #ifdef RK_LIGHT
        sp*=rkSh; wc*=mix(.8,1.,rkSh);   // RENDERKIT light: no glitter in a hull's shadow, the water a little darker there
        #endif
        wc+=vec3(1.,.95,.8)*sp*1.3*(sp>.002?glitAt(p,t,sk):1.);
        ${SEA_FS_FOAM}
        #if defined(RK_NATURE) && defined(RK_WORLD)   // (RK_NATURE needs the RK world noise; a test may strip RK_WORLD alone)
        foam=max(foam,rnLace(p,d,t,length(cameraPosition-vW)));   // RENDERKIT nature: the swash lace at the waterline
        #endif
        c=mix(wc*(.92+.05*(sin(a1)+sin(a2))),vec3(.88,.94,1.),foam*.8);
        ${SEA_FS_UNDER}   // SEALIFE: the surface from below
      }
      if(bi>=0){ vec4 b=uBases[bi]; float d=length(vW.xz-b.xy);
        if(d<${BASE_R.toFixed(1)}){ vec3 pc=mix(${RK_SURF ? 'vec3(.44,.44,.43)' : 'vec3(.5,.52,.58)'},vec3(.36,.3,.3),b.w)*l;   // RENDERKIT materials: neutral concrete
          if(d<${(HOLE_R + 2.2).toFixed(1)}){ float a=atan(vW.z-b.y,vW.x-b.x); ${RK_SURF ? shaftRingGLSL('l') : 'pc=mix(vec3(.12,.12,.14),mix(vec3(.2,.75,1.),vec3(.85,.15,.1),b.w),step(.5,fract(a*3.82)))*l;'} }   // hazard ring round the shaft mouth
          c=pc; } }
      if(pi>=0){ vec4 q=uPadP[pi]; float d=length(vW.xz-q.xy);
        ${RK_SURF ? padGLSL(PAD_R, 'l') : `if(q.z<.5 && d<26.){ vec2 tl=abs(fract(vW.xz/4.)-.5); c=mix(vec3(.4,.41,.43),vec3(.33,.34,.36),step(.46,max(tl.x,tl.y)))*l; }   // concrete apron
        if(d<${(PAD_R + 2.5).toFixed(1)}){ vec3 pc=vec3(.5,.52,.58)*l; if(d<${PAD_R.toFixed(1)}){float r=d/${PAD_R.toFixed(1)}; pc=mix(vec3(.15,.16,.2),uPadCol[pi],step(.5,fract(r*4.)))*l;} c=pc; }`} }   // RENDERKIT materials: a weathered 1980 helipad (renderkit/detail.js padGLSL)
      c=fogOfWar(c,vW.xz,uTime);
      float fd=length((viewMatrix*vec4(vW,1.)).xyz);
      #ifdef RK_SKY
      // RENDERKIT sky: cloud shadows, then towards the draw distance the ground turns into the dome's far land / far sea
      // (the same look at the same point, so the hand-over is seamless), all under the height-dependent aerial perspective
      { vec3 rkRay=vW-cameraPosition; float rkE=smoothstep(uFogN,uFogF,fd), rkCs=1.;
        #ifndef RK_LIGHT
        rkCs=rkCloudShade(vW);   // without sun shadows the cloud shade darkens the whole colour (with them it is in rkSh)
        #endif
       
        vec3 rkFar=c; if(rkE>0.) rkFar=vRaw>0.?rkFarLand(vW,n):rkFarSeaCol(normalize(rkRay),uFog);   // (only in the hand-over band)
        c=mix(mix(c,uFog,rkE),rkAerial(mix(c,rkFar,rkE)*rkCs,rkRay,uFog),rkHaze.z); }
      #else
      c=mix(c,uFog,smoothstep(uFogN,uFogF,fd));
      #endif
      #ifdef RK_WORLD
      // RENDERKIT world: display values straight out on the default sRGB / no-tone-mapping path (renderkit/world.js
      // linearOutput); otherwise linear out, and Three tone maps and encodes once like every built-in material
      gl_FragColor=vec4(c,1.);
      #ifndef RK_DISPLAY_OUT
      gl_FragColor.rgb=rkToLinear(gl_FragColor.rgb);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #endif
      #else
      gl_FragColor=vec4(c,1.);
      #endif
    }`;
const RK_DEF = { ...(RKW ? { RK_WORLD: 1 } : {}), ...(RKS ? { RK_SKY: 1 } : {}), ...(RKW && RKN ? { RK_NATURE: 1 } : {}), ...(rkTer ? { RK_TERRAIN: 1 } : {}) };   // RENDERKIT world / sky / nature / terrain (RK_NATURE and RK_TERRAIN need RK_WORLD)
const terrainMat = new THREE.ShaderMaterial({ uniforms: terrainUni, vertexShader: terrainVS, fragmentShader: terrainFS, defines: { ...RK_DEF, ...RKL_DEF } });
const terrain = new THREE.Mesh(terrainGeo, RKW ? linearOutput(terrainMat) : terrainMat);   // RENDERKIT world: the define
terrain.frustumCulled = false; zScene.add(terrain);
const FAR_C = 24, FAR_N = 220;   // far ring: 12 m cells out to ~1.5 km, only drawn while the view reaches past the fine grid
const farMat = new THREE.ShaderMaterial({ uniforms: terrainUni, vertexShader: terrainVS, fragmentShader: terrainFS, defines: { FAR: 1, ...RK_DEF, ...RKL_DEF } });   // RENDERKIT world / sky
const farTerrain = new THREE.Mesh(new THREE.PlaneGeometry(FAR_C * FAR_N, FAR_C * FAR_N, FAR_N, FAR_N).rotateX(-Math.PI / 2), RKW ? linearOutput(farMat) : farMat);
farTerrain.frustumCulled = false; farTerrain.visible = false; zScene.add(farTerrain);
// SEAWORLD (the black dome on the horizon): the sky dome and both terrain windows are centred on the camera that
// actually renders, at render time. They used to be placed on zCam in updateCamsAndMeshes; any camera moved after that
// (the tests' scripted cameras: renderer.render patched to move the camera) sat off-centre in a dome 0.97 x the draw
// distance across while the far plane stayed at the draw distance, so the far side of the dome was clipped away and
// the black clear colour showed as a dome above the horizon (and the terrain grid ended short of the view).
sky.frustumCulled = false;
// XR eyes retain tracking-local .position; their prepared matrixWorld includes the moving world rig.
// Read that matrix directly: getWorldPosition() would recompute Three's internally managed eye matrices.
const _renderEye = new THREE.Vector3();
sky.onBeforeRender = (r, s, cam) => { sky.position.setFromMatrixPosition(cam.matrixWorld); sky.updateMatrixWorld(); };
// RENDERKIT world: the kit's sky material on the dome (sun = the DirectionalLight) and zScene.environment, a PMREM of that
// sky rebuilt only when the sun or the weather changes (renderkit/world.js). Off: the classic dome, no environment.
// RENDERKIT sky: the atmosphere takes the dome (clouds, sun, the far land) and hands world.js its environment variant
const atmo = RKS ? createAtmosphere({ scene: zScene, sky, sun, uniforms: terrainUni, renderer }) : null;
if (atmo && params.has('debug')) window.__rkSky = atmo;
const worldSky = RKW ? createWorldSky({ renderer, scene: zScene, sky, sun, uniforms: terrainUni, atmosphere: atmo }) : null;
if (worldSky && params.has('debug')) window.__rkWorld = worldSky;
if (worldSky) useSceneEnvironment();   // RENDERKIT world+surface: glass / metal drop their fallback sky and use zScene.environment (rebuilt with the weather)
bindDetailXR(renderer);   // RENDERKIT materials: shorter detail range and half bump while an XR session runs
const _snapTerrain = cam => { _renderEye.setFromMatrixPosition(cam.matrixWorld); const x = Math.round(_renderEye.x / TG) * TG, z = Math.round(_renderEye.z / TG) * TG; terrainUni.uNear.value.set(x, z, TG * TN / 2 - 3); return [x, z]; };
terrain.onBeforeRender = (r, s, cam) => { const [x, z] = _snapTerrain(cam); terrain.position.set(x, 0, z); terrain.updateMatrixWorld(); };
farTerrain.onBeforeRender = (r, s, cam) => { _snapTerrain(cam); farTerrain.position.set(Math.round(_renderEye.x / FAR_C) * FAR_C, 0, Math.round(_renderEye.z / FAR_C) * FAR_C); farTerrain.updateMatrixWorld(); };
const _nrm = new THREE.Vector3();
const normalAt = (x, z) => { const e = 1.5; return isWater(x, z) ? new THREE.Vector3(0, 1, 0) : _nrm.set(terrainH(x - e, z) - terrainH(x + e, z), 2 * e, terrainH(x, z - e) - terrainH(x, z + e)).normalize().clone(); };
const fx = createFx(zScene, { groundY: (x, z) => Math.max(terrainH(x, z), 0), isWater, normalAt });

// trees
const TREES = [];
{
  let s = 12345; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const geo = RKN ? null : new THREE.ConeGeometry(1.3, 5, 6); geo?.translate(0, 2.5, 0);
  const mesh = RKN ? null : new THREE.InstancedMesh(geo, fogPatch(new THREE.MeshLambertMaterial({ color: 0x1f7a2a, flatShading: true }), fog, terrainUni.uTime), 3200);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); let n = 0;
  for (let i = 0; i < 60000 && n < 3200; i++) {
    const x = (r() * 2 - 1) * BOUND, z = (r() * 2 - 1) * BOUND, h = terrainH(x, z);
    if (h < 2.5 || h > 24 || clearedAt(x, z) || onHard(HARDS, x, z, 6) || PADS.some(p => Math.hypot(x - p.x, z - p.z) < (p.isl.cave ? 16 : 34)) || BASES.some(b => Math.hypot(x - b.x, z - b.z) < 30 || stripW(x, z, b) < 1)) continue;   // WORLD: clearedAt keeps trees off the villages and roads
    const k = 0.7 + r() * 1.1; sc.set(k, k * (0.8 + r() * 0.6), k);
    if (mesh) { m.compose(new THREE.Vector3(x, h, z), q, sc); mesh.setMatrixAt(n, m); } n++; TREES.push({ x, z, y: h, r: 0.9 * k, k });   // (TREES: colliders for the ground host)
  }
  if (mesh) { mesh.count = n; zScene.add(mesh); TREES.mesh = mesh; }   // ARMOUR: the instances a tank pushes over (felled in place)
}
// RENDERKIT nature: the same trees (same places, sizes and colliders as ?rk=0) drawn as species with LOD, plus maquis scrub on
// the hills and ground clutter round the camera (renderkit/nature.js). Off: the classic cones above.
const NAT = RKN ? (() => {
  const shared = createNatureShared();
  const forest = createForest({ scene: zScene, fog, uTime: terrainUni.uTime, shared });
  const geoAt = (x, z) => { const I = ISLANDS.find(I => Math.hypot(x - I.x, z - I.z) < I.r + 60); return I ? geologyOf(I) : 'granite'; };
  { const d = new Float32Array(TREES.length * 4), kinds = new Uint8Array(TREES.length);
    TREES.forEach((t, i) => { d.set([t.x, t.y, t.z, t.k], i * 4); kinds[i] = treeKind(t.x, t.z, t.y, natureHash(Math.round(t.x * 10), Math.round(t.z * 10)), geoAt(t.x, t.z)); });
    forest.add('zone', d, kinds, { far: true }); }
  TREES.fell = (i, dx, dz) => forest.fell('zone', i, dx, dz);   // ARMOUR: a tank lays a tree over (was TREES.mesh.setMatrixAt)
  // is (x, z) open ground where things may grow? (not a road, village, field, hard, pad, base, structure or shaft)
  const open = (x, z, pad = 0) => !(clearedAt(x, z) || onHard(HARDS, x, z, 4 + pad) || PADS.some(p => Math.hypot(x - p.x, z - p.z) < (p.isl.cave ? 22 : 40) + pad) || BASES.some(b => Math.hypot(x - b.x, z - b.z) < BASE_R + 8 + pad || stripW(x, z, b) < 1)
    || (war && ISLANDS.some(I => I.structs && Math.abs(x - I.x) < I.r + 80 && Math.abs(z - I.z) < I.r + 80 && I.structs.some(s => Math.hypot(x - s.x, z - s.z) < (s.r || 4) + 3 + pad))));
  // clutter is finer: it grows in towns and on pasture, kept off the roads (+1.2 m), crop fields, farmyards, the apron,
  // and every building, wall and parked thing the soldier can bump into (world/solid.js footprints + 0.5 m)
  const inPart = (x, z, p, m) => { if (p.r) return Math.hypot(x - p.x, z - p.z) < p.r + m; const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0), dx = x - p.x, dz = z - p.z; return Math.abs(c * dx - s * dz) < p.hw + m && Math.abs(s * dx + c * dz) < p.hl + m; };
  // the pad dressing (world/life.js buildPadDressing, turned to structAngle + 90 deg): the ops shack and the windsock mast
  let padKit0 = null; const padKit = () => padKit0 ||= ISLANDS.filter(I => I.pad).flatMap(I => { const p = I.pad, r0 = p.r || 8.5, a = natStructAngle(I) + Math.PI / 2, c = Math.cos(a), s = Math.sin(a), W = (u, v) => [p.x + u * c + v * s, p.z - u * s + v * c];
    return [[...W(r0 + 9, 4), 3.2], [...W(r0 + 6, 0), 1.2]]; });
  const openGround = (x, z) => !(clearingAt(x, z) || onHard(HARDS, x, z, 3) || PADS.some(p => Math.hypot(x - p.x, z - p.z) < (p.isl.cave ? PAD_R + 4.5 : 27)) || padKit().some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r) || BASES.some(b => Math.hypot(x - b.x, z - b.z) < BASE_R + 1.5)
    || (war && ISLANDS.some(I => I.structs && Math.abs(x - I.x) < I.r + 80 && Math.abs(z - I.z) < I.r + 80 && I.structs.some(s => Math.hypot(x - s.x, z - s.z) < (s.r || 4) + 2)))
    || worldSolid.near(x, z, 1).some(p => inPart(x, z, p, 0.5)));
  // maquis on the zone's hills and between the trees: built once the war has placed its structures (first update)
  let shrubs = false;
  function buildShrubs() {
    shrubs = true; let s = 777; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; const d = [];
    for (let i = 0; i < 90000 && d.length < 5200 * 4; i++) {
      const x = (r() * 2 - 1) * BOUND, z = (r() * 2 - 1) * BOUND, u = r(), w = r();
      const stand = Math.sin(x * 0.021 + Math.sin(z * 0.017) * 2.3) * Math.sin(z * 0.019 - x * 0.006 + 1.3);   // patches of scrub, open grass between
      if (u > 0.25 + 0.6 * Math.max(0, stand)) continue;
      const h = terrainH(x, z); if (h < 3 || h > 90) continue;
      const sy = 2 / Math.hypot(2, terrainH(x + 2, z) - h, terrainH(x, z + 2) - h); if (sy < 0.72 || !open(x, z, 2)) continue;
      d.push(x, h, z, 0.8 + w * 1.3);
    }
    forest.add('zone-scrub', new Float32Array(d), new Uint8Array(d.length / 4).fill(SCRUB));
  }
  // clutter: what the ground is at (x, z) and its RENDERED height (the near grid's triangles over its 2.5 m lattice: inside the
  // zone the lattice is terrainH; outside, the 4 m worker map, i.e. bilinear terrainH on a 4 m lattice - cached)
  const lat4 = new Map(), h4 = (i, j) => { const k = i * 131072 + j; let v = lat4.get(k); if (v === undefined) { if (lat4.size > 60000) lat4.clear(); v = terrainH(i * 4, j * 4); lat4.set(k, v); } return v; };
  const latH = (x, z) => { if (Math.max(Math.abs(x), Math.abs(z)) < BOUND) return terrainH(x, z); const gx = x / 4, gz = z / 4, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j; return (h4(i, j) * (1 - fx) + h4(i + 1, j) * fx) * (1 - fz) + (h4(i, j + 1) * (1 - fx) + h4(i + 1, j + 1) * fx) * fz; };
  const renderH = (x, z) => { const gx = x / TG, gz = z / TG, i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, X = i * TG, Z = j * TG;
    const h00 = latH(X, Z), h10 = latH(X + TG, Z), h01 = latH(X, Z + TG), h11 = latH(X + TG, Z + TG);
    return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz); };
  const rockC = ISLANDS.map(I => GEOLOGY[geologyOf(I)].rock.map(v => v * v * 1.15));   // (the shader's palette is display-ish: squared to linear)
  const SURF_CL = { grass: CL.GRASS, sand: CL.SAND, wetsand: -1, rock: CL.ROCK, mud: CL.MUD, dirt: CL.DIRT, shingle: CL.SHINGLE, marsh: CL.MUD };
  const sample = (x, z) => {
    const y = renderH(x, z); if (y < 0.35 || inHole(x, z)) return null;
    const zone = Math.max(Math.abs(x), Math.abs(z)) < BOUND;
    let s;
    if (zone) { s = SURF_CL[zoneSurf(x, z)]; if (s === undefined || s < 0) return null; if (s === CL.SAND && y > 1.6) s = CL.DUNE; }
    else { const sy = 2 / Math.hypot(2, latH(x + 2, z) - y, latH(x, z + 2) - y); s = y < 2.5 ? (y > 1.4 ? CL.DUNE : CL.SAND) : sy < 0.78 || y > 300 ? (y > 470 ? -1 : CL.ROCK) : CL.GRASS; if (s < 0) return null; }
    if (!openGround(x, z)) return null;
    const I = zone ? ISLANDS.findIndex(I => Math.hypot(x - I.x, z - I.z) < I.r + 40) : -1;
    return { y, s, rock: I >= 0 ? rockC[I] : null };
  };
  const clutter = createClutter({ scene: zScene, fog, uTime: terrainUni.uTime, shared, sample });
  const applyTier = () => { if (terrainUni.uNatK) { terrainUni.uNatK.value = shared.tier.micro; terrainUni.uNatR.value = shared.tier.microR; } clutter.reset(); forest.markDirty(); };
  applyTier();
  let xrTier = null;
  const N = {
    shared, forest, clutter, sample, open, get zoneTrees() { return TREES; },
    why: (x, z) => ({ y: renderH(x, z), surf: zoneSurf(x, z), clear: clearingAt(x, z), hard: onHard(HARDS, x, z, 3), pad: PADS.some(p => Math.hypot(x - p.x, z - p.z) < (p.isl.cave ? PAD_R + 4.5 : 27)) || padKit().some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r), base: BASES.some(b => Math.hypot(x - b.x, z - b.z) < BASE_R + 1.5),
      struct: !!(war && ISLANDS.some(I => I.structs && I.structs.some(s => Math.hypot(x - s.x, z - s.z) < (s.r || 4) + 2))), solid: worldSolid.near(x, z, 1).filter(p => inPart(x, z, p, 0.5)).map(p => p.t) }),   // (debug: why nothing grows here)
    setTier(name) { if (shared.setTier(name)) applyTier(); return shared.tierName; },
    stats: () => ({ tier: shared.tierName, forest: { ...forest.stats }, clutter: { ...clutter.stats } }),
    // once a frame (main loop): the wind clock runs on the game's time (stops in the pause menu), the sun for the
    // translucency, the forest and clutter sets round the camera that renders. XR runs the low tier (and goes back after).
    update(dt, cam, playing) {   // (cam: unused, kept for the call site)
      if (!shrubs && war) buildShrubs();
      if (playing) shared.uniforms.uWind.value += dt;
      shared.uniforms.uNatSun.value.copy(sun.position).normalize(); shared.uniforms.uNatSunCol.value.copy(sun.color);
      const xr = !!(XR && XR.active);
      if (xr && xrTier === null) { xrTier = shared.tierName; N.setTier('low'); } else if (!xr && xrTier !== null) { N.setTier(xrTier); xrTier = null; }
      if (natEye.seen) { forest.update(natEye); clutter.update(natEye); }
    },
    // the forest and clutter sets follow the camera that RENDERS (hooked on terrain.onBeforeRender below): scripted test
    // cameras and XR eyes, not just zCam as the game loop left it
    place(cam) { natEye.position.setFromMatrixPosition(cam.matrixWorld); natEye.far = cam.far; natEye.seen = true;   // (applied in update(): never change buffers mid-render)
    },
  };
  if (params.has('debug')) window.__nature = N;
  const natEye = { position: new THREE.Vector3(), far: 0, seen: false }, terrainOBR = terrain.onBeforeRender;
  terrain.onBeforeRender = (r, s, cam) => { terrainOBR(r, s, cam); if (cam.isPerspectiveCamera) N.place(cam); };   // (terrain always renders, once per eye; not for a shadow map)
  return N;
})() : null;
// RENDERKIT terrain: rock outcrops and boulders as geometry (renderkit/outcrops.js), shaded with the terrain's own rock
// layers and the island's geology; kept off roads, towns, pads, bases and structures (the nature agent's open() test).
const OUTCROPS = rkTer ? (() => {
  const rockC = ISLANDS.map(I => GEOLOGY[geologyOf(I)].rock.map((v, c) => v / TER_LAYERS[RTL.GRANITE].base[c]));
  const strata = ISLANDS.map(I => ['limestone', 'sandstone'].includes(geologyOf(I)));
  const sample = (x, z) => {
    const y = terrainH(x, z); if (y < 0.4 || inHole(x, z)) return null;
    const e = 2, hx = terrainH(x + e, z) - terrainH(x - e, z), hz = terrainH(x, z + e) - terrainH(x, z - e), l = Math.hypot(hx, 2 * e, hz) || 1;   // (normal, unnormalised: -hx, 2e, -hz)
    const nx = -hx / l, nz = -hz / l, sl = 1 - 2 * e / l, zone = Math.max(Math.abs(x), Math.abs(z)) < BOUND;
    if (zone) { if (NAT ? !NAT.open(x, z, 2) : (clearedAt(x, z) || PADS.some(p => Math.hypot(x - p.x, z - p.z) < 40) || BASES.some(b => Math.hypot(x - b.x, z - b.z) < BASE_R + 10))) return null; }
    else if (clearingAt(x, z) || clearedAt(x, z)) return null;
    const m2 = rkN2js(x * 0.047 + 3.1, z * 0.047 + 3.1);
    if (zone) {
      const s = zoneSurf(x, z), I = ISLANDS.findIndex(I => Math.hypot(x - I.x, z - I.z) < I.r + 60); if (s === 'sand' || s === 'wetsand' || s === 'marsh' || s === 'mud') return null;
      const rock = s === 'rock' ? 1 : s === 'shingle' ? 0.5 : sstep(0.3, 0.5, sl) * 0.8;
      return { y, sl, nx, nz, rock, layer: I >= 0 && strata[I] ? 6 : 7, tint: (I >= 0 ? rockC[I] : [1, 1, 1]).map(v => v * (0.92 + 0.16 * m2)) };
    }
    if (y < 3) return null;
    const rock = Math.max(sstep(170, 300, y), sstep(0.2, 0.4, sl)) * (1 - sstep(470, 540, y) * 0.6);
    const wt = [0, 1, 2].map(c => [0.84, 0.78, 0.7][c] + ([1.1, 1.08, 1.07][c] - [0.84, 0.78, 0.7][c]) * m2);
    return { y, sl, nx, nz, rock, layer: rkN2js(x * 0.0011 + 2, z * 0.0011 + 2) > 0.5 ? 6 : 7, tint: wt };
  };
  const oc = createOutcrops({ scene: zScene, ter: rkTer, fog, uTime: terrainUni.uTime, sample, tierName: rkTer.tierName });
  const T = { oc, sample, xr: false, eye: new THREE.Vector3(), seen: false,
    update() {
      const xr = !!(XR && XR.active); if (xr !== T.xr) { T.xr = xr; oc.setTier(xr ? 'low' : rkTer.tierName); }
      if (T.seen) oc.update(T.eye, Math.max(0, terrainH(T.eye.x, T.eye.z)));
    } };
  const obr = terrain.onBeforeRender;   // (follow the camera that renders, like the nature clutter; applied in update())
  terrain.onBeforeRender = (r, s, cam) => { obr(r, s, cam); if (cam.isPerspectiveCamera) { T.eye.setFromMatrixPosition(cam.matrixWorld); T.seen = true; } };
  if (params.has('debug')) window.__outcrops = T;
  return T;
})() : null;
// Wild forests stream with towns in stable tiles (world/life.js).
{   // ARMOUR: the landing hards' concrete, kerbs, marker posts and signs (under the fog of war like the rest of the zone)
  const fp = (m, cls) => cls === undefined ? fogPatch(m, fog, terrainUni.uTime) : applyWorldDetail(fogPatch(m, fog, terrainUni.uTime), { defCls: cls });   // RENDERKIT materials: detail after the fog patch (no-op with ?rk=0)
  const mats = { concrete: fp(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), 2), post: fp(new THREE.MeshLambertMaterial({ color: 0x8c8a84, flatShading: true }), 2), red: fp(new THREE.MeshLambertMaterial({ color: RK_SURF ? 0x9a2c22 : 0xb02a20, flatShading: true }), 5), white: fp(new THREE.MeshLambertMaterial({ color: RK_SURF ? 0xd6d4cc : 0xe8e8e0, flatShading: true }), 5), green: fp(new THREE.MeshLambertMaterial({ color: RK_SURF ? 0x34653a : 0x2f7a3a, flatShading: true }), 5), sign: t => fp(new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })) };
  for (const h of HARDS) zScene.add(buildHardMesh(h, mats));
}
// base
const baseGroup = new THREE.Group(); baseGroup.position.set(HOME_B.x, PAD_H, HOME_B.z); zScene.add(baseGroup);
{
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.y = 45; baseGroup.add(beam); BASES[0].beam = beam;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.7, 0.18, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffee66 }));
  ring.rotation.x = Math.PI / 2; ring.position.set(PAD.x - HOME_B.x, 0.25, PAD.z - HOME_B.z); baseGroup.add(ring); baseGroup.userData.ring = ring; ring.visible = !RK_SURF;   // RENDERKIT materials: no rainbow neon tube on the painted pad (its H, white perimeter and the owner band mark it)
  const mat = applyWorldDetail(new THREE.MeshPhongMaterial({ color: RK_SURF ? 0x8e8c86 : 0x8a92a0, flatShading: true }), { defCls: 2 });   // RENDERKIT materials: weathered concrete, not blue-grey
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
  f.position.set(b.x, b.h - 3.5, b.z); zScene.add(f); b.funnel = f; f.userData.rkShadow = 'receive';   // RENDERKIT light: the shaft funnel's rim sits at ground level (dashed self-shadow ring)
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
// ngc/foot2: putting the Huey somewhere (a teleport, a respawn, a scene) brings it out of the hangar: a stowed Huey (a
// Hornet took the deck) is not simulated, and the deck crew would re-spot it on the carrier when the jet is put away
{ const reset0 = H.reset; H.reset = (...a) => { if (G.heliStowed) unstowHeli(); return reset0(...a); }; }
const HI = createHeliInput({ keyDown: kd, CTL, hwOn: () => !!XR?.motionInput || !keyboardOnly, say: (t, s) => say(t, s) });
const SY = createHeliSystems({ D, G, say: (t, s) => say(t, s) });   // electrics, engine start, governor, cautions
const heliAI = createHeliAI(), heliAIenv = { ground: (x, z) => Math.max(terrainH(x, z), 0, war ? war.deckY(x, z) : -1e9) };   // COMMANDER: the Huey's crew when the commander is elsewhere
const Z = {
  pos: new THREE.Vector3(PAD.x, PAD_H + 0.9, PAD.z), vel: new THREE.Vector3(), lean: new THREE.Vector2(), facing: new THREE.Vector2(0, -1),
  aim: new THREE.Vector3(0, 0, -1), aimOff: new THREE.Vector2(), hd: 0, sector: -1, round: 0, throttle: 0, landed: true, alive: true, deadT: 0, fireCd: 0, wave: 0, waveT: 2,
};
// ---------------------------------------------------------------- the island war (war.js)
const nav = createNav(terrainH);
const seaSpot = (x, z) => { const [wx, wz] = nav.nearestWater(x, z); return [wx, wz, Math.atan2(wx, wz)]; };   // facing the map centre
const PSTORE = { get fuel() { return G.res; }, set fuel(v) { G.res = v; }, get mat() { return G.mat; }, set mat(v) { G.mat = v; }, get fuelMax() { return RES_MAX; } };
// FOUNDATION: everything the player can control is a craft (craft.js); PL is how war.js sees whichever one you are in
const crafts = createCraftHost({ G, Z, say: (t, s) => say(t, s) });
const PL = crafts.PL;
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
  if (G.craft !== 'heli') stowCrafts();   // out of the jet / off your feet / out of a vehicle: the title has the helicopter
  G.state = 'title'; G.mode = 'zarch'; $('title').style.display = 'flex'; $('title').querySelector('h1').textContent = title;
  $('result').textContent = `${why}  -  SCORE ${G.score}`; if (document.pointerLockElement) document.exitPointerLock();
}
war = createWar({
  scene: zScene, fx, sfx, terrainH, isWater, nav, ISLANDS, BASES, G: PSTORE, feed, addScore, ear: zCam.position,
  carrierStart: seaSpot(...fleetStart(1)), enemyStart: seaSpot(...fleetStart(2)),
  player: () => PL, hurtPlayer: (a, why, at, dir, kind) => hurtPlayer(a, why, at, dir, kind), onOwner: islandOwnerChanged, onEnd: warOver,
});
if (params.has('sea')) war.setSeaDrift(params.has('seadrift')); else { war.setSea(SEA_PREF.ss); war.setSeaDrift(SEA_PREF.drift); }   // SEAWORLD
const markers = createMarkerLayer({ war, fog, sim: params.has('sim'), before: $('hud'), query: params.get('markers'), keepOut: '#tl,#war,#feed>div,#tr,#bot,#radar,#hint,#simov .pan,#simov .top,#simov .tl,#simov .map,#simov .keys' });   // UNIT MARKERS (game/js/ui/)
if (params.has('debug')) window.__MK = markers;   // (tests)
const world = createWorldLife({ scene: zScene, fx, sfx, terrainH, isWater, nav, war, fog, uTime: terrainUni.uTime, view, ISLANDS, PADS, BASES, nature: NAT });   // WORLD (world/life.js); nature: RENDERKIT nature (wild forests as instances)
// ---------------------------------------------------------------- the HORNET (jetplay.js)
const jetGroundY = (x, z) => Math.max(terrainH(x, z), 0, war.deckY(x, z));   // no shaft holes for a jet: the apron is solid
const jetPlayCtx = {   // TOMCAT: shared by the HORNET (jetplay.js) and the TOMCAT (units/air/tomcatplay.js)
  scene: zScene, war, fx, sfx, say, feed, CTL, GRAV, CARRIER, BOUND, keyDown: kd, groundY: jetGroundY, waterAt, addScore,
  takeFuel: u => { const t = Math.max(0, Math.min(u, G.res)); G.res -= t; return t; },
  onCarrier: (x, z) => { const u = war.shipAt(x, z); return !!u && u === war.carrier && u.sinking === undefined; },
  selectedIsland: () => selIsl, drawMap: (c, k) => drawJetMap(c, k), catClear: () => { const c = war.carrier; return !!c && laneClear(c, c.yaw) > 320; },
  deckSpot: (A, env, who) => deckSpot(A, env, who), deckStatus: A => { const e = war.deck.entries.find(e => e.A === A); return e ? war.deck.status(e) : ''; },
};
// (ngc/bugsweep) DECK OPS: the player's jet joins the ALBATROSS launch queue (units/naval/deckops.js). Straight onto cat 1
// when nobody is ahead and the deck is open (as before); else spotted, and the director taxis her up. Asked again while
// in the queue: the commander's priority - next onto the cat, straight from the spot. -> 'cat' | 'spot' | 'bump' | ''
function deckSpot(A, env, who) {
  const DO = war.deck, c = war.carrier; if (!c || c.sinking !== undefined) return '';
  const old = DO.entries.find(e => e.A === A);
  if (old) { if (A.cat) return 'cat'; DO.bump(old); return A.cat ? 'cat' : 'bump'; }
  A.cat = null; A.tow = null;
  const e = DO.request({ name: who === 'TOMCAT' ? 'TOMCAT (YOU)' : 'HORNET (YOU)', A, kind: who.toLowerCase(), player: true,
    attach: () => { const ok = A.attachCat(env); if (ok) say(`${who} ON CAT 1  -  ${who === 'TOMCAT' ? 'THROTTLES' : 'THROTTLE'} TO MIL FOR THE SHOT`, 3); return ok; },
    onCancel: () => {} });
  if (DO.quick(e)) return 'cat';
  if (e.state === 'hangar') { DO.cancel(e, 'DECK FULL'); say('DECK FULL  -  EVERY SPOT IS TAKEN, TRY AGAIN SHORTLY', 2.5); return ''; }
  return 'spot';
}
const deckCancel = A => { const e = war.deck.entries.find(e => e.A === A); if (e) war.deck.cancel(e, 'STOOD DOWN'); A.tow = null; };
const JP = createJetPlay({
  ...jetPlayCtx,
  onLost: (why, ejected) => jetC.lost(why, ejected), onEject: () => {}, toggleView: () => { cockpitCam = !cockpitCam; if (!cockpitCam) JP.snapChase(); },
});
// open water ahead of the carrier's bow along heading yaw: how far (m) before land comes up
function laneClear(c, yaw, max = 700) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), bx = c.p.x - Math.sin(c.yaw) * 66, bz = c.p.z - Math.cos(c.yaw) * 66;
  for (let d = 0; d <= max; d += 15) if (terrainH(bx + fx * d, bz + fz * d) > -1) return d;
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
// 5 on the ALBATROSS deck: climb into a Hornet on the catapult (craftjet.js); Y on deck: get out and walk
war.deckHooks.obstacles = (c, toL) => {   // DECK OPS: what the player leaves on the deck fouls it
  const out = [];
  if (ch46C.present()) {
    const p = ch46C.P.S.body.pos, [lx, lz] = toL(p[0], p[2]), hy = p[1] - c.p.y - CARRIER.DECK;
    if (hy < 14 && Math.abs(lx) < 16 && Math.abs(lz) < 64) out.push({ lx, lz, r: 12, why: 'THE SEA KNIGHT IS ON THE DECK' });
  }
  if (Z.alive && !G.heliStowed && G.mode === 'zarch') { const [lx, lz] = toL(H.pos.x, H.pos.z), hy = H.pos.y - c.p.y - CARRIER.DECK; if (hy < 12 && Math.abs(lx) < 16 && Math.abs(lz) < 64) out.push({ lx, lz, r: 7.5, why: 'THE HUEY IS ON THE DECK' }); }
  for (const [D, A] of [[jetC, JP.J], [tomcatC, tomcatC.TP.A]]) if (D.present() && D.park.on) { const [lx, lz] = toL(A.pos.x, A.pos.z); if (Math.abs(lx) < 16 && Math.abs(lz) < 64) out.push({ lx, lz, r: 4, why: `THE ${D.label} IS PARKED IN THE WAY` }); }
  return out;
};
war.deckHooks.landing = (c) => {   // the player's jet on approach: hook and gear down, behind the ship, inside 3 km, below 400 m
  for (const [D, A] of [[jetC, JP.J], [tomcatC, tomcatC.TP.A]]) if (D.present() && !D.park.on && !A.onGround && A.hookCmd && A.gearCmd && Math.hypot(A.pos.x - c.p.x, A.pos.z - c.p.z) < 3000 && A.pos.y < c.p.y + 400) return true;
  return false;
};
war.deckHooks.recovery = () => [jetC, tomcatC].some(d => d.present() && d.wing?.needsLane);
const launchJet = () => jetC.launch();
const swapToHeli = () => getInOut();
// the AMPCD moving map (drawn in world metres; k = pixels per metre)
function drawJetMap(c, k) {
  c.fillStyle = 'rgb(10,38,74)'; c.fillRect(Z.pos.x - 6000, Z.pos.z - 6000, 12000, 12000);
  if (farMap.ready) c.drawImage(farMap.cv, farMap.ox, farMap.oz, farMap.size, farMap.size);
  c.imageSmoothingEnabled = true; c.drawImage(landImg, -BOUND, -BOUND, 2 * BOUND, 2 * BOUND); c.drawImage(fogImg, -BOUND, -BOUND, 2 * BOUND, 2 * BOUND);
  c.strokeStyle = 'rgba(255,220,120,.7)'; c.lineWidth = 2 / k; c.setLineDash([12 / k, 10 / k]); c.strokeRect(-BOUND, -BOUND, 2 * BOUND, 2 * BOUND); c.setLineDash([]);
  c.save(); c.translate(-BOUND + 8 / k, -BOUND + 22 / k); c.scale(1 / k, 1 / k); c.fillStyle = 'rgba(255,220,120,.9)'; c.font = 'bold 15px monospace'; c.textAlign = 'left'; c.fillText('CONTROL ZONE', 0, 0); c.restore();
  c.lineWidth = 2 / k;
  for (const I of ISLANDS) { if (!fog.exploredAt(I.pad.x, I.pad.z)) continue; c.strokeStyle = I.seen < 0 ? '#999' : OWN_COL[I.seen]; c.beginPath(); if (I.cave) c.rect(I.pad.x - 14, I.pad.z - 14, 28, 28); else c.arc(I.pad.x, I.pad.z, 14, 0, 6.283); c.stroke(); if (I === selIsl) { c.strokeStyle = '#ff8'; c.beginPath(); c.arc(I.pad.x, I.pad.z, 26, 0, 6.283); c.stroke(); } }
  for (const u of war.units) {
    if (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z)) continue; c.fillStyle = u.side === 1 ? '#6ef' : '#f64';
    if (u.dims) { c.save(); c.translate(u.p.x, u.p.z); c.rotate(-u.yaw); c.fillRect(-u.dims.W / 2, -u.dims.L / 2, u.dims.W, u.dims.L); c.restore(); } else c.fillRect(u.p.x - 6, u.p.z - 6, 12, 12);
  }
}
// the para-drop repair team (logistics on land): a dropship from the carrier, a jump run, canopies, a crew that runs over
const drop = createDrop({
  scene: zScene, fx, sfx, war, groundY, terrainH, isWater, say, feed,
  home: () => { const s = spawnSpot(); return { x: s.x, z: s.z }; },
  onFuel: k => { G.fuel = Math.min(100, G.fuel + k); sfx.refuel?.(); },
  onRepaired: () => { const fixed = D.damaged(); D.fieldRepair(); sfx.pickup(); say(fixed ? 'FIELD REPAIR DONE  -  FLY HER HOME' : 'CREW DONE  -  FUEL ABOARD  -  FLY HER HOME', 3); },
  onFail: () => {}, onEnd: () => { G.rescue = null; },
  setThrottle: v => HI.setCollective(v), takeStick: () => {}, releaseStick: () => HI.setCollective(G.heliColl ?? 0), head,
});
// the SKY CARRIER's bridge: Tab on its deck takes the helm
const helm = createHelm({ war, say, groundY });
function toggleHelm() {
  if (G.state !== 'play' || G.mode !== 'zarch' || G.craft !== 'heli') return;
  if (helm.active) { leaveHelm(); return; }
  const c = war.carrier;
  if (!c || !c.sky) { say(`NO SKY CARRIER YET  -  REFIT THE ALBATROSS FROM THE MAP (6, ${COST.sky} MATERIEL)`, 2.2); return; }
  if (!c.sky.up) { say(`REFIT UNDER WAY  -  ${Math.ceil(c.sky.refit)}s`, 1.6); return; }
  if (!helm.canTake(Z.alive && H.landed, !!(Z.svc && Z.svc.deck))) { say('LAND ON THE ALBATROSS TO TAKE THE HELM', 1.8); return; }
  helm.take(); if (document.pointerLockElement) document.exitPointerLock();
}
function leaveHelm() { helm.leave(); HI.setCollective(G.heliColl ?? 0); }
// commands (any time; the big map shows what is selected): 1 CH-46 Sea Knight with Marines, 2 AA gun, 3 helicopter
let selIsl = null;
function command(n) {
  if (G.state !== 'play') return;
  // COMMANDER: 5 / 8 from anywhere - in the Huey on the deck or in the jet as before, else the commander takes the jet
  // out on cat 1 (or switches to the one already out); the unit you leave carries on
  const deckJet = k => G.mode === 'zarch' && (G.craft === k || (G.craft === 'heli' && heliOnDeckNow()));
  if (n === 5) { if (deckJet('jet') || G.mode !== 'zarch') launchJet(); else commander.deploy('jet', 'ship'); return; }
  if (n === 8) { if (deckJet('tomcat') || G.mode !== 'zarch') tomcatC.launch(); else commander.deploy('tomcat', 'ship'); return; }   // TOMCAT: an F-14A to cat 1 (crafttomcat.js)
  if (n === 7) { motorChoice(); return; }   // ngc/wheeledgame: the motor pool (then 1 M151A2 / 2 M35A2)
  if (n === 9 || n === 0) { deliverArmour(n === 9 ? 'm60' : 'm113'); return; }   // ARMOUR: by LCM-8 to a friendly beach (9 M60A3, 0 M113A2; 8 is the TOMCAT)
  if (n === 4) { say(war.sendEscort(selIsl), 2); return; }   // AIR: CAP over the selected island, else over the ALBATROSS
  if (n === 6) { say(war.upgradeCarrier(), 2.5); return; }
  if (n === 3) { if (!war.allow(1, 'heli')) say(war.gateMsg(1, 'heli'), 1.8); else if (G.mat < COST.heli) say('NOT ENOUGH MATERIEL FOR A HELICOPTER', 1.6); else { G.mat -= COST.heli; G.lives++; say('NEW HELICOPTER IN THE HANGAR', 1.6); sfx.dock(); } return; }
  if (!selIsl) { say('SELECT AN ISLAND ON THE MAP FIRST (M)', 1.8); return; }
  say(n === 1 ? war.sendDrone(selIsl) : war.orderAA(selIsl), 2);
}
// where a fresh helicopter starts: the carrier deck while it is afloat, else the home pad
function spawnSpot() {
  const c = war && war.carrier;
  // the aft helicopter spot (H3): the Huey's 48 ft disc clears the island and the jets' taxi route
  if (c && c.sinking === undefined && !params.has('homepad')) { const { lx, lz } = DECK_OPS.HELO_START, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), x = c.p.x + lx * cs + lz * sn, z = c.p.z - lx * sn + lz * cs, dy = war.deckY(x, z); return { x, z, y: dy > -1e8 ? dy : CARRIER.DECK + Math.max(0, c.p.y), yaw: c.yaw }; }   // NAVAL: deckY moves with the sea
  return { x: PAD.x, z: PAD.z, y: PAD_H, yaw: 0 };
}
function resetZarch(fromPad, spot = null) {   // COMMANDER: spot = a friendly island's pad (else the deck / home pad)
  const sp = spot || spawnSpot(); heliAI.off(); Z.handedOn = false;
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
  if (!R.cave) { if (!R.drop) { R.drop = true; const sp = spawnSpot(); drop.start(Z.pos, { x: sp.x, y: sp.y, z: sp.z }); } return; }   // on land: the para-drop
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
// war.js hits the player: route to the craft you are in (at = the round's position, dir = its velocity: body parts)
function hurtPlayer(amount, why, at, dir, kind) {   // kind (wave 2): the war.js projectile, for the Marine's wounds
  if (G.bench) return;
  if (G.craft === 'heli') hurtHeli(amount, why); else crafts.active.hurt(amount, why, at, dir, kind);
}
function hurtHeli(amount, why, part) {
  if (G.bench) return;
  if (G.craft !== 'heli') { crafts.active.hurt(amount, why, null, null); return; }   // (tests call this in the jet)
  const p = D.hit(amount, part), name = PARTS.find(q => q.id === p).name;
  sfx.hit?.() ?? sfx.boom(0.3);
  const m = D.mods();
  const msg = p === 'tail' && m.tail === 0 ? 'TAIL ROTOR SHOT AWAY  -  CUT THE ENGINE OR FLY FAST' : p === 'engine' && D.fire ? 'ENGINE FIRE  -  PRESS O TO EXTINGUISH' :
    p === 'rotor' && m.lift === 0 ? 'MAIN ROTOR DESTROYED' : p === 'fuel' && D.hp.fuel < 0.75 ? 'FUEL TANK HIT  -  LEAKING' : `${why}  -  ${name} HIT`;
  say(msg, 2);
}
function callLogistics() {
  const landed = G.mode === 'zarch' ? H.landed : T.landed, alive = G.mode === 'zarch' ? Z.alive : T.alive;
  if (!war.allow(1, 'logistics')) { say(war.gateMsg(1, 'logistics'), 1.8); return; }   // TECH TREE
  if (G.rescue) { say(`LOGISTICS ALREADY INBOUND  -  ${rescueStatus()}`, 1.5); return; }
  if (!alive || !landed) { say('LAND FIRST TO CALL LOGISTICS', 1.5); return; }
  if (G.mode === 'zarch' && Z.svc) { say(`ON ${Z.svc.name}  -  REPAIRS AND FUEL ARE AUTOMATIC HERE`, 1.8); return; }
  if (!D.damaged() && G.fuel >= RESCUE_FUEL) { say('NOTHING TO FIX  -  TANKS ABOVE HALF', 1.5); return; }
  G.rescue = { t: RESCUE_TIME, cave: G.mode !== 'zarch' }; say('LOGISTICS TEAM DISPATCHED  -  FUEL AND FIELD REPAIR', 2.5); sfx.dock();
}
function cancelRescue() { if (helm.active) leaveHelm(); drop.cancel(); if (G.rescue) { G.rescue = null; crate.visible = false; } }
const rescueStatus = () => G.rescue && G.rescue.drop ? drop.status() : G.rescue ? `${Math.max(0, Math.ceil(G.rescue.t))}s` : '';

function killPlayerZ(why) {
  cancelRescue();
  if (!Z.alive) return;
  Z.alive = false; Z.deadT = 2.4; Z.lastDeath = { why, pos: H.pos.toArray().map(v => +v.toFixed(1)), t: performance.now() };   // for tests and post-mortems
  fx.explode(H.pos.x, H.pos.y, H.pos.z, 2.4, { fire: 45, debris: 16, color: 0x55613d, oil: true }); sfx.boom(1.2); sfx.engine(0);
  heliAI.off(); Z.handedOn = false;
  airlift.lost();   // AIRLIFT: the load drops off the hook, the troops aboard go down with her
  // COMMANDER: the fleet loses a Huey (the reserve was counted when it went out); the next one is the commander's call
  onUnitLost('heli', why, G.craft === 'heli');
  if (G.craft !== 'heli') { feed(`HUEY LOST  -  ${why}`, 'bad'); return; }   // the crew was flying it home, or it was parked
  say(why, 2);
}

// refuel / repair / rearm / unload cargo: on any friendly pad or our carrier's deck
function serviceAt(x, z) {
  const u = war.shipAt(x, z); if (u && u === war.carrier && u.sinking === undefined) return { name: 'ALBATROSS', deck: true };
  for (const p of PADS) if (p.isl.owner === 1 && Math.hypot(x - p.x, z - p.z) < p.r + 1) return { name: p.isl.name, pad: p };
  return null;
}
function service(svc, dt, piloted = true) {
  const say = piloted ? sayMsg : () => {};   // a parked helicopter is serviced quietly
  const fill = Math.min(G.res, 20 * dt, 100 - G.fuel); G.res -= fill; G.fuel += fill;
  if (G.cargo > 0) { const u = Math.min(G.cargo, 30 * dt, RES_MAX - G.res); G.cargo -= u; G.res += u; Z.unloaded = (Z.unloaded || 0) + u; if (G.cargo <= 0.01 && Z.unloaded > 0) { say(`FUEL UNLOADED  -  STORES ${Math.round(G.res)}`, 2); addScore(Math.round(Z.unloaded * 5)); Z.unloaded = 0; } }
  if (D.damaged()) { D.repair(0.25 * dt); if (!D.damaged()) say('REPAIRS COMPLETE', 1.5); }
  Z.rearmT = (Z.rearmT || 0) - dt;
  const cmLoading = cmH.rearm(dt), arming = G.rockets < ROCKETS_MAX || G.bombs < BOMBS_MAX;   // CM: the M130 reloads too
  if (arming && Z.rearmT <= 0) { Z.rearmT = 0.35; if (G.rockets < ROCKETS_MAX) G.rockets = Math.min(ROCKETS_MAX, G.rockets + 2); else G.bombs++; if (piloted) sfx.blip?.(700, 900, 0.05, 'square', 0.05); }
  if (fill > 0 || arming || cmLoading) Z.refuelling = true; else if (Z.refuelling) { Z.refuelling = false; say(G.res < 1 ? 'FUEL STORES EMPTY  -  TAKE FUEL ISLANDS OR LOOT ENEMY CAVES' : `${svc.name}  -  FUELLED AND ARMED`, 1.6); }
}
const _rk = new THREE.Vector3();
// the advisor: every so often, the next thing worth doing
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const bearing = (dx, dz) => COMPASS[Math.round(((Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360) / 45) % 8];
function advise(dt) {
  G.advT = (G.advT ?? 12) - dt; if (G.advT > 0) return; G.advT = 45;
  const P = Z.pos, b = war.battleship;
  if (b && b.sinking === undefined) { feed(`ADVISOR: THE LEVIATHAN IS ${Math.round(Math.hypot(b.p.x - P.x, b.p.z - P.z))}m ${bearing(b.p.x - P.x, b.p.z - P.z)}  -  BOMB IT (B) BEFORE IT REACHES THE ALBATROSS`, 'bad'); return; }
  if (war.E.bship > 55) { feed(`ADVISOR: THE LEVIATHAN IS ${Math.floor(war.E.bship)}% BUILT  -  BOMB THEIR FACTORIES AND THE IRONHOLD SHIPYARD`, 'bad'); return; }
  let best = null, bd = 1e9;
  for (const I of ISLANDS) if (I.owner !== 1 && !I.cave) { const d = Math.hypot(I.pad.x - P.x, I.pad.z - P.z) * (I.owner === 0 ? 1 : 1.6); if (d < bd) { bd = d; best = I; } }
  if (best) {
    const d = Math.round(Math.hypot(best.pad.x - P.x, best.pad.z - P.z)), dir = bearing(best.pad.x - P.x, best.pad.z - P.z);
    feed(best.owner === 0 ? `ADVISOR: ${best.name} (${KIND_NAME[best.kind]}) IS UNCLAIMED, ${d}m ${dir}  -  LAND ON ITS PAD OR SEND A SEA KNIGHT (M, 1)` : `ADVISOR: ${best.name} IS ENEMY-HELD, ${d}m ${dir}  -  SILENCE ITS GUNS, THEN LAND ON IT`);
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
    rwr: RWR, cm: cmH,   // CM: the APR-39 scope, threat lamps and the M130 counters
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
  if (H.starter || SY.auto === 'crank' || (H.run && H.n1 < 0.6)) return `STARTING  -  N1 ${n1}%  EGT ${H.egt.toFixed(0)}°C${H.run ? '  -  LIGHT-OFF' : ''}${H.n1 > 0.4 ? '  -  RELEASE THE STARTER' : ''}`;
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
function hueySound(piloted = true) {   // blade slap, turbine, low rotor rpm horn (audio.js)
  if (!sfx.huey) { sfx.engine(H.rpm * (0.25 + 0.75 * H.coll)); return; }
  // parked (you walked away, or you are driving past it): heard from outside, fading with distance
  const vol = piloted ? (G.craft === 'heli' ? 1 : 0) : Math.max(0, 1 - zCam.position.distanceTo(H.pos) / 220) * (crafts.active && crafts.active.kind === 'air' ? 0 : 1);
  sfx.huey({ nr: H.rpm, n1: H.n1, load: H.thrust / (H.mass * 9.81), torque: H.torque, vib: H.vib, horn: piloted && SY.horn, inside: piloted && cockpit.group.visible, spd: Math.hypot(H.vel.x, H.vel.z), on: G.state === 'play' && (G.mode === 'zarch' ? Z.alive : T.alive) && !G.heliStowed ? vol : 0 });
}
// the Huey on the surface. piloted: you fly it (HI controls, weapons, logistics, the helm, the advisor, the avatar Z);
// parked: nobody aboard - collective down, cyclic centred, engine left running at flight idle, the skids ride the deck
// or sit on the pad (it still refuels on a friendly pad), and it can still be lost (a ditching, a crash).
// CM (ngc/cmpolish): the Huey's M130 flare / chaff dispenser (units/defence/cm.js): one 30-cartridge payload module on
// the left side of the tail boom (INFERRED placement), 18 flares + 12 chaff; a press drops a pair of flares or one chaff
const HUEY_CM_KEYS = { Insert: 'flare', Semicolon: 'flare', Delete: 'chaff', Quote: 'chaff' };
const cmH = createDispenser({ name: 'M130', flares: 18, chaff: 12, program: { flare: 2, chaff: 1 }, gap: 0.22, ports: [[-0.62, 0.15, 3.0]], eject: { flare: [-0.55, -0.8, 0.25], chaff: [-0.8, -0.5, 0.2] }, sfx, say: (t, s) => say(t, s) });
const _cmQ = new THREE.Vector3();
const cmPose = { vel: null, toWorld: (l, o) => { _cmQ.set(l[0], l[1], l[2]).applyQuaternion(H.q).add(H.pos); o.x = _cmQ.x; o.y = _cmQ.y; o.z = _cmQ.z; return o; }, dirWorld: (l, o) => { _cmQ.set(l[0], l[1], l[2]).normalize().applyQuaternion(H.q); o.x = _cmQ.x; o.y = _cmQ.y; o.z = _cmQ.z; return o; } };
Object.defineProperty(cmPose, 'vel', { get: () => H.vel });
const _parkCtl = { cx: 0, cy: 0, pedal: 0, coll: 0, sas: false, fire: false, winch: false, rocket: false, bomb: false, hatX: 0, hatY: 0, source: 'PARKED' };
function updateHeli(dt, inp, piloted) {
  const P = H.pos;
  if (piloted && Z.alive) advise(dt);
  if (!Z.alive) {   // COMMANDER: a lost Huey is gone; with the commander aboard, the next unit comes after the crew timer
    Z.deadT -= dt;
    if (Z.deadT <= 0 && !G.over && piloted && !Z.handedOn) { Z.handedOn = true; autoNext(); }
    return;
  }
  if (G.heliStowed) return;
  const M = D.mods();
  let ctl;
  if (piloted) {
    ctl = HI.read(dt, H, { trim: SY.trim, mods: M });
    drop.update(dt, ctl.raw ? { ...ctl, ...ctl.raw } : ctl, H);   // the raw stick (not the stability assist's output)
    const atHelm = helm.active; helm.update(dt, ctl.raw ? { ...ctl, ...ctl.raw } : ctl, {   // the raw stick: the assist would turn W into an attitude hold
      up: kd('Space', 'ShiftLeft'), down: kd('ControlLeft', 'KeyZ') });
    if (atHelm && !helm.active) HI.setCollective(G.heliColl ?? 0);
    if (drop.controlling || helm.active) { ctl.cx = ctl.cy = ctl.pedal = 0; ctl.fire = ctl.rocket = ctl.bomb = false; inp = { ...inp, fire: false }; ctl.coll = G.heliColl ?? 0; }   // the stick flies the dropship / canopies / ship
    else G.heliColl = ctl.coll;
    SY.starterKey = kd('Home') || !!ctl.starter;   // Home (or the HOTAS starter button): starter (hold), PgUp / PgDn: throttle twist grip
    const hp = ctl.press;   // ngc/hornethuey: HOTAS buttons for the Huey's switches (heli.js)
    if (hp && !drop.controlling && !helm.active) { if (hp.sas) doSwitch('sas'); if (hp.trim) doSwitch('trim'); if (hp.light) doSwitch('light');
      if (hp.view) { cockpitCam = !cockpitCam; if (!cockpitCam && document.pointerLockElement) document.exitPointerLock(); say(cockpitCam ? 'COCKPIT VIEW' : (chaseCam ? 'CHASE CAMERA' : 'FIXED CAMERA'), 1.2); } }
    Object.assign(ctl, SY.controls(dt, H, (kd('PageUp') ? 1 : 0) - (kd('PageDown') ? 1 : 0)));
    if (G.benchAI && heliAI.phase !== 'off') { const a = heliAI.step(H, dt, heliAIenv); if (a) Object.assign(ctl, a); }   // tests (scenes): the crew's AI flies her with you aboard
  } else {
    ctl = Object.assign(_parkCtl, { cx: 0, cy: 0, pedal: 0, coll: 0 }); SY.starterKey = false;
    if (heliAI.phase !== 'off') {   // COMMANDER: left in the air - the crew flies her home (units/commander/heliai.js)
      Object.assign(ctl, heliAI.step(H, dt, heliAIenv));
      if (heliAI.phase === 'landed' && H.landed && H.c.coll < 0.05) { heliAI.off(); feed(`HUEY DOWN SAFELY${heliAI.dest ? ' AT ' + heliAI.dest : ''}`, 'good'); }
    }
    if (drop.active || drop.flying) drop.update(dt, ctl, H);
    Object.assign(ctl, SY.controls(dt, H, 0));
  }
  H.extraMass = G.cargo * 3 + airlift.mass();    // fuel drums from the caves; AIRLIFT: the troops aboard
  const ev = H.step(dt, ctl, { groundY, fuel: G.fuel, water: waterAt, surfVel: war.surfVel, mods: M, ext: airlift.ext() });   // AIRLIFT: a sling load on the hook
  SY.update(dt, H, H.landed);
  airlift.update(dt, piloted, ctl, Z.alive);   // AIRLIFT: the load, the hookup man, the crew chief's calls, the troops, the HUD
  for (const e of H.events) {
    if (!piloted) continue;
    if (e.e === 'overtemp') { D.hit(0.2, 'engine'); say('ENGINE OVERTEMP  -  EGT PAST 760°C', 2); }
    if (e.e === 'flameout' && D.engineSwitch && G.fuel > 0 && D.hp.engine > 0.05 && !SY.quick) say('FLAME-OUT  -  AUTOROTATE', 1.6);
  }
  if (H.mastBump > 0.25) { H.mastBump = 0; D.hit(0.3, 'rotor'); say('MAST BUMPING  -  LOW G: EASE THE CYCLIC, COLLECTIVE UP', 2.5); sfx.boom(0.3); }
  G.fuel = Math.max(0, G.fuel - D.update(dt));
  const fw = H.forward();
  if (piloted) {
    Z.pos.copy(H.pos); Z.vel.copy(H.vel); Z.landed = H.landed; Z.throttle = H.coll * H.rpm; Z.ctl = ctl;
    const fl = Math.hypot(fw.x, fw.z); if (fl > 0.15) Z.facing.set(fw.x / fl, fw.z / fl);
    const k = 1 - Math.exp(-6 * dt);
    Z.aimOff.x = lerp(Z.aimOff.x, -(ctl.hatX || 0) * 0.26, k); Z.aimOff.y = lerp(Z.aimOff.y, (ctl.hatY || 0) * 0.26, k);
    Z.aim.copy(fw).applyAxisAngle(H.up(), Z.aimOff.x).applyAxisAngle(_aimR.set(1, 0, 0).applyQuaternion(H.q), Z.aimOff.y);
  }
  G.fuel = Math.max(0, G.fuel - fuelBurnPct(H) * dt);   // the T53 fuel flow, scaled to the game tank (heli.js)
  if (piloted && G.fuel <= 0 && !H.landed) say('FUEL EXHAUSTED  -  AUTOROTATE AND SET DOWN SAFELY', 0.5);
  if (piloted) updateRescue(dt, H.landed, false);
  if (piloted && drop.flying) sfx.engine(drop.engineLevel()); else if (piloted && helm.active) sfx.engine(0.3); else hueySound(piloted);   // they share a mixer: one at a time
  const svc = H.landed ? serviceAt(P.x, P.z) : null; Z.svc = svc;
  if (svc) service(svc, dt, piloted);
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
    fx.downwash(P.x, gy, P.z, k, wet);   // RENDERKIT fx: a GPU dust / spray ring under the disc (no-op with ?rk=0)
    Z.washT = (Z.washT || 0) - dt;
    if (wet && Z.washT <= 0 && k > 0.2) { Z.washT = 0.18; fx.water.add({ x: P.x, y: 0.1, z: P.z, size: 3, grow: 12, a: 0.45 * k, life: 1.1, tile: 1, pow: 1.5 }); }
  }
  if (!piloted) return;
  // weapons: door gun (F / trigger), rocket pods (G / button 3), bombs (B / button 5)
  Z.fireCd -= dt; Z.rkCd = (Z.rkCd || 0) - dt; Z.bmCd = (Z.bmCd || 0) - dt;
  if ((inp.fire || ctl.fire) && Z.fireCd <= 0) {
    Z.fireCd = 0.14; sfx.shot();
    war.fireBullet(P.clone().addScaledVector(Z.aim, 5), Z.aim.clone().multiplyScalar(75).addScaledVector(Z.vel, 0.5));
  }
  if (((kd('KeyG') && !drop.controlling) || ctl.rocket) && Z.rkCd <= 0) {
    if (G.rockets > 0) {
      Z.rkCd = 0.2; G.rockets--; Z.rkSide = -(Z.rkSide || 1);
      const p0 = P.clone().add(_rk.set(1.7 * Z.rkSide, -0.4, -0.6).applyQuaternion(H.q));
      war.fireRocket(p0, Z.aim.clone().multiplyScalar(105).add(Z.vel)); fx.flash(p0.x, p0.y, p0.z, 0.35);
    } else { Z.rkCd = 1; say('ROCKETS EMPTY  -  REARM ON THE CARRIER OR A FRIENDLY PAD', 1.4); }
  }
  if (((kd('KeyB') && !drop.controlling) || ctl.bomb) && Z.bmCd <= 0) {
    if (G.bombs > 0) { Z.bmCd = 0.45; G.bombs--; war.dropBomb(P.clone().add(_rk.set(0, -2.3, 0)), Z.vel.clone()); }
    else { Z.bmCd = 1; say('BOMBS GONE  -  REARM ON THE CARRIER OR A FRIENDLY PAD', 1.4); }
  }
  // CM: the M130 dispenser - HOTAS buttons (J binds them), then the queued program leaves the tail boom
  if (!drop.controlling && !helm.active) { const pr = CTL.state.pressed || {}; if (pr.flare) cmH.press('flare'); if (pr.chaff) cmH.press('chaff'); }
  cmH.update(dt, cmPose);
  { const hb = holeOf(P.x, P.z); if (hb && P.y < hb.h - 0.5 && Z.vel.y < 0) { enterCave(hb); return; } }
}

// ================================================================ FOUNDATION: the crafts
// Everything the player can control registers here (craft.js): the Huey (still special: the cave, the drop, the helm),
// the HORNET (craftjet.js), the soldier on foot (foot.js) and ground vehicles (vehicle.js on the ground host,
// ground.js). Wave-2 units register the same way - see docs/ngc1980/FOUNDATION.md.
const GR = createGround({ war, terrainH, holeOf, PADS, ISLANDS, CARRIER, trees: TREES, crafts, inZone });
// SEAWORLD: the lived-in world is solid - buildings, walls, hedges, parapets and poles collide; piers and bridge decks
// are floors; roads are road / dirt surfaces (world/solid.js, from the same generators the world is drawn from)
const worldSolid = createWorldSolid({ hf: islandH, zoneHf: terrainH, zone: () => world.zone || [] });
GR.addColliderSource((x, z, r) => worldSolid.near(x, z, r)); GR.addFloor(worldSolid.floor); GR.addStairs(worldSolid.stairAt);   // (ngc/interiors: stairs) GR.addSurface((x, z) => worldSolid.surface(x, z));
if (params.has('debug')) window.__SOLID = worldSolid;
if (params.has('debug')) { window.__DOORS = DOORS; Object.defineProperty(window, '__IN', { get: () => interiors }); Object.defineProperty(window, '__SEATS', { get: () => seats }); }   // ngc/interiors (tests)
const yawOfQ = q => { const f = _yawF.set(0, 0, -1).applyQuaternion(q); return Math.atan2(-f.x, -f.z); };
const _yawF = new THREE.Vector3();
// --- the UH-1H: its flying, HUD and cameras stay in main.js; the craft entry makes it enterable, parkable, routable
const heliC = crafts.register({
  id: 'heli', label: 'UH-1H HUEY', kind: 'air',
  // the pilot sits on the right; either cockpit door works (local: x right, y up from the CG, -z forward)
  seats: [{ id: 'pilot', label: 'PILOT', role: 'driver', doors: [[1.45, -0.8, -1.9], [-1.45, -0.8, -1.9]], exit: [2.4, HELI.SKID_Y, -1.9], reach: 2.4 }],
  present: () => Z.alive && !G.heliStowed && G.mode === 'zarch',
  frame: out => { out.x = H.pos.x; out.y = H.pos.y; out.z = H.pos.z; out.yaw = yawOfQ(H.q); return out; },
  enter: (seat, from) => {
    if (!Z.alive || G.heliStowed) return false;
    if (from === 'foot') { HI.setCollective(0); G.heliColl = 0; head.yaw = head.pitch = 0; say(H.run ? 'IN THE HUEY  -  COLLECTIVE UP TO LIFT  ·  Y GET OUT' : 'IN THE HUEY  -  I TO START THE ENGINE', 2.2); }
    if (from === 'command') {   // COMMANDER: you take her from the crew where she is (the collective where they had it)
      const air = !H.landed; heliAI.off(); HI.setCollective(air ? H.c.coll : 0); G.heliColl = air ? H.c.coll : 0; head.yaw = head.pitch = 0;
      Z.pos.copy(H.pos); Z.vel.copy(H.vel);
      say(air ? `YOU HAVE THE HUEY  -  ${Math.round(H.agl * 3.28)} FT` : H.run ? 'IN THE HUEY  -  COLLECTIVE UP TO LIFT' : 'IN THE HUEY  -  I TO START THE ENGINE', 2);
    }
    return true;
  },
  canExit: () => {
    if (G.mode !== 'zarch') return 'NOT IN A CAVE';
    if (drop.controlling || helm.active) return 'NOT WHILE YOU ARE FLYING THE DROPSHIP OR AT THE HELM';
    if (!H.landed) return 'LAND FIRST';
    const sv = war.surfVel(H.pos.x, H.pos.z), rel = Math.hypot(H.vel.x - (sv ? sv.vx : 0), H.vel.z - (sv ? sv.vz : 0));
    if (rel > 1) return 'SETTLE ON THE SKIDS FIRST';
    if (H.coll > 0.15) return 'COLLECTIVE DOWN FIRST (CTRL / Z)';
    return '';
  },
  exitSpots: () => [[2.4, HELI.SKID_Y, -1.9], [-2.4, HELI.SKID_Y, -1.9], [2.4, HELI.SKID_Y, 1.5], [-2.4, HELI.SKID_Y, 1.5]].map(p => crafts.toWorld(heliC, p)).map(w => ({ x: w.x, y: w.y, z: w.z, yaw: w.yaw - Math.PI / 2 })),
  exit: () => {
    HI.setCollective(0); G.heliColl = 0; cancelRescue(); if (bigMap) { bigMap = false; setMapSize(); }
    if (Z.alive && !G.heliStowed && !H.landed && G.mode === 'zarch') heliHome();   // COMMANDER: left in the air - the crew takes her home
  },
  update: (dt, inp) => updateHeli(dt, inp, true),
  idle: dt => updateHeli(dt, null, false),
  bounds: () => {   // cabin and tail boom, for walkers and vehicles bumping into a parked Huey
    if (!Z.alive || G.heliStowed) return null;
    const y = yawOfQ(H.q), c = Math.cos(y), s = Math.sin(y), y0 = H.pos.y + HELI.SKID_Y;
    heliC._b ||= [{}, {}];
    Object.assign(heliC._b[0], { x: H.pos.x + 0.3 * s, z: H.pos.z + 0.3 * c, yaw: y, hl: 2.7, hw: 1.35, y0, y1: y0 + 3.2, def: heliC });
    Object.assign(heliC._b[1], { x: H.pos.x + 6.2 * s, z: H.pos.z + 6.2 * c, yaw: y, hl: 3.4, hw: 0.45, y0: y0 + 1.1, y1: y0 + 4, def: heliC });
    return heliC._b;
  },
  pl: {
    alive: () => G.mode === 'zarch' ? Z.alive : T.alive, landed: () => G.mode === 'zarch' && Z.alive && H.landed, inCave: () => G.mode !== 'zarch',
    hitR: HELI.HIT_R, sight: 0,
  },
  hurt: (a, why) => hurtHeli(a, why),
  silence: () => { if (G.craft !== 'heli') sfx.huey?.({ nr: 0, n1: 0, load: 0, torque: 0, vib: 0, horn: false, inside: false, spd: 0, on: 0 }); },
});
// COMMANDER: what both jets get for the wingman (units/commander/wingman.js), the fleet's losses and cat 1
const jetCmd = {
  createWingman, onUnitLost: (id, why, mine) => onUnitLost(id, why, mine), catBusy: D => catBusy(D), deckCancel: A => deckCancel(A),
  aiEnv: wingmanEnv({ terrain: (x, z) => Math.max(terrainH(x, z), 0), carrier: () => war.carrier && war.carrier.sinking === undefined ? war.carrier : null, deckAt: war.deckAt, DECK: CARRIER.DECK, deckClear: () => war.deck.deckClear(), wantDeck: () => { war.deck.wantT = war.time; } }),
};
// --- the HORNET
const jetC = crafts.register(createJetCraft({
  JP, war, G, Z, CTL, say, feed, sfx, crafts, GR, head, advise: dt => advise(dt), serviceAt, gameOver: () => gameOver(),
  view: { get cockpit() { return cockpitCam; }, set cockpit(v) { cockpitCam = v; }, get freeLook() { return freeLook; }, locked: () => document.pointerLockElement === canvas },
  hover: () => switchHover, camZ: () => zCam, turnIntoClear: () => turnIntoClear(),
  heliOnDeck: () => { const s = Z.alive && H.landed && !G.heliStowed ? serviceAt(H.pos.x, H.pos.z) : null; return !!(s && s.deck); },
  stowHeli: () => stowHeli(), unstowHeli: () => unstowHeli(), spotHeli: () => spotHeli(), heliStowed: () => G.heliStowed,
  toHeli: msg => autoNext(msg), ...jetCmd,   // COMMANDER: after a lost jet the next unit (the Huey unless you pick); the wingman, losses, cat 1
}));
// --- the TOMCAT (crafttomcat.js): the same hooks as the HORNET, taken with 8 from the ALBATROSS deck
const tomcatC = crafts.register(createTomcatCraft({
  playCtx: jetPlayCtx, war, G, Z, CTL, say, feed, sfx, crafts, GR, head, advise: dt => advise(dt), gameOver: () => gameOver(),
  view: { get cockpit() { return cockpitCam; }, set cockpit(v) { cockpitCam = v; }, get freeLook() { return freeLook; }, locked: () => document.pointerLockElement === canvas },
  hover: () => switchHover, camZ: () => zCam, turnIntoClear: () => turnIntoClear(),
  heliOnDeck: () => { const s = Z.alive && H.landed && !G.heliStowed ? serviceAt(H.pos.x, H.pos.z) : null; return !!(s && s.deck); },
  stowHeli: () => stowHeli(), unstowHeli: () => unstowHeli(), spotHeli: () => spotHeli(), heliStowed: () => G.heliStowed,
  toHeli: msg => autoNext(msg), ...jetCmd,   // COMMANDER: after a lost jet the next unit (the Huey unless you pick); the wingman, losses, cat 1
}));
// --- ngc/ch46fly: the CH-46E SEA KNIGHT (units/air/rotary/ch46craft.js): from the command board, Marines in the back
const ch46C = crafts.register(createCH46Craft({
  scene: zScene, war, G, Z, CTL, keyDown: kd, hwOn: () => !!XR?.motionInput || !keyboardOnly, say, feed, sfx, fx, crafts, head, params, ISLANDS, terrainH, waterAt,
  serviceAt: (x, z) => serviceAt(x, z), whereIs: (x, z) => whereIs(x, z), camZ: () => zCam, hover: () => switchHover, view: { locked: () => document.pointerLockElement === canvas },
  onUnitLost: (id, why, mine) => onUnitLost(id, why, mine), autoNext: () => autoNext(), heliPos: () => Z.alive && !G.heliStowed && G.mode === 'zarch' ? H.pos : null,
}));
// --- ON FOOT
const foot = crafts.register(createFootCraft({
  scene: zScene, GR, crafts, war, fx, sfx, say, keyDown: kd, groundEnv: GR, camera: () => zCam,
  invulnerable: () => !!G.bench,
  onDeath: why => { G.crewDownT = 3.5; feed(`CREW LOST  -  ${why}`, 'bad'); onUnitLost('marine', why, true); },   // COMMANDER: a Marine lost; the next unit after the crew timer
}));
// wave 2 (ngc/foot2): the real 1980 Marine on that craft (marine.js): rifleman, medical, inventory, viewmodel, sound
const marine = foot.setMarine(createMarine({
  scene: zScene, GR, war, fx, sfx, say, feed, keyDown: kd, crafts, canvas, hudEl: $('hud'), terrainH, ISLANDS,
  serviceAt: (x, z) => serviceAt(x, z), active: () => G.craft === 'foot' && G.state === 'play' && G.mode === 'zarch',
  use: (x, y, z, yaw) => interiors.use(x, y, z, yaw), useHint: (x, y, z, yaw) => interiors.useHint(x, y, z, yaw),   // ngc/interiors: F opens doors and hatches
}));
// SEALIFE (units/naval/sealife.js): fish, dolphins, rays, jellyfish round the camera and round every unit on the water,
// seabirds over the bait balls, trawlers and wakes; they flee ships, wash, swimmers and blasts. The sea bed and the view
// from under the surface. The player's own disturbances come from here (the AI's from war.units); quality in the menu.
const _slF = {}, _slP = { x: 0, z: 0, ok: false }, _slR = new WeakMap();
const SL_Q = ['off', 'low', 'medium', 'high'];
let slQ = 'medium'; try { const q = params.get('sealife') || localStorage.getItem('tz_sealife'); if (SL_Q.includes(q)) slQ = q; } catch (e) {}
const sealife = createSeaLife({
  scene: zScene, uniforms: terrainUni, terrain, sky, fx, war, depthAt: terrainH, isWater, cell: TG, canvas,
  active: () => G.mode === 'zarch' && camB < 0.01,
  heightPx: () => renderer.domElement.height,
  trawlers: () => world.ambient && world.ambient.trawlers,
  extra: (S, SL) => {
    if (G.craft === 'heli' && Z.alive && !G.heliStowed && H.agl < 25 && waterAt(H.pos.x, H.pos.z)) S.point(H.pos.x, 0, H.pos.z, 8 + 14 * (1 - H.agl / 25), Math.min(1, H.thrust / 40000) * (1.1 - H.agl / 25), 0, 0, 2 + 3 * (1 - H.agl / 25), { wash: true, w: 0.8 });   // the Huey's downwash
    if (G.craft === 'heli' && Z.alive && !G.heliStowed && H.agl < 60) SL.flush(H.pos.x, H.pos.y, H.pos.z, 55);
    if (G.craft === 'foot' && foot.exists) {   // a man in the water (the curious come to look while he keeps still)
      const f = foot.frame(_slF), vx = _slP.ok ? (f.x - _slP.x) / Math.max(1e-3, S.lastDt || 1 / 60) : 0, vz = _slP.ok ? (f.z - _slP.z) / Math.max(1e-3, S.lastDt || 1 / 60) : 0;
      _slP.x = f.x; _slP.z = f.z; _slP.ok = true;
      if (f.y < 0.3 && isWater(f.x, f.z)) { S.point(f.x, f.y + 0.6, f.z, 4.5, 0.65, Math.max(-3, Math.min(3, vx)), Math.max(-3, Math.min(3, vz)), 2.5, { swim: true, w: 0.7 }); SL.flush(f.x, 0, f.z, 14); }
    } else _slP.ok = false;
    if ((G.craft === 'jet' || G.craft === 'tomcat') && crafts.active && crafts.active.frame) { const f = crafts.active.frame(_slF); if (f && f.y < 90) SL.flush(f.x, f.y, f.z, 130); }   // a jet low over the water
    else if (G.craft !== 'heli' && G.craft !== 'foot' && crafts.active && crafts.active.frame) {   // a vehicle swimming (the M113)
      const f = crafts.active.frame(_slF); if (f && f.y < 0.8 && isWater(f.x, f.z) && terrainH(f.x, f.z) < -1) { const q = _slR.get(crafts.active) || { x: f.x, z: f.z, v: 0 }; q.v += (Math.min(4, Math.hypot(f.x - q.x, f.z - q.z) / Math.max(1e-3, S.lastDt || 1 / 60)) - q.v) * 0.2; q.x = f.x; q.z = f.z; _slR.set(crafts.active, q); S.hull(f.x, f.z, f.yaw, 2.5, 1.4, 1.2, q.v); }
    }
    for (const r of armDelivery.runs) if (!r.P.gone) {   // LCM-8s (22.4 x 6.4 m): their speed from how far they moved
      const q = _slR.get(r) || { x: r.P.p.x, z: r.P.p.z, v: 0 }, v = Math.hypot(r.P.p.x - q.x, r.P.p.z - q.z) / Math.max(1e-3, S.lastDt || 1 / 60);
      q.v += (Math.min(8, v) - q.v) * 0.2; q.x = r.P.p.x; q.z = r.P.p.z; _slR.set(r, q); S.hull(r.P.p.x, r.P.p.z, r.P.yaw, 10.5, 3.2, 1.3, q.v);
    }
  },
});
sealife.setQuality(slQ); if (world.ambient) world.ambient.seaBirds = slQ !== 'off';
function setSeaLifeQ(q) { slQ = q; sealife.setQuality(q); if (world.ambient) world.ambient.seaBirds = q !== 'off'; try { localStorage.setItem('tz_sealife', q); } catch (e) {} }
// --- ground vehicles (ngc/wheeledgame): the WHEELED M151A2s, M35A2s and civilian cars, through units/wheeled/motorpool.js
const vehCtx = {
  scene: zScene, GR, crafts, war, fx, sfx, say, feed, keyDown: kd, CTL, hwOn: () => !!XR?.motionInput || !keyboardOnly, camZ: () => zCam,
  crewHit: (a, why, at) => foot.hurt(a, why, null),
  crewKilled: why => { say(`${why}  -  CREW KILLED`, 2.5); G.crewDownT = 3.5; feed(`CREW LOST  -  ${why}`, 'bad'); onUnitLost('marine', why, true); },
  unitLost: (def, why) => onUnitLost(rosterIdOf(def), why, false),   // COMMANDER: a vehicle destroyed (its crew's fate comes through crewKilled / bail-out)
};
const pool = createMotorPool({ ...vehCtx, foot, marine, world, ISLANDS, G, Z, terrainH, hover: () => switchHover, getInOut: () => getInOut(), serviceAt: (x, z) => serviceAt(x, z), selIsl: () => selIsl,
  holes: BASES.map(b => ({ x: b.x, z: b.z, r: HOLE_R + 0.6 })) });
void createVehicleCraft;   // (vehicle.js stays the host for tracked units)
// --- ARMOUR (wave 2, units/armor/): the M60A3 TTS and the M113A2 on their tracked-vehicle sim. armorworld.js is their
// ground (the terrain, roads and bridges, ship decks and the LCM-8, the sea, trees / houses / AA sites / crafts to push
// against), armorcraft.js the craft (seats at the hatches, interiors, sights, gunnery through war.js, damage, sound).
const AW = createArmorWorld({
  terrainH, ships: () => war.units, deckY: (x, z) => war.deckY(x, z), shipAt: (x, z) => war.shipAt(x, z), shipAlive: u => war.units.includes(u) && !(u.sinking > 4),
  roadAt: (x, z) => world.roadAt ? world.roadAt(x, z) : null, pads: PADS.filter(p => !p.isl.cave).map(p => ({ x: p.x, z: p.z, r: 26 })).concat(PADS.filter(p => p.isl.cave).map(p => ({ x: p.x, z: p.z, r: 20 }))),
  holes: BASES.map(b => ({ x: b.x, z: b.z, r: HOLE_R })), trees: TREES, structs: function* () { for (const I of ISLANDS) if (I.structs) yield* I.structs; },
  items: () => world.zone.flatMap(e => e.items), paved: (x, z) => !!onHard(HARDS, x, z), bounds: skip => crafts.bounds(skip), hitTest: (x, y, z) => war.hitTest(x, y, z, 1, 0.2),
  onFell: (t, dx, dz, i) => {   // lay a pushed-over tree down along the push
    if (TREES.fell) return TREES.fell(i, dx, dz);   // RENDERKIT nature: the species instances
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); TREES.mesh.getMatrixAt(i, m4); m4.decompose(p, q, s);
    q.setFromAxisAngle(new THREE.Vector3(dz, 0, -dx).normalize(), 1.35); TREES.mesh.setMatrixAt(i, m4.compose(p, q, s)); TREES.mesh.instanceMatrix.needsUpdate = true;
  },
});
const armCtx = { ...vehCtx, hover: () => switchHover, AW, SG: createSight({ canvas }), ground: (x, z) => Math.max(terrainH(x, z), war.deckY(x, z)), isWater, bail: def => { if (crafts.active === def) getInOut(); } };
const m60C = crafts.register(createArmorCraft(armCtx, 'm60'));
const m113C = crafts.register(createArmorCraft(armCtx, 'm113'));
// ngc/interiors: the rooms of the lived-in world (built near the camera), the barracks huts, the ALBATROSS's hangar deck
// and island; a passenger seat in the Huey's cabin or a CH-46 (the RIDE craft), the people seen in the seats
const interiors = createInteriors({ scene: zScene, GR, war, worldSolid, sfx, say, terrainH, holeOf, ISLANDS });
const seats = createSeats({ scene: zScene, crafts, war, foot, say, heli: { def: heliC, obj: () => shipMesh, landed: () => Z.alive && H.landed, vel: H.vel }, jet: { def: jetC, model: JP.model, P: JP } });
const armDelivery = createArmorDelivery({ scene: zScene, AW, terrainH, hards: HARDS, beach: (I, tw) => GR.beach(I, tw), blocked: (x, z) => !GR.clearAt(x, z, 2.5), fx, sfx, say, feed, camZ: () => zCam });
// AIRLIFT (units/air/airlift/): the Huey's cargo hook and troop lift; the C-130 heavy drop the command board orders
const airlift = createAirlift({ scene: zScene, H, heliObj: () => shipMesh, rotorR: HELI.ROTOR_R, crafts, pool, war, fx, sfx, say, feed, groundY, waterAt, G, ISLANDS, hud: $('hud'),
  serviceAt: (x, z) => serviceAt(x, z), whereIs: (x, z) => whereIs(x, z), armour: [m60C, m113C], riderSeat: () => crafts.active === seats.ride ? seats.ride.hueySeat() : null, crewFlying: () => heliAI.phase !== 'off' && !G.benchAI, cockpitView: () => cockpitCam,
  gate: { sling: () => war.allow(1, 'sling') ? '' : war.gateMsg(1, 'sling'), troops: () => war.allow(1, 'trooplift') ? '' : war.gateMsg(1, 'trooplift') } });   // TECH TREE: AIRMOBILE LOGISTICS
const airdrop = createAirdrop({ scene: zScene, war, fx, sfx, say, feed, terrainH, groundY, isWater, GR, pool, armour: { m113: m113C, m60: m60C }, crafts, hud: $('hud'),
  head, camZ: () => zCam, onLost: (id, why) => onUnitLost(id, why, false), whereIs: (x, z) => whereIs(x, z),
  gate: () => war.allow(1, 'logistics') ? '' : war.gateMsg(1, 'logistics'),   // TECH TREE: heavy drop is FIELD LOGISTICS
  avoid: (x, z, pads = true) => BASES.some(b => Math.hypot(x - b.x, z - b.z) < HOLE_R + 48) || (pads && PADS.some(p => Math.hypot(x - p.x, z - p.z) < (p.r1 || p.r) + 6)) });   // (a DZ off the cave mouths and the pads)
crafts.setActive('heli');
crafts.onSwitch = (from, to) => {
  if (to.kind === 'foot' || to.kind === 'ground') { if (bigMap) { bigMap = false; setMapSize(); } }   // a click captures the mouse (as in the cockpits)
  else if (document.pointerLockElement && !cockpitCam) document.exitPointerLock();
  head.yaw = head.pitch = 0;
};
// Y: get out of whatever you are in (if it lets you), or into the nearest door when on foot
function getInOut() {
  if (G.mode !== 'zarch' || G.over || G.state !== 'play') return;
  const a = crafts.active;
  if (a === foot) {
    if (!foot.alive) return;
    const W = foot.W, d = crafts.nearestDoor(W.x, W.y + 1, W.z, 2.6);
    if (!d) { say('NOTHING TO GET INTO HERE  -  WALK UP TO A DOOR', 1.5); return; }
    if (crafts.control(d.def.id, d.seat, 'foot')) sfx.ui?.('select');
    return;
  }
  const why = a.canExit(); if (why) { say(why, 1.8); return; }
  const spots = a.exitSpots ? a.exitSpots() : [];
  if (!foot.spawnAt(spots)) { say('NO ROOM TO GET OUT HERE', 1.5); return; }
  crafts.control('foot', 0, a.id);
  say(`OUT OF THE ${a.label}  -  Y BY A DOOR TO GET BACK IN`, 2);
}
// the Huey goes down to the hangar (a jet takes the deck) / comes back up / is spotted on deck with nobody in it
function heliOnDeckNow() { const s = Z.alive && H.landed && !G.heliStowed ? serviceAt(H.pos.x, H.pos.z) : null; return !!(s && s.deck); }
function stowHeli() { G.heliStowed = true; shipMesh.visible = false; shipShadow.visible = false; sfx.engine(0); cancelRescue(); }
function unstowHeli() { G.heliStowed = false; shipMesh.visible = true; }
function spotHeli() { G.heliStowed = false; const z = Z.pos.clone(), v = Z.vel.clone(), f = Z.facing.clone(); resetZarch(true); Z.pos.copy(z); Z.vel.copy(v); Z.facing.copy(f); }
// back into a fresh helicopter on the carrier (or the home pad): after a lost jet, a lost crew, a pick-up from the menu
function toHeli(msg) {
  { const a = crafts.active; if (a && a !== heliC && a !== foot && a.present()) a.exit(heliC); }   // COMMANDER: the unit you leave carries on (the wingman) or parks
  if (foot.exists) foot.exit();
  JP.active && !JP.alive && JP.stow(); tomcatC.TP.active && !tomcatC.TP.alive && tomcatC.TP.stow();   // TOMCAT
  G.heliStowed = false; G.fuel = 100; G.cargo = 0; D.reset(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; G.crewDownT = 0; cmH.reset();
  resetZarch(true); crafts.setActive('heli'); crafts.onSwitch(null, heliC);
  if (msg) say(msg, 2.5);
}
// title screen / new game: everyone back in the hangar, the player in the helicopter
function stowCrafts() { ch46C.stow(); JP.stow(); jetC.park.on = false; tomcatC.TP.stow(); tomcatC.park.on = false; if (foot.exists) foot.exit(); G.heliStowed = false; G.crewDownT = 0; crafts.setActive('heli'); crafts.silence(); }
// a new war: the TEST CAR waits at the home island's motor pool (else on the carrier deck)
function placeVehicles() {
  pool.newGame();   // ngc/wheeledgame: M151s and M35s at every friendly motor pool and on the deck park
  // ARMOUR: the M60A3 waits at the top of the home island's landing hard, the M113A2 on the ALBATROSS's forward deck park (cold, parked)
  armDelivery.clear();
  const hh = HARDS.find(h => h.I === HOME_B.isl), hp = hh && hh.at(hh.u1 - 5), ts = hp ? { x: hp[0], z: hp[1], yaw: hh.yaw } : GR.motorPool(HOME_B.isl, 4.6); if (ts && war.allow(1, 'm60')) m60C.spawnAt(ts); else m60C.stow();   // (TECH TREE: only when researched)   // (on the concrete just below the top, nose inland: past the top it stood on mud and slid)
  const as = GR.deckSpot(2) || GR.motorPool(HOME_B.isl, 3.6); if (as && war.allow(1, 'm113')) m113C.spawnAt(as); else m113C.stow();
}
// ARMOUR: 8 / 9 - an LCM-8 from the amphibious group lands an M113A2 (30 materiel) / an M60A3 TTS (60) on the beach of the
// selected friendly island (else the nearest one to you). The vehicle's crew drives it off and up the beach.
const COST_ARMOUR = { m113: 30, m60: 60 };
function deliverArmour(kind) {
  const def = kind === 'm60' ? m60C : m113C, cost = COST_ARMOUR[kind];
  if (!war.allow(1, kind)) { say(war.gateMsg(1, kind), 1.8); return; }   // TECH TREE
  if (crafts.active === def) { say(`YOU ARE IN THE ${def.label}`, 1.2); return; }
  if (armDelivery.busy(def)) { say(`THE ${def.label} IS ALREADY ON ITS WAY IN`, 1.6); return; }
  if (G.mat < cost) { say(`AN ${def.label} NEEDS ${cost} MATERIEL`, 1.6); return; }
  let I = selIsl && selIsl.owner === 1 && !selIsl.cave ? selIsl : null;
  if (!I) { let bd = 1e9; for (const J of ISLANDS) if (J.owner === 1) { const d = Math.hypot(J.pad.x - Z.pos.x, J.pad.z - Z.pos.z); if (d < bd) { bd = d; I = J; } } }
  if (!I) { say('NO FRIENDLY ISLAND TO LAND ON', 1.6); return; }
  const tw = war.carrier ? [war.carrier.p.x, war.carrier.p.z] : null;
  let r = armDelivery.start(def, I, tw);
  if (!r.ok && I !== HOME_B.isl) { const why = r.why; r = armDelivery.start(def, HOME_B.isl, tw); if (r.ok) feed(`${why}  -  LANDING AT HOME ISLAND INSTEAD`); }   // most islands are cliffs: the home beach always takes a boat
  if (!r.ok) { say(r.why, 2); return; }
  G.mat -= cost; say(`LCM-8 WITH AN ${def.label} INBOUND TO ${r.run.pl.beach.name}`, 2.5); sfx.dock();
}
// 7 (ngc/wheeledgame): the motor pool - then 1 = an M151A2 slung in by a CH-46 (10 materiel), 2 = an M35A2 run in by an
// LCM-8 (20), to the selected friendly island (else the nearest friendly island, else the carrier deck)
function deliverVehicle(type = 'm151') { if (!war.allow(1, type)) { say(war.gateMsg(1, type), 1.8); return false; } return pool.deliver(type); }   // (TECH TREE gate)
let motorPick = 0;
function motorChoice() { motorPick = 3; say('MOTOR POOL  -  1: M151A2 BY CH-46 (10 MATERIEL)  ·  2: M35A2 BY LCM-8 (20)', 3); }
function motorKey(code) { if (motorPick <= 0 || (code !== 'Digit1' && code !== 'Digit2')) return false; motorPick = 0; deliverVehicle(code === 'Digit2' ? 'm35' : 'm151'); return true; }
// ================================================================ COMMANDER
// The player commands TASK FORCE ALBATROSS: any unit can be taken out at the carrier or a friendly island from the
// command board (\, units/commander/board.js), units already out are a key away (/), and the unit you leave carries
// on - the Huey's crew flies her home (heliai.js), the jets' wingman flies CAP and traps (wingman.js), vehicles park,
// a Marine you leave goes back to the barracks. Lives are the fleet's reserves (fleet.js): losing a unit costs the
// fleet; the war is lost when the fleet is spent.
const ALIVE_HELI = () => Z.alive && G.mode === 'zarch';
const groundDead = def => !!(def.dead || def.wrecked);
const rosterIdOf = def => def === heliC ? 'heli' : def === jetC ? 'jet' : def === tomcatC ? 'tomcat' : def === m60C ? 'm60' : def === m113C ? 'm113' : def === foot ? 'marine' : def && def.T && def.T.mil ? def.type : def && def.id;
// where something is, in words for the board
function whereIs(x, z) {
  const c = war.carrier;
  if (c && c.sinking === undefined && war.shipAt(x, z) === c) return 'ON THE ALBATROSS';
  let best = null, bd = 1e9; for (const I of ISLANDS) { if (!I.pad) continue; const d = Math.hypot(I.pad.x - x, I.pad.z - z); if (d < bd) { bd = d; best = I; } }
  if (best && bd < 140) return `AT ${best.name}`;
  if (c && c.sinking === undefined) { const d = Math.hypot(x - c.p.x, z - c.p.z); return `${Math.round(d)} m ${bearing(x - c.p.x, z - c.p.z)} OF THE ALBATROSS`; }
  return 'IN THE FIELD';
}
function commandBases() {
  const out = [], c = war.carrier;
  if (c && c.sinking === undefined) out.push({ key: 'ship', kind: 'ship', name: 'ALBATROSS', x: c.p.x, z: c.p.z });
  for (const I of ISLANDS) if (I.owner === 1 && I.pad) out.push({ key: I.name, kind: 'island', name: I.name, I, x: I.pad.x, z: I.pad.z });
  return out;
}
// spots: a clear deck park on the ALBATROSS (r = the vehicle's half length), a motor pool spot, a pad
function deckSpotFor(def, r) { for (let k = 0; k < 7; k++) { const s = GR.deckSpot(k); if (s && GR.clearAt(s.x, s.z, r, def)) return s; } return null; }
function padSpot(I) { const p = I.pad; return { x: p.x, z: p.z, y: groundY(p.x, p.z), yaw: Math.atan2(p.x, p.z) }; }
function marineSpots(b) {
  if (b.kind === 'ship') { const out = []; for (let k = 0; k < 5; k++) { const s = GR.deckSpot(k); if (s) out.push({ x: s.x, y: s.y, z: s.z, yaw: s.yaw }); } return out; }
  const p = b.I.pad, out = [];
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, x = p.x + Math.cos(a) * (p.r + 3), z = p.z + Math.sin(a) * (p.r + 3); if (!holeOf(x, z) && terrainH(x, z) > 0.5) out.push({ x, y: terrainH(x, z), z, yaw: Math.atan2(x - p.x, z - p.z) + Math.PI }); }
  return out;
}
// the Huey left in the air: the crew flies to the nearest of the ALBATROSS's aft spot and the friendly pads
function heliHome() {
  const c = war.carrier, cands = [];
  if (c && c.sinking === undefined) cands.push({ name: 'THE ALBATROSS', x: c.p.x, z: c.p.z, ship: true });
  for (const I of ISLANDS) if (I.owner === 1 && I.pad && !I.cave) cands.push({ name: I.name, x: I.pad.x, z: I.pad.z, I });
  if (HOME_B.isl.owner === 1) cands.push({ name: HOME_B.name, x: PAD.x, z: PAD.z, I: HOME_B.isl });
  let best = null, bd = 1e9; for (const k of cands) { const d = Math.hypot(k.x - H.pos.x, k.z - H.pos.z) * (k.ship ? 0.8 : 1); if (d < bd) { bd = d; best = k; } }   // (the deck a little preferred: fuel and the crew)
  const T = { x: H.pos.x, y: 0, z: H.pos.z, vx: 0, vz: 0, hdg: null }, TL = {};
  // AIRLIFT: with a load on the hook the crew flies gently, sets it down beside the spot (hovering), releases it, then lands
  const tgt = () => { const t = target(); if (!airlift.load || airlift.load.phase !== 'hooked') return t; const h = t.hdg, ox = h !== null && h !== undefined ? Math.sin(h) * 26 : 24, oz = h !== null && h !== undefined ? -Math.cos(h) * 26 : 6; return Object.assign(TL, t, { x: t.x + ox, z: t.z + oz, y: groundY(t.x + ox, t.z + oz), hover: 4.0, gentle: true }); };   // (on the deck: forward along it)
  heliAI.engage(H, tgt);
  function target() {
    const cc = war.carrier;
    if (best && best.ship) { if (cc && cc.sinking === undefined) { const s = spawnSpot(); return Object.assign(T, { x: s.x, y: s.y, z: s.z, vx: cc.v.x, vz: cc.v.z, hdg: -cc.yaw }); } best = null; }
    if (best && best.I) { const p = best.I.pad; return Object.assign(T, { x: p.x, y: groundY(p.x, p.z), z: p.z, vx: 0, vz: 0, hdg: null }); }
    return Object.assign(T, { y: Math.max(terrainH(T.x, T.z), 0), vx: 0, vz: 0 });   // nowhere to go: down where it is
  }
  heliAI.dest = best ? best.name : '';
  feed(`HUEY: THE CREW IS FLYING HER TO ${best ? best.name : 'THE NEAREST CLEARING'}`, 'info');
}
// the Huey: take her where she is (from the crew, or up from the hangar), or a new one from the reserve at a base
function switchHeli() {
  if (!ALIVE_HELI()) return 'THE HUEY IS LOST';
  if (G.heliStowed) { spotHeli(); if (G.heliStowed) return 'NO DECK TO SPOT HER ON'; }
  return crafts.control('heli', 0, 'command') ? '' : 'CANNOT REACH THE HUEY';
}
function deployHeli(b) {
  G.heliStowed = false; G.fuel = 100; G.cargo = 0; D.reset(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; cmH.reset(); G.mode = 'zarch'; T.alive = true;
  resetZarch(true, b.kind === 'island' ? padSpot(b.I) : null); shipMesh.visible = true;
  return crafts.control('heli', 0, 'command') ? '' : 'THE HUEY WOULD NOT TAKE A CREW';
}
// cat 1 is one catapult for both jets
function catBusy(D) {
  const o = D === jetC ? tomcatC : jetC; if (!o.present()) return '';
  const A = o === jetC ? JP.J : tomcatC.TP.A;
  return A.cat || (o.park.on && o.park.cat) ? `CAT 1 IS BUSY  -  THE ${o.label} IS ON IT (SWITCH TO IT AND LAUNCH, OR STAND IT DOWN)` : '';
}
function groundRow(id, def, r) {
  return {
    id, label: def.label,
    out: () => def.present() && !groundDead(def), active: () => crafts.active === def && !groundDead(def),
    status: () => { const f = def.frame({}); return `${crafts.active === def ? 'YOU ARE DRIVING' : def.driver && def.driver.state === 'driving' ? 'DRIVING' : 'PARKED'} ${whereIs(f.x, f.z)}`; },
    can: () => '',
    deploy: b => {
      const sp = b.kind === 'ship' ? deckSpotFor(def, r) : GR.motorPool(b.I, r);
      if (!sp) return `NO ROOM FOR THE ${def.label} AT ${b.name}`;
      def.spawnAt(sp); return crafts.control(def.id, 0, 'command') ? '' : `THE ${def.label} WOULD NOT TAKE A CREW`;
    },
    switchTo: () => crafts.control(def.id, 0, 'command') ? '' : `CANNOT REACH THE ${def.label}`,
    canStandDown: () => crafts.active !== def && def.present() && !groundDead(def) && atBase(def),
    standDown: () => { if (!atBase(def)) return `THE ${def.label} MUST BE AT A BASE TO STAND DOWN`; def.stow(); return ''; },
  };
}
function atBase(def) { const f = def.frame({}), w = whereIs(f.x, f.z); return w === 'ON THE ALBATROSS' || (w.startsWith('AT ') && ISLANDS.some(I => I.owner === 1 && `AT ${I.name}` === w)); }
function jetRow(id, def, A, P) {
  return {
    id, label: def.label === 'HORNET' ? 'F/A-18A HORNET' : 'F-14A TOMCAT',
    out: () => def.present(), active: () => crafts.active === def && P.alive && !P.ejected,
    status: () => { const s = def.status(); return s === 'PARKED ON DECK' || s === 'FLYING' ? `${s === 'FLYING' ? 'FLYING' : 'PARKED'} ${whereIs(A.pos.x, A.pos.z)}` : `${s}  ·  ${Math.round(A.pos.y * 3.28)} FT  ·  FUEL ${Math.round(A.fuel * 2.2)} LB`; },
    can: () => catBusy(def),
    deploy: () => def.launch({ command: true }) ? '' : `THE ${def.label} COULD NOT BE SPOTTED ON CAT 1`,
    switchTo: () => crafts.control(def.id, 0, 'command') ? '' : `CANNOT REACH THE ${def.label}`,
    recall: () => def.wing ? (def.recall(), '') : `THE ${def.label} IS NOT ON CAP`,
    canStandDown: () => crafts.active !== def && def.park.on,
    standDown: () => { if (!def.park.on) return 'ONLY A JET PARKED ON THE DECK STANDS DOWN'; P.stow(); def.park.on = false; return ''; },
  };
}
// the WHEELED motor pool (units/wheeled/motorpool.js): several of a type can be out (every friendly island stocks
// them); the board switches you to the nearest one, takes a new one out with the pool's spawner, stands one down
function wheeledRow(type, r) {
  const outList = () => pool.list.filter(V => V.type === type && V.exists && !V.wrecked && V.owner !== 'civ');
  const nearest = (x, z) => { let best = null, bd = 1e9; for (const V of outList()) { const d = Math.hypot(V.sim.pos[0] - x, V.sim.pos[2] - z); if (d < bd) { bd = d; best = V; } } return best; };
  const mine = () => crafts.active && crafts.active.type === type && pool.list.includes(crafts.active) ? crafts.active : null;
  const parkedAtBase = () => outList().find(V => V !== crafts.active && atBase(V));
  return {
    id: type, label: fleet.type(type).label, multi: true,
    out: () => outList().length > 0, outCount: () => outList().length, active: () => !!mine() && !mine().wrecked,
    status: () => { const a = mine(), n = outList().length, V = a || nearest(Z.pos.x, Z.pos.z); if (!V) return ''; return `${n > 1 ? n + ' OUT  ·  ' : ''}${a ? 'YOU ARE DRIVING' : 'NEAREST PARKED'} ${whereIs(V.sim.pos[0], V.sim.pos[2])}`; },
    can: () => '',
    deploy: b => {
      const V = pool.spawners[type](b.kind === 'ship' ? 'deck' : b.I); if (!V) return `NO ROOM FOR AN ${fleet.type(type).label} AT ${b.name}`;
      return crafts.control(V.id, 0, 'command') ? '' : `THE ${V.label} WOULD NOT TAKE A CREW`;
    },
    switchTo: () => { const V = nearest(Z.pos.x, Z.pos.z); if (!V) return `NO ${fleet.type(type).short} OUT`; return crafts.control(V.id, 0, 'command') ? '' : `CANNOT REACH THE ${V.label}`; },
    canStandDown: () => !!parkedAtBase(),
    standDown: () => { const V = parkedAtBase(); if (!V) return `NO ${fleet.type(type).short} PARKED AT A BASE`; pool.remove(V); return ''; },
  };
}
const roster = [
  { id: 'heli', label: 'UH-1H HUEY', out: ALIVE_HELI, active: () => crafts.active === heliC && Z.alive,
    status: () => G.heliStowed ? 'IN THE HANGAR ON THE ALBATROSS' : crafts.active === heliC ? `${H.landed ? 'ON THE SKIDS' : 'FLYING'} ${whereIs(H.pos.x, H.pos.z)}` : heliAI.phase !== 'off' && heliAI.phase !== 'landed' ? `CREW FLYING HER TO ${heliAI.dest}` : H.landed ? `PARKED ${whereIs(H.pos.x, H.pos.z)}` : `HOVERING ${whereIs(H.pos.x, H.pos.z)}`,
    can: () => '', deploy: b => deployHeli(b), switchTo: () => switchHeli() },
  jetRow('jet', jetC, JP.J, JP),
  jetRow('tomcat', tomcatC, tomcatC.TP.A, tomcatC.TP),
  groundRow('m60', m60C, 4.8),
  groundRow('m113', m113C, 3.6),
  wheeledRow('m151', 2.4),
  wheeledRow('m35', 3.6),
  { id: 'marine', label: 'MARINE RIFLEMAN', out: () => crafts.active === foot && foot.exists && foot.alive, active: () => crafts.active === foot && foot.alive,
    status: () => `ON FOOT ${whereIs(foot.W.x, foot.W.z)}`, can: () => '',
    deploy: b => {
      if (!foot.spawnAt(marineSpots(b), { fresh: true })) return 'NO ROOM TO PUT A MARINE DOWN THERE';
      if (!crafts.control('foot', 0, 'command')) return 'THE MARINE IS NOT READY';
      foot.fromReserve = true; return '';
    },
    switchTo: () => '' },
  // ngc/ch46fly: the CH-46E (last, so the board's older rows keep their keys)
  { id: 'ch46', label: 'CH-46E SEA KNIGHT', out: () => ch46C.present(), active: () => crafts.active === ch46C && ch46C.present(), status: () => ch46C.status(), can: () => '',
    deploy: b => ch46C.deploy(b), switchTo: () => crafts.control('ch46', 0, 'command') ? '' : 'CANNOT REACH THE SEA KNIGHT',
    canStandDown: () => crafts.active !== ch46C && ch46C.atBase() && !ch46C.crew, standDown: () => ch46C.atBase() ? (ch46C.stow(), '') : 'THE SEA KNIGHT MUST BE ON THE ALBATROSS OR A FRIENDLY PAD' },
];
airdrop.decorate(roster);   // AIRLIFT: the vehicle rows get the C-130 air drop (board key C)
const rosterOut = id => { const r = roster.find(r => r.id === id); return !!(r && r.out()); };
function checkSpent() { if (!G.over && G.state === 'play' && fleet.spent(rosterOut)) { feed('THE FLEET IS SPENT', 'bad'); gameOver(); } }
const nextLabel = () => ALIVE_HELI() || fleet.has('heli') ? 'THE HUEY' : (roster.find(r => r.out() && !r.active()) || { label: 'NOTHING' }).label;
// a unit is lost: the fleet counts it; the one you were in opens the board on the next unit
function onUnitLost(id, why, mine) {
  const t = fleet.type(id); if (!t) return;
  fleet.lose(id, why);
  if (id === 'marine') foot.fromReserve = false;
  checkSpent();
  if (mine && !G.over && G.state === 'play') commander.onLoss(`${t.short} LOST${why ? '  -  ' + why : ''}`, nextLabel());
}
// the hand-on after a loss (the crew timers in the crafts): the Huey where she is, else a new one from the reserve,
// else any unit that is out, else the board - unless the commander is already choosing on it
function autoNext(msg) {
  if (G.over) return;
  if (commander.holdAuto()) return;
  commander.lossMode = false; commander.close(); clearHandOn();
  if (roster.some(r => r.active())) return;   // still in a working unit (an armour crewman down, not the tank)
  if (ALIVE_HELI() && crafts.active !== heliC) { const w = switchHeli(); if (!w) { say(msg ? msg.replace(/HELICOPTER/, 'HUEY') : 'IN THE HUEY', 2.5); return; } }
  if (!Z.alive && fleet.take('heli')) { toHeli(msg || (war.carrier && war.carrier.sinking === undefined ? 'NEW CREW  -  A NEW HUEY ON THE ALBATROSS' : 'NEW CREW  -  A NEW HUEY ON THE HOME PAD')); return; }
  const r = roster.find(r => r.out() && !r.active()); if (r && !r.switchTo()) { say(`${r.label}  -  ${r.status()}`, 2.5); return; }
  checkSpent(); if (G.over) return;
  commander.open('NO HUEY LEFT  -  PICK YOUR NEXT UNIT');
}
function clearHandOn() {   // the commander picked a unit: no automatic hand-on later
  G.crewDownT = 0; G.jetDownT = 0; G.tomcatDownT = 0; Z.handedOn = true;
  if (JP.active && !JP.alive) JP.stow(); if (tomcatC.TP.active && !tomcatC.TP.alive) tomcatC.TP.stow();
}
const commander = createCommander({
  fleet, say, feed, sfx, hud: $('hud'), roster, bases: commandBases, store: PSTORE,
  airdrop: { cost: AIR_COST, lines: () => airdrop.lines(), watch: () => airdrop.watch() },   // AIRLIFT: C on the board, V to watch
  canOpen: () => { if (G.state !== 'play') return false; if (G.mode !== 'zarch') { say('CLIMB OUT OF THE CAVE FIRST', 1.4); return false; } return true; },
  gate: id => war.allow(1, id) ? '' : war.gateMsg(1, id), research: () => techUI.open(),   // TECH TREE
  researchLine: () => { const T = war.tech[1], c = T.current && T.node(T.current.id); return c ? `<br>RESEARCH <b>${c.name}  ${Math.round(T.progress * 100)}%  (${Math.ceil(T.remaining)} s)</b>  ·  T: THE RESEARCH PAGE` : '<br>RESEARCH <b>IDLE</b>  ·  T: THE RESEARCH PAGE'; },
  here: () => Z.pos, mat: () => G.mat, fuelStores: () => G.res,
  onOpen: () => { if (document.pointerLockElement) document.exitPointerLock(); if (bigMap) { bigMap = false; setMapSize(); } },
  picked: () => clearHandOn(),
  closedWhileLost: () => autoNext(),
  // a Marine you leave (and who came from the reserve) goes back to the barracks
  leaving: () => ({ foot: crafts.active === foot && foot.exists && foot.alive && foot.fromReserve }),
  left: tok => { if (tok && tok.foot && crafts.active !== foot) { fleet.give('marine'); foot.fromReserve = false; feed('THE RIFLEMAN IS BACK WITH HIS PLATOON  -  MARINES IN RESERVE +1', 'info'); } },
});
// TECH TREE: the RESEARCH page (techui.js); the command board's T and SHIFT+\ open it, T / \ go back to the board
const techUI = createTechUI({ war, hud: $('hud'), say, feed, sfx, store: PSTORE, onBoard: () => commander.open(),
  onOpen: () => { commander.close(); if (document.pointerLockElement) document.exitPointerLock(); if (bigMap) { bigMap = false; setMapSize(); } } });
applyUI();   // RENDERKIT ui: html.ngc-rkui and .rk-ui on the menu roots (the boards exist from here)
function commandKey(code, shift = false) {   // \ the board, SHIFT+\ the RESEARCH page, / the next unit out (main's keydown, before the craft's own keys)
  if (code !== 'Backslash' && code !== 'IntlBackslash' && code !== 'Slash') return false;
  if (G.mode !== 'zarch') { say('CLIMB OUT OF THE CAVE FIRST', 1.4); return true; }
  if (code === 'Slash') commander.next(); else if (shift) { commander.close(); techUI.toggle(); } else commander.toggle();
  return true;
}
// the per-frame entry for the surface: the active craft flies / drives / walks, the parked ones idle (craft.js)
function updateZarch(dt, inp) {
  inp.pad = G.craft === 'heli' || isJet() ? null : G.craft === 'foot' ? readGamepad() : readPad(); inp.keyboardOnly = keyboardOnly && !XR?.motionInput;   // on foot: a game controller only, never the HOTAS
  crafts.update(dt, inp);
  armDelivery.update(dt);   // ARMOUR: landing craft under way
  airdrop.update(dt);   // AIRLIFT: C-130 heavy drops under way
  { const w = !!airdrop.watching; if (w !== G.adWatch) { G.adWatch = w; $('bot').style.visibility = w ? 'hidden' : ''; } }   // AIRLIFT: watching a drop - your own unit's instrument line steps aside
  if (G.crewDownT > 0) { G.crewDownT -= dt; if (G.crewDownT <= 0 && !G.over) autoNext(war.carrier && war.carrier.sinking === undefined ? 'NEW CREW  -  IN THE HELICOPTER ON THE ALBATROSS' : 'NEW CREW  -  ON THE HOME PAD'); }   // COMMANDER: the next unit
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

// Build every base's cave once: each base has its own procedurally generated cave (level.js, seeded by the base name,
// so the same island always has the same cave) and its own turrets/tanks/pod state, so a looted
// tank stays empty and a destroyed turret stays dead. The home cave is friendly: no turrets, a big reservoir tank and
// a blue intake pad where carried fuel is pumped into the reservoir.
const CARGO_MAX = 100;
function buildCaves() {
  const t0 = performance.now();
  BASES.forEach(b => {
    const L = b.L = buildLevel(b.tier, b.name, { home: b.kind === 'home' });
    const grp = b.group = new THREE.Group(); grp.scale.setScalar(CS); grp.position.set(b.x - CAVE_OX * CS, b.h - CAVE_SINK - L.H * CS, b.z); zScene.add(grp);
    const mesh = buildCaveMesh(L, { depth: CAVE_DEPTH }); grp.add(mesh);
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
  PROF.caves = performance.now() - t0;
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
// COMMANDER: the Huey is gone and there is none in reserve: out of the cave view with no helicopter (the pod drops back)
function leaveCaveDead() {
  if (T.pod && T.pod.attached) Object.assign(T.pod, { attached: false, x: T.lvl.orb.x, y: T.lvl.orb.y, vx: 0, vy: 0 });
  G.mode = 'zarch'; Z.alive = false; Z.handedOn = true; heliAI.off(); shipMesh.visible = false; shipShadow.visible = false; sfx.engine(0);
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
  onUnitLost('heli', why, false);   // COMMANDER: the fleet loses the Huey; the next one comes out of the reserve (below)
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
  if (!T.alive) {   // COMMANDER: crashed in a cave - a new Huey from the reserve on the home pad, else back out to the fleet
    T.deadT -= dt;
    if (T.deadT <= 0 && !G.over) { if (fleet.take('heli')) respawnHome(); else { leaveCaveDead(); autoNext(); } }
    stepParts(T.parts, dt); return;
  }
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
  commander.close();
  setTimeout(() => { if (G.over) showEnd('DEFEAT', 'THE FLEET IS SPENT'); }, 2500);   // COMMANDER: no unit in reserve, none left out there
}
function startTransition(label, swap) { G.state = 'trans'; G.tr = { t: 0, phase: 0, swap }; $('fadeText').textContent = label; }
function newGame() {
  cancelRescue(); D.reset(); stowCrafts(); G.jetDownT = 0; G.tomcatDownT = 0;
  fleet.reset(); commander.close(); techUI.close(); commander.lossMode = false; foot.fromReserve = false; heliAI.off();   // COMMANDER: a full fleet in reserve
  airlift.reset(); airdrop.clear();   // AIRLIFT
  G.score = 0; G.fuel = 100; G.visit = 0; G.mode = 'zarch'; G.over = false; G.state = 'play';
  G.res = 250; G.mat = 90; G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX; G.cargo = 0; cmH.reset(); selIsl = null; feedItems.length = 0; G.advT = 12;
  fx.clear(); war.reset(); resetBases(); fog.reset(); fog.enabled = !params.has('nofog'); resetZarch(true); placeVehicles();
  $('title').style.display = 'none'; $('title').querySelector('h1').textContent = 'THRUST / ZARCH'; $('result').textContent = '';
  say('ROTOR SPOOLING  -  RAISE COLLECTIVE TO LIFT', 3);
  feed('COMMAND: TAKE THE ISLANDS BEFORE THE ENEMY DOES  -  M FOR THE MAP  ·  \\ COMMAND BOARD'); feed('THE ENEMY CARRIER KRAKEN IS SOMEWHERE NORTH-EAST');
}
function pressStart() { if (G.state === 'title') newGame(); }

// Pause menu (Esc / P): resume, call a repair drop, or abandon the helicopter and start again on the carrier - the way
// out of any stuck state (set down broken somewhere logistics can't help, wedged in a cave, out of fuel at sea).
const menu = { items: [], sel: 0 };
let rkPick = null;   // RENDERKIT: the choice made in this session's menu (applies after reload)
// SEAWORLD: the sea state slider and the weather drift switch (in every variant of the menu)
const seaItems = () => [{ id: 'sea', label: 'SEA STATE', slider: true }, { id: 'seadrift', label: `WEATHER DRIFT: ${SEA_PREF.drift ? 'ON' : 'OFF'}`, note: SEA_PREF.drift ? 'THE SEA WANDERS UP TO 2 STATES ROUND YOUR CHOICE OVER THE WAR' : 'THE SEA STAYS WHERE YOU SET IT' },
  { id: 'markers', label: `UNIT MARKERS: ${markers.label()}`, note: 'ICON + HEALTH BAR OVER THE UNITS YOU CAN SEE  ·  ALL / DAMAGED ONLY / OFF  ·  F8 IN THE GAME' },
  { id: 'sealife', label: `SEA LIFE: ${slQ.toUpperCase()}`, note: 'FISH, DOLPHINS AND SEABIRDS ROUND THE SHIPS AND THE CAMERA  ·  OFF / LOW / MEDIUM / HIGH' },
  { id: 'renderkit', label: `RENDERKIT GRAPHICS: ${rkPick ?? RK.label}${rkPick ? ' (RELOAD)' : ''}`, note: 'PHYSICAL MATERIALS, TERRAIN, WATER, SKY, SMOKE, POST AND UI  ·  ON / OFF  ·  APPLIES AFTER RELOAD  ·  ?rk=' }];   // SEALIFE, RENDERKIT

function menuItems() {
  if (isJet()) return [   // flying the Hornet (or the TOMCAT): no logistics; 'respawn' writes the jet off and puts you back in the helicopter
    { id: 'resume', label: 'RESUME' },
    { id: 'logistics', label: 'CALL LOGISTICS', note: 'JETS ARE SERVICED ON THE ALBATROSS DECK', off: true },
    { id: 'respawn', label: 'BACK TO THE ALBATROSS', note: G.craft === 'tomcat' ? `WRITES OFF THIS TOMCAT (${G.tomcats} LEFT IN THE HANGAR)  -  YOU GO BACK TO THE HELICOPTER` : `WRITES OFF THIS HORNET (${G.jets} LEFT IN THE HANGAR)  -  YOU GO BACK TO THE HELICOPTER`, off: G.over },
    { id: 'command', label: 'COMMAND BOARD', note: 'TAKE OUT OR SWITCH TO ANY UNIT OF THE FLEET  ·  \\ IN THE GAME', off: G.over || G.mode !== 'zarch' },   // COMMANDER
    { id: 'research', label: 'RESEARCH / TECH TREE', note: 'UNLOCK UNITS, LOGISTICS AND FLEET UPGRADES', off: G.over || G.mode !== 'zarch' },
    { id: 'fov', label: 'COCKPIT FOV', slider: true }, ...seaItems(),
    { id: 'quit', label: 'QUIT TO TITLE', note: 'ENDS THIS WAR' },
  ];
  if (G.craft !== 'heli') return [   // on foot or in a ground vehicle: a pick-up back to the helicopter, nothing written off
    { id: 'resume', label: 'RESUME' },
    { id: 'logistics', label: 'CALL LOGISTICS', note: 'FOR THE HELICOPTER  -  GET BACK IN IT FIRST', off: true },
    { id: 'respawn', label: 'PICK-UP TO THE ALBATROSS', note: 'THE CREW IS FLOWN BACK AND THE HELICOPTER RECOVERED TO THE DECK', off: G.over || G.crewDownT > 0 },
    { id: 'command', label: 'COMMAND BOARD', note: 'TAKE OUT OR SWITCH TO ANY UNIT OF THE FLEET  ·  \\ IN THE GAME', off: G.over || G.mode !== 'zarch' },   // COMMANDER
    { id: 'research', label: 'RESEARCH / TECH TREE', note: 'UNLOCK UNITS, LOGISTICS AND FLEET UPGRADES', off: G.over || G.mode !== 'zarch' },
    { id: 'fov', label: 'COCKPIT FOV', slider: true }, ...seaItems(),
    { id: 'quit', label: 'QUIT TO TITLE', note: 'ENDS THIS WAR' },
  ];
  const alive = G.mode === 'zarch' ? Z.alive : T.alive, landed = G.mode === 'zarch' ? H.landed : T.landed, home = war.carrier && war.carrier.sinking === undefined ? 'THE ALBATROSS' : 'THE HOME PAD';
  const last = G.lives <= 0, lastAll = last && fleet.spent(id => id !== 'heli' && rosterOut(id));   // COMMANDER: the war is lost only with the fleet
  return [
    { id: 'resume', label: 'RESUME' },
    { id: 'logistics', label: 'CALL LOGISTICS', note: G.rescue ? `INBOUND  -  ${rescueStatus()}` : landed ? (G.mode === 'zarch' ? 'A DROPSHIP FLIES OUT A PARA REPAIR TEAM' : 'FUEL DROP AND FIELD REPAIR WHERE YOU ARE') : 'LAND FIRST', off: !alive || !landed || !!G.rescue },
    { id: 'respawn', label: `RESPAWN ON ${home}`, note: lastAll ? 'THIS IS THE FLEET\'S LAST UNIT  -  ABANDONING IT LOSES THE WAR' : last ? 'NO HUEY IN RESERVE  -  THE CREW COMES HOME AND YOU PICK ANOTHER UNIT' : `ABANDON THIS HELICOPTER  -  COSTS ONE (${G.lives} IN RESERVE)`, off: !alive || G.over },
    { id: 'command', label: 'COMMAND BOARD', note: 'TAKE OUT OR SWITCH TO ANY UNIT OF THE FLEET  ·  \\ IN THE GAME', off: G.over || G.mode !== 'zarch' },   // COMMANDER
    { id: 'research', label: 'RESEARCH / TECH TREE', note: 'UNLOCK UNITS, LOGISTICS AND FLEET UPGRADES', off: G.over || G.mode !== 'zarch' },
    { id: 'fov', label: 'COCKPIT FOV', slider: true }, ...seaItems(),
    { id: 'quit', label: 'QUIT TO TITLE', note: 'ENDS THIS WAR' },
  ];
}
function openMenu() {
  if (G.state !== 'play') return;
  commander.close(); techUI.close();   // COMMANDER: the boards step aside (after a loss the hand-on goes ahead)
  G.state = 'paused'; menu.sel = 0; if (document.pointerLockElement) document.exitPointerLock();
  if (bigMap) { bigMap = false; setMapSize(); }
  sfx.engine(0); crafts.silence(); armDelivery.silence(); airdrop.silence(); airlift.silence(); say('', 0);   /* ARMOUR: the landing craft's diesels */  renderMenu(); $('menu').classList.add('on');
}
function closeMenu() { $('menu').classList.remove('on'); if (G.state === 'paused') G.state = 'play'; menu.confirm = null; }
function renderMenu() {
  menu.items = menuItems();
  $('menuSub').textContent = `SCORE ${G.score}  ·  FLEET ${fleet.total()} IN RESERVE (HUEYS ${Math.max(0, G.lives)}  HORNETS ${G.jets}  TOMCATS ${G.tomcats})  ·  LOSSES ${fleet.losses()}  ·  ${G.craft !== 'heli' && crafts.active.menuNote ? crafts.active.menuNote() : `FUEL ${Math.round(G.fuel)}%`}`;
  const box = $('menuItems'); box.textContent = '';
  menu.items.forEach((it, i) => {
    if (it.slider) {   // COCKPIT FOV, SEA STATE: drag, or LEFT / RIGHT while it's selected
      const S = SLIDERS[it.id], d = document.createElement('div'); d.className = 'slider' + (i === menu.sel ? ' sel' : '');
      d.innerHTML = `<span>${it.label}  <b>${S.show(S.get())}</b></span><input type="range" min="${S.min}" max="${S.max}" step="1" value="${S.get()}"><small>${S.small}</small>`;
      const r = d.querySelector('input'), val = d.querySelector('b'); r.oninput = () => { S.set(+r.value); val.textContent = S.show(S.get()); };
      d.onmouseenter = () => { menu.sel = i; for (const [k, c] of [...box.children].entries()) c.classList.toggle('sel', k === i); };
      box.appendChild(d); return;
    }
    const b = document.createElement('button'); b.dataset.action = it.id; b.disabled = !!it.off; b.className = i === menu.sel ? 'sel' : '';
    const conf = menu.confirm === it.id; if (conf) b.classList.add('confirm');   // RENDERKIT ui: the confirm step in amber (no style in the classic look)
    b.innerHTML = (conf ? `${it.label}?  PRESS AGAIN TO CONFIRM` : it.label) + (it.note ? `<small>${it.note}</small>` : '');
    b.onmouseenter = () => { if (!it.off) { menu.sel = i; for (const [k, c] of [...box.children].entries()) c.classList.toggle('sel', k === i); } };
    b.onclick = () => { menu.sel = i; menuPick(); };
    box.appendChild(b);
  });
}
function menuKey(e) {
  const n = menu.items.length;
  if (e.code === 'Escape' || e.code === 'KeyP') { closeMenu(); return; }
  if (['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) {
    const d = ['ArrowUp', 'KeyW'].includes(e.code) ? -1 : 1;
    for (let k = 0; k < n; k++) { menu.sel = (menu.sel + d + n) % n; if (!menu.items[menu.sel].off) break; }
    menu.confirm = null; renderMenu(); $('menuItems').children[menu.sel]?.scrollIntoView({ block: 'nearest' }); sfx.ui?.('select');
  }
  const it = menu.items[menu.sel];
  if (it && it.slider && ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) { const S = SLIDERS[it.id]; S.set(S.get() + (['ArrowLeft', 'KeyA'].includes(e.code) ? -S.nudge : S.nudge)); renderMenu(); sfx.ui?.('select'); return; }
  if (e.code === 'Enter' || e.code === 'Space') menuPick();
}
function menuPick() {
  const it = menu.items[menu.sel]; if (!it || it.off || it.slider) return;
  sfx.ui?.('select');
  if ((it.id === 'respawn' || it.id === 'quit') && menu.confirm !== it.id) { menu.confirm = it.id; renderMenu(); return; }
  if (it.id === 'resume') closeMenu();
  else if (it.id === 'logistics') { closeMenu(); callLogistics(); }
  else if (it.id === 'seadrift') { setSeaDrift(!SEA_PREF.drift); renderMenu(); }   // SEAWORLD
  else if (it.id === 'markers') { markers.cycle(); renderMenu(); }   // UNIT MARKERS
  else if (it.id === 'renderkit') { const next = (rkPick ?? RK.label) === 'OFF'; RK.save(next); rkPick = next ? 'ON' : 'OFF'; renderMenu(); }   // RENDERKIT
  else if (it.id === 'sealife') { setSeaLifeQ(SL_Q[(SL_Q.indexOf(slQ) + 1) % SL_Q.length]); renderMenu(); }   // SEALIFE

  else if (it.id === 'respawn') { closeMenu(); abandonHeli(); }
  else if (it.id === 'research') { closeMenu(); techUI.open(); }
  else if (it.id === 'command') { closeMenu(); commander.open(); }   // COMMANDER
  else if (it.id === 'quit') { closeMenu(); quitToTitle(); }
}
// SEAWORLD: U at a lift's console on the ALBATROSS's deck edge (or standing / parked on the lift) sends it up or down
function liftConsole() {
  const c = war.carrier; if (!c || c.sinking !== undefined || !c.parts.lifts) return false;
  const [lx, lz] = GR.toLocal(c, Z.pos.x, Z.pos.z), yl = Z.pos.y - c.p.y;
  for (const L of c.parts.lifts) {
    const atConsole = Math.hypot(lx - L.con.lx, lz - L.con.lz) < 3 && Math.abs(yl - 8) < 2.5, onIt = c.parts.liftAt(lx, lz) === L && Math.abs(yl - L.y) < 2.5;
    if (!atConsole && !onIt) continue;
    const dir = c.parts.lift(L.i); say(`LIFT ${L.i + 1} ${dir === 'down' ? 'GOING DOWN TO THE HANGAR DECK' : 'COMING UP TO THE FLIGHT DECK'}`, 2); sfx.ui?.('select');
    return true;
  }
  return false;
}
// the crew is picked up and the airframe written off; a fresh helicopter waits on the carrier
function abandonHeli() {
  // COMMANDER: a written-off unit is the fleet's loss; the way back is the Huey (recovered to the deck, or a new one
  // from the reserve), else another unit that is out, else the command board
  if (G.craft === 'jet') { jetC.writeOff(); fleet.lose('jet', 'WRITTEN OFF'); feed('HORNET WRITTEN OFF', 'bad'); backToHuey('BACK ON THE ALBATROSS  -  IN THE HELICOPTER'); return; }
  if (G.craft === 'tomcat') { tomcatC.writeOff(); fleet.lose('tomcat', 'WRITTEN OFF'); feed('TOMCAT WRITTEN OFF', 'bad'); backToHuey('BACK ON THE ALBATROSS  -  IN THE HELICOPTER'); return; }   // TOMCAT
  if (G.craft !== 'heli') { if (crafts.active === foot && foot.alive && foot.fromReserve) { fleet.give('marine'); foot.fromReserve = false; } backToHuey('PICKED UP  -  BACK IN THE HELICOPTER ON THE ALBATROSS'); return; }
  cancelRescue();
  if (G.mode !== 'zarch' ? !T.alive : !Z.alive) return;
  if (G.mode === 'zarch') fx.explode(Z.pos.x, Z.pos.y, Z.pos.z, 1.2, { debris: 4, color: 0x55613d });
  fleet.lose('heli', 'ABANDONED');
  if (!fleet.take('heli')) {
    leaveCaveDead(); T.alive = false; say('HUEY ABANDONED  -  NONE IN RESERVE', 2);
    checkSpent(); if (G.over) return;
    const r = roster.find(r => r.out() && !r.active()); if (r && !r.switchTo()) return;
    commander.open('THE HUEY IS ABANDONED  -  PICK YOUR NEXT UNIT'); return;
  }
  respawnHome(); G.rockets = ROCKETS_MAX; G.bombs = BOMBS_MAX;
  say(war.carrier && war.carrier.sinking === undefined ? 'CREW RECOVERED  -  NEW HELICOPTER ON THE ALBATROSS' : 'CREW RECOVERED  -  NEW HELICOPTER ON THE HOME PAD', 2.5);
}
function backToHuey(msg) {   // COMMANDER: the Huey as she is recovered to the deck (free), or a new one from the reserve
  if (ALIVE_HELI() || fleet.take('heli')) { toHeli(msg); return; }
  clearHandOn(); const r = roster.find(r => r.out() && !r.active()); if (r && !r.switchTo()) return;
  checkSpent(); if (!G.over) commander.open('NO HUEY LEFT  -  PICK YOUR NEXT UNIT');
}
function quitToTitle() { cancelRescue(); G.over = true; showEnd('THRUST / ZARCH', 'WAR ABANDONED'); }

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
const shipName = u => ({ battleship: 'LEVIATHAN', freighter: 'CONTAINER SHIP' }[u.type] || (u.side === 1 ? 'ALBATROSS' : 'KRAKEN'));
const KIND_TAG = { hq: 'HQ', fortress: 'C', fuel: 'F', factory: 'M', radar: 'R' };
const OWN_COL = ['#e8e4d0', '#4cf', '#f54'];
let mapView = null;
const _mapF = { x: 0, y: 0, z: 0, yaw: 0 };
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
  if (!big) { radar.fillStyle = 'rgb(10,38,74)'; radar.fillRect(0, 0, W, Hh); if (farMap.ready) radar.drawImage(farMap.cv, px(farMap.ox), py(farMap.oz), farMap.size * half, farMap.size * half); }
  radar.drawImage(landImg, px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half);
  radar.drawImage(fogImg, px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half);
  radar.strokeStyle = 'rgba(255,220,120,.5)'; radar.lineWidth = 1; radar.setLineDash([4, 4]); radar.strokeRect(px(-BOUND), py(-BOUND), 2 * BOUND * half, 2 * BOUND * half); radar.setLineDash([]);   // the control zone
  if (big) { radar.fillStyle = 'rgba(255,220,120,.8)'; radar.font = 'bold 12px monospace'; radar.textAlign = 'left'; radar.fillText('CONTROL ZONE', px(-BOUND) + 6, py(-BOUND) + 16); }
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
    } else { radar.fillStyle = col; const sz = big ? (u.type === 'transport' ? 7 : u.type === 'dropship' ? 9 : 5) : u.type === 'dropship' ? 5 : 3; radar.fillRect(X - sz / 2, Y - sz / 2, sz, sz); }
    if (big && markers.mode !== 'off' && u.sinking === undefined && !u.dying && !(u.type === 'squad' && u.members)) { const hp = hpOf(u); if (markers.mode === 'all' || hp < 0.985) mapBar(radar, X, Y + (u.dims ? 10 : 6), u.dims ? 18 : 10, hp); }   // UNIT MARKERS: health on the command map
  }
  // FOUNDATION: your parked crafts (the Huey you walked away from, a Hornet on deck, vehicles): hollow white marks
  for (const d of crafts.defs) {
    if (d === crafts.active || d.kind === 'foot' || d.id === 'ride' || !d.present()) continue;   // (ngc/interiors: the RIDE seats are not a vehicle)
    const f = d.frame(_mapF), X = px(f.x), Y = py(f.z), r = big ? 6 : 3.5;
    radar.strokeStyle = '#fff'; radar.lineWidth = big ? 2 : 1.2; radar.beginPath();
    if (d.kind === 'ground') radar.rect(X - r, Y - r, 2 * r, 2 * r); else { radar.moveTo(X, Y - r * 1.3); radar.lineTo(X + r, Y + r); radar.lineTo(X - r, Y + r); radar.closePath(); }
    radar.stroke();
    if (big) { radar.fillStyle = '#fff'; radar.font = '11px monospace'; radar.textAlign = 'left'; radar.fillText(d.label, X + 10, Y + 4); }
  }
  // you: an arrow along the nose
  const X = px(Z.pos.x), Y = py(Z.pos.z), fx_ = Z.facing.x, fz = Z.facing.y, sz = big ? 9 : 5;
  radar.fillStyle = '#fff'; radar.beginPath();
  radar.moveTo(X + fx_ * sz, Y + fz * sz); radar.lineTo(X - fx_ * sz - fz * sz * .6, Y - fz * sz + fx_ * sz * .6); radar.lineTo(X - fx_ * sz + fz * sz * .6, Y - fz * sz - fx_ * sz * .6); radar.fill();
  radar.restore();
  if (big) {
    radar.font = '14px monospace'; radar.textAlign = 'center'; radar.fillStyle = '#bfe';
    // (TECH TREE: the orders on two lines, each shrunk to fit - the one long line ran off both edges at 1280 px)
    const fit = (t, y, px) => { radar.font = `${px}px monospace`; const w = radar.measureText(t).width; if (w > W - 24) radar.font = `${Math.floor(px * (W - 24) / w)}px monospace`; radar.fillText(t, W / 2, y); };
    fit('CLICK THE SEA: SAIL THE ALBATROSS THERE   ·   CLICK AN ISLAND: SELECT IT   ·   SHIFT+\\ RESEARCH   ·   M: CLOSE', Hh - 86, 14);
    radar.fillStyle = '#ff8';
    const lk = (key, t) => war.allow(1, key) ? t : `${t.replace(/ \(\d+\)$/, '')} [RESEARCH]`;   // TECH TREE: locked orders say so
    fit(`1: ${lk('drone', `SEA KNIGHT + 13 MARINES (${COST.drone})`)}  ·  2: ${lk('aa', `AA GUN ON OUR ISLAND (${COST.aa})`)}  ·  3: ${lk('heli', `NEW HELICOPTER (${COST.heli})`)}  ·  4: ${lk('escort', `TOMCAT ESCORT (${COST.escort})`)}`, Hh - 64, 14);
    fit(`6: ${lk('sky', `SKY CARRIER REFIT (${COST.sky})`)}  ·  8: ${lk('tomcat', 'FLY A TOMCAT')}  ·  9: ${lk('m60', 'M60A3')} / 0: ${lk('m113', 'M113A2')} BY LCM-8     MATERIEL ${Math.floor(G.mat)}`, Hh - 44, 14);
    radar.font = '12px monospace'; radar.fillStyle = '#8ab';
    radar.fillText('HQ  HEADQUARTERS     C  CAVE FORTRESS (STEAL ITS POD)     F  FUEL     M  MATERIEL (FACTORY)     R  RADAR     ▲ AA GUNS     SHIPS: ALBATROSS · KRAKEN · LEVIATHAN · CONTAINER SHIP', W / 2, Hh - 24);
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
const rwrCue = createRwrCue($('hud'));   // CM: radar warning scope + LOCK / MISSILE LAUNCH / LASER words, outside views
rwrCue.el?.classList.add('ngc-rwr');   // RENDERKIT ui: a hook for ngc-ui.css (placed under the top-left plate; no style in the classic look)
const cautionEl = (() => { const e = document.createElement('div'); e.id = 'caution'; e.style.cssText = 'position:absolute;left:16px;bottom:100px;font-size:15px;letter-spacing:1px;font-weight:bold'; $('hud').appendChild(e); return e; })();
// what the island pad under / near you is doing: capture progress, guns in the way, services
function padHint() {
  if (Z.svc && G.craft === 'heli') return G.res < 1 && G.fuel < 98 ? 'FUEL STORES EMPTY  -  TAKE FUEL ISLANDS OR LOOT ENEMY CAVES' : G.fuel < 97 || D.damaged() || G.rockets < ROCKETS_MAX || G.bombs < BOMBS_MAX ? `${Z.svc.name}  -  REFUELLING, REPAIRING, REARMING` : `${Z.svc.name}  -  READY  ·  M FOR THE MAP`;
  for (const I of ISLANDS) {
    if (I.owner === 1 || Math.hypot(Z.pos.x - I.pad.x, Z.pos.z - I.pad.z) > 45) continue;
    if (I.cave) return I.owner === 2 ? `${I.name}  -  DESCEND THE SHAFT AND STEAL THE POD TO TAKE IT` : '';
    const aa = war.aliveAA(I);
    if (aa > 0) return `${I.name}  -  ${aa} AA GUN${aa > 1 ? 'S' : ''} DEFENDING  -  KNOCK ${aa > 1 ? 'THEM' : 'IT'} OUT FIRST`;
    if (PL.landed && I.cap && I.cap.side === 1) return `CAPTURING ${I.name}  ${Math.floor(I.cap.t * 100)}%`;
    return `${I.name}  -  LAND ON THE PAD TO TAKE IT`;
  }
  return '';
}
// floating labels over nearby islands and ships, so you can read the war without the map
const tagBox = (() => { const e = document.createElement('div'); e.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; $('hud').prepend(e); return e; })();
const tagPool = [], _tv = new THREE.Vector3();
const TAG_COL = RKUI ? [UIC.free, UIC.ours, UIC.enemy] : OWN_COL;   // RENDERKIT ui: world tags in the field palette (the map keeps OWN_COL)
const KIND_NAME = { hq: 'HEADQUARTERS', fortress: 'CAVE FORTRESS', fuel: 'FUEL', factory: 'FACTORY', radar: 'RADAR' };
function updateTags() {
  let n = 0; markers.avoid(null);   // (UNIT MARKERS: this frame's tags)
  const jetCk = JP.cockpit.group.visible || tomcatC.TP.cockpit.group.visible;
  const put = (x, y, z, html, d) => {
    _tv.set(x, y, z).project(zCam); if (_tv.z > 1 || Math.abs(_tv.x) > 1.05 || Math.abs(_tv.y) > 1.05) return;
    if (jetCk && _tv.y < -0.05) return;   // (ngc/bugsweep) in a jet cockpit, nothing under the glareshield: a tag below it was drawn over the instrument panel
    if (n >= tagPool.length) { const e = document.createElement('div'); e.className = 'ngc-tag'; e.style.cssText = 'position:absolute;left:0;top:0;width:240px;margin-left:-120px;text-align:center;font-size:12px;line-height:1.35;white-space:nowrap;text-shadow:0 0 3px #000,0 0 5px #000'; tagBox.appendChild(e); tagPool.push(e); }
    const e = tagPool[n++]; if (e._h !== html) { e._h = html; e.innerHTML = html; }
    e.style.display = 'block'; e.style.transform = `translate(${((_tv.x + 1) / 2 * innerWidth).toFixed(0)}px,${((1 - _tv.y) / 2 * innerHeight - 30).toFixed(0)}px)`; e.style.opacity = clamp(1.4 - d / 380, 0.25, 1).toFixed(2);
    markers.avoid((_tv.x + 1) / 2 * innerWidth, (1 - _tv.y) / 2 * innerHeight - 30);   // UNIT MARKERS: a marker under this tag is drawn faint
  };
  if (G.state === 'play' && G.mode === 'zarch' && !bigMap && camB < 0.05 && !interiors.inShip) {   // (QA ngc/qa-ship: not through the ALBATROSS's bulkheads)
    const cx = zCam.position.x, cz = zCam.position.z;
    for (const I of ISLANDS) {
      const p = I.pad, d = Math.hypot(p.x - cx, p.z - cz); if (d > 430 || d < 25 || !fog.exploredAt(p.x, p.z)) continue;
      const vis = fog.visibleAt(p.x, p.z), own = vis ? I.owner : I.seen, col = own < 0 ? UIC.unknown : TAG_COL[own], aa = vis && own > 0 ? war.aliveAA(I) : 0;   // RENDERKIT ui: TAG_COL / UIC
      const st = own < 0 ? 'UNKNOWN' : own === 1 ? (I.cap && I.cap.side === 2 ? `<span style="color:${UIC.alarm}">UNDER ATTACK</span>` : 'OURS') : own === 2 ? (I.cave ? 'ENEMY  ·  STEAL THE POD' : aa ? `ENEMY  ·  ${'▲'.repeat(aa)} AA` : 'ENEMY  ·  UNDEFENDED') : 'NEUTRAL  ·  LAND TO TAKE';
      put(p.x, p.h + 22, p.z, `<b style="color:${col}">${I.name}</b>  <span style="color:${UIC.muted}">${KIND_NAME[I.kind]}  ${Math.round(d)}m</span><br><span style="color:${UIC.ink}">${st}</span>`, d);
    }
    for (const u of war.units) {
      if (!u.dims || u.sinking !== undefined || (u.side === 2 && !fog.visibleAt(u.p.x, u.p.z))) continue;
      const d = Math.hypot(u.p.x - cx, u.p.z - cz); if (d > 520 || d < 60) continue;
      put(u.p.x, u.dims.DECK + 30, u.p.z, `<b style="color:${TAG_COL[u.side]}">${shipName(u)}</b>  <span style="color:${UIC.muted}">${Math.round(100 * u.hp / u.hpMax)}%  ${Math.round(d)}m</span>`, d);
    }
  }
  for (let i = n; i < tagPool.length; i++) tagPool[i].style.display = 'none';
}
function updateHud() {
  updateTags();
  {   // in the cockpit the instruments carry fuel / rpm / speed, so the bottom text block steps aside and the map moves up
    const ck = cockpit.group.visible || JP.cockpit.group.visible || tomcatC.TP.cockpit.group.visible; setStyle('bot', 'display', ck || bigMap ? 'none' : 'block');
    for (const id of ['tl', 'hint', 'feed', 'war']) setStyle(id, 'display', bigMap ? 'none' : 'block');   // the command map has its own read-outs
    setStyle('radar', 'bottom', ck && !bigMap ? 'auto' : ''); setStyle('radar', 'top', ck && !bigMap ? '64px' : ''); setStyle('feed', 'top', ck ? 'calc(max(22%, 236px) + 76px)' : '');   // (ngc/bugsweep) under the map and under the centre message (#msg: up to two lines at max(22%, 236px)) - at 236px the feed ran through it
  }
  crossEl.style.display = document.pointerLockElement === canvas && (cockpit.group.visible || JP.cockpit.group.visible || tomcatC.TP.cockpit.group.visible || armCk()) || (G.craft === 'foot' && !foot.marine && foot.alive && foot.firstPerson() && G.state === 'play') || (G.state === 'play' && crafts.active && crafts.active.switches && crafts.active.firstPerson()) ? 'block' : 'none';   // ngc/wheeledgame: a dot to work the cab's switches / lay the gun
  const ch = G.craft !== 'heli' && crafts.active ? crafts.active.hud() : null;   // FOUNDATION: any other craft's read-outs
  {   // g effects in the jet cockpit: grey tunnel closing in, black at G-LOC, red-out under negative g
    const gf = JP.cockpit.group.visible || (G.craft === 'jet' && JP.gloc > 0) ? JP.gfx() : tomcatC.TP.cockpit.group.visible || (G.craft === 'tomcat' && tomcatC.glocNow()) ? tomcatC.gfx() : { grey: 0, red: 0 };
    const k = (gf.grey * 100) | 0, r = (gf.red * 100) | 0, key = k * 1000 + r;
    if (gfxEl._k !== key) { gfxEl._k = key; gfxEl.style.display = key ? 'block' : 'none'; gfxEl.style.background = `radial-gradient(circle at 50% 45%, rgba(${r ? 120 : 0},0,0,${gf.red * 0.55}) ${Math.max(0, 62 - gf.grey * 70)}%, rgba(${r ? 90 : 0},0,0,${Math.min(1, 0.15 + gf.grey * 1.1 + gf.red * 0.4)}) ${Math.max(8, 95 - gf.grey * 80)}%)`; gfxEl.style.backdropFilter = gf.grey > 0.2 ? `grayscale(${Math.min(1, gf.grey * 1.4)})` : ''; }
  }
  { const list = G.state === 'play' && !cockpit.group.visible && G.craft === 'heli' ? D.cautions(G.fuel, H.rpm, G.mode === 'zarch' ? H.landed : T.landed) : [], blink = (performance.now() % 600) < 300;
    const html = RKUI ? list.map(c => `<span class="ngc-c${c.warn ? ' warn' + (blink ? '' : ' off') : ''}">${c.t}</span>`).join('')   // RENDERKIT ui: steady words on plates; only the warning's edge bar blinks
      : list.map(c => `<span style="color:${c.warn ? (blink ? '#ff3a2a' : '#7a1810') : '#ffb020'};margin-right:12px">${c.t}</span>`).join('');
    if (cautionEl._h !== html) { cautionEl._h = html; cautionEl.innerHTML = html; } }
  setText('score', String(G.score)); setText('hi', String(G.hi));
  // (COMMANDER: the fleet strip under the score - reserves and units out - is drawn by the command board, units/commander/board.js)
  setStyle('fuel', 'width', clamp(ch ? ch.fuel ?? 0 : G.fuel, 0, 100).toFixed(1) + '%'); setText('fuelLbl', ch ? ch.fuelLabel || 'FUEL' : 'FUEL');
  if (RKUI) { const f = ch ? ch.fuel ?? 0 : G.fuel, lv = f < 10 ? 'critical' : f < 25 ? 'low' : 'ok', bar = $('fuel').parentNode; if (bar.dataset.level !== lv) bar.dataset.level = lv; }   // RENDERKIT ui: amber / red fill (the cautions carry the words)
  setText('modeTag', `FUEL STORES ${Math.round(G.res)}/${RES_MAX}   MATERIEL ${Math.floor(G.mat)}${G.cargo > 0.5 ? '   CARGO ' + Math.round(G.cargo) : ''}`);
  setText('weap', ch ? ch.weap || '' : `ROCKETS ${G.rockets}   BOMBS ${G.bombs}   FLARES ${cmH.flare}   CHAFF ${cmH.chaff}`);
  {   // CM: the radar warning cue in the chase / outside views (the cockpits have their own scopes and lamps)
    const air = G.state === 'play' && G.mode === 'zarch' && (G.craft === 'heli' || (G.craft === 'jet' && JP.alive && !JP.ejected)), inside = cockpit.group.visible || JP.cockpit.group.visible;
    const f = G.craft === 'jet' ? JP.J.forward(_cmQ) : H.forward();
    rwrCue.update(air && !inside && !bigMap, Math.atan2(f.x, -f.z), performance.now() / 1000, G.craft === 'jet' ? JP.cm : cmH);
  }
  {   // the war at a glance
    const n = [0, 0, 0]; for (const I of ISLANDS) n[I.owner]++;
    const c = war.carrier, b = war.battleship, eb = war.E.bship;
    // RENDERKIT ui: the colours come from UIC (the classic hexes with ?rk=0); with the UI on the low ALBATROSS and the build-up get words too
    const g = s => RKUI ? ` <span class="ngc-g">·&nbsp; ${s}</span>` : ` &nbsp;·&nbsp; ${s}`;   // (UI on: each reading, with its leading dot, wraps as a unit; classic output unchanged)
    const cLow = c && c.hp / c.hpMax < 0.4, html = `<span style="color:${UIC.ours}">OURS ${n[1]}</span> &nbsp; <span style="color:${UIC.enemy}">ENEMY ${n[2]}</span> &nbsp; <span style="color:${UIC.free}">FREE ${n[0]}</span>` +
      `${g(`ALBATROSS <b style="color:${cLow ? UIC.critical : UIC.ok}">${c ? Math.max(0, Math.round(100 * c.hp / c.hpMax)) : 0}%${RKUI && cLow ? ' CRITICAL' : ''}</b>`)}` +
      (b && b.sinking === undefined ? ` &nbsp;·&nbsp; <b style="color:${UIC.critical}">LEVIATHAN AT SEA ${Math.round(100 * b.hp / b.hpMax)}%</b>` : `${g(`LEVIATHAN BUILT <b style="color:${eb > 70 ? UIC.critical : UIC.caution}">${Math.floor(eb)}%</b>`)}`);
    if (_hud.war !== html) { _hud.war = html; $('war').innerHTML = html; }
    const now = performance.now(), fh = feedItems.filter(f => now - f.at < 14000).map(f => `<div style="color:${f.kind === 'good' ? UIC.good : f.kind === 'bad' ? UIC.bad : UIC.info};opacity:${Math.min(1, (14000 - (now - f.at)) / 2000).toFixed(2)}">${f.t}</div>`).join('');
    if (_hud.feed !== fh) { _hud.feed = fh; $('feed').innerHTML = fh; }
  }
  setText('pad', keyboardOnly ? 'KEYBOARD ONLY' : CTL.state.source && CTL.state.source !== 'NONE' ? `${CTL.state.source}${CTL.state.hasPedals ? ' + PEDALS' : ''}  ·  J CONTROLS` : readPad() ? 'CONTROLLER' : 'KEYBOARD');
  setStyle('radar', 'display', G.mode === 'zarch' ? 'block' : 'none');
  setStyle('bot', 'width', '440px'); setStyle('hint', 'left', '470px');   // the Huey's numbers line is as long as the jet's
  if (ch) {   // the HORNET, the soldier, ground vehicles ... (craft.hud())
    setText('alt', ch.line || ''); setText('hint', ch.tip ? padHint() || ch.hint : ch.hint || '');
    if (performance.now() - (Z.mapT || 0) > (bigMap ? 60 : 120)) { Z.mapT = performance.now(); drawMap(); }
  } else if (G.mode === 'zarch') {
    const hb = holeOf(Z.pos.x, Z.pos.z), alt = Z.pos.y - 0.9 - (hb ? hb.h : groundY(Z.pos.x, Z.pos.z)), bd = Math.hypot(Z.pos.x - HOME_B.x, Z.pos.z - HOME_B.z);
    const ias = Math.hypot(Z.vel.x, Z.vel.z) * 1.944, hdg = ((H.heading() * 180 / Math.PI) + 360) % 360, c = Z.ctl || {};
    setText('alt', hueyLine(ias, hdg, Math.max(0, hb ? Z.pos.y + HELI.SKID_Y - hb.h : H.agl), c));
    setText('hint', helm.active ? helm.status() : switchHover ? `${cockpit.labelOf(switchHover)}  -  CLICK` : G.rescue ? (G.rescue.drop ? drop.status() : `EMERGENCY LANDING  -  FUEL DROP IN ${Math.max(0, Math.ceil(G.rescue.t))}s`) : hueyHint() || padHint());
    if (performance.now() - (Z.mapT || 0) > (bigMap ? 60 : 120)) { Z.mapT = performance.now(); drawMap(); }
  } else {
    const c = Z.ctl || {};
    setText('alt', `COLL ${(H.coll * 100).toFixed(0)}%  NR ${(H.rpm * 100).toFixed(0)}%  TQ ${H.torque.toFixed(0)} PSI  VS ${T.vy.toFixed(1)}  ${c.sas ? 'ASSIST' : 'MANUAL'}  ${T.pod && T.pod.attached ? 'POD ON THE LINE' : ''}${SY.rpmWarn ? '  RPM!' : ''}`);
    const nearTank = T.tanks.some(t => t.fuel > 0 && Math.hypot(t.x - T.x, t.y - T.y) < 10) && G.cargo < CARGO_MAX;
    setText('hint', switchHover ? `${switchHover.toUpperCase()}  -  CLICK TO OPERATE` : G.rescue ? `EMERGENCY LANDING  -  FUEL RUN IN ${Math.max(0, Math.ceil(G.rescue.t))}s` : nearTank && !T.beamOn ? 'HOVER OVER THE TANK AND HOLD S / R (WINCH) TO DRAIN IT' : G.cargo >= CARGO_MAX ? 'CARGO FULL  -  CLIMB OUT AND TAKE IT HOME' : T.caveT < 8 ? 'HAT OR MOUSE AIMS THE DOOR GUN' : '');
  }
}
function resize() {
  if (XR?.resize()) return;
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); zCam.aspect = w / h; zCam.updateProjectionMatrix();
}
// dynamic resolution: if frames run long (GPU-bound, e.g. a 4K screen) step the render resolution down, and back up
// when there is headroom. Hysteresis + a cooldown keep it from hunting. Off with ?res=N (fixed ratio N).
const dynRes = { ms: 16.7, cool: 0 };
function updateDynRes(frameMs) {
  if (XR?.active || params.has('res') || frameMs > 250) return;
  dynRes.ms += (frameMs - dynRes.ms) * 0.05; dynRes.cool -= frameMs;
  if (dynRes.cool > 0) return;
  let pr = pixRatio;
  if (dynRes.ms > 19.5 && pr > 0.6) pr = Math.max(0.6, pr - 0.15);
  else if (dynRes.ms < 14.5 && pr < PR_MAX) pr = Math.min(PR_MAX, pr + 0.1);
  if (pr !== pixRatio) { pixRatio = pr; renderer.setPixelRatio(pr); resize(); dynRes.cool = 1500; if (rkLight) rkLight.pressure = pr < PR_MAX * 0.8; }   // RENDERKIT light: GPU-bound -> the low shadow tier
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
  camA.userData.xr = !!XR?.active;
  const P = Z.pos, inCave = G.mode === 'thrust' && !!T.lvl, jet = isJet() && G.state !== 'title';
  { const want = inCave ? DRAW : drawDistance(zCam.position.y, jet); view.draw += (want - view.draw) * Math.min(1, 1.5 * dt); if (Math.abs(view.draw - want) < 1) view.draw = want; }
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
  if (!RK_SURF) baseGroup.userData.ring.material.color.setHSL((time * 0.5) % 1, 1, 0.6);   // (RENDERKIT materials: hidden)
  if (SIM && SIM.built) SIM.camera(camA, dt);   // SIM MODE: the spectator's camera
  else if (G.state === 'title') {
    const a = time * 0.07, c = war.carrier.p; camA.position.set(c.x + Math.cos(a) * 95, 30, c.z + Math.sin(a) * 95); camA.lookAt(c.x, 8, c.z);   // the ALBATROSS on station
  } else if (airdrop.watching && !inCave) {   // AIRLIFT: watching a C-130 heavy drop (flight deck, loadmaster, the load, chase)
    airdrop.camera(camA, dt);
  } else if (airlift.camLocal && !inCave) {   // AIRLIFT test hook: a camera in the Huey's frame
    airlift.camera(camA);
  } else if (G.craft !== 'heli' && crafts.active) {   // FOUNDATION: the HORNET, the soldier, vehicles - each craft's own rigs
    crafts.active.camera(camA, dt, { locked: document.pointerLockElement === canvas, head });
    if (XR?.active && G.craft==='foot' && marine.firstPerson()) { const S=marine.S;camA.position.set(S.pos.x,S.pos.y+S.eyeH,S.pos.z);camA.quaternion.setFromAxisAngle(_yAx,XR.state.footYaw); }
  } else if (drop.camActive && !inCave) {
    drop.camera(camA, dt);
  } else if (helm.active && !inCave) {
    helm.camera(camA, dt, head);
  } else if (cockpitCam && !inCave && Z.alive) {
    // pilot's eye, rigidly in the airframe, with the Huey's two-per-rev bounce (stronger with load, ETL shudder, blade stall)
    camA.position.copy(EYE).applyQuaternion(H.q).add(H.pos); camA.quaternion.copy(H.q).multiply(_q2.setFromAxisAngle(_yAx, head.yaw)).multiply(_q2.setFromAxisAngle(_xAx, HELI.EYE_PITCH + head.pitch));   // eyes down a little to the panel, plus free look
    if (document.pointerLockElement !== canvas || !freeLook) { const k = Math.exp(-6 * dt); head.yaw *= k; head.pitch *= k; }   // released or free look off: back to centre and stay there
    const sh = (0.002 + 0.02 * H.vib + 0.03 * D.mods().vib) * H.rpm, b2 = 0.004 * (0.3 + H.coll + 2 * H.vib) * H.rpm * Math.sin(time * 2 * H.omega); if (!XR?.active) { camA.position.x += (Math.random() - 0.5) * sh; camA.position.y += (Math.random() - 0.5) * sh + b2; } else camA.quaternion.copy(H.q);
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
  const other = G.craft !== 'heli' && !!crafts.active && G.state !== 'title', otherFP = other && crafts.active.firstPerson();   // FOUNDATION
  const jetCk = jet && cockpitCam && (G.craft === 'tomcat' ? tomcatC.firstPerson() : JP.alive && !JP.ejected);
  const heliCk = cockpitCam && !inCave && Z.alive && G.craft === 'heli' && !drop.camActive, firstP = otherFP || heliCk || drop.cockpitView;
  markerFP = firstP ? (heliCk ? 'heli' : jetCk ? 'jet' : drop.cockpitView ? 'drop' : crafts.active === m60C || crafts.active === m113C ? 'armour' : G.craft === 'foot' ? 'foot' : 'vehicle') : '';   // UNIT MARKERS: which first-person view (the instrument panel line)
  const fov = lerp(firstP ? (otherFP && crafts.active.fov ? crafts.active.fov(ckFov) : ckFov) : 62, SIDE_FOV, e); if (Math.abs(zCam.fov - fov) > 0.01) { zCam.fov = fov; zCam.updateProjectionMatrix(); }
  zScene.fog.color.copy(HORIZON).multiplyScalar(1 - 0.85 * e); zScene.fog.near = lerp(view.draw * FOG_N, DRAW * 0.8, e); zScene.fog.far = lerp(view.draw, DRAW, e);
  terrainUni.uFog.value.copy(zScene.fog.color).convertLinearToSRGB();
  terrainUni.uFogN.value = view.draw * FOG_TN; terrainUni.uFogF.value = view.draw;
  if (Math.abs(zCam.far - (view.draw + 15)) > 2) { zCam.far = view.draw + 15; zCam.updateProjectionMatrix(); }
  sky.scale.setScalar(view.draw / DRAW);
  if (!XR?.active && fx.shake > 0.01) { const k = fx.shake * (cockpit.group.visible ? 0.1 : 0.4); zCam.position.x += rnd(-k, k); zCam.position.y += rnd(-k, k); zCam.position.z += rnd(-k, k); }
  XR?.prepare();
  fx.ear.copy(zCam.position); terrainUni.uTime.value = time;
  updateSeaUniforms(terrainUni, war.sea, war.units, zCam.position);   // SEAWORLD
  atmo?.update({ dt: G.state === 'paused' ? 0 : dt, seaState: war.sea.ss, under: sealife.under, cave: e, draw: view.draw, xr: !!XR?.active, camY: zCam.position.y });   // RENDERKIT sky: sun from the light, weather, cloud drift (frozen on pause)
  worldSky?.update(war.sea.ss, sealife.under);   // RENDERKIT world: rebuilds sky + environment only when the sun / weather changed
  sky.position.copy(zCam.position);
  terrainStream(zCam.position.x, zCam.position.z, dt);
  terrain.position.set(Math.round(zCam.position.x / TG) * TG, 0, Math.round(zCam.position.z / TG) * TG);
  farTerrain.visible = view.draw > DRAW + 20; terrainUni.uNear.value.set(terrain.position.x, terrain.position.z, TG * TN / 2 - 3);
  if (farTerrain.visible) farTerrain.position.set(Math.round(zCam.position.x / FAR_C) * FAR_C, 0, Math.round(zCam.position.z / FAR_C) * FAR_C);

  shipShadow.visible = Z.alive && !inCave && !G.heliStowed && !rkLight;   // (RENDERKIT light: the real shadow replaces the blob) if (G.heliStowed) shipMesh.visible = false;   // parked or flown, the Huey is drawn
  const HP = G.craft === 'heli' ? P : H.pos;
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
  } else if (Z.alive && !G.heliStowed) {
    shipMesh.quaternion.copy(H.q);
    if (e > 0) shipMesh.quaternion.slerp(T.qLast, e);   // still turning back from the side view after the climb out
    shipMesh.position.copy(HP); shipMesh.scale.setScalar(lerp(1, HELI.CAVE_SCALE, e));
    const gy = groundY(HP.x, HP.z), alt = HP.y - gy;
    shipShadow.position.set(HP.x, gy + 0.12, HP.z); const sc = 2.4 + alt * 0.03; shipShadow.scale.set(sc, 1, sc); shadowMat.opacity = clamp(0.5 - alt * 0.006, 0.12, 0.5);
  }
  const inCockpit = cockpitCam && !inCave && e < 0.01 && Z.alive && G.state !== 'title' && G.craft === 'heli' && !drop.camActive && !helm.active;
  cockpit.group.visible = inCockpit; for (const o of heliShell) o.visible = !inCockpit;   // seen from inside, the outer shell only gets in the way
  const near = inCockpit || otherFP || drop.cockpitView || helm.bridgeView ? 0.05 : 0.5; if (zCam.near !== near) { zCam.near = near; zCam.updateProjectionMatrix(); }
  updateLandingLight(inCave || G.craft !== 'heli'); updateBombSight(inCave || e > 0.05 || G.craft !== 'heli' || drop.camActive || helm.active);
  switchHover = inCockpit || jetCk || armCk() || (crafts.active && crafts.active.switches && G.craft !== 'heli') ? pickSwitch() : null;
  crafts.render(dt, time); if (G.state !== 'play') crafts.silence();   // every craft's model (the HORNET's cockpit, the soldier's arms...)
  if (inCockpit) cockpit.update(H, dt, heliPanel(switchHover));
  const caveAimOn = inCave && T.alive && T.aimX !== undefined && e > 0.9 && G.state === 'play';
  reticle.visible = (Z.alive && !inCave && G.state !== 'title' && G.craft === 'heli' && !drop.camActive && !helm.active) || caveAimOn; aimLine.visible = reticle.visible && !inCockpit;
  if (caveAimOn) _wv0.set(T.aimX, T.aimY, 0); else _wv0.copy(Z.aim);
  if (reticle.visible) {
    reticle.position.copy(P).addScaledVector(_wv0, caveAimOn ? 7 * CS * 0.7 : 40);   // far enough out that it never sits on the helicopter
    reticle.quaternion.copy(zCam.quaternion);   // always face the camera, so it never shows its edge
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
function frame(now, xrFrame) {
  const now0 = performance.now();
  XRB?.frameStart();   // ?xrbench: GPU timer, per-frame renderer counters, its hover hold
  updateDynRes(now - last);
  // the sims substep, so they keep real time down to 10 fps. Never zero or negative: two frames with the same (or an
  // earlier) timestamp gave dt = 0 and the flight models divide by their step (NaN everywhere, seen in headless runs)
  const rdt = (now - last) / 1000, dt = Math.min(Math.max(rdt, 1e-3), 0.1); last = now;
  fpsAcc += rdt; fpsN++; if (fpsAcc > 1) { $('dbg').textContent = `${Math.round(fpsN / fpsAcc)} fps  ·  res ${Math.round(pixRatio * 100)}%`; fpsAcc = 0; fpsN = 0; }
  XR?.begin(dt, xrFrame);
  CTL.poll(dt); XR?.applyControls(CTL.state);
  const inp = readInput();
  if (inp.start && !padWasStart) { sfx.init(); if (G.state === 'paused') menuPick(); else pressStart(); }
  padWasStart = inp.start;
  if (G.state !== 'paused') war.tickSea(dt);   // SEAWORLD: the sea's clock and the weather (the title screen too)
  if (G.msgT > 0) { G.msgT -= dt; if (G.msgT <= 0 && G.state !== 'paused') say(''); }
  if (G.state === 'play') {
    if (G.mode === 'zarch') updateZarch(dt, inp); else updateThrust(dt, inp);
    if (SIM) SIM.step(dt, params.has('peace')); else war.update(dt, PL, params.has('peace'));   // SIM MODE: the CPU commanders' war (time x 1 / 4 / 16)
    if (G.mode === 'zarch') { crafts.afterWar(); seats.afterWar(dt); }   // FOUNDATION: decks moved - the soldier, vehicles, parked jets catch up (ngc/interiors: the troops in their seats)
    fogT -= dt; if (fogT <= 0) { fogT = 0.25; fog.update(war.visionSources(PL)); war.setVisibility(fog); updateFogImg(); }
  } else if (G.state === 'trans') {
    const tr = G.tr; tr.t += dt; const D = 0.8;
    if (tr.phase === 0) { $('fade').style.opacity = Math.min(1, tr.t / D); if (tr.t >= D) { tr.swap(); tr.phase = 1; tr.t = 0; } }
    else { $('fade').style.opacity = Math.max(0, 1 - tr.t / D); if (tr.t >= D) { G.state = 'play'; $('fade').style.opacity = 0; $('fadeText').textContent = ''; } }
  }
  fx.update(RK.on('fx') && G.state === 'paused' ? 0 : dt);   // RENDERKIT fx: one simulation clock, frozen on pause (?rk=0: as before)
  rkPost?.tick(G.state === 'paused' ? 0 : dt);   // RENDERKIT post
  sealife.update(G.state === 'paused' ? 0 : dt);   // SEALIFE
  const t1 = performance.now();
  updateCamsAndMeshes(dt, now / 1000);
  world.update(dt, zCam, G.state === 'play');   // WORLD: stream the lived-in world round the camera, ambient life
  NAT?.update(dt, zCam, G.state === 'play');   // RENDERKIT nature: wind clock (game time), trees and clutter round the camera
  rkTer?.update(!!XR?.active); OUTCROPS?.update();   // RENDERKIT terrain: builds the ground layers over the first frames (XR runs the low tier); the rock outcrops round the eye
  commander.update(dt, G.state !== 'title');   // COMMANDER: the fleet strip under the score, the open board's statuses
  techUI.update(dt);   // TECH TREE: the open RESEARCH page refreshes ~4x a second
  pool.update(dt, G.state === 'play' && G.mode === 'zarch'); if (motorPick > 0) motorPick -= dt;   // ngc/wheeledgame: parked / town / traffic vehicles, MG rounds, engine sound
  updateHud();
  { const hide = drop.flying || helm.active ? 'none' : ''; setStyle('bot', 'display', hide); setStyle('caution', 'display', hide); }
  const t2 = performance.now();
  fx.setView(zCam, renderer.domElement.height, atmo && !sealife.under ? atmo.fxFog(zScene.fog) : zScene.fog);   // RENDERKIT sky: CPU particles fade where the haze has built up
  if (G.mode === 'zarch') interiors.update(G.state === 'paused' ? 0 : dt, zCam);   // ngc/interiors: doors swing, rooms near the camera, the carrier's inside
  rkLight?.update(dt, zCam);   // RENDERKIT light: cascades follow the eye, cast / receive rules for new objects
  const drawDesktop = () => {
    const a = G.craft !== 'heli' && G.state !== 'title' ? crafts.active : null;
    // RENDERKIT fx: a craft's own picture (the tank's TTS thermal sight) swaps every visible mesh to a heat material;
    // the GPU particle quads would become opaque squares, so they are hidden for it (the CPU Points are not meshes).
    const rkg = fx.rk?.group, rkv = rkg?.visible;
    if (rkg && a?.renderView) rkg.visible = false;
    atmo?.suspend(!!a?.renderView);   // RENDERKIT sky: a craft's own picture (the thermal sight) keeps the classic one-colour fog
    const own = !!(a && a.renderView && a.renderView(renderer, zScene, zCam));
    atmo?.suspend(false);
    if (rkg) rkg.visible = rkv;
    // RENDERKIT post: only for the plain desktop world view. The craft's own picture is already its own post pass,
    // and XR (including the flat-screen display drawn into a target while presenting) renders directly.
    // The first-person arms + weapon (own depth clear) go into the post's overlay target, so they get the same grade.
    const ov = G.craft === 'foot' && G.state !== 'title' && G.mode === 'zarch' ? () => foot.overlay(renderer, zCam) : null;
    let ovDone = false;
    if (!own) { if (rkPost && !renderer.xr.isPresenting) { rkPost.render(zScene, zCam, ov); ovDone = true; } else renderer.render(zScene, zCam); }
    if (ov && !ovDone) ov();
  };
  if (!XR?.render(drawDesktop)) drawDesktop();
  markers.draw(zCam, markerView());   // UNIT MARKERS: icons + health bars, one 2D layer over the frame
  const t3 = performance.now(), pk = 0.05;   // smoothed per-frame CPU cost: sim, scene/HUD prep, render submit
  if (window.__xrlog && XR?.active && (XR.state.frames < 40 || XR.state.frames % 60 === 0)) window.__xrlog(`XRFRAME ${XR.state.frames} dt ${(now - now0 < 0 ? 0 : rdt * 1000).toFixed(0)}ms sim ${(t1 - now0).toFixed(0)} prep ${(t2 - t1).toFixed(0)} render ${(t3 - t2).toFixed(0)} calls ${XR.state.calls} tris ${XR.state.triangles} flat ${XR.state.flat} track ${XR.state.tracking} vis ${document.visibilityState} state ${G.state} ${XR.state.error}`);
  XRB?.frameEnd(now, now0, t1, t2, t3, xrFrame);
  PROF.sim += ((t1 - now0) - PROF.sim) * pk; PROF.prep += ((t2 - t1) - PROF.prep) * pk; PROF.render += ((t3 - t2) - PROF.render) * pk;
}
const PROF = { sim: 0, prep: 0, render: 0 };
// UNIT MARKERS (ngc/healthbars): what the marker layer needs from the view this frame. Hidden on the title, in the cave,
// under the command map and the full-screen pages; the craft you are in gets its own marker in the outside views.
const MARKER_PANEL = { heli: 0.57, jet: 0.5, drop: 0.62, vehicle: 0.72 };   // first person: the instrument panel's top edge (fraction of the screen height); armour: none (vision blocks, see markerView)
const _mkSelf = { x: 0, y: 0, z: 0, hp: 1, role: 'heli', side: 1, r: 3, key: null };
function markerView() {
  const hide = G.state === 'title' || G.mode !== 'zarch' || camB > 0.05 || bigMap || commander.isOpen || techUI.isOpen || markerFP === 'armour';   // (in the tank the world is seen through vision blocks and sights: a marker would float on the hull roof)
  let self = null;
  if (!hide && !markerFP && !SIM) {
    const a = G.craft !== 'heli' ? crafts.active : null, src = !a ? (Z.alive && !G.heliStowed ? D : null) : a === jetC ? JP.D : a === tomcatC ? tomcatC.TP.D : a === foot ? (foot.marine ? foot.marine.M : foot.slots.medical) : a;
    if (src && (G.craft === 'heli' || a.present())) {
      // where it is: the Huey and the jets by the avatar, the soldier and vehicles by their own frame (feet / ground)
      const f = a && a.kind !== 'air' ? a.frame(_mapF) : null, M = _mkSelf;
      M.key = a || heliC; M.hp = hpOf(src);
      if (f) { M.x = f.x; M.y = f.y + (a.kind === 'foot' ? 0.9 : 1.4); M.z = f.z; } else { M.x = Z.pos.x; M.y = Z.pos.y; M.z = Z.pos.z; }
      M.role = !a ? 'heli' : a.kind === 'foot' ? 'inf' : a.kind === 'ground' ? (a === m60C || a === m113C ? 'armour' : 'vehicle') : 'air';
      M.r = !a ? 7 : a.kind === 'foot' ? 0.5 : a.kind === 'ground' ? 3 : 6;   // the layer puts your marker beside the craft, this far out
      self = M;
    }
  }
  return { hide, firstP: !!markerFP, panelY: MARKER_PANEL[markerFP] || 0, self, draw: view.draw, rangeK: SIM ? 1.6 : 1 };
}
// VR shares the gameplay hosts. Keep its tracked camera separate from the ordinary world camera, and preserve
// magnified sights/cave play through a spatial display instead of changing the headset projection matrices.
let xrDesktopView = null;
const xrRay = new THREE.Ray();
XR = createXR({ renderer, scene:zScene, camera:zCam, resize, audio:()=>sfx.init(), audioState:()=>sfx.ctx?sfx.ctx.state+' '+sfx.ctx.sampleRate+'Hz peak '+sfx.peak().toFixed(3)+' sink '+(typeof sfx.ctx.sinkId==='string'?(sfx.ctx.sinkId||'default'):'n/a'):'none',
  context: () => ({key:helm.active?'helm':drop.flying?'dropship':SIM?'spectator':G.craft,kind:crafts.active?.kind==='foot'?'foot':crafts.active?.kind==='ground'?'ground':'air',
    throttle:helm.active?(war.carrier.sky?.lift||0)/2+.5:drop.flying?drop.state.plane.sim.thr:G.craft==='ch46'?ch46C.P.coll:G.craft==='jet'?JP.thr:G.craft==='tomcat'?tomcatC.TP.thr:G.heliColl||0,yaw:marine?.S.yaw||0}),
  session:on=>{mouseFire=false;keys.clear();head.yaw=head.pitch=0;freeLook=false;
    if(on){xrDesktopView={cockpitCam,chaseCam};sfx.init();if(G.state==='title')newGame();}
    else if(xrDesktopView){cockpitCam=xrDesktopView.cockpitCam;chaseCam=xrDesktopView.chaseCam;xrDesktopView=null;}
  },
  enterView:()=>{cockpitCam=true;head.yaw=head.pitch=0;
    const a=crafts.active;if(a===foot)marine.view='first';else if(a&&'view' in a)a.view=a===m60C||a===m113C?'eye':a.kind==='ground'?'first':'cockpit';
  },
  research:()=>{if(G.state==='paused')closeMenu();techUI.open();},
  pause:()=>{if(G.state==='play')openMenu();},
  switchAt:(ray,alternate)=>{if(G.state!=='play')return false;const id=pickSwitch(ray);if(!id)return false;operateSwitch(id,alternate);return true;},
  snap:angle=>{if(G.craft==='foot')marine.input({look:[angle,0]});},
  aim:ray=>{marine.xrAim=ray?xrRay.copy(ray):null;},
  flatView:()=>G.mode==='thrust'||!!crafts.active?.xrFlatView?.(),
  overlay:cam=>{if(G.craft==='foot'&&G.state!=='title'&&G.mode==='zarch'&&!XR?.blocked)foot.overlay(renderer,cam);}
});
if (rkLight) { rkLight.exclude(XR.rig); matchOverlayLights(marine?.vm?.scene, sun); }   // RENDERKIT light: the VR rig never casts; the arms pass gets the same balance
// ?xrbench: a scripted tour of fixed VR views through the game's own craft paths, measured and pictured (xr/bench.js)
if (params.has('xrbench')) XRB = createXRBench({ XR, renderer, scene: zScene, G, H, HI, Z, JP, HELI, war, crafts, commander, m60C, GR, HOME_B, ISLANDS, groundY, sfx, say, params,
  getInOut, toHeli, stowCrafts, resetZarch, launchJet, openMenu, closeMenu, cockpitCam: () => cockpitCam,
  overlay: cam => { if (G.craft === 'foot' && G.state !== 'title' && G.mode === 'zarch' && !XR.blocked) foot.overlay(renderer, cam); },
  armourSpot: () => { const hh = HARDS.find(h => h.I === HOME_B.isl), hp = hh && hh.at(hh.u1 - 5); return hp ? { x: hp[0], z: hp[1], yaw: hh.yaw } : GR.motorPool(HOME_B.isl, 4.6); } });
buildCaves(); war.reset(); resetZarch(true); placeVehicles(); updateFogImg(); terrainStream(Z.pos.x, Z.pos.z);
renderer.setAnimationLoop(frame);
if (params.has('debug')) { window.__G = { XR, G, airlift, airdrop, ch46C, heliAIenv, m60C, m113C, AW, HARDS, armDelivery, deliverArmour, cmH, RWR , tomcatC, Z, T, H, HI, SY, HELI, helm, toggleHelm, get ckFov() { return ckFov; }, setCkFov, menuKey, D, JP, CTL, view, islandH, HW, get forest() { return { count: world.stats.forestTrees || 0 }; }, world, terrainUni, groundY, inZone, launchJet, swapToHeli, get cockpitCam() { return cockpitCam; }, set cockpitCam(v) { cockpitCam = v; }, THREE, fx, PL, ISLANDS, PADS, PAD, HOME_B, terrainH, head, hurtHeli, cockpit, drop, callLogistics, openMenu, menuPick, get menu() { return menu; }, zCam, PROF, renderer, rkPost /* RENDERKIT post */, rkLight /* RENDERKIT light */, newGame, war, fog, nav, BASES, command, get selIsl() { return selIsl; }, set selIsl(v) { selIsl = v; }, enterCave, respawnHome, exitCave, get camB() { return camB; }, crafts, foot, GR, pool, get carC() { return pool.first('m151'); }, jetC, heliC, getInOut, deliverVehicle, toHeli, stowCrafts, hurtPlayer, marine, sealife, fleet, commander, roster, heliAI, autoNext, killPlayerZ, get tech() { return war.tech; }, techUI /* TECH TREE: tech = [null, player, enemy] */, say, feed /* RENDERKIT ui: tools/scenes/rkui.mjs */ }; if (params.has("auto")) newGame(); if (params.has('thrust')) { newGame(); const b = BASES[+params.get('thrust') || 0]; Z.pos.set(b.x, b.h - 1, b.z); Z.vel.set(0, -4, 0); H.reset(H.pos.clone(), 0, false, 1); SY.grip = 1; SY.auto = null; enterCave(b); }   /* (ngc/bugsweep) ?thrust=N starts in the cave already flying: engine at flight power, throttle rolled on (it came in at ground idle with the throttle rolling on, the rotor drooped and caveaim / caves crashed in the shaft) */ }
// ngc/ch46fly dev: ?fly=ch46 puts you in a CH-46E on the ALBATROSS (with ?auto; ?fly=ch46&cold cold and dark; &at=island at the nearest friendly pad)
if (params.get('fly') === 'ch46') { const t0 = performance.now(), go = () => { if (G.state === 'play' && G.mode === 'zarch' && Z.alive && H.landed) { const isl = commandBases().filter(b => b.kind === 'island').sort((a, b) => Math.hypot(a.x - Z.pos.x, a.z - Z.pos.z) - Math.hypot(b.x - Z.pos.x, b.z - Z.pos.z))[0]; commander.deploy('ch46', params.get('at') === 'island' && isl ? isl.key : 'ship'); return; } if (performance.now() - t0 < 30000) setTimeout(go, 200); }; setTimeout(go, 300); }

// SIM MODE (?sim): both sides CPU commanders, the player's Huey parked out of the war, a spectator camera and overlay
if (params.has('sim')) { SIM = createSpectator({ war, THREE, params, scene: zScene, terrainH, nav, groundY, sfx, fog, feed, say, newGame, stowHeli }); SIM.start(); }

