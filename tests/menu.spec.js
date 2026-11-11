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
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  return errors;
}

async function enter(page) {
  await page.click("#start");
  await expect(page.locator("#top-screen")).toBeVisible();
  await expect(page.locator("#title-screen")).toBeHidden({ timeout: 5000 });
}

async function visibleScape(page) {
  await expect(page.locator(".scape.on")).toHaveCount(1, { timeout: 15000 });
  return page.locator(".scape.on").evaluate((el) => el.dataset.src);
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
  expect(src).toMatch(/img\/backgrounds\/.+\.jpg$/);
  const size = await page.evaluate(
    (src) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r([0, 0]); i.src = src; }),
    src,
  );
  expect(size[0]).toBeGreaterThanOrEqual(1280);
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
  await expect(page.locator("#season-hint")).toHaveText("Forced christmas.");
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
  await expect(page.locator("#local-count")).toContainText("2 audio files");
  await expect(page.locator("#track-status")).toHaveText("Playing");
  await expect(page.locator("#track-title")).toHaveText("Test Tone A");
  await page.click("#next");
  await expect(page.locator("#track-title")).toHaveText("Test Tone B");
  await expect(page.locator("#track-status")).toHaveText("Playing");
  await page.click("#play");
  await expect(page.locator("#track-status")).toHaveText("Paused");
  await page.locator("#volume").fill("20");
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#local-count")).toContainText("2 audio files");
  await expect(page.locator("#volume")).toHaveValue("20");
  await enter(page);
  await expect(page.locator("#track-status")).toHaveText("Playing");
  await page.keyboard.press("s");
  await page.click("#clear-local");
  await expect(page.locator("#local-count")).toContainText("0 audio files");
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
  await expect(page.locator("#bg-credit")).toContainText("your image");
  await page.click("#clear-local");
  await expect.poll(() => visibleScape(page)).toMatch(/img\/backgrounds\//);
});

test("YouTube menu music starts after the entry gesture @network", async ({ page }) => {
  test.setTimeout(150000);
  await open(page, { source: "youtube", now: "2026-11-11T12:00:00" });
  await enter(page);
  await expect(page.locator("#player-dock")).toBeVisible();
  await expect(page.locator("#player-dock iframe")).toHaveAttribute("src", /youtube\.com\/embed\//, { timeout: 20000 });
  const box = await page.locator("#player-dock iframe").boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(200);
  expect(box.height).toBeGreaterThanOrEqual(200);
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 60000 });
  const first = await page.locator("#track-title").textContent();
  await expect(page.locator("#now-playing")).toHaveClass(/show/);
  await page.mouse.move(960, 600);
  await page.screenshot({ path: `${SHOTS}/05_youtube_playing.png` });
  await page.keyboard.press("n");
  await expect(page.locator("#track-title")).not.toHaveText(first);
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 60000 });
});

test("Christmas YouTube recording plays in forced Christmas season @network", async ({ page }) => {
  test.setTimeout(120000);
  await open(page, { source: "youtube", season: "christmas" });
  await enter(page);
  await expect(page.locator("#track-title")).toContainText("Christmas Songs in Gran Turismo Sport Menu");
  await expect(page.locator("#track-status")).toHaveText("Playing", { timeout: 60000 });
});

test("YouTube failure is reported instead of hanging", async ({ page }) => {
  await page.route("https://www.youtube.com/iframe_api", (r) => r.abort());
  await open(page, { source: "youtube" });
  await enter(page);
  await expect(page.locator("#track-status")).toHaveText("YouTube player could not be loaded");
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
  await page.goto("/credits.html");
  await expect(page.locator("#menu table tr")).toHaveCount(67);
  await expect(page.locator("#christmas")).toContainText("We Wish You a Merry Christmas");
  await expect(page.locator("#backgrounds")).toContainText("CC BY 3.0");
  await page.screenshot({ path: `${SHOTS}/08_credits.png`, fullPage: true });
});
