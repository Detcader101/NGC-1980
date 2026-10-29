// One serialized channel for authored call-outs. Speech PCM is locally generated (samples.js), then actually
// band-limited / clipped for radios or attenuated / low-passed for open-air distance and wall occlusion.
// Native speechSynthesis cannot expose PCM. Its local English voice availability gates normal play: without
// installed voices we keep subtitles, remain silent and never call speak(). ?debug&voices=generated tests PCM.
import { PHRASES, fill } from './phrases.js';
import { RadioBed, signal, lineSeconds } from './radio.js';
import { createSamples } from './samples.js';
import { createHooks } from './hooks.js';
import { createLocalVoices } from './localvoices.js';
import { deliveryFor } from './delivery.js';

const MODES = ['on', 'radio', 'off'], MODE_LABEL = { on: 'ON', radio: 'RADIO ONLY', off: 'OFF' };
const LABEL = { huey: 'CREW CHIEF', boss: 'AIR BOSS', lso: 'LSO', tower: 'TOWER', captain: 'PLANE CAPTAIN', deck: 'DECK', jet: 'PILOT', wing: 'WINGMAN', rio: 'RIO', marine: 'MARINE', sl: 'SQUAD LEADER', rto: 'RADIO', command: 'ALBATROSS', crew: 'CREW', civ: 'VILLAGER', betty: 'WARNING', pilotBall: 'PILOT' };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rnd = (id, k) => hash(id + ':' + k) / 4294967296;
export function createVoices({ sfx, feed = (_text, _kind) => {}, params = new URLSearchParams(location.search) }) {
  const q = params.get('voices'), force = params.has('debug') && ['mock', 'generated', 'silent'].includes(q) ? q : null;
  let mode = 'on', vol = 6;
  try { const m = localStorage.getItem('tz_voices'), v = localStorage.getItem('tz_voicevol'); if (MODES.includes(m)) mode = m; if (v !== null && Number.isFinite(+v)) vol = Math.max(0, Math.min(10, +v)); } catch (_) {}
  if (MODES.includes(q)) mode = q;
  if (force) mode = 'on';
  const synth = globalThis.speechSynthesis, samples = createSamples(), local = createLocalVoices(), bed = new RadioBed(sfx); bed.duck = 0.72;
  const now = () => performance.now() / 1000;
  const voices = () => { try { return synth ? synth.getVoices().filter(v => /^en/i.test(v.lang)) : []; } catch (_) { return []; } };
  let available = voices().length > 0;
  const refresh = () => { available = voices().length > 0; if (available || force === 'generated') samples.load(); };
  synth?.addEventListener?.('voiceschanged', refresh); refresh();
  const V = {
    mode, log: [], queue: [], cur: null, recent: new Map(), bags: new Map(), personas: new Map(), lastEnd: -1, lastNet: '', paused: false,
    ctx: { state: 'title', unit: null, ear: { x: 0, y: 0, z: 0, yaw: 0 }, inside: false },
    stats: { spoken: 0, culled: 0, cooldown: 0, expired: 0, interrupted: 0, dropped: 0 },
    get vol() { return vol; }, set vol(v) { if (!Number.isFinite(v)) return; vol = Math.max(0, Math.min(10, Math.round(v))); try { localStorage.setItem('tz_voicevol', String(vol)); } catch (_) {} },
  };
  V.backend = () => force === 'mock' ? 'mock' : force === 'silent' ? 'silent' : (available || force === 'generated') ? local.available ? 'local' : samples.ready ? 'generated' : 'silent' : 'silent';
  V.speechInfo = () => ({backend:V.backend(),voices:local.voices,engine:local.available?'Complete lines · Windows local speech':'Generated speech bank'});
  V.setMode = m => { if (!MODES.includes(m)) return; V.mode = m; try { localStorage.setItem('tz_voices', m); } catch (_) {} if (m === 'off') V.stop('off'); };
  // Identity is keyed by PERSON, not current role. A squad leader making a casualty call keeps his voice.
  V.persona = (who, role) => {
    const id = String(who); if (V.personas.has(id)) return V.personas.get(id);
    const delivery=deliveryFor(id,role);
    const p = { who: id, role, female: delivery.female, voice:delivery.voice,
      pitch: 0.96 + rnd(id, 'pitch') * 0.08, rate: 0.98 + rnd(id, 'rate') * 0.05,
      color: 650 + rnd(id, 'color') * 1100, rasp: -3 + rnd(id, 'rasp') * 6 };
    V.personas.set(id, p); return p;
  };
  function pick(role, cat) {
    const list = PHRASES[role]?.[cat]; if (!list?.length) return '';
    const k = role + '.' + cat; let bag = V.bags.get(k);
    if (!bag?.length) { bag = list.map((_, i) => i); for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } V.bags.set(k, bag); }
    return list[bag.pop()];
  }
  function audible(e) {
    const C = V.ctx;
    if (V.mode === 'off') return 'muted';
    if (C.state === 'paused') return 'paused';
    if (V.mode === 'radio' && ['air', 'pa', 'rw'].includes(e.net)) return 'radio-only';
    if (e.net === 'ic' && e.unit && e.unit !== C.unit) return 'not-your-crew';
    e.gain = 1; e.pan = 0; e.muffle = false;
    const pos = typeof e.pos === 'function' ? e.pos() : e.pos;
    if (['air', 'pa', 'rw'].includes(e.net)) {
      if (!pos) return 'no-position';
      const dx = pos.x - C.ear.x, dy = (pos.y ?? C.ear.y) - C.ear.y, dz = pos.z - C.ear.z, d = Math.hypot(dx, dy, dz);
      const range = e.net === 'pa' ? 260 : e.net === 'rw' ? 120 : e.shout ? 100 : 45;
      e.dist = Math.round(d); if (d > range) return 'too-far';
      e.gain = Math.min(1, (1 - d / range) ** 1.4 * (e.shout ? 1.15 : 1));
      e.muffle = !!C.inside || !!V.occluded?.(C.ear, { ...pos, y: pos.y ?? C.ear.y });
      if (e.muffle) e.gain *= 0.35;
      e.pan = Math.max(-0.85, Math.min(0.85, Math.sin(Math.atan2(dx, -dz) - C.ear.yaw)));
      if (e.gain < 0.015) return 'too-far';
    }
    return '';
  }
  let seq = 0;
  function push(e) { V.log.push(e); if (V.log.length > 500) V.log.shift(); }
  V.speak = o => {
    const t = now(), role = o.role || 'marine', text = o.text || fill(pick(role, o.cat), o.vars);
    if (!text) return null;
    const e = { i: ++seq, who: String(o.who ?? role), role, cat: o.cat || '', net: o.net || 'air', text, pri: o.pri ?? 1,
      pos: o.pos || null, shout: !!o.shout, unit: o.unit || null, key: o.key || role + '.' + (o.cat || text),
      queued: t, start: null, end: null, state: 'queued', sig: o.sig, sub: o.sub, src: o.src || 'event',
      maxAge: o.maxAge ?? (o.pri >= 3 ? 3 : o.pri === 0 ? 4 : 10), notBefore: t + (o.after || 0) };
    const cd = o.cd ?? (e.pri >= 3 ? 2.5 : e.pri === 0 ? 14 : 6), why = audible(e);
    if (why) { e.state = why; V.stats.culled++; push(e); return null; }
    if ((V.recent.get(e.key) ?? -1e9) > t - cd || (V.recent.get('txt:' + text) ?? -1e9) > t - cd) { e.state = 'cooldown'; V.stats.cooldown++; push(e); return null; }
    V.recent.set(e.key, t); V.recent.set('txt:' + text, t);
    if (V.recent.size > 1024) for (const [k, at] of V.recent) if (t - at > 120) V.recent.delete(k);
    push(e);
    if (e.pri >= 3 && V.cur && V.cur.pri < e.pri) { V.cur.state = 'interrupted'; V.stats.interrupted++; finish(V.cur, true); }
    V.queue.push(e); V.queue.sort((a, b) => b.pri - a.pri || a.i - b.i);
    while (V.queue.length > 8) { const dropped=V.queue.pop(); dropped.state = 'dropped'; dropped.local?.cancel(); V.stats.dropped++; }
    prepare(e);
    return e;
  };
  function prepare(e) {
    if(e.local||e.sig||force==='mock'||force==='silent'||!(available||force==='generated')||vol===0)return;
    const p=V.persona(e.who,e.role);
    e.local=local.prepare(sfx.ctx,{text:e.text,who:e.who,role:p.role,urgent:e.shout||e.pri>=3,pri:e.pri,cacheOnly:e.pri>=3});
  }
  function subtitle(e) {
    if (e.sub === false || e.src === 'hud' || e.pri < 1 || e.net === 'rw') return;
    const who = typeof e.sub === 'string' ? e.sub : LABEL[e.role] || e.role.toUpperCase();
    V._feeding = true; try { feed(`${who}: "${e.text.toUpperCase()}"`, 'voice'); } finally { V._feeding = false; }
  }
  const voiceOut = () => {
    if (!sfx.voiceMaster && sfx.ctx) {
      const c = sfx.ctx; sfx.voiceMaster = c.createGain(); sfx.voiceMaster.gain.value = 0.32; sfx.voiceMaster.connect(c.destination);
      // Separate from effects, so a loud engine cannot make a voice test pass.
      V.tap = c.createAnalyser(); V.tap.fftSize = 2048; V.tapData = new Float32Array(2048); sfx.voiceMaster.connect(V.tap);
    }
    return sfx.voiceMaster;
  };
  V.peak = () => { if (!V.tap) return 0; V.tap.getFloatTimeDomainData(V.tapData); let p = 0; for (const x of V.tapData) p = Math.max(p, Math.abs(x)); return p; };
  function begin(e) {
    const t = now(), p = V.persona(e.who, e.role), ac = sfx.ctx;
    const live=e.local?.state==='ready'?e.local.buffer:null;
    const be=V.backend()==='local'?(live?'local':samples.ready?'generated':'silent'):V.backend();
    e.start = t; e.state = 'playing'; e.backend = be; V.cur = e; V.stats.spoken++; subtitle(e);
    e.deadline = t + lineSeconds(e.text, p.rate);
    if (!['generated','local'].includes(be) || !ac || ac.state !== 'running' || vol === 0) { e.local?.cancel(); return; }
    const buffer = e.sig ? null : live||samples.buffer(ac, e.text, p.female); if (!e.sig && !buffer) { e.backend = 'silent'; e.local?.cancel(); return; }
    e.actor=live?e.local.voice:(p.female?'Generated Zira':'Generated David');
    // Speech that missed its deadline cannot arrive later and replace the fallback halfway through a line.
    if(!live)e.local?.cancel();
    try {
      const out = e.out = ac.createGain(); out.gain.value = vol / 10 * e.gain; out.connect(voiceOut());
      const radio = ['ic', 'uhf', 'fm', 'pa'].includes(e.net);
      let dest;
      if (radio) { dest = bed.chain(e.net, out); e.bed = bed.key(e.net, vol / 10 * e.gain); }
      else {
        const lp = e.lowpass = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = e.muffle ? 850 : Math.max(1800, 7500 - (e.dist || 0) * 60);
        const pan = e.panner = ac.createStereoPanner(); pan.pan.value = e.pan; lp.connect(pan); pan.connect(out); dest = lp;
      }
      bed.duckOn(); e.ducked = true;
      if (e.sig) { e.signal = signal(ac, e.sig, 0.05, dest); e.deadline = t + e.signal.duration; return; }
      const color = ac.createBiquadFilter(); color.type = 'peaking'; color.frequency.value = p.color; color.Q.value = 0.8; color.gain.value = p.rasp; color.connect(dest); e.color = color;
      const src = e.source = ac.createBufferSource(); src.buffer = buffer; src.playbackRate.value = live?1:p.pitch * p.rate * (e.shout ? 1.025 : 1);
      src.connect(color); e.audioDuration = buffer.duration / src.playbackRate.value;
      e.deadline = t + e.audioDuration + 0.3;
      src.onended = () => { if (V.cur === e) finish(e); }; src.start();
    } catch (_) { e.state = 'audio-unavailable'; finish(e, true); }
  }
  function finish(e, cut = false) {
    if (e.end !== null) return;
    e.end = now(); if (e.state === 'playing') e.state = 'done';
    // Stop/disconnect actual sources, not just the log or an utterance watchdog. Nothing survives pause/preemption.
    if (e.source) { e.source.onended = null; try { e.source.stop(); } catch (_) {} e.source.disconnect(); e.source = null; }
    e.signal?.stop();
    e.local?.cancel(); e.local=null;
    if (e.bed) { bed.unkey(e.bed, cut); e.bed = null; }
    e.out?.disconnect(); e.lowpass?.disconnect(); e.panner?.disconnect(); e.color?.disconnect();
    e.out = null; if (e.ducked) { bed.duckOff(cut); e.ducked = false; }
    if (V.cur === e) { V.cur = null; V.lastEnd = e.end; V.lastNet = e.net; }
  }
  V.stop = why => { if (V.cur) { V.cur.state = why || 'stopped'; finish(V.cur, true); } bed.stop(); for (const e of V.queue) {e.state = why || 'stopped';e.local?.cancel();} V.queue.length = 0; local.stop(); };
  const hooks = createHooks(V);
  V.attach = refs => hooks.attach(refs);
  V.hud = (text, src, kind) => { if (!V._feeding && text) hooks.hud(String(text), src, kind); };
  V.event = (name, data) => hooks.event(name, data);
  let spatial = 0;
  V.update = (dt, c) => {
    if (c) Object.assign(V.ctx, c);
    const play = V.ctx.state === 'play';
    if (!play && !V.paused) { V.paused = true; V.stop(V.ctx.state === 'paused' ? 'paused' : 'stopped'); }
    else if (play && V.paused) V.paused = false;
    if (V.paused) return;
    if (V.transmitting) { V.stop('transmitting'); return; } // a half-duplex net; speaker audio cannot feed the microphone
    hooks.update(dt);
    const t = now();
    if (V.cur && t > V.cur.deadline) finish(V.cur, true);
    if (V.cur && (spatial -= dt) <= 0) {
      spatial = 0.2; const e = V.cur, why = audible(e);
      if (why) { e.state = why; finish(e, true); }
      else if (e.out) {
        const at = sfx.ctx.currentTime; e.out.gain.setTargetAtTime(vol / 10 * e.gain, at, 0.04);
        e.lowpass?.frequency.setTargetAtTime(e.muffle ? 850 : Math.max(1800, 7500 - (e.dist || 0) * 60), at, 0.04);
        e.panner?.pan.setTargetAtTime(e.pan, at, 0.04);
        if (e.bed) e.bed.out.gain.setTargetAtTime(vol / 10 * e.gain, at, 0.04);
      }
    }
    if (V.cur) return;
    // Loading is bounded by age; don't start a silent line just as the local generated bank is arriving.
    const loading = (available || force === 'generated') && !samples.ready && !samples.failed;
    for (let i = 0; i < V.queue.length;) {
      const e = V.queue[i];
      if (t - e.queued > e.maxAge) { V.queue.splice(i, 1); e.state = 'expired'; e.local?.cancel(); V.stats.expired++; continue; }
      if (e.notBefore > t) { i++; continue; }
      prepare(e);
      // Urgent calls never wait for synthesis. Routine calls allow 1.8 s; once ready, no large bank download
      // is required. The normal queue still owns all playback, subtitles, expiry and half-duplex behaviour.
      if ((loading&&e.local?.state!=='ready') || (e.pri<3&&e.local?.state==='pending'&&t-e.queued<1.8) || t - V.lastEnd < (e.net === V.lastNet ? 0.32 : 0.24)) return;
      V.queue.splice(i, 1); const why = audible(e); if (why) { e.state = why; e.local?.cancel(); continue; }
      begin(e); return;
    }
  };
  V.menuItems = () => [
    { id: 'voices', label: `VOICES: ${MODE_LABEL[V.mode]}`, note: `CREWS, PILOTS, CONTROLLERS AND TROOPS · ON / RADIO ONLY / OFF · ${V.backend() === 'local' ? 'COMPLETE LINES · LOCAL VOICES' : V.backend() === 'generated' ? 'GENERATED VOICES' : 'SILENT · WORDS ON THE HUD'}` },
    { id: 'voicevol', label: 'VOICE VOLUME', slider: true },
  ];
  V.slider = { min: 0, max: 10, nudge: 1, get: () => vol, set: v => { V.vol = v; }, show: v => `${v * 10}%`, small: 'VOICE VOLUME · LEFT / RIGHT · DEFAULT 60%' };
  V.menuPick = id => { if (id !== 'voices') return false; V.setMode(MODES[(MODES.indexOf(V.mode) + 1) % MODES.length]); return true; };
  V.betty = (msg, every = 6) => V.speak({ who: 'betty', role: 'betty', text: msg.charAt(0) + msg.slice(1).toLowerCase(), net: 'ic', pri: 3, key: 'betty:' + msg, cd: every, unit: V.ctx.unit, sub: false });
  if (typeof window !== 'undefined') {
    window.__voices = {
      get log() { return V.log.map(({ i, who, role, cat, net, text, pri, state, src, queued, start, end, backend, actor, dist, gain, muffle, audioDuration }) => ({ i, who, role, cat, net, text, pri, state, src, queued, start, end, backend, actor, dist, gain, muffle, audioDuration })); },
      played: () => V.log.filter(e => e.start !== null && !e.sig),
      overlaps: () => { const p = V.log.filter(e => e.start !== null && e.end !== null && !e.sig).sort((a, b) => a.start - b.start); return p.slice(1).filter((e, i) => e.start < p[i].end - 0.001).length; },
      get mode() { return V.mode; }, get backend() { return V.backend(); }, get stats() { return V.stats; }, get cur() { return V.cur?.text; }, get queue() { return V.queue.map(e => e.text); },
      voices: () => voices().map(v => `${v.name} (${v.lang})`), V,
    };
    window.__voiceEngine = V;
  }
  return V;
}
