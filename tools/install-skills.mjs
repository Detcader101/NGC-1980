#!/usr/bin/env node
// Link the versioned skills from this checkout into Codex's user skill directory.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills');
const links = ['benchmark', 'devlog'].map(name => ({ name, source: path.join(root, 'skills', name), target: path.join(home, name) }));
for (const link of links) {
  if (!fs.existsSync(path.join(link.source, 'SKILL.md'))) throw new Error('Missing skill: ' + link.source);
  let existing; try { existing = fs.lstatSync(link.target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (existing) {
    if (existing.isSymbolicLink() && path.resolve(path.dirname(link.target), fs.readlinkSync(link.target)) === link.source) link.present = true;
    else throw new Error('Existing skill preserved; resolve this name conflict before installing: ' + link.target);
  }
}
fs.mkdirSync(home, { recursive: true });
for (const link of links) {
  if (!link.present) fs.symlinkSync(link.source, link.target, process.platform === 'win32' ? 'junction' : 'dir');
  console.log(`${link.present ? 'Already linked' : 'Installed'} $${link.name}: ${link.target} → ${link.source}`);
}
console.log('Open a new Codex session if the skills are not yet listed. Keep this checkout available for the links.');
