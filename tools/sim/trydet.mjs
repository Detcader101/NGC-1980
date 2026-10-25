// dev: determinism - the same seed twice in one process (with another war in between) gives the same war
import { runWar } from './headless.mjs';
import crypto from 'node:crypto';
const T = +(process.argv[2] || 400);
const h = r => crypto.createHash('sha1').update(JSON.stringify({ s: r.samples, d: r.decisions, b: r.built, l: r.lost, n: r.rngCalls })).digest('hex').slice(0, 12);
const a = await runWar({ blue: 'BALANCED', red: 'DEFAULT', tmax: T, seed: 11, patch: ['catlane'] });
const b = await runWar({ blue: 'RUSH', red: 'SWARM', tmax: T, seed: 12, patch: ['catlane'] });
const c = await runWar({ blue: 'BALANCED', red: 'DEFAULT', tmax: T, seed: 11, patch: ['catlane'] });
console.log('seed 11 first', h(a), a.rngCalls, ' other', h(b), ' seed 11 again', h(c), c.rngCalls, h(a) === h(c) ? 'SAME' : 'DIFFERENT');
if (h(a) !== h(c)) { for (let i = 0; i < a.samples.length; i++) if (JSON.stringify(a.samples[i]) !== JSON.stringify(c.samples[i])) { console.log('first diff at sample', i, JSON.stringify(a.samples[i]), JSON.stringify(c.samples[i])); break; } }
process.exit(0);
