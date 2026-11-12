import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SHOTS = process.env.SHOT_DIR || path.resolve("screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

function tone(seconds, hz) {
  const rate = 22050;
  const n = Math.round(rate * seconds);
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
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 12000), 44 + i * 2);
  return buf;
}

async function open(page, prefs = { source: "off" }) {
  await page.addInitScript((prefs) => {
    window.__gtNow = "2026-11-11T15:07:00";
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("gt-sport-menu", JSON.stringify(prefs));
      sessionStorage.setItem("seeded", "1");
    }
  }, prefs);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => {
    window.__plays = [];
    for (const cue of ["move", "select", "back"]) document.querySelector(`#cue-${cue}`).addEventListener("play", () => window.__plays.push(cue));
  });
  return errors;
}

async function enter(page) {
  await page.click("#start");
  await expect(page.locator("#top-screen")).toBeVisible();
  await expect(page.locator("#title-screen")).toBeHidden({ timeout: 5000 });
}

const plays = (page) => page.evaluate(() => window.__plays.slice());

async function loadCues(page) {
  if (await page.locator("#settings").isHidden()) await page.click("#gt-menu");
  const section = page.locator("#sfx-section");
  if (!(await section.evaluate((el) => el.open))) await section.locator("summary").click();
  await page.setInputFiles("#sfx-move", { name: "move.wav", mimeType: "audio/wav", buffer: tone(0.6, 880) });
  await page.setInputFiles("#sfx-select", { name: "select.wav", mimeType: "audio/wav", buffer: tone(0.6, 660) });
  await page.setInputFiles("#sfx-back", { name: "back.wav", mimeType: "audio/wav", buffer: tone(0.6, 440) });
  await expect(page.locator("#sfx-back-name")).toHaveText("· back.wav");
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings")).toBeHidden();
  await expect.poll(() => plays(page)).toContain("back");
  await page.waitForTimeout(300);
  await page.evaluate(() => (window.__plays.length = 0));
}

test("mode dropdowns follow the manual screenshots and work with keyboard and pointer", async ({ page }) => {
  const errors = await open(page);
  await enter(page);
  await page.locator(".mode", { hasText: "Arcade" }).focus();
  await page.keyboard.press("Enter");
  const menu = page.locator("#mode-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator("b")).toHaveText(["Single Race", "Time Trial", "Drift Trial", "Custom Race", "2 Player Battle", "VR Tour"]);
  await expect(menu.locator("button").first()).toBeFocused();
  await expect(menu.locator("small").first()).toBeVisible();
  await expect(menu.locator("small").first()).toHaveText("Race against the AI.");
  await page.mouse.move(960, 600);
  await page.screenshot({ path: `${SHOTS}/13_dropdown_arcade.png` });
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator("button").nth(1)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(menu.locator("b")).toHaveText(["GT League", "Driving School", "Mission Challenge", "Circuit Experience", "Lewis Hamilton Time Trial Challenge"]);
  await expect(page.locator(".mode", { hasText: "Campaign" })).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: `${SHOTS}/14_dropdown_campaign.png` });
  await page.keyboard.press("ArrowRight");
  await expect(menu.locator("b").first()).toHaveText("Race Entry");
  await page.keyboard.press("Enter");
  await expect(page.locator("#toast")).toContainText("Race Entry");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator(".mode", { hasText: "Sport" })).toBeFocused();
  await page.locator(".mode", { hasText: "Arcade" }).click();
  await expect(menu).toBeVisible();
  await page.mouse.click(960, 600);
  await expect(menu).toBeHidden();
  await page.locator(".mode", { hasText: "Lobby" }).click();
  await expect(page.locator("#toast")).toContainText("Lobby");
  expect(errors).toEqual([]);
});

test("cursor and word balloons use the reconstructed GT Sport look", async ({ page }) => {
  await open(page);
  await enter(page);
  expect(await page.locator("#top-screen").evaluate((el) => getComputedStyle(el).cursor)).toContain("img/cursor.svg");
  const size = await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r([0, 0]); i.src = "img/cursor.svg"; }));
  expect(size).toEqual([32, 40]);
  await page.locator(".mode", { hasText: "Scapes" }).hover();
  await expect(page.locator("#balloon")).toBeVisible();
  const bg = await page.locator("#balloon").evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = bg.match(/\d+/g).map(Number);
  expect(Math.max(r, g, b)).toBeLessThan(60);
});

test("UI sound cues play for move, select and back, never before entry, without double triggers", async ({ page }) => {
  await open(page);
  await page.keyboard.press("ArrowRight");
  expect(await plays(page)).toEqual([]);
  await enter(page);
  expect(await plays(page)).toEqual([]);
  await loadCues(page);
  await page.locator(".mode", { hasText: "Lobby" }).hover();
  await expect.poll(() => plays(page)).toEqual(["move"]);
  await page.waitForTimeout(100);
  await page.locator(".mode", { hasText: "Lobby" }).focus();
  await page.waitForTimeout(100);
  expect(await plays(page)).toEqual(["move"]);
  const energy = await page.locator("#cue-move").evaluate(async (a) => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    ctx.createMediaElementSource(a).connect(analyser).connect(ctx.destination);
    await ctx.resume();
    a.currentTime = 0;
    await a.play();
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 50));
      analyser.getFloatTimeDomainData(buf);
      peak = Math.max(peak, Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length));
    }
    return peak;
  });
  expect(energy).toBeGreaterThan(0.01);
  await page.evaluate(() => (window.__plays.length = 0));
  await page.mouse.move(960, 600);
  await page.locator(".mode", { hasText: "Arcade" }).focus();
  await page.evaluate(() => (window.__plays.length = 0));
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => plays(page)).toEqual(["move"]);
  await page.keyboard.press("Enter");
  await expect.poll(() => plays(page)).toEqual(["move", "select", "move"]);
  await page.keyboard.press("Escape");
  await expect.poll(() => plays(page)).toContain("back");
  await page.keyboard.press("s");
  await page.locator("#sfx-mute + span").click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window.__plays.length = 0));
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  expect(await plays(page)).toEqual([]);
  await page.reload();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
  await expect(page.locator("#sfx-mute")).toBeChecked();
  await expect(page.locator("#sfx-move-name")).toHaveText("· move.wav");
});

test("touch opens a dropdown and selects an item", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await open(page);
  await page.locator("#start").tap();
  await expect(page.locator("#top-screen")).toBeVisible();
  await page.locator(".mode", { hasText: "Sport" }).tap();
  await expect(page.locator("#mode-menu")).toBeVisible();
  const box = await page.locator("#mode-menu").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.locator("#mode-menu button", { hasText: "Live Reports" }).tap();
  await expect(page.locator("#toast")).toContainText("Live Reports");
  await page.screenshot({ path: `${SHOTS}/15_dropdown_narrow.png` });
  await context.close();
});
