# F-14A references (ngc/look-tomcat)

All files here are US government works (NASA Technical Reports Server, copyright determination
`GOV_PUBLIC_USE_PERMITTED`, distribution PUBLIC) or public-domain U.S. Navy photographs. Pages were rendered from the
NTRS PDFs with pdf.js at 4-5x.

| File | Source (URL) | Licence | Author / agency | What it shows |
|---|---|---|---|---|
| `nasa-tp2769-fig2a-model-3view.png` | NASA TP-2769 (1987), Re & Berrier, "Effects of the installation and operation of jet-exhaust yaw vanes on the longitudinal and lateral-directional characteristics of the F-14 airplane", fig. 2(a), p. 14. https://ntrs.nasa.gov/citations/19880003073 | Public use permitted (NASA) | NASA Langley | 1/12-scale F-14 model: side view, top view (wings 68 deg, 20 deg dashed), bottom view; FS / WL / BL labels in model cm; span 162.885 (20 deg), 97.028 (68 deg), stabilator span 83.079, length 156.845 |
| `f14a-3view-trace.png` | the above, squared (y x 1.00378, so 74.36 px/m both ways) | as above | derived | the image traced by `tools/blueprint/f14a/side-top.config.json` |
| `nasa-tm83250-fig2a-model-3view.png` | NASA TM-83250 (1982), Re & Carlson, "Effects of installation of F101 DFE exhaust nozzles on the afterbody-nozzle characteristics of the F-14 airplane", fig. 2(a). https://ntrs.nasa.gov/citations/19820011307 | Public use permitted (NASA) | NASA Langley | the same 1/12 model with the F101 DFE nozzles (cross-check of the TP-2769 figure) |
| `nasa-tm83250-fig3ab-wing-glovevane.png` | TM-83250 fig. 3(a), 3(b) | as above | NASA Langley | reference wing planform at 20 deg: LE at BL 0 FS 76.949, root chord 35.373, pivot BL 22.648 / 14.322 aft of the LE, tip chord 9.364 at b/2 81.443, TE kink BL 21.635, glove TE 13.25 deg; glove vane: pivot FS 55.668 / BL 14.499, 20.421 long, deployed 22 deg |
| `nasa-tm83250-fig3cde-stab-ventral-hook.png` | TM-83250 fig. 3(c)-(e) | as above | NASA Langley | stabilator (root BL 19.051 FS 122.02, root chord 31.456, span 22.488, pivot axis 16.487 aft at 9.49 deg, anhedral 3.5 deg, WL 29.845, NACA 65A004.6 / 65A003.16), ventral fin (to FS 137.269, chord 28.448, depth 6.129, WL 24.100), tail hook and fairing (FS 126.893, WL 29.209, 28.701 long, stowed 8.87 deg) |
| `nasa-tm83250-fig3f-vertical-tails.png` | TM-83250 fig. 3(f) | as above | NASA Langley | vertical tails: root chord 32.387, tip chord 9.312, height 21.591, tip TE FS 156.808, tip WL 56.304, BL 11.644, cant 5 deg, NACA 65A004.5 |
| `nasa-tp2769-fig4c-tf30-cruise-nozzle.png` | TP-2769 fig. 4(c) | as above | NASA Langley | TF30 cruise nozzle: from FS 141.499, length 10.792, shroud dia 10.686, exit 5.385-5.664 |
| `nasa-cr163098-fig4-1-72-3view.png` | NASA CR-163098 (1980), Lorincz (Northrop) for NASA Dryden, "Flow visualization study of the F-14 fighter aircraft configuration", fig. 4. https://ntrs.nasa.gov/citations/19800024842 | Public use permitted (NASA) | Northrop / NASA Dryden | 1/72 F-14 model three-view with a FRONT view (span 27.14 cm, length 26.19, fin above the water line 4.09); used for the front-view widths |

Photos (public domain, U.S. Navy; Wikimedia Commons). Not committed (large); URLs only:

| Photo | URL | What it settles |
|---|---|---|
| F-14A-95-GR BuNo 160382, VF-84 AJ 206, escorting a Tu-95, North Atlantic, September 1980 (USN 1179034) | https://commons.wikimedia.org/wiki/File:Grumman_F-14A_Tomcat_of_VF-84_escorts_Soviet_Tupolev_Tu-95_over_the_North_Atlantic,_in_September_1980_(USN_1179034).jpg | THE configuration: VF-84 markings (black fin, white skull and crossbones, AJ), modex 206 on the nose, NAVY on the nacelle aft, insignia on the intake, AIM-7 / AIM-9 fit, glove vanes stowed; side-view proportions (proportions.png) |
| F-14A of VF-84 intercepting an Il-38, Arabian Sea, 10 March 1980 (PH3 Joseph Gallegos) | https://commons.wikimedia.org/wiki/File:F-14A_of_VF-84_intercepting_Il-38_over_the_Arabian_Sea_1980.JPEG | colour: black fins with yellow caps, overall light gull grey |
| F-14A of VF-142 on the catapult, USS Eisenhower, 6 July 1980 (PH1 Dave McLean) | https://commons.wikimedia.org/wiki/File:F-14A_VF-142_on_cat_USS_Eisenhower_(CVN-69)_1980.JPEG | 1980 deck configuration on the catapult: launch bar, gear, flaps, wings forward |
| Public-domain line three-view (low resolution, 574 x 385) | https://commons.wikimedia.org/wiki/File:Grumman_F-14_Tomcat.png | cross-check only |

NATOPS: NAVAIR 01-F14A-1, "Preliminary Flight Manual F-14", 1 June 1972 (Grumman for NAVAIR), scanned on archive.org:
https://archive.org/details/navair-01-f-14-a-1-natops-flight-manual-f-14-a . US government work. Distribution / marking:
the cover is CONFIDENTIAL "Group 4, downgraded at 3-year intervals, declassified after 12 years" (so declassified since
1984); the figures used are themselves marked UNCLASSIFIED / (U). The later NAVAIR 01-F14AAA-1 editions (1977-1980) were
not found in public scans; the 1972 preliminary is the earliest F-14A manual and its figures match the 1980 airframe
in everything cross-checked (dimensions, panel arrangement).

| File | What it shows |
|---|---|
| `natops-01-f14a-1-1972-fig1-1-dimensions.png` | fig. 1-1 aircraft dimensions: span 64 ft 1.5 in, 68 deg 38 ft 1.9 in, oversweep 32 ft 8.5 in, stabilator 33 ft 3.5 in, length 61 ft 11.9 in, height 16 ft, track 16 ft 5 in, fin tips 10 ft 8 in |
| `natops-01-f14a-1-1972-fig1-3-pilot-panel.png` | fig. 1-3 pilot's instrument panel and consoles (62 numbered items) |
| `natops-01-f14a-1-1972-fig1-4-rio-panel.png` | fig. 1-4 NFO's (RIO's) instrument panel and consoles |

Still not available: the -2 maintenance manuals (access-panel diagrams). Copyrighted drawings (the-blueprints.com,
scale-model plans) were not used.
