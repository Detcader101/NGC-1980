// NGC-1980 inventory: Tarkov-style grids for the 1980 Marine. Pure: no DOM, no THREE; runs in node.
//
// Model
// - An item INSTANCE is a plain object { uid, id, x, y, r, n?, ammo?, grids?, slots?, water?, uses?, dur?, unseen? }:
//   id = ITEMS key; x, y = cell in its grid; r = rotated 90 deg; n = stack count; ammo = LIFO round segments
//   [[roundId, count], ...] for magazines, belts and ammo boxes (last segment = top round = next to feed);
//   grids = one array of child instances per def grid; slots = { name: instance | null } (weapon magazine well,
//   M203 chamber, LC-2 keepers). Parents are kept in a non-enumerable `_p` = { c: container, g: gridIndex } or
//   { c: container, s: slotName }, so instances serialise with JSON.stringify and are rebuilt with relink().
// - The SOLDIER ROOT is an instance of the pseudo-item 'soldier' whose slots are the equipment slots (EQUIP).
//   A dead soldier's root is his lootable body.
// - Containers in containers nest freely (pouches on a belt, an IFAK in a pack) as long as the grid accepts them and
//   nothing is put inside itself. Item footprints are fixed (a full pack is as big as an empty one).
//
// Interface for INFANTRY (weapons) - magazines are items:
//   weaponMag(w) / magCount(m) / magPop(m) -> roundId | null / magPush(m, roundId, n)
//   bestMag(root, weapon) -> the fullest compatible magazine in the rig, reload(root, weapon) -> { from, to, old, mag }
//   countRounds(root, cal), loadMag(mag, source, n) -> { loaded, seconds }, unloadMag(mag) -> stacks
// Interface for FOUNDATION / soldier sim: totalWeight(root), encumbrance(kg, bodyKg), pandolfWatts(...), armour(root),
//   quick(root, k), autoStore(root, inst), prune(root), loadout(name), fillCrate(id, rng), searchStep(container, dt).
import { ITEMS, ROUNDS, hasTag } from './items.js';

ITEMS.soldier = { id: 'soldier', name: 'SOLDIER', cat: 'root', tags: [], w: 1, h: 1, kg: 0, stack: 1,
  slots: {
    primary:   { accept: ['long'], label: 'PRIMARY' },
    secondary: { accept: ['long', 'launcher'], label: 'SLUNG / BACK' },
    holster:   { accept: ['pistol'], label: 'HOLSTER' },
    helmet:    { accept: ['helmet'], label: 'HELMET' },
    vest:      { accept: ['vest'], label: 'BODY ARMOUR' },
    belt:      { accept: ['belt'], label: 'LC-2 BELT' },
    pack:      { accept: ['pack'], label: 'PACK' },
    pockets:   { accept: ['pockets'], label: 'POCKETS', fixed: true },
  } };
export const EQUIP_ORDER = ['helmet', 'vest', 'belt', 'pack', 'primary', 'secondary', 'holster', 'pockets'];

let UID = 1;
const def = it => ITEMS[it.id];
const P = new WeakMap();   // parent links (non-enumerable without defineProperty churn)
export const parentOf = it => P.get(it) || null;
const setP = (it, p) => { if (p) P.set(it, p); else P.delete(it); };

// ------------------------------------------------------------------------------------------------------- creation
export function newItem(id, o = {}) {
  const d = ITEMS[id]; if (!d) throw new Error('unknown item ' + id);
  const it = { uid: UID++, id, x: 0, y: 0, r: 0 };
  if (d.stack > 1) it.n = Math.min(d.stack, o.n ?? d.stack);
  if (d.grids) it.grids = d.grids.map(() => []);
  if (d.slots) it.slots = Object.fromEntries(Object.keys(d.slots).map(k => [k, null]));
  if (d.mag) it.ammo = [];
  if (d.box) it.ammo = [[d.box.round, o.n ?? d.box.n]];
  if (d.water) it.water = o.water ?? d.water;
  if (d.med?.uses > 1) it.uses = d.med.uses;
  if (d.armour) it.dur = d.armour.durMax;
  if (d.loaded) it.loaded = true;
  if (d.mag && o.fill) magPush(it, o.fill, o.rounds ?? d.mag.cap);
  return it;
}
export const newSoldier = () => { const s = newItem('soldier'); slotIn(s, 'pockets', newItem('pockets')); s.quick = Array(10).fill(null); return s; };

// --------------------------------------------------------------------------------------------------------- geometry
export const dims = it => { const d = def(it); return it.r ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; };
const gridDef = (c, g) => def(c).grids[g];
function accepts(spec, it) {
  const d = def(it);
  if (spec.deny && spec.deny.some(t => hasTag(d, t))) return false;
  return !spec.accept || !spec.accept.length || spec.accept.some(t => hasTag(d, t));
}
// is `a` inside `b` (or b itself)?
export function isWithin(a, b) { for (let p = a; p; p = parentOf(p)?.c) if (p === b) return true; return false; }
export function rootOf(it) { let p = it; while (parentOf(p)) p = parentOf(p).c; return p; }

// Why `it` cannot go at (x, y, r) in grid g of container c ('' = it can).
export function placeError(c, g, it, x, y, r = it.r) {
  const gd = gridDef(c, g); if (!gd) return 'NO GRID';
  const d = def(it);
  if (d.static) return 'TOO BIG';
  if (d.fixed) return 'FIXED';
  if (isWithin(c, it)) return 'INSIDE ITSELF';
  if (!accepts(gd, it)) return 'DOESN\'T FIT HERE';
  const w = r ? d.h : d.w, h = r ? d.w : d.h;
  if (x < 0 || y < 0 || x + w > gd.w || y + h > gd.h) return 'NO ROOM';
  for (const o of c.grids[g]) {
    if (o === it) continue;
    const od = dims(o);
    if (x < o.x + od.w && o.x < x + w && y < o.y + od.h && o.y < y + h) return 'NO ROOM';
  }
  return '';
}
export const canPlace = (c, g, it, x, y, r) => !placeError(c, g, it, x, y, r);
export function slotError(c, s, it) {
  const spec = def(c).slots?.[s]; if (!spec) return 'NO SLOT';
  if (c.slots[s] && c.slots[s] !== it) return 'OCCUPIED';
  if (isWithin(c, it)) return 'INSIDE ITSELF';
  if (spec.fixed && c.slots[s]) return 'FIXED';
  return accepts(spec, it) ? '' : 'WRONG ITEM';
}
// item under cell (x, y) of grid g
export const itemAt = (c, g, x, y) => c.grids[g].find(o => { const d = dims(o); return x >= o.x && x < o.x + d.w && y >= o.y && y < o.y + d.h; }) || null;

// -------------------------------------------------------------------------------------------------- moving things
export function detach(it) {
  const p = parentOf(it); if (!p) return it;
  if (p.s != null) p.c.slots[p.s] = null; else { const a = p.c.grids[p.g]; const i = a.indexOf(it); if (i >= 0) a.splice(i, 1); }
  setP(it, null); return it;
}
export function placeIn(c, g, it, x, y, r = it.r) {
  const e = placeError(c, g, it, x, y, r); if (e) return e;
  detach(it); it.x = x; it.y = y; it.r = r ? 1 : 0; c.grids[g].push(it); setP(it, { c, g }); return '';
}
export function slotIn(c, s, it) {
  const e = slotError(c, s, it); if (e) return e;
  detach(it); it.x = it.y = 0; it.r = 0; c.slots[s] = it; setP(it, { c, s }); return '';
}
// first free spot in container c (grids in order, row-major, unrotated then rotated)
export function findFree(c, it, { rotate = true, grids } = {}) {
  if (!c.grids) return null;
  for (const g of grids ?? c.grids.map((_, i) => i)) {
    const gd = gridDef(c, g); if (!accepts(gd, it)) continue;
    for (const r of rotate && def(it).w !== def(it).h ? [it.r, 1 - it.r] : [it.r])
      for (let y = 0; y < gd.h; y++) for (let x = 0; x < gd.w; x++) if (!placeError(c, g, it, x, y, r)) return { g, x, y, r };
  }
  return null;
}
// every container instance under root (depth first, equipment order), with a priority score for an item
export function containers(root) {
  const out = [];
  const walk = c => {
    if (c.grids) out.push(c);
    if (c.slots) for (const k of c.id === 'soldier' ? EQUIP_ORDER : Object.keys(c.slots)) { const s = c.slots[k]; if (s && (s.grids || s.slots) && !def(s).weapon) walk(s); }
    if (c.grids) for (const g of c.grids) for (const o of g) if (o.grids) walk(o);
  };
  walk(root); return out;
}
// Tarkov "quick move" (Ctrl-click / pick-up): merge into stacks first, then the best container for the kind of item.
export function autoStore(root, it, { exclude } = {}) {
  const d = def(it);
  if (d.stack > 1) for (const o of walk(root)) if (o !== it && o.id === it.id && (o.n ?? 1) < d.stack && !(exclude && isWithin(o, exclude))) { merge(it, o); if (!it.n) { detach(it); return { merged: o }; } }
  // equipment slots first for gear (an empty helmet slot takes a helmet)
  if (root.slots) for (const k of EQUIP_ORDER) if (!root.slots[k] && !slotError(root, k, it) && !(k === 'secondary' && !root.slots.primary && !slotError(root, 'primary', it))) { slotIn(root, k, it); return { slot: k }; }
  const pref = d.cat === 'mag' || d.cat === 'grenade' ? ['pouch', 'vest', 'pockets', 'belt', 'pack'] : d.cat === 'med' ? ['pouch', 'vest', 'pockets', 'pack'] : ['pockets', 'vest', 'pouch', 'pack'];
  const cs = containers(root).filter(c => !isWithin(c, it) && !(exclude && isWithin(c, exclude)));
  const score = c => { const cd = def(c); const k = pref.findIndex(t => hasTag(cd, t)); return k < 0 ? 9 : k; };
  cs.sort((a, b) => score(a) - score(b));
  for (const c of cs) { const f = findFree(c, it); if (f) { placeIn(c, f.g, it, f.x, f.y, f.r); return { container: c, ...f }; } }
  return null;
}
// walk every instance under root (not root itself)
export function* walk(root) {
  if (root.slots) for (const k in root.slots) { const s = root.slots[k]; if (s) { yield s; yield* walk(s); } }
  if (root.grids) for (const g of root.grids) for (const o of g) { yield o; yield* walk(o); }
}
export const find = (root, pred) => { for (const o of walk(root)) if (pred(o, def(o))) return o; return null; };
export const findAll = (root, pred) => [...walk(root)].filter(o => pred(o, def(o)));
export const hasItem = (root, tagOrId) => !!find(root, (o, d) => hasTag(d, tagOrId));
// remove depleted consumables (medical marks them _gone), empty stacks
export function prune(root) { for (const o of [...walk(root)]) if (o._gone || o.n === 0) detach(o); }

// ---------------------------------------------------------------------------------------------------------- stacks
export function canMerge(a, b) { return a !== b && a.id === b.id && def(a).stack > 1 && (b.n ?? 1) < def(b).stack; }
export function merge(a, b) {   // move as much of a into b; returns what's left in a
  if (!canMerge(a, b)) return a.n ?? 1;
  const k = Math.min(a.n, def(b).stack - b.n); b.n += k; a.n -= k; if (a.n <= 0) { a.n = 0; detach(a); } return a.n;
}
export function split(it, n) {   // a new unplaced stack of n taken from it
  if (!(it.n > 1) || n <= 0 || n >= it.n) return null;
  it.n -= n; const o = newItem(it.id, { n }); o.n = n; return o;
}

// ------------------------------------------------------------------------------------------------------- magazines
export const magCount = m => (m?.ammo || []).reduce((s, [, n]) => s + n, 0);
export const magCap = m => def(m).mag?.cap ?? Infinity;
export const magTop = m => m?.ammo?.length ? m.ammo[m.ammo.length - 1][0] : null;
export function magPush(m, round, n = 1) {
  const room = magCap(m) - magCount(m); n = Math.min(n, room); if (n <= 0) return 0;
  const top = m.ammo[m.ammo.length - 1]; if (top && top[0] === round) top[1] += n; else m.ammo.push([round, n]); return n;
}
export function magPop(m) {
  const top = m?.ammo?.[m.ammo.length - 1]; if (!top) return null;
  const r = top[0]; if (--top[1] <= 0) m.ammo.pop(); return r;
}
const calOfRound = r => ROUNDS[r]?.cal;
// load from a loose stack (def.round) or a box/bandolier/other magazine (ammo segments). Returns loaded and the
// seconds it takes: thumbing = mag.loadS per round, stripper clips with the charger = box.loadS (3x faster).
export function loadMag(mag, src, n = Infinity) {
  const md = def(mag).mag, sd = def(src); if (!md) return { loaded: 0, seconds: 0, error: 'NOT A MAGAZINE' };
  n = Math.min(n, md.cap - magCount(mag));
  let loaded = 0;
  if (sd.round) {   // loose rounds
    if (calOfRound(sd.round) !== md.cal) return { loaded: 0, seconds: 0, error: 'WRONG CALIBRE' };
    const k = Math.min(n, src.n); magPush(mag, sd.round, k); src.n -= k; loaded = k; if (src.n <= 0) detach(src);
    return { loaded, seconds: loaded * md.loadS };
  }
  if (src.ammo) {
    while (loaded < n) { const r = magTop(src); if (!r) break; if (calOfRound(r) !== md.cal) return { loaded, seconds: loaded * md.loadS, error: loaded ? '' : 'WRONG CALIBRE' }; magPop(src); magPush(mag, r, 1); loaded++; }
    return { loaded, seconds: loaded * (sd.box?.clip ? sd.box.loadS : md.loadS) };
  }
  return { loaded: 0, seconds: 0, error: 'NO AMMO' };
}
// empty a magazine into loose stacks (unplaced); caller autoStores them
export function unloadMag(mag) {
  const out = [], md = def(mag).mag; let secs = 0;
  while (magCount(mag)) {
    const r = magPop(mag); secs += md?.unloadS ?? 0.3;
    const looseId = Object.keys(ITEMS).find(k => ITEMS[k].round === r); if (!looseId) continue;
    let s = out.find(o => o.id === looseId && o.n < ITEMS[looseId].stack); if (!s) { s = newItem(looseId, { n: 1 }); s.n = 0; out.push(s); } s.n++;
  }
  return { stacks: out, seconds: secs };
}
export const weaponMag = w => w?.slots?.mag || null;
export function countRounds(root, cal) {
  let n = 0;
  for (const o of walk(root)) { const d = def(o); if (d.round && calOfRound(d.round) === cal) n += o.n; else if (o.ammo && (d.mag?.cal === cal || (d.box && calOfRound(d.box.round) === cal))) n += magCount(o); }
  return n;
}
// fullest compatible magazine in the rig (not the one in the weapon)
export function bestMag(root, weapon) {
  const spec = def(weapon).slots?.mag; if (!spec) return null;
  let best = null;
  for (const o of walk(root)) { if (isWithin(o, weapon) || !def(o).mag || !accepts(spec, o)) continue; if (!best || magCount(o) > magCount(best)) best = o; }
  return best && magCount(best) > 0 ? best : null;
}
// Swap magazines: the old one goes where the new one came from (Tarkov), else anywhere, else returned as dropped.
export function reload(root, weapon) {
  const mag = bestMag(root, weapon); if (!mag) return null;
  const pp = parentOf(mag), old = weapon.slots.mag;
  detach(mag); if (old) detach(old);
  slotIn(weapon, 'mag', mag);
  let dropped = null;
  if (old) { if (pp.g != null && !placeError(pp.c, pp.g, old, mag.x, mag.y, mag.r)) placeIn(pp.c, pp.g, old, mag.x, mag.y, mag.r); else if (!autoStore(root, old)) dropped = old; }
  return { mag, old, dropped };
}

// ---------------------------------------------------------------------------------------------------------- weight
export function weight(it) {
  const d = def(it); let kg = d.kg * (d.stack > 1 ? (it.n ?? 1) : 1);
  if (it.ammo) for (const [r, n] of it.ammo) kg += n * (ROUNDS[r]?.cartG ?? 0) / 1000;
  if (it.water) kg += it.water / 1000;
  if (it.slots) for (const k in it.slots) if (it.slots[k]) kg += weight(it.slots[k]);
  if (it.grids) for (const g of it.grids) for (const o of g) kg += weight(o);
  return kg;
}
export const totalWeight = root => weight(root);
export function armour(root) { return ['helmet', 'vest'].map(k => root.slots?.[k]).filter(o => o && def(o).armour); }

// Encumbrance from the carried load as a fraction of body mass (INFERRED from FM 21-18: fighting load <= 30% of body
// mass, approach march <= 45%; Knapik et al. 2004 soldier load review: speed and endurance fall roughly linearly
// with load). Multipliers for the soldier sim; the sim may prefer pandolfWatts() for its stamina drain.
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export function encumbrance(kg, bodyKg = 75) {
  const f = kg / bodyKg;
  const state = f < 0.2 ? 'LIGHT' : f < 0.33 ? 'FIGHTING LOAD' : f < 0.47 ? 'APPROACH LOAD' : f < 0.8 ? 'OVERLOADED' : f < 1.33 ? 'CRITICAL' : 'IMMOBILE';
  return { kg: +kg.toFixed(2), frac: +f.toFixed(3), state,
    walkMul: +(1 - 0.35 * smooth(0.3, 1.0, f)).toFixed(3), sprintMul: +(1 - 0.45 * smooth(0.2, 0.8, f)).toFixed(3),
    canSprint: f < 0.8, canJump: f < 0.6, immobile: f >= 1.33,
    staminaDrainMul: +(1 + 1.6 * f).toFixed(3), staminaRegenMul: +(1 - 0.35 * smooth(0.3, 0.8, f)).toFixed(3) };
}
// Pandolf et al. 1977 (J Appl Physiol 43:577) metabolic rate of load carriage, watts. CONFIRMED equation.
// W body kg, L load kg, V m/s, G grade %, eta terrain factor (1 treadmill/blacktop, 1.1 dirt road, 1.2 light brush,
// 1.5 heavy brush, 1.8 swamp, 2.1 loose sand). Standing: 1.5W + 2(W+L)(L/W)^2.
export function pandolfWatts(W, L, V, G = 0, eta = 1.1) {
  return 1.5 * W + 2.0 * (W + L) * (L / W) ** 2 + eta * (W + L) * (1.5 * V * V + 0.35 * V * G);
}

// ------------------------------------------------------------------------------------------------------ quick slots
export function bindQuick(root, k, it) { root.quick ??= Array(10).fill(null); root.quick[k] = it ? it.uid : null; }
export function quick(root, k) { const u = root.quick?.[k]; if (u == null) return null; return find(root, o => o.uid === u); }

// ---------------------------------------------------------------------------------------------------------- search
// Loot containers start unseen: searchStep reveals one item per def.searchS (or 0.7 s) seconds, top-left first.
export function hideContents(c) { for (const o of walk(c)) o.unseen = true; c.searched = false; }
export function searchStep(c, dt) {
  const hidden = [...walk(c)].filter(o => o.unseen); if (!hidden.length) { c.searched = true; return 0; }
  c._st = (c._st || 0) + dt; const per = def(c).searchS ?? 0.7;
  hidden.sort((a, b) => (parentOf(a).c === c ? 0 : 1) - (parentOf(b).c === c ? 0 : 1) || a.y - b.y || a.x - b.x);
  while (c._st >= per && hidden.length) { c._st -= per; hidden.shift().unseen = false; }
  if (!hidden.length) c.searched = true;
  return hidden.length;
}

// ------------------------------------------------------------------------------------------------------ persistence
export function relink(root) {
  const go = c => {
    if (c.slots) for (const k in c.slots) { const s = c.slots[k]; if (s) { setP(s, { c, s: k }); go(s); } }
    if (c.grids) c.grids.forEach((g, gi) => g.forEach(o => { setP(o, { c, g: gi }); go(o); }));
    if (c.uid >= UID) UID = c.uid + 1;
  };
  go(root); return root;
}
export const serialize = root => JSON.stringify(root);
export const deserialize = s => relink(typeof s === 'string' ? JSON.parse(s) : s);

// ---------------------------------------------------------------------------------------------------------- loadouts
const put = (root, id, o = {}) => { const it = newItem(id, o); const r = autoStore(root, it); if (!r) throw new Error('loadout: no room for ' + id); return it; };
const mag20 = () => newItem('mag_m16_20', { fill: 'M193', rounds: 20 });
function belt(root, pouches) {
  const b = newItem('lc2_belt'); slotIn(root, 'belt', b);
  for (const [slot, id] of Object.entries(pouches)) if (id) slotIn(b, slot, newItem(id));
  return b;
}
// A 1980 Marine rifle squad's kits (INFERRED from FMFM 6-5 Marine Rifle Squad and period photos; basic load for an
// M16A1 rifleman: 7-8 twenty-round magazines + a bandolier; 2 grenades; 2 canteens; first-aid dressing).
export function loadout(name = 'rifleman') {
  const s = newSoldier();
  slotIn(s, 'helmet', newItem('m1_helmet'));
  slotIn(s, 'vest', newItem('m69_vest'));
  const b = belt(s, { ammoL: 'pouch_ammo', ammoR: 'pouch_ammo', aid: 'pouch_aid', canteenL: 'pouch_canteen', canteenR: 'pouch_canteen', etool: 'pouch_etool' });
  slotIn(b, 'bayonet', newItem('bayonet_m7'));
  for (const k of ['canteenL', 'canteenR']) { const c = b.slots[k]; placeIn(c, 0, newItem('canteen_1qt'), 0, 0); }
  placeIn(b.slots.canteenL, 1, newItem('tablets_iodine', { n: 20 }), 0, 0);
  placeIn(b.slots.aid, 0, newItem('dressing_field'), 0, 0);
  placeIn(b.slots.etool, 0, newItem('etool'), 0, 0);
  const rifle = name === 'grenadier' ? newItem('m16a1_m203') : name === 'mg' ? newItem('m60') : newItem('m16a1');
  slotIn(s, 'primary', rifle);
  slotIn(s, 'pack', newItem('alice_medium'));
  if (name === 'mg') {
    slotIn(rifle, 'mag', newItem('belt_m60_100', { fill: 'M80', rounds: 100 }));
    slotIn(s, 'holster', newItem('m1911a1')); slotIn(s.slots.holster, 'mag', newItem('mag_45', { fill: 'M1911', rounds: 7 }));
    for (let i = 0; i < 2; i++) put(s, 'mag_45', { fill: 'M1911', rounds: 7 });
    for (let i = 0; i < 2; i++) placeIn(s.slots.pack, 0, newItem('belt_m60_100', { fill: 'M80', rounds: 100 }), i * 2, 0);
    put(s, 'm67');
  } else {
    slotIn(rifle, 'mag', mag20());
    for (const k of ['ammoL', 'ammoR']) for (let g = 0; g < 3; g++) placeIn(b.slots[k], g, mag20(), 0, 0);
    for (const k of ['ammoL', 'ammoR']) placeIn(b.slots[k], 3, newItem('m67'), 0, 0);
  }
  if (name === 'grenadier') { slotIn(rifle, 'gl', newItem('r40_m406')); for (let i = 0; i < 6; i++) put(s, 'r40_m406'); }
  if (name === 'corpsman') {
    slotIn(s, 'holster', newItem('m1911a1')); slotIn(s.slots.holster, 'mag', newItem('mag_45', { fill: 'M1911', rounds: 7 }));
    const bag = newItem('unit1_bag'); placeIn(s.slots.pack, 0, bag, 0, 0);
    for (const id of ['dressing_battle', 'dressing_battle', 'dressing_field', 'dressing_field', 'cravat', 'cravat', 'tq_strap', 'morphine', 'morphine', 'ammonia', 'needle_14g', 'apc']) { const it = newItem(id); const f = findFree(bag, it); if (f) placeIn(bag, f.g, it, f.x, f.y, f.r); }
    placeIn(s.slots.pack, 0, newItem('iv_lr'), 3, 0); placeIn(s.slots.pack, 0, newItem('iv_lr'), 4, 0);
    placeIn(s.slots.pack, 0, newItem('splint_wire'), 0, 2);
  }
  // pockets: dressing, compass / P-38; vest pockets: cravat, rifle cleaning gear omitted
  put(s, 'p38'); if (name !== 'corpsman') put(s, 'cravat');
  // pack: poncho, liner, two C-rat meals, a bandolier (riflemen), an M72 slung on the back for one man in three
  const pk = s.slots.pack;
  placeIn(pk, 0, newItem('poncho'), 0, 4); placeIn(pk, 0, newItem('poncho_liner'), 2, 4);
  placeIn(pk, 1, newItem('mci'), 0, 0); placeIn(pk, 3, newItem('mci'), 0, 0);
  if (name === 'rifleman') { placeIn(pk, 2, newItem('bando_m193'), 0, 0); slotIn(s, 'secondary', newItem('m72a2')); }
  put(s, 'm18_green');
  return s;
}
// A RUNAWAY machine-crewed modern trooper's body (loot): seized plate carrier, M4, PMAGs, modern IFAK, odd RW bits.
export function loadoutRW(rng = Math.random) {
  const s = newSoldier();
  slotIn(s, 'helmet', newItem('ech_helmet')); slotIn(s, 'vest', newItem('plate_carrier_rw'));
  const w = newItem('m4a1_rw'); slotIn(s, 'primary', w); slotIn(w, 'mag', newItem('mag_pmag', { fill: 'M855A1', rounds: 30 }));
  const v = s.slots.vest;
  for (let g = 0; g < 3; g++) placeIn(v, g, newItem('mag_pmag', { fill: 'M855A1', rounds: Math.floor(10 + rng() * 21) }), 0, 0);
  for (const id of ['tq_cat', 'quikclot', 'chest_seal', 'dressing_field']) { const it = newItem(id); const f = findFree(v, it, { grids: [4] }); if (f) placeIn(v, f.g, it, f.x, f.y, f.r); }
  if (rng() < 0.25) put(s, 'rw_mender'); if (rng() < 0.5) put(s, 'rw_core'); if (rng() < 0.6) put(s, 'mre_seized');
  return s;
}
// Fill a crate (rng-driven loot tables)
const LOOT = {
  crate_ammo: [['bando_m193', 3, 0.9], ['can_m193', 1, 0.3], ['mag_m16_20', 4, 0.8], ['mag_m16_30', 2, 0.2], ['m67', 4, 0.7], ['m18_green', 2, 0.5], ['m18_red', 1, 0.3], ['r40_m406', 6, 0.5], ['box_45', 2, 0.4], ['m72a2', 1, 0.3], ['claymore', 1, 0.25], ['can_m80', 1, 0.3]],
  crate_med: [['dressing_field', 8, 1], ['dressing_battle', 4, 0.8], ['cravat', 6, 0.8], ['tq_strap', 3, 0.7], ['morphine', 3, 0.5], ['iv_lr', 2, 0.5], ['splint_wire', 2, 0.6], ['ammonia', 1, 0.6], ['apc', 1, 0.7], ['unit1_bag', 1, 0.2], ['canteen_1qt', 2, 0.6], ['mci', 3, 0.6], ['lrp', 2, 0.4]],
  rw_cache: [['tq_cat', 3, 0.8], ['quikclot', 3, 0.7], ['sam_splint', 2, 0.6], ['chest_seal', 2, 0.6], ['fentanyl', 2, 0.4], ['ifak', 1, 0.5], ['rw_mender', 1, 0.3], ['mre_seized', 4, 0.8], ['mag_pmag', 4, 0.7], ['box_m855a1', 2, 0.6], ['m4a1_rw', 1, 0.2], ['ech_helmet', 1, 0.2], ['rw_core', 2, 0.5], ['mag_rw', 2, 0.3], ['r_rwn', 1, 0.3], ['rw_needler', 1, 0.08], ['plate_carrier_rw', 1, 0.1], ['rw_carapace', 1, 0.05]],
};
export function fillCrate(id, rng = Math.random, { hidden = true } = {}) {
  const c = newItem(id);
  for (const [it, max, p] of LOOT[id] || []) for (let i = 0; i < max; i++) if (rng() < p) {
    const o = newItem(it, it === 'mag_m16_20' || it === 'mag_pmag' ? { fill: it === 'mag_pmag' ? 'M855A1' : 'M193', rounds: Math.floor(rng() * 21) } : {});
    const f = findFree(c, o); if (f) placeIn(c, f.g, o, f.x, f.y, f.r);
  }
  if (hidden) hideContents(c);
  return c;
}
