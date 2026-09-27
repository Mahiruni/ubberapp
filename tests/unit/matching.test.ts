import { describe, expect, it } from 'vitest';

type Driver={id:string;online:boolean;approved:boolean;distance:number;busy:boolean};
const match=(drivers:Driver[])=>drivers.filter(d=>d.online&&d.approved&&!d.busy).sort((a,b)=>a.distance-b.distance);
describe('driver matching rules',()=>{
 it('excludes offline, unapproved and busy drivers',()=>expect(match([
  {id:'a',online:true,approved:true,distance:800,busy:false},
  {id:'b',online:false,approved:true,distance:100,busy:false},
  {id:'c',online:true,approved:false,distance:50,busy:false},
  {id:'d',online:true,approved:true,distance:200,busy:true},
 ])).toEqual([{id:'a',online:true,approved:true,distance:800,busy:false}]));
});
