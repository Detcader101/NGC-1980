// quick probe (not a test): what the armour costs per frame on the title-free game start
export default async function (h) {
  await h.goto('?debug&kb&peace&res=0.45');
  await h.waitFor('window.__G', 10000);
  await h.key('tap', 'Enter'); await h.wait(4000);
  const m = `(() => { const t0 = performance.now(), s0 = __G.war.time; return new Promise(r => setTimeout(() => r({ simPerWall: +((__G.war.time - s0) / ((performance.now() - t0) / 1000)).toFixed(2), prof: JSON.stringify(Object.fromEntries(Object.entries(__G.PROF).map(([k, v]) => [k, +v.toFixed(1)]))), fps: document.getElementById('dbg').textContent, m113: __G.m113C.asleep, m60: __G.m60C.asleep }), 4000)); })()`;
  await h.eval(m);
  await h.eval(`(__G.m113C.stow(), __G.m60C.stow(), 1)`);
  await h.wait(1500);
  await h.eval(m);
}
