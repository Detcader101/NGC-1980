// Browser microphone capture, independent of the browser's speech service. Audio stays in memory until release.
export function encodeWave(chunks, rate) {
  const total=chunks.reduce((n,c)=>n+c.length,0), input=new Float32Array(total);let at=0;
  for(const c of chunks){input.set(c,at);at+=c.length;}
  const count=Math.min(320000,Math.floor(total*16000/rate)), bytes=new Uint8Array(44+count*2), v=new DataView(bytes.buffer);
  const text=(p,t)=>{for(let i=0;i<t.length;i++)bytes[p+i]=t.charCodeAt(i);};
  text(0,'RIFF');v.setUint32(4,bytes.length-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*2,true);
  for(let i=0;i<count;i++){const lo=Math.floor(i*rate/16000),hi=Math.min(total,Math.max(lo+1,Math.floor((i+1)*rate/16000)));let sum=0;for(let j=lo;j<hi;j++)sum+=input[j];const x=Math.max(-1,Math.min(1,sum/(hi-lo)));v.setInt16(44+i*2,Math.round(x*(x<0?32768:32767)),true);}
  return bytes;
}
/** @param {{signal: AbortSignal, level?: (peak: number) => void, media?: MediaDevices}} options */
export async function openMicrophone({signal,level=()=>{},media=navigator.mediaDevices}) {
  if(!media?.getUserMedia||!isSecureContext)throw Error('Microphone needs localhost or HTTPS and browser permission.');
  const ctx=new AudioContext();let stream,source,node,stopped=false,flush;
  const chunks=[];let samples=0;
  const stop=()=>{if(stopped)return;stopped=true;stream?.getTracks().forEach(t=>t.stop());source?.disconnect();node?.disconnect();ctx.close().catch(()=>{});level(0);flush?.();};
  signal.addEventListener('abort',stop,{once:true});
  try {
    await ctx.resume();
    if(signal.aborted)throw Error('Transmission cancelled.');
    stream=await media.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(signal.aborted){stop();stream.getTracks().forEach(t=>t.stop());throw Error('Transmission cancelled.');}
    await ctx.audioWorklet.addModule(new URL('./mic-worklet.js',import.meta.url));
    if(signal.aborted)throw Error('Transmission cancelled.');
    source=ctx.createMediaStreamSource(stream);node=new AudioWorkletNode(ctx,'radio-microphone');
    node.port.onmessage=e=>{if(e.data==='flushed'){flush?.();return;}if(stopped)return;const a=e.data;if(samples+a.length<=ctx.sampleRate*20){chunks.push(a);samples+=a.length;}let peak=0;for(const x of a)peak=Math.max(peak,Math.abs(x));level(peak);};
    source.connect(node);node.connect(ctx.destination);
    return {stop,async finish(){
      await new Promise(resolve=>{let timer;flush=()=>{clearTimeout(timer);resolve(undefined);};timer=setTimeout(flush,250);node.port.postMessage('flush');});
      const rate=ctx.sampleRate;stop();return encodeWave(chunks,rate);
    }};
  }catch(e){stop();throw e;}
}
