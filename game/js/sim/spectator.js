// SIM MODE in the browser (?sim): the live game with both sides played by CPU commanders, and you watching. The
// whole war runs as it does for a player (same war.js, same units, same rules); the player's own Huey stays parked
// and out of the war. Time runs at 1x / 4x / 16x, the camera follows the action (or flies free, or rides a unit),
// and an overlay shows both commanders: doctrine, stores, islands, research, what they just decided, and a timeline.
//
//   ?sim                      BALANCED vs DEFAULT, the whole tech tree (today's game)
//   ?sim&blue=RUSH&red=SWARM&tech=default&seed=7&speed=4&patch=catlane
// Keys: 1 / 2 / 3 speed 1x / 4x / 16x, SPACE pause, C camera (ACTION / FREE / FOLLOW / MAP), F next unit to follow,
//   N next event, H the overlay, R the next war (seed + 1). FREE: W A S D pan, Q / E turn, mouse drag orbit, wheel zoom.
//
//   const S = createSpectator(h)   h: { war, THREE, params, groundY, newGame, fog, feed, say, buildJetMesh, hud }
//   S.start()   S.step(dt) in place of war.update (the frame's game time)   S.camera(cam, dt)   S.pl (the war's player)
import { createCommanderAI } from './commanderai.js';
import { createRedAI } from './redai.js';
import { createStrikeWing } from './strike.js';
import { createTelemetry, strength } from './telemetry.js';
import { doctrine } from './doctrine.js';
import { seedMath } from './rng.js';
import { createTech, techStartFromQuery, techNode } from '../techtree.js';
import { createFleet } from '../units/commander/fleet.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const SPEEDS = [1, 4, 16];
const CAMS = ['ACTION', 'FREE', 'FOLLOW', 'MAP'];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function createSpectator(h) {
  const { war: W, THREE, params } = h;
  const S = { on: true, speed: SPEEDS.includes(+params.get('speed')) ? +params.get('speed') : 1, paused: false, cam: 'ACTION', overlay: true, events: [], shot: null, follow: null, t: 0, tReal: 0, built: false };
  S.seed = params.has('seed') ? +params.get('seed') : Math.floor(Math.random() * 1e6);
  // the war's view of "the player": nobody (the Huey parked on deck is scenery while the CPUs fight)
  S.pl = { alive: false, landed: false, inCave: false, pos: new THREE.Vector3(0, -1e4, 0), vel: new THREE.Vector3(), hitR: 2.6, detect: 1, kind: 'none' };
  const blueD = doctrine(1, params.get('blue') || 'BALANCED'), redD = doctrine(2, params.get('red') || 'DEFAULT');
  const tq = { has: k => params.has(k === 'tech' ? 'tech' : 'etech'), get: k => params.get(k) };
  const techStart = side => { const q = side === 2 && params.has('etech') ? params.get('etech') : params.get('tech'); return !q ? 'all' : techStartFromQuery({ has: k => k === 'tech', get: () => q }, side); };
  void tq;

  // ---------------------------------------------------------------- the commanders
  let C = null, T = null, SW = null, fleet = null, techB = null, techR = null;
  S.start = () => {
    if (params.has('seed')) S.rng = seedMath(S.seed);   // (the war's dice from the seed; the renderer's effects still vary)
    h.newGame();
    if (h.fog) h.fog.enabled = false;   // a spectator sees both sides
    techB = createTech(1, { start: techStart(1) }); techR = createTech(2, { start: techStart(2) });
    fleet = createFleet();
    if ((params.get('patch') || '').includes('catlane') && W.carrier.parts.parked) { const P = W.carrier.parts.parked; for (let i = P.length - 1; i >= 0; i--) if (P[i].z < -20) P.splice(i, 1); }
    T = createTelemetry(W, { every: 5 });
    const log = (side, what, extra) => { T.decision(side, what, extra); (side === 1 ? S.logB : S.logR).unshift({ t: W.time, what }); if (S.logB.length > 6) S.logB.length = 6; if (S.logR.length > 6) S.logR.length = 6; };
    S.logB = []; S.logR = [];
    SW = createStrikeWing({ W, terrainH: h.terrainH, scene: h.scene, feed: h.feed, fleet, THREE, buildMesh: h.buildJetMesh ? () => { const m = h.buildJetMesh(1); return m.group || m; } : null });
    C = createCommanderAI({ W, nav: h.nav, doctrine: blueD, tech: techB, strike: SW, fleet, log, terrainH: h.terrainH });
    W.redAI = createRedAI({ W, nav: h.nav, feed: h.feed, sfx: h.sfx || {}, doctrine: redD, tech: techR, log });
    const onOwner0 = W._simOnOwner; void onOwner0;
    S.owner0 = W.islands.map(I => I.owner);
    document.body.classList.add('simmode');
    build(); S.built = true;
    h.say?.(`SIM MODE  -  ${blueD.name} vs ${redD.name}  -  SEED ${S.seed}`, 4);
  };

  // ---------------------------------------------------------------- the clock
  S.step = (dt, peace) => {
    if (S.paused || !C) return;
    const n = S.speed;
    for (let k = 0; k < n && !W.over; k++) {
      if (k > 0) W.tickSea(dt);   // (main.js ticks the sea once a frame)
      W.update(dt, S.pl, peace);
      C.update(dt); T.sample(); watch();
    }
    S.t += dt * n;
  };

  // ---------------------------------------------------------------- what is happening (for the director and the timeline)
  const lastOwn = new Map();
  function watch() {
    for (const I of W.islands) {
      const was = lastOwn.has(I) ? lastOwn.get(I) : I.owner;
      if (was !== I.owner) S.events.push({ t: W.time, kind: 'capture', side: I.owner, x: I.pad.x, y: I.pad.h, z: I.pad.z, text: `${I.owner === 1 ? 'TASK FORCE' : I.owner === 2 ? 'RUNAWAY' : 'NOBODY'} TAKES ${I.name}`, w: 10 });
      lastOwn.set(I, I.owner);
    }
    for (const u of W.units) {
      if (u._specSeen) { if ((u.dying || (u.dims && u.sinking !== undefined)) && !u._specDown) { u._specDown = true; const big = u.dims ? 12 : u.type === 'strike' || u.type === 'drone' || u.type === 'transport' ? 5 : 2; S.events.push({ t: W.time, kind: 'loss', side: u.side, x: u.p.x, y: u.p.y, z: u.p.z, text: `${u.side === 1 ? 'TASK FORCE' : 'RUNAWAY'} ${label(u)} DOWN`, w: big }); } continue; }
      u._specSeen = true;
      if (u.type === 'strike' || u.type === 'drone' || u.type === 'transport' || u.type === 'battleship' || u.type === 'shrike') S.events.push({ t: W.time, kind: 'launch', side: u.side, unit: u, x: u.p.x, y: u.p.y, z: u.p.z, text: `${label(u)} ${u.side === 1 ? 'OUT' : 'INBOUND'}${u.target && u.target.name ? ' FOR ' + u.target.name : ''}`, w: u.type === 'battleship' ? 12 : u.type === 'strike' ? 6 : 4 });
    }
    if (S.events.length > 400) S.events.splice(0, S.events.length - 400);
  }
  const LABEL = { drone: 'SEA KNIGHT', transport: 'MV-22', gunship: 'WASP', escort: 'TOMCAT', strike: 'HORNET', shrike: 'SHRIKE', reaper: 'REAPER', shahed: 'SHAHED', carrier: 'CARRIER', battleship: 'LEVIATHAN', freighter: 'CONTAINER SHIP', squad: 'LANDING PARTY' };
  const label = u => u.type === 'carrier' ? (u.side === 1 ? 'ALBATROSS' : 'KRAKEN') : u.name && u.type === 'strike' ? u.name : LABEL[u.type] || u.type.toUpperCase();

  // ---------------------------------------------------------------- the camera
  const cam = { focus: new THREE.Vector3(-300, 10, 280), yaw: 0.8, pitch: 0.42, dist: 230, pos: new THREE.Vector3(), tgt: new THREE.Vector3(), holdT: 0, keys: {}, drag: null, want: new THREE.Vector3() };
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function director(dtReal) {   // ACTION: the most interesting thing that happened lately, held a while
    cam.holdT -= dtReal;
    const now = W.time;
    let best = null, bs = 0;
    for (let i = S.events.length - 1; i >= 0; i--) {
      const e = S.events[i], age = now - e.t; if (age > 60) break;
      const live = e.unit && !e.unit.dead && !e.unit.gone;
      const s = e.w * Math.exp(-age / 25) * (e.used ? 0.25 : 1) * (live ? 1.3 : 1);
      if (s > bs) { bs = s; best = e; }
    }
    if (best && (cam.holdT <= 0 || (bs > 8 && best !== S.shot && best.w >= 10))) { if (S.shot !== best) { S.shot = best; best.used = true; cam.holdT = 14; cam.yaw += 0.9; } }
    if (!S.shot || (cam.holdT <= -20)) {   // nothing new: the biggest fight on the islands, else the two carriers
      const fight = biggestFight(); if (fight) { cam.want.copy(fight); cam.dist += (190 - cam.dist) * 0.02; } else if (W.carrier) cam.want.set(W.carrier.p.x, 12, W.carrier.p.z);
    } else {
      const e = S.shot, u = e.unit && !e.unit.dead && !e.unit.gone ? e.unit : null;
      if (u) cam.want.set(u.p.x, u.p.y, u.p.z); else cam.want.set(e.x, e.y, e.z);
      cam.dist += ((u && (u.type === 'strike' || u.type === 'shrike') ? 140 : u && u.dims ? 260 : 200) - cam.dist) * 0.02;
    }
    cam.focus.lerp(cam.want, 1 - Math.exp(-1.6 * dtReal));
    cam.yaw += dtReal * 0.05;
  }
  function biggestFight() {
    const GS = W.ground && W.ground.sim; if (!GS) return null;
    let best = null, bn = 0;
    for (const I of W.islands) { const n = Math.min(W.ground.presence(I, 1), W.ground.presence(I, 2)); if (n > bn) { bn = n; best = I; } }
    return best ? _w.set(best.pad.x, best.pad.h + 4, best.pad.z) : null;
  }
  const interesting = () => W.units.filter(u => !u.dead && !u.gone && !u.dying && u.p && ['strike', 'drone', 'transport', 'escort', 'shrike', 'battleship', 'carrier', 'freighter', 'reaper'].includes(u.type));
  S.nextFollow = () => { const L = interesting(); if (!L.length) return; const i = L.indexOf(S.follow); S.follow = L[(i + 1) % L.length]; S.cam = 'FOLLOW'; };
  S.nextEvent = () => { const e = [...S.events].reverse().find(e => !e.used) || S.events[S.events.length - 1]; if (e) { S.shot = e; e.used = true; cam.holdT = 14; S.cam = 'ACTION'; } };
  S.camera = (camA, dt) => {
    const dtReal = Math.min(0.1, dt);
    if (S.cam === 'ACTION') director(dtReal);
    else if (S.cam === 'FOLLOW') {
      const u = S.follow && !S.follow.dead && !S.follow.gone ? S.follow : null;
      if (!u) S.nextFollow(); else { cam.focus.lerp(_v.set(u.p.x, u.p.y, u.p.z), 1 - Math.exp(-6 * dtReal)); cam.dist += ((u.dims ? 230 : u.type === 'strike' || u.type === 'escort' || u.type === 'shrike' ? 70 : 60) - cam.dist) * 0.05; }
    } else if (S.cam === 'FREE') {
      const k = cam.keys, sp = cam.dist * 0.9 * dtReal, f = _v.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)), r = _w.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
      if (k.KeyW || k.ArrowUp) cam.focus.addScaledVector(f, sp); if (k.KeyS || k.ArrowDown) cam.focus.addScaledVector(f, -sp);
      if (k.KeyD || k.ArrowRight) cam.focus.addScaledVector(r, sp); if (k.KeyA || k.ArrowLeft) cam.focus.addScaledVector(r, -sp);
      if (k.KeyQ) cam.yaw += dtReal * 1.2; if (k.KeyE) cam.yaw -= dtReal * 1.2;
      cam.focus.y = Math.max(h.groundY(cam.focus.x, cam.focus.z), 0) + 4;
    }
    const map = S.cam === 'MAP';
    const dist = map ? 1500 : cam.dist, pitch = map ? 1.45 : cam.pitch, yaw = map ? 0 : cam.yaw, fc = map ? _v.set(0, 0, 0) : cam.focus;
    cam.tgt.set(fc.x + Math.sin(yaw) * Math.cos(pitch) * dist, fc.y + Math.sin(pitch) * dist, fc.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    // never in the ground or the sea, never inside a hull
    const floor = Math.max(h.groundY(cam.tgt.x, cam.tgt.z), 0) + 6;
    if (cam.tgt.y < floor) cam.tgt.y = floor;
    if (!S.camInit) { cam.pos.copy(cam.tgt); S.camInit = true; }
    cam.pos.lerp(cam.tgt, 1 - Math.exp(-(map ? 3 : 2.5) * dtReal));
    const floor2 = Math.max(h.groundY(cam.pos.x, cam.pos.z), 0) + 5; if (cam.pos.y < floor2) cam.pos.y = floor2;
    camA.position.copy(cam.pos); camA.lookAt(fc.x, fc.y, fc.z);
    if (map) camA.rotation.z = 0;
    S.tReal += dtReal;
    if (S.overlay && (S.uiT = (S.uiT || 0) - dtReal) <= 0) { S.uiT = 0.25; render(); }
    S.focus = cam.focus;
  };

  // ---------------------------------------------------------------- input (ours first: the game's own keys would fly the Huey)
  const own = new Set(['Digit1', 'Digit2', 'Digit3', 'Space', 'KeyC', 'KeyF', 'KeyN', 'KeyH', 'KeyR', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Tab']);
  addEventListener('keydown', e => {
    if (!S.on || !own.has(e.code)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    cam.keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') S.speed = SPEEDS[+e.code.slice(5) - 1];
    else if (e.code === 'Space') S.paused = !S.paused;
    else if (e.code === 'KeyC' || e.code === 'Tab') { S.cam = CAMS[(CAMS.indexOf(S.cam) + 1) % CAMS.length]; if (S.cam === 'FOLLOW') S.nextFollow(); }
    else if (e.code === 'KeyF') S.nextFollow();
    else if (e.code === 'KeyN') S.nextEvent();
    else if (e.code === 'KeyH') { S.overlay = !S.overlay; el.style.display = S.overlay ? '' : 'none'; }
    else if (e.code === 'KeyR' || (e.code === 'Enter' && W.over)) { const q = new URLSearchParams(location.search); q.set('seed', S.seed + 1); location.search = q.toString(); }
  }, true);
  addEventListener('keyup', e => { if (S.on && own.has(e.code)) { cam.keys[e.code] = false; e.stopImmediatePropagation(); } }, true);
  const isCanvas = e => e.target && e.target.id === 'gl';
  addEventListener('mousedown', e => { if (!S.on || !isCanvas(e)) return; e.stopImmediatePropagation(); cam.drag = { x: e.clientX, y: e.clientY }; if (S.cam === 'ACTION' || S.cam === 'MAP') S.cam = 'FREE'; }, true);
  addEventListener('mousemove', e => { if (!S.on || !cam.drag) return; cam.yaw -= (e.clientX - cam.drag.x) * 0.005; cam.pitch = clamp(cam.pitch + (e.clientY - cam.drag.y) * 0.004, 0.08, 1.4); cam.drag = { x: e.clientX, y: e.clientY }; }, true);
  addEventListener('mouseup', e => { if (S.on) cam.drag = null; void e; }, true);
  addEventListener('click', e => { if (S.on && isCanvas(e)) e.stopImmediatePropagation(); }, true);
  addEventListener('wheel', e => { if (!S.on) return; cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 0.89), 25, 1400); e.stopImmediatePropagation(); }, { capture: true, passive: true });

  // ---------------------------------------------------------------- the overlay (analog 1980: phosphor on dark glass, stencil caps)
  let el, elB, elR, elTop, elTL, elMap, mapCtx, elEnd;
  function build() {
    const css = document.createElement('style');
    css.textContent = `
body.simmode #tl,body.simmode #tr,body.simmode #bot,body.simmode #radar,body.simmode #hint,body.simmode #war,body.simmode #feed,body.simmode #title{display:none!important}
#simov{position:fixed;inset:0;pointer-events:none;font-family:Consolas,"Courier New",monospace;color:#cfe;text-shadow:0 0 4px #000;z-index:5}
#simov .pan{position:absolute;top:12px;width:300px;max-width:calc(50vw - 24px);box-sizing:border-box;padding:8px 10px 6px;background:rgba(6,14,12,.78);border:1px solid #3d5a4a;box-shadow:inset 0 0 18px rgba(0,0,0,.6)}
#simov .pan.b{left:12px;border-left:3px solid #4cf}
#simov .pan.r{right:12px;border-right:3px solid #f74}
#simov h4{margin:0 0 2px;font-size:15px;letter-spacing:4px;font-weight:normal}
#simov .b h4{color:#7df}#simov .r h4{color:#fa7}
#simov .doc{font-size:12px;letter-spacing:2px;color:#ec6;margin-bottom:5px}
#simov .row{display:flex;justify-content:space-between;font-size:13px;line-height:1.45;border-bottom:1px dotted rgba(140,170,150,.18)}
#simov .row b{color:#fff;font-weight:normal}
#simov .gauge{height:5px;background:rgba(255,255,255,.08);margin:1px 0 3px}
#simov .gauge i{display:block;height:100%}
#simov .b .gauge i{background:#4cf}#simov .r .gauge i{background:#f74}
#simov .dec{margin-top:5px;font-size:11.5px;line-height:1.4;color:#9bb;max-height:7.2em;overflow:hidden}
#simov .dec div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#simov .dec div:first-child{color:#ffd}
#simov .dec span{color:#687;margin-right:6px}
#simov .top{position:absolute;left:50%;top:10px;transform:translateX(-50%);text-align:center;padding:5px 12px;background:rgba(6,14,12,.7);border:1px solid #3d5a4a;max-width:calc(100vw - 660px);min-width:250px;box-sizing:border-box}
#simov .clock{font-size:22px;letter-spacing:4px;color:#fff}
#simov .spd{font-size:12px;letter-spacing:3px;color:#ec6}
#simov .isl{display:flex;gap:3px;justify-content:center;margin-top:5px}
#simov .isl i{width:12px;height:12px;border:1px solid rgba(255,255,255,.35);box-sizing:border-box}
#simov .isl i.c{border-radius:0;outline:1px solid rgba(255,255,255,.5);outline-offset:1px}
#simov .tl{position:absolute;left:12px;right:250px;bottom:12px;height:92px;background:rgba(6,14,12,.78);border:1px solid #3d5a4a}
#simov .tl canvas{position:absolute;inset:0;width:100%;height:100%}
#simov .map{position:absolute;right:12px;bottom:12px;width:226px;height:226px;background:rgba(6,14,12,.78);border:1px solid #3d5a4a}
#simov .map canvas{width:100%;height:100%}
#simov .keys{position:absolute;left:12px;bottom:110px;font-size:11px;letter-spacing:1px;color:#8a9;background:rgba(6,14,12,.6);padding:3px 8px;border:1px solid #2c3f35}
#simov .keys b{color:#ec6;font-weight:normal}
#simov .end{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);padding:14px 26px;background:rgba(6,14,12,.88);border:1px solid #ec6;text-align:center;display:none}
#simov .end h3{margin:0;font-size:30px;letter-spacing:8px;color:#fff;font-weight:normal}
#simov .end p{margin:6px 0 0;font-size:14px;color:#cdb;letter-spacing:1px}
@media (max-width:820px){#simov .pan{width:calc(50vw - 18px);top:96px}#simov .top{max-width:calc(100vw - 24px);left:12px;right:12px;transform:none}#simov .tl{right:12px;bottom:12px}#simov .map{display:none}#simov .keys{display:none}}`;
    document.head.appendChild(css);
    el = document.createElement('div'); el.id = 'simov';
    el.innerHTML = `<div class="pan b"></div><div class="pan r"></div><div class="top"></div><div class="tl"><canvas></canvas></div><div class="map"><canvas width="226" height="226"></canvas></div>
      <div class="keys"><b>1 2 3</b> SPEED &middot; <b>SPACE</b> PAUSE &middot; <b>C</b> CAMERA &middot; <b>F</b> FOLLOW &middot; <b>N</b> NEXT EVENT &middot; <b>H</b> HIDE &middot; <b>R</b> NEXT WAR &middot; DRAG / WASD / WHEEL</div><div class="end"></div>`;
    document.body.appendChild(el);
    [elB, elR, elTop, elTL, elMap, elEnd] = ['.pan.b', '.pan.r', '.top', '.tl canvas', '.map canvas', '.end'].map(q => el.querySelector(q));
    mapCtx = elMap.getContext('2d');
  }
  function sidePanel(side) {
    const D = side === 1 ? blueD : redD, St = side === 1 ? W.P : W.E, c = side === 1 ? W.carrier : W.enemyCarrier, tech = side === 1 ? techB : techR;
    const isl = W.islands.filter(I => I.owner === side).length, alive = u => !u.dead && !u.dying && !u.gone;
    const air = W.units.filter(u => u.side === side && u.p && !u.dims && !u.ground && alive(u)).length, aa = W.islands.reduce((s, I) => s + W.aliveAA(I, side), 0);
    const gs = W.ground && W.ground.sim, gnd = gs ? gs.units.filter(u => u.alive && u.side === side && (u.kind !== 'marine' || u.able)).length : 0;
    const hp = c && c.sinking === undefined ? c.hp / c.hpMax : 0, str = strength(W, side);
    const cur = tech && tech.current ? `${techNode(tech.current.id)?.name || tech.current.id} ${Math.round(tech.progress * 100)}%` : tech && tech.mode === 'all' ? 'FULL TREE (TODAY\'S GAME)' : 'IDLE';
    const log = (side === 1 ? S.logB : S.logR) || [];
    const extra = side === 2 ? `<div class="row">LEVIATHAN<b>${W.battleship && W.battleship.sinking === undefined ? 'AT SEA' : Math.round(W.E.bship) + '% BUILT'}</b></div>` : `<div class="row">HORNETS<b>${SW ? SW.out() + ' UP / ' + (fleet.n.jet || 0) + ' SPARE' : '-'}</b></div>`;
    return `<h4>${side === 1 ? 'TASK FORCE ALBATROSS' : 'RUNAWAY'}</h4><div class="doc">DOCTRINE: ${esc(D.name)}</div>
      <div class="row">${side === 1 ? 'ALBATROSS' : 'KRAKEN'}<b>${c && c.sinking === undefined ? Math.round(hp * 100) + '%' : 'SUNK'}${c && c.sky && c.sky.up ? ' (FLYING)' : ''}</b></div><div class="gauge"><i style="width:${Math.round(hp * 100)}%"></i></div>
      <div class="row">MATERIEL<b>${Math.floor(St.mat)}</b></div><div class="row">FUEL<b>${Math.floor(St.fuel)}</b></div>
      <div class="row">ISLANDS<b>${isl}</b></div><div class="row">AIRCRAFT / AA / GROUND<b>${air} / ${aa} / ${gnd}</b></div>${extra}
      <div class="row">RESEARCH<b>${esc(cur)}</b></div><div class="row">STRENGTH<b>${Math.round(str)}</b></div>
      <div class="dec">${log.map(d => `<div><span>${mmss(d.t)}</span>${esc(d.what)}</div>`).join('') || '<div><span>-</span>NOTHING YET</div>'}</div>`;
  }
  function render() {
    if (!el) return;
    elB.innerHTML = sidePanel(1); elR.innerHTML = sidePanel(2);
    const ownCol = o => o === 1 ? '#4cf' : o === 2 ? '#f74' : '#776';
    elTop.innerHTML = `<div class="clock">${mmss(W.time)}</div><div class="spd">${S.paused ? 'PAUSED' : S.speed + 'X'}  &middot;  CAMERA ${S.cam}${S.cam === 'FOLLOW' && S.follow ? ' ' + esc(label(S.follow)) : S.cam === 'ACTION' && S.shot ? ': ' + esc(S.shot.text) : ''}  &middot;  SEED ${S.seed}</div>
      <div class="isl">${W.islands.map(I => `<i class="${I.cave ? 'c' : ''}" title="${esc(I.name)}" style="background:${ownCol(I.owner)}"></i>`).join('')}</div>`;
    timeline(); minimap();
    if (W.over && elEnd.style.display !== 'block') {
      elEnd.style.display = 'block';
      elEnd.innerHTML = `<h3>${W.over.result === 'win' ? 'TASK FORCE WINS' : 'RUNAWAY WINS'}</h3><p>${esc(W.over.why)} AFTER ${mmss(W.time)}</p><p>${esc(blueD.name)} vs ${esc(redD.name)}  &middot;  R: THE NEXT WAR (SEED ${S.seed + 1})</p>`;
    }
  }
  function timeline() {
    const cv = elTL, w = cv.clientWidth, hgt = cv.clientHeight; if (!w) return;
    if (cv.width !== w || cv.height !== hgt) { cv.width = w; cv.height = hgt; }
    const x = cv.getContext('2d'), span = Math.max(600, Math.ceil((W.time + 60) / 600) * 600), px = t => 8 + (w - 16) * t / span;
    x.clearRect(0, 0, w, hgt);
    x.font = '10px Consolas, monospace'; x.fillStyle = '#687'; x.strokeStyle = 'rgba(140,170,150,.25)';
    for (let t = 0; t <= span; t += 300) { x.beginPath(); x.moveTo(px(t), 12); x.lineTo(px(t), hgt - 4); x.stroke(); x.fillText(`${t / 60}M`, px(t) + 2, 10); }
    // the lead: TASK FORCE strength minus RUNAWAY's (above the line: TASK FORCE ahead)
    const s = T.samples, mid = hgt * 0.55; let mx = 30; for (const q of s) mx = Math.max(mx, Math.abs(q.s1 - q.s2));
    x.strokeStyle = 'rgba(200,200,180,.35)'; x.beginPath(); x.moveTo(px(0), mid); x.lineTo(px(span), mid); x.stroke();
    x.lineWidth = 1.5; x.beginPath(); s.forEach((q, i) => { const y = mid - (q.s1 - q.s2) / mx * (hgt * 0.32); if (i) x.lineTo(px(q.t), y); else x.moveTo(px(q.t), y); }); x.strokeStyle = '#ec6'; x.stroke(); x.lineWidth = 1;
    x.fillStyle = '#7df'; x.fillText('TASK FORCE AHEAD', w - 120, 22); x.fillStyle = '#fa7'; x.fillText('RUNAWAY AHEAD', w - 120, hgt - 6);
    for (const e of S.events) {
      if (e.kind === 'launch' && e.w < 6) continue;
      const X = px(e.t), col = e.side === 1 ? '#4cf' : e.side === 2 ? '#f74' : '#bbb';
      x.fillStyle = col;
      if (e.kind === 'capture') { x.fillRect(X - 2, e.side === 1 ? 14 : hgt - 14, 4, 10); }
      else if (e.kind === 'loss') { x.fillRect(X - 1, e.side === 1 ? hgt - 22 : 26, 2, e.w > 5 ? 10 : 5); }
      else x.fillRect(X - 1, mid - 2, 2, 4);
    }
    x.fillStyle = '#fff'; x.fillRect(px(W.time) - 1, 12, 2, hgt - 16);
  }
  function minimap() {
    const x = mapCtx, N = 226, k = N / 1400, P = (a, b) => [N / 2 + a * k, N / 2 + b * k];
    x.clearRect(0, 0, N, N); x.fillStyle = 'rgba(10,30,40,.5)'; x.fillRect(0, 0, N, N);
    for (const I of W.islands) { const [cx, cz] = P(I.x, I.z); x.fillStyle = I.owner === 1 ? 'rgba(70,190,255,.55)' : I.owner === 2 ? 'rgba(255,110,60,.55)' : 'rgba(170,160,120,.45)'; x.beginPath(); x.arc(cx, cz, Math.max(3, I.r * k * 0.8), 0, 6.283); x.fill(); if (I.cave) { x.strokeStyle = '#eee'; x.stroke(); } }
    for (const u of W.units) {
      if (u.dead || u.gone || !u.p) continue; const [cx, cz] = P(u.p.x, u.p.z); x.fillStyle = u.side === 1 ? '#9ef' : '#fb8';
      if (u.dims) { x.fillRect(cx - 3, cz - 3, 6, 6); } else if (!u.ground) x.fillRect(cx - 1, cz - 1, 2, 2);
    }
    const GS = W.ground && W.ground.sim; if (GS) for (const u of GS.units) if (u.alive) { const [cx, cz] = P(u.x, u.z); x.fillStyle = u.side === 1 ? '#bff' : '#fc9'; x.fillRect(cx, cz, 1, 1); }
    if (S.focus) { const [cx, cz] = P(S.focus.x, S.focus.z); x.strokeStyle = '#ec6'; x.strokeRect(cx - 6, cz - 6, 12, 12); }
  }
  return S;
}
