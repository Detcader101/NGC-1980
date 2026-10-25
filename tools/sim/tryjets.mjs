// dev: the strike wing through a whole war, every 10 s
import { runWar } from './headless.mjs';
const [blue = 'BALANCED', red = 'DEFAULT', tmax = 800, seed = 4] = process.argv.slice(2);
let SW;
const r = await runWar({ blue, red, tmax: +tmax, seed: +seed, tech: 'all', patch: ['catlane'], feed: t => /RAIDER|LEVIATHAN|SHIPYARD/.test(t) && console.log(' feed', t),
  hook: o => { SW = o.strike; },
  onStep: W => { if (Math.round(W.time * 30) % 300 !== 0) return; for (const u of SW.jets) { const c = W.carrier; console.log(`${W.time.toFixed(0).padStart(5)} ${u.name} ${u.phase}/${u.ai.state} bombs ${u.bombs} fuel ${u.sim.fuel.toFixed(0)} y ${u.p.y.toFixed(0)} dCarrier ${c ? Math.hypot(u.p.x - c.p.x, u.p.z - c.p.z).toFixed(0) : '-'} tgt ${u.tgt && (u.tgt.type || u.tgt.kind)} hp ${u.hp.toFixed(1)}`); } } });
console.log(r.how, r.time, JSON.stringify(r.strike));
process.exit(0);
