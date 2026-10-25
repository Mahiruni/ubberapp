import { describe, expect, it } from 'vitest';
import { DRIVER_AVATAR_STYLES, VEHICLE_BODY_TYPES, driverAvatarProfile, driverMapAvatarSource, driverMapAvatarSvg, inferVehicleBodyType, normalizeDriverMapAvatar, resolveDriverMapAvatar } from '../../lib/biloo-driver-map-avatar';
import { VEHICLE_COLOR_OPTIONS } from '../../lib/nexride-vehicle';
import { GET } from '../../app/brand/driver-avatar/route';

describe('Registered Biloo map cars', () => {
  it.each([
    ['Toyota Corolla', 'sedan'], ['Toyota Yaris Sedan', 'sedan'], ['BYD Tang L', 'suv'], ['Toyota RAV4', 'suv'], ['Hyundai Tucson', 'suv'],
    ['Suzuki Swift', 'hatchback'], ['Toyota Vitz', 'hatchback'], ['BYD Dolphin', 'hatchback'],
    ['Toyota Hiace', 'van'], ['Toyota Noah', 'van'], ['unknown legacy model', 'sedan'],
  ])('gives %s a suitable legacy body default', (model, type) => expect(inferVehicleBodyType(model)).toBe(type));
  it('locks paint to the registered row and ignores stored paint/body overrides in the livery choice', () => {
    expect(resolveDriverMapAvatar({ model: 'BYD Tang L', color: 'Beige' }, {
      vehicle: 'BYD Tang L', vehicle_body_type: 'suv', vehicle_color: 'Red',
      biloo_driver_map_avatar: { style: 'goldline', color: 'Red', bodyType: 'van' },
    })).toEqual({ bodyType: 'suv', color: 'Beige', style: 'goldline' });
  });
  it('honors the body declared at registration only for the same registered model', () => {
    const metadata = { vehicle: 'Toyota Yaris Sedan', vehicle_body_type: 'sedan', biloo_driver_map_avatar: { style: 'executive' } };
    expect(resolveDriverMapAvatar({ model: ' TOYOTA  YARIS SEDAN ', color: 'Silver' }, metadata).bodyType).toBe('sedan');
    expect(resolveDriverMapAvatar({ model: 'Toyota Hiace', color: 'White' }, metadata).bodyType).toBe('van');
  });
  it('uses a neutral car when identity is missing and disables personalization until model and color exist', () => {
    expect(driverAvatarProfile({ model: '', color: '' }, {}).complete).toBe(false);
    expect(driverAvatarProfile({ model: 'Toyota', color: '' }, {}).complete).toBe(false);
    expect(driverAvatarProfile({ model: 'Toyota', color: 'White' }, {}).complete).toBe(true);
    expect(normalizeDriverMapAvatar(null)).toEqual({ bodyType: 'sedan', color: '', style: 'signature' });
  });
  it('renders every supported body, registered color and Biloo finish without external content', () => {
    const sources = new Set<string>();
    for (const body of VEHICLE_BODY_TYPES) for (const color of VEHICLE_COLOR_OPTIONS) for (const style of DRIVER_AVATAR_STYLES) {
      const value = { bodyType: body.value, color: color.value, style: style.value };
      const svg = driverMapAvatarSvg(value);
      expect(svg).toContain('>biloo</text>'); expect(svg).toContain('feDropShadow');
      expect(svg).toContain(`Biloo ${body.value} map avatar`);
      expect(svg).not.toMatch(/<script|<foreignObject|href=|https?:\/\/(?!www.w3.org)/);
      sources.add(driverMapAvatarSource(value));
    }
    expect(sources.size).toBe(144);
  });
  it('sanitizes asset route parameters and serves a public image without user identity', async () => {
    const attack = '<script>alert(1)</script>';
    const response = GET(new Request(`https://example.test/brand/driver-avatar?bodyType=${encodeURIComponent(attack)}&color=${encodeURIComponent(attack)}&style=${encodeURIComponent(attack)}`));
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toContain('public');
    const svg = await response.text(); expect(svg).not.toContain(attack); expect(svg).not.toContain('<script');
  });
});
