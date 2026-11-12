import argparse
import concurrent.futures
import html
import json
import re
import struct
import time
import unicodedata
import urllib.error
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
OHIRA = {"大平勇", "Isamu Ohira"}
ROMAN = {"大平勇": "Isamu Ohira", "安藤まさひろ": "Masahiro Andoh"}
CUE = re.compile(r"^(race start|race results|championship intro|qualifying results|prize|failure|cafe menu)", re.I)

PACKS = {
    "gt1": {"label": "GT", "year": 1997, "folder": "1997 - Gran Turismo/", "wiki": "vgost_Gran_Turismo.txt"},
    "gt2": {"label": "GT2", "year": 1999, "folder": "1999 - Gran Turismo 2/", "wiki": "vgost_Gran_Turismo_2.txt"},
    "gt3": {"label": "GT3", "year": 2001, "folder": "2001 - Gran Turismo 3 A-spec/", "wiki": "vgost_Gran_Turismo_3__A_Spec.txt"},
    "gt4": {"label": "GT4", "year": 2004, "folder": "2004 - Gran Turismo 4/", "wiki": "vgost_gt4.txt"},
    "gt5": {"label": "GT5", "year": 2010, "folder": "2010 - Gran Turismo 5/", "wiki": "vgost_Gran_Turismo_5.txt"},
    "gt6": {"label": "GT6", "year": 2013, "folder": "2013 - Gran Turismo 6/", "wiki": "vgost_Gran_Turismo_6.txt"},
    "gtsport": {"label": "GT Sport", "year": 2017, "folder": "2017 - Gran Turismo Sport/Transmission Mode, Jingles, Christmas, Extra/"},
    "gt7": {"label": "GT7", "year": 2022, "folder": "2022 - Gran Turismo 7/", "wiki": "vgost_gt7.txt"},
}
MENU_TAGS = {"Menu", "Menu / Slideshow"}
RACE_TAGS = {"Race"}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def fetch(url, limit=None):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read(limit) if limit else r.read()
        except urllib.error.HTTPError as e:
            if e.code != 503 or attempt == 4:
                raise
            time.sleep(20 * (attempt + 1))


def members():
    page = fetch(LISTING).decode("utf-8", "replace")
    for href in re.findall(r'href="([^"]+\.mp3)"', page, flags=re.I):
        href = html.unescape(href)
        yield urllib.parse.unquote(href).split("Complete Soundtrack/")[-1], "https:" + href if href.startswith("//") else href


def syncsafe(b):
    return (b[0] << 21) | (b[1] << 14) | (b[2] << 7) | b[3]


def id3(url):
    try:
        buf = fetch(url, 131072)
    except urllib.error.HTTPError:
        return {}
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


def wiki_tags(path):
    tags = {}
    if not path.exists():
        return tags
    for line in path.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.split(" | ")]
        if len(cells) >= 3:
            tags.setdefault(norm(cells[1]), cells[2])
    return tags


def classify(game, path, tags, wiki):
    title, artist = tags.get("TIT2", ""), tags.get("TPE1", "")
    tag = wiki.get(norm(title))
    if game == "gtsport":
        return ("unclassified", "normal", "GT Sport 'Transmission Mode' folder in the upload; no source ties these files to menu playback") if "/" not in path[len(PACKS[game]["folder"]):] and re.match(r"^\d+\. ", Path(path).name) and int(Path(path).name.split(".")[0]) <= 50 else None
    if path.startswith(HOLIDAY_FOLDER):
        return ("menu", "christmas", f"GRAN TURISMO 7 JAZZ SELECTION BEST LAP vol.2 (Sony Interactive Entertainment, 2023-12-22), Christmas-period in-game menu jazz per the label listing: {HOLIDAY_SOURCE}")
    if game == "gt7" and CUE.match(title or Path(path).stem.split(". ", 1)[-1]):
        return None
    if game in ("gt2", "gt3", "gt4") and artist in OHIRA and norm(title) != "vette lug":
        return ("menu", "normal", "Isamu Ohira composition; Ohira is credited as menu music composer for GT2 to GT4")
    if tag in MENU_TAGS:
        season = "christmas" if game == "gt7" and norm(title) in HOLIDAY_TITLES else "normal"
        return ("menu", season, f"Default BGM '{tag}' on the vgost.fandom.com {PACKS[game]['label']} table")
    if tag in RACE_TAGS:
        return ("race", "normal", f"Default BGM 'Race' on the vgost.fandom.com {PACKS[game]['label']} table")
    return ("unclassified", "normal", "No menu or race evidence found")


def main():
    ap = argparse.ArgumentParser(description="Build Gran Turismo series music packs from the archive.org Gran Turismo Complete Soundtrack upload.")
    ap.add_argument("wiki_dir", type=Path, help="Directory of vgost.fandom.com table text exports ('Artist | Song | BGM | ...' per line)")
    ap.add_argument("--probe", nargs="*", default=[], help="JSON files with full-download measurements (url, seconds, bytes, sha256)")
    ap.add_argument("--id3", nargs="*", default=[], help="JSON files with cached ID3 reads (url, title, artist, album)")
    args = ap.parse_args()

    measured = {m["url"]: m for f in args.probe for m in json.loads(Path(f).read_text(encoding="utf-8")) if "sha256" in m}
    cached = {}
    for f in args.id3:
        for m in json.loads(Path(f).read_text(encoding="utf-8")):
            if m.get("ok"):
                cached[m["url"]] = {k: v for k, v in (("TIT2", m.get("title")), ("TPE1", m.get("artist")), ("TALB", m.get("album"))) if v}
    listing = [(p, u) for p, u in members() if any(p.startswith(g["folder"]) for g in PACKS.values())]
    with concurrent.futures.ThreadPoolExecutor(4) as ex:
        tagged = list(zip(listing, ex.map(lambda pu: cached.get(pu[1]) or id3(pu[1]), listing)))
    wikis = {g: wiki_tags(args.wiki_dir / p["wiki"]) for g, p in PACKS.items() if "wiki" in p}

    tracks, excluded = [], {g: [] for g in PACKS}
    for (path, url), tags in tagged:
        game = next(g for g, p in PACKS.items() if path.startswith(p["folder"]))
        verdict = classify(game, path, tags, wikis.get(game, {}))
        title = tags.get("TIT2") or Path(path).stem.split(". ", 1)[-1]
        if not verdict:
            excluded[game].append(f"{title} (jingle or cue)")
            continue
        kind, season, basis = verdict
        m = measured.get(url, {})
        tracks.append({
            "id": f"{game}_{norm(Path(path).parent.name + ' ' + Path(path).stem).replace(' ', '_')}",
            "game": game,
            "type": kind,
            "season": season,
            "title": title,
            "artist": ROMAN.get(tags.get("TPE1"), tags.get("TPE1")) or "Unknown",
            "album": tags.get("TALB"),
            "seconds": round(m["seconds"]) if m else None,
            "bytes": m.get("bytes"),
            "sha256": m.get("sha256"),
            "src": url,
            "codec": "mp3",
            "origin": "archive.org member",
            "archiveMember": path,
            "basis": basis,
        })

    unique, seen = [], {}
    for t in tracks:
        keys = [t["sha256"] or t["src"], (norm(t["title"]), norm(t["artist"]), norm(t["album"]))]
        if t["seconds"] is not None:
            keys.append((norm(t["title"]), norm(t["artist"]), t["seconds"]))
        first = next((seen[k] for k in keys if k in seen), None)
        if first:
            if t["game"] not in first["appearsIn"]:
                first["appearsIn"].append(t["game"])
            if first["type"] == "unclassified" and t["type"] != "unclassified":
                first.update(type=t["type"], basis=t["basis"])
            excluded[t["game"]].append(f"{t['title']} (same recording as {first['archiveMember']})")
            continue
        t["appearsIn"] = [t["game"]]
        for k in keys:
            seen[k] = t
        unique.append(t)

    manifest = {
        "about": "Opt-in series music packs. Each src streams from archive.org. Replace src with a relative path to use your own recording.",
        "source": ITEM,
        "packs": {"gtsport": {"label": "GT Sport", "year": 2017}, **{g: {"label": p["label"], "year": p["year"]} for g, p in PACKS.items() if g != "gtsport"}},
        "excluded": excluded,
        "unmeasured": sum(t["seconds"] is None for t in unique),
        "tracks": unique,
    }
    DEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {}
    for t in unique:
        counts.setdefault(t["game"], {}).setdefault(f"{t['type']}/{t['season']}", 0)
        counts[t["game"]][f"{t['type']}/{t['season']}"] += 1
    print(f"wrote {DEST}: {json.dumps(counts)}")


if __name__ == "__main__":
    main()
