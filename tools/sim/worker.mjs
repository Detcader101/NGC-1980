// SIM MODE: a worker thread of tools/warsim.mjs - runs the wars it is sent, one at a time, and posts the records back
import { parentPort, workerData } from 'node:worker_threads';
const { runWar } = await import('./headless.mjs');
const grid = workerData && workerData.grid ? new Float32Array(workerData.grid) : null;
parentPort.on('message', async job => {
  if (job === 'exit') process.exit(0);
  try {
    const rec = await runWar({ ...job.cfg, grid });
    parentPort.postMessage({ id: job.id, rec: slim(rec, job.keep) });
  } catch (e) { parentPort.postMessage({ id: job.id, error: String(e && e.stack || e) }); }
});
parentPort.postMessage({ ready: true });
// samples every 30 s are plenty for the curves; decisions are kept (they are the strategy log)
function slim(r, keep) { if (keep) return r; return { ...r, samples: r.samples.filter((s, i) => i % 6 === 0) }; }
