// RENDERKIT ui (ngc/rk-ui): a tour of every menu, overlay and HUD the restyle touches, for before / after review.
// Run it twice, once per look, at each size:
//   CHROME_PATH=... node snap.mjs scenes/rkui.mjs --query '?debug&kb&res=0.45&rk=0'  --width 1280 --height 720
//   CHROME_PATH=... node snap.mjs scenes/rkui.mjs --query '?debug&kb&res=0.45&rk=ui' --width 1920 --height 1080
// (?rk=0: the classic look, ?rk=ui: only the design-system UI on, everything else classic.)
// Each step waits on game time (SwiftShader runs ~8 fps) and the screenshots are what to look at.
const hover = (x, alt, z, yaw = 0) => `(() => { clearInterval(window.__hv); const H=__G.H; __G.cockpitCam=false;
  H.reset(new __G.THREE.Vector3(${x},${alt},${z}),${yaw},false,1); __G.HI.setCollective(.48); window.__c=.48;
  window.__hv=setInterval(()=>{const vy=Math.max(-2,Math.min(2,(${alt}-H.pos.y)*.5));__c=Math.max(.2,Math.min(.7,__c+(vy-H.vel.y)*.002));__G.HI.setCollective(__c)},16); return 1; })()`;
export default {
  name: 'rkui', query: '?debug&kb&res=0.45&rk=ui', run: async h => {
    const narrow = await h.eval('innerWidth < 900');
    await h.waitFor("window.__G && __G.G.state==='title'", 30000);
    await h.wait(1500);
    await h.eval('({ rk: document.documentElement.className, w: innerWidth, h: innerHeight })', 'ui classes');
    // ?rk=0: not one design-system class anywhere (the classic look); otherwise the html switch and the menu roots
    await h.expect(`/[?&]rk=0/.test(location.search) ? !document.querySelector('.ngc-rkui, .rk-ui') : document.documentElement.classList.contains('ngc-rkui') && ['title', 'menu', 'cmdBoard', 'techBoard'].every(id => document.getElementById(id).classList.contains('rk-ui'))`, 'the UI switch follows ?rk=');
    await h.shot('01-title');
    await h.eval("(document.querySelector('#howto summary').click(), 1)"); await h.wait(600);
    await h.shot('02-howto');
    await h.eval("(document.querySelector('#howto summary').click(), 1)");
    await h.key('tap', 'Enter');
    await h.waitFor("__G.G.state==='play' && __G.war && __G.war.carrier", 30000);
    await h.eval('(__G.G.bench=true, 1)');
    // the Huey over the sea, the sky bright behind the top blocks; a message and the feed filled
    await h.eval(hover(-1500, 60, 200)); await h.wait(9000);
    await h.eval("(__G.say('CAPTURING LOOKOUT  64%', 6), __G.feed('RESEARCH: TOMCAT UNDER WAY'), __G.feed('ENEMY CONTAINER SHIP SUNK', 'good'), __G.feed('THE RUNAWAY HAVE FIELDED RW-7 HOVER TANKS', 'bad'), 1)");
    await h.wait(800);
    await h.shot('03-huey-sea');
    await h.eval('(__G.D.hp.rotor=.5, __G.G.fuel=9, 1)'); await h.wait(1200);
    await h.shot('04-huey-cautions');
    await h.eval('(__G.D.hp.rotor=1, __G.G.fuel=80, 1)');
    // over land: an island, terrain under the bottom blocks
    await h.eval("(() => { const I = __G.ISLANDS.find(i => i.owner === 2) || __G.ISLANDS[3]; window.__I = { x: I.x - 120, z: I.z + 160, a: Math.max(60, __G.terrainH(I.x - 120, I.z + 160) + 45) }; return I.name; })()");
    await h.eval(hover('__I.x', '__I.a', '__I.z'));
    await h.wait(9000);
    await h.shot('05-huey-land');
    await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(2500);
    await h.shot('06-huey-cockpit');
    await h.eval('(__G.cockpitCam = false, 1)');
    // pause menu
    await h.eval('(__G.openMenu(), 1)'); await h.wait(500);
    await h.shot('07-pause-menu');
    await h.eval('(__G.menu.sel = __G.menu.items.findIndex(i => i.id === "respawn"), __G.menuPick(), __G.menu.confirm)', 'confirm step'); await h.wait(300);
    await h.shot('08-pause-confirm');
    await h.key('tap', 'Escape'); await h.wait(300);
    // research, command board, map
    await h.eval('(__G.techUI.open(), 1)'); await h.wait(800);
    await h.shot('09-research');
    await h.eval('(__G.techUI.close(), __G.commander.open(), 1)'); await h.wait(800);
    await h.shot('10-command-board');
    await h.eval('(__G.commander.close(), 1)');
    await h.key('tap', 'KeyM'); await h.wait(1500);
    await h.shot('11-map');
    await h.key('tap', 'KeyM'); await h.wait(300);
    // Hornet airborne off the carrier
    await h.eval('(clearInterval(__hv), __G.commander.deploy("jet"))'); await h.wait(1500);
    await h.eval(`(() => { const J = __G.JP.J, c = __G.war.carrier; J.cat = null; J.launchBar = false; J.reset(c.p.x - Math.sin(c.yaw) * 600, 0, c.p.z - Math.cos(c.yaw) * 600, c.yaw, { running: true, airborne: true, alt: 260, speed: 85 }); J.gearCmd = 0; J.gear = 0; J.flapSel = 0; for (const e of J.eng) e.n = 0.85; __G.JP.thr = 0.85; __G.JP.snapChase(); return J.pos.y; })()`);
    await h.wait(4000);
    await h.shot('12-hornet');
    // the tank at home
    await h.eval('__G.commander.deploy("m60", __G.HOME_B.isl.name)'); await h.wait(5000);
    await h.shot('13-tank');
    // on foot, health and gear screens, then swimming
    await h.eval('__G.commander.deploy("marine", "ship")'); await h.wait(4000);
    await h.eval("({ craft: __G.G.craft })", 'on foot');
    await h.shot('14-foot');
    await h.eval("(__G.marine.key('KeyH'), 1)"); await h.wait(1200);
    await h.shot('15-health');
    await h.eval("(__G.marine.key('KeyH'), __G.marine.key('Tab'), 1)"); await h.wait(1200);
    await h.shot('16-gear');
    await h.eval("(__G.marine.key('Tab'), 1)"); await h.wait(300);
    await h.eval(`(() => { const c = __G.war.carrier, w = __G.GR.toWorld(c, -48, 40); __G.foot.spawnAt({ x: w.x, y: -1.3, z: w.z, yaw: c.yaw + Math.PI / 2 }, { force: true }); __G.marine.view = 'first'; return 1; })()`);
    await h.key('down', 'KeyW'); await h.waitFor('__G.foot.W.swim', 20000); await h.wait(1500); await h.key('up', 'KeyW');
    await h.shot('17-swim');
    if (!narrow) await h.notblank();
  },
};
