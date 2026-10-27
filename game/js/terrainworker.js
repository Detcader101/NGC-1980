// Terrain worker: camera-centred height maps only. Forests use stable world/forest.js tiles in worldworker.js.
import { islandH, rawH } from './world.js';
onmessage = ({ data: q }) => {
  const { n, c, ox, oz } = q, h = new Float32Array(n * n);
  // the near window carries the road beds and building platforms (islandH); the 16 m far window can't show a road
  // anyway, so it bakes the natural ground (rawH) and skips generating the towns of an 8 km square
  const H = c > 8 ? rawH : islandH;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = H(ox + i * c, oz + j * c);
  postMessage({ id: q.id, ox, oz, n, c, h }, [h.buffer]);
};
