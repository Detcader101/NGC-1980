// SR-71 reconnaissance, made visible (ngc/sr71-fix; Jay Jay: "cameras on and nav map don't change anything"):
// K at 75,000 ft over enemy ground: the HUD / hint status, the RSO's NOSE OBC panel (POWER ON, OPR, FILM DRIVE), the pilot's
// Nav Map (track, the strip being photographed); a scripted pass over enemy islands (fast-forwarded); cameras off ends the
// pass: RECON PASS COMPLETE in the feed, photo intel strips and the photographed targets on the big map and the minimap,
// enemy units inside the strips visible through the fog; K below 20,000 ft says why it does not run; the big map follows
// the SR-71 and an edge arrow points at her when she is off it.
//   CHROME_PATH=... node snap.mjs scenes/sr71recon.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45&fly=sr71air');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.G.craft==='sr71'", 40000); await h.wait(1200);
  await h.eval('(window.S = __G.sr71C, window.P = S.P, window.A = P.A, window.ff = (sec) => { for (let t = 0; t < sec; t += 0.05) { P.update(0.05); if (!P.alive) break; } return { x: Math.round(A.pos.x), z: Math.round(A.pos.z), ft: Math.round(A.altFt), mach: +A.mach.toFixed(2) }; }, 1)');
  // the target: the enemy islands; start 7 km west of the westernmost, heading east along its line at Mach 3, 75,000 ft
  await h.eval(`(() => { const E = __G.war.islands.filter(I => I.owner === 2).sort((a, b) => a.x - b.x); const I = E[0]; window.__tgt = E.map(I => I.name);
    S.placeInAir(I.x - 7000, 0, I.z, -Math.PI / 2, { ft: 75000, mach: 3.0, fuelLb: 45000, thr: 0.8 }); __G.G.craft !== 'sr71' && __G.crafts.control('sr71', 0, 'spawn');
    A.ap.on = true; A.ap.pitch = 'alt'; A.ap.alt = A.pos.y; A.ap.roll = 'hdg'; A.ap.hdg = A.heading; P.samSoon = () => {}; return { start: [Math.round(A.pos.x), Math.round(A.pos.z)], enemy: E.map(I => [I.name, Math.round(I.x), Math.round(I.z)]) }; })()`);
  await h.eval('({ visibleEnemyBefore: __G.war.units.filter(u => u.side === 2 && !u.dead && __G.fog.visibleAt(u.p.x, u.p.z)).length })');
  await h.key('tap', 'KeyM'); await h.wait(1500); await h.shot('map-before'); await h.key('tap', 'KeyM'); await h.wait(500);
  // K: the cameras
  await h.key('tap', 'KeyK'); await h.wait(800);
  await h.eval('({ on: P.recon.on, ok: P.recon.ok, why: P.recon.why, status: P.reconStatus(), hud: __G.crafts.active.hud().weap })');
  await h.expect('P.recon.on && P.recon.ok && /CAMERAS RUNNING/.test(P.reconStatus())');
  await h.eval('(S.holdLook = true, P.view = "cockpit", __G.head.pitch = -0.32, __G.head.yaw = 0, 1)'); await h.wait(2500); await h.shot('pilot-navmap-cameras-running');
  await h.eval('(P.seat = 1, __G.head.pitch = -0.65, __G.head.yaw = -0.8, 1)'); await h.wait(2500); await h.shot('rso-obc-panel-running');
  await h.eval('(P.seat = 0, __G.head.pitch = 0, __G.head.yaw = 0, P.view = "chase", 1)');
  // the pass: across the enemy islands (fast-forwarded), then cameras off
  await h.eval('ff(22)');
  await h.eval('({ frames: Math.round(P.recon.frames), thisPass: P.recon.pass ? P.recon.pass.found.length : 0, marks: P.recon.marks.length })');
  await h.key('tap', 'KeyK'); await h.wait(1500);
  await h.eval('({ strips: P.recon.strips.length, marks: P.recon.marks.length, intel: (__G.fog.intel || []).length, feed: [...document.querySelectorAll("#feed div")].slice(-3).map(d => d.textContent) })');
  await h.expect('P.recon.marks.length > 0 && (__G.fog.intel || []).length > 0 && /RECON PASS COMPLETE/.test(document.querySelector("#feed").textContent)');
  await h.wait(1500);   // the fog updates every 0.25 s
  await h.eval('({ visibleEnemyAfter: __G.war.units.filter(u => u.side === 2 && !u.dead && __G.fog.visibleAt(u.p.x, u.p.z)).length, status: S.status() })');
  await h.shot('chase-after-pass-minimap');
  await h.key('tap', 'KeyM'); await h.wait(1500); await h.shot('map-after-follows-sr71');
  // the map dragged away from her: the edge arrow with her range
  await h.eval('(() => { const v = __G.mapZ || null; return !!v; })()');
  await h.key('tap', 'KeyM'); await h.wait(400);
  // low: K below 20,000 ft says why
  await h.eval('(S.placeInAir(-9000, 0, 0, -Math.PI / 2, { ft: 15000, keas: 380, fuelLb: 40000 }), A.ap.on = true, A.ap.pitch = "alt", A.ap.alt = A.pos.y, P.recon.on = false, 1)'); await h.wait(1000);   // a few frames: the air data (A.altFt) follow the new place
  await h.key('tap', 'KeyK'); await h.wait(600);
  await h.eval('({ status: P.reconStatus(), why: P.recon.why })');
  await h.expect('P.recon.on && !P.recon.ok && /BELOW 20,000 FT/.test(P.reconStatus())');
  await h.shot('low-cameras-not-running');
}
