import { describe, expect, it } from "vitest";
import {
  consumeNexRideBackHandlers,
  nexrideSafeParentPath,
  registerNexRideBackHandler,
} from "../../lib/nexride-native-navigation";

describe("one native back action and role-safe routing", () => {
  it("closes overlays before sheets/screens and does not fire lower handlers", () => {
    const calls: string[] = [];
    const closeScreen = registerNexRideBackHandler(() => { calls.push("screen"); return true; }, 20);
    const closeSheet = registerNexRideBackHandler(() => { calls.push("sheet"); return true; }, 65);
    const closeTop = registerNexRideBackHandler(() => { calls.push("overlay"); return true; }, 90);
    expect(consumeNexRideBackHandlers()).toBe(true);
    expect(calls).toEqual(["overlay"]);
    closeTop();
    expect(consumeNexRideBackHandlers()).toBe(true);
    expect(calls).toEqual(["overlay", "sheet"]);
    closeSheet();
    closeScreen();
    expect(consumeNexRideBackHandlers()).toBe(false);
  });

  it("never returns from a Driver account or trip route to stale authentication history", () => {
    expect(nexrideSafeParentPath("/driver/profile/settings")).toBe("/driver/profile");
    expect(nexrideSafeParentPath("/driver/earnings/report")).toBe("/driver/earnings");
    expect(nexrideSafeParentPath("/driver/navigation", "?offer=123")).toBe("/driver/home");
    expect(nexrideSafeParentPath("/driver/activity")).toBe("/driver/home");
    expect(nexrideSafeParentPath("/driver/home")).toBe(null);
    expect(nexrideSafeParentPath("/driver")).toBe(null);
    expect(nexrideSafeParentPath("/")).toBe(null);
    expect(nexrideSafeParentPath("/rider/sign-up")).toBe("/rider");
  });

  it("keeps chat and safety Back navigation in the correct application role", () => {
    expect(nexrideSafeParentPath("/trip/chat", "?role=driver")).toBe("/driver/home");
    expect(nexrideSafeParentPath("/trip/chat", "?role=rider")).toBe("/");
    expect(nexrideSafeParentPath("/support", "?role=driver")).toBe("/driver/home");
    expect(nexrideSafeParentPath("/support", "?role=rider")).toBe("/");
  });
});
