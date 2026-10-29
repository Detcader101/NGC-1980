# Faces: sources (look-faces, 2026-10-29)

Open-access numbers only. No images or meshes were saved; the head is our own geometry (`humanfig.js headSdf`).

| Source | Licence | What we took |
|---|---|---|
| Gordon C.C. et al., *1988 Anthropometric Survey of U.S. Army Personnel* (ANSUR I), NATICK/TR-89/044 and TR-89/027. Per-subject data for the 1,774 men: https://tools.openlab.psu.edu/publicData/ansurMen.csv (index page https://www.openlab.psu.edu/ansur/) | US Government work (public domain) | Means we computed from the CSV (mm, n = 1774): stature 1755.8, head length 197.1, head breadth 151.7, head circumference 567.7, bizygomatic breadth 140.5, menton-sellion length 121.9, interpupillary distance 64.7, ear length 64.7, ear breadth 37.7, ear length above tragion 31.9, ear protrusion 24.2, neck circumference at the larynx 379.6 and at the base 408.4. The CSV was read in the scratchpad and not added to the repo. |
| Mbugua N.W. et al., "Normative anthropometry and proportions of the Kenyan-African face and comparative anthropometry in relation to African Americans and North American Whites", *Maxillofacial Plastic and Reconstructive Surgery* 2019, PMC6384287 (full text from Europe PMC) | CC BY 4.0 | Its tables restate Farkas' norms for North American white (NAW) and African-American (AA) men. NAW men (mm): n-sn 54.8, sn-me 72.6, sn-sto 22.3, sto-sl 19.7, philtrum 15.9 (15.5 + 0.4), en-en 33.3, ex-en 31.3, ex-ex 91.2, al-al 34.9, ch-ch 54.5, ft-ft 115.9, zy-zy 139.1, go-go 105.6; nasofrontal 130.3 deg, nasolabial 99.8 deg. AA men: al-al 44.1, en-en 35.8, sn-sto 26.1, upper / lower vermilion 13.6 / 13.8, ch-ch 54.6. |

## How the numbers set the head (head-bone frame, metres, +y up, -z forward)

| Landmark / dimension | Value used | From |
|---|---|---|
| Head length (glabella to opisthocranion) | cranium 0.197 (front -0.092 + loft, back 0.105) | ANSUR 197.1 |
| Head breadth | 0.151 | ANSUR 151.7 |
| Vertex to menton | 0.235 (vertex 0.219, menton -0.016) | ANSUR n-me + forehead |
| Nasion to menton | 0.122 (0.106 to -0.016) | ANSUR menton-sellion 121.9 |
| Nasion to subnasale | 0.053 | NAW n-sn 54.8 |
| Subnasale to stomion | 0.022 (0.026 face 3) | NAW 22.3 / AA 26.1 |
| Pupils | +-0.0324 | ANSUR IPD 64.7 |
| Fissure: medial / lateral corner from the pupil | 14.7 / 13.1 mm | en-en 33.3, ex-ex 91.2 |
| Fissure height | ~10 mm, upper lid over the top of the iris | clinical norm (iris 11.5-12 mm) |
| Eyeball | radius 11.8 mm, cornea apex 10 mm behind the glabella | standard globe (24 mm), Hertel ~16-17 mm |
| Nose width (alae) | 0.035 (0.044 face 3) | NAW 34.9 / AA 44.1 |
| Mouth width | 0.0545 | NAW 54.5 |
| Zygion | +-0.0695 | ANSUR 140.5 |
| Gonion | +-0.0548 (jaw 1.0) | go-go 105.6 |
| Frontotemporale | +-0.0595 | ft-ft 115.9 |
| Ear | 61 x 34 mm plate + rim, ~25-30 deg off the head, centre 18 mm behind the tragion | ANSUR ear length / breadth / protrusion |
| Neck | capsule r 0.051-0.058 plus the sternocleidomastoids | ANSUR neck circumference 380 |

## Period kit (1980) checked for the heads

- **M1 helmet** with the Mitchell (reversible leaf / cloud) cover is right for US Marines in 1980. The PASGT helmet
  (helmet designed 1977) entered US service in 1983 (first worn in combat in Grenada, 82nd Airborne) and replaced the M1
  through the 1980s, so it is not used. Source: https://en.wikipedia.org/wiki/Personnel_Armor_System_for_Ground_Troops
  (CC BY-SA, dates only, no images). The Marine Corps' exact PASGT adoption year was not found in an official source.
- **Haircuts:** the Marines' high-and-tight / short sides; Navy grooming rules of 1980 allowed beards (Z-gram 57, 1970,
  until 1984; from general knowledge, not checked against a primary source) and neat moustaches, so face 4 (the older
  man) has a moustache. No beards were modelled.
- **Civilians:** a fuller late-1970s men's cut over the ears' tops.
