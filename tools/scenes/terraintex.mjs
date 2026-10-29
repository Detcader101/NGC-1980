// RENDERKIT terrain (ngc/look-terrain): the generated ground layers, each 2x2 repeated (seams show) and lit by its own
// normal map, written to tools/runs/terraintex-<tier>.png (or $OUT).   node snap.mjs scenes/terraintex.mjs   (TER=low)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const TER = process.env.TER ?? 'high';
const OUT = process.env.OUT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'runs', `terraintex-${TER}.png`);
export default { name: 'terraintex-' + TER, seed: 1980, query: `?debug&auto&kb&peace&res=0.6&rk=all&rkterrain=${TER}`, run: async h => {
  await h.waitFor("window.__G && __G.G.state==='play' && window.__rkTerrain && __rkTerrain.ready", 90000);
  const url = await h.eval(`import('/js/renderkit/terrainmat.js').then(m => m.previewLayers(__G.renderer, __rkTerrain, 256, 7))`, 'preview');
  fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote ' + OUT + ' ' + JSON.stringify(await h.eval('__rkTerrain.stats()')));
}};
