// HORNET arrested landing on the real ALBATROSS: a scripted pilot (stick for the glideslope, throttle for on-speed
// AoA, like the Hornet is flown) from 450 m behind the ship to the wires; screenshots of the approach and the trap.
export default async function (h) {
  await h.waitFor("window.__G && __G.G.state==='play' && __G.H.landed", 15000); await h.wait(600);
  await h.key('tap', 'Digit5'); await h.wait(400);
  await h.expect('__G.G.craft === "jet"');
  await h.eval(`(() => {
    const P = __G.JP, J = P.J, c = __G.war.carrier; J.cat = null; c.path = [];
    const aimZ = 41 - 6.9, gs = 3.5 * Math.PI / 180, dist = 450;
    const loc = (x, z) => { const co = Math.cos(c.yaw), si = Math.sin(c.yaw), dx = x - c.p.x, dz = z - c.p.z; return [dx * co - dz * si, dx * si + dz * co]; };
    const toW = (lx, lz) => { const co = Math.cos(c.yaw), si = Math.sin(c.yaw); return [c.p.x + lx * co + lz * si, c.p.z - lx * si + lz * co]; };
    const [x, z] = toW(-2.5, aimZ + dist);
    J.reset(x, 0, z, c.yaw, { running: true, airborne: true, alt: 8 + 2.3 + Math.tan(gs) * dist - 1.92, speed: 33.5 + c.speed });
    J.gear = J.gearCmd = 1; J.flapSel = 2; J.surf.flap = 1; J.hook = J.hookCmd = 1; J.stores.bomb = [false, false, false, false]; J.fuel = 1000; for (const e of J.eng) e.n = 0.86;
    let thrI = 0.62; window.__trap = { log: [] };
    const casStick = (n) => { const ct = Math.cos(J.attitude().pitch); return Math.max(-1, Math.min(1, n >= ct ? (n - ct) / (3.5 - ct) : (n - ct) / (ct + 1))); };
    P.autopilot = (J, dt) => {
      const o = { pitch: 0, roll: 0, yaw: 0, throttle: [0, 0], brakeL: 0, brakeR: 0 };
      if (J.trapWire || J.wire) { const t = J.wire && J.wire.held === 0 ? 0.8 : 0; o.throttle = [t, t]; if (!J.wire) { o.brakeL = o.brakeR = 1; } return o; }
      if (J.onGround) { o.throttle = [0.8, 0.8]; return o; }
      const [lx, lz] = loc(J.pos.x, J.pos.z), R = lz - aimZ, yDes = 8 + 2.3 + Math.tan(gs) * Math.max(0, R), closure = 33.5;
      const vyDes = -Math.tan(gs) * closure + 0.25 * (yDes - J.pos.y), aerr = J.alpha - 0.1414;
      thrI = Math.max(0, Math.min(0.79, thrI + aerr * 0.8 * dt)); const t = Math.max(0, Math.min(1, thrI + aerr * 3));
      o.throttle = [t, t]; o.pitch = casStick(1 + 0.12 * (vyDes - J.vel.y));
      o.roll = Math.max(-1, Math.min(1, (-(lx + 2.5) * 0.01 - (J.vel.x * Math.cos(c.yaw) - J.vel.z * Math.sin(c.yaw)) * 0.04 - J.attitude().roll) * 1.5));
      return o;
    };
    return 1; })()`);
  await h.eval('__G.cockpitCam = true'); await h.wait(4000); await h.shot('approach-cockpit');
  await h.eval('(__G.cockpitCam = false, __G.JP.snapChase(), 1)'); await h.wait(2500); await h.shot('approach-chase');
  await h.waitFor('__G.JP.J.trapWire > 0 || !__G.JP.alive', 150000);   // (ngc/bugsweep: wall timeouts for 2-5 fps headless)
  await h.eval('({wire: __G.JP.J.trapWire, alive: __G.JP.alive, loss: __G.JP.lastLoss})');
  await h.wait(600); await h.shot('trap-chase');
  await h.waitFor('__G.JP.stoppedOnDeck() || !__G.JP.alive', 120000);
  await h.wait(1500);
  await h.eval('({onDeck: __G.JP.stoppedOnDeck(), wire: __G.JP.J.trapWire, alive: __G.JP.alive})');
  await h.expect('__G.JP.alive && __G.JP.J.trapWire > 0 && __G.JP.stoppedOnDeck()');
  await h.eval('(__G.cockpitCam = true, 1)'); await h.wait(1500); await h.shot('trapped-cockpit');
  // FOUNDATION: Y climbs out onto the deck (the Hornet stays parked where it stopped, the deck crew brings the Huey up),
  // Y at the ladder climbs back in, Y out again, walk to the Huey and fly it
  await h.eval('__G.JP.autopilot = null'); await h.key('tap', 'KeyY'); await h.wait(800);
  await h.expect('__G.G.craft === "foot" && __G.jetC.park.on && __G.JP.active && !__G.G.heliStowed && __G.G.jets === 1');
  await h.eval("(__G.foot.view = 'third', __G.foot.W.yaw += 2.6, 1)"); await h.wait(1200); await h.shot('out-beside-the-parked-hornet');
  await h.eval('(window.__jp = __G.GR.toLocal(__G.war.carrier, __G.JP.J.pos.x, __G.JP.J.pos.z), 1)'); await h.wait(3000);
  await h.eval('({ was: __jp, now: __G.GR.toLocal(__G.war.carrier, __G.JP.J.pos.x, __G.JP.J.pos.z) })');
  await h.expect('(([a, b]) => Math.hypot(a - __jp[0], b - __jp[1]) < 0.1)(__G.GR.toLocal(__G.war.carrier, __G.JP.J.pos.x, __G.JP.J.pos.z))');
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect('__G.G.craft === "jet" && !__G.foot.exists');
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect('__G.G.craft === "foot"');
  await h.eval(`(() => { const d = __G.crafts.toWorld(__G.heliC, [2.6, -1.84, -1.9]), c = __G.war.carrier; return __G.foot.spawnAt({ x: d.x, y: c.p.y + 8, z: d.z, yaw: d.yaw + Math.PI / 2 }); })()`);
  await h.key('tap', 'KeyY'); await h.wait(500);
  await h.expect('__G.G.craft === "heli" && __G.Z.alive');
  await h.eval('(__G.cockpitCam = false, 1)'); await h.wait(1500); await h.shot('huey-and-parked-hornet');
}
