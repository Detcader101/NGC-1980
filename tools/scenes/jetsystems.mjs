// HORNET systems: controls panel, battle damage, engine fire + extinguisher, FCS DIRECT, pilot G-LOC, ejection.
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(500);
  await h.key('tap', 'Digit5'); await h.wait(300);
  const place = (alt, tas) => h.eval(`(() => { const J = __G.JP.J; J.cat = null; J.reset(-900, 0, 300, 0, { running: true, airborne: true, alt: ${alt}, speed: ${tas} }); for (const e of J.eng) e.n = 0.95; return 1; })()`);
  await place(300, 100);
  // controls panel (J): opens, suspends the controls, Esc closes
  await h.key('tap', 'KeyJ'); await h.wait(500);
  await h.expect('__G.CTL.isOpen');
  await h.shot('controls-panel');
  await h.key('tap', 'Escape'); await h.wait(300);
  await h.expect('!__G.CTL.isOpen');
  // battle damage and an engine fire: the caution panel and fire light come on; the extinguisher puts it out
  await h.eval('(__G.cockpitCam = true, __G.JP.autopilot = (J) => ({ pitch: Math.max(-1, Math.min(1, -J.vel.y * 0.03 + (300 - J.pos.y) * 0.004)), roll: -J.attitude().roll * 2, yaw: 0, throttle: [0.75, 0.75], brakeL: 0, brakeR: 0 }), 1)');
  await h.eval('(__G.hurtHeli(0.3, "FLAK"), __G.JP.D.hp.engL = 0.3, __G.JP.D.fire[0] = true, 1)');
  await h.wait(1500);
  await h.eval('({cautions: __G.JP.cautions, mc: __G.JP.masterCaution, egtL: __G.JP.J.eng[0].egt, thrL: __G.JP.J.eng[0].thrust, thrR: __G.JP.J.eng[1].thrust})');
  await h.expect('__G.JP.cautions.includes("L FIRE") && __G.JP.masterCaution');
  await h.shot('engine-fire');
  await h.eval('(__G.JP.cmd("fireL"), 1)'); await h.wait(300);
  await h.expect('!__G.JP.D.fire[0]');
  await h.eval('(__G.JP.cmd("mc"), 1)'); await h.expect('!__G.JP.masterCaution');
  // FCS DIRECT and back
  await h.eval('(__G.JP.cmd("cas"), 1)'); await h.wait(500); await h.expect('__G.JP.J.cas === false && __G.JP.J.casActive === false');
  await h.eval('(__G.JP.cmd("cas"), 1)'); await h.wait(300); await h.expect('__G.JP.J.cas === true');
  // sustained 7.5 g at 400 kt: grey-out, then G-LOC
  await place(1000, 135); await h.eval(`__G.JP.autopilot = (J) => ({ pitch: 1, roll: 0, yaw: 0, throttle: [1, 1], brakeL: 0, brakeR: 0 })`);
  await h.waitFor('__G.JP.blood > 0.5', 10000); await h.shot('greyout');
  await h.waitFor('__G.JP.gloc > 0', 12000);
  await h.eval('({gloc: __G.JP.gloc, nz: __G.JP.J.nz, gfx: __G.JP.gfx(), ctl: __G.JP.ctl.pitch})');
  await h.expect('__G.JP.gfx().grey === 1');
  await h.shot('gloc');
  await h.eval('(__G.JP.autopilot = (J) => ({ pitch: 0, roll: -J.attitude().roll, yaw: 0, throttle: [0.7, 0.7], brakeL: 0, brakeR: 0 }), 1)');
  await h.waitFor('__G.JP.gloc <= 0', 8000);
  await h.expect('__G.JP.alive');
  await h.eval('JSON.stringify(__G.JP.lastLoss || null)');
  // eject low over the sea: the seat goes, the chute opens, the pilot is picked up, back to the helicopter
  await place(60, 80); await h.eval('__G.JP.autopilot = null');
  const lives = await h.eval('__G.G.lives');
  await h.key('hold', 'Backspace', 1300);
  await h.expect('!!__G.JP.ejected');
  await h.wait(2500); await h.shot('ejected');
  await h.waitFor('__G.G.craft === "heli"', 40000);
  await h.expect(`__G.G.lives === ${lives}`);
}
