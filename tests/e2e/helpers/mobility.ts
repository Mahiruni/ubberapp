import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';

/** Exercise the real Mapbox renderer without depending on external tiles. */
export async function mapFixture(page: Page) {
  await page.route('https://api.mapbox.com/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.pbf')) return route.fulfill({contentType:'application/x-protobuf',body:Buffer.alloc(0)});
    if (url.pathname.includes('/styles/')) return route.fulfill({json:{version:8,sources:{},layers:[{id:'fixture-background',type:'background',paint:{'background-color':'#edf2f4'}}]}});
    return route.fulfill({json:{tilejson:'3.0.0',tiles:['https://api.mapbox.com/fixtures/empty/{z}/{x}/{y}.pbf'],vector_layers:[{id:'traffic',fields:{}}]}});
  });
  await page.route('https://events.mapbox.com/**', route => route.fulfill({status:204}));
  await page.route('**/api/rider/route', route => route.fulfill({status:503,json:{status:'unavailable',coverage:{kind:'preview'}}}));
  await page.route('**/api/rider/search**', route => route.fulfill({json:{status:'unavailable',results:[]}}));
}

export async function chooseJourney(page: Page) {
  await page.getByRole('button',{name:'Search destination',exact:true}).click();
  await page.getByRole('textbox',{name:'Pickup',exact:true}).fill('Bole Atlas');
  await page.locator('.nr-place-suggestion').filter({hasText:'Bole Atlas'}).first().click();
  await page.getByRole('textbox',{name:'Search destination',exact:true}).fill('Bole International Airport');
  await page.locator('.nr-place-suggestion').filter({hasText:'Bole International Airport'}).first().click();
}

export async function readyMap(page: Page) {
  await expect(page.locator('.nr-mapbox-surface')).toHaveAttribute('data-map-status','ready');
}

/** Controls must remain reachable above the overlaid ride sheet. */
export async function reachableControl(page: Page, selector: string) {
  const control = selector === ".nr-recenter" ? page.getByRole("button",{name:"Recenter on my location",exact:true}) : page.locator(selector);
  await expect(control).toBeInViewport();
  await expect.poll(() => control.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === element || !!hit && element.contains(hit);
  })).toBe(true);
}


/** Check the route drawn on the real canvas, not only its React state class. */
export async function routePixelCount(page: Page) {
  const png = await page.locator('.mapboxgl-canvas').screenshot();
  const {data,info} = await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
  let pixels = 0;
  for (let i=0;i<data.length;i+=info.channels) {
    if (Math.abs(data[i]-36)<25 && Math.abs(data[i+1]-107)<25 && Math.abs(data[i+2]-198)<25) pixels++;
  }
  return pixels;
}
