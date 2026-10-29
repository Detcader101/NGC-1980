// Generated speech stays local. Static deployments get game/audio/voices/index.json's silent descriptor;
// our servers expose the ignored local manifest only when its matching PCM file is present.
import fs from 'node:fs';
import path from 'node:path';
export const NO_VOICE_BANK = Object.freeze({available:false,build:'node tools/voice-build.mjs'});
export function voiceBankIndex(gameRoot) {
  try {
    const dir=path.join(gameRoot,'audio/voices'),index=JSON.parse(fs.readFileSync(path.join(dir,'local-index.json'),'utf8'));
    if(index.format!=='log8-gzip'||index.file!=='speech.logpcm.gz'||!Number.isInteger(index.samples)||index.samples<=0||!index.clips?.male||!fs.statSync(path.join(dir,index.file)).size)return NO_VOICE_BANK;
    return {...index,available:true};
  } catch { return NO_VOICE_BANK; }
}
