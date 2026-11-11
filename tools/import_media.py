import argparse
import json
import re
import shutil
import unicodedata
from pathlib import Path

AUDIO = {".mp3", ".ogg", ".oga", ".opus", ".m4a", ".aac", ".flac", ".wav", ".webm"}
IMAGES = {".jpg", ".jpeg", ".png", ".webp", ".avif"}
DEST = Path(__file__).resolve().parent.parent / "site" / "media" / "local"


def snake(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_") or "file"


def title_of(path):
    # "Artist - Title.ext" is the common naming for exported or user-ripped tracks.
    stem = path.stem
    if " - " in stem:
        artist, title = stem.split(" - ", 1)
        return artist.strip(), title.strip()
    return "", stem


def main():
    ap = argparse.ArgumentParser(description="Copy user-supplied menu music and background images into site/media/local and write its manifest.")
    ap.add_argument("sources", nargs="+", type=Path, help="Files or directories to import")
    ap.add_argument("--dry-run", action="store_true", help="Show the plan without copying")
    ap.add_argument("--season", choices=["normal", "christmas", "any"], default="any", help="Tag imported files with a season")
    args = ap.parse_args()

    manifest_path = DEST / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"audio": [], "images": []}
    known = {e["file"] for e in manifest["audio"] + manifest["images"]}

    files = []
    for src in args.sources:
        files += sorted(p for p in src.rglob("*") if p.is_file()) if src.is_dir() else [src]

    for f in files:
        ext = f.suffix.lower()
        if ext not in AUDIO | IMAGES:
            continue
        target = snake(f.stem) + ext
        if target in known:
            print(f"skip  {f} (already imported as {target})")
            continue
        print(f"copy  {f} -> {DEST / target}")
        known.add(target)
        if ext in AUDIO:
            artist, title = title_of(f)
            manifest["audio"].append({"file": target, "title": title, "artist": artist or "Your file", "season": args.season})
        else:
            manifest["images"].append({"file": target, "title": f.stem, "season": args.season})
        if not args.dry_run:
            DEST.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, DEST / target)

    if not args.dry_run:
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
        print(f"wrote {manifest_path}")


if __name__ == "__main__":
    main()
