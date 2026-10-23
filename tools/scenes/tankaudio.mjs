// Armour sound check: renders the synthesised mix offline (OfflineAudioContext) for a few states of the M60A3 and the
// M113 and measures the level and the spectral balance: idle vs full load, moving (track clank) vs parked, inside
// (muffled) vs outside, the main gun. Proves the graph builds and responds; listen on the dev page for the character.
//   CHROME_PATH=... node snap.mjs scenes/tankaudio.mjs
export default async function (h) {
  await h.goto('dev/tank.html?debug&ui=0&res=0.4');
  await h.waitFor('window.__T', 15000);
  await h.eval(`(async () => {
    const { ArmorAudio } = await import('../js/units/armor/armoraudio.js');
    const { createM60A3 } = await import('../js/units/armor/m60a3.js');
    const { createM113 } = await import('../js/units/armor/m113.js');
    const TG = __T.TG, sr = 22050;
    // render 1.0 s of a state: set the vehicle up, update the audio graph once, render, return RMS overall and > 2 kHz
    async function render(make, setup, opts) {
      const ctx = new OfflineAudioContext(1, sr, sr), A = new ArmorAudio(ctx, ctx.destination); A.init();
      const V = make(); V.reset(0, 40, 0, TG.ENV, { range: 'N' }); setup(V);
      A.update(V, opts.veh || 'm60', { inside: !!opts.inside, cam: { x: V.fm.pos[0] + 8, y: V.fm.pos[1], z: V.fm.pos[2] } });
      if (opts.gun) A.mainGun();
      const buf = await ctx.startRendering(), d = buf.getChannelData(0);
      let s = 0, hs = 0, prev = 0; for (let i = 4000; i < d.length; i++) { s += d[i] * d[i]; const hp = d[i] - prev; prev = d[i]; hs += hp * hp; }
      const n = d.length - 4000; return { rms: +Math.sqrt(s / n).toFixed(4), hi: +Math.sqrt(hs / n).toFixed(4) };
    }
    const drive = (thr, steer = 0) => V => { for (let i = 0; i < 360; i++) V.step(1 / 60, TG.ENV, { throttle: thr, steer, range: i < 120 ? 'L' : 'H', park: false }); };
    const out = {};
    out.idle = await render(createM60A3, () => {}, {});
    out.loaded = await render(createM60A3, drive(1), {});
    out.turning = await render(createM60A3, drive(1, 0.8), {});
    out.inside = await render(createM60A3, drive(1), { inside: true });
    out.gun = await render(createM60A3, () => {}, { gun: true });
    out.m113 = await render(createM113, V => { for (let i = 0; i < 360; i++) V.step(1 / 60, TG.ENV, { throttle: 1, range: '1-3', park: false }); }, { veh: 'm113' });
    window.__aud = out; return out;
  })()`);
  await h.expect('__aud.idle.rms > 0.002 && __aud.loaded.rms > __aud.idle.rms');
  await h.expect('__aud.inside.hi < __aud.loaded.hi');
  await h.expect('__aud.gun.rms > __aud.idle.rms * 2');
  await h.expect('__aud.m113.rms > 0.002');
}
