import { describe,it,expect } from "vitest";
import {
 nextNexRideManeuver,nexrideVoiceBand,nexrideSpokenManeuver,validVoiceFix,
 type NavPoint,type NavStep,
} from "../../lib/nexride-navigation-guidance";

const origin:NavPoint={lat:9,lng:38.75};
const route:NavPoint[]=[origin,{lat:9.001,lng:38.75},{lat:9.002,lng:38.75},
  {lat:9.002,lng:38.751},{lat:9.002,lng:38.752}];
const steps:NavStep[]=[
 {type:"depart",instruction:"Head north",maneuver:origin},
 {type:"turn",modifier:"right",instruction:"Turn right onto Main St",maneuver:route[2]},
 {type:"arrive",instruction:"Arrive at your destination",maneuver:route[4]},
];
describe("Phase 2 driver voice navigation",()=>{
  it("projects the next maneuver onto actual road geometry, not the step leg distance",()=>{
    const m=nextNexRideManeuver(route,steps,{lat:9.001,lng:38.75});
    expect(m?.step.instruction).toBe("Turn right onto Main St");
    expect(m?.distanceMeters).toBeGreaterThan(105);
    expect(m?.distanceMeters).toBeLessThan(118);
  });
  it("advances past a maneuver already behind the driver",()=>{
    const m=nextNexRideManeuver(route,steps,{lat:9.002,lng:38.7512});
    expect(m?.step.type).toBe("arrive");
  });
  it("pauses spoken guidance when GPS is off route or stale",()=>{
    expect(nextNexRideManeuver(route,steps,{lat:9.01,lng:38.75})).toBeNull();
    const now=1_790_000_000_000;
    expect(validVoiceFix({accuracy:10,timestamp:now-4000},"fresh",now)).toBe(true);
    expect(validVoiceFix({accuracy:10,timestamp:now-18000},"fresh",now)).toBe(false);
    expect(validVoiceFix({accuracy:100,timestamp:now},"fresh",now)).toBe(false);
    expect(validVoiceFix({accuracy:10,timestamp:now},"lost",now)).toBe(false);
  });
  it("announces only within route-based approach bands",()=>{
    expect(nexrideVoiceBand(400)).toBeNull();
    expect(nexrideVoiceBand(320)).toBe("advance");
    expect(nexrideVoiceBand(100)).toBe("near");
    expect(nexrideVoiceBand(30)).toBe("now");
  });
  it("speaks direction and distance in selected language",()=>{
    const m=nextNexRideManeuver(route,steps,{lat:9.001,lng:38.75})!;
    expect(nexrideSpokenManeuver(m,"near","en")).toContain("Turn right onto Main St");
    expect(nexrideSpokenManeuver(m,"near","am")).toContain("ወደ ቀኝ");
    expect(nexrideSpokenManeuver(m,"near","am")).not.toContain("Main St");
  });
});
