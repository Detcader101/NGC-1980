// VOICES: where the call-outs come from. Three kinds of hook, none of which changes the game:
//   hud(text)     every say() / feed() line the game already writes is matched against RULES; a match speaks the
//                 right person's version of it (the HUD line is the subtitle)
//   polls         the player's Huey (pre-lift clearing, skids up / down, clear down), the LSO on the player's approach
//                 (ball call, roger ball, power / high / low / lineup, wave-off), townsfolk running from the fighting,
//                 the Marines' reloads and grenades, fire-team chatter in a fight
//   events        the ground war's event stream (contacts, casualties, the corpsman, backblast, kills, the RUNAWAY's
//                 signals) through GW.onEvents, and hits on the player (hurtPlayer) for "taking fire, nine o'clock"
import { wallBetween } from './occlusion.js';
import { clock, fireDir, metres, fuelCall, RW_SIGNALS as SIG } from './phrases.js';

const D2R = Math.PI / 180, GS_TAN = Math.tan(3.5 * D2R);
const CS = { jet: 'Falcon one-one', tomcat: 'Bullet two-one', side: { jet: 'three zero five', tomcat: 'two zero one' }, bn: 'Albatross', co: 'Hotel two' };
// HUD designations -> what people say
/** @type {[RegExp, string][]} */
const SPEAK = [[/\bM151A?2?\b/g, 'mutt'], [/\bM35A2\b/g, 'deuce and a half'], [/\bM60A3\b/g, 'M sixty'], [/\bM113A?2?\b/g, 'one-thirteen'], [/\bCH-46\b/g, 'Sea Knight'], [/\bKC-130\b|\bC-130\b/g, 'Herky'],
  [/\bLCM-8\b/g, 'Mike boat'], [/\bRW-4 SHRIKE\b/g, 'Shrike'], [/\bRW-7 HOVER TANK\b/g, 'hover tank'], [/\bRW-\d+\b/g, ''], [/\bAIM-9\b/g, 'Sidewinder'], [/\bAIM-7\b/g, 'Sparrow'], [/\bAIM-54\b/g, 'Phoenix'],
  [/\bUH-1H?\b/g, 'Huey'], [/\bF-14A?\b/g, 'Tomcat'], [/\bF\/A-18A?\b/g, 'Hornet'], [/\bMV-22\b/g, 'Osprey'], [/\bG-11A\b/g, 'chutes'], [/\bCCP\b/g, 'casualty collection point']];
export function speakable(s) {
  let t = String(s).split(/\s+[-·]\s+|\s{2,}-\s{2,}|\s·\s/)[0].replace(/\(.*?\)/g, '').replace(/["!]/g, '').trim();
  for (const [re, w] of SPEAK) t = t.replace(re, w);
  t = t.toLowerCase().replace(/\s+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
const isl = s => speakable(s).toLowerCase().replace(/^the /, '').replace(/\b\w/g, c => c.toUpperCase());

export function createHooks(V) {
  const R = {};   // the game objects (attach)
  const people = new WeakMap(); let nextPerson = 0; // several villagers can share a doorway
  const H = { attached: false, heli: { landed: true, landT: 0, airT: 0, cleared: -99, clearDown: false }, lso: null, gwT: 0, civT: 0, rel: new Map(), frags: 0, fights: new Map(), sitrep: new Map(), lastHit: -99, deckT: 0, deckIndex: 0, stationIndex: 0 };
  const now = () => performance.now() / 1000;
  const C = () => V.ctx;
  const unit = () => C().unit;
  const say = o => V.speak(o);
  const ear = () => C().ear;

  // ------------------------------------------------------------------------------------------------ HUD rules
  // [regex, handler(m, text, src)]. src: 'say' (the centre line, usually your own unit) or 'feed' (the war log)
  const ic = (role, cat, o = {}) => say({ role, cat, net: 'ic', unit: unit(), src: 'hud', ...o,
    who: role === 'crew' ? unit() + ':' + (o.who || role) : o.who || (unit() + ':' + role) });
  const radio = (role, cat, net, o = {}) => say({ who: o.who || role, role, cat, net, src: 'hud', ...o });
  const crewChief = { who: 'huey:crewchief', sub: 'CREW CHIEF' }, gunner = { who: 'huey:gunner', sub: 'DOOR GUNNER' };
  const jetRole = () => unit() === 'tomcat' ? 'tomcat' : 'jet';
  /** @type {[RegExp, (match: RegExpMatchArray, text: string, source: string) => void][]} */
  const RULES = [
    // Actual AI Tomcat calls, each with its own modex/persona. Never invent an unseen wingman.
    [/^(VICTORY \d+): FOX (ONE|TWO|THREE)/, m => radio('jet', 'fox' + ({ ONE: 1, TWO: 2, THREE: 3 }[m[2]]), 'uhf', { who: m[1], vars: { cs: speakable(m[1]) }, key: m[1] + ':weapon', pri: 2 })],
    [/^(VICTORY \d+): (.+)/, m => radio('jet', 'flight', 'uhf', { who: m[1], text: speakable(m[1]) + '. ' + speakable(m[2]), key: m[1] + ':' + m[2], pri: 1 })],

    // ---- Huey crew
    [/^CREW CHIEF: COME ON/, () => ic('huey', 'troopsOn', { ...crewChief, text: 'Come on, come on! Get aboard!', shout: true })],
    [/^CREW CHIEF: LOAD IS OFF THE GROUND/, () => ic('huey', 'cargoHook', { ...crewChief, text: 'Load is off the ground.' })],
    [/^CREW CHIEF: LOAD IS CLEAR/, () => ic('huey', 'cargoHook', { ...crewChief, text: 'Load is clear. Clear forward.' })],
    [/^CREW CHIEF: TENSION/, () => ic('huey', 'cargoHook', { ...crewChief, text: 'Tension... you have the load.' })],
    [/^CREW CHIEF: LOAD ON THE GROUND/, () => ic('huey', 'cargoHook', { ...crewChief, text: 'Load on the ground. Slack.' })],
    [/^CREW CHIEF: LOAD SWINGING/, () => ic('huey', 'cargoHook', { ...crewChief, text: 'Load is swinging. Ease it, ease it.', pri: 2 })],
    [/^CREW CHIEF: TOO FAST/, () => ic('huey', 'cargoHook', { ...crewChief, text: 'Too fast for the load. Slow down.', pri: 2 })],
    [/^CREW CHIEF: (.+)/, m => ic('huey', 'misc', { ...crewChief, text: speakable(m[1]) })],
    [/ABOARD\s+-\s+CLEAR TO LIFT|MARINES ABOARD  -/, () => ic('huey', 'troopsOn', crewChief)],
    [/^HUEY: \d+ MARINES ASHORE/, () => { if (unit() === 'heli') ic('huey', 'troopsOff', crewChief); }],
    [/^FLAME-OUT|^FUEL EXHAUSTED|MAIN FUEL OFF  -  ENGINE CUT/, () => ic('huey', 'autorotate', { who: 'pilot', pri: 3, sub: 'PILOT' })],
    [/^ENGINE FIRE  -  PRESS O/, () => ic('huey', 'fireEng', { ...crewChief, pri: 3 })],
    [/TAIL ROTOR SHOT AWAY|MAIN ROTOR DESTROYED/, () => ic('huey', 'brace', { ...crewChief, pri: 3 })],
    [/^MAST BUMPING/, () => ic('huey', 'low', { who: 'pilot', text: 'Easy! Mast bumping!', pri: 3, sub: 'PILOT' })],
    [/^HARD LANDING/, () => { if (unit() === 'heli') ic('huey', 'misc', { ...crewChief, text: 'Hard landing. Checking the skids.' }); }],
    // ---- the carrier, the deck, the LSO
    [/^ALBATROSS: (HORNET|TOMCAT) LAUNCHED/, m => radio('boss', 'launched', 'uhf', { who: 'boss', vars: { cs: m[1] === 'HORNET' ? CS.jet : CS.tomcat } })],
    [/^ALBATROSS: (HORNET|TOMCAT) RECOVERED, (\d)/, m => radio('boss', 'recovered', 'uhf', { who: 'boss', vars: { cs: m[1] === 'HORNET' ? CS.jet : CS.tomcat, n: ['', 'one', 'two', 'three', 'four'][+m[2]] } })],
    [/^ALBATROSS: TURNING|^ALBATROSS: COURSE SET/, () => radio('command', 'carrier', 'uhf', { who: 'conn', pri: 0 })],
    [/^ALBATROSS IS SINKING|^THE ALBATROSS IS SCRAPING/, () => radio('boss', 'sinking', 'pa', { who: 'boss', pri: 3, pos: carrierPos() })],
    [/ON CAT 1  -  THROTTLE/, () => { say({ who: 'shooter', role: 'deck', cat: 'cat', net: 'air', shout: true, pos: carrierPos(), src: 'hud' }); say({ who: 'boss', role: 'boss', cat: 'launch', net: 'uhf', pri: 1, after: 1.2, src: 'hud' }); }],
    [/^CAT 1 IS FOULED|^FOUL DECK|^DECK FULL/, () => radio('lso', 'foul', 'uhf', { who: 'lso', pri: 3 })],
    [/: TAXI  -  FOLLOW THE YELLOW SHIRT/, () => say({ who: 'director', role: 'deck', cat: 'taxi', net: 'air', shout: true, pos: carrierPos(), src: 'hud' })],
    [/SPOTTED  -  NUMBER \d FOR CAT 1/, () => say({ who: 'director', role: 'deck', cat: 'spot', net: 'air', shout: true, pos: carrierPos(), src: 'hud', pri: 0 })],
    [/^BOLTER  BOLTER/, () => radio('lso', 'bolter', 'uhf', { who: 'lso', pri: 3 })],
    [/^TRAPPED  -  (\d) WIRE/, m => { H.lso = null; radio('lso', 'trap', 'uhf', { who: 'lso', text: m[1] === '3' ? 'Okay three. Nice trap.' : `${['', 'One', 'Two', 'Three', 'Four'][+m[1]]} wire. Good trap.` }); }],
    [/^LIFT (\d) (GOING DOWN|COMING UP)/, () => say({ who: 'deckedge', role: 'deck', cat: 'general', net: 'air', shout: true, pos: carrierPos(), src: 'hud', pri: 0 })],
    // ---- jets: your own calls and the RIO
    [/^FOX (ONE|TWO|THREE)/, m => { const f = { ONE: 'fox1', TWO: 'fox2', THREE: 'fox3' }[m[1]]; if (unit() === 'tomcat' && f === 'fox3') ic('rio', 'fox3', { who: 'rio' }); else radio('jet', f, 'uhf', { who: 'player', vars: { cs: CS[jetRole()] }, pri: 2 }); }],
    [/^AIRBORNE/, () => { radio('jet', 'airborne', 'uhf', { who: 'player', text: CS[jetRole()] + ', airborne.' }); radio('tower', 'departure', 'uhf', { who: 'tower', vars: { cs: CS[jetRole()] }, after: 2 }); }],
    [/^MISSILE LAUNCH/, () => unit() === 'tomcat' ? ic('rio', 'chaff', { who: 'rio', text: 'Missile launch! Break! Break!', pri: 3 }) : radio('jet', 'missile', 'uhf', { who: 'player', text: 'Missile in the air! Break, break!', pri: 3 })],
    [/^SPLASH ONE|^ENEMY REAPER SHOT DOWN|^ENEMY TRANSPORT SHOT DOWN/, () => radio('jet', 'splash', 'uhf', { who: 'player', pri: 2 })],
    [/^CONTACT (\S*) (\d+) m/, m => { if (unit() === 'tomcat') ic('rio', 'contact', { who: 'rio', vars: { clock: 'nose', dist: Math.max(1, Math.round(+m[2] / 1852)) } }); }],
    [/^LOCK BROKEN/, () => { if (unit() === 'tomcat') ic('rio', 'lock', { who: 'rio', text: 'Lost the lock.' }); }],
    [/^STT  -  TRACK \d+ LOCKED/, () => { if (unit() === 'tomcat') ic('rio', 'lock', { who: 'rio' }); }],
    [/^BREAK LOCK  -  TWS|^.*TWS$/, () => { if (unit() === 'tomcat') ic('rio', 'tws', { who: 'rio' }); }],
    [/^EJECT  EJECT  EJECT|^ALARM BELL  -  ABANDON/, () => unit() === 'tomcat' ? ic('rio', 'eject', { who: 'rio', pri: 3 }) : ic('jet', 'eject', { who: 'player', pri: 3 })],
    [/(LEFT|RIGHT) ENGINE (COMPRESSOR STALL|FLAMED OUT)/, m => unit() === 'tomcat' ? ic('rio', 'engine', { who: 'rio', text: speakable(m[0]), pri: 3 }) : V.betty(`ENGINE ${m[1]}`, 6)],
    [/^ENGINE OVERTEMP/, () => unit() === 'heli' ? ic('huey', 'engine', { ...crewChief, text: 'Engine temperature high.', pri: 3 }) : unit() === 'tomcat' ? ic('rio', 'engine', { who: 'rio', text: 'Engine temperature high.', pri: 3 }) : V.betty('ENGINE OVERTEMP', 6)],
    [/^GEAR WILL NOT EXTEND/, () => unit() === 'tomcat' ? ic('rio', 'gear', { who: 'rio', text: 'Check the landing gear.', pri: 3 }) : V.betty('LANDING GEAR', 6)],
    // ---- ground vehicle crews (your own vehicle)
    [/^DRIVER, START UP/, () => ic('crew', 'driverStart', { who: 'tc', sub: false })],
    [/^DRIVER, SHUT IT DOWN/, () => ic('crew', 'driverStop', { who: 'tc' })],
    [/^COMMANDER: GUNNER, TARGET/, () => ic('crew', 'gunner', { who: 'tc', text: 'Gunner, target, tank!' })],
    [/^GUNNER: IDENTIFIED/, () => ic('crew', 'gunner', { who: 'gunner', text: 'Identified!' })],
    [/^LOADER: UP/, () => ic('crew', 'loader', { who: 'loader', text: 'Up!', shout: true })],
    [/^COMMANDER: MISSED  -  (OVER|SHORT)/, m => ic('crew', 'miss', { who: 'tc', text: m[1] === 'OVER' ? 'Over! Drop fifty, re-lay!' : 'Short! Add fifty!' })],
    [/^COMMANDER: TARGET!/, () => ic('crew', 'target', { who: 'tc' })],
    [/: BUTTON UP!/, () => ic('crew', 'button', { who: 'tc', pri: 2 })],
    [/BAIL OUT!/, () => ic('crew', 'bail', { who: 'tc', pri: 3 })],
    [/^FIRE  -  /, () => ic('crew', 'fire', { who: 'driver', pri: 3 })],
    [/^ALL CLEAR  -  THE CREW IS BACK UP/, () => ic('crew', 'button', { who: 'tc', text: 'All clear. Back up in the hatches.' })],
    [/^BACKBLAST AREA CLEAR!/, () => say({ who: 'player', role: 'marine', cat: 'backblast', net: 'air', pos: ear(), shout: true, src: 'hud', pri: 2 })],
    // ---- the player on foot
    [/^FRAG OUT/, () => say({ who: 'player', role: 'marine', cat: 'frag', net: 'air', pos: ear(), shout: true, src: 'hud', pri: 2 })],
    [/^EMPTY  -  R TO RELOAD/, () => say({ who: 'player', role: 'marine', text: 'Empty!', net: 'air', pos: ear(), shout: true, src: 'hud', pri: 1, cd: 5 })],
    [/^CEASE FIRE!  -  YOU HIT/, () => say({ who: 'sl', role: 'marine', cat: 'ceaseFire', net: 'air', pos: ear(), shout: true, src: 'hud', pri: 3 })],
    [/^HIT  -  [A-Z ]+(\(STOPPED BY ARMOUR\))?/, m => { if (C().craft === 'foot') say({ who: 'player', role: 'marine', cat: 'hit', net: 'air', pos: ear(), shout: true, src: 'hud', pri: 3, cd: 4 }); }],
    [/^"HANG ON, I GOT YOU"/, () => say({ who: 'doc', role: 'marine', cat: 'doc', net: 'air', pos: ear(), shout: true, src: 'hud', pri: 2, text: 'Hang on, I got you!' })],
    // ---- command net: the board, controllers, logistics, research, intel
    [/^COMMAND: (.+?) OUT AT (.+)/, m => radio('command', 'deploy', 'fm', { who: 'albatross', vars: { what: speakable(m[1]), isl: isl(m[2]) } })],
    [/^COMMAND: (.+?) STOOD DOWN/, m => radio('command', 'standDown', 'fm', { who: 'albatross', vars: { what: speakable(m[1]) } })],
    [/^COMMAND: (.+?) BY C-130 AIR DROP TO (.+?)\s/, m => radio('command', 'airdrop', 'fm', { who: 'herky', vars: { cs: 'six-one', isl: isl(m[2]) } })],
    [/^COMMAND: TAKE THE ISLANDS/, () => radio('boss', 'flightQuarters', 'pa', { who: 'boss', pos: carrierPos, pri: 1, after: 0.8 })],
    [/^RESEARCH COMPLETE: (.+)/, m => radio('command', 'research', 'fm', { who: 'albatross', vars: { what: speakable(m[1]) }, pri: 1 })],
    [/^NEW (HORNET|TOMCAT) DELIVERED|^MATERIEL: A NEW (.+?) FOR|^NEW HELICOPTER/, m => radio('command', 'materiel', 'fm', { who: 'albatross', vars: { what: speakable(m[2] || m[1] || 'Huey') }, pri: 0 })],
    [/^RADAR: (.+)/, m => radio('command', 'radar', 'uhf', { who: 'combat', vars: { what: speakable(m[1]) }, pri: 2 })],
    [/^INTEL: (.+)/, m => radio('command', 'intel', 'fm', { who: 'intel', vars: { what: speakable(m[1]) } })],
    [/^ENEMY LANDING ON (.+)/, m => radio('command', 'enemyLanding', 'fm', { who: 'combat', vars: { isl: isl(m[1]) }, pri: 2 })],
    [/^WE HAVE TAKEN (.+)/, m => radio('command', 'islandTaken', 'fm', { who: 'albatross', vars: { isl: isl(m[1]) }, pri: 1 })],
    [/^ENEMY HAS TAKEN (.+)/, m => radio('command', 'islandLost', 'fm', { who: 'albatross', vars: { isl: isl(m[1]) }, pri: 2 })],
    [/^SEA KNIGHT (DOWN$|LOST|HIT)/, () => radio('command', 'seaKnightDown', 'fm', { who: 'knight11', pri: 3 })],
    [/^(.+?): (\d+) MARINES OFF THE RAMP/, m => radio('command', 'seaKnight', 'fm', { who: 'knight11', text: `Knight one-one, on deck at ${isl(m[1])}. Troops off. Out.` })],
    [/^(.+?): SEA KNIGHT LIFTING WITH (\d+) WOUNDED/, m => radio('command', 'seaKnight', 'fm', { who: 'knight11', text: `Knight one-one, lifting from ${isl(m[1])} with ${m[2]} wounded. Over.`, pri: 2 })],
    [/^SEA KNIGHT DOWN SAFELY/, () => radio('command', 'seaKnight', 'fm', { who: 'knight11', text: 'Knight one-one is down. Shutting down. Out.' })],
    [/^(.+?): MARINES TAKING CASUALTIES  -  (\d+) KILLED, (\d+) WOUNDED/, m => { radio('rto', 'cas', 'fm', { who: 'rto:' + m[1], vars: { cs: CS.bn, cs2: CS.co, isl: isl(m[1]), n: +m[3] || 'several' }, pri: 2 }); say({ who: 'albatross', role: 'rto', cat: 'ack', net: 'fm', vars: { cs2: CS.co }, after: 1, src: 'hud', pri: 1 }); }],
    [/^LOGISTICS TEAM DISPATCHED|^EMERGENCY LANDING  -  LOGISTICS/, () => radio('command', 'logistics', 'fm', { who: 'logistics', vars: { what: 'A repair team' } })],
    [/^MOTOR POOL: (.+?) (?:AT|FOR) (.+)/, m => radio('command', 'logistics', 'fm', { who: 'logistics', vars: { what: speakable(m[1]) }, pri: 0 })],
    [/^AIR DROP: KC-130 (\S+) WITH/, m => radio('command', 'airdrop', 'fm', { who: 'herky', vars: { cs: speakable(m[1]), isl: '' }, text: `Albatross, Herky ${speakable(m[1])}. Inbound with the drop. Over.` })],
    [/^(\S+): GREEN LIGHT/, m => radio('command', 'airdrop', 'fm', { who: 'herky', text: 'Green light. Load away.', pri: 2 })],
    [/^JUMPMASTER: GO!/, () => say({ who: 'jumpmaster', role: 'marine', net: 'ic', unit: unit(), text: 'Go! Go! Go!', pri: 3, src: 'hud' })],
    [/^JUMPMASTER: (.+)/, m => say({ who: 'jumpmaster', role: 'marine', net: 'ic', unit: unit(), text: speakable(m[1]), pri: 2, src: 'hud' })],
    [/^THE LEVIATHAN IS AT SEA|^THE KRAKEN IS SINKING|^LEVIATHAN SUNK/, m => radio('command', 'radar', 'uhf', { who: 'combat', text: /SINK|SUNK/.test(m[0]) ? 'All stations, Combat. Enemy capital ship is going down. Out.' : 'All stations, Combat. Enemy battleship is at sea. Set condition one. Out.', pri: 2 })],
  ];
  H.hud = (text, src) => {
    if (!text || !H.attached) return;
    C().unit = C().craft = R.G.craft;
    if (C().state !== 'play' && R.G.state === 'play' && R.H) Object.assign(C().ear, R.H.pos, { yaw: heading() });
    for (const [re, fn] of RULES) { const m = text.match(re); if (m) { try { fn(m, text, src); } catch (e) { console.warn('voices rule', re, e); } return; } }
  };

  // ------------------------------------------------------------------------------------------------ direct events
  H.event = (name, d = {}) => {
    if (!H.attached) return;
    if (name === 'reload' && unit() === 'foot') { say({ who: 'player', role: 'marine', cat: 'reload', net: 'air', pos: d.pos || ear(), shout: true, pri: 1 }); return; }
    if (name === 'doorGun' && unit() === 'heli') { say({ ...gunner, role: 'huey', cat: 'gunner', net: 'ic', unit: 'heli', cd: 9, vars: { clock: "three o'clock" } }); return; }
    if (name === 'hurt') {   // the player is hit: in the Huey, the side that saw it calls it with the clock
      const c = unit(); if (c !== 'heli' || now() - H.lastHit < 3) return; H.lastHit = now();
      let clk = null;
      if (d.at && R.H) { const hd = heading(); const rel = Math.atan2(d.at.x - R.H.pos.x, -(d.at.z - R.H.pos.z)) - hd; clk = clock(rel); }
      else if (d.dir) { const rel = Math.atan2(-d.dir.x, d.dir.z) - heading(); clk = clock(rel); }
      const left = clk && /seven|eight|nine|ten|eleven/.test(clk), who = left ? crewChief : gunner;
      if (clk) say({ ...who, role: 'huey', cat: 'takingFire', net: 'ic', unit: 'heli', vars: { clock: clk }, pri: 3, cd: 4 });
      else say({ ...who, role: 'huey', cat: 'hit', net: 'ic', unit: 'heli', pri: 3, cd: 4 });
    }
  };

  // ------------------------------------------------------------------------------------------------ attach
  H.attach = refs => {
    Object.defineProperties(R, Object.getOwnPropertyDescriptors(refs)); H.attached = true;
    V.occluded = (a, b) => wallBetween(a, b, R.worldSolid, R.war?.carrier);
    if (R.war?.ground && !R.war.ground.__voiceEvents) {
      const previous = R.war.ground.onEvents;
      R.war.ground.onEvents = evs => { previous?.(evs); groundEvents(evs); };
      R.war.ground.__voiceEvents = true;
    }
  };

  // ------------------------------------------------------------------------------------------------ helpers
  function carrierPos() { const c = R.war && R.war.carrier; return c ? { x: c.p.x, y: c.p.y + 10, z: c.p.z } : null; }
  function heading() { const Hs = R.H; if (!Hs) return 0; return typeof Hs.heading === 'function' ? Hs.heading() : 0; }   // radians, clockwise from north (-z)
  const GS = () => R.war && R.war.ground && R.war.ground.sim;
  const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;

  // ------------------------------------------------------------------------------------------------ polls
  H.update = dt => {
    if (!H.attached) return;
    const c = C(), G = R.G;
    // the listener and your unit
    const cam = R.cam; if (cam) { cam.updateMatrixWorld?.(); const m = cam.matrixWorld.elements; c.ear.x = m[12]; c.ear.y = m[13]; c.ear.z = m[14]; c.ear.yaw = Math.atan2(-m[8], m[10]); }   // (the XR camera too: its world matrix)
    c.craft = G.craft; c.unit = G.craft;
    c.inside = G.craft === 'jet' || G.craft === 'tomcat' || (R.crafts && R.crafts.active && R.crafts.active.kind === 'ground' && R.cockpit?.());
    if (G.craft === 'heli') huey(dt);
    if (G.craft === 'jet' || G.craft === 'tomcat') lso(dt); else H.lso = null;
    if ((H.civT -= dt) <= 0) { H.civT = 1.2; townsfolk(); deckPeople(); }
    if ((H.gwT -= dt) <= 0) { H.gwT = 0.5; marinePolls(); }
  };

  function huey(dt) {
    const Hs = R.H, s = H.heli, Z = R.Z; if (!Hs || !Z || !Z.alive) return;
    const t = now(), landed = !!Hs.landed, coll = Hs.c ? Hs.c.coll : 0, nr = Hs.rpm ?? 1;
    if (!landed && nr < 0.9 && coll > 0.3) say({ ...crewChief, role: 'huey', cat: 'low', net: 'ic', unit: 'heli', pri: 3, cd: 6 });
    const wasAirT = s.airT;
    if (landed) { s.landT += dt; s.airT = 0; } else { s.airT += dt; }
    // pulling pitch on the ground with the rotor up to speed: the crew clear the aircraft, left (chief), right (gunner), tail
    if ((landed || s.landed) && s.landT > 2 && coll > 0.3 && nr > 0.9 && t - s.cleared > 40) {
      s.cleared = t;
      say({ ...crewChief, role: 'huey', cat: 'clearL', net: 'ic', unit: 'heli', pri: 1 });
      say({ ...gunner, role: 'huey', cat: 'clearR', net: 'ic', unit: 'heli', pri: 1 });
      say({ ...crewChief, role: 'huey', cat: 'tail', net: 'ic', unit: 'heli', pri: 1, key: 'huey.tail' });
    }
    if (s.landed && !landed && s.landT > 2) { say({ who: 'pilot', sub: 'PILOT', role: 'huey', cat: 'comingUp', net: 'ic', unit: 'heli', pri: 1, cd: 20 }); say({ ...crewChief, role: 'huey', cat: 'skidsUp', net: 'ic', unit: 'heli', pri: 1, cd: 20 }); s.clearDown = false; }
    if (!s.landed && landed && wasAirT > 6) say({ ...gunner, role: 'huey', cat: 'skidsDown', net: 'ic', unit: 'heli', pri: 1, cd: 15 });
    // short final: clear down both sides
    const agl = Hs.agl ?? 99, spd = Hs.vel ? Math.hypot(Hs.vel.x, Hs.vel.z) : 0;
    if (!landed && s.airT > 8 && agl < 12 && agl > 2 && spd < 12 && Hs.vel && Hs.vel.y < -0.3 && !s.clearDown) { s.clearDown = true; say({ ...crewChief, role: 'huey', text: 'Clear down left.', cat: 'clearDown', net: 'ic', unit: 'heli' }); say({ ...gunner, role: 'huey', text: 'Clear down right.', cat: 'clearDownR', net: 'ic', unit: 'heli' }); }
    if (agl > 30) s.clearDown = false;
    if (!landed) s.landT = 0;
    s.landed = landed;
  }

  // the LSO: talks the player down from the ball call to the wires. Glideslope 3.5 deg to the 3 wire, centreline at
  // deck x -2.5 (airframe.js DECKOPS); corrections every ~1.6 s, a wave-off when out of parameters in close
  function lso(dt) {
    const c = R.war && R.war.carrier; if (!c || c.sinking !== undefined) return;
    const A = unit() === 'tomcat' ? R.tomcatC && R.tomcatC.A : R.JP && R.JP.J; if (!A || !A.pos) return;
    const dx = A.pos.x - c.p.x, dz = A.pos.z - c.p.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const lx = dx * co - dz * si, lz = dx * si + dz * co, deck = 8 + c.p.y, Rn = lz - 37, lat = lx + 2.5, hErr = A.pos.y - (deck + 3 + GS_TAN * Math.max(0, Rn));
    const dirty = (A.gear ?? 1) > 0.9 && (A.hookCmd || A.hook), t = now();
    if (A.onGround || !dirty || Rn < 0 || Rn > 2200 || Math.abs(lat) > 400) { if (H.lso && (Rn < 0 || Rn > 2200 || A.onGround)) H.lso = null; return; }
    const L = H.lso || (H.lso = { ball: false, next: 0, wo: false, tower: false });
    if (!L.tower && Rn > 1300) { L.tower = true; say({ who: 'tower', role: 'tower', cat: 'inbound', net: 'uhf', vars: { cs: CS[unit()] } }); }
    if (!L.ball && Rn < 1300 && Rn > 500 && Math.abs(lat) < 150 && hErr > -40 && hErr < 80) {
      L.ball = true; L.next = t + 3;
      const fuel = fuelCall((A.fuel ?? 0) * 2.2046), type = unit() === 'tomcat' ? 'Tomcat' : 'Hornet';
      say({ who: 'player', role: 'pilotBall', cat: 'ball', net: 'uhf', vars: { side: CS.side[unit()], type, fuel }, pri: 2, sub: 'PILOT' });
      say({ who: 'lso', role: 'lso', cat: 'rogerBall', net: 'uhf', vars: { cs: type }, pri: 2, after: 0.6 });
      return;
    }
    if (!L.ball || L.wo) return;
    if (Rn < 280 && (Math.abs(hErr) > 14 || Math.abs(lat) > 22)) { L.wo = true; say({ who: 'lso', role: 'lso', cat: 'waveoff', net: 'uhf', pri: 3 }); return; }
    if (t < L.next) return;
    L.next = t + 1.6;
    if (hErr < -5) say({ who: 'lso', role: 'lso', cat: Rn < 500 ? 'power' : 'low', net: 'uhf', pri: 2, cd: 1.5 });
    else if (hErr > 8) say({ who: 'lso', role: 'lso', cat: 'high', net: 'uhf', pri: 2, cd: 1.5 });
    else if (lat > 8) say({ who: 'lso', role: 'lso', cat: 'lineupL', net: 'uhf', pri: 2, cd: 1.5 });
    else if (lat < -8) say({ who: 'lso', role: 'lso', cat: 'lineupR', net: 'uhf', pri: 2, cd: 1.5 });
    else if (Math.random() < 0.3) say({ who: 'lso', role: 'lso', cat: 'onball', net: 'uhf', pri: 1, cd: 4 });
  }

  function townsfolk() {
    const A = R.world && R.world.ambient; if (!A || !A.people) return; const e = ear();
    for (const p of A.people) {
      if (p.state === 'inside' || !near(p, e, p.state === 'flee' ? 50 : 10)) continue;
      if (!people.has(p)) people.set(p, ++nextPerson);
      const id = people.get(p);
      say({ who: 'civ' + id, role: 'civ', cat: p.state === 'flee' ? 'flee' : 'see', net: 'air', pos: () => ({ x: p.x, y: p.y + 1.6, z: p.z }), shout: p.state === 'flee', pri: 0, key: 'civ:' + id, cd: 45 });
      if (V.queue.length) return;
    }
  }

  // Every rendered deck/interior crew member has a stable identity and a nearby open-air voice.
  // Round-robin eligible members, never a constant stream of off-screen deck chatter.
  function shipPos(c, p) {
    const co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const seat = p.at?.(), x = seat ? seat[0] : p.x, z = seat ? seat[2] : p.z, y = seat ? seat[1] : p.y;
    return { x: c.p.x + x * co + z * si, y: c.p.y + (c.att?.heave || 0) + y + (seat ? 1.18 : 1.6), z: c.p.z - x * si + z * co };
  }
  function deckPeople() {
    if (unit() !== 'foot' || now() < H.deckT || V.cur || V.queue.length) return;
    const c = R.war?.carrier; if (!c || c.sinking !== undefined) return;
    const members = c.parts?.crew?.members || [], stations = c.interior?.crew || [];
    for (let n = 0; n < members.length + stations.length; n++) {
      const index = H.deckIndex++ % (members.length + stations.length), station = index >= members.length;
      const p = station ? stations[index - members.length] : members[index], pos = shipPos(c, p);
      if (Math.hypot(pos.x - ear().x, pos.y - ear().y, pos.z - ear().z) > 16 || V.occluded(ear(), pos)) continue;
      const captain = p.jersey === 'brown', role = captain ? 'captain' : 'deck';
      const text = station ? (p.kind === 'pilot' ? 'Standing by for the brief.' : p.kind === 'officer' ? 'Keep me informed.' : 'Standing by.') : null;
      const e = say({ who: (station ? 'station:' : 'deck:') + index, role, cat: captain ? 'ready' : 'general', text,
        net: 'air', pos: () => shipPos(c, p), pri: 0, cd: 45, key: 'person:' + index });
      if (e) { H.deckT = now() + 7; return; }
    }
  }

  // ------------------------------------------------------------------------------------------------ the ground war
  const mpos = u => () => ({ x: u.x, y: (u.y || 0) + 1.6, z: u.z });
  const marines = () => { const S = GS(); return S ? S.units.filter(u => u.kind === 'marine' && u.side === 1 && u.alive && u.able) : []; };
  function nearestMarine(x, z, r, not) { let b = null, bd = r; for (const u of marines()) { if (u.id === not) continue; const d = Math.hypot(u.x - x, u.z - z); if (d < bd) { bd = d; b = u; } } return b; }
  const mWho = u => 'm' + u.id;
  function marinePolls() {
    const S = GS(); if (!S) return; const e = ear(), t = now();
    // reloads of the rich (rifleman-sim) Marines near you, and fresh grenades in the air
    for (const u of S.units) {
      if (u.kind !== 'marine' || u.side !== 1 || !u.alive || !near(u, e, 60)) continue;
      const rs = u.rich && u.rich.stats; if (rs) { const r0 = H.rel.get(u.id) ?? rs.reloads; if (rs.reloads > r0) say({ who: mWho(u), role: 'marine', cat: 'reload', net: 'air', pos: mpos(u), shout: true, pri: 1, key: 'reload' + u.id, cd: 6 }); H.rel.set(u.id, rs.reloads); }
    }
    for (const p of S.proj || []) if (p.frag && p.side === 1 && !p._v) { p._v = 1; const u = S.units.find(q => q.id === p.src); if (u) say({ who: mWho(u), role: 'marine', cat: 'frag', net: 'air', pos: mpos(u), shout: true, pri: 2, key: 'frag' + u.id, cd: 3 }); }
    // a squad in a fight near you: fire-team chatter every few seconds
    for (const [B, f] of H.fights) {
      if (t - f.t > 25) { H.fights.delete(B); continue; }
      if (t < f.next) continue; f.next = t + 4 + Math.random() * 5;
      const live = (B.units || []).filter(u => u.alive && u.able && near(u, e, 90)); if (!live.length) continue;
      const u = live[Math.floor(Math.random() * live.length)], sl = u.role === 'sl';
      const cat = sl ? (Math.random() < 0.5 ? 'order' : 'advance') : ['move', 'cover', 'set', 'cover'][Math.floor(Math.random() * 4)];
      say({ who: mWho(u), role: sl ? 'sl' : 'marine', cat, net: 'air', pos: mpos(u), shout: true, pri: 0, key: 'chat' + u.id, cd: 5 });
    }
  }
  function groundEvents(evs) {
    if (!H.attached || V.paused) return;
    const S = GS(); if (!S) return; const e = ear(), t = now();
    for (const ev of evs) {
      if (ev.x === undefined) continue;
      switch (ev.e) {
        case 'shot': {
          if (ev.side !== 2) break;
          const src = S.units.find(q => q.id === ev.src);
          // the RUNAWAY unit itself: a data burst when it opens fire (near you)
          if (src && near(ev, e, 120) && Math.random() < 0.35) say({ who: 'rw' + ev.src, role: 'rw', text: 'engage', sig: SIG.engage, net: 'rw', pos: ev, pri: 0, key: 'rwsig' + ev.src, cd: 5 });
          // the nearest Marine who can see / hear it calls the contact: relative to where he faces, range rounded
          const m = nearestMarine(ev.x, ev.z, 350); if (!m || !near(m, e, 160)) break;
          const rel = Math.atan2(ev.x - m.x, -(ev.z - m.z)) - -(m.yaw || 0), dist = Math.hypot(ev.x - m.x, ev.z - m.z);
          const kind = src ? src.kind : ev.kind, cat = kind === 'strider' ? 'walker' : kind === 'hovertank' || kind === 'mbt' ? 'armour' : 'contact';
          const B = m.B || m.squad || 'sq';
          say({ who: mWho(m), role: 'marine', cat, net: 'air', pos: mpos(m), shout: true, pri: 2, key: 'contact:' + (B.I ? B.I.name : m.id), cd: 14, vars: { dir: fireDir(rel), dist: metres(dist), what: kind === 'strider' ? 'walker' : 'machines' } });
          if (B && typeof B === 'object') { const f = H.fights.get(B) || { next: t + 3 }; f.t = t; H.fights.set(B, f); }
          // the squad's radio operator reports it up the command net (once a minute per island)
          const I = B.I || ev.I; const nm = I ? I.name : 'the beach';
          if (t - (H.sitrep.get(nm) ?? -99) > 60) { H.sitrep.set(nm, t); say({ who: 'rto:' + nm, role: 'rto', cat: 'sitrep', net: 'fm', vars: { cs: CS.bn, cs2: CS.co, isl: isl(nm) }, pri: 0, maxAge: 10, after: 2 }); say({ who: 'albatross', role: 'rto', cat: 'ack', net: 'fm', vars: { cs2: CS.co }, pri: 0, maxAge: 14, after: 6 }); }
          break;
        }
        case 'callout': { const u = S.units.find(q => q.id === ev.id); say({ who: u ? mWho(u) : 'cas' + ev.id, role: 'marine', cat: /CORPSMAN/.test(ev.text) ? 'corpsman' : 'hit', net: 'air', pos: ev, shout: true, pri: 2, key: 'callout' + ev.id, cd: 6 }); break; }
        case 'wia': case 'kia': { const b = nearestMarine(ev.x, ev.z, 40, ev.id); if (b) say({ who: mWho(b), role: 'marine', cat: ev.e === 'kia' ? 'manDown' : Math.random() < 0.5 ? 'corpsman' : 'manDown', net: 'air', pos: mpos(b), shout: true, pri: 2, key: 'mandown', cd: 5 }); break; }
        case 'medic': { const u = S.units.find(q => q.id === ev.id); say({ who: u ? mWho(u) : 'doc', role: 'marine', cat: 'doc', net: 'air', pos: ev, shout: true, pri: 1, key: 'doc' + ev.id, cd: 10 }); break; }
        case 'treat': { if (ev.ext) break; const u = S.units.find(q => q.id === ev.medic); say({ who: u ? mWho(u) : 'doc', role: 'marine', cat: 'treat', text: 'Stay with me, Marine.', net: 'air', pos: ev, pri: 0, key: 'treat' + ev.medic, cd: 8 }); break; }
        case 'drag': say({ who: 'm' + ev.id, role: 'marine', cat: 'drag', net: 'air', pos: ev, shout: true, pri: 1, key: 'drag' + ev.id, cd: 10 }); break;
        case 'rtd': say({ who: 'm' + ev.id, role: 'marine', cat: 'rtd', net: 'air', pos: ev, pri: 1, key: 'rtd' + ev.id, cd: 20 }); break;
        case 'fragDropped': { const b = nearestMarine(ev.x, ev.z, 25) ; say({ who: b ? mWho(b) : 'm' + ev.id, role: 'marine', cat: 'fragDrop', net: 'air', pos: ev, shout: true, pri: 3, key: 'fragdrop', cd: 3 }); break; }
        case 'backblast': { const b = nearestMarine(ev.x, ev.z, 6); if (b) say({ who: mWho(b), role: 'marine', cat: 'backblast', net: 'air', pos: ev, shout: true, pri: 2, key: 'bb' + b.id, cd: 6 }); break; }
        case 'destroyed': {
          if (ev.side !== 2) break;
          if (near(ev, e, 120)) say({ who: 'rw' + ev.id, role: 'rw', text: 'dying', sig: SIG.dying, net: 'rw', pos: ev, pri: 0, key: 'rwdie' + ev.id, cd: 30 });
          const b = nearestMarine(ev.x, ev.z, 300); if (b && near(b, e, 140)) say({ who: mWho(b), role: 'marine', cat: 'kill', net: 'air', pos: mpos(b), shout: true, pri: 1, key: 'kill', cd: 6 });
          break;
        }
        case 'hit': if (ev.side === 1 && (ev.kind === 'strider' || ev.kind === 'hovertank') && near(ev, e, 100) && Math.random() < 0.3) say({ who: 'rw' + ev.id, role: 'rw', text: 'hit', sig: SIG.hit, net: 'rw', pos: ev, pri: 0, key: 'rwhit' + ev.id, cd: 3 }); break;
      }
    }
  }
  return H;
}
