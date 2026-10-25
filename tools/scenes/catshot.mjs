// (ngc/bugsweep) The cat shot, first and third person, HANDS OFF: the player F-14A on cat 1 from the Huey (8), MIL power,
// no stick at all through the stroke and the flyaway - the launch trim rotates her to ~10 deg and she climbs away (it
// used to settle off the bow into the sea: catdeckbench.mjs). Then the HORNET (5) off the same cat, and the AI Tomcat
// escort (4) off the cat seen from the deck. Screenshots: on the cat (cockpit, chase), mid-stroke (chase, cockpit),
// the flyaway (chase, cockpit).
//   CHROME_PATH=... node snap.mjs scenes/catshot.mjs
// a camera that follows an AI jet (window.__follow): behind it (__cam.d, .h), or abeam it with __cam.side
const FOLLOW = `(() => { const G = __G, T = G.THREE, r = G.renderer, cam = new T.PerspectiveCamera(50, 1, 0.3, 2500), orig = r.render.bind(r);
  const t = new T.Vector3(), p = new T.Vector3(), f = new T.Vector3(), s = new T.Vector3();
  r.render = (sc, c) => {
    const u = window.__follow, m = window.__cam; if (c !== G.zCam || !u || !m) return orig(sc, c);
    u.mesh.getWorldPosition(t); u.sim.forward(f); f.y = 0; f.normalize(); s.set(-f.z, 0, f.x);
    p.copy(t).addScaledVector(m.side ? s : f, -m.d * (m.side || 1)); p.y += m.h;
    cam.position.copy(p); cam.up.set(0, 1, 0); cam.lookAt(t); cam.aspect = c.aspect; cam.updateProjectionMatrix(); return orig(sc, cam);
  };
  return true; })()`;
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 20000); await h.wait(1200);
  await h.key('tap', 'Digit8'); await h.wait(600);
  await h.expect('__G.G.craft === "tomcat" && __G.tomcatC.TP.A.cat && __G.tomcatC.TP.A.cat.state === "hold"', 'Tomcat on cat 1');
  await h.eval('(window.T = __G.tomcatC.TP, window.A = T.A, window.__ev = [], T.autopilot = null, __G.cockpitCam = true, 1)');
  await h.wait(1500); await h.shot('tomcat-cockpit-on-the-cat');
  await h.eval('(__G.cockpitCam = false, T.snapChase(), 1)'); await h.wait(1200); await h.shot('tomcat-chase-on-the-cat');
  // MIL and hands off: the keyboard throttles up, nothing on the stick
  await h.key('down', 'ShiftLeft'); await h.waitFor('T.thr > 0.81', 10000); await h.key('up', 'ShiftLeft');
  await h.waitFor("A.cat && A.cat.state === 'stroke' && A.cat.s > 8 || !A.cat", 60000);
  await h.shot('tomcat-chase-mid-stroke');
  await h.eval('({ s: A.cat && A.cat.s, v: A.cat && A.cat.v, y: A.pos.y })', 'mid-stroke');
  await h.waitFor('!A.cat', 20000);
  await h.eval('(window.__t0 = __G.war.time, window.__y0 = A.pos.y, window.__min = 99, window.__nz = 0, window.__mon = setInterval(() => { window.__min = Math.min(window.__min, A.pos.y); window.__nz = Math.max(window.__nz, A.nz); }, 30), 1)');
  await h.waitFor('__G.war.time - __t0 >= 2.5 || !T.alive', 20000);
  await h.shot('tomcat-chase-flyaway');
  await h.eval('(__G.cockpitCam = true, 1)'); await h.waitFor('__G.war.time - __t0 >= 5 || !T.alive', 20000); await h.shot('tomcat-cockpit-flyaway');
  await h.eval('({ alive: T.alive, y: A.pos.y, vy: A.vel.y, pitch: A.attitude().pitch * 57.3, eas: A.eas * 1.944, lowest: __min, nzMax: __nz })', 'hands-off flyaway');
  await h.expect('T.alive && A.pos.y > 20 && A.vel.y > 0 && window.__min > 7', 'Tomcat: hands off, she flies away off the cat and climbs');
  // the Hornet off the same cat: a fresh game, 5 from the Huey on deck
  await h.eval("clearInterval(__mon)");
  await h.goto("?debug&auto&kb&peace&res=0.45");
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 20000); await h.wait(1200);
  await h.key("tap", "Digit5"); await h.wait(800);
  await h.eval('({ craft: __G.G.craft, cat: __G.JP.J && __G.JP.J.cat && __G.JP.J.cat.state })', 'Hornet');
  await h.expect('__G.G.craft === "jet" && __G.JP.J.cat && __G.JP.J.cat.state === "hold"', 'Hornet on cat 1');
  await h.eval('(window.J = __G.JP.J, __G.cockpitCam = false, 1)'); await h.wait(1000); await h.shot('hornet-chase-on-the-cat');
  await h.key('down', 'ShiftLeft'); await h.waitFor('J.cat && J.cat.state === "stroke" || !J.cat', 60000); await h.key('up', 'ShiftLeft');
  await h.waitFor('!J.cat', 20000);
  await h.eval('(window.__t1 = __G.war.time, 1)'); await h.waitFor('__G.war.time - __t1 >= 3', 20000);
  await h.shot('hornet-chase-flyaway');
  await h.eval('({ y: J.pos.y, vy: J.vel.y, alive: __G.JP.alive })', 'Hornet flyaway');
  await h.expect('__G.JP.alive !== false && J.pos.y > 15 && J.vel.y > 0', 'Hornet: hands off, she flies away off the cat');
  // the AI Tomcat escort (4 on the command keys) off the cat, seen from a camera that follows it (a fresh game)
  await h.goto("?debug&kb&peace&res=0.45");
  await h.waitFor("window.__G", 10000); await h.wait(500);
  await h.key("tap", "Enter"); await h.waitFor("__G.G.state === 'play'", 10000); await h.wait(1200);
  await h.eval(FOLLOW);
  await h.eval("(() => { const W = __G.war, c = W.carrier; __G.G.mat = 200; __G.selIsl = null; __G.command(4); return W.air.pending.length; })()");
  await h.waitFor("__G.war.units.some(u => u.type === 'escort' && u.ai.state === 'cat')", 90000);
  await h.eval("(window.__j = __G.war.units.find(u => u.type === 'escort'), window.__follow = __j, window.__cam = { side: 1, d: 26, h: 7 }, 1)");
  await h.wait(1500); await h.shot("ai-tomcat-on-the-cat");
  await h.waitFor("__j.sim.cat && __j.sim.cat.state === 'stroke' || !__j.sim.cat", 90000);
  await h.eval("(window.__cam = { d: 30, h: 6 }, 1)"); await h.shot("ai-tomcat-stroke");
  await h.waitFor("__j.ai.state === 'climb' || __j.dead || __j.dying", 60000);
  await h.eval("(window.__t2 = __G.war.time, 1)"); await h.waitFor("__G.war.time - __t2 >= 3 || __j.dead", 20000);
  await h.shot("ai-tomcat-climb-out");
  await h.eval("({ state: __j.ai.state, y: Math.round(__j.p.y), eas: Math.round(__j.sim.eas * 1.944), dead: !!__j.dead })", "AI Tomcat");
  await h.expect("!__j.dead && !__j.dying && __j.p.y > 20", "AI Tomcat: off the cat and climbing");
  await h.eval("(window.__cam = null, 1)");
}
