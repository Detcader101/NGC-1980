// Segment / oriented wall-box intersection, shared by world rooms and the carrier interior.
// Test the actual door leaves, so opening a door removes its muffling. No rendered-geometry raycasts.
export function crossesBox(a, b, p) {
  const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
  const ax = (a.x - p.x) * c - (a.z - p.z) * s, az = (a.x - p.x) * s + (a.z - p.z) * c;
  const bx = (b.x - p.x) * c - (b.z - p.z) * s, bz = (b.x - p.x) * s + (b.z - p.z) * c;
  let enter = 0.015, leave = 0.985; // do not occlude on a speaker's own mouth or the listener's eye
  for (const [v, d, lo, hi] of [[ax, bx - ax, -p.hw, p.hw], [az, bz - az, -p.hl, p.hl], [a.y, b.y - a.y, p.y0, p.y1]]) {
    if (Math.abs(d) < 1e-7) { if (v < lo || v > hi) return false; continue; }
    const t0 = (lo - v) / d, t1 = (hi - v) / d;
    enter = Math.max(enter, Math.min(t0, t1)); leave = Math.min(leave, Math.max(t0, t1));
    if (enter > leave) return false;
  }
  return true;
}
export function wallBetween(a, b, solid, carrier) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  if (solid) for (const p of solid.near((a.x + b.x) / 2, (a.z + b.z) / 2, d / 2 + 1)) {
    if (p.hw === undefined || (!p.D && Math.max(p.hw, p.hl) < 0.5) || p.crew || p.furn) continue;
    if (crossesBox(a, b, p)) return true;
  }
  if (carrier?.interior && Math.hypot(a.x - carrier.p.x, a.z - carrier.p.z) < 300) {
    const c = Math.cos(carrier.yaw), s = Math.sin(carrier.yaw), y = carrier.p.y + (carrier.att?.heave || 0);
    const local = p => ({ x: (p.x - carrier.p.x) * c - (p.z - carrier.p.z) * s, y: p.y - y, z: (p.x - carrier.p.x) * s + (p.z - carrier.p.z) * c });
    const aa = local(a), bb = local(b);
    for (const box of carrier.interior.boxes()) {
      if (Math.max(box[1] - box[0], box[3] - box[2]) < 0.6) continue;
      if (crossesBox(aa, bb, { x: (box[0] + box[1]) / 2, z: (box[2] + box[3]) / 2, hw: (box[1] - box[0]) / 2, hl: (box[3] - box[2]) / 2, y0: box[4], y1: box[5] })) return true;
    }
  }
  return false;
}
