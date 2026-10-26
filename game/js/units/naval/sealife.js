// SEALIFE: life in the sea, the birds over it, and the view from under it.
//
//   const sealife = createSeaLife({ scene, uniforms: terrainUni, terrain, sky, fx, war, depthAt: terrainH, isWater, cell: TG,
//                                   canvas, extra: (S, L) => {...}, active: () => bool, trawlers: () => [...] });
//   each frame: sealife.update(dt)   (the drawing side runs at render time, from scene.onBeforeRender)
//   sealife.setQuality('off' | 'low' | 'medium' | 'high')
//
// - THE LIFE (fishsim.js): schools round the camera and round every unit on the water (ships under way and at anchor,
//   the LCAC and LCM-8s, trawlers, low helicopters, swimmers) - pilchard balled up by bonito, mackerel, grey mullet that
//   leap, flying fish gliding off a bow wave, sea bream and damselfish over the rocks, eagle rays, a sandbar shark,
//   barrel jellyfish, and common dolphins that ride the bow of a ship under way and porpoise. Drawn instanced (one draw
//   per kind of body; a pilchard or mackerel boid draws a cluster of four fish), seen THROUGH the water from above (and
//   in the air when they leave it), fogged under it (sealifegfx.js).
// - THE BIRDS (seabirds.js): gannets, terns and gulls find bait balls, dead fish after a blast, trawlers and ships'
//   wakes, plunge and pick and sit on the swell; flushed by aircraft passing low.
// - SIGNS ON THE TOP, to read the sea from the air: nervous water over a school at the top, the boil and froth of a
//   bait ball, rings and spray where a fish jumps, a dolphin breathes or a gannet goes in - all riding the drawn waves.
// - DISTURBANCE: ships (hulls, wakes, prop wash), aircraft low over the water (downwash), the LCAC, RW-7 hover tanks,
//   swimmers, splashes, gunfire into the water and explosions (fx.js recipes are wrapped: anything that splashes, wakes
//   or blows up in the water reaches the fish without touching the callers).
// - UNDER WATER: when the camera that renders is below the drawn surface (the same waves the GPU draws), the scene's fog
//   becomes the water (a readable swimming view, darker deeper and murkier in a rough sea), the sky dome goes,
//   the surface is drawn from below (Snell's window, seasurface.js SEA_FS_UNDER), a sea bed mesh is built round the camera
//   from the same heights the physics uses, motes drift in the water, and the screen edges darken a little.
import * as THREE from 'three';
import { createFishSim, SPECIES, SUB, QUALITY } from './fishsim.js';
import { createSeaBirds } from './seabirds.js';
import { SEA_NOISE_GLSL, SEABED_GLSL, SEA_NV } from './seasurface.js';
import { SHADERS, GEOMETRY, fishUniforms, viewUniforms, birdUniforms, signGeometry, SIGN_VS, SIGN_FS } from './sealifegfx.js';
import { underwaterVisibility } from './seavisibility.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);   // (looks only: spray jitter; the sims are seeded)

// ---------------------------------------------------------------------------------------------- the sea bed mesh
const BED_N = 96, BED_C = 2;   // 192 m square: the visible seabed extends beyond fog even while its centre streams.
const BED_VS = `
  varying vec3 vW;
  void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const BED_FS = `
  uniform vec4 uSeaK; uniform vec3 uUWCol, uSunD; uniform float uTime; uniform vec2 uFogP;
  varying vec3 vW;
  ${SEA_NOISE_GLSL}
  ${SEABED_GLSL}
  void main(){
    vec3 n=normalize(cross(dFdx(vW),dFdy(vW))); if(n.y<0.) n=-n;
    float d=max(-vW.y,0.);
    vec3 c=bedColour(vW.xz,d,clamp(sqrt(max(1.-n.y*n.y,0.))/max(n.y,.2),0.,1.));
    vec3 light=exp(-(SEA_EXT+uSeaK.z)*d);
    float dif=.45+.55*max(dot(n,normalize(uSunD)),0.);
    float cz=d<10.?caustic(vW.xz,uTime)*1.3*(1.-d/10.):0.;
    c=c*light*(dif+cz)+uUWCol*.25;
    float fd=length(cameraPosition-vW);
    gl_FragColor=vec4(mix(c,uUWCol,smoothstep(uFogP.x,uFogP.y,fd)),1.);
  }`;
// motes: what hangs in sea water (plankton, silt) - drifting specks round a camera under water, the cue for depth and
// for the water moving past you
const MOTE_N = 420;
const MOTE_VS = `
  uniform vec3 uCam; uniform float uTime, uPx; uniform vec2 uFogP;
  attribute vec4 aM;
  varying float vA;
  void main(){
    vec3 p=aM.xyz*24.+vec3(uTime*.06,sin(uTime*.2+aM.w*6.)*.3,uTime*.04);
    p=uCam+mod(p-uCam+12.,24.)-12.;                                      // a 24 m box that follows the camera
    vec4 mv=viewMatrix*vec4(p,1.); float d=-mv.z;
    vA=(1.-smoothstep(uFogP.x*.2,uFogP.y*.6,d))*smoothstep(.3,1.2,d)*(.25+.35*aM.w);
    gl_PointSize=max(1.,uPx*.035/max(d,.3)); gl_Position=projectionMatrix*mv;
  }`;
const MOTE_FS = `
  uniform vec3 uCol; varying float vA;
  void main(){ vec2 q=gl_PointCoord-.5; float a=vA*(1.-smoothstep(.2,.5,length(q))); if(a<.01) discard; gl_FragColor=vec4(uCol,a); }`;

// per-mesh instance capacity
const CAP = { school: QUALITY.high.MAX_FISH, fish: 640, dolphin: 24, ray: 12, jelly: 48 };
const BIRD_CAP = 64, SIGN_CAP = 120;
const BIRD_Q = { low: 24, medium: 44, high: 64 };

export function createSeaLife(ctx) {
  const { scene, uniforms: U, terrain, sky, fx, war, depthAt, isWater, cell = 2.5 } = ctx;
  const active = ctx.active || (() => true);
  // ------------------------------------------------------------------ the drawn surface at a point (what the GPU draws)
  // elevation and slope from the components the sea shader uses, the same grid filter, the same fade over the shallows
  let sim = null;
  function surfaceAt(x, z, out) {
    let e = 0, sx = 0, sz = 0;
    for (const c of U.uWave.value) {
      const kk = Math.hypot(c.x, c.y); if (kk < 1e-5) continue;
      const a = c.z * smooth(cell * 2.5, cell * 5, TAU / kk); if (a < 1e-4) continue;
      const ph = c.w - (c.x * x + c.y * z);
      e += a * Math.cos(ph); if (out) { const s = a * Math.sin(ph); sx += s * c.x; sz += s * c.y; }
    }
    const att = sim ? smooth(0.3, 7, -sim.bed(x, z)) : 1;
    if (out) { out.e = e * att; out.sx = sx * att; out.sz = sz * att; }
    return e * att;
  }
  sim = createFishSim({ depthAt, seed: 1980, surf: surfaceAt });
  const birds = createSeaBirds({ seed: 77, surf: surfaceAt });
  const L = { sim, birds, under: false, camDepth: 0, surfY: 0, enabled: true, fishOn: true, fishDrawn: 0, birdsDrawn: 0, signsDrawn: 0, ms: 0, cam: new THREE.Vector3(0, 30, 0), bedReady: false, quality: 'medium', counts: {} };

  // ------------------------------------------------------------------ the bodies: one instanced mesh per kind
  const bufs = {}, meshes = {};
  const mkInst = (geo, max, per = 1) => {
    const O = { max, n: 0, A: new Float32Array(max * 4), B: new Float32Array(max * 4), C: new Float32Array(max * 4), D: new Float32Array(max * 4) };
    O.attrs = ['A', 'B', 'C', 'D'].map(k => { const a = new THREE.InstancedBufferAttribute(O[k], 4, false, per); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('i' + k, a); return a; });
    geo.instanceCount = 0; return O;
  };
  const fishU = fishUniforms();
  const mkMesh = (name, geo, vs, uni, opt = {}) => {
    const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: vs, fragmentShader: opt.fragmentShader || SHADERS.FRAG, transparent: true, depthWrite: !!opt.depthWrite, side: opt.side ?? THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = opt.order ?? 1.5; m.name = 'sealife-' + name; scene.add(m); meshes[name] = m; return m;
  };
  {   // pilchard / mackerel / damselfish: a cluster of SUB fish per boid (the boid's attributes advance every SUB instances)
    const g = GEOMETRY.fishGeometry(); bufs.school = mkInst(g, CAP.school, SUB);
    const k = new Float32Array(CAP.school * SUB); for (let i = 0; i < k.length; i++) k[i] = i % SUB;
    g.setAttribute('iK', new THREE.InstancedBufferAttribute(k, 1));
    mkMesh('school', g, SHADERS.FISH_VS(true), fishU, { fragmentShader: SHADERS.FISH_FS });
  }
  { const g = GEOMETRY.fishGeometry(); bufs.fish = mkInst(g, CAP.fish); mkMesh('fish', g, SHADERS.FISH_VS(false), fishU, { fragmentShader: SHADERS.FISH_FS }); }
  const shareView = () => { const u = viewUniforms(); for (const k of ['uUW', 'uFogP', 'uFogC', 'uSunD', 'uTime']) u[k] = fishU[k]; return u; };
  { const g = GEOMETRY.dolphinGeometry(); bufs.dolphin = mkInst(g, CAP.dolphin); mkMesh('dolphin', g, SHADERS.DOLPHIN_VS, shareView(), { depthWrite: true, side: THREE.FrontSide, order: 1.45 }); }
  { const g = GEOMETRY.rayGeometry(); bufs.ray = mkInst(g, CAP.ray); mkMesh('ray', g, SHADERS.RAY_VS, shareView(), { depthWrite: true, side: THREE.FrontSide, order: 1.45 }); }
  { const g = GEOMETRY.jellyGeometry(); bufs.jelly = mkInst(g, CAP.jelly); mkMesh('jelly', g, SHADERS.JELLY_VS, shareView(), { order: 1.55 }); }
  const birdU = birdUniforms(); for (const k of ['uUW', 'uFogP', 'uFogC', 'uSunD', 'uTime']) birdU[k] = fishU[k];
  const birdBuf = (() => { const g = GEOMETRY.birdGeometry(); const O = mkInst(g, BIRD_CAP); mkMesh('birds', g, SHADERS.BIRD_VS, birdU, { depthWrite: true, order: 1.6 }); return O; })();
  // birds in the air are opaque: no blending (depth-sorted against everything); under water they fade like the fish
  meshes.birds.material.transparent = true;

  // ------------------------------------------------------------------ signs on the top (ride the drawn waves)
  const signGeo = signGeometry();
  const SP = new Float32Array(SIGN_CAP * 4), SQ = new Float32Array(SIGN_CAP * 4), SR = new Float32Array(SIGN_CAP * 4);
  const signAttr = [['iP', SP], ['iQ', SQ], ['iR', SR]].map(([k, a]) => { const b = new THREE.InstancedBufferAttribute(a, 4); b.setUsage(THREE.DynamicDrawUsage); signGeo.setAttribute(k, b); return b; });
  signGeo.instanceCount = 0;
  const signU = { uWave: U.uWave, uCell: { value: cell }, uTime: fishU.uTime, uSea: { value: 0 }, uFogP2: { value: new THREE.Vector2(125, 250) } };
  const signMesh = new THREE.Mesh(signGeo, new THREE.ShaderMaterial({ uniforms: signU, vertexShader: SIGN_VS(SEA_NV), fragmentShader: SIGN_FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  signMesh.frustumCulled = false; signMesh.renderOrder = 2.1; signMesh.name = 'sealife-signs'; scene.add(signMesh);
  const marks = [];   // short-lived rings and foam: { x, z, r, kind, k, t, life, seed }
  const mark = (x, z, r, kind, k, life) => { if (marks.length >= 60) marks.shift(); marks.push({ x, z, r, kind, k, t: 0, life, seed: Math.random() }); };

  // ------------------------------------------------------------------ sea bed mesh (under water only)
  const bedGeo = new THREE.PlaneGeometry(BED_N * BED_C, BED_N * BED_C, BED_N, BED_N).rotateX(-Math.PI / 2);
  const bedPos = bedGeo.attributes.position; bedPos.setUsage(THREE.DynamicDrawUsage);
  const bedU = { uSeaK: U.uSeaK, uUWCol: U.uUWCol, uTime: U.uTime, uSunD: fishU.uSunD, uFogP: { value: new THREE.Vector2(1, 25) } };
  const bedMesh = new THREE.Mesh(bedGeo, new THREE.ShaderMaterial({ uniforms: bedU, vertexShader: BED_VS, fragmentShader: BED_FS }));
  bedMesh.frustumCulled = false; bedMesh.visible = false; bedMesh.name = 'sealife-seabed'; scene.add(bedMesh);
  const bedJob = { cx: 1e9, cz: 1e9, next: null, i: 0, h: new Float32Array(bedPos.count) };
  const NV = BED_N + 1, half = BED_N * BED_C / 2;
  function bedStep(budget) {   // fill the heights of the pending grid; swap it in when done
    const J = bedJob; if (!J.next) return;
    const [cx, cz] = J.next, end = Math.min(bedPos.count, J.i + budget);
    for (; J.i < end; J.i++) { const ix = J.i % NV, iz = (J.i / NV) | 0; J.h[J.i] = Math.min(sim.bed(cx - half + ix * BED_C, cz - half + iz * BED_C), -0.05); }
    if (J.i >= bedPos.count) {
      for (let k = 0; k < bedPos.count; k++) bedPos.setY(k, J.h[k]);
      bedPos.needsUpdate = true; bedMesh.position.set(cx, 0, cz); bedMesh.updateMatrixWorld(); J.cx = cx; J.cz = cz; J.next = null; L.bedReady = true;
    }
  }
  function bedWant(x, z, now) {
    const cx = Math.round(x / 8) * 8, cz = Math.round(z / 8) * 8;   // (8 m: a multiple of the 2 m cells)
    if (bedJob.next || (Math.abs(cx - bedJob.cx) < 20 && Math.abs(cz - bedJob.cz) < 20)) { if (now) bedStep(1e9); return; }
    bedJob.next = [cx, cz]; bedJob.i = 0;
    if (now || Math.abs(cx - bedJob.cx) > 40 || Math.abs(cz - bedJob.cz) > 40) bedStep(1e9);   // too far: build it at once
  }
  // the motes (under water only)
  const moteGeo = new THREE.BufferGeometry(); { const m = new Float32Array(MOTE_N * 4); for (let i = 0; i < m.length; i++) m[i] = Math.random(); moteGeo.setAttribute('aM', new THREE.BufferAttribute(m, 4)); moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_N * 3), 3)); }
  const moteU = { uCam: { value: new THREE.Vector3() }, uTime: fishU.uTime, uPx: { value: 720 }, uFogP: { value: new THREE.Vector2(1, 25) }, uCol: { value: new THREE.Color(0.6, 0.75, 0.72) } };
  const motes = new THREE.Points(moteGeo, new THREE.ShaderMaterial({ uniforms: moteU, vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false }));
  motes.frustumCulled = false; motes.visible = false; motes.renderOrder = 1.7; motes.name = 'sealife-motes'; scene.add(motes);

  // ------------------------------------------------------------------ under water: fog, sky, surface from below
  let tint = null;
  const saved = { uFog: null, bg: null };
  const uwCol = new THREE.Color(), _c = new THREE.Color(), fogUW = new THREE.Color(), linUW = new THREE.Color();   // (linUW: the same colour for three's colour-managed fog and background: they convert to sRGB, the raw shaders do not)
  const OPEN = new THREE.Color(0.07, 0.36, 0.44), DEEP = new THREE.Color(0.012, 0.07, 0.15), MURK = new THREE.Color(0.16, 0.3, 0.3);
  const visibility = underwaterVisibility();
  function setUnder(on) {
    if (on === L.under) return;
    L.under = on;
    terrain.material.side = on ? THREE.DoubleSide : THREE.FrontSide;   // the sea surface seen from below
    if (sky) sky.visible = !on;
    if (on) { saved.uFog = U.uFog.value; U.uFog.value = fogUW; saved.bg = scene.background; scene.background = linUW; }
    else { if (saved.uFog) U.uFog.value = saved.uFog; scene.background = saved.bg; }
    for (const k of ['school', 'fish', 'jelly']) meshes[k].material.depthWrite = on;
    bedMesh.visible = on; motes.visible = on && L.quality !== 'low';
    if (ctx.canvas && typeof document !== 'undefined') {
      if (!tint) { tint = document.createElement('div'); tint.id = 'uwTint'; Object.assign(tint.style, { position: 'fixed', inset: '0', pointerEvents: 'none', display: 'none', background: 'radial-gradient(ellipse at 50% 42%, rgba(0,40,50,0) 48%, rgba(0,18,28,.55) 100%)' }); ctx.canvas.after(tint); }
      tint.style.display = on ? 'block' : 'none';
    }
  }
  scene.onBeforeRender = ((prev) => function (renderer, sc, camera) {
    if (prev) prev.call(this, renderer, sc, camera);
    const p = camera.position; L.cam.copy(p); L.camObj = camera;
    const water = L.enabled && active() && isWater(p.x, p.z);
    const surf = water ? surfaceAt(p.x, p.z) : 0;
    const bedH = water ? sim.bed(p.x, p.z) : 0;
    const under = water && p.y < surf - 0.03 && p.y > bedH - 0.5;
    L.surfY = surf; L.camDepth = under ? surf - p.y : 0;
    const sk = U.uSeaP.value.z;
    U.uSeaK.value.set(under ? 1 : 0, L.camDepth, 0.03 + 0.09 * sk * sk, 0);
    // the water's colour round the camera: blue-green near the top, darker down; a rough sea is murkier and greyer
    uwCol.copy(OPEN).lerp(DEEP, smooth(0, 22, L.camDepth)).lerp(_c.copy(MURK).multiplyScalar(0.8), 0.35 * sk);
    U.uUWCol.value.copy(uwCol);
    setUnder(under);
    fishU.uUW.value.set(under ? 1 : 0, 0, U.uSeaK.value.z, 0);
    if (U.uSun) fishU.uSunD.value.copy(U.uSun.value);
    signU.uSea.value = sk;
    if (under) {
      const { near, far } = underwaterVisibility(sk * 7, L.camDepth, visibility);
      fogUW.copy(uwCol); linUW.copy(uwCol).convertSRGBToLinear();
      if (sc.fog) { sc.fog.color.copy(linUW); sc.fog.near = near; sc.fog.far = far; }
      U.uFogN.value = near; U.uFogF.value = far;
      bedU.uFogP.value.set(near, far); fishU.uFogP.value.set(near, far, 0, 0); fishU.uFogC.value.copy(uwCol); moteU.uFogP.value.set(near, far); moteU.uCam.value.copy(p); moteU.uCol.value.copy(uwCol).lerp(_c.setRGB(0.85, 0.92, 0.9), 0.55);
      moteU.uPx.value = renderer.domElement.height;
      if (fx) for (const q of [fx.add, fx.mix]) { if (q && q.uni && q.uni.uFogNear) { q.uni.uFogNear.value = near; q.uni.uFogFar.value = far; q.uni.uFogCol && q.uni.uFogCol.value.copy(uwCol); } }
      bedWant(p.x, p.z, !L.bedReady);
    } else if (sc.fog) { fishU.uFogP.value.set(sc.fog.near, sc.fog.far, 0, 0); fishU.uFogC.value.copy(sc.fog.color).convertLinearToSRGB(); signU.uFogP2.value.set(sc.fog.near, sc.fog.far); }
  })(scene.onBeforeRender && scene.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ? scene.onBeforeRender : null);

  // ------------------------------------------------------------------ disturbances from fx (wrapped once)
  const wrap = (obj, name, after) => { if (!obj || typeof obj[name] !== 'function') return; const o = obj[name]; obj[name] = function (...a) { const r = o.apply(this, a); try { if (L.enabled) after(...a); } catch (e) { /* never break the fx */ } return r; }; };
  if (fx) {
    wrap(fx, 'explode', (x, y, z, s = 1) => { if (isWater(x, z) && y < 6) sim.blast(x, y, z, s); });
    wrap(fx, 'splash', (x, z, s = 1) => sim.scare(x, 0, z, 9 + 9 * s, 1, 2, 3 + 2 * s));
    wrap(fx, 'impact', (x, y, z, kind) => { if (kind === 'water') sim.scare(x, 0, z, 6, 0.8, 1, 2.5); });
    wrap(fx, 'wake', (x, z, s = 1) => sim.scare(x, 0, z, 7 + 5 * s, 0.75, 1.4, 4));
    wrap(fx.water, 'add', d => { if (d && d.y < 0.6 && d.tile === 1 && d.life < 4 && isWater(d.x, d.z)) sim.scare(d.x, 0, d.z, 4 + d.size + d.grow * 0.35, Math.min(1, 0.4 + d.a), 1.2, 3); });   // rotor wash spray, splash rings
  }

  // ------------------------------------------------------------------ what the life does to the top: spray and rings
  // (fx.mix directly, not fx.splash: a bird going in is not a shell landing - it must not frighten the fish it hunts)
  function spray(x, y, z, n, up, size, spread = 1) {
    if (!fx || !fx.mix) return;
    for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(0.3, 1) * spread; fx.mix.spawn(x + Math.cos(a) * s * 0.3, y + 0.05, z + Math.sin(a) * s * 0.3, Math.cos(a) * s, up * rnd(0.6, 1.2), Math.sin(a) * s, rnd(0.5, 1.1), size * 0.5, size * 1.6, 0.86, 0.93, 0.97, 0.7, 12, 0.6); }
  }
  function onEvent(e, cam) {
    const d = Math.hypot(e.x - cam.x, e.z - cam.z); if (d > 320) return;
    const s = e.s;
    switch (e.kind) {
      case 'jump': mark(e.x, e.z, 0.5 + s * 3, 2, 0.8, 1.2); if (d < 200) spray(e.x, e.y, e.z, 3 + (s * 8 | 0), 2 + s * 2, 0.12 + s * 0.3); break;
      case 'enter': mark(e.x, e.z, 0.6 + s * 3.5, 2, 0.9, 1.5); mark(e.x, e.z, 0.3 + s * 1.2, 3, 0.7, 2.5); if (d < 200) spray(e.x, e.y, e.z, 4 + (s * 10 | 0), 2.2 + s * 2.5, 0.14 + s * 0.35); break;
      case 'boil': mark(e.x, e.z, 1.5 + s * 2, 3, 0.8, 3); mark(e.x, e.z, 2 + s * 3, 2, 0.7, 1.6); if (d < 220) spray(e.x, e.y, e.z, 5, 3, 0.25, 1.5); break;
      case 'blow':   // a dolphin's breath: a short puff of vapour and spray off the blowhole
        mark(e.x, e.z, 1.5, 2, 0.6, 1.3);
        if (fx && fx.mix && d < 220) for (let i = 0; i < 4; i++) fx.mix.spawn(e.x + rnd(-0.1, 0.1), e.y + 0.3, e.z + rnd(-0.1, 0.1), rnd(-0.3, 0.3), rnd(1.5, 2.5), rnd(-0.3, 0.3), rnd(0.5, 0.9), 0.15, 0.9, 0.9, 0.94, 0.96, 0.45, 2, 1.2);
        break;
      case 'taxi': mark(e.x, e.z, 0.8, 2, 0.6, 0.9); if (d < 160) spray(e.x, e.y, e.z, 3, 1.5, 0.1); break;
      case 'fin': mark(e.x, e.z, 1.4, 2, 0.45, 1.4); break;
      case 'plunge':   // a gannet going in: a white column, a ring, the foam where it went
        mark(e.x, e.z, 3.5, 2, 1, 2); mark(e.x, e.z, 1.1, 3, 1, 4);
        if (d < 260) spray(e.x, e.y, e.z, 9, 5.5, 0.35, 0.8);
        break;
      case 'dip': mark(e.x, e.z, 1.4, 2, 0.8, 1.3); if (d < 200) spray(e.x, e.y, e.z, 3, 1.8, 0.15); break;
      case 'surface': mark(e.x, e.z, 1.2, 2, 0.5, 1.2); break;
      case 'patter': mark(e.x, e.z, 0.7, 2, 0.35, 0.8); break;
    }
  }

  // ------------------------------------------------------------------ each frame
  const ROTARY = { drone: 1, transport: 1, gunship: 1 }, _view = {}, signs = [], foci = [], flush = [], _so = {};
  const ids = new WeakMap(); let idN = 0; const idOf = o => { let i = ids.get(o); if (i === undefined) { i = ++idN; ids.set(o, i); } return i; };
  const pool = []; let poolN = 0; const take = () => { let o = pool[poolN]; if (!o) { o = {}; pool.push(o); } poolN++; return o; };
  L.flush = (x, y, z, r) => { const o = take(); o.x = x; o.y = y; o.z = z; o.r = r; flush.push(o); };   // (extra: the player's aircraft)
  L.focus = (id, kind, x, z, k = 1, vx = 0, vz = 0, r = 3) => { const o = take(); o.id = id; o.kind = kind; o.x = x; o.z = z; o.k = k; o.vx = vx; o.vz = vz; o.r = r; foci.push(o); };
  const write = (O, mesh) => {
    const g = mesh.geometry, per = O.attrs[0].meshPerAttribute || 1;
    g.instanceCount = O.n * per;
    if (O.n) for (const a of O.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, O.n * 4); a.needsUpdate = true; }
  };
  L.update = dt => {
    if (!L.enabled || !active() || L.suspend) { sim.clearThreats(); /* (suspend: tests - no sim, no draw, the state kept) */ for (const k in meshes) { meshes[k].geometry.instanceCount = 0; meshes[k].visible = false; } signGeo.instanceCount = 0; signMesh.visible = false; L.ms = 0; return; }
    for (const k in meshes) meshes[k].visible = true; signMesh.visible = true;
    const t0 = performance.now(), c = L.cam;
    fishU.uTime.value += dt;
    sim.clearThreats(); foci.length = 0; flush.length = 0; poolN = 0;
    sim.sea = U.uSeaP.value.z; birds.sea = sim.sea;
    if (U.uSun) { const s = U.uSun.value, l = s.y / (s.length() || 1); sim.light = birds.light = smooth(-0.05, 0.25, l); }
    if (war && war.units) for (const u of war.units) {
      if (!u.p || u.gone) continue;
      if (Math.abs(u.p.x - c.x) > 560 || Math.abs(u.p.z - c.z) > 560) continue;
      if (u.dims && u.p.y < 3 && !(u.sinking > 8)) {   // a ship
        const wl = (u.parts && u.parts.waterline) || { hl: u.dims.L * 0.5, hw: u.dims.W * 0.4 }, v = u.speed || 0;
        sim.hull(u.p.x, u.p.z, u.yaw || 0, wl.hl, wl.hw, Math.min(9, Math.max(2, u.dims.W * 0.3)), v);
        if (Math.abs(v) > 2.5 && wl.hl > 15) L.focus('w' + idOf(u), 'wake', u.p.x + Math.sin(u.yaw) * wl.hl, u.p.z + Math.cos(u.yaw) * wl.hl, 1, -Math.sin(u.yaw) * v, -Math.cos(u.yaw) * v);
        if (Math.abs(v) > 1) L.flush(u.p.x - Math.sin(u.yaw) * wl.hl, 1, u.p.z - Math.cos(u.yaw) * wl.hl, wl.hw + 18);
      } else if (u.p.y > 2 && !u.dims) {   // aircraft: rotor wash on the water, and the birds flush from anything low
        if (ROTARY[u.type] && u.p.y < 32 && isWater(u.p.x, u.p.z)) { const k = 1 - u.p.y / 32; sim.point(u.p.x, 0, u.p.z, 10 + 16 * k, 0.4 + 0.7 * k, 0, 0, 2 + 3 * k, { wash: true, w: 0.6 }); }
        if (u.p.y < 90) L.flush(u.p.x, u.p.y, u.p.z, ROTARY[u.type] ? 45 : 110);
      }
    }
    const G = war && war.ground;
    if (G && G.lcacs) for (const q of G.lcacs) if (Math.abs(q.x - c.x) < 400 && Math.abs(q.z - c.z) < 400) { sim.hull(q.x, q.z, q.yaw, 13, 7, 1, q.v || 0); sim.point(q.x, 0, q.z, 22, 0.9, 0, 0, 3, { wash: true, w: 0.3 }); L.flush(q.x, 2, q.z, 50); }   // the LCAC: skirt, spray, props
    if (G && G.sim && G.sim.units) for (const u of G.sim.units) if (u.kind === 'hovertank' && u.alive && Math.abs(u.x - c.x) < 200 && Math.abs(u.z - c.z) < 200 && isWater(u.x, u.z)) sim.point(u.x, 0, u.z, 14, 0.8, 0, 0, 2.5, { wash: true, w: 0.3 });
    // trawlers working (world ambient): hull, life round the fishing ground, gulls astern (the ambient ones step aside)
    if (ctx.trawlers) { const T = ctx.trawlers(); if (T) for (let i = 0; i < T.length; i++) { const w = T[i]; if (Math.abs(w.x - c.x) > 520 || Math.abs(w.z - c.z) > 520) continue; sim.hull(w.x, w.z, w.yaw + Math.PI, 6.5, 2.4, 2, w.v || 0); if (w.gulls) L.focus('t' + idOf(w), 'boat', w.x, w.z, 1, Math.sin(w.yaw) * (w.v || 0), Math.cos(w.yaw) * (w.v || 0)); } }
    sim.lastDt = dt; if (ctx.extra) ctx.extra(sim, L);
    sim.enabled = L.fishOn; if (!L.fishOn && sim.schools.length) sim.clear();
    // draw: the camera that last rendered (its forward and field of view) culls what cannot show
    let view = null;
    if (L.camObj) {
      const cm = L.camObj, e = cm.matrixWorld.elements, fl = Math.hypot(e[8], e[9], e[10]) || 1, fov = (cm.fov || 60) * Math.PI / 180, asp = cm.aspect || 1.6;
      const hf = Math.atan(Math.tan(fov / 2) * Math.hypot(1, asp)) + 0.15;
      Object.assign(_view, { x: c.x, y: c.y, z: c.z, fx: -e[8] / fl, fy: -e[9] / fl, fz: -e[10] / fl, cos: Math.cos(Math.min(hf, 3)), px: (ctx.heightPx ? ctx.heightPx() : 720) / fov });
      view = _view; L.view = _view;
    }
    sim.update(dt, c, view);
    // the birds: bait balls, dead fish, trawlers, wakes
    sim.signs(signs);
    for (const s of signs) if (s.kind === 1) L.focus('b' + s.sc.id, 'ball', s.x, s.z, s.k, 0, 0, s.r); else if (s.kind === 0 && s.sc.surfacing) L.focus('n' + s.sc.id, 'top', s.x, s.z, s.k, 0, 0, s.r);
    for (const st of sim.sites) { const k = Math.min(1, st.n / 20) * (1 - st.t / 120); if (k > 0.05 && st.t > 4) L.focus('d' + idOf(st), 'dead', st.x, st.z, k, 0, 0, 4); }
    birds.update(L.fishOn ? dt : 0, c, { foci, threats: flush });
    if (!L.fishOn && birds.birds.length) birds.clear();
    for (let i = 0; i < sim.nEv; i++) onEvent(sim.events[i], c);
    for (let i = 0; i < birds.nEv; i++) onEvent(birds.events[i], c);
    sim.write(bufs, view);
    for (const k in bufs) { write(bufs[k], meshes[k]); L.counts[k] = bufs[k].n; }
    birds.write(birdBuf, view); write(birdBuf, meshes.birds);
    L.fishDrawn = bufs.school.n * SUB + bufs.fish.n + bufs.dolphin.n + bufs.ray.n + bufs.jelly.n; L.culled = sim.culled; L.birdsDrawn = birdBuf.n;
    // signs: the schools' (nervous water, bait balls) and the marks left by jumps, breaths and dives
    let ns = 0;
    const put = (x, z, r, kind, k, age, seed, life) => {
      if (ns >= SIGN_CAP) return; if (Math.hypot(x - c.x, z - c.z) > 900) return;
      const j = ns * 4; SP[j] = x; SP[j + 1] = z; SP[j + 2] = r; SP[j + 3] = kind; SQ[j] = k; SQ[j + 1] = age; SQ[j + 2] = seed; SQ[j + 3] = life; SR[j] = smooth(0.3, 7, -sim.bed(x, z)); ns++;
    };
    if (!L.under) {
      for (const s of signs) put(s.x, s.z, s.r, s.kind, s.k, 0, (s.sc.id * 0.618) % 1, 1);
      for (let i = marks.length - 1; i >= 0; i--) { const m = marks[i]; m.t += dt; if (m.t >= m.life) { marks.splice(i, 1); continue; } put(m.x, m.z, m.r, m.kind, m.k, m.t, m.seed, m.life); }
    } else marks.length = 0;
    signGeo.instanceCount = ns; L.signsDrawn = ns;
    if (ns) for (const a of signAttr) { a.clearUpdateRanges(); a.addUpdateRange(0, ns * 4); a.needsUpdate = true; }
    // the sea bed: kept warm while the camera is low over the water (so a dive finds it built), stepped a little a frame
    if (c.y < 4 && isWater(c.x, c.z)) { bedWant(c.x, c.z, false); bedStep(500); }
    L.ms = performance.now() - t0;
  };
  L.setEnabled = on => { L.enabled = !!on; if (!on) { sim.clear(); birds.clear(); for (const k in meshes) meshes[k].geometry.instanceCount = 0; signGeo.instanceCount = 0; setUnder(false); } };
  L.setQuality = q => {
    L.quality = q;
    if (q === 'off') { L.fishOn = false; return; }
    L.fishOn = true; sim.setQuality(q); birds.max = BIRD_Q[q] || BIRD_Q.medium; motes.visible = L.under && q !== 'low';
  };
  L.fishMesh = meshes.school; L.meshes = meshes; L.bufs = bufs; L.bedMesh = bedMesh; L.signMesh = signMesh; L.surfaceAt = surfaceAt;
  return L;
}
