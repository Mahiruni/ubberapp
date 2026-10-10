import { afterEach, describe, expect, it, vi } from "vitest";
import { nexrideAuthRedirectUrl } from "../../lib/nexride-auth-url";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("auth email redirects", () => {
  it.each([undefined, "", "http://localhost:3000", "http://127.0.0.1:3000", "invalid", "https://preview.vercel.app"])(
    "uses production routes even with app URL %s and a local browser origin",
    (appUrl) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
      vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
      for (const path of ["/rider/sign-in?confirmed=1", "/driver/auth?confirmed=1", "/rider/reset-password"]) {
        expect(nexrideAuthRedirectUrl(path)).toBe(`https://ubberapp.vercel.app${path}`);
      }
    },
  );

  it("uses production on the server without a configured URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
    vi.stubGlobal("window", undefined);
    expect(nexrideAuthRedirectUrl("/rider/reset-password")).toBe("https://ubberapp.vercel.app/rider/reset-password");
  });

  it.each(["https://example.com/auth", "//localhost/auth", "/\\localhost/auth", "rider/sign-in"])(
    "rejects redirect destinations outside the application: %s",
    (path) => {
      vi.stubEnv("NODE_ENV", "production");
      expect(() => nexrideAuthRedirectUrl(path)).toThrow("Auth redirects must use a path");
    },
  );

  it("supports the local browser origin during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    expect(nexrideAuthRedirectUrl("/rider/reset-password")).toBe("http://localhost:3000/rider/reset-password");
  });
});
