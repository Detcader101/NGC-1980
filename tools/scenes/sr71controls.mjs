// SR-71 controls vs animations (ngc/sr71-fix; Jay Jay: "the HOTAS controls work but the in-game animations are flipped"):
// on the dev flight page, each input in turn through the same play code the game uses (P.override = the HOTAS / keys'
// result), then the cockpit stick, throttles and pedals and the outside surfaces are read back:
// stick aft (pitch +) = grip toward the pilot and both elevons' trailing edges UP (nose up);
// stick right (roll +) = grip right, LEFT elevon trailing edge DOWN / right one UP (roll right);
// right pedal (yaw +) = right pedal forward, the fins' trailing edges to the RIGHT (nose right);
// throttles forward = the lever grips forward (-z), the engines' thrust up. Also the mouse in the cockpit turns the head.
//   CHROME_PATH=... node snap.mjs scenes/sr71controls.mjs
export default async function (h) {
  await h.goto('dev/sr71.html?ui=0&start=air&view=cockpit&res=0.5');
  await h.waitFor('window.__S && __S.P', 20000); await h.wait(1500);
  await h.eval(`(() => { const T = __S, P = T.P, THREE = T.THREE, ck = P.cockpit.group, mdl = P.model.group;
    const get = n => { let o = null; ck.traverse(x => { if (!o && x.name === n) o = x; }); return o; };
    const sg = get('stick'), tq = get('throttles'), peds = []; ck.traverse(x => { if (x.name === 'rudderPedal') peds.push(x); });
    const fins = []; mdl.traverse(x => { if (x.name === 'finPivot') fins.push(x); }); const elOut = []; mdl.traverse(x => { if (x.name === 'elevonOut') elOut.push(x); });
    // a world point on the trailing edge, in the aircraft frame
    const tip = (o, v) => { o.updateWorldMatrix(true, false); const p = new THREE.Vector3(...v).applyMatrix4(o.matrixWorld); mdl.worldToLocal(p); return p; };
    window.__rd = () => ({ stickX: +sg.rotation.x.toFixed(3), stickZ: +sg.rotation.z.toFixed(3), lever: +tq.children[1].rotation.x.toFixed(3), pedL: +peds[0].position.z.toFixed(3), pedR: +peds[1].position.z.toFixed(3),
      finTE: fins.map(f => +tip(f.children[0], [0, 1.2, 2.2]).x.toFixed(3)), elevTE_L: +tip(elOut[0], [0, 0, 1.0]).y.toFixed(3), elevTE_R: +tip(elOut[1], [0, 0, 1.0]).y.toFixed(3),
      surf: { pitch: +P.A.surf.pitch.toFixed(3), roll: +P.A.surf.roll.toFixed(3), rud: +P.A.surf.rud.toFixed(3) } });
    return 1; })()`);
  const step = async (name, ov) => { await h.eval(`(__S.P.A.ap.on = false, __S.P.override = c => { Object.assign(c, ${ov}); }, 1)`); await h.wait(2500); return h.eval(`window.__${name} = __rd()`); };
  await step('neutral', '{ pitch: 0, roll: 0, yaw: 0 }');
  await step('aft', '{ pitch: 1, roll: 0, yaw: 0 }');
  await h.expect('__aft.stickX > __neutral.stickX + 0.1 && __aft.surf.pitch > 0.05 && __aft.elevTE_L > __neutral.elevTE_L && __aft.elevTE_R > __neutral.elevTE_R');
  await step('right', '{ pitch: 0, roll: 1, yaw: 0 }');
  await h.expect('__right.stickZ < __neutral.stickZ - 0.1 && __right.surf.roll > 0.03 && __right.elevTE_L < __neutral.elevTE_L && __right.elevTE_R > __neutral.elevTE_R');
  await step('pedal', '{ pitch: 0, roll: 0, yaw: 1 }');
  await h.expect('__pedal.pedR < __pedal.pedL && __pedal.surf.rud > 0.02 && __pedal.finTE.every((x, i) => x > __neutral.finTE[i])');
  await step('thrIdle', '{ pitch: 0, roll: 0, yaw: 0, throttle: [0.1, 0.1] }');
  await step('thrMax', '{ pitch: 0, roll: 0, yaw: 0, throttle: [1, 1] }');
  await h.expect('__thrMax.lever < __thrIdle.lever - 0.3');
  await h.eval('({ neutral: __neutral, aft: __aft, right: __right, pedal: __pedal, thrIdle: __thrIdle.lever, thrMax: __thrMax.lever })');
  await h.eval('(__S.P.override = c => { c.pitch = 0.6; c.roll = 0.5; c.yaw = 0.6; }, 1)'); await h.wait(1500);
  await h.eval('(__S.head.yaw = -0.6, __S.head.pitch = -0.45, 1)'); await h.wait(800); await h.shot('cockpit-stick-aft-right-pedal');
}
