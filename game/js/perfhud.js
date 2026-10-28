// perfhud.js - (ngc/perf-cpu) ?perfhud: main-thread CPU per system, per frame, on screen.
// frame() in main.js calls lap('name') after each system; the war (war.js W.lap) splits itself the same way. A lap
// charges the time since the previous lap to that name. The overlay (left, under the score block, once a second) shows
// each system's mean ms over the last second and its worst frame, the frame's total CPU (sim + prep + render submit), the frame interval,
// hitches (frames over 2x the median interval) and, where the browser has it, the JS heap and its growth per second
// (a sawtooth: allocation rate between collections). Off (no ?perfhud): PF is null in main.js and nothing runs.
//   window.__perf.snapshot() -> { systems: { name: { mean, max } }, cpu, dt, hitches, heapMB, allocMBs }  (for tools)
export function createPerfHud({ parent = document.body } = {}) {
  const names = [], idx = new Map();
  let acc = new Float64Array(64), sum = new Float64Array(64), max = new Float64Array(64);
  let t = 0, frames = 0, cpuSum = 0, cpuMax = 0, dtSum = 0, dtMax = 0, hitches = 0, winT0 = performance.now();
  const dts = new Float32Array(240); let dtN = 0, med = 0;
  let heapUp = 0, heapLast = 0, snap = null;
  const el = document.createElement('pre');
  el.id = 'perfhud';
  el.style.cssText = 'position:fixed;left:8px;top:212px;z-index:60;margin:0;padding:6px 8px;background:rgba(8,10,12,.72);color:#cfe3d0;font:11px/1.35 Consolas,monospace;pointer-events:none;white-space:pre;border-radius:3px';
  parent.appendChild(el);
  const slot = name => { let i = idx.get(name); if (i === undefined) { i = names.length; names.push(name); idx.set(name, i); if (i >= acc.length) { const g = a => { const b = new Float64Array(a.length * 2); b.set(a); return b; }; acc = g(acc); sum = g(sum); max = g(max); } } return i; };
  const P = {
    // start of the frame's measured CPU
    begin() { t = performance.now(); },
    lap(name) { const n = performance.now(); acc[slot(name)] += n - t; t = n; },
    // end of the frame: cpuMs = this frame's CPU, dtMs = the interval since the last frame
    end(cpuMs, dtMs) {
      for (let i = 0; i < names.length; i++) { sum[i] += acc[i]; if (acc[i] > max[i]) max[i] = acc[i]; acc[i] = 0; }
      frames++; cpuSum += cpuMs; if (cpuMs > cpuMax) cpuMax = cpuMs; dtSum += dtMs; if (dtMs > dtMax) dtMax = dtMs;
      dts[dtN++ % dts.length] = dtMs;
      if (med > 0 && dtMs > med * 2 && dtMs > 25) hitches++;   // (the median of the last 240 frames, taken once a second)
      const m = performance.memory;
      if (m) { const h = m.usedJSHeapSize; if (heapLast && h > heapLast) heapUp += h - heapLast; heapLast = h; }
      const now = performance.now();
      if (now - winT0 >= 1000) {
        const sec = (now - winT0) / 1000, sys = {};
        for (let i = 0; i < names.length; i++) { sys[names[i]] = { mean: sum[i] / frames, max: max[i] }; sum[i] = 0; max[i] = 0; }
        snap = { systems: sys, frames, cpu: cpuSum / frames, cpuMax, dt: dtSum / frames, dtMax, hitches, heapMB: m ? m.usedJSHeapSize / 1048576 : null, allocMBs: m ? heapUp / 1048576 / sec : null };
        frames = 0; cpuSum = cpuMax = dtSum = dtMax = 0; heapUp = 0; hitches = 0; winT0 = now;
        const n = Math.min(dtN, dts.length); if (n > 30) { const a = Array.from(dts.subarray(0, n)).sort((x, y) => x - y); med = a[n >> 1]; }
        draw();
      }
    },
    snapshot: () => snap,
    remove() { el.remove(); },
  };
  function draw() {
    const s = snap, rows = Object.entries(s.systems).sort((a, b) => b[1].mean - a[1].mean);
    let txt = `CPU ${s.cpu.toFixed(1)} ms (worst ${s.cpuMax.toFixed(0)})  frame ${s.dt.toFixed(1)} ms = ${(1000 / s.dt).toFixed(0)} fps (worst ${s.dtMax.toFixed(0)})\n`;
    txt += `hitches ${s.hitches}` + (s.heapMB != null ? `   heap ${s.heapMB.toFixed(0)} MB  +${s.allocMBs.toFixed(1)} MB/s` : '') + '\n';
    for (const [k, v] of rows) if (v.mean >= 0.05 || v.max >= 1) txt += `${k.padEnd(14)}${v.mean.toFixed(2).padStart(6)}  max ${v.max.toFixed(1).padStart(5)}\n`;
    el.textContent = txt;
  }
  window.__perf = P;
  return P;
}
