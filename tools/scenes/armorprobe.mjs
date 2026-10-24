// quick probe (not a test): why doesn't the gunner fire at the hard top
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 30000);
  await h.eval(`(__G.crafts.control('m60', 1, 'foot'), 1)`);
  await h.waitFor("__G.m60C.V.gun.state === 'ready' && __G.m60C.fm.eng.running", 30000);
  const st = `(() => { const T = __G.m60C, V = T.V; return { gun: V.gun.state, hp: V.armor.COMPS.find(c => c.id === 'gun').hp, breech: V.armor.COMPS.find(c => c.id === 'breech').hp, master: V.elec.master, batt: +V.elec.batt.toFixed(2), power: V.power, hyd: +V.hydP.toFixed(2), crew: JSON.stringify(V.crew), msg: document.getElementById('msg').textContent, shots: T.gunnery.stats.shots, seat: __G.crafts.seat, tap: T.fireTap }; })()`;
  await h.eval(st);
  await h.key('down', 'KeyF'); await h.wait(700); await h.key('up', 'KeyF'); await h.wait(300);
  await h.eval(st);
}
