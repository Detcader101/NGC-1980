export const LEVEL_W = 64, LEVEL_H = 56;

// y is up. Cell (ix,iy) covers [ix,ix+1]x[iy,iy+1].
export function buildLevel(visit = 1) {
  const W = LEVEL_W, H = LEVEL_H;
  const solid = new Uint8Array(W * H).fill(1);
  const pad = new Uint8Array(W * H);
  const rect = (x0, y0, x1, y1, v = 0) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) solid[y * W + x] = v; };
  const circ = (cx, cy, r, v = 0) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + .5 - cx, dy = y + .5 - cy;
      if (dx * dx + dy * dy <= r * r) solid[y * W + x] = v;
    }
  };
  rect(29, 43, 35, H - 1);       // exit shaft to the surface
  circ(32, 34, 10);              // main chamber
  rect(8, 28, 24, 33);           // west tunnel
  rect(7, 23, 13, 30);           // drop into pod chamber
  circ(11, 23, 7);               // pod chamber
  rect(29, 8, 35, 28);           // landing shaft
  rect(20, 3, 46, 12);           // base chamber
  circ(52, 35, 7);               // east chamber
  rect(40, 32, 50, 37);          // east tunnel
  for (let x = 29; x <= 35; x++) pad[2 * W + x] = 1;

  const turrets = [
    { x: 16.5, y: 28.4 }, { x: 39.5, y: 12.2 }, { x: 45.5, y: 32.4 }, { x: 52.5, y: 41.2 }, { x: 22.5, y: 34.5 },
  ];
  if (visit >= 2) turrets.push({ x: 4.5, y: 22.5 });
  return {
    W, H, solid, pad, padTop: 3,
    start: { x: 32.5, y: 3.7 },
    orb: { x: 11.5, y: 16.9 },
    tanks: [{ x: 52.5, y: 28.8, fuel: 60 }, { x: 24.5, y: 3.8, fuel: 60 }],
    turrets,
  };
}
