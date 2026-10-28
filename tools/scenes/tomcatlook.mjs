// TOMCAT look (ngc/look-tomcat): every view a player reaches of the F-14A, in the game with RenderKit on. On cat 1 of
// the ALBATROSS: an orbit at 12 / 30 / 80 m (front-left, right, above, below), the gear close up, both cockpits;
// then the shot, the climb-out, and orbit views at 1200 m and 3000 m with the wings at 20 and swept aft; the cockpit up high.
//   CHROME_PATH=... node snap.mjs scenes/tomcatlook.mjs        (?part=deck stops after the deck views)
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.6');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 30000); await h.wait(1200);
  await h.key('tap', 'Digit8'); await h.wait(600);
  await h.expect('__G.G.craft === "tomcat" && __G.tomcatC.TP.A.cat');
  // an orbit camera about the jet (body frame): window.__cam = [yaw, pitch, dist, ty]
  await h.eval(`(() => { window.T = __G.tomcatC.TP; window.A = T.A; T._chase = T._chase || T.chaseCam; const V = __G.THREE.Vector3;
    T.chaseCam = (cam) => { const c = window.__cam; if (!c) return T._chase(cam, 0.016); const [yw, pt, d, ty = 0] = c;
      const o = new V(Math.sin(yw) * Math.cos(pt) * d, Math.sin(pt) * d + ty, Math.cos(yw) * Math.cos(pt) * d).applyQuaternion(A.q).add(A.pos);
      cam.position.copy(o); cam.up.set(0, 1, 0); cam.lookAt(new V(0, ty, 0).applyQuaternion(A.q).add(A.pos)); };
    __G.cockpitCam = false; return 1; })()`);
  const orbit = async (name, c, ms = 900) => { await h.eval(`(window.__cam = ${JSON.stringify(c)}, 1)`); await h.wait(ms); await h.shot(name); };
  await orbit('deck-front-left-14m', [-2.4, 0.15, 14]);
  await orbit('deck-side-right-26m', [1.5708, 0.08, 26]);
  await orbit('deck-rear-right-22m', [0.6, 0.25, 22]);
  await orbit('deck-above-30m', [0.01, 1.35, 30]);
  await orbit('deck-far-80m', [-2.0, 0.3, 80]);
  await orbit('gear-nose-close', [-2.8, -0.05, 5, -1.6]);
  await orbit('gear-main-close', [-1.2, -0.05, 6, -1.5]);
  await h.eval('(window.__cam = null, __G.cockpitCam = true, 1)'); await h.wait(1200); await h.shot('cockpit-pilot');
  await h.eval('(__G.head.pitch = -0.5, 1)'); await h.wait(500); await h.shot('cockpit-pilot-panel'); await h.eval('(__G.head.pitch = 0, 1)');
  await h.key('tap', 'BracketRight'); await h.wait(900); await h.shot('cockpit-rio'); await h.key('tap', 'BracketLeft'); await h.wait(300);
  await h.eval('(__G.cockpitCam = false, 1)');
  if (/part=deck/.test(process.env.TLOOK || '')) return;
  // the shot
  await h.key('down', 'ShiftLeft'); await h.waitFor('T.thr > 0.81', 10000); await h.key('up', 'ShiftLeft');
  await h.eval('(window.__cam = [-2.2, 0.12, 18], 1)');
  await h.waitFor('!A.cat || (A.cat && A.cat.state === "stroke")', 90000); await h.wait(150); await h.shot('cat-stroke');
  await h.waitFor('!A.cat', 60000);
  await h.key('down', 'KeyS'); await h.eval('(window.__t0 = __G.war.time, 1)'); await h.waitFor('A.attitude().pitch > 0.1 || __G.war.time - __t0 >= 1.5', 30000); await h.key('up', 'KeyS'); await h.key('tap', 'KeyG');
  await h.eval(`(() => { const FD = T.FD; T.autopilot = (A, dt) => { FD.steer(FD.dirHdg(A.heading(), Math.max(-0.1, Math.min(0.16, ((window.__alt || 1200) - A.pos.y) * 0.004))), dt, { gmax: 3, eas: window.__spd || 150, ab: true }); const c = FD.ctl; T.thr = c.throttle[0]; return { pitch: c.pitch, roll: c.roll, yaw: c.yaw, throttle: c.throttle, brakeL: 0, brakeR: 0 }; }; return 1; })()`);
  await h.waitFor('A.pos.y > 30 || !T.alive', 30000); await h.key('tap', 'KeyL');
  await orbit('climb-out', [-2.6, 0.1, 22]);
  await h.waitFor('A.pos.y > 1100 || !T.alive', 300000);
  await orbit('alt1200-front-left', [-2.3, 0.2, 24]);
  await orbit('alt1200-side', [1.5708, 0.05, 30]);
  await orbit('alt1200-below', [0.4, -0.9, 26]);
  await h.eval('(window.__alt = 3000, window.__spd = 320, 1)');
  await h.waitFor('(A.pos.y > 2800 && A.sweep > 55) || !T.alive', 400000);
  await h.eval('({alt: A.pos.y, sweep: A.sweep, mach: A.mach})');
  await orbit('alt3000-swept-above', [0.01, 1.3, 30]);
  await orbit('alt3000-swept-front-left', [-2.3, 0.2, 24]);
  await orbit('alt3000-swept-rear', [0.3, 0.15, 28]);
  await h.eval('(window.__cam = null, __G.cockpitCam = true, 1)'); await h.wait(900); await h.shot('cockpit-alt3000');
}
