import argparse
import concurrent.futures
import html
import json
import re
import struct
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ITEM = "https://archive.org/details/gran-turismo-complete-soundtrack"
LISTING = "https://archive.org/download/gran-turismo-complete-soundtrack/Gran%20Turismo%20Complete%20Soundtrack.rar/"
DEST = Path(__file__).resolve().parent.parent / "site" / "data" / "extended.json"
UA = {"User-Agent": "gt-sport-menu-manifest"}
TEXT_ENCODINGS = {0: "latin1", 1: "utf-16", 2: "utf-16-be", 3: "utf-8"}
HOLIDAY_FOLDER = "2022 - Gran Turismo 7/Best Lap Vol. 2/"
HOLIDAY_SOURCE = "https://ototoy.jp/_/default/p/1938367"
HOLIDAY_TITLES = {"christmas tree"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def members():
    page = urllib.request.urlopen(urllib.request.Request(LISTING, headers=UA), timeout=120).read().decode("utf-8", "replace")
    for href in re.findall(r'href="([^"]+\.mp3)"', page, flags=re.I):
        href = html.unescape(href)
        yield urllib.parse.unquote(href).split("Complete Soundtrack/")[-1], "https:" + href if href.startswith("//") else href


def syncsafe(b):
    return (b[0] << 21) | (b[1] << 14) | (b[2] << 7) | b[3]


def id3(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        buf = r.read(131072)
    tags = {}
    if buf[:3] != b"ID3":
        return tags
    version, end, i = buf[3], min(10 + syncsafe(buf[6:10]), len(buf)), 10
    while i + 10 <= end:
        fid = buf[i:i + 4].decode("latin1")
        if not fid.strip("\x00"):
            break
        size = syncsafe(buf[i + 4:i + 8]) if version == 4 else struct.unpack(">I", buf[i + 4:i + 8])[0]
        data, i = buf[i + 10:i + 10 + size], i + 10 + size
        if fid in ("TIT2", "TPE1", "TALB", "TLEN") and data:
            tags[fid] = data[1:].decode(TEXT_ENCODINGS.get(data[0], "latin1"), "replace").replace("\x00", "").strip()
    return tags


def wiki_menu_titles(path):
    titles = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.split(" | ")]
        if len(cells) >= 3:
            titles[norm(cells[1])] = cells[2]
    return titles


def track(game, path, url, tags, basis, season="normal"):
    seconds = round(int(tags["TLEN"]) / 1000) if tags.get("TLEN", "").isdigit() else None
    return {
        "id": f"{game}_{norm(Path(path).stem).replace(' ', '_')}",
        "game": game,
        "season": season,
        "title": tags.get("TIT2") or Path(path).stem.split(". ", 1)[-1],
        "artist": tags.get("TPE1") or "Unknown",
        "album": tags.get("TALB"),
        "seconds": seconds,
        "src": url,
        "codec": "mp3",
        "origin": "archive.org member",
        "archiveItem": ITEM,
        "archiveMember": path,
        "basis": basis,
    }


def main():
    ap = argparse.ArgumentParser(description="Build GT4 and GT7 menu-music packs from the archive.org Gran Turismo Complete Soundtrack upload.")
    ap.add_argument("gt7_wiki", help="Text export of the vgost.fandom.com Gran Turismo 7 table: 'Artist | Song | Default BGM | ...' per line")
    ap.add_argument("--probe", nargs="*", default=[], help="JSON files with full-download measurements (url, seconds, bytes, sha256)")
    args = ap.parse_args()

    measured = {m["url"]: m for f in args.probe for m in json.loads(Path(f).read_text(encoding="utf-8")) if "sha256" in m}
    listing = [(p, u) for p, u in members() if p.startswith(("2004 - Gran Turismo 4/", "2022 - Gran Turismo 7/Original Soundtrack/", HOLIDAY_FOLDER))]
    with concurrent.futures.ThreadPoolExecutor(6) as ex:
        tagged = list(zip(listing, ex.map(lambda pu: id3(pu[1]), listing)))
    bgm = wiki_menu_titles(args.gt7_wiki)

    tracks, excluded = [], {"gt4": [], "gt7": []}
    for (path, url), tags in tagged:
        title = tags.get("TIT2", "")
        if path.startswith("2004"):
            if tags.get("TPE1") == "大平勇" and norm(title) != "vette lug":
                tracks.append(track("gt4", path, url, {**tags, "TPE1": "Isamu Ohira"}, "Isamu Ohira composition (ID3 artist 大平勇). Ohira is credited as GT4 menu music composer."))
            else:
                excluded["gt4"].append(f"{title} ({tags.get('TPE1')})")
        elif path.startswith(HOLIDAY_FOLDER):
            tracks.append(track("gt7", path, url, tags, f"GRAN TURISMO 7 JAZZ SELECTION BEST LAP vol.2 (Sony Interactive Entertainment, 2023-12-22), described by the label as Christmas-period in-game menu jazz: {HOLIDAY_SOURCE}", "christmas"))
        else:
            tag = bgm.get(norm(title))
            if tag != "Menu":
                excluded["gt7"].append(f"{title} (album {tags.get('TALB')}, BGM {tag})")
                continue
            season = "christmas" if norm(title) in HOLIDAY_TITLES else "normal"
            if tags.get("TALB") == "Gran Turismo 7 OST":
                basis = "ID3 album 'Gran Turismo 7 OST' and Default BGM 'Menu' on the vgost.fandom.com GT7 table"
            else:
                basis = f"Default BGM 'Menu' on the vgost.fandom.com GT7 table; GT7 reuses this recording and the upload's file is tagged from {tags.get('TALB')}"
            tracks.append(track("gt7", path, url, tags, basis, season))

    unique, seen = [], {}
    for t in tracks:
        m = measured.get(t["src"])
        if m:
            t.update(seconds=round(m["seconds"]), bytes=m["bytes"], sha256=m["sha256"])
        keys = [t.get("sha256") or t["src"]]
        if t["seconds"] is not None:
            keys.append((t["game"], norm(t["title"]), norm(t["artist"]), t["seconds"]))
        dup = next((seen[k] for k in keys if k in seen), None)
        if dup:
            excluded[t["game"]].append(f"{t['title']} (same recording as {dup})")
            continue
        for k in keys:
            seen[k] = t["archiveMember"]
        unique.append(t)
    tracks = unique

    manifest = {
        "about": "Opt-in extended menu-music packs. Each src streams from archive.org. Replace src with a relative path to use your own recording.",
        "source": ITEM,
        "packs": {
            "gtsport": {"label": "GT Sport", "year": 2017},
            "gt4": {"label": "GT4", "year": 2004},
            "gt7": {"label": "GT7", "year": 2022},
        },
        "excluded": excluded,
        "unmeasured": [t["archiveMember"] for t in tracks if t["seconds"] is None],
        "tracks": tracks,
    }
    DEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {DEST}: gt4={sum(t['game'] == 'gt4' for t in tracks)} gt7={sum(t['game'] == 'gt7' for t in tracks)}")


if __name__ == "__main__":
    main()
