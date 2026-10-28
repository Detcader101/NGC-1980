// ngc/look-huey: the model over the TM 55-1520-210-10 three-view (dev/huey.html?ref=side|front|top), shaded and as a
// silhouette, plus the photo-matching front-left-above view. node snap.mjs scenes/hueyref.mjs [--width 1970 --height 1586]
const PI = Math.PI;
const VIEWS = [
  ['ref_side', 'ref=side'], ['ref_side_sil', 'ref=side&sil=1'], ['ref_front', 'ref=front'], ['ref_front_sil', 'ref=front&sil=1'], ['ref_top', 'ref=top'],
  // the user's air-to-air photo: front-right, above, nose low, banked toward the camera (run at --width 870 --height 1306)
  ['photo_match', 'fov=36&ground=0&rot=0.2,0,-0.3&cam=' + [PI - 0.62, 0.42, 17, 0, 0.3, 0.8] + '&s=' + encodeURIComponent(JSON.stringify({ tx: 0.06, cargoDoor: 1 }))],
];
export default async function (h) {
  const only = (process.env.HUEYLOOK_ONLY || '').split(',').filter(Boolean);
  for (const [name, q] of VIEWS) {
    if (only.length && !only.includes(name)) continue;
    await h.goto(`dev/huey.html?ui=0&${q}`);
    await h.waitFor('window.__H', 60000); if (!(await h.eval('!!window.__H'))) throw new Error('preview did not load');
    await h.eval('(__H.render(0.016), true)'); await h.wait(300); await h.eval('(__H.render(0), true)');
    await h.shot(name);
  }
}
