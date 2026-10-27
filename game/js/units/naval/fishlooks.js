// Small, deterministic pigment atlas for the existing warm-temperate fish roster.
// These are readable low-poly field marks, not taxonomic plates: see findings/fish-patterns.md for sources/limits.
// Coordinates: s runs tail -> nose, tone runs belly -> back. Both flanks use the same pattern.
export const FISH_LOOK = {
  // shape: body height/width, tail span, dorsal height; profile: fork depth, head fullness, pectoral span, dorsal shift
  sardine: { shape: [.85, .72, .95, .75], tail: [1, 1], profile: [.025, 1, 1, 0], back: 0x254c55, side: 0xbac4c6, belly: 0xe6eced, fin: 0x6c7a80, pattern: 'flank-spots' },
  mackerel: { shape: [.82, .8, 1.15, .9], tail: [1, 1], profile: [.035, .9, .9, 0], back: 0x285a55, side: 0xabbec0, belly: 0xe2e6e6, fin: 0x52605e, pattern: 'wavy-dorsal-bars' },
  mullet: { shape: [1, .98, .85, 1], tail: [1, 1], profile: [-.025, 1.25, 1, 0], back: 0x565f58, side: 0xaeb5ae, belly: 0xd8dad4, fin: 0x5c6260, pattern: 'longitudinal-lines' },
  amberjack: { shape: [1.12, .8, 1.3, .9], tail: [1, 1], profile: [.035, 1, 1, 0], back: 0x535354, side: 0xb2b4aa, belly: 0xd8d5cc, fin: 0x8c7a42, pattern: 'amber-flank-band' },
  bonito: { shape: [.98, .9, 1.35, .85], tail: [1, 1], profile: [.04, .9, .85, 0], back: 0x284d65, side: 0xb4c2cb, belly: 0xe8ecee, fin: 0x3a4a58, pattern: 'oblique-dorsal-bars' },
  flyingfish: { shape: [.72, .72, 1.15, .55], tail: [.8, 1.35], profile: [.015, 1.1, 1, 0], back: 0x264b72, side: 0xadbed1, belly: 0xeef2f6, fin: 0x55708e, pattern: 'blue-silver' },
  bream: { shape: [1.8, .7, 1.05, 1.15], tail: [1, 1], profile: [.015, 1.05, 1, 0], back: 0x7d817d, side: 0xc8cbc5, belly: 0xe2e2de, fin: 0x5a605a, pattern: 'two-black-bands' },
  damsel: { shape: [1.55, .75, 1.15, 1.15], tail: [1.1, 1.1], profile: [.04, 1.08, 1, 0], back: 0x353831, side: 0x514d3e, belly: 0x6a6554, fin: 0x292e2d, pattern: 'light-scale-centres' },
  shark: { shape: [.68, .78, 1.55, 2.8], tail: [1.45, .55], profile: [-.01, 1.18, 2, .11], back: 0x777b76, side: 0x9b9f98, belly: 0xe2e0d8, fin: 0x686e68, pattern: 'plain-countershade' },
  // The specialized ray, jelly and dolphin shaders do not sample this atlas. Keeping their rows preserves SPECIES indices.
  ray: { shape: [1, 1, 1, 1], tail: [1, 1], profile: [0, 1, 1, 0], back: 0x5a4a32, side: 0x5a4a32, belly: 0xe8e4dc, fin: 0x5a4a32, pattern: 'specialized' },
  jelly: { shape: [1, 1, 1, 1], tail: [1, 1], profile: [0, 1, 1, 0], back: 0xe4eaee, side: 0xe4eaee, belly: 0xe4eaee, fin: 0x5a4a9a, pattern: 'specialized' },
  dolphin: { shape: [1, 1, 1, 1], tail: [1, 1], profile: [0, 1, 1, 0], back: 0x2a2e36, side: 0x9a9ea4, belly: 0xeeeeea, fin: 0x2a2e36, pattern: 'specialized' },
};

export const PATTERN_WIDTH = 128, PATTERN_ROWS = 32;
const TAU = Math.PI * 2, clamp = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const band = (x, centre, half, feather = .008) => 1 - smooth(half - feather, half + feather, Math.abs(x - centre));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const rgb = hex => [hex >> 16 & 255, hex >> 8 & 255, hex & 255].map(v => linear(v / 255));
const palette = Object.fromEntries(Object.entries(FISH_LOOK).map(([key, l]) => [key, Object.fromEntries(['back', 'side', 'belly'].map(k => [k, rgb(l[k])]))]));
const ink = rgb(0x17252b), gold = rgb(0xa39259), scale = rgb(0x79715b), eye = rgb(0x11191b);

// Pigment is linear RGB. Lighting and underwater absorption remain the renderer's responsibility.
export function fishPigment(key, s, tone) {
  const l = FISH_LOOK[key], p = palette[key];
  if (!l) throw new Error(`Unknown fish appearance: ${key}`);
  s = clamp(s); tone = clamp(tone);
  let c = tone > .5 ? mix(p.side, p.back, smooth(.62, .92, tone)) : mix(p.belly, p.side, smooth(.18, .46, tone));
  const trunk = smooth(.16, .23, s) * (1 - smooth(.79, .86, s));
  const flank = smooth(.27, .4, tone) * (1 - smooth(.79, .9, tone));
  let mark = 0;
  switch (l.pattern) {
    case 'flank-spots': { // pilchard: a quiet row of spots, not the bars of a mackerel
      const dx = Math.abs(((s - .25) * 10.5 + 100) % 1 - .5);
      mark = (1 - smooth(.72, 1.15, Math.hypot(dx / .17, (tone - .64) / .055))) * trunk * .62;
      break;
    }
    case 'wavy-dorsal-bars': {
      const wave = Math.sin(s * TAU * 29 + 1.8 * Math.sin(tone * 19) + .8 * Math.sin(s * 24));
      mark = smooth(.2, .65, wave) * smooth(.59, .68, tone) * trunk * .86;
      mark = Math.max(mark, band(tone, .565, .016) * trunk * .45);
      break;
    }
    case 'longitudinal-lines': {
      const lines = smooth(.48, .82, Math.cos(tone * TAU * 8));
      mark = lines * trunk * flank * .48;
      break;
    }
    case 'amber-flank-band':
      c = mix(c, gold, band(tone, .56, .045, .02) * trunk * .8);
      mark = band(tone, .62 + (1 - s) * .8, .045, .016) * smooth(.64, .73, s) * .7;
      break;
    case 'oblique-dorsal-bars':
      mark = smooth(.35, .75, Math.sin((s * 15 - tone * 2.2) * TAU)) * smooth(.60, .68, tone) * trunk * .88;
      break;
    case 'two-black-bands':
      mark = Math.max(band(s, .745, .055) * smooth(.2, .36, tone), band(s, .205, .055)) * .94;
      // Faint warm flank lines remain subordinate to the two diagnostic black bands.
      c = mix(c, gold, smooth(.66, .93, Math.cos(tone * TAU * 8)) * trunk * flank * .16);
      break;
    case 'light-scale-centres': { // adult Chromis chromis, not the bright-blue juvenile or a tropical damselfish
      const row = Math.floor(tone * 9), x = (s * 22 + (row % 2) * .5) % 1 - .5, y = tone * 9 % 1 - .5;
      const centre = 1 - smooth(.35, .9, Math.hypot(x / .45, y / .46));
      c = mix(c, scale, centre * trunk * flank * .55);
      break;
    }
    // The flying fish and sandbar shark use restrained countershading, not invented body bands.
  }
  c = mix(c, ink, mark);
  if (l.pattern !== 'specialized') {
    // A small gill boundary and eye live in the texture, so they survive between the body's sparse vertex rings.
    const gill = band(s, .805 + .02 * Math.cos(tone * 5), .006, .004) * smooth(.32, .43, tone) * (1 - smooth(.7, .78, tone));
    c = mix(c, ink, gill * .38);
    const e = Math.hypot((s - .913) / .022, (tone - .625) / .055);
    c = mix(c, p.belly, (1 - smooth(.9, 1.35, e)) * .55);
    c = mix(c, eye, 1 - smooth(.62, .95, e));
  }
  return c;
}

// Half-texel inset sampling keeps adjacent species rows separate, even with linear filtering. No mipmaps: a mip
// chain could mix species rows. The atlas is fixed 128x(32*12), 192 KiB; generated once per sea-life owner.
export function makeFishPatternAtlas(keys) {
  const width = PATTERN_WIDTH, height = PATTERN_ROWS * keys.length, data = new Uint8Array(width * height * 4);
  keys.forEach((key, species) => {
    for (let y = 0; y < PATTERN_ROWS; y++) for (let x = 0; x < width; x++) {
      const color = fishPigment(key, x / (width - 1), y / (PATTERN_ROWS - 1)), j = ((species * PATTERN_ROWS + y) * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[j + ch] = Math.round(clamp(color[ch]) * 255);
      data[j + 3] = 255;
    }
  });
  return { data, width, height };
}
