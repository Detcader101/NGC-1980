// ngc/huey-sight: rocket impact vs the reflex sight's reticle, in the game. The Huey is put in a level hover 80 m up,
// the sight deployed, one rocket fired (G), and the rocket's path recorded in the frame of the airframe at the moment of
// firing; where it crosses the harmonisation range its angle off the sight line, seen from the pilot's design eye, is
// reported in mils (the pipper should cover it: a pair's mean point within ~2 mils). Screenshots through the sight.
// node snap.mjs scenes/hueysightfire.mjs
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.6');
  await h.waitFor('window.__G', 10000); await h.wait(600);
  await h.key('tap', 'Enter'); await h.waitFor(`__G.G.state === 'play'`, 10000);
  await h.waitFor('__G.H.rpm > 0.97', 60000);
  await h.eval(`(() => { const G = __G, T = G.THREE, p = G.H.pos.clone(); p.y += 80; G.H.reset(p, 0, false, 1); G.cockpitCam = true; G.G.rockets = 16; return true; })()`);
  await h.wait(400);
  await h.eval(`(__G.cockpit.sight.toggle(true), true)`); await h.wait(3000); await h.waitFor('__G.cockpit.sight.state.k > 0.95', 30000);
  await h.eval('({ k: __G.cockpit.sight.state.k, vis: __G.cockpit.group.visible, state: __G.G.state, craft: __G.G.craft, rpm: __G.H.rpm, y: __G.H.pos.y, rk: __G.G.rockets, proj: __G.war.proj.length })', 'state');
  await h.expect('__G.cockpit.sight.state.k > 0.95', 'the sight swung down into OPERATE');
  await h.shot('cockpit_sight_operate');
  // capture each rocket the game launches (war.fireRocket: launch point, velocity) with the airframe's matrix at that
  // instant, then fly it with the war module's own law (exact under 1.2 m/s^2) to the harmonisation range
  await h.eval(`(() => { const G = __G, W = G.war, ship = G.cockpit.group.parent, f0 = W.fireRocket; window.__rk = [];
    W.fireRocket = (p, v) => { window.__rk.push({ p: p.clone(), v: v.clone(), m: new G.THREE.Matrix4().compose(G.H.pos, G.H.q, new G.THREE.Vector3(1, 1, 1)), hv: G.Z.vel.clone() }); return f0(p, v); }; return true; })()   /* the simulation's own frame at launch (the drawn mesh lags it by a frame) */`);
  await h.key('down', 'KeyG'); await h.wait(500); await h.key('up', 'KeyG');
  await h.wait(2500);
  await h.shot('cockpit_rockets_through_sight');
  await h.eval(`(() => { const G = __G, T = G.THREE, E = new T.Vector3(0.55, 0.16, -1.95), bore = G.cockpit.sight.bore, MIL = 6400 / (2 * Math.PI), range = 250, g = 1.2;
    const right = new T.Vector3().crossVectors(bore, new T.Vector3(0, 1, 0)).normalize(), up = new T.Vector3().crossVectors(right, bore);
    window.__rkOut = window.__rk.map(R => { const inv = R.m.clone().invert(), eyeW = E.clone().applyMatrix4(R.m), rel = R.v.clone().sub(R.hv);   // relative to the moving airframe
      let a = null; for (let t = 0; t < 4; t += 0.002) { const w = R.p.clone().addScaledVector(rel, t); w.y -= 0.5 * g * t * t; const l = w.applyMatrix4(inv); if (l.z <= -range) { a = l; break; } }
      if (!a) return null; const d = a.clone().sub(E).normalize();
      return { at: a.toArray().map(v => +v.toFixed(2)), azMil: +(Math.atan2(d.dot(right), d.dot(bore)) * MIL).toFixed(1), elMil: +(Math.atan2(d.dot(up), d.dot(bore)) * MIL).toFixed(1) }; }).filter(Boolean);
    return window.__rkOut; })()`, 'rockets at the 250 m harmonisation range, mils off the sight line (relative to the airframe)');
  await h.expect('__rkOut.length >= 1', 'a rocket reached the harmonisation range');
  await h.expect('Math.abs(__rkOut.reduce((s, o) => s + o.elMil, 0) / __rkOut.length) < 3', 'the pipper predicts the rockets in elevation (mean within 3 mils)');
  await h.expect('__rkOut.length < 2 || Math.abs(__rkOut.reduce((s, o) => s + o.azMil, 0) / __rkOut.length) < 3', 'the pair centres on the pipper in azimuth (mean within 3 mils)');
}
