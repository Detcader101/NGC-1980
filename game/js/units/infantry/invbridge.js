// NGC-1980 wave 2 (ngc/foot2): the bridge between MEDINV's inventory (inventory.js: nested grids, magazines with LIFO
// round segments, the weapons as items in the soldier's slots) and INFANTRY's rifleman (weapons.js inventory contract:
// find / remove / add / count / totalKg over flat magazine items). PURE: no THREE, no DOM.
//
//   const B = createInvBridge(root, { rng });     root = I.loadout('rifleman') (or any soldier root)
//   const R = createRifleman({ loadout: B.loadout(), inventory: B, kitKg: 0, ... }); B.attach(R);
//   each step, after R.step: B.sync()   (the magazine in each gun <-> the weapon item's mag slot, LAW tubes, weapons
//                                        added or removed on the gear screen)
//
// The rifleman's magazine items are VIEWS of inventory instances: view.rounds reads / writes the instance's round
// segments (a shot pops the top round, so tracers loaded last come out first, as MEDINV packs them), view.round is the
// round on top. remove() takes the instance out of its pouch (into the hand), add() puts it back where the last one
// came from (Tarkov) or anywhere it fits. The gear screen sees the magazine in the rifle the moment it is seated.
import * as I from './inventory.js';
import { ITEMS } from './items.js';
import { createWeapon, WEAPONS } from './weapons.js';
import { ROUNDS as BROUNDS } from './ballistics.js';

// inventory weapon id -> rifleman weapon key; calibre -> rifleman fit
export const WEAPON_KEY = { m16a1: 'M16A1', m16a1_m203: 'M16A1/M203', m60: 'M60', m72a2: 'M72A2', m1911a1: 'M1911A1', m4a1_rw: 'M16A1' };
const FIT_CAL = { 'M16-20': '556', 'M1911-7': '45', 'M60-belt': '762n' };
const FIT_ROUND = { 'M16-20': 'M193', 'M1911-7': 'M1911', 'M60-belt': 'M80', '40mm': 'M433' };
// inventory round ids the flight model does not know fly as the nearest one it does (game level)
const roundFor = (fit, r) => r && BROUNDS[r] ? r : FIT_ROUND[fit];
const SLOT_ORDER = ['primary', 'secondary', 'holster'];

export function createInvBridge(root, o = {}) {
  const rng = o.rng || Math.random;
  const views = new WeakMap();
  const B = { root, R: null, weapons: [] };   // weapons: [{ slot, inst, w, last }]
  const D = it => ITEMS[it.id];
  const fitOf = it => { const d = D(it); if (d.mag) return Object.keys(FIT_CAL).find(f => FIT_CAL[f] === d.mag.cal) || null; if (d.round40) return '40mm'; return null; };
  // a rifleman-format view of an inventory magazine / belt / 40 mm round
  B.view = inst => {
    if (!inst) return null;
    let v = views.get(inst); if (v) return v;
    const d = D(inst), fit = fitOf(inst);
    if (!fit) return null;
    let last = null;
    v = {
      inst, fit, id: inst.uid, kind: fit === 'M60-belt' ? 'belt' : d.mag ? 'mag' : 'round', name: d.name, cap: d.mag ? d.mag.cap : 1, tracerLast: 0,
      get rounds() { return d.mag ? I.magCount(inst) : inst._spent ? 0 : 1; },
      set rounds(n) {
        if (!d.mag) { inst._spent = n <= 0; return; }
        let c = I.magCount(inst);
        while (c > n) { last = I.magPop(inst) || last; c--; }
        if (n > c) I.magPush(inst, last || FIT_ROUND[fit], n - c);   // the open-bolt M60 puts its round back on the belt
      },
      get round() { return roundFor(fit, d.mag ? I.magTop(inst) || last : d.round40 === 'M406' ? 'M433' : d.round40); },
      set round(r) {},
    };
    views.set(inst, v); return v;
  };
  const inWeapon = it => { for (const W of B.weapons) if (W.inst && I.isWithin(it, W.inst)) return true; return false; };
  const candidates = fit => I.findAll(root, o2 => fitOf(o2) === fit && !inWeapon(o2) && !o2._spent);
  // ---------------------------------------------------------------- the weapons.js inventory contract
  B.find = (fit, prefer = 'fullest') => {
    let best = null, bn = 0;
    for (const it of candidates(fit)) {
      const v = B.view(it), n = v.rounds;
      if (n <= 0 && prefer !== 'emptiest') continue;
      if (!best || (prefer === 'emptiest' ? n < bn : n > bn)) { best = v; bn = n; }
    }
    return best;
  };
  B.remove = v => {
    if (!v || !v.inst) return false;
    I.detach(v.inst); return true;
  };
  // stow (a tactical reload's old magazine): back into the rig wherever it fits (false: no room, the weapon drops it)
  B.add = v => {
    if (!v || !v.inst) return false;
    const it = v.inst; I.detach(it);
    return !!I.autoStore(root, it);
  };
  B.count = fit => { let n = 0; for (const it of candidates(fit)) n += B.view(it).rounds; return n; };
  // carried mass for soldier.js: everything on the man minus the weapons themselves (the rifleman adds those)
  B.totalKg = () => { let m = I.totalWeight(root); for (const W of B.weapons) if (W.inst && W.w) m -= D(W.inst).kg; return Math.max(0, m); };
  B.step = () => {};
  // ---------------------------------------------------------------- the rifleman's loadout from the soldier's slots
  B.weaponItems = () => SLOT_ORDER.map(s => ({ slot: s, inst: root.slots[s] })).filter(x => x.inst && WEAPON_KEY[x.inst.id]);
  // createRifleman would pull fresh magazines out of the pouches for its guns: give it none, attach() fits the guns
  B.loadout = () => ({ kitKg: 0, slots: [], items: () => [] });
  // after createRifleman: each gun takes the magazine its inventory item holds (not a fresh one from the pouches)
  B.attach = R => {
    B.R = R; B.weapons = [];
    const items = B.weaponItems();
    R.slots.length = 0;
    for (const x of items) R.slots.push(makeWeapon(x));
    R.slot = 0;
    for (const x of items) B.weapons.push({ slot: x.slot, inst: x.inst, w: R.slots[B.weapons.length], last: x.inst.slots?.mag || null });
  };
  function makeWeapon(x) {
    const key = WEAPON_KEY[x.inst.id], mag = x.inst.slots?.mag ? B.view(x.inst.slots.mag) : null;
    const w = createWeapon(key === 'M16A1/M203' ? 'M16A1' : key, { rng, mag });
    if (key === 'M16A1/M203') w.gl = createWeapon('M203', { rng, loaded: !!x.inst.slots?.gl });
    if (x.inst.id === 'm4a1_rw') w.seized = true;
    return w;
  }
  // ---------------------------------------------------------------- per-step reconciliation
  // Which side changed the magazine in a gun since the last sync: the rifleman (a reload: seat the new magazine in the
  // weapon item, take the old one out of it) or the gear screen (drag a magazine onto the rifle: the gun takes it).
  B.sync = () => {
    const R = B.R; if (!R) return;
    // weapons added / removed on the gear screen (a LAW picked up from a crate, a pistol dropped)
    const items = B.weaponItems();
    const same = items.length === B.weapons.length && items.every((x, i) => B.weapons[i].inst === x.inst);
    if (!same) {
      const cur = R.slots[R.slot], next = [];
      for (const x of items) {
        const old = B.weapons.find(W => W.inst === x.inst);
        next.push(old ? old : { slot: x.slot, inst: x.inst, w: makeWeapon(x), last: x.inst.slots?.mag || null });
      }
      B.weapons = next; R.slots.length = 0; for (const W of next) R.slots.push(W.w);
      const k = R.slots.indexOf(cur); R.slot = k >= 0 ? k : 0; R.glMode = false;
    }
    for (const W of B.weapons) {
      const w = W.w, inst = W.inst; if (!inst.slots || !('mag' in inst.slots)) continue;
      const gun = w.mag ? w.mag.inst || null : null, item = inst.slots.mag || null;
      if (gun !== W.last) {   // the rifleman moved it
        if (item && item !== gun) I.detach(item);
        if (gun) { I.detach(gun); I.slotIn(inst, 'mag', gun); }
        W.last = gun;
      } else if (item !== W.last && !(w.act)) {   // the gear screen moved it
        w.mag = item ? B.view(item) : null; W.last = item;
      }
    }
    // a fired LAW is gone from the rifleman's slots: its tube leaves the inventory too
    for (const W of [...B.weapons]) if (!R.slots.includes(W.w)) { if (I.parentOf(W.inst)) I.detach(W.inst); B.weapons.splice(B.weapons.indexOf(W), 1); }
    I.prune(root);
  };
  return B;
}

// Top the soldier up from a friendly pad / the carrier's magazines (rearm): every magazine refilled with ball (the last
// two tracers, as 1980 Marines loaded them), missing pouch magazines replaced, a LAW on the back, the first-aid kit
// restocked. Returns a short list of what was issued.
export function resupply(root) {
  const got = [];
  const top = (it, round, cap) => { const n = I.magCount(it); if (n < cap) { it.ammo.length = 0; I.magPush(it, 'M196', 2); I.magPush(it, round, cap - 2); return 1; } return 0; };
  let refilled = 0;
  for (const it of I.findAll(root, (o, d) => !!d.mag)) { const d = ITEMS[it.id]; if (d.mag.cal === '556') refilled += top(it, 'M193', d.mag.cap); else if (d.mag.cal === '45') { if (I.magCount(it) < 7) { it.ammo.length = 0; I.magPush(it, 'M1911', 7); refilled++; } } else if (d.mag.cal === '762n') { if (I.magCount(it) < 100) { it.ammo.length = 0; I.magPush(it, 'M80', 100); refilled++; } } }
  if (refilled) got.push(`${refilled} MAGAZINES REFILLED`);
  const mags = I.findAll(root, (o, d) => d.mag?.cal === '556').length;
  let added = 0;
  for (let i = mags; i < 7; i++) { const m = I.newItem('mag_m16_20', { fill: 'M193', rounds: 18 }); I.magPush(m, 'M196', 2); if (!I.autoStore(root, m)) break; added++; }
  if (added) got.push(`${added} NEW MAGAZINES`);
  if (!root.slots.secondary) { const law = I.newItem('m72a2'); if (!I.slotError(root, 'secondary', law)) { I.slotIn(root, 'secondary', law); got.push('M72 LAW'); } }
  const want = { dressing_field: 2, cravat: 1, m18_green: 1 };   // ngc/cmpolish: an M18 smoke back in the rig
  for (const [id, n] of Object.entries(want)) { const have = I.findAll(root, o => o.id === id).length; for (let i = have; i < n; i++) if (I.autoStore(root, I.newItem(id))) got.push(ITEMS[id].short); }
  return got;
}
export { WEAPONS };
