// devworld.js - the test world for the rotary benches (tools/rotarymission.mjs) and the dev page (game/dev/rotary.html):
// one hilly island with a flat pad (an HQ and a factory beside it, like the game's islands), open sea, and a carrier
// deck 8 m high that steams at 6 m/s and turns slowly. Pure JS.
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export function createDevWorld() {
  const PAD = { x: 520, z: -260, h: 6, r: 8.5 };
  const hills = (x, z) => 14 * Math.sin(x * .035 + 1.3) * Math.cos(z * .04) + 9 * Math.sin(x * .09 + z * .07) + 8;
  function terrain(x, z) {
    const d = Math.hypot(x - PAD.x, z - PAD.z), isl = clamp(1 - (d - 70) / 40, 0, 1);
    let h = -14 + (hills(x, z) * 0.9 + 14) * isl;
    if (d < 52) { const k = clamp((d - 30) / 22, 0, 1); h = PAD.h + (h - PAD.h) * k * k * (3 - 2 * k); }
    return h;
  }
  const deck = { x: 0, z: 0, yaw: 1.0, sp: 6, w: 0.004, L: 120, W: 28, H: 8 };
  const toLocal = (x, z) => { const dx = x - deck.x, dz = z - deck.z, c = Math.cos(deck.yaw), s = Math.sin(deck.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (lx, lz) => { const c = Math.cos(deck.yaw), s = Math.sin(deck.yaw); return [deck.x + lx * c + lz * s, deck.z - lx * s + lz * c]; };
  const onDeck = (x, z) => { const [lx, lz] = toLocal(x, z); return Math.abs(lx) < deck.W / 2 && Math.abs(lz) < deck.L / 2; };
  const deckVel = () => ({ vx: -Math.sin(deck.yaw) * deck.sp, vz: -Math.cos(deck.yaw) * deck.sp });
  const env = {
    groundY: (x, z) => Math.max(terrain(x, z), 0, onDeck(x, z) ? deck.H : -1e9),
    water: (x, z) => !onDeck(x, z) && terrain(x, z) < 0,
    surfVel: (x, z) => onDeck(x, z) ? { ...deckVel(), w: deck.w, cx: deck.x, cz: deck.z } : null,
  };
  const world = { groundY: env.groundY, floorAlong(x, z, ux, uz, L) { let m = env.groundY(x, z); for (let s = 10; s <= L; s += 10) m = Math.max(m, env.groundY(x + ux * s, z + uz * s)); return m; } };
  // buildings beside the pad (on the line through it, like war.js puts the HQ and the factory)
  const structs = [{ kind: 'hq', x: PAD.x, z: PAD.z - 17, r: 7, h: 12 }, { kind: 'factory', x: PAD.x, z: PAD.z + 18, r: 8, h: 9 }];
  return {
    PAD, deck, terrain, env, world, structs, toWorld, toLocal, onDeck,
    move(dt) { deck.x += -Math.sin(deck.yaw) * deck.sp * dt; deck.z += -Math.cos(deck.yaw) * deck.sp * dt; deck.yaw += deck.w * dt; },
    spot(lx, lz) { const [x, z] = toWorld(lx, lz); return { x, y: deck.H, z, hdg: deck.yaw, ...deckVel() }; },
    // a landing zone beside the pad, perpendicular to the building line, tail toward the pad
    lz(off = 18) { return { x: PAD.x + off, y: PAD.h, z: PAD.z, hdg: -Math.PI / 2, vx: 0, vz: 0 }; },
  };
}
