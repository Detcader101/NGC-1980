// Push-to-talk lifecycle. Only a completed, released transmission can reach submit().
// Constructor injection lets tests exercise actual callbacks without a microphone or external service.
/** @typedef {{transcript: string, confidence: number}} SpeechAlternative */
/** @typedef {ArrayLike<SpeechAlternative> & {isFinal: boolean}} SpeechResult */
/**
 * @typedef {object} RecognitionAdapter
 * @property {string} lang
 * @property {boolean} continuous
 * @property {boolean} interimResults
 * @property {number} maxAlternatives
 * @property {(event: {results: ArrayLike<SpeechResult>}) => void} onresult
 * @property {() => void} onstart
 * @property {() => void} onend
 * @property {(event: {error: string}) => void} onerror
 * @property {() => void} start
 * @property {() => void} stop
 * @property {() => void} abort
 */
/**
 * @param {{Recognition?: new () => RecognitionAdapter, allowed?: () => boolean,
 * submit: (alternatives: SpeechAlternative[]) => unknown, state?: (message: string) => void,
 * openingTimeout?: number}} options
 */
export function createRecognition({Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition,allowed=()=>true,submit,state=()=>{},openingTimeout=8000}) {
  let current=null, serial=0;
  const R={supported:!!Recognition,get active(){return !!current;}};
  function clear(s){clearTimeout(s.limit);clearTimeout(s.wait);clearTimeout(s.opening);if(current===s)current=null;}
  function done(s){
    if(current!==s||!s.released||!s.ended)return;
    clear(s);
    if(!allowed()){state('Transmission cancelled.');return;}
    if(!s.final.length){state('Nothing heard. Say again.');return;}
    state('Checking call…');submit(s.final);
  }
  R.cancel=(message='Transmission cancelled.')=>{const s=current;if(!s)return;clear(s);try{s.rec.abort();}catch(_){}state(message);};
  R.start=()=>{
    if(current||!allowed())return false;
    if(!Recognition){state('Microphone recognition is unavailable in this browser. Type a radio call below.');return false;}
    let rec;try{rec=new Recognition();}catch(_){state('Microphone recognition is unavailable.');return false;}
    const s=current={id:++serial,rec,released:false,ended:false,final:[],limit:null,wait:null,opening:null};
    rec.lang='en-US';rec.continuous=false;rec.interimResults=false;rec.maxAlternatives=3;
    rec.onresult=e=>{
      if(current!==s)return;
      const finals=[];
      for(let i=0;i<e.results.length;i++)if(e.results[i].isFinal)finals.push(e.results[i]);
      // One transmission only: don't salvage the first command from a longer utterance.
      if(finals.length!==1){s.final=[];return;}
      s.final=Array.from(finals[0],a=>({transcript:a.transcript,confidence:a.confidence}));
    };
    rec.onend=()=>{if(current!==s)return;s.ended=true;if(!s.released)state('Release push-to-talk to send.');done(s);};
    rec.onerror=e=>{if(current!==s)return;const msg=e.error==='not-allowed'?'Microphone blocked. Allow it in this site’s permissions.':e.error==='service-not-allowed'?'This browser cannot use its speech service. Use the local speech-enabled game launch or type the call.':e.error==='network'?'Browser speech service unavailable. Use the local Windows speech server or type the call.':e.error==='audio-capture'?'No microphone input. Check the browser and Windows input device.':e.error==='no-speech'?'Nothing heard. Say again.':'Transmission cancelled: '+e.error;R.cancel(msg);};
    rec.onstart=()=>{if(current===s){clearTimeout(s.opening);state('LISTENING · speak, then release.');}};
    s.opening=setTimeout(()=>{if(current===s)R.cancel('Browser speech service did not start. Use Check microphone, or the local Windows speech server.');},openingTimeout);
    s.limit=setTimeout(()=>R.cancel('Transmission timed out. Say again.'),20000);
    try{state('Opening microphone…');rec.start();return true;}catch(_){R.cancel('Microphone could not start. You can type a radio call.');return false;}
  };
  R.release=()=>{const s=current;if(!s||s.released)return;s.released=true;
    if(!allowed()){R.cancel();return;}
    if(!s.ended){state('Receiving final transcript…');try{s.rec.stop();}catch(_){R.cancel();return;}s.wait=setTimeout(()=>{if(current===s)R.cancel('No final transcript. Say again.');},5000);}
    done(s);
  };
  return R;
}
