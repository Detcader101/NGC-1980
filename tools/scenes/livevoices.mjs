// Real installed WinRT synthesis -> browser PCM -> serialized radio mixer. No physical microphone access.
// Run against a worktree server with --speech windows. This dev scene avoids full-world shader startup.
export default {name:'livevoices',query:'dev/voices.html',run:async function(h){
  await h.page.evaluate(()=>{
    const real=window.fetch;window.fetch=async(...args)=>{const r=await real(...args);
      if(String(args[0]).includes('/__voice')&&args[1]?.method==='POST'&&window.__holdVoice){
        // Hold an already received response to isolate the late decode race. Network cancellation itself is
        // covered by livevoicebench; the browser harness treats intentional ERR_ABORTED as a page error.
        const data=await r.arrayBuffer();await new Promise(resolve=>{window.__releaseVoice=resolve;});return new Response(data,{status:r.status,headers:r.headers});
      }
      return r;
    };
  });
  await h.page.select('#role','tower');await h.page.select('#net','uhf');await h.page.click('#sentence');
  await h.waitFor('__voices.backend === "local"',15000);
  await h.waitFor('__voices.V.cur?.backend === "local"',15000);
  await h.expect('__voices.V.cur.actor === "Microsoft Mark" && __voices.V.cur.source.playbackRate.value === 1','whole sentence uses installed Mark with natural synthesis cadence, no playback pitch shift');
  await h.expect('__voices.V.cur.net === "uhf" && !!__voices.V.cur.bed && __voices.V.cur.audioDuration > 2','complete controller line reaches the real radio chain and squelch bed');
  await h.eval('(window.__voicePeak=0,window.__voicePeakTimer=setInterval(()=>{__voicePeak=Math.max(__voicePeak,__voices.V.peak());},20),true)');
  await new Promise(r=>setTimeout(r,450));
  await h.expect('__voicePeak>.001 && __voicePeak<.3','normalized speech produces controlled output on the dedicated voice bus');
  await h.page.evaluate(()=>document.querySelector('#status').scrollIntoView({block:'end'}));
  await h.shot('complete-local-line');
  await h.eval('(clearInterval(__voicePeakTimer),__voices.V.stop("fixture"),__holdVoice=true,true)');
  await h.eval(`__voices.V.speak({who:'radio-cancel-fixture',role:'command',text:'Command, this is Supply. Vehicle delivery is standing by at Home Island. Over.',net:'uhf',pri:1,cd:0,key:'late-voice'})?.i`);
  await h.waitFor('typeof __releaseVoice === "function"',10000);
  await h.eval('(__voices.V.ctx.state="paused",__voices.V.update(.02),__releaseVoice(),__holdVoice=false,true)');
  await new Promise(r=>setTimeout(r,150));
  await h.expect('__voices.V.log.find(e=>e.key==="late-voice").state === "paused" && __voices.V.log.find(e=>e.key==="late-voice").start===null && !__voices.cur','pausing while synthesis is pending discards the late PCM without speaking');
  await h.eval('(__voices.V.ctx.state="play",__voices.V.update(.02),true)');
  await h.page.click('#sentence');
  await h.waitFor('__voices.V.cur?.backend === "local"',10000);
  await h.page.click('#urgent');
  await h.waitFor('__voices.V.cur?.pri === 3',10000);
  await h.expect('__voices.V.log.some(e=>e.actor==="Microsoft Mark"&&e.state==="interrupted")','urgent wave-off stops the currently speaking controller');
  await h.eval('(__voices.V.stop("fixture"),__voices.V.vol=0,__voices.V.speak({who:"mute",role:"command",text:"Command, this is Tower. Radio check. Over.",net:"uhf",cd:0,key:"mute"}),true)');
  await h.waitFor('__voices.V.cur?.key === "mute"',10000);
  await h.expect('!__voices.V.cur.source && !__voices.V.cur.bed','zero volume creates neither a speech source nor radio noise');
  await h.eval('(__voices.V.stop("fixture"),__voices.V.vol=6,true)');
  await h.expect('__voices.overlaps() === 0','complete-line and fallback playback remain serialized');
  await h.expect('__voices.V.speechInfo().voices.length===3','all three installed actors are exposed to the listening room');
}};
