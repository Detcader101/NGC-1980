import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const categories = ['air', 'ground', 'naval', 'defence', 'structure'];
export async function loadUnitCases() {
  const groups = await Promise.all(categories.map(async category => {
    const file = new URL(`./unit-cases/${category}.mjs`, import.meta.url);
    const { cases } = await import(file.href);
    return cases.map(entry => ({ ...entry, fixtureFile: fileURLToPath(file) }));
  }));
  const cases = groups.flat();
  validateCases(cases);
  return cases;
}
export function validateCases(cases) {
  const ids = new Set();
  for (const entry of cases) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id || '') || ids.has(entry.id)) throw new Error('Invalid or duplicate unit ID: ' + entry.id);
    ids.add(entry.id);
    if (!categories.includes(entry.category) || !['playable', 'ai', 'civilian', 'structure'].includes(entry.kind)) throw new Error('Invalid unit classification: ' + entry.id);
    if (!entry.name || !entry.description || !entry.query || typeof entry.run !== 'function') throw new Error('Incomplete unit case: ' + entry.id);
  }
  if (!cases.length) throw new Error('Unit catalog is empty');
}
export function selectCases(cases, { units = [], category } = {}) {
  if (category && !categories.includes(category)) throw new Error('Unknown category: ' + category);
  for (const id of units) if (!cases.some(entry => entry.id === id)) throw new Error('Unknown unit: ' + id);
  const chosen = cases.filter(entry => (!units.length || units.includes(entry.id)) && (!category || entry.category === category));
  if (!chosen.length) throw new Error('No units match the selection');
  return chosen;
}
export const serializableCase = ({ run, fixtureFile, ...entry }) => entry;
export function readResult(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
