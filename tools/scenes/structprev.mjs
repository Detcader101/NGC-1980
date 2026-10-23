// Faction structures in the preview page: rows hq / fuel / depot / radar; columns neutral, ours, ours damaged, ours
// destroyed, RUNAWAY, RUNAWAY damaged, RUNAWAY destroyed, retaken. Overview, then close-ups of each kind.
const close = [];
['hq', 'fuel', 'depot', 'radar'].forEach((k, row) => {
  for (const [c, n] of [[1, 'ours'], [4, 'runaway'], [3, 'ours-destroyed']]) close.push(`eval (__view(30, 22, ${k === 'radar' ? 38 : 34}, ${-150 + c * 40}, ${-75 + row * 42}), 1)`, 'wait 300', `shot ${k}-${n}`);
});
export default {
  name: 'structprev',
  query: 'dev/world.html?structs=1&dist=330&pitch=42&yaw=20&fogn=900&fogf=2000',
  steps: [
    'waitFor 30000 window.__ready', 'wait 600', 'shot overview', 'notblank',
    ...close,
    'eval (__view(40, 18, 70, -110, 90), 1)', 'wait 300', 'shot dressing',
  ],
};
