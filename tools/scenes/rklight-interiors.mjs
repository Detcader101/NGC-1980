// interiors.mjs with a RenderKit setting appended to every goto (RK=all | surface,world,fx,post,ui | 0)
import run from './interiors.mjs';
const RK = process.env.RK || 'all';
export default { name: 'rklight-interiors-' + RK.replace(/[^\w]+/g, '_'), run: async h => { const g = h.goto.bind(h); h.goto = q => g(q + '&rk=' + RK); await run(h); } };
