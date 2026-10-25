// dev: catch a rotary unit whose flight model runs away (speed > 150 m/s) and print its last frames
import { runWar } from './headless.mjs';
const [blue = 'BALANCED', red = 'DEFAULT', tmax = 2400, seed = 4] = process.argv.slice(2);
const hist = new Map(); let done = false;
await runWar({ blue, red, tmax: +tmax, seed: +seed, tech: 'all', patch: ['catlane'],
  onStep: W => {
    if (done) return;
    for (const u of W.units) {
      if (!u.rot && u.type !== 'drone') continue;
      const H = hist.get(u) || []; hist.set(u, H);
      const R = u.rot || {}, S = R.sim || R.fm || {};
      H.push(`${W.time.toFixed(2)} ${u.type} p ${u.p.x.toFixed(1)},${u.p.y.toFixed(2)},${u.p.z.toFixed(1)} v ${u.v ? u.v.length().toFixed(1) : '?'} hp ${u.hp?.toFixed?.(1)} dying ${!!u.dying} landed ${u.landed} st ${R.state || R.phase || (R.AI && R.AI.phase) || ''} deck ${W.deckY(u.p.x, u.p.z).toFixed(1)} gnd ${Math.max(0, W.ground ? 0 : 0)}`);
      if (H.length > 40) H.shift();
      if (u.v && u.v.length() > 150 || !Number.isFinite(u.p.x)) { console.log(H.join('\n')); console.log('keys', Object.keys(u).join(','), '\nrot keys', Object.keys(R).join(',')); done = true; break; }
    }
  } });
process.exit(0);
