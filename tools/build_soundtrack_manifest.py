import json
import sys
from pathlib import Path

SEASONS = {"menu": "normal", "christmas": "christmas"}
DEST = Path(__file__).resolve().parent.parent / "site" / "data" / "soundtrack.json"


def main(report_path):
    report = json.loads(Path(report_path).read_text(encoding="utf-8"))
    tracks = []
    for f in report["files"]:
        season = SEASONS.get(f["classification"])
        if not season:
            continue
        tracks.append({
            "id": Path(f["relative_path"]).stem,
            "game": "gtsport",
            "season": season,
            "title": f["title"],
            "artist": f["id3"].get("artist") or "Gran Turismo Sport",
            "seconds": round(f["duration_seconds"]),
            "src": f["provenance"]["url"],
            "codec": f["codec"],
            "bytes": f["bytes"],
            "origin": "archive.org member",
            "archiveItem": f["provenance"]["item"],
            "archiveMember": f["provenance"]["archive_member"],
        })
    manifest = {
        "about": "Each track's src is played directly by the browser. Replace src with a relative path such as media/remakes/01_lizzies_balloon.ogg to swap in your own recording.",
        "source": report["source"]["item"],
        "missing": report["missing_tracks"]["community_menu_list_not_in_archive"],
        "tracks": tracks,
    }
    DEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {s: sum(t["season"] == s for t in tracks) for s in SEASONS.values()}
    print(f"wrote {DEST}: {counts}, {sum(t['bytes'] for t in tracks)} bytes referenced")


if __name__ == "__main__":
    main(sys.argv[1])
