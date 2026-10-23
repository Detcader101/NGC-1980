// Hit registration on the soldier skeleton: shoot the hitbox mannequin (25 m, x = -10) at its head, chest, stomach,
// arm and legs from the bench, and check the part names, the helmet layer, and the hit info MEDINV gets.
export default async function (h) {
  await h.goto('dev/infantry.html?debug&fixed&nosway&res=1');
  await h.waitFor('window.__I', 15000);
  const A = (e) => h.eval(e);
  await A('(__I.teleport(-10, 1.2, 0), __I.advance(0.3))');
  // the mannequin's bone positions (world) -> aim points
  const targets = await A(`(() => { const d = __I.dummy, v = new __I.THREE.Vector3(), out = {};
    for (const [k, b, p] of [['head', 'head', [0, 0.16, 0]], ['thorax', 'chest', [0, 0.06, -0.05]], ['stomach', 'spine', [0, 0.08, -0.05]], ['armR', 'forearmR', [0, -0.12, 0]], ['legL', 'thighL', [0, -0.25, 0]], ['legR', 'shinR', [0, -0.2, 0]]]) { d.bones[b].localToWorld(v.set(...p)); out[k] = v.toArray(); }
    return out; })()`);
  const results = {};
  for (const [part, p] of Object.entries(targets)) {
    await A(`(__I.aimAt(${p[0]}, ${p[1]}, ${p[2]}), __I.advance(0.4, { ads: true }), __I.advance(0.05, { ads: true, fire: true }), __I.advance(0.3, { ads: true, fire: false }))`);
    results[part] = await A('__I.log[0]');
  }
  await A('window.__hits = ' + JSON.stringify(results));
  await h.shot('mannequin_after');
  await A("(__I.third = false, __I.scope = true, __I.render())");
  for (const k of Object.keys(targets)) await h.expect(`/HIT mannequin: ${k}  (8|9)\\d\\d m\\/s.* 26 m$/.test(__hits.${k})`);   // one hit, full speed, the shot's own range
  await h.expect(`/M1 helmet/.test(__hits.head) || /HIT mannequin: head/.test(__hits.head)`);
}
