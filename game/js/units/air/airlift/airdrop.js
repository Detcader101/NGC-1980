// airdrop.js - AIR DROP: vehicles delivered to an island by a C-130 heavy-equipment drop, ordered from the command
// board (C on a vehicle's row with an island selected). The Marines' KC-130 (the dropship's airframe and model: c130fm.js
// on its autopilot, c130model.js) comes in from the task force's side at 1,100 ft over the drop zone at 130 KIAS with
// 50 % flaps, the crew opens the ramp and cargo door at the one-minute warning (red light), the navigator's computed air
// release point (CARP: the load's ballistics and the wind drift from heavydrop.js, worked back from the DZ) gives the
// green light, the loadmaster releases the extraction parachute and the platform runs aft on the rollers and out over
// the ramp (the aeroplane noses up as the weight goes aft), the G-11As deploy, open reefed, disreef; the load drifts
// down with the wind, lands on its honeycomb, the canopies are cut away and collapse; the DZ party de-rigs it and the
// vehicle is a unit at that island (the command board lists it, you can switch into it).
// It can go wrong: a canopy that streams, a drift into the trees / onto a slope / into the sea (heavydrop.js
// landingOutcome); flak can bring the Hercules down with the load still aboard. Costs: the vehicle from the fleet's
// reserve (or bought) as any deployment, plus AIR_COST materiel for the sortie and the rigging.
// The run can be watched (board: V, or V on the drop's status): the flight deck, the loadmaster at the ramp, the load,
// a chase view. V cycles, \ or Esc stops watching.
//
//   const AD = createAirdrop(ctx);  AD.order(type, I) -> '' | why;  AD.update(dt);  AD.camera(cam, dt) while watching;
//   AD.key(code) while watching;  AD.decorate(roster) (adds airdrop / airdropWhy to the vehicle rows);  AD.clear()
import * as THREE from 'three';
import { buildDropship } from '../../../ships.js';
import { createC130Sim, KT } from '../c130fm.js';
import { C130M } from '../c130model.js';
import { buildC130Deck, DECK_EYE, DECK_EYE_PITCH } from '../c130cockpit.js';
import { createC130Audio } from '../c130audio.js';
import { buildModel } from '../../wheeled/wheeledcraft.js';
import { buildM113Mesh } from '../../armor/m113model.js';
import { FIGURES } from '../rotary/figures.js';
import { rigging, c130Check, simulateDrop, createLoadFlight, landingOutcome, openFrac, TL } from './heavydrop.js';
import { buildPlatform, buildG11, buildRingSlot } from './heavydropmodel.js';
import { createAirliftAudio } from './airliftaudio.js';

export const AIR_COST = 10;   // materiel for the sortie, the platform and the canopies (game)
const TYPES = ['m151', 'm35', 'm113'];
const DROP_AGL = 335, DROP_KIAS = 130, CRUISE_KIAS = 150, ENTRY = 1700;   // 1,100 ft AGL, 130 KIAS (heavy-equipment drop practice)
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fwdX = y => -Math.sin(y), fwdZ = y => -Math.cos(y);
const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
let callN = 21;

export function createAirdrop(ctx) {
  const { scene, war, fx, sfx, say, feed, terrainH, groundY, isWater, GR } = ctx;
  const AD = { runs: [], watching: null, view: 'chase' };
  const snd = createAirliftAudio(sfx);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
  let deck = null, engSnd = null;

  // ---------------------------------------------------------------- what can go, where
  AD.can = type => TYPES.includes(type) || type === 'm60' ? c130Check(type) : 'NOT AN AIR DROP LOAD';
  // a drop zone on island I: flat (under ~1 in 8 over the platform's length), dry, clear of trees and buildings, near the
  // pad but not on it (the DZ party marks it with panels and smoke)
  function dropZone(I, R) {
    const p = I.pad || I, slope = (x, z) => { let lo = 1e9, hi = -1e9; for (let k = 0; k < 8; k++) { const a = k * 0.785; for (const r of [4, 9]) { const h = terrainH(x + Math.cos(a) * r, z + Math.sin(a) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); } } return (hi - lo) / 18; };
    let best = null;
    for (let d = 30; d <= Math.max(60, (I.r || 90) * 0.75); d += 8) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2 + d * 0.13, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, h = terrainH(x, z);
      if (h < 1.2 || isWater(x, z)) continue;
      const s = slope(x, z); if (s > 0.12) continue;
      if (!GR.clearAt(x, z, 7)) continue;
      const sc = s * 300 + d * 0.3;
      if (!best || sc < best.sc) best = { x, z, y: h, sc };
    }
    return best;
  }
  // ---------------------------------------------------------------- ordering a drop
  AD.order = (type, I, o = {}) => {
    const why = AD.can(type); if (why) return why;
    if (!I || !I.pad) return 'AIR DROP: PICK AN ISLAND';
    if (ctx.armour && ctx.armour[type] && ctx.armour[type].present() && !ctx.armour[type].dead) return `THE ${rigging(type).label} IS ALREADY OUT  -  ONE IN THE FLEET AT A TIME FOR NOW`;
    if (AD.runs.some(r => r.type === type && ctx.armour && ctx.armour[type] && r.phase !== 'gone')) return `AN ${rigging(type).label} IS ALREADY ON ITS WAY`;
    const R = rigging(type), dz = dropZone(I, R);
    if (!dz) return `NO DROP ZONE ON ${I.name}  -  TOO STEEP OR BUILT UP`;
    const run = start(type, R, I, dz, o);
    return run ? '' : 'THE HERCULES COULD NOT LAUNCH';
  };
  function start(type, R, I, dz, o) {
    const c = war.carrier, from = c && c.sinking === undefined ? c.p : { x: dz.x + 1000, z: dz.z };
    // the run in: from the task force's side, straight over the DZ (heading h, drop.js / c130fm convention)
    let a = Math.atan2(from.z - dz.z, from.x - dz.x); if (o.heading !== undefined) a = o.heading;
    const ex = dz.x + Math.cos(a) * ENTRY, ez = dz.z + Math.sin(a) * ENTRY, h = Math.atan2(-(dz.x - ex), -(dz.z - ez));
    const wa = o.wind !== undefined ? o.wind[0] : Math.random() * 6.283, ws = o.wind !== undefined ? o.wind[1] : 1.5 + Math.random() * 3.5;   // up to ~10 kt: inside the heavy-drop surface wind limit (13 kt)
    const wind = [Math.cos(wa) * ws, Math.sin(wa) * ws];
    const m = buildDropship(); scene.add(m.group);
    const S = createC130Sim(), alt = Math.max(dz.y, 0) + DROP_AGL, rho = 4.9 * Math.exp(-alt / 6000), tas = CRUISE_KIAS / KT * Math.sqrt(1.225 / rho);
    S.reset(new THREE.Vector3(ex, alt + 60, ez), h, tas, { flap: 0, gear: 0, lever: 55 });
    S.fuel = 9000; S.payload = 900 + R.rigged;   // crew, kit, the rigged load
    const u = { type: 'dropship', side: 1, ext: true, p: S.pos, v: S.vel, r: 11, hp: 14, hpMax: 14, mesh: m.group };
    war.addExternal?.(u);
    // the load in the hold: the platform on the rollers, its aft end 1.2 m forward of the ramp hinge
    const veh = type === 'm113' ? buildM113Mesh().group : buildModel(type).group;
    const P = buildPlatform(R, veh); m.group.add(P.group);
    const z0 = C130M.RAMP_HINGE[2] - 1.2 - R.len / 2;
    P.group.position.set(0, C130M.FLOOR_Y - 0.04, z0);
    const call = `RAIDER ${++callN}`;
    const run = { type, R, I, dz, wind, h, S, u, m, P, call, phase: 'inbound', t: 0, z0, zRel: 0, vRel: 0, ext: null, mains: [], L: null, rp: null, light: 'off', loadT: 0, out: null, entry: { x: ex, z: ez }, crew: [], ctl: { pitch: 0, roll: 0, yaw: 0, throttle: [0.5, 0.5, 0.5, 0.5] } };
    planRP(run);
    AD.runs.push(run);
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(wind[0], -wind[1]) + 6.283) % 6.283) / 0.785) % 8];
    feed(`AIR DROP: KC-130 ${call} WITH AN ${R.label} FOR ${I.name}  -  ${R.chutes} x G-11A, ${Math.round(R.rigged).toLocaleString('en-US')} KG RIGGED`, 'good');
    feed(`${call}: DZ ${I.name}, WIND ${ws.toFixed(0)} m/s TOWARD ${dir}  -  \\ V ON THE BOARD TO WATCH`, 'info');
    sfx.dock?.();
    return run;
  }
  // the computed air release point: where the load must leave the ramp so that its ballistics plus the drift land it on the DZ
  function planRP(r) {
    const S = r.S, alt = DROP_AGL, rho = 4.9 * Math.exp(-(r.dz.y + alt) / 6000), tas = DROP_KIAS / KT * Math.sqrt(1.225 / rho);
    const ux = fwdX(r.h), uz = fwdZ(r.h), gs = tas + r.wind[0] * ux + r.wind[1] * uz;
    const d = simulateDrop(r.R, { v0: [ux * gs, 0, uz * gs], alt, wind: r.wind });
    const lead = gs * 2.3;   // green light -> extraction chute -> the platform off the ramp
    r.rp = { x: r.dz.x - d.x - ux * lead, z: r.dz.z - d.z - uz * lead, t: d.t, vz: d.vz };
    void S;
  }
  const runGeom = r => { const rx = r.S.pos.x - r.rp.x, rz = r.S.pos.z - r.rp.z; return { s: rx * fwdX(r.h) + rz * fwdZ(r.h), c: rx * Math.cos(r.h) - rz * Math.sin(r.h) }; };

  // ---------------------------------------------------------------- the flight
  function fly(r, dt) {
    const S = r.S, T = r.dz;
    const lookY = Math.max(groundY(S.pos.x + fwdX(S.heading) * 400, S.pos.z + fwdZ(S.heading) * 400), groundY(S.pos.x, S.pos.z), 0);
    let cmd;
    if (r.L || r.phase === 'lost') {   // the load is out (or lost): egress, climbing away to the right
      cmd = { track: r.h + 0.35, alt: Math.max(lookY + 200, T.y + 380), kias: 190 };
    } else {
      const { s, c } = runGeom(r);
      cmd = { track: r.h + clamp(c * 0.0028, -0.5, 0.5), alt: Math.max(Math.max(T.y, 0) + DROP_AGL, lookY + 110), kias: s < -1300 ? CRUISE_KIAS : DROP_KIAS, s };
    }
    const flapLim = S.flap > 0.03 || S.flapSel > 0 ? 165 : 400;
    cmd.kias = Math.min(cmd.kias, flapLim);
    const c = S.autopilot(dt, cmd); r.ctl = c;
    // the crew: flaps 50 % for the run, ramp and door at the one-minute warning, closed after the drop, flaps up on the way out
    const { s } = runGeom(r);
    if (r.phase === 'inbound') {
      if (s > -1500 && S.kias < 175) S.flapSel = 0.5;
      if (s > -900 && !S.rampCmd) { S.rampCmd = 1; feed(`${r.call}: ONE MINUTE  -  RAMP AND DOOR COMING OPEN`, 'info'); r.light = 'red'; }
      if (s > -350 && !r.tenSec) { r.tenSec = true; feed(`${r.call}: TEN SECONDS`, 'info'); }
    }
    if (r.L && S.rampCmd && r.t - r.outT > 6) { S.rampCmd = 0; r.light = 'off'; feed(`${r.call}: DROP COMPLETE  -  RAMP AND DOOR CLOSING`, 'info'); }
    if (r.L && S.kias > 140 && r.t - r.outT > 10) S.flapSel = 0;
    S.step(dt, c, { groundY: (x, z) => Math.max(groundY(x, z), 0), water: (x, z) => isWater(x, z), wind: { x: 0, z: 0 } });
    // the airframe's moving parts
    r.m.group.position.copy(S.pos); r.m.group.quaternion.copy(S.q);
    const inside = AD.watching === r && (AD.view === 'deck' || AD.view === 'hold');
    r.m.animate({ eng: S.eng, flap: S.flap, gear: S.gear, ramp: S.ramp, door: S.door, ele: S.surf.ele, ail: S.surf.ail, rud: S.surf.rud, steer: S.steer, wow: S.wow, jumpLight: r.light }, dt, r.t, inside);
  }

  // the green light: extraction chute out, the platform runs aft on the rollers, off the ramp
  function extraction(r, dt) {
    const S = r.S;
    if (r.phase === 'inbound') {
      const { s, c } = runGeom(r);
      const ready = S.ramp > 0.97 && Math.abs(c) < 60 && Math.abs(angDiff(S.track(), r.h)) < 0.3 && S.kias < 150;
      if (s >= 0 && ready) { r.phase = 'green'; r.light = 'green'; r.gT = r.t; feed(`${r.call}: GREEN LIGHT  -  EXTRACTION CHUTE AWAY`, 'good'); snd.crack(camDist(S.pos)); }
      else if (s > 250) { feed(`${r.call}: NO DROP  -  NOT LINED UP (${Math.round(c)} m OFF THE LINE)  -  GOING AROUND`, 'bad'); r.rp = null; planRP(r); r.go = (r.go || 0) + 1; turnAround(r); }
    }
    if (r.phase === 'green') {
      // the extraction chute inflates behind the ramp, then the pull starts: ~0.9 g relative to the aeroplane (INFERRED)
      const tg = r.t - r.gT;
      if (!r.ext) { r.ext = buildRingSlot(r.R.ext); scene.add(r.ext.group); }
      r.P.group.updateMatrixWorld(true);
      placeExt(r, _v.set(0, r.P.top * 0.5, r.R.len / 2).applyMatrix4(r.P.group.matrixWorld), _w.set(0, 0, 1).applyQuaternion(S.q).normalize().clone(), clamp(tg / 0.6, 0.05, 1));
      if (tg > 0.6) {
        r.vRel += 0.9 * 9.81 * dt; r.zRel += r.vRel * dt;
        const k = Math.min(1, r.zRel / 10);
        S.w.y += (r.R.rigged / S.mass) * 0.35 * dt * (1 - k * 0.5);   // the weight going aft: nose up (the crew holds it; INFERRED, tamed)
        snd.rollers(Math.min(1, r.vRel / 6), camDist(S.pos));
        const zFront = r.z0 - r.R.len / 2 + r.zRel, rampEnd = C130M.RAMP_HINGE[2] + 3.12;
        if (zFront > rampEnd - 0.3) exitLoad(r);
      }
      r.P.group.position.z = r.z0 + r.zRel;
    }
  }
  function turnAround(r) {   // go around: a new run back over the DZ from where she is (she turns round onto it)
    const S = r.S;
    r.h = Math.atan2(-(r.dz.x - S.pos.x), -(r.dz.z - S.pos.z)); planRP(r); S.rampCmd = 0; r.light = 'off'; r.tenSec = false;
  }
  function exitLoad(r) {
    const S = r.S, P = r.P;
    snd.rollers(0);
    // the platform's world pose now; it leaves the aeroplane with the aeroplane's velocity plus its own aft speed
    P.group.updateMatrixWorld(true); P.group.getWorldPosition(_v); P.group.getWorldQuaternion(_q);
    r.m.group.remove(P.group); scene.add(P.group); P.group.position.copy(_v); P.group.quaternion.copy(_q);
    const aft = _w.set(0, 0, 1).applyQuaternion(S.q).multiplyScalar(r.vRel);
    const v = [S.vel.x + aft.x, S.vel.y + aft.y, S.vel.z + aft.z];
    const streamers = r.forceStreamers ?? (Math.random() < 0.015 * r.R.chutes ? 1 : 0);   // a G-11A that does not open (~1.5 % each, INFERRED)
    r.L = createLoadFlight(r.R, [_v.x, _v.y, _v.z], v, r.wind, { streamers });
    r.L.yaw = S.heading;
    r.phase = 'falling'; r.outT = r.t; S.payload -= r.R.rigged;
    // the main canopies: one per G-11A, clustered over the clevis
    for (let i = 0; i < r.R.chutes; i++) { const c = buildG11(); c.group.visible = false; scene.add(c.group); r.mains.push({ c, a: i / r.R.chutes * Math.PI * 2 + 0.4, streamer: i < streamers }); }
    feed(`${r.call}: LOAD CLEAR OF THE RAMP${streamers ? '  -  A CANOPY STREAMING!' : ''}`, streamers ? 'bad' : 'good');
  }
  // the load under its canopies (heavydrop.js), drawn: the platform swinging under the cluster, the extraction chute
  // trailing until the mains take it, the canopies opening
  function descend(r, dt) {
    const L = r.L, P = r.P;
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < n && !L.landed; i++) L.step(dt / n, (x, z) => Math.max(groundY(x, z), isWater(x, z) ? terrainH(x, z) : -1e9, -40));
    const crackAt = [TL.deploy + 0.2, TL.disreef + 0.3];
    for (const t of crackAt) if (L.t >= t && !(r.cracked || []).includes(t)) { (r.cracked ||= []).push(t); snd.crack(camDist(_v.set(L.p[0], L.p[1], L.p[2]))); if (t > 2 && L.gMax > 0) feed(`${r.call}: MAINS OPEN  -  OPENING SHOCK ${L.gMax.toFixed(1)} g`, 'info'); }
    // the platform: level under the clevis, swinging along its drift, nose along the run
    const vh = Math.hypot(L.v[0] - L.wind[0], L.v[2] - L.wind[1]) || 1e-6, dx = (L.v[0] - L.wind[0]) / vh, dz = (L.v[2] - L.wind[1]) / vh;
    const tilt = L.t < TL.full ? clamp(Math.atan2(vh, Math.max(1, -L.v[1])) * 0.5, 0, 0.9) : L.swing;
    _q.setFromEuler(_e.set(0, L.yaw, 0, 'YXZ'));
    const ax = new THREE.Vector3(dz, 0, -dx), qt = new THREE.Quaternion().setFromAxisAngle(ax, -tilt);
    P.group.quaternion.copy(qt).multiply(_q);
    P.group.position.set(L.p[0], L.p[1], L.p[2]);
    // the clevis in the world, the canopies above it (leaning out of the cluster, up along the relative wind)
    P.group.updateMatrixWorld(true); const clv = _v.set(0, P.clevisY, 0).applyMatrix4(P.group.matrixWorld).clone();
    const open = openFrac(L.t), up = new THREE.Vector3(-(L.v[0] - L.wind[0]), -L.v[1], -(L.v[2] - L.wind[1])).normalize();
    for (const M of r.mains) {
      const o = M.streamer ? Math.min(open, 0.05) : open, spread = 0.22 * Math.min(1, open * 2) * (r.R.chutes > 1 ? 1 : 0);
      const dirv = up.clone().add(new THREE.Vector3(Math.cos(M.a) * spread, 0, Math.sin(M.a) * spread)).normalize();
      M.c.group.position.copy(clv); M.c.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv);
      const deployK = clamp((L.t - TL.deploy * 0.5) / (TL.deploy * 0.8), 0, 1);   // the bags stream out, lines stretch
      M.c.animate(o > 0.001 ? o : 0, 0, r.t);
      if (o <= 0.001) M.c.group.position.addScaledVector(dirv, 3 + deployK * 20);
      M.c.group.visible = L.t > TL.deploy * 0.4;
    }
    P.bags.visible = L.t < TL.deploy * 0.4;
    // the extraction chute: trailing behind the load (opposite its motion through the air) until the mains take over
    if (r.ext) {
      placeExt(r, _v.set(0, P.top * 0.5, r.R.len / 2).applyMatrix4(P.group.matrixWorld), up, 1);
      if (L.t > TL.reefed + 0.6) { scene.remove(r.ext.group); r.ext = null; }
    }
    if (L.landed) land(r);
  }
  // the ring-slot chute: its lines from p0 (the platform's tail) 6 m along `trail`, the canopy LINE beyond, inflated k
  const _Y = new THREE.Vector3(0, 1, 0);
  function placeExt(r, p0, trail, k) {
    const E = r.ext; E.group.visible = true;
    E.group.position.copy(p0).addScaledVector(trail, 6 + E.LINE * k);
    E.group.quaternion.setFromUnitVectors(_Y, trail);
    E.group.scale.set(0.2 + 0.8 * k, k, 0.2 + 0.8 * k);
  }
  function land(r) {
    const L = r.L, P = r.P, x = L.p[0], z = L.p[2];
    const half = r.R.len / 2, sx = Math.sin(L.yaw), cz = Math.cos(L.yaw);
    const h0 = terrainH(x, z), hf = terrainH(x - sx * half, z - cz * half), hb = terrainH(x + sx * half, z + cz * half), hl = terrainH(x - cz * 1.4, z + sx * 1.4), hr = terrainH(x + cz * 1.4, z - sx * 1.4);
    const slope = Math.max(Math.abs(hf - hb) / (2 * half), Math.abs(hl - hr) / 2.8);
    const deckY = war.deckY ? war.deckY(x, z) : -1e9, water = deckY > -1e8 ? 0 : Math.max(0, -h0);
    const clear = GR.clearAt(x, z, 3);
    const out = landingOutcome({ slope, water, clear, vz: L.vzLand });
    r.out = out; r.phase = 'down'; r.downT = r.t;
    snd.thud(camDist(_v.set(x, h0, z)), L.vzLand / 8);
    fx.trail?.(x, Math.max(h0, 0) + 0.5, z, 2.5);
    for (let k = 0; k < 6; k++) fx.mix?.spawn(x + (Math.random() - 0.5) * 6, Math.max(h0, 0) + 0.3, z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, 1 + Math.random(), (Math.random() - 0.5) * 3, 1.5, 0.7, 3, 0.55, 0.48, 0.36, 0.5, 1.5, 1.4, 0.3);
    // the platform comes to rest on the ground (tipped if the slope did it), the honeycomb crushed
    P.crush(clamp(L.vzLand / 10, 0.3, 1));
    _q.setFromEuler(_e.set(Math.atan2(hf - hb, 2 * half) * 0.9, L.yaw, out.damage >= 0.5 && !out.lost ? 0.5 : Math.atan2(hr - hl, 2.8) * 0.9, 'YXZ'));
    P.group.quaternion.copy(_q); P.group.position.set(x, water > 0 ? h0 - 0.2 : Math.max(groundY(x, z), h0), z);
    const dzD = Math.hypot(x - r.dz.x, z - r.dz.z);
    feed(`${r.call}: ${r.R.label} DOWN ${Math.round(dzD)} m FROM THE DZ  -  ${out.why}  (${L.vzLand.toFixed(1)} m/s)`, out.lost ? 'bad' : out.damage > 0 ? 'bad' : 'good');
    if (out.lost) { ctx.onLost?.(r.type, `AIR DROP: ${out.why}`); r.phase = 'lost'; }
    else {   // the DZ party: two Marines from the pad to de-rig it (cut the lashings, the honeycomb, start it)
      const pad = r.I.pad || r.dz;
      for (let i = 0; i < 2; i++) { const F = FIGURES.marine({ variant: 20 + i }); scene.add(F.group); r.crew.push({ F, x: pad.x + (i ? 3 : -3), z: pad.z + 2, ph: Math.random() * 6, tx: x + (i ? 1.8 : -1.8), tz: z + (i ? 1 : -1), st: 'run' }); }
      feed(`DZ PARTY ${r.I.name}: DE-RIGGING THE ${r.R.label}`, 'info');
    }
  }
  function settle(r, dt) {   // after landing: the canopies collapse and lie down wind, the crew de-rigs, then the unit is ready
    const L = r.L, k = clamp((r.t - r.downT) / 3, 0, 1);
    const wx = L.wind[0], wz = L.wind[1], wl = Math.hypot(wx, wz) || 1;
    for (const M of r.mains) {
      const g = M.c.group; g.quaternion.slerp(_q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(wx / wl, 0.12, wz / wl).normalize()), Math.min(1, dt * 1.2));
      M.c.animate(M.streamer ? 0.05 : 1, k, r.t);
      if (k >= 1) { g.position.y = Math.max(g.position.y - dt * 2, groundY(g.position.x, g.position.z)); }
    }
    for (const c of r.crew) {
      const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz), v = 3.6 * dt;
      if (c.st === 'run' && d > v) { c.x += dx / d * v; c.z += dz / d * v; c.ph += dt * 9.5; c.F.pose('run', c.ph); c.yaw = Math.atan2(-dx, -dz); }
      else { c.st = 'work'; c.F.pose('kneel', 0); c.yaw = Math.atan2(-(r.L.p[0] - c.x), -(r.L.p[2] - c.z)); }
      c.F.group.position.set(c.x, groundY(c.x, c.z), c.z); c.F.group.rotation.y = c.yaw;
    }
    if (r.phase === 'down' && r.crew.length && r.crew.every(c => c.st === 'work')) { r.derigT = (r.derigT || 0) + dt; if (r.derigT > 8) ready(r); }
  }
  // the vehicle becomes a unit: the real craft where the platform is (driven off it), the platform model left behind
  function ready(r) {
    const L = r.L, x = L.p[0], z = L.p[2], yaw = L.yaw, ahead = r.R.len / 2 + 3.5, fx_ = -Math.sin(yaw), fz_ = -Math.cos(yaw);
    let unit = null;
    if (r.type === 'm113') {
      const D = ctx.armour.m113; const sp = { x: x + fx_ * ahead, z: z + fz_ * ahead, yaw, name: r.I.name }; sp.y = groundY(sp.x, sp.z);
      if (!GR.clearAt(sp.x, sp.z, 3.5)) { sp.x = x - fx_ * ahead; sp.z = z - fz_ * ahead; sp.y = groundY(sp.x, sp.z); }
      D.spawnAt(sp); unit = D;
      if (r.out.damage > 0 && D.hurt) D.hurt(r.out.damage * 2.5, 'AIR DROP LANDING');
    } else {
      const V = ctx.pool.spawners[r.type]({ x: x + fx_ * ahead, z: z + fz_ * ahead, yaw, name: r.I.name }, { home: r.I });
      if (V) { unit = V; if (r.out.damage > 0 && V.damage) V.damage(r.out.damage * 3, 'AIR DROP LANDING'); }
    }
    r.vehicle = unit; r.P.vehicle.visible = false; r.P.susp.visible = false; r.P.clevis.visible = false;
    r.phase = 'ready'; r.readyT = r.t;
    if (unit) { feed(`AIR DROP: ${r.R.label} READY AT ${r.I.name}${r.out.damage > 0 ? '  -  DAMAGED' : ''}  -  ON THE COMMAND BOARD`, 'good'); say(`${r.R.label} DE-RIGGED AND READY AT ${r.I.name}`, 2.4); }
    else { feed(`AIR DROP: NO ROOM TO DRIVE THE ${r.R.label} OFF  -  LOST`, 'bad'); ctx.onLost?.(r.type, 'AIR DROP: NO ROOM'); }
  }
  function camDist(p) { const c = ctx.camZ ? ctx.camZ() : null; return c ? c.position.distanceTo(p) : 300; }
  function dispose(r) {
    scene.remove(r.m.group); if (r.P.group.parent) r.P.group.parent.remove(r.P.group);
    for (const M of r.mains) scene.remove(M.c.group); if (r.ext) scene.remove(r.ext.group);
    for (const c of r.crew) scene.remove(c.F.group);
    r.u.gone = true; if (AD.watching === r) AD.stopWatch();
  }

  // ---------------------------------------------------------------- per frame
  AD.update = dt => {
    for (let i = AD.runs.length - 1; i >= 0; i--) {
      const r = AD.runs[i]; r.t += dt;
      const S = r.S, alive = !r.crashed;
      if (alive) {
        // shot down (flak): with the load still aboard it is lost with her
        if (r.u.dying && !r.down) {
          r.down = true; feed(`${r.call} HIT  -  GOING DOWN`, 'bad');
          if (r.phase === 'inbound' || r.phase === 'green') { ctx.onLost?.(r.type, `AIR DROP: ${r.call} SHOT DOWN`); r.phase = 'lost'; }
        }
        if (r.down) { S.step(dt, { roll: 0.35, pitch: -0.25, yaw: 0.3, throttle: [0, 0, 0, 0] }, { groundY: (x, z) => Math.max(groundY(x, z), 0), water: isWater, wind: { x: 0, z: 0 } }); r.m.group.position.copy(S.pos); r.m.group.quaternion.copy(S.q); fx.trail?.(S.pos.x, S.pos.y, S.pos.z, 2); }
        else fly(r, dt);
        const floor = Math.max(groundY(S.pos.x, S.pos.z), 0);
        if (S.dead || S.pos.y < floor + 1.5) { r.crashed = true; fx.explode?.(S.pos.x, floor, S.pos.z, 5, { fire: 80, debris: 24, color: 0xa9adb0, crater: 5 }); sfx.boom?.(1.4); scene.remove(r.m.group); r.u.gone = true; }
        if (!r.down) extraction(r, dt);
      }
      if (r.phase === 'falling') descend(r, dt);
      if (r.phase === 'down' || r.phase === 'ready' || r.phase === 'lost') { if (r.L && r.L.landed) settle(r, dt); }
      // the Hercules goes home once the load is out (egress), and the whole thing is cleared away in time
      if (!r.crashed && r.L && r.t - r.outT > 70 && !r.planeGone) { r.planeGone = true; scene.remove(r.m.group); r.u.gone = true; }
      const end = (r.phase === 'ready' && r.t - r.readyT > 90) || (r.phase === 'lost' && (r.planeGone || r.crashed) && r.t > (r.downT || r.t) + 60) || (r.crashed && !r.L && r.t > 30);
      if (end) { dispose(r); AD.runs.splice(i, 1); }
    }
    // the Hercules' four T56s for the run being watched (or the nearest)
    const cam = ctx.camZ ? ctx.camZ() : null, r = AD.watching || AD.runs.find(r => !r.planeGone && !r.crashed);
    if (cam && sfx.ctx) {
      engSnd ||= createC130Audio(sfx);
      if (r && !r.planeGone && !r.crashed) { const d = cam.position.distanceTo(r.S.pos); engSnd.update({ eng: r.S.eng, tas: r.S.tas, inside: AD.watching === r && (AD.view === 'deck' || AD.view === 'hold'), dist: d, vr: 0, pans: null }); }
      else engSnd.stop?.();
    }
  };
  // phases as the board shows them
  AD.status = r => {
    if (r.phase === 'inbound') { const { s } = runGeom(r); return `${r.call} ${Math.round(Math.max(0, -s))} m TO THE RELEASE POINT  ·  ${Math.round(r.S.kias)} KIAS  ${Math.round((r.S.pos.y - r.dz.y) * 3.28)} FT${r.light === 'red' ? '  ·  RED LIGHT, RAMP OPEN' : ''}`; }
    if (r.phase === 'green') return `${r.call}: GREEN LIGHT  -  EXTRACTION`;
    if (r.phase === 'falling') return `UNDER ${r.R.chutes} x G-11A  ·  ${Math.round((r.L.p[1] - Math.max(terrainH(r.L.p[0], r.L.p[2]), 0)) * 3.28)} FT  ·  ${(-r.L.v[1]).toFixed(1)} m/s`;
    if (r.phase === 'down') return `DOWN  -  ${r.out.why}  ·  DE-RIGGING`;
    if (r.phase === 'ready') return 'READY  -  ON THE BOARD';
    return r.phase === 'lost' ? 'LOST' : r.phase.toUpperCase();
  };
  AD.lines = () => AD.runs.filter(r => r.phase !== 'ready' || r.t - r.readyT < 20).map(r => `${r.R.label} FOR ${r.I.name}: ${AD.status(r)}`);

  // ---------------------------------------------------------------- watching
  AD.watch = (r = AD.runs.find(r => r.phase !== 'ready' && r.phase !== 'lost') || AD.runs[0]) => {
    if (!r) { say('NO AIR DROP UNDER WAY', 1.4); return false; }
    AD.watching = r; AD.view = r.phase === 'inbound' || r.phase === 'green' ? 'hold' : 'load';
    say(`WATCHING ${r.call}  -  V: FLIGHT DECK / LOADMASTER / THE LOAD / CHASE  ·  \\ OR ESC: BACK`, 3); return true;
  };
  AD.stopWatch = () => { if (deck) deck.group.visible = false; AD.watching = null; };
  AD.key = code => {
    if (!AD.watching) return false;
    if (code === 'KeyV') { const order = ['hold', 'deck', 'load', 'chase']; AD.view = order[(order.indexOf(AD.view) + 1) % order.length]; say({ hold: 'LOADMASTER AT THE RAMP', deck: 'FLIGHT DECK', load: 'THE LOAD', chase: 'CHASE' }[AD.view], 1); return true; }
    if (code === 'Escape' || code === 'Backslash' || code === 'IntlBackslash') { AD.stopWatch(); say('BACK TO YOUR UNIT', 1); return true; }
    return false;
  };
  const camP = new THREE.Vector3(), camL = new THREE.Vector3();
  AD.camera = (cam, dt) => {
    const r = AD.watching; if (!r) return;
    const S = r.S, gone = r.planeGone || r.crashed, view = gone && (AD.view === 'hold' || AD.view === 'deck' || AD.view === 'chase') ? 'load' : AD.view;
    if (deck) deck.group.visible = false;
    if (view === 'deck') {
      if (!deck) { deck = buildC130Deck(); }
      if (deck.group.parent !== r.m.group) r.m.group.add(deck.group);
      deck.group.visible = true;
      r.m.group.updateMatrixWorld();
      cam.position.copy(DECK_EYE).applyMatrix4(r.m.group.matrixWorld);
      cam.quaternion.copy(S.q).multiply(_q.setFromEuler(_e.set(DECK_EYE_PITCH + (ctx.head?.pitch || 0), ctx.head?.yaw || 0, 0, 'YXZ')));
      const { s } = r.rp ? runGeom(r) : { s: 0 };
      deck.update(S, { ap: true, jumpLight: r.light, jumpSwitch: r.light, dz: { brg: Math.atan2(-(r.dz.x - S.pos.x), -(r.dz.z - S.pos.z)), dist: Math.hypot(r.dz.x - S.pos.x, r.dz.z - S.pos.z) }, agl: S.pos.y - Math.max(groundY(S.pos.x, S.pos.z), 0) - 2.6, cautions: { ramp: S.ramp > 0.02 }, mcReset: true, time: r.t, ctl: r.ctl,
        checklist: { title: 'HEAVY EQUIPMENT DROP', items: [['FLAPS 50 %', S.flap > 0.45, `${Math.round(S.flap * 100)} %`], ['RAMP AND DOOR', S.ramp > 0.97, S.ramp > 0.97 ? 'OPEN' : 'OPENING'], ['ONE MINUTE', s > -900, 'RED LIGHT'], ['GREEN LIGHT', r.phase !== 'inbound', r.light.toUpperCase()], ['LOAD CLEAR', !!r.L, r.L ? 'CLEAR' : '-']] } }, dt, null);
      return;
    }
    if (view === 'hold') {   // the loadmaster, forward in the hold by the right wall, looking aft out of the open ramp
      r.m.group.updateMatrixWorld();
      camP.set(1.0, -0.2, r.z0 - r.R.len / 2 - 2.6).applyMatrix4(r.m.group.matrixWorld);
      camL.set(-0.2, -1.3, 20).applyMatrix4(r.m.group.matrixWorld);
      cam.position.copy(camP); cam.up.set(0, 1, 0).applyQuaternion(S.q); cam.lookAt(camL); cam.up.set(0, 1, 0);
      return;
    }
    const k = 1 - Math.exp(-3 * dt);
    if (view === 'chase') {
      const f = S.forward(_w).clone(); f.y = 0; f.normalize();
      _v.set(S.pos.x - f.x * 60 + f.z * 25, S.pos.y + 14, S.pos.z - f.z * 60 - f.x * 25); camP.lerp(_v, k); camL.lerp(S.pos, k);
    } else {   // the load: beside and a little above, looking at the platform with the canopies over it
      const p = r.L ? r.L.p : [r.P.group.getWorldPosition(_w).x, _w.y, _w.z], wl = r.L ? Math.hypot(r.L.wind[0], r.L.wind[1]) || 1 : 1;
      const sx = r.L ? -r.L.wind[1] / wl : 1, sz = r.L ? r.L.wind[0] / wl : 0;
      _v.set(p[0] + sx * 34, p[1] + 6, p[2] + sz * 34); _w.set(p[0], p[1] + (r.phase === 'falling' ? 10 : 2), p[2]);
      if (camP.lengthSq() === 0) camP.copy(_v);
      camP.lerp(_v, k); camL.lerp(_w, k);
    }
    camP.y = Math.max(camP.y, groundY(camP.x, camP.z) + 2);
    cam.position.copy(camP); cam.lookAt(camL);
  };

  // ---------------------------------------------------------------- the command board hook
  // roster rows (main.js) get airdrop(base) -> '' | why and airdropWhy() -> '' | why not at all
  AD.decorate = roster => {
    for (const r of roster) {
      if (!TYPES.includes(r.id) && r.id !== 'm60') continue;
      r.airdropWhy = () => AD.can(r.id) || (ctx.gate ? ctx.gate() : '');   // (TECH TREE: FIELD LOGISTICS)
      r.airdrop = b => b && b.kind === 'island' ? AD.order(r.id, b.I) : 'AIR DROP: PICK AN ISLAND  -  NOT ONTO THE CARRIER';
    }
    return roster;
  };
  AD.clear = () => { for (const r of AD.runs) dispose(r); AD.runs.length = 0; AD.stopWatch(); };
  AD.silence = () => { engSnd?.stop?.(); snd.silence(); };
  return AD;
}
