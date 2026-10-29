// ngc/huey-sight: the pilot's XM60 reflex sight on dev/huey.html - stowed and deployed close-ups (from the cabin, the
// cockpit hidden around it only by the camera), the pilot's eye with the reticle on a marker at the harmonisation
// range, and the same with the head moved (the collimated reticle must stay on the marker).
// node snap.mjs scenes/hueysight.mjs
const PI = Math.PI, T = 'target=0,-3.8,-250.6&ground=0';
const VIEWS = [
  ['sight_stowed', 'ck=1&fov=60&ckyaw=0.25&ckpitch=0.55'],
  ['sight_deployed', 'ck=1&sight=1&fov=60&ckyaw=0.25&ckpitch=0.2'],
  ['sight_outside_close', 'sight=1&ck=0&cam=' + [PI + 0.5, 0.15, 1.6, 0.55, 0.2, -2.25]],
  ['pilot_eye_on_target', 'ck=1&sight=1&fov=40&ckyaw=0&ckpitch=-0.02&' + T],
  ['pilot_eye_head_moved', 'ck=1&sight=1&fov=40&ckyaw=0.06&ckpitch=0.03&eyeoff=0.04,0.03,0&' + T],
];
export default async function (h) {
  const only = (process.env.HUEYLOOK_ONLY || '').split(',').filter(Boolean);
  for (const [name, q] of VIEWS) {
    if (only.length && !only.includes(name)) continue;
    await h.goto(`dev/huey.html?ui=0&${q}`);
    await h.waitFor('window.__H', 60000);
    await h.eval('(__H.render(0.5), __H.render(0.5), __H.render(0), true)'); await h.wait(200); await h.eval('(__H.render(0), true)');
    await h.shot(name);
  }
}
