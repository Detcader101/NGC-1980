// Infantry sound, measured: render the synthesised sounds offline (OfflineAudioContext) and check the physics of
// distance: a shot 340 m away arrives ~1 s late, quieter and darker than your own; its bullet's crack comes first;
// the echo comes after; a steel gong at 300 m rings after time of flight + the sound's return; footsteps differ by surface.
export default async function (h) {
  await h.goto('dev/infantry.html?view=model');
  await h.waitFor('window.__I', 15000);
  const r = await h.eval(`(async () => {
    const { InfantryAudio } = await import('/js/units/infantry/infantryaudio.js');
    const SR = 44100;
    async function render(secs, fn) {
      const ctx = new OfflineAudioContext(2, SR * secs, SR), A = new InfantryAudio(ctx); A.init(); fn(A);
      const buf = await ctx.startRendering(); return buf.getChannelData(0);
    }
    // stats over a window: peak, RMS, zero-crossing rate (brightness proxy), first time above a threshold
    const stats = (x, t0 = 0, t1 = x.length / SR) => { let pk = 0, ss = 0, zc = 0, n = 0; for (let i = Math.floor(t0 * SR); i < Math.min(x.length, t1 * SR); i++) { const v = x[i]; pk = Math.max(pk, Math.abs(v)); ss += v * v; n++; if (i && (x[i - 1] < 0) !== (v < 0)) zc++; } return { peak: +pk.toFixed(4), rms: +Math.sqrt(ss / Math.max(1, n)).toFixed(5), zcr: Math.round(zc / Math.max(1e-9, n / SR)) }; };
    const onset = (x, thr, from = 0) => { for (let i = Math.floor(from * SR); i < x.length; i++) if (Math.abs(x[i]) > thr) return +(i / SR).toFixed(3); return null; };
    const own = await render(2.5, A => A.shot({ weapon: 'M16A1', dist: 0 }));
    const far = await render(3.5, A => A.shot({ weapon: 'M16A1', dist: 340 }));
    const crack = await render(3.5, A => A.shot({ weapon: 'M16A1', dist: 340, crack: { miss: 3, delay: 0.25 } }));
    const gong = await render(2.5, A => A.impact('steel', 300));
    const steps = {}; for (const s of ['grass', 'concrete', 'water', 'wood']) steps[s] = stats(await render(0.6, A => A.footstep(s, 'run', 25)));
    const pkOwn = stats(own).peak, pkFar = stats(far).peak;
    return { own: stats(own, 0, 0.2), far: { onset: onset(far, pkFar * 0.2), ...stats(far, 0.95, 1.2) }, farEcho: stats(far, 1.7, 2.8),
      crack: { first: onset(crack, 0.05), report: onset(crack, pkFar * 0.2, 0.6) }, gong: { onset: onset(gong, 0.01), ring: stats(gong, 1.2, 2.0) }, steps, pkOwn, pkFar };
  })()`);
  await h.eval(`window.__aud = ${JSON.stringify(r ?? null)}`);
  await h.expect('__aud && Math.abs(__aud.far.onset - 1.0) < 0.06');           // 340 m at 340 m/s
  await h.expect('__aud && __aud.pkFar < __aud.pkOwn / 3');                      // quieter
  await h.expect('__aud && __aud.far.zcr < __aud.own.zcr * 0.8');                // darker (air absorbs the highs)
  await h.expect('__aud && __aud.crack.first < 0.3 && __aud.crack.report > 0.9'); // the crack before the report
  await h.expect('__aud && __aud.farEcho.rms > 0');                              // an echo after
  await h.expect('__aud && Math.abs(__aud.gong.onset - 300 / 340) < 0.06 && __aud.gong.ring.rms > 0.0001');   // the gong rings
  await h.expect('__aud && __aud.steps.water.rms > __aud.steps.grass.rms');      // splashing is louder than grass
}
