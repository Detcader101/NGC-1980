// RENDERKIT ui (ngc/rk-ui): switches NGC-1980's DOM UI to the Continuum design system when RK.on('ui').
// The look itself is CSS (design.css + ngc-ui.css, both scoped, both linked from index.html). This module:
//   * sets html.ngc-rkui (index.html's inline script already did for the first paint; this is the authority),
//   * puts .rk-ui on the menu roots so design.css's type, focus and box-sizing apply inside them,
//   * hands the HUD code its colours (UIC): the classic cyan set with ?rk=0, the field palette with the UI on.
// No game logic, no element ids changed: tools/scenes/* select by the same ids and data- hooks either way.
import { RK } from './adopt.js';

export const RKUI = RK.on('ui');

// HUD colours that main.js writes inline (war line, feed, cautions, world tags). Classic values are the originals.
export const UIC = RKUI ? {
  ours: '#8ec9dc', enemy: '#f2a399', free: '#d6d4c4', unknown: '#a7b4b0', muted: '#a7b4b0', ink: '#e7e9df',
  ok: '#a6cfbb', caution: '#e8bc7c', critical: '#f2a399', alarm: '#f2a399',
  good: '#a6cfbb', bad: '#f2a399', info: '#e7e9df',
} : {
  ours: '#4cf', enemy: '#f54', free: '#ddd', unknown: '#aaa', muted: '#9ab', ink: '#cde',
  ok: '#9ff', caution: '#fb6', critical: '#f54', alarm: '#f86',
  good: '#7f9', bad: '#f86', info: '#cde',
};

const ROOTS = ['title', 'menu', 'cmdBoard', 'techBoard'];
export function applyUI() {
  const de = document.documentElement;
  de.classList.toggle('ngc-rkui', RKUI);
  for (const id of ROOTS) document.getElementById(id)?.classList.toggle('rk-ui', RKUI);
  // (the two-bar mark over the title is static markup in index.html, hidden in the classic look)
}
