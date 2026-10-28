// ngc/look-people: build cost and triangles of the person geometries (each LOD), timed in the page (SwiftShader
// machine: relative numbers only)
export default async function (h) {
  const A = (e, l) => h.eval(e, l);
  await h.goto(`dev/infantry.html?view=model`);
  await h.waitFor('window.__I', 30000);
  await A(`(async () => {
    const H = await import('../js/units/infantry/humanfig.js');
    const out = {};
    for (const lod of ['hero', 'near', 'mid']) for (const face of [0, 1]) {
      const t0 = performance.now(); const g = H.marineGeometry({ lod, face: face + 10, sleeves: 'rolled', vest: true, helmet: true });
      out[lod + face] = { ms: Math.round(performance.now() - t0), tris: g.userData.tris, verts: g.attributes.position.count };
    }
    window.__st = out; return true; })()`);
  await h.wait(100);
  await A('JSON.stringify(window.__st)', 'stats');
}
