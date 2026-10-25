// SEALIFE (ngc/waterfish): the fish simulation (game/js/units/naval/fishsim.js) in node, no browser.
//   node tools/fishbench.mjs
// The sea bed is a test beach (a 1 in 12 slope from the shore at x = 0 out to a 14 m floor, like the zone's sea floor)
// plus a run on the real archipelago heights (world.js islandH).
import { createFishSim, SPECIES, SPECIES_INDEX, FISH, tailBeatHz, SUB, QUALITY } from '../game/js/units/naval/fishsim.js';
import { createSeaBirds, BIRD_SPECIES } from '../game/js/units/naval/seabirds.js';
import { makeSea, advanceSea, seaElevation } from '../game/js/units/naval/seamotion.js';
import { islandH, ISLANDS } from '../game/js/world.js';

let pass = 0, fail = 0;
const check = (ok, name, got, want) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(70)} ${got}${want ? `   (want ${want})` : ''}`); };
const beach = (x, z) => Math.max(-14, Math.min(6, -x / 12));   // land for x < 0, 14 m deep from x = 168
const run = (S, secs, cam, dt = 1 / 30, each) => { for (let t = 0; t < secs; t += dt) { if (each) each(t); S.update(dt, cam); } };
const fishOf = (S, key) => S.fish().filter(f => f.sp === key);
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

// 1. Bainbridge 1958: U = L (3 f - 4) / 4
{
  const f = tailBeatHz(0.4, 0.2), back = 0.2 * (3 * f - 4) / 4;
  check(Math.abs(f - 4) < 1e-9 && Math.abs(back - 0.4) < 1e-9, 'tail beat: Bainbridge U = L(3f-4)/4 (0.2 m fish at 2 BL/s = 4 Hz)', `${f.toFixed(2)} Hz`, '4.00');
}

// 2. spawning round the camera, each species in its own water
{
  const S = createFishSim({ depthAt: beach, seed: 3 });
  run(S, 6, { x: 60, y: 8, z: 0 });
  const fs = S.fish(), kinds = new Set(fs.map(f => f.sp));
  check(S.schools.length >= 4 && fs.length > 100, 'schools spawn round a camera over a beach', `${S.schools.length} schools, ${fs.length} fish, kinds ${[...kinds].join(' ')}`);
  check(fs.length <= FISH.MAX_FISH, 'never more than the fish budget', `${fs.length}`, `<= ${FISH.MAX_FISH}`);
  const bad = S.schools.filter(sc => { const sp = SPECIES[sc.sp], d = -beach(sc.cx, sc.cz); return d < sp.water[0] - 1.5 || d > sp.water[1] + 1.5; });
  check(bad.length === 0, 'every school is over water that suits its species', `${bad.length} misplaced`);
  const mul = S.schools.filter(sc => SPECIES[sc.sp].key === 'mullet'), amb = S.schools.filter(sc => SPECIES[sc.sp].key === 'amberjack');
  check(mul.every(sc => -beach(sc.cx, sc.cz) < 6) && amb.every(sc => -beach(sc.cx, sc.cz) > 6), 'mullet in the shallows, amberjack out deep', `mullet at ${mul.map(s => (-beach(s.cx, s.cz)).toFixed(1)).join(',') || '-'} m, amberjack at ${amb.map(s => (-beach(s.cx, s.cz)).toFixed(1)).join(',') || '-'} m`);
}

// 3. schooling and swimming: a sardine school and a mackerel school left alone for 40 s
{
  const S = createFishSim({ depthAt: beach, seed: 5 }); S.enabled = true; S.autoSpawn = false;
  const cam = { x: 120, y: 2, z: 0 };
  FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 2;
  const sar = S.spawnSchool('sardine', 120, 0), mac = S.spawnSchool('mackerel', 140, 30);
  let inWater = true, maxY = -1e9, belowBed = 0;
  run(S, 40, cam, 1 / 30, () => { for (const f of S.fish()) { maxY = Math.max(maxY, f.y); if (f.y < beach(f.x, f.z) + 0.1) belowBed++; } });
  FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE;
  inWater = maxY <= -0.18 + 1e-6;
  check(inWater && belowBed === 0, 'fish stay in the water: under the surface, over the bed', `top ${maxY.toFixed(2)} m, under the bed ${belowBed}`);
  for (const sc of [sar, mac]) {
    const sp = SPECIES[sc.sp], fs = S.fish().filter(f => f.school === sc);
    // nearest-neighbour distance in body lengths between the DRAWN fish (each boid draws SUB fish round it: subOffset),
    // polarisation (how aligned the school is), speed in BL/s
    const dr = []; for (const f of fs) for (let k = 0; k < SUB; k++) { const p = S.drawnPos(sc, f.i, k); dr.push({ p, len: f.len }); }
    const nnd = mean(dr.map(d => Math.min(...dr.filter(e => e !== d).map(e => Math.hypot(e.p[0] - d.p[0], e.p[1] - d.p[1], e.p[2] - d.p[2]))) / d.len));
    let px = 0, pz = 0; for (const f of fs) { const v = Math.hypot(f.vx, f.vz) || 1; px += f.vx / v; pz += f.vz / v; }
    const pol = Math.hypot(px, pz) / fs.length, bls = mean(fs.map(f => Math.hypot(f.vx, f.vy, f.vz) / f.len));
    check(nnd > 0.5 && nnd < 1.6, `${sp.name}: drawn fish ~1 BL from their nearest neighbour (Pitcher & Partridge 1979)`, `${nnd.toFixed(2)} BL (${dr.length} drawn)`, '0.5-1.6');
    check(pol > 0.6, `${sp.name}: a school, not a swarm (polarisation)`, pol.toFixed(2), '> 0.6');
    check(bls > sp.cruise * 0.6 && bls < sp.cruise * 1.6, `${sp.name}: cruising ~${sp.cruise} BL/s (Videler 1993)`, `${bls.toFixed(2)} BL/s`);
  }
}

// 4. a ship comes through: the fish get out of the way (aside and down) and none is left inside the hull
{
  const S = createFishSim({ depthAt: beach, seed: 7 }); S.autoSpawn = false;
  const cam = { x: 150, y: 2, z: 0 }; FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const sc = S.spawnSchool('mackerel', 150, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE;
  run(S, 5, cam);
  const y0 = mean(S.fish().map(f => f.y));
  // a 60 m ship, 4 m draft, 6 m/s, heading +z (yaw = PI: forward = (-sin, -cos) = (0, +1)), passing over the school
  let z = -90, inside = 0, maxFear = 0; const hl = 30, hw = 6, dr = 4;
  for (let t = 0; t < 30; t += 1 / 30) {
    z += 6 / 30; S.clearThreats(); S.hull(150, z, Math.PI, hl, hw, dr, 6); S.update(1 / 30, cam);
    for (const f of S.fish()) { maxFear = Math.max(maxFear, f.fear); if (Math.abs(f.x - 150) < hw - 0.5 && Math.abs(f.z - z) < hl - 1 && f.y > -dr + 0.5) inside++; }
  }
  check(maxFear > 0.7 && S.stats.fled >= 1, 'a ship under way frightens the school', `fear ${maxFear.toFixed(2)}, schools fled ${S.stats.fled}`);
  check(inside < 3, 'no fish rides inside the hull (fish x frames)', `${inside}`, '< 3');
  const fs = S.fish(), y1 = mean(fs.map(f => f.y)), off = mean(fs.map(f => Math.abs(f.x - 150)));
  check(off > hw + 1, 'they went aside (mean distance off the keel line after it passed)', `${off.toFixed(1)} m`, `> ${hw + 1}`);
  check(y1 < y0 + 0.5, 'and down, not up', `mean depth ${(-y0).toFixed(1)} -> ${(-y1).toFixed(1)} m`);
  S.clearThreats(); run(S, 20, cam); const calm = Math.max(...S.fish().map(f => f.fear));
  check(calm < 0.15, 'and calm down again once it is gone', calm.toFixed(2), '< 0.15');
}

// 5. rotor downwash on the surface: shallow fish under a hovering helicopter scatter
{
  const S = createFishSim({ depthAt: beach, seed: 9 }); FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const sc = S.spawnSchool('sardine', 100, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE; const cam = { x: 100, y: 15, z: 0 };
  run(S, 4, cam);
  const mine = () => S.fish().filter(f => f.school === sc);
  const cx = sc.cx, cz = sc.cz, d0 = mean(mine().map(f => Math.hypot(f.x - cx, f.z - cz)));
  run(S, 4, cam, 1 / 30, () => { S.clearThreats(); S.point(cx, 0, cz, 16, 1, 0, 0, 3); });
  const d1 = mean(mine().map(f => Math.hypot(f.x - cx, f.z - cz)));
  check(d1 > d0 + 4, 'downwash: the school opens out from under the rotor', `${d0.toFixed(1)} -> ${d1.toFixed(1)} m from the wash`);
}

// 6. a swimmer: fish keep their distance (a few metres), do not bolt across the bay
{
  const S = createFishSim({ depthAt: beach, seed: 11 }); FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const sc = S.spawnSchool('mullet', 30, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE; const cam = { x: 30, y: 1, z: 0 };
  run(S, 3, cam); let minD = 1e9; const sx = sc.cx, sz = sc.cz;
  run(S, 6, cam, 1 / 30, t => { S.clearThreats(); S.point(sx, -0.5, sz, 5, 0.7, 0, 0, 3); if (t > 2) for (const f of S.fish().filter(f => f.school === sc)) minD = Math.min(minD, Math.hypot(f.x - sx, f.z - sz)); });
  check(minD > 1.2, 'a swimmer: the mullet keep clear of him', `closest ${minD.toFixed(1)} m`, '> 1.2');
}

// 7. a blast in the water: fish near it stunned or killed, float up belly-up; the stunned ones recover; nothing far off
{
  const S = createFishSim({ depthAt: beach, seed: 13 }); S.autoSpawn = false; FISH.MAX_SCHOOLS_SAVE = FISH.MAX_SCHOOLS; FISH.MAX_SCHOOLS = 0;
  const a = S.spawnSchool('mackerel', 150, 0), b = S.spawnSchool('sardine', 150, 60); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE; const cam = { x: 150, y: 3, z: 30 };
  run(S, 3, cam);
  const hit = S.blast(a.cx, -1, a.cz, 1.5);
  const far = S.fish().filter(f => f.school === b && (f.stun > 0 || f.dead)).length;
  check(hit > 5 && S.stats.killed > 0, 'a shell in the water stuns and kills fish near it', `${hit} hit, ${S.stats.killed} killed`);
  check(far === 0, 'none 60 m away', `${far}`);
  run(S, 6, cam);
  const st = S.fish().filter(f => f.school === a && f.stun > 0 && !f.dead), up = mean(st.map(f => f.y)), roll = mean(st.map(f => f.roll));
  check(st.length > 0 && up > -1.2 && roll > 2, 'stunned fish float up belly-up', `${st.length} stunned at ${up.toFixed(2)} m, roll ${roll.toFixed(2)} rad`);
  run(S, 25, cam);
  const still = S.fish().filter(f => f.school === a && f.stun > 0 && !f.dead).length, dead = S.fish().filter(f => f.dead).length;
  check(still === 0 && dead > 0, 'the stunned recover and swim off; the dead stay dead', `${still} still stunned, ${dead} dead`);
  // an airburst high over the water does next to nothing
  const S2 = createFishSim({ depthAt: beach, seed: 14 }); FISH.MAX_SCHOOLS = 0; const c = S2.spawnSchool('mackerel', 150, 0); FISH.MAX_SCHOOLS = FISH.MAX_SCHOOLS_SAVE;
  run(S2, 2, cam); const h2 = S2.blast(c.cx, 12, c.cz, 1.5);
  check(h2 === 0, 'a flak burst 12 m up stuns nothing in the water', `${h2}`);
}

// 8. only near the camera: the schools go when it leaves, none at altitude
{
  const S = createFishSim({ depthAt: beach, seed: 17 });
  run(S, 4, { x: 100, y: 5, z: 0 }); const n0 = S.schools.length;
  run(S, 2, { x: 100, y: 5, z: 2000 }); const near = S.schools.every(sc => Math.hypot(sc.cx - 100, sc.cz - 2000) < S.radius + 45);
  check(n0 > 0 && near, 'schools are dropped when the camera moves on and spawn where it is', `${n0} -> ${S.schools.length} (all near the new spot: ${near})`);
  run(S, 2, { x: 100, y: 400, z: 2000 });
  check(S.schools.length === 0, 'nothing simulated from 400 m up', `${S.schools.length}`);
}

// 9. the real archipelago: round HOME ISLAND, no fish on land, cost of a full load
{
  const I = ISLANDS[0], S = createFishSim({ depthAt: islandH, seed: 21 });
  const cam = { x: I.x + 150, y: 20, z: I.z };
  let land = 0, deep = 0, worst = 0, sum = 0, n = 0, cnt = 0;
  run(S, 30, cam, 1 / 30, t => { if (t > 2) { for (const f of S.fish()) { cnt++; if (S.bed(f.x, f.z) > f.y) land++; if (islandH(f.x, f.z) > f.y + 1) deep++; } worst = Math.max(worst, S.ms); sum += S.ms; n++; } });
  check(S.fish().length > 80 && land === 0, 'HOME ISLAND: fish round the island, none under the (drawn, 2 m) sea bed', `${S.fish().length} fish in ${S.schools.length} schools, ${land} under the bed`);
  check(deep / cnt < 0.01, '... and under 1 % more than 1 m into the exact terrain (2 m cells on cliffs)', `${(100 * deep / cnt).toFixed(2)} %`);
  // cost: the full budget of fish
  const S3 = createFishSim({ depthAt: beach, seed: 23 }); let t3 = 0, n3 = 0;
  run(S3, 3, { x: 150, y: 3, z: 0 });
  while (S3.nFish < FISH.MAX_FISH - 100) { if (!S3.spawnSchool(['sardine', 'mackerel'][n3++ % 2], 150 + (n3 % 5) * 12, (n3 % 7) * 12)) break; }
  run(S3, 4, { x: 150, y: 3, z: 0 }, 1 / 60, () => {});
  for (let i = 0; i < 120; i++) { S3.update(1 / 60, { x: 150, y: 3, z: 0 }); t3 += S3.ms; }
  check(t3 / 120 < 3, `cost of ${S3.nFish} fish per 60 Hz frame (node)`, `${(t3 / 120).toFixed(2)} ms`, '< 3 ms');
  console.log(`      (HOME ISLAND run: ${(sum / n).toFixed(2)} ms average, ${worst.toFixed(2)} ms worst incl. spawning)`);
}

// ======================================================================================== SEALIFE 2: a living sea
// the live sea for these: the same wave components the ships ride (seamotion.js), at the game's 0.44 scale
const liveSea = (ss = 4, seed = 3) => { const sea = makeSea(ss, 0.4, seed); const surf = (x, z, out) => { seaElevation(sea, x, z, out); return out; }; return { sea, surf }; };
const deep = (x, z) => Math.max(-40, Math.min(6, -x / 12));   // a shelf running out to 40 m (dolphins, flying fish, gannets)
const iso = S => { S.autoSpawn = false; return S; };
const runSea = (S, sea, secs, cam, each, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) { advanceSea(sea, dt); if (each) each(t); S.update(dt, cam); } };

// 10. a bait ball: bonito on a pilchard school - it balls up, mills, is driven to the top; they strike, it boils
{
  const { sea, surf } = liveSea(3); const S = iso(createFishSim({ depthAt: deep, seed: 31, surf })); const cam = { x: 300, y: 20, z: 0 };
  const { prey } = S.spawnBaitBall(300, 0);
  const r0 = prey.rad, n0 = prey.live; let boils = 0, maxBall = 0, millSum = 0, millN = 0;
  const mill = () => { let Lm = 0, n = 0; for (const f of S.fish().filter(f => f.school === prey)) { const rx = f.x - prey.cx, rz = f.z - prey.cz, rr = Math.hypot(rx, rz) || 1, v = Math.hypot(f.vx, f.vz) || 1; Lm += (rx * f.vz - rz * f.vx) / rr / v; n++; } return Lm / n * prey.mill; };
  runSea(S, sea, 45, cam, t => { S.clearThreats(); if (t > 10) { maxBall = Math.max(maxBall, prey.ball); if ((t * 30 | 0) % 15 === 0) { millSum += mill(); millN++; } } for (let i = 0; i < S.nEv; i++) if (S.events[i].kind === 'boil') boils++; });
  const depth = seaElevation(sea, prey.cx, prey.cz) - prey.cy;
  check(maxBall > 0.6 && S.stats.balls >= 1, 'bait ball: the pilchard ball up when the bonito come (Pitcher & Parrish 1993)', `ball ${maxBall.toFixed(2)}, balls ${S.stats.balls}`, '> 0.6');
  check(depth < 2.5, '... and are driven up to the top', `centre ${depth.toFixed(2)} m under the swell`, '< 2.5 m');
  check(prey.rad < r0 * 2 + 3, '... a tight ball, not scattered', `radius ${r0.toFixed(1)} -> ${prey.rad.toFixed(1)} m`);
  check(S.stats.eaten > 3 && S.stats.eaten < n0 * 0.8, 'the bonito take some (not all) of them', `${S.stats.eaten} of ${n0} eaten`);
  check(boils > 0, 'strikes at the top boil', `${boils} boils`);
  const sg = S.signs(); check(sg.some(s => s.kind === 1), 'the bait ball is marked on the top (a sign the birds and the pilot see)', sg.map(s => s.kind).join(',') || '-');
  // milling: the prey turn round the ball's centre (angular momentum about it, normalised; averaged over the hunt)
  check(millSum / millN > 0.25, '... and mill round its centre', `milling ${(millSum / millN).toFixed(2)} (mean of ${millN})`, '> 0.25');
}

// 11. the fountain effect: prey split round a predator's path, few are ever touching it
{
  const S = iso(createFishSim({ depthAt: deep, seed: 33 })); const cam = { x: 300, y: 20, z: 0 };
  const { prey, pred } = S.spawnBaitBall(300, 0);
  let near = 0, tot = 0;
  run(S, 25, cam, 1 / 30, t => { if (t < 8) return; const P = S.fish().filter(f => f.school === pred); for (const f of S.fish().filter(f => f.school === prey && !f.dead)) { tot++; for (const p of P) if (Math.hypot(f.x - p.x, f.y - p.y, f.z - p.z) < 0.25) { near++; break; } } });
  check(near / tot < 0.02, 'fountain effect: the prey open round each predator (Pitcher & Parrish 1993)', `${(100 * near / tot).toFixed(2)} % of fish-frames within 0.25 m of a bonito`, '< 2 %');
}

// 12. flying fish: a bow wave comes at them - they taxi and glide away, over the waves, tens of metres
{
  const { sea, surf } = liveSea(3, 5); const S = iso(createFishSim({ depthAt: deep, seed: 35, surf })); const cam = { x: 300, y: 10, z: 0 };
  const ff = S.spawnSchool('flyingfish', 300, 0);
  let z = -150, maxH = -1, minH = 9; const glideStart = new Map(), dists = [];
  runSea(S, sea, 30, cam, () => {
    z += 7 / 30; S.clearThreats(); S.hull(300, z, Math.PI, 30, 6, 4, 7);
    for (const f of S.fish().filter(f => f.school === ff)) {
      if (f.air && f.ak === 2) { const h = f.y - seaElevation(sea, f.x, f.z); maxH = Math.max(maxH, h); if (f.wing > 0.9) minH = Math.min(minH, h); if (!glideStart.has(f.i)) glideStart.set(f.i, [f.x, f.z]); }
      else if (glideStart.has(f.i) && !f.air) { const [x0, z0] = glideStart.get(f.i); dists.push(Math.hypot(f.x - x0, f.z - z0)); glideStart.delete(f.i); }
    }
  });
  check(S.stats.glides >= 3, 'flying fish take off from a ship coming at them', `${S.stats.glides} glides of ${ff.n} fish`);
  check(maxH > 0.4 && maxH < 1.8 && minH > 0, '... glide 0.5-1.2 m over the live waves (never through a crest)', `${minH.toFixed(2)} - ${maxH.toFixed(2)} m over the top`);
  const md = dists.length ? mean(dists) : 0;
  check(md > 15 && md < 120, '... tens of metres a flight (Davenport 1994: ~50 m)', `${md.toFixed(0)} m mean of ${dists.length}`, '15-120');
}

// 13. grey mullet leap when a boat runs at them in the shallows
{
  const S = iso(createFishSim({ depthAt: beach, seed: 37 })); const cam = { x: 30, y: 4, z: 0 };
  const m = S.spawnSchool('mullet', 30, 0); let maxY = -9;
  let z = -60; run(S, 20, cam, 1 / 30, () => { z += 4 / 30; S.clearThreats(); S.hull(30, z, Math.PI, 5, 1.6, 0.6, 4); for (const f of S.fish().filter(f => f.school === m)) if (f.air) maxY = Math.max(maxY, f.y); });
  check(S.stats.leaps >= 1 && maxY > 0.2, 'grey mullet leap clear of a boat in the shallows (Hoese 1985)', `${S.stats.leaps} leaps, highest ${maxY.toFixed(2)} m`);
}

// 14. dolphins ride the bow of a ship under way, breathe, porpoise at speed; never inside her
{
  const { sea, surf } = liveSea(3, 7); const S = iso(createFishSim({ depthAt: deep, seed: 39, surf }));
  const pod = S.spawnSchool('dolphin', 340, 60);
  const x = 300, hl = 40, hw = 8, v = 6.5; let z = -100, inside = 0, inSlot = 0, tot = 0;
  runSea(S, sea, 60, { x: 300, y: 20, z: 0 }, t => {
    z += v / 30; S.clearThreats(); S.hull(x, z, Math.PI, hl, hw, 5, v);   // heading +z
    if (t < 30) return;
    for (const f of S.fish().filter(f => f.school === pod)) { tot++; const lz = f.z - z, lx = f.x - x; if (Math.abs(lx) < hw - 0.3 && Math.abs(lz) < hl - 0.3 && f.y > -5) inside++; if (lz > hl - 1 && lz < hl + 14 && Math.abs(lx) < hw + 4) inSlot++; }
  });
  check(inSlot / tot > 0.5, 'dolphins ride the bow: in the pressure field ahead of her stem', `${(100 * inSlot / tot).toFixed(0)} % of the time`, '> 50 %');
  check(inside === 0, '... never inside the hull', `${inside}`);
  check(S.stats.breaths > 6, '... come up to breathe (10-35 s)', `${S.stats.breaths} breaths in 60 s, ${pod.n} dolphins`);
  check(S.stats.leaps > 0, '... and porpoise at 6.5 m/s (Au & Weihs 1980)', `${S.stats.leaps} leaps`);
}

// 15. a ship at anchor: fish gather in her shade (the FAD effect) and are not frightened of her
{
  const S = iso(createFishSim({ depthAt: deep, seed: 41 })); const cam = { x: 300, y: 20, z: 0 };
  const m = S.spawnSchool('mackerel', 360, 20); let fear = 0, n = 0;
  run(S, 90, cam, 1 / 30, t => { S.clearThreats(); S.hull(300, 0, 0, 60, 11, 6, 0); if (t > 60) for (const f of S.fish().filter(f => f.school === m)) { fear += f.fear; n++; } });
  const off = Math.abs(m.cx - 300) - 11;
  check(off > 0 && off < 22 && Math.abs(m.cz) < 70, 'a ship at anchor: a school comes alongside, in her shade (FAD effect)', `${off.toFixed(1)} m off her side`, '0-22 m');
  check(fear / n < 0.1, '... unafraid of her', `mean fear ${(fear / n).toFixed(3)}`);
}

// 16. a school split by a ship re-forms in her wake
{
  const S = iso(createFishSim({ depthAt: deep, seed: 43 })); const cam = { x: 300, y: 20, z: 0 };
  const m = S.spawnSchool('mackerel', 300, 0); run(S, 3, cam);
  // she comes out of a squall on top of them: the bow is 4 m off the school when she is first felt, so it splits
  const x0 = m.cx; let z = m.cz - 34, rMax = 0, sides = 0; run(S, 14, cam, 1 / 30, t => { z += 6 / 30; S.clearThreats(); S.hull(x0, z, Math.PI, 30, 6, 4, 6); rMax = Math.max(rMax, m.rad); if (Math.abs(t - 5) < 0.02) { const fs = S.fish().filter(f => f.school === m); sides = Math.min(fs.filter(f => f.x > x0).length, fs.filter(f => f.x <= x0).length); } });
  S.clearThreats(); run(S, 40, cam);
  check(sides >= 4 && rMax > 6, 'a ship through the middle of a school splits it (both sides of her)', `${sides} on the smaller side, spread ${rMax.toFixed(1)} m`);
  check(m.rad < rMax * 0.6, '... and it re-forms in her wake', `spread ${rMax.toFixed(1)} -> ${m.rad.toFixed(1)} m`);
}

// 17. propeller wash: fish just astern of a ship under way are carried along after her, tumbled and frightened
{
  const S = iso(createFishSim({ depthAt: deep, seed: 45 })); const cam = { x: 300, y: 20, z: 0 };
  const m = S.spawnSchool('sardine', 300, 40); run(S, 2, cam);
  // ship heading -z (yaw 0), stern at z = 30: the school sits in the wash just astern
  const z0 = m.cz; let fear = 0; run(S, 3, cam, 1 / 30, () => { S.clearThreats(); S.hull(300, 0, 0, 30, 6, 4, 5); fear = Math.max(fear, ...S.fish().filter(f => f.school === m).map(f => f.fear)); });
  check(m.cz < z0 - 2 && fear > 0.3, 'in the prop wash astern: carried after her, tumbled and frightened', `moved ${(m.cz - z0).toFixed(1)} m along her course, fear ${fear.toFixed(2)}`);
}

// 18. a swimmer: sea bream come to look while he keeps still, everything keeps clear of him swimming hard
{
  const S = iso(createFishSim({ depthAt: beach, seed: 47 })); const cam = { x: 60, y: -1, z: 0 };
  const b = S.spawnSchool('bream', 60, 10); const d0 = Math.hypot(b.cx - 60, b.cz); let dS = 1e9, dF = 1e9;
  run(S, 30, cam, 1 / 30, t => { S.clearThreats(); S.point(60, -0.5, 0, 4.5, 0.65, 0, 0, 2.5, { swim: true }); if (t > 20) dS = Math.min(dS, ...S.fish().filter(f => f.school === b).map(f => Math.hypot(f.x - 60, f.z))); });
  let sx = 60; const bz = b.cz; run(S, 6, cam, 1 / 30, t => { sx += 1.6 / 30; S.clearThreats(); S.point(sx, -0.5, bz, 4.5, 0.65, 1.6, 0, 2.5, { swim: true }); if (t > 1) dF = Math.min(dF, ...S.fish().filter(f => f.school === b).map(f => Math.hypot(f.x - sx, f.z - bz))); });
  check(dS < d0 && dS > 1.3 && dS < 5, 'a still swimmer: sea bream come and look, out of reach', `nearest ${dS.toFixed(1)} m (school was ${d0.toFixed(0)} m off)`, '1.3-5 m');
  check(dF > 1.2, 'a swimmer kicking through: they keep clear', `nearest ${dF.toFixed(1)} m`);
}

// 19. life round the units: a ship 450 m from the camera still has schools round her; budget kept; the camera first
{
  const S = createFishSim({ depthAt: deep, seed: 49 }); const cam = { x: 300, y: 30, z: 0 };
  let peak = 0; run(S, 40, cam, 1 / 30, () => { S.clearThreats(); S.hull(300, 450, Math.PI, 40, 8, 5, 4); peak = Math.max(peak, S.nFish); });
  const nearShip = S.schools.filter(sc => Math.hypot(sc.cx - 300, sc.cz - 450) < 140).length, nearCam = S.schools.filter(sc => Math.hypot(sc.cx - 300, sc.cz) < S.radius + 45).length;
  check(nearShip >= 2, 'schools live round a ship 450 m from the camera (unit-anchored)', `${nearShip} round her, ${nearCam} round the camera`);
  check(peak <= FISH.MAX_FISH, 'never over the budget', `${peak}`, `<= ${FISH.MAX_FISH}`);
  check(nearCam >= 3, '... and the camera still has its own', `${nearCam}`);
  // from 400 m up (a jet): nothing round the camera, but the ship's life stays
  run(S, 5, { x: 300, y: 400, z: 0 }, 1 / 30, () => { S.clearThreats(); S.hull(300, 450, Math.PI, 40, 8, 5, 4); });
  const keepers = S.schools.filter(sc => !sc.leave);
  check(keepers.length > 0 && keepers.every(sc => Math.hypot(sc.cx - 300, sc.cz - 450) < 200), 'from 400 m up only the life round the ship stays', `${keepers.length} schools`);
}

// 20. no popping: a school is never dropped while it can still be seen - it fades out first
{
  const S = createFishSim({ depthAt: deep, seed: 51 }); const cam = { x: 300, y: 10, z: 0 }; const seen = new Map(); let popped = 0, faded = 0;
  for (let t = 0; t < 60; t += 1 / 30) {
    cam.z += 3 / 30; S.update(1 / 30, cam);   // a boat's pace: schools come and go
    const now = new Set(S.schools); for (const [sc, f] of seen) if (!now.has(sc)) { if (f > 0.05 && Math.hypot(sc.cx - cam.x, sc.cz - cam.z) < S.radius + 400) popped++; else faded++; }
    seen.clear(); for (const sc of S.schools) seen.set(sc, sc.fade);
  }
  check(popped === 0 && faded > 0, 'schools fade out before they go (no popping at the screen edge)', `${faded} faded out, ${popped} popped`);
}

// 21. determinism: the same seed and the same disturbances give the same sea
{
  const go = () => { const S = createFishSim({ depthAt: deep, seed: 53 }); let z = -100; for (let i = 0; i < 600; i++) { z += 5 / 30; S.clearThreats(); S.hull(300, z, Math.PI, 30, 6, 4, 5); if (i === 300) S.blast(300, -1, 20, 1.5); S.update(1 / 30, { x: 300, y: 15, z: 0 }); } return S.hash(); };
  const a = go(), b = go(); check(a === b, 'deterministic: same seed, same inputs, same sea', `${a} / ${b}`);
}

// 22. wave consistency (SEA STATE 5): no swimmer breaks the top in a trough; the dead float ON the swell
{
  const { sea, surf } = liveSea(5, 9); const S = iso(createFishSim({ depthAt: deep, seed: 55, surf })); const cam = { x: 300, y: 10, z: 0 };
  const a = S.spawnSchool('sardine', 300, 0); S.spawnSchool('mackerel', 320, 20);
  let out = 0, n = 0, worst = 0;
  runSea(S, sea, 20, cam, () => { for (const f of S.fish()) { if (f.air || f.stun > 0) continue; n++; const e = seaElevation(sea, f.x, f.z); if (f.y > e - 0.05) { out++; worst = Math.max(worst, f.y - e); } } });
  check(out / n < 0.002, 'swimming fish stay under the LIVE surface (troughs too, SS5)', `${out} of ${n} fish-frames above it (worst ${worst.toFixed(2)} m)`);
  S.blast(a.cx, -0.5, a.cz, 1.2); let err = 0, k = 0;
  runSea(S, sea, 12, cam, t => { if (t < 6) return; for (const f of S.fish()) if (f.stun > 9 && f.dead) { k++; err = Math.max(err, Math.abs(f.y - seaElevation(sea, f.x, f.z) + 0.04 + f.len * 0.12)); } });
  const mk = () => ({ A: new Float32Array(4000), B: new Float32Array(4000), C: new Float32Array(4000), D: new Float32Array(4000), max: 1000 });
  const O = { fish: mk(), school: mk() }; S.write(O); let wErr = 0, wn = 0;
  for (const q of [O.school, O.fish]) for (let i = 0; i < q.n; i++) { const j = i * 4, x = q.A[j], y = q.A[j + 1], z = q.A[j + 2], top = q.C[j + 3]; if (Math.abs(q.B[j + 2]) > 2.5 && y > top - 0.4) { wErr = Math.max(wErr, Math.abs(top - seaElevation(sea, x, z))); wn++; } }
  check(k > 0 && err < 0.12, 'the dead float on the swell, riding it', `${k} fish-frames, worst ${err.toFixed(2)} m`, '< 0.12');
  check(wn > 0 && wErr < 0.01, '... and are drawn on the exact drawn top', `${wn} floating, top error ${wErr.toFixed(3)} m`);
}

// 23. seabirds: a bait ball draws gannets, terns and gulls in from out of sight; they plunge, dip and sit on the swell
{
  const { sea, surf } = liveSea(3, 11); const S = iso(createFishSim({ depthAt: deep, seed: 57, surf })); const B = createSeaBirds({ seed: 5, surf });
  const cam = { x: 300, y: 25, z: -60 }; const { prey } = S.spawnBaitBall(300, 0);
  let minSpawnD = 1e9, sitErr = 0, sits = 0, plungeV = 0; const seenB = new Set(), kinds = new Set();
  const ballFoci = () => S.signs().filter(s => s.kind === 1).map(s => ({ id: 'b' + s.sc.id, kind: 'ball', x: s.x, z: s.z, k: s.k, r: s.r }));
  for (let t = 0; t < 70; t += 1 / 30) {
    advanceSea(sea, 1 / 30); S.clearThreats(); S.update(1 / 30, cam);
    B.update(1 / 30, cam, { foci: ballFoci(), threats: [] });
    for (const b of B.birds) {
      if (!seenB.has(b)) { seenB.add(b); minSpawnD = Math.min(minSpawnD, Math.hypot(b.x - cam.x, b.z - cam.z)); }
      kinds.add(BIRD_SPECIES[b.sp].key);
      if (B.state(b) === 'sit' && b.t > 0.5) { sits++; sitErr = Math.max(sitErr, Math.abs(b.y - 0.04 - seaElevation(sea, b.x, b.z))); }
      if (B.state(b) === 'plunge') plungeV = Math.max(plungeV, -b.vy);
    }
  }
  check(kinds.size === 3 && B.birds.length >= 6, 'a bait ball draws gannets, terns and gulls', `${B.birds.length} birds: ${[...kinds].join(' ')}`);
  check(minSpawnD > 140, '... flying in from out of sight (no popping in)', `nearest arrival ${minSpawnD.toFixed(0)} m from the camera`, '> 140 m');
  check(B.stats.plunges > 0 && plungeV > 15 && plungeV < 27, 'gannets plunge, folded, at ~20-24 m/s (Lee & Reddish 1981)', `${B.stats.plunges} plunges, ${plungeV.toFixed(1)} m/s`);
  check(B.stats.dips > 0, 'terns and gulls dip at the top', `${B.stats.dips} dips`);
  check(sits > 0 && sitErr < 0.01, 'sitting birds ride the live swell', `${sits} bird-frames sitting, worst ${sitErr.toFixed(3)} m`);
  // a helicopter comes low over them: up off the water, scattering
  const sitting = () => B.birds.filter(b => B.state(b) === 'sit').length;
  const f = ballFoci();
  for (const b of B.birds.slice(0, 4)) { b.st = 3; b.sitT = 30; b.x = prey.cx + (b.x - prey.cx) * 0.1; b.z = prey.cz + (b.z - prey.cz) * 0.1; b.y = seaElevation(sea, b.x, b.z) + 0.04; }
  const s0 = sitting(); for (let t = 0; t < 2; t += 1 / 30) { advanceSea(sea, 1 / 30); B.update(1 / 30, cam, { foci: f, threats: [{ x: prey.cx, y: 15, z: prey.cz, r: 55 }] }); }
  check(s0 >= 4 && sitting() === 0 && B.stats.flushed > 0, 'a helicopter low over them flushes them off the water', `${s0} sitting -> ${sitting()}, ${B.stats.flushed} flushed`);
  // the food gone: they leave, and are gone once out of sight
  for (let t = 0; t < 60; t += 1 / 30) B.update(1 / 30, cam, { foci: [], threats: [] });
  check(B.birds.length === 0 && B.stats.left > 0, 'no food: they fly off out of sight', `${B.birds.length} left over, ${B.stats.left} left`);
}

// 24. after a blast: gulls come for the dead fish, and the shark comes up under them
{
  const S = iso(createFishSim({ depthAt: deep, seed: 59 })); const B = createSeaBirds({ seed: 7 }); const cam = { x: 300, y: 20, z: -40 };
  const m = S.spawnSchool('mackerel', 300, 0), sh = S.spawnSchool('shark', 330, 90); run(S, 2, cam);
  S.blast(m.cx, -0.5, m.cz, 2); const site = S.sites[0]; let sharkD = 1e9;
  for (let t = 0; t < 60; t += 1 / 30) { S.clearThreats(); S.update(1 / 30, cam); const foci = S.sites.filter(s => s.t > 4).map((s, i) => ({ id: 'd' + i, kind: 'dead', x: s.x, z: s.z, k: Math.min(1, s.n / 20), r: 4 })); B.update(1 / 30, cam, { foci, threats: [] }); sharkD = Math.min(sharkD, Math.hypot(sh.cx - site.x, sh.cz - site.z)); }
  check(B.birds.length >= 3 && B.stats.dips > 0, 'gulls come for the dead fish after a blast', `${B.birds.length} gulls, ${B.stats.dips} dips`);
  check(sharkD < 12, 'the sandbar shark comes up under them', `${sharkD.toFixed(1)} m from the blast`);
}

// 25. weather and light: deeper in a rough sea, jellyfish gone; looser schools at night and no birds
{
  const dep = ss => { const S = iso(createFishSim({ depthAt: deep, seed: 61 })); S.sea = ss; const a = S.spawnSchool('sardine', 300, 0); run(S, 15, { x: 300, y: 10, z: 0 }); return -a.cy; };
  const calm = dep(0.1), rough = dep(1);
  check(rough > calm + 1.5, 'a rough sea: the pilchard swim deeper', `${calm.toFixed(1)} m calm -> ${rough.toFixed(1)} m in SS7`);
  const S = createFishSim({ depthAt: deep, seed: 63 }); S.sea = 0.9; run(S, 20, { x: 300, y: 10, z: 0 });
  check(!S.schools.some(sc => SPECIES[sc.sp].key === 'jelly'), 'no jellyfish near the top in a rough sea', `${S.schools.map(sc => SPECIES[sc.sp].key).join(' ')}`);
  const spread = light => { const S = iso(createFishSim({ depthAt: deep, seed: 65 })); S.light = light; S.spawnSchool('sardine', 300, 0); run(S, 20, { x: 300, y: 10, z: 0 }); const fs = S.fish(); return mean(fs.map(f => Math.min(...fs.filter(g => g !== f).map(g => Math.hypot(g.x - f.x, g.y - f.y, g.z - f.z))) / f.len)); };
  const day = spread(1), night = spread(0);
  check(night > day * 1.25, 'schools loosen at night', `nnd ${day.toFixed(2)} -> ${night.toFixed(2)} BL`);
  const B = createSeaBirds({ seed: 9 }); B.light = 0; for (let i = 0; i < 30; i++) B.update(0.5, { x: 0, y: 10, z: 0 }, { foci: [{ id: 'x', kind: 'ball', x: 0, z: 0, k: 1 }], threats: [] });
  check(B.birds.length === 0, 'no seabirds out at night (they roost)', `${B.birds.length}`);
}

// 26. cost: a full HIGH budget (boids on the grid), a hunt, birds; per 60 Hz frame in node
{
  const S = createFishSim({ depthAt: deep, seed: 67 }); S.setQuality('high'); const B = createSeaBirds({ seed: 11 }); const cam = { x: 300, y: 12, z: 0 };
  run(S, 3, cam); S.spawnBaitBall(320, 10);
  let n3 = 0; while (S.nFish < FISH.MAX_FISH - 120 && n3 < 40) { S.spawnSchool(['sardine', 'mackerel'][n3 % 2], 260 + (n3 % 5) * 25, -60 + (n3 % 7) * 22); n3++; }
  let t3 = 0, tb = 0, worst = 0; const foci = [{ id: 'b', kind: 'ball', x: 320, z: 10, k: 1, r: 4 }];
  for (let i = 0; i < 60; i++) { S.clearThreats(); S.hull(300, -40 + i * 0.1, Math.PI, 40, 8, 5, 6); S.update(1 / 60, cam); B.update(1 / 60, cam, { foci, threats: [] }); }
  for (let i = 0; i < 180; i++) { S.clearThreats(); S.hull(300, -34 + i * 0.1, Math.PI, 40, 8, 5, 6); S.update(1 / 60, cam); B.update(1 / 60, cam, { foci, threats: [] }); t3 += S.ms; tb += B.ms; worst = Math.max(worst, S.ms); }
  check(t3 / 180 < 3, `cost of ${S.nFish} boids (HIGH budget ${QUALITY.high.MAX_FISH}) per 60 Hz frame (node)`, `${(t3 / 180).toFixed(2)} ms avg, ${worst.toFixed(2)} worst`, '< 3 ms');
  check(tb / 180 < 0.5, `cost of ${B.birds.length} seabirds per frame`, `${(tb / 180).toFixed(3)} ms`, '< 0.5 ms');
  S.setQuality('medium');
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
