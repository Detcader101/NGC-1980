#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { digest, escapeHTML as esc, safeArtifact, slug, stamp } from './evidence.mjs';

const num = n => Number.isFinite(n) ? n.toFixed(1) : '—';
const paras = value => (Array.isArray(value) ? value : [value]).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
const list = items => (items || []).length ? `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

function sparkline(rows) {
  if (!rows?.length) return '';
  const values = rows.map(r => r.ms), max = Math.max(1, ...values);
  const points = values.map((v, i) => `${(i / Math.max(1, values.length - 1) * 700).toFixed(1)},${(90 - v / max * 85).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 700 100" role="img" aria-label="Rendered frame intervals in order; peak ${esc(num(max))} milliseconds"><path d="M0 90H700" stroke="#42576a"/><polyline points="${points}" fill="none" stroke="#76d4be" stroke-width="2"/></svg><p class="small">${values.length} observed intervals · peak ${num(max)} ms · left to right is sample order</p>`;
}

export function buildDevlog({ notes, runs: inputs, out }) {
  if (!notes?.title || !notes.summary || !Array.isArray(notes.changes) || !notes.changes.length) throw new Error('Notes require title, summary and changes[]');
  if (!inputs?.length) throw new Error('At least one --run ID=DIR is required');
  if (new Set(inputs.map(r => r.id)).size !== inputs.length) throw new Error('Run IDs must be unique');
  if (fs.existsSync(out) && fs.readdirSync(out).length) throw new Error('Output directory is not empty; use a new --out');
  const runs = inputs.map(({ id, dir }) => {
    dir = path.resolve(dir);
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'));
    if (typeof data.ok !== 'boolean' || !Array.isArray(data.expects) || !Array.isArray(data.shots)) throw new Error('Invalid run result: ' + id);
    const benchFile = path.join(dir, 'benchmark.json');
    return { id, dir, data, comparison: fs.existsSync(benchFile) ? JSON.parse(fs.readFileSync(benchFile, 'utf8')).comparison : null };
  });
  const resolved = notes.changes.map(change => {
    if (!change.title || !change.change || !change.observed) throw new Error('Each change needs title, change and observed');
    return { ...change, media: (change.media || []).map(item => {
      const run = runs.find(r => r.id === item.run);
      if (!run) throw new Error('Unknown evidence run: ' + item.run);
      if (!!item.shot === !!item.clip) throw new Error('Media needs exactly one shot or clip name');
      const asset = (item.shot ? run.data.shots : run.data.clips || []).find(a => a.name === (item.shot || item.clip));
      if (!asset) throw new Error(`Missing evidence ${item.shot || item.clip} in ${item.run}`);
      const files = [asset.file, ...(item.clip ? [asset.contact, asset.poster] : [])];
      for (const file of files) safeArtifact(run.dir, file);
      return { ...item, run, asset };
    }) };
  });
  fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(out, 'data'), { recursive: true });
  const artifacts = new Map();
  const save = (file, buffer) => {
    fs.writeFileSync(path.join(out, file), buffer);
    artifacts.set(file, { file, bytes: buffer.length, sha256: digest(buffer) });
    return file;
  };
  const copy = (run, relative) => {
    const data = fs.readFileSync(safeArtifact(run.dir, relative));
    const file = `assets/${digest(data).slice(0, 12)}-${slug(path.basename(relative))}`;
    if (!artifacts.has(file)) save(file, data);
    return file;
  };
  for (const run of runs) {
    run.link = save(`data/${slug(run.id)}-${digest(run.id).slice(0, 6)}-result.json`, Buffer.from(JSON.stringify(run.data, null, 2)));
    if (fs.existsSync(path.join(run.dir, 'benchmark.json'))) run.benchLink = save(`data/${slug(run.id)}-${digest(run.id).slice(0, 6)}-benchmark.json`, fs.readFileSync(path.join(run.dir, 'benchmark.json')));
  }
  save('data/notes.json', Buffer.from(JSON.stringify(notes, null, 2)));
  const total = runs.reduce((s, { data: r }) => ({ passed: s.passed + r.expects.filter(e => e.ok).length,
    failed: s.failed + r.expects.filter(e => !e.ok).length, errors: s.errors + (r.errors || []).length + (r.consoleErrors || []).length }), { passed: 0, failed: 0, errors: 0 });
  const passing = runs.every(r => r.data.ok);
  const mediaHTML = item => {
    const { asset, run } = item, src = copy(run, asset.file);
    const caption = `<figcaption><strong>${esc(item.label || asset.name)}</strong><span>${esc(item.caption || '')}</span><span class="small">Run ${esc(run.id)} · ${item.reviewed === true ? 'Visually reviewed' : 'Visual review pending'}</span></figcaption>`;
    if (!item.clip) return `<figure><a href="${esc(src)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(src)}" alt="${esc(item.caption || asset.name)}"></a>${caption}</figure>`;
    const poster = copy(run, asset.poster), contact = copy(run, asset.contact);
    return `<figure class="clip"><video controls preload="metadata" playsinline poster="${esc(poster)}" src="${esc(src)}" aria-label="${esc(item.caption || asset.name)}"></video>${caption}<p class="small">${num(asset.durationSeconds)} s encoded / ${num(asset.requestedDurationMs / 1000)} s capture window · silent · ${esc(asset.width)}×${esc(asset.height)} · capture affects playback speed</p><details><summary>Inspect decoded clip frames</summary><a href="${esc(contact)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(contact)}" alt="Beginning, middle and end of ${esc(asset.name)}"></a></details></figure>`;
  };
  const changes = resolved.map((c, i) => `<section class="change" id="change-${i + 1}"><div class="section-label">CHANGE ${String(i + 1).padStart(2, '0')}</div><h2>${esc(c.title)}</h2>${paras(c.change)}<div class="observation"><h3>What the evidence shows</h3>${paras(c.observed)}${list(c.checks)}</div>${c.limitations?.length ? `<div class="limits"><h3>Limits of this check</h3>${list(c.limitations)}</div>` : ''}<div class="gallery">${c.media.map(mediaHTML).join('')}</div></section>`).join('');
  const compactPanel = (html, label, ok) => runs.length <= 8 ? html : `<details class="unit-detail"${ok ? '' : ' open'}><summary>${esc(label)}</summary>${html}</details>`;
  const benchmarks = runs.map(({ id, data: r, comparison, benchLink, link }) => {
    if (!r.benchmarks?.length) return '';
    const rows = r.benchmarks.map(b => {
      const s = b.summary;
      return `<tr><th>${esc(b.name)}</th><td>${esc(s.samples)}</td><td>${num(s.frameMs.mean)}</td><td>${num(s.frameMs.p50)}</td><td>${num(s.frameMs.p95)}</td><td>${num(s.observedFps)}</td><td>${num(s.drawCalls?.p50)}</td></tr>`;
    }).join('');
    return `<article class="run"><h3>${esc(id)} / ${esc(r.name)}</h3><div class="table-scroll"><table><thead><tr><th>Case</th><th>Samples</th><th>Mean ms</th><th>Median ms</th><th>p95 ms</th><th>Observed fps</th><th>Draws p50</th></tr></thead><tbody>${rows}</tbody></table></div>${r.benchmarks.map(b => `<details><summary>${esc(b.name)} frame-time trace</summary>${sparkline(b.rows)}<p class="small">CPU medians: simulation ${num(b.summary.cpuMs.sim?.p50)} ms · preparation ${num(b.summary.cpuMs.prep?.p50)} ms · render submission ${num(b.summary.cpuMs.renderSubmit?.p50)} ms. These are smoothed CPU phases, not GPU timings.</p></details>`).join('')}${comparison ? `<h4>Baseline comparison</h4>${paras(comparison.qualification)}${list(comparison.rows.map(c => c.comparable ? `${c.name}: mean ${num(c.beforeMeanMs)} → ${num(c.afterMeanMs)} ms (${num(c.meanChangePercent)}%); p95 ${num(c.beforeP95Ms)} → ${num(c.afterP95Ms)} ms.` : `${c.name}: not comparable (${c.reasons.join(', ')}).`))}` : '<p class="small">No matching baseline supplied; no improvement claim is made.</p>'}<a href="${esc(benchLink || link)}">Raw benchmark data</a></article>`;
  }).map((html, i) => html ? compactPanel(html, `${runs[i].id} — ${(runs[i].data.benchmarks || []).map(b => `${num(b.summary.frameMs.mean)} ms mean / ${num(b.summary.frameMs.p95)} ms p95`).join('; ')}`, runs[i].data.ok) : '').join('');
  const runDetails = runs.map(({ id, data: r, link }) => `<article class="run ${r.ok ? '' : 'failed'}"><h3><span class="badge ${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}</span> ${esc(id)}</h3><dl><dt>Scene / started</dt><dd>${esc(r.name)} / ${esc(r.startedAt)}</dd><dt>Source</dt><dd>${esc(r.source?.commit || 'Unknown legacy source')} ${r.source?.dirty ? '(working tree dirty)' : ''}</dd><dt>Game content SHA-256</dt><dd>${esc(r.source?.gameSha256 || 'Not recorded')}</dd><dt>Server provenance</dt><dd>${esc(r.sourceQualification || 'Not recorded')} ${esc(JSON.stringify(r.servedSource || {}))}</dd><dt>Browser / renderer</dt><dd>${esc(r.browserVersion || r.browser)} / ${esc(r.gpu)}</dd><dt>Viewport / seed</dt><dd>${esc(JSON.stringify(r.viewport || {}))} / ${esc(r.seed ?? 'unseeded')}</dd><dt>Fixture query</dt><dd><code>${esc(r.query)}</code></dd><dt>Host</dt><dd>${esc(r.host ? `${r.host.platform} ${r.host.release} · ${r.host.cpu}` : 'Not recorded')}</dd></dl>${list([...(r.errors || []), ...(r.consoleErrors || [])])}<details><summary>Assertions (${r.expects.filter(e => e.ok).length}/${r.expects.length} passed)</summary><ul class="checks">${r.expects.map(e => `<li class="${e.ok ? '' : 'bad'}">${e.ok ? '✓' : '✗'} ${esc(e.label || e.msg || e.expr)}${e.error ? ' — ' + esc(e.error) : ''}</li>`).join('')}</ul></details><a href="${esc(link)}">Full run result</a></article>`).map((html, i) => compactPanel(html, `${runs[i].data.ok ? 'PASS' : 'FAIL'} · ${runs[i].id} · ${runs[i].data.expects.filter(e => e.ok).length}/${runs[i].data.expects.length} checks`, runs[i].data.ok)).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; media-src 'self' data:; style-src 'unsafe-inline'"><title>${esc(notes.title)}</title>
<style>
:root{color-scheme:dark;--bg:#10181e;--panel:#17232c;--line:#324550;--ink:#e4edf1;--muted:#a1b5c0;--accent:#76d4be;--amber:#efb46c}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,sans-serif}a{color:var(--accent);text-underline-offset:4px}a:hover{color:#c7ffef}header,main,footer{max-width:1160px;margin:auto;padding:36px 32px}header{padding-top:60px;border-bottom:1px solid var(--line)}.eyebrow,.section-label{font:12px/1.5 ui-monospace,monospace;letter-spacing:.13em;color:var(--amber)}h1{font-size:clamp(30px,5vw,58px);line-height:1.08;max-width:850px;margin:16px 0 24px;letter-spacing:-.035em}h2{font-size:29px;line-height:1.2;margin:10px 0 18px}h3{font-size:17px;margin:0 0 10px}h4{margin-bottom:8px}p{max-width:920px;margin:10px 0 18px}.intro{font-size:20px;color:#c5d6df;max-width:900px}.pills{display:flex;gap:10px;flex-wrap:wrap;margin:26px 0}.pill,.badge{border:1px solid var(--line);padding:5px 12px;border-radius:5px;font:13px/1.5 ui-monospace,monospace}.pass{color:var(--accent)}.fail,.bad{color:#ffad9f}.fail{border-color:#a4594c}.toc{display:flex;flex-wrap:wrap;gap:12px 22px;font-size:14px}.change{padding:38px 0;border-bottom:1px solid var(--line);scroll-margin-top:20px}.observation{border-left:3px solid var(--accent);padding:12px 20px;margin:24px 0;background:#14252a}.limits{border-left:3px solid var(--amber);padding:12px 20px;margin:20px 0;background:#27251e}.limits h3{color:var(--amber)}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin-top:28px}figure{margin:0;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:8px}figure img,video{display:block;width:100%;height:auto;background:#080c0f}video{aspect-ratio:16/9}figcaption{display:flex;flex-direction:column;gap:6px;padding:16px 18px}figcaption span{font-size:14px;color:#c6d6df}.small{font-size:12px;color:var(--muted);overflow-wrap:anywhere}figure>p,figure>details{margin:0 18px 16px}details{padding:10px 0}summary{cursor:pointer;color:var(--accent);font-size:14px}details img{margin-top:12px}.run{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:24px;margin:24px 0}.run.failed{border-color:#a4594c}.unit-detail{border-bottom:1px solid var(--line);padding:14px 0}.unit-detail>summary{overflow-wrap:anywhere}.table-scroll{overflow:auto}table{border-collapse:collapse;width:100%;font:13px/1.6 ui-monospace,monospace;white-space:nowrap}td,th{text-align:right;padding:12px;border-bottom:1px solid var(--line)}th:first-child{text-align:left}thead{color:var(--muted)}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px 18px;font-size:12px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.checks{font:13px/1.7 ui-monospace,monospace;overflow-wrap:anywhere;list-style:none;padding:0}.checks li{margin:8px 0}.spark{display:block;width:100%;max-height:150px;margin-top:12px}footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px}section#benchmarks,section#runs,section#remaining{padding-top:40px}li{margin:5px 0}@media(max-width:700px){header,main,footer{padding:28px 18px}.gallery{grid-template-columns:1fr}dl{grid-template-columns:1fr;gap:3px}dd{margin-bottom:12px}.run{padding:16px}h2{font-size:25px}}@media print{body{background:white;color:#111}.run,figure,.observation,.limits{background:#fff;color:#111;break-inside:avoid}a{color:#056}video{display:none}header,main,footer{padding:20px}.gallery{grid-template-columns:1fr 1fr}}
</style></head><body><header><div class="eyebrow">NGC-1980 / DEVELOPMENT RECORD · ${esc(notes.date || new Date().toISOString().slice(0, 10))}</div><h1>${esc(notes.title)}</h1><div class="intro">${paras(notes.summary)}</div><div class="pills"><span class="pill ${passing ? 'pass' : 'fail'}">${passing ? 'ALL INCLUDED RUNS PASSED' : 'FAILURES INCLUDED'}</span><span class="pill">${total.passed} assertions passed / ${total.failed} failed</span><span class="pill">${total.errors} recorded errors</span><span class="pill">${runs.length} evidence runs</span></div><nav class="toc" aria-label="Contents">${resolved.map((c, i) => `<a href="#change-${i + 1}">${esc(c.title)}</a>`).join('')}<a href="#benchmarks">Benchmarks</a><a href="#runs">Reproduce &amp; inspect</a><a href="#remaining">Remaining work</a></nav></header><main>${changes}<section id="benchmarks"><div class="section-label">PERFORMANCE EVIDENCE</div><h2>Measured without recording</h2><p>Frame times describe the recorded host and fixture. Software rendering, emulator results and a short sample do not certify consumer GPU or headset performance. Observed fps is 1000 / mean interval; video encoding rate is unrelated.</p>${benchmarks || '<p>No structured frame benchmark was included.</p>'}</section><section id="runs"><div class="section-label">PROVENANCE &amp; CHECKS</div><h2>Reproduce and inspect</h2>${paras(notes.reproduce)}${runDetails}</section><section id="remaining"><div class="section-label">OPEN ITEMS</div><h2>Remaining work and limits</h2>${list(notes.limitations || ['No additional limits supplied by the report author; review each run before drawing broader conclusions.'])}</section></main><footer>Generated from local evidence. “Visually reviewed” is an author-supplied observation, not an automatic test result. Clips are silent; captured playback includes recording overhead. This report works offline with its assets and data folders. <a href="data/notes.json">Editorial notes</a> · <a href="manifest.json">Artifact hashes</a></footer></body></html>`;
  save('devlog.html', Buffer.from(html));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ schemaVersion: 1, title: notes.title,
    createdAt: new Date().toISOString(), artifacts: [...artifacts.values()] }, null, 2));
  return { file: path.join(out, 'devlog.html'), artifacts: artifacts.size, passing, assertions: total };
}

function main() {
  const args = process.argv.slice(2), runs = []; let notesFile, out;
  for (let i = 0; i < args.length; i++) {
    const a = args[i], next = () => { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + a); return args[++i]; };
    if (a === '--notes') notesFile = next();
    else if (a === '--out') out = next();
    else if (a === '--run') { const v = next(), at = v.indexOf('='); if (at < 1) throw new Error('--run requires ID=DIR'); runs.push({ id: v.slice(0, at), dir: v.slice(at + 1) }); }
    else if (a === '--help' || a === '-h') {
      console.log('node tools/devlog.mjs --notes notes.json --run after=RUN_DIR [--run before=RUN_DIR] [--out DIR]\nCreates devlog.html + copied assets/data for offline viewing. Output must be new/empty.\nNotes schema and examples: skills/devlog/references/workflow.md'); return;
    } else throw new Error('Unknown argument: ' + a);
  }
  if (!notesFile) throw new Error('--notes is required: explain what changed, what was observed and the limits');
  out = path.resolve(out || path.join(path.dirname(fileURLToPath(import.meta.url)), 'runs', stamp() + '-devlog'));
  console.log(JSON.stringify(buildDevlog({ notes: JSON.parse(fs.readFileSync(notesFile, 'utf8')), runs, out }), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
