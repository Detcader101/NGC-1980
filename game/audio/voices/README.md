# Local speech bank

`index.json` is a small, tracked text-only descriptor. It contains no generated speech.

Build an optional bank on your own PC from the game's authored phrases and locally installed Windows voices:

```sh
node tools/voice-build.mjs
```

Run that command at the repository root in WSL with Windows US English voices installed. It writes
`speech.logpcm.gz` and `local-index.json`, both ignored by Git. Keep these files local; do not add them to a
release or public repository. The provided `tools/serve.mjs` and screenshot harness expose the local manifest
only when the matching bank exists. Otherwise the game uses text call-outs silently. Static hosting serves the
tracked text-only descriptor. Live local synthesis via `node tools/serve.mjs --speech windows` is another option.

`node tools/voicebankbench.mjs` tests absent and partial builds with numerical test PCM. `node tools/voicebench.mjs`
always checks call-out hooks and additionally verifies the bank's hash, sample bounds and phrase coverage when
a local bank is available. No downloaded speech, voice packs or recordings from other games are used.
