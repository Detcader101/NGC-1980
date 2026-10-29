// (ngc/perf-cpu) CPU and allocation profiles of the game's main thread in five busy views, through CDP: the V8 sampling
// profiler (self time per function) and the sampling heap profiler with collected objects kept (allocation sites and
// MB per frame), plus the game's own ?perfhud split (ms per system, mean and worst, per second).
// SwiftShader makes the render submit and the frame interval meaningless; the JS sim / prep numbers are what to read,
// and relative to each other they hold on a real GPU.
//   CHROME_PATH=... node snap.mjs scenes/cpuprofile.mjs        [PROF_SCENES=war,deck,village,fish,huey] [PROF_TAG=before]
//   [PROF_SECS=15 wall seconds per profile]   -> tools/runs/prof/browser-<tag>/<scene>.{cpuprofile,heapprofile,txt}, summary.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from '../profsummary.mjs';
const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = (process.env.PROF_SCENES || 'war,deck,village,fish,huey').split(',');
const TAG = process.env.PROF_TAG || 'now', SECS = +(process.env.PROF_SECS || 20);
const OUT = path.join(TOOLS, 'runs', 'prof', `browser-${TAG}`);
const CAM = `(() => { const G = __G, r = G.renderer, orig = r.render.bind(r), T = G.THREE, a = new T.Vector3(), b = new T.Vector3();
  if (r.__camHook) return 1; r.__camHook = true;
  r.render = (sc, cam) => { const C = window.__cam; if (C && cam === G.zCam) { a.set(...C.p); b.set(...C.t); cam.position.copy(a); cam.up.set(0, 1, 0); cam.lookAt(b); cam.updateMatrixWorld(); } orig(sc, cam); };
  window.__ff = (secs, dt = 1 / 30) => { const W = G.war; for (let i = 0; i < secs / dt; i++) { W.update(dt, G.PL, false); G.fx.update(dt); } return Math.round(W.time); };
  return 1; })()`;

export default {
  name: 'cpuprofile',
  query: '?debug&auto&kb&perfhud&res=0.45',
  allowConsoleErrors: true,
  run: async h => {
    fs.mkdirSync(OUT, { recursive: true });
    h.page.setDefaultNavigationTimeout(180000); h.page.setDefaultTimeout(180000);   // (the machine is shared: a load can take a minute)
    const cdp = await h.page.createCDPSession();
    const SUM = path.join(OUT, 'summary.json'), summary = fs.existsSync(SUM) ? JSON.parse(fs.readFileSync(SUM, 'utf8')) : {};   // (a rerun of some scenes keeps the others)
    const boot = async q => {
      await h.goto(q);
      await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 60000);
      await h.eval(CAM); await h.eval('(__G.G.bench = true, 1)');   // no damage to the player: nothing ends a view
      await h.wait(2000);
    };
    const profile = async name => {
      await h.wait(2000);
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('HeapProfiler.enable');
      await h.eval('(window.__pf = [], window.__pfT = setInterval(() => { const s = window.__perf && __perf.snapshot(); if (s && s !== window.__pfLast) { window.__pfLast = s; __pf.push(s); } }, 250), window.__fr0 = __G.renderer.info.render.frame, window.__gt0 = __G.war.time, 1)');
      await cdp.send('Profiler.start');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      const w0 = Date.now(), fr0 = await h.eval('window.__frames = 0, (function f() { window.__frames++; if (!window.__stopF) requestAnimationFrame(f); })(), 0');
      await new Promise(r => setTimeout(r, SECS * 1000));
      const { profile: cpu } = await cdp.send('Profiler.stop');
      const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
      const wall = (Date.now() - w0) / 1000;
      // the per-system split (?perfhud): mean of the per-second means, worst of the per-second worsts
      const st = await h.eval(`(() => { window.__stopF = true; clearInterval(__pfT); const sys = {};
        for (const snap of __pf) for (const [k, v] of Object.entries(snap.systems)) { const o = sys[k] || (sys[k] = { mean: 0, max: 0, n: 0 }); o.mean += v.mean; o.n++; o.max = Math.max(o.max, v.max); }
        for (const o of Object.values(sys)) { o.mean = +(o.mean / o.n).toFixed(2); o.max = +o.max.toFixed(1); delete o.n; }
        return { frames: window.__frames, game: __G.war.time - __gt0, sys, cpu: __pf.length ? __pf.reduce((a, p) => a + p.cpu, 0) / __pf.length : null, hitches: __pf.reduce((a, p) => a + p.hitches, 0) }; })()`);
      await h.eval('(window.__stopF = false, 1)');
      fs.writeFileSync(path.join(OUT, `${name}.cpuprofile`), JSON.stringify(cpu));
      fs.writeFileSync(path.join(OUT, `${name}.heapprofile`), JSON.stringify(heap));
      const s = summarize(cpu, heap, { top: 30 }), sys = st.sys;
      const selfOf = re => [...s.self].filter(([k]) => re.test(k)).reduce((a, [, t]) => a + t, 0) / 1000;
      const gc = selfOf(/^\(garbage collector\)/), idle = selfOf(/^\((idle|program|root)\)/);
      const frames = st.frames || 1;
      const rec = { wall, frames, fps: +(frames / wall).toFixed(1), game: +st.game.toFixed(1), cpuMsPerFrame: st.cpu == null ? null : +st.cpu.toFixed(1),
        jsSelfMsPerFrame: +((s.cpuMs - gc - idle) / frames).toFixed(2), gcMsPerFrame: +(gc / frames).toFixed(2), allocKBPerFrame: +(s.allocBytes / 1024 / frames).toFixed(0), allocMBPerGameSec: +(s.allocBytes / 1048576 / Math.max(0.1, st.game)).toFixed(1), systems: sys };
      const top = [...s.self].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, t]) => `${(t / 1000 / frames).toFixed(2)} ms/f  ${k}`);
      const alloc = [...s.alloc].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, b]) => `${(b / 1024 / frames).toFixed(0)} KB/f  ${k}`);
      rec.top = top; rec.alloc = alloc;
      fs.writeFileSync(path.join(OUT, `${name}.txt`), JSON.stringify({ ...rec, top: undefined, alloc: undefined }, null, 1) + '\n' + s.text);
      summary[name] = rec; fs.writeFileSync(SUM, JSON.stringify(summary, null, 1));
      h.log(`PROFILE ${name} ${JSON.stringify({ ...rec, systems: undefined, top: undefined, alloc: undefined })}`);
      h.log(`  systems ${Object.entries(sys).sort((a, b) => b[1].mean - a[1].mean).slice(0, 12).map(([k, v]) => `${k} ${v.mean}/${v.max}`).join(', ')}`);
      for (const l of top) h.log('  cpu   ' + l);
      for (const l of alloc) h.log('  alloc ' + l);
    };

    if (SCENES.includes('war')) {
      // a busy war: the war fast-forwarded (no rendering) until both sides have troops ashore, then the view over the
      // island with the most ground units, the Huey parked high out of the way
      await boot('?debug&auto&kb&perfhud&res=0.45');
      for (let i = 0; i < 12; i++) await h.eval('__ff(30)');
      const at = await h.eval(`(() => { const G = __G, GS = G.war.ground.sim, n = new Map(); for (const u of GS.units) if (u.alive) { let best = null, bd = 1e9; for (const I of G.ISLANDS) { const d = Math.hypot(u.x - I.x, u.z - I.z); if (d < bd) { bd = d; best = I; } } n.set(best, (n.get(best) || 0) + 1); }
        const I = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || G.ISLANDS[1]; window.__I = I;
        G.H.reset(new G.THREE.Vector3(I.x + 220, Math.max(G.terrainH(I.x + 220, I.z + 160), 0) + 140, I.z + 160), 0.8, false, 1); G.HI.setCollective(0.47);
        window.__cam = { p: [I.x + 120, Math.max(G.terrainH(I.x + 120, I.z + 90), 0) + 70, I.z + 90], t: [I.x, Math.max(G.terrainH(I.x, I.z), 0), I.z] };
        return { island: I.name, ground: GS.units.filter(u => u.alive).length, units: G.war.units.length, t: Math.round(G.war.time) }; })()`);
      h.log('WAR ' + JSON.stringify(at));
      await h.wait(3000); await h.shot('war');
      await profile('war');
    }
    if (SCENES.includes('deck')) {
      // carrier deck ops: three Tomcat escorts through the ALBATROSS launch queue, the camera on the deck
      await boot('?debug&auto&kb&peace&perfhud&res=0.45');
      await h.eval('(() => { const G = __G; G.G.mat = 600; G.selIsl = null; G.command(4); G.command(4); G.command(4); const c = G.war.carrier; window.__cam = { p: [c.p.x + 60, c.p.y + 30, c.p.z + 40], t: [c.p.x, c.p.y + 15, c.p.z] }; return 1; })()');
      await h.wait(3000); await h.shot('deck');
      await profile('deck');
    }
    if (SCENES.includes('village')) {
      // the Huey low over a town (worldperf.mjs's spot): streets, townsfolk, traffic
      await boot('?debug&auto&kb&peace&perfhud&res=0.45');
      await h.eval('(() => { const G = __G; G.H.reset(new G.THREE.Vector3(4070, G.groundY(4070, -1026) + 28, -1026), 0.66, false, 1); G.HI.setCollective(0.47); return 1; })()');
      await h.waitFor('__G.HW.every(L => !L.busy) && (!__WORLD.stats.pending)', 60000); await h.wait(4000);
      await h.shot('village');
      await profile('village');
    }
    if (SCENES.includes('fish')) {
      // under water in the shallows off HOME ISLAND among schools of fish (fish.mjs's spot)
      await boot('?debug&auto&kb&peace&perfhud&res=0.45&sea=3');
      await h.eval(`(() => { const G = __G, I = G.ISLANDS[0]; let sh = null; for (let d = 40; d < 260 && !sh; d++) { const x = I.x + d, hh = G.terrainH(x, I.z); if (hh < -3 && hh > -6) sh = [x, I.z]; }
        window.__SH = sh; G.H.reset(new G.THREE.Vector3(I.x - 60, 140, I.z - 120), 0, false, 1); G.HI.setCollective(0.475);
        const S = G.sealife.sim; S.spawnSchool('mullet', sh[0] + 2, sh[1]); S.spawnSchool('mullet', sh[0] + 4, sh[1] + 5); S.spawnSchool('sardine', sh[0] + 10, sh[1] + 6); S.spawnSchool('sardine', sh[0] - 6, sh[1] - 4);
        window.__cam = { p: [sh[0] + 9, -1.6, sh[1] + 4], t: [sh[0] - 2, -2.8, sh[1]] }; return sh; })()`);
      await h.wait(4000); await h.shot('fish');
      await profile('fish');
    }
    if (SCENES.includes('huey')) {
      // the Huey in flight: cruising low over the islands, chase view
      await boot('?debug&auto&kb&peace&perfhud&res=0.45');
      await h.eval(`(() => { const G = __G, I = G.ISLANDS[2]; window.__cam = null; G.H.reset(new G.THREE.Vector3(I.x - 400, Math.max(G.terrainH(I.x - 400, I.z), 0) + 90, I.z), -Math.PI / 2, false, 1); G.H.vel.set(35, 0, 0); G.HI.setCollective(0.5); return I.name; })()`);
      await h.key('tap', 'KeyC');
      await h.wait(2500); await h.shot('huey');
      await profile('huey');
    }
    fs.writeFileSync(SUM, JSON.stringify(summary, null, 1));
    h.log('SUMMARY ' + path.relative(TOOLS, path.join(OUT, 'summary.json')));
  },
};
