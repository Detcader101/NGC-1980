// (ngc/bugsweep) DECK OPS in the game: three AI Tomcat escorts (4, 4, 4) and the player's Hornet (5) asked for at once go
// through the ALBATROSS launch queue (units/naval/deckops.js) - spotted aft of the island, taxied by the yellow-shirt
// director to the hold-short line, the cat director, the JBD, the shot - one at a time off cat 1, and all four fly.
// Screenshots mid-sequence: the deck from a camera beside the taxiing jet, the player's cockpit and chase view on the
// spot, the player taxiing, on the cat.   CHROME_PATH=... node snap.mjs scenes/deckseq.mjs
const FOLLOW = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3(), f = new T.Vector3(), s = new T.Vector3();
  r.render = (sc, c) => {
    const u = window.__follow, m = window.__cam; if (c !== G.zCam || !u || !m) return orig(sc, c);
    u.mesh.getWorldPosition(t); u.sim.forward(f); f.y = 0; f.normalize(); s.set(-f.z, 0, f.x);
    p.copy(t).addScaledVector(m.side ? s : f, -m.d * (m.side || 1)); p.addScaledVector(f, m.fwd || 0); p.y += m.h;
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix(); return orig(sc, cam);
  };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 20000); await h.wait(1200);
  await h.eval(FOLLOW);
  await h.eval(`(() => { const W = __G.war; window.D = W.deck; __G.G.mat = 600; __G.selIsl = null; const m = [__G.command(4), __G.command(4), __G.command(4)]; window.__log = []; window.__mon = setInterval(() => { const s = D.entries.map(e => e.name + ':' + e.state).join(' '); if (s !== window.__last) { window.__last = s; window.__log.push(Math.round(W.time) + ' ' + s); } }, 100); return { m, q: D.entries.map(e => [e.name, e.state]) }; })()`, 'three escorts asked for');
  await h.wait(1500);
  await h.key('tap', 'Digit5'); await h.wait(800);
  await h.eval("({ craft: __G.G.craft, tow: __G.JP.J.tow, cat: !!__G.JP.J.cat, q: D.entries.map(e => [e.name, e.state, D.place(e)]), hint: document.getElementById('hint').textContent, msg: document.getElementById('msg').textContent })", 'the player asks for a Hornet');
  await h.expect("__G.G.craft === 'jet' && !!__G.JP.J.tow && D.entries.length === 4", 'the player Hornet is spotted in the queue (not on the cat)');
  await h.expect("/NUMBER [2-4] FOR CAT 1/.test(document.getElementById('hint').textContent)", 'the HUD shows the place in the queue');
  // the first escort taxis: a camera beside it
  await h.waitFor("D.entries.some(e => e.state === 'taxi')", 90000);
  await h.eval("(window.__te = D.entries.find(e => e.state === 'taxi'), window.__follow = __G.war.units.find(u => u.sim === __te.A), window.__cam = { d: 24, h: 11 }, 1)");
  await h.wait(1200); await h.shot('deck-escort-taxiing-director');
  await h.waitFor("D.entries.some(e => e.state === 'hold')", 60000); await h.wait(600); await h.shot('deck-escort-hold-short');
  await h.eval("(window.__cam = null, __G.cockpitCam = true, 1)"); await h.wait(800); await h.shot('player-cockpit-on-the-spot');
  await h.eval("(__G.cockpitCam = false, __G.JP.snapChase(), 1)"); await h.wait(800); await h.shot('player-chase-on-the-spot');
  await h.waitFor("D.entries.some(e => e.state === 'tension')", 60000); await h.wait(600);
  await h.eval("(window.__follow = __G.war.units.find(u => u.sim === D.entries.find(e => e.state === 'tension').A), window.__cam = { side: 1, d: 30, h: 8 }, 1)"); await h.shot('deck-escort-on-cat-jbd-up');
  await h.eval("(window.__cam = null, 1)");
  // the player's turn: taxi, then the cat
  await h.waitFor("(() => { const e = D.entries.find(e => e.A === __G.JP.J); return !e || e.state === 'taxi' || e.state === 'hold' || e.state === 'oncat' || !!__G.JP.J.cat; })()", 240000);
  await h.eval("({ q: D.entries.map(e => [e.name, e.state]), hint: document.getElementById('hint').textContent })", 'the player is moving');
  await h.wait(1500); await h.shot('player-chase-taxiing');
  await h.eval("(__G.cockpitCam = true, 1)"); await h.wait(800); await h.shot('player-cockpit-taxiing-director');
  await h.waitFor("!!__G.JP.J.cat", 120000);
  await h.wait(1000); await h.shot('player-cockpit-on-cat');
  await h.key('down', 'ShiftLeft'); await h.waitFor('__G.JP.J.cat && __G.JP.J.cat.state === "stroke" || !__G.JP.J.cat', 60000); await h.key('up', 'ShiftLeft');
  await h.waitFor('!__G.JP.J.cat', 30000);
  await h.eval("(__G.cockpitCam = false, __G.JP.snapChase(), 1)");
  // everyone off: 3 escorts and the player
  await h.waitFor("D.entries.length === 0 && __G.war.units.filter(u => u.type === 'escort' && !u.dead && !u.dying && !u.deckE && u.p.y > 25).length === 3", 300000);
  await h.eval("({ log: __log, launched: D.log.map(l => l.name + ' ' + Math.round(l.t)), esc: __G.war.units.filter(u => u.type === 'escort').map(u => [u.name, u.ai.state, Math.round(u.p.y)]), me: { alive: __G.JP.alive, y: Math.round(__G.JP.J.pos.y) } })", 'sequence');
  await h.expect("D.log.length === 4 && D.log.every((l, i) => i === 0 || l.t - D.log[i - 1].t >= 8)", 'four launches, one at a time, the cat reset between');
  await h.expect("__G.JP.alive && __G.JP.J.pos.y > 20 && __G.war.units.filter(u => u.type === 'escort' && !u.dead && !u.dying && u.p.y > 20).length === 3", 'all four airborne');
  await h.shot('after-the-sequence');
}
