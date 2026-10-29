# Air base references (ngc/look-airbases)

Subject: a 1980 USAF strategic-reconnaissance / airlift base in the Beale AFB mould (9th SRW, SR-71A; C-130 transient
and support), modelled as WESTGATE AFB (a fictional name: no real base's name, insignia or layout is copied, only
the period standards and the dimensions of the type of building). No drawings were downloaded: everything below is
measurements and standards taken from the listed pages; no image is committed. Requests used a generic User-Agent.

| # | Source | Licence | What it gave |
|---|---|---|---|
| 1 | AirNav / FAA Chart Supplement entry for KBAB (Beale AFB), https://www.airnav.com/airport/KBAB ; FlightAware runway 15/33 page https://flightaware.com/resources/airport/KBAB/runway/15/33 | FAA data (US government, public domain); pages are aggregators: measurements only | Runway 15/33: 12,000 x 300 ft, grooved concrete, HIRL, ILS both ends; marked 150-200 ft wide on the 300 ft pavement |
| 2 | FAA Aeronautical Information Manual 2-3-3 "Runway Markings" (TBL 2-3-2 threshold stripes by runway width) via https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap2_section_3.html and secondary quotes of AC 150/5340-1J | US government, public domain | 16 threshold stripes for a 200 ft marked width; aiming point 150 x 30 ft starting 1,020 ft in, 72 ft between inner edges |
| 3 | FAA AC 150/5340-1 (Standards for Airport Markings), values as carried through the 1980s editions and AFR 88-16 / UFC 3-260-01 practice (from the author's reference knowledge, cross-checked with #2) | US government, public domain | Threshold stripes 150 ft x 5.75 ft, 20 ft in; designation digits 60 x 20 ft, 20 ft past the stripes; centreline 120 ft stripes, 80 ft gaps, 36 in wide (precision); TDZ bars 75 x 6 ft, 5 ft apart, 3-3-2-2-1-1 pairs every 500 ft; side stripes 3 ft; hold-short 2 solid + 2 dashed 12 in lines; taxiway centreline 6 in yellow; overrun yellow chevrons |
| 4 | UFC 3-260-01 Airfield and Heliport Planning and Design (DoD, public domain), class B runway tables | Public domain | Overruns 1,000 ft; 75 ft taxiways; 1,000 ft runway-to-parallel-taxiway separation (class B); 200 ft maximum edge-light spacing; ALSF-1 2,400 ft |
| 5 | Lincoln AFB double-cantilever hangars, https://www.lincolnafb.org/doubhangar.php | Copyright (local history site): measurements only | 1953-54 Kuljian design for 4 B-47s (two each side); 98,270 sq ft; door leaves 30-35 ft wide, about 60 ft tall; about 6 1/2 storeys tall; 5 t monorail cranes |
| 6 | Wikipedia "Double cantilever hangar" and "Loring Air Force Base Double Cantilever Hangar" (CC BY-SA, text only); HAER ME-310 Loring hangar documentation (LoC, public domain - not downloaded) | CC BY-SA / PD | The type: a central shop core, cantilevered roof over the bays both sides, sliding doors on the long sides; large (Castle, Carswell, Loring 250 x 600 ft) and smaller variants (March, Travis, Edwards, Hanscom) |
| 7 | "Blackbird hangars taken down at Beale", Air & Space Forces Magazine, https://www.airandspaceforces.com/blackbird-hangars-taken-down-at-beale/ ; Beale AFB public affairs photos "Beale demolishes Blackbird hangars" (af.mil, public domain - not downloaded) | Article copyright; af.mil photos PD | SR-71 shelters on the Beale flight line, a row of individual steel "barns", demolished 2013; used for U-2 / RQ-4 afterwards. No published dimensions: the shelter size here is derived from the aircraft (below) |
| 8 | SR-71A principal dimensions (USAF fact sheet / NASA Dryden fact sheet, public domain) | PD | Span 55 ft 7 in (16.94 m), length 107 ft 5 in (32.74 m), height 18 ft 6 in (5.64 m) - sets the shelter: 40 m wide, 46 m deep, 9 m door |
| 9 | C-130H principal dimensions (already in units/air/c130model.js, C130M: span 40.41 m, length 29.79 m, height 11.6 m) | PD (USAF fact sheet) | Sets the maintenance hangar bay: 36 m deep, door 18.3 m (60 ft) |

## Dimension table (as built, world/airbase.js `AB`, `AB_BUILDINGS`)

| Item | Real (source) | Built |
|---|---|---|
| Runway | 12,000 x 300 ft (#1) | 3,658 x 91.4 m, concrete, 25 ft slab joints, rubber deposits in both touchdown zones |
| Overruns | 1,000 ft (#4) | 305 m each end, asphalt, yellow chevrons every 100 ft |
| Parallel taxiway | 75 ft, 1,000 ft off the runway (#4) | 22.9 m at 305 m, five connectors, stabilised shoulders |
| Threshold / numbers / centreline / TDZ / aiming point | #2, #3 | as the standard (16 stripes, 60 ft block digits, 120/80 ft x 36 in, 3-3-2-2-1-1 bars, 150 x 30 ft at 1,020 ft) |
| Edge lights | 200 ft max (#4) | white every 200 ft, yellow in the last 2,000 ft, green threshold bars, red end lamps, blue taxiway edge lights |
| Approach lights | ALSF-1, 2,400 ft (#4) | barrettes every 100 ft, the 1,000 ft crossbar, red side-row barrettes in the inner 600 ft |
| VASI | 2-bar VASI of the period | 500 ft / 1,200 ft boxes on the left |
| Maintenance hangar | double cantilever, 60 ft doors, 35 ft leaves (#5, #6) | 150 x 84 m, 21 m tall, two 36 m bays on a 12 m shop core, 18.3 m doors |
| SR-71 shelters | aircraft #8 + photos #7 | four barns 40 x 46 m, 12.5 m ridge, 9 m doors |
| Tower | 1950s-60s USAF standard concrete tower (no drawing found; UNVERIFIED proportions) | 27 m to the cab floor, 9.4 m cab with outward-leaning glass |
| Fence | 8 ft chain link with 3-strand outriggers (USAF security standard) | 2.45 m mesh, posts every 10 ft, three strands |

Open (not found in open access this pass): a dimensioned drawing of a Beale SR-71 shelter; a period USAF tower
standard drawing (HABS/HAER lists towers at other bases - worth a LoC search for the next pass).
