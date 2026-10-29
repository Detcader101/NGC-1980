// (ngc/look-terrain) the map: the minimap, the big map fitted to the zone, zoomed out to the world round it (coasts,
// wild land, WESTGATE, settlements), zoomed in on HOME ISLAND, panned by a drag, the zoom buttons; fog of war on.
//   node snap.mjs scenes/lookmap.mjs
export default { name: 'lookmap', seed: 1980, query: '?debug&auto&kb&peace&res=0.5', run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play'", 90000);
  await h.wait(20000);   // the terrain worker's windows, then the world image
  await h.shot('minimap');
  await h.key('tap', 'KeyM'); await h.wait(1500); await h.shot('map-zone');
  const box = await h.eval("(() => { const r = document.getElementById('radar').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()");
  for (let i = 0; i < 4; i++) await h.key('tap', 'Minus');
  await h.wait(1500); await h.shot('map-world'); await h.expect("document.getElementById('radar').classList.contains('big')");
  for (let i = 0; i < 7; i++) await h.key('tap', 'Equal');
  await h.wait(1500); await h.shot('map-zoomed-centre');
  // drag to pan (mouse), then the ZONE button resets
  await h.eval(`(() => { const c = document.getElementById('radar'), r = c.getBoundingClientRect(), m = (t, x, y) => (t === 'mousedown' ? c : window).dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, bubbles: true }));
    m('mousedown', r.x + 600, r.y + 400); m('mousemove', r.x + 800, r.y + 250); m('mousemove', r.x + 900, r.y + 200); m('mouseup', r.x + 900, r.y + 200); return 1; })()`);
  await h.wait(1500); await h.shot('map-panned');
  await h.expect('true');
  console.log('BOX ' + JSON.stringify(box));
}};
