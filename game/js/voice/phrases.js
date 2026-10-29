// VOICES: what everybody says. 1980 US Navy / USMC / US Army procedure and brevity, written as it is SPOKEN (the TTS
// reads these; the HUD shows its own text). Sources and era checks: docs/ngc1980/findings/look-voices.md.
//
// A category is an array of variants; the engine picks one it has not used lately (a shuffle bag per category), so
// nothing repeats robotically. Templates: {clock} "nine o'clock", {dist} "two hundred", {dir} "front" / "left",
// {cs} a callsign, {side} the side number, {fuel} "four point two", {isl} an island, {n} a count, {what} a unit.
//
// Conservative period vocabulary; see dated sources and verification limits in findings.
// Unverified brevity is expressed in plain language. No modern missile-active or digital-network calls.

export const PHRASES = {
  // ------------------------------------------------------------------ UH-1H crew (crew chief left door, gunner right)
  huey: {
    clearL: ['Clear left.', 'Clear up left.', 'Left side clear.', "You're clear left."],
    clearR: ['Clear right.', 'Clear up right.', 'Right side clear.', "Clear on the right."],
    tail: ["Tail's clear.", 'Tail rotor clear.', 'Clear above and behind.', "Tail's clear, sir."],
    comingUp: ['Coming up.', 'Coming up to a hover.', 'Picking it up.', 'Lifting.'],
    skidsUp: ['Skids up.', 'Skids are up.', "We're light on the skids... skids up.", 'Off the ground.'],
    skidsDown: ['Skids down.', "We're down.", 'Skids on the ground.', 'Down and level.'],
    clearDown: ['Clear down left.', 'Clear down right.', 'Clear down, both sides.'],
    takingFire: ["Taking fire, {clock}!", "Receiving fire, {clock}!", "We're taking hits! {clock}!", "Fire from {clock}!"],
    hit: ["We're hit!", "Took a hit!", "We're taking hits!"],
    gunner: ['Gunner engaging!', 'Engaging!', 'Rounds out!', 'Firing, {clock}!'],
    gunOut: ["Gun's dry!", 'Changing cans!', 'Reloading the sixty!'],
    rocketsOut: ['Rockets away.', 'Pair out.'],
    low: ['Low R P M!', 'R P M, R P M!', 'Watch your RPM!'],
    autorotate: ['Engine failure! Autorotate!', "Engine out! We're going down!", 'Flameout! Lower the collective!'],
    fireEng: ['Engine fire! Engine fire!', "Fire light! Fire's in the engine!"],
    brace: ['Brace! Brace! Brace!', 'Hang on back there!'],
    troopsOn: ['Troops aboard. Clear to lift.', "Everybody's on. Go.", "They're in, go, go!"],
    troopsOff: ['Troops are off. Clear to lift.', "They're out! Clear!", 'All clear in back.'],
    cargoHook: ['Load is off the ground.', 'Load is clear.', 'Slack... tension... you have the load.'],
    controls: ['I have the controls.', 'You have the controls.', 'I have the controls.'],
    checklist: ['Throttle full open. RPM sixty-six hundred.', 'Caution panel clear.', 'Engine and transmission oil pressure in the green.', 'Hover power check good.', 'Before takeoff check complete.'],
    fuel: ['Twenty-minute fuel light.', 'Fuel is getting low, sir.'],
  },
  // ------------------------------------------------------------------ the carrier
  boss: {   // the Air Boss (Pri-Fly) on the 5MC / the flight deck loudspeaker, and the tower freq
    flightQuarters: ['Flight quarters, flight quarters. All hands man your flight quarters stations.'],
    startEngines: ['On the flight deck, stand clear of intakes and exhausts. Check chocks and chains. Start em up.', 'Start engines.'],
    launch: ['Launch aircraft.', 'Now launch aircraft.', 'Cat one is clear to launch.'],
    turning: ['Albatross is turning into the wind. Stand by for flight ops.', 'Steady on the recovery course.'],
    foul: ['Foul deck! Foul deck!', "The deck is foul, keep 'em moving."],
    heads: ['Heads up on the flight deck!', 'Heads up, aircraft on deck!'],
    recovered: ['{cs} is aboard.', 'Good trap, {cs}.', '{cs}, {n} wire.'],
    launched: ['{cs} airborne.', 'Good shot, {cs}.'],
    helo: ['Huey on deck, clear the landing area.', 'Helo on spot two. Clear the deck.', 'Huey cleared to lift, wind is down the deck.'],
    sinking: ['General quarters, general quarters! All hands man your battle stations!', 'Fire on the flight deck! Away the flying squad!'],
  },
  lso: {   // the LSO ("Paddles") on the recovery freq
    rogerBall: ['Roger ball.', 'Roger ball, {cs}.', 'Roger ball.'],
    clara: ['Paddles contact. Keep it coming.', "You're looking good. Keep it coming."],
    power: ['Power.', 'A little power.', 'Power!', 'Power, power!'],
    high: ["You're high.", "You're a little high.", 'Easy with it.'],
    low: ["You're low.", "You're low. Power.", "Don't settle."],
    lineupR: ['Right for lineup.', 'Come right.'],
    lineupL: ['Come left.', 'Left for lineup.', 'Watch your lineup.'],
    onball: ['Looking good.', 'On glide slope.', "You're on and on."],
    waveoff: ['Wave off, wave off!', 'Wave off! Wave off! Wave off!', 'Wave it off.'],
    bolter: ['Bolter, bolter, bolter!', 'Bolter! Bolter!'],
    trap: ['Nice trap.', 'Okay three.', 'Good pass.'],
    foul: ['Foul deck. Wave off.', 'Foul deck! Wave off!'],
  },
  pilotBall: {   // the pilot's ball call: side number, type, BALL, fuel in thousands of pounds
    ball: ['{side}, {type} ball, {fuel}.'],
    clara: ['{side}, Clara.'],
  },
  tower: {
    departure: ['{cs}, Albatross tower. Departure clear.'],
    inbound: ['{cs}, Albatross tower. Continue approach.'],
    hold: ['{cs}, Albatross tower. Hold position.'],
  },
  captain: {
    ready: ['Plane captain. Standing by.', 'Checking the aircraft.'],
    chocks: ['Chocks in. Chains secured.', 'Aircraft secured.'],
    clear: ['Stand clear of the intake!', 'Stand clear of the exhaust!'],
  },
  deck: {   // flight deck crew, open air (shouted over the jets)
    cat: ['Clear the cat!', 'Hook up!', 'Taking tension!', 'Shooter is up!'],
    chocks: ['Chocks and chains!', 'Pull the chocks!', 'Chains off!'],
    taxi: ['Follow me, sir!', 'Come ahead!', 'Hold it right there!'],
    spot: ['Spot two!', 'Bring her round!', 'Brake!'],
    general: ['Heads up!', 'Watch your back!', 'Get clear of the intake!', "Move it, move it!"],
  },
  // ------------------------------------------------------------------ jets: section comms and the Tomcat's RIO
  jet: {
    airborne: ['{cs} airborne.', '{cs}, off the cat, climbing.', '{cs} airborne, passing angels two.'],
    tally: ['Tally one.', 'Tally.', 'Tally bandit, {clock}.'],
    noJoy: ['No joy.', 'No joy, say again position.'],
    bandit: ['Bandit, {clock}, low!', 'Bandits, {clock}!', 'Bogey, {clock}, {dist}.'],
    fox1: ['Fox one!', '{cs}, Fox one.'],
    fox2: ['Fox two!', '{cs}, Fox two.'],
    fox3: ['Phoenix away!', '{cs}, Phoenix away.'],
    guns: ['Guns, guns!', 'Guns.'],
    splash: ['Splash one!', 'Splash one bandit.', 'Good kill, good kill.'],
    breakL: ['Break left! Break left!'],
    breakR: ['Break right! Break right!'],
    missile: ['Missile launch, {clock}!', 'Missile in the air!', 'SAM launch! Break!'],
    engaged: ['{cs} engaged.', 'Engaged.', 'Press.'],
    bingo: ['{cs}, bingo. Returning to mother.'],
    joker: ['{cs}, joker.'],
    winchester: ['{cs}, Winchester.'],
    rtb: ['{cs}, RTB.', 'Returning to mother.'],
    eject: ['Eject! Eject! Eject!'],
  },
  wing: {   // the wingman's responses
    ack: ['Two.', 'Two, copy.', "Two's up.", 'Copy, two.'],
    visual: ['Two, visual.'],
    tally: ['Two, tally.'],
    blind: ['Two, blind.'],
    noJoy: ['Two, no joy.'],
    cover: ['Two, in support.', 'Two, covering.', 'Two, engaged.'],
    joker: ['Two, joker.'],
  },
  rio: {   // the Tomcat's Radar Intercept Officer, on the ICS
    contact: ['Contact, {clock}, {dist} miles.', 'I have a contact, nose, {dist} miles.', 'Bogey, {clock}, {dist}.'],
    lock: ["I've got a lock.", 'Locked.', 'Contact locked.'],
    tws: ['Track while scan.', 'Going TWS.'],
    fox3: ['Phoenix away.', 'Phoenix away.'],
    tone: ['Good tone.', "You've got tone."],
    spike: ['Spike, {clock}!', "We're spiked!", 'Radar warning, {clock}.'],
    chaff: ['Chaff! Chaff!', 'Chaff out.', 'Flares!'],
    checkSix: ['Check six!', 'Bandit, six o\'clock!'],
    joker: ['Fuel is joker.'],
    bingo: ["We're bingo, take us home."],
    clean: ["Scope's clean.", 'Nothing on the scope.'],
    eject: ['Eject! Eject! Eject!'],
  },
  // ------------------------------------------------------------------ Marines: fire team, squad, radio operator
  marine: {
    contact: ['Contact {dir}!', 'Contact! {dir}, {dist} meters!', 'Enemy {dir}! {dist} meters!', 'Contact! {what}, {dir}!'],
    armour: ['Tank! {dir}!', 'Armor, {dir}! {dist} meters!', 'Armor, {dir}!'],
    walker: ['Walker! {dir}!', "It's a walker! {dir}, {dist} meters!", 'Strider {dir}!'],
    move: ['Move!', 'Moving!', 'Go, go!', 'Up! Move!'],
    cover: ['Cover me!', 'Covering!', 'Suppress!', 'Keep their heads down!'],
    set: ['Set!', "I'm set!", 'Set, move!'],
    frag: ['Frag out!', 'Frag out!'],
    fragDrop: ['Grenade! Grenade!', 'Get down! Grenade!'],
    reload: ['Reloading!', 'Changing mags!', 'Cover me, reloading!'],
    manDown: ['Man down!', "He's down! Man down!", 'Marine down!'],
    corpsman: ['Corpsman up!', 'Corpsman!', 'Doc! Doc, over here!', 'Corpsman up! Corpsman up!'],
    hit: ["I'm hit!", "I'm hit! I'm hit!", 'Ah! I got hit!'],
    doc: ["I'm coming!", 'Hang on, I got you.', 'Stay with me, Marine.', 'Moving to the casualty!'],
    treat: ['Pressure dressing.', "Tourniquet's on.", "You're gonna be okay.", 'Keep pressure on it.'],
    drag: ['Grab his harness! Pull!', "I got him, I got him!", 'Moving him back!'],
    rtd: ["I'm good, I'm good!", "I'm back up.", "I'm okay, I'm in."],
    kill: ['Got one!', 'Target down!', 'Scratch one!'],
    backblast: ['Backblast area clear!', 'Rocket!', 'Backblast clear!'],
    ceaseFire: ['Cease fire! Cease fire!', 'Check fire! Friendlies!'],
    onMe: ['On me!', 'Fire team, on me!', 'Squad, on me!'],
    rally: ['Fall back! Fall back to the rally point!', 'Pull back!'],
    landing: ['Off the bird! Go, go, go!', 'Move! Get off the LZ!', 'Spread out!'],
    clear: ['Clear!', 'All clear!', 'Area secure.'],
  },
  sl: {   // the squad leader
    order: ['First fire team, base of fire. Second team, move.', 'Fire team, bound!', 'Second team, flank left!', 'Hold here. Covering fire!'],
    advance: ['Squad, move out.', 'Get up, move!', 'Second squad, on line, move!'],
    holdFire: ['Hold your fire!', 'Wait for it... fire!'],
    casualties: ['Doc! I got wounded over here!', 'Get a corpsman over here!'],
  },
  rto: {   // the radio operator on the PRC-77 battalion / company net (FM)
    sitrep: ['{cs}, this is {cs2}. In contact at {isl}. Over.', '{cs}, {cs2}. Contact, request support. Over.', '{cs}, {cs2}. Sitrep follows: {isl}, in contact, holding. Over.'],
    cas: ['{cs}, {cs2}. Casualties: {n} wounded. Request casevac at {isl}. Over.', '{cs}, {cs2}, we need a bird at {isl}. Priority. Over.'],
    ack: ['{cs2}, roger, out.', '{cs2}, this is Albatross. Roger. Out.', '{cs2}, copy all. Out.'],
    taken: ['{cs}, {cs2}. {isl} is secure. Over.', '{cs}, {cs2}. Objective taken. Over.'],
    lost: ['{cs}, {cs2}. We are falling back from {isl}. Over.'],
  },
  // ------------------------------------------------------------------ command net and controllers
  command: {
    deploy: ['All stations, Albatross. {what} is up. Out.', 'Albatross. {what} outbound to {isl}. Out.', '{what} launching. Albatross out.'],
    standDown: ['Albatross. {what}, return to base. Out.', '{what} is standing down. Out.'],
    seaKnight: ['Knight one-one, airborne with {n} Marines, inbound {isl}. Over.', 'Albatross, Knight one-one. Two minutes out from {isl}. Over.', 'Knight one-one, on deck at {isl}. Troops off. Out.'],
    seaKnightDown: ['Mayday, mayday, mayday. Knight one-one is going down.', 'Knight one-one is hit! Hit! Going in!'],
    logistics: ['Albatross, Logistics. {what} is on the way. Out.', 'Logistics copies. Inbound with fuel and tools. Out.'],
    research: ['All stations, Albatross. New equipment available: {what}. Out.', 'Albatross. Engineering reports {what} ready. Out.'],
    materiel: ['Albatross. {what} delivered to the fleet. Out.', 'New {what} on the hangar deck.'],
    radar: ['Albatross, Combat. New contact, {what}. Over.', 'Combat. Raid inbound, {what}. Set condition one AW.', 'All stations, Combat. {what}. Out.'],
    enemyLanding: ['All stations. Enemy landing on {isl}! Over.', 'Combat. Hostile landing craft, {isl}. Over.'],
    islandTaken: ['All stations, Albatross. {isl} is ours. Out.', 'Good work. {isl} secure.'],
    islandLost: ['All stations. We have lost {isl}. Out.'],
    airdrop: ['Albatross, Herky {cs}. Drop zone {isl}. One minute. Over.', 'Herky {cs}, green light, load away.'],
    intel: ['Albatross, Intel. Be advised, {what}. Out.'],
    carrier: ['Albatross, coming to new course.', 'Bridge. Steady on new course.', 'Conn, aye. Turning into the wind.'],
    victory: ['All stations, Albatross. The enemy is broken. Well done.'],
  },
  // ------------------------------------------------------------------ ground vehicle crews (intercom)
  crew: {
    driverStart: ['Driver, start up.', 'Driver, crank it.'],
    driverStop: ['Driver, shut it down.'],
    gunner: ['Gunner, sabot, tank!', 'Gunner, HEAT, PC!', 'Identified!', 'Fire!', 'On the way!'],
    loader: ['Up!', 'Sabot up!', 'HEAT up!', 'Loaded!'],
    target: ['Target!', 'Target, cease fire.'],
    miss: ['Miss! Over. Re-lay!', 'Short! Add fifty!'],
    button: ['Button up!', 'Buttoning up!'],
    fire: ['Fire! Fire! Halon!', 'Fire in the engine compartment!'],
    bail: ['Bail out! Bail out!', 'Everybody out!'],
  },
  // ------------------------------------------------------------------ townsfolk (an English-speaking north Atlantic archipelago)
  civ: {
    flee: ['Get inside! Get inside!', 'Come on, run!', 'Get the kids in!', 'Oh my God!', 'Bloody hell, run!'],
    see: ['Look at that!', "It's the Navy!", 'More of them soldiers.', "What's going on?"],
    plead: ['Leave us alone!', 'Not the house!', 'Somebody help!'],
    thanks: ['God bless you, lads.', 'About time!', "They're gone? Are they gone?"],
  },
  // ------------------------------------------------------------------ the Hornet's voice warning (Betty), routed here
  betty: {},
};

// The RUNAWAY don't talk: their units exchange short data bursts. Each "word" is a generated tone pattern
// plays (frequency steps in Hz, ms each) - subtle, in the background, never subtitled as speech.
export const RW_SIGNALS = {
  spot: [[1840, 40], [2460, 40], [1840, 60]],
  engage: [[2200, 30], [2200, 30], [2930, 50], [1650, 80]],
  hit: [[3100, 20], [1200, 120]],
  dying: [[2600, 60], [1900, 80], [1300, 120], [700, 240]],
  move: [[1500, 50], [1700, 50]],
  ack: [[2460, 30], [2460, 30]],
};

// spoken numbers the way the radio says them
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
export const digits = n => String(n).split('').map(c => c === '.' ? 'point' : ONES[+c] ?? c).join(' ');
const ROUND_WORDS = { 50: 'fifty', 100: 'one hundred', 150: 'one-fifty', 200: 'two hundred', 250: 'two-fifty', 300: 'three hundred', 400: 'four hundred', 500: 'five hundred', 600: 'six hundred', 800: 'eight hundred', 1000: 'one thousand' };
export function metres(d) {   // rounded the way a rifleman calls range: to 25 close in, to 50 / 100 further out
  const r = d < 60 ? 50 : d < 175 ? Math.round(d / 50) * 50 : d < 450 ? Math.round(d / 100) * 100 : d < 700 ? Math.round(d / 200) * 200 : Math.round(d / 1000) * 1000 || 1000;
  return ROUND_WORDS[r] || String(r);
}
const CLOCK = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
// a relative bearing (radians, 0 = dead ahead, + = clockwise / right) -> "nine o'clock"
export function clock(rel) { let h = Math.round(rel / (Math.PI / 6)) % 12; if (h < 0) h += 12; return `${CLOCK[h]} o'clock`; }
// a relative bearing -> the fire-team direction words (front / right front / right / rear ...)
export function fireDir(rel) {
  const a = ((rel % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI, d = Math.abs(a) * 180 / Math.PI, s = a > 0 ? 'right' : 'left';
  return d < 25 ? 'front' : d < 65 ? `${s} front` : d < 115 ? s : d < 155 ? `${s} rear` : 'rear';
}
export const fuelCall = lbs => { const k = Math.max(0.1, lbs / 1000); return k >= 10 ? String(Math.round(k)) : k.toFixed(1).replace('.', ' point '); };

export function fill(t, v = {}) { return t.replace(/\{(\w+)\}/g, (m, k) => v[k] !== undefined ? v[k] : ''); }
export function count(lib = PHRASES) {   // phrase coverage per role (for the report and the test)
  const out = {}; for (const [role, cats] of Object.entries(lib)) { let n = 0; for (const v of Object.values(cats)) n += v.length; out[role] = { categories: Object.keys(cats).length, lines: n }; }
  return out;
}
