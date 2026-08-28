# ART_STYLE.md — "Gilded Hex Seals" icon style

**What this is:** the house style for every SVG icon in SIV (unit tokens, yield glyphs,
future UI icons). One theme runs through all of them; this document is normative for
new art. Update it whenever a token or rule changes.

**Status:** 66/66 glyphs done (5 units + 5 yields + 19 resources + 7 civ seals + 29
building/wonder seals + 1 barbarian-camp marker), validated well-formed XML and wired into the
renderer/HUD (2026-08-27).

**Known gaps:** none. The 2026-08-26 audit gaps (building/wonder card seals, hex-ify the
barbarian camp marker) were closed on 2026-08-27.

## The three theme pillars

Every icon carries all three; if a new glyph misses one, it doesn't ship.

1. **Hex plate frame** — the icon *is* a pointy-top hexagonal medallion, echoing the map
   grid itself (axial internal, odd-r storage). Struck like a coin: ink ground, gold rim.
2. **Material-driven fills** — glyphs are drawn from era materials (bronze, wood, linen,
   hide, glass), never flat abstract color. Yields additionally carry their semantic
   accent hue (food = green, culture = purple…).
3. **The gilded touch** — exactly one gold detail per glyph (a binding cord, a boss, a
   lip, a wrap), plus the milled-edge dashed ring that gives every seal its coin feel.

## Canvas geometry

- ViewBox `0 0 64 64`, pointy-top hexagon centered at (32, 32), outer circumradius R = 30.
- Hex vertices: `(32,2) (58,17) (58,47) (32,62) (6,47) (6,17)` — col = q + ((r − (r&1))>>1).
- Safe zone inside the milled ring: keep glyph extents within r ≈ 19 of center.

### Canonical frame snippet (paste into every file)

```xml
<polygon points="32,2 58,17 58,47 32,62 6,47 6,17" fill="#1D1A14" stroke="#C8A24A" stroke-width="2" stroke-linejoin="round"/>
<polygon points="32,5.5 55,18.75 55,45.25 32,58.5 9,45.25 9,18.75" fill="none" stroke="#3A3325" stroke-width="1"/>
<circle cx="32" cy="32" r="22.7" fill="none" stroke="#B3A685" stroke-width="1" stroke-dasharray="1 3" opacity=".5"/>
```

## Palette tokens (single source: [src/render/palette.ts](../src/render/palette.ts) for chrome; these are the art extensions)

| Role | Token | Hex | Used for |
|---|---|---|---|
| Ground / contour | `ink-deep` | `#12100D` | outlines, shadows |
| Plate fill | `plate` | `#1D1A14` | hexagon interior |
| Hairline frame | `umber` | `#3A3325` | inner hex inset line |
| Parchment | `parchment` | `#E8DCC0` | linen fills, highlights |
| Parchment dim | `parchment-dim` | `#B3A685` | milled ring, fold lines |
| Gold | `gold` | `#C8A24A` | rims, strings, bindings, bosses |
| Gold bright | `gold-bright` | `#E0B45C` | coin faces, sparks |
| Gold pale | `gold-pale` | `#F1D79A` | sparkle tips |

### Material accents (per unit class)

| Class | Material | Fill | Deep shade |
|---|---|---|---|
| civilian | ochre flag / canvas linen | `#C98F3B` / `#E8DCC0` | `#6E5433` |
| recon | moss-green falcon | `#8FAE5F` | `#5E7F46` |
| melee (warrior) | oxblood war-paint, wood club | `#A04030` / `#6E5433` | `#4A3A22` |
| melee (spearman) | bronze blades, wood shafts | `#C08428` / `#6E5433` | `#4A3A22` |
| ranged | slate fletching, wood bow | `#7FA3A8` / `#8A6B45` | `#12100D` |

### Yield accents (semantic)

| Yield | Glyph | Accent | Light / foam shades |
|---|---|---|---|
| Food | wheat sheaf | green `#7FBF6A` | stems deep `#5E7F46`, grains parchment |
| Production | smith's hammer | rust `#C96F3B` | face light `#E08A52` |
| Gold | coin stack | bright gold `#E0B45C` | edge `#96681C`, sparkle pale |
| Science | bubbling flask | science blue `#5AA9D6` | surface `#8CC3E8`, bubbles `#C9E4F5` |
| Culture | lyre | purple `#B07FC7` | strings stay gold |

### Resource accents

Bonus resources stay natural-material; strategic lean industrial; luxuries carry a rich
semantic hue each. Every resource glyph keeps exactly one `#C8A24A`-family touch.

| Resource | Glyph | Materials & accent | Gilded touch |
|---|---|---|---|
| wheat | standing grain ear | parchment grains on green stem | gold tie band |
| cattle | frontal ox head | hide brown, parchment muzzle | gold nose ring |
| sheep | ram head | parchment fleece, dark face | gold collar bell |
| deer | stag head | hide brown, wood antlers | gold collar + pendant |
| stone | ashlar block stack | warm gray stone | chiseled mason's mark |
| fish | leaping river fish | slate body, parchment belly | gold gill plate |
| horses | horse head profile | bay coat, dark mane | gold bridle straps |
| iron | crossed ingot bars | steel grays | gold assay stamp |
| coal | faceted seam lumps | near-black facets, pale glints | gold vein thread |
| silk | rolled bolt + drape | cream cloth, spiral end cap | gold needle pin |
| spices | mortar & pestle | wood bowl, rust spice mound | gold lip band |
| furs | spread pelt | hide browns, lighter inner patch | gold clasp pin |
| marble | fluted column drum | parchment white, dim flutes | gold vein line |
| gems | faceted emerald | green facets light→deep | gold spark |
| silver | coin stack | white faces, steel edges | gold binding cord |
| wine | bronze goblet | bronze cup, deep red surface | gold rim lip |
| dyes | vat + dipped cloth | terracotta pot, indigo liquid | gold handle ring |
| incense | sticks in bronze dish | wood sticks, ember tips | gold belly band |
| salt | crystal heap + scoop | parchment-white facets light/dim | gold scoop laid against pile |

### Civ seals

Heraldic devices — **no ground shadow** (they are badges, not grounded objects). The
civ's own color is the device's material accent; everything else stays ink/parchment.
Used at 22 px in the top bar; safe to scale anywhere.

| File | Device | Accent | Gilded touch |
|---|---|---|---|
| `rome.svg` | laurel wreath | moss laurel `#8FAE5F/#5E7F46` | gold binding cord + knot |
| `egypt.svg` | ankh | sandstone `#C9B98A` | gold junction wrap |
| `greece.svg` | Corinthian helmet | bronze `#C08428`, oxblood crest | gold brow band |
| `norse.svg` | Thor's hammer | steel head, wood handle | gold wire wraps |
| `mongolia.svg` | recurve bow + arrow | wood limbs, slate fletching | gold grip wrap |
| `china.svg` | two-tier pagoda | lacquer roofs `#A04030`, parchment walls | gold finial orbs |
| `barbarians.svg` | crossed raiding axes | knapped steel heads, oxblood lashings | looted gold torc ring |

## Stroke hierarchy

1. **Contours** (silhouettes): 2 px `#12100D`.
2. **Detail lines**: 1–1.5 px, usually the material's deep shade at reduced opacity.
3. **Gold details** (cords, wraps, lips): 1.4–2.6 px `#C8A24A`; highlights in `#E0B45C`/`#F1D79A`.

Shadows: one soft ink ellipse under grounded objects (`opacity=".45"`), never drop-shadow filters.
No gradients anywhere — the engraved look comes from sparse dash-hatch strokes and two-tone fills.

## The roster

| File | Icon | Materials & accent | Signature gilded touch |
|---|---|---|---|
| `src/assets/art/units/settler.svg` | covered wagon + claim flag | linen canvas, wood wheels | gold hubs + trim band |
| `src/assets/art/units/scout.svg` | falcon on branch | moss green body, parchment breast | gold leg band |
| `src/assets/art/units/warrior.svg` | club over hide shield | oxblood paint, flaked stone | gold boss + grip wraps |
| `src/assets/art/units/spearman.svg` | crossed spears | bronze heads, wood shafts | gold-bound knot at crossing |
| `src/assets/art/units/archer.svg` | recurved bow + arrow | slate fletching, bronze head | gold grip wrap at belly |
| `src/assets/art/yields/food.svg` | wheat sheaf | parchment grains on green stems | gold binding cord |
| `src/assets/art/yields/production.svg` | hammer mid-swing | rust head, wood handle | gold wedge + sparks |
| `src/assets/art/yields/gold.svg` | coin stack | bright gold faces | milled standing coin + laurel |
| `src/assets/art/yields/science.svg` | flask with bubbles | science-blue liquid, glass | gold rolled rim (lip) |
| `src/assets/art/yields/culture.svg` | lyre | purple body | golden strings + knobs |

### Building & wonder seals (2026-08-27, +29)

Rendered 40 px on the production cards in CityScreen via `buildingArt(id)`; all carry the
canonical frame and exactly one gilded touch.

| File (`src/assets/art/buildings/`) | Glyph | Materials & accent | Signature gilded touch |
|---|---|---|---|
| `palace.svg` | columned hall + pediment | limestone, parchment | gold finial |
| `monument.svg` | obelisk | limestone on wood base | gold pyramidion |
| `granary.svg` | grain sack | linen | gold rope band |
| `barracks.svg` | crossed swords | bronze | gold pommels |
| `library.svg` | scroll stack | parchment | gold wax seal |
| `temple.svg` | stepped altar + flame | stone | gold flame |
| `walls.svg` | crenellated wall + gate | stone | gold keystone |
| `market.svg` | awning stall | ochre linen, wood | gold coin |
| `amphitheater.svg` | tiered arcs | stone | gold finial |
| `aqueduct.svg` | arches + water channel | stone, slate water | gold channel line |
| `workshop.svg` | anvil + hammer | slate iron, wood | gold wedge |
| `castle.svg` | keep + twin towers | stone | gold banner |
| `university.svg` | colonnade + open book | stone, parchment | gold book lines |
| `bank.svg` | strongbox | wood, iron | gold lock |
| `museum.svg` | gallery + statues | stone, parchment | gold finial |
| `forum.svg` | colonnade plaza | marble | gold rostra line |
| `mastaba.svg` | flat-topped tomb | sandstone | gold cornice |
| `acropolis.svg` | temple on hill | marble on stone | gold pediment |
| `stave_church.svg` | timber church | wood | gold dragon-head finial |
| `ordu.svg` | yurt | felt linen | gold ridge band |
| `shi.svg` | pagoda hall | lacquer-red roof, wood | gold finial ball |
| `stonehenge.svg` | trilithon | grey stone | gold sun disk |
| `colossus.svg` | bronze bust | bronze | gold halo |
| `pyramids.svg` | twin pyramids | limestone | gold capstone |
| `great_library.svg` | dome hall | parchment, wood | gold orb finial |
| `angkor_wat.svg` | tower + flanks | sandstone | gold spire bud |
| `hagia_sophia.svg` | dome + hall | slate dome, stone | gold finial sweep |
| `machu_picchu.svg` | terraced peaks | granite, moss green | gold window |
| `notre_dame.svg` | gothic facade + rose window | stone, slate glass | gold cross finial |

### Map marker seal (+1)

| File | Icon | Materials & accent | Signature gilded touch |
|---|---|---|---|
| `src/assets/art/ui/barbarian-camp.svg` | hide tent + brazier | hide browns, ember red | gold boss |

## Conventions

- **Location/naming:** kebab-case files under `assets/art/{units,yields,resources,civs}/`.
  New UI icons go under `assets/art/ui/`.
- **Registry:** `src/assets/art/index.ts` globs all six groups (`units`, `yields`, `resources`,
  `civs`, `buildings`, `ui`) — raw source for Preact (`unitArt`/`yieldArt`/`civArt`/
  `resourceArt`/`buildingArt`) and URLs for Pixi (`resourceArtUrl`/`uiArtUrl`). New files are
  picked up automatically; no import lists to maintain.
- **Accessibility:** every file gets `<title>` (and `role="img"` + `aria-label`) — the title
  names the icon, not the concept ("Warrior", not "melee").
- **IDs:** unique within each file only (`#stalk`, `#spear`); files are standalone documents,
  so no cross-file `<use>` references.
- **Self-contained:** inline everything; no external images/fonts/scripts. Flat colors only.
- **Do:** reuse the canonical frame verbatim; one gold touch per glyph; keep strokes in the
  hierarchy; test at 24 / 48 px sizes.
- **Don't:** add gradients, drop-shadow filters, external references, or a second accent
  color to a unit glyph.

## Usage

- **Preact/UI:** `import art from '@/assets/art/x.svg?raw'` (Vite raw import → string), then
  render via `dangerouslySetInnerHTML`; or `import url from '@/assets/art/x.svg'` for an
  image URL.
- **PixiJS (map renderer):** `Assets.load(url)` rasterizes an SVG to a texture. Render at 2×
  (128 px source for a 64 px token) so edges stay crisp when zooming.

## Usage (integrated)

- **Map renderer:** resource seals are preloaded as Pixi textures in `MapRenderer.create`
  (`loadResourceTextures`) and stamped bottom-center into the per-key terrain texture
  cache; abstract kind glyphs remain the fallback. Terrain cache keys now carry the
  resource **id**, not its kind.
- **Preact HUD:** `ArtIcon` (`src/ui/hud/ArtIcon.tsx`) inlines raw SVG at a fixed px size —
  used by TopBar (civ seal + gold/science/culture), CityScreen (yield row + unit prod
  cards) and UnitDock (unit token).

## Changelog

- **2026-08-27** — audit gaps closed: +29 building/wonder seals wired into the city-screen
  production cards, and the barbarian-camp map marker is now the `ui/barbarian-camp.svg`
  hex seal (Pixi texture with drawn-tents fallback). 66 glyphs total.
- **2026-08-26** — audit pass; no art changes. Known gaps recorded under **Status**
  (building/wonder card seals missing; round barbarian-camp badge to hex-ify).
- **2026-08-23c** — caught the one missed resource (`salt`) when its fallback glyph showed
  on-map; +1 seal (19 resources, 36 total).
- **2026-08-23b** — set completed: +18 resources, +7 civ seals; integrated into MapRenderer
  and HUD (`ArtIcon`, `src/assets/art/index.ts` registry).
- **2026-08-23** — set created: 5 units + 5 yields, style guide written.
