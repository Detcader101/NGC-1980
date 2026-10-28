// UNIT MARKERS (ngc/healthbars): the on-screen layer. One 2D canvas over the 3D view (under the HUD), drawn once a
// frame from a pre-rendered icon atlas: a NATO-style frame in the side's colour (TASK FORCE cyan rectangle, RUNAWAY
// orange diamond, neutral sand square) with the role glyph inside, and a health bar under it, green -> amber -> red,
// with a white flash and a fading "lost" segment when the unit is hit. No per-unit DOM.
//
//   const L = createMarkerLayer({ war, fog, sim, before: hudElement })
//   L.draw(cam, view)   after the frame is rendered. view: { hide, firstP, self, rangeK, draw, panelY }
//                       self: { x, y, z, hp, role, side } the player's own craft (outside views), or null
//   L.cycle() -> label  ALL UNITS -> DAMAGED ONLY -> OFF (remembered per browser; F8 / the pause menu)
//   L.mode, L.label(), L.set(mode), L.stats { units, drawn, groups, ms }
//   mapBar(ctx, x, y, w, hp) the same bar on the command map
//
// Readability rules: off-screen and behind-camera units are skipped; markers fade and shrink with distance and stop at
// a range per role (ships furthest, infantry nearest); overlapping markers of one side merge into one with a count
// ("x3", the bar is their mean); a marker that would sit on another side's is stacked above it; in first person the
// craft you sit in has no marker and the centre of the screen (the sight / HUD) and the instrument panel stay clear;
// enemy units only where the TASK FORCE can see them (fog of war, as the 3D view); destroyed units drop theirs.
import { collectUnits, ROLES } from './unitmarkers.js';

export const MARKER_MODES = ['all', 'damaged', 'off'];
const LABEL = { all: 'ALL UNITS', damaged: 'DAMAGED ONLY', off: 'OFF' };
export const SIDE_COL = ['#d8d2b8', '#4cf', '#f74'];   // neutral sand, TASK FORCE cyan, RUNAWAY orange (HUD / sim panels)
const RANGE = { inf: 520, vehicle: 700, armour: 820, aa: 760, struct: 760, heli: 1150, drone: 1000, air: 1500, ship: 2300 };
const CW = 26, CH = 22;   // atlas cell (css px): the frame is ~20 x 14 (friendly) / 18 x 18 (hostile diamond)

// green (full) -> amber (half) -> red (a quarter and under)
export function barColour(hp) {
  const g = [111, 210, 90], a = [242, 178, 51], r = [255, 70, 48];
  const mix = (p, q, t) => `rgb(${Math.round(p[0] + (q[0] - p[0]) * t)},${Math.round(p[1] + (q[1] - p[1]) * t)},${Math.round(p[2] + (q[2] - p[2]) * t)})`;
  return hp > 0.5 ? mix(a, g, Math.min(1, (hp - 0.5) / 0.35)) : mix(r, a, Math.max(0, (hp - 0.2) / 0.3));
}
const BAR_COL = Array.from({ length: 21 }, (_, i) => barColour(i / 20));
export function mapBar(c, x, y, w, hp) {
  c.fillStyle = 'rgba(0,0,0,.7)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 4);
  c.fillStyle = BAR_COL[Math.round(Math.max(0, Math.min(1, hp)) * 20)]; c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, hp)), 2);
}

// ------------------------------------------------------------------------------------------------ the icon atlas
function glyph(c, role, col) {   // the role glyph, centred on 0,0, about 12 x 9 css px
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  switch (role) {
    case 'inf': c.moveTo(-6, -4.5); c.lineTo(6, 4.5); c.moveTo(6, -4.5); c.lineTo(-6, 4.5); c.stroke(); break;   // NATO infantry: the cross
    case 'armour': c.roundRect ? c.roundRect(-6.5, -3.5, 13, 7, 3.5) : c.rect(-6.5, -3.5, 13, 7); c.stroke(); break;   // the track oval
    case 'vehicle': c.moveTo(-6, -1); c.lineTo(6, -1); c.stroke(); c.beginPath(); c.arc(-3.5, 2.6, 1.7, 0, 6.283); c.arc(3.5, 2.6, 1.7, 0, 6.283); c.fill(); break;   // wheeled
    case 'heli': c.moveTo(-7, -4); c.lineTo(7, 4); c.lineTo(7, -4); c.lineTo(-7, 4); c.closePath(); c.fill(); break;   // rotary wing: the bow tie
    case 'air': c.moveTo(0, -5); c.lineTo(0, 5); c.moveTo(-7, 0); c.lineTo(7, 0); c.moveTo(-3, 4.5); c.lineTo(3, 4.5); c.stroke(); break;   // fixed wing
    case 'drone': c.moveTo(-7, 3.5); c.lineTo(0, -3.5); c.lineTo(7, 3.5); c.lineTo(0, 0.5); c.closePath(); c.fill(); break;   // UAV chevron
    case 'ship': c.moveTo(-7, 0.5); c.lineTo(7, 0.5); c.lineTo(4.5, 4.5); c.lineTo(-4.5, 4.5); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 0.5); c.lineTo(0, -5); c.moveTo(-2.5, -2.5); c.lineTo(2.5, -2.5); c.stroke(); break;   // hull + mast
    case 'aa': c.arc(0, 4.5, 6, Math.PI, 0); c.stroke(); c.beginPath(); c.moveTo(0, 4.5); c.lineTo(4, -2); c.stroke(); break;   // air defence dome + barrel
    default: c.rect(-4.5, -2, 9, 6.5); c.fill(); c.beginPath(); c.moveTo(-6.5, -4); c.lineTo(6.5, -4); c.stroke(); break;   // installation: block under a roof bar
  }
}
function frame(c, side, col, fill) {
  c.beginPath();
  if (side === 2) { c.moveTo(0, -10); c.lineTo(11, 0); c.lineTo(0, 10); c.lineTo(-11, 0); c.closePath(); }   // hostile: diamond
  else if (side === 1) c.rect(-10.5, -7.5, 21, 15);   // friend: rectangle
  else c.rect(-8.5, -8.5, 17, 17);   // neutral: square
  c.fillStyle = fill; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#000'; c.globalAlpha = 0.55; c.lineWidth = 3.2; c.stroke(); c.globalAlpha = 1; c.lineWidth = 1.6; c.strokeStyle = col; c.stroke();
}
function buildAtlas(scale) {
  const cv = document.createElement('canvas'); cv.width = CW * ROLES.length * scale; cv.height = CH * 6 * scale;
  const c = cv.getContext('2d');
  for (let s = 0; s < 3; s++) for (let f = 0; f < 2; f++) ROLES.forEach((role, i) => {
    c.save(); c.scale(scale, scale); c.translate(i * CW + CW / 2, (s * 2 + f) * CH + CH / 2);
    const col = SIDE_COL[s];
    if (f) { frame(c, s, '#fff', 'rgba(255,255,255,.92)'); glyph(c, role, '#101410'); }   // the hit flash
    else { frame(c, s, col, 'rgba(4,12,14,.62)'); glyph(c, role, col); }
    c.restore();
  });
  return cv;
}

// ------------------------------------------------------------------------------------------------ the layer
/**
 * @param {{ war?: import('../war.js').War, fog?: any, sim?: boolean, before?: Element | null, query?: string | null,
 *   keepOut?: string | null }} [opts]
 */
export function createMarkerLayer({ war, fog, sim = false, before = null, query = null, keepOut = null } = {}) {
  const key = sim ? 'tz_markers_sim' : 'tz_markers';
  let mode = sim ? 'all' : 'damaged';
  try { const v = localStorage.getItem(key); if (MARKER_MODES.includes(v)) mode = v; } catch (e) {}
  if (query && MARKER_MODES.includes(query)) mode = query;   // ?markers=all|damaged|off (tests)
  const cv = document.createElement('canvas'); cv.id = 'umk';
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none';
  if (before && before.parentNode) before.parentNode.insertBefore(cv, before); else document.body.appendChild(cv);
  const c = cv.getContext('2d');
  let atlas = null, atlasScale = 0, dirty = true, last = performance.now();
  // the HUD read-outs (score block, feed, radar, the sim panels): a marker under one is drawn faint. Their boxes are read
  // twice a second (reading them every frame would force a layout after the HUD text changed)
  const keep = new Float32Array(64); let nKeep = 0, keepT = 0;
  function readKeep(now) {
    if (now - keepT < 500 || !keepOut) return; keepT = now; nKeep = 0;
    for (const el of document.querySelectorAll(keepOut)) { if (nKeep >= 64) break; const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2 || b.width * b.height > innerWidth * innerHeight * 0.25) continue; keep[nKeep++] = b.left - 4; keep[nKeep++] = b.top - 4; keep[nKeep++] = b.right + 4; keep[nKeep++] = b.bottom + 4; }
  }
  const L = { stats: { units: 0, drawn: 0, groups: 0, ms: 0 }, canvas: cv };
  // the 3D view's name tags (main.js updateTags: islands, ships) this frame: a marker under one is drawn faint
  const av = new Float32Array(256); let nAv = 0;
  L.avoid = (x, y) => { if (x === null) { nAv = 0; return; } if (nAv < 256) { av[nAv++] = x; av[nAv++] = y; } };
  Object.defineProperty(L, 'mode', { get: () => mode });
  L.label = () => LABEL[mode];
  L.set = m => { if (!MARKER_MODES.includes(m)) return; mode = m; try { localStorage.setItem(key, m); } catch (e) {} };
  L.cycle = () => { L.set(MARKER_MODES[(MARKER_MODES.indexOf(mode) + 1) % MARKER_MODES.length]); return LABEL[mode]; };


  const ents = [], st = new WeakMap();   // per unit / squad: { hp, flash, ghost }
  const N = 1024, sx = new Float32Array(N), sy = new Float32Array(N), sd = new Float32Array(N), sa = new Float32Array(N), ss = new Float32Array(N);
  const cand = new Array(N), cst = new Array(N), perm = [], byDist = (a, b) => sd[a] - sd[b];
  // placed markers (after merging): position, alpha, size, side, role, merged count, hp sum, flash, ghost sum
  const P = Array.from({ length: N }, () => ({ x: 0, y: 0, a: 1, s: 1, side: 0, role: 0, cnt: 1, hp: 0, flash: 0, ghost: 0 }));
  const GS = 40, head = new Int32Array(8192), next = new Int32Array(N);
  const opts = { visible: (x, z) => !fog || fog.visibleAt(x, z) };
  const ROLE_I = Object.fromEntries(ROLES.map((r, i) => [r, i]));
  const selfE = { key: null, unit: null, x: 0, y: 0, z: 0, hp: 1, role: 'heli', side: 1, n: 1, r: 3 };

  function clear() { if (dirty) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); dirty = false; } }

  L.draw = (cam, view = {}) => {
    const t0 = performance.now(), dt = Math.min(0.25, (t0 - last) / 1000); last = t0;
    const S = L.stats; S.units = S.drawn = S.groups = 0;
    if (mode === 'off' || view.hide) { clear(); S.ms = performance.now() - t0; return; }
    // size the canvas to the window (device pixels, at most 2x)
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight, bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    else { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, bw, bh); }
    const scale = dpr * Math.max(1, Math.min(1.6, H / 620));   // markers grow a little on big screens
    if (atlasScale !== scale) { atlasScale = scale; atlas = buildAtlas(scale); }
    dirty = true; readKeep(t0);
    // the units (+ the player's own craft in the outside views)
    const n = collectUnits(war, ents, opts);
    S.units = n + (view.self ? 1 : 0);
    // project, cull, fade
    const m = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements, rk = view.rangeK || 1, far = view.draw || 1e9;   // the scene fog: thick by view.draw (250 m round the islands, 1100+ m in a jet)
    const cx = W / 2, cy = H / 2, guard = view.firstP ? Math.min(W, H) * 0.075 : 0, panel = view.panelY ? H * view.panelY : 1e9;
    const MW = 22 * scale / dpr, MH = 25 * scale / dpr;   // a marker's footprint (css px): icon + bar
    let k = 0;
    for (let i = 0; i <= n && k < N; i++) {
      let e = ents[i];
      if (i === n) { if (!view.self) break; Object.assign(selfE, view.self); selfE.key = selfE.unit = view.self.key || selfE; e = selfE; }
      // health memory: a drop flashes the marker and leaves a fading white "lost" segment on the bar
      let h = st.get(e.key); if (!h) { h = { hp: e.hp, flash: 0, ghost: e.hp }; st.set(e.key, h); }
      if (e.hp < h.hp - 0.004) { h.flash = 0.55; h.ghost = Math.max(h.ghost, h.hp); }
      h.hp = e.hp; h.flash = Math.max(0, h.flash - dt); h.ghost = h.flash > 0 ? h.ghost : Math.max(e.hp, h.ghost - dt * 0.9);
      if (mode === 'damaged' && e.hp > 0.985 && h.flash <= 0 && h.ghost <= e.hp + 0.01) continue;
      const vx = m[0] * e.x + m[4] * e.y + m[8] * e.z + m[12], vy = m[1] * e.x + m[5] * e.y + m[9] * e.z + m[13], vz = m[2] * e.x + m[6] * e.y + m[10] * e.z + m[14];
      if (vz > -1) continue;   // behind the camera (or in it)
      const d = Math.sqrt(vx * vx + vy * vy + vz * vz), maxD = Math.min((RANGE[e.role] || 800) * rk, far * 1.8);
      if (d > maxD) continue;
      if (view.firstP && d < Math.max(12, (e.r || 3) * 2.2)) continue;   // the craft you sit in
      const w = -vz, own = e === selfE, X = cx + (p[0] * vx + p[8] * vz) / w * cx + (own ? Math.min(W * 0.2, Math.max(18, e.r * p[0] * cx / w)) + MW * 0.6 : 0), Y = cy - (p[5] * vy + p[9] * vz) / w * cy + (own ? MH * 0.5 : 0);   // (your own craft: the marker sits beside it, clear of what you look at)
      if (X < -30 || X > W + 30 || Y < -30 || Y > H + 40) continue;
      let a = Math.max(0.3, Math.min(1, 1.3 - d / maxD)) * (d < far * 0.7 ? 1 : Math.max(0.35, 1 - (d - far * 0.7) / (far * 1.1)));   // faint where the fog hides the unit itself
      if (guard) { const r = Math.hypot(X - cx, Y - cy); if (r < guard) continue; if (r < guard * 1.8) a *= (r - guard) / (guard * 0.8); }
      if (Y > panel) continue;   // under the cockpit's instrument panel line
      for (let r = 0; r < nKeep; r += 4) if (X > keep[r] && X < keep[r + 2] && Y - MH * 0.5 > keep[r + 1] && Y - MH * 0.5 < keep[r + 3]) { a *= 0.3; break; }   // under a HUD read-out: faint, the text stays readable
      for (let r = 0; r < nAv; r += 2) if (Math.abs(X - av[r]) < 95 && Y - MH * 0.5 > av[r + 1] - 2 && Y - MH < av[r + 1] + 34) { a *= 0.35; break; }   // under an island / ship name tag
      sx[k] = X; sy[k] = Y; sd[k] = d; sa[k] = a; ss[k] = d < 120 ? 1 : Math.max(0.78, 1 - (d - 120) / maxD * 0.35); cand[k] = e; cst[k] = h; k++;
    }
    // nearest first: they win the place; further ones of the same side merge into them, other sides' stack above
    perm.length = k; for (let j = 0; j < k; j++) perm[j] = j;
    perm.sort(byDist);
    const gw = Math.ceil(W / GS) + 1, gh = Math.ceil(H / GS) + 1, cells = Math.min(head.length, gw * gh); head.fill(-1, 0, cells);
    let np = 0;
    const hit = (x, y, side, same) => {   // the placed marker this one would overlap (of this side, or of another)
      const gx = Math.floor(x / GS), gy = Math.floor(y / GS);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const qx = gx + ox, qy = gy + oy; if (qx < 0 || qy < 0 || qx >= gw || qy >= gh || qy * gw + qx >= cells) continue;
        for (let q = head[qy * gw + qx]; q >= 0; q = next[q]) { const Q = P[q]; if (Math.abs(Q.x - x) < MW && Math.abs(Q.y - y) < MH * 0.9 && (same ? Q.side === side : Q.side !== side)) return q; }
      }
      return -1;
    };
    for (let t = 0; t < k; t++) {
      const j = perm[t], e = cand[j], h = cst[j], x = sx[j]; let y = sy[j];
      const q = hit(x, y, e.side, true);
      if (q >= 0) { const Q = P[q]; Q.cnt++; Q.hp += e.hp; Q.ghost += Math.max(h.ghost, e.hp); Q.flash = Math.max(Q.flash, h.flash); S.groups++; continue; }   // merge: one marker, a count, the mean bar
      let o = hit(x, y, e.side, false), tries = 0;
      while (o >= 0 && tries < 2) { y = P[o].y - MH; o = hit(x, y, e.side, false); tries++; }   // stack above the other side's
      if (o >= 0 || np >= N) continue;
      const Q = P[np]; Q.x = x; Q.y = y; Q.a = sa[j]; Q.s = ss[j]; Q.side = e.side; Q.role = ROLE_I[e.role] ?? 4; Q.hp = e.hp; Q.flash = h.flash; Q.ghost = Math.max(h.ghost, e.hp); Q.cnt = 1;
      const ci = Math.max(0, Math.min(gh - 1, Math.floor(y / GS))) * gw + Math.max(0, Math.min(gw - 1, Math.floor(x / GS)));
      if (ci < cells) { next[np] = head[ci]; head[ci] = np; }
      np++;
    }
    // draw (far first, so the near ones are on top)
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.imageSmoothingEnabled = true;
    c.font = `bold ${Math.round(10 * scale / dpr)}px Consolas, "Courier New", monospace`; c.textBaseline = 'middle'; c.textAlign = 'left';
    const cw = CW * scale, ch = CH * scale, iw = CW * scale / dpr, ih = CH * scale / dpr;
    for (let q = np - 1; q >= 0; q--) {
      const Q = P[q], s = Q.s, hp = Math.min(1, Q.hp / Q.cnt), gh2 = Math.min(1, Q.ghost / Q.cnt);
      c.globalAlpha = Q.a;
      const w = iw * s, hh = ih * s, x0 = Q.x - w / 2, y0 = Q.y - hh - 6 * s;
      const flash = Q.flash > 0 && (Q.flash * 14 | 0) % 2 === 0;
      c.drawImage(atlas, Q.role * cw, (Q.side * 2 + (flash ? 1 : 0)) * ch, cw, ch, x0, y0, w, hh);
      // the bar: dark backing, the lost segment (white, fading), the health
      const bw = 20 * s * scale / dpr, bh = Math.max(2, 3 * s * scale / dpr), bx = Q.x - bw / 2, by = y0 + hh + 0.5;
      c.fillStyle = 'rgba(0,0,0,.72)'; c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      if (gh2 > hp + 0.005) { c.fillStyle = `rgba(255,255,255,${Math.min(1, 0.35 + Q.flash * 1.2).toFixed(2)})`; c.fillRect(bx + bw * hp, by, bw * (gh2 - hp), bh); }
      c.fillStyle = BAR_COL[Math.round(hp * 20)]; c.fillRect(bx, by, bw * hp, bh);
      if (Q.cnt > 1) { c.fillStyle = '#000'; c.fillText(`×${Q.cnt}`, x0 + w - 1 + 1, y0 + hh * 0.3 + 1); c.fillStyle = SIDE_COL[Q.side]; c.fillText(`×${Q.cnt}`, x0 + w - 1, y0 + hh * 0.3); }
      S.drawn++;
    }
    c.globalAlpha = 1;
    S.ms = performance.now() - t0;
  };
  return L;
}
