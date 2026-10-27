// Shared, game-tuned underwater sight distances in metres. Sea state is 0..7 (not the
// fish simulation's normalized 0..1 value); depth is below the live surface at the camera.
// Invalid inputs use the ordinary sea-state-4 / surface defaults. Negative depth is surface
// depth, extreme depth keeps a 34 m gameplay floor, and callers may reuse `out` each frame.
export function underwaterVisibility(seaState = 4, depth = 0, out = {}) {
  const sea = Number.isFinite(seaState) ? Math.min(7, Math.max(0, seaState)) : 4;
  const below = Number.isFinite(depth) ? Math.max(0, depth) : 0;
  out.near = 4;
  out.far = Math.max(34, 72 - 3 * sea - 0.45 * below);
  // Bodies are culled only after the fog has hidden them, including a small movement margin.
  out.bodyRange = out.far + 12;
  return out;
}
