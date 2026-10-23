// Steam-gauge kit for the analog cockpits (the TOMCAT's; the dial idiom is the Huey's, hueycockpit.js): canvas faces
// drawn on discs, needles, drums, tapes, caption lamps. Angles in degrees, clockwise from 12 o'clock.
import * as THREE from 'three';

export const TAU = Math.PI * 2, D2R = Math.PI / 180;
export const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif', MONO = 'Consolas, "Liberation Mono", monospace';
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function canvasTex(w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { cv, ctx: cv.getContext('2d'), tex, w, h };
}
export const P2 = (R, r, a, cx = R, cy = R) => [cx + Math.sin(a * D2R) * r, cy - Math.cos(a * D2R) * r];
export function txt(c, t, x, y, col, size, align = 'center', font = SANS, bold = true) { c.fillStyle = col; c.font = `${bold ? 'bold ' : ''}${Math.round(size)}px ${font}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(t, x, y); }
export function faceBg(c, W, col = '#0c0d0e') { const R = W / 2; c.clearRect(0, 0, W, W); c.fillStyle = col; c.beginPath(); c.arc(R, R, R, 0, TAU); c.fill(); }
export function band(c, R, a0, a1, col, r, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(R, R, r, (a0 - 90) * D2R, (a1 - 90) * D2R); c.stroke(); }
export function radial(c, R, a, col, r0, r1, w) { const [x0, y0] = P2(R, r0, a), [x1, y1] = P2(R, r1, a); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
export function needle(c, R, a, len, col = '#f2f2ea', w = R * 0.07, tail = 0.2, cx = R, cy = R) {
  c.save(); c.translate(cx, cy); c.rotate(a * D2R); c.fillStyle = col; c.beginPath();
  c.moveTo(-w / 2, tail * R); c.lineTo(-w * 0.32, -len * 0.8); c.lineTo(0, -len); c.lineTo(w * 0.32, -len * 0.8); c.lineTo(w / 2, tail * R); c.closePath(); c.fill(); c.restore();
}
export function hub(c, R, r = 0.09) { c.fillStyle = '#2a2b2c'; c.beginPath(); c.arc(R, R, R * r, 0, TAU); c.fill(); c.strokeStyle = '#666'; c.lineWidth = 1; c.stroke(); }
export function offFlag(c, W, t = 'OFF', x = 0.3, y = 0.62, rot = -0.35) {   // red / white striped failure flag
  const R = W / 2; c.save(); c.translate(W * x, W * y); c.rotate(rot); const w = R * 0.62, h = R * 0.24;
  c.fillStyle = '#d82a18'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = '#f4f0e0'; c.lineWidth = R * 0.03;
  for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * w / 6 - h / 2, h / 2); c.lineTo(i * w / 6 + h / 2, -h / 2); c.stroke(); }
  c.fillStyle = '#111'; c.fillRect(-w * 0.32, -h * 0.36, w * 0.64, h * 0.72); txt(c, t, 0, 1, '#f4f0e0', h * 0.62); c.restore();
}
// barber pole (gear in transit, failure windows)
export function barber(c, x, y, w, h) { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = '#f0ece0'; c.fillRect(x, y, w, h); c.fillStyle = '#c8281a'; for (let i = -h; i < w + h; i += h * 0.7) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + h * 0.35, y + h); c.lineTo(x + i + h * 0.35 + h, y); c.lineTo(x + i + h, y); c.fill(); } c.restore(); }
export const lin = (v0, a0, v1, a1) => v => a0 + clamp((v - v0) / (v1 - v0), -0.02, 1.04) * (a1 - a0);   // needles stop just past the ends
// a standard round face: ticks, labels, coloured arcs, red radials, title (o.map: value -> angle)
export function dialFace(c, W, o) {
  const R = W / 2, m = o.map; faceBg(c, W);
  for (const [va, vb, col] of o.bands || []) band(c, R, m(va), m(vb), col, R * 0.86, R * 0.09);
  for (let v = o.v0; v <= o.v1 + 1e-6; v += o.minor) {
    const maj = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-4; radial(c, R, m(v), '#ecebe2', R * (maj ? 0.74 : 0.82), R * 0.93, maj ? R * 0.045 : R * 0.025);
  }
  for (const v of o.reds || []) radial(c, R, m(v), '#e8281a', R * 0.7, R * 0.96, R * 0.06);
  for (const [v, t] of o.labels || []) { const [x, y] = P2(R, R * (o.lr || 0.56), m(v)); txt(c, t, x, y, '#ecebe2', R * (o.ls || 0.2)); }
  if (o.title) o.title.split('|').forEach((t, i, a) => txt(c, t, R, R * (o.ty || 1.36) + (i - (a.length - 1) / 2) * R * 0.15, '#cfcdc0', R * (o.ts || 0.12)));
}
// a digit drum window (counters on altimeters, fuel totalisers)
export function drum(c, x, y, w, h, value, digits, col = '#f2f2ea', bg = '#050505') {
  c.fillStyle = bg; c.fillRect(x, y, w, h); c.strokeStyle = '#555'; c.lineWidth = 1; c.strokeRect(x, y, w, h);
  const s = String(Math.max(0, Math.round(value))).padStart(digits, '0').slice(-digits), dw = w / digits;
  for (let i = 0; i < digits; i++) txt(c, s[i], x + dw * (i + 0.5), y + h / 2 + 1, col, h * 0.78, 'center', SANS);
}
