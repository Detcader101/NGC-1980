// SIM MODE: what a CPU vs CPU war records - every few seconds the islands, the stores, the carriers, the forces in
// the field; every unit that comes and goes (by type and side); the commanders' decisions; and at the end the fun
// metrics (lead changes, dead minutes, the snowball point...). Pure: reads the war object, never changes it.
// The headless runner (tools/warsim.mjs) and the browser spectator (sim/spectator.js) both use it.
//
//   const T = createTelemetry(W, { every: 5 })   T.sample() each frame (it keeps its own clock), T.onOwner(I, was),
//   T.decision(side, what, extra), T.finish(reason) -> the run's record (plain JSON)
export const VALUE = { hq: 3, fortress: 2, factory: 2, fuel: 1.5, radar: 1 };
const SIDES = [1, 2];

export function strength(W, side) {
  // a single number for "who is winning": what you hold (islands by value), what you can spend, your carrier, your
  // forces in the field. Weights are the sim's (documented in SIMREPORT.md), not the game's score.
  let isl = 0; for (const I of W.islands) if (I.owner === side) isl += VALUE[I.kind] || 1;
  const S = side === 1 ? W.P : W.E, c = side === 1 ? W.carrier : W.enemyCarrier;
  const ship = c && c.sinking === undefined ? c.hp / c.hpMax : 0;
  let air = 0; for (const u of W.units) if (u.side === side && !u.dead && !u.dying && !u.gone && u.p && !u.dims && !u.ground) air++;
  let gnd = 0; const GS = W.ground && W.ground.sim; if (GS) for (const u of GS.units) if (u.alive && u.side === side && (u.kind !== 'marine' || u.able)) gnd += u.vehicle ? 3 : u.kind === 'marine' ? 0.5 : 1;
  let aa = 0; for (const I of W.islands) for (const s of I.structs) if (s.kind === 'aa' && !s.dead && s.side === side && !s.building) aa++;
  return isl * 10 + Math.min(S.mat, 400) * 0.05 + ship * 40 + air * 2 + gnd * 1.2 + aa * 2 + (side === 2 && W.battleship && W.battleship.sinking === undefined ? 15 : 0);
}

export function createTelemetry(W, o = {}) {
  const every = o.every ?? 5;
  const T = { samples: [], events: [], decisions: [], built: { 1: {}, 2: {} }, lost: { 1: {}, 2: {} }, owner: [], first: { shot: null, loss: null, capture: null }, t: 0, nextT: 0,
    minute: [], known: new Set(), gwKnown: new Set(), spend: { 1: [], 2: [] } };
  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  let minute = null;
  const curMinute = () => { const m = Math.floor(W.time / 60); if (!minute || minute.m !== m) { minute = { m, shots: 0, lost: 0, caps: 0, kills: 0 }; T.minute.push(minute); } return minute; };
  const typeOf = u => u.type === 'squad' ? null : u.type;
  T.onOwner = (I, was) => {
    if (W.time < 0.5) return;   // the reset's own calls
    T.events.push({ t: +W.time.toFixed(1), e: 'owner', I: I.name, kind: I.kind, from: was, to: I.owner });
    curMinute().caps++; if (T.first.capture === null) T.first.capture = W.time;
  };
  T.decision = (side, what, extra = {}) => { T.decisions.push({ t: +W.time.toFixed(1), side, what, ...extra }); };
  function scanUnits() {
    const seen = new Set();
    for (const u of W.units) {
      const ty = typeOf(u); if (!ty) continue;
      seen.add(u);
      if (!T.known.has(u)) { T.known.add(u); bump(T.built[u.side] || (T.built[u.side] = {}), ty); u._simT0 = W.time; }
      if ((u.dying || (u.dims && u.sinking !== undefined)) && !u._simDown) { u._simDown = true; bump(T.lost[u.side] || (T.lost[u.side] = {}), ty); curMinute().lost++; if (T.first.loss === null) T.first.loss = W.time; T.events.push({ t: +W.time.toFixed(1), e: 'lost', side: u.side, type: ty }); }
    }
    for (const u of T.known) if (!seen.has(u)) { T.known.delete(u); if (!u._simDown && !u.recovered && !u.stowed && (u.hp <= 0)) { bump(T.lost[u.side] || (T.lost[u.side] = {}), typeOf(u)); curMinute().lost++; } }
    const GS = W.ground && W.ground.sim;
    if (GS) for (const u of GS.units) {
      if (!T.gwKnown.has(u.id)) { T.gwKnown.add(u.id); bump(T.built[u.side], 'g.' + u.kind); }
      if (!u.alive && !u._simDown) { u._simDown = true; bump(T.lost[u.side], 'g.' + u.kind); curMinute().lost++; if (T.first.loss === null) T.first.loss = W.time; }
    }
    for (const I of W.islands) for (const s of I.structs) {
      if (s.dead && !s._simDown) { s._simDown = true; curMinute().kills++; bump(T.lost[s.side] || (T.lost[s.side] = {}), 's.' + s.kind); if (T.first.loss === null) T.first.loss = W.time; }
      else if (!s.dead && s._simDown) s._simDown = false;   // rebuilt
    }
  }
  T.sample = () => {
    scanUnits();
    const m = curMinute(); let shots = 0; for (const b of W.proj) if (!b._simSeen) { b._simSeen = true; shots++; } m.shots += shots;
    if (shots && T.first.shot === null) T.first.shot = W.time;
    if (W.time < T.nextT) return;
    T.nextT = W.time + every;
    const own = [0, 0, 0]; for (const I of W.islands) own[I.owner]++;
    const s1 = strength(W, 1), s2 = strength(W, 2);
    const gs = W.ground && W.ground.sim, g = [0, 0, 0]; if (gs) for (const u of gs.units) if (u.alive) g[u.side]++;
    const air = [0, 0, 0]; for (const u of W.units) if (!u.dead && !u.dying && u.p && !u.dims && !u.ground) air[u.side]++;
    T.samples.push({ t: Math.round(W.time), own, s1: +s1.toFixed(1), s2: +s2.toFixed(1), m1: Math.round(W.P.mat), m2: Math.round(W.E.mat), f1: Math.round(W.P.fuel),
      c1: W.carrier && W.carrier.sinking === undefined ? Math.round(W.carrier.hp) : 0, c2: W.enemyCarrier && W.enemyCarrier.sinking === undefined ? Math.round(W.enemyCarrier.hp) : 0,
      g1: g[1], g2: g[2], a1: air[1], a2: air[2], bs: W.battleship && W.battleship.sinking === undefined ? 1 : 0, bsb: Math.round(W.E.bship) });
  };
  T.finish = (reason, extra = {}) => {
    const S = T.samples, last = S[S.length - 1] || { s1: 0, s2: 0, own: [0, 0, 0] };
    const winner = judge(S, W.over), how = W.over ? W.over.why : 'timeout';
    return { time: Math.round(W.time), winner, decisive: !!W.over, how, reason, ...fun(S, T.minute, winner), first: T.first, built: T.built, lost: T.lost,
      owner: T.events.filter(e => e.e === 'owner'), samples: S, minutes: T.minute.map(m => [m.shots, m.lost, m.caps, m.kills]), decisions: T.decisions, ...extra };
  };
  return T;
}

// the lead: TASK FORCE strength minus RUNAWAY strength, measured from where the war started (the RUNAWAY starts with
// the cave islands and IRONHOLD - worth ~80 points on paper - so the raw difference says little about who is winning)
export function leads(samples) { const z = samples.length ? samples[0].s1 - samples[0].s2 : 0; return samples.map(s => s.s1 - s.s2 - z); }
// who won: the side that sank the other's carrier (or took IRONHOLD); at the time limit, the side ahead on the lead
export function judge(samples, over) {
  if (over) return over.result === 'win' ? 1 : 2;
  const L = leads(samples), l = L.length ? L[L.length - 1] : 0; return Math.abs(l) < 5 ? 0 : l > 0 ? 1 : 2;
}
// the fun metrics of one war, from its samples (any spacing) and its minutes ([shots, lost, captures, buildings down])
export function fun(samples, minutes, winner) {
  const S = samples; if (!S.length) return {};
  const lead = leads(S), H = 6, dt = S.length > 1 ? (S[S.length - 1].t - S[0].t) / (S.length - 1) || 5 : 5, k = Math.max(1, Math.round(60 / dt));
  let sign = 0, changes = 0, behind = { 1: 0, 2: 0 }, decisive = 0;
  for (const l of lead) { const s = l > H ? 1 : l < -H ? -1 : 0; if (s && sign && s !== sign) changes++; if (s) sign = s; if (l < -H) behind[1] = Math.max(behind[1], -l); if (l > H) behind[2] = Math.max(behind[2], l); }
  // decisive moments: the lead swings by 25+ points inside a minute (an island and its garrison, a carrier hurt);
  // one swing counts once
  for (let i = k; i < lead.length; i++) if (Math.abs(lead[i] - lead[i - k]) > 25) { decisive++; i += k; }
  // snowball: the share of the war after which the eventual winner was ahead every sample from then on
  // (0: ahead from the first minute and never caught; 1: only got ahead at the very end)
  let snow = 1;
  if (winner) { const w = winner === 1 ? 1 : -1; let j = lead.length; while (j > 0 && lead[j - 1] * w > 0) j--; snow = j / lead.length; }
  const comeback = winner ? behind[winner] > 20 : false;
  // dead minutes: no losses, no captures, no buildings down, under 20 rounds fired
  const M = minutes.map(m => Array.isArray(m) ? m : [m.shots, m.lost, m.caps, m.kills]), quiet = m => m[1] === 0 && m[2] === 0 && m[3] === 0 && m[0] < 20;
  let run = 0, longest = 0; for (const m of M) { if (quiet(m)) { run++; longest = Math.max(longest, run); } else run = 0; }
  return { leadChanges: changes, comeback, maxDeficit: winner ? Math.round(behind[winner]) : 0, decisiveMoments: decisive, snowball: +snow.toFixed(3), deadMinutes: M.filter(quiet).length, longestLull: longest, minutesTotal: M.length };
}
