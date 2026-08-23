/* Rendered checks for the UI overhaul: capture every major screen and state
 * at representative viewports with clearly synthetic data only.
 *
 * Seeding runs the dev server's own modules (setDb/NkshaDB) inside the page,
 * so the app's real Dexie schema is exercised end to end. */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:5199";
const OUT = "rendered-checks";
mkdirSync(OUT, { recursive: true });

const SEED = `
  const mod = await import('/src/db/db.ts');
  const { NkshaDB } = await import('/src/db/schema.ts');
  mod.setDb(new NkshaDB('nksha'));
  const db = mod.getDb();
  await db.transaction('rw', db.places, db.visits, async () => {
    await db.places.clear();
    await db.visits.clear();
    await db.places.bulkPut([
      { id:'p1', name:'Ridgeline Cabin', address:'1 Pine Hollow Road', lat:31.1, lng:77.17, isHome:1, createdAt:1 },
      { id:'p2', name:'Old Town Market', address:'12 Bazaar Lane', lat:31.25, lng:77.4, isHome:0, createdAt:2 },
      { id:'p3', name:'Lakeside Boathouse', address:'3 Jetty Walk', lat:30.9, lng:77.05, isHome:0, createdAt:3 },
      { id:'p4', name:'Summit Trailhead', address:'', lat:31.4, lng:77.55, isHome:0, createdAt:4 },
      { id:'p5', name:'Valley Tea House', address:'9 Riverbend', lat:31.05, lng:77.3, isHome:0, createdAt:5 },
    ]);
    const visits = [];
    let n = 1;
    for (const year of [2024,2025,2026]) for (let m=0;m<12;m+=3)
      for (const pid of ['p1','p2','p3','p4','p5']) {
        const start = Date.UTC(year,m,4+(n%5),9);
        visits.push({ dedupeKey: pid+':'+start, placeId: pid, startTimeMs: start, endTimeMs: start+36*3600000, importId: null, createdAt:1 });
        n++;
      }
    await db.visits.bulkPut(visits);
  });
`;

async function seed(page) {
  // The app's own Dexie singleton is bound to the "nksha" database at boot;
  // seeding through a second connection would race the app, so we wait for
  // the schema to exist and write with raw IndexedDB inside a short window
  // before reloading.
  await page.waitForFunction(
    async () => {
      if (!indexedDB.databases) return false;
      const dbs = await indexedDB.databases();
      return dbs.some((d) => d.name === "nksha");
    },
    { timeout: 15_000 },
  );
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("nksha");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const places = [
      { id: "p1", name: "Ridgeline Cabin", address: "1 Pine Hollow Road", lat: 31.1, lng: 77.17, isHome: 1, createdAt: 1 },
      { id: "p2", name: "Old Town Market", address: "12 Bazaar Lane", lat: 31.25, lng: 77.4, isHome: 0, createdAt: 2 },
      { id: "p3", name: "Lakeside Boathouse", address: "3 Jetty Walk", lat: 30.9, lng: 77.05, isHome: 0, createdAt: 3 },
      { id: "p4", name: "Summit Trailhead", address: "", lat: 31.4, lng: 77.55, isHome: 0, createdAt: 4 },
      { id: "p5", name: "Valley Tea House", address: "9 Riverbend", lat: 31.05, lng: 77.3, isHome: 0, createdAt: 5 },
    ];
    const visits = [];
    let n = 1;
    for (const year of [2024, 2025, 2026]) {
      for (let m = 0; m < 12; m += 3) {
        for (const pid of ["p1", "p2", "p3", "p4", "p5"]) {
          const start = Date.UTC(year, m, 4 + (n % 5), 9);
          visits.push({
            dedupeKey: `${pid}:${start}`,
            placeId: pid,
            startTimeMs: start,
            endTimeMs: start + 36 * 3600000,
            importId: null,
            createdAt: 1,
          });
          n++;
        }
      }
    }
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["places", "visits"], "readwrite");
      const ps = tx.objectStore("places");
      const vs = tx.objectStore("visits");
      for (const p of places) ps.put(p);
      for (const v of visits) vs.put(v);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });
}

const browser = await chromium.launch();
const shots = [];

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  shots.push(path);
}

// ---- First run (empty DB) -------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  await shot(page, "01-welcome-desktop-light");
  await ctx.close();

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE);
  await mpage.waitForTimeout(1200);
  await shot(mpage, "02-welcome-mobile-dark");
  await mctx.close();

  const sctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const spage = await sctx.newPage();
  await spage.goto(BASE);
  await spage.waitForTimeout(1000);
  const overflow = await spage.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  console.log("320px welcome horizontal overflow px:", overflow);
  await shot(spage, "03-welcome-320");
  await sctx.close();
}

// ---- Atlas with synthetic data -------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await seed(page);
  await page.reload();
  await page.waitForTimeout(4000);
  await shot(page, "04-atlas-desktop");

  await page.goto(`${BASE}/?layer=heat`);
  await page.waitForTimeout(2500);
  await shot(page, "05-atlas-heat");

  await page.goto(`${BASE}/heatmap`);
  await page.waitForTimeout(800);
  console.log("/heatmap redirects to:", page.url());

  await page.goto(BASE);
  await page.waitForTimeout(2500);
  const listBtn = page.locator('button[aria-label="Toggle place list"]');
  if (await listBtn.count()) await listBtn.click();
  await page.waitForTimeout(600);
  await shot(page, "06-atlas-list");
  await ctx.close();

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE);
  await seed(mpage);
  await mpage.reload();
  await mpage.waitForTimeout(3500);
  await shot(mpage, "07-atlas-mobile-dark");
  await mctx.close();
}

// ---- Stories, Insights, Settings, Import, Playback ------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await seed(page);
  await page.reload();
  await page.waitForTimeout(2500);
  await page.goto(`${BASE}/trips`);
  await page.waitForTimeout(1500);
  await shot(page, "08-stories");

  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(2500);
  await shot(page, "09-insights");

  await page.goto(`${BASE}/import`);
  await page.waitForTimeout(1200);
  await shot(page, "10-import");

  await page.goto(`${BASE}/settings`);
  await page.waitForTimeout(1200);
  await shot(page, "11-settings");

  await page.goto(`${BASE}/playback`);
  await page.waitForTimeout(4000);
  await shot(page, "12-playback-title-card");

  // Playback transport after starting the story.
  const begin = page.locator('button:has-text("Play story"), button:has-text("Begin")').first();
  if (await begin.count()) {
    await begin.click();
    await page.waitForTimeout(1500);
    await shot(page, "12b-playback-transport");
  }
  await ctx.close();

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE);
  await seed(mpage);
  await mpage.reload();
  await mpage.waitForTimeout(2500);
  await mpage.goto(`${BASE}/dashboard`);
  await mpage.waitForTimeout(1800);
  await shot(mpage, "13-insights-mobile");
  await mctx.close();
}

console.log("captured:", shots.length);
await browser.close();
