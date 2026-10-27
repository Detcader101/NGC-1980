// ngc/depth-figures: triangle / draw-call budget of every figure, classic (RK=0) vs RenderKit figures.
const RK = process.env.RK ?? '1';
export default async function (h) {
  await h.goto(`dev/infantry.html?view=model&rk=${RK}`);
  await h.waitFor('window.__I', 20000);
  await h.eval(`(async () => {
    const tri = o => { let t = 0, d = 0; o.traverse(m => { if (m.isMesh && m.geometry) { const g = m.geometry, n = g.index ? g.index.count : g.attributes.position.count; t += n / 3 * (m.isInstancedMesh ? 1 : 1); d++; } }); return { tris: Math.round(t), draws: d }; };
    const geoT = g => Math.round((g.index ? g.index.count : g.attributes.position.count) / 3);
    const S = await import('../js/units/infantry/soldiermodel.js'), F = await import('../js/units/air/rotary/figures.js'), C = await import('../js/interiors/crewfig.js');
    const V = await import('../js/units/infantry/viewmodel.js'), D = await import('../js/units/naval/deckcrew.js'), W = await import('../js/units/infantry/weaponmodels.js');
    const out = {};
    out.marineFull = tri(S.buildMarine({ seed: 1, weapon: 'M16A1', detail: 'low' }).root);
    out.marineFullPack = tri(S.buildMarine({ seed: 1, weapon: 'M16A1', detail: 'low', pack: true }).root);
    out.marineLite = tri(F.buildMarine({ variant: 0 }).group);
    out.m16high = tri(W.buildWeaponModel('M16A1', { detail: 'high' }).group);
    out.m16low = tri(W.buildWeaponModel('M16A1', { detail: 'low' }).group);
    const vm = V.createViewmodel(); out.viewmodelArms = tri(vm.root);
    out.crewSeated = geoT(C.crewGeometry('heloPilot', 'seated', { arms: 'controls' }));
    const A = await import('../js/world/ambient.js'); out.townsperson = geoT(A.personGeo());
    const crew = D.createCrew([{ x: 0, z: 0, jersey: 'yellow' }]); out.deckCrewPerPerson = { tris: geoT(crew.J.geometry) + geoT(crew.B.geometry) + 2 * geoT(crew.A.geometry) + 2 * geoT(crew.L.geometry), draws: 4 };
    const per = {}; S.buildMarine({ seed: 1, weapon: null, detail: 'low' }).root.traverse(m => { if (m.isMesh) per[m.name] = geoT(m.geometry); }); out.perBoneLow = per;
    const pl = []; F.buildMarine({ variant: 0 }).group.traverse(m => { if (m.isMesh) pl.push(geoT(m.geometry)); }); out.litePer = pl;
    window.__stats = out; return out; })()`);
  await h.wait(200);
  await h.eval('JSON.stringify(window.__stats)');
}
