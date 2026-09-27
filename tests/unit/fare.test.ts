import { describe, expect, it } from 'vitest';

function fare(base:number, perKm:number, distanceKm:number, perMinute:number, minutes:number){
  return Math.round(base + perKm*distanceKm + perMinute*minutes);
}
describe('fare calculation',()=>{
 it('calculates deterministic minor units',()=>expect(fare(500,250,4,30,10)).toBe(1800));
 it('supports zero distance',()=>expect(fare(500,250,0,30,10)).toBe(800));
});
