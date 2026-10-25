import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createDriverAuthStorage, type NativeSessionBridge } from '../../lib/biloo-native-auth-storage';

const key='sb-example-auth-token';
function fixture(native: NativeSessionBridge | null = null) {
  const values=new Map<string,string>();
  const local={ getItem:(name:string)=>values.get(name)??null, setItem:(name:string,value:string)=>{values.set(name,value);}, removeItem:(name:string)=>{values.delete(name);} };
  return { values, local, storage:createDriverAuthStorage({key,origin:'https://example.supabase.co',publishableKey:'sb_publishable_test',local:()=>local,native:()=>native}) };
}
function pending<T>() { let resolve!:(value:T)=>void; const promise=new Promise<T>(done=>{resolve=done;}); return {promise,resolve}; }
describe('Driver native auth storage',()=>{
  it('retains ordinary storage for web and non-session keys',async()=>{
    const f=fixture(); await f.storage.setItem(key,'session'); expect(await f.storage.getItem(key)).toBe('session');
    await f.storage.removeItem(key); expect(await f.storage.getItem(key)).toBeNull();
    const bridge={resolveSession:vi.fn(),clearSession:vi.fn()}; const other=fixture(bridge);
    await other.storage.setItem(key+'-code-verifier','verifier'); expect(await other.storage.getItem(key+'-code-verifier')).toBe('verifier');
    expect(bridge.resolveSession).not.toHaveBeenCalled();
  });
  it('returns and caches rotated native tokens before exposing a stale browser session',async()=>{
    const bridge={resolveSession:vi.fn().mockResolvedValue({session:'latest-native'}),clearSession:vi.fn()};
    const f=fixture(bridge); f.values.set(key,'old-browser');
    expect(await f.storage.getItem(key)).toBe('latest-native'); expect(f.values.get(key)).toBe('latest-native');
    expect(bridge.resolveSession).toHaveBeenCalledWith(expect.objectContaining({session:'old-browser',writing:false}));
  });
  it('cannot resurrect a session when logout overtakes a native read',async()=>{
    const read=pending<{session:string|null}>();
    const bridge={resolveSession:vi.fn().mockReturnValue(read.promise),clearSession:vi.fn().mockResolvedValue({})};
    const f=fixture(bridge); f.values.set(key,'old'); const result=f.storage.getItem(key);
    await f.storage.removeItem(key); read.resolve({session:'late-token'});
    expect(await result).toBeNull(); expect(f.values.has(key)).toBe(false); expect(bridge.clearSession).toHaveBeenCalledOnce();
  });
  it('does not overwrite a later sign-in when an older write resolves',async()=>{
    const first=pending<{session:string|null}>();
    const bridge={resolveSession:vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce({session:'new-login'}),clearSession:vi.fn()};
    const f=fixture(bridge); const previous=f.storage.setItem(key,'old-login');
    await f.storage.setItem(key,'new-login'); first.resolve({session:'old-result'}); await previous;
    expect(f.values.get(key)).toBe('new-login');
  });
  it('removes revoked credentials instead of refreshing an obsolete browser token',async()=>{
    const f=fixture({resolveSession:vi.fn().mockResolvedValue({session:null}),clearSession:vi.fn()}); f.values.set(key,'old');
    expect(await f.storage.getItem(key)).toBeNull(); expect(f.values.has(key)).toBe(false);
  });
  it('supports older APKs without the new session methods',async()=>{
    const bridge={resolveSession:vi.fn().mockRejectedValue({code:'UNIMPLEMENTED'}),clearSession:vi.fn()};
    const f=fixture(bridge); f.values.set(key,'legacy-session');
    expect(await f.storage.getItem(key)).toBe('legacy-session'); expect(await f.storage.getItem(key)).toBe('legacy-session');
    expect(bridge.resolveSession).toHaveBeenCalledOnce();
  });
  it('fails closed when the native credential vault cannot be read',async()=>{
    const f=fixture({resolveSession:vi.fn().mockRejectedValue(new Error('vault unavailable')),clearSession:vi.fn()}); f.values.set(key,'obsolete-token');
    expect(await f.storage.getItem(key)).toBeNull(); expect(f.values.has(key)).toBe(false);
  });
  it('hands a fresh native session to the real Supabase SDK before it can refresh the stale token',async()=>{
    const seconds=Math.floor(Date.now()/1000);
    const session=(expiry:number,refresh:string)=>({access_token:'test-access-token',refresh_token:refresh,expires_at:expiry,expires_in:3600,token_type:'bearer',user:{id:'driver-a',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}});
    const bridge={resolveSession:vi.fn().mockResolvedValue({session:JSON.stringify(session(seconds+3600,'native-latest'))}),clearSession:vi.fn()};
    const f=fixture(bridge); f.values.set(key,JSON.stringify(session(seconds-3600,'obsolete-browser-refresh')));
    const fetcher=vi.fn().mockRejectedValue(new Error('must not refresh the obsolete token'));
    const client=createClient('https://example.supabase.co','sb_publishable_test',{auth:{storageKey:key,storage:f.storage,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:fetcher}});
    const {data,error}=await client.auth.getSession();
    expect(error).toBeNull(); expect(data.session?.refresh_token).toBe('native-latest'); expect(fetcher).not.toHaveBeenCalled();
  });
});
