// RUNAWAY sandbox, live (real-time loop, not fast-forwarded): sound switched on by a click, a follow camera on a
// STRIDER, frame rate, and no errors from the audio graph while a fight runs.   node snap.mjs scenes/runawaylive.mjs
export default async function (h) {
  await h.goto('dev/runaway.html?debug&scenario=combined&res=0.6&speed=2');
  await h.waitFor('window.__RW && __RW.B && __RW.B.units.length', 15000);
  await h.click(640, 400);                               // a user gesture: starts the AudioContext (RwAudio)
  await h.expect('!!__RW.audio', 'audio initialised');
  await h.eval('__RW.follow(1)');
  await h.wait(4000);
  await h.eval('({ frames: __RW.frames, t: __RW.B.time, audio: __RW.audio && __RW.audio.ctx.state })');
  await h.shot('live-follow');
  await h.eval('__RW.run(20)');                         // skip ahead to the fighting, then back to live
  await h.eval('__RW.follow(9)');
  await h.wait(5000);
  await h.shot('live-armour');
  await h.eval('({ frames: __RW.frames, t: __RW.B.time, stats: __RW.B.stats })');
  await h.expect('__RW.frames > 20', 'the loop runs');
}
