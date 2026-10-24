import type { Map as MapboxMap } from "mapbox-gl";

/** Restrained, high-contrast city basemap for Biloo. Keeps road geometry,
 * traffic overlays, route layers and satellite imagery unchanged. */
export function applyBilooCityMapPalette(map: MapboxMap, enabled: boolean) {
  if (!enabled) return;
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    // Never recolor live navigation, traffic, custom overlays or symbol labels.
    if (/traffic|route|navigation|radar|accuracy|biloo|nr-|satellite/.test(id)) continue;
    try {
      if (layer.type === "background") {
        map.setPaintProperty(layer.id, "background-color", "#f5f6f7");
      } else if (layer.type === "fill") {
        if (/water/.test(id)) map.setPaintProperty(layer.id, "fill-color", "#c9e3ed");
        else if (/park|grass|wood|forest|landuse.*green/.test(id)) map.setPaintProperty(layer.id, "fill-color", "#dcebdc");
        else if (/building/.test(id)) map.setPaintProperty(layer.id, "fill-color", "#e8e9e9");
        else if (/land|residential|commercial/.test(id)) map.setPaintProperty(layer.id, "fill-color", "#f5f6f7");
      } else if (layer.type === "line") {
        if (/waterway|river|stream/.test(id)) map.setPaintProperty(layer.id, "line-color", "#b5d9e8");
        else if (/road|street|motorway|highway|bridge|tunnel/.test(id) && !/case|outline/.test(id)) {
          map.setPaintProperty(layer.id, "line-color", "#ffffff");
        }
      }
    } catch {
      // Style variants may not expose every property; preserve map availability.
    }
  }
}
