#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { statistics, summarizeFrames, compareRuns, safeArtifact, digest } from './evidence.mjs';
import { createEvidenceCapture } from './browser-evidence.mjs';
import { buildDevlog } from './devlog.mjs';

let count = 0;
const check = async (label, fn) => { await fn(); count++; console.log('PASS ' + label); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ngc-evidence-'));
try {
  await check('percentiles retain slow outliers and FPS uses the mean interval', () => {
    const summary = summarizeFrames([10, 10, 10, 970].map(ms => ({ ms })));
    assert.equal(summary.frameMs.mean, 250); assert.equal(summary.frameMs.max, 970);
    assert.equal(summary.observedFps, 4); assert.equal(summary.frameMs.p50, 10);
    assert.equal(summary.cpuMs.sim, null);
  });
  await check('empty and nonfinite timing samples are rejected', () => {
    assert.throws(() => statistics([])); assert.throws(() => statistics([NaN])); assert.throws(() => statistics([-1]));
  });
  const before = { ok: true, name: 'fixture', sceneSha256: 'scene', query: '?debug', seed: 1, viewport: { width: 1280 },
    rendererMode: 'swiftshader', browserVersion: '156', gpu: 'SwiftShader', host: { cpu: 'fixture' },
    benchmarks: [{ name: 'flight', policy: { frames: 30 }, summary: { frameMs: { mean: 20, p95: 40 } } }] };
  const after = structuredClone(before); after.benchmarks[0].summary.frameMs.mean = 10;
  await check('comparable sources report measured deltas', () => {
    assert.equal(compareRuns(before, after).rows[0].meanChangePercent, -50);
  });
  for (const key of ['viewport', 'gpu', 'sceneSha256', 'seed']) await check('comparison rejects mismatched ' + key, () => {
    const changed = { ...after, [key]: 'different' }; assert.equal(compareRuns(before, changed).rows[0].comparable, false);
  });
  await check('failed, unseeded and mismatched sample policies cannot imply an improvement', () => {
    assert.equal(compareRuns(before, { ...after, ok: false }).rows[0].comparable, false);
    assert.equal(compareRuns({ ...before, seed: null }, { ...after, seed: null }).rows[0].comparable, false);
    const different = structuredClone(after); different.benchmarks[0].policy.frames = 120;
    assert.equal(compareRuns(before, different).rows[0].comparable, false);
  });
  await check('actual buffer, preview state and XR changes invalidate a comparison', () => {
    for (const [key, value] of Object.entries({ drawingBuffer: [640, 360], host: 'preview', route: '/dev/other.html', xr: true, state: 'paused', mode: 'other', eyeViewports: [[0, 0, 500, 500]] })) {
      const changed = structuredClone(after); changed.benchmarks[0][key] = value;
      const comparison = compareRuns(before, changed).rows[0];
      assert.equal(comparison.comparable, false); assert.ok(comparison.reasons.includes('sample ' + key));
    }
  });
  await check('benchmark prevents overlapping capture and screenshots, then releases its guard', async () => {
    let finish; const page = { evaluate: () => new Promise(resolve => { finish = resolve; }) };
    const result = { benchmarks: [], clips: [] }, capture = createEvidenceCapture({ page, result, runDir: root, log() {} });
    const sampling = capture.benchmark('flight', { frames: 10 });
    await assert.rejects(capture.clip('overlap'), /during benchmark/); assert.throws(() => capture.assertIdle(), /benchmark/);
    finish({ rows: [{ ms: 20 }], xr: false }); await sampling; capture.assertIdle();
    assert.equal(result.benchmarks.length, 1);
  });
  await check('recording stops and its guard clears when a scene action throws', async () => {
    let stopped = 0;
    const page = { record: async () => ({ stop: async () => { stopped++; } }) };
    const capture = createEvidenceCapture({ page, runDir: root, result: { clips: [] }, log() {} });
    await assert.rejects(capture.clip('failure', { durationMs: 1000 }, () => { throw new Error('action failed'); }), /action failed/);
    assert.equal(stopped, 1); capture.assertIdle();
  });
  const dir = path.join(root, 'run'); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'frame.png'), 'fixture bytes');
  fs.writeFileSync(path.join(root, 'outside.txt'), 'outside');
  await check('artifact copying rejects traversal and symlink escapes', () => {
    assert.equal(safeArtifact(dir, 'frame.png'), path.join(dir, 'frame.png'));
    assert.throws(() => safeArtifact(dir, '../outside.txt'), /escapes/);
    fs.symlinkSync(path.join(root, 'outside.txt'), path.join(dir, 'escape')); assert.throws(() => safeArtifact(dir, 'escape'), /escapes/);
  });
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ name: 'failed fixture', ok: false,
    expects: [{ ok: false, label: 'input remained stuck' }], errors: ['real failure'], consoleErrors: [],
    shots: [{ name: 'frame', file: 'frame.png' }], benchmarks: [], query: '?debug' }));
  const notes = { title: '<script>alert(1)</script>', summary: 'Evidence report', changes: [{ title: 'Change', change: 'Actual change',
    observed: '<img src=x onerror=alert(1)>', media: [{ run: 'test', shot: 'frame', caption: 'Rendered moment' }] }] };
  await check('HTML escapes editorial text, preserves failures and copies independent evidence', () => {
    const out = path.join(root, 'report'); const report = buildDevlog({ notes, runs: [{ id: 'test', dir }], out });
    const html = fs.readFileSync(report.file, 'utf8');
    assert.equal(report.passing, false); assert.ok(html.includes('input remained stuck'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')); assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('Visual review pending')); assert.ok(html.includes('Unknown legacy source'));
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
    for (const artifact of manifest.artifacts) assert.equal(digest(fs.readFileSync(path.join(out, artifact.file))), artifact.sha256);
    assert.throws(() => buildDevlog({ notes, runs: [{ id: 'test', dir }], out }), /not empty/);
  });
  await check('missing media fails the report instead of silently dropping evidence', () => {
    const bad = structuredClone(notes); bad.changes[0].media[0].shot = 'missing';
    assert.throws(() => buildDevlog({ notes: bad, runs: [{ id: 'test', dir }], out: path.join(root, 'missing') }), /Missing evidence/);
  });
  await check('large unit reports collapse detail while keeping failed runs open', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: 'case' + i, dir }));
    const report = buildDevlog({ notes: { title: 'Unit catalog', summary: 'Many units', changes: [{ title: 'Units', change: 'Cases', observed: 'Failures retained', media: [] }] }, runs: many, out: path.join(root, 'many') });
    const html = fs.readFileSync(report.file, 'utf8');
    assert.ok(html.includes('<details class="unit-detail" open>'));
    assert.equal(report.passing, false); assert.ok(html.includes('input remained stuck'));
  });
  await check('ambiguous run IDs and media selectors are rejected', () => {
    assert.throws(() => buildDevlog({ notes, runs: [{ id: 'test', dir }, { id: 'test', dir }], out: path.join(root, 'duplicates') }), /unique/);
    const bad = structuredClone(notes); bad.changes[0].media[0].clip = 'frame';
    assert.throws(() => buildDevlog({ notes: bad, runs: [{ id: 'test', dir }], out: path.join(root, 'ambiguous') }), /exactly one/);
  });
  console.log(`${count}/${count} evidence checks passed`);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
