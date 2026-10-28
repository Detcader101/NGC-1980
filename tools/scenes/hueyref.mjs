// ngc/look-huey: the model over the TM 55-1520-210-10 three-view (dev/huey.html?ref=side|front|top), shaded and as a
// silhouette, plus the photo-matching front-left-above view. node snap.mjs scenes/hueyref.mjs [--width 1970 --height 1586]
const PI = Math.PI;
const VIEWS = [
  ['ref_side', 'ref=side'], ['ref_side_sil', 'ref=side&sil=1'], ['ref_front', 'ref=front'], ['ref_front_sil', 'ref=front&sil=1'], ['ref_top', 'ref=top'],
  // the user's air-to-air photo: above, long lens (~120 mm: 17 deg vertical FOV), nose low and toward the lower right,
  // slight bank; both diagonals so the side can be checked (run at --width 870 --height 1306, the photo's aspect)
  ['photo_match_R', 'fov=30&ground=0&rot=-0.28,0,0.18&cam=' + [PI - 0.75, 0.24, 26.5, -0.6, 0.2, 2.0] + '&s=' + encodeURIComponent(JSON.stringify({ tx: 0.06, cargoDoor: 1 }))],
  ['photo_match_L', 'fov=17&ground=0&rot=-0.3,0,0.12&cam=' + [PI + 0.75, 0.48, 47, 0, 0.2, 1.0] + '&s=' + encodeURIComponent(JSON.stringify({ tx: 0.06, cargoDoor: 1 }))],
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
