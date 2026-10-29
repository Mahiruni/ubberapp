import { describe, expect, it } from 'vitest';
import type { LayerSpecification, Map as MapboxMap, StyleSpecification } from 'mapbox-gl';
const { expression, validate } = require('mapbox-gl/dist/style-spec/index.cjs') as typeof import('mapbox-gl/dist/style-spec/index.d.ts');
import { applyBilooCityMapPalette, BILOO_CITY_PALETTES, BILOO_RIDER_PALETTES, BILOO_DRIVER_PALETTES } from '../../lib/biloo-map-palette';

const roadWidth = ['interpolate', ['exponential', 1.5], ['zoom'], 5, ['match', ['get', 'class'], 'primary', .5, 0], 16, ['match', ['get', 'class'], 'primary', 12, 6]];
const initial = (): StyleSpecification => ({
  version: 8, glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  sources: { city: { type: 'vector', url: 'mapbox://mapbox.mapbox-streets-v8' }, 'nexride-trips': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } } },
  layers: [
    { id: 'land', type: 'background', paint: { 'background-color': '#f5f6f7' } },
    { id: 'landuse', type: 'fill', source: 'city', 'source-layer': 'landuse', paint: { 'fill-color': '#ddd', 'fill-opacity': .8 } },
    { id: 'water', type: 'fill', source: 'city', 'source-layer': 'water' },
    { id: 'building', type: 'fill', source: 'city', 'source-layer': 'building' },
    { id: 'road-simple', type: 'line', source: 'city', 'source-layer': 'road', minzoom: 5, filter: ['!=', ['get', 'class'], 'construction'], paint: { 'line-color': '#fff', 'line-width': roadWidth } },
    { id: 'bridge-case-simple', type: 'line', source: 'city', 'source-layer': 'road', paint: { 'line-color': '#eee', 'line-width': 8 } },
    { id: 'road-label-simple', type: 'symbol', source: 'city', 'source-layer': 'road', layout: { 'text-field': ['get', 'name'], 'text-size': 12 }, paint: { 'text-color': '#888' } },
    { id: 'nexride-route-line', type: 'line', source: 'nexride-trips', paint: { 'line-color': '#f9c449', 'line-width': 5 } },
    { id: 'custom-trip-layer', type: 'line', source: 'nexride-trips', paint: { 'line-color': '#00a366' } },
    { id: 'live-traffic', type: 'line', source: 'city', 'source-layer': 'road', paint: { 'line-color': '#dc3f45' } },
    { id: 'road-construction', type: 'line', source: 'city', 'source-layer': 'road', paint: { 'line-color': '#f08a24' } },
  ] as LayerSpecification[],
});

function fakeMap() {
  const style = initial();
  const dataset: Record<string, string> = {};
  const map = {
    getStyle: () => style,
    getContainer: () => ({ dataset }),
    getLayer: (id: string) => style.layers.find(layer => layer.id === id),
    setPaintProperty: (id: string, key: string, value: unknown) => {
      const layer = style.layers.find(candidate => candidate.id === id)!;
      Object.assign(layer.paint ??= {}, { [key]: value });
    },
    addLayer: (layer: LayerSpecification, before: string) => { style.layers.splice(style.layers.findIndex(candidate => candidate.id === before), 0, layer); },
  };
  return { map: map as unknown as MapboxMap, style, dataset, layer: (id: string) => style.layers.find(layer => layer.id === id)! };
}

function evaluate(value: unknown, properties: Record<string, unknown>, zoom = 16): unknown {
  const compiled = expression.createExpression(value);
  expect(compiled.result).toBe('success');
  if (compiled.result !== 'success') throw new Error('Invalid map expression');
  return compiled.value.evaluate({ zoom }, { type: 'Polygon', properties });
}

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

describe('Biloo city cartography', () => {
  for (const theme of ['streets', 'dark'] as const) {
    it(`validates Driver ${theme} road/label contrast without changing map geography`, () => {
      const { map, style } = fakeMap();
      applyBilooCityMapPalette(map, theme, 'driver');
      expect(validate(style).map(error => error.message)).toEqual([]);
      expect(style.sources).toEqual(initial().sources);
      const p = BILOO_DRIVER_PALETTES[theme];
      for (const pair of [[p.label,p.ground], [p.secondaryLabel,p.ground], [p.streetLabel,p.road], [p.streetLabel,p.roadMajor], [p.parkLabel,p.park]])
        expect(contrast(...pair as [string,string])).toBeGreaterThanOrEqual(4.5);
    });
  }
  for (const theme of ['streets', 'dark'] as const) {
    it(`validates Rider ${theme} styling, label contrast and Driver isolation`, () => {
      const rider = fakeMap(), driver = fakeMap();
      applyBilooCityMapPalette(rider.map, theme, 'rider');
      applyBilooCityMapPalette(driver.map, theme);
      expect(validate(rider.style).map(error => error.message)).toEqual([]);
      const p = BILOO_RIDER_PALETTES[theme];
      for (const pair of [[p.label, p.ground], [p.secondaryLabel, p.ground], [p.streetLabel, p.road], [p.waterLabel, p.water], [p.parkLabel, p.park]])
        expect(contrast(...pair as [string, string])).toBeGreaterThanOrEqual(4.5);
      expect((driver.layer('land').paint as Record<string, unknown>)['background-color']).toBe(BILOO_CITY_PALETTES[theme].ground);
      expect(rider.style.sources).toEqual(initial().sources);
    });
  }
  for (const theme of ['streets', 'dark'] as const) {
    it(`${theme} expressions pass the installed Mapbox style validator`, () => {
      const { map, style, dataset } = fakeMap();
      applyBilooCityMapPalette(map, theme);
      expect(validate(style).map(error => error.message)).toEqual([]);
      expect(dataset.bilooMapPalette).toBe(theme === 'dark' ? 'biloo-dark-v3' : 'biloo-streets-v2');
    });

    it(`${theme} labels remain readable on land, streets, water and parks`, () => {
      const p = BILOO_CITY_PALETTES[theme];
      for (const pair of [[p.label, p.ground], [p.secondaryLabel, p.ground], [p.streetLabel, p.road], [p.streetLabel, p.roadMajor], [p.waterLabel, p.water], [p.parkLabel, p.park]]) expect(contrast(...pair as [string, string])).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('colors combined landuse features individually instead of flattening parks into the city background', () => {
    const { map, layer } = fakeMap();
    applyBilooCityMapPalette(map, 'streets');
    const paint = layer('landuse').paint as Record<string, unknown>;
    expect(evaluate(paint['fill-color'], { class: 'park' })).toBe(BILOO_CITY_PALETTES.streets.park);
    expect(evaluate(paint['fill-color'], { class: 'wood' })).toBe(BILOO_CITY_PALETTES.streets.woodland);
    expect(evaluate(paint['fill-color'], { class: 'residential' })).toBe(BILOO_CITY_PALETTES.streets.residential);
    expect(paint['fill-opacity']).toBe(.8);
  });

  it('adds a road edge below the original street while preserving geometry, filter, widths and low-zoom hiding', () => {
    const { map, layer, style } = fakeMap();
    const original = structuredClone(layer('road-simple'));
    applyBilooCityMapPalette(map, 'streets');
    const casing = layer('biloo-city-casing-road-simple');
    expect(style.layers.indexOf(casing)).toBe(style.layers.indexOf(layer('road-simple')) - 1);
    expect(casing).toMatchObject({ source: 'city', 'source-layer': 'road', minzoom: 5, filter: original.filter });
    const paint = casing.paint as Record<string, unknown>;
    expect(evaluate(paint['line-width'], { class: 'street' }, 5)).toBe(0);
    expect(evaluate(paint['line-width'], { class: 'primary' }, 5)).toBeCloseTo(1.9);
    expect((layer('road-simple').paint as Record<string, unknown>)['line-width']).toEqual(roadWidth);
  });

  it('preserves route colors, traffic status, warnings and other application source layers', () => {
    const { map, style } = fakeMap();
    const untouched = structuredClone(style.layers.slice(7));
    applyBilooCityMapPalette(map, 'streets');
    expect(style.layers.filter(layer => untouched.some(original => original.id === layer.id))).toEqual(untouched);
  });

  it('reapplies day/night styles without duplicating road edges', () => {
    const { map, style, layer } = fakeMap();
    applyBilooCityMapPalette(map, 'streets');
    applyBilooCityMapPalette(map, 'dark');
    expect(style.layers.filter(layer => layer.id === 'biloo-city-casing-road-simple')).toHaveLength(1);
    expect(evaluate((layer('road-simple').paint as Record<string, unknown>)['line-color'], { class: 'primary' })).toBe(BILOO_CITY_PALETTES.dark.roadMajor);
  });

  it('keeps satellite imagery untouched', () => {
    const { map, style, dataset } = fakeMap();
    const before = structuredClone(style);
    applyBilooCityMapPalette(map, 'satellite');
    expect(style).toEqual(before);
    expect(dataset.bilooMapPalette).toBe('satellite');
  });
});
