// Runs the existing Marine integration assertions with two relevant screenshots. The treatment timer advances
// through actual production simulation steps so a busy software renderer does not turn 40 game seconds into ten
// wall-time minutes. No health/action result is assigned by the fixture.
import marinePolish from './marinepolish.mjs';
import {fileURLToPath} from 'node:url';
export default {name:'marinepolishfocused',query:'?debug&auto&kb&peace&res=0.35',fixtureFiles:[fileURLToPath(new URL('./marinepolish.mjs',import.meta.url))],async run(h){
  const keep=new Set(['ladder-first-person','swim-first-person']);
  await marinePolish({...h,
    expect: async(expr,label)=>{
      if(expr.startsWith('__G.foot.W.ladder &&'))await h.waitFor('__G.marine.BV.k > 0.9',20000);
      return h.expect(expr,label);
    },
    goto: url=>{const target=new URL(url.replace('res=0.45','res=0.35'),h.page.url()).href;return target===h.page.url()?Promise.resolve():h.goto(target);},
    shot: name=>keep.has(name)?h.shot(name):h.logmsg('Focused capture omits redundant '+name+' screenshot; existing state assertions still run.'),
    waitFor: async(expr,timeout)=>{
      if(expr==='!__G.marine.M.action'){
        await h.eval(`(()=>{const duration=__G.marine.M.action?.T||0,limit=Math.min(180,Math.max(45,duration+1))*60;let frames=0;while(__G.marine.M.action&&frames<limit){__G.foot.update(1/60,{keyboardOnly:true});frames++;}return {actionDuration:duration,simulationSeconds:frames/60,complete:!__G.marine.M.action};})()`);
      }
      if(expr==='(__G.marine.stats.booms || 0) > __bo'){
        await h.eval(`(()=>{let frames=0;while((__G.marine.stats.booms||0)<=__bo&&frames<6*60){__G.foot.update(1/60,{keyboardOnly:true});frames++;}return {simulationSeconds:frames/60,exploded:(__G.marine.stats.booms||0)>__bo};})()`);
      }
      return h.waitFor(expr,timeout);
    }
  });
}};
