#!/usr/bin/env node
// Rebuild our speech from authored text with locally installed Windows SAPI voices. No network or voice packs.
// Run in this worktree: node tools/voice-build.mjs (WSL + Windows System.Speech).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { PHRASES } from '../game/js/voice/phrases.js';
import { speechKey } from '../game/js/voice/samples.js';
const root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'game/audio/voices');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngc-voice-'));
const ps = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const win = p => execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
const texts = new Map(), words = new Set('abcdefghijklmnopqrstuvwxyz'.split(''));
// Keep sentence punctuation in synthesis: only the lookup key is flattened. The old builder spoke the keys,
// removing every pause and turning dialogue into a list of words.
function add(t) { for (const part of t.split(/\{[^}]*\}/)) { const key = speechKey(part); if (!key) continue;
  if (!texts.has(key)) texts.set(key, part.trim().replace(/\d/g, d => speechKey(d)).replace(/\bRTB\b/g, 'returning to base'));
  for (const w of key.split(' ')) words.add(w); } }
for (const cats of Object.values(PHRASES)) for (const lines of Object.values(cats)) for (const line of lines) add(line);
const calls = ['Albatross','Huey one','Falcon one one','Bullet two one',...['one','two','three','four','five','six','seven','eight','niner','one zero','one one','one two'].map(n=>'Hotel '+n)];
for (const call of calls) for (const reply of ['Read you. Out.','Wilco. Out.','Unable. Out.','Standing by. Out.','Under way. Out.','Nothing to repeat. Out.']) add(`Command, this is ${call}. ${reply}`);
// Render frequent dynamic calls whole. Bound the cartesian expansion; uncommon combinations retain fragments.
const variants = {cs:['Falcon one-one','Bullet two-one','Huey one'],clock:['twelve','one','two','three','four','five','six','seven','eight','nine','ten','eleven'].map(n=>n+" o'clock"),
  dir:['front','left','right','rear','left front','right front','left rear','right rear'],
  isl:['HOME ISLAND','IRONHOLD','NORTH ROCK','SOUTH REEF','CITADEL','PELICAN','ANVIL','LOOKOUT','BEACON','FORGE','CINDER','WELLSPRING','SANDBAR','DRIFTWOOD','KILN','SPIRE','ECHO']};
for (const cats of Object.values(PHRASES)) for (const lines of Object.values(cats)) for (const line of lines) {
  const slots=[...new Set([...line.matchAll(/\{(\w+)\}/g)].map(m=>m[1]))];
  if(!slots.length||slots.some(k=>!variants[k])||slots.reduce((n,k)=>n*variants[k].length,1)>48)continue;
  let full=[line];for(const slot of slots)full=full.flatMap(t=>variants[slot].map(v=>t.replaceAll('{'+slot+'}',v)));
  for(const t of full)add(t);
}
const hooks = fs.readFileSync(path.join(root, 'game/js/voice/hooks.js'), 'utf8');
for (const m of hooks.matchAll(/text: (['"`])((?:\\.|(?!\1).)*)\1/g)) add(m[2].replace(/\\'/g, "'").replace(/\$\{[^}]*\}/g, ' '));
// Dynamic names, standard numbers, directions, aircraft warnings and command-board equipment.
for (const file of ['world.js', 'techtree.js', 'units/commander/board.js', 'jetplay.js', 'crafttomcat.js']) {
  const s = fs.readFileSync(path.join(root, 'game/js', file), 'utf8');
  for (const m of s.matchAll(/['"]([A-Z][A-Z0-9 /-]{1,55})['"]/g)) for (const w of speechKey(m[1]).split(' ')) if (w) words.add(w);
}
add('zero one two three four five six seven eight niner nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand point');
add("front rear left right nose low high meters miles o'clock Falcon Bullet Hotel Knight Herky Albatross tower mother radio check departure clear roger out over wingman pilot crew chief door gunner returning to base");
add('altitude fuel low engine left right landing gear flight controls roll stall caution fire');
add('Command this is read you out wilco unable nothing to repeat under way standing by holding position in the field Marines at');
add('mutt deuce and a half Sea Knight Herky Mike boat Shrike hover tank Sidewinder Sparrow Phoenix Huey Tomcat Hornet Osprey chutes casualty collection point');
for (const w of words) if(!texts.has(w))texts.set(w,w);
const keys = [...texts.keys()].sort();
fs.writeFileSync(path.join(temp, 'texts.json'), JSON.stringify(keys.map(k=>texts.get(k))));
fs.writeFileSync(path.join(temp, 'generate.ps1'), `param([string]$Root)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$texts = Get-Content -LiteralPath (Join-Path $Root 'texts.json') -Raw | ConvertFrom-Json
$voices = @($s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'en-US' })
if ($voices.Count -eq 0) { throw 'No installed US English voice; nothing generated.' }
$used = @{}
foreach ($gender in @('male','female')) {
  $v = $voices | Where-Object { $_.VoiceInfo.Gender.ToString().ToLower() -eq $gender } | Select-Object -First 1
  if (!$v) { $v = $voices[0] }
  $s.SelectVoice($v.VoiceInfo.Name); $s.Rate = 0; $s.Volume = 100
  $used[$gender] = $v.VoiceInfo.Name
  for ($i=0; $i -lt $texts.Count; $i++) {
    $s.SetOutputToWaveFile((Join-Path $Root ($gender + '-' + $i + '.wav')), $fmt)
    $s.Speak([string]$texts[$i]); $s.SetOutputToNull()
  }
}
$used | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Root 'sources.json')
$s.Dispose()
`);
try {
  console.log(`Synthesizing ${keys.length} authored clips per voice from installed SAPI voices…`);
  execFileSync(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', win(path.join(temp, 'generate.ps1')), '-Root', win(temp)], { stdio: 'inherit', timeout: 600000 });
  const clips = {}, chunks = []; let samples = 0;
  for (const gender of ['male', 'female']) {
    clips[gender] = {};
    for (let i = 0; i < keys.length; i++) {
      const wav = fs.readFileSync(path.join(temp, `${gender}-${i}.wav`)); let start = 12, data;
      while (start + 8 <= wav.length) { const n = wav.readUInt32LE(start + 4); if (wav.toString('ascii', start, start + 4) === 'data') { data = wav.subarray(start + 8, start + 8 + n); break; } start += 8 + n + (n % 2); }
      if (!data) throw Error('Missing PCM data');
      // Retain 15 ms of leading / trailing silence; word joins avoid SAPI's half-second final pause.
      let lo = 0, hi = data.length / 2;
      while (lo < hi && Math.abs(data.readInt16LE(lo * 2)) < 80) lo++;
      while (hi > lo && Math.abs(data.readInt16LE((hi - 1) * 2)) < 80) hi--;
      lo = Math.max(0, lo - 240); hi = Math.min(data.length / 2, hi + 240);
      const trimmed = Buffer.from(data.subarray(lo * 2, hi * 2));
      // Fade the joins to prevent a concatenation click.
      for (let j = 0; j < Math.min(80, (hi - lo) / 2); j++) for (const k of [j, hi - lo - 1 - j]) trimmed.writeInt16LE(Math.round(trimmed.readInt16LE(k * 2) * j / 80), k * 2);
      clips[gender][keys[i]] = [samples, hi - lo]; samples += hi - lo; chunks.push(trimmed);
    }
  }
  const pcm = Buffer.concat(chunks), logpcm = Buffer.alloc(samples);
  for (let n = 0; n < samples; n++) { const x = pcm.readInt16LE(n*2)/32768; logpcm[n] = (x < 0 ? 128 : 0) | Math.round(Math.log1p(255*Math.abs(x))/Math.log(256)*127); }
  const packed = gzipSync(logpcm, { level: 9 });
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'speech.logpcm.gz'), packed);
  fs.writeFileSync(path.join(out, 'local-index.json'), JSON.stringify({ format: 'log8-gzip', rate: 16000, samples, file: 'speech.logpcm.gz', source: JSON.parse(fs.readFileSync(path.join(temp, 'sources.json'), 'utf8').replace(/^\uFEFF/, '')), sha256: createHash('sha256').update(packed).digest('hex'), clips }) + '\n');
  console.log(`${keys.length} clips × 2 voices; ${(packed.length / 1048576).toFixed(1)} MiB; ${out}`);
  console.log('Local generated files are ignored by Git. Serve with node tools/serve.mjs; do not distribute the bank.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
