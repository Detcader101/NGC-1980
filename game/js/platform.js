// FOUNDATION: platform-relative motion - how anything standing or parked on a ship deck (a soldier, a jeep, a parked
// Hornet) is carried along while the ship sails, turns, and (the SKY CARRIER) climbs or descends.
// Pure: no THREE. A ship is any object with p {x, y, z} and yaw (the war.js units; forward = (-sin yaw, -cos yaw)).
//
//   const PF = createPlatforms({ deckY(x, z), shipAt(x, z), alive(u) });
//   PF.carry(o)            before a step: move o = { x, y, z, yaw, plat, loc } with its ship since the last frame;
//                          o.carried = { dx, dy, dz, dyaw } says how far it went (null when not on a ship)
//   PF.settle(o, onGround) after a step: attach o to the ship whose deck it stands on (or keep the one it jumped from)
//   PF.toLocal(u, x, z) -> [lx, lz]     PF.toWorld(u, lx, lz, out) -> out {x, z}
//
// Kinematic carrying (rather than friction against a moving deck) makes a parked or standing thing stay exactly on its
// deck spot at any frame rate and any ship motion; a sim then only has to model motion relative to the deck.
// subY(u, lx, lz) (optional, SEAWORLD): the height of a moving part of ship u's deck at a ship-frame point (a deck-edge
// lift), or null - whoever stands on it is carried up and down with it too
export function createPlatforms({ deckY, shipAt, alive = () => true, subY = null }) {
  const toLocal = (u, x, z) => { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (u, lx, lz, out = { x: 0, z: 0 }) => { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); out.x = u.p.x + lx * c + lz * s; out.z = u.p.z - lx * s + lz * c; return out; };
  const _w = { x: 0, z: 0 };
  const PF = { toLocal, toWorld };
  // The ship's motion since the last settle() is added to o (position, height and heading), so anything else that
  // moved o in between - its own sim, a mouse turning a soldier's head, a teleport - is kept, not snapped back.
  PF.carry = o => {
    const u = o.plat, L = o.loc; o.carried = null;
    if (!u || !L || !alive(u)) { o.plat = null; o.loc = null; return; }
    toWorld(u, L.x, L.z, _w);
    const dx = _w.x - L.wx, dz = _w.z - L.wz, dyaw = u.yaw - L.syaw;
    let dy = u.p.y - L.sy;
    if (L.ly != null && subY) { const y = subY(u, L.x, L.z); if (y != null) dy += y - L.ly; }   // SEAWORLD: on a lift
    o.x += dx; o.z += dz; o.y += dy; o.yaw += dyaw;
    o.carried = { dx, dy, dz, dyaw };
  };
  PF.settle = (o, onGround = true) => {
    const deck = deckY(o.x, o.z);
    let ship = deck > -1e8 && onGround && Math.abs(o.y - deck) < 0.6 ? shipAt(o.x, o.z) : null;
    // in the air over the deck it left (a jump, a step off a ledge onto the deck below): stay with that ship, so the
    // jump is relative to the deck
    if (!ship && !onGround && o.plat && alive(o.plat) && deck > -1e8 && o.y > deck - 0.5 && o.y < deck + 8) ship = o.plat;
    if (!ship && o.ladder && o.ladder.ship && alive(o.ladder.ship)) ship = o.ladder.ship;   // on a ship's ladder
    o.plat = ship || null;
    if (!ship) { o.loc = null; return; }
    const [lx, lz] = toLocal(ship, o.x, o.z);
    o.loc ||= {}; o.loc.x = lx; o.loc.z = lz; o.loc.wx = o.x; o.loc.wz = o.z; o.loc.sy = ship.p.y; o.loc.syaw = ship.yaw;
    o.loc.ly = subY ? subY(ship, lx, lz) : null;
  };
  return PF;
}
