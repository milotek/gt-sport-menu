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


def track(game, path, url, tags, basis):
    seconds = round(int(tags["TLEN"]) / 1000) if tags.get("TLEN", "").isdigit() else None
    return {
        "id": f"{game}_{norm(Path(path).stem).replace(' ', '_')}",
        "game": game,
        "season": "normal",
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
    args = ap.parse_args()

    listing = [(p, u) for p, u in members() if p.startswith(("2004 - Gran Turismo 4/", "2022 - Gran Turismo 7/Original Soundtrack/"))]
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
        else:
            tag = bgm.get(norm(title))
            if tags.get("TALB") == "Gran Turismo 7 OST" and tag == "Menu":
                tracks.append(track("gt7", path, url, tags, "ID3 album 'Gran Turismo 7 OST' and Default BGM 'Menu' on the vgost.fandom.com GT7 table"))
            else:
                excluded["gt7"].append(f"{title} (album {tags.get('TALB')}, BGM {tag})")

    manifest = {
        "about": "Opt-in extended menu-music packs. Each src streams from archive.org. Replace src with a relative path to use your own recording.",
        "source": ITEM,
        "packs": {
            "gtsport": {"label": "GT Sport", "year": 2017},
            "gt4": {"label": "GT4", "year": 2004},
            "gt7": {"label": "GT7", "year": 2022},
        },
        "excluded": excluded,
        "tracks": tracks,
    }
    DEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {DEST}: gt4={sum(t['game'] == 'gt4' for t in tracks)} gt7={sum(t['game'] == 'gt7' for t in tracks)}")


if __name__ == "__main__":
    main()
