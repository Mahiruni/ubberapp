# Biloo city map

The same cartography now runs on Rider maps, Driver maps, active Driver navigation and the route explorer. It applies once per style load and keeps the provider's sources, geometry, road widths, label placement and zoom hierarchy.

| Feature | Day | Night |
| --- | --- | --- |
| Ground | `#e9ede9` | `#18242e` |
| Parks | `#c6dccb` | `#223c35` |
| Water | `#abcddd` | `#15394c` |
| Buildings | `#d2dcdd` | `#2c3b46` |
| Local roads | `#fffffd` | `#44484c` |
| Major roads | `#fbfcfa` | `#62666a` |
| Main labels | `#143654` | `#e9f0f5` |

Combined landuse layers use the feature's class to distinguish parks, woodland, residential land, education, hospitals and other areas. The Light/Dark v11 basemaps have no casing on their combined surface and tunnel road layers; Biloo adds two narrow outlines using those same sources. Their width expressions preserve class and zoom behavior, including roads that remain hidden at regional zooms.

Route, traffic, navigation, radar, accuracy, application-owned sources and construction/closure colors are excluded from recoloring. Satellite imagery is unchanged. Style switches rebuild the style so the existing style-load handlers consistently restore the palette and operational layers. GPS DOM markers render independently of secondary tile readiness. Noninteractive navigation status text sits below the map's layer menu.

Validation includes the installed Mapbox style-spec validator, label-color contrast against land/roads/parks/water, idempotent road outlines, unchanged operational layers, real Addis Ababa tiles in the Mapbox renderer, and mobile/Chromium checks for Rider and Driver style switching.
