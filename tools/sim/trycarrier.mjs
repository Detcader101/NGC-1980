// dev: what sinks the ALBATROSS - each hp drop attributed to what vanished near her that frame
import { runWar } from './headless.mjs';
const [blue = 'BALANCED', red = 'DEFAULT', tmax = 1500, seed = 4] = process.argv.slice(2);
const by = {}; let prevHp = 600, prevProj = new Set(), prevShahed = new Set();
const r = await runWar({ blue, red, tmax: +tmax, seed: +seed, tech: 'all',
  onStep: W => {
    const c = W.carrier; if (!c) return;
    const hp = c.sinking === undefined ? c.hp : 0, d = prevHp - hp;
    if (d > 0.01) {
      const near = (p, r) => Math.hypot(p.x - c.p.x, p.z - c.p.z) < r;
      const gone = [...prevProj].filter(b => !W.proj.includes(b) && near(b.p, 90)).map(b => b.kind + (b.side === 2 ? '' : '(own)'));
      const sh = [...prevShahed].filter(u => (u.dead || !W.units.includes(u)) && near(u.p, 90)).map(() => 'shahed');
      const gunsNear = W.units.filter(u => u.type === 'gunship' && near(u.p, 130)).length;
      const k = sh.length ? 'shahed' : gone.length ? [...new Set(gone)].join('+') : gunsNear ? 'gunship?' : 'other';
      by[k] = (by[k] || 0) + d;
    }
    prevHp = hp; prevProj = new Set(W.proj); prevShahed = new Set(W.units.filter(u => u.type === 'shahed'));
  } });
console.log(r.how, r.time, 's');
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v.toFixed(0)}`).join('\n'));
console.log('built 2', JSON.stringify(r.built[2]), '\nlost 1', JSON.stringify(r.lost[1]));
process.exit(0);
