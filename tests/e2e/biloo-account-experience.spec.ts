import { expect, test, type Page } from "@playwright/test";

async function mockAuthenticatedDriver(page: Page) {
  const id = "22222222-2222-4222-8222-222222222222";
  const user = {
    id, aud: "authenticated", role: "authenticated",
    email: "driver@example.test", app_metadata: {},
    user_metadata: { role: "driver", full_name: "Biloo Driver" },
    created_at: "2026-01-01T00:00:00Z"
  };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString("base64url")}.test`;
  const session = {access_token:token,refresh_token:"test",expires_at:4102444800,expires_in:3600,token_type:"bearer",user};
  await page.addInitScript(({session}) => {
    localStorage.setItem("sb-eyyvvwecpyctttiueban-auth-token",JSON.stringify(session));
    localStorage.setItem("nexride.driver.theme","light");
  },{session});
  await page.route("**/auth/v1/user",route=>route.fulfill({json:user}));
  await page.route("**/rest/v1/**",route=>{
    const u=new URL(route.request().url());
    const name=u.pathname.split("/").pop();
    const single=route.request().headers().accept?.includes("object+json");
    const respond=(value:object|null)=>route.fulfill({json:single?value:value?[value]:[],headers:{"content-range":"0-0/0"}});
    if(name==="profiles") return respond({id,role:"driver",full_name:"Biloo Driver",account_status:"active",phone:"+251912345678"});
    if(name==="drivers") return respond({id,review_status:"pending",vehicle:"Toyota Yaris",vehicle_plate:"AA 12345",rating:null});
    if(name==="ride_requests") return respond(null);
    return respond(null);
  });
  await page.route("**/api/**",route=>route.fulfill({status:503,json:{status:"unavailable"}}));
  await page.routeWebSocket("**/realtime/v1/**",ws=>ws.close());
}

test("Rider Account uses the real five-tab Account destination with premium sections",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>localStorage.setItem("nexride:preview-enabled","true"));
  await page.route("https://tile.openstreetmap.org/**",route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  await page.goto("/");
  const footer=page.getByRole("navigation",{name:"Rider bottom navigation"});
  await footer.getByRole("button",{name:"Account"}).click();
  const account=page.locator(".nr-account-standard");
  await expect(account).toBeVisible();
  await expect(account.getByRole("heading",{name:"Account",exact:true})).toBeVisible();
  for(const group of ["Personal information","Rides & places","Wallet & payments","Safety & support","Preferences"])
    await expect(account.getByRole("heading",{name:group,exact:true})).toBeVisible();
  await expect(account.getByRole("button",{name:/Edit profile/}).first()).toBeVisible();
  await expect(footer.getByRole("button",{name:"Account"})).toHaveAttribute("aria-current","page");
  await account.getByRole("button",{name:/Appearance, language & alerts/}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("Driver Account shows verified data status and all real destinations",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await mockAuthenticatedDriver(page);
  await page.goto("/driver/profile");
  const account=page.locator(".nr-driver-profile-v2");
  await expect(account).toBeVisible();
  await expect(account.locator(".nr-driver-profile-heading h1")).toHaveText(/account|መለያ/i);
  await expect(account.locator(".nr-driver-profile-identity h2")).toContainText(/Biloo Driver/i);
  for(const group of ["Personal information","Driver verification","Trips & earnings","Safety & support","Preferences"])
    await expect(account.getByRole("heading",{name:group,exact:true})).toBeVisible();
  await expect(account.locator(".nr-driver-verification-card strong")).toContainText(/verification|review/i);
  const footer=page.getByRole("navigation",{name:"Driver bottom navigation"});
  await expect(footer.getByRole("link",{name:"Account"})).toHaveAttribute("aria-current","page");
  await account.getByRole("button",{name:/Edit profile/}).first().click();
  await expect(page).toHaveURL(/\/driver\/profile\/settings/);
  const returnToAccount=page.locator(".biloo-account-return");
  await expect(page.locator(".nr-driver-profile-subpage")).toBeVisible();
  await expect(returnToAccount).toBeVisible({timeout:10000});
  await expect(returnToAccount).toHaveAttribute("aria-label",/Account|መለያ/);
  await returnToAccount.click();
  await expect(page).toHaveURL(/\/driver\/profile$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("Driver Account subpages keep visible Back controls below the global app bar", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await mockAuthenticatedDriver(page);
  for (const route of ["documents","vehicle","payouts"]) {
    await page.goto("/driver/profile/"+route);
    const header=page.locator(".nr-driver-profile-subpage .nr-profile-subhead");
    await expect(header).toBeVisible({timeout:15000});
    const back=header.getByRole("button",{name:/Back to driver profile/i});
    await expect(back).toBeVisible();
    await expect(back).toBeInViewport();
    await back.click();
    await expect(page).toHaveURL(/\\/driver\\/profile$/);
    await expect(page.locator(".nr-driver-profile-v2")).toBeVisible();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth+1)).toBe(true);
});
