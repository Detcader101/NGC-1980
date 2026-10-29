// ngc/perf-render: per-unit render budgets (docs/ngc1980/PERF-BUDGETS.md). Boots the game, finds one live instance of
// each budgeted model, and counts its draw calls and triangles as the camera would see it at three distances: LOD0
// (near, everything), 200 m and 800 m (renderkit/lod.js detail fades and authored LOD levels switched as updateLODs
// would). Fails when a unit is over its budget at any distance. Interiors / cockpits count with the model (they are
// drawn whenever the craft is). Prints a PERFBUDGET table line for the doc.
//   node snap.mjs scenes/perfbudget.mjs
// Budgets: [draws, tris] per distance (main pass, one instance; shadow passes add up to ~1x more for casters).
// enforce: the distances judged now. The others are reported as "LOD missing" until the model gets its levels: legacy
// models are judged at LOD0 only; a model rebuilt by a look-* workstream sets enforce: ALL (see PERF-BUDGETS.md).
const E0 = ['lod0'], ALL = ['lod0', 'm200', 'm800'];
export const BUDGETS = {
  // aircraft: exterior + cockpit (DCS-level cockpits are the big part); LOD1 by 200 m, LOD2 by 800 m
  huey:     { lod0: [260, 250e3], m200: [120, 80e3], m800: [40, 20e3], enforce: E0 },   // look-huey: switch to ALL with its LODs
  hornet:   { lod0: [160, 200e3], m200: [110, 60e3], m800: [40, 15e3], enforce: ALL },   // look-units: traced airframe with its levels (59 / 67 / 20 draws)
  tomcat:   { lod0: [200, 200e3], m200: [130, 60e3], m800: [40, 15e3], enforce: E0 },
  ch46:     { lod0: [160, 150e3], m200: [100, 50e3], m800: [40, 15e3], enforce: E0 },
  wasp:     { lod0: [90, 60e3], m200: [70, 30e3], m800: [30, 10e3], enforce: E0 },
  // ground vehicles: exterior + crew-station interior (wheeled: the game swaps in a 1-draw baked far model past 60 m)
  M60A3:    { lod0: [160, 120e3], m200: [80, 60e3], m800: [30, 15e3], enforce: E0 },
  M113A2:   { lod0: [120, 80e3], m200: [60, 40e3], m800: [25, 10e3], enforce: E0 },
  m35:      { lod0: [110, 60e3], m200: [80, 40e3], m800: [30, 10e3], enforce: E0 },
  m151:     { lod0: [80, 40e3], m200: [60, 25e3], m800: [25, 8e3], enforce: E0 },
  // ships: hull, island, deck furniture, parked aircraft and crew (the whole group)
  ALBATROSS: { lod0: [420, 700e3], m200: [320, 450e3], m800: [200, 250e3], enforce: E0 },
  // fixed structures (all static: merged)
  'LANDING HARD': { lod0: [8, 4e3], m200: [8, 4e3], m800: [8, 4e3], enforce: ALL },
};
const NAMES = Object.keys(BUDGETS);
export default { name: 'perfbudget', seed: 1980, query: '?debug&auto&kb&peace&res=0.4', run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 90000);
  await h.wait(8000);
  const R = await h.eval(`(async () => {
    const g = __G, sc = g.sealife.bedMesh.parent, { lodEntries, BAND } = await import('/js/renderkit/lod.js');
    const names = ${JSON.stringify(NAMES)}, out = {};
    // detail entries (lod.js) by mesh / level object, to switch them as updateLODs would at a distance
    const E = [...lodEntries()];
    const offAt = (o, d) => { for (const e of E) for (const l of e.levels) { if (l.object !== o) continue; const lo = l.near * (1 - BAND), hi = Number.isFinite(l.far) ? l.far * (1 + BAND) : Infinity; if (d < lo || d > hi) return true; } return false; };
    const count = (root, d) => { let draws = 0, tris = 0;
      const walk = (o, hidden) => { if (o !== root && !o.visible) return; if (offAt(o, d)) return;
        if ((o.isMesh || o.isLine || o.isPoints) && o.layers.mask && !o.isSprite) { const m = o.material, gg = o.geometry; if (m && (Array.isArray(m) || m.visible !== false) && gg) {
          const n = o.isInstancedMesh ? o.count : 1, idx = gg.index ? gg.index.count : gg.attributes.position?.count || 0, cnt = Math.min(idx, gg.drawRange.count);
          if (n > 0 && cnt > 0) { draws += Array.isArray(m) ? Math.max(1, gg.groups.length) : 1; if (o.isMesh) tris += cnt / 3 * n; } } }
        for (const c of o.children) walk(c); };
      walk(root); return [draws, Math.round(tris)]; };
    for (const o of sc.children) { const key = /LANDING HARD|HARD$/.test(o.name) ? 'LANDING HARD' : o.name; if (!names.includes(key) || out[key]) continue;
      out[key] = { lod0: count(o, 0), m200: count(o, 200), m800: count(o, 800) }; }
    return out; })()`, 'budgets');
  const rows = [], over = [], missing = [];
  for (const k of NAMES) {
    const m = R[k], b = BUDGETS[k];
    if (!m) { rows.push(`${k}: not found`); continue; }
    for (const L of ['lod0', 'm200', 'm800']) if (m[L][0] > b[L][0] || m[L][1] > b[L][1]) (b.enforce.includes(L) ? over : missing).push(`${k} ${L}: ${m[L][0]} draws / ${m[L][1]} tris > ${b[L][0]} / ${b[L][1]}`);
    rows.push(`${k}: ${['lod0', 'm200', 'm800'].map(L => `${L} ${m[L][0]}/${Math.round(m[L][1] / 100) / 10}k`).join('  ')}`);
  }
  console.log('PERFBUDGET ' + JSON.stringify(R));
  h.log('note', rows.join('\n'));
  h.log('note', 'LOD missing (reported, not judged yet): ' + (missing.join(' | ') || 'none'));
  await h.expect(String(over.length === 0), 'every unit within its draw / triangle budget at LOD0, 200 m and 800 m: ' + over.join(' | '));
}};
