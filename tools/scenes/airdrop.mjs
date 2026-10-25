// AIRLIFT: the command board's AIR DROP. The M60A3 is refused (too heavy for a C-130, numbers in the message); an
// M113A2 is ordered to an island by C-130 heavy drop (reserve -1, the sortie's materiel): the KC-130 flies the run, the
// ramp opens at the one-minute warning, the green light at the computed release point, the extraction chute, the
// platform out over the ramp, the G-11As open, the load drifts down and lands on its honeycomb, the DZ party de-rigs
// it and the M113A2 is a unit at the island (on the board; you can switch into it). Watched from the C-130 (V views).
// All waits are on game state (headless runs at 1-8 fps).
export default {
  name: 'airdrop',
  query: '?debug&auto&kb&res=0.45',
  run: async (h) => {
    const AD = '__G.airdrop', C = '__G.commander', F = '__G.fleet';
    await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 30000); await h.wait(500);
    await h.eval(`(__G.G.bench = true, __G.G.mat = 300, window.__I = __G.HOME_B.isl, { island: __I.name, m113: ${F}.n.m113 })`);
    const sel = id => `(() => { ${C}.sel = __G.roster.findIndex(r => r.id === '${id}'); ${C}.baseKey = __I.name; return ${C}.sel; })()`;
    // ---- 1. the board: the M60A3 is too heavy for a C-130
    await h.key('tap', 'Backslash'); await h.wait(400);
    await h.eval(sel('m60')); await h.key('tap', 'ArrowLeft'); await h.key('tap', 'ArrowRight'); await h.eval(`(${C}.baseKey = __I.name, 1)`);
    await h.wait(400);
    await h.expect(`/TOO HEAVY TO DROP/.test(document.getElementById('cmdBoard').textContent) && /C: AIR DROP/.test(document.getElementById('cmdBoard').textContent)`, 'the board shows AIR DROP on the vehicles, TOO HEAVY on the M60A3');
    await h.key('tap', 'KeyC'); await h.wait(400);
    await h.expect(`${AD}.runs.length === 0 && /TOO HEAVY FOR A C-130.*MAX PAYLOAD 19.4 t/.test(${AD}.can('m60'))`, 'C on the M60A3: refused, too heavy (52.6 t vs 19.4 t)');
    await h.shot('board-m60-too-heavy');
    // ---- 2. the M113A2 (stand the one on the deck down first: one in the fleet at a time for now), C: air drop
    await h.eval(sel('m113')); await h.key('tap', 'KeyX'); await h.wait(300);
    await h.eval(`(window.__n0 = ${F}.n.m113, window.__mat0 = __G.G.mat, ${C}.baseKey = __I.name, { n: __n0, mat: __mat0, present: __G.m113C.present() })`);
    await h.key('tap', 'KeyC'); await h.wait(500);
    await h.expect(`${AD}.runs.length === 1 && ${F}.n.m113 === __n0 - 1 && Math.abs(__G.G.mat - (__mat0 - 10)) < 3`, 'C on the M113A2: a C-130 run ordered (reserve -1, 10 materiel for the sortie)');
    await h.eval(`(() => { const r = ${AD}.runs[0]; return { call: r.call, dz: [Math.round(r.dz.x), Math.round(r.dz.z)], chutes: r.R.chutes, rigged: Math.round(r.R.rigged), wind: r.wind.map(v => +v.toFixed(1)) }; })()`);
    await h.wait(300); await h.shot('board-drop-ordered');
    // ---- 3. watch it: V on the board
    await h.key('tap', 'KeyV'); await h.wait(500);
    await h.expect(`${AD}.watching && !${C}.isOpen`, 'V: watching the run from the C-130');
    await h.wait(1500); await h.shot('hold-inbound');
    await h.key('tap', 'KeyV'); await h.wait(1500); await h.shot('flight-deck');
    await h.eval(`(${AD}.view = 'chase', 1)`); await h.wait(1500); await h.shot('chase-inbound');
    await h.waitFor(`${AD}.runs[0].S.ramp > 0.95`, 600000);
    await h.eval(`(${AD}.view = 'hold', 1)`); await h.wait(1200); await h.shot('hold-ramp-open');
    await h.waitFor(`${AD}.runs[0].phase !== 'inbound'`, 600000);
    await h.expect(`${AD}.runs[0].phase === 'green' || ${AD}.runs[0].phase === 'falling'`, 'green light at the release point');
    await h.waitFor(`${AD}.runs[0].zRel > 3 || ${AD}.runs[0].phase === 'falling'`, 120000);
    await h.shot('hold-extraction');
    await h.waitFor(`${AD}.runs[0].phase === 'falling'`, 120000);
    await h.eval(`(${AD}.view = 'chase', 1)`); await h.wait(400); await h.shot('chase-load-out');
    await h.eval(`(${AD}.view = 'load', 1)`);
    await h.waitFor(`${AD}.runs[0].L && ${AD}.runs[0].L.t > 2.5`, 120000); await h.shot('load-reefed');
    await h.waitFor(`${AD}.runs[0].L && ${AD}.runs[0].L.t > 7`, 120000); await h.shot('load-under-canopy');
    await h.eval(`(() => { const L = ${AD}.runs[0].L; return { vz: (-L.v[1]).toFixed(1), g: L.gMax.toFixed(1), agl: Math.round(L.p[1] - __G.groundY(L.p[0], L.p[2])) }; })()`, 'under canopy');
    await h.expect(`(() => { const L = ${AD}.runs[0].L; return -L.v[1] > 6 && -L.v[1] < 10; })()`, 'descent ~28 ft/s under six G-11As');
    await h.waitFor(`${AD}.runs[0].phase !== 'falling'`, 600000);
    await h.wait(800); await h.shot('landed');
    await h.eval(`(() => { const r = ${AD}.runs[0]; return { phase: r.phase, why: r.out && r.out.why, vz: r.L.vzLand.toFixed(1), fromDZ: Math.round(Math.hypot(r.L.p[0] - r.dz.x, r.L.p[2] - r.dz.z)) }; })()`, 'landing');
    await h.expect(`${AD}.runs[0].out && ${AD}.runs[0].out.ok && Math.hypot(${AD}.runs[0].L.p[0] - ${AD}.runs[0].dz.x, ${AD}.runs[0].L.p[2] - ${AD}.runs[0].dz.z) < 200`, 'landed within 200 m of the DZ, not lost');
    await h.wait(3000); await h.shot('canopies-collapsed');
    await h.waitFor(`${AD}.runs[0].phase === 'ready'`, 300000);
    await h.expect(`__G.m113C.present() && !__G.m113C.dead && __G.roster.find(r => r.id === 'm113').out()`, 'de-rigged: the M113A2 is a unit at the island (on the command board)');
    await h.eval(`({ status: __G.roster.find(r => r.id === 'm113').status() })`);
    await h.wait(1500); await h.shot('ready-derigged');
    await h.key('tap', 'Escape'); await h.wait(400);
    await h.expect(`!${AD}.watching`, 'Esc: back from watching');
    await h.eval(`__G.crafts.control('m113', 0, 'command')`); await h.wait(1200);
    await h.expect(`__G.G.craft === 'm113'`, 'switched into the air-dropped M113A2');
    await h.shot('in-the-m113');
  },
};
