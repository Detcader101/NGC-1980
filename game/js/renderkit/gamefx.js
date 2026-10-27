// RENDERKIT fx: GPU particle emitters (renderkit createParticleSystem) layered onto the game's CPU effects (fx.js).
// Only built when RK.on('fx'); with ?rk=0 fx.js never imports a system from here, so the old effects run untouched.
//
// What it adds, all pooled with fixed counts (no emitter is ever created per shot; nothing is allocated per frame):
// - FIRE_SLOTS burning-wreck flames + rising embers. Each frame the nearest burning fx emitters get a slot; the rest
//   keep the CPU flame particles (fx.js asks `fireSlot(e)` and skips its own flames when it has one).
// - BURST_SLOTS explosion spark bursts (non-looping, radial). Round robin, oldest reused; they replace the CPU sparks.
// - one rotor-downwash emitter (dust over land, spray over water) under the player's Huey, fed by fx.downwash().
// One simulation clock: `T` advances only by the dt fx.update() is given (main.js passes 0 while paused).
// Emitters sit at world positions that do not move while particles are alive (wreck fires, a burst's centre, the
// ground under the rotor), so the emitter-local motion reads as world motion. No soft particles: setDepthTexture
// stays null (the game has no separate opaque depth prepass).
import * as THREE from 'three';
import { createParticleSystem } from './effects.js';

const FIRE_SLOTS = 10, BURST_SLOTS = 8;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createGameParticles(scene, { reducedMotion = () => false } = {}) {
  const group = new THREE.Group(); group.name = 'RenderKit fx'; scene.add(group);
  let T = 0;
  const cam = new THREE.Vector3(), fog = { near: 125, far: 250 };
  const add = sys => { sys.mesh.visible = false; group.add(sys.mesh); return sys; };
  // additive kinds: the library's fog mix would push them TOWARD the fog colour (a pale smudge at range), so they
  // skip fog and fade by distance instead (same near/far as the game's fog)
  const noFog = sys => { sys.material.fog = false; sys.mesh.renderOrder = 4; return sys; };

  // ---- burning wrecks: flames + embers, looping
  const fires = [];
  for (let i = 0; i < FIRE_SLOTS; i++) {
    const fire = noFog(add(createParticleSystem({ kind: 'fire', count: 28, seed: 1980 + i * 17, spread: 1.3, life: 0.9, speed: 2.4, size: 0.85, opacity: 0.24, color: 0xe0782a, endColor: 0x8a260a })));
    const embers = noFog(add(createParticleSystem({ kind: 'sparks', count: 18, seed: 7 + i * 31, spread: 1.2, life: 2.6, speed: 2.6, gravity: 0.5, size: 0.09, opacity: 0.85, color: 0xffb060, endColor: 0xb8360c })));
    fires.push({ fire, embers, e: null, op: 0 });
  }
  // ---- explosion sparks: one-shot radial bursts
  const bursts = [];
  for (let i = 0; i < BURST_SLOTS; i++) {
    const s = noFog(add(createParticleSystem({ kind: 'sparks', count: 56, seed: 400 + i * 13, spread: 0.4, loop: false, life: 1.3, speed: 1, gravity: -11, size: 0.16, opacity: 1, color: 0xffcf86, endColor: 0xc8420e })));
    const v = s.mesh.geometry.getAttribute('rkVelocity'), a = v.array;
    let st = 99 + i;   // own LCG so every slot has a different spray
    const r = () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 56; k++) {
      const az = r() * 6.2832, el = -0.15 + r() * 1.15, sp = 9 + r() * 19, h = Math.sqrt(Math.max(0, 1 - el * el));
      a[k * 3] = Math.cos(az) * h * sp; a[k * 3 + 1] = el * sp; a[k * 3 + 2] = Math.sin(az) * h * sp;
    }
    v.needsUpdate = true;
    bursts.push({ s, t0: -1e9, life: 1.3, op: 1 });
  }
  let nextBurst = 0;
  // ---- rotor downwash: radial outflow from under the disc
  // dust: the 'dust' kind (grows, turbulent edge). Spray: the 'snow' kind (soft round drops, no turbulence): the
  // dust kind's carved edge read as lacy rings over the sea at this size (seen in the first A/B shots).
  const mkWash = (kind, color, endColor, seed, size) => {
    const s = add(createParticleSystem({ kind, count: 64, seed, spread: 1, life: 1.5, speed: 1, gravity: -0.6, size, opacity: 0.3, color, endColor }));
    const o = s.mesh.geometry.getAttribute('rkOrigin'), v = s.mesh.geometry.getAttribute('rkVelocity');
    let st = seed; const r = () => (st = (Math.imul(st, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 64; k++) {
      const az = r() * 6.2832, rr = 2 + r() * 4, sp = 8 + r() * 9;
      o.array[k * 3] = Math.cos(az) * rr; o.array[k * 3 + 1] = r() * 0.4; o.array[k * 3 + 2] = Math.sin(az) * rr;
      v.array[k * 3] = Math.cos(az) * sp; v.array[k * 3 + 1] = 0.4 + r() * 1.6; v.array[k * 3 + 2] = Math.sin(az) * sp;
    }
    o.needsUpdate = v.needsUpdate = true;
    s.mesh.renderOrder = 3;
    return s;
  };
  const wash = { dust: mkWash('dust', 0xa08a66, 0x7a6e58, 61, 1.6), spray: mkWash('snow', 0xe2ecf0, 0xc4d2d8, 67, 0.7), k: 0, level: 0, wet: false, fed: false, x: 0, y: 0, z: 0 };
  function washOne(s, isWet) {
    const lv = wash.wet === isWet ? wash.level : 0, on = lv > 0.02;
    s.mesh.visible = on; if (!on) return;
    s.mesh.position.set(wash.x, wash.y + 0.3, wash.z);
    s.uniforms.rkOpacity.value = (isWet ? 0.4 : 0.42) * Math.min(1, lv * 1.4);
    s.update(T);
  }

  const cand = [], byDist = (a, b) => a.rkD - b.rkD, freeSlot = q => !q.e;
  const distFade = (x, y, z) => 1 - smooth(fog.near, fog.far, Math.hypot(x - cam.x, y - cam.y, z - cam.z));

  const P = {
    group,
    get time() { return T; },
    setView(camera, f) { cam.copy(camera.position); if (f) { fog.near = f.near; fog.far = f.far; } },
    // burning fx emitters, nearest first, claim the fire slots; returns true for an emitter drawn on the GPU
    assignFires(emitters) {
      cand.length = 0;
      for (const e of emitters) if (e.kind !== 'chimney' && e.t > 0) { e.rkD = (e.x - cam.x) ** 2 + (e.z - cam.z) ** 2; cand.push(e); }
      cand.sort(byDist); if (cand.length > FIRE_SLOTS) cand.length = FIRE_SLOTS;
      for (const f of fires) if (f.e && !cand.includes(f.e)) { f.e.rk = null; f.e = null; }   // went out, fell back, or removed
      for (const e of cand) if (!e.rk) { const f = fires.find(freeSlot); if (!f) break; f.e = e; e.rk = f; }
    },
    burst(x, y, z, s = 1) {
      if (distFade(x, y, z) <= 0) return false;
      const b = bursts[nextBurst]; nextBurst = (nextBurst + 1) % BURST_SLOTS;
      b.t0 = T; b.s.mesh.position.set(x, y, z); b.s.mesh.scale.setScalar(Math.sqrt(s));
      b.s.uniforms.rkSize.value = 0.16 * Math.min(2, Math.sqrt(s)); b.op = distFade(x, y, z);
      return true;
    },
    downwash(x, y, z, k, wet) { wash.fed = true; wash.x = x; wash.y = y; wash.z = z; wash.k = k; wash.wet = wet; },
    update(dt) {
      T += dt;
      const calm = reducedMotion();
      for (const f of fires) {
        const e = f.e, on = !!e;
        f.fire.mesh.visible = on; f.embers.mesh.visible = on && !calm;
        if (!on) continue;
        const s = e.s || 1, fade = Math.min(1, e.t / 2) * distFade(e.x, e.y, e.z);
        f.fire.mesh.position.set(e.x, e.y + 0.1, e.z); f.fire.mesh.scale.setScalar(s);
        f.fire.uniforms.rkSize.value = 0.85 * s; f.fire.uniforms.rkOpacity.value = 0.24 * fade;
        f.embers.mesh.position.set(e.x, e.y + 0.4 * s, e.z); f.embers.mesh.scale.setScalar(Math.sqrt(s));
        f.embers.uniforms.rkOpacity.value = 0.85 * fade;
        f.fire.update(T); f.embers.update(T);
      }
      for (const b of bursts) {
        const age = T - b.t0, on = age >= 0 && age < b.life;
        b.s.mesh.visible = on; if (on) { b.s.uniforms.rkOpacity.value = b.op; b.s.update(age); }
      }
      // downwash: ease in/out so a skid touching down or lifting off does not pop
      const w = wash, target = w.fed ? w.k : 0; w.fed = false;
      w.level += (target - w.level) * Math.min(1, dt * 4);
      washOne(w.dust, false); washOne(w.spray, true);
    },
    clear() { for (const f of fires) { if (f.e) f.e.rk = null; f.e = null; } for (const b of bursts) b.t0 = -1e9; wash.level = 0; },
    dispose() {
      for (const f of fires) { f.fire.dispose(); f.embers.dispose(); }
      for (const b of bursts) b.s.dispose();
      wash.dust.dispose(); wash.spray.dispose(); group.removeFromParent();
    },
  };
  return P;
}
