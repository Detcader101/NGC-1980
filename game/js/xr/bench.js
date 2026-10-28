// ?xrbench: a one-click in-headset VR benchmark. After ENTER VR it tours fixed views through the ordinary game paths
// (getting out on deck, the Huey, a Hornet off the catapult, an M60, a hover over the busiest fight, the command board),
// measures every XR frame and posts a report with pictures of the panel and of one eye to tools/serve.mjs (/__bench).
// Head tracking stays live throughout; nothing here changes how a view is drawn. ?xrbench=N: N seconds per view.
import * as THREE from 'three';

const q = (a, p) => { if (!a.length) return null; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]; };
const r1 = x => x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100;
const pct = (a, lim) => a.length ? r1(100 * a.filter(x => x > lim).length / a.length) : null;
const stats = a => ({ n: a.length, p50: r1(q(a, .5)), p95: r1(q(a, .95)), p99: r1(q(a, .99)), max: r1(a.length ? Math.max(...a) : null), mean: r1(a.length ? a.reduce((s, x) => s + x, 0) / a.length : null) });
const db = x => x > 0 ? r1(20 * Math.log10(x)) : -Infinity;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createXRBench(d) {
  const { XR, renderer, G, war, params } = d;
  const segSeconds = Math.max(2, Math.min(60, Number(params.get('xrbench')) || 15)), settle = Math.min(3, segSeconds * .25);
  const runId = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const gl = renderer.getContext(), gpuExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const S = { runId, phase: 'waiting', seg: -1, segments: [], uploads: [], uploadErrors: [], pending: [], events: [], done: false, report: null, files: {} };
  window.__xrbench = S;
  const note = document.createElement('div'); note.id = 'xrbenchNote'; note.style.cssText = 'max-width:300px;margin-top:6px;color:#ff8';
  note.textContent = `VR BENCHMARK: press ENTER VR, then leave the controllers alone for about ${Math.ceil(6 * segSeconds / 60 + .5)} min (6 views). Look around if you like: head tracking stays live.`;
  document.getElementById('xrEntry')?.appendChild(note);

  // ---------------------------------------------------------------- the tour (the game's own paths: craft swaps, spawns, the board)
  let hover = null;   // { y }: a hands-off height hold on the collective, the way the evidence fixtures fly the Huey
  const clean = () => {
    if (d.JP.autopilot) d.JP.autopilot = null; hover = null;
    if (d.commander.isOpen) d.commander.close();
    d.toHeli(); d.stowCrafts();
  };
  const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
  const heliAt = (x, z, agl, tx, tz) => {
    const y = Math.max(0, d.groundY(x, z)) + agl;
    d.resetZarch(false, { x, z, y: y + d.HELI.SKID_Y, yaw: yawTo(x, z, tx, tz) });
    hover = { y };
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
    { id: 'deck-foot', label: 'Carrier deck on foot', want: 'foot', setup() { d.getInOut(); } },
    { id: 'huey-hover', label: 'Huey cockpit, hover beside the ALBATROSS', want: 'heli', setup() {
      clean(); const c = war.carrier, s = Math.sin(c.yaw), co = Math.cos(c.yaw);
      // 80 m off the port beam, 25 m up, looking at the island
      const x = c.p.x - co * 80, z = c.p.z + s * 80; heliAt(x, z, 25, c.p.x, c.p.z);
    } },
    { id: 'hornet-islands', label: 'Hornet cockpit, 300 m over the islands', want: 'jet', setup() {
      clean(); d.launchJet(); const J = d.JP.J, c = war.carrier;
      const I = d.ISLANDS.filter(I => I !== d.HOME_B.isl).sort((a, b) => Math.hypot(a.x - c.p.x, a.z - c.p.z) - Math.hypot(b.x - c.p.x, b.z - c.p.z))[0] || d.ISLANDS[0];
      const ang = Math.atan2(I.z - c.p.z, I.x - c.p.x), x = I.x - Math.cos(ang) * 1300, z = I.z - Math.sin(ang) * 1300, alt = Math.max(0, d.groundY(x, z)) + 300;
      J.cat = null; J.reset(x, 0, z, yawTo(x, z, I.x, I.z), { running: true, airborne: true, alt, speed: 120 }); for (const e of J.eng) e.n = .9;
      d.JP.autopilot = J => ({ pitch: Math.max(-1, Math.min(1, -J.vel.y * .03 + (alt - J.pos.y) * .004)), roll: -J.attitude().roll * 2, yaw: 0, throttle: [.7, .7], brakeL: 0, brakeR: 0 });
      return { target: I.name || I.key || null };
    } },
    { id: 'm60-driver', label: 'M60A3 driver, home island motor pool', want: 'm60', setup() {
      clean(); const ts = d.armourSpot(); d.m60C.spawnAt({ ...ts, state: 'hot' }); d.crafts.control('m60', 0, 'swap');
    } },
    { id: 'war-vantage', label: 'Huey hover over the busiest fight', want: 'heli', setup() {
      clean(); const h = hotspot(), I = h.I, c = war.carrier, ang = Math.atan2(c.p.z - I.z, c.p.x - I.x);
      const x = I.x + Math.cos(ang) * (I.r || 150) * 1.4, z = I.z + Math.sin(ang) * (I.r || 150) * 1.4; heliAt(x, z, 70, I.x, I.z);
      S.vantage = { x, z, I }; return { island: I.name || I.key || null, score: h.score, friendly: h.friendly, enemy: h.enemy, rounds: h.rounds };
    } },
    { id: 'command-board', label: 'Command board open (spatial panel capture)', want: 'heli', setup() {
      d.commander.open();
    } },
  ];

  // ---------------------------------------------------------------- measurement
  let cur = null, lastNow = 0, gpuActive = null, gpuPending = [], longTasks = [], panelPaintMs = 0, painted = false, capturing = null;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) longTasks.push(e.duration); }).observe({ type: 'longtask' }); } catch (e) { S.events.push('longtask observer unavailable'); }
  const P = XR.panel, paintOrig = P.update;
  P.update = now => { const t = performance.now(), n = P.paints, r = paintOrig(now); if (P.paints !== n) { painted = true; panelPaintMs = performance.now() - t; } return r; };
  let analyser = null, abuf = null;
  const audioProbe = () => {
    const sfx = d.sfx;
    if (!analyser && sfx.ctx && sfx.master) { analyser = sfx.ctx.createAnalyser(); analyser.fftSize = 2048; abuf = new Float32Array(analyser.fftSize); sfx.master.connect(analyser); }
    if (!analyser || !cur || !cur.measuring) return;
    analyser.getFloatTimeDomainData(abuf); let s = 0, pk = 0;
    for (let i = 0; i < abuf.length; i++) { const v = abuf[i]; s += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
    cur.audio.sum += s / abuf.length; cur.audio.n++; if (pk > cur.audio.peak) cur.audio.peak = pk;
  };
  const audioState = () => {
    const c = d.sfx.ctx;
    return c ? { state: c.state, sampleRate: c.sampleRate, baseLatency: r1(c.baseLatency * 1000), outputLatency: r1((c.outputLatency || 0) * 1000), sinkId: 'sinkId' in c ? (typeof c.sinkId === 'string' ? c.sinkId || '(default device)' : JSON.stringify(c.sinkId)) : 'unsupported',
      currentTime: r1(c.currentTime), masterGain: d.sfx.master ? r1(d.sfx.master.gain.value) : null, channels: c.destination.channelCount, maxChannels: c.destination.maxChannelCount } : { state: 'none' };
  };
  const heap = () => performance.memory ? r1(performance.memory.usedJSHeapSize / 1048576) : null;
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

  function startSegment(i) {
    const T = TOUR[i];
    S.seg = i; painted = false;
    let info = null, error = '';
    try { info = T.setup() || null; } catch (e) { error = e.message; S.events.push(`${T.id}: setup failed: ${e.message}`); }
    cur = { id: T.id, label: T.label, want: T.want, info, error, t0: performance.now(), measuring: false, notes: [], dt: [], wall: [], lag: [], sim: [], prep: [], render: [], cpu: [], gpu: [], calls: [], tris: [], paintDt: [], plainDt: [], paintRender: [], plainRender: [], paintMs: [],
      audio: { sum: 0, n: 0, peak: 0 }, longTasks: 0, longTaskMs: 0, heap0: null, heapMax: 0, captures0: 0, paints0: 0, ctx0: null, wall0: 0 };
    S.segments.push(cur);
  }
  function beginMeasure() {
    cur.measuring = true; cur.tm = performance.now(); cur.heap0 = heap(); cur.captures0 = P.captures; cur.paints0 = P.paints; longTasks.length = 0;
    cur.ctx0 = d.sfx.ctx ? d.sfx.ctx.currentTime : null; cur.wall0 = performance.now();
    cur.view = { craft: G.craft, flat: XR.state.flat, cockpit: d.cockpitCam(), tracking: XR.state.tracking, state: G.state };
    cur.ok = G.craft === cur.want && G.state === 'play';
    if (!cur.ok) cur.notes.push(`expected ${cur.want}, in ${G.craft} (${G.state})`);
  }
  function endMeasure() {
    const c = cur, ms = performance.now() - c.tm;
    c.measuring = false;
    c.longTasks = longTasks.length; c.longTaskMs = r1(longTasks.reduce((s, x) => s + x, 0));
    c.summary = {
      seconds: r1(ms / 1000), frames: c.dt.length, fps: r1(c.dt.length / (ms / 1000)),
      dt: stats(c.dt), over8: pct(c.dt, 8.4), over11: pct(c.dt, 11.2), over14: pct(c.dt, 14), over17: pct(c.dt, 16.8), over33: pct(c.dt, 33.4),
      callbackLag: stats(c.lag), wallDt: stats(c.wall),
      cpu: { sim: stats(c.sim), prep: stats(c.prep), render: stats(c.render), total: stats(c.cpu) },
      gpu: gpuExt ? stats(c.gpu) : null,
      drawCalls: stats(c.calls), triangles: stats(c.tris), programs: renderer.info.programs?.length ?? null, memory: { ...renderer.info.memory },
      panel: { paints: P.paints - c.paints0, captures: P.captures - c.captures0, lastCaptureMs: r1(P.lastCaptureMs), paintSyncMs: stats(c.paintMs), canvas: `${P.canvas.width}x${P.canvas.height}`,
        dtOnPaintFrames: r1(q(c.paintDt, .5)), dtOtherFrames: r1(q(c.plainDt, .5)), renderOnPaintFrames: r1(q(c.paintRender, .5)), renderOtherFrames: r1(q(c.plainRender, .5)) },
      heapMB: { start: c.heap0, end: heap(), max: c.heapMax || null },
      longTasks: { count: c.longTasks, ms: c.longTaskMs },
      audio: { rmsDb: c.audio.n ? db(Math.sqrt(c.audio.sum / c.audio.n)) : null, peakDb: c.audio.n ? db(c.audio.peak) : null, probes: c.audio.n,
        clockRate: c.ctx0 != null ? r1((d.sfx.ctx.currentTime - c.ctx0) / ((performance.now() - c.wall0) / 1000)) : null, ...audioState() },
    };
    for (const k of ['dt', 'wall', 'lag', 'sim', 'prep', 'render', 'cpu', 'gpu', 'calls', 'tris', 'paintDt', 'plainDt', 'paintRender', 'plainRender', 'paintMs']) c[k] = c[k].map(r1);
  }

  // ---------------------------------------------------------------- pictures
  // ---------------------------------------------------------------- pictures
  // shrink: a box-filtered, top-down PNG canvas of one eye's region of a bottom-up RGBA readback (W x H)
  const shrink = (px, W, vx, vy, vw, vh, max = 960) => {
    const k = Math.max(1, Math.ceil(vw / max)), w = Math.floor(vw / k), h = Math.floor(vh / k), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), im = x.createImageData(w, h), o = im.data, n = k * k;
    for (let y = 0; y < h; y++) for (let X = 0; X < w; X++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < k; j++) { const row = (vy + vh - 1 - (y * k + j)) * W + vx + X * k; for (let i = 0; i < k; i++) { const s = (row + i) * 4; r += px[s]; g += px[s + 1]; b += px[s + 2]; } }
      const t = (y * w + X) * 4; o[t] = r / n; o[t + 1] = g / n; o[t + 2] = b / n; o[t + 3] = 255;
    }
    x.putImageData(im, 0, 0); return c;
  };
  // The XR frame drawn a second time, both eyes at the session's framebuffer size, into an offscreen sRGB target: the same
  // scene, eye cameras and overlay pass as XR.render (Three's ArrayCamera viewports), then the left eye is read back.
  let eyeRT = null;
  function eyeShot() {
    const xc = renderer.xr.getCamera(), eye = xc.cameras[0]; if (!eye) return null;
    const L = renderer.xr.getSession()?.renderState.baseLayer, W = L?.framebufferWidth || gl.drawingBufferWidth, H = L?.framebufferHeight || gl.drawingBufferHeight;
    eyeRT = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });   // single-sampled: a second render into a resolved MSAA target would start from invalidated pixels
    // @ts-expect-error isXRRenderTarget is a real WebGLRenderer flag missing from @types/three r170
    eyeRT.isXRRenderTarget = true; eyeRT.texture.colorSpace = renderer.outputColorSpace; eyeRT.texture.internalFormat = 'RGBA8';   // shade exactly as into the headset's layer
    const old = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(eyeRT); renderer.clear();
      if (XR.state.flat) renderer.render(XR.room, XR.camera); else { renderer.render(d.scene, XR.camera); d.overlay(XR.camera); }
      const v = eye.viewport, px = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(eyeRT, 0, 0, W, H, px);
      return shrink(px, W, v.x, v.y, v.z, v.w);
    } finally { renderer.setRenderTarget(old); eyeRT.dispose(); eyeRT = null; }
  }
  S.eyeShot = eyeShot;   // (tests: the same picture on demand)
  function framebufferShot(frame) {   // the actual pixels in the XR framebuffer (left eye), when the browser lets us read them
    const session = renderer.xr.getSession(), layer = session?.renderState.baseLayer, pose = frame?.getViewerPose(renderer.xr.getReferenceSpace());
    if (!layer || !pose) return { error: 'no layer/pose' };
    const vp = layer.getViewport(pose.views[0]), prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const px = new Uint8Array(vp.width * vp.height * 4);
    try { gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer); gl.readPixels(vp.x, vp.y, vp.width, vp.height, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    catch (e) { return { error: e.message }; } finally { gl.bindFramebuffer(gl.FRAMEBUFFER, prev); }
    const err = gl.getError(); if (err) return { error: 'GL error ' + err };
    let lit = 0; for (let i = 0; i < px.length; i += 400) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
    if (!lit) return { error: 'XR framebuffer read back black (the browser does not expose it)' };
    return { canvas: shrink(px, vp.width, 0, 0, vp.width, vp.height), size: `${vp.width}x${vp.height}` };
  }
  function panelShot() {   // the spatial panel's texture as it is now, over the dark VR room colour so the text reads
    const c = document.createElement('canvas'); c.width = P.canvas.width; c.height = P.canvas.height;
    const x = c.getContext('2d'); x.fillStyle = '#06131d'; x.fillRect(0, 0, c.width, c.height); x.drawImage(P.canvas, 0, 0); return c;
  }
  const blobOf = c => new Promise(res => c.toBlob(res, 'image/png'));
  const dataOf = b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
  async function upload(name, body) {
    S.files[name] = body;
    try {
      const r = await fetch(`/__bench?run=${encodeURIComponent(runId)}&name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'X-NGC-Bench': '1' }, body });
      await r.text(); if (!r.ok) throw Error('HTTP ' + r.status); S.uploads.push(name);
    } catch (e) { S.uploadErrors.push(`${name}: ${e.message}`); }
  }
  async function capture(frame) {
    const c = cur, n = String(S.seg + 1).padStart(2, '0'), out = {};
    const t = performance.now();
    try { const fb = framebufferShot(frame); if (fb.canvas) { out.fb = `${n}-${c.id}-eye-framebuffer.png`; out.fbSize = fb.size; out.fbBlob = blobOf(fb.canvas); } else out.fbError = fb.error; } catch (e) { out.fbError = e.message; }
    try { const e = eyeShot(); if (e) { out.eye = `${n}-${c.id}-eye.png`; out.eyeBlob = blobOf(e); } } catch (e) { out.eyeError = e.message; }
    try { out.panel = `${n}-${c.id}-panel.png`; out.panelBlob = blobOf(panelShot()); } catch (e) { out.panelError = e.message; }
    c.captureMs = r1(performance.now() - t);
    c.images = { eye: out.eye, eyeFramebuffer: out.fb, framebufferSize: out.fbSize, panel: out.panel, errors: [out.fbError, out.eyeError, out.panelError].filter(Boolean) };
    for (const [k, b] of [['eye', out.eyeBlob], ['fb', out.fbBlob], ['panel', out.panelBlob]]) if (b) S.pending.push(b.then(blob => blob && upload(out[k], blob)));
  }

  // ---------------------------------------------------------------- report
  function env() {
    const s = renderer.xr.getSession(), L = s?.renderState.baseLayer, dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const cams = renderer.xr.getCamera().cameras;
    return { runId, ua: navigator.userAgent, gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, gpuTimer: !!gpuExt,
      framebuffer: L ? `${L.framebufferWidth}x${L.framebufferHeight}` : null, antialias: L?.antialias ?? null, fixedFoveation: L?.fixedFoveation ?? null, ignoreDepthValues: L?.ignoreDepthValues ?? null,
      layersApi: s?.renderState.layers !== undefined, eyes: cams.map(c => c.viewport.toArray().join(',')), scale: Number(params.get('xrscale')) || .8,
      frameRate: s?.frameRate ?? null, supportedFrameRates: s?.supportedFrameRates ? Array.from(s.supportedFrameRates) : null,
      features: s?.enabledFeatures ? Array.from(s.enabledFeatures) : null, blend: s?.environmentBlendMode ?? null, visibility: s?.visibilityState ?? null,
      inputs: s ? Array.from(s.inputSources).map(i => `${i.handedness}:${i.hand ? 'hand' : (i.profiles || [])[0] || '?'}`) : [],
      window: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, panelCanvas: `${P.canvas.width}x${P.canvas.height}`, panelWidthM: r1(P.width),
      segmentSeconds: segSeconds, settleSeconds: settle, seed: params.get('seed') || '1980', audio: audioState() };
  }
  function verdicts(R) {
    const v = [], seg = R.segments.filter(s => s.summary);
    const worst = seg.slice().sort((a, b) => (b.summary.dt.p50 || 0) - (a.summary.dt.p50 || 0))[0];
    if (worst) v.push(`Slowest view: ${worst.label}, frame p50 ${worst.summary.dt.p50} ms (${worst.summary.fps} fps), ${worst.summary.over8}% of frames over 8.3 ms.`);
    const gpu = seg.filter(s => s.summary.gpu?.n);
    if (gpu.length) { const g = gpu.slice().sort((a, b) => b.summary.gpu.p50 - a.summary.gpu.p50)[0]; v.push(`GPU time p50 up to ${g.summary.gpu.p50} ms (${g.label}).`); }
    else v.push('GPU timer queries unavailable in this browser: GPU cost is inferred from frame time minus CPU time.');
    const cpu = seg.map(s => s.summary.cpu.total.p50 || 0), dt = seg.map(s => s.summary.dt.p50 || 0);
    if (seg.length && dt.every((x, i) => x > cpu[i] * 1.8)) v.push('Frame time is far above main-thread CPU time in every view: the frames wait on the GPU / compositor / runtime, not on game code.');
    const panel = seg.filter(s => s.paintDt.length >= 5 && s.plainDt.length >= 5 && s.summary.panel.dtOnPaintFrames > s.summary.panel.dtOtherFrames * 1.3);
    if (panel.length) v.push(`Frames that repaint the VR panel are slower in ${panel.map(s => s.id).join(', ')} (the ${R.env.panelCanvas} panel canvas is re-uploaded on each paint, up to 10 a second).`);
    const au = seg.map(s => s.summary.audio.rmsDb).filter(x => x != null && x > -Infinity), clock = seg.map(s => s.summary.audio.clockRate).filter(x => x != null);
    if (!au.length) v.push(`Audio: no signal measured on the game's master bus (context ${R.env.audio.state}).`);
    else v.push(`Audio: the game emits sound (master bus RMS ${Math.min(...au)} to ${Math.max(...au)} dBFS; context ${R.env.audio.state}, its clock at ${clock.join(' / ')} x real time; output ${R.env.audio.sinkId}, ${R.env.audioOutputs ? R.env.audioOutputs.length + ' output devices visible' : 'output devices not listed'}). If nothing is heard, the sound is going to a different Windows output device than the headset.`);
    return v;
  }
  function html(R, img) {
    const row = (k, ...c) => `<tr><th>${esc(k)}</th>${c.map(x => `<td>${esc(x ?? '—')}</td>`).join('')}</tr>`;
    const segs = R.segments.filter(s => s.summary), Sm = s => s.summary;
    const table = (title, rows) => `<h2>${esc(title)}</h2><div class="w"><table><tr><th></th>${segs.map(s => `<th>${esc(s.id)}</th>`).join('')}</tr>${rows.map(([k, f]) => row(k, ...segs.map(s => f(Sm(s), s)))).join('')}</table></div>`;
    const p = (st, k = 'p50') => st ? st[k] : null;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XR bench ${esc(R.env.runId)}</title><style>
:root{--bg:#0b1419;--fg:#d6e6ec;--mut:#89a;--line:#24414d;--acc:#7fe0d0}body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;color:var(--acc)}table{border-collapse:collapse;font:13px ui-monospace,Consolas,monospace}td,th{border:1px solid var(--line);padding:4px 8px;text-align:right;white-space:nowrap}th{text-align:left;color:var(--mut);font-weight:600}
.w{overflow-x:auto}.v li{margin:4px 0}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}.shots figure{margin:0;background:#06131d;border:1px solid var(--line);padding:6px}.shots img{width:100%;display:block}figcaption{color:var(--mut);font-size:12px;margin-top:4px}code{color:var(--acc)}
</style></head><body><h1>NGC-1980 VR benchmark</h1><div style="color:var(--mut)">${esc(R.env.runId)} · ${esc(R.env.gpu || '')} · framebuffer ${esc(R.env.framebuffer)} · ${R.aborted ? 'ABORTED: ' + esc(R.aborted) : 'complete'}</div>
<h2>Findings</h2><ul class="v">${R.verdicts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
<h2>Views</h2><ol>${R.segments.map(s => `<li><code>${esc(s.id)}</code> ${esc(s.label)}${s.info ? ' · ' + esc(JSON.stringify(s.info)) : ''}${s.ok ? '' : ' · <b>NOT AS PLANNED: ' + esc(s.notes.join('; ') || s.error || '') + '</b>'}</li>`).join('')}</ol>
${table('Frame pacing (XR frame-to-frame, ms)', [['ok', (s, g) => g.ok ? 'yes' : 'NO: ' + g.notes.join('; ')], ['frames', s => s.frames], ['fps', s => s.fps], ['dt p50', s => s.dt.p50], ['dt p95', s => s.dt.p95], ['dt p99', s => s.dt.p99], ['dt max', s => s.dt.max], ['% > 8.3', s => s.over8], ['% > 11.1', s => s.over11], ['% > 13.9', s => s.over14], ['% > 16.7', s => s.over17], ['% > 33.3', s => s.over33], ['callback start − frame time p50', s => s.callbackLag.p50]])}
${table('Cost per frame (ms, p50 / p95)', [['CPU sim', s => `${p(s.cpu.sim)} / ${p(s.cpu.sim, 'p95')}`], ['CPU prep', s => `${p(s.cpu.prep)} / ${p(s.cpu.prep, 'p95')}`], ['CPU render submit', s => `${p(s.cpu.render)} / ${p(s.cpu.render, 'p95')}`], ['CPU total', s => `${p(s.cpu.total)} / ${p(s.cpu.total, 'p95')}`], ['GPU', s => s.gpu?.n ? `${p(s.gpu)} / ${p(s.gpu, 'p95')} (n ${s.gpu.n})` : 'n/a'], ['draw calls', s => `${p(s.drawCalls)} / ${s.drawCalls.max}`], ['triangles', s => `${p(s.triangles)} / ${s.triangles.max}`], ['programs', s => s.programs], ['textures', s => s.memory.textures], ['geometries', s => s.memory.geometries], ['heap MB', s => `${s.heapMB.start} → ${s.heapMB.end}`], ['long tasks', s => `${s.longTasks.count} (${s.longTasks.ms} ms)`]])}
${table('VR panel (HUD)', [['paints', s => s.panel.paints], ['html2canvas captures', s => s.panel.captures], ['last capture ms', s => s.panel.lastCaptureMs], ['paint sync ms p50/max', s => `${s.panel.paintSyncMs.p50} / ${s.panel.paintSyncMs.max}`], ['dt on paint frames', s => s.panel.dtOnPaintFrames], ['dt other frames', s => s.panel.dtOtherFrames], ['render on paint frames', s => s.panel.renderOnPaintFrames], ['render other frames', s => s.panel.renderOtherFrames], ['canvas', s => s.panel.canvas]])}
${table('Audio probe (game master bus)', [['RMS dBFS', s => s.audio.rmsDb], ['peak dBFS', s => s.audio.peakDb], ['probes', s => s.audio.probes], ['state', s => s.audio.state], ['clock rate', s => s.audio.clockRate], ['sample rate', s => s.audio.sampleRate], ['base/output latency ms', s => `${s.audio.baseLatency} / ${s.audio.outputLatency}`], ['sink', s => s.audio.sinkId], ['master gain', s => s.audio.masterGain]])}
<h2>What the headset showed</h2><p style="color:var(--mut)">Per view: the left eye re-rendered at reduced size with its projection and pose; the raw XR framebuffer where the browser allowed reading it; the spatial panel texture (over the dark VR room colour).</p>
${segs.map(s => `<h3>${esc(s.label)}</h3><div class="shots">${[['eye', 'left eye (re-rendered)'], ['eyeFramebuffer', 'left eye (XR framebuffer ' + (s.images?.framebufferSize || '') + ')'], ['panel', 'VR panel texture ' + s.summary.panel.canvas]].filter(([k]) => s.images?.[k] && img[s.images[k]]).map(([k, t]) => `<figure><img alt="${esc(t)}" src="${img[s.images[k]]}"><figcaption>${esc(t)}</figcaption></figure>`).join('')}</div>${s.images?.errors?.length ? `<p style="color:var(--mut)">${esc(s.images.errors.join('; '))}</p>` : ''}`).join('')}
<h2>Environment</h2><div class="w"><table>${Object.entries(R.env).map(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : v)).join('')}</table></div>
<h2>Events</h2><ul>${(R.events.length ? R.events : ['none']).map(e => `<li><code>${esc(e)}</code></li>`).join('')}</ul></body></html>`;
  }
  async function finish(aborted = '') {
    if (S.finishing) return; S.finishing = true; if (S.phase === 'running') S.phase = 'saving';
    let R = { env: {}, aborted, verdicts: [] };
    try {
      if (cur && cur.measuring) endMeasure();
      P.update = paintOrig; renderer.info.autoReset = true; G.bench = !!S.wasBench; hover = null; if (d.JP.autopilot) d.JP.autopilot = null;
      if (S.env && S.audioOutputs) S.env.audioOutputs = S.audioOutputs;
      R = { schema: 1, env: S.env || env(), aborted: aborted || null, events: S.events, segments: S.segments.map(s => ({ ...s, audio: undefined })) };
      R.verdicts = verdicts(R); S.report = R;
      await Promise.all(S.pending);   // PNG encodes and uploads still under way
      const img = {}; for (const [k, b] of Object.entries(S.files)) if (b instanceof Blob) img[k] = await dataOf(b);
      await upload('report.json', new Blob([JSON.stringify(R, null, 1)], { type: 'application/json' }));
      const page = html(R, img); S.html = page;
      await upload('report.html', new Blob([page], { type: 'text/html' }));
    } catch (e) { S.error = e.message; S.uploadErrors.push('report: ' + e.message); console.warn('xrbench report failed', e); }
    S.phase = 'done'; window.__xrlog?.('XRBENCH done ' + runId + ' uploads ' + S.uploads.length + ' errors ' + S.uploadErrors.join(' | '));
    while (XR.active) await new Promise(r => setTimeout(r, 200));   // the headset shows BENCHMARK DONE until the session closes
    try { d.commander.close(); if (G.state === 'play') d.openMenu(); } catch (e) {}   // leave the game paused, not a Huey drifting off its hover
    desktopResult(R); S.done = true;
  }
  function desktopResult(R) {
    const box = document.createElement('div'); box.id = 'xrbenchResult';
    box.style.cssText = 'position:fixed;left:50%;top:8%;transform:translateX(-50%);z-index:200;max-width:min(92vw,900px);max-height:84vh;overflow:auto;background:#061924f2;border:1px solid #8ff;padding:14px;font:13px Consolas,monospace;color:#cfe;pointer-events:auto';
    const ok = !S.uploadErrors.length;
    box.innerHTML = `<b style="color:#fff;font-size:16px">VR BENCHMARK ${R.aborted ? 'STOPPED' : 'DONE'}</b><br>${ok ? `Saved to tools/runs/xrbench-${esc(runId)}/ (report.html, report.json, PNGs)` : 'Could not save to the server (' + esc(S.uploadErrors[0]) + '): use SAVE REPORT.'}<ul>${R.verdicts.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
    const save = document.createElement('button'); save.textContent = 'SAVE REPORT'; save.style.cssText = 'font:13px Consolas;margin-right:8px';
    save.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([S.html || JSON.stringify(R, null, 1)], { type: "text/html" })); a.download = `xrbench-${runId}.html`; a.click(); };
    const close = document.createElement('button'); close.textContent = 'CLOSE'; close.style.cssText = 'font:13px Consolas'; close.onclick = () => box.remove();
    box.append(save, close); document.body.appendChild(box);
  }

  // ---------------------------------------------------------------- frame hooks (main.js frame())
  let segIdx = -1, segT = 0, closeT = 0, closed = false;
  const api = { state: S,
    frameStart() {   // first thing in frame(): the GPU timer, per-frame renderer counters, the hover hold
      if (!XR.active || (S.phase !== 'waiting' && S.phase !== 'running')) return;
      renderer.info.autoReset = false; renderer.info.reset();
      if (gpuExt && cur && !gpuActive && S.phase === 'running') { const g = { q: gl.createQuery(), seg: cur.measuring ? cur : null }; gl.beginQuery(gpuExt.TIME_ELAPSED_EXT, g.q); gpuActive = g; }
      if (hover && G.craft === 'heli') d.HI.setCollective(Math.max(.2, Math.min(.75, .45 + (hover.y - d.H.pos.y) * .02 - d.H.vel.y * .04)));
    },
    frameEnd(now, now0, t1, t2, t3, frame) {   // last thing in frame(): after the render submit
      if (gpuActive) { gl.endQuery(gpuExt.TIME_ELAPSED_EXT); gpuPending.push(gpuActive); gpuActive = null; }
      pollGpu();
      const wall = performance.now();
      if (!XR.active) { if (S.phase === 'running') finish('the VR session ended before the tour finished'); return; }
      if (S.phase === 'saving' || S.phase === 'done') { if (!closed && wall > closeT) { closed = true; XR.end(); } return; }
      if (S.phase === 'waiting') {
        if (G.state !== 'play' || XR.state.frames < 30) { lastNow = now; return; }
        S.phase = 'running'; S.wasBench = G.bench; G.bench = true; S.env = env(); segIdx = 0;
        navigator.mediaDevices?.enumerateDevices?.().then(l => { S.audioOutputs = l.filter(x => x.kind === 'audiooutput').map(x => x.label || '(label hidden)'); }).catch(() => {}); segT = wall; startSegment(0); lastNow = now;
        return;
      }
      if (G.state === 'paused' && XR.state.tracking) { cur.notes.push('game paused by the session (dashboard / blur?), resumed'); S.events.push(`${cur.id}: game paused by the session, resumed`); d.closeMenu(); }
      const el = (wall - segT) / 1000;
      if (!cur.measuring && el >= settle) beginMeasure();
      else if (cur.measuring) {
        const dt = now - lastNow;
        cur.dt.push(dt); cur.wall.push(wall - (cur.lastWall || wall)); cur.lag.push(now0 - now);
        cur.sim.push(t1 - now0); cur.prep.push(t2 - t1); cur.render.push(t3 - t2); cur.cpu.push(t3 - now0);
        cur.calls.push(renderer.info.render.calls); cur.tris.push(renderer.info.render.triangles);
        if (painted) { cur.paintDt.push(dt); cur.paintRender.push(t3 - t2); cur.paintMs.push(panelPaintMs); } else { cur.plainDt.push(dt); cur.plainRender.push(t3 - t2); }
        const hp = heap(); if (hp > cur.heapMax) cur.heapMax = hp;
        audioProbe();
        if (el >= segSeconds) {
          endMeasure(); capture(frame); segIdx++;
          if (segIdx < TOUR.length) { segT = wall; startSegment(segIdx); }
          else {
            S.phase = 'saving'; closeT = wall + 4500;
            d.commander.close(); d.say('BENCHMARK DONE  -  SAVING THE REPORT, LEAVING VR', 6); try { d.sfx.blip(660, 990, .35, 'sine', .2); } catch (e) {}
            finish('');
          }
        }
      }
      if (!analyser) audioProbe();
      if (cur) cur.lastWall = wall; lastNow = now; painted = false;
    },
  };
  return api;
}
