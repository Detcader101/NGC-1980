// armordriver.js - an AI driver for the tracked vehicles (createM60A3 / createM113 / a bare createTrackSim). PURE: no
// THREE, no DOM: it only turns a goal into the same driver inputs a player gives (accelerator, brake, T-bar / laterals,
// range selector, parking brake), so an AI vehicle obeys exactly the physics the player's does. Used by the landing
// craft (drive off the ramp, up the beach) and offered to the RUNAWAY ground war (seized MBTs on trackfm).
//
//   const D = createTrackDriver(V, { pivot: true });   // pivot: the vehicle can turn on the spot (cross-drive, M60A3)
//   D.goTo(x, z, { speed: 6, arrive: 3 });              // m/s; stops (park brake on) within `arrive` metres
//   D.follow([[x, z], ...], { speed, loop, arrive });   // a route (pure pursuit with a speed-dependent look-ahead)
//   D.reverse(m, { speed })                             // back up m metres
//   D.stop(); D.hold()                                  // brake to a stop and park / stay parked
//   const inp = D.update(dt);                           // every frame before V.step(dt, env, { ...inp, ...gunner })
//   D.state: 'idle' | 'driving' | 'arrived' | 'stuck'   D.dist (m to go), D.err (rad heading error)
//
// Steering: the desired yaw rate is proportional to the heading error to a look-ahead point; the T-bar closes the loop
// on the measured yaw rate (a tank steers by speed difference: the response is a rate, not an angle) and is narrowed
// with speed (a hard steer at speed skids the tracks and can throw one). Speed: slows for the heading error and for the
// stop (v = sqrt(2 a d)), throttle from a PI loop, brakes when too fast. Big heading errors at a crawl pivot (in neutral,
// cross-drive) or creep round. Stuck (commanded but not moving for 4 s): back off 3 s steering the other way, try again,
// three times, then give up (state 'stuck').
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createTrackDriver(V, opt = {}) {
  const fm = V.fm || V;
  const ranges = fm.P.TRANS.ranges || {};
  const FWD = opt.fwd || (ranges.H ? 'H' : ranges['1-3'] ? '1-3' : Object.keys(ranges).find(k => k !== 'R' && k !== 'N'));
  const LOW = opt.low || (ranges.L ? 'L' : ranges['1-2'] ? '1-2' : FWD);
  const pivot = opt.pivot ?? !!ranges.L;   // the CD-850 pivots in neutral; the M113's controlled differential cannot
  const inp = { throttle: 0, brake: 0, steer: 0, range: 'N', park: true };
  const D = { state: 'idle', inp, route: null, i: 0, speed: 6, arrive: 3, loop: false, dist: 0, err: 0, ve: 0, stuckT: 0, backT: 0, tries: 0, rev: 0 };
  const pos = () => { const o = fm.origin(); return o; };
  const heading = () => fm.out.heading ?? fm.attitude().heading;   // 0 = facing -z; + = left
  D.goTo = (x, z, o = {}) => D.follow([[x, z]], o);
  D.follow = (pts, o = {}) => {
    D.route = pts.map(p => [p[0], p[1]]); D.i = 0; D.speed = o.speed ?? 6; D.arrive = o.arrive ?? 3; D.loop = !!o.loop;
    D.state = 'driving'; D.stuckT = 0; D.backT = 0; D.tries = 0; D.ve = 0; D.rev = 0; return D;
  };
  D.reverse = (m, o = {}) => { D.rev = m; D.revFrom = pos(); D.speed = o.speed ?? 2; D.state = 'driving'; D.route = null; return D; };
  D.stop = () => { D.route = null; D.rev = 0; D.state = 'arrived'; return D; };
  D.hold = () => { D.route = null; D.rev = 0; D.state = 'idle'; return D; };
  // speed controller: throttle / brake for a wanted forward speed (m/s, + forward)
  function speedTo(want, dt) {
    const v = fm.out.fwd, e = Math.abs(want) - Math.abs(v);
    D.ve = clamp(D.ve + e * dt * 0.25, -0.3, 0.6);
    if (Math.abs(want) < 0.05) { inp.throttle = 0; inp.brake = Math.abs(v) > 0.3 ? 1 : 0.6; return; }
    if (Math.sign(v) && Math.sign(v) !== Math.sign(want) && Math.abs(v) > 0.4) { inp.throttle = 0; inp.brake = 1; return; }   // wrong way: stop first
    inp.range = want < 0 ? 'R' : Math.abs(want) < 3 && fm.out.pitch > 0.15 ? LOW : FWD;
    inp.throttle = clamp(0.35 + 0.18 * e + D.ve, 0, 1); inp.brake = e < -1.2 ? clamp(-e * 0.25, 0, 0.8) : 0;
  }
  D.update = (dt) => {
    inp.steer = 0;
    if (D.state === 'idle' || D.state === 'arrived' || D.state === 'stuck') {
      speedTo(0, dt); if (Math.abs(fm.out.fwd) < 0.4) { inp.park = true; inp.range = 'N'; inp.brake = 0; } return inp;
    }
    inp.park = false;
    const p = pos(), hd = heading(), fx = -Math.sin(hd), fz = -Math.cos(hd), v = fm.out.fwd;
    // ---- backing off a jam
    if (D.backT > 0) {
      D.backT -= dt; speedTo(-1.8, dt); inp.steer = D.backSteer; if (D.backT <= 0) { D.stuckT = 0; D.ve = 0; } return inp;
    }
    // ---- a straight reverse
    if (D.rev > 0) {
      const gone = Math.hypot(p[0] - D.revFrom[0], p[2] - D.revFrom[2]);
      if (gone >= D.rev) { D.rev = 0; D.stop(); speedTo(0, dt); return inp; }
      speedTo(-D.speed, dt); return inp;
    }
    if (!D.route || !D.route.length) { D.stop(); return D.update(dt); }
    // ---- pure pursuit: the look-ahead point along the route
    let [tx, tz] = D.route[D.i];
    let dist = Math.hypot(tx - p[0], tz - p[2]);
    const last = D.i === D.route.length - 1;
    if (!last && dist < Math.max(6, Math.abs(v) * 1.6)) { D.i++; [tx, tz] = D.route[D.i]; dist = Math.hypot(tx - p[0], tz - p[2]); }
    if (last && dist < D.arrive) { if (D.loop) { D.i = 0; } else { D.stop(); return D.update(dt); } }
    let togo = dist; for (let k = D.i; k < D.route.length - 1; k++) togo += Math.hypot(D.route[k + 1][0] - D.route[k][0], D.route[k + 1][1] - D.route[k][1]);
    D.dist = togo;
    // obstacles (opt.env: an armorworld env): something solid on the line to the look-ahead point -> aim past its side
    if (opt.env && opt.env.obstacles) {
      const lx = tx - p[0], lz = tz - p[2], L = Math.hypot(lx, lz) || 1, ux = lx / L, uz = lz / L, hw = opt.halfW || 1.8;
      let worst = null;
      for (const o of opt.env.obstacles(p[0], p[2], Math.min(L, 30)) || []) {
        if (o.breakN && opt.push && o.breakN < opt.push) continue;   // small trees: push through them
        if (String(o.id).startsWith('craft:' + (opt.selfId || '-'))) continue;
        const r = o.kind === 'cyl' ? o.r : Math.hypot(o.hx, o.hz), ox = o.x - p[0], oz = o.z - p[2], t = ox * ux + oz * uz;
        if (t < 0 || t > L + r) continue;
        const side = ox * uz - oz * ux, need = r + hw + 1.2;   // + = the obstacle is to the right of the line
        if (Math.abs(side) < need && (!worst || t < worst.t)) worst = { t, side, need, o };
      }
      if (worst) {   // a point beside it, on the side the line already passes
        const s = worst.side > 0 ? -1 : 1, ox = worst.o.x, oz = worst.o.z;
        tx = ox + uz * worst.need * s; tz = oz - ux * worst.need * s;   // n = (uz, -ux): the side away from it
        D.avoiding = worst.o.id;
      } else D.avoiding = null;
    }
    const want = Math.atan2(-(tx - p[0]), -(tz - p[2]));   // heading to the target (same convention as fm heading)
    const err = wrap(want - hd); D.err = err;
    // ---- speed: slow for the turn and for the stop
    let vs = D.speed * Math.max(0.15, Math.cos(Math.min(Math.abs(err), 1.4)) ** 2);
    if (!D.loop) vs = Math.min(vs, Math.sqrt(2 * 0.9 * Math.max(0, togo - D.arrive * 0.5)) + 0.4);
    // ---- steering: a yaw-rate loop (+ steer = right = heading decreases)
    const wantRate = clamp(err * 0.9, -0.55, 0.55), rate = fm.out.yawRate;
    const narrow = clamp(1 - Math.abs(v) * 3.6 / (pivot ? 45 : 34), pivot ? 0.3 : 0.22, 1);
    let steer = clamp(-(wantRate * 1.5 + (wantRate - rate) * 2.2), -1, 1) * narrow;
    if (Math.abs(err) > 1.0 && Math.abs(v) < 2.5) {   // facing away: turn on the spot (pivot) or creep round
      if (pivot) { inp.range = "N"; inp.throttle = 0.45; inp.brake = 0; inp.steer = clamp(-Math.sign(err), -1, 1); if (Math.abs(fm.out.yawRate) < 0.03) D.stuckT += dt; if (D.stuckT > 4) { D.stuckT = 0; D.tries++; D.backT = 3; D.backSteer = 0; if (D.tries > 3) D.state = "stuck"; } return inp; }
      vs = 1.6; steer = -Math.sign(err);
    }
    inp.steer = steer;
    speedTo(vs, dt);
    // ---- stuck?
    if (vs > 0.8 && Math.abs(v) < 0.25) D.stuckT += dt; else D.stuckT = Math.max(0, D.stuckT - dt * 0.5);
    if (D.stuckT > 4) {
      D.tries++; D.stuckT = 0;
      if (D.tries > 3) { D.state = 'stuck'; return D.update(dt); }
      D.backT = 3; D.backSteer = steer > 0 ? -0.6 : 0.6;
    }
    return inp;
  };
  return D;
}
