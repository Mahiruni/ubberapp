import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({owned:true,present:vi.fn(),stop:vi.fn()}));
vi.mock('../../lib/biloo-native-ride-alerts',()=>({nativeRideAlertsPlugin:async()=>native.owned?{}:null,presentNativeRideAlert:native.present,stopNativeRideAlert:native.stop}));
let played:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 vi.resetModules();vi.clearAllMocks();vi.useFakeTimers();native.owned=true;
 native.present.mockImplementation(async()=>({owned:native.owned,displayed:native.owned}));native.stop.mockResolvedValue(undefined);
 const target=new EventTarget();Object.assign(target,{localStorage:{getItem:()=>null,setItem:()=>{}}});vi.stubGlobal('window',target);
 vi.stubGlobal('document',{hidden:false});vi.stubGlobal('navigator',{vibrate:vi.fn()});vi.stubGlobal('Notification',undefined);
 played=vi.fn().mockResolvedValue(undefined);
 vi.stubGlobal('Audio',class{loop=false;preload='';volume=1;currentTime=0;play=played;pause=vi.fn();});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('One ringtone owner across native push and the WebView',()=>{
 it('does not cancel a native push when the same request opens in the WebView',async()=>{
  const feedback=await import('../../lib/nexride-feedback');feedback.startRideRequestAlert('offer-a',new Date(Date.now()+20000).toISOString());await vi.advanceTimersByTimeAsync(0);
  expect(native.present).toHaveBeenCalledOnce();expect(native.stop).not.toHaveBeenCalled();expect(played).not.toHaveBeenCalled();
  await feedback.primeNexRideAudio();expect(played).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(20000);expect(native.stop).toHaveBeenCalledWith('offer-a');
 });
 it('retains a single bounded browser ringtone on the web and older APKs',async()=>{
  native.owned=false;const feedback=await import('../../lib/nexride-feedback');const end=new Date(Date.now()+12000).toISOString();
  feedback.startRideRequestAlert('offer-a',end);await vi.advanceTimersByTimeAsync(0);feedback.startRideRequestAlert('offer-a',end);
  expect(played).toHaveBeenCalledOnce();expect(native.present).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(12000);expect(feedback.isRideRequestAlertActive()).toBe(false);
 });
 it('forwards scoped closures even when JavaScript never saw the native request',async()=>{
  const feedback=await import('../../lib/nexride-feedback');feedback.stopRideRequestAlert('native-background-offer');expect(native.stop).toHaveBeenCalledWith('native-background-offer');
 });
});
