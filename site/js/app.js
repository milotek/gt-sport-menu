import { resolveSeason } from "./season.js";
import { Music } from "./music.js";
import { addFiles, listFiles, clearFiles, folderManifest, replaceKind } from "./local_media.js";
import { Sfx, CUES } from "./sfx.js";

const $ = (s) => document.querySelector(s);
const PREFS_KEY = "gt-sport-menu";
const DEFAULTS = {
  season: "auto",
  source: "soundtrack",
  volume: 60,
  slideshow: true,
  slideInterval: 20,
  motion: true,
  order: "shuffle",
  repeat: false,
  extended: false,
  packs: ["gtsport"],
  xmasMix: "holiday",
  favoritesOnly: false,
  favorites: [],
  ambienceIdle: 0,
  sfxVolume: 50,
  sfxMuted: false,
};
const prefs = Object.assign(structuredClone(DEFAULTS), JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"));
if (prefs.source === "youtube") prefs.source = "soundtrack";
const savePrefs = () => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

const [catalog, soundtrack, extended] = await Promise.all([
  fetch("data/catalog.json").then((r) => r.json()),
  fetch("data/soundtrack.json").then((r) => r.json()),
  fetch("data/extended.json").then((r) => r.json()),
]);
const allTracks = [...soundtrack.tracks, ...extended.tracks];
const gameLabel = (t) => extended.packs[t.game]?.label;

const now = () => (window.__gtNow ? new Date(window.__gtNow) : new Date());
let season = resolveSeason(prefs.season, now(), catalog.christmasWindow);
let userImages = [];
let userAudio = [];
let userSfx = {};
const sfx = new Sfx();

const layers = [...document.querySelectorAll(".backdrop .scape")];
let front = 0;
let slides = [];
let slideIndex = 0;
let slideTimer;
const slideMs = () => prefs.slideInterval * 1000;

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
    layer.style.setProperty("--pan-duration", `${slideMs() / 1000 + 4}s`);
    layer.classList.add("on", "pan");
    layer.classList.toggle("alt", slideIndex % 2 === 1);
    back.classList.remove("on");
    return;
  }
}

function scheduleSlides() {
  clearInterval(slideTimer);
  if (prefs.slideshow && slides.length > 1) slideTimer = setInterval(() => showSlide(slideIndex + 1), slideMs());
}

const inSeason = (m) => !m.season || m.season === "any" || m.season === season;

function applyBackgrounds() {
  const mine = userImages.filter(inSeason);
  slides = mine.length ? mine : catalog.backgrounds[season];
  slideIndex = Math.floor(Math.random() * slides.length);
  showSlide(slideIndex);
  scheduleSlides();
}

function soundtrackPool() {
  const packs = prefs.extended && prefs.packs.length ? prefs.packs : ["gtsport"];
  const ofPacks = (s) => allTracks.filter((t) => packs.includes(t.game) && t.season === s);
  let tracks = ofPacks(season);
  if (season === "christmas") {
    if (prefs.extended && prefs.xmasMix === "all") tracks = [...tracks, ...ofPacks("normal")];
    else if (!tracks.length) tracks = soundtrack.tracks.filter((t) => t.season === "christmas");
  }
  if (prefs.favoritesOnly) {
    const favs = tracks.filter((t) => prefs.favorites.includes(t.id));
    if (favs.length) tracks = favs;
  }
  return tracks;
}

function musicTracks(source) {
  if (source === "off") return [];
  if (source === "local") {
    const mine = userAudio.filter(inSeason);
    return mine.length ? mine : userAudio;
  }
  return soundtrackPool();
}

function playMusic() {
  renderPool();
  if (prefs.source === "off") {
    music.stop();
    music.onTrack(null);
    return music.onStatus("Music off", false);
  }
  return music.use(musicTracks(prefs.source), prefs.source === "local" ? "No audio files added yet" : undefined);
}

function refreshPool() {
  const tracks = musicTracks(prefs.source);
  renderPool();
  if (music.track && tracks.some((t) => t.src === music.track.src)) music.reorder(tracks);
  else if (!$("#top-screen").hidden) playMusic();
}

const credit = (t) => (gameLabel(t) ? `${t.artist} · ${gameLabel(t)}` : t.artist);

const music = new Music({
  onTrack: (t) => {
    $("#track-title").textContent = t ? t.title : "-";
    $("#track-artist").textContent = t ? credit(t) : "";
    for (const li of document.querySelectorAll("#track-list li")) li.classList.toggle("current", li.dataset.src === t?.src);
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
  $("#np-artist").textContent = credit(t);
  const np = $("#now-playing");
  np.classList.add("show");
  clearTimeout(npTimer);
  npTimer = setTimeout(() => np.classList.remove("show"), 6000);
}

function renderPool() {
  const tracks = soundtrackPool();
  const q = $("#track-search").value.trim().toLowerCase();
  const list = prefs.favoritesOnly ? tracks.filter((t) => prefs.favorites.includes(t.id)) : tracks;
  const shown = list.filter((t) => !q || `${t.title} ${t.artist} ${gameLabel(t)}`.toLowerCase().includes(q));
  $("#track-list").replaceChildren(
    ...shown.map((t) => {
      const li = document.createElement("li");
      li.dataset.src = t.src;
      li.classList.toggle("current", music.track?.src === t.src);
      const play = document.createElement("button");
      play.type = "button";
      play.className = "pick";
      play.innerHTML = `<b></b><small></small><span class="game"></span>`;
      play.querySelector("b").textContent = t.title;
      play.querySelector("small").textContent = t.artist;
      play.querySelector(".game").textContent = gameLabel(t);
      play.addEventListener("click", () => {
        if (prefs.source !== "soundtrack") {
          prefs.source = "soundtrack";
          savePrefs();
          document.querySelector('input[name="source"][value="soundtrack"]').checked = true;
          music.use(musicTracks("soundtrack")).then(() => music.playTrack(t));
        } else music.playTrack(t);
      });
      const fav = document.createElement("button");
      fav.type = "button";
      fav.className = "fav";
      const on = prefs.favorites.includes(t.id);
      fav.setAttribute("aria-pressed", String(on));
      fav.setAttribute("aria-label", `${on ? "Remove" : "Add"} ${t.title} ${on ? "from" : "to"} favourites`);
      fav.innerHTML = `<i class="ti ti-star"></i>`;
      fav.addEventListener("click", () => {
        prefs.favorites = on ? prefs.favorites.filter((id) => id !== t.id) : [...prefs.favorites, t.id];
        savePrefs();
        if (prefs.favoritesOnly) refreshPool();
        else renderPool();
      });
      li.append(play, fav);
      return li;
    }),
  );
}

function applySeason() {
  season = resolveSeason(prefs.season, now(), catalog.christmasWindow);
  document.body.dataset.season = season;
  const news = catalog.news[season];
  $("#news-tag").textContent = news.tag;
  $("#news-headline").textContent = news.headline;
  $("#news-date").textContent = news.date;
  applyBackgrounds();
}

function applyMotion() {
  const still = !prefs.motion || reducedMotion.matches;
  document.body.classList.toggle("still", still);
  $("#motion").checked = prefs.motion && !reducedMotion.matches;
  $("#motion").disabled = reducedMotion.matches;
  $("#motion").closest("label").title = reducedMotion.matches ? "Off: system reduced motion" : "";
}

function tick() {
  const d = now();
  $("#clock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  $("#feed-date").textContent = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (prefs.season === "auto" && resolveSeason("auto", d, catalog.christmasWindow) !== season) {
    applySeason();
    playMusic();
  }
}

async function loadUserMedia() {
  const manifest = await folderManifest();
  const audio = await listFiles("audio");
  const images = await listFiles("image");
  for (const u of [...userAudio, ...userImages, ...Object.values(userSfx)]) {
    if (u.src.startsWith("blob:")) URL.revokeObjectURL(u.src);
  }
  userSfx = {};
  for (const [cue, file] of Object.entries(manifest.sfx)) userSfx[cue] = { src: `media/local/${file}`, name: file };
  for (const cue of CUES) {
    const [f] = await listFiles(`sfx-${cue}`);
    if (f) userSfx[cue] = { src: URL.createObjectURL(f.blob), name: f.name };
    $(`#sfx-${cue}-name`).textContent = userSfx[cue] ? `· ${userSfx[cue].name}` : "· none";
  }
  sfx.load(userSfx);
  userAudio = [
    ...manifest.audio.map((a) => ({ ...a, src: `media/local/${a.file}` })),
    ...audio.map((f) => ({ title: f.name.replace(/\.[^.]+$/, ""), artist: "Your file", src: URL.createObjectURL(f.blob) })),
  ];
  userImages = [
    ...manifest.images.map((i) => ({ src: `media/local/${i.file}`, title: i.title || i.file, season: i.season, kind: "user", credit: "local folder" })),
    ...images.map((f) => ({ src: URL.createObjectURL(f.blob), title: f.name, kind: "user", credit: "imported in this browser" })),
  ];
}

let openMode;

function closeModeMenu(refocus = true) {
  if (!openMode) return false;
  const btn = openMode;
  openMode = undefined;
  btn.setAttribute("aria-expanded", "false");
  $("#mode-menu").hidden = true;
  if (refocus) btn.focus({ preventScroll: true });
  return true;
}

function openModeMenu(btn) {
  closeModeMenu(false);
  const menu = $("#mode-menu");
  menu.replaceChildren(
    ...catalog.modeMenus[btn.dataset.mode].map((item) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.style.setProperty("--item", item.color);
      b.innerHTML = `<i class="ti ${item.icon}"></i><b></b>${item.detail ? "<small></small>" : ""}`;
      b.querySelector("b").textContent = item.label;
      if (item.detail) b.querySelector("small").textContent = item.detail;
      b.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && b.focus({ preventScroll: true }));
      b.addEventListener("focus", () => sfx.play("move", b));
      b.addEventListener("click", () => {
        sfx.play("select", b);
        showToast(item.label);
      });
      li.append(b);
      return li;
    }),
  );
  const stage = $("#top-screen").getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  menu.style.top = `${r.bottom - stage.top}px`;
  menu.hidden = false;
  menu.style.left = `${Math.floor(Math.max(0, Math.min(r.left - stage.left, stage.width - menu.getBoundingClientRect().width)))}px`;
  btn.setAttribute("aria-expanded", "true");
  openMode = btn;
  balloonFor(null);
  menu.querySelector("button").focus({ preventScroll: true });
}

function modeMenuKey(e) {
  const items = [...$("#mode-menu").querySelectorAll("button")];
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus({ preventScroll: true });
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const modes = [...document.querySelectorAll(".mode")];
    const next = modes[modes.indexOf(openMode) + (e.key === "ArrowRight" ? 1 : -1)];
    if (next?.dataset.mode) openModeMenu(next);
    else if (next) {
      closeModeMenu(false);
      next.focus();
    }
  } else if (e.key === "Escape" || e.key === "Backspace") {
    sfx.play("back", openMode);
    closeModeMenu();
  } else return false;
  e.preventDefault();
  return true;
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
  if (open === $("#settings").hidden) sfx.play(open ? "select" : "back", $("#settings"));
  $("#settings").hidden = !open;
  $("#settings-toggle").setAttribute("aria-expanded", String(open));
  if (open) $("#settings input:checked")?.focus();
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

let ambient = false;
let idleTimer;
let hintTimer;
let ambientSince = 0;
let ambientOrigin;

function enterAmbience() {
  if (ambient || $("#top-screen").hidden) return;
  ambient = true;
  ambientSince = performance.now();
  ambientOrigin = undefined;
  toggleSettings(false);
  balloonFor(null);
  document.body.classList.add("ambient");
  const hint = $("#ambience-hint");
  hint.hidden = false;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => (hint.hidden = true), 3000);
}

function exitAmbience() {
  if (!ambient) return;
  ambient = false;
  document.body.classList.remove("ambient");
  $("#ambience-hint").hidden = true;
}

function activity(e) {
  if (ambient) {
    if (performance.now() - ambientSince < 500) return;
    if (e.type === "pointermove") {
      ambientOrigin ??= [e.clientX, e.clientY];
      if (Math.hypot(e.clientX - ambientOrigin[0], e.clientY - ambientOrigin[1]) < 16) return;
    }
    if (e.type === "keydown") e.preventDefault();
    exitAmbience();
    e.stopImmediatePropagation();
  }
  clearTimeout(idleTimer);
  if (prefs.ambienceIdle > 0) idleTimer = setTimeout(enterAmbience, prefs.ambienceIdle * 1000);
}

for (const type of ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"]) {
  document.addEventListener(type, activity, { capture: true, passive: type !== "keydown" });
}

function syncControls() {
  for (const r of document.querySelectorAll('input[name="season"]')) r.checked = r.value === prefs.season;
  for (const r of document.querySelectorAll('input[name="source"]')) r.checked = r.value === prefs.source;
  for (const r of document.querySelectorAll('input[name="order"]')) r.checked = r.value === prefs.order;
  for (const r of document.querySelectorAll('input[name="xmas-mix"]')) r.checked = r.value === prefs.xmasMix;
  for (const c of document.querySelectorAll("#packs input")) c.checked = prefs.packs.includes(c.value);
  $("#volume").value = prefs.volume;
  $("#sfx-volume").value = prefs.sfxVolume;
  $("#sfx-mute").checked = prefs.sfxMuted;
  sfx.volume = prefs.sfxVolume;
  sfx.muted = prefs.sfxMuted;
  $("#slideshow").checked = prefs.slideshow;
  $("#slide-interval").value = String(prefs.slideInterval);
  $("#ambience-idle").value = String(prefs.ambienceIdle);
  $("#repeat").checked = prefs.repeat;
  $("#extended").checked = prefs.extended;
  $("#favorites-only").checked = prefs.favoritesOnly;
  document.querySelector("#extended-section").classList.toggle("off", !prefs.extended);
  music.shuffle = prefs.order === "shuffle";
  music.setRepeat(prefs.repeat);
  applyMotion();
}

function wireSettings() {
  $("#packs").replaceChildren(
    ...Object.entries(extended.packs).map(([id, p]) => {
      const label = document.createElement("label");
      label.className = "check";
      const n = allTracks.filter((t) => t.game === id).length;
      label.innerHTML = `<input type="checkbox" value="${id}"><span></span>`;
      label.querySelector("span").textContent = `${p.label} (${p.year}) · ${n} tracks`;
      label.querySelector("input").addEventListener("change", () => {
        prefs.packs = [...document.querySelectorAll("#packs input:checked")].map((c) => c.value);
        savePrefs();
        refreshPool();
      });
      return label;
    }),
  );
  for (const r of document.querySelectorAll('input[name="season"]')) {
    r.addEventListener("change", () => {
      prefs.season = r.value;
      savePrefs();
      applySeason();
      if (prefs.source === "soundtrack") playMusic();
    });
  }
  for (const r of document.querySelectorAll('input[name="source"]')) {
    r.addEventListener("change", () => {
      prefs.source = r.value;
      savePrefs();
      playMusic();
    });
  }
  for (const r of document.querySelectorAll('input[name="order"]')) {
    r.addEventListener("change", () => {
      prefs.order = r.value;
      savePrefs();
      music.shuffle = prefs.order === "shuffle";
      if (music.track) music.reorder(musicTracks(prefs.source));
    });
  }
  for (const r of document.querySelectorAll('input[name="xmas-mix"]')) {
    r.addEventListener("change", () => {
      prefs.xmasMix = r.value;
      savePrefs();
      refreshPool();
    });
  }
  $("#extended").addEventListener("change", (e) => {
    prefs.extended = e.target.checked;
    savePrefs();
    document.querySelector("#extended-section").classList.toggle("off", !prefs.extended);
    refreshPool();
  });
  $("#repeat").addEventListener("change", (e) => {
    prefs.repeat = e.target.checked;
    savePrefs();
    music.setRepeat(prefs.repeat);
  });
  $("#favorites-only").addEventListener("change", (e) => {
    prefs.favoritesOnly = e.target.checked;
    savePrefs();
    refreshPool();
  });
  $("#track-search").addEventListener("input", renderPool);
  for (const input of document.querySelectorAll(".sfx-cues input")) {
    input.addEventListener("change", async (e) => {
      if (!e.target.files.length) return;
      await replaceKind(`sfx-${e.target.dataset.cue}`, [e.target.files[0]]);
      e.target.value = "";
      await loadUserMedia();
      sfx.play(e.target.dataset.cue, e.target);
    });
  }
  $("#sfx-volume").addEventListener("input", (e) => {
    prefs.sfxVolume = Number(e.target.value);
    sfx.volume = prefs.sfxVolume;
    savePrefs();
  });
  $("#sfx-mute").addEventListener("change", (e) => {
    prefs.sfxMuted = e.target.checked;
    sfx.muted = prefs.sfxMuted;
    savePrefs();
  });
  $("#volume").addEventListener("input", (e) => {
    prefs.volume = Number(e.target.value);
    savePrefs();
    music.setVolume(prefs.volume);
  });
  $("#slideshow").addEventListener("change", (e) => {
    prefs.slideshow = e.target.checked;
    savePrefs();
    scheduleSlides();
  });
  $("#slide-interval").addEventListener("change", (e) => {
    prefs.slideInterval = Number(e.target.value);
    savePrefs();
    scheduleSlides();
  });
  $("#motion").addEventListener("change", (e) => {
    prefs.motion = e.target.checked;
    savePrefs();
    applyMotion();
  });
  reducedMotion.addEventListener("change", applyMotion);
  $("#ambience-idle").addEventListener("change", (e) => {
    prefs.ambienceIdle = Number(e.target.value);
    savePrefs();
    activity(e);
  });
  $("#ambience-now").addEventListener("click", enterAmbience);
  $("#reset-settings").addEventListener("click", () => {
    localStorage.removeItem(PREFS_KEY);
    Object.assign(prefs, structuredClone(DEFAULTS));
    syncControls();
    applySeason();
    music.setVolume(prefs.volume);
    if (!$("#top-screen").hidden) playMusic();
  });
  $("#play").addEventListener("click", () => music.toggle());
  $("#next").addEventListener("click", () => music.next());
  $("#prev").addEventListener("click", () => music.prev());
  $("#local-files").addEventListener("change", async (e) => {
    await addFiles("audio", e.target.files);
    e.target.value = "";
    await loadUserMedia();
    if (prefs.source === "local") playMusic();
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
    if (prefs.source === "local") playMusic();
  });
  $("#fullscreen").addEventListener("click", toggleFullscreen);
  $("#settings-toggle").addEventListener("click", () => toggleSettings());
  syncControls();
}

function wireMenu() {
  for (const el of navItems()) {
    el.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "mouse" && (!openMode || openMode === el)) el.focus({ preventScroll: true });
      balloonFor(el);
    });
    el.addEventListener("mouseleave", () => balloonFor(null));
    el.addEventListener("focus", () => {
      sfx.play("move", el);
      if (!openMode) balloonFor(el);
    });
    el.addEventListener("blur", () => balloonFor(null));
    el.addEventListener("click", () => {
      if (el.dataset.mode) {
        if (openMode === el) {
          sfx.play("back", el);
          return closeModeMenu();
        }
        sfx.play("select", el);
        return openModeMenu(el);
      }
      closeModeMenu(false);
      if (el.id === "gt-menu") return toggleSettings(true);
      sfx.play("select", el);
      const label = el.querySelector("span")?.textContent || el.dataset.balloon || "This feature";
      showToast(label);
    });
  }
  document.addEventListener("pointerdown", (e) => {
    if (openMode && !e.target.closest("#mode-menu, .mode")) closeModeMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if ($("#top-screen").hidden || e.target.matches("input[type=range], input[type=file], input[type=search], select")) return;
    if (openMode && modeMenuKey(e)) return;
    const inSettings = !$("#settings").hidden && $("#settings").contains(e.target);
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const key = e.ctrlKey || e.metaKey || e.altKey ? "" : e.key.toLowerCase();
    if (dirs[e.key] && !inSettings) {
      e.preventDefault();
      moveFocus(...dirs[e.key]);
    } else if (e.key === "Escape") {
      $("#toast").hidden = true;
      if (!$("#settings").hidden) {
        toggleSettings(false);
        $("#settings-toggle").focus();
      }
    } else if (key === "s") toggleSettings();
    else if (key === "f") toggleFullscreen();
    else if (key === "n") music.next();
    else if (key === "a") enterAmbience();
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
  sfx.unlocked = true;
  await playMusic();
}

wireSettings();
await loadUserMedia();
titleBackdrop();
tick();
setInterval(tick, 1000);
$("#start").addEventListener("click", enter, { once: true });
$("#start").focus();
document.body.dataset.ready = "true";
