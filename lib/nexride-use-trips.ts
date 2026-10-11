'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { isActiveTrip, riderTripList } from './nexride-trip-service';
import { storeRiderTrips, readRiderTrips } from './nexride-offline-recovery';
import { ALERTS_KEY } from './nexride-account';
import type { Row } from './nexride-trip-data';

export function useRiderTrips() {
  const [userId,setUserId] = useState<string|null>(null);
  const [rows,setRows] = useState<Row[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState(false);
  const [cached,setCached] = useState(false);
  const identity = useRef<string|null>(null);

  useEffect(() => {
    let alive=true;
    const acceptIdentity=(nextId:string|null)=>{
      if (!alive || identity.current===nextId) return;
      identity.current=nextId;
      const saved=nextId ? readRiderTrips(window.localStorage,nextId) : [];
      setRows(saved);
      setCached(saved.length>0);
      setUserId(nextId);
      setLoading(Boolean(nextId) && saved.length===0);
      setError(false);
    };
    void supabase.auth.getSession().then(({data})=>{
      if (!alive) return;
      const nextId=data.session?.user.id||null;
      if (identity.current===null && nextId===null) {setLoading(false);return;}
      acceptIdentity(nextId);
    });
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      acceptIdentity(session?.user.id||null);
    });
    return ()=>{alive=false;data.subscription.unsubscribe();};
  },[]);

  const refresh=useCallback(async()=>{
    if (!userId || !navigator.onLine) return;
    try {
      const next=await riderTripList(userId);
      if (identity.current===userId) {
        storeRiderTrips(window.localStorage,userId,next);
        setRows(next);setCached(false);setError(false);
      }
    } catch {
      if (identity.current===userId) setError(true);
    } finally {
      if (identity.current===userId) setLoading(false);
    }
  },[userId]);

  useEffect(()=>{
    if (!userId) return;
    let stopped=false,pending=false;
    let previous:Map<string,string>|null=null;
    const cachedRows=readRiderTrips(window.localStorage,userId);
    if (cachedRows.length) previous=new Map(cachedRows.map(row=>[row.id,row.state]));
    const accept=(next:Row[])=>{
      if (previous && next.some(row=>previous!.has(String(row.id)) && previous!.get(String(row.id))!==String(row.state))) {
        let enabled=true;
        try {enabled=localStorage.getItem(ALERTS_KEY)!=='off';} catch {}
        if (enabled) window.dispatchEvent(new Event('nexride:trip-alert'));
      }
      previous=new Map(next.map(row=>[String(row.id),String(row.state)]));
      storeRiderTrips(window.localStorage,userId,next);
      setRows(next);setCached(false);setError(false);
    };
    const load=async()=>{
      if (stopped || pending) return;
      if (!navigator.onLine) {
        setError(true);setLoading(false);
        return;
      }
      pending=true;
      try {
        const next=await riderTripList(userId);
        if (!stopped && identity.current===userId) accept(next);
      } catch {
        if (!stopped && identity.current===userId) {
          setError(true);
          // Preserve the last confirmed list; don't imply the trip progressed.
          setRows(current=>current.length ? current : readRiderTrips(window.localStorage,userId));
          setCached(true);
        }
      } finally {
        pending=false;
        if (!stopped) setLoading(false);
      }
    };
    void load();
    const channel=supabase.channel(`rider-trips:${userId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'ride_requests',filter:`rider_id=eq.${userId}`},()=>void load())
      .subscribe();
    const interval=window.setInterval(()=>void load(),15000);
    const onOnline=()=>void load();
    const onVisible=()=>{if(document.visibilityState==='visible') void load();};
    window.addEventListener('online',onOnline);
    document.addEventListener('visibilitychange',onVisible);
    return ()=>{
      stopped=true;window.clearInterval(interval);
      window.removeEventListener('online',onOnline);
      document.removeEventListener('visibilitychange',onVisible);
      void supabase.removeChannel(channel);
    };
  },[userId]);

  return {userId,rows,loading,error,cached,refresh,active:rows.find(isActiveTrip)||null};
}
