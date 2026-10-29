// SR-71A in the game (ngc/look-sr71): ?fly=sr71 puts one on a strip 6 km west of the control zone with the player in it.
// The take-off (max AB, rotate ~190-210 KIAS, gear up), the cockpits, a reconnaissance pass at Mach 3.2 / 80,000 ft over
// the zone with the cameras on (targets photographed, photo intel in the fog of war), the view from altitude, an enemy
// HQ's SAM falling short of the SR-71 at speed and height (and hitting a slow, low one), getting out on the ground.
// Long stretches are fast-forwarded in the page (P.update in a loop, no rendering): headless frames are slow.
//   CHROME_PATH=... node snap.mjs scenes/sr71.mjs
export default async function (h) {
  await h.goto('?debug&auto&kb&peace&res=0.45&fly=sr71');
  await h.waitFor("window.__G && __G.G.state==='play' && __G.G.craft==='sr71'", 40000); await h.wait(1500);
  await h.eval('(window.S = __G.sr71C, window.P = S.P, window.A = P.A, window.ff = (sec, fn) => { for (let t = 0; t < sec; t += 0.05) { if (fn) fn(); P.update(0.05); if (!P.alive) break; } return { kias: A.kias, alt: A.altFt, mach: A.mach, x: A.pos.x, y: A.pos.y, dead: A.dead, ground: A.onGround }; }, 1)');
  await h.expect('A.onGround && A.eng.every(e => e.run) && !A.dead');
  await h.shot('on-the-strip-chase');
  await h.eval('(P.view = "cockpit", 1)'); await h.wait(1500); await h.shot('cockpit-on-the-strip');
  // (ngc/sr71-fix) the mouse: main.js hands captured-mouse movement to look(); it must turn the head (it did nothing)
  await h.eval('(__G.head.yaw = 0, __G.head.pitch = 0, __G.crafts.active.look(200, 80), { yaw: __G.head.yaw, pitch: __G.head.pitch })');
  await h.expect('Math.abs(__G.head.yaw + 0.5) < 0.01 && Math.abs(__G.head.pitch + 0.2) < 0.01');
  await h.eval('(__G.head.yaw = 0.9, __G.head.pitch = -0.35, 1)'); await h.wait(800); await h.shot('cockpit-right-panel');
  await h.eval('(__G.head.yaw = 0, __G.head.pitch = 0, P.seat = 1, 1)'); await h.wait(800); await h.shot('rso-cockpit');
  await h.eval('(P.seat = 0, P.view = "chase", 1)');
  // ---- take-off: max AB, rotate from 190 KIAS toward 9 deg, gear up once climbing (fast-forwarded)
  await h.eval('(P.thr = 1, P.thrDetent = false, window.__ov0 = P.override, P.override = c => { const p = A.attitude().pitch; c.pitch = A.kias > 190 && A.pos.y < 400 ? Math.max(-1, Math.min(1, (0.16 - p) * 6 - A.w.y * 2)) : 0; }, ff(60, () => { if (!A.onGround && A.pos.y > 30 && A.gearCmd) P.cmd("gear"); if (A.keas > 380) P.thr = Math.min(P.thr, 0.62); }))');
  await h.eval('(P.override = window.__ov0, A.ap.on = true, A.ap.pitch = "att", A.ap.att = 0.12, A.ap.roll = "hdg", A.ap.hdg = A.heading, { kias: A.kias, alt: A.altFt, gear: A.gearCmd, dead: A.dead })');   // (the autopilot holds the climb while the shots render)
  await h.expect('!A.dead && !A.onGround && A.gearCmd === 0 && A.pos.y > 100');
  await h.wait(1500); await h.shot('climb-out');
  // ---- the recon pass at Mach 3.2 / 80,000 ft: 3 km west of the zone heading east, cameras on; fly across (fast-forward)
  await h.eval('(S.placeInAir(-1280 - 3000, 0, 150, -Math.PI / 2, { ft: 80000, mach: 3.2, fuelLb: 45000, thr: 0.8 }), (__G.G.craft !== "sr71" && __G.crafts.control("sr71", 0, "spawn")), A.ap.on = true, A.ap.pitch = "alt", A.ap.alt = A.pos.y, A.ap.roll = "hdg", A.ap.hdg = A.heading, P.recon.on = true, P.view = "chase", 1)');
  await h.wait(2500); await h.shot('cruise-80000-chase');
  await h.eval('(P.view = "cockpit", 1)'); await h.wait(1500); await h.shot('cruise-80000-cockpit');
  await h.eval('(__G.head.yaw = 1.3, __G.head.pitch = -0.25, 1)'); await h.wait(1000); await h.shot('cruise-80000-look-down-right'); await h.eval('(__G.head.yaw = 0, __G.head.pitch = 0, P.view = "chase", 1)');
  await h.eval('ff(14)');
  await h.eval('({ ok: P.recon.ok, frames: P.recon.frames, seen: P.recon.seen.size, pass: P.recon.pass ? P.recon.pass.found.length : 0, x: A.pos.x })');
  await h.eval('(P.cmd("recon"), { intel: (__G.fog.intel || []).length, feed: [...document.querySelectorAll("#feed div")].slice(-3).map(d => d.textContent) })');
  await h.expect('P.recon.seen.size > 0 && (__G.fog.intel || []).length > 0');
  await h.wait(2500); await h.shot('after-the-pass-map');
  // ---- an enemy HQ / radar site's SAM at the SR-71 at Mach 3.1 / 75,000 ft: it falls short
  await h.eval('(() => { const I = __G.war.islands.find(I => I.owner === 2 && (I.kind === "radar" || I.kind === "hq")); window.__site = I ? I.name : null; if (!I) return null; S.placeInAir(I.x - 25000, 0, I.z, -Math.PI / 2, { ft: 75000, mach: 3.1, fuelLb: 40000, thr: 0.85 }), (__G.G.craft !== "sr71" && __G.crafts.control("sr71", 0, "spawn")); A.ap.on = true; A.ap.pitch = "alt"; A.ap.alt = A.pos.y; A.ap.roll = "hdg"; A.ap.hdg = A.heading; P.samSoon(); return I.name; })()');
  await h.eval('ff(6)'); await h.eval('({ site: window.__site, sams: P.sams.length })');
  await h.expect('P.sams.length > 0');
  await h.wait(1500); await h.shot('sam-in-the-air');
  await h.eval('(ff(90, () => {}), { sams: P.sams.length, damage: A.damage, alive: P.alive, feed: [...document.querySelectorAll("#feed div")].slice(-4).map(d => d.textContent) })');
  await h.expect('P.alive && A.damage === 0 && /FELL SHORT/.test(document.querySelector("#feed").textContent)');
  // ---- the same site against a slow, low SR-71 (Mach 0.9, 30,000 ft): the missile reaches it
  await h.eval('(() => { const I = __G.war.islands.find(I => I.name === window.__site); S.placeInAir(I.x - 20000, 0, I.z, -Math.PI / 2, { ft: 30000, keas: 320, fuelLb: 40000, thr: 0.66 }), (__G.G.craft !== "sr71" && __G.crafts.control("sr71", 0, "spawn")); A.ap.on = true; A.ap.pitch = "alt"; A.ap.alt = A.pos.y; A.ap.roll = "hdg"; A.ap.hdg = A.heading; P.samSoon(); return 1; })()');
  await h.eval('(ff(80), { sams: P.sams.length, damage: A.damage, alive: P.alive, feed: [...document.querySelectorAll("#feed div")].slice(-4).map(d => d.textContent) })');
  await h.expect('A.damage > 0 || !P.alive || /DEF SYSTEMS/.test(document.querySelector("#feed").textContent)');
  // ---- on the ground again (by the home base: the foot soldier needs land to step onto), get out (Y)
  await h.eval('(() => { const B = __G.PAD, x = B.x, z = B.z;   /* (ngc/look-terrain: on the home pad; HOME_B + 45 m is village ground on the new land, no room to get out) */ P.alive = true; A.damage = 0; S.out = true; S.home = null; S.crew = false; S.placeOnGround(x, __G.terrainH(x, z), z, 0, { hot: false });   /* (ngc/sr71-fix: out = the air base flag that she is out of her shelter, basesr71.js; without it present() is false and Y cannot get out) */ __G.crafts.control("sr71", 0, "spawn"); return [x, z]; })()'); await h.wait(1500);
  await h.expect('S.canExit() === "" && __G.G.craft === "sr71"');
  await h.key('tap', 'KeyY'); await h.wait(2000);
  await h.eval('({ craft: __G.G.craft })'); await h.shot('crew-out-beside-it');
  await h.expect('__G.G.craft === "foot"');
}
