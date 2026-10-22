// The island war (Carrier Command meets Raid on Bungeling Bay).
//
// Two sides each run a carrier and race to take the archipelago. Islands produce for whoever holds them: fuel
// (derricks), materiel (factories), sight (radar). Materiel buys capture drones, AA guns and new helicopters.
// Taking an island: knock out the holder's AA guns, then land on its pad and hold it (your helicopter or a capture
// drone; the enemy uses transports). Cave islands are only taken by stealing the pod (the command core) from the cave.
// The enemy also builds a battleship at its shipyard from its factories' output - bomb the factories and the
// shipyard to hold it back; once it launches it hunts your carrier. Lose the carrier and the war is lost; sink the
// enemy carrier or take its HQ island (IRONHOLD) to win.
import * as THREE from 'three';
import { buildCarrier, buildBattleship, buildFreighter, buildDrone, buildTransport, buildGunship, buildGun, buildStructure, buildRubble, CARRIER, BSHIP, FREIGHTER, TEAM } from './ships.js';

const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
export const COST = { drone: 40, aa: 30, heli: 60, escort: 30 };
export const SIDE_NAME = ['NEUTRAL', 'FRIENDLY', 'ENEMY'];
const CAP_TIME = { heli: 6, drone: 9, transport: 10 };
const PROD = { fuel: { fuel: 0.55 }, factory: { mat: 0.4 }, radar: {}, hq: { fuel: 0.3, mat: 0.3 }, fortress: { fuel: 0.6 } };
const SIGHT = { heli: 180, carrier: 230, drone: 100, island: 130, radar: 380 };
const PROD_KIND = { fuel: 'fuel', factory: 'factory', radar: 'radar', fortress: 'fuel' };

export function createWar(ctx) {
  const { scene, fx, sfx, terrainH, isWater, nav } = ctx;
  const W = {
    islands: ctx.ISLANDS, units: [], proj: [], E: { fuel: 0, mat: 0, bship: 0 }, P: ctx.G, time: 0, over: null,
    carrier: null, enemyCarrier: null, battleship: null, thinkT: 0, raidT: 120, econT: 0, deckCache: null,
  };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const store = side => side === 1 ? W.P : W.E;
  // war sounds fall off with distance from the camera, so a battle across the map is a distant rumble
  const ear = ctx.ear;
  const hear = (x, y, z, range = 650) => Math.max(0, 1 - Math.hypot(x - ear.x, y - ear.y, z - ear.z) / range);
  function boomAt(x, y, z, big) { const k = hear(x, y, z); if (k > 0.02) sfx.boom(big * (0.12 + 0.88 * k * k)); }
  const feed = (t, kind = 'info') => ctx.feed(t, kind);

  // ------------------------------------------------------------------------------------- islands and buildings
  const islandGroup = new THREE.Group(); scene.add(islandGroup);
  function placeAt(x, z) { return Math.max(terrainH(x, z), 0); }
  function addStruct(I, kind, x, z, side = I.owner, yaw = rnd(6.283)) {
    const mesh = kind === 'aa' ? buildGun(side, 1) : buildStructure(kind, side);
    const y = placeAt(x, z); mesh.position.set(x, y, z); mesh.rotation.y = kind === 'aa' ? 0 : yaw; islandGroup.add(mesh);
    const ud = mesh.userData, hp = { hq: 30, factory: 26, fuel: 22, radar: 16, shipyard: 40, aa: 7 }[kind];
    const s = { kind, I, side, x, y, z, hp, max: hp, mesh, dead: false, r: kind === 'aa' ? 2.8 : ud.r, h: kind === 'aa' ? 2 : ud.h * 0.5, cd: rnd(1, 3), rebuild: 0 };
    if (kind === 'factory') s.chimneys = ud.stackTops.map(([sx, sy, sz]) => { _v.set(sx, sy, sz).applyEuler(mesh.rotation).add(mesh.position); return fx.chimney(_v.x, _v.y, _v.z, 1); });
    I.structs.push(s); return s;
  }
  function aaSlots(I) {   // where AA guns go: round the pad
    const p = I.pad, n = I.cave ? 4 : 4, r = I.cave ? 15 : 22;
    return Array.from({ length: n }, (_, k) => { const a = k * Math.PI / 2 + Math.PI / 4; return [p.x + Math.cos(a) * r, p.z + Math.sin(a) * r]; });
  }
  function freeSlot(I) { return aaSlots(I).find(([x, z]) => !I.structs.some(s => s.kind === 'aa' && !s.dead && Math.hypot(s.x - x, s.z - z) < 3)); }
  function buildAA(I, side) { const sl = freeSlot(I); if (!sl) return null; const s = addStruct(I, 'aa', sl[0], sl[1], side); s.building = 4; s.mesh.scale.setScalar(0.01); return s; }
  W.aliveAA = (I, side = I.owner) => I.structs.filter(s => s.kind === 'aa' && !s.dead && s.side === side && !s.building).length;
  function coastPoint(I, toward) {   // a spot on the island's shore facing `toward`
    const a = Math.atan2(toward[1] - I.z, toward[0] - I.x);
    for (let r = 20; r < I.r + 60; r += 2) { const x = I.x + Math.cos(a) * r, z = I.z + Math.sin(a) * r; if (terrainH(x, z) < 2.5) return [x - Math.cos(a) * 10, z - Math.sin(a) * 10, a]; }
    return [I.x + Math.cos(a) * I.r * 0.7, I.z + Math.sin(a) * I.r * 0.7, a];
  }
  function buildIslands() {
    for (const I of W.islands) {
      I.structs = []; I.cap = null; I.owner = I.owner0 ?? I.owner; I.owner0 = I.owner; I.seen = I.owner === 1 ? I.owner : -1; I.lastHit = -99;
      const p = I.pad;
      if (I.cave) {   // cave islands: HQ (+ a derrick on fortresses) beside the pad
        addStruct(I, 'hq', p.x - 17, p.z + 9, I.owner, Math.PI);
        if (I.kind === 'fortress') addStruct(I, 'fuel', p.x + 19, p.z + 6, I.owner, 0);
        if (I.name === 'IRONHOLD') { const [x, z, a] = coastPoint(I, [0, 0]); I.yard = addStruct(I, 'shipyard', x, z, 2, -a + Math.PI / 2); }
      } else {
        const a0 = rnd(6.283);
        addStruct(I, 'hq', p.x + Math.cos(a0) * 17, p.z + Math.sin(a0) * 17, I.owner, -a0);
        addStruct(I, I.kind, p.x + Math.cos(a0 + Math.PI) * 18, p.z + Math.sin(a0 + Math.PI) * 18, I.owner, -a0);
      }
      const guns = I.owner === 0 ? 0 : I.name === 'IRONHOLD' ? 4 : I.kind === 'hq' ? 2 : I.owner === 2 ? 2 : 1;
      for (let k = 0; k < guns; k++) { const s = buildAA(I, I.owner); if (s) { s.building = 0; s.mesh.scale.setScalar(1); } }
    }
  }
  function recolor(s) {
    const c = TEAM[s.side]; s.mesh.traverse(o => { if (o.material && o.material === s.mesh.userData.team) o.material.color.setHex(c); });
  }
  W.setOwner = (I, side, how) => {
    const was = I.owner; if (was === side) return;
    I.owner = side; I.cap = null;
    {   // a burst of the new owner's colour over the pad
      const c = side === 1 ? [0.3, 0.85, 1] : [1, 0.3, 0.15], p = I.pad;
      for (let i = 0; i < 70; i++) { const a = rnd(6.283), sp = rnd(4, 16); fx.add.spawn(p.x, p.h + 1, p.z, Math.cos(a) * sp, rnd(8, 26), Math.sin(a) * sp, rnd(1, 2.2), rnd(0.5, 1.1), 0.2, c[0], c[1], c[2], 1, 9, 0.6); }
      fx.water.add({ x: p.x, y: p.h + 0.3, z: p.z, size: 4, grow: 60, a: 0.8, life: 1, tile: 1, pow: 2 });
    }
    for (const s of I.structs) {
      if (s.kind === 'aa') { if (!s.dead && s.side !== side) killStruct(s, true); continue; }
      s.side = side; recolor(s);
    }
    const who = side === 1 ? 'WE HAVE TAKEN' : 'ENEMY HAS TAKEN';
    feed(`${who} ${I.name}${how ? '  (' + how + ')' : ''}`, side === 1 ? 'good' : 'bad');
    if (side === 1) { ctx.addScore(I.cave ? 3000 : 1000); sfx.dock(); }
    else sfx.alarm?.();
    if (side === 2 && I.kind !== 'radar') { const s = buildAA(I, 2); if (s) { s.building = 0; s.mesh.scale.setScalar(1); } }   // transports bring a gun
    ctx.onOwner(I, was);
    if (I.name === 'IRONHOLD' && side === 1) end('win', 'IRONHOLD CAPTURED');
  };
  function killStruct(s, quiet) {
    if (s.dead) return; s.dead = true; s.hp = 0;
    const big = { hq: 2.6, factory: 3, fuel: 3.4, radar: 2.2, shipyard: 3.6, aa: 1.4 }[s.kind];
    fx.explode(s.x, s.y + s.h, s.z, big, { fire: s.kind === 'aa' ? 25 : 90, debris: Math.round(big * 5), color: 0x5a5650, crater: 2.4 });
    if (s.kind === 'fuel') { fx.explode(s.x + 5, s.y + 3, s.z + 4, 2.4, { fire: 120 }); setTimeout(() => fx.explode(s.x - 5, s.y + 3, s.z + 4, 2.8, { fire: 140 }), 350); }
    boomAt(s.x, s.y, s.z, Math.min(1.4, big * 0.4));
    s.mesh.visible = false; s.rubble = buildRubble(s.r * 0.9); s.rubble.position.set(s.x, s.y, s.z); islandGroup.add(s.rubble);
    if (s.chimneys) for (const c of s.chimneys) c.off = true;
    if (s.kind !== 'aa') s.rebuild = 60;
    if (s.kind === 'shipyard') { W.E.bship = Math.max(0, W.E.bship - 30); feed('SHIPYARD DESTROYED  -  BATTLESHIP SET BACK', 'good'); }
    if (!quiet && s.side === 2) { ctx.addScore(s.kind === 'aa' ? 250 : 600); feed(`${s.I.name}: ${s.kind === 'aa' ? 'AA GUN' : s.kind.toUpperCase()} DESTROYED`, 'good'); }
    if (!quiet && s.side === 1) feed(`${s.I.name}: OUR ${s.kind === 'aa' ? 'AA GUN' : s.kind.toUpperCase()} DESTROYED`, 'bad');
  }
  function restoreStruct(s) {
    s.dead = false; s.hp = s.max; s.mesh.visible = true; if (s.rubble) { islandGroup.remove(s.rubble); s.rubble = null; }
    if (s.chimneys) for (const c of s.chimneys) c.off = false;
    recolor(s);
  }

  // ------------------------------------------------------------------------------------- ships
  function makeShip(type, side, x, z, yaw) {
    const m = type === 'carrier' ? buildCarrier(side) : type === 'freighter' ? buildFreighter() : buildBattleship();
    const dims = type === 'carrier' ? CARRIER : type === 'freighter' ? FREIGHTER : BSHIP;
    const u = { type, side, p: new THREE.Vector3(x, 0, z), v: new THREE.Vector3(), yaw, w: 0, speed: 0, max: { carrier: 6, freighter: 5, battleship: 7.5 }[type], hp: { carrier: 600, freighter: 70, battleship: 420 }[type], mesh: m.group, parts: m, dims, path: [], guns: [], wakeT: 0, launchT: 0 };
    u.hpMax = u.hp;
    u.guns = m.guns.map(g => ({ mesh: g, hp: 9, max: 9, dead: false, cd: rnd(1, 3), range: type === 'carrier' ? 150 : 130, ship: u }));
    if (m.turrets) u.turrets = m.turrets.map(t => ({ mesh: t, cd: rnd(2, 5) }));
    m.group.position.copy(u.p); m.group.rotation.y = yaw; scene.add(m.group); W.units.push(u); return u;
  }
  const fwdX = yaw => -Math.sin(yaw), fwdZ = yaw => -Math.cos(yaw);
  function toLocal(u, x, z) { const dx = x - u.p.x, dz = z - u.p.z, c = Math.cos(u.yaw), s = Math.sin(u.yaw); return [dx * c - dz * s, dx * s + dz * c]; }
  function toWorld(u, lx, ly, lz, out = _v) { const c = Math.cos(u.yaw), s = Math.sin(u.yaw); return out.set(u.p.x + lx * c + lz * s, u.p.y + ly, u.p.z - lx * s + lz * c); }
  // deck height under (x, z) if it is over a ship (and the superstructure, so you can fly into it), else -1e9
  W.deckY = (x, z, skipSide = 0) => {
    let best = -1e9;
    for (const u of W.units) {
      if (!u.dims || u.sinking > 4 || u.side === skipSide) continue;
      if (Math.abs(x - u.p.x) > 70 || Math.abs(z - u.p.z) > 70) continue;
      const [lx, lz] = toLocal(u, x, z), D = u.dims, sink = u.p.y;
      if (u.type === 'carrier') {
        let hw = D.W / 2 * 0.97; if (lz < -D.L / 2 + 16) hw *= Math.max(0, (lz + D.L / 2 + 6) / 22);
        if (Math.abs(lx) < hw && lz > -D.L / 2 - 6 && lz < D.L / 2) best = Math.max(best, D.DECK + sink);
        if (Math.abs(lx - D.TOWER_X) < 2.9 && Math.abs(lz - D.TOWER_Z) < 9) best = Math.max(best, D.DECK + D.TOWER_H + sink);
      } else if (u.type === 'freighter') {
        if (Math.abs(lx) < D.W / 2 && Math.abs(lz) < D.L / 2 - 3) best = Math.max(best, D.DECK + 4.6 + sink);   // on the containers
        if (Math.abs(lx) < 4.3 && Math.abs(lz - (D.L / 2 - 6)) < 3.2) best = Math.max(best, D.DECK + 6 + sink);
      } else {
        if (Math.abs(lx) < D.W / 2 && Math.abs(lz) < D.L / 2 - 6) best = Math.max(best, D.DECK + sink);
        if (Math.abs(lx) < 4.5 && Math.abs(lz - 4) < 10) best = Math.max(best, D.DECK + 14 + sink);
      }
    }
    return best;
  };
  W.shipAt = (x, z) => W.units.find(u => u.dims && Math.abs(x - u.p.x) < 70 && Math.abs(z - u.p.z) < 70 && (() => { const [lx, lz] = toLocal(u, x, z); return Math.abs(lx) < u.dims.W / 2 && Math.abs(lz) < u.dims.L / 2 + 4; })());
  W.surfVel = (x, z) => { const u = W.shipAt(x, z); return u && !u.sinking ? { vx: u.v.x, vz: u.v.z, w: u.w, cx: u.p.x, cz: u.p.z } : null; };
  W.orderCarrier = (x, z) => {
    const u = W.carrier; if (!u || u.sinking) return false;
    const [wx, wz] = nav.wet(x, z) ? [x, z] : nav.nearestWater(x, z);
    u.path = nav.path(u.p.x, u.p.z, wx, wz); u.goal = [wx, wz]; return true;
  };
  function sailShip(u, dt) {
    if (u.sinking !== undefined) {   // going down: list, settle, burn
      u.sinking += dt; u.speed *= Math.exp(-0.4 * dt); u.p.y = -u.sinking * 0.9; u.mesh.rotation.z = Math.min(0.35, u.sinking * 0.03) * (u.side === 1 ? 1 : -1); u.mesh.rotation.x = Math.min(0.12, u.sinking * 0.01);
      if (Math.random() < 0.08) { toWorld(u, rnd(-10, 10), u.dims.DECK, rnd(-40, 40)); fx.explode(_v.x, _v.y, _v.z, rnd(1.2, 2.4), { debris: 4, color: 0x4a4440 }); boomAt(_v.x, _v.y, _v.z, 0.5); }
      if (u.sinking > 18) { scene.remove(u.mesh); u.gone = true; }
    }
    let tgtYaw = u.yaw, want = 0;
    if (u.path.length && u.sinking === undefined) {
      const [tx, tz] = u.path[0], d = Math.hypot(tx - u.p.x, tz - u.p.z);
      if (d < (u.path.length > 1 ? 30 : 12)) u.path.shift();
      else { tgtYaw = Math.atan2(-(tx - u.p.x), -(tz - u.p.z)); const last = u.path.length === 1; want = u.max * (last ? clamp(d / 80, 0.15, 1) : 1); }
    }
    const turn = angDiff(u.yaw, tgtYaw), rate = 0.09 * clamp(u.speed / 3, 0.3, 1);
    u.w = clamp(turn, -rate, rate) * (Math.abs(turn) > 0.02 ? 1 : 0); u.yaw += u.w * dt;
    if (Math.abs(turn) > 1.2) want *= 0.35;
    u.speed += clamp(want - u.speed, -0.6 * dt, 0.35 * dt);
    // never run aground: if the bow would be in the shallows, brake hard
    const ahead = u.dims.L / 2 + 6 + u.speed * 5, bx = u.p.x + fwdX(u.yaw) * ahead, bz = u.p.z + fwdZ(u.yaw) * ahead;
    if (terrainH(bx, bz) > -3 && Math.abs(turn) < 0.6) u.speed = Math.max(0, u.speed - 2 * dt);
    u.v.set(fwdX(u.yaw) * u.speed, 0, fwdZ(u.yaw) * u.speed);
    u.p.addScaledVector(u.v, dt);
    u.mesh.position.copy(u.p); u.mesh.position.y += Math.sin(W.time * 0.6 + u.p.x) * 0.15; u.mesh.rotation.y = u.yaw;
    u.wakeT -= dt;
    if (u.wakeT <= 0 && u.speed > 0.8 && u.sinking === undefined) {
      u.wakeT = 0.3; toWorld(u, 0, 0, u.dims.L / 2 + 2); fx.wake(_v.x, _v.z, 1.6 + u.speed * 0.25);
      for (const sd of [-1, 1]) { toWorld(u, sd * u.dims.W * 0.42, 0, -u.dims.L / 2 + 10); fx.wake(_v.x, _v.z, 0.8); }
      toWorld(u, 0, 0.5, -u.dims.L / 2 - 4); for (let i = 0; i < 3; i++) fx.mix.spawn(_v.x + rnd(-2, 2), 0.6, _v.z + rnd(-2, 2), rnd(-3, 3), rnd(2, 4), rnd(-3, 3), rnd(0.6, 1.2), 0.8, 2.6, .9, .95, 1, 0.5, 9, 1);
    }
    if (u.parts.dish) u.parts.dish.rotation.y += dt * 1.6;
    if (u.parts.lamp) u.parts.lamp.visible = (W.time % 1.4) < 0.15;
    // damage smoke: the more hurt, the more it burns
    const hurt = 1 - u.hp / u.hpMax;
    if (hurt > 0.25 && Math.random() < hurt * 0.5 && u.sinking === undefined) { toWorld(u, rnd(-8, 8), u.dims.DECK + 1, rnd(-40, 40)); fx.trail(_v.x, _v.y, _v.z, 2 + hurt * 3); if (hurt > 0.55) fx.add.spawn(_v.x, _v.y, _v.z, 0, 2, 0, 0.5, 2.4, 0.6, 1, .5, .1, 0.8, -1.5, 1); }
  }

  // ------------------------------------------------------------------------------------- aircraft
  function makeAir(type, side, x, y, z, extra = {}) {
    const m = type === 'drone' ? buildDrone() : type === 'transport' ? buildTransport() : buildGunship(side);
    const hp = { drone: 5, transport: 7, gunship: 3, escort: 4 }[type];
    const u = { type, side, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), yaw: 0, hp, hpMax: hp, mesh: m.group, parts: m, r: type === 'transport' ? 4.5 : 3.2, cd: rnd(1, 2.5), ph: rnd(6.28), state: 'go', ...extra };
    m.group.position.copy(u.p); scene.add(m.group); W.units.push(u); return u;
  }
  function launchPoint(side) {   // from the carrier deck if it is afloat, else the HQ pad
    const c = side === 1 ? W.carrier : W.enemyCarrier;
    if (c && !c.sinking && c.sinking === undefined) return [c.p.x, CARRIER.DECK + 4, c.p.z];
    const hq = W.islands.find(I => I.kind === 'hq' && I.owner0 === side); return [hq.pad.x, hq.pad.h + 4, hq.pad.z];
  }
  W.sendDrone = I => {
    if (W.P.mat < COST.drone) return 'NOT ENOUGH MATERIEL';
    if (I.owner === 1) return `${I.name} IS ALREADY OURS`;
    if (I.cave) return 'CAVE ISLANDS: STEAL THE POD FROM THE CAVE';
    if (W.units.filter(u => u.type === 'drone' && !u.dead).length >= 3) return 'THREE DRONES ALREADY OUT';
    W.P.mat -= COST.drone; const [x, y, z] = launchPoint(1); makeAir('drone', 1, x, y, z, { target: I });
    sfx.dock(); return `CAPTURE DRONE LAUNCHED  -  ${I.name}`;
  };
  W.orderAA = I => {
    if (I.owner !== 1) return 'GUNS CAN ONLY GO ON OUR ISLANDS';
    if (W.P.mat < COST.aa) return 'NOT ENOUGH MATERIEL';
    const s = buildAA(I, 1); if (!s) return `${I.name}: NO ROOM FOR MORE GUNS`;
    W.P.mat -= COST.aa; s.building = 12; return `AA GUN GOING UP ON ${I.name}`;
  };
  function flyTo(u, tx, ty, tz, sp, dt, k = 1.4) {
    const dx = tx - u.p.x, dz = tz - u.p.z, d = Math.hypot(dx, dz) || 1, s = Math.min(sp, d * 0.8);
    _w.set(dx / d * s, (ty - u.p.y) * 1.2, dz / d * s);
    u.v.lerp(_w, 1 - Math.exp(-k * dt)); u.p.addScaledVector(u.v, dt);
    const floor = Math.max(terrainH(u.p.x, u.p.z), 0, W.deckY(u.p.x, u.p.z)) + 2.5; if (u.p.y < floor) { u.p.y = floor; u.v.y = Math.max(0, u.v.y); }
    if (Math.hypot(u.v.x, u.v.z) > 2) u.yaw += angDiff(u.yaw, Math.atan2(-u.v.x, -u.v.z)) * Math.min(1, 3 * dt);
    return d;
  }
  const cruise = (x, z, alt) => Math.max(terrainH(x, z), 0, W.deckY(x, z)) + alt;
  function updateAir(u, dt, pl) {
    u.ph += dt;
    if (u.dying) {
      u.v.y -= 15 * dt; u.p.addScaledVector(u.v, dt); u.mesh.rotation.y += dt * 8; u.mesh.rotation.z += dt * 2;
      fx.add.spawn(u.p.x, u.p.y, u.p.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.25, 0.5), 1.4, 0.4, 1, rnd(.4, .6), .1, 0.9, -1, 1); fx.trail(u.p.x, u.p.y, u.p.z, 1.3);
      const gy = Math.max(terrainH(u.p.x, u.p.z), 0, W.deckY(u.p.x, u.p.z));
      if (u.p.y < gy + 0.5) {
        const wet = isWater(u.p.x, u.p.z) && W.deckY(u.p.x, u.p.z) < 0; fx.explode(u.p.x, gy, u.p.z, u.type === 'transport' ? 2.6 : 2, { fire: wet ? 0 : 45, oil: wet, debris: 9, color: u.side === 1 ? 0x2a3f55 : 0x992222 }); boomAt(u.p.x, gy, u.p.z, 0.9);
        blast(u.p.x, gy + 1, u.p.z, 6, 3, 0); u.dead = true;
      }
      return;
    }
    if (u.type === 'gunship') updateGunship(u, dt, pl);
    else if (u.type === 'escort') updateEscort(u, dt, pl);
    else updateLander(u, dt);
    if (u.parts.rotors) for (const r of u.parts.rotors) r.rotation.y += dt * 30;
    if (u.parts.lamp) u.parts.lamp.visible = (W.time % 1) < 0.15;
    if (u.hp < u.hpMax * 0.5 && Math.random() < 0.4) fx.trail(u.p.x, u.p.y, u.p.z, 0.9);
    u.mesh.position.copy(u.p); u.mesh.rotation.y = u.type === 'gunship' || u.type === 'escort' ? u.mesh.rotation.y + dt * 2 : u.yaw;
    if (u.type !== 'gunship' && u.type !== 'escort') { u.mesh.rotation.x = clamp(-u.v.dot(_w.set(fwdX(u.yaw), 0, fwdZ(u.yaw))) * 0.015, -0.3, 0.3); }
  }
  // drones (ours) and transports (theirs): fly to the island, land on the pad, hold it until it flips
  function updateLander(u, dt) {
    const I = u.target;
    if (!I || I.owner === u.side) {   // job done or someone beat us to it: pick another or go home
      const next = u.side === 2 ? pickExpansion() : null;
      if (next && u.side === 2) { u.target = next; u.landed = false; return; }
      u.target = null; const [x, y, z] = launchPoint(u.side);
      const d = flyTo(u, x, cruise(u.p.x, u.p.z, 30), z, 20, dt); if (d < 12) u.dead = true;   // stowed back aboard
      return;
    }
    const p = I.pad, d = Math.hypot(p.x - u.p.x, p.z - u.p.z);
    if (d > 6) { flyTo(u, p.x, d > 60 ? cruise(u.p.x, u.p.z, 30) : p.h + 8, p.z, u.type === 'drone' ? 24 : 19, dt); u.landed = false; return; }
    // over the pad: settle and hold
    u.p.x += (p.x - u.p.x) * Math.min(1, 2 * dt); u.p.z += (p.z - u.p.z) * Math.min(1, 2 * dt);
    const gy = p.h + (u.type === 'transport' ? 1.9 : 1.2); u.p.y += (gy - u.p.y) * Math.min(1, 2 * dt); u.v.multiplyScalar(Math.exp(-3 * dt));
    u.landed = Math.abs(u.p.y - gy) < 0.5;
  }
  // enemy gunship: hunt the player when close, otherwise strike the assigned target or guard its patch
  function updateGunship(u, dt, pl) {
    u.retarget = (u.retarget || 0) - dt;
    if (u.retarget <= 0) {
      u.retarget = 1;
      const pd = pl.alive && !pl.inCave ? pl.pos.distanceTo(u.p) : 1e9;
      if (pd < (u.target === 'player' ? 260 : 170)) u.target = 'player';
      else if (u.target === 'player') u.target = null;
      if (u.target && u.target !== 'player' && (u.target.dead || u.target.gone || (u.target.side !== undefined && u.target.side !== 1))) u.target = null;
      if (!u.target) {
        let best = null, bd = 160;
        for (const o of W.units) if (o.side === 1 && !o.dead && !o.dying && (o.type === 'drone' || o.type === 'escort') && o.p.distanceTo(u.p) < bd) { best = o; bd = o.p.distanceTo(u.p); }
        if (best) u.target = best; else if (u.raid) u.target = u.raid.dead || u.raid.gone || u.raid.side !== 1 ? (u.raid = null) : u.raid;
      }
    }
    let tp = null;
    if (u.target === 'player') tp = pl.pos;
    else if (u.target) tp = u.target.p || _v.set(u.target.x, u.target.y + u.target.h, u.target.z);
    if (tp) {
      const tx = tp.x, ty = tp.y, tz = tp.z;
      // circle-strafe at 40-60 m
      const a = u.ph * 0.5 + u.id, R = 48;
      flyTo(u, tx + Math.cos(a) * R, Math.max(cruise(u.p.x, u.p.z, 14), ty + 6 + Math.sin(u.ph) * 4), tz + Math.sin(a) * R, 17 + W.time / 120, dt, 1.6);
      u.cd -= dt;
      const d = Math.hypot(tx - u.p.x, ty - u.p.y, tz - u.p.z);
      if (u.cd <= 0 && d < 110) {
        u.cd = Math.max(0.8, 2.2 - W.time / 400) + rnd(0.8);
        const tv = u.target === 'player' ? pl.vel : u.target.v || _w.set(0, 0, 0), t = d / 55;
        _v.set(tx + tv.x * t * 0.6 + rnd(-3, 3), ty + tv.y * t * 0.6 + rnd(-2, 2), tz + tv.z * t * 0.6 + rnd(-3, 3)).sub(u.p).normalize().multiplyScalar(55);
        shoot('b', 2, u.p.x, u.p.y - 0.8, u.p.z, _v.x, _v.y, _v.z, 3); if (hear(u.p.x, u.p.y, u.p.z, 260) > 0) sfx.enemyShot();
      }
    } else {   // guard: orbit the home point
      const hx = u.home[0] + Math.cos(u.ph * 0.15 + u.id) * 70, hz = u.home[1] + Math.sin(u.ph * 0.15 + u.id) * 70;
      flyTo(u, hx, cruise(u.p.x, u.p.z, 26 + Math.sin(u.ph) * 4), hz, 12, dt);
    }
  }
  // our escort fighters: fly in formation off the helicopter's wing and go after enemy aircraft that come near it
  function updateEscort(u, dt, pl) {
    const anchor = pl.alive && !pl.inCave ? pl.pos : (W.carrier && W.carrier.sinking === undefined ? W.carrier.p : null);
    u.retarget = (u.retarget || 0) - dt;
    if (u.retarget <= 0) {
      u.retarget = 0.8; u.target = null; let bd = 190;
      if (anchor) for (const o of W.units) if (o.side === 2 && o.p && !o.dims && !o.dead && !o.dying) { const d = o.p.distanceTo(anchor); if (d < bd) { bd = d; u.target = o; } }
    }
    if (u.target && (u.target.dead || u.target.dying)) u.target = null;
    if (u.target) {
      const t = u.target, a = u.ph * 0.7 + u.slot * 2;
      flyTo(u, t.p.x + Math.cos(a) * 30, Math.max(cruise(u.p.x, u.p.z, 10), t.p.y + 3), t.p.z + Math.sin(a) * 30, 26, dt, 2);
      u.cd -= dt; const d = t.p.distanceTo(u.p);
      if (u.cd <= 0 && d < 100) { u.cd = 0.5 + rnd(0.3); const tt = d / 70; _v.set(t.p.x + t.v.x * tt - u.p.x, t.p.y + t.v.y * tt - u.p.y, t.p.z + t.v.z * tt - u.p.z).normalize().multiplyScalar(70); shoot('b', 1, u.p.x, u.p.y, u.p.z, _v.x, _v.y, _v.z, 1.8); }
    } else if (anchor) {   // formation: off the helicopter's quarter
      const a = u.slot * 2.1 + W.time * 0.25, ox = Math.cos(a) * 16, oz = Math.sin(a) * 16;
      flyTo(u, anchor.x + ox, Math.max(cruise(u.p.x, u.p.z, 8), anchor.y + 5), anchor.z + oz, 30, dt, 1.8);
    }
  }
  W.sendEscort = () => {
    const n = W.units.filter(u => u.type === 'escort' && !u.dead && !u.dying).length;
    if (n >= 3) return 'THREE ESCORTS ALREADY UP';
    if (W.P.mat < COST.escort) return 'NOT ENOUGH MATERIEL';
    W.P.mat -= COST.escort; const [x, y, z] = launchPoint(1); const u = makeAir('escort', 1, x, y + 3, z); u.slot = n; sfx.dock(); return 'ESCORT FIGHTER LAUNCHED  -  IT WILL JOIN YOU';
  };
  W.spawnGunship = (side, near, raid) => {
    const [x, y, z] = near || launchPoint(2), u = makeAir('gunship', 2, x + rnd(-6, 6), y + 6, z + rnd(-6, 6));
    u.id = rnd(6.28); u.home = [x, z]; u.raid = raid || null; u.target = raid || null; return u;
  };

  // ------------------------------------------------------------------------------------- projectiles
  // kinds: b (bullet), ciws (fast tracer), flak (bursts at its fuse), rocket, bomb, shell (artillery)
  function shoot(kind, side, x, y, z, vx, vy, vz, life, extra) {
    const p = { kind, side, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), life, ...extra };
    if (kind === 'bomb') { p.mesh = new THREE.Mesh(bombGeo, bombMat); scene.add(p.mesh); }
    W.proj.push(p); return p;
  }
  const bombGeo = new THREE.CapsuleGeometry(0.22, 0.7, 3, 6).rotateX(Math.PI / 2), bombMat = new THREE.MeshPhongMaterial({ color: 0x2d3326 });
  W.shoot = shoot;
  W.fireBullet = (p, v) => shoot('b', 1, p.x, p.y, p.z, v.x, v.y, v.z, 1.8);
  W.fireRocket = (p, v) => { sfx.rocket?.(); return shoot('rocket', 1, p.x, p.y, p.z, v.x, v.y, v.z, 3); };
  W.dropBomb = (p, v) => { sfx.bombDrop?.(); return shoot('bomb', 1, p.x, p.y, p.z, v.x, v.y, v.z, 12); };
  // everything that can be hit, of the side opposite to `side`
  function* targets(side) {
    for (const u of W.units) if (u.side !== side && !u.dead && !u.dying && !u.gone) yield u;
    for (const I of W.islands) for (const s of I.structs) if (!s.dead && s.side !== side && s.side !== 0) yield s;
  }
  function hitTest(x, y, z, side, rad = 0) {
    for (const t of targets(side)) {
      if (t.dims) {   // ships: oriented box, guns first
        if (Math.abs(x - t.p.x) > 70 || Math.abs(z - t.p.z) > 70 || t.sinking !== undefined) continue;
        for (const g of t.guns) if (!g.dead) { g.mesh.getWorldPosition(_w); if (_w.distanceToSquared(_v.set(x, y, z)) < (2.4 + rad) ** 2) return g; }
        const [lx, lz] = toLocal(t, x, z), D = t.dims;
        if (Math.abs(lx) < D.W / 2 + rad && Math.abs(lz) < D.L / 2 + rad && y < D.DECK + 3 + t.p.y + rad && y > -3) return t;
        if (t.type === 'carrier' && Math.abs(lx - D.TOWER_X) < 3 + rad && Math.abs(lz - D.TOWER_Z) < 9 + rad && y < D.DECK + D.TOWER_H + rad) return t;
        continue;
      }
      if (t.p) { if (t.p.distanceToSquared(_v.set(x, y, z)) < (t.r + rad) ** 2) return t; continue; }
      const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz > (t.r + rad) ** 2) continue;
      if (y > t.y - 1 && y < t.y + t.h * 2 + rad) return t;
    }
    return null;
  }
  function damage(t, dmg, side) {
    if (t.ship) {   // a ship's gun mount
      t.hp -= dmg; if (t.hp <= 0 && !t.dead) { t.dead = true; t.mesh.getWorldPosition(_w); fx.explode(_w.x, _w.y + 1, _w.z, 1.4, { debris: 5 }); t.mesh.visible = false; t.rebuild = 45; boomAt(_w.x, _w.y, _w.z, 0.5); if (t.ship.side === 2) { ctx.addScore(300); feed(`${t.ship.type === 'carrier' ? 'KRAKEN' : 'BATTLESHIP'} GUN DESTROYED`, 'good'); } }
      t.ship.hp -= dmg * 0.25; checkShip(t.ship); return;
    }
    if (t.dims) { t.hp -= dmg; t.lastHit = W.time; checkShip(t); return; }
    if (t.p) {   // aircraft
      t.hp -= dmg; if (t.hp <= 0 && !t.dying) { t.dying = true; t.v.y = 3; fx.explode(t.p.x, t.p.y, t.p.z, 0.9, { debris: 3, color: t.side === 1 ? 0x2a3f55 : 0x992222 }); boomAt(t.p.x, t.p.y, t.p.z, 0.5); if (t.side === 2) ctx.addScore(t.type === 'transport' ? 400 : 150); if (t.type === 'transport') { feed('ENEMY TRANSPORT SHOT DOWN', 'good'); if (t.target) t.target.lostT = W.time; } if (t.type === 'drone') feed('CAPTURE DRONE LOST', 'bad'); }
      return;
    }
    t.hp -= dmg; t.I.lastHit = W.time; if (t.hp <= 0) killStruct(t);
  }
  function checkShip(u) {
    if (u.hp > 0 || u.sinking !== undefined) return;
    u.sinking = 0; u.path = [];
    for (let i = 0; i < 6; i++) setTimeout(() => { toWorld(u, rnd(-10, 10), u.dims.DECK, rnd(-u.dims.L / 2, u.dims.L / 2)); fx.explode(_v.x, _v.y, _v.z, rnd(2.5, 4), { debris: 10, color: 0x4a4440, oil: true }); boomAt(_v.x, _v.y, _v.z, 1.2); }, i * 450);
    for (let i = 0; i < 4; i++) { const e = fx.burn(0, 0, 0, 60, 2.5, u.p); e.ox = rnd(-8, 8); e.oy = u.dims.DECK; e.oz = rnd(-40, 40); }
    for (let i = 0; i < 6; i++) fx.water.add({ x: u.p.x + rnd(-30, 30), y: 0.12, z: u.p.z + rnd(-30, 30), size: rnd(14, 26), grow: 0.25, a: 0.85, life: 300, tile: 3, fadeIn: 3 });
    if (u.type === 'battleship') { W.battleship = null; ctx.addScore(5000); feed('ENEMY BATTLESHIP SUNK', 'good'); }
    else if (u.type === 'freighter') { const salvage = Math.round(u.cargo * 0.5); W.P.mat += salvage; ctx.addScore(800); feed(`ENEMY FREIGHTER SUNK  -  ${salvage} MATERIEL SALVAGED`, 'good'); }
    else if (u.side === 2) { ctx.addScore(10000); feed('THE KRAKEN IS SINKING', 'good'); end('win', 'ENEMY CARRIER SUNK'); }
    else { feed('ALBATROSS IS SINKING', 'bad'); end('lose', 'OUR CARRIER WAS SUNK'); }
  }
  // explosion damage to everything of the other side in radius r (and to the player helicopter for enemy blasts)
  function blast(x, y, z, r, dmg, side) {
    for (const t of targets(side)) {
      let d;
      if (t.ship || t.dims) { const tp = t.ship ? t.mesh.getWorldPosition(_w) : t.p; d = Math.hypot(x - tp.x, z - tp.z); if (t.dims) { const [lx, lz] = toLocal(t, x, z); d = Math.hypot(Math.max(0, Math.abs(lx) - t.dims.W / 2), Math.max(0, Math.abs(lz) - t.dims.L / 2), Math.max(0, y - t.dims.DECK - 3)); } }
      else if (t.p) d = t.p.distanceTo(_v.set(x, y, z)) - t.r;
      else d = Math.max(0, Math.hypot(x - t.x, z - t.z) - t.r * 0.7);
      if (d < r) damage(t, dmg * (1 - 0.6 * d / r), side);
    }
    const pl = ctx.player();
    if (side !== 1 && pl.alive && !pl.inCave) { const d = pl.pos.distanceTo(_v.set(x, y, z)); if (d < r) ctx.hurtPlayer(0.12 + 0.3 * dmg / 20 * (1 - d / r), 'BLAST'); }
  }
  W.blast = blast;
  function updateProj(dt, pl) {
    for (let i = W.proj.length - 1; i >= 0; i--) {
      const b = W.proj[i]; b.life -= dt;
      const grav = b.kind === 'bomb' || b.kind === 'shell' ? 9 : b.kind === 'rocket' ? 1.2 : b.kind === 'flak' ? 0 : 2.2;
      b.v.y -= grav * dt; b.p.addScaledVector(b.v, dt);
      const { x, y, z } = b.p;
      // visuals: tracers are a few short-lived sparks along the path
      if (b.kind === 'b' || b.kind === 'ciws') { const own = b.side === 1; fx.add.spawn(x, y, z, 0, 0, 0, 0.05, own ? 0.9 : 1.1, 0.6, own ? .5 : 1, own ? 1 : .55, own ? 1 : .2, 1); }
      else if (b.kind === 'rocket') { fx.add.spawn(x, y, z, 0, 0, 0, 0.08, 1.2, 0.5, 1, .7, .3, 1); fx.mix.spawn(x, y, z, rnd(-.4, .4), rnd(-.2, .4), rnd(-.4, .4), rnd(1.4, 2.4), 0.5, 2.4, .75, .75, .75, 0.55, -0.2, 1.2, 0.5); }
      else if (b.kind === 'shell') fx.add.spawn(x, y, z, 0, 0, 0, 0.06, 1.4, 0.8, 1, .8, .5, 1);
      else if (b.kind === 'flak') fx.add.spawn(x, y, z, 0, 0, 0, 0.04, 0.5, 0.3, 1, .9, .5, 1);
      if (b.mesh) { b.mesh.position.copy(b.p); b.mesh.lookAt(_w.copy(b.p).add(b.v)); }
      const gy = Math.max(terrainH(x, z), 0), dy = W.deckY(x, z, b.side), floor = Math.max(gy, dy);   // our own decks don't stop our rounds
      let done = b.life <= 0, hit = null;
      if (b.kind === 'flak') {
        if (b.life <= 0) {   // burst
          fx.flak(x, y, z); if (hear(x, y, z, 300) > 0) sfx.flak?.();
          for (const t of targets(b.side)) if (t.p && !t.dims && t.p.distanceTo(b.p) < 8) damage(t, 1.2, b.side);
          if (b.side === 2 && pl.alive && !pl.inCave && pl.pos.distanceTo(b.p) < 7) ctx.hurtPlayer(0.13, 'FLAK');
        }
      } else if (!done) {
        if (y < floor) done = true;
        else {
          hit = hitTest(x, y, z, b.side, b.kind === 'rocket' ? 0.5 : 0);
          if (hit) done = true;
          else if (b.side === 2 && b.kind !== 'shell' && pl.alive && !pl.inCave && pl.pos.distanceToSquared(b.p) < 2.6 * 2.6) { ctx.hurtPlayer(0.2, 'HIT'); done = true; }
        }
        if (done) {
          const wet = y < floor + 0.5 && isWater(x, z) && dy < 0;
          const ship = dy > gy + 0.5 && y < dy + 1 ? W.shipAt(x, z) : null;   // landed on a deck: a direct hit
          if (ship && ship.side !== b.side && ship.sinking === undefined) damage(ship, { rocket: 5, bomb: 24, shell: 18 }[b.kind] || 0, b.side);
          if (b.kind === 'b' || b.kind === 'ciws') { if (hit) { damage(hit, b.kind === 'ciws' ? 0.5 : 1, b.side); fx.impact(x, y, z, 'metal'); } else fx.impact(x, floor, z, wet ? 'water' : 'ground'); }
          else if (b.kind === 'rocket') { fx.explode(x, Math.max(y, floor), z, 1.1, { debris: 2 }); boomAt(x, y, z, 0.45); if (hit) damage(hit, 4, b.side); blast(x, y, z, 6, 4, b.side); }
          else if (b.kind === 'bomb') { fx.explode(x, Math.max(y, floor), z, 2.8, { debris: 8, crater: 3.6, fire: wet ? 0 : 20 }); boomAt(x, y, z, 1.3); blast(x, Math.max(y, floor), z, 12, 20, b.side); }
          else if (b.kind === 'shell') { fx.explode(x, Math.max(y, floor), z, 2.4, { debris: 5, crater: 3 }); boomAt(x, y, z, 1); blast(x, Math.max(y, floor), z, 10, 16, b.side); }
        }
      }
      if (done) { if (b.mesh) scene.remove(b.mesh); W.proj[i] = W.proj[W.proj.length - 1]; W.proj.pop(); }
    }
  }
  // AA guns (on islands and ships): lead the target, fire flak bursts; close in, a stream of tracer
  function enemiesOf(side, pl) {
    const list = [];
    for (const u of W.units) if (u.side !== side && !u.dead && !u.dying && u.p && !u.dims) list.push(u);
    if (side === 2 && pl.alive && !pl.inCave) list.push({ p: pl.pos, v: pl.vel, player: true });
    return list;
  }
  function gunFire(g, gx, gy, gz, side, dt, foes, range) {
    g.cd -= dt; if (g.cd > 0) return;
    let best = null, bd = range;
    for (const f of foes) { const d = Math.hypot(f.p.x - gx, f.p.y - gy, f.p.z - gz); if (d < bd && f.p.y > gy - 4) { bd = d; best = f; } }
    if (!best) { g.cd = 0.5; return; }
    const t = bd / 90;
    const ax = best.p.x + best.v.x * t - gx, ay = best.p.y + best.v.y * t - gy, az = best.p.z + best.v.z * t - gz, al = Math.hypot(ax, ay, az) || 1;
    g.aimYaw = Math.atan2(-ax, -az); g.aimPitch = Math.asin(clamp(ay / al, -1, 1));
    if (bd < 45) {   // tracer stream
      g.cd = side === 1 ? 0.12 : 0.2;
      const sp = 140, e = side === 1 ? 0.02 : 0.05;
      shoot('ciws', side, gx, gy, gz, (ax / al + rnd(-e, e)) * sp, (ay / al + rnd(-e, e)) * sp, (az / al + rnd(-e, e)) * sp, 0.6);
    } else {
      g.cd = side === 1 ? 0.7 : 1.1 + rnd(0.6) - Math.min(0.5, W.time / 900);
      const err = (best.player ? 7 : 5) * (bd / 100);
      const bx = gx + ax + rnd(-err, err), by = gy + ay + rnd(-err, err), bz = gz + az + rnd(-err, err), d2 = Math.hypot(bx - gx, by - gy, bz - gz);
      shoot('flak', side, gx, gy, gz, (bx - gx) / d2 * 90, (by - gy) / d2 * 90, (bz - gz) / d2 * 90, d2 / 90);
      fx.add.spawn(gx, gy, gz, 0, 0, 0, 0.08, 2.2, 1, 1, .8, .4, 1);
    }
  }
  function updateGuns(dt, pl, peace) {
    const foes = [null, enemiesOf(1, pl), enemiesOf(2, pl)];
    for (const I of W.islands) for (const s of I.structs) {
      if (s.kind !== 'aa' || s.dead || (peace && s.side === 2)) continue;
      if (s.building > 0) { s.building -= dt; s.mesh.scale.setScalar(clamp(1 - s.building / 12, 0.05, 1)); if (s.building <= 0) { s.mesh.scale.setScalar(1); if (s.side === 1) feed(`${I.name}: AA GUN READY`, 'good'); } continue; }
      gunFire(s, s.x, s.y + 2.4, s.z, s.side, dt, foes[s.side], 150);
      const ud = s.mesh.userData; if (s.aimYaw !== undefined) { ud.yaw.rotation.y += angDiff(ud.yaw.rotation.y, s.aimYaw) * Math.min(1, 5 * dt); ud.pitch.rotation.x += (s.aimPitch - ud.pitch.rotation.x) * Math.min(1, 5 * dt); }
    }
    for (const u of W.units) if (u.dims && u.sinking === undefined && !(peace && u.side === 2)) for (const g of u.guns) {
      if (g.dead) { g.rebuild -= dt; if (g.rebuild <= 0 && store(u.side).mat >= 10) { store(u.side).mat -= 10; g.dead = false; g.hp = g.max; g.mesh.visible = true; } continue; }
      g.mesh.getWorldPosition(_w); gunFire(g, _w.x, _w.y + 2, _w.z, u.side, dt, foes[u.side], g.range);
      const ud = g.mesh.userData; if (g.aimYaw !== undefined) { ud.yaw.rotation.y += angDiff(ud.yaw.rotation.y, g.aimYaw - u.yaw) * Math.min(1, 5 * dt); ud.pitch.rotation.x += (g.aimPitch - ud.pitch.rotation.x) * Math.min(1, 5 * dt); }
    }
  }

  // ------------------------------------------------------------------------------------- capture, economy
  function updateCapture(dt, pl) {
    for (const I of W.islands) {
      const p = I.pad; let side = 0, rate = 0, who = '';
      if (pl.alive && !pl.inCave && pl.landed && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < p.r + 1 && I.owner !== 1 && !I.cave) { side = 1; rate = 1 / CAP_TIME.heli; who = 'heli'; }
      for (const u of W.units) if (u.landed && u.target === I && !u.dead && !u.dying && u.side !== I.owner) {
        if (I.cave && u.side === 1) continue;
        if (I.kind === 'hq' && u.side === 2) continue;   // our HQ can't be taken by transports
        if (!side || side === u.side) { side = u.side; rate += 1 / CAP_TIME[u.type]; who = who || u.type; }
      }
      const guarded = W.aliveAA(I) > 0;
      if (!side || guarded) { if (I.cap && (!side || guarded)) { I.cap.t = Math.max(0, I.cap.t - dt * 0.2); if (I.cap.t <= 0) I.cap = null; } if (side && guarded) I.capBlocked = W.time; continue; }
      if (!I.cap || I.cap.side !== side) { I.cap = { side, t: 0 }; if (side === 2) feed(`ENEMY LANDING ON ${I.name}`, 'bad'); }
      I.cap.t += rate * dt;
      if (I.cap.t >= 1) {
        W.setOwner(I, side, who === 'heli' ? 'BY HELICOPTER' : '');
        for (const u of W.units) if (u.target === I && u.landed) u.dead = true;   // the lander stays as the garrison
      }
    }
  }
  function updateEconomy(dt) {
    W.econT += dt; if (W.econT < 1) return; const k = W.econT; W.econT = 0;
    for (const I of W.islands) {
      if (!I.owner) continue;
      const S = store(I.owner), pk = PROD_KIND[I.kind], prodOk = !pk || I.structs.some(s => s.kind === pk && !s.dead), hqOk = I.structs.some(s => s.kind === 'hq' && !s.dead);
      const P = PROD[I.kind];
      if (prodOk && hqOk) {
        if (I.owner === 2 && I.kind !== 'hq') I.stock = (I.stock || 0) + ((P.mat || 0) + (P.fuel || 0) * 0.5) * k;   // enemy outposts ship their output by freighter
        else { if (P.fuel) S.fuel = Math.min(S.fuelMax ?? 1e9, S.fuel + P.fuel * k); if (P.mat) S.mat += P.mat * k; }
      }
      if (I.owner === 2 && I.kind === 'factory' && prodOk) W.E.bship += 0.08 * k;
      // rebuild flattened buildings when the owner can pay for it and nobody has hit the island for a while
      for (const s of I.structs) if (s.dead && s.kind !== 'aa' && s.side === I.owner) {
        s.rebuild -= k;
        if (s.rebuild <= 0 && W.time - I.lastHit > 30 && S.mat >= 20) { S.mat -= 20; restoreStruct(s); if (I.owner === 1) feed(`${I.name}: ${s.kind.toUpperCase()} REBUILT`, 'good'); }
      }
    }
    if (W.islands.find(I => I.name === 'IRONHOLD').yard && !W.islands.find(I => I.name === 'IRONHOLD').yard.dead && W.islands.find(I => I.name === 'IRONHOLD').owner === 2) W.E.bship += 0.06 * k;
    if (W.battleship) W.E.bship = Math.min(W.E.bship, 99);
    // carriers patch themselves up with materiel when nobody is shooting at them
    for (const c of [W.carrier, W.enemyCarrier]) if (c && c.sinking === undefined && c.hp < c.hpMax && W.time - (c.lastHit ?? -99) > 15) { const S = store(c.side), fix = Math.min(c.hpMax - c.hp, 3 * k, S.mat * 4); c.hp += fix; S.mat -= fix / 4; }
  }

  // ------------------------------------------------------------------------------------- the enemy commander
  function pickExpansion(fromX, fromZ) {
    const c = W.enemyCarrier && W.enemyCarrier.sinking === undefined ? W.enemyCarrier.p : null;
    const ox = fromX ?? (c ? c.x : 420), oz = fromZ ?? (c ? c.z : -400);
    let best = null, bs = 1e9;
    for (const I of W.islands) {
      if (I.owner === 2 || I.kind === 'hq') continue;
      if (I.owner === 1 && W.aliveAA(I) > 0) continue;   // guarded: needs a raid first
      if (W.units.some(u => u.type === 'transport' && u.target === I && !u.dead)) continue;
      if (W.time - (I.lostT ?? -1e9) < 100) continue;   // lost a transport there recently: wait for a raid to clear the way
      let danger = 0;   // our guns covering the pad
      for (const J of W.islands) for (const g of J.structs) if (g.kind === 'aa' && !g.dead && g.side === 1 && Math.hypot(g.x - I.pad.x, g.z - I.pad.z) < 160) danger++;
      if (W.carrier && W.carrier.sinking === undefined && Math.hypot(W.carrier.p.x - I.pad.x, W.carrier.p.z - I.pad.z) < 170) danger += 3;
      const sc = Math.hypot(I.x - ox, I.z - oz) * (I.owner === 1 ? 0.8 : 1) * (I.kind === 'factory' ? 0.85 : 1) * (1 + danger);
      if (sc < bs) { bs = sc; best = I; }
    }
    return best;
  }
  function think(pl) {
    const E = W.E, ec = W.enemyCarrier && W.enemyCarrier.sinking === undefined ? W.enemyCarrier : null;
    const air = W.units.filter(u => u.side === 2 && u.p && !u.dims && !u.dead && !u.dying);
    const guns = air.filter(u => u.type === 'gunship'), trans = air.filter(u => u.type === 'transport');
    const cap = Math.min(12, 3 + Math.floor(W.time / 110)), mine = W.islands.filter(I => I.owner === 2);
    // 1. defend: the player is poking at one of our islands or the carrier
    if (pl.alive && !pl.inCave) {
      const near = [...mine.map(I => [I.x, I.z]), ...(ec ? [[ec.p.x, ec.p.z]] : [])].some(([x, z]) => Math.hypot(pl.pos.x - x, pl.pos.z - z) < 260);
      const hunting = guns.filter(g => g.target === 'player').length;
      if (near && hunting < 2 + Math.floor(W.time / 300) && guns.length < cap && E.mat >= 12) { E.mat -= 12; W.spawnGunship(2, nearestLaunch(pl.pos.x, pl.pos.z)).target = 'player'; }
    }
    // 2. expand: send transports at neutral (or undefended player) islands
    W.transT -= 2;
    if (trans.length < 2 && E.mat >= 25 && W.transT <= 0) { const I = pickExpansion(); if (I) { W.transT = Math.max(18, 40 - W.time / 30); E.mat -= 25; const [x, y, z] = launchPoint(2); makeAir('transport', 2, x, y, z, { target: I }); } }
    // 3. fortify: guns on islands that have few
    for (const I of mine) if (E.mat >= 30 && W.aliveAA(I) + I.structs.filter(s => s.kind === 'aa' && s.building > 0).length < (I.kind === 'factory' || I.kind === 'hq' ? 3 : 2)) { const s = buildAA(I, 2); if (s) { E.mat -= 30; s.building = 14; } break; }
    // 4. raid: every so often, a strike group at the player's weakest guarded island or the carrier
    W.raidT -= 2;
    if (W.raidT <= 0 && E.mat >= 36 && guns.length < cap) {
      W.raidT = Math.max(50, 110 - W.time / 20);
      const ours = W.islands.filter(I => I.owner === 1 && I.kind !== 'hq');
      let tgt = null;
      if (ours.length && Math.random() < 0.65) { const I = ours.sort((a, b) => W.aliveAA(a) - W.aliveAA(b))[0]; tgt = I.structs.find(s => s.kind === 'aa' && !s.dead) || I.structs.find(s => !s.dead); }
      else if (W.carrier && W.carrier.sinking === undefined) tgt = W.carrier;
      if (tgt) { const n = 2 + Math.min(3, Math.floor(W.time / 240)); E.mat -= 12 * n; for (let i = 0; i < n; i++) W.spawnGunship(2, null, tgt); feed(tgt === W.carrier ? 'RADAR: ENEMY STRIKE INBOUND ON THE ALBATROSS' : `RADAR: ENEMY STRIKE HEADING FOR ${tgt.I.name}`, 'bad'); }
    }
    // 5. a couple of guards over the carrier
    if (ec && guns.filter(g => !g.target && Math.hypot(g.home[0] - ec.p.x, g.home[1] - ec.p.z) < 200).length < 2 && E.mat >= 12 && guns.length < cap) { E.mat -= 12; W.spawnGunship(2); }
    // 6. supply: a freighter takes an island's stockpile to the KRAKEN (or IRONHOLD)
    W.freightT -= 2;
    if (W.freightT <= 0) {
      W.freightT = 16;
      const I = mine.filter(I => (I.stock || 0) >= 18 && !W.units.some(u => u.type === 'freighter' && u.from === I)).sort((a, b) => b.stock - a.stock)[0];
      if (I) {
        const [x, z] = nav.nearestWater(I.x, I.z), f = makeShip('freighter', 2, x, z, rnd(6.283));
        f.cargo = I.stock; f.from = I; I.stock = 0; f.repath = 0;
      }
    }
    // 7. the battleship
    if (E.bship >= 100 && !W.battleship) {
      E.bship = 0; const I = W.islands.find(I => I.name === 'IRONHOLD'), y = I.yard || I;
      const [wx, wz] = nav.nearestWater(y.x + (0 - y.x) * 0.2, y.z + (0 - y.z) * 0.2);
      W.battleship = makeShip('battleship', 2, wx, wz, Math.atan2(-(0 - wx), -(0 - wz)));
      feed('ENEMY BATTLESHIP LAUNCHED  -  IT IS HUNTING THE ALBATROSS', 'bad'); sfx.alarm?.();
    }
    // the enemy carrier's course
    if (ec) {
      ec.plan = (ec.plan || 0) - 2;
      if (ec.plan <= 0 || !ec.path.length) {
        ec.plan = 25;
        let gx, gz;
        if (ec.hp < ec.hpMax * 0.35) { gx = 330; gz = -300; }
        else if (W.battleship || (E.mat > 160 && guns.length > 6)) { const c = W.carrier || { p: { x: 0, z: 0 } }; const a = Math.atan2(ec.p.z - c.p.z, ec.p.x - c.p.x); gx = c.p.x + Math.cos(a) * 330; gz = c.p.z + Math.sin(a) * 330; }
        else { const I = pickExpansion(ec.p.x, ec.p.z) || W.islands.find(I => I.name === 'CITADEL'); const a = Math.atan2(ec.p.z - I.z, ec.p.x - I.x); gx = I.x + Math.cos(a) * (I.r + 90); gz = I.z + Math.sin(a) * (I.r + 90); }
        const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz); ec.path = nav.path(ec.p.x, ec.p.z, wx, wz);
      }
    }
    if (W.battleship && W.battleship.sinking === undefined) {
      const b = W.battleship; b.plan = (b.plan || 0) - 2;
      if (W.carrier && (b.plan <= 0 || !b.path.length)) { b.plan = 15; const c = W.carrier.p, a = Math.atan2(b.p.z - c.z, b.p.x - c.x), gx = c.x + Math.cos(a) * 170, gz = c.z + Math.sin(a) * 170; const [wx, wz] = nav.wet(gx, gz) ? [gx, gz] : nav.nearestWater(gx, gz); b.path = nav.path(b.p.x, b.p.z, wx, wz); }
    }
  }
  function nearestLaunch(x, z) {
    let best = launchPoint(2), bd = Math.hypot(best[0] - x, best[2] - z);
    for (const I of W.islands) if (I.owner === 2 && I.structs.some(s => s.kind === 'hq' && !s.dead)) { const d = Math.hypot(I.pad.x - x, I.pad.z - z); if (d < bd) { bd = d; best = [I.pad.x, I.pad.h + 4, I.pad.z]; } }
    return best;
  }
  function freightDest() {
    const ec = W.enemyCarrier; if (ec && ec.sinking === undefined) return [ec.p.x, ec.p.z];
    const I = W.islands.find(I => I.name === 'IRONHOLD'); return nav.nearestWater(I.x - 150, I.z + 150);
  }
  function updateFreighters(dt) {
    for (const u of W.units) {
      if (u.type !== 'freighter' || u.sinking !== undefined || u.gone) continue;
      const [dx, dz] = freightDest(), d = Math.hypot(dx - u.p.x, dz - u.p.z);
      if (d < 75) { W.E.mat += u.cargo; scene.remove(u.mesh); u.gone = true; continue; }   // delivered
      u.repath -= dt; if (u.repath <= 0 || !u.path.length) { u.repath = 12; u.path = nav.path(u.p.x, u.p.z, dx, dz); }
    }
  }
  function updateBattleship(dt) {
    const b = W.battleship; if (!b || b.sinking !== undefined || !b.turrets) return;
    for (const t of b.turrets) {
      t.cd -= dt;
      let tgt = W.carrier && W.carrier.sinking === undefined && W.carrier.p.distanceTo(b.p) < 320 ? W.carrier.p : null;
      if (!tgt) { for (const I of W.islands) if (I.owner === 1) for (const s of I.structs) if (!s.dead && Math.hypot(s.x - b.p.x, s.z - b.p.z) < 260) { tgt = _w.set(s.x, s.y, s.z); break; } }
      if (!tgt) continue;
      toWorld(b, 0, BSHIP.DECK + 2, t.mesh.position.z);
      const yaw = Math.atan2(-(tgt.x - _v.x), -(tgt.z - _v.z)) - b.yaw; t.mesh.rotation.y += angDiff(t.mesh.rotation.y, yaw) * Math.min(1, 2 * dt);
      if (t.cd <= 0) {
        t.cd = 6 + rnd(3);
        const dx = tgt.x - _v.x + rnd(-14, 14), dz = tgt.z - _v.z + rnd(-14, 14), d = Math.hypot(dx, dz), T = 2 + d / 70;   // flight time: a high arc that clears the hills between
        shoot('shell', 2, _v.x, _v.y, _v.z, dx / T, (tgt.y + 6 - _v.y) / T + 0.5 * 9 * T, dz / T, T + 2);
        fx.flash(_v.x + fwdX(b.yaw + t.mesh.rotation.y) * 8, _v.y + 1, _v.z + fwdZ(b.yaw + t.mesh.rotation.y) * 8, 2.5); fx.mix.spawn(_v.x, _v.y + 2, _v.z, 0, 3, 0, 3, 3, 9, .5, .5, .5, 0.5, -0.3, 1); boomAt(_v.x, _v.y, _v.z, 0.6);
      }
    }
  }

  // ------------------------------------------------------------------------------------- public
  function end(result, why) { if (!W.over) { W.over = { result, why }; ctx.onEnd(result, why); } }
  W.visionSources = pl => {
    const s = [];
    if (pl.alive) s.push({ x: pl.pos.x, z: pl.pos.z, r: pl.inCave ? 60 : SIGHT.heli });
    for (const u of W.units) if (u.side === 1 && !u.dead && !u.gone) s.push({ x: u.p.x, z: u.p.z, r: u.dims ? SIGHT.carrier : SIGHT.drone });
    for (const I of W.islands) if (I.owner === 1) s.push({ x: I.x, z: I.z, r: I.kind === 'radar' && I.structs.some(q => q.kind === 'radar' && !q.dead) ? SIGHT.radar : SIGHT.island + I.r * 0.4 });
    return s;
  };
  W.reset = () => {
    for (const u of W.units) scene.remove(u.mesh); W.units.length = 0;
    for (const p of W.proj) if (p.mesh) scene.remove(p.mesh); W.proj.length = 0;
    islandGroup.clear(); fx.emitters.length = 0;
    for (const I of W.islands) { I.owner = I.owner0 ?? I.owner; I.lostT = -1e9; I.stock = 0; }
    buildIslands();
    W.E.fuel = 200; W.E.mat = 50; W.E.bship = 0; W.time = 0; W.over = null; W.raidT = 150; W.thinkT = 3; W.transT = 20; W.freightT = 30; W.battleship = null;
    W.carrier = makeShip('carrier', 1, ctx.carrierStart[0], ctx.carrierStart[1], ctx.carrierStart[2]);
    W.enemyCarrier = makeShip('carrier', 2, ctx.enemyStart[0], ctx.enemyStart[1], ctx.enemyStart[2]);
    for (const I of W.islands) ctx.onOwner(I, I.owner);
  };
  W.update = (dt, pl, peace) => {
    W.time += dt;
    for (const u of W.units) { if (u.dims) sailShip(u, dt); else updateAir(u, dt, pl); }
    {   // ships keep clear of each other (a gentle shove when two hulls would overlap)
      const sh = W.units.filter(u => u.dims && u.sinking === undefined);
      for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
        const a = sh[i], b = sh[j], dx = b.p.x - a.p.x, dz = b.p.z - a.p.z, d = Math.hypot(dx, dz) || 1, min = (a.dims.L + b.dims.L) * 0.42;
        if (d < min) { const k = Math.min(8, (min - d)) * dt / d; a.p.x -= dx * k; a.p.z -= dz * k; b.p.x += dx * k; b.p.z += dz * k; }
      }
    }
    for (let i = W.units.length - 1; i >= 0; i--) if (W.units[i].dead || W.units[i].gone) { const u = W.units[i]; if (!u.gone) scene.remove(u.mesh); W.units.splice(i, 1); }
    updateProj(dt, pl);
    updateGuns(dt, pl, peace);
    updateCapture(dt, pl);
    updateEconomy(dt);
    updateBattleship(dt); updateFreighters(dt);
    if (!peace) { W.thinkT -= dt; if (W.thinkT <= 0) { W.thinkT = 2; think(pl); } }
    // buildings animate
    for (const I of W.islands) for (const s of I.structs) {
      if (s.dead) continue; const ud = s.mesh.userData;
      if (ud.dish) ud.dish.rotation.y += dt * 1.2;
      if (ud.beam) ud.beam.rotation.z = Math.sin(W.time * 1.5 + s.x) * 0.25;
      if (ud.flag) ud.flag.rotation.y = Math.sin(W.time * 2 + s.z) * 0.3;
      if (ud.hull) ud.hull.scale.y = Math.max(0.01, W.E.bship / 100);
    }
  };
  W.setVisibility = fog => {   // enemy aircraft and ships only where we can see; buildings once explored
    for (const u of W.units) if (u.side === 2) { u.mesh.visible = fog.visibleAt(u.p.x, u.p.z); if (u.mesh.visible && u.type === 'freighter' && !u.spotted) { u.spotted = true; feed('RADAR: ENEMY FREIGHTER SPOTTED  -  SINK IT TO CUT THEIR SUPPLY'); } }
    for (const I of W.islands) { const ex = fog.exploredAt(I.x, I.z) || fog.exploredAt(I.pad.x, I.pad.z); for (const s of I.structs) { s.mesh.visible = !s.dead && ex; if (s.rubble) s.rubble.visible = ex; } if (fog.visibleAt(I.pad.x, I.pad.z)) I.seen = I.owner; }
  };
  W.damage = damage; W.hitTest = hitTest; W.pickExpansion = pickExpansion;
  return W;
}
