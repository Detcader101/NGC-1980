// Focused visual integration evidence. Keep the existing pose assertions, with selected grip/body views.
// No timing benchmark: other agents are rendering on this shared host.
import firstPerson from './firstpersonpolish.mjs';
import people from './people.mjs';
import {fileURLToPath} from 'node:url';
export default {
  name:'radiofiguremerge', query:'dev/infantry.html?debug&fixed&nosway&res=1&ui=0&seed=1980',
  fixtureFiles:['./firstpersonpolish.mjs','./people.mjs'].map(p=>fileURLToPath(new URL(p,import.meta.url))),
  async run(h) {
    const keep=new Set(['m16-player','m16-support','m16-trigger','m203-player','m60-support','m1911-support','law-support','m1911-aim','law-aim','ladder-hands','swim-hands',
      'stand','face','prone','seated','walk-0p3','transition-0p4']);
    const focused={...h,
      goto:url=>new URL(url,h.page.url()).href===h.page.url()?Promise.resolve():h.goto(url),
      benchmark:()=>h.logmsg('Timing sample omitted: this fixture qualifies integration and visual poses, not performance.'),
      shot:name=>keep.has(name)?h.shot(name):h.logmsg('Focused capture omits '+name+'; existing state checks still run.'),
    };
    await firstPerson(focused);
    await h.expect(`Object.values(__I.vm.arms).every(a=>a.hand.userData.shapes.grip.geometry.userData.handSurface==='LP/SDF'&&a.hand.children.filter(c=>c.isMesh&&c.visible).length===1)`,
      'One visible SDF hand per arm retains the fitted profile');
    await people(focused);
  }
};
