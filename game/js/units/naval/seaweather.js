// The weather over a war: an optional, slowly drifting sea state (pure JS, no THREE; node-testable).
//
// The player picks a sea state in the pause menu (SEA STATE slider, remembered per browser). With WEATHER DRIFT on,
// the sea wanders around that choice over the war, the way it does over a few days at sea:
// - every 3-7 minutes a new target state is picked within +-2 of the chosen one (pulled back towards it, never
//   below 0 or above 7);
// - the sea moves towards the target at most one sea state per ~4 minutes (wind takes hours to build a real sea; this is
//   game time, compressed), so the change is felt, not seen;
// - the main wave direction veers slowly (up to +-25 degrees off the starting direction).
// The live sea (seamotion.js retuneSea) is retuned in small steps, keeping every wave's running phase, so the surface
// and the ships never jump. `step` returns a message when the rounded sea state changes ("THE SEA IS GETTING UP").
import { SEA_STATES } from './seamotion.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }

export const WEATHER = {
  every: [180, 420],   // s between new targets
  span: 2,             // max states away from the chosen one
  rate: 1 / 240,       // sea states per second, at most
  veer: 0.44,          // rad, max wander of the main direction
  veerRate: 0.0012,    // rad/s
};

export function createSeaWeather(base = 4, dir0 = 0, seed = 7) {
  const r = rng(seed);
  const W = { base, cur: base, target: base, dir0, dir: dir0, dirTarget: dir0, t: 0, nextT: 0, drift: false, lastShown: Math.round(base) };
  const pick = () => {
    const off = (r() + r() + r() - 1.5) * 1.6;                     // roughly normal, sd ~0.8
    W.target = clamp(W.base + clamp(off, -WEATHER.span, WEATHER.span), 0, SEA_STATES.length - 1);
    W.dirTarget = W.dir0 + (r() * 2 - 1) * WEATHER.veer;
    W.nextT = W.t + WEATHER.every[0] + r() * (WEATHER.every[1] - WEATHER.every[0]);
  };
  // the player moved the slider: the sea goes there now (no drift lag) and drifts round it from here
  W.set = (ss, drift = W.drift) => { W.base = W.cur = W.target = clamp(ss, 0, SEA_STATES.length - 1); W.drift = drift; W.lastShown = Math.round(W.cur); W.nextT = W.t + WEATHER.every[0]; };
  // advance; returns null, or { ss, dir, msg? } when the sea should be retuned
  W.step = dt => {
    W.t += dt;
    if (!W.drift) return null;
    if (W.t >= W.nextT) pick();
    const was = W.cur, wasDir = W.dir;
    W.cur += clamp(W.target - W.cur, -WEATHER.rate * dt, WEATHER.rate * dt);
    W.dir += clamp(W.dirTarget - W.dir, -WEATHER.veerRate * dt, WEATHER.veerRate * dt);
    if (Math.abs(W.cur - was) < 1e-9 && Math.abs(W.dir - wasDir) < 1e-9) return null;
    const out = { ss: W.cur, dir: W.dir }, shown = Math.round(W.cur);
    if (shown !== W.lastShown) {
      out.msg = `WEATHER: THE SEA IS ${shown > W.lastShown ? 'GETTING UP' : 'EASING'}  -  SEA STATE ${shown} ${SEA_STATES[shown].name}`;
      W.lastShown = shown;
    }
    return out;
  };
  return W;
}
