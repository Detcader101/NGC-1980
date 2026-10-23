// The rotary AI preview page (game/dev/rotary.html): model turntables and each aircraft's whole mission, stepped
// deterministically (paused page, __R.run(seconds)) and photographed at the interesting moments.
// node snap.mjs scenes/rotarydev.mjs [ch46|mv22|wasp]   (default: all)
const ONLY = process.argv.slice(2).find(a => /^(ch46|mv22|wasp)$/.test(a));
const VIEWS = [['front34', [Math.PI + 0.65, 0.18, 30]], ['side', [-Math.PI / 2, 0.05, 30]], ['rear34', [0.6, 0.22, 30]], ['top', [0.001, 1.35, 34]], ['low_rear', [0.25, 0.05, 20]]];
export default async function (h) {
  for (const ac of ONLY ? [ONLY] : ['ch46']) {
    // turntable
    await h.goto(`dev/rotary.html?ac=${ac}&view=model&paused&ui=0`); await h.waitFor('window.__R', 10000); await h.wait(500);
    for (const [n, [yaw, pitch, dist]] of VIEWS) { await h.eval(`(Object.assign(__R.cam, { yaw: ${yaw}, pitch: ${pitch}, dist: ${dist} }), __R.render(), true)`); await h.wait(250); await h.shot(`${ac}-model-${n}`); }
    // the mission
    await h.goto(`dev/rotary.html?ac=${ac}&paused`); await h.waitFor('window.__R', 10000); await h.wait(500);
    const at = async (name, cond, cam = 'chase', max = 300) => {
      const t = await h.eval(`(__R.camMode = '${cam}', __R.runUntil(() => ${cond}, ${max}), __R.render(), +__R.simT.toFixed(1))`);
      await h.wait(250); await h.shot(`${ac}-${name}`); return t;
    };
    await at('01-deck', 'true', 'deck', 0);
    await at('02-liftoff', `__R.unit.U.AI.phase === 'lift' && __R.unit.U.S.agl > 2`, 'deck');
    await at('03-transit', `__R.unit.U.AI.phase === 'transit' && __R.unit.U.AI.cmd.dist < 330`);
    await at('04-flare', `__R.unit.U.AI.phase === 'transit' && __R.unit.U.AI.cmd.dist < 60`, 'lz');
    await at('05-touchdown', `__R.unit.U.AI.phase === 'ground'`, 'lz');
    await at('06-ramp', `__R.unit.U.ramp > 0.9`, 'lz');
    await at('07a-squad-run', `__R.unit.U.squad.alive && __R.unit.U.deployed && __R.unit.U.unloadT > 1.2`, 'squad');
    await at('07-squad-out', `__R.unit.U.squad.holding > 4`, 'lz');
    await at('08-squad-close', `__R.unit.U.squad.holding > 10`, 'squad');
    await at('09-liftoff2', `__R.unit.U.AI.phase === 'rtb'`, 'lz');
    await at('10-deck-final', `__R.unit.U.AI.phase === 'descend2'`, 'deck');
    const t = await at('11-parked', `__R.unit.done()`, 'deck');
    await h.expect(`__R.unit.U.parked && !__R.unit.U.dead`, `${ac}: mission flown and parked (t ${t})`);
    await h.expect(`__R.unit.U.squad.holding >= 12`, `${ac}: squad holding the pad`);
  }
}
