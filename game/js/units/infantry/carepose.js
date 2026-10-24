// NGC-1980 ngc/infdepth: where a soldier figure's hands go when they are not on his rifle - for soldiermodel.js
// poseSkeleton's pose.hands (figure frame: feet at the origin, facing -z, metres) and pose.sling (rifle on the back).
//   careHands('drag', t)   crouched, both hands low in front on the casualty's drag strap / shoulder straps (FM 21-11:
//                          the casualty's head and shoulders lifted off the ground, the soldier backing up)
//   careHands('carry', t)  fireman's carry: the right hand round the casualty's leg and wrist in front of the chest, the
//                          left steadying his back over the left shoulder
//   careHands('treat', t)  kneeling by a man on the ground: both hands on the wound, working (a slow rhythm)
//   throwHands(phase, p, under)  the M67 / M18 drill seen from outside (the same phases as the viewmodel's throwvm.js)
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ss = t => t * t * (3 - 2 * t);
export function careHands(kind, t = 0) {
  if (kind === 'drag') return { L: [-0.2, 0.42, -0.55], R: [0.2, 0.42, -0.55] };
  if (kind === 'carry') return { L: [-0.24, 1.5, 0.08], R: [0.12, 1.28, -0.22] };
  if (kind === 'treat') { const w = Math.sin(t * 2.2) * 0.05; return { L: [-0.1 + w, 0.18, -0.58], R: [0.12 - w, 0.2 + Math.abs(w), -0.56] }; }
  return null;
}
const TH = {
  side: [0.2, 1.0, -0.05], pouch: [0.16, 1.02, -0.14], chest: [0.06, 1.3, -0.32], ring: [0.0, 1.32, -0.33], pulled: [-0.3, 1.25, -0.36],
  cocked: [0.26, 1.72, 0.18], point: [-0.16, 1.45, -0.55], over: [0.2, 1.92, -0.15], out: [0.08, 1.45, -0.66], follow: [-0.12, 1.05, -0.38],
  lowBack: [0.22, 0.85, 0.2], lowOut: [0.06, 1.15, -0.6],
};
export function throwHands(phase, p = 0, under = false) {
  const P = ss(Math.min(1, Math.max(0, p)));
  switch (phase) {
    case 'draw': return { R: P < 0.5 ? lerp3(TH.side, TH.pouch, P * 2) : lerp3(TH.pouch, TH.chest, P * 2 - 1), L: TH.chest.map((v, i) => v + [-0.12, -0.02, 0.02][i]) };
    case 'pin': return { R: TH.chest, L: P < 0.55 ? lerp3([-0.12, 1.28, -0.3], TH.ring, P / 0.55) : lerp3(TH.ring, TH.pulled, (P - 0.55) / 0.45) };
    case 'ready': case 'cook': return { R: lerp3(TH.chest, under ? TH.lowBack : TH.cocked, Math.min(1, p * 3)), L: lerp3(TH.pulled, TH.point, Math.min(1, p * 2)) };
    case 'throw':
      if (under) return { R: lerp3(TH.lowBack, TH.lowOut, P), L: TH.point };
      return { R: P < 0.45 ? lerp3(TH.cocked, TH.over, P / 0.45) : P < 0.7 ? lerp3(TH.over, TH.out, (P - 0.45) / 0.25) : lerp3(TH.out, TH.follow, (P - 0.7) / 0.3), L: lerp3(TH.point, [-0.2, 1.1, -0.2], P) };
    default: return null;
  }
}
