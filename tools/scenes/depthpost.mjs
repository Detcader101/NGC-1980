// ngc/depth-post: the desktop post (AO, bloom, filmic grade) A/B. Same views with the kit's post on and off:
//   RKQ=rk=0 node snap.mjs scenes/depthpost.mjs --seed 7 --name dp-off
//   RKQ=rk=1 node snap.mjs scenes/depthpost.mjs --seed 7 --name dp-on        (RKQ='rk=1&rkpost=low' for a tier)
// Views: first person at the HQ (the user's report), the round sparks over it (the blue-disc bug), carrier deck, Huey
// cockpit, chase view over the island, explosions + burning wrecks, the sea towards the sun, a forest edge.
// With the post on, also the AO and bloom debug views and a draw-time A/B (scene alone vs scene + post, per tier).
// VIEWS=hq,tracers,... runs a subset.
const RKQ = process.env.RKQ || 'rk=1';
const VIEWS = (process.env.VIEWS || 'all').split(',');
const want = v => VIEWS.includes('all') || VIEWS.includes(v);
export default async function (h) {
  await h.goto(`?debug&auto&kb&peace&res=0.6&${RKQ}`);
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 60000); await h.wait(1500);
  const on = await h.eval('!!__G.rkPost');
  await h.eval(`(() => { const P = __G.rkPost; if (!P) return { post: false }; const t = P.post.target; return { post: true, quality: P.quality, target: [t.width, t.height, t.samples], depth: !!t.depthTexture, hdr: P.post.hdr, tm: __G.renderer.toneMapping, ocs: __G.renderer.outputColorSpace }; })()`, 'post state');
  const dbg = async name => { if (!on) return; for (const [k, n] of [[1, 'ao'], [2, 'bloom']]) { await h.eval(`(__G.rkPost.set('debug', ${k}), 1)`); await h.wait(700); await h.shot(name + '-' + n); } await h.eval(`(__G.rkPost.set('debug', 0), 1)`); };
  // draw-time A/B in one page: the world alone vs the world + post (per tier), each a render + 1-pixel readback
  const drawAB = async label => h.eval(`(() => { const g = __G, r = g.renderer, gl = r.getContext(), px = new Uint8Array(4), P = g.rkPost, out = {};
    const one = f => { const t = performance.now(); f(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t; };
    const kinds = { plain: () => r.render(g.sealife.bedMesh.parent, g.zCam) };
    if (P) for (const q of ['low', 'medium', 'high']) kinds[q] = () => { P.setQuality(q); P.render(g.sealife.bedMesh.parent, g.zCam); };
    const keep = P && P.quality, T = {}; for (const k in kinds) T[k] = [];
    for (let round = 0; round < 5; round++) for (const k of Object.keys(kinds)) { const d = one(kinds[k]); if (round) T[k].push(d); }
    if (P) P.setQuality(keep);
    for (const k in T) { const a = T[k].sort((x, y) => x - y); out[k] = +a[a.length >> 1].toFixed(1); }
    return out; })()`, 'draw-ms ' + label);

  // 1. first person at the HQ (the user's view: helipad, HQ, sandbags, masts, lattice tower)
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.eval('(() => { const p = __G.PAD; return __G.foot.spawnAt({ x: p.x + 6, y: p.h, z: p.z, yaw: Math.PI / 2 }); })()');
  await h.eval('(__G.marine.aim(1.57, 0.12), 1)'); await h.wait(1800);
  if (want('hq')) { await h.shot('hq-foot'); await h.notblank(); await dbg('hq-foot'); await drawAB('hq-foot'); }
  // tuning: TUNE='[{"ao.radius":0.3,...},...]' shoots the HQ view (and its AO) once per settings set
  if (on && process.env.TUNE) for (const [i, set] of JSON.parse(process.env.TUNE).entries()) {
    await h.eval(`(() => { const s = ${JSON.stringify(set)}; for (const k in s) __G.rkPost.set(k, s[k]); return s; })()`, 'tune ' + i);
    await h.wait(700); await h.shot('tune' + i); await dbg('tune' + i);
  }
  // 2. the blue discs: rounds over the base as a 133 fps frame sees them. The sparks are spawned through the war's own
  // tracer() (or the old one-spark-per-frame code when this build has none) with the add pool stepped 1/133 s per frame,
  // then the pool is frozen for the shot. Three WASP pulses (b.col cyan) and two own rounds.
  if (want('tracers')) {
    await h.eval(`(() => { const g = __G, A = g.fx.add, upd = A.update.bind(A); window.__frz = false; A.update = (dt, wx, wz) => upd(window.__frz ? 0 : dt, wx, wz);
      const c = g.zCam.position, F = new g.THREE.Vector3(); g.zCam.getWorldDirection(F); const R = new g.THREE.Vector3().crossVectors(F, new g.THREE.Vector3(0, 1, 0)).normalize();
      const rounds = [ { col: [0.55, 0.95, 1], side: 2, d: 40, rx: -9, up: 14, v: 90 }, { col: [0.55, 0.95, 1], side: 2, d: 26, rx: 4, up: 8, v: 90 }, { col: [0.55, 0.95, 1], side: 2, d: 22, rx: 8, up: 4, v: 90 },
        { side: 1, d: 30, rx: -3, up: 6, v: 140 }, { side: 1, d: 18, rx: 2, up: 2.5, v: 120 } ];
      const dt = 1 / 133, old = ${process.env.OLDTRACER ? 'true' : '!g.war.tracer'};
      for (let f = 0; f < 8; f++) { for (const q of rounds) { const b = { side: q.side, col: q.col }; const p = c.clone().addScaledVector(F, q.d).addScaledVector(R, q.rx).add(new g.THREE.Vector3(0, q.up, 0)), dir = R.clone().multiplyScalar(-1).add(new g.THREE.Vector3(0, -0.25, 0)).normalize();
          const x = p.x + dir.x * q.v * dt * f, y = p.y + dir.y * q.v * dt * f, z = p.z + dir.z * q.v * dt * f, px = x - dir.x * q.v * dt, py = y - dir.y * q.v * dt, pz = z - dir.z * q.v * dt;
          if (old) { const own = b.side === 1, k = b.col; if (k) A.spawn(x, y, z, 0, 0, 0, 0.06, 1.3, 0.8, k[0], k[1], k[2], 1); else A.spawn(x, y, z, 0, 0, 0, 0.05, own ? 0.9 : 1.1, 0.6, own ? .5 : 1, own ? 1 : .55, own ? 1 : .2, 1); }
          else g.war.tracer(b, x, y, z, px, py, pz); }
        upd(dt, 0, 0); }
      window.__frz = true; return { old, live: A.n }; })()`, 'tracer sparks');
    await h.wait(1200); await h.shot('hq-tracers');
    await h.eval('(window.__frz = false, 1)'); await h.wait(600);
  }
  await h.eval('(__G.toHeli(), 1)'); await h.wait(1500);
  // 3. carrier deck (chase camera, the opening view)
  if (want('deck')) {
    await h.eval('(__G.respawnHome && __G.respawnHome(), 1)'); await h.wait(2500);
    await h.waitFor('__G.H.landed', 20000).catch(() => {});
    await h.shot('deck'); await dbg('deck'); await drawAB('deck');
  }
  // 4. Huey cockpit
  if (want('cockpit')) {
    await h.eval('(__G.cockpitCam = true, window.__hy = [0.1, -0.25], window.__hyI = setInterval(() => { __G.head.yaw = __hy[0]; __G.head.pitch = __hy[1]; }, 5), 1)');
    await h.wait(1800); await h.shot('huey-cockpit'); await dbg('huey-cockpit');
    await h.eval('(clearInterval(__hyI), __G.cockpitCam = false, 1)'); await h.wait(500);
  }
  // 5. the Huey over the home island (chase)
  if (want('island')) {
    await h.eval('(__G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x + 90, __G.HOME_B.h + 45, __G.HOME_B.z + 120), 3.6, false, 1), __G.HI.setCollective(0.475), window.__hold = setInterval(() => { __G.H.vel.set(0, 0, 0); }, 16), 1)');
    await h.wait(2500); await h.shot('huey-over-island'); await dbg('huey-over-island');
  }
  // 6. a forest edge: the treeline on the home island, low
  if (want('forest')) {
    await h.eval(`(() => { const g = __G, B = g.HOME_B; for (let r = 60; r < 400; r += 10) for (let k = 0; k < 24; k++) { const a = k / 24 * 6.283, x = B.x + Math.cos(a) * r, z = B.z + Math.sin(a) * r; if (g.terrainH(x, z) > 4) { const gy = g.terrainH(x, z); g.H.reset(new g.THREE.Vector3(x, gy + 6, z), a + Math.PI, false, 1); g.HI.setCollective(0.5); return [x, z]; } } return null; })()`, 'forest spot');
    await h.wait(2500); await h.shot('forest'); await dbg('forest');
  }
  // 7. explosions and burning wrecks in front of a hovering Huey
  if (want('blasts')) {
    await h.eval('(__G.H.reset(new __G.THREE.Vector3(__G.HOME_B.x+20, 30, __G.HOME_B.z+60), 0, false, 1), __G.HI.setCollective(0.475), 1)');
    await h.wait(800);
    await h.eval("(() => { const B=__G.HOME_B, fx=__G.fx; for (let i=0;i<5;i++){ const x=B.x+5+i*9, z=B.z+20-i*6; fx.explode(x, __G.terrainH(x,z)+1, z, 1+i*0.5, {fire: 60, debris: 8}); } return fx.emitters.length })()");
    await h.wait(300); await h.shot('blasts'); await dbg('blasts');
    await h.wait(2500); await h.shot('burning');
  }
  // 8. the sea towards the sun (glint)
  if (want('seasun')) {
    await h.eval(`(() => { const g = __G, s = g.sealife.bedMesh.parent.children.find(o => o.isDirectionalLight) || null; const I = g.ISLANDS[0], L = (g.renderer && s) ? s.position.clone().normalize() : new g.THREE.Vector3(0.5, 0.6, 0.3);
      const x = I.x - I.r * 2.2, z = I.z - I.r * 2.2; g.H.reset(new g.THREE.Vector3(x, 14, z), Math.atan2(-L.x, -L.z), false, 1); g.HI.setCollective(0.5); window.__sun = [L.x, L.y, L.z]; return window.__sun; })()`, 'sun dir');
    await h.wait(1500);
    await h.eval(`(() => { const g = __G, F = new g.THREE.Vector3(); g.zCam.getWorldDirection(F); const L = window.__sun; if (F.x * L[0] + F.z * L[2] < 0) { g.H.reset(g.H.pos.clone(), Math.atan2(L[0], L[2]), false, 1); g.HI.setCollective(0.5); return 'flipped'; } return 'ok'; })()`, 'face the sun');
    await h.wait(2500); await h.shot('sea-sun'); await dbg('sea-sun');
  }
}
