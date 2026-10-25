// node --check every game/js/*.js and game/js/sim/*.js (syntax only)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../../game/js/', import.meta.url).pathname;
let bad = 0, n = 0;
for (const d of ['', 'sim/']) for (const f of fs.readdirSync(root + d)) if (f.endsWith('.js')) { n++; try { execFileSync(process.execPath, ['--check', path.join(root, d, f)], { stdio: 'pipe' }); } catch (e) { bad++; console.log('BAD', d + f, String(e.stderr).split('\n')[0]); } }
console.log(`${n - bad}/${n} files pass node --check`);
