import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOTS = process.env.SHOT_DIR || path.resolve("screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

async function open(page, { now = "2026-11-11T12:00:00", prefs = {} } = {}) {
  await page.addInitScript(
    ([now, prefs]) => {
      window.__gtNow = now;
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("gt-sport-menu", JSON.stringify(prefs));
        sessionStorage.setItem("seeded", "1");
      }
    },
    [now, prefs],
  );
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  return errors;
}

async function enter(page) {
  await page.click("#start");
  await expect(page.locator("#top-screen")).toBeVisible();
  await expect(page.locator("#title-screen")).toBeHidden({ timeout: 5000 });
}

async function openOptions(page, ...sections) {
  if (await page.locator("#settings").isHidden()) await page.click("#gt-menu");
  await expect(page.locator("#settings")).toBeVisible();
  for (const s of sections) {
    const d = page.locator(`#${s}-section`);
    if (!(await d.evaluate((el) => el.open))) await d.locator("summary").click();
  }
}

const audio = (page) => page.locator("#music").evaluate((a) => ({ src: a.currentSrc, time: a.currentTime, loop: a.loop, paused: a.paused }));

async function energy(page) {
  return page.locator("#music").evaluate(async (a) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaElementSource(a).connect(analyser).connect(ctx.destination);
    await ctx.resume();
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      analyser.getFloatTimeDomainData(buf);
      peak = Math.max(peak, Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length));
    }
    return peak;
  });
}

async function poolGames(page) {
  await openOptions(page, "browser");
  return page.locator("#track-list .game").evaluateAll((els) => {
    const counts = {};
    for (const el of els) counts[el.textContent] = (counts[el.textContent] || 0) + 1;
    return counts;
  });
}

const idbFiles = (page) =>
  page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open("gt-sport-menu", 1);
    req.onsuccess = () => {
      const get = req.result.transaction("files").objectStore("files").count();
      get.onsuccess = () => resolve(get.result);
    };
  }));

async function expectAdvancing(page) {
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 90000 });
  const a = await audio(page);
  await expect.poll(async () => (await audio(page)).time, { timeout: 30000 }).toBeGreaterThan(a.time + 2);
  return a;
}

test("defaults keep the GT Sport view and playlist, and the GT Menu opens Options", async ({ page }) => {
  const errors = await open(page, { prefs: { source: "off" } });
  await enter(page);
  await page.click("#gt-menu");
  await expect(page.locator("#settings h2")).toHaveText("Options");
  await openOptions(page, "extended");
  await expect(page.locator("#extended")).not.toBeChecked();
  expect(await poolGames(page)).toEqual({ "GT Sport": 62 });
  await expect(page.locator("#packs label")).toHaveText([/GT Sport \(2017\) · 65 tracks/, /GT4 \(2004\) · 10 tracks/, /GT7 \(2022\) · 75 tracks/]);
  await expect(page.locator('input[name="xmas-mix"][value="holiday"]')).toBeChecked();
  expect(errors).toEqual([]);
});

test("extended packs change the real audio source and play GT7 then GT4 @network", async ({ page }) => {
  test.setTimeout(240000);
  const hosts = new Set();
  page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
  await open(page, { prefs: { source: "soundtrack" } });
  await enter(page);
  const first = await expectAdvancing(page);
  expect(first.src).toContain("2017%20-%20Gran%20Turismo%20Sport");
  await openOptions(page, "extended");
  await page.locator("#extended + span").click();
  await page.locator("#packs label", { hasText: "GT7" }).click();
  await page.locator("#packs label", { hasText: "GT Sport" }).click();
  expect(await poolGames(page)).toEqual({ GT7: 75 });
  await expect.poll(async () => (await audio(page)).src, { timeout: 30000 }).toContain("2022%20-%20Gran%20Turismo%207");
  const gt7 = await expectAdvancing(page);
  const rms7 = await energy(page);
  expect(rms7).toBeGreaterThan(0.005);
  await expect(page.locator("#track-artist")).toContainText("· GT7");
  await page.screenshot({ path: `${SHOTS}/09_options_extended_gt7.png` });
  await page.locator("#packs label", { hasText: "GT4" }).click();
  await page.locator("#packs label", { hasText: "GT7" }).click();
  expect(await poolGames(page)).toEqual({ GT4: 10 });
  await expect.poll(async () => (await audio(page)).src, { timeout: 30000 }).toContain("2004%20-%20Gran%20Turismo%204");
  const gt4 = await expectAdvancing(page);
  await expect(page.locator("#track-artist")).toContainText("Isamu Ohira · GT4");
  test.info().annotations.push({ type: "playback", description: JSON.stringify({ gt7: gt7.src, rms7, gt4: gt4.src }) });
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await enter(page);
  await expect.poll(async () => (await audio(page)).src, { timeout: 30000 }).toContain("2004%20-%20Gran%20Turismo%204");
  expect([...hosts].filter((h) => /youtube|ytimg|googlevideo/.test(h))).toEqual([]);
});

test("Christmas stays holiday-only with extended packs unless mixing is chosen", async ({ page }) => {
  await open(page, { now: "2026-12-22T20:00:00", prefs: { source: "off", extended: true, packs: ["gt4", "gt7"] } });
  await enter(page);
  await expect(page.locator("body")).toHaveAttribute("data-season", "christmas");
  await openOptions(page, "extended", "browser");
  expect(await poolGames(page)).toEqual({ "GT Sport": 3 });
  await expect(page.locator("#track-list li")).toHaveCount(3);
  await page.locator('label:has(input[name="xmas-mix"][value="all"])').click();
  expect(await poolGames(page)).toEqual({ GT4: 10, GT7: 75 });
  await page.locator("#packs label", { hasText: "GT Sport" }).click();
  expect(await poolGames(page)).toEqual({ "GT Sport": 65, GT4: 10, GT7: 75 });
  await page.locator('label:has(input[name="xmas-mix"][value="holiday"])').click();
  expect(await poolGames(page)).toEqual({ "GT Sport": 3 });
});

test("in-order play, repeat and volume persist @network", async ({ page }) => {
  test.setTimeout(150000);
  await open(page, { prefs: { source: "soundtrack", order: "sequential" } });
  await enter(page);
  await expectAdvancing(page);
  await expect(page.locator("#track-title")).toHaveText("Lizzie’s Balloon");
  await page.keyboard.press("n");
  await expect(page.locator("#track-title")).not.toHaveText("Lizzie’s Balloon");
  const second = await page.locator("#track-title").textContent();
  const manifest = await page.evaluate(() => fetch("data/soundtrack.json").then((r) => r.json()));
  expect(second).toBe(manifest.tracks.filter((t) => t.season === "normal")[1].title);
  await openOptions(page);
  await page.locator("#repeat + span").click();
  expect((await audio(page)).loop).toBe(true);
  await page.locator('label:has(input[name="order"][value="shuffle"])').click();
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#repeat")).toBeChecked();
  await expect(page.locator('input[name="order"][value="shuffle"]')).toBeChecked();
  await enter(page);
  await expectAdvancing(page);
  expect((await audio(page)).loop).toBe(true);
});

test("track browser searches, plays a pick and keeps favourites @network", async ({ page }) => {
  test.setTimeout(150000);
  await open(page, { prefs: { source: "soundtrack", extended: true, packs: ["gtsport", "gt4"] } });
  await enter(page);
  await openOptions(page, "browser");
  await expect(page.locator("#track-list li")).toHaveCount(72);
  await page.fill("#track-search", "ohira");
  await expect(page.locator("#track-list li")).toHaveCount(10);
  await page.fill("#track-search", "bassman");
  await expect(page.locator("#track-list li")).toHaveCount(1);
  await page.locator("#track-list .pick").click();
  await expect(page.locator("#track-title")).toHaveText("An Old Bassman");
  await expectAdvancing(page);
  await expect(page.locator("#track-list li.current")).toHaveCount(1);
  await page.locator("#track-list .fav").click();
  await expect(page.locator("#track-list .fav")).toHaveAttribute("aria-pressed", "true");
  await page.fill("#track-search", "");
  await page.locator("#favorites-only + span").click();
  await expect(page.locator("#track-list li")).toHaveCount(1);
  await openOptions(page, "extended");
  expect(await poolGames(page)).toEqual({ GT4: 1 });
  await page.screenshot({ path: `${SHOTS}/10_options_track_browser.png` });
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await enter(page);
  await expect(page.locator("#track-title")).toHaveText("An Old Bassman");
});

test("ambience mode hides the UI and exits on keyboard and touch", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  await open(page, { prefs: { source: "off" } });
  await enter(page);
  await page.keyboard.press("a");
  await expect(page.locator("body")).toHaveClass(/ambient/);
  await expect(page.locator("#ambience-hint")).toBeVisible();
  await expect.poll(() => page.locator("#top-screen").evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.05);
  await page.screenshot({ path: `${SHOTS}/11_ambience.png` });
  await page.waitForTimeout(600);
  await page.keyboard.press("x");
  await expect(page.locator("body")).not.toHaveClass(/ambient/);
  await expect(page.locator("#settings")).toBeHidden();
  await openOptions(page, "display");
  await page.click("#ambience-now");
  await expect(page.locator("body")).toHaveClass(/ambient/);
  await page.waitForTimeout(600);
  await page.touchscreen.tap(960, 540);
  await expect(page.locator("body")).not.toHaveClass(/ambient/);
  await context.close();
});

test("idle ambience starts after the chosen delay", async ({ page }) => {
  await page.clock.install();
  await open(page, { prefs: { source: "off", ambienceIdle: 60 } });
  await enter(page);
  await page.mouse.move(100, 400);
  await page.clock.fastForward(30000);
  await expect(page.locator("body")).not.toHaveClass(/ambient/);
  await page.clock.fastForward(31000);
  await expect(page.locator("body")).toHaveClass(/ambient/);
  await page.clock.fastForward(1000);
  await page.mouse.move(400, 600);
  await page.mouse.move(700, 700);
  await expect(page.locator("body")).not.toHaveClass(/ambient/);
});

test("motion toggle, slide interval and reduced motion are respected", async ({ page }) => {
  test.setTimeout(90000);
  await open(page, { prefs: { source: "off" } });
  await enter(page);
  await expect(page.locator(".scape.on[data-src]")).toHaveCount(1, { timeout: 20000 });
  const panning = () => page.locator(".scape.on[data-src]").evaluate((el) => getComputedStyle(el).animationName);
  expect(await panning()).toMatch(/pan/);
  await openOptions(page, "display");
  await page.locator("#motion + span").click();
  await expect(page.locator("body")).toHaveClass(/still/);
  expect(await panning()).toBe("none");
  await page.selectOption("#slide-interval", "10");
  const before = await page.locator(".scape.on[data-src]").getAttribute("data-src");
  await expect.poll(() => page.locator(".scape.on[data-src]").getAttribute("data-src"), { timeout: 20000 }).not.toBe(before);
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#slide-interval")).toHaveValue("10");
  await expect(page.locator("#motion")).not.toBeChecked();
  await enter(page);
  await openOptions(page, "display");
  await page.locator("#motion + span").click();
  await expect(page.locator("body")).not.toHaveClass(/still/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("body")).toHaveClass(/still/);
  await expect(page.locator("#motion")).toBeDisabled();
});

test("reset restores defaults without removing imported files", async ({ page }) => {
  await open(page, { prefs: { source: "off", extended: true, packs: ["gt7"], order: "sequential", repeat: true, slideInterval: 60, favorites: ["gt7_x"] } });
  await enter(page);
  await openOptions(page);
  await page.setInputFiles("#local-files", { name: "Mine.wav", mimeType: "audio/wav", buffer: Buffer.from("RIFF0000WAVE") });
  await expect.poll(() => idbFiles(page)).toBe(1);
  await page.click("#reset-settings");
  await expect(page.locator("#extended")).not.toBeChecked();
  await expect(page.locator("#repeat")).not.toBeChecked();
  await expect(page.locator('input[name="order"][value="shuffle"]')).toBeChecked();
  await expect(page.locator('input[name="source"][value="soundtrack"]')).toBeChecked();
  await expect(page.locator("#slide-interval")).toHaveValue("20");
  expect(await idbFiles(page)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("gt-sport-menu"))).toBeNull();
  await page.click("#clear-local");
  await expect.poll(() => idbFiles(page)).toBe(0);
});

test("options panel fits narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { prefs: { source: "off", extended: true, packs: ["gtsport", "gt7"] } });
  await enter(page);
  await openOptions(page, "extended", "browser", "display");
  const overflow = await page.locator("#settings").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.locator("#settings").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/12_options_narrow.png` });
});
