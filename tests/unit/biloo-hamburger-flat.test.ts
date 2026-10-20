import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("Biloo hamburgers use direct Account and Help navigation", () => {
  const rider = read("components/nexride/rider-menu.tsx");
  const driver = read("components/nexride/driver-app-shell.tsx");
  const layout = read("app/layout.tsx");
  const css = read("app/biloo-menu-refinement.css");

  it("shows Rider Account, Settings, Safety and Support without accordion expansion", () => {
    expect(rider).not.toContain("<MenuGroup");
    expect(rider).toContain('aria-label={say("Account and settings"');
    expect(rider).toContain('aria-label={say("Help and safety"');
    expect(rider).toContain("renderRows(items.slice(6,8))");
    expect(rider).toContain("renderRows(items.slice(4,6))");
    expect(rider).toContain('<Icon name="chevron" size={16} />');
  });

  it("shows direct Driver Account and Help links and retains the optional management group", () => {
    expect(driver).not.toContain('"ACCOUNT & HELP"');
    expect(driver).toContain('aria-label={language === "am" ? "መለያ እና ቅንብሮች" : "Account and settings"}');
    expect(driver).toContain('aria-label={language === "am" ? "ድጋፍ እና ደህንነት" : "Help and safety"}');
    expect(driver).toContain("menuRows(accountItems)");
    expect(driver).toContain("menuRows(supportItems)");
    expect(driver).toContain('href="/account/manage?role=driver"');
    expect(driver).toContain('href="/safety?role=driver"');
    expect(driver).toContain('"DRIVER MANAGEMENT"');
    expect(driver).toContain('"LANGUAGE"');
  });

  it("standardizes menu icons, row focus states, and reduced motion", () => {
    expect(layout).toContain('import "./biloo-menu-refinement.css";');
    expect(css).toContain(".nr-rider-drawer-icon");
    expect(css).toContain(".nr-driver-menu-row-icon");
    expect(css).toContain(".nr-driver-menu-utility-icon");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("--biloo-menu-gold: #f9c449");
  });
});
