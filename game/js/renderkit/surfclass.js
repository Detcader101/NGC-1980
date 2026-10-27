// RENDERKIT materials (ngc/depth-materials): surface classes for the lived-in world's merged geometry. Pure (no THREE),
// so kit.js can tag triangles in the world worker. A triangle's class comes from the palette colour it was drawn with:
// world/kit.js col(hex) looks the hex up here, shade()/mixc() keep it, kit.surf(c, cls) overrides it. Geo.build() writes
// one byte per vertex (attribute rkSurf); renderkit/detail.js picks the procedural detail by it. Unlisted colours are
// GENERIC (a fine grain and mottling only), so nothing ever gets a wrong pattern, only a plain one.
export const SURF = Object.freeze({
  GENERIC: 0, PLASTER: 1, CONCRETE: 2, BAG: 3, TARMAC: 4, METAL: 5, WOOD: 6, BRICK: 7, TILE: 8, SLATE: 9,
  CORRUGATED: 10, EARTH: 11, STONE: 12, PLAIN: 13, CANVAS: 14, TURF: 15, MARKING: 16,
});
const S = SURF;
const T = [
  // world/models.js PAL + C
  [S.PLASTER, 0xe9e5da, 0xe8e0c8, 0xe6d6a8, 0xdcc0a8, 0xc9d3d6, 0xb4ada0, 0xd8d2c4, 0xefe9de, 0xd9c79a, 0xe8dfc0, 0xc9c0a8, 0xe8e6e0, 0xf0eee8, 0xc8c4b0],
  [S.STONE, 0x8f897c, 0x7d786d, 0x9a9384, 0xa59d8a, 0x8d887c],
  [S.BRICK, 0x9a523e, 0x86463a, 0xa0624a, 0x7a4a3a],
  [S.SLATE, 0x4b515b, 0x3d424a, 0x575d66, 0x6a6a6a],
  [S.TILE, 0xa3553b, 0x8e4a33, 0x6b4330, 0x5c5048, 0x7a3a2a],
  [S.PLAIN, 0x2b3846, 0x3d4e5c, 0x3a4a50, 0x2b3846, 0x1c1c1e, 0x18191a, 0xf0eccc],
  [S.WOOD, 0x6b5038, 0x8a6a48, 0x8a6a3a, 0x5a4632, 0x7a6248],
  [S.METAL, 0x7c8186, 0x7a4a32, 0x6c7276, 0x9aa0a6, 0x4b5320, 0x5d6532, 0x2a2c2e, 0x8a2a1a],
  [S.CONCRETE, 0x9a958a, 0xa8a49a, 0x8e8b84, 0x9a978e, 0x86847c, 0x8a857a, 0x76736c, 0x8a8780, 0x5a5852, 0x8c8a84],
  [S.TARMAC, 0x3e3f42, 0x4c4d50, 0x56575a, 0x5e5c5a],
  [S.MARKING, 0xe8e6dc, 0xd8b84a],
  [S.EARTH, 0x6a6644, 0x8a7356, 0x6e6a52, 0x7a6a52, 0x6e5038, 0x5e4330],
  [S.TURF, 0x55753a],
  [S.BAG, 0x9c9070, 0x8a8064, 0xb8a678, 0xa89668],
  [S.CANVAS, 0x5a5a38, 0x55553a, 0x3e4a2a, 0x5a5034],
];
export const SURF_HEX = new Map();
for (const [cls, ...hexes] of T) for (const h of hexes) if (!SURF_HEX.has(h)) SURF_HEX.set(h, cls);
