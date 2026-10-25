// dev: one war, verbose.  node tools/sim/try.mjs [blue] [red] [tmax] [seed] [tech]
globalThis.__simStack = !!process.env.STACK;
import { runWar } from './headless.mjs';
const [blue = 'BALANCED', red = 'DEFAULT', tmax = 900, seed = 1, tech = 'all'] = process.argv.slice(2);
const quiet = process.env.QUIET;
const r = await runWar({ blue, red, tmax: +tmax, seed: +seed, tech, dt: 1 / +(process.env.HZ || 30), patch: process.env.NOPATCH ? [] : ['catlane'], feed: quiet ? undefined : (t) => console.log('  feed', t) });
for (const d of r.decisions) if (!quiet) console.log(`${String(d.t).padStart(6)} ${d.side === 1 ? 'BLUE' : 'RED '} ${d.what}`);
for (const s of r.samples.filter((s, i) => i % 12 === 0)) console.log(`t ${String(s.t).padStart(5)} own ${s.own.join('/')} str ${s.s1}/${s.s2} mat ${s.m1}/${s.m2} carrier ${s.c1}/${s.c2} ground ${s.g1}/${s.g2} air ${s.a1}/${s.a2}`);
const { samples, decisions, minutes, owner, ...rest } = r;
console.log(JSON.stringify(rest, null, 1));
process.exit(0);
