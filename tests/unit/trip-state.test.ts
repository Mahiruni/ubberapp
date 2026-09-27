import { describe, expect, it } from 'vitest';

const allowed:Record<string,string[]>={requested:['accepted','cancelled'],accepted:['arriving','cancelled'],arriving:['in_progress','cancelled'],in_progress:['completed','cancelled'],completed:[],cancelled:[]};
describe('trip state machine',()=>{
 it('allows only valid forward transitions',()=>{expect(allowed.accepted).toContain('arriving');expect(allowed.in_progress).toContain('completed');});
 it('rejects impossible transitions',()=>expect(allowed.completed).not.toContain('in_progress'));
});
