// Authored text, synthesized locally by tools/voice-build.mjs. No recordings or downloaded voice packs.
// SpeechSynthesis exposes no AudioNode/PCM output; these generated PCM samples make the *words* filterable.
const DECODE = Float32Array.from({length:256}, (_, n) => (n & 128 ? -1 : 1) * Math.expm1((n & 127) / 127 * Math.log(256)) / 255);
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
export function speechKey(text) {
  return String(text).toLowerCase().replace(/\d/g, d => ` ${DIGITS[+d]} `)
    .replace(/[’']/g, "'").replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function createSamples(base = new URL('../../audio/voices/', import.meta.url)) {
  let index = null, pcm = null, pending = null, failed = false;
  const cache = new Map();
  const S = {
    get ready() { return !!pcm; }, get failed() { return failed; },
    load() {
      if (pending) return pending;
      pending = (async () => {
        try {
          const r = await fetch(new URL('index.json', base)); if (!r.ok) throw Error('voice index unavailable');
          const i = await r.json();
          if(i.available===false){failed=true;return false;} // optional local build absent: text only, no missing-file request
          const a = await fetch(new URL(i.file, base)); if (!a.ok) throw Error('voice samples unavailable');
          const bytes = await new Response(a.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
          if (bytes.byteLength !== i.samples) throw Error('incomplete voice samples');
          pcm = new Uint8Array(bytes); index = i;
        } catch (_) { failed = true; } // no voices, unsupported decoder or missing asset: subtitles only
        return S.ready;
      })();
      return pending;
    },
    buffer(ctx, text, female = false) {
      if (!pcm) return null;
      const key = speechKey(text), voice = female ? 'female' : 'male', cacheKey = voice + ':' + key;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const bank = index.clips[voice] || index.clips.male, words = key.split(' '), pieces = [];
      for (let p = 0; p < words.length;) {
        let clip = null, n = Math.min(32, words.length - p);
        for (; n > 0; n--) { clip = bank[words.slice(p, p + n).join(' ')]; if (clip) break; }
        if (!clip) { // an unforeseen callsign is spelled, never dropped or replaced with babble
          for (const c of words[p]) { const letter = bank[c]; if (letter) pieces.push(letter); }
          p++;
        } else { pieces.push(clip); p += n; }
      }
      if (!pieces.length) return null;
      const gap = Math.round(index.rate * 0.008), length = pieces.reduce((n, c) => n + c[1] + gap, 0);
      const b = ctx.createBuffer(1, length, index.rate), out = b.getChannelData(0);
      let offset = 0;
      for (const [start, count] of pieces) { for (let j = 0; j < count; j++) out[offset + j] = DECODE[pcm[start + j]]; offset += count + gap; }
      cache.set(cacheKey, b); if (cache.size > 48) cache.delete(cache.keys().next().value);
      return b;
    },
  };
  return S;
}
