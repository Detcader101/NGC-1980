# Fish appearance — 26 October 2026

The underwater infantry request included different fish types with readable patterns. The existing nine fish types already had distinct simulation roles and real small length ranges, but their stripes, eyes and bands were calculated only at the vertices of a six-ring body. Interpolation smeared these marks across broad triangles. This change resolves pigment per fragment on the existing instanced fish meshes.

## What changed

`fishlooks.js` generates one 128 × 384 RGBA8 texture (192 KiB) for the existing species indices. No downloaded textures or new species are used. Each fish still uses the shared 53-vertex, 74-triangle mesh; the school and individual-fish draw buckets remain separate, with no additional draw calls. Ray, jellyfish, dolphin and seabird shaders retain their existing renderer.

| Existing type | Readable appearance |
| --- | --- |
| European pilchard | Silver flank with a restrained row of dark spots |
| Atlantic mackerel | Wavy upper-body bars and a narrow flank streak |
| Flathead grey mullet | Longitudinal flank lines, fuller head and shallower tail fork |
| Greater amberjack | Muted amber flank band and darker slanted head stripe |
| Atlantic bonito | Oblique upper-body stripes and short pectorals |
| Mediterranean flying fish | Plain blue/silver body, existing deployed wing fins and longer lower tail lobe |
| Two-banded sea bream | Dark nape and tail bands with a deeper body |
| Adult Mediterranean damselfish | Dark body, lighter scale centres, deep tail fork |
| Sandbar shark | Plain countershading, taller forward dorsal and broad pectorals; erroneous pale tail tips removed |

The pigment atlas contains linear RGB bytes and explicitly uses `NoColorSpace`, linear filtering and no mipmaps. Half-texel inset coordinates prevent neighbouring species rows from bleeding into each other. One texture belongs to each `fishUniforms()` bundle and is shared by both fish meshes; an owner that tears down that bundle should dispose `uPattern.value` alongside its geometry/materials.

The new fish fragment shader applies the existing depth lighting and water attenuation, then Three's output transfer before blending with the game's existing display-space fog colour. Previously linear `THREE.Color` pigment was written directly into the custom display-space shader, making it too dark. Dark pigment also reduces the broad silver flash so the flash does not bleach out bands. There is no emissive term, outline, enlarged gameplay fish or exemption from water fog. Underwater visibility and natural spawning changes are separate work in `sealife.js` / `fishsim.js`.

## Evidence and limits

`node tools/fishlooksbench.mjs`: **22/22 passed**. These checks sample the actual atlas bytes with bilinear filtering: flank/back placement, separate resolved stripes, bream band contrast, dark adult damselfish scales, plain shark/flying-fish pigment, row boundaries, underwater contrast, production texture configuration, mesh bounds and unchanged geometry budget. Syntax checks pass for the helper and renderer. This is CPU regression evidence, not a GPU performance measurement or proof of gameplay visibility. The integrated production gallery and natural first-person swimmer captures are owned by the parent integration pass.

The mesh remains a stylized low-poly approximation shared across species. Fin counts, scale counts, exact body proportions, iridescence and individual pigment variation are not anatomical reconstructions. Fin profiles and pigment contrast are tuned for nearby gameplay identification. The shared mesh does not become a taxonomic model. Adult damselfish deliberately remain dark; colourful tropical fish and bright-blue juvenile coloration were not added.

## Primary identification references

- Pilchard flank spots and usual 15–20 cm size: [Naturalis, Fishes of the Northeastern Atlantic and Mediterranean](https://fishes-fnam.linnaeus.naturalis.nl/linnaeus_ng/app/views/species/nsr_taxon.php?cat=TAB_DESCRIPTION&id=108993); [Portuguese Institute for Sea and Atmosphere identification manual](https://www.ipma.pt/export/sites/ipma/bin/docs/publicacoes/pescas.mar/Manual_Peixes_Osseos_V3.pdf), pilchard entry.
- Wavy dorsal bars on Atlantic mackerel: [NOAA Fisheries](https://www.fisheries.noaa.gov/species/atlantic-mackerel/seafood).
- Oblique back stripes on Atlantic bonito: [Florida Fish and Wildlife Conservation Commission](https://myfwc.com/wildlifehabitats/profiles/saltwater/tuna/atlantic-bonito/).
- Longitudinal scale markings on grey/striped mullet: [Florida Museum species profile](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/striped-mullet/).
- Amber flank band and head stripe: [NOAA greater amberjack profile](https://www.fisheries.noaa.gov/species/greater-amberjack).
- Two dark bands and deep compressed body: [FAO Diplodus vulgaris identification sheet](https://www.fao.org/fishery/docs/CDrom/ARTFIMED/ArtFiWeb/descript/Species/SPADIVUL.HTML).
- Dark adult Chromis with lighter scale centres and forked tail: [FAO Mediterranean identification sheet](https://www.fao.org/4/x0170f/X0170F60.pdf).
- Flying fish silhouette and longer lower tail lobe: [FAO Cheilopogon heterurus identification sheet](https://www.fao.org/4/y4161e/y4161e35.pdf).
- Large dorsal/pectoral fins and absence of conspicuous sandbar-shark markings: [Florida Museum sandbar shark profile](https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/sandbar-shark/); [NOAA sandbar shark profile](https://www.fisheries.noaa.gov/species/sandbar-shark).

These references establish the general visible features, not the exact shader parameters, pixel colours or mesh dimensions. Those are game art choices.
