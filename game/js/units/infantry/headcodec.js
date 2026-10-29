// NGC-1980 look-faces: pack / unpack a head surface (SdfKit.mesh() layout) for the baked head bank (headbank.js,
// written by tools/facebake.mjs). Meshing a face at a 2.6 mm cell and reducing it costs ~1.3 s per face; the bank makes
// that a ~5 ms decode. Positions are int16 round the head (13 um steps), normals int8, colour uint16 (linear: no banding
// in the darks), material channels uint8, up to four bone weights per vertex as uint8 pairs, triangles uint16.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 3) {
    const a = u8[i], b = u8[i + 1] ?? 0, c = u8[i + 2] ?? 0, n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u8.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u8.length ? B64[n & 63] : '=');
  }
  return s;
}
function fromB64(s) {
  const L = new Uint8Array(128); for (let i = 0; i < 64; i++) L[B64.charCodeAt(i)] = i;
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0, out = new Uint8Array(s.length / 4 * 3 - pad);
  for (let i = 0, o = 0; i < s.length; i += 4) {
    const n = (L[s.charCodeAt(i)] << 18) | (L[s.charCodeAt(i + 1)] << 12) | (L[s.charCodeAt(i + 2)] << 6) | L[s.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = (n >> 16) & 255; if (o < out.length) out[o++] = (n >> 8) & 255; if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
const R = 0.4, Q = 32767 / R;   // positions within +-0.4 m of the centre
// s: a surface; c: [x, y, z] centre; bones: names -> one packed record { v, t, c, d (base64) }
export function packSurface(s, c, bones) {
  const nv = s.verts, nt = s.index.length / 3, bi = Object.fromEntries(bones.map((b, i) => [b, i]));
  const size = nv * (6 + 3 + 6 + 4 + 2 + 8) + nt * 6, buf = new ArrayBuffer(size + (size & 1)), dv = new DataView(buf); let o = 0;
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { dv.setInt16(o, Math.round((s.pos[i * 3 + k] - c[k]) * Q), true); o += 2; }
  for (let i = 0; i < nv * 3; i++) dv.setInt8(o++, Math.round(Math.max(-1, Math.min(1, s.nor[i])) * 127));
  for (let i = 0; i < nv * 3; i++) { dv.setUint16(o, Math.round(Math.max(0, Math.min(1, s.col[i])) * 65535), true); o += 2; }
  for (let i = 0; i < nv * 4; i++) dv.setUint8(o++, Math.round(Math.max(0, Math.min(1, s.fig[i])) * 255));
  for (let i = 0; i < nv * 2; i++) dv.setUint8(o++, Math.round(Math.max(0, Math.min(1, s.rm[i])) * 255));
  for (let i = 0; i < nv; i++) {
    const e = Object.entries(s.skinAcc[i]).sort((a, b) => b[1] - a[1]).slice(0, 4); let t = 0; for (const [, w] of e) t += w;
    for (let k = 0; k < 4; k++) { dv.setUint8(o++, e[k] ? bi[e[k][0]] : 255); dv.setUint8(o++, e[k] ? Math.round(e[k][1] / (t || 1) * 255) : 0); }
  }
  for (const j of s.index) { dv.setUint16(o, j, true); o += 2; }
  return { v: nv, t: nt, c, d: toB64(new Uint8Array(buf, 0, size)) };
}
export function unpackSurface(p, bones, cell = 0) {
  const nv = p.v, nt = p.t, u8 = fromB64(p.d), dv = new DataView(u8.buffer); let o = 0;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), fig = new Float32Array(nv * 4), rm = new Float32Array(nv * 2), pt = new Float32Array(nv), skinAcc = new Array(nv), index = new Array(nt * 3);
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { pos[i * 3 + k] = dv.getInt16(o, true) / Q + p.c[k]; o += 2; }
  for (let i = 0; i < nv; i++) { const x = dv.getInt8(o), y = dv.getInt8(o + 1), z = dv.getInt8(o + 2), l = Math.hypot(x, y, z) || 1; nor[i * 3] = x / l; nor[i * 3 + 1] = y / l; nor[i * 3 + 2] = z / l; o += 3; }
  for (let i = 0; i < nv * 3; i++) { col[i] = dv.getUint16(o, true) / 65535; o += 2; }
  for (let i = 0; i < nv * 4; i++) fig[i] = dv.getUint8(o++) / 255;
  for (let i = 0; i < nv * 2; i++) rm[i] = dv.getUint8(o++) / 255;
  for (let i = 0; i < nv; i++) { const a = {}; for (let k = 0; k < 4; k++) { const b = dv.getUint8(o++), w = dv.getUint8(o++); if (b !== 255 && w) a[bones[b]] = w / 255; } skinAcc[i] = a; }
  for (let i = 0; i < nt * 3; i++) { index[i] = dv.getUint16(o, true); o += 2; }
  return { pos, nor, col, fig, rm, pt, skinAcc, index, tris: nt, verts: nv, cell };
}
// a short hash of the strings that define the heads (the bank is used only while it matches)
export function sourceKey(parts) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (const s of parts) for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 + c, 2246822507) ^ (h2 >>> 13); }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}
