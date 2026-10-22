// Procedural Thrust caves. One cave per base, deterministic from its seed (the base name), so every new game and every
// reload flies the same caves.
//
// y is up. Cell (ix,iy) covers [ix,ix+1]x[iy,iy+1]. The top row (y = H-1) is the surface; the entrance shaft always
// runs up through x 29..35, centred on x 32.5 (main.js CAVE_OX), so the shaft mouth sits under the surface hole.
//
// Recipe: a straight drop shaft (16-21 cells) onto a flat ledge in the entry chamber -> 3+tier chambers placed at random
// -> a tree of tunnels from the entry chamber (higher tiers chain more, so routes get longer; easy tiers may get a
// shortcut loop), each a midpoint-displaced polyline (twistier with tier) swept with a disk -> a flat floor slab in every
// chamber -> boundary noise + cellular-automata smoothing, keeping a guaranteed core open and the slabs solid -> fill
// stray air pockets -> navMap floods a 6-cell disk from the shaft mouth; the pod goes in the furthest chamber it reaches,
// the pad in the deepest of the rest, tanks in the next two; too few reachable chambers -> retry with the next seed ->
// tier+1 turrets on rock faces that look out over open air, away from the drop.
// The home cave is simple and friendly: the shaft drops straight onto the pad in one wide hall, reservoir beside it.
export const LEVEL_W = 64, LEVEL_H = 56;
export const SHAFT_X0 = 29, SHAFT_X1 = 35;   // entrance shaft columns at the surface
export const NAV_R = 3;                        // a disk of this radius (6 cells across) must fit along every route

export const WHY = {};   // why generation attempts were rejected (counts), for tools/cavebench.mjs
const why = k => { WHY[k] = (WHY[k] || 0) + 1; return null; };
export const levelHeight = (tier, home) => home ? 44 : 52 + 4 * Math.max(1, tier);

const mulberry = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const seedOf = v => { if (typeof v === 'number') return v >>> 0; let h = 2166136261; for (const c of String(v)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// buildLevel(tier, seed, { home }) -> { W, H, solid, pad, padTop, start, orb, tanks, turrets, seed, attempts, chambers }
// seed: a number or a string (a base name). The home cave is small and friendly (one chamber, the pad under the shaft).
export function buildLevel(tier = 1, seed = 0, { home = false } = {}) {
  const s0 = seedOf(seed);
  let L = null;
  for (let a = 0; a < 60; a++) {
    L = (home ? genHome : genCave)(tier, mulberry(s0 + a * 7919), (s0 + a * 7919) >>> 0);
    if (L) { L.attempts = a + 1; return L; }
  }
  throw new Error('cave generation failed for seed ' + seed);
}

// ---------------------------------------------------------------- grid helpers
function grid(W, H) {
  const solid = new Uint8Array(W * H).fill(1), core = new Uint8Array(W * H), fixed = new Uint8Array(W * H);
  const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  // sweep a disk of radius r along a polyline: open everything inside, mark the inner rc as guaranteed-open core
  const sweep = (pts, r, rc) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4));
      for (let k = 0; k <= n; k++) disk(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, r, rc);
    }
  };
  const disk = (cx, cy, r, rc) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!inb(x, y)) continue;
      const d2 = (x + .5 - cx) ** 2 + (y + .5 - cy) ** 2;
      if (d2 <= r * r) solid[y * W + x] = 0;
      if (d2 <= rc * rc) core[y * W + x] = 1;
    }
  };
  const rect = (x0, y0, x1, y1, v, mark) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) { solid[y * W + x] = v; if (mark) mark[y * W + x] = 1; }
  };
  return { solid, core, fixed, inb, sweep, disk, rect };
}

// a lumpy ellipse; the inner 70% is core
function blob(g, W, H, c, rng) {
  const ph = rng() * 6.28, k = 2 + Math.floor(rng() * 3), amp = 0.1 + rng() * 0.12;
  for (let y = Math.floor(c.y - c.ry - 2); y <= c.y + c.ry + 2; y++) for (let x = Math.floor(c.x - c.rx - 2); x <= c.x + c.rx + 2; x++) {
    if (!g.inb(x, y)) continue;
    const dx = (x + .5 - c.x) / c.rx, dy = (y + .5 - c.y) / c.ry, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const rr = 1 + amp * Math.sin(k * a + ph);
    if (d <= rr) g.solid[y * W + x] = 0;
    if (d <= 0.7) g.core[y * W + x] = 1;
  }
}

// noise on the rock/air boundary, then CA smoothing; core cells stay open and fixed cells stay rock throughout
function roughen(g, W, H, rng, iters, flip) {
  const { solid, core, fixed } = g, keep = () => { for (let i = 0; i < W * H; i++) { if (core[i]) solid[i] = 0; if (fixed[i]) solid[i] = 1; } };
  const nearEdge = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = solid[y * W + x];
    for (let dy = -2; dy <= 2 && !nearEdge[y * W + x]; dy++) for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && X < W && Y >= 0 && Y < H && solid[Y * W + X] !== v) { nearEdge[y * W + x] = 1; break; }
    }
  }
  for (let i = 0; i < W * H; i++) if (nearEdge[i] && rng() < flip) solid[i] ^= 1;
  keep();
  const nxt = new Uint8Array(W * H);
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const X = x + dx, Y = y + dy;
        n += X < 0 || X >= W || Y < 0 ? 1 : Y >= H ? 0 : solid[Y * W + X];
      }
      const i = y * W + x;
      nxt[i] = n >= 5 ? 1 : n <= 2 ? 0 : solid[i];
    }
    solid.set(nxt); keep();
  }
}

// fill air pockets that are not connected to the entrance shaft
function fillPockets(solid, W, H) {
  const seen = new Uint8Array(W * H), st = [];
  for (let x = SHAFT_X0; x <= SHAFT_X1; x++) if (!solid[(H - 1) * W + x]) { seen[(H - 1) * W + x] = 1; st.push((H - 1) * W + x); }
  while (st.length) {
    const i = st.pop(), x = i % W, y = (i / W) | 0;
    for (const [X, Y] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
      const j = Y * W + X; if (!solid[j] && !seen[j]) { seen[j] = 1; st.push(j); }
    }
  }
  for (let i = 0; i < W * H; i++) if (!solid[i] && !seen[i]) solid[i] = 1;
}

// Where can the helicopter go? A point fits when every cell whose centre lies within NAV_R of it is air (above the top
// row only the shaft is air). Flood the fitting grid vertices from the shaft mouth: 8-connected, a diagonal step also
// needs the disk to fit at its midpoint.
export function navMap(L) {
  const { W, H, solid } = L, VW = W + 1, VH = H + 4, nav = new Uint8Array(VW * VH), dist = new Int32Array(VW * VH).fill(-1);
  const R = NAV_R, ri = Math.ceil(R) + 1;
  const fits = (px, py) => {
    for (let y = Math.floor(py - ri); y <= py + ri; y++) for (let x = Math.floor(px - ri); x <= px + ri; x++) {
      if ((x + .5 - px) ** 2 + (y + .5 - py) ** 2 >= R * R) continue;
      if (y >= H) { if (x < SHAFT_X0 || x > SHAFT_X1) return 0; continue; }
      if (x < 0 || x >= W || y < 0 || solid[y * W + x]) return 0;
    }
    return 1;
  };
  for (let vy = 0; vy < VH; vy++) for (let vx = 0; vx < VW; vx++) nav[vy * VW + vx] = fits(vx, vy);
  const q = [], s = (H + 2) * VW + 32;
  if (nav[s]) { dist[s] = 0; q.push(s); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % VW, y = (i / VW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if ((!dx && !dy) || X < 0 || X >= VW || Y < 0 || Y >= VH) continue;
      const j = Y * VW + X;
      if (nav[j] && dist[j] < 0 && (!dx || !dy || fits(x + dx / 2, y + dy / 2))) { dist[j] = dist[i] + 1; q.push(j); }
    }
  }
  // reach(x, floorY): route length to hover over a spot on a floor (disk centre 3..4.5 cells above it, within 2.5 sideways)
  const reach = (px, fy) => {
    let best = -1;
    for (let vy = Math.ceil(fy + 3); vy <= fy + 4.5; vy++) for (let vx = Math.ceil(px - 2.5); vx <= px + 2.5; vx++) {
      if (vx < 0 || vx >= VW || vy < 0 || vy >= VH) continue;
      const d = dist[vy * VW + vx]; if (d >= 0 && (best < 0 || d < best)) best = d;
    }
    return best;
  };
  return { VW, VH, nav, dist, reach };
}

// ---------------------------------------------------------------- content placement
// a flat floor for a chamber: rock slab below row f, guaranteed air f..f+6 over the given half-width
function floorFor(g, W, c, hw) {
  const f = Math.round(c.y - c.ry) + 2, cx = Math.floor(c.x);
  // the middle of the slab is always rock (the pad and the tanks sit there); its ends give way to a tunnel's core
  for (let y = f - 3; y <= f - 1; y++) for (let x = cx - hw - 1; x <= cx + hw + 1; x++) {
    const i = y * W + x;
    if (g.inb(x, y) && (Math.abs(x - cx) <= 3 || !g.core[i])) { g.solid[i] = 1; g.fixed[i] = 1; g.core[i] = 0; }
  }
  g.rect(cx - hw, f, cx + hw, f + 6, 0, g.core);
  return { f, cx };
}

function placeTurrets(L, n, rng, avoid, prefer) {
  const { W, H, solid } = L, S = (x, y) => x < 0 || x >= W || y < 0 || (y < H && solid[y * W + x]);
  const cand = [];
  for (let y = 1; y < H - 1; y++) for (let x = 2; x < W - 2; x++) {
    if (S(x, y)) continue;
    for (const dir of [1, -1]) {   // 1: sits on a floor (rock below), -1: hangs from a ceiling (rock above)
      if (!S(x, y - dir) || !S(x - 1, y - dir) || !S(x + 1, y - dir)) continue;   // a flat seat three cells wide
      if (S(x - 1, y) || S(x + 1, y) || S(x, y + dir) || S(x, y + 2 * dir) || S(x, y + 3 * dir)) continue;   // looks out over air
      const t = { x: x + .5, y: dir > 0 ? y + 0.4 : y + 0.6, dir };
      if (avoid.some(a => a.shaft !== undefined ? t.y > a.shaft && Math.abs(t.x - 32.5) < 9 : Math.hypot(a.x - t.x, a.y - t.y) < a.r)) continue;
      t.score = rng() + (prefer.some(p => Math.hypot(p.x - t.x, p.y - t.y) < p.r) ? 1 : 0);
      cand.push(t);
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const out = [];
  for (const gap of [8, 5, 3, 0]) {
    for (const t of cand) if (out.length < n && !out.includes(t) && out.every(o => Math.hypot(o.x - t.x, o.y - t.y) >= gap)) out.push(t);
    if (out.length >= n) break;
  }
  return out.map(({ x, y }) => ({ x, y }));
}

// ---------------------------------------------------------------- enemy fortress caves
function genCave(tier, rng, seed) {
  const W = LEVEL_W, H = levelHeight(tier), g = grid(W, H), { solid } = g;
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1)), rf = (a, b) => a + rng() * (b - a);
  // entrance: a long straight drop from the surface into the entry chamber, which has a flat landing ledge under the
  // shaft (so a ship that drops in with the funnel always has clear air below it and somewhere flat to set down)
  const shaftLen = ri(16, 21), sb = H - shaftLen;
  g.rect(SHAFT_X0, sb, SHAFT_X1, H - 1, 0, g.core);
  const ery = rf(4.5, 5.5), entry = { x: 32.5, y: sb - ery + 2, rx: rf(6.5, 8.5), ry: ery, entry: true };
  entry.f = Math.round(entry.y - entry.ry) + 2;
  const ch = [entry];
  // chambers: more of them, so further to fly, on higher tiers. Each gets a flat floor slab (row f) with headroom.
  const want = 3 + tier;
  for (let tries = 0; ch.length < want + 1 && tries < 800; tries++) {
    const rx = rf(5.5, 8.5), ry = rf(4.5, 6);
    const c = { x: Math.floor(rf(3 + rx, W - 4 - rx)) + .5, y: rf(4 + ry, H - 8 - ry), rx, ry };
    if (c.y > entry.y && Math.abs(c.x - 32.5) < rx + 7) continue;   // keep the drop shaft a shaft
    if (ch.some(o => Math.hypot((o.x - c.x) / (o.rx + c.rx + 3), (o.y - c.y) / (o.ry + c.ry + 3)) < 1)) continue;
    c.f = Math.round(c.y - c.ry) + 2;
    ch.push(c);
  }
  if (ch.length < want + 1) return why('place');
  // tunnel tree: low tiers join each chamber to its nearest linked neighbour (bushy, short routes); high tiers mostly
  // extend the chamber added last (long winding chains)
  const edges = [], linked = [0], left = ch.slice(1).map((_, i) => i + 1), chain = 0.15 + 0.2 * tier;
  const d = (a, b) => Math.hypot(ch[a].x - ch[b].x, ch[a].y - ch[b].y);
  while (left.length) {
    let best = null;
    const from = rng() < chain ? [linked[linked.length - 1]] : linked;
    for (const a of from) for (const b of left) if (!best || d(a, b) < best[2]) best = [a, b, d(a, b)];
    edges.push(best); linked.push(best[1]); left.splice(left.indexOf(best[1]), 1);
  }
  if (tier <= 2 && rng() < 0.6) {   // one shortcut loop on the easier caves
    const a = ri(1, ch.length - 1); let b = null;
    for (let k = 1; k < ch.length; k++) if (k !== a && !edges.some(e => (e[0] === a && e[1] === k) || (e[0] === k && e[1] === a)) && (b === null || d(a, k) < d(a, b))) b = k;
    if (b !== null && d(a, b) < 32) edges.push([a, b, d(a, b)]);
  }
  // where a tunnel joins a chamber: above the floor, or off to one side when it comes up from below (so it never
  // has to cut through the floor slab)
  const port = (c, o) => {
    const dx = o.x - c.x, dy = o.y - c.y;
    if (dy < -2) {
      let s = dx < 0 ? -1 : 1; if (c.x + s * 8 < 5.5 || c.x + s * 8 > W - 5.5) s = -s;
      return [[c.x, c.f + 3.5], [c.x + s * 8, c.f + 3]];
    }
    return [[c.x, c.f + 3.5]];
  };
  // carve: chambers, then the tunnels (twistier and a bit tighter on higher tiers)
  for (const c of ch) blob(g, W, H, c, rng);
  const twist = 0.2 + 0.07 * tier;
  for (const [a, b] of edges) {
    const pa = port(ch[a], ch[b]), pb = port(ch[b], ch[a]).reverse();
    let pts = [pa[pa.length - 1], pb[0]];
    for (let lv = 0; lv < 3; lv++) {
      const np = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1, o = (rng() * 2 - 1) * l * twist;
        np.push([Math.min(W - 5.5, Math.max(5.5, (ax + bx) / 2 - (by - ay) / l * o)), Math.min(H - 8, Math.max(5, (ay + by) / 2 + (bx - ax) / l * o))], pts[i + 1]);
      }
      pts = np;
    }
    pts = [...pa.slice(0, -1), ...pts, ...pb.slice(1)];
    g.sweep(pts, rf(3.7, 4.5) - 0.1 * tier, 3.5);
  }
  for (const c of ch) floorFor(g, W, c, c.entry ? 5 : 4);
  // the crust: rock under the surface except the shaft, rock at the sides and the bottom
  g.rect(0, H - 4, SHAFT_X0 - 1, H - 1, 1, g.fixed); g.rect(SHAFT_X1 + 1, H - 4, W - 1, H - 1, 1, g.fixed);
  g.rect(0, 0, W - 1, 0, 1, g.fixed); g.rect(0, 0, 0, H - 1, 1, g.fixed); g.rect(W - 1, 0, W - 1, H - 1, 1, g.fixed);
  roughen(g, W, H, rng, 4, 0.42);
  fillPockets(solid, W, H);
  // roles from the real flying distance: the pod in the furthest chamber, the pad in the deepest of the rest, tanks
  // in the two furthest of what is left
  const pre = { W, H, solid };
  const nm = navMap(pre);
  for (const c of ch) c.reach = c.entry ? 0 : nm.reach(c.x, c.f);
  const ok = ch.map((_, i) => i).filter(i => i && ch[i].reach >= 0);
  if (ok.length < 4) return why('reach');
  const pod = ok.reduce((a, b) => ch[b].reach > ch[a].reach ? b : a);
  const rest = ok.filter(i => i !== pod);
  const padC = rest.reduce((a, b) => ch[b].f < ch[a].f ? b : a);
  const tankPick = rest.filter(i => i !== padC).sort((a, b) => ch[b].reach - ch[a].reach).slice(0, 2);
  const P = ch[padC], Q = ch[pod], cx = c => Math.floor(c.x);
  const pad = new Uint8Array(W * H);
  for (let x = cx(P) - 3; x <= cx(P) + 3; x++) pad[(P.f - 1) * W + x] = 1;
  const L = {
    W, H, solid, pad, padTop: P.f, seed, tier,
    start: { x: cx(P) + .5, y: P.f + .7 },
    orb: { x: cx(Q) + .5, y: Q.f + .9 },
    tanks: tankPick.map(i => ({ x: cx(ch[i]) + .5 + ri(-1, 1), y: ch[i].f + .8, fuel: 60 })),
    turrets: [],
    route: Q.reach,
    chambers: ch.map((c, i) => ({ x: c.x, y: c.y, f: c.f, reach: c.reach, role: i === 0 ? 'entry' : i === pod ? 'pod' : i === padC ? 'pad' : tankPick.includes(i) ? 'tank' : '' })),
  };
  // turrets: on rock faces over open air, away from the shaft (and, on light bases, the pad chamber), favouring the
  // pod chamber and the tank chambers
  const avoid = [{ x: entry.x, y: entry.f + 3, r: tier <= 2 ? 13 : 10 }, { x: L.start.x, y: P.f, r: tier <= 2 ? 10 : 5 },
    { x: L.orb.x, y: L.orb.y, r: 3.5 }, ...L.tanks.map(t => ({ x: t.x, y: t.y, r: 3 })), { shaft: entry.f }];
  const prefer = [{ x: Q.x, y: Q.y, r: 16 }, ...tankPick.map(i => ({ x: ch[i].x, y: ch[i].y, r: 12 }))];
  L.turrets = placeTurrets(L, tier + 1, rng, avoid, prefer);
  if (L.turrets.length < tier + 1) return why('turrets');
  return L;
}

// ---------------------------------------------------------------- the home cave: shaft straight down onto the pad
function genHome(tier, rng, seed) {
  const W = LEVEL_W, H = levelHeight(0, true), g = grid(W, H), { solid } = g;
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1)), rf = (a, b) => a + rng() * (b - a);
  const side = rng() < 0.5 ? -1 : 1;
  const hall = { x: 32.5 + side * ri(0, 2), y: rf(13, 15), rx: rf(17, 19), ry: rf(7, 8.5) };
  g.rect(SHAFT_X0, Math.floor(hall.y), SHAFT_X1, H - 1, 0, g.core);
  blob(g, W, H, hall, rng);
  // a side gallery, for looks
  const gx = 32 + side * ri(14, 18);
  g.sweep([[32 + side * 10, hall.y + 3], [gx, hall.y + 8 + rf(0, 4)]], rf(3.5, 4), 3);
  const f = 6;   // one flat floor across the hall: pad under the shaft, reservoir and a spare tank either side
  g.rect(14, f - 3, 50, f - 1, 1, g.fixed); g.rect(15, f, 49, f + 7, 0, g.core);
  g.rect(0, H - 4, SHAFT_X0 - 1, H - 1, 1, g.fixed); g.rect(SHAFT_X1 + 1, H - 4, W - 1, H - 1, 1, g.fixed);
  g.rect(0, 0, W - 1, 0, 1, g.fixed); g.rect(0, 0, 0, H - 1, 1, g.fixed); g.rect(W - 1, 0, W - 1, H - 1, 1, g.fixed);
  roughen(g, W, H, rng, 4, 0.35);
  fillPockets(solid, W, H);
  const pad = new Uint8Array(W * H);
  for (let x = SHAFT_X0; x <= SHAFT_X1; x++) pad[(f - 1) * W + x] = 1;
  const rx = 32.5 + side * 11;
  const L = {
    W, H, solid, pad, padTop: f, seed, tier: 0,
    start: { x: 32.5, y: f + .7 },
    orb: { x: 32.5 - side * 12, y: f + .9 },
    tanks: [{ x: 32.5 - side * 11, y: f + .8, fuel: 60 }, { x: rx, y: f + .8, fuel: 60 }],   // tanks[1]: the reservoir
    turrets: [],
    chambers: [{ x: hall.x, y: hall.y, role: 'pad' }],
  };
  const nm = navMap(L);
  if (nm.reach(32.5, f) < 0 || nm.reach(rx, f) < 0) return null;
  L.route = nm.reach(32.5, f);
  return L;
}
