// Shared evidence formats. No browser or game dependency: also used by the report builder.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const slug = value => String(value).replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'evidence';
export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function sourceInfo(root) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  try {
    const files = [...new Set(git('ls-files', '-co', '--exclude-standard', '-z', 'game').split('\0').filter(Boolean))].sort();
    const hash = createHash('sha256');
    for (const file of files) {
      hash.update(file + '\0');
      hash.update(fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file)) : '<deleted>');
      hash.update('\0');
    }
    const status = git('status', '--porcelain');
    return { root, commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'),
      gameTree: git('rev-parse', 'HEAD:game'), gameSha256: hash.digest('hex'), dirty: !!status, status };
  } catch (e) { return { root, unknown: true, error: e.message }; }
}
export function hostInfo() {
  return { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length, memoryGiB: +(os.totalmem() / 2 ** 30).toFixed(1), node: process.version };
}
export function statistics(values) {
  if (!values.length || values.some(x => !Number.isFinite(x) || x < 0)) throw new Error('Statistics need finite nonnegative samples');
  const sorted = [...values].sort((a, b) => a - b);
  const at = p => sorted[Math.floor((sorted.length - 1) * p)];
  return { count: sorted.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: at(.5), p95: at(.95), p99: at(.99), min: sorted[0], max: sorted.at(-1) };
}
export function summarizeFrames(rows) {
  const frameMs = statistics(rows.map(r => r.ms));
  const column = key => rows.map(r => r[key]).filter(Number.isFinite);
  const metric = key => column(key).length ? statistics(column(key)) : null;
  return { samples: rows.length, frameMs, observedFps: frameMs.mean ? 1000 / frameMs.mean : null,
    cpuMs: { sim: metric('sim'), prep: metric('prep'), renderSubmit: metric('render') },
    drawCalls: metric('calls'), triangles: metric('triangles'), textures: metric('textures'), geometries: metric('geometries') };
}
// A code change is the independent variable; renderer, fixture and sample policy must match.
export function compareRuns(before, after) {
  const keys = ['name', 'sceneSha256', 'query', 'seed', 'viewport', 'rendererMode', 'browserVersion', 'gpu', 'host'];
  const mismatch = keys.filter(k => before[k] === undefined || after[k] === undefined || JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  if (before.seed == null || after.seed == null) mismatch.push('unseeded fixture');
  const rows = (after.benchmarks || []).map(current => {
    const previous = (before.benchmarks || []).find(b => b.name === current.name);
    const reasons = [...mismatch];
    if (!before.ok || !after.ok) reasons.push('run failed');
    if (!previous) reasons.push('missing baseline sample');
    else if (JSON.stringify(previous.policy) !== JSON.stringify(current.policy)) reasons.push('sample policy');
    if (reasons.length) return { name: current.name, comparable: false, reasons };
    const old = previous.summary.frameMs.mean, next = current.summary.frameMs.mean;
    return { name: current.name, comparable: true, beforeMeanMs: old, afterMeanMs: next,
      meanChangePercent: old > 0 ? (next / old - 1) * 100 : null,
      beforeP95Ms: previous.summary.frameMs.p95, afterP95Ms: current.summary.frameMs.p95 };
  });
  const sameGame = before.source?.gameSha256 && before.source.gameSha256 === after.source?.gameSha256;
  return { qualification: sameGame
    ? 'Unchanged game content: this is a repeatability comparison, not evidence of an improvement. Recording is excluded.'
    : 'Single-run observations, not statistical proof. Lower frame time is better. Recording is excluded.', rows };
}
export function safeArtifact(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Artifact must be a relative file');
  const base = fs.realpathSync(root), target = fs.realpathSync(path.resolve(base, relative));
  if (!target.startsWith(base + path.sep) || !fs.statSync(target).isFile()) throw new Error('Artifact escapes its run directory: ' + relative);
  return target;
}
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
