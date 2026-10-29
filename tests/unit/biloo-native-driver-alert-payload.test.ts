import { describe, expect, it } from 'vitest';
import { nativeDriverAlertData } from '../../lib/biloo-native-driver-alert-payload';
const now=1800000000000;
const event={kind:'driver_offer' as const,id:'event',user_id:'driver',offer_id:'offer'};
const offer={id:'offer',driver_id:'driver',expires_at:new Date(now+12000).toISOString(),created_at:new Date(now-18000).toISOString(),pickup_distance_km:2.36,pickup_eta_minutes:6};
describe('Native incoming offer protocol',()=>{
  it('uses the actual deadline and genuine pickup/payout values without exposing rider identity',()=>{
    const data=nativeDriverAlertData(event,offer,{pickup_location:'Bethel Hospital',estimated_driver_payout_etb:328.8},now);
    expect(data).toMatchObject({alertProtocol:'1',kind:'driver_offer',offerId:'offer',userId:'driver',expiresAtMs:String(now+12000),issuedAtMs:String(now-18000),pickup:'Bethel Hospital',detail:'2.4 km · 6 min · ETB 329'});
    expect(Object.values(data).every(value=>typeof value==='string')).toBe(true);
    expect(data).not.toHaveProperty('riderId');expect(data).not.toHaveProperty('token');
  });
  it('does not invent a driver payout from the passenger fare or missing/non-finite fields',()=>{
    expect(nativeDriverAlertData(event,{...offer,pickup_distance_km:NaN,pickup_eta_minutes:null},{estimated_trip_fare_etb:999},now).detail).toBe('');
    expect(nativeDriverAlertData(event,offer,{pickup_location:'x'.repeat(1000)+'\n'},now).pickup.length).toBe(120);
  });
  it('rejects expired and incorrectly owned offers before they can become actionable',()=>{
    expect(()=>nativeDriverAlertData(event,{...offer,driver_id:'another-driver'},null,now)).toThrow('invalid_native_offer');
    expect(()=>nativeDriverAlertData(event,{...offer,expires_at:new Date(now).toISOString()},null,now)).toThrow('invalid_native_offer');
  });
  it('sends cancellations without private pickup data or a new notification',()=>{
    const data=nativeDriverAlertData({...event,kind:'driver_offer_closed'},null,null,now);
    expect(data).toMatchObject({kind:'driver_offer_closed',offerId:'offer',userId:'driver'});
    expect(data).not.toHaveProperty('pickup');expect(data).not.toHaveProperty('url');expect(data).not.toHaveProperty('expiresAtMs');
  });
});
