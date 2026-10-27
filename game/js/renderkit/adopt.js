// RenderKit adoption switch: one place that says which game areas use the Continuum RenderKit.
// Areas: 'surface' (vehicles/units/structures), 'world' (terrain/water/sky), 'fx' (particles),
// 'post' (desktop post pipeline), 'ui' (design.css menus/overlays + GPU HUD/text).
// ?rk=0 turns everything off, ?rk=1 / ?rk=all everything on, ?rk=surface,fx only those.
// Without the query the saved pause-menu choice (localStorage tz_rk) applies, default on.
// Materials are built at load, so a change applies after reload. Nothing here touches the DOM.
export const RK_AREAS = ['surface', 'world', 'fx', 'post', 'ui'];

function read() {
  let q = null, saved = null;
  try { q = new URLSearchParams(location.search).get('rk'); } catch (e) {}
  try { saved = localStorage.getItem('tz_rk'); } catch (e) {}
  const v = (q ?? saved ?? 'all').trim().toLowerCase();
  if (v === '0' || v === 'off' || v === 'none') return new Set();
  if (v === '1' || v === 'on' || v === 'all' || v === '') return new Set(RK_AREAS);
  return new Set(v.split(',').map(s => s.trim()).filter(s => RK_AREAS.includes(s)));
}

const on = read();
export const RK = {
  on: area => on.has(area),
  get any() { return on.size > 0; },
  get label() { return on.size === RK_AREAS.length ? 'ON' : on.size === 0 ? 'OFF' : [...on].join('+').toUpperCase(); },
  // Saves the choice for the next load (the menu shows "RELOAD TO APPLY").
  save(all) { try { localStorage.setItem('tz_rk', all ? 'all' : '0'); } catch (e) {} },
};
