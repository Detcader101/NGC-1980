// ngc/look-huey: the hi-fi UH-1H on the dev turntable (game/dev/huey.html), every angle the brief asks for, plus the
// classic model (?rk=0) from the same cameras for before/after. HUEYLOOK_ONLY=name1,name2 limits the views.
// node snap.mjs scenes/hueylook.mjs
const PI = Math.PI;
export const VIEWS = [
  ['front34', 'cam=' + [PI + 0.6, 0.12, 19, 0, 0.6, 1.5]],
  ['side_left', 'cam=' + [-PI / 2, 0.03, 20, 0, 0.6, 2.6]],
  ['rear34', 'cam=' + [0.75, 0.2, 20, 0, 0.8, 2.5]],
  ['front', 'cam=' + [PI, 0.06, 13, 0, 0.2, 0]],
  ['top', 'cam=' + [0.0001, 1.45, 24, 0, 0, 2]],
  ['nose_close', 'cam=' + [PI + 0.9, 0.1, 6.5, 0, -0.2, -2.2]],
  ['rotor_head', 'cam=' + [PI + 0.8, 0.28, 4.2, 0, 2.0, -0.12]],
  ['tail_close', 'cam=' + [-PI / 2 + 0.35, 0.12, 6.5, 0, 1.4, 8.4]],
  ['cabin_door', 'cam=' + [-PI / 2 + 0.2, 0.05, 5.0, 0, -0.3, 0.6]],
  ['under', 'cam=' + [PI + 0.5, -0.25, 9, 0, -1.2, 0]],
  ['mid60', 'cam=' + [PI + 0.6, 0.12, 60, 0, 0.6, 1.5]],
  ['mid120', 'cam=' + [PI + 0.6, 0.2, 120, 0, 0.6, 1.5]],
  ['far300', 'cam=' + [PI + 0.6, 0.2, 300, 0, 0.6, 1.5] + '&fov=12'],
  ['pilot_panel', 'ck=1&ckyaw=0&ckpitch=-0.3'],
  ['pilot_overhead', 'ck=1&ckyaw=0&ckpitch=0.9'],
  ['pilot_pedestal', 'ck=1&ckyaw=0.55&ckpitch=-0.75'],
  ['pilot_left', 'ck=1&ckyaw=1.3&ckpitch=-0.1'],
  ['pilot_back', 'ck=1&ckyaw=2.6&ckpitch=-0.2'],
  ['checker_side', 'checker=1&cam=' + [-PI / 2 + 0.3, 0.25, 15, 0, 0.0, 2.0]],
  ['checker_top', 'checker=1&cam=' + [PI + 0.5, 0.9, 13, 0, 0.3, 0.0]],
  ['mark_boom_left', 'cam=' + [-PI / 2, 0.05, 5, 0, -0.2, 4.1]],
  ['mark_boom_right', 'cam=' + [PI / 2, 0.05, 5, 0, -0.2, 4.1]],
  ['mark_top_nostep', 'cam=' + [-PI / 2 + 0.2, 1.1, 4.5, 0, 0.75, 0.65] + '&s=' + encodeURIComponent(JSON.stringify({ nr: 0, run: false }))],
  ['mark_nose_data', 'cam=' + [-PI / 2 - 0.35, 0.05, 3.2, 0, -0.75, -3.0]],
  ['mark_fuel', 'cam=' + [PI / 2 + 0.1, 0.05, 3.2, 0, -0.2, 1.4]],
  ['mark_fin_right', 'cam=' + [PI / 2, 0.1, 5, 0, 0.9, 8.1]],
  ['mark_fin_left', 'cam=' + [-PI / 2, 0.1, 5, 0, 0.9, 8.1]],
  ['pods_door', 'cam=' + [-PI / 2 - 0.5, 0.15, 6, -1.2, -0.8, -0.3]],
  ['rest_droop', 'cam=' + [-PI / 2 + 0.25, 0.1, 21, 0, 0.8, 1.5] + '&s=' + encodeURIComponent(JSON.stringify({ nr: 0, run: false, n1: 0, cargoDoor: 0 }))],
];
export default async function (h) {
  const only = (process.env.HUEYLOOK_ONLY || '').split(',').filter(Boolean);
  const rk = process.env.HUEYLOOK_RK0 ? '&rk=0' : '';
  let first = true;
  for (const [name, q] of VIEWS) {
    if (only.length && !only.includes(name)) continue;
    await h.goto(`dev/huey.html?ui=0${rk}&${q}`);
    await h.waitFor('window.__H', 60000); if (!(await h.eval('!!window.__H'))) throw new Error('preview did not load');
    await h.eval('(__H.render(0.016), true)'); await h.wait(300); await h.eval('(__H.render(0), true)');
    if (first) { await h.eval('({ build: Math.round(__H.buildMs), stats: __H.huey.stats })', 'stats'); first = false; }
    await h.shot(name);
  }
}
