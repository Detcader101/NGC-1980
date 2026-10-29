// UH-1H cockpit (game/js/hueycockpit.js): look around the whole interior, read the gauges, light cautions, hover and
// click a switch through the real mouse path, then a climbing turn so the attitude indicator and VSI move.
//   CHROME_PATH=... node snap.mjs scenes/hueycockpit.mjs
export default async function (h) {
  await h.goto('?debug&kb&peace&cockpit&res=0.6');
  await h.waitFor('window.__G', 10000);
  await h.key('tap', 'Enter');
  await h.waitFor("__G.G.state==='play'", 10000);
  const park = () => h.eval('(__G.H.reset(new __G.THREE.Vector3(__G.PAD.x, __G.HOME_B.h + 2, __G.PAD.z), 0.8, true, 1), __G.HI.setCollective(0), 1)');
  await park(); await h.wait(2500);
  // hold the head where we want it (the game eases it back to centre while the mouse isn't captured)
  await h.eval('(window.__hy = null, window.__hyI = setInterval(() => { if (__hy) { __G.head.yaw = __hy[0]; __G.head.pitch = __hy[1]; } }, 5), 1)');
  const look = async (yaw, pitch, ms = 500) => { await h.eval(`(__hy = [${yaw}, ${pitch}], __G.head.yaw = ${yaw}, __G.head.pitch = ${pitch}, 1)`); await h.wait(ms); };
  await h.expect('__G.cockpit.group.visible');
  // every switch main.js handles has a hit box within reach (< 2.5 m from the eye)
  await h.expect("['bat','gen','inv','engine','gov','hyd','trim','light','sas','radio','fire','mc','lowrpm','starter'].every(id => { const b = __G.cockpit.hitBoxes.find(o => o.userData.sw === id); if (!b) return false; const p = new __G.THREE.Vector3(); b.getWorldPosition(p); return p.distanceTo(__G.zCam.position) < 1.5; })");
  await look(0, 0, 800);
  await h.eval('({ nr: __G.H.rpm, n1: __G.H.n1, tq: __G.H.torque, egt: __G.H.egt, ac: __G.SY.ac, volts: __G.SY.volts, cautions: __G.SY.cautions })');
  await h.shot('ahead'); await h.notblank();
  await look(0.18, -0.42); await h.shot('engine-instruments');
  // contact sheet of every gauge face as drawn right now (hot on the pad, rotor at 324)
  const sheet = async name => { await h.eval(`(() => { const d = document.createElement('canvas'); d.id = '__sheet'; d.width = 1280; d.height = 720; Object.assign(d.style, { position: 'fixed', left: 0, top: 0, zIndex: 99, background: '#333' }); const c = d.getContext('2d'); c.fillStyle = '#333'; c.fillRect(0, 0, 1280, 720); let x = 0, y = 0; for (const cv of __G.cockpit.canvases().slice(0, -4)) { const s = 158; if (x + s > 1280) { x = 0; y += s; } c.drawImage(cv, x, y, s, s); x += s; } const cs = __G.cockpit.canvases(); c.drawImage(cs[cs.length - 4], 0, 480, 360, 240); c.drawImage(cs[cs.length - 3], 380, 474, 230, 246); c.drawImage(cs[cs.length - 2], 620, 474, 230, 246); c.drawImage(cs[cs.length - 1], 860, 560, 420, 94); document.body.appendChild(d); return 1; })()`); await h.wait(100); await h.shot(name); await h.eval("(document.getElementById('__sheet').remove(), 1)"); };
  await sheet('sheet-pad');
  await look(-0.45, -0.3); await h.shot('pilot-and-centre');
  // pedestal: light cautions (governor to EMER, transmission damage) and the master caution
  await h.eval('(__G.SY.gov = "EMER", __G.D.hp.xmsn = 0.3, 1)'); await h.wait(1200);
  await h.eval('({ cautions: __G.SY.cautions, mc: __G.SY.masterCaution })');
  await h.expect('__G.SY.cautions.includes("GOV EMER") && __G.SY.masterCaution');
  await look(0.72, -0.95); await h.shot('pedestal-cautions');
  await look(1.05, -0.75); await h.shot('pedestal-radios');
  await h.eval('(__G.SY.gov = "AUTO", __G.D.hp.xmsn = 1, 1)');
  await look(1.45, 0.55); await h.shot('overhead');
  await look(1.5, -0.95); await h.shot('collective');
  await look(-1.4, -0.1); await h.shot('right-door');
  await look(1.9, -0.05); await h.shot('left-door');
  await look(0.05, -1.1); await h.shot('chin-bubble');
  await look(2.5, -0.2); await h.shot('cargo');
  await look(-2.5, -0.2); await h.shot('cargo-right');
  // hover + click the BATTERY switch on the overhead through the real mouse path (mousemove + mousedown at its screen spot)
  await look(1.45, 0.55, 400);
  // window.__at(id): move the cursor onto a switch's hit box (re-aimed every poll: the camera shakes a little with the rotor)
  await h.eval(`(window.__at = id => { const b = __G.cockpit.hitBoxes.find(o => o.userData.sw === id); const p = new __G.THREE.Vector3(); b.getWorldPosition(p); p.project(__G.zCam); dispatchEvent(new MouseEvent('mousemove', { clientX: (p.x + 1) / 2 * innerWidth, clientY: (1 - p.y) / 2 * innerHeight })); return true; }, 1)`);
  await h.waitFor("__at('bat') && document.getElementById('hint').textContent.startsWith('BATTERY')", 5000);
  await h.shot('hover-battery');
  await h.eval('(window.__b0 = __G.SY.bat, __at("bat"), __G.renderer.domElement.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true })), __G.renderer.domElement.dispatchEvent(new MouseEvent("mouseup", { button: 0, bubbles: true })), 1)');
  await h.waitFor('__G.SY.bat !== __b0', 5000);   // the click lands on the next game frame (slow under load)
  await h.expect('__G.SY.bat !== __b0');
  await h.wait(1500); await h.eval('({ bat: __G.SY.bat, volts: __G.SY.volts, ac: __G.SY.ac })');
  await h.shot('battery-off');
  await h.eval('(__G.SY.toggle("bat"), 1)');
  // AC lost: inverter off -> attitude OFF flag, torque / fuel / oil pressure drop
  await h.eval('(__G.SY.inv = false, 1)'); await h.wait(1800);
  await look(0.15, -0.3); await h.expect('!__G.SY.ac'); await h.shot('inverter-off'); await sheet('sheet-no-ac');
  await h.eval('(__G.SY.inv = true, 1)');
  // airborne in a climbing right turn (the stability assist flies it, we hold right cyclic and collective)
  await h.eval('(__G.H.reset(new __G.THREE.Vector3(__G.PAD.x, 80, __G.PAD.z), 0.8, false, 1), __G.HI.setCollective(0.62), 1)');
  await look(0, 0, 200);
  await h.key('down', 'KeyD'); await h.key('down', 'KeyW'); await h.wait(2500);
  await h.key('down', 'Space'); await h.wait(700); await h.key('up', 'Space');
  await h.wait(800);
  await h.eval('({ ias: __G.H.ias, vsi: __G.H.vel.y * 196.85, roll: __G.H.attitude().roll, pitch: __G.H.attitude().pitch, y: __G.H.pos.y, tq: __G.H.torque })');
  await h.shot('turn-ahead');
  await look(0.12, -0.35, 300); await h.shot('turn-instruments'); await sheet('sheet-turn');
  await h.key('up', 'KeyD'); await h.key('up', 'KeyW');
  await h.expect('__G.Z.alive');
  await h.eval('(clearInterval(__hyI), 1)');
}
