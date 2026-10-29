// Measured radio transfer and real AudioWorklet capture using a generated tone, never the user's mic.
export default async function(h){
  await h.goto('dev/voices.html');
  await h.page.click('#play');
  await h.waitFor('window.__voices?.backend === "generated"',30000);
  const result=await h.eval(`(async()=>{
    const {RadioBed}=await import('../js/voice/radio.js');
    const render=async(f,old)=>{
      const ctx=new OfflineAudioContext(1,48000,48000),out=ctx.createGain();out.gain.value=1;out.connect(ctx.destination);
      let input;
      if(old){const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=320;hp.Q.value=.9;
        const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=2900;lp.Q.value=.9;
        const pk=ctx.createBiquadFilter();pk.type='peaking';pk.frequency.value=1700;pk.gain.value=5;pk.Q.value=1;
        const ws=ctx.createWaveShaper();ws.curve=Float32Array.from({length:1024},(_,i)=>Math.tanh(1.6*(i/1023*2-1))/Math.tanh(1.6));ws.oversample='2x';
        const gain=ctx.createGain();gain.gain.value=.6/Math.sqrt(1.6);hp.connect(lp);lp.connect(pk);pk.connect(ws);ws.connect(gain);gain.connect(out);input=hp;
      }else input=new RadioBed({ctx}).chain('uhf',out);
      const osc=ctx.createOscillator(),g=ctx.createGain();g.gain.value=.1;osc.frequency.value=f;osc.connect(g);g.connect(input);osc.start();
      const a=(await ctx.startRendering()).getChannelData(0);let sum=0;for(let i=12000;i<36000;i++)sum+=a[i]*a[i];return Math.sqrt(sum/24000);
    };
    const values={};for(const f of [120,1100,6000])values[f]={before:await render(f,true),after:await render(f,false)};
    window.__filter=values;
    const {createSamples,speechKey}=await import('../js/voice/samples.js');const s=createSamples();await s.load();
    const index=await(await fetch('../audio/voices/index.json')).json(),key=speechKey('Command, this is Albatross. Read you. Out.');
    const b=s.buffer(new OfflineAudioContext(1,1,16000),'Command, this is Albatross. Read you. Out.');
    window.__wholeSentence=!!index.clips.male[key]&&b.length===index.clips.male[key][1]+Math.round(index.rate*.008);
    return values;
  })()`);
  await h.expect('__filter[120].after/__filter[120].before < .25','stronger radio filter removes more bass than previous chain');
  await h.expect('__filter[6000].after/__filter[6000].before < .25','post-clipping low-pass removes more high-frequency energy');
  await h.expect('__filter[1100].after > .025','speech midrange remains audible through the stronger radio filter');
  await h.expect('__wholeSentence','common acknowledgement is a single synthesized sentence, not word splices');
  await h.expect('__voices.V.vol===6 && __voices.V.persona("chief","huey").pitch>=.96 && __voices.V.persona("chief","huey").pitch<=1.04','quieter default and restrained voice pitch');
  await h.eval(`(async()=>{
    const {openMicrophone}=await import('../js/voice/microphone.js');
    const ctx=new AudioContext();await ctx.resume();const tone=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();
    tone.frequency.value=600;gain.gain.value=.2;tone.connect(gain);gain.connect(dest);tone.start();
    window.__testMic={ctx,tone,dest,abort:new AbortController(),peak:0};
    __testMic.capture=await openMicrophone({signal:__testMic.abort.signal,media:{getUserMedia:async()=>dest.stream},level:n=>__testMic.peak=Math.max(__testMic.peak,n)});return true;
  })()`);
  await h.wait(650);
  await h.eval('(async()=>{const m=__testMic,b=await m.capture.finish();m.waveBytes=b.length;m.tracksClosed=m.dest.stream.getTracks().every(t=>t.readyState==="ended");m.tone.stop();await m.ctx.close();return {bytes:m.waveBytes,peak:m.peak,closed:m.tracksClosed};})()');
  await h.expect('__testMic.peak>.05 && __testMic.waveBytes>10000','real AudioWorklet records generated microphone input and exposes level');
  await h.expect('__testMic.tracksClosed','release closes every microphone track');
  await h.page.click('#urgent');await h.wait(300);await h.shot('quieter-radio-preview');
}
