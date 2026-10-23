// TOMCAT development look: on the cat, cockpit + outside, the RIO seat. (The full test is tomcat.mjs.)
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.6');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 20000); await h.wait(1200);
  await h.key('tap', 'Digit8'); await h.wait(600);
  await h.expect('__G.G.craft === "tomcat" && __G.tomcatC.TP.A.cat && __G.tomcatC.TP.A.cat.state === "hold"');
  await h.eval('__G.cockpitCam = true'); await h.wait(1500);
  await h.shot('cockpit-cat');
  await h.eval('(__G.head.pitch = -0.5, 1)'); await h.wait(500); await h.shot('cockpit-panel');
  await h.eval('(__G.head.pitch = -0.45, __G.head.yaw = 0.9, 1)'); await h.wait(500); await h.shot('cockpit-left');
  await h.eval('(__G.head.pitch = -0.45, __G.head.yaw = -0.9, 1)'); await h.wait(500); await h.shot('cockpit-right');
  await h.eval('(__G.head.pitch = 0, __G.head.yaw = 0, 1)');
  await h.key('tap', 'BracketRight'); await h.wait(800); await h.shot('rio');
  await h.key('tap', 'BracketLeft'); await h.wait(300);
  await h.eval('(__G.cockpitCam = false, __G.tomcatC.TP.snapChase(), 1)'); await h.wait(1500); await h.shot('chase-cat');
  await h.eval('({hud: __G.tomcatC.hud().line, err: 0})');
}
