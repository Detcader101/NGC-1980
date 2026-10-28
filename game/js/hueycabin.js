// hueycabin.js - the UH-1H cabin's troop seating, one table shared by the model (hueyhifi.js builds the seats from it),
// the player's ride seats (interiors/seats.js) and the AI troop lift (units/air/airlift/airlift.js).
// Source: TM 55-1520-210-23-1 (1987) para 2-253/2-254 and figure 2-49 "Seating arrangement" (archive.org
// micro_IA41152639_0634, public domain): eleven passengers -
//   five across the cabin immediately forward of the transmission support structure, facing forward (two two-man seats
//   with backs and a one-man seat without a back between them);
//   two two-man seats without backs aft of those, parallel to the centre line in the wells beside the transmission,
//   facing outboard (the gunner and the crew chief take the aft place of each, beside the door guns);
//   two single folding seats with backs just aft of the crew seats.
// Model frame: x right, y up, -z forward, metres; cabin floor y -1.05. Stations from the TM figure 2-3 station diagram
// (FS = z / 0.0254 + 137.7: nose FS -7.60 at z -3.69, main rotor FS 133.5 at z -0.12, forward cant bulkhead FS 127.5
// at z -0.26, aft cant bulkhead FS 153.4 at z 0.40, aft cabin bulkhead FS 166 at z 0.72, aft fuselage end FS 238 at 2.55).
export const FS = z => z / 0.0254 + 137.7, zFS = fs => (fs - 137.7) * 0.0254;
export const CABIN = Object.freeze({
  FLOOR: -1.05, SEAT_Y: -0.6,
  REAR: -0.26,                      // forward cant bulkhead FS 127.5: the transmission support's face, the five-man bench's back
  AFT: 0.72,                        // aft cabin bulkhead FS 166
  WELL: [-0.26, 0.72], WELL_X: 0.62, // the wells either side of the transmission support, open to the doorway's aft part
  GUN: [-1.1, -0.18, 0.56],         // M60D pintle (left; mirrored right) at the aft end of the doorway, ahead of the open door's edge
  CREW: [-0.8, 0.36],               // gunner (left) / crew chief (right): x, z on the aft place of each well seat, beside the gun
});
// kind: bench (facing forward), well (facing outboard), fold (facing aft), door (on the floor in the doorway, legs over
// the sill, as troops rode a slick); hips = the seat point (x, z), yaw 0 = facing forward, +PI/2 = facing left
export const TROOP_SEATS = [
  ...[-0.84, -0.42, 0, 0.42, 0.84].map((x, i) => ({ id: 'bench' + i, label: `TROOP SEAT ${i + 1} (AFT BENCH)`, kind: 'bench', x, z: CABIN.REAR - 0.22, yaw: 0 })),
  { id: 'wellL', label: 'LEFT WELL SEAT', kind: 'well', x: -0.8, z: -0.06, yaw: Math.PI / 2 },
  { id: 'wellR', label: 'RIGHT WELL SEAT', kind: 'well', x: 0.8, z: -0.06, yaw: -Math.PI / 2 },
  { id: 'foldL', label: 'LEFT FOLDING SEAT (BEHIND THE CREW)', kind: 'fold', x: -0.55, z: -1.36, yaw: Math.PI },
  { id: 'foldR', label: 'RIGHT FOLDING SEAT (BEHIND THE CREW)', kind: 'fold', x: 0.55, z: -1.36, yaw: Math.PI },
];
// the doorway places (an option, not seats): on the floor, legs over the sill
export const DOOR_PLACES = [
  { id: 'doorL', label: 'LEFT DOOR', kind: 'door', x: -0.98, z: -0.9, yaw: Math.PI / 2 },
  { id: 'doorR', label: 'RIGHT DOOR', kind: 'door', x: 0.98, z: -0.9, yaw: -Math.PI / 2 },
];
export const TROOP_CAPACITY = TROOP_SEATS.length;   // 9 with the crew chief and the gunner aboard (11 seats)
