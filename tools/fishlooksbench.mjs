#!/usr/bin/env node
// Actual generated pigment bytes + production mesh/uniform checks. This does not replace rendered gallery/swimmer evidence.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return{url:${JSON.stringify(new URL('../game/vendor/three.module.min.js', import.meta.url).href)},shortCircuit:true};return n(s,c);}`));
const THREE = await import('three');
const { FISH_LOOK, makeFishPatternAtlas, fishPigment, PATTERN_WIDTH, PATTERN_ROWS } = await import('../game/js/units/naval/fishlooks.js');
const { SPECIES } = await import('../game/js/units/naval/fishsim.js');
const { GEOMETRY, fishUniforms, SHADERS } = await import('../game/js/units/naval/sealifegfx.js');

let passed = 0, failed = 0;
const check = (ok, label, detail = '') => { ok ? passed++ : failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); };
const keys = SPECIES.map(s => s.key), fishKeys = SPECIES.filter(s => ['fish', 'school'].includes(s.draw)).map(s => s.key);
const atlas = makeFishPatternAtlas(keys), index = Object.fromEntries(keys.map((k, i) => [k, i]));
const luma = c => c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const span = a => Math.max(...a) - Math.min(...a);
const row = (key, tone, start = .25, end = .75) => Array.from({ length: 101 }, (_, i) => luma(sample(key, start + (end - start) * i / 100, tone)));
// Reproduce texture filtering, not the pattern generator, so checks catch atlas resolution / row packing regressions.
function sample(key, s, tone) {
  const x = Math.max(0, Math.min(1, s)) * (PATTERN_WIDTH - 1), y = Math.max(0, Math.min(1, tone)) * (PATTERN_ROWS - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const pixel = (px, py, ch) => atlas.data[((index[key] * PATTERN_ROWS + py) * atlas.width + px) * 4 + ch] / 255;
  return [0, 1, 2].map(ch => (pixel(x0, y0, ch) * (1 - fx) + pixel(Math.min(x0 + 1, PATTERN_WIDTH - 1), y0, ch) * fx) * (1 - fy)
    + (pixel(x0, Math.min(y0 + 1, PATTERN_ROWS - 1), ch) * (1 - fx) + pixel(Math.min(x0 + 1, PATTERN_WIDTH - 1), Math.min(y0 + 1, PATTERN_ROWS - 1), ch) * fx) * fy);
}

check(fishKeys.every(k => FISH_LOOK[k]) && new Set(fishKeys.map(k => FISH_LOOK[k].pattern)).size === fishKeys.length,
  'each of the nine instanced fish types has a distinct appearance family', fishKeys.join(', '));
check(atlas.data.byteLength <= 192 * 1024 && atlas.width === 128 && atlas.height === keys.length * 32,
  'one bounded, generated atlas serves the existing species indices', `${atlas.width}×${atlas.height}, ${atlas.data.byteLength} bytes`);
check(atlas.data.every((v, i) => i % 4 !== 3 || v === 255), 'pigment never creates transparent holes in bodies');
let packingError = 0;
for (const key of keys) for (const tone of [0, 1]) for (const s of [0, 64 / (PATTERN_WIDTH - 1), 1]) {
  const got = sample(key, s, tone), want = fishPigment(key, s, tone);
  packingError = Math.max(packingError, ...got.map((c, i) => Math.abs(c - want[i])));
}
check(packingError < .012, 'half-texel row edges retain their own species colour', `max error ${packingError.toFixed(5)}`);

const mackerelBack = row('mackerel', .76), mackerelBelly = row('mackerel', .4);
check(span(mackerelBack) > .12 && span(mackerelBelly) < .015, 'mackerel bars resolve on the back without migrating onto the belly', `back range ${span(mackerelBack).toFixed(3)}`);
const crosses = a => a.slice(1).filter((v, i) => (v > mean(a)) !== (a[i] > mean(a))).length;
check(crosses(mackerelBack) >= 20 && crosses(row('bonito', .76)) >= 10, 'atlas resolves many separate mackerel / bonito stripes between sparse mesh rings');
const mulletDark = row('mullet', .5), mulletClear = row('mullet', .5625);
check(mean(mulletClear) > mean(mulletDark) * 1.15 && span(mulletDark) < .025,
  'mullet lines run along the flank rather than breaking into transverse bars');
const breamMid = luma(sample('bream', .48, .55)), breamHead = luma(sample('bream', .745, .55)), breamTail = luma(sample('bream', .205, .55));
check(breamHead < breamMid * .3 && breamTail < breamMid * .3, 'bream has two dark bands separated by a silver flank', `${breamHead.toFixed(3)} / ${breamMid.toFixed(3)} / ${breamTail.toFixed(3)}`);
check(span(row('sardine', .64)) > .13 && span(row('sardine', .45)) < .01,
  'pilchard flank spots remain separate from the plain lower flank');
const amber = sample('amberjack', .5, .56), amberSide = sample('amberjack', .5, .45);
check(amber[0] / amber[2] > amberSide[0] / amberSide[2] * 1.35 && luma(amber) > .18,
  'amberjack stripe is warm and restrained, not a dark bream-like bar');
const damsel = row('damsel', .5);
check(span(damsel) > .008 && Math.max(...damsel) < .18, 'adult damselfish has light scale centres while remaining dark', `range ${span(damsel).toFixed(3)}`);
const flyBack = sample('flyingfish', .5, .95), flyBelly = sample('flyingfish', .5, .2);
check(flyBack[2] > flyBack[0] * 2 && luma(flyBelly) > luma(flyBack) * 4 && span(row('flyingfish', .6)) < .01,
  'flying fish keeps a plain blue back and silver belly');
check(span(row('shark', .65)) < .01, 'sandbar shark stays unmarked instead of borrowing tropical stripes');

// A small fish close to a swimmer is lit/blue-shifted, then blended into water. Contrast must remain pigment-derived.
const display = c => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;
const underwater = c => c.map((v, i) => display(v * [.3, .65, .73][i]) * .85 + [.08, .3, .38][i] * .15);
check(luma(underwater(sample('bream', .48, .55))) - luma(underwater(sample('bream', .745, .55))) > .18,
  'bream bands retain luminance contrast under shallow-water attenuation and fog');

const uniforms = fishUniforms(), texture = uniforms.uPattern.value, geometry = GEOMETRY.fishGeometry();
check(texture.colorSpace === THREE.NoColorSpace && texture.minFilter === THREE.LinearFilter && !texture.generateMipmaps && texture.image.data.length === atlas.data.length,
  'production uniforms use the linear atlas without a second decode or cross-species mipmaps');
const p = geometry.attributes.position, fin = geometry.attributes.aFin, wing = geometry.attributes.aWing;
const body = [], tail = [], dorsal = [], pectoral = [];
for (let i = 0; i < p.count; i++) ({ 0: body, 1: tail, 2: dorsal, 3: pectoral })[Math.round(fin.getX(i))].push(i);
const max = (ids, attr, axis) => Math.max(...ids.map(i => Math.abs(attr.getComponent(i, axis))));
check(p.count === 53 && geometry.index.count === 222 && [...p.array, ...geometry.attributes.normal.array, ...wing.array].every(Number.isFinite),
  'shared fish mesh retains its original 53 vertices / 74 triangles and finite geometry', `${p.count} vertices, ${geometry.index.count / 3} triangles`);
check(max(body, p, 2) <= .5 && max(tail, p, 2) < .54 && max(pectoral, wing, 0) < .47,
  'body, fork and deployed wings remain inside the original unit-length envelope');
let shapesFit = true;
for (const key of fishKeys) {
  const l = FISH_LOOK[key], head = Math.max(1, l.profile[1]), halfHeight = max(body, p, 1) * l.shape[0] * head;
  const halfWidth = max(body, p, 0) * l.shape[1] * head, tailHeight = max(tail, p, 1) * l.shape[2] * Math.max(...l.tail);
  const wingWidth = max(pectoral, p, 0) * l.shape[1] * l.profile[2];
  shapesFit &&= halfHeight < .23 && halfWidth < .08 && tailHeight < .3 && wingWidth < .2;
}
check(shapesFit, 'species profiles preserve small body proportions and bounded fins without changing simulation lengths');
check(FISH_LOOK.bream.shape[0] > FISH_LOOK.mackerel.shape[0] * 1.7 && FISH_LOOK.damsel.profile[0] > FISH_LOOK.mullet.profile[0],
  'deep-bodied bream and fork-tailed damselfish differ from streamlined mackerel and mullet');
check(FISH_LOOK.shark.tail[0] > FISH_LOOK.shark.tail[1] * 2 && FISH_LOOK.flyingfish.tail[1] > FISH_LOOK.flyingfish.tail[0] * 1.5,
  'shark and flying fish retain opposite tail-lobe asymmetry');
check(SHADERS.FISH_FS.includes('texture2D(uPattern') && SHADERS.FISH_FS.includes('linearToOutputTexel') && !SHADERS.FISH_VS(false).includes('uMark'),
  'production shader resolves pigment per fragment and converts lit colour before display-space fog');
let disposed = false; texture.addEventListener('dispose', () => { disposed = true; }); texture.dispose(); geometry.dispose();
check(disposed, 'atlas has explicit owner disposal for gallery/game teardown');
console.log(`${passed}/${passed + failed} fish appearance checks passed`);
process.exitCode = failed ? 1 : 0;
