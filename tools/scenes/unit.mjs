import { loadUnitCases } from '../unit-catalog.mjs';
const entry = (await loadUnitCases()).find(unit => unit.id === process.env.UNIT_ID);
if (!entry) throw new Error('Select a unit with tools/unit-benchmark.mjs --unit ID');
export default {
  name: `unit-${entry.id}`, seed: 1980, query: entry.query,
  fixtureFiles: [entry.fixtureFile, new URL('../unit-catalog.mjs', import.meta.url)],
  run: async h => {
    await h.logmsg(`${entry.name}: ${entry.description}`);
    await entry.run(h);
  },
};
