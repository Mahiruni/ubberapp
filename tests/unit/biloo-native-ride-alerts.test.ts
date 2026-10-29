import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>({available:true,configure:vi.fn(),present:vi.fn(),stop:vi.fn(),disable:vi.fn()}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=> 'android',isPluginAvailable:()=>native.available},registerPlugin:()=>native}));
const user='11111111-1111-4111-8111-111111111111', offer='22222222-2222-4222-8222-222222222222';
const preferences={sounds:true,haptics:true,rideRequests:true,messages:true,tripUpdates:true};
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();native.available=true;native.configure.mockResolvedValue({});native.present.mockResolvedValue({owned:true,displayed:true});native.stop.mockResolvedValue({});native.disable.mockResolvedValue({});vi.stubGlobal('window',new EventTarget());});
afterEach(()=>vi.unstubAllGlobals());
describe('Native ride alert handoff',()=>{
  it('serializes configuration, old-alert cancellation and new presentation',async()=>{
    const log:string[]=[];native.configure.mockImplementation(async()=>{await Promise.resolve();log.push('configure');});native.stop.mockImplementation(async()=>{log.push('stop');});native.present.mockImplementation(async()=>{log.push('present');return {owned:true,displayed:true};});
    const api=await import('../../lib/biloo-native-ride-alerts');
    const configure=api.configureNativeRideAlerts(user,true,preferences);
    const stop=api.stopNativeRideAlert();const present=api.presentNativeRideAlert(offer,new Date(Date.now()+20000).toISOString());
    await Promise.all([configure,stop,present]);expect(log).toEqual(['configure','stop','present']);expect(native.present.mock.calls[0][0].data.userId).toBe(user);
  });
  it('preserves the browser fallback on APKs that do not have the new native plugin',async()=>{
    native.available=false;const api=await import('../../lib/biloo-native-ride-alerts');expect(await api.presentNativeRideAlert(offer,new Date(Date.now()+20000).toISOString())).toEqual({owned:false,displayed:false});expect(native.present).not.toHaveBeenCalled();
  });
  it('does not bypass muted native settings with WebView audio when native display fails',async()=>{
    native.present.mockRejectedValue(new Error('permission denied'));const api=await import('../../lib/biloo-native-ride-alerts');await api.configureNativeRideAlerts(user,true,preferences);expect(await api.presentNativeRideAlert(offer,new Date(Date.now()+20000).toISOString())).toEqual({owned:true,displayed:false});
  });
  it('binds commands to the authenticated driver and consumes them only once',async()=>{
    const api=await import('../../lib/biloo-native-ride-alerts');const command={offerId:offer,userId:user,action:'accept' as const,expiresAt:Date.now()+10000};
    expect(api.queueNativeRideAction({...command,userId:'another-driver'},user)).toBeNull();expect(api.queueNativeRideAction(command,user)).toEqual(command);
    expect(api.takeNativeRideAction(offer,'another-driver')).toBeNull();expect(api.takeNativeRideAction(offer,user)).toEqual(command);expect(api.takeNativeRideAction(offer,user)).toBeNull();
  });
  it('rejects malformed commands, turns stale actions into read-only expiry, and clears on logout',async()=>{
    const api=await import('../../lib/biloo-native-ride-alerts');
    expect(api.queueNativeRideAction({offerId:'https://evil.test',userId:user,action:'accept',expiresAt:Date.now()+10000},user)).toBeNull();
    expect(api.queueNativeRideAction({offerId:offer,userId:user,action:'accept',expiresAt:Date.now()-1},user)?.action).toBe('expired');
    await api.disableNativeRideAlerts();expect(api.takeNativeRideAction(offer,user)).toBeNull();expect(native.disable).toHaveBeenCalledOnce();
  });
});
