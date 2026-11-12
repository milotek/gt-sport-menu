import json
import re
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

DEST = Path(__file__).resolve().parent.parent / "site" / "data" / "coverage.json"
UA = {"User-Agent": "gt-sport-menu-manifest"}
CUE_TITLE = re.compile(r"prize|race lose", re.I)
MENU_USAGE = re.compile(r"^menu\b|pre-race|multiplayer|status report|gt theatre|user manual|main menu|dealership|single player|options|data transfer|race menu|\bmap\b|my home|machine test|car ?wash|city|license test|arcade mode|go race|garage|^home$|^arcade$|^aston$|^chevy$|^chrysler$|^honda$|^mazda$|^mitsu$|^nissan$|^subaru$|^toyota$|^tvr$", re.I)
CUE_SECONDS = 20

ITEMS = [
    {
        "id": "polyphony-digital-a-m-gran-turismo-psp-original-game-soundtrack",
        "game": "gtpsp",
        "album": "Gran Turismo PSP (Original Game Soundtrack)",
        "artist": "Polyphony Digital & aM",
        "format": "VBR MP3",
        "note": "Originals are WMA; the src is archive.org's own MP3 derivative of each file",
    },
    {
        "id": "scus-94194-bgm-15_202302",
        "game": "gt1",
        "album": "Gran Turismo (NTSC-U, SCUS-94194) game rip",
        "artist": "Gran Turismo (NTSC-U)",
        "format": "VBR MP3",
    },
    {
        "id": "gran-turismo-2-1999-ost",
        "game": "gt2",
        "album": "Gran Turismo 2 game rip with in-game usage labels",
        "artist": "Gran Turismo 2",
        "format": "VBR MP3",
    },
    {
        "id": "gran-turismo-2-usa-simulation-mode-rev-1",
        "game": "gt2",
        "album": "Gran Turismo 2 (NTSC-U) Simulation Mode",
        "artist": "Gran Turismo 2 (NTSC-U)",
        "format": "VBR MP3",
    },
    {
        "id": "1-slipstream-arcade-mode-go-race",
        "game": "gt3",
        "album": "Gran Turismo 3 A-Spec (NTSC-U) Arcade Mode",
        "artist": "Gran Turismo 3 A-Spec (NTSC-U)",
        "format": "VBR MP3",
    },
]


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def title_of(name):
    stem = Path(name).stem
    prefixed = re.sub(r"^.*? - \d+\. ", "", stem)
    return (prefixed if prefixed != stem else re.sub(r"^\d+\s*-?\s*", "", stem)).strip()


def usage(title):
    m = re.search(r"\(([^)]*)\)\s*$", title)
    return m.group(1) if m else title


def main():
    tracks, excluded = [], {}
    for item in ITEMS:
        meta = json.load(urllib.request.urlopen(urllib.request.Request(f"https://archive.org/metadata/{item['id']}", headers=UA), timeout=120))
        files = [f for f in meta["files"] if f["name"].lower().endswith(".mp3") and f.get("format") == item["format"]]
        for f in sorted(files, key=lambda f: f["name"]):
            title = title_of(f["name"])
            raw = f.get("length")
            seconds = None
            if raw:
                parts = [float(x) for x in str(raw).split(":")]
                seconds = round(parts[0] * 60 + parts[1]) if len(parts) == 2 else round(parts[0])
            if (seconds is not None and seconds < CUE_SECONDS) or CUE_TITLE.search(title):
                excluded.setdefault(item["game"], []).append(f"{title} ({item['album']}, {seconds}s cue)")
                continue
            kind = "menu" if MENU_USAGE.search(usage(title)) or MENU_USAGE.search(title) else "unclassified"
            tracks.append({
                "id": f"{item['game']}_{norm(item['id'] + ' ' + title).replace(' ', '_')}",
                "game": item["game"],
                "type": kind,
                "season": "normal",
                "title": title,
                "artist": item["artist"],
                "album": item["album"],
                "seconds": seconds,
                "bytes": int(f["size"]) if f.get("size") else None,
                "src": f"https://archive.org/download/{item['id']}/{urllib.parse.quote(f['name'])}",
                "codec": "mp3",
                "origin": "archive.org item",
                "archiveItem": f"https://archive.org/details/{item['id']}",
                "basis": ("In-game screen named in the uploader's track title" if kind == "menu" else "No menu or race evidence found") + (f"; {item['note']}" if item.get("note") else ""),
                "appearsIn": [item["game"]],
            })
    manifest = {
        "about": "Additional editions and games from separate archive.org items. Each src streams from archive.org.",
        "packs": {"gtpsp": {"label": "GT PSP", "year": 2009}},
        "excluded": excluded,
        "tracks": tracks,
    }
    DEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {}
    for t in tracks:
        counts.setdefault(t["game"], {}).setdefault(t["type"], 0)
        counts[t["game"]][t["type"]] += 1
    print(f"wrote {DEST}: {json.dumps(counts)}")


if __name__ == "__main__":
    main()
