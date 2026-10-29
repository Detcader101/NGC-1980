# ngc/xr-fix — xr.mjs 17/19 after the shader-library merges

## Symptom
`tools/scenes/xr.mjs` passed 19/19 at 36eb21b and on each branch alone; on `ngc/shader-library` after the merges
(213a5df, d65e8e0, 6d327c9, ae0cacc, cde5150) two expects failed:
- 'sky dome follows the rendered eye in world coordinates'
- 'near terrain window follows the world rig rather than tracking origin'

## What was really wrong (in-page probe, no bisect needed)
- The sky dome and `terrainUni.uNear` were right: hooking `sky.onBeforeRender` showed it running once per eye with the
  correct world eye position (about -451.7, 10, 611.4, on the carrier), and uNear matched it snapped to 2.5 m.
- But the XR eye cameras (`renderer.xr.getCamera().cameras[i].matrixWorld`) read back at the **local** head pose
  (±0.0315, 0, 0) instead of world. Only one `renderer.render` per frame ran, with the parented rig camera, so no stray
  render was updating them.
- Cause: `game/js/units/naval/deckcrew.js:217` (look-people commit b70d756, deck crew near/far instanced levels,
  merged in ae0cacc; the deck crew draws in the xr.mjs scene because the seat is on the carrier):
  `LN.P.onBeforeRender = LF.P.onBeforeRender = (rr, sc, camera) => { camera.getWorldPosition(cam); ... }`.
  `Object3D.getWorldPosition` calls `updateWorldMatrix(true, false)`. Three's WebXR eye cameras have no parent, so
  this rewrites their `matrixWorld` (and, through `Camera.updateWorldMatrix`, `matrixWorldInverse`) to the local
  pose, in the middle of the eye's render pass.
- Effect in a real headset, beyond the test: draws after the deck crew in that eye pass that re-upload the view matrix
  (program switch) could use a view at the tracking origin instead of the rig. The deck crew LOD
  distance was also computed from the wrong position. Desktop was unaffected (zCam has a parent and a correct local
  pose).

## Fix
`deckcrew.js:217`: read the eye position with `cam.setFromMatrixPosition(camera.matrixWorld)`, which does not touch
the camera. Rule for render-time hooks (`onBeforeRender`, `scene.onBeforeRender`): never call
`getWorldPosition/Quaternion/Direction` or `updateMatrixWorld` on the camera argument — in XR it is a parentless eye
camera whose `matrixWorld` three has already set. The other `getWorldPosition` calls on cameras (lod.js, merge.js,
light.js `follow`) take `zCam` from the frame loop, which is in the scene graph, so they are safe.

Not changed (noted): `units/naval/sealife.js` `scene.onBeforeRender` reads `camera.position`, which for an XR eye is
the local pose — the underwater test there is wrong in VR. Pre-existing, outside this regression.

## Results
- xr.mjs 19/19 (was 17/19).
- check.mjs syntax 556/556; check.mjs types 608 (baseline 608); no conflict markers.
- xrgameplay.mjs, smoke.json: see below.
