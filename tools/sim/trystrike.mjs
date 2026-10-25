// dev: Hornet strikes on a fixed target, where the bombs land.  node tools/sim/trystrike.mjs [target island] [kind]
import { runWar } from './headless.mjs';
const [isl = 'ANVIL', kind = 'factory'] = process.argv.slice(2);
const bombs = []; let SW, tgt, W0;
const r = await runWar({ blue: 'BALANCED', red: 'DEFAULT', tmax: 420, seed: 3, tech: 'all', feed: t => /RAIDER|DESTROY/.test(t) && console.log('  feed', t),
  hook: ({ W, C, strike }) => {
    W0 = W; SW = strike; C.think = () => {}; SW.debug = (u, o) => console.log('  ABORT', JSON.stringify(o));
    const I = W.islands.find(I => I.name === isl); tgt = kind === 'kraken' ? W.enemyCarrier : I.structs.find(s => s.kind === kind);
    const drop = W.dropBomb; W.dropBomb = (p, v) => { const b = drop(p, v); bombs.push({ b, t: W.time, from: { x: p.x, y: p.y, z: p.z }, v: { x: v.x, y: v.y, z: v.z }, alive: true }); return b; };
  },
  onStep: W => {
    if (SW.jets.length === 0 && !W._fired && W.time > 5) { W._fired = true; console.log('launch', SW.launch(tgt, 'TEST')); }
    if (SW.jets.length === 0 && W._fired && W.time - (W._lastL || 0) > 40) { W._lastL = W.time; console.log('relaunch', W.time.toFixed(0), SW.launch(tgt, 'TEST')); }
    for (const j of SW.jets) if (Math.round(W.time * 30) % 60 === 0) console.log(`  ${W.time.toFixed(0)} ${j.name} ${j.phase} ${j.ai.state} pos ${j.p.x.toFixed(0)},${j.p.y.toFixed(0)},${j.p.z.toFixed(0)} v ${j.v.length().toFixed(0)} hp ${j.hp}`);
    for (const B of bombs) if (B.alive) { if (!W.proj.includes(B.b)) { B.alive = false; const tp = tgt.dims ? tgt.p : tgt; console.log(`  bomb at ${B.b.p.x.toFixed(0)},${B.b.p.y.toFixed(0)},${B.b.p.z.toFixed(0)}  miss ${Math.hypot(B.b.p.x - tp.x, B.b.p.z - tp.z).toFixed(1)} m  target hp ${tgt.hp.toFixed(1)}`); } }
  } });
console.log('strike', JSON.stringify(r.strike), 'target hp', tgt.hp, tgt.dead);
process.exit(0);
