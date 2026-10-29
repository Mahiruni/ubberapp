import type { ExpressionSpecification, LayerSpecification, Map as MapboxMap } from 'mapbox-gl';

export type BilooMapStyle = 'streets' | 'dark' | 'satellite';
// Mapbox 3.32 types require both font keys; undefined retains SDK defaults.
export const BILOO_STYLE_SWAP_OPTIONS = {
  diff: false, localFontFamily: undefined, localIdeographFontFamily: undefined,
} as const;

const DAY = {
  ground: '#e9ede9', residential: '#e3e9e4', commercial: '#e8e4dc',
  industrial: '#dce3e6', education: '#ede7d5', hospital: '#ebdfe2',
  park: '#c6dccb', woodland: '#b9d2c1', sand: '#e7dfc9',
  water: '#abcddd', waterEdge: '#86aec3',
  building: '#d2dcdd', buildingEdge: '#bac9cc', airport: '#dce3e8',
  road: '#fffffd', roadMajor: '#fbfcfa', roadCase: '#a3b4ba', roadCaseMajor: '#859ca8',
  path: '#a1b2aa', rail: '#a5b3bc', boundary: '#a5b3be',
  label: '#08295f', streetLabel: '#183e65', secondaryLabel: '#294d70',
  parkLabel: '#315a46', waterLabel: '#2c536b', halo: '#fffffd',
} as const;

type Palette = Record<keyof typeof DAY, string>;
const NIGHT: Palette = {
  ground: '#141414', residential: '#1b1b1b', commercial: '#262421',
  industrial: '#242628', education: '#2b2924', hospital: '#2e2728',
  park: '#252d28', woodland: '#202722', sand: '#30302b',
  water: '#202b31', waterEdge: '#39464d',
  building: '#2d2d2d', buildingEdge: '#414141', airport: '#292929',
  road: '#505050', roadMajor: '#686868', roadCase: '#202020', roadCaseMajor: '#303030',
  path: '#555b56', rail: '#606060', boundary: '#4b4b4b',
  label: '#f3f3f3', streetLabel: '#f2f2f2', secondaryLabel: '#bcbcbc',
  parkLabel: '#c1cdc5', waterLabel: '#c8d4db', halo: '#141414',
};

export const BILOO_CITY_PALETTES = { streets: DAY, dark: NIGHT };
// Midnight Driver concept: navy land, quiet buildings and distinct neutral roads.
export const BILOO_DRIVER_PALETTES: Record<'streets' | 'dark', Palette> = {
  streets: { ...DAY, ground:'#edf1ef', residential:'#e8edea', building:'#dce3e5', buildingEdge:'#cad5d9', park:'#d2e2d2' },
  dark: { ...NIGHT, ground:'#101b29', residential:'#142132', commercial:'#1c2938',
    industrial:'#1d2c3c', building:'#223246', buildingEdge:'#2e4258',
    park:'#142d2a', woodland:'#112723', water:'#122839', halo:'#101b29',
    road:'#4c5158', roadMajor:'#666b72', roadCase:'#182332', roadCaseMajor:'#263342',
    label:'#f1f5fa', streetLabel:'#eef4fb', secondaryLabel:'#b8c8d9' },
};
// Rider concept #2: cool, quiet streets under navy/gold floating controls.
// Keep Driver's established cartography and all provider geography intact.
export const BILOO_RIDER_PALETTES: Record<'streets' | 'dark', Palette> = {
  streets: { ...DAY, ground: '#edf3f6', residential: '#e8eff3', commercial: '#edf0ee',
    building: '#dbe5ec', buildingEdge: '#c0d0da', park: '#d3e4d2', woodland: '#c2dac9',
    water: '#bdd9e7', roadCase: '#b9cbd6', roadCaseMajor: '#96afc0' },
  dark: { ...NIGHT, ground: '#10263e', residential: '#152e47', commercial: '#1b344b',
    industrial: '#203446', building: '#233e56', buildingEdge: '#304c64',
    park: '#203c36', woodland: '#1c342e', water: '#142e44', halo: '#10263e' },
};
const featureClass: ExpressionSpecification = ['to-string', ['coalesce', ['get', 'class'], '']];

function landuseColor(p: Palette): ExpressionSpecification {
  return ['match', featureClass,
    ['park', 'grass', 'pitch', 'golf', 'cemetery', 'national_park', 'recreation_ground'], p.park,
    ['wood', 'forest', 'scrub', 'wetland'], p.woodland,
    ['school', 'college', 'university', 'education'], p.education,
    ['hospital', 'medical'], p.hospital,
    ['commercial', 'retail'], p.commercial,
    ['industrial', 'railway'], p.industrial,
    ['airport', 'aerodrome'], p.airport,
    ['sand', 'beach', 'agriculture'], p.sand,
    p.residential,
  ];
}

function roadColor(p: Palette, casing: boolean): ExpressionSpecification {
  return ['match', featureClass,
    ['motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link', 'primary_link'], casing ? p.roadCaseMajor : p.roadMajor,
    casing ? p.roadCase : p.road,
  ];
}

// Retain the provider's zoom/class width hierarchy. A zero-width street must
// remain hidden at regional zooms; wrapping a zoom expression in '+' is invalid.
function casingWidth(width: unknown): ExpressionSpecification | number | null {
  const widen = (value: unknown): ExpressionSpecification | number => typeof value === 'number'
    ? value > 0 ? value + 1.4 : 0
    : ['case', ['>', value as ExpressionSpecification, 0], ['+', value as ExpressionSpecification, 1.4], 0];
  if (typeof width === 'number') return widen(width);
  if (!Array.isArray(width)) return null;
  const expression = width.slice();
  const firstValue = expression[0] === 'interpolate' ? 4 : expression[0] === 'step' ? 2 : -1;
  if (firstValue < 0) return null;
  for (let i = firstValue; i < expression.length; i += 2) expression[i] = widen(expression[i]);
  return expression as ExpressionSpecification;
}

function ensureRoadCasing(map: MapboxMap, layer: LayerSpecification, p: Palette) {
  // The hosted Light/Dark v11 styles combine street classes into road-simple
  // without a casing. Reuse that geometry rather than downloading more data.
  if (layer.type !== 'line' || !['road-simple', 'tunnel-simple'].includes(layer.id)) return;
  const width = casingWidth(layer.paint?.['line-width'] ?? 1);
  if (width === null) return;
  const id = `biloo-city-casing-${layer.id}`;
  if (!map.getLayer(id)) {
    map.addLayer({ ...layer, id, paint: { ...layer.paint, 'line-width': width, 'line-color': roadColor(p, true) } }, layer.id);
  } else {
    map.setPaintProperty(id, 'line-color', roadColor(p, true));
  }
}

/** Biloo's day/night cartography. Keep source data, road widths, filters,
 * label placement, route/traffic semantics and satellite imagery intact. */
export function applyBilooCityMapPalette(map: MapboxMap, style: BilooMapStyle | boolean, variant: 'city' | 'rider' | 'driver' = 'city') {
  if (style === false || style === 'satellite') {
    if (style === 'satellite') map.getContainer().dataset.bilooMapPalette = 'satellite';
    return;
  }
  const theme = style === 'dark' ? 'dark' : 'streets';
  const p = (variant === 'rider' ? BILOO_RIDER_PALETTES : variant === 'driver' ? BILOO_DRIVER_PALETTES : BILOO_CITY_PALETTES)[theme];
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] ?? '' : '';
    // Application geometry and warning colors are operational information.
    if (/^(biloo|nexride|nr)[-_]|traffic|route|navigation|radar|accuracy|construction|closure/.test(id)) continue;
    if ('source' in layer && typeof layer.source === 'string' && /^(biloo|nexride|nr)[-_]/.test(layer.source)) continue;
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', p.ground);
      } else if (layer.type === 'symbol' && layer.layout && 'text-field' in layer.layout) {
        const color = /water/.test(id) ? p.waterLabel
          : /park|natural/.test(id) ? p.parkLabel
          : /road|street/.test(id) ? p.streetLabel
          : /poi|airport|subdivision/.test(id) ? p.secondaryLabel : p.label;
        map.setPaintProperty(layer.id, 'text-color', color);
        map.setPaintProperty(layer.id, 'text-halo-color', p.halo);
        map.setPaintProperty(layer.id, 'text-halo-width', /road/.test(id) ? 1.35 : 1.15);
        map.setPaintProperty(layer.id, 'text-halo-blur', .35);
        // Preserve the provider's placement and zoom hierarchy while ensuring
        // its actual place/road/POI labels are not hidden by theme overrides.
        if (layer.layout['visibility'] === 'none' && /place|settlement|locality|neighborhood|neighbourhood|road-label|street-label|poi-label/i.test(id)) {
          map.setLayoutProperty(layer.id, 'visibility', 'visible');
        }
        if (/place|settlement|locality|neighborhood|neighbourhood|poi|road|street/.test(id)) {
          map.setPaintProperty(layer.id, 'text-opacity', 1);
        }
      } else if (layer.type === 'fill') {
        if (layer.paint?.['fill-pattern']) continue;
        if (sourceLayer === 'water' || /water/.test(id)) {
          map.setPaintProperty(layer.id, 'fill-color', p.water);
          map.setPaintProperty(layer.id, 'fill-outline-color', p.waterEdge);
        } else if (sourceLayer === 'building' || /building/.test(id)) {
          map.setPaintProperty(layer.id, 'fill-color', p.building);
          map.setPaintProperty(layer.id, 'fill-outline-color', p.buildingEdge);
        } else if (/national-park|park|grass|wood|forest/.test(id)) {
          map.setPaintProperty(layer.id, 'fill-color', p.park);
        } else if (/landuse|landcover/.test(sourceLayer) || /landuse|landcover/.test(id)) {
          map.setPaintProperty(layer.id, 'fill-color', landuseColor(p));
        } else if (/aeroway|airport/.test(id)) {
          map.setPaintProperty(layer.id, 'fill-color', p.airport);
        } else if (/land|residential/.test(id) || sourceLayer === 'structure') {
          map.setPaintProperty(layer.id, 'fill-color', p.ground);
        }
      } else if (layer.type === 'fill-extrusion' && /building/.test(id)) {
        map.setPaintProperty(layer.id, 'fill-extrusion-color', p.building);
      } else if (layer.type === 'line') {
        if (layer.paint?.['line-pattern'] || layer.paint?.['line-gradient']) continue;
        if (/waterway|river|stream/.test(id) || sourceLayer === 'waterway') {
          map.setPaintProperty(layer.id, 'line-color', p.waterEdge);
        } else if (/rail/.test(id)) {
          map.setPaintProperty(layer.id, 'line-color', p.rail);
        } else if (/path|steps|pedestrian/.test(id)) {
          map.setPaintProperty(layer.id, 'line-color', p.path);
        } else if (sourceLayer === 'road' || /road|street|motorway|highway|bridge|tunnel/.test(id)) {
          ensureRoadCasing(map, layer, p);
          map.setPaintProperty(layer.id, 'line-color', roadColor(p, /case|casing|outline/.test(id)));
        } else if (/admin|boundary/.test(id)) {
          map.setPaintProperty(layer.id, 'line-color', p.boundary);
        } else if (/aeroway/.test(id)) {
          map.setPaintProperty(layer.id, 'line-color', p.airport);
        } else if (sourceLayer === 'structure') {
          map.setPaintProperty(layer.id, 'line-color', p.ground);
        }
      }
    } catch {
      // An optional layer in a custom style must never block the usable map.
    }
  }
  map.getContainer().dataset.bilooMapPalette = theme === 'dark' ? 'biloo-dark-v3' : 'biloo-streets-v2';
}
