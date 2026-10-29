// ?bench: the one-click DESKTOP benchmark (ngc/perf-render). It tours fixed, seeded views through the game's own paths
// (on foot at the home base, the Huey at 30 m and 200 m, a Hornet at 1200 m, the carrier deck, a village, a forest edge,
// the busiest fight), measures every frame and writes a report (report.html + report.json + one picture per view) to
// tools/runs/bench-<run>/ through tools/serve.mjs (POST /__bench, loopback only), with a SAVE REPORT fallback.
//
// Then it reloads the page once per RenderKit area with that area OFF (?rk=all minus the area) and once with ?rk=0,
// and runs the same tour, so the report has a per-area cost table (GPU ms, draw calls, triangles each area adds).
//
//   ?bench            full run: all areas on, then each area off, then rk=0 (about 12-15 minutes)
//   ?bench=quick      the tour once, everything on (about 2 minutes)
//   ?bench=N          N measured seconds per view (default 6; area-off passes use 2/3 of it)
//   &benchareas=post,light   only those areas in the per-area pass
//   &seed=N           a different seeded war (index.html seeds Math.random under ?bench)
//
// Per view: rAF frame time (vsync-capped on most screens), "uncapped" frame time (a few frames each drained with a 1-pixel
// readPixels before and after: CPU + GPU of the whole frame with nothing overlapping), CPU sim / prep / render submit
// (main.js frame() timings), GPU time from EXT_disjoint_timer_query_webgl2 where the browser exposes it, draw calls and
// triangles for the whole frame (every pass: shadow maps, world, post, overlay), the shadow passes on their own, programs,
// textures, geometries, JS heap and long tasks. Dynamic resolution is held at the start ratio while the tour runs.
// Nothing here changes how a view is drawn.
const KEY = 'ngc_bench_run';
const q = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]; };
const r1 = x => x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100;
const stats = a => ({ n: a.length, p50: r1(q(a, .5)), p95: r1(q(a, .95)), max: r1(a.length ? Math.max(...a) : null), mean: r1(a.length ? a.reduce((s, x) => s + x, 0) / a.length : null) });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
const store = R => { try { localStorage.setItem(KEY, JSON.stringify(R)); return true; } catch (e) { return false; } };

export function createDesktopBench(d) {
  const { renderer, G, war, params, RK_AREAS } = d;
  const arg = params.get('bench') || '', quick = arg === 'quick';
  const baseSec = Math.max(2, Math.min(60, Number(arg) || 6));
  // the run: continued across reloads (one per configuration) through localStorage, keyed by &benchrun=<id>
  let R = load();
  const runParam = params.get('benchrun');
  if (!R || !runParam || R.runId !== runParam) {
    const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const only = (params.get('benchareas') || '').split(',').filter(a => RK_AREAS.includes(a));
    const areas = only.length ? only : RK_AREAS;
    const configs = quick ? [{ id: 'all', rk: 'all' }] : [{ id: 'all', rk: 'all' }, ...areas.map(a => ({ id: '-' + a, rk: RK_AREAS.filter(x => x !== a).join(',') || '0', off: a })), { id: 'rk0', rk: '0' }];
    R = { schema: 1, runId, configs, idx: 0, results: {}, started: Date.now(), quick, seconds: baseSec };
    // the first configuration (everything on) runs in this page when it already has every area on; else reload into it
    store(R);
    if (!d.rkAll) return relaunch(R, 0);
    try { const u = new URL(location.href); u.searchParams.set('benchrun', runId); history.replaceState(null, '', u.toString()); } catch (e) {}
  }
  const C = R.configs[R.idx];
  if (!C) return null;
  const main = C.id === 'all', segSeconds = main ? R.seconds : Math.max(2, Math.round(R.seconds * 2 / 3)), settle = 1.5;
  const gl = renderer.getContext(), gpuExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const S = { runId: R.runId, config: C, phase: 'boot', seg: -1, segments: [], events: [], done: false };
  /** @type {any} */ (window).__bench = S;
  const banner = document.createElement('div'); banner.id = 'benchNote';
  banner.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:300;background:#061924e0;border:1px solid #8ff;color:#cfe;font:12px Consolas,monospace;padding:6px 9px;pointer-events:none;white-space:pre';
  document.body.appendChild(banner);
  const status = t => { banner.textContent = `NGC-1980 BENCHMARK  ${R.idx + 1}/${R.configs.length}  rk=${C.id}${C.off ? ' (' + C.off + ' off)' : ''}\n${t}\nLeave the mouse and keyboard alone. Esc stops.`; };
  addEventListener('keydown', e => { if (e.code === 'Escape' && S.phase !== 'done') { S.events.push('stopped with Esc'); abort('stopped with Esc'); } });

  // ---------------------------------------------------------------- the tour (the game's own paths)
  let hover = null;
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const clean = () => {
    if (d.JP.autopilot) d.JP.autopilot = null; hover = null;
    if (d.commander.isOpen) d.commander.close();
    d.toHeli(); d.stowCrafts();
  };
  const home = () => d.HOME_B.isl || d.ISLANDS[0];
  const heliAt = (x, z, agl, tx, tz, view) => {
    const y = Math.max(0, d.groundY(x, z)) + agl;
    d.resetZarch(false, { x, z, y: y + d.HELI.SKID_Y, yaw: yawTo(x, z, tx, tz) });
    hover = { y }; d.setView(view);
  };
  const footAt = (x, z, tx, tz) => {
    clean();
    const y = d.groundY(x, z), yaw = yawTo(x, z, tx, tz);
    if (!d.foot.spawnAt([{ x, y, z, yaw }], { force: true })) throw Error('could not put the soldier down');
    d.crafts.control('foot', 0, 'heli');
    const W = d.foot.slots?.soldier; if (W) { W.yaw = yaw; W.pitch = -0.04; }
    d.setView('cockpit');
  };
  const hotspot = () => {
    let best = null;
    for (const I of d.ISLANDS) {
      let a = 0, b = 0, p = 0;
      for (const u of war.units) if (u.p && !u.dead && !u.gone && Math.hypot(u.p.x - I.x, u.p.z - I.z) < 500) { if (u.side === 1) a++; else if (u.side === 2) b++; }
      for (const pr of war.proj) if (pr.p && Math.hypot(pr.p.x - I.x, pr.p.z - I.z) < 500) p++;
      const s = p * 2 + Math.min(a, b) * 3 + a + b + (I.owner === 2 ? .5 : 0);
      if (!best || s > best.score) best = { I, score: s, friendly: a, enemy: b, rounds: p };
    }
    return best;
  };
  const TOUR = [
    { id: 'foot-home', label: 'On foot at the home base HQ (the user\'s view)', want: 'foot', setup() {
      const I = home(), s = I.structs?.find(s => s.kind === 'hq') || { x: I.x, z: I.z };
      const ang = Math.atan2(s.z - I.z, s.x - I.x) + 3.3, x = s.x + Math.cos(ang) * 28, z = s.z + Math.sin(ang) * 28;
      footAt(x, z, s.x, s.z); return { x: Math.round(x), z: Math.round(z) };
    } },
    { id: 'huey30', label: 'Huey cockpit, 30 m over the home island', want: 'heli', setup() {
      clean(); const I = home(), x = I.x + 110, z = I.z + 90; heliAt(x, z, 30, I.x, I.z, 'cockpit');
    } },
    { id: 'huey200', label: 'Huey chase camera, 200 m over the home island', want: 'heli', setup() {
      clean(); const I = home(), x = I.x + 260, z = I.z + 300; heliAt(x, z, 200, I.x, I.z, 'chase');
    } },
    { id: 'jet1200', label: 'Hornet cockpit, 1200 m over the islands', want: 'jet', setup() {
      clean(); d.launchJet(); const J = d.JP.J, c = war.carrier, I = home();
      const ang = Math.atan2(I.z - c.p.z, I.x - c.p.x), x = I.x - Math.cos(ang) * 2500, z = I.z - Math.sin(ang) * 2500, alt = 1200;
      J.cat = null; J.reset(x, 0, z, yawTo(x, z, I.x, I.z), { running: true, airborne: true, alt, speed: 150 }); for (const e of J.eng) e.n = .9;
      d.JP.autopilot = J => ({ pitch: Math.max(-1, Math.min(1, -J.vel.y * .03 + (alt - J.pos.y) * .004)), roll: -J.attitude().roll * 2, yaw: 0, throttle: [.7, .7], brakeL: 0, brakeR: 0 });
      d.setView('cockpit');
    } },
    { id: 'deck', label: 'On foot on the carrier deck, beside the Huey, looking along the deck at the island', want: 'foot', setup() {
      // (on the deck by the Huey's spot: getInOut needs the Huey settled on a moving deck, which took 1-15 s and sometimes
      // never came in a slow headless run)
      clean(); const c = war.carrier, H = d.H.pos, s = Math.sin(c.yaw), co = Math.cos(c.yaw), x = H.x + co * 9, z = H.z - s * 9;
      footAt(x, z, c.p.x, c.p.z); return { x: Math.round(x), z: Math.round(z) };
    } },
    { id: 'village', label: 'On foot in the nearest zone village street', want: 'foot', setup() {
      let best = null; const cp = war.carrier.p;
      for (const e of [...(d.world.zone || [])].sort((a, b) => Math.hypot(a.x - cp.x, a.z - cp.z) - Math.hypot(b.x - cp.x, b.z - cp.z)).slice(0, 1)) {
        const b = (e.items || []).filter(i => i.w && i.d);
        for (const i of b) { const n = b.filter(j => Math.hypot(j.x - i.x, j.z - i.z) < 45).length; if (!best || n > best.n) best = { n, x: i.x, z: i.z }; }
      }
      if (!best) { const I = home(); best = { n: 0, x: I.x, z: I.z }; S.events.push('village: no zone village found, used the home island'); }
      const qx = -0.51, qz = 0.86, x = best.x + qx * 22, z = best.z + qz * 22;
      footAt(x, z, best.x - qx * 6, best.z - qz * 6); return { buildings: best.n, x: Math.round(best.x), z: Math.round(best.z) };
    } },
    { id: 'forest', label: 'On foot at a forest edge near the home base', want: 'foot', setup() {
      const I = home(), T = d.THREE, m4 = new T.Matrix4(), p = new T.Vector3(); let best = null;
      // RENDERKIT nature: the densest tree within 70-400 m of the home island (its forest sources: x y z s ... per tree)
      const F = d.nature?.forest; if (F) for (const s of F.sources.values()) for (let i = 0; i < s.n; i += 2) { const x = s.d[i * 8], z = s.d[i * 8 + 2], dd = Math.hypot(x - I.x, z - I.z); if (dd < 70 || dd > 400) continue; let n = 0; for (let j = 0; j < s.n; j += 2) if (Math.abs(s.d[j * 8] - x) < 20 && Math.abs(s.d[j * 8 + 2] - z) < 20) n++; if (!best || n > best.n) best = { n, x, z }; }
      if (!best)       d.scene.traverse(o => { if (!o.isInstancedMesh || o.count < 200) return; for (let i = 0; i < o.count; i += 3) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); const dd = Math.hypot(p.x - I.x, p.z - I.z); if (dd > 70 && dd < 400 && (!best || dd < best.d)) best = { d: dd, x: p.x, z: p.z }; } });
      if (!best) { best = { x: I.x + 80, z: I.z + 80 }; S.events.push('forest: no tree instances found near the home base'); }
      // the edge: walk out from that tree (8 bearings, 3 m steps) to the nearest dry spot 8 m clear of any trunk, then 6 m more, and look back in
      let ex = best.x - 9, ez = best.z + 14;
      if (F) { const clear = (x, z) => { for (const s of F.sources.values()) for (let j = 0; j < s.n; j++) if (Math.abs(s.d[j * 8] - x) < 8 && Math.abs(s.d[j * 8 + 2] - z) < 8) return false; return true; };
        let bd = Infinity; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; for (let r = 3; r < 90 && r < bd; r += 3) { const x = best.x + Math.cos(a) * r, z = best.z + Math.sin(a) * r; if (d.groundY(x, z) > 1 && clear(x, z)) { bd = r; ex = best.x + Math.cos(a) * (r + 6); ez = best.z + Math.sin(a) * (r + 6); break; } } } }
      footAt(ex, ez, best.x, best.z); return { x: Math.round(ex), z: Math.round(ez), trees: best.n };
    } },
    { id: 'war', label: 'Huey chase camera, 70 m over the busiest fight', want: 'heli', setup() {
      clean(); const h = hotspot(), I = h.I, c = war.carrier, ang = Math.atan2(c.p.z - I.z, c.p.x - I.x);
      const x = I.x + Math.cos(ang) * (I.r || 150) * 1.4, z = I.z + Math.sin(ang) * (I.r || 150) * 1.4; heliAt(x, z, 70, I.x, I.z, 'chase');
      return { island: I.name || I.key || null, score: h.score, friendly: h.friendly, enemy: h.enemy, rounds: h.rounds };
    } },
  ];
  const only = (params.get('benchviews') || '').split(',').filter(Boolean);
  const tour = only.length ? TOUR.filter(t => only.includes(t.id)) : TOUR;

  // ---------------------------------------------------------------- measurement
  let cur = null, lastNow = 0, gpuActive = null, gpuPending = [], longTasks = [], segT = 0, segIdx = -1, sync = null;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) longTasks.push(e.duration); }).observe({ type: 'longtask' }); } catch (e) { S.events.push('longtask observer unavailable'); }
  const heap = () => { const m = /** @type {any} */ (performance).memory; return m ? r1(m.usedJSHeapSize / 1048576) : null; };
  // shadow passes: the renderer calls shadowMap.render() inside render(); count its draws and triangles
  const SM = renderer.shadowMap, smOrig = SM.render; let shCalls = 0, shTris = 0;
  SM.render = function (...a) { const c = renderer.info.render.calls, t = renderer.info.render.triangles; const r = smOrig.apply(this, a); shCalls += renderer.info.render.calls - c; shTris += renderer.info.render.triangles - t; return r; };
  const pollGpu = () => {
    if (!gpuExt) return;
    while (gpuPending.length) {
      const g = gpuPending[0];
      if (!gl.getQueryParameter(g.q, gl.QUERY_RESULT_AVAILABLE)) break;
      gpuPending.shift();
      const disjoint = gl.getParameter(gpuExt.GPU_DISJOINT_EXT), ns = gl.getQueryParameter(g.q, gl.QUERY_RESULT);
      if (!disjoint && g.seg) g.seg.gpu.push(ns / 1e6);
      gl.deleteQuery(g.q);
    }
  };
  const px1 = new Uint8Array(4), drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
  // census: one frame per view with every draw attributed to a named owner (the nearest named ancestor under the scene,
  // and that ancestor's top-level group), split into the shadow passes and the rest. Answers "what are these calls".
  let census = null, inShadow = false;
  const SMr = SM.render; SM.render = function (...a) { inShadow = true; try { return SMr.apply(this, a); } finally { inShadow = false; } };
  const rbdOrig = renderer.renderBufferDirect;
  const owner = o => {
    let named = null, top = o;
    for (let p = o; p && p.parent; p = p.parent) { if (!named && p.name) named = p; top = p; }
    const n = x => x ? (x.name || x.type) : '?';
    return `${n(top)} › ${named ? n(named) : o.type}`;
  };
  renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (!census) return rbdOrig.apply(this, arguments);
    const t0 = renderer.info.render.triangles; const r = rbdOrig.apply(this, arguments);
    const k = owner(object), e = census.by[k] || (census.by[k] = { calls: 0, tris: 0, shCalls: 0, shTris: 0, inst: 0 });
    const tr = renderer.info.render.triangles - t0;
    if (inShadow) { e.shCalls++; e.shTris += tr; } else { e.calls++; e.tris += tr; if (object.isInstancedMesh) e.inst++; }
    return r;
  };
  const censusSummary = c => Object.entries(c.by).map(([k, v]) => ({ owner: k, ...v })).sort((a, b) => (b.calls + b.shCalls) - (a.calls + a.shCalls) || b.tris - a.tris).slice(0, 40);

  function startSegment(i) {
    const T = tour[i];
    S.seg = i; status(`view ${i + 1}/${tour.length}: ${T.label}`);
    let info = null, error = '';
    try { info = /** @type {any} */ (T.setup()) || null; } catch (e) { error = e.message; S.events.push(`${T.id}: setup failed: ${e.message}`); }
    cur = { id: T.id, label: T.label, want: T.want, info, error, t0: performance.now(), measuring: false, notes: [], streamWait: 0,
      dt: [], sim: [], prep: [], render: [], cpu: [], gpu: [], calls: [], tris: [], shCalls: [], shTris: [], uncapped: [], heapMax: 0 };
    S.segments.push(cur); segT = performance.now();
  }
  function beginMeasure() {
    cur.measuring = true; cur.tm = performance.now(); cur.heap0 = heap(); longTasks.length = 0;
    cur.view = { craft: G.craft, state: G.state, pixelRatio: r1(renderer.getPixelRatio()), size: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}` };
    cur.ok = G.craft === cur.want && G.state === 'play' && !cur.error;
    if (!cur.ok) cur.notes.push(`expected ${cur.want}, in ${G.craft} (${G.state})${cur.error ? ': ' + cur.error : ''}`);
  }
  function endMeasure() {
    const c = cur, ms = performance.now() - c.tm;
    c.measuring = false;
    const L = d.rkLight;
    c.summary = {
      seconds: r1(ms / 1000), frames: c.dt.length, fps: r1(c.dt.length / (ms / 1000)),
      dt: stats(c.dt), uncapped: stats(c.uncapped),
      cpu: { sim: stats(c.sim), prep: stats(c.prep), render: stats(c.render), total: stats(c.cpu) },
      gpu: gpuExt ? stats(c.gpu) : null,
      drawCalls: stats(c.calls), triangles: stats(c.tris), shadowCalls: stats(c.shCalls), shadowTris: stats(c.shTris),
      programs: renderer.info.programs?.length ?? null, memory: { ...renderer.info.memory },
      heapMB: { start: c.heap0, end: heap(), max: c.heapMax || null },
      longTasks: { count: longTasks.length, ms: r1(longTasks.reduce((s, x) => s + x, 0)) },
      casters: L ? { meshes: L.stats.meshes, cast: L.stats.cast, nearOnly: L.stats.nearOnly } : null,
      streamWaitS: r1(c.streamWait / 1000),
    };
    for (const k of ['dt', 'sim', 'prep', 'render', 'cpu', 'gpu', 'calls', 'tris', 'shCalls', 'shTris', 'uncapped']) delete c[k];
  }
  // one picture per view (main configuration only): the canvas right after the frame was drawn, 640 px wide
  function picture() {
    try {
      const src = renderer.domElement, w = 640, h = Math.round(640 * src.height / src.width), c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h); return c.toDataURL('image/jpeg', 0.82);
    } catch (e) { S.events.push('picture: ' + e.message); return null; }
  }

  // ---------------------------------------------------------------- the report
  async function upload(name, body) {
    try {
      const r = await fetch(`/__bench?kind=desktop&run=${encodeURIComponent(R.runId)}&name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'X-NGC-Bench': '1' }, body });
      await r.text(); if (!r.ok) throw Error('HTTP ' + r.status); return true;
    } catch (e) { S.uploadError = `${name}: ${e.message}`; return false; }
  }
  function env() {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { runId: R.runId, ua: navigator.userAgent, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, gpuTimer: !!gpuExt,
      window: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, drawingBuffer: `${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`, pixelRatio: r1(renderer.getPixelRatio()),
      canvasMSAA: gl.getContextAttributes()?.antialias ?? null, maxSamples: renderer.capabilities.maxSamples, seed: params.get('seed') || '1980', seconds: R.seconds,
      shadows: d.rkLight ? d.rkLight.tier : 'off', post: d.rkPost ? d.rkPost.quality : 'off', cores: navigator.hardwareConcurrency, memoryGB: /** @type {any} */ (navigator).deviceMemory ?? null };
  }
  const pick = (seg, f) => { try { return f(seg.summary); } catch (e) { return null; } };
  function areaTable(Res) {
    // cost of an area = (all on) - (all on except that area), per view, for the metrics below
    const base = Res.all; if (!base) return [];
    const M = { gpu: s => s.gpu?.n ? s.gpu.p50 : null, uncapped: s => s.uncapped.p50, cpuRender: s => s.cpu.render.p50, calls: s => s.drawCalls.p50, tris: s => s.triangles.p50, shadowCalls: s => s.shadowCalls.p50 };
    const rows = [];
    for (const c of R.configs) {
      if (c.id === 'all' || !Res[c.id]) continue;
      const row = { config: c.id, area: c.off || 'everything (rk=0)', views: {} };
      for (const s of base.segments) {
        const o = Res[c.id].segments.find(x => x.id === s.id); if (!o || !o.summary || !s.summary) continue;
        const v = {}; for (const [k, f] of Object.entries(M)) { const a = pick(s, f), b = pick(o, f); v[k] = a == null || b == null ? null : r1(a - b); }
        row.views[s.id] = v;
      }
      rows.push(row);
    }
    return rows;
  }
  function verdicts(rep) {
    const v = [], seg = (rep.results.all?.segments || []).filter(s => s.summary);
    if (!seg.length) return ['No view was measured.'];
    const by = f => seg.slice().sort((a, b) => (f(b.summary) || 0) - (f(a.summary) || 0))[0];
    const w = by(s => s.uncapped.p50); v.push(`Heaviest view: ${w.label}, uncapped frame ${w.summary.uncapped.p50} ms (~${Math.round(1000 / (w.summary.uncapped.p50 || 1))} fps without vsync), ${w.summary.drawCalls.p50} draw calls, ${Math.round(w.summary.triangles.p50 / 1000)}k triangles.`);
    const g = seg.filter(s => s.summary.gpu?.n);
    if (g.length) { const x = g.slice().sort((a, b) => b.summary.gpu.p50 - a.summary.gpu.p50)[0]; v.push(`GPU time p50 up to ${x.summary.gpu.p50} ms (${x.label}).`); }
    else v.push('GPU timer queries are not exposed by this browser: read GPU cost from the uncapped frame time minus CPU time.');
    const sc = by(s => s.shadowCalls.p50); v.push(`Shadow passes: up to ${sc.summary.shadowCalls.p50} of ${sc.summary.drawCalls.p50} draw calls (${sc.label}).`);
    for (const r of rep.areas) {
      const vals = Object.values(r.views).map(x => x.gpu ?? x.uncapped).filter(x => x != null); if (!vals.length) continue;
      const mx = Math.max(...vals); if (mx >= 1) v.push(`${r.area}: up to ${mx} ms per frame (${rep.env.gpuTimer ? 'GPU' : 'uncapped frame'}).`);
    }
    return v;
  }
  function html(rep) {
    const segs = (rep.results.all?.segments || []).filter(s => s.summary), Sm = s => s.summary;
    const row = (k, ...c) => `<tr><th>${esc(k)}</th>${c.map(x => `<td>${esc(x ?? '—')}</td>`).join('')}</tr>`;
    const table = (title, rows) => `<h2>${esc(title)}</h2><div class="w"><table><tr><th></th>${segs.map(s => `<th>${esc(s.id)}</th>`).join('')}</tr>${rows.map(([k, f]) => row(k, ...segs.map(s => f(Sm(s), s)))).join('')}</table></div>`;
    const p = (st, k = 'p50') => st ? st[k] : null;
    const pr = (st) => st ? `${st.p50} / ${st.p95}` : null;
    const area = rep.areas.length ? `<h2>Cost per RenderKit area (all on − that area off; p50 per view)</h2><p class="m">GPU ms (or uncapped frame ms when there is no GPU timer) · draw calls · k triangles. Negative = the area saves that much.</p><div class="w"><table><tr><th>area</th>${segs.map(s => `<th>${esc(s.id)}</th>`).join('')}</tr>${rep.areas.map(r => `<tr><th>${esc(r.area)}</th>${segs.map(s => { const v = r.views[s.id]; return `<td>${v ? `${esc(v.gpu ?? v.uncapped)} ms · ${esc(v.calls)} · ${v.tris == null ? '—' : Math.round(v.tris / 100) / 10}k` : '—'}</td>`; }).join('')}</tr>`).join('')}</table></div>` : '';
    const cfgs = Object.keys(rep.results);
    const cfgTable = cfgs.length > 1 ? `<h2>Every configuration (uncapped frame ms p50 · draw calls p50)</h2><div class="w"><table><tr><th>rk</th>${segs.map(s => `<th>${esc(s.id)}</th>`).join('')}</tr>${cfgs.map(c => `<tr><th>${esc(c)}</th>${segs.map(s => { const o = rep.results[c].segments.find(x => x.id === s.id); return `<td>${o?.summary ? `${o.summary.uncapped.p50} · ${o.summary.drawCalls.p50}` : '—'}</td>`; }).join('')}</tr>`).join('')}</table></div>` : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NGC-1980 benchmark ${esc(rep.env.runId)}</title><style>
:root{--bg:#0b1419;--fg:#d6e6ec;--mut:#89a;--line:#24414d;--acc:#7fe0d0}body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;color:var(--acc)}table{border-collapse:collapse;font:13px ui-monospace,Consolas,monospace}td,th{border:1px solid var(--line);padding:4px 8px;text-align:right;white-space:nowrap}th{text-align:left;color:var(--mut);font-weight:600}
.w{overflow-x:auto}.m{color:var(--mut)}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.shots figure{margin:0;background:#06131d;border:1px solid var(--line);padding:6px}.shots img{width:100%;display:block}figcaption{color:var(--mut);font-size:12px;margin-top:4px}
</style></head><body><h1>NGC-1980 desktop benchmark</h1><div class="m">${esc(rep.env.runId)} · ${esc(rep.env.gpu || '')} · ${esc(rep.env.drawingBuffer)} px · ${rep.aborted ? 'STOPPED: ' + esc(rep.aborted) : 'complete'}</div>
<h2>Findings</h2><ul>${rep.verdicts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
<h2>Views</h2><ol>${segs.map(s => `<li><code>${esc(s.id)}</code> ${esc(s.label)}${s.info ? ' · ' + esc(JSON.stringify(s.info)) : ''}${s.ok ? '' : ' · <b>NOT AS PLANNED: ' + esc(s.notes.join('; ')) + '</b>'}</li>`).join('')}</ol>
${table('Frame time (ms, p50 / p95)', [['rAF frame (vsync-capped)', s => pr(s.dt)], ['fps', s => s.fps], ['uncapped frame (CPU+GPU, drained)', s => pr(s.uncapped)], ['GPU (timer query)', s => s.gpu?.n ? pr(s.gpu) : 'n/a'], ['CPU sim', s => pr(s.cpu.sim)], ['CPU prep', s => pr(s.cpu.prep)], ['CPU render submit', s => pr(s.cpu.render)], ['CPU total', s => pr(s.cpu.total)]])}
${table('Work per frame (p50 / max)', [['draw calls (all passes)', s => `${p(s.drawCalls)} / ${s.drawCalls.max}`], ['triangles', s => `${p(s.triangles)} / ${s.triangles.max}`], ['shadow-pass calls', s => `${p(s.shadowCalls)} / ${s.shadowCalls.max}`], ['shadow-pass triangles', s => p(s.shadowTris)], ['shadow casters / near only', s => s.casters ? `${s.casters.cast} / ${s.casters.nearOnly}` : 'off'], ['programs', s => s.programs], ['textures', s => s.memory.textures], ['geometries', s => s.memory.geometries], ['heap MB', s => `${s.heapMB.start} → ${s.heapMB.end}`], ['long tasks', s => `${s.longTasks.count} (${s.longTasks.ms} ms)`], ['streaming wait s', s => s.streamWaitS]])}
${area}${cfgTable}
<h2>Who draws (one frame per view: draw calls and triangles by owner, world / shadow passes)</h2>${segs.filter(s => s.census).map(s => `<details><summary>${esc(s.id)} · ${esc(s.label)}</summary><div class="w"><table><tr><th>owner</th><th>calls</th><th>k tris</th><th>shadow calls</th><th>shadow k tris</th></tr>${s.census.slice(0, 25).map(e => `<tr><th>${esc(e.owner)}</th><td>${e.calls}</td><td>${Math.round(e.tris / 100) / 10}</td><td>${e.shCalls}</td><td>${Math.round(e.shTris / 100) / 10}</td></tr>`).join('')}</table></div></details>`).join('')}
<h2>What each view showed</h2><div class="shots">${segs.filter(s => rep.pictures?.[s.id]).map(s => `<figure><img alt="${esc(s.label)}" src="${rep.pictures[s.id]}"><figcaption>${esc(s.id)} · ${esc(s.label)}</figcaption></figure>`).join('')}</div>
<h2>Environment</h2><div class="w"><table>${Object.entries(rep.env).map(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : v)).join('')}</table></div>
<h2>Events</h2><ul>${(rep.events.length ? rep.events : ['none']).map(e => `<li><code>${esc(e)}</code></li>`).join('')}</ul></body></html>`;
  }

  // ---------------------------------------------------------------- configuration hand-over
  function saveConfig() {
    const pics = R.pictures || {};
    for (const s of S.segments) { if (s.picture) pics[s.id] = s.picture; delete s.picture; }
    if (main) R.pictures = pics;
    R.results[C.id] = { env: env(), segments: S.segments, events: S.events };
    if (!store(R)) { delete R.pictures; store(R); S.events.push('localStorage full: pictures dropped'); }
  }
  async function finish(aborted = '') {
    if (S.phase === 'done' || S.phase === 'saving') return; S.phase = 'saving';
    try { if (cur && cur.measuring) endMeasure(); } catch (e) {}
    SM.render = smOrig; renderer.renderBufferDirect = rbdOrig; renderer.info.autoReset = true; G.bench = !!S.wasBench; hover = null; if (d.JP.autopilot) d.JP.autopilot = null;
    saveConfig();
    if (!aborted && R.idx + 1 < R.configs.length) { R.idx++; store(R); status('next configuration: reloading'); return relaunch(R, R.idx); }
    const rep = { schema: 1, env: R.results.all?.env || env(), aborted: aborted || null, configs: R.configs, results: R.results, pictures: R.pictures || {}, events: Object.entries(R.results).flatMap(([k, v]) => v.events.map(e => `${k}: ${e}`)) };
    rep.areas = areaTable(rep.results); rep.verdicts = verdicts(rep);
    const page = html(rep); S.html = page; S.report = rep;
    const json = JSON.stringify({ ...rep, pictures: undefined }, null, 1);
    const okJ = await upload('report.json', new Blob([json], { type: 'application/json' })), ok = okJ && (await upload('report.html', new Blob([page], { type: 'text/html' })));
    try { localStorage.removeItem(KEY); } catch (e) {}
    S.phase = 'done'; S.done = true; banner.remove();
    try { if (G.state === 'play') d.openMenu(); } catch (e) {}
    result(rep, !!ok);
  }
  function abort(why) { finish(why); }
  function result(rep, ok) {
    const box = document.createElement('div'); box.id = 'benchResult';
    box.style.cssText = 'position:fixed;left:50%;top:8%;transform:translateX(-50%);z-index:400;max-width:min(92vw,900px);max-height:84vh;overflow:auto;background:#061924f2;border:1px solid #8ff;padding:14px;font:13px Consolas,monospace;color:#cfe;pointer-events:auto';
    box.innerHTML = `<b style="color:#fff;font-size:16px">BENCHMARK ${rep.aborted ? 'STOPPED' : 'DONE'}</b><br>${ok ? `Saved to tools/runs/bench-${esc(R.runId)}/ (report.html, report.json)` : 'Could not save to the server (' + esc(S.uploadError || '') + '): use SAVE REPORT.'}<ul>${rep.verdicts.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
    const save = document.createElement('button'); save.textContent = 'SAVE REPORT'; save.style.cssText = 'font:13px Consolas;margin-right:8px';
    save.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([S.html], { type: 'text/html' })); a.download = `ngc1980-bench-${R.runId}.html`; a.click(); };
    const open = document.createElement('button'); open.textContent = 'OPEN REPORT'; open.style.cssText = 'font:13px Consolas;margin-right:8px';
    open.onclick = () => { const w = open.ownerDocument.defaultView.open(); if (w) { w.document.write(S.html); w.document.close(); } };
    const close = document.createElement('button'); close.textContent = 'CLOSE'; close.style.cssText = 'font:13px Consolas'; close.onclick = () => box.remove();
    box.append(save, open, close); document.body.appendChild(box);
  }

  // ---------------------------------------------------------------- frame hooks (main.js frame())
  const api = { state: S,
    get active() { return S.phase === 'running' || S.phase === 'boot'; },
    frameStart() {
      if (S.phase !== 'running') return;
      renderer.info.autoReset = false; renderer.info.reset(); shCalls = shTris = 0;
      if (cur?.censusNext) { cur.censusNext = false; census = { by: {} }; }
      if (sync) { drain(); sync.t = performance.now(); }
      else if (gpuExt && cur && !gpuActive) { const g = { q: gl.createQuery(), seg: cur.measuring ? cur : null }; gl.beginQuery(gpuExt.TIME_ELAPSED_EXT, g.q); gpuActive = g; }
      if (hover && G.craft === 'heli') d.HI.setCollective(Math.max(.2, Math.min(.75, .45 + (hover.y - d.H.pos.y) * .02 - d.H.vel.y * .04)));
    },
    frameEnd(now, now0, t1, t2, t3) {
      if (gpuActive) { gl.endQuery(gpuExt.TIME_ELAPSED_EXT); gpuPending.push(gpuActive); gpuActive = null; }
      pollGpu();
      const wall = performance.now();
      if (S.phase === 'boot') {
        if (G.state === 'title') { d.newGame(); return; }
        if (G.state !== 'play') return;
        if (!S.bootT) { S.bootT = wall; return; }
        if (wall - S.bootT < 2500) return;   // the opening frames: shader compiles, the first streaming
        S.phase = 'running'; S.wasBench = G.bench; G.bench = true; segIdx = 0; startSegment(0); lastNow = now; return;
      }
      if (S.phase !== 'running') return;
      if (G.state === 'paused') { cur.notes.push('game paused (focus lost?), resumed'); d.closeMenu(); }
      if (census) { cur.census = censusSummary(census); census = null; sync = { n: 10, t: 0 }; lastNow = now; return; }
      if (sync) {   // drained frames: the whole frame with nothing overlapping
        drain(); cur.uncapped.push(performance.now() - sync.t);
        if (--sync.n <= 0) { sync = null; if (main) cur.picture = picture(); endMeasure(); next(); }
        lastNow = now; return;
      }
      const el = (wall - segT) / 1000;
      if (!cur.measuring) {
        // wait for the world streaming round the new position (at most 15 s), then settle
        const T = tour[S.seg]; if (T.again && G.craft !== T.want && wall - (cur.againT || segT) > 600) { cur.againT = wall; try { T.again(); } catch (e) {} }
        const pend = d.world?.stats?.pending || 0;
        if (pend > 0 && el < 15) { cur.streamWait = wall - segT; segT += 0; lastNow = now; return; }
        if (el - cur.streamWait / 1000 >= settle && (G.craft === T.want || el > 12)) beginMeasure();
      } else {
        const dt = now - lastNow;
        cur.dt.push(dt); cur.sim.push(t1 - now0); cur.prep.push(t2 - t1); cur.render.push(t3 - t2); cur.cpu.push(t3 - now0);
        cur.calls.push(renderer.info.render.calls); cur.tris.push(renderer.info.render.triangles); cur.shCalls.push(shCalls); cur.shTris.push(shTris);
        const hp = heap(); if (hp > cur.heapMax) cur.heapMax = hp;
        if ((wall - cur.tm) / 1000 >= segSeconds) { if (main) cur.censusNext = true; else sync = { n: 10, t: 0 }; }
      }
      lastNow = now;
    },
  };
  function next() {
    segIdx++;
    if (segIdx < tour.length) startSegment(segIdx);
    else finish('');
  }
  status('starting');
  return api;
}

// reload the page into configuration i of the run (its rk), keeping every other query parameter
function relaunch(R, i) {
  const u = new URL(location.href);
  u.searchParams.set('rk', R.configs[i].rk); u.searchParams.set('benchrun', R.runId);
  setTimeout(() => location.replace(u.toString()), 50);
  return null;
}
