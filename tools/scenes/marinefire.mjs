// THE MARINE UNDER GROUND-WAR FIRE (ngc/bugsweep): the 1980 Marine stands on SANDBAR's pad, a squad of four STRIDERs
// is put down 45 m off and the war is stepped (game time) until their rounds hit him. Checks that the ground war's
// rounds reach hurtPlayer with their kind and hit point, so the medical sim takes them as bullet wounds on the body
// part they passed (with bleeding), not as anonymous fragments.
//   CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/marinefire.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&res=0.45');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed && __G.H.rpm > 0.9", 30000);
  await h.key('tap', 'KeyY'); await h.wait(600);
  await h.expect("__G.G.craft === 'foot'", 'out of the Huey on foot');
  await h.eval(`(() => { const W = __G.war, I = __G.ISLANDS.find(i => i.name === 'SANDBAR'); window.__I = I;
    W.E.mat = 0; W.transT = 1e9;   // the enemy commander stays out of it: this scene places the machines
    const x = I.pad.x, z = I.pad.z; __G.foot.spawnAt({ x, y: __G.terrainH(x, z), z, yaw: 0 });
    window.__ff = (secs, dt = 1 / 30, until) => { for (let i = 0; i < secs / dt; i++) { W.update(dt, __G.PL, false); if (until && until()) return +W.time.toFixed(1); } return false; };
    return { pad: [Math.round(x), Math.round(z)], owner: I.owner }; })()`);
  await h.wait(500);
  await h.eval(`(() => { const I = __I, a = 0.9, x = I.pad.x + Math.cos(a) * 45, z = I.pad.z + Math.sin(a) * 45;
    window.__P = __G.war.ground.addSquad(2, I, 4, x, z, { yaw: Math.atan2(-(I.pad.x - x), -(I.pad.z - z)), order: { type: 'take', x: I.pad.x, z: I.pad.z, r: 30 } });
    window.__log0 = __G.marine.M.log.length; return __P.members.map(u => u.weaponName); })()`);
  // game time, not wall-clock: step the war until a round has hit him (or 90 s of war)
  await h.eval(`__ff(90, 1 / 30, () => __G.marine.M.log.slice(__log0).some(e => e.type === 'hit') || !__G.foot.alive)`);
  await h.eval(`(() => { const M = __G.marine.M, L = M.log.slice(__log0); return { hits: L.filter(e => e.type === 'hit').map(e => ({ region: e.region, zone: e.zone, src: e.source, pen: e.penetrated, bleed: e.bleed })), bleeds: M.bleeds.map(b => b.region + ':' + b.type), msg: document.getElementById('msg').textContent, alive: __G.foot.alive, death: __G.Z.lastDeath && __G.Z.lastDeath.why }; })()`);
  await h.expect(`__G.marine.M.log.slice(__log0).some(e => e.type === 'hit' && /STRIDER RIFLE|NEEDLE/.test(e.source) && ['head','thorax','stomach','armL','armR','legL','legR'].includes(e.region))`, 'a STRIDER round hit him as a bullet on a body part');
  await h.expect(`!__G.marine.M.log.slice(__log0).some(e => e.type === 'hit' && /STRIDER FIRE/.test(e.source))`, 'no ground-war round arrived as anonymous fragments');
  // the wound bleeds (penetrating hits); let a few seconds of the medical sim run
  await h.wait(1500);
  await h.eval(`({ bleeds: __G.marine.M.bleeds.map(b => b.region + ':' + b.type + ':' + Math.round(b.rate)), lost: +__G.marine.M.lossFrac().toFixed(3) })`);
  await h.expect(`__G.marine.M.bleeds.length > 0 || !__G.foot.alive || __G.marine.M.log.slice(__log0).every(e => e.type !== 'hit' || !e.penetrated)`, 'a penetrating wound bleeds');
  await h.eval("(__G.marine.view = 'third', 1)"); await h.wait(800); await h.shot('marine-hit');
}
