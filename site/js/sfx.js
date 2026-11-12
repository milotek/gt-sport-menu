export const CUES = ["move", "select", "back"];

export class Sfx {
  constructor() {
    this.els = {};
    for (const cue of CUES) {
      const el = new Audio();
      el.id = `cue-${cue}`;
      el.preload = "auto";
      document.body.append(el);
      this.els[cue] = el;
    }
    this.volume = 50;
    this.muted = false;
    this.unlocked = false;
    this.last = { cue: null, target: null, at: 0 };
  }

  load(sources) {
    for (const cue of CUES) {
      const el = this.els[cue];
      const src = sources[cue]?.src;
      if (src) {
        if (el.getAttribute("src") !== src) el.src = src;
        el.dataset.name = sources[cue].name;
      } else {
        el.removeAttribute("src");
        delete el.dataset.name;
        el.load();
      }
    }
  }

  play(cue, target) {
    const el = this.els[cue];
    if (!this.unlocked || this.muted || !el.getAttribute("src")) return;
    const now = performance.now();
    if (this.last.cue === cue && this.last.target === target && now - this.last.at < 250) return;
    this.last = { cue, target, at: now };
    el.volume = this.volume / 100;
    el.pause();
    el.currentTime = 0;
    el.play().catch(() => {});
  }
}
