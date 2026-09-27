import {describe,expect,it} from 'vitest';
import {haversineMeters,formatDistance,formatDuration} from './location';
describe('location intelligence',()=>{
 it('calculates geodesic fallback distance',()=>expect(haversineMeters({lat:9.03,lng:38.74},{lat:9.04,lng:38.75})).toBeGreaterThan(1000));
 it('formats distance and duration',()=>{expect(formatDistance(950)).toBe('950 m');expect(formatDistance(3200)).toBe('3.2 km');expect(formatDuration(3660)).toBe('1h 1m')});
});
