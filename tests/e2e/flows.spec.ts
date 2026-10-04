import { test, expect } from "@playwright/test";

test("rider can complete an explicitly labeled preview and save a rating", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Preview mode", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bole Airport", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your ride" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Comfort/ }).click();
  await page.getByRole("button", { name: /Preview this ride/ }).click();
  await expect(
    page.getByRole("heading", { name: "Finding your driver…" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Meet your driver" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("not connected");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Preview trip in progress" }).click();
  await page.getByRole("button", { name: "Finish preview trip" }).click();
  await expect(
    page.getByRole("heading", { name: "You’ve arrived." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "5 / 5" }).click();
  await page.getByRole("button", { name: "Save preview rating" }).click();
  await expect(page.getByRole("status")).toContainText("Rating saved");
  await page.reload();
  const trip = await page.evaluate(
    () => JSON.parse(localStorage.getItem("nexride-preview-v2")!).trip,
  );
  expect(trip).toMatchObject({ completed: true, rating: 5, ride: "comfort" });
});

test("driver request, navigation and sample earnings stay available across account navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Account", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Switch to driver" }).click();
  await expect(page.locator(".nr-app")).toHaveAttribute("data-mode", "driver");
  await page
    .getByRole("button", { name: "Preview going online", exact: true })
    .click();
  await page.getByRole("button", { name: "View sample request" }).click();
  await page.getByRole("button", { name: "Accept preview" }).click();
  await page.getByRole("button", { name: "Start preview trip" }).click();
  await page.getByRole("button", { name: "Finish preview trip" }).click();
  await expect(page.getByText("1,397")).toBeVisible();
  await page
    .getByRole("button", { name: "Account", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Earnings", exact: true })
    .last()
    .click();
  await expect(page.getByText("1,397")).toBeVisible();
});

test("Amharic, profile edits, keyboard dialogs, and local storage migration work", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nexride-state",
      JSON.stringify({
        form: {
          name: "Test Rider",
          phone: "+251900000000",
          email: "",
          password: "obsolete-preview-password",
        },
      }),
    ),
  );
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("nexride-state")))
    .toBeNull();
  await page
    .getByRole("button", { name: "Account", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Personal information", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("NexRide Test");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByRole("heading", { name: "NexRide Test" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "አማርኛ", exact: true }).last().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await expect(
    page.getByRole("heading", { name: "መለያ", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ቅንብሮች", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("nexride-preview-v2"),
  );
  expect(stored).not.toContain("password");
  expect(stored).toContain("NexRide Test");
});

test("small screens keep map, navigation and sheets within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Where are you going?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Search destination", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("not-a-place");
  await expect(
    page.getByText("No places found. Try a nearby landmark."),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Meskel");
  await page
    .getByRole("button", { name: /Meskel Square/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose your ride" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
