// Input ownership for push-to-talk. Physical-key codes persist independently of USB button bindings in hotas.js.
const STORE='ngc_radio_ptt_key';
const valid=code=>/^(Key[A-Z]|Digit[0-9]|F([1-9]|10))$/.test(code)&&code!=='F5';
export const pttLabel=code=>code.replace(/^Key|^Digit/,'');
/**
 * @param {{start: () => boolean | void, release: () => unknown, cancel?: (message?: string) => void,
 * allowed?: () => boolean, changed?: (key: string) => void, state?: (message: string) => void,
 * storage?: Pick<Storage, 'getItem' | 'setItem'>}} options
 */
export function createPTT({start,release,cancel,allowed=()=>true,changed=()=>{},state=()=>{},storage}){
  if(storage===undefined){try{storage=globalThis.localStorage;}catch(_){storage=null;}}
  let key='F9',binding=false,padArmed=false;const held=new Set();
  try{const saved=storage?.getItem(STORE);if(valid(saved))key=saved;}catch(_){}
  const P={get key(){return key;},get binding(){return binding;}};
  const save=code=>{key=code;binding=false;try{storage?.setItem(STORE,key);}catch(_){}changed(key);state('Push-to-talk bound to '+pttLabel(key)+'. Hold to speak; release to send.');};
  P.cancel=(message)=>{const wasBinding=binding;held.clear();padArmed=false;binding=false;cancel?.(message);if(wasBinding)state('Key binding cancelled.');};
  P.set=(source,down)=>{
    if(down){if(held.has(source)||!allowed()||binding)return;const first=held.size===0;held.add(source);if(first&&start()===false)held.delete(source);}
    else if(held.delete(source)&&held.size===0)release();
  };
  P.bind=()=>{P.cancel();binding=true;state('Press a letter, number or function key for push-to-talk. Escape cancels.');};
  P.reset=()=>{P.cancel();save('F9');};
  P.keyDown=e=>{
    if(binding){
      if(e.repeat)return true;
      if(e.code==='Escape'){binding=false;state('Key binding cancelled.');return true;}
      if(e.ctrlKey||e.altKey||e.metaKey||!valid(e.code)){state('Choose one letter, number or F-key (except F5). Escape cancels.');return true;}
      save(e.code);return true;
    }
    if(e.code!==key||e.ctrlKey||e.altKey||e.metaKey||!allowed())return false;
    const typing=e.target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName);
    if(typing&&!key.startsWith('F'))return false;
    if(!e.repeat)P.set('key',true);return true;
  };
  P.keyUp=e=>{if(e.code!==key||!held.has('key'))return false;P.set('key',false);return true;};
  P.pad=({down,pressed,connected,enabled=true})=>{
    if(!enabled||!connected){if(held.has('pad'))P.cancel('Controller transmission cancelled.');padArmed=false;return;}
    if(!down){padArmed=true;P.set('pad',false);}else if(padArmed&&pressed)P.set('pad',true);
  };
  return P;
}
