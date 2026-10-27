// Naval models on the preview page (dev/ships.html): every ship from several angles, motion frozen, plus draw-call
// and triangle counts. node snap.mjs scenes/shipsdev.mjs [--name x]   (SHIPS=albatross,kraken to pick)
const ALL = {
  albatross: [['a-34', '0.9,0.32,150,0,8,0'], ['a-bowhigh', '-0.5,0.55,110,0,8,-20'], ['a-island', '1.6,0.18,46,10,16,6'], ['a-deck', '2.6,0.5,70,0,8,10'], ['a-stern', '0.15,0.12,95,0,6,40'], ['a-crew', '1.3,0.45,30,6,9,-30'], ['a-side', '1.5708,0.04,150,0,6,0'], ['a-top', '0,1.45,150,0,0,0']],
  kraken: [['k-34', '0.9,0.32,160,0,8,0'], ['k-island', '1.4,0.2,50,10,14,28'], ['k-deck', '2.4,0.55,80,0,8,0'], ['k-side', '-1.5708,0.04,160,0,6,0'], ['k-top', '0,1.45,160,0,0,0']],
  leviathan: [['l-34', '0.8,0.25,110,0,4,0'], ['l-turret', '1.2,0.25,40,0,8,-24'], ['l-side', '1.5708,0.04,110,0,4,0'], ['l-top', '0,1.45,110,0,0,0']],
  container: [['c-34', '0.8,0.28,90,0,6,0'], ['c-bridge', '2.4,0.25,40,0,10,28'], ['c-side', '1.5708,0.04,95,0,5,0'], ['c-top', '0,1.45,95,0,0,0']],
};
export default async function (h) {
  const pick = (process.env.SHIPS || Object.keys(ALL).join(',')).split(',');
  for (const ship of pick) {
    await h.goto(`dev/ships.html?ui=0&freeze=1&ship=${ship}`);
    await h.waitFor('window.__S && window.__S.cur', 15000);
    await h.wait(800);
    for (const [name, cam] of ALL[ship]) {
      await h.eval(`(() => { const S = __S, [y, p, d, x, yy, z] = '${cam}'.split(',').map(Number); Object.assign(S.cam, { yaw: y, pitch: p, dist: d }); S.cam.t.set(x || 0, yy || 0, z || 0); return true; })()`);
      await h.wait(700);
      await h.shot(name);
    }
    await h.eval(`(() => { const S = __S; S.render(); const i = S.renderer.info.render; let meshes = 0; S.cur.parts.group.traverse(o => { if (o.isMesh) meshes++; }); return { ship: '${ship}', calls: i.calls, tris: i.triangles, meshes }; })()`);
  }
}
