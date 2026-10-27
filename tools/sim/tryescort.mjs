// dev: one Tomcat CAP launch in the headless war, what its pilot does.  node tools/sim/tryescort.mjs
import { runWar } from './headless.mjs';
let W0, sent = false;
await runWar({ blue: 'BALANCED', red: 'DEFAULT', tmax: +(process.argv[2] || 120), seed: 2, tech: 'all', patch: process.env.PATCH ? ['catlane'] : [], feed: t => console.log('  feed', t),
  hook: ({ W, C }) => { W0 = W; C.think = () => {}; W.redAI.think = () => {}; },
  onStep: W => {
    if (!sent && W.time > 2) { sent = true; W.P.mat = 200; console.log(W.sendEscort(null)); }
    for (const u of W.units) if (u.type === "escort" && (W.time > 19 || Math.round(W.time * 30) % 30 === 0)) { const A = u.sim; console.log(`${W.time.toFixed(0).padStart(4)} ${u.ai.state.padEnd(8)} pos ${A.pos.x.toFixed(0)},${A.pos.y.toFixed(1)},${A.pos.z.toFixed(0)} v ${A.vel.length().toFixed(0)} gear ${A.gear} dead ${A.dead} ev ${A.events.map(e => e.e).join(",")} eas ${A.eas?.toFixed(0)} pitch ${(A.attitude().pitch*57.3).toFixed(0)} onGround ${A.onGround} cat ${!!A.cat} deck ${W.deckY(A.pos.x, A.pos.z).toFixed(1)} carrier ${W.carrier.p.x.toFixed(0)},${W.carrier.p.z.toFixed(0)} spd ${W.carrier.speed.toFixed(1)}`); }
  } });
process.exit(0);
