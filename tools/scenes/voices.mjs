// VOICES (game/js/voice/): call-outs fire at the right events, one at a time, through a running audio graph.
// Headless Chrome has no system voices. The explicit debug generated backend tests our locally synthesized
// speech PCM through real WebAudio filters; a separate case checks the normal silent fallback. window.__voices is the utterance log
// (who, role, net, text, priority, start / end). Phases:
//   1. the Huey on the deck: pull pitch -> crew chief / gunner clear left, right, tail; lift -> "skids up"
//   2. taking fire from the left -> the crew chief calls it with the clock (and it interrupts lower-priority chatter)
//   3. the command board: a Marine out on the ALBATROSS -> the command net
//   4. a Marine squad meets STRIDERs on SANDBAR -> a contact report (direction, range); casualties -> "corpsman up"
//   5. the Hornet on a carrier approach -> ball call, "roger ball", corrections, wave-off
//   6. pause -> silence; no two utterances overlap; the audio graph made sound (master-bus peak)
//      node snap.mjs scenes/voices.mjs
const LOG = `__voices.log`;
const played = (cond) => `__voices.played().some(e => ${cond})`;
export default async function (h) {
  await h.goto('?debug&kb&res=0.45&voices=generated');
  await h.waitFor('window.__G && window.__voices', 15000); await h.wait(300);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 15000);
  await h.waitFor(`__voices.backend === 'generated'`, 30000);
  await h.expect(`__voices.backend === 'generated' && __voices.mode === 'on'`, 'generated PCM backend, voices ON');
  await h.eval(`fetch('./audio/voices/index.json').then(r=>r.json()).then(i=>({localBank:i.available,format:i.format,samples:i.samples,sha256:i.sha256,source:i.source}))`,'Local generated bank provenance (not distributed with the repository)');
  await h.expect(`!!__G.sfx.ctx && __G.sfx.ctx.state === 'running'`, 'the AudioContext runs');
  // The initial PA uses the new-game listener, not the stale title-screen camera.
  await h.waitFor(`${played("e.role === 'boss' && e.net === 'pa'")}`, 15000);
  await h.expect(played("e.role === 'boss' && /flight quarters/i.test(e.text)"), 'the Air Boss calls flight quarters on the 5MC when the war starts');

  // ---- 1. Huey takeoff from the deck: wait for the rotor, then pull pitch
  await h.waitFor('__G.H.rpm > 0.93 && __G.H.landed', 60000);
  await h.wait(800);
  await h.eval('(__G.HI.setCollective(0.62), {dead:__G.H.dead,landed:__G.H.landed})');
  await h.waitFor(played("e.role === 'huey' && e.cat === 'clearL'"), 15000);
  await h.waitFor(played("e.role === 'huey' && e.cat === 'tail'"), 30000);
  await h.expect(played("e.role === 'huey' && e.cat === 'clearR' && e.who === 'huey:gunner'"), 'gunner: clear right');
  await h.waitFor('!__G.H.landed', 20000);
  await h.waitFor(played("e.role === 'huey' && e.cat === 'skidsUp'"), 20000);
  await h.shot('huey-lift');
  await h.eval(`${LOG}.filter(e => e.role === 'huey').map(e => [e.who, e.text, e.net, e.state, e.start, e.end])`);

  // ---- 2. taking fire from the left (west of a north-facing Huey -> nine o'clock-ish): the crew chief calls it
  await h.eval(`(() => { const P = __G.H.pos, hd = __G.H.heading(); const L = { x: P.x - Math.cos(hd) * 60, y: P.y, z: P.z - Math.sin(hd) * 60 }; __G.hurtPlayer(0.5, 'TEST ROUND', L); return { hd, L }; })()`);
  await h.waitFor(played("e.role === 'huey' && e.cat === 'takingFire'"), 15000);
  await h.expect(`${LOG}.some(e => e.cat === 'takingFire' && e.who === 'huey:crewchief' && /(eight|nine|ten) o'clock/.test(e.text) && e.pri === 3)`, 'crew chief (left door): taking fire, nine o\'clock, priority 3');

  // ---- 3. the command board: a Marine out on the ALBATROSS (the Huey back on the deck first)
  await h.eval(`(() => { const c = __G.war.carrier; __G.H.reset(new __G.THREE.Vector3(c.p.x - 5.5 * Math.cos(c.yaw) + 32 * Math.sin(c.yaw), c.p.y + 8 + 1.9, c.p.z + 5.5 * Math.sin(c.yaw) + 32 * Math.cos(c.yaw)), c.yaw, true, 1); __G.HI.setCollective(0); return true; })()`);
  await h.wait(800);
  await h.key('tap', 'Backslash'); await h.wait(400); await h.page.click('#radioCommand [data-board]'); await h.key('tap', 'Digit8'); await h.wait(600);
  await h.waitFor(played("e.role === 'command' && e.cat === 'deploy' && e.net === 'fm'"), 15000);
  await h.expect(`__G.G.craft === 'foot'`, 'a Marine out from the board');
  await h.eval('__G.commander.deploy("heli")'); await h.wait(600);

  // ---- 4. Scripted engagement: real units and projectile event, independent of random AI sight lines.
  await h.eval(`(() => { const I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I; const W = __G.war; W.E.mat = 0; W.transT = 1e9; __G.G.bench = true; W.ground.godPlayer = true;
    const x = I.pad.x - 22, z = I.pad.z + 14; __G.H.reset(new __G.THREE.Vector3(x, __G.terrainH(x, z) + 1.9, z), 0.6, true, 1); __G.HI.setCollective(0);
    window.__marines = W.ground.addSquad(1, I, 13, x + 15, z + 10, { order: { type: 'defend', x, z, r: 25 } });
    window.__enemy = W.ground.addSquad(2, I, 3, x + 55, z - 10, { order: { type: 'take', x, z, r: 30 } });
    window.__ff = (secs, until) => { for (let i = 0; i < secs * 30; i++) { W.update(1 / 30, __G.PL, false); if (until && until()) return i / 30; } return -1; };
    return { pad: [I.pad.x, I.pad.z] }; })()`);
  await h.wait(1500);
  await h.eval(`(() => { const s=__enemy.members[0], m=__marines.members[0], gs=__G.war.ground.sim, n=gs.events.length; gs.shoot(2,s,'xm7',[s.x,s.y+1.5,s.z],[m.x,m.y+1.5,m.z],0); __G.war.ground.onEvents(gs.events.slice(n)); return {source:s.id,marine:m.id}; })()`);
  await h.waitFor(played("e.role === 'marine' && /contact|walker|armour/.test(e.cat)"), 20000);
  await h.expect(`${LOG}.some(e => e.role === 'marine' && /contact|walker|armour/.test(e.cat) && /(front|left|right|rear)/i.test(e.text) && e.net === 'air' && e.dist !== undefined)`, 'a Marine calls the contact: direction and range, open air, from where he stands');
  await h.shot('contact');
  // Deterministic field-care event from a nearby real Marine; not dependent on random casualty timing.
  await h.eval(`(() => { const v=__voices.V, e=v.ctx.ear; v.stop('fixture'); v.recent.clear(); const u = __G.war.ground.sim.units.filter(u => u.side===1 && u.kind === 'marine' && u.alive).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0]; __G.war.ground.onEvents([{ e: 'callout', id: u.id, x: u.x, y: u.y + 1.6, z: u.z, text: 'CORPSMAN UP!' }]); return {injected:u.id}; })()`);
  await h.waitFor(played("e.role === 'marine' && /corpsman|manDown|hit/.test(e.cat)"), 20000);
  await h.expect(played("e.role === 'marine' && /corpsman|man down|hit|doc/i.test(e.text)"), 'a casualty call: corpsman / doc / man down');
  await h.eval(`({ marine: ${LOG}.filter(e => e.role === 'marine' || e.role === 'sl' || e.role === 'rto').slice(-14).map(e => [e.who, e.cat, e.text, e.state, e.dist]) })`);

  // ---- 5. the Hornet on the carrier approach: 1000 m out on the glideslope, gear and hook down
  await h.eval(`(() => { const c = __G.war.carrier; __G.H.reset(new __G.THREE.Vector3(c.p.x - 5.5 * Math.cos(c.yaw) + 32 * Math.sin(c.yaw), c.p.y + 8 + 1.9, c.p.z + 5.5 * Math.sin(c.yaw) + 32 * Math.cos(c.yaw)), c.yaw, true, 1); return true; })()`);
  await h.key('tap', 'Digit5'); await h.wait(800);
  await h.expect(`__G.G.craft === 'jet'`, 'in the Hornet');
  const place = (R, dh, lat = 0) => `(() => { const J = __G.JP.J, c = __G.war.carrier, co = Math.cos(c.yaw), si = Math.sin(c.yaw), lz = 37 + ${R}, lx = -2.5 + ${lat};
    const x = c.p.x + lx * co + lz * si, z = c.p.z - lx * si + lz * co; J.cat = null; J.launchBar = false;
    J.reset(x, 0, z, c.yaw, { running: true, airborne: true, alt: c.p.y + 8 + 3 + Math.tan(3.5 * Math.PI / 180) * ${R} + ${dh}, speed: 70 });
    J.gearCmd = J.gear = 1; J.hookCmd = J.hook = 1; J.flapSel = 2; return { x, z, y: J.pos.y }; })()`;
  await h.eval(place(1000, 0));
  await h.waitFor(played("e.role === 'pilotBall'"), 15000);
  await h.waitFor(played("e.role === 'lso' && e.cat === 'rogerBall'"), 15000);
  await h.expect(`${LOG}.some(e => e.role === 'pilotBall' && /Hornet ball/.test(e.text))`, 'the ball call: side number, Hornet ball, fuel');
  await h.eval(place(700, 25));
  await h.waitFor(played("e.role === 'lso' && e.cat === 'high'"), 15000);
  await h.eval(place(200, 25)); // outside safe parameters, above water so the airframe remains flyable
  await h.waitFor(played("e.role === 'lso' && e.cat === 'waveoff'"), 15000);
  await h.expect(`${LOG}.some(e => e.cat === 'waveoff' && e.pri === 3 && e.net === 'uhf')`, 'LSO: wave off, priority 3 on the recovery freq');
  await h.shot('lso');
  await h.eval(`${LOG}.filter(e => e.role === 'lso' || e.role === 'pilotBall').map(e => [e.text, e.state, e.start, e.end])`);

  // ---- 6. pause stops the voices; nothing overlapped; the graph made sound
  await h.eval(`(__voices.V.stop('fixture'), __voices.V.speak({ who: 'test', role: 'command', key:'pause-test', text: 'All stations, Albatross. Radio check. Over. '.repeat(8), net: 'fm', pri: 1 }))`);
  await h.waitFor('!!__voices.cur', 8000);
  await h.eval('(window.__pk = 0, window.__pkI = setInterval(() => { window.__pk = Math.max(window.__pk, __voices.V.peak()); }, 50), true)');
  await h.wait(600);
  await h.key('tap', 'Escape'); await h.wait(500);
  await h.expect(`__G.G.state === 'paused' && !__voices.cur && __voices.queue.length === 0`, 'pause: the voice stops and the queue clears');
  await h.expect(`__voices.V.log.some(e => e.key === 'pause-test' && e.state === 'paused' && e.end !== null && e.source === null)`, 'the cut line is logged as paused and its source stopped');
  await h.shot('menu');
  await h.expect(`[...document.querySelectorAll('#menuItems button')].some(b => /VOICES: ON/.test(b.textContent))`, 'the pause menu has VOICES: ON / RADIO ONLY / OFF');
  await h.eval('clearInterval(window.__pkI)');
  await h.expect('window.__pk > 0.001', 'speech produced samples on the isolated voice bus');
  await h.expect('__voices.overlaps() === 0', 'no two utterances overlapped');
  await h.eval(`({ peak: window.__pk, stats: __voices.stats, played: __voices.played().length, overlaps: __voices.overlaps(), timeline: __voices.played().map(e => [e.start.toFixed(2), e.end && e.end.toFixed(2), e.pri, e.net, e.role, e.who, e.text, e.state]) })`);
  await audioChecks(h);
}

async function audioChecks(h) {
  // Pure geometry plus a rendered DSP response: neither the renderer nor engine effects can satisfy these checks.
  const dsp = await h.eval(`(async () => {
    const { RadioBed } = await import('./js/voice/radio.js');
    const rms = a => Math.sqrt(a.reduce((s, x) => s + x*x, 0) / a.length);
    const levels = [];
    for (const hz of [80, 1000, 6500]) {
      const c = new OfflineAudioContext(1, 24000, 24000), out = c.createGain(); out.connect(c.destination);
      const bed = new RadioBed({ctx:c}), src = c.createOscillator(); src.frequency.value = hz;
      const level = c.createGain(); level.gain.value = 0.08; src.connect(level); level.connect(bed.chain('fm', out)); src.start();
      const b = await c.startRendering(); levels.push(rms(b.getChannelData(0).slice(4000)));
    }
    const { crossesBox, wallBetween } = await import('./js/voice/occlusion.js');
    const a = {x:-4,y:1.6,z:0}, b = {x:4,y:1.6,z:0}, wall={x:0,z:0,hw:.1,hl:3,y0:0,y1:3};
    const geometry = crossesBox(a,b,wall) && !crossesBox({...a,y:4},{...b,y:4},wall)
      && crossesBox(a,b,{...wall,yaw:Math.PI/4}) && wallBetween(a,b,{near:()=>[wall]},null)
      && !wallBetween(a,b,{near:()=>[]},null);
    return {levels, geometry, bandpass:levels[1]>levels[0]*5 && levels[1]>levels[2]*3};
  })()`);
  await h.expect(dsp.geometry, 'wall intersection, rotated wall, above-wall clearance and open doorway');
  await h.expect(dsp.bandpass, 'rendered radio PCM passes voice band and rejects bass / high frequencies');

  // Preserve the live game's engine while testing cancellation, distance, volume and absence of OS voices.
  await h.eval(`(async () => {
    window.__liveVoices = window.__voices; window.__liveVoiceEngine = window.__voiceEngine;
    const {createVoices} = await import('./js/voice/voice.js');
    const c=__G.sfx.ctx, master=c.createGain(); master.gain.value=.5; master.connect(c.destination);
    window.__vsfx={ctx:c,master,noise:__G.sfx.noise};
    window.__vtest=createVoices({sfx:__vsfx,params:new URLSearchParams('debug&voices=generated')});
    __vtest.ctx={state:'play',unit:'heli',ear:{x:0,y:1.6,z:0,yaw:0},inside:false};
    window.__vtick=setInterval(()=>__vtest.update(.02),20);
    return true;
  })()`);
  await h.waitFor("__vtest.backend() === 'generated'", 30000);
  await h.eval(`(__vtest.speak({who:'chief',role:'huey',text:'Clear left. Clear right. Tail rotor clear.',net:'ic',unit:'heli',key:'long',pri:0,cd:0}),true)`);
  await h.waitFor('__vtest.cur?.key === "long"', 5000);
  await h.wait(350);
  await h.eval('({effects:__vsfx.master.gain.value,voices:__vsfx.voiceMaster.gain.value})');
  await h.expect('__vsfx.master.gain.value < .4 && Math.abs(__vsfx.voiceMaster.gain.value-.32)<.000001', 'effects duck without lowering the voice bus');
  await h.eval(`(__vtest.speak({who:'lso',role:'lso',cat:'waveoff',net:'uhf',pri:3,cd:0}),true)`);
  await h.waitFor('__vtest.cur?.cat === "waveoff"', 5000);
  await h.expect('__vtest.log.some(e=>e.key==="long" && e.state==="interrupted" && e.source===null)', 'urgent wave-off interrupts and stops the previous audio source');
  await h.expect('__vtest.persona("chief","huey")===__vtest.persona("chief","marine") && __vtest.persona("chief","huey").pitch!==__vtest.persona("gunner","huey").pitch', 'person keeps a stable voice across roles; crew members have distinct voices');
  await h.eval(`(__vtest.stop('fixture'), __vtest.occluded=()=>false, __vtest.speak({who:'m1',role:'marine',text:'Corpsman up! '.repeat(15),net:'air',pos:{x:2,y:1.6,z:0},shout:true,cd:0}),true)`);
  await h.waitFor('__vtest.cur?.who === "m1"', 5000);
  await h.eval('(window.__nearGain=__vtest.cur.gain, __vtest.ctx.ear.x=50, true)'); await h.wait(250);
  await h.expect('__vtest.cur.gain < __nearGain && __vtest.cur.lowpass.frequency.value > 1800', 'open-air speech fades as listener moves away');
  await h.eval('(__vtest.occluded=()=>true,true)'); await h.wait(250);
  await h.expect('__vtest.cur.muffle && __vtest.cur.lowpass.frequency.value < 950', 'wall muffling changes the live speech low-pass');
  await h.eval('(__vtest.ctx.ear.x=250,true)'); await h.wait(250);
  await h.expect('!__vtest.cur && __vtest.log.at(-1).state === "too-far"', 'moving out of range stops the actual open-air voice');
  await h.eval(`(__vtest.setMode('radio'), __vtest.ctx.ear.x=0, __vtest.speak({text:'Frag out!',net:'air',pos:{x:0,y:1.6,z:0},cd:0}),true)`);
  await h.expect('__vtest.log.at(-1).state === "radio-only"', 'radio-only mode rejects open-air calls');
  await h.eval(`(__vtest.setMode('on'),__vtest.vol=0,__vtest.speak({text:'Radio check.',net:'fm',cd:0}),true)`);
  await h.waitFor('__vtest.cur?.text === "Radio check."',5000);
  await h.expect('!__vtest.cur.out && !__vtest.cur.bed', 'zero voice volume creates no speech, hiss or squelch');
  await h.eval(`(__vtest.stop('fixture'), __vtest.vol=8,__vtest.speak({text:'All stations, Albatross. Radio check. Over.',net:'fm',cd:0}),true)`);
  await h.waitFor('!!__vtest.cur?.source',5000);
  await h.eval(`(__vtest.setMode('off'),true)`); await h.wait(150);
  await h.expect('__vtest.peak() < .00001 && Math.abs(__vsfx.master.gain.value-.5)<.01', 'OFF immediately silences speech and radio tails and restores effects gain');
  // Queue age, bounded backlog, due priority, and stale intercom ownership.
  await h.eval(`(() => {const v=__vtest; v.setMode('on'); v.recent.clear();
    v.speak({text:'Expired call.',net:'fm',key:'expired',maxAge:-1,pri:3});
    v.speak({text:'Wrong crew.',net:'ic',unit:'tomcat',key:'wrong'});
    for(let i=0;i<12;i++) v.speak({text:'Standing by '+i,net:'fm',key:'backlog'+i,pri:0,after:60});
    v.speak({text:'Break! Break!',net:'uhf',key:'due',pri:3,cd:0});return true;})()`);
  await h.waitFor('__vtest.cur?.key === "due"',5000);
  await h.expect('__vtest.queue.length<=8 && __vtest.stats.expired>0 && __vtest.stats.dropped>0 && __vtest.log.some(e=>e.state==="not-your-crew")', 'bounded priority queue expires stale calls, skips delayed chatter and rejects another crew');
  await h.eval(`(__vtest.stop('paused'),clearInterval(__vtick),__vsfx.voiceMaster.disconnect(),__vsfx.master.disconnect(),true)`);
  const silent = await h.eval(`(async () => {
    const {createVoices}=await import('./js/voice/voice.js');
    const original=Object.getOwnPropertyDescriptor(window,'speechSynthesis');
    let speechCalls=0;
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],speak:()=>speechCalls++,addEventListener(){}}});
    localStorage.setItem('tz_voices','on');
    const v=createVoices({sfx:__vsfx,params:new URLSearchParams('voices=on')});
    v.update(.1,{state:'play',unit:'heli'}); v.speak({text:'Radio check.',net:'fm'}); v.update(.1);
    const result=v.backend()==='silent' && !v.cur?.source && !v.cur?.bed && speechCalls===0;
    v.stop('done'); if(original) Object.defineProperty(window,'speechSynthesis',original); else delete window.speechSynthesis;
    window.__voices=window.__liveVoices;window.__voiceEngine=window.__liveVoiceEngine;
    return result;
  })()`);
  await h.expect(silent, 'no installed system voices: silent subtitles, no native speech call, no radio noise, no errors');
}
