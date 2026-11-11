let ytApi;

function loadYouTubeApi() {
  ytApi ??= new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => reject(new Error("YouTube player could not be loaded"));
    document.head.append(s);
  });
  return ytApi;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Music {
  constructor({ dock, mount, onTrack, onStatus }) {
    this.dock = dock;
    this.mount = mount;
    this.onTrack = onTrack;
    this.onStatus = onStatus;
    this.audio = new Audio();
    this.audio.addEventListener("ended", () => this.next());
    this.audio.addEventListener("error", () => this.skipBroken("This file could not be played"));
    this.audio.addEventListener("playing", () => this.onStatus("Playing", true));
    this.audio.addEventListener("pause", () => !this.audio.ended && this.onStatus("Paused", false));
    this.volume = 60;
    this.source = "off";
    this.queue = [];
    this.index = 0;
    this.failures = 0;
  }

  get track() {
    return this.queue[this.index];
  }

  async use(source, tracks) {
    this.stop();
    this.source = source;
    this.queue = source === "local" ? tracks : shuffle(tracks);
    this.index = 0;
    this.failures = 0;
    this.dock.hidden = source !== "youtube";
    if (source === "off") return this.onStatus("Music off", false);
    if (!this.queue.length) {
      this.onTrack(null);
      return this.onStatus(source === "local" ? "No audio files added yet" : "No playable tracks", false);
    }
    await this.play();
  }

  async play() {
    const t = this.track;
    if (!t) return;
    this.onTrack(t);
    if (this.source === "local") {
      if (this.audio.src !== t.url) this.audio.src = t.url;
      this.audio.volume = this.volume / 100;
      try {
        await this.audio.play();
      } catch (e) {
        this.onStatus(e.name === "NotAllowedError" ? "The browser blocked playback. Press play." : "This file could not be played", false);
      }
      return;
    }
    if (this.source === "youtube") {
      this.onStatus("Loading YouTube player", false);
      const slow = setTimeout(() => this.track === t && !this.playing && this.onStatus("YouTube is slow to respond. Still trying.", false), 20000);
      try {
        const YT = await loadYouTubeApi();
        if (this.source !== "youtube" || this.track !== t) return;
        if (this.player) {
          this.player.loadVideoById({ videoId: t.youtubeId, startSeconds: t.start ?? 0 });
        } else {
          this.player = await new Promise((resolve) => {
            const p = new YT.Player(this.mount, {
              videoId: t.youtubeId,
              playerVars: { autoplay: 1, playsinline: 1, rel: 0, start: t.start ?? 0 },
              events: {
                onReady: () => resolve(p),
                onStateChange: (e) => this.ytState(e.data),
                onError: (e) => this.skipBroken(`YouTube error ${e.data}`),
              },
            });
          });
          this.player.setVolume(this.volume);
          this.player.playVideo();
        }
      } catch (e) {
        this.onStatus(e.message, false);
      } finally {
        clearTimeout(slow);
      }
    }
  }

  ytState(state) {
    const S = window.YT.PlayerState;
    if (state === S.PLAYING) {
      this.failures = 0;
      this.onStatus("Playing", true);
    } else if (state === S.PAUSED) this.onStatus("Paused", false);
    else if (state === S.ENDED) this.next();
    else if (state === S.UNSTARTED) this.onStatus("Press play in the video if playback is blocked", false);
  }

  skipBroken(reason) {
    this.onStatus(reason, false);
    if (++this.failures >= this.queue.length) return this.onStatus(`${reason}. No playable tracks remain.`, false);
    this.next();
  }

  next() {
    if (!this.queue.length) return;
    this.index = (this.index + 1) % this.queue.length;
    this.play();
  }

  prev() {
    if (!this.queue.length) return;
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.play();
  }

  get playing() {
    if (this.source === "local") return !this.audio.paused;
    if (this.source === "youtube" && this.player?.getPlayerState) return this.player.getPlayerState() === window.YT.PlayerState.PLAYING;
    return false;
  }

  toggle() {
    if (this.playing) return this.pause();
    if (this.source === "local") return this.audio.src ? this.audio.play().catch(() => {}) : this.play();
    if (this.source === "youtube") return this.player ? this.player.playVideo() : this.play();
  }

  pause() {
    this.audio.pause();
    this.player?.pauseVideo?.();
  }

  stop() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.player?.stopVideo?.();
  }

  setVolume(v) {
    this.volume = v;
    this.audio.volume = v / 100;
    this.player?.setVolume?.(v);
  }
}
