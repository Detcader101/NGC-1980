// ?bench (the desktop benchmark, game/js/perf/bench.js) end to end against a real tools/serve.mjs: the tour, the
// reload per RenderKit area, the report on disk. BENCH_Q picks the run (default: 2 s views, two areas: post + light).
//   CHROME_PATH=... node tools/snap.mjs tools/scenes/perfbench.mjs
//   BENCH_Q='bench=quick' ... (one pass, all on)   BENCH_VIEWS=foot-home,huey30 (a subset)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = process.env.BENCH_Q || 'bench=2&benchareas=post,light';
const VIEWS = process.env.BENCH_VIEWS || '', EXTRA = process.env.BENCH_EXTRA || '';
export default { name: 'perfbench' + (process.env.BENCH_TAG ? '-' + process.env.BENCH_TAG : ''), query: '?res=0.5', run: async h => {
  const srv = spawn(process.execPath, [path.join(TOOLS, 'serve.mjs'), '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const base = await new Promise((res, rej) => { srv.stdout.on('data', b => { const m = String(b).match(/(http:\/\/[^ ]+\/)/); if (m) res(m[1]); }); srv.on('exit', () => rej(Error('serve.mjs exited'))); setTimeout(() => rej(Error('serve.mjs did not start')), 15000); });
    h.log('server', 'tools/serve.mjs at ' + base);
    await h.goto(`${base}?${Q}&res=0.5${VIEWS ? '&benchviews=' + VIEWS : ''}${EXTRA ? '&' + EXTRA : ''}`);
    const t0 = Date.now(); let seen = '', runId = null;
    while (Date.now() - t0 < 3600000) {
      const st = await h.page.evaluate(() => window.__bench ? ({ run: __bench.runId, cfg: __bench.config.id, seg: __bench.seg, id: __bench.segments.at(-1)?.id, m: __bench.segments.at(-1)?.measuring, done: __bench.done, phase: __bench.phase }) : null).catch(() => null);
      if (st?.run) runId = st.run;
      if (st?.done) break;
      const k = st ? `${st.cfg}/${st.id}` : '';
      if (st && st.m && k !== seen && st.cfg === 'all') { seen = k; await h.shot(`view-${st.seg + 1}-${st.id}`); }
      await new Promise(r => setTimeout(r, 500));
    }
    await h.expect('!!window.__bench && __bench.done', 'the benchmark finished');
    await h.shot('result');
    const R = await h.page.evaluate(() => ({ run: __bench.runId, err: __bench.uploadError || '', verdicts: __bench.report.verdicts, areas: __bench.report.areas, segs: __bench.report.results.all.segments.map(s => ({ id: s.id, ok: s.ok, notes: s.notes, info: s.info, ...s.summary && { calls: s.summary.drawCalls.p50, tris: s.summary.triangles.p50, shadow: s.summary.shadowCalls.p50, uncapped: s.summary.uncapped.p50, cpu: s.summary.cpu.total.p50, programs: s.summary.programs } })) }));
    h.log('note', JSON.stringify(R, null, 1));
    await h.expect(String(!R.err), 'report uploaded ' + R.err);
    const dir = path.join(TOOLS, 'runs', 'bench-' + R.run);
    await h.expect(String(fs.existsSync(path.join(dir, 'report.html')) && fs.existsSync(path.join(dir, 'report.json'))), 'report.html and report.json on disk in ' + dir);
    await h.expect(String(R.segs.every(s => s.ok)), 'every view in its intended craft: ' + R.segs.filter(s => !s.ok).map(s => s.id + ' ' + s.notes.join(';')).join(' | '));
  } finally { srv.kill(); }
}};
