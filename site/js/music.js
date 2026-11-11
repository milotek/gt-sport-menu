function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Music {
  constructor({ onTrack, onStatus }) {
    this.onTrack = onTrack;
    this.onStatus = onStatus;
    this.audio = new Audio();
    this.audio.id = "music";
    document.body.append(this.audio);
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";
    this.audio.addEventListener("ended", () => this.next());
    this.audio.addEventListener("error", () => this.audio.getAttribute("src") && this.skipBroken("This track could not be loaded"));
    this.audio.addEventListener("waiting", () => this.onStatus("Buffering", false));
    this.audio.addEventListener("playing", () => {
      this.failures = 0;
      this.onStatus("Playing", true);
    });
    this.audio.addEventListener("pause", () => !this.audio.ended && !this.audio.error && this.onStatus("Paused", false));
    this.volume = 60;
    this.queue = [];
    this.index = 0;
    this.failures = 0;
  }

  get track() {
    return this.queue[this.index];
  }

  get playing() {
    return !this.audio.paused;
  }

  async use(tracks, emptyMessage = "No tracks to play") {
    this.stop();
    this.queue = shuffle(tracks);
    this.index = 0;
    this.failures = 0;
    if (!this.queue.length) {
      this.onTrack(null);
      return this.onStatus(emptyMessage, false);
    }
    await this.play();
  }

  async play() {
    const t = this.track;
    if (!t) return;
    this.onTrack(t);
    if (this.audio.getAttribute("src") !== t.src) {
      this.audio.src = t.src;
      this.onStatus("Loading", false);
    }
    this.audio.volume = this.volume / 100;
    try {
      await this.audio.play();
    } catch (e) {
      if (e.name === "NotAllowedError") this.onStatus("The browser blocked playback. Press play.", false);
      else if (e.name !== "AbortError" && e.name !== "NotSupportedError") this.onStatus("This track could not be played", false);
    }
  }

  skipBroken(reason) {
    if (++this.failures >= this.queue.length) return this.onStatus(`${reason}. No playable tracks remain.`, false);
    this.onStatus(`${reason}. Skipping.`, false);
    this.next();
  }

  next() {
    if (!this.queue.length) return;
    this.index = (this.index + 1) % this.queue.length;
    this.play();
  }

  prev() {
    if (!this.queue.length) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.play();
  }

  toggle() {
    if (this.playing) return this.audio.pause();
    return this.audio.getAttribute("src") ? this.audio.play().catch(() => {}) : this.play();
  }

  stop() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  setVolume(v) {
    this.volume = v;
    this.audio.volume = v / 100;
  }
}
