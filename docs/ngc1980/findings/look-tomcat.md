# look-tomcat: the F-14A rebuilt from the drawings (branch ngc/look-tomcat, off ngc/shader-library)

User: "can we focus on making the model actually authentic? and not just some look alike?", "use those blueprints to
a T", and earlier "the tomcat jet seems a bit glitchy". Process: the milsim-blueprint skill (trace, loft, fit, photo
side-by-side, configuration table).

## 1. Glitch first (reproduced before changing anything)

Before shots: `tools/runs/2026-10-28_20-05-47-tlook-before/` (scene `tools/scenes/tomcatlook.mjs`: deck orbit, gear,
both cockpits, the shot, climb-out, 1200 m, 3000 m swept). Legacy model kept for comparison: `dev/tomcat.html?legacy=1`.

| # | Finding | Evidence | Cause | Action |
|---|---|---|---|---|
| G1 | A dark 19.5 m SQUARE on the ALBATROSS deck under the parked / launching Tomcat, on top of its real shadow | tlook-before `04-deck-above-30m.png` (square edges round the jet) | `tomcatplay.js` still drew its flat `MeshBasicMaterial` blob "shadow" plane (opacity 0.35) although RenderKit's sun shadows now draw the real one | the blob only when RenderKit `light` is off (`blob = !RK.on('light')`); after: tlook-after-deck `04` has only the real shadow. (The Hornet's `jetplay.js` has the same blob: not touched here, reported.) |
| G2 | Wing sweep 20 -> 68: the outer panels' roots slid flat over the deck / glove, flickering | `before-after-sw68top.png` (left), dev `?legacy=1&s={"sweep":45}` | old wing slab at y 0.08 inside a deck slab at y 0.08 +-0.11: faces ~1 cm apart (z-fighting), the root TE corner swept 2.4 m inboard across the deck | rebuilt: the panel root (t 0.33 m) now swings inside the glove (t 0.42-0.50 m) and the fuselage; no coplanar faces |
| G3 | Shimmer along the nacelles at range | code: `nacelle` cylZ(0.68) and `nacelleBelly` cylZ(0.685) offset 5 cm, scaled 0.98 | two coincident shells | one nacelle loft with material groups (`tomcatgeo.nacelleGeo`) |
| G4 | Intakes hollow from the side, a lip hoop floating in front | `before-after-intake.png` | the raked ExtrudeGeometry's side walls collapsed by the vertex edit; the lip was a separate tube | closed raked intake loft (the drawn rake), dark duct and compressor face inside |
| G5 | Retracted main gear (new model, caught in the fit masks) poking through the glove; strut-mounted doors swinging up | fit mask side, front | stow rotation aimed up; doors on the strut | stow direction down-forward into the nacelle bay; doors on the airframe, shown only with the gear down |
| -- | Flight model / camera | chase and cockpit shots 13-19 normal | not involved | none (no FM numbers changed) |

## 2. References (docs/ngc1980/reference/f14a/SOURCES.md)

All public domain (NASA NTRS "GOV_PUBLIC_USE_PERMITTED"; U.S. Navy photos):
- NASA TP-2769 (1987) and TM-83250 (1982), Langley: the 1/12 F-14 model three-view (side, top, bottom) and the
  dimensioned planforms of the wing, glove vane, stabilator, ventral fin, hook and fairing, vertical tails, TF30 nozzle.
- NASA CR-163098 (1980), Northrop for Dryden: 1/72 three-view with the FRONT view (widths).
- Photos: F-14A BuNo 160382 VF-84 AJ 206 escorting a Tu-95, Sept 1980 (USN 1179034); VF-84 intercepting an Il-38,
  10 Mar 1980 (colour); VF-142 on the catapult, USS Eisenhower, 6 Jul 1980.
- Third-source cross-check: the low-resolution public-domain Commons three-view (`File:Grumman_F-14_Tomcat.png`).
- NATOPS: NAVAIR 01-F14A-1 preliminary flight manual, 1 June 1972 (archive.org; declassified, figures marked (U)):
  fig. 1-1 dimensions, fig. 1-3 / 1-4 pilot and RIO panels. The 1977-80 01-F14AAA-1 editions and the -2 maintenance
  manuals (access-panel diagrams) were not found in public scans.

## 3. Frame and dimension table (model metres; converted once in `tomcatgeo.js` G)

z = FS_full - 11.152 (FS 92.933 cm model = moment reference = sim CG); y = WL_full - 4.246 (static ground y -2.37;
the fin tip 4.88 m above it); x = BL. Model cm x 12 = full size (span 162.885 cm = 64 ft 1.5 in; pivot BL 22.648 cm =
107.0 in exactly).

| Dimension | Value | Source |
|---|---|---|
| Length (radome tip to fuel-dump end) | 18.82 m | TP-2769 fig 2a 156.845 cm (CR-163098: 26.19 cm x 72 = 18.86); Jane's 62 ft 8 in (19.10 m) includes the pitot - drawings rule, both recorded |
| Span 20 / 68 deg | 19.546 / 11.643 m | TP-2769 162.885 / 97.028 cm |
| Wing pivot | BL 2.718, FS 10.953 m (z -0.199), chord plane y -0.19 | TM-83250 fig 3a; plane from the TP side view (wing edge-on) |
| Reference wing | LE 20 deg, root 4.245 m at BL 0 (FS 9.234 m), tip chord 1.124 m at BL 9.773, TE kink BL 2.596, glove TE 13.25 deg | TM-83250 fig 3a |
| Glove vane | pivot FS 6.680 / BL 1.740, 2.45 m long | fig 3b |
| Vertical tails | root LE FS 14.931, root chord 3.886, tip chord 1.117, height 2.591, tip TE FS 18.817, tip WL 6.756 (y 2.51), cant 5 deg, NACA 65A004.5 | fig 3f; root BL 1.397 (+0.06 to the CR front view's spacing, see 6) |
| Stabilators | root BL 2.286, root LE FS 14.642, root chord 3.775, span 2.699 (semi 4.985), pivot axis 1.978 aft of the root LE, swept 9.49 deg, anhedral 3.5 deg, WL 3.581 | fig 3c |
| Ventral fins | FS 12.98-16.47, depth 0.735, WL 2.892 | fig 3d |
| Hook | pivot FS 15.227 / WL 3.505, 3.444 m, stowed 8.87 deg tip-up | fig 3e |
| TF30 nozzle | from FS 16.980, 1.295 m long, shroud 1.282 m dia, exit 0.646-0.680 (cruise) | TP-2769 fig 4c |
| Engine centre lines | BL 1.626 | fig 2a 13.547 cm |
| Intake | top lip FS 5.969 m (z -5.18); side edge raked back to the lower lip at z -2.57 (y -1.10 to -1.40) | TP side view traced |
| Height | 4.88 m | Jane's and NATOPS fig 1-1: 16 ft 0 in (sets the ground under the fin tip) |
| NATOPS fig 1-1 cross-check | length 61 ft 11.9 in = 18.89 m (drawings 18.82: 0.4%); spans 64 ft 1.5 in / 38 ft 1.9 in (as TP); oversweep 32 ft 8.5 in = 9.97 m; stabilator 33 ft 3.5 in = 10.15 m (TM-83250 label 9.97: TM kept, 1.8%) | NATOPS 1972 |
| Fin tip spacing | labels: NATOPS 10 ft 8 in (3.25 m), TM BL 11.644 at the root (tips 3.25); drawn: NATOPS fig 1-1 3.48 m, CR-163098 3.44 m -> model 3.46 m (tips x +-1.73), cant 5 deg (TM fig 3f) | skill rule: trust the drawing, record both |
| Wheelbase / track | 7.02 / 5.0 m | Jane's (the sim's GEAR points, unchanged) |

## 4. Shape: trace, loft, fit

- Trace: `tools/blueprint/trace3view.mjs` (the skill's, plus `top.half` and `draw` seals) with
  `tools/blueprint/f14a/side-top.config.json` and `front.config.json`; merged by `merge.mjs` into
  `game/js/units/air/f14trace.json/.js`. Masked: label leaders, the tunnel model's under-nose fixtures, the vane.
- Loft (`tomcatgeo.js`, `loftkit.js` = the skill's loft.mjs): fuselage 150 x 48 superellipse stations with analytic
  normals and arc-length UVs, canopy loft (glass from the windscreen bow FS... z -7.62 to -4.05), nacelles with the
  drawn rake, gloves / deck / beaver tail / wings / tails / ventrals as NACA-section airfoil slabs on the drawn
  planforms; wing slats / box / flaps as chordwise strips (no coincident faces).
- Fit (`node tools/blueprint/f14a/fitall.mjs`, masks from `dev/tomcat.html?ref=...&mask=1`):

| View | IoU | max gap | note |
|---|---|---|---|
| side | **0.988** | 0.19 m (1.0%) PASS | |
| top (68 deg) | **0.983** | 0.32 m (1.7%) | residual at the 68 deg wingtip: the drawing's tip is ~0.3 m forward of a rigid rotation of its own fig 3a planform about the labelled pivot (the model follows the labels) |
| front | **0.976** | 0.10 m (0.5%) PASS | by region: canopy **0.966**, nacelles+tunnel **0.979**, wing plane **0.975** (CR centre line measured at px 1529.2) |

  Front canopy: CR-163098 puts the canopy top 0.13 m lower above the wing plane than TP-2769 (0.92); the Commons
  three-view (third source, +-0.08 m at its resolution) gives 0.86, so TP stays the master for heights and the CR
  canopy rows are registered to it (merge.mjs); CR gives the widths. The remaining canopy residual (0.07-0.08 m at the
  sill and near the top) is the CR drawing's flatter bubble.
- Overlays: `evidence/look-tomcat/ref_side.png`, `ref_top.png`, `ref_front.png`; numbers `fit.json`.
- Photo side-by-side: `evidence/look-tomcat/proportions.png` (BuNo 160382, Sept 1980 vs the render, left side). Canopy
  length / overall 0.29 (photo) vs 0.31; fin height / length 0.127 vs 0.134 (within 10%). The photo's wings are at
  ~35-45 deg and the perspective is slightly from below.
- Markings: checked from outside on both sides and below: skull, AJ, modex, NAVY, star read correctly (not mirrored).

## 5. One real configuration: F-14A-95-GR BuNo 160382, VF-84 "Jolly Rogers", CVW-8, USS Nimitz, September 1980

What it had in 1980 (INFERRED items marked):
- Overall gloss light gull grey FS 16440 (the Navy dropped the white undersides from 1977; INFERRED for this airframe
  from the 1980 photos' even tone). Radome painted grey; black anti-glare panel ahead of the windscreen.
- VF-84: black fins and rudders, white skull and crossbones, yellow fin caps (colour photo, Mar 1980), AJ on the fin,
  modex 2xx on the nose (206 on 160382; the player's jet is the CAG's 200, the AI 201-212), NAVY large on the nacelle
  under the stabilator, national insignia on the intake side, on the upper left and lower right wing, NAVY under the
  left wing.
- Glove vanes fitted and working (deactivated fleet-wide only in the mid-1980s).
- No TCS (AXX-1) chin pod (fitted from 1983 on); a small chin fairing (ALQ-100 antenna) - INFERRED, the photos are
  too small to confirm.
- TF30-P-412A, cruise / AB nozzles (TP-2769 fig 4c); beaver tail with the fuel dump and speedbrakes.
- Stores: AIM-54A / AIM-7F / AIM-9 on the glove pylons (1B/8B, shoulder rails 1A/8A) and the four tunnel stations.

Configuration table (z = FS - 11.152; y = WL - 4.246; x = BL; metres). Status: done / partial / not done.

| Item | FS (m) | WL (m) | BL (m) | Source | Status |
|---|---|---|---|---|---|
| Radome / pitot | 0 - 1.85 | 3.33 | 0 | TP side | done (grey, joint by material) |
| Anti-glare panel | 1.85 - 2.75 | top | 0 | photos | done |
| Windscreen, bow | 2.75 - 3.53 | 4.30-5.00 | | TP side trace | done (glass with RK env reflection + fresnel) |
| Canopy (one piece, hinged aft) | 3.53 - 8.20 | to 5.17 | +-0.54 | TP side, CR front | done; opens about z -2.95 |
| Cockpit tubs, seats, crew | 3.5 - 7.0 | | | old interior moved by COCKPIT_OFFSET | partial (see 7) |
| M61A1 muzzle + vents (left) | 2.95 / 3.25 | 3.6-3.8 | -0.70 | photos | done |
| Refuelling probe door (right) | 3.55 | 3.9 | +0.70 | photos | done |
| AoA probes | 1.55 | 3.5 | +-0.47 | photos | done |
| Chin fairing (ALQ-100) | 2.55 | 2.9 | 0 | INFERRED | done |
| Intake lips (raked) | 5.97 top / 8.58 low | 3.98 / 2.85-3.15 | 0.87-1.61 | TP side + top | done |
| Inlet ramp (upper wall) | 6.0 - 7.2 | 3.9 | 1.24 | photos | partial (plate) |
| Inlet bleed doors (2 / side) | 9.99 - 10.77 | top | 0.75 - 1.33 | TP top 'Inlet bleed' | done |
| Glove + vane | 5.97 - 13.6 | 4.08 | 0.62 - 3.21 | TP top, fig 3b | done |
| Wing pivot | 10.953 | 4.06 | 2.718 | fig 3a | done (rotation centre) |
| Slats, flaps, spoilers (4) | on the panel | | 3.40 - 9.35 | fig 3a chord fractions | done (spoilers flush, shown when up) |
| Main gear, doors | 12.15 | | 2.05 / 2.5 | sim GEAR | done |
| Nose gear, launch bar, doors | 5.15 | | 0 | sim GEAR | done |
| UHF / TACAN blades | 9.95 / 8.15 | top / bottom | 0 | photos | done |
| Anti-collision beacons | 9.55 / 10.15 | top / bottom | 0 | photos | done |
| Formation lights | 3.15 / 12.35 | | sides | photos | done |
| Glove pylons, shoulder rails | 9.95 / 9.85 | 3.3 / 3.8 | 2.30 / 2.56 | photos | done |
| Phoenix pallets | 7.95 / 12.75 | tunnel | 0.62 | sim stations | done |
| Ventral fins | 12.98 - 16.47 | 2.89 | 1.41 | fig 3d | done |
| Vertical tails, rudders, ECM caps | 14.93 - 18.82 | to 6.76 | 1.46 | fig 3f | done |
| Stabilators | 14.64 - 19.0 | 3.58 | 2.29 - 4.99 | fig 3c | done (pivot on the drawn axis) |
| Beaver tail, speedbrakes, fuel dump | 16.4 - 18.9 | 3.9 | 0 | TP top 'interfairing' | done (brakes shown when open) |
| TF30 nozzles | 16.98 - 18.28 | 3.55 | 1.626 | fig 4c | done (exit radius from the sim) |
| Hook | 15.23 pivot | 3.51 | 0 | fig 3e | done |
| Panel lines, fasteners, access doors | all | | | NOT AVAILABLE (maintenance-manual panel diagrams not public) | not done: the generic RenderKit panel grid is switched off (a look-alike tell) rather than faked |
| Wing "fences" of the NASA tunnel model | 10.9 - 13.4 | | 0.92 / 2.07 | TP top | not modelled: no counterpart confirmed on the fleet F-14A |

Rows done: 27 of 30 (90%); the panel/fastener row needs the -2 manuals.

## 6. Deviations kept on purpose

- The sim's HOOK_TIP (0, -2.35, 8.0) is 0.88 m aft of the drawn hook's tip (7.12); the drawn hook (pivot, length) is
  modelled and swings down to the sim's tip height. Changing HOOK_TIP moves the AI's trap aim (FM-adjacent): left, reported.
- STATIONS 1A/8A (the AIM-9 shoulder rails) moved from inside the glove to the pylons' outer faces (geometry only).
- Fin spacing: the drawn 3.46 m between tips (NATOPS fig 1-1, CR-163098), not the labelled 10 ft 8 in (see the table).

## 7. Cockpit

Pilot's panel re-laid per NATOPS fig. 1-3 (the 1972 preliminary manual): LEFT instrument panel VSI (25), airspeed/Mach
(24), altimeter (22) and the wheels/flaps position indicator (14); LEFT KNEE panel the engine instruments (15-21: RPM,
TIT, fuel flow, nozzle, oil); RIGHT instrument panel wing sweep (40), accelerometer (42), standby attitude (43), clock
(45); RIGHT KNEE fuel quantity (48); centre VDI (33) over HSD (34); arresting hook handle on the right (51), gear handle
on the left (13). Before, the engine gauges sat on the right and the flight instruments were swapped side to side. Not
yet modelled from fig. 1-3: radar altimeter (23), BDHI (46), UHF remote (47), LOX and cabin altitude (49, 50), the
control-surface position indicator (12); master arm / weapon select sit on the right panel (fig. 1-3 has them on the
ACM panel, 32). The RIO's panel (fig. 1-4) keeps its earlier layout (open item). Evidence:
`evidence/look-tomcat/cockpit-pilot-natops-layout.png`. The interior (all interactive) is moved into the drawn airframe: the interior is offset by TCAT.COCKPIT_OFFSET
(0, -0.66, -1.42) so the eyes sit 0.30 m above the drawn canopy sill (pilot z -6.87, RIO -5.64); the windscreen,
canopy, bows and sills seen from inside are now the same drawn lofts as the exterior; the fuselage loft has the cockpit
opening cut out. Clean views from both seats: `tools/runs/*tlook-after*/08-10`. 

## 8. LODs and budgets

`ngc/perf-render` has no shared `renderkit/lod.js` or PERF-BUDGETS.md yet. The model switches itself
(`setLod(0|1|2)`, automatic from the fuselage's onBeforeRender by camera distance and FOV: < 70 m full, < 260 m medium,
beyond silhouette; geometry shared by every Tomcat through a module cache). Ready to adopt a shared LOD: one function.

| LOD | triangles (exterior, no stores) | meshes |
|---|---|---|
| 0 | 53,814 | 154 |
| 1 | 28,998 | 129 |
| 2 | 24,650 | 129 |
| cockpit (only in the cockpit view) | 12,966 | 332 |

LOD 1/2 thin the fuselage, canopy and nacelle lofts and hide ~25 small parts; the airfoil slabs are not yet reduced
(open item: the wing and tail slabs are ~60% of LOD 2).

## 9. Tests

(see the final section, updated at the end of the run)

## 10. Open items

- The -2 maintenance manuals (access-panel diagrams) for the panel / fastener rows; failing that, photo-derived panels
  from PD walkaround close-ups (not done in this pass).
- RIO panel per NATOPS fig. 1-4; the pilot's missing items listed in 7.
- LOD 2 airfoil reduction; adopt renderkit/lod.js when ngc/perf-render lands.
- HOOK_TIP vs the drawn hook (0.88 m).
- The Hornet's blob shadow square (jetplay.js) is the same G1 glitch.
