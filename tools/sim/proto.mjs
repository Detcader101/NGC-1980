// throwaway: can war.js run in node?
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, n) { if (s === 'three') return { url: ${JSON.stringify(pathToFileURL(new URL('../../game/vendor/three.module.min.js', import.meta.url).pathname).href)}, shortCircuit: true }; return n(s, c); }`));
const noop = () => {};
const ctx2d = new Proxy({}, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: noop }) : t[k] ?? noop, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }) };
const t0 = performance.now();
const THREE = await import('../../game/vendor/three.module.min.js');
const { createZone } = await import('../../game/js/sim/zone.js');
const Z = createZone(); console.log('zone', (performance.now() - t0).toFixed(0), 'ms');
const deep = () => { const f = function () { return P; }; const P = new Proxy(f, { get: (t, k) => k === Symbol.iterator ? function* () {} : k === Symbol.toPrimitive ? () => 0 : k === 'length' ? 0 : P, set: () => true, apply: () => P }); return P; };
const fx = deep();
const sfx = new Proxy({}, { get: (t, k) => (k === 'ctx' || k === 'master') ? undefined : noop });
const { createWar } = await import('../../game/js/war.js');
const G = { fuel: 300, mat: 120, get fuelMax() { return 600; } };
const PL = { alive: false, landed: false, inCave: false, pos: new THREE.Vector3(0, -1000, 0), vel: new THREE.Vector3(), hitR: 2.6, detect: 1 };
const scene = new THREE.Scene();
const W = createWar({ headless: true, scene, fx, sfx, terrainH: Z.terrainH, isWater: Z.isWater, nav: Z.nav, ISLANDS: Z.ISLANDS, BASES: Z.BASES, G, feed: (t, k) => console.log('FEED', t), addScore: noop, ear: new THREE.Vector3(0, 5000, 0),
  carrierStart: Z.carrierStart, enemyStart: Z.enemyStart, player: () => PL, hurtPlayer: noop, onOwner: noop, onEnd: (r, w) => console.log('END', r, w) });
console.log('war', (performance.now() - t0).toFixed(0), 'ms');
W.reset(); console.log('reset', (performance.now() - t0).toFixed(0), 'ms');
const dt = 1 / 30; const t1 = performance.now(); const T = +(process.argv[2] || 600);
for (let i = 0; i < 30 * T; i++) { W.tickSea(dt); W.update(dt, PL, false); if (i % 1800 === 0) console.log('t', W.time.toFixed(0), 'units', W.units.length, 'E', W.E.mat.toFixed(0), 'P', G.mat.toFixed(0), 'owners', W.islands.map(I => I.owner).join(''), ((performance.now() - t1) / 1000).toFixed(1) + 's'); if (W.over) break; }
console.log(T, 's in', ((performance.now() - t1) / 1000).toFixed(1), 's');
process.exit(0);
