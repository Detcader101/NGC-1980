// Simulate the server's real missing-bank descriptor without moving the user's local generated assets.
// voicebankbench separately checks actual absent/partial files against the shared server resolver.
import {NO_VOICE_BANK} from '../voice-bank.mjs';
export default {
  name:'voicebankmissing',
  async run(h){
    let descriptors=0,pcmRequests=0;
    await h.page.setRequestInterception(true);
    h.page.on('request',req=>{
      const pathname=new URL(req.url()).pathname;
      if(pathname==='/audio/voices/index.json'){descriptors++;return req.respond({status:200,contentType:'application/json',body:JSON.stringify(NO_VOICE_BANK)});}
      if(pathname.endsWith('.logpcm.gz'))pcmRequests++;
      return req.continue();
    });
    await h.goto('?debug&auto&kb&peace&res=.45&voices=generated');
    await h.waitFor('window.__G && window.__voices && __G.G.state==="play"',30000);
    await h.eval(`(()=>{
      const v=__voices.V;v.stop('fixture');v.recent.clear();
      // The live game's normal subtitle feed remains active; retain log and DOM text as evidence.
      v.speak({who:'missing-bank-test',role:'command',text:'Albatross, radio check. Out.',net:'fm',key:'missing-bank',cd:0});
      return v.backend();
    })()`);
    await h.waitFor('__voices.log.some(e=>e.who==="missing-bank-test"&&e.start!==null)',10000);
    await h.expect('__voices.backend==="silent" && __voices.log.some(e=>e.who==="missing-bank-test"&&e.backend==="silent")','Absent local bank starts text call-outs through the normal voice queue');
    await h.expect('__voices.V.log.filter(e=>e.who==="missing-bank-test").every(e=>!e.source&&!e.bed&&!e.out)','Missing bank creates no speech source, radio bed or voice gain');
    await h.expect('document.body.innerText.toUpperCase().includes("ALBATROSS, RADIO CHECK. OUT.")','Normal HUD subtitle feed remains visible without speech data');
    await h.waitFor('__voices.log.some(e=>e.who==="missing-bank-test"&&e.end!==null)',10000);
    await h.expect('__voices.log.some(e=>e.who==="missing-bank-test"&&e.state==="done")','Text-only call completes instead of waiting indefinitely for a bank');
    await h.expect(descriptors>0&&pcmRequests===0,'Missing-bank descriptor avoids requests for absent PCM');
    await h.shot('text-only-radio');
    await h.notblank();
  }
};
