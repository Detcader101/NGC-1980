// ngc/perf-render: run another unit scene unchanged, then assert that no merged static part (renderkit/merge.js) moved,
// was hidden or had its material swapped while the scene exercised the unit, and report the draws the merges saved.
//   SCENE=tankdrive.mjs node snap.mjs scenes/mergecheck.mjs
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCENE = process.env.SCENE || 'tankdrive.mjs';
const mod = (await import(pathToFileURL(path.join(HERE, SCENE)).href)).default, inner = typeof mod === 'function' ? { name: SCENE, run: mod } : mod;
export default { ...inner, name: 'mergecheck-' + SCENE.replace(/\W+/g, '_'), run: async h => {
  await inner.run(h);
  const R = await h.eval(`(() => { const M = window.__MERGES || []; return { merges: M.length, before: M.reduce((a, r) => a + r.draws.before, 0), after: M.reduce((a, r) => a + r.draws.after, 0),
    roots: [...new Set(M.map(r => r.root.name || r.root.type))].join(','), bad: M.flatMap(r => r.check().map(b => (r.root.name || '?') + ': ' + b.part + ' ' + b.why + (b.d ? ' ' + b.d : ''))).slice(0, 30) }; })()`, 'merge-summary');
  await h.expect(`(${JSON.stringify(R.bad)}).length === 0`, 'no merged part moved, hid or swapped material: ' + R.bad.join(' | '));
}};
