// The control zone's half side (m): |x|, |z| <= BOUND is where the war is (world.js inZone). The one constant every
// zone-sized thing derives from (ngc/look-terrain: 1280 -> 2560, a 5.12 km square). Its own module so world.js and
// world/terrain.js (which import each other) both read it at load without a cycle.
export const BOUND = 2560;
