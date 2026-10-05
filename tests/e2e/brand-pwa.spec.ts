import { expect, test } from "@playwright/test";

test("NexRide serves one coherent PWA and search identity", async ({ page, request }) => {
  await page.goto("/onboarding");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="icon"][href="/favicon.svg"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/apple-touch-icon.png",
  );
  await expect(page.locator('link[rel="mask-icon"]')).toHaveAttribute(
    "href",
    "/safari-pinned-tab.svg",
  );

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("NexRide");
  expect(manifest.short_name).toBe("NexRide");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["72x72", "96x96", "128x128", "144x144", "152x152", "192x192", "384x384", "512x512"]),
  );
  expect(manifest.icons.filter((icon: { purpose?: string }) => icon.purpose === "maskable").length).toBeGreaterThanOrEqual(3);

  for (const path of [
    "/favicon.ico",
    "/favicon-16x16.png",
    "/favicon-32x32.png",
    "/favicon-48x48.png",
    "/apple-touch-icon.png",
    "/safari-pinned-tab.svg",
    "/icons/icon-192.png",
    "/icons/icon-maskable-512.png",
  ]) {
    const response = await request.get(path);
    expect(response.ok(), path).toBeTruthy();
  }

  const og = await request.get("/opengraph-image");
  expect(og.ok()).toBeTruthy();
  expect(og.headers()["content-type"]).toContain("image/png");

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBeTruthy();
  expect(await robots.text()).toContain("sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBeTruthy();
  expect(await sitemap.text()).toContain("/discover");
});
