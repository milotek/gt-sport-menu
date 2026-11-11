import { resolveSeason } from "./season.js";
import { Music } from "./music.js";
import { addFiles, listFiles, clearFiles, folderManifest } from "./local_media.js";

const $ = (s) => document.querySelector(s);
const SLIDE_MS = 20000;
const prefs = Object.assign(
  { season: "auto", source: "youtube", volume: 60, slideshow: true },
  JSON.parse(localStorage.getItem("gt-sport-menu") || "{}"),
);
const savePrefs = () => localStorage.setItem("gt-sport-menu", JSON.stringify(prefs));

const [catalog, menuTracks] = await Promise.all([
  fetch("data/catalog.json").then((r) => r.json()),
  fetch("data/menu_tracks.json").then((r) => r.json()),
]);

const now = () => (window.__gtNow ? new Date(window.__gtNow) : new Date());
let season = resolveSeason(prefs.season, now(), catalog.christmasWindow);
let userImages = [];
let userAudio = [];

const layers = [...document.querySelectorAll(".backdrop .scape")];
let front = 0;
let slides = [];
let slideIndex = 0;
let slideTimer;

function preload(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = reject;
    img.src = src;
  });
}

async function showSlide(i) {
  for (let tries = 0; tries < slides.length; tries++) {
    const s = slides[(i + tries) % slides.length];
    try {
      await preload(s.src);
    } catch {
      continue;
    }
    slideIndex = (i + tries) % slides.length;
    const back = layers[front];
    front ^= 1;
    const layer = layers[front];
    layer.style.backgroundImage = `url("${s.src}")`;
    layer.dataset.src = s.src;
    layer.classList.remove("pan", "alt");
    void layer.offsetWidth;
    layer.style.setProperty("--pan-duration", `${SLIDE_MS / 1000 + 4}s`);
    layer.classList.add("on", "pan");
    layer.classList.toggle("alt", slideIndex % 2 === 1);
    back.classList.remove("on");
    $("#bg-credit").textContent = `${s.title} · ${s.kind === "user" ? "your image" : s.kind === "official-hotlink" ? "official image" : "substitute"} · ${s.credit}`;
    return;
  }
}

function scheduleSlides() {
  clearInterval(slideTimer);
  if (prefs.slideshow && slides.length > 1) slideTimer = setInterval(() => showSlide(slideIndex + 1), SLIDE_MS);
}

const inSeason = (m) => !m.season || m.season === "any" || m.season === season;

function applyBackgrounds() {
  const mine = userImages.filter(inSeason);
  slides = mine.length ? mine : catalog.backgrounds[season];
  slideIndex = Math.floor(Math.random() * slides.length);
  showSlide(slideIndex);
  scheduleSlides();
}

function musicTracks(source) {
  if (source === "local") {
    const mine = userAudio.filter(inSeason);
    return mine.length ? mine : userAudio;
  }
  if (season === "christmas") {
    return catalog.christmasMusic.recordings.map((r) => ({
      ...r,
      artist: `GT Sport Christmas menu · recording by ${r.channel}`,
    }));
  }
  return menuTracks.filter((t) => t.youtubeId);
}

const music = new Music({
  dock: $("#player-dock"),
  mount: "yt-player",
  onTrack: (t) => {
    $("#track-title").textContent = t ? t.title : "-";
    $("#track-artist").textContent = t ? t.artist : "";
  },
  onStatus: (text, playing) => {
    $("#track-status").textContent = text;
    if (playing && music.track !== announced) announce(music.track);
    $("#play").innerHTML = `<i class="ti ti-player-${playing ? "pause" : "play"}"></i>`;
  },
});

let npTimer;
let announced;
function announce(t) {
  announced = t;
  $("#np-title").textContent = t.title;
  $("#np-artist").textContent = t.artist;
  const np = $("#now-playing");
  np.classList.add("show");
  clearTimeout(npTimer);
  npTimer = setTimeout(() => np.classList.remove("show"), 6000);
}

function applySeason() {
  season = resolveSeason(prefs.season, now(), catalog.christmasWindow);
  document.body.dataset.season = season;
  const w = catalog.christmasWindow;
  const pad = (n) => String(n).padStart(2, "0");
  const range = `${pad(w.start[1])}/${pad(w.start[0])} to ${pad(w.end[1])}/${pad(w.end[0])}`;
  $("#season-hint").textContent =
    prefs.season === "auto"
      ? `Now ${season}. Christmas runs ${range} (day/month), based on player reports. The end date is approximate.`
      : `Forced ${season}.`;
  const news = catalog.news[season];
  $("#news-tag").textContent = news.tag;
  $("#news-headline").textContent = news.headline;
  $("#news-date").textContent = news.date;
  applyBackgrounds();
}

function tick() {
  const d = now();
  $("#clock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  $("#feed-date").textContent = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (prefs.season === "auto" && resolveSeason("auto", d, catalog.christmasWindow) !== season) {
    applySeason();
    music.use(prefs.source, musicTracks(prefs.source));
  }
}

async function loadUserMedia() {
  const manifest = await folderManifest();
  const audio = await listFiles("audio");
  const images = await listFiles("image");
  for (const u of [...userAudio, ...userImages]) {
    const url = u.url ?? u.src;
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
  }
  userAudio = [
    ...manifest.audio.map((a) => ({ ...a, url: `media/local/${a.file}` })),
    ...audio.map((f) => ({ title: f.name.replace(/\.[^.]+$/, ""), artist: "Your file", url: URL.createObjectURL(f.blob) })),
  ];
  userImages = [
    ...manifest.images.map((i) => ({ src: `media/local/${i.file}`, title: i.title || i.file, season: i.season, kind: "user", credit: "local folder" })),
    ...images.map((f) => ({ src: URL.createObjectURL(f.blob), title: f.name, kind: "user", credit: "imported in this browser" })),
  ];
  $("#local-count").textContent = `${userAudio.length} audio file${userAudio.length === 1 ? "" : "s"}, ${userImages.length} image${userImages.length === 1 ? "" : "s"} saved in this browser or local folder.`;
}

function showToast(title) {
  const t = $("#toast");
  t.innerHTML = `${title}<small>Not available in this recreation.</small>`;
  t.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => (t.hidden = true), 2200);
}

function balloonFor(el) {
  const b = $("#balloon");
  const text = el?.dataset.balloon;
  if (!text) return (b.hidden = true);
  b.textContent = text;
  b.hidden = false;
  const r = el.getBoundingClientRect();
  const stage = $("#top-screen").getBoundingClientRect();
  const left = Math.min(Math.max(r.left - stage.left, 8), stage.width - b.offsetWidth - 8);
  b.style.left = `${left}px`;
  b.style.top = `${r.bottom - stage.top + 10}px`;
  b.style.setProperty("--tip", `${r.left - stage.left - left + r.width / 2 - 8}px`);
}

function navItems() {
  return [...document.querySelectorAll("#top-screen .nav")].filter((e) => e.offsetParent);
}

function moveFocus(dx, dy) {
  const items = navItems();
  const cur = document.activeElement?.classList.contains("nav") ? document.activeElement : null;
  if (!cur) return items[0]?.focus();
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const vx = b.left + b.width / 2 - ax;
    const vy = b.top + b.height / 2 - ay;
    const along = vx * dx + vy * dy;
    if (along <= 1) continue;
    const across = Math.abs(vx * dy) + Math.abs(vy * dx);
    const score = along + across * 2;
    if (score < bestScore) [best, bestScore] = [el, score];
  }
  best?.focus();
}

function toggleSettings(open = $("#settings").hidden) {
  $("#settings").hidden = !open;
  $("#settings-toggle").setAttribute("aria-expanded", String(open));
  if (open) $("#settings input:checked")?.focus();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function wireSettings() {
  for (const r of document.querySelectorAll('input[name="season"]')) {
    r.checked = r.value === prefs.season;
    r.addEventListener("change", () => {
      prefs.season = r.value;
      savePrefs();
      applySeason();
      if (prefs.source === "youtube") music.use("youtube", musicTracks("youtube"));
    });
  }
  for (const r of document.querySelectorAll('input[name="source"]')) {
    r.checked = r.value === prefs.source;
    r.addEventListener("change", () => {
      prefs.source = r.value;
      savePrefs();
      music.use(prefs.source, musicTracks(prefs.source));
    });
  }
  const vol = $("#volume");
  vol.value = prefs.volume;
  vol.addEventListener("input", () => {
    prefs.volume = Number(vol.value);
    savePrefs();
    music.setVolume(prefs.volume);
  });
  $("#slideshow").checked = prefs.slideshow;
  $("#slideshow").addEventListener("change", (e) => {
    prefs.slideshow = e.target.checked;
    savePrefs();
    scheduleSlides();
  });
  $("#play").addEventListener("click", () => music.toggle());
  $("#next").addEventListener("click", () => music.next());
  $("#prev").addEventListener("click", () => music.prev());
  $("#local-files").addEventListener("change", async (e) => {
    await addFiles("audio", e.target.files);
    e.target.value = "";
    await loadUserMedia();
    if (prefs.source === "local") music.use("local", musicTracks("local"));
  });
  $("#local-images").addEventListener("change", async (e) => {
    await addFiles("image", e.target.files);
    e.target.value = "";
    await loadUserMedia();
    applyBackgrounds();
  });
  $("#clear-local").addEventListener("click", async () => {
    await clearFiles();
    await loadUserMedia();
    applyBackgrounds();
    if (prefs.source === "local") music.use("local", musicTracks("local"));
  });
  $("#fullscreen").addEventListener("click", toggleFullscreen);
  $("#settings-toggle").addEventListener("click", () => toggleSettings());
}

function wireMenu() {
  for (const el of navItems()) {
    el.addEventListener("mouseenter", () => balloonFor(el));
    el.addEventListener("mouseleave", () => balloonFor(null));
    el.addEventListener("focus", () => balloonFor(el));
    el.addEventListener("blur", () => balloonFor(null));
    el.addEventListener("click", () => {
      const label = el.querySelector("span")?.textContent || el.dataset.balloon || "This feature";
      showToast(label);
    });
  }
  document.addEventListener("keydown", (e) => {
    if ($("#top-screen").hidden || e.target.matches("input[type=range], input[type=file]")) return;
    const inSettings = !$("#settings").hidden && $("#settings").contains(e.target);
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.key] && !inSettings) {
      e.preventDefault();
      moveFocus(...dirs[e.key]);
    } else if (e.key === "Escape") {
      $("#toast").hidden = true;
      if (!$("#settings").hidden) {
        toggleSettings(false);
        $("#settings-toggle").focus();
      }
    } else if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) toggleSettings();
    else if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) toggleFullscreen();
    else if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) music.next();
    else if (e.key === " " && !e.target.matches("button, input")) {
      e.preventDefault();
      music.toggle();
    }
  });
}

function titleBackdrop() {
  const t = catalog.backgrounds.title;
  const layer = layers[front];
  preload(t.src)
    .then(() => {
      if (!$("#top-screen").hidden) return;
      layer.style.backgroundImage = `url("${t.src}")`;
      layer.classList.add("on");
    })
    .catch(() => {});
}

async function enter() {
  $("#title-screen").classList.add("leaving");
  $("#top-screen").hidden = false;
  $("#settings-toggle").hidden = false;
  setTimeout(() => ($("#title-screen").hidden = true), 1200);
  applySeason();
  wireMenu();
  navItems()[1]?.focus({ preventScroll: true });
  music.setVolume(prefs.volume);
  await music.use(prefs.source, musicTracks(prefs.source));
}

wireSettings();
await loadUserMedia();
titleBackdrop();
tick();
setInterval(tick, 1000);
$("#start").addEventListener("click", enter, { once: true });
$("#start").focus();
document.body.dataset.ready = "true";
