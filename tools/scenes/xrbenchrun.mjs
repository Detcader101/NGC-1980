// ?xrbench end to end in IWER emulation: one ENTER VR click, the whole scripted tour, the report and pictures posted to a
// real tools/serve.mjs (the endpoint under test), then checked on disk. Short views (XRBENCH_SEC, default 8 s).
//   CHROME_PATH=... node tools/snap.mjs tools/scenes/xrbenchrun.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iwer = fs.readFileSync(path.join(TOOLS, 'node_modules/iwer/build/iwer.min.js'), 'utf8');
const SEC = +process.env.XRBENCH_SEC || 8;
export default { name: 'xrbenchrun', query: '?res=0.45', run: async h => {
  const srv = spawn(process.execPath, [path.join(TOOLS, 'serve.mjs'), '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const base = await new Promise((res, rej) => { srv.stdout.on('data', b => { const m = String(b).match(/(http:\/\/[^ ]+\/)/); if (m) res(m[1]); }); srv.on('exit', () => rej(Error('serve.mjs exited'))); setTimeout(() => rej(Error('serve.mjs did not start')), 15000); });
    h.log('server', 'tools/serve.mjs at ' + base);
    // the endpoint refuses requests without the header, from other origins, and bad names
    const post = (q, o = {}) => fetch(base + '__bench' + q, { method: 'POST', body: 'x', ...o }).then(r => r.status);
    await h.expect(String(await post('?run=t&name=a.png') === 403), 'POST /__bench without the X-NGC-Bench header is refused');
    await h.expect(String(await post('?run=t&name=a.png', { headers: { 'X-NGC-Bench': '1', Origin: 'http://evil.example' } }) === 403), 'cross-origin POST /__bench is refused');
    await h.expect(String(await post('?run=..&name=a.png', { headers: { 'X-NGC-Bench': '1' } }) === 400 && await post('?run=t&name=../a.png', { headers: { 'X-NGC-Bench': '1' } }) === 400 && await post('?run=t&name=a.exe', { headers: { 'X-NGC-Bench': '1' } }) === 400), 'path traversal and other file types are refused');

    await h.page.evaluateOnNewDocument(iwer + ';const c=document.createElement("div");c.dataset.xrIgnore="";c.style.pointerEvents="none";window.__xrDevice=new IWER.XRDevice(IWER.metaQuest3,{canvasContainer:c});__xrDevice.stereoEnabled=true;__xrDevice.installRuntime({forceInstall:true});');
    await h.goto(`${base}?xrbench=${SEC}&res=0.45&xrscale=0.5`);
    if (!await h.waitFor('document.querySelector("#enterVR") && !document.querySelector("#enterVR").disabled && window.__xrbench', 60000)) throw Error('emulated WebXR unavailable');
    await h.expect('/BENCHMARK/.test(document.getElementById("xrbenchNote").textContent)', 'desktop page explains the benchmark');
    await h.page.click('#enterVR');   // the one click
    const t0 = Date.now(); let seen = -1;
    while (Date.now() - t0 < 600000) {
      const st = await h.page.evaluate(() => ({ seg: __xrbench.seg, id: __xrbench.segments.at(-1)?.id, m: __xrbench.segments.at(-1)?.measuring, done: __xrbench.done })).catch(() => null);
      if (st?.done) break;
      if (st && st.m && st.seg !== seen) { seen = st.seg; await h.shot(`mirror-${seen + 1}-${st.id}`); }
      await new Promise(r => setTimeout(r, 400));
    }
    await h.expect('__xrbench.done && __xrbench.segments.length===6', 'one click ran all six views and finished');
    await h.waitFor('!document.documentElement.classList.contains("ngc-vr")', 30000);
    await h.expect('!!document.getElementById("xrbenchResult") && /DONE/.test(document.getElementById("xrbenchResult").textContent)', 'session ended cleanly and the desktop shows the result');
    await h.shot('desktop-result');
    const S = await h.page.evaluate(() => ({ runId: __xrbench.runId, uploads: __xrbench.uploads, errors: __xrbench.uploadErrors, events: __xrbench.events }));
    h.log('note', JSON.stringify(S));
    await h.expect(String(S.errors.length === 0), 'every upload accepted: ' + S.errors.join('; '));
    const dir = path.join(TOOLS, 'runs', 'xrbench-' + S.runId);
    const R = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
    for (const s of R.segments) {
      const m = s.summary;
      h.log('segment', `${s.id} ok=${s.ok} craft=${s.view?.craft} flat=${s.view?.flat} frames=${m.frames} dt p50 ${m.dt.p50} p95 ${m.dt.p95} cpu ${m.cpu.total.p50} calls ${m.drawCalls.p50} tris ${m.triangles.p50} panel paints ${m.panel.paints} captures ${m.panel.captures} audio ${m.audio.rmsDb} dB ${m.audio.state} images ${JSON.stringify(s.images)}`);
      await h.expect(String(s.ok === true), `${s.id}: in the intended craft (${s.want}) ${s.notes.join('; ')}`);
      await h.expect(String(m.frames >= 3 && m.dt.p50 > 0 && m.cpu.total.p50 > 0 && m.drawCalls.p50 > 0), `${s.id}: frame timings and renderer counters recorded`);
      for (const k of ['eye', 'panel']) await h.expect(String(!!s.images?.[k] && fs.statSync(path.join(dir, s.images[k])).size > 2000), `${s.id}: ${k} picture saved`);
    }
    await h.expect(String(R.segments.some(s => s.summary.audio.probes > 0)), 'audio probe sampled the master bus');
    await h.expect(String(R.segments.find(s => s.id === 'command-board').summary.panel.captures > 0), 'command board segment measured html2canvas panel captures');
    const html = fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
    await h.expect(String(html.includes('<table') && (html.match(/src="data:image\/png/g) || []).length >= 12), 'report.html is self-contained with tables and embedded pictures');
    h.log('note', 'report folder ' + dir);

    // Leaving VR part-way (headset off, browser exit): a partial report, game state restored, the game left paused.
    await h.goto(`${base}?debug&xrbench=${SEC}&res=0.45&xrscale=0.5`);
    await h.waitFor('window.__G?.XR.state.supported && window.__xrbench', 60000);
    await h.page.click('#enterVR');
    await h.waitFor('__xrbench.segments.length>=2 && __xrbench.segments[1].measuring', 120000);
    await h.eval('(__G.XR.end(),1)');
    await h.waitFor('__xrbench.done', 120000);
    await h.expect('__xrbench.report.aborted && __xrbench.report.segments[0].summary.frames>0 && __xrbench.uploads.includes("report.json")', 'an early exit still saves a partial report');
    await h.expect('__G.G.bench===false && __G.renderer.info.autoReset===true && !__G.JP.autopilot && __G.G.state==="paused"', 'bench state restored and the game left paused');
    await h.shot('desktop-aborted');
  } finally { srv.kill(); }
} };
