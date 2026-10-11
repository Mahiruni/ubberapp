import { describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { portraitCrop, validateDriverPhoto } from '../../lib/nexride-driver-portrait';
describe('Driver portrait validation and crop', () => {
  it('accepts JPEG, PNG, WebP originals up to 25 MB for compression', () => {
    for (const type of ['image/jpeg','image/png','image/webp']) expect(validateDriverPhoto({ type, size: 25*1024*1024 })).toBeNull();
  });
  it('rejects SVG, executable content, empty and oversized originals', () => {
    for (const type of ['image/svg+xml','application/javascript','image/gif','']) expect(validateDriverPhoto({ type, size: 100 })).toBe('photoInvalidType');
    for (const size of [0,-1,NaN,Infinity,25*1024*1024+1]) expect(validateDriverPhoto({ type: 'image/jpeg', size })).toBe('photoInvalidSize');
  });
  it('keeps the preview and saved crop inside landscape and portrait boundaries', () => {
    expect(portraitCrop(1200,800,1,0,0)).toEqual({ side:800,x:200,y:0 });
    expect(portraitCrop(800,1200,2,100,-100)).toEqual({ side:400,x:400,y:0 });
    expect(portraitCrop(800,1200,2,-100,100)).toEqual({ side:400,x:0,y:800 });
  });
});
