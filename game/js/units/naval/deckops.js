// DECK OPS (ngc/bugsweep): flight-deck operations on the ALBATROSS - one launch queue for every fixed-wing aircraft
// aboard (the player's Hornet and Tomcat, the AI Tomcat escorts, the commander's wingmen, sim mode's strike Hornets),
// launched one at a time off cat 1, in order, with a taxi simulation between: spotted on a parking spot, taxied by a
// yellow-shirt director along the lane past the island to the hold-short line behind the jet blast deflector, handed
// to the catapult director, onto the shuttle (JBD up), tensioned, the shot - then the cat is cleared for the next one.
// Pure: plain JS, no THREE, no DOM, no game imports; runs in node (tools/deckopsbench.mjs).
//
// Deck frame (albatross.js): x starboard, z aft, bow at -z, metres. Cat 1 runs x -2.5 from z -6 (the shuttle's start)
// to z -50 (airframe.js DECKOPS). Cat 2 (x 4.5) stays shut: the parked Hornets' wings foul it (b44b44d).
// The landing runout (wires z 30..44, ~26 m of pull-out) ends between z 18 and z 4 on x -2.5, so the lane, the
// hold-short line and the run onto the cat are all in the landing area: a launch and a recovery never share the
// deck. Cycle ops: while anyone wants to land, nothing new moves into the landing area (jets on their spots wait; one
// already at the hold-short line goes on to the cat, which takes it out of the area); while anything is in the area
// the pattern holds (the AI pilot flies round again: deckClear() is false).
//
// API (W = the war; entries are owned by their callers: airwar.js for the AI, main.js for the player's jets):
//   const DO = createDeckOps({ feed, now })
//   DO.request({ name, A, player, kind, attach(e) -> bool, onAirborne(e), onCancel(e, why) }) -> entry | null (deck full)
//        the aircraft is spotted at once (A.tow set) or waits in the hangar (entry.state 'hangar', A untouched)
//   DO.quick(e) -> true when the cat is free now: the entry goes straight to the cat (the old "spotted on cat 1")
//   DO.bump(e)   the commander's priority: first in line, and straight onto the cat when it is free (skips the taxi)
//   DO.cancel(e, why)   (the pilot climbed out, the jet was lost)
//   DO.update(dt, world)   world = { ship: true|false, obstacles: [{ lx, lz, r, why }], landing: bool }
//   DO.place(e) -> 1-based place in the line; DO.status(e) -> 'NUMBER 2 FOR CAT 1  -  HOLD SHORT' etc.
//   DO.deckClear() -> '' | why (an aircraft may come down now); DO.wantsLanding() is world.landing
//   DO.jbd -> 0..1 (the JBD behind cat 1 up / down); DO.directors -> [{ lx, lz, yaw, mode, on }] (two yellow shirts)
//   DO.crewAvoid(lx, lz) -> [dx, dz] | null   the deck crew step out of a moving jet's way and out of the cat lane
//   DO.entries, DO.log (launch times), DO.stats

export const DECK_OPS = {
  CAT: { id: 1, x: -2.5, z0: -6, z1: -50 },
  // two spots in file along the starboard side aft of the island, nose to the bow (a Tomcat is 19 m long: 19 m apart;
  // spot 1 far enough aft that the nose clears the island's after face at z 15). The jet on spot 2 moves up when spot 1
  // empties; newcomers come up behind the last one (the rest wait in the hangar).
  SPOTS: [{ lx: 10.5, lz: 27, hdg: 0 }, { lx: 10.5, lz: 46, hdg: 0 }],
  LANE: [[7.5, 21], [4.2, 15.5]],           // round the island's after corner to the hold-short line
  HOLD: { lx: 2.4, lz: 10.5, hdg: -0.55 },  // hold short: behind the JBD (z 3.2..5.6), nose angled at the cat
  ENTRY: [[-1.6, 3.5]],                     // over the lowered JBD onto the track
  TAXI_V: 3.2, TURN: 0.9,                   // m/s (a fast walk, as the directors bring them up), rad/s
  SPOT_T: 6,                                // spotted, chained, engines on: the least time on a spot before taxi
  HOLD_T: 2,                                // at the hold-short line, handed to the cat director
  CAT_GAP: 8,                               // after the shot: shuttle back, JBD down, the deck crew back on the cat
  LAND_AREA: { x0: -13, x1: 7.6, z0: -2, z1: 62 },   // the landing runout and wires (+ a Tomcat's spread wings)
  CAT_LANE: { x0: -13, x1: 7.6, z0: -56, z1: 6 },    // the shot: a Tomcat's wings at 20 deg reach x -12.3 .. 7.3
  JET_R: 6,                                 // a taxiing jet's footprint (folded / oversweep wings, the nose)
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const inBox = (B, x, z, m = 0) => x > B.x0 - m && x < B.x1 + m && z > B.z0 - m && z < B.z1 + m;

export function createDeckOps({ feed = () => {}, now = () => 0, O = DECK_OPS } = {}) {
  const D = { entries: [], log: [], jbd: 0, catGap: 0, why: '', stats: { launched: 0, cancelled: 0, maxWait: 0 }, landing: false, seq: 0 };
  D.directors = [{ lx: 6.3, lz: -3.8, yaw: 2.8, mode: 'idle', on: false, home: [6.3, -3.8, 2.8] }, { lx: -9.6, lz: -1, yaw: 0.6, mode: 'idle', on: false, home: [-9.6, -1, 0.6] }];
  const spotFree = (i, obstacles) => !D.entries.some(e => e.spotI === i || e.spotI > i || (e.A.tow && Math.hypot(e.A.tow.lx - O.SPOTS[i].lx, e.A.tow.lz - O.SPOTS[i].lz) < 2 * O.JET_R + 1)) && !(obstacles || []).some(o => Math.hypot(o.lx - O.SPOTS[i].lx, o.lz - O.SPOTS[i].lz) < o.r + O.JET_R);
  const busy = st => D.entries.find(e => e.state === st);
  const order = () => D.entries.slice().sort((a, b) => (b.prio - a.prio) || (a.seq - b.seq));
  D.place = e => order().indexOf(e) + 1;
  D.status = e => {
    if (!e || !D.entries.includes(e)) return '';
    const n = D.place(e), why = e.why ? `  -  ${e.why}` : '';
    if (e.state === 'hangar') return `NUMBER ${n} FOR CAT 1  -  IN THE HANGAR, WAITING FOR A SPOT${why}`;
    if (e.state === 'moveup') return `NUMBER ${n} FOR CAT 1  -  MOVING UP TO SPOT 1`;
    if (e.state === 'spot') return `NUMBER ${n} FOR CAT 1  -  ON THE SPOT, CHAINED${e.why ? why : n > 1 ? '' : '  -  TAXI CLEARED SHORTLY'}`;
    if (e.state === 'taxi') return `NUMBER ${n} FOR CAT 1  -  TAXIING, FOLLOW THE DIRECTOR`;
    if (e.state === 'hold') return `NUMBER ${n} FOR CAT 1  -  HOLD SHORT${why}`;
    if (e.state === 'oncat') return 'TAXIING ONTO CAT 1  -  THE CAT DIRECTOR HAS YOU';
    return '';
  };

  function setPath(e, pts, hdgEnd) { e.path = pts; e.k = 0; e.hdgEnd = hdgEnd; e.A.tow.v = 0; }
  function follow(e, dt) {   // taxi along e.path; true when there
    const T = e.A.tow;
    if (e.k >= e.path.length) { T.v = 0; T.hdg += clamp(wrap(e.hdgEnd - T.hdg), -O.TURN * dt, O.TURN * dt); return Math.abs(wrap(e.hdgEnd - T.hdg)) < 0.03; }
    const [tx, tz] = e.path[e.k], dx = tx - T.lx, dz = tz - T.lz, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, -dz), err = wrap(want - T.hdg);   // hdg 0 = nose to -z, + to starboard
    T.hdg += clamp(err, -O.TURN * dt, O.TURN * dt);
    const v = O.TAXI_V * clamp(1 - Math.abs(err) / 1.2, 0.15, 1) * clamp(d / 3 + 0.3, 0.3, 1), step = Math.min(d, v * dt);
    if (d > 1e-6) { T.lx += Math.sin(T.hdg) * step; T.lz -= Math.cos(T.hdg) * step; }
    T.v = step / Math.max(dt, 1e-6); e.s += step;
    if (d < 0.35) e.k++;
    return false;
  }
  const pathOk = (pts, obstacles) => {   // nobody parked / hovering along the way
    for (const o of obstacles || []) for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
      const t = clamp(((o.lx - ax) * vx + (o.lz - az) * vz) / L2, 0, 1), d = Math.hypot(ax + vx * t - o.lx, az + vz * t - o.lz);
      if (d < o.r + O.JET_R) return o.why || 'THE DECK IS FOULED';
    }
    return '';
  };

  const parked = me => D.entries.filter(o => o !== me && o.A.tow && (o.state === 'spot' || o.state === 'moveup')).map(o => ({ lx: o.A.tow.lx, lz: o.A.tow.lz, r: O.JET_R + 3, why: `${o.name} IS IN THE WAY` }));
  D.request = r => {
    const e = { ...r, seq: ++D.seq, prio: r.prio || 0, state: 'hangar', t: 0, s: 0, spotI: -1, path: [], k: 0, asked: now() };
    D.entries.push(e);
    if (!spot(e, null) && e.player) {   // the player's jet bumps the last AI jet spotted back down to the hangar
      const o = D.entries.filter(o => o !== e && !o.player && o.state === 'spot').sort((a, b) => b.spotI - a.spotI)[0];
      if (o && o.spotI === Math.max(...D.entries.map(x => x.spotI))) { o.state = 'hangar'; o.spotI = -1; o.A.tow = null; o.onUnspot && o.onUnspot(o); if (spot(e, null)) e.seq = Math.min(...D.entries.filter(x => x.state === 'hangar').map(x => x.seq)) - 0.5; }   // (and goes ahead of the ones sent down)
    }
    return e;
  };
  function spot(e, obstacles) {   // up from the hangar onto a free spot
    for (let i = 0; i < O.SPOTS.length; i++) if (spotFree(i, obstacles)) {
      const S = O.SPOTS[i]; e.spotI = i; e.state = 'spot'; e.t = 0; e.s = 0;
      e.A.tow = { lx: S.lx, lz: S.lz, hdg: S.hdg, v: 0 }; e.A.cat = null;
      e.onSpot && e.onSpot(e);
      return true;
    }
    return false;
  }
  // the cat is free right now: no one on it, in the gap, on the way, waiting ahead, and the deck is open
  D.catFreeNow = () => !D.entries.some(e => ['oncat', 'tension', 'shot', 'hold', 'taxi'].includes(e.state)) && D.catGap <= 0 && !D.landing;
  D.quick = e => {
    if (!D.catFreeNow() || order()[0] !== e) return false;
    return toCat(e);
  };
  function toCat(e) {
    e.A.tow = null; e.spotI = -1;
    if (!e.attach(e)) { e.state = 'hangar'; return false; }
    e.state = 'tension'; e.t = 0; return true;
  }
  D.bump = e => {
    if (!D.entries.includes(e)) return false;
    e.prio = 1 + Math.max(0, ...D.entries.map(o => o.prio)); e.skip = true;
    if (e.state === 'spot' || e.state === 'hangar') return D.quick(e);
    return false;
  };
  D.cancel = (e, why = '') => {
    const i = D.entries.indexOf(e); if (i < 0) return;
    D.entries.splice(i, 1); D.stats.cancelled++;
    if (e.A.tow) e.A.tow = null;
    if (['tension', 'shot', 'oncat'].includes(e.state)) D.catGap = Math.max(D.catGap, 2);
    e.onCancel && e.onCancel(e, why);
  };

  // ------------------------------------------------------------------ the deck, once a frame
  D.update = (dt, w = {}) => {
    const obstacles = w.obstacles || [];
    D.landing = !!w.landing;
    D.catGap = Math.max(0, D.catGap - dt);
    if (w.ship === false) { for (const e of D.entries.slice()) D.cancel(e, 'NO DECK'); return; }
    D.why = '';
    for (let i = 0; i + 1 < O.SPOTS.length; i++) {   // move up: spot i empty, the jet behind it taxis forward
      const e = D.entries.find(o => o.spotI === i + 1 && o.state === 'spot');
      if (e && !D.entries.some(o => o.spotI === i) && !pathOk([[e.A.tow.lx, e.A.tow.lz], [O.SPOTS[i].lx, O.SPOTS[i].lz]], obstacles)) { e.spotI = i; e.state = 'moveup'; setPath(e, [[O.SPOTS[i].lx, O.SPOTS[i].lz]], O.SPOTS[i].hdg); }
    }
    for (const e of order()) {
      e.t += dt; e.why = '';
      switch (e.state) {
        case 'hangar': if (e.skip && D.quick(e)) break; if (!spot(e, obstacles)) e.why = 'ALL SPOTS TAKEN'; break;   // (bumped: up on the lift and straight to the cat)
        case 'spot': {
          if (e.t < O.SPOT_T && !e.skip) break;
          if (order().find(o => o.state === 'spot') !== e) break;   // someone spotted before me goes first
          if (D.entries.some(o => o.skip && o !== e && o.prio > e.prio && (o.state === 'hangar' || o.state === 'spot'))) break;   // the commander's jet goes next
          if (busy('taxi') || busy('hold')) break;
          if (e.skip && D.quick(e)) break;
          if (D.landing) { D.why = e.why = 'RECOVERY IN PROGRESS'; break; }
          const pts = [...O.SPOTS.slice(0, e.spotI).reverse().map(S => [S.lx, S.lz]), ...O.LANE, [O.HOLD.lx, O.HOLD.lz]];
          const f = pathOk([[e.A.tow.lx, e.A.tow.lz], ...pts], [...obstacles, ...parked(e)]); if (f) { D.why = e.why = f; break; }
          e.state = 'taxi'; e.t = 0; e.s = 0; setPath(e, pts, O.HOLD.hdg);
          if (e.player) feed(`${e.name}: TAXI  -  FOLLOW THE YELLOW SHIRT TO CAT 1`);
          break;
        }
        case 'moveup': if (follow(e, dt)) e.state = 'spot'; break;
        case 'taxi': if (e.s > 9) e.spotI = -1; if (follow(e, dt)) { e.state = 'hold'; e.t = 0; e.A.tow.v = 0; } break;
        case 'hold': {
          if (e.t < O.HOLD_T) break;
          if (D.entries.some(o => ['oncat', 'tension', 'shot'].includes(o.state)) || D.catGap > 0) { e.why = D.catGap > 0 ? 'THE CAT IS BEING RESET' : 'CAT 1 IS BUSY'; break; }
          const pts = [...O.ENTRY, [O.CAT.x, O.CAT.z0]], f = pathOk([[O.HOLD.lx, O.HOLD.lz], ...pts], obstacles);
          if (f) { D.why = e.why = f; break; }
          e.state = 'oncat'; e.t = 0; setPath(e, pts, 0);   // (allowed in a recovery: it takes her out of the landing area)
          break;
        }
        case 'oncat': if (follow(e, dt)) { if (!toCat(e)) D.cancel(e, 'COULD NOT HOOK UP'); } break;
        case 'tension':
          if (!e.A.cat) { D.cancel(e, 'OFF THE CAT'); break; }
          if (e.A.cat.state === 'stroke') { e.state = 'shot'; e.t = 0; }
          break;
        case 'shot':
          if (!e.A.cat) {   // off the bow
            D.entries.splice(D.entries.indexOf(e), 1); D.catGap = O.CAT_GAP; D.stats.launched++;
            const wait = now() - e.asked; D.stats.maxWait = Math.max(D.stats.maxWait, wait); D.log.push({ name: e.name, t: now(), wait });
            e.state = 'gone'; e.onAirborne && e.onAirborne(e);
          }
          break;
      }
    }
    // the JBD: up while a jet is on the shuttle or running onto it past the panel
    const up = D.entries.some(e => e.state === 'tension' || e.state === 'shot' || (e.state === 'oncat' && e.A.tow && e.A.tow.lz < 2.6));
    D.jbd = clamp(D.jbd + (up ? 1 : -1) * dt * 0.7, 0, 1);
    directors(dt);
  };
  // the two directors: the taxi director walks ahead of the jet on the lane, the cat director takes her at the hold-short
  // line and brings her onto the shuttle; off duty they stand at their posts
  function directors(dt) {
    const taxi = D.entries.find(e => e.state === 'taxi') || D.entries.find(e => e.state === 'spot' && e.t > O.SPOT_T - 2 && !busy('taxi') && !busy('hold'));
    const cat = D.entries.find(e => e.state === 'oncat' || e.state === 'hold' || e.state === 'tension');
    aim(D.directors[0], taxi && taxi.A.tow ? taxi.A.tow : null, 9, -4.5, dt);
    aim(D.directors[1], cat ? (cat.A.tow || { lx: O.CAT.x, lz: O.CAT.z0, hdg: 0 }) : null, cat && cat.state === 'tension' ? 0 : 9, cat && cat.state === 'tension' ? -8.2 : -4.5, dt);
  }
  function aim(P, T, ahead, side, dt) {   // stand `ahead` m in front of the nose and `side` m to its port side, facing it
    let tx, tz, ty;
    if (T) { const s = Math.sin(T.hdg), c = -Math.cos(T.hdg); tx = T.lx + s * ahead + (-c) * side; tz = T.lz + c * ahead + s * side; ty = Math.atan2(-(T.lx - tx), -(T.lz - tz)); P.mode = 'signal'; }
    else { [tx, tz, ty] = P.home; P.mode = 'idle'; }
    const dx = tx - P.lx, dz = tz - P.lz, d = Math.hypot(dx, dz), sp = Math.min(d, 2.6 * dt);
    if (d > 0.05) { P.lx += dx / d * sp; P.lz += dz / d * sp; }
    P.walking = d > 0.4; P.yaw = P.walking ? Math.atan2(-dx, -dz) : ty; P.on = !!T;
  }
  // the deck crew: out of a moving jet's way, and off the cat lane while a jet is on it
  D.crewAvoid = (lx, lz) => {
    for (const e of D.entries) {
      if (e.A.tow && e.state !== 'spot' && e.state !== 'hangar') { const dx = lx - e.A.tow.lx, dz = lz - e.A.tow.lz, r = Math.hypot(dx, dz); if (r < O.JET_R + 1.5) return [dx || 0.1, dz]; }
      if ((e.state === 'tension' || e.state === 'shot' || e.state === 'oncat') && inBox(O.CAT_LANE, lx, lz) && lx > -12 && lx < 7) return [lx > O.CAT.x ? 1 : -1, 0];
    }
    return null;
  };
  D.isDirector = (lx, lz) => D.directors.some(P => P.on && Math.hypot(P.lx - lx, P.lz - lz) < 0.8);
  // may an aircraft come down? (nothing of ours in the landing area)
  D.deckClear = () => {
    const e = D.entries.find(e => ['taxi', 'hold', 'oncat'].includes(e.state) && e.A.tow && inBox(O.LAND_AREA, e.A.tow.lx, e.A.tow.lz, O.JET_R - 2));
    return e ? `FOUL DECK  -  ${e.name} IN THE LANDING AREA` : '';
  };
  D.inLandingArea = (lx, lz, r = 0) => inBox(O.LAND_AREA, lx, lz, r);
  D.reset = () => { D.entries.length = 0; D.log.length = 0; D.jbd = 0; D.catGap = 0; D.why = ''; D.stats = { launched: 0, cancelled: 0, maxWait: 0 }; for (const P of D.directors) { [P.lx, P.lz, P.yaw] = P.home; P.on = false; P.mode = 'idle'; } };
  return D;
}
