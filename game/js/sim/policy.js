// SIM MODE: research under a doctrine. war.js asks W.researchPolicy[side](T, econ, situation, doctrine) in its 2 s
// commander tick (TECH TREE hook); this installs a doctrine's: techtree.js aiPickResearch walking the doctrine's order
// (DOCTRINES[side][d.research.order]) with a materiel reserve set by how much the doctrine spends on research
// (research.spend: 0 = never, 1 = the default policy's reserve, 2 = researches with little kept back).
// A tree that starts 'all' (the unlocked sandbox) has nothing to research: no policy.
import { aiPickResearch, aiResearchPlan } from '../techtree.js';

export function installResearch(W, side, D, log = null) {
  const T = W.tech && W.tech[side]; if (!T) return;
  W.doctrine[side] = D.research.order;
  const spend = D.research.spend ?? 1;
  if (T.mode === 'all' || spend <= 0) { W.researchPolicy[side] = null; return; }
  W.researchPolicy[side] = (T, econ, sit, doctrine) => {
    const id = aiPickResearch(T, econ, { ...sit, reserve: Math.round(25 / spend) + (D.reserve || 0) * 0.5 }, doctrine);
    if (id && log) log(side, `RESEARCH ${T.node(id).name}`, { research: id });
    return id;
  };
  W.researchPolicy[side].plan = (T, sit, doctrine) => aiResearchPlan(T,
    { ...sit, reserve: Math.round(25 / spend) + (D.reserve || 0) * 0.5 }, doctrine);
}
