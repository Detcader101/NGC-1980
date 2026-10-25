// re-read a warsim run folder (runs.jsonl + config.json) and write summary.json / report.md again with the current
// report rules:   node tools/sim/reaggregate.mjs tools/runs/sim/<folder>
import fs from 'node:fs';
import path from 'node:path';
import { aggregate, renderReport, deadBranches } from './report.mjs';
import { TECH } from '../../game/js/techtree.js';
const dir = process.argv[2];
const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
const recs = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const old = fs.existsSync(path.join(dir, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')).meta : {};
const simSec = recs.reduce((s, r) => s + (r.time || 0), 0);
const S = aggregate(recs, { blues: cfg.blues, reds: cfg.reds, sweep: cfg.sweep, tmax: cfg.base.tmax, wall: old.wall || 1, simSec, workers: old.workers || 3, base: cfg.base });
S.techNever = deadBranches(recs, cfg.base, TECH);
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(S, null, 1));
fs.writeFileSync(path.join(dir, 'report.md'), renderReport(S));
console.log(`${recs.length} wars re-aggregated -> ${path.join(dir, 'report.md')}`);
