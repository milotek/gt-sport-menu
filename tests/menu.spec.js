import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOTS = process.env.SHOT_DIR || path.resolve("screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

function toneWav(seconds = 6, hz = 440) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return buf;
}

async function open(page, { now, source = "off", season = "auto" } = {}) {
  await page.addInitScript(
    ([now, prefs]) => {
      if (now) window.__gtNow = now;
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("gt-sport-menu", JSON.stringify(prefs));
        sessionStorage.setItem("seeded", "1");
      }
    },
    [now, { source, season, volume: 60, slideshow: true }],
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

async function visibleScape(page) {
  await expect(page.locator(".scape.on[data-src]")).toHaveCount(1, { timeout: 20000 });
  return page.locator(".scape.on[data-src]").evaluate((el) => el.dataset.src);
}

test("title screen leads into the top screen with the manual's layout", async ({ page }) => {
  const errors = await open(page, { now: "2026-11-11T15:07:00" });
  await expect(page.locator("#start")).toBeFocused();
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${SHOTS}/01_title_desktop.png` });
  await enter(page);
  await expect(page.locator(".mode")).toHaveCount(6);
  await expect(page.locator(".mode span")).toHaveText(["Arcade", "Campaign", "Sport", "Brand Central", "Lobby", "Scapes"]);
  await expect(page.locator(".rail button")).toHaveCount(6);
  await expect(page.locator(".panel")).toHaveCount(4);
  await expect(page.locator("#clock")).toHaveText("15:07");
  await expect(page.locator(".live-tile")).toBeVisible();
  await expect(page.locator("#scape-pill")).toBeVisible();
  await page.waitForTimeout(3000);
  await page.mouse.move(960, 600);
  await page.screenshot({ path: `${SHOTS}/02_top_normal_desktop.png` });
  expect(errors).toEqual([]);
});

test("background images actually render", async ({ page }) => {
  await open(page, { now: "2026-11-11T12:00:00" });
  await enter(page);
  const src = await visibleScape(page);
  expect(src).toMatch(/^https:\/\/gmedia\.playstation\.com\/is\/image\/SIEPDC\/.+\$2400px\$$/);
  const size = await page.evaluate(
    (src) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r([0, 0]); i.src = src; }),
    src,
  );
  expect(size[0]).toBeGreaterThanOrEqual(2400);
  const opacity = await page.locator(".scape.on").evaluate((el) => getComputedStyle(el).opacity);
  await expect.poll(() => page.locator(".scape.on").evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 5000 }).toBeGreaterThan(0.95);
  expect(Number(opacity)).toBeGreaterThanOrEqual(0);
});

test("calendar picks Christmas inside the evidenced window and normal outside it", async ({ page }) => {
  await open(page, { now: "2026-12-22T20:00:00" });
  await enter(page);
  await expect(page.locator("body")).toHaveAttribute("data-season", "christmas");
  await expect(page.locator("#news-headline")).toContainText("Holiday Season Update");
  const src = await visibleScape(page);
  const catalog = await page.evaluate(() => fetch("data/catalog.json").then((r) => r.json()));
  expect(catalog.backgrounds.christmas.map((b) => b.src)).toContain(src);
  await page.waitForTimeout(2600);
  await page.mouse.move(960, 600);
  await page.screenshot({ path: `${SHOTS}/03_top_christmas_desktop.png` });
});

test("calendar boundaries", async ({ page }) => {
  for (const [now, season] of [
    ["2026-12-20T23:59:00", "normal"],
    ["2026-12-21T00:00:00", "christmas"],
    ["2026-12-25T23:59:00", "christmas"],
    ["2026-12-26T00:00:00", "normal"],
  ]) {
    await page.evaluate(() => sessionStorage.clear()).catch(() => {});
    await open(page, { now });
    await enter(page);
    await expect(page.locator("body"), now).toHaveAttribute("data-season", season);
  }
});

test("settings force seasons and persist", async ({ page }) => {
  await open(page, { now: "2026-11-11T12:00:00" });
  await enter(page);
  await expect(page.locator("body")).toHaveAttribute("data-season", "normal");
  await page.keyboard.press("s");
  await expect(page.locator("#settings")).toBeVisible();
  await page.locator('label:has(input[name="season"][value="christmas"])').click();
  await expect(page.locator("body")).toHaveAttribute("data-season", "christmas");
  await expect(page.locator('input[name="season"][value="christmas"]')).toBeChecked();
  await page.screenshot({ path: `${SHOTS}/04_settings_panel.png` });
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await enter(page);
  await expect(page.locator("body")).toHaveAttribute("data-season", "christmas");
  await page.keyboard.press("s");
  await page.locator('label:has(input[name="season"][value="normal"])').click();
  await expect(page.locator("body")).toHaveAttribute("data-season", "normal");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
});

test("keyboard navigation moves through the menu and shows word balloons", async ({ page }) => {
  await open(page);
  await enter(page);
  await expect(page.locator(".mode").first()).toBeFocused();
  await expect(page.locator("#balloon")).toHaveText("Single-player races against the AI");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".mode").nth(1)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".gt-menu")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".rail button").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".panel").first()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#toast")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Not available in this recreation.");
  await page.keyboard.press("Escape");
  await expect(page.locator("#toast")).toBeHidden();
});

test("local audio files persist and actually play", async ({ page }) => {
  await open(page, { source: "local" });
  await enter(page);
  await expect(page.locator("#track-status")).toHaveText("No audio files added yet");
  await page.keyboard.press("s");
  await page.setInputFiles("#local-files", [
    { name: "Test Tone A.wav", mimeType: "audio/wav", buffer: toneWav(6, 440) },
    { name: "Test Tone B.wav", mimeType: "audio/wav", buffer: toneWav(6, 660) },
  ]);
  await expect(page.locator("#track-status")).toHaveText("Playing");
  const first = await page.locator("#track-title").textContent();
  expect(["Test Tone A", "Test Tone B"]).toContain(first);
  await page.click("#next");
  await expect(page.locator("#track-title")).toHaveText(first === "Test Tone A" ? "Test Tone B" : "Test Tone A");
  await expect(page.locator("#track-status")).toHaveText("Playing");
  await page.click("#play");
  await expect(page.locator("#track-status")).toHaveText("Paused");
  await page.locator("#volume").fill("20");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#volume")).toHaveValue("20");
  await enter(page);
  await expect(page.locator("#track-status")).toHaveText("Playing");
  await page.keyboard.press("s");
  await page.click("#clear-local");
  await expect(page.locator("#track-status")).toHaveText("No audio files added yet");
});

test("local background images override the slideshow", async ({ page }) => {
  await open(page);
  await enter(page);
  const png = Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 1600;
      c.height = 900;
      const g = c.getContext("2d");
      g.fillStyle = "#235";
      g.fillRect(0, 0, 1600, 900);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
  await page.keyboard.press("s");
  await page.setInputFiles("#local-images", { name: "my_scape.png", mimeType: "image/png", buffer: png });
  await expect.poll(() => visibleScape(page)).toMatch(/^blob:/);
  await page.click("#clear-local");
  await expect.poll(() => visibleScape(page)).toMatch(/^https:\/\/(gmedia\.playstation|www\.gran-turismo)\.com\//);
});

async function audioState(page) {
  return page.locator("#music").evaluate((a) => ({ src: a.currentSrc, time: a.currentTime, paused: a.paused, volume: a.volume }));
}

async function audioEnergy(page) {
  return page.locator("#music").evaluate(async (a) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
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

test("soundtrack starts natively on the entry gesture and keeps playing @network", async ({ page }) => {
  test.setTimeout(180000);
  const hosts = new Set();
  page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
  const errors = await open(page, { source: "soundtrack", now: "2026-11-11T12:00:00" });
  const manifest = await page.evaluate(() => fetch("data/soundtrack.json").then((r) => r.json()));
  const normal = manifest.tracks.filter((t) => t.season === "normal").map((t) => t.src);
  expect(normal).toHaveLength(63);
  expect((await audioState(page)).src).toBe("");
  await enter(page);
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 90000 });
  const first = await audioState(page);
  expect(normal).toContain(first.src);
  await expect.poll(async () => (await audioState(page)).time, { timeout: 30000 }).toBeGreaterThan(first.time + 2);
  const energy = await audioEnergy(page);
  test.info().annotations.push({ type: "playback", description: JSON.stringify({ src: first.src, rms: energy }) });
  expect(energy).toBeGreaterThan(0.005);
  await expect(page.locator("#now-playing")).toHaveClass(/show/);
  await page.mouse.move(960, 600);
  await page.screenshot({ path: `${SHOTS}/05_soundtrack_playing.png` });
  const title = await page.locator("#track-title").textContent();
  await page.keyboard.press("n");
  await expect(page.locator("#track-title")).not.toHaveText(title);
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 90000 });
  const second = await audioState(page);
  expect(second.src).not.toBe(first.src);
  expect(normal).toContain(second.src);
  await page.keyboard.press("s");
  await page.click("#prev");
  await expect(page.locator("#track-title")).toHaveText(title);
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 90000 });
  await page.click("#play");
  await expect(page.locator("#track-status")).toHaveText("Paused");
  const paused = (await audioState(page)).time;
  await page.waitForTimeout(1500);
  expect((await audioState(page)).time).toBeCloseTo(paused, 1);
  await page.click("#play");
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 30000 });
  await page.locator("#volume").fill("25");
  expect((await audioState(page)).volume).toBeCloseTo(0.25, 2);
  expect([...hosts].filter((h) => /youtube|ytimg|googlevideo/.test(h))).toEqual([]);
  expect(errors).toEqual([]);
});

test("Christmas season plays only the Christmas tracks @network", async ({ page }) => {
  test.setTimeout(150000);
  await open(page, { source: "soundtrack", now: "2026-12-22T20:00:00" });
  const manifest = await page.evaluate(() => fetch("data/soundtrack.json").then((r) => r.json()));
  const xmas = manifest.tracks.filter((t) => t.season === "christmas").map((t) => t.src);
  expect(xmas).toHaveLength(3);
  await enter(page);
  await expect(page.locator("body")).toHaveAttribute("data-season", "christmas");
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 90000 });
  const a = await audioState(page);
  expect(xmas).toContain(a.src);
  await expect.poll(async () => (await audioState(page)).time, { timeout: 30000 }).toBeGreaterThan(a.time + 2);
  await page.keyboard.press("s");
  await page.locator('label:has(input[name="season"][value="normal"])').click();
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 90000 });
  const n = await audioState(page);
  expect(xmas).not.toContain(n.src);
  expect(manifest.tracks.find((t) => t.src === n.src).season).toBe("normal");
});

test("unreachable tracks are skipped and reported", async ({ page }) => {
  await page.route("https://archive.org/**", (r) => r.abort());
  await open(page, { source: "soundtrack", season: "christmas" });
  await enter(page);
  await expect(page.locator("#track-status")).toHaveText("This track could not be loaded. No playable tracks remain.", { timeout: 20000 });
});

test("narrow viewport stacks the layout without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, { now: "2026-11-11T15:07:00" });
  await page.screenshot({ path: `${SHOTS}/06_title_narrow.png` });
  await enter(page);
  await visibleScape(page);
  await page.waitForTimeout(2600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/07_top_narrow.png`, fullPage: true });
});

test("credits page lists every catalogued source", async ({ page }) => {
  await page.goto("credits.html");
  await expect(page.locator("#menu table tr")).toHaveCount(64);
  await expect(page.locator("#extended h3")).toHaveCount(9);
  await expect(page.locator("#extended h3").first()).toHaveText("GT (1997): 21 tracks");
  await expect(page.locator("#christmas")).toContainText("Silent Night");
  await expect(page.locator("#christmas")).toContainText("We Wish You a Merry Christmas");
  await expect(page.locator("#backgrounds")).toContainText("gmedia.playstation.com");
  await page.screenshot({ path: `${SHOTS}/08_credits.png`, fullPage: true });
});
