// Optional complete-utterance PCM from this PC's installed speech engine. A ticket only prepares audio;
// voice.js alone may play it. Late promises therefore cannot resurrect a cancelled or preempted line.
export function createLocalVoices({fetcher=globalThis.fetch,timeout=5000}={}) {
  let available=false,voices=[],bytes=0,active=0;const cache=new Map(),queue=[],jobs=new Set();
  const L={get available(){return available;},get voices(){return voices.slice();},get queued(){return queue.length;},get active(){return active;}};
  const headers={'X-NGC-Voice':'1'};
  L.ready=(async()=>{
    if(!fetcher)return false;
    for(let attempt=0;attempt<2;attempt++)try{
      // Portable/static hosts have no synthesis endpoint. Check the advertised opt-in before calling it,
      // avoiding a 404 (and browser console error) in ordinary play and the repo's static test server.
      const version=await fetcher('/version.json',{signal:AbortSignal.timeout(4000)});
      if(!version.ok||(await version.json()).speech!=='windows')return false;
      const r=await fetcher('/__voice',{headers,signal:AbortSignal.timeout(4000)});
      if(r.ok){const cap=await r.json();available=cap.available===true&&Array.isArray(cap.voices)&&cap.voices.length>0;voices=available?cap.voices.filter(v=>typeof v==='string'):[];}
      return available;
    }catch(_){if(!attempt)await new Promise(r=>setTimeout(r,300));}
    return false;
  })();
  function pump(){
    if(active>=2)return;const job=queue.shift();if(!job)return;
    if(job.state!=='pending')return pump();active++;
    (async()=>{
      try{
        const r=await fetcher('/__voice',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(job.request),signal:AbortSignal.any([job.abort.signal,AbortSignal.timeout(timeout)])});
        if(!r.ok)throw Error('Speech unavailable');
        const count=Number(r.headers.get('Content-Length'));if(count>2500000)throw Error('Speech too long');
        const data=await r.arrayBuffer();if(data.byteLength>2500000||job.state!=='pending')return;
        const buffer=await job.ctx.decodeAudioData(data);if(job.state!=='pending')return;
        if(buffer.duration>25||!buffer.length)throw Error('Invalid speech buffer');
        const entry={buffer,voice:r.headers.get('X-NGC-Voice-Name')||'Windows local voice'};
        const previous=cache.get(job.key)?.buffer;if(previous)bytes-=previous.length*previous.numberOfChannels*4;
        cache.set(job.key,entry);bytes+=buffer.length*buffer.numberOfChannels*4;
        while(cache.size>40||bytes>16*1024*1024){const key=cache.keys().next().value,b=cache.get(key).buffer;bytes-=b.length*b.numberOfChannels*4;cache.delete(key);}
        job.buffer=buffer;job.voice=entry.voice;job.state='ready';
      }catch(_){if(job.state==='pending')job.state='failed';}
      finally{jobs.delete(job);active--;pump();}
    })();pump();
  }
  L.prepare=(ctx,{text,who,role,urgent=false,pri=1,cacheOnly=false})=>{
    if(!available||!ctx||typeof ctx.decodeAudioData!=='function'||typeof text!=='string'||text.length>480)return null;
    const request={text,who:String(who).slice(0,96),role,urgent},key=JSON.stringify(request),saved=cache.get(key);
    if(saved)return {state:'ready',...saved,cancel(){}};
    if(cacheOnly)return null;
    if(jobs.size>=8)return null;
    const job={key,request,ctx,pri,state:'pending',buffer:null,abort:new AbortController(),cancel(){
      if(this.state==='pending'){this.state='cancelled';this.abort.abort();const i=queue.indexOf(this);if(i>=0){queue.splice(i,1);jobs.delete(this);}}
      this.buffer=null;
    }};
    jobs.add(job);queue.push(job);queue.sort((a,b)=>b.pri-a.pri);pump();return job;
  };
  L.stop=()=>{for(const job of jobs)job.cancel();};
  return L;
}
