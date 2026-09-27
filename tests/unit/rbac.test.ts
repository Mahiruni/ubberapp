import { describe, expect, it } from 'vitest';

const canMutate=(role:string,action:string)=>({
 super_admin:['driver_review','cancel_trip','safety'],
 operations:['driver_review','cancel_trip','safety'],
 support:['cancel_trip','safety'],
 finance:[]
}[role]||[]).includes(action);
describe('admin RBAC policy model',()=>{
 it('restricts driver review to operations roles',()=>{expect(canMutate('operations','driver_review')).toBe(true);expect(canMutate('support','driver_review')).toBe(false);});
 it('restricts finance from operational mutations',()=>expect(canMutate('finance','cancel_trip')).toBe(false));
});
