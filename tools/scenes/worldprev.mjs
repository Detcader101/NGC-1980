// The lived-in world in the preview page (game/dev/world.html): a village, a town, a harbour, a farm, a bridge, a
// zone island, near and far detail. Fast to iterate on the models without the game around them.
export default {
  name: 'worldprev',
  query: 'dev/world.html?focus=village&dist=220&pitch=24',
  steps: [
    'waitFor 30000 window.__ready', 'wait 800', 'eval window.__stats', 'shot village', 'notblank',
    'eval (__view(200, 9, 70), 1)', 'wait 400', 'shot village-low',
    'goto dev/world.html?focus=town&dist=320&pitch=30', 'waitFor 30000 window.__ready', 'wait 800', 'eval window.__stats', 'shot town',
    'eval (__view(120, 6, 60), 1)', 'wait 400', 'shot town-street',
    'goto dev/world.html?focus=harbour&dist=160&pitch=22&yaw=200', 'waitFor 30000 window.__ready', 'wait 800', 'eval window.__stats', 'shot harbour',
    'goto dev/world.html?focus=farm&dist=260&pitch=35', 'waitFor 30000 window.__ready', 'wait 800', 'eval window.__stats', 'shot farm',
    'goto dev/world.html?focus=bridge&dist=180&pitch=15', 'waitFor 30000 window.__ready', 'wait 800', 'eval window.__stats', 'shot bridge',
    'goto dev/world.html?focus=town&dist=900&pitch=35&lod=far&size=2000&fogf=2600', 'waitFor 30000 window.__ready', 'wait 800', 'eval window.__stats', 'shot town-far',
    'goto dev/world.html?focus=zone&island=HOME%20ISLAND&dist=320&pitch=40&size=400', 'waitFor 30000 window.__ready', 'wait 800', 'eval window.__stats', 'shot zone-home',
  ],
};
