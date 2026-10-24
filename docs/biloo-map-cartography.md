# Biloo city map

The same cartography now runs on Rider maps, Driver maps, active Driver navigation and the route explorer. It applies once per style load and keeps the provider's sources, geometry, road widths, label placement and zoom hierarchy.

| Feature | Day | Night |
| --- | --- | --- |
| Ground | `#e9ede9` | `#141414` |
| Parks | `#c6dccb` | `#252d28` |
| Water | `#abcddd` | `#202b31` |
| Buildings | `#d2dcdd` | `#2d2d2d` |
| Local roads | `#fffffd` | `#505050` |
| Major roads | `#fbfcfa` | `#686868` |
| Main labels | `#143654` | `#f3f3f3` |

The night palette uses charcoal and graphite from the user's October 24 reference, with subtle park/water hues for orientation. Driver trip navigation pairs those surfaces with an orange `#ffb000` primary action and pale text. The selected map style adapts floating controls; the saved appearance preference still determines the trip sheet and header. Satellite imagery remains photographic.

Map-layer rows keep labels on one line and use a fixed 16px selection icon. Full-canvas SVG sizing applies only to the map's direct illustration, never to nested UI icons. Browser checks cover the selected Satellite row, light/dark appearance and 320–430px viewports.

Live traffic road overlays and their controls have been removed from both Rider and Driver, including Driver Home, Map, incoming requests and navigation. Maps no longer load or periodically refresh Mapbox traffic tiles. Trip routes use a consistent Biloo gold line instead of green/red congestion segments, including when the routing response contains congestion annotations. Routing and arrival-time calculations still use the existing provider data. Browser checks verify that traffic controls are absent and style changes do not request traffic tiles.

Combined landuse layers use the feature's class to distinguish parks, woodland, residential land, education, hospitals and other areas. The Light/Dark v11 basemaps have no casing on their combined surface and tunnel road layers; Biloo adds two narrow outlines using those same sources. Their width expressions preserve class and zoom behavior, including roads that remain hidden at regional zooms.

Route, traffic, navigation, radar, accuracy, application-owned sources and construction/closure colors are excluded from recoloring. Satellite imagery is unchanged. Style switches rebuild the style so the existing style-load handlers consistently restore the palette and operational layers. GPS DOM markers render independently of secondary tile readiness. Noninteractive navigation status text sits below the map's layer menu.

Validation includes the installed Mapbox style-spec validator, label-color contrast against land/roads/parks/water, idempotent road outlines, unchanged operational layers, real Addis Ababa tiles in the Mapbox renderer, and mobile/Chromium checks for Rider and Driver style switching.
