// caves.mjs - fly into every base's procedurally generated cave and screenshot it: the shaft on entry, the helicopter
// set down beside the pod (or the reservoir at home) and on the landing pad. Checks each cave is its own level, that
// the five caves built in well under a second, and that the ship survives on the floors the generator promised.
//
//   CHROME_PATH=... node snap.mjs scenes/caves.mjs
const land = (x, floorY) => `(()=>{ const T=__G.T; for (const u of T.turrets) { u.alive=false; u.mesh.visible=false; } T.tb.length=0; T.pod.attached=false;
  Object.assign(T,{x:${x}, y:${floorY}+0.78, vx:0, vy:0, ang:0, w:0, landed:true, guide:0}); __G.HI.setCollective(0); return [T.x,T.y]; })()`;

export default {
  name: 'caves',
  query: '?debug&kb&peace&thrust=0&res=0.45',
  async run(ctx) {
    await ctx.waitFor('window.__G && __G.G.mode==="thrust"', 15000);
    await ctx.eval('({caveBuildMs: +__G.PROF.caves.toFixed(1), caves: __G.BASES.map(b => ({name: b.name, tier: b.tier, W: b.L.W, H: b.L.H, turrets: b.L.turrets.length, tanks: b.L.tanks.length, attempts: b.L.attempts, route: b.L.route}))})', 'caves');
    await ctx.expect('__G.PROF.caves < 1000', 'all caves built in under a second');
    await ctx.expect('new Set(__G.BASES.map(b => b.L.solid.join(""))).size === __G.BASES.length', 'every cave is different');
    await ctx.expect('__G.BASES.every(b => b.group.children[0] !== __G.BASES[0].group.children[0] || b === __G.BASES[0])', 'one mesh per base');
    for (let i = 0; i < 5; i++) {
      if (i) await ctx.goto(`?debug&kb&peace&thrust=${i}&res=0.45`);
      await ctx.waitFor('window.__G && __G.G.mode==="thrust"', 15000);
      await ctx.eval('(__G.HI.setCollective(0.42), __G.H.rpm = 1, 1)');
      await ctx.waitFor("__G.camB > 0.99", 15000);
      await ctx.wait(1000);
      const name = await ctx.eval('__G.T.base.name.replace(/ /g, "-").toLowerCase()');
      await ctx.shot(`${i}-${name}-entry`);
      await ctx.notblank(0.02);
      const home = await ctx.eval('__G.T.base.kind === "home"');
      // beside the pod (enemy) / the reservoir (home)
      const spot = await ctx.eval(home ? '[__G.T.lvl.tanks[1].x - 5, __G.T.lvl.padTop]' : '[__G.T.lvl.orb.x - 3.2, Math.floor(__G.T.lvl.orb.y)]');
      await ctx.eval(land(spot[0], spot[1]));
      await ctx.wait(1500);
      await ctx.expect('__G.T.alive && __G.G.mode === "thrust" && __G.T.landed', `${name}: parked by the ${home ? 'reservoir' : 'pod'}`);
      await ctx.shot(`${i}-${name}-${home ? 'reservoir' : 'pod'}`);
      if (!home) {
        await ctx.eval('(()=>{ const T=__G.T, p=T.pod; Object.assign(T,{x:p.x, y:p.y+3.6, vx:0, vy:0, ang:0, w:0, landed:false}); __G.HI.setCollective(0.47); return [p.x,p.y]; })()');
        await ctx.key('down', 'KeyR'); await ctx.wait(700); await ctx.key('up', 'KeyR');
        await ctx.expect('__G.T.pod.attached', `${name}: the winch reaches the pod`);
      }
      await ctx.eval(land('__G.T.lvl.start.x', '__G.T.lvl.padTop'));
      await ctx.wait(1500);
      await ctx.expect('__G.T.alive && __G.T.landed', `${name}: parked on the pad`);
      await ctx.shot(`${i}-${name}-pad`);
    }
  },
};
