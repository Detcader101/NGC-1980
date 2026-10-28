// RENDERKIT merge (ngc/perf-render): a model's non-moving parts become one draw per material.
//
// Models here are built from many small meshes (a jeep: ~90 draws, a landing hard: 33). mergeStatic(root, { movers })
// bakes every static part into one geometry per (rigid frame, material) and hides the originals from rendering without
// removing them, so every hook other code holds stays valid: named parts, seat and door anchors, damage, the materials
// themselves (shared, so a live colour / opacity / emissive change still shows on the merged draw).
//
// Rigid frames: the root and every node in `movers` (names, nodes or a predicate: rotors, turrets, wheels, doors,
// gauges, needles...). A part is merged into the nearest frame above it, and the merged mesh is added under that frame,
// so the static parts of a turret merge under the turret and still turn with it. Parts that are never merged: skinned,
// instanced, morphing, multi-material, invisible at merge time, not frustum-culled, with their own onBeforeRender, or
// marked userData.noMerge (or anything under userData.noMerge).
//
// Originals are kept (geometry, transform, material, visibility) on layer mask 0, so cameras, shadow maps and the XR eye
// cameras skip them. rec.check() lists parts that moved or changed visibility since the merge (a unit test asserts it is
// empty after exercising the unit); rec.undo() restores the originals.
//
// Object-space detail: RenderKit unit / world detail and the kit's surface detail read the vertex position in the part's
// own space (rkOP / rkLocal: panel lines, camouflage, mottle). The merged geometry carries the original part-space
// position as attribute rkOP0, and its materials are thin prototype views of the originals (Object.create: every
// property and live change reads through) whose shader reads rkOP0 there instead, so the pattern does not move.
import * as THREE from 'three';
import { detail } from './lod.js';

const _inv = new THREE.Matrix4(), _rel = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _v = new THREE.Vector3();
const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
const views = new WeakMap();   // original material -> merged view

function moverTest(movers) {
  if (!movers) return () => false;
  if (typeof movers === 'function') return movers;
  const set = new Set(), names = new Set();
  for (const m of movers) (typeof m === 'string' ? names : set).add(m);
  return o => set.has(o) || (o.name && names.has(o.name));
}

// the material a merged mesh draws with: the original, or (when the original is shader-patched) a prototype view whose
// object-space coordinate comes from rkOP0
export function mergedMaterial(m) {
  if (!m || m.onBeforeCompile === BASE_OBC) return m;
  let v = views.get(m); if (v) return v;
  v = Object.create(m);
  v._listeners = {};   // own event listeners (dispose), not the original's
  { const t = new THREE.Material(); Object.defineProperty(v, 'id', { value: t.id, writable: true }); t.dispose(); }   // its own id (Three's per-material uniform refresh)
  const key = m.customProgramCacheKey.bind(m), obc = m.onBeforeCompile;
  v.customProgramCacheKey = () => key() + '|rkmerged';
  v.onBeforeCompile = function (sh, r) {
    obc.call(this, sh, r);
    if (/rkOP = position;|rkLocal = position;/.test(sh.vertexShader)) {
      sh.vertexShader = 'attribute vec3 rkOP0;\n' + sh.vertexShader.replace(/rkOP = position;/g, 'rkOP = rkOP0;').replace(/rkLocal = position;/g, 'rkLocal = rkOP0;');
    }
  };
  views.set(m, v); return v;
}

const attrSig = g => Object.keys(g.attributes).filter(k => k !== 'rkOP0').sort().map(k => { const a = g.attributes[k]; return `${k}:${a.itemSize}:${a.normalized ? 1 : 0}`; }).join(',');
const heatOf = o => { for (let p = o; p; p = p.parent) if (p.userData && p.userData.heat !== undefined) return p.userData.heat; return undefined; };

/**
 * mergeStatic(root, { movers, minParts = 2, name }) -> rec { merged: [Mesh], parts: [Mesh], draws: {before, after}, check(), undo() }
 */
//   classes: [{ r, far }] size classes: static parts whose world bounding radius is under r merge into their own draw
//   that dissolves out by far metres (lod.js detail). Default one class: parts under 12 cm go by 170 m (at 1080p and a
//   60 deg view a 24 cm part is ~1.4 px there). classes: [] merges everything into one draw per material.
// ?merge=0 turns every merge off (A/B: the models draw part by part as before)
export const MERGE_ON = (() => { try { return !/[?&]merge=0(&|$)/.test(location.search); } catch (e) { return true; } })();
export const MERGES = [];   // every merge record (tests: __MERGES.flatMap(r => r.check()))
try { window.__MERGES = MERGES; } catch (e) {}
export const SMALL_CLASSES = Object.freeze([{ r: 0.12, far: 170 }]);
export function mergeStatic(root, { movers = null, keep = null, minParts = 2, name = root?.name || 'model', classes = SMALL_CLASSES } = {}) {
  if (!MERGE_ON || !root) return null;
  const isMover = moverTest(movers);
  root.updateMatrixWorld(true);
  const groups = new Map();   // frame -> key -> { mat, list }
  const skip = o => o.userData && o.userData.noMerge;
  const L = learned.get(name), seen = o => !!L && L.has(keyOf(o, root));
  const visit = (o, frame, hidden) => {
    if (skip(o)) return;
    if (o !== root && isMover(o)) frame = o;
    hidden = hidden || (o !== root && !o.visible);   // (the root itself may be hidden until the unit spawns)
    if (o.isMesh && !hidden && !(keep && keep(o)) && !seen(o) && !o.isInstancedMesh && !o.isSkinnedMesh && !o.isLine && !o.isPoints && !o.isSprite && !Array.isArray(o.material) && o.frustumCulled
      && o.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && o.onAfterRender === THREE.Object3D.prototype.onAfterRender
      && o.material && o.material.visible !== false && o.geometry && o.geometry.attributes.position && !Object.keys(o.geometry.morphAttributes || {}).length
      && !o.geometry.attributes.tangent && o.layers.mask === 1) {
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const wr = g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis(), cls = classes.findIndex(c => wr < c.r);
      const k = `${o.material.uuid}|${o.renderOrder}|${heatOf(o)}|${attrSig(g)}|${cls}`;
      let F = groups.get(frame); if (!F) groups.set(frame, F = new Map());
      let e = F.get(k); if (!e) F.set(k, e = { mat: o.material, heat: heatOf(o), renderOrder: o.renderOrder, cls: classes[cls] || null, list: [] });
      e.list.push(o);
    }
    for (const c of o.children) visit(c, frame, hidden);
  };
  visit(root, root, false);

  const rec = { root, merged: [], parts: [], snap: [], small: 0, frozen: 0, draws: { before: 0, after: 0 } };
  for (const [frame, F] of groups) {
    _inv.copy(frame.matrixWorld).invert();
    let i = 0;
    for (const e of F.values()) {
      rec.draws.before += e.list.length;
      if (e.list.length < minParts) { rec.draws.after += e.list.length; continue; }
      const items = e.list.map(p => ({ o: p, rel: new THREE.Matrix4().multiplyMatrices(_inv, p.matrixWorld) }));
      const geo = bakeList(items);
      const m = new THREE.Mesh(geo, mergedMaterial(e.mat));
      m.name = `${name}:merged:${frame === root ? '' : (frame.name || 'frame') + ':'}${i++}`;
      m.renderOrder = e.renderOrder; if (e.heat !== undefined) m.userData.heat = e.heat;
      m.userData.mergedFrom = e.list.length; m.matrixAutoUpdate = false;
      frame.add(m); m.updateMatrixWorld(true);
      if (e.cls) { detail(m, e.cls.far); rec.small++; }
      m.userData.mat0 = m.material;
      rec.merged.push(m); rec.draws.after++;
      for (const it of items) {
        const p = it.o, chain = []; for (let q = p; q && q !== frame; q = q.parent) chain.push(q);
        rec.parts.push(p);
        const s = { p, frame, m, rel: it.rel, mask: p.layers.mask, mat: p.material, chain, mx: chain.map(q => !q.matrixAutoUpdate), sig: null };   // mx: nodes whose matrix code sets directly (taken before any freezing)
        s.sig = sigOf(s);
        // hidden from rendering; parts also stop recomposing their local matrix every frame (perf-cpu: ~98 % of the
        // scene's nodes did; the world matrix still follows the parent, so getWorldPosition on a part stays right).
        // The watchdog compares transforms, not matrices, so a frozen part that code moves is still seen.
        p.layers.disableAll(); p.userData.rkMergedOut = true;
        if (p.matrixAutoUpdate) { p.updateMatrix(); p.matrixAutoUpdate = false; s.frozen = true; rec.frozen++; }
        rec.snap.push(s);
      }
    }
  }
  const pathOf = o => { const a = []; for (let p = o; p && p !== root; p = p.parent) a.unshift(p.name || p.type); return a.join('/'); };
  const why = s => {   // '' = unchanged since the merge
    const now = sigOf(s), was = s.sig;
    if (now.length !== was.length) return 'moved';
    for (let i = 0; i < now.length; i++) if (Math.abs(now[i] - was[i]) > 1e-5) return 'moved / hidden';
    if (s.p.material !== s.mat && s.m.material === s.m.userData.mat0) return 'material swapped';
    return '';
  };
  const release = s => {   // back on its own: drawn, transforms live again
    s.p.layers.mask = s.mask; delete s.p.userData.rkMergedOut;
    if (s.frozen) { s.p.matrixAutoUpdate = true; s.frozen = false; rec.frozen--; }
  };
  // parts that moved against their frame or changed visibility / material since the merge (should be none)
  rec.check = () => { const bad = []; for (const s of rec.snap) { const w = why(s); if (w) bad.push({ part: pathOf(s.p), why: w }); } return bad; };
  rec.undo = () => { for (const s of rec.snap) release(s); for (const m of rec.merged) { m.removeFromParent(); m.geometry.dispose(); } rec.merged.length = 0; rec.snap.length = 0; };
  // The watchdog (watchMerges, every frame for units in view range): a part that moved, hid or changed material since
  // the merge is put back on its own (its layer restored the same frame) and the rest of its draw is baked again without
  // it. The part is remembered for this model name, so the next unit of the type merges without it from the start.
  rec.name = name;
  rec.watch = () => {
    let bad = null;
    for (const s of rec.snap) if (why(s)) (bad ||= new Set()).add(s);
    if (!bad) return 0;
    let L = learned.get(name); if (!L) learned.set(name, L = new Set());
    const hit = new Set([...bad].map(s => s.m));
    for (const m of hit) {
      const all = rec.snap.filter(s => s.m === m), good = all.filter(s => !bad.has(s));
      for (const s of all) if (bad.has(s)) { release(s); L.add(keyOf(s.p, root)); rec.split = (rec.split || 0) + 1; }
      rec.snap = rec.snap.filter(s => !(s.m === m && bad.has(s)));
      // bake the good ones again from their poses at the merge, or give them back if too few remain
      if (good.length >= minParts) { const geo = bakeList(good.map(s => ({ o: s.p, rel: s.rel }))); m.geometry.dispose(); m.geometry = geo; }
      else { for (const s of good) release(s); rec.snap = rec.snap.filter(s => s.m !== m); m.removeFromParent(); m.geometry.dispose(); rec.merged.splice(rec.merged.indexOf(m), 1); }
    }
    return bad.size;
  };
  root.userData.rkMerge = rec; MERGES.push(rec);
  return rec;
}

// a merged part's transform signature: position, quaternion, scale and visibility of it and every node up to its frame
// (+ the matrix of nodes whose matrix code sets directly). Compared with the one taken at the merge.
function sigOf(s) {
  const out = []; for (let k = 0; k < s.chain.length; k++) { const q = s.chain[k];
    out.push(q.position.x, q.position.y, q.position.z, q.quaternion.x, q.quaternion.y, q.quaternion.z, q.quaternion.w, q.scale.x, q.scale.y, q.scale.z, q.visible ? 1 : 0);
    if (s.mx[k]) for (let i = 0; i < 16; i++) out.push(q.matrix.elements[i]);
  }
  return out;
}

// a part's stable key within its model: the child indices from the root
const learned = new Map();   // model name -> Set(part key): parts seen moving / hiding, never merged again this session
function keyOf(o, root) { const a = []; for (let p = o; p && p !== root; p = p.parent) a.unshift(p.parent ? p.parent.children.indexOf(p) : 0); return a.join('.'); }
export { learned as MERGE_LEARNED };

// every frame: the watchdog for merged units the camera can see (world-visible, within `range` m). It reads transforms
// only (no matrix updates), so it costs a few comparisons per merged part.
const _wp = new THREE.Vector3(), _cp = new THREE.Vector3();
export function watchMerges(camera, range = 600) {
  if (!MERGES.length) return 0;
  camera.getWorldPosition(_cp); let n = 0;
  for (const r of MERGES) {
    if (!r.snap.length) continue;
    let vis = true; for (let p = r.root; p; p = p.parent) if (!p.visible) { vis = false; break; }
    if (!vis) continue;
    if (_wp.setFromMatrixPosition(r.root.matrixWorld).distanceToSquared(_cp) > range * range) continue;
    n += r.watch();
  }
  return n;
}

// bake meshes (same attribute layout) into one indexed geometry in their frame's space: items [{ o: mesh, rel: mesh -> frame }]
function bakeList(items) {
  const g0 = items[0].o.geometry, names = Object.keys(g0.attributes).filter(k => k !== 'rkOP0');
  let nv = 0, ni = 0;
  const spans = items.map(({ o, rel }) => {
    const g = o.geometry, idx = g.index, total = idx ? idx.count : g.attributes.position.count;
    const start = Math.max(0, g.drawRange.start), count = Math.min(total - start, Number.isFinite(g.drawRange.count) ? g.drawRange.count : total);
    const s = { o, rel, g, start, count, v0: nv }; nv += g.attributes.position.count; ni += count; return s;
  });
  const out = {}; for (const k of names) out[k] = new Float32Array(nv * g0.attributes[k].itemSize);
  const op0 = new Float32Array(nv * 3), index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let w = 0;
  for (const s of spans) {
    const g = s.g, n = g.attributes.position.count;
    _rel.copy(s.rel); _nm.getNormalMatrix(_rel);
    const flip = _rel.determinant() < 0;
    for (const k of names) {
      const a = g.attributes[k], sz = a.itemSize, dst = out[k];
      for (let i = 0; i < n; i++) {
        if (k === 'position') { _v.fromBufferAttribute(a, i); op0[(s.v0 + i) * 3] = _v.x; op0[(s.v0 + i) * 3 + 1] = _v.y; op0[(s.v0 + i) * 3 + 2] = _v.z; _v.applyMatrix4(_rel); dst.set([_v.x, _v.y, _v.z], (s.v0 + i) * 3); }
        else if (k === 'normal') { _v.fromBufferAttribute(a, i).applyMatrix3(_nm).normalize(); dst.set([_v.x, _v.y, _v.z], (s.v0 + i) * 3); }
        else for (let c = 0; c < sz; c++) dst[(s.v0 + i) * sz + c] = a.getComponent(i, c);
      }
    }
    // (an attribute rkOP0 of its own means the part was already merged once: keep its original part-space coordinate)
    if (g.attributes.rkOP0) for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) op0[(s.v0 + i) * 3 + c] = g.attributes.rkOP0.getComponent(i, c);
    const idx = g.index;
    for (let t = 0; t < s.count; t += 3) {
      const a = idx ? idx.getX(s.start + t) : s.start + t, b = idx ? idx.getX(s.start + t + 1) : s.start + t + 1, c = idx ? idx.getX(s.start + t + 2) : s.start + t + 2;
      index[w++] = s.v0 + a; if (flip) { index[w++] = s.v0 + c; index[w++] = s.v0 + b; } else { index[w++] = s.v0 + b; index[w++] = s.v0 + c; }
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const k of names) { const a = g0.attributes[k]; geo.setAttribute(k, new THREE.BufferAttribute(out[k], a.itemSize, false)); }   // (values are denormalised floats)
  geo.setAttribute('rkOP0', new THREE.BufferAttribute(op0, 3));
  geo.setIndex(new THREE.BufferAttribute(index.subarray(0, w), 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  geo.name = 'rk-merged';
  return geo;
}

// Names that move or switch in this game's models (rotors, wheels, turrets, controls, lights, flames...): such a node is
// its own rigid frame. Over-matching only costs a few extra draws; under-matching is caught by rec.check() in the tests.
export const MOVER_RX = /rotor|blade|prop|spin|swash|hub|wheel|tyre|tire|rim\b|steer|track|link|sprocket|idler|turret|cupola|gun|barrel|mantlet|breech|elev|hatch|door|ramp|lid|cover|canopy|hood|top\b|gear|strut|oleo|flap|slat|aileron|elevon|rudder|stab|wing|sweep|spoiler|brake|hook|probe|nozzle|burner|flame|exhaust|needle|gauge|dial|ball|stick|pedal|throttle|collective|cyclic|lever|switch|knob|lamp|light|beacon|strobe|nav|glow|screen|mfd|hud|radar|dish|antenna|mast|crane|boom|davit|winch|rope|cable|chute|seat|crew|pilot|driver|gunner|commander|figure|marine|interior|cockpit|cabin|shell|damage|wreck|smoke|fire|anim|pivot|arm\b|leg|head|eye/i;
// every Object3D held by a model's API object (its handles: hull, turret, wheels[i].steerG, parts.top ...), 3 levels deep
export function refsOf(api, depth = 3, out = new Set()) {
  const seen = new Set();
  const walk = (v, d) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return; seen.add(v);
    if (v.isObject3D) { out.add(v); return; }
    if (d <= 0 || ArrayBuffer.isView(v) || v.isMaterial || v.isBufferGeometry || v.isTexture) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, d - 1); return; }
    if (Object.getPrototypeOf(v) !== Object.prototype && !(v instanceof Map)) return;
    for (const x of (v instanceof Map ? v.values() : Object.values(v))) walk(x, d - 1);
  };
  walk(api, depth); return out;
}
// The game's merge rule for a unit model: frames = every handle in `apis` (other code may move, hide or recolour it),
// every named group, every mover name (anything else that moves is caught by the watchdog); handles that are meshes are never
// merged themselves (clicks, swaps, raycasts).
export function mergeUnit(root, apis = [], { extra = null, ...o } = {}) {
  if (!MERGE_ON || !root) return null;
  const refs = new Set(); for (const a of apis) refsOf(a, 3, refs); refs.delete(root);
  return mergeStatic(root, { ...o, keep: m => refs.has(m) || !!(extra && extra(m)), movers: n => refs.has(n) || (!n.isMesh && !!n.name) || MOVER_RX.test(n.name || '') || !!(extra && extra(n)) });
}
