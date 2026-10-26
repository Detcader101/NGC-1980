import fs from 'node:fs';
import path from 'node:path';
import { slug, summarizeFrames } from './evidence.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function bounded(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer in ${min}–${max}`);
  return value;
}

export async function measureFrames(page, name, options = {}) {
  const policy = { frames: bounded(options.frames ?? 120, 10, 3600, 'frames'),
    warmup: bounded(options.warmup ?? 30, 1, 600, 'warmup'),
    timeoutMs: bounded(options.timeoutMs ?? 120000, 1000, 600000, 'timeoutMs') };
  const sample = await page.evaluate(async policy => {
    const game = window.__G;
    if (!game?.renderer || !game.PROF) throw new Error('Benchmark needs the game debug bridge (?debug)');
    const xr = !!game.XR?.active, session = xr && game.renderer.xr.getSession();
    const schedule = fn => session ? session.requestAnimationFrame(fn) : requestAnimationFrame(fn);
    const cancel = id => session ? session.cancelAnimationFrame(id) : cancelAnimationFrame(id);
    return new Promise((resolve, reject) => {
      let id, seen = 0, lastFrame = -1, lastTime = null, stopped = false;
      const rows = [];
      const timer = setTimeout(() => {
        stopped = true; cancel(id);
        reject(new Error(`Benchmark timeout: ${rows.length}/${policy.frames} rendered intervals`));
      }, policy.timeoutMs);
      const tick = () => {
        if (stopped) return;
        if (xr !== !!game.XR?.active || document.hidden) {
          clearTimeout(timer); stopped = true; reject(new Error('Benchmark lost visibility or changed XR mode')); return;
        }
        // A render counter avoids counting window callbacks with no game frame, including in XR.
        const frame = xr ? game.XR.state.frames : game.renderer.info.render.frame;
        if (frame !== lastFrame) {
          const now = performance.now(); lastFrame = frame; seen++;
          if (seen > policy.warmup) {
            if (lastTime !== null) rows.push({ frame, ms: now - lastTime,
              sim: game.PROF.sim, prep: game.PROF.prep, render: game.PROF.render,
              calls: game.renderer.info.render.calls, triangles: game.renderer.info.render.triangles,
              textures: game.renderer.info.memory.textures, geometries: game.renderer.info.memory.geometries });
            lastTime = now;
          }
        }
        if (rows.length >= policy.frames) {
          clearTimeout(timer); stopped = true;
          resolve({ rows, xr, state: game.G.state, mode: game.G.mode,
            drawingBuffer: [game.renderer.domElement.width, game.renderer.domElement.height],
            eyeViewports: xr ? game.renderer.xr.getCamera().cameras.map(c => c.viewport.toArray()) : [] });
        } else id = schedule(tick);
      };
      id = schedule(tick);
    });
  }, policy);
  return { name, policy, ...sample, summary: summarizeFrames(sample.rows),
    qualification: 'Wall-clock intervals between observed rendered frames. CPU phases are game-smoothed CPU timings, not GPU durations. Render counters describe the last render pass. No capture during sampling.' };
}

// Decode the saved clip, rather than taking unrelated live screenshots and calling them video frames.
export async function reviewClip(browser, file, contactFile, posterFile) {
  const page = await browser.newPage();
  try {
    const decoded = await page.evaluate(async b64 => {
      const video = document.createElement('video'); video.muted = true; video.preload = 'auto';
      document.body.append(video);
      const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Video decode timed out')), 15000);
        video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(new Error('Saved clip cannot be decoded: ' + video.error?.message)); };
      });
      video.src = 'data:video/mp4;base64,' + b64; await ready;
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('Invalid saved clip metadata');
      const w = 384, h = Math.round(w * video.videoHeight / video.videoWidth), labelH = 28;
      const sheet = document.createElement('canvas'); sheet.width = w * 3; sheet.height = h + labelH;
      const g = sheet.getContext('2d'); g.fillStyle = '#0e171e'; g.fillRect(0, 0, sheet.width, sheet.height);
      const frame = document.createElement('canvas'); frame.width = w; frame.height = h;
      const f = frame.getContext('2d', { willReadFrequently: true });
      const samples = []; let poster;
      for (const [i, fraction] of [.12, .5, .88].entries()) {
        const time = Math.min(video.duration - .001, video.duration * fraction);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Video seek timed out')), 15000);
          video.onseeked = () => { clearTimeout(timer); resolve(); }; video.currentTime = time;
        });
        f.drawImage(video, 0, 0, w, h); g.drawImage(frame, i * w, 0);
        g.fillStyle = '#dfebef'; g.font = '14px sans-serif'; g.fillText(`${time.toFixed(2)} s`, i * w + 10, h + 19);
        if (!poster) poster = frame.toDataURL('image/png').split(',')[1];
        const pixels = f.getImageData(0, 0, w, h).data;
        let lit = 0, hash = 2166136261;
        for (let j = 0; j < pixels.length; j += 16) {
          if (pixels[j] + pixels[j + 1] + pixels[j + 2] > 48) lit++;
          hash = Math.imul(hash ^ pixels[j], 16777619); hash = Math.imul(hash ^ pixels[j + 1], 16777619);
        }
        samples.push({ time, litFraction: lit / Math.ceil(pixels.length / 16), fingerprint: (hash >>> 0).toString(16) });
      }
      return { durationSeconds: video.duration, width: video.videoWidth, height: video.videoHeight, samples,
        contact: sheet.toDataURL('image/png').split(',')[1], poster };
    }, fs.readFileSync(file).toString('base64'));
    fs.writeFileSync(contactFile, Buffer.from(decoded.contact, 'base64'));
    fs.writeFileSync(posterFile, Buffer.from(decoded.poster, 'base64'));
    delete decoded.contact; delete decoded.poster;
    return decoded;
  } finally { await page.close(); }
}

export function createEvidenceCapture({ page, runDir, result, log, frames = 120 }) {
  let phase = null;
  const exclusive = async (next, fn) => {
    if (phase) throw new Error(`Cannot ${next} during ${phase}; recording and benchmarks must be separate`);
    phase = next;
    try { return await fn(); } finally { phase = null; }
  };
  return {
    assertIdle() { if (phase) throw new Error('Screenshot/navigation cannot overlap ' + phase); },
    benchmark(name = 'gameplay', options = {}) {
      return exclusive('benchmark', async () => {
        log('benchmark', `${name}: sampling without capture`);
        const sample = await measureFrames(page, String(name), { frames, ...options });
        result.benchmarks.push(sample);
        log('benchmark', `${name}: ${sample.summary.samples} intervals, mean ${sample.summary.frameMs.mean.toFixed(1)} ms, p95 ${sample.summary.frameMs.p95.toFixed(1)} ms`);
        return sample;
      });
    },
    clip(name = 'gameplay', options = {}, during) {
      return exclusive('recording', async () => {
        const durationMs = bounded(options.durationMs ?? 6000, 1000, 30000, 'durationMs');
        const fps = bounded(options.fps ?? 15, 1, 60, 'clip fps');
        const stem = `${String(result.clips.length + 1).padStart(2, '0')}-${slug(name)}`;
        const file = path.join(runDir, stem + '.mp4');
        let recorder;
        try { recorder = await page.record({ path: file, fps, audio: false }); }
        catch (e) { throw new Error('Clip recording needs a Chrome build with Page.startScreenRecording and Puppeteer page.record(). ' + e.message); }
        const started = performance.now(); let cap;
        try {
          await Promise.race([
            Promise.all([sleep(durationMs), Promise.resolve().then(() => during?.())]),
            new Promise((_, reject) => { cap = setTimeout(() => reject(new Error('Clip action exceeded its wall-time budget')), durationMs + 2000); })
          ]);
        } finally { clearTimeout(cap); await recorder.stop(); }
        const wallMs = performance.now() - started;
        const contact = stem + '-contact.png', poster = stem + '-poster.png';
        const metadata = await reviewClip(page.browser(), file, path.join(runDir, contact), path.join(runDir, poster));
        await page.bringToFront();
        const clip = { name: String(name), file: path.basename(file), contact, poster, requestedDurationMs: durationMs,
          wallMs, requestedFps: fps, bytes: fs.statSync(file).size, audio: false, ...metadata,
          qualification: 'Wall-time page capture, including DOM UI. Encoded duration may be shorter than the requested wall window; capture overhead and dropped frames affect playback. Encoded FPS is not game FPS. Contact sheet is decoded from this MP4.' };
        result.clips.push(clip);
        log('clip', `${clip.file}: ${clip.durationSeconds.toFixed(2)} s, ${clip.bytes} bytes, decoded 3 frames`);
        return clip;
      });
    }
  };
}
