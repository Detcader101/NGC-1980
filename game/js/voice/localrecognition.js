import {createRecognition} from './recognition.js';
import {openMicrophone} from './microphone.js';
import {ordersFor,commandCall} from './commands.js';
export function commandPhrases(targets,places){
  // Put every station's short/procedure calls first so a large force never loses CORRECT/DISREGARD.
  const calls=targets.flatMap(t=>ordersFor(t,places).map(o=>({text:commandCall(t,o),short:!o.destination})));
  calls.sort((a,b)=>Number(b.short)-Number(a.short));
  return [...new Set(calls.map(c=>c.text))].slice(0,2000);
}
// Offline Windows recognizer when the serving PC provides it; native recognition on other hosts.
/**
 * @param {{allowed: () => boolean, submit: (alternatives: import('./recognition.js').SpeechAlternative[]) => unknown,
 * phrases: () => string[], state?: (message: string) => void, level?: (peak: number) => void,
 * backend?: (name: string) => void, fetcher?: typeof fetch, capture?: typeof openMicrophone,
 * Recognition?: new () => import('./recognition.js').RecognitionAdapter}} options
 */
export function createRadioRecognition({allowed,submit,state=()=>{},level=()=>{},backend=()=>{},phrases,fetcher=globalThis.fetch,capture=openMicrophone,Recognition}) {
  const native=createRecognition({allowed,submit,state,...(Recognition!==undefined?{Recognition}:{})});
  let available=false,checked=false,current=null;
  const headers={'X-NGC-Speech':'1'};
  const R={probeError:'',get supported(){return available||native.supported;},get active(){return !!current||native.active;},get backend(){return available?'Windows offline':native.supported?'Browser speech service':'Unavailable';}};
  const announce=()=>backend(R.backend);
  R.ready=(async()=>{
    // Cold shader compilation can block the first response's JSON task past its timeout. Retry once after
    // yielding, instead of permanently selecting a broken browser service for this whole game session.
    for(let attempt=0;attempt<2;attempt++){
      try{const v=await fetcher('/version.json',{signal:AbortSignal.timeout(4000)});
        if(v.ok&&(await v.json()).speech==='windows'){const r=await fetcher('/__speech',{headers,signal:AbortSignal.timeout(4000)});if(r.ok)available=!!(await r.json()).available;}
        R.probeError='';break;
      }catch(e){R.probeError=e.name+': '+e.message;if(attempt===0)await new Promise(r=>setTimeout(r,300));}
    }
    checked=true;announce();
  })();
  const clear=s=>{clearTimeout(s.limit);clearTimeout(s.opening);s.abort.abort();s.mic?.stop();level(0);if(current===s)current=null;};
  R.cancel=(message='Transmission cancelled.')=>{native.cancel(message);const s=current;if(s){clear(s);state(message);}};
  R.prepare=async()=>{
    R.cancel();state('Allow microphone access in the browser prompt.');
    // Permission only: immediately close the stream; do not record or transmit a test.
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});stream.getTracks().forEach(t=>t.stop());state('Microphone allowed. Hold F9 or Hold to talk until LISTENING appears.');}
    catch(e){state(e.name==='NotAllowedError'?'Microphone blocked. Allow it in this site’s permissions, then check again.':'No microphone available. Check the selected input in browser and Windows settings.');}
  };
  R.start=()=>{
    if(R.active||!allowed())return false;
    if(!checked){state('Checking local speech service. Try push-to-talk again in a moment.');return false;}
    if(!available)return native.start();
    const s=current={abort:new AbortController(),mic:null,released:false,phrases:phrases(),limit:null,opening:null};
    state('Opening microphone… allow access and keep holding.');
    s.opening=setTimeout(()=>{if(current===s)R.cancel('Microphone did not open. Use Check microphone to grant permission, then try again.');},12000);
    s.limit=setTimeout(()=>{if(current===s)R.cancel('Transmission timed out. Say again.');},20000);
    capture({signal:s.abort.signal,level}).then(mic=>{
      if(current!==s){mic.stop();return;}clearTimeout(s.opening);s.mic=mic;state('LISTENING · speak the complete call, then release.');
    }).catch(e=>{if(current!==s)return;R.cancel(e.name==='NotAllowedError'?'Microphone blocked. Allow access in this site’s permissions.':e.name==='NotFoundError'?'No microphone found. Check Windows input settings.':e.name==='NotReadableError'?'Microphone is busy or unavailable. Check the selected input.':e.message||'Microphone could not open.');});
    return true;
  };
  R.release=async()=>{
    const s=current;if(!s)return native.release();if(s.released)return;s.released=true;
    if(!allowed()){R.cancel();return;}
    if(!s.mic){R.cancel('Released before the microphone opened. Use Check microphone, then hold until LISTENING.');return;}
    clearTimeout(s.limit);state('Transcribing locally…');
    s.limit=setTimeout(()=>{if(current===s)R.cancel('Local transcription timed out. Say again.');},23000);
    try {
      const bytes=await s.mic.finish();if(current!==s)return;
      if(bytes.length<6444){R.cancel('Transmission too short. Hold while speaking the complete call.');return;}
      let audio='';for(let i=0;i<bytes.length;i+=8192)audio+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const r=await fetcher('/__speech',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({audio:btoa(audio),phrases:s.phrases}),signal:s.abort.signal});
      const result=await r.json();if(current!==s)return;clear(s);
      if(!allowed()){state('Transmission cancelled.');return;}
      if(!r.ok||!result.alternatives?.length){state(result.reason||'Nothing heard. Say again.');return;}
      state('Heard: '+result.alternatives[0].transcript);submit(result.alternatives);
    }catch(e){if(current===s)R.cancel(e.name==='AbortError'?'Transmission cancelled.':'Local speech unavailable. Check that the game server is still running.');}
  };
  return R;
}
