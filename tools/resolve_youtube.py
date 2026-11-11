import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def videos(query):
    page = get("https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": query}))
    data = json.loads(re.search(r"var ytInitialData = (\{.*?\});</script>", page).group(1))
    found = []

    def walk(o):
        if isinstance(o, dict):
            if "videoRenderer" in o:
                r = o["videoRenderer"]
                found.append({
                    "id": r["videoId"],
                    "title": "".join(x.get("text", "") for x in r.get("title", {}).get("runs", [])),
                    "channel": "".join(x.get("text", "") for x in r.get("ownerText", {}).get("runs", [])),
                })
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(data)
    return found


def embeddable(video_id):
    try:
        get("https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=" + video_id)
        return True
    except Exception:
        return False


def resolve(artist, title):
    lead_artist = norm(re.split(r" and |/|&", artist)[0])
    core_title = norm(re.split(r"\(| feat\.| - ", title)[0])
    for v in videos(f"{artist} {title}"):
        official = v["channel"].endswith(" - Topic") or norm(v["channel"]).replace(" vevo", "") == norm(artist)
        if official and core_title in norm(v["title"]) and lead_artist.split()[0] in norm(v["channel"]) and embeddable(v["id"]):
            return {"youtubeId": v["id"], "youtubeTitle": v["title"], "youtubeChannel": v["channel"]}
    return None


def main(src, dst):
    try:
        out = json.load(open(dst, encoding="utf-8"))
    except FileNotFoundError:
        out = []
    out = [t for t in out if t.get("youtubeId")]
    done = {(t["artist"], t["title"]) for t in out}
    for line in open(src, encoding="utf-8"):
        artist, title = line.rstrip("\n").split("|")
        if (artist, title) in done:
            continue
        for attempt in range(3):
            try:
                hit = resolve(artist, title)
                break
            except Exception as e:
                print(f"retry {artist} - {title}: {e}", file=sys.stderr, flush=True)
                time.sleep(15 * (attempt + 1))
        else:
            continue
        out.append({"artist": artist, "title": title, **(hit or {})})
        json.dump(out, open(dst, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
        print(("OK  " if hit else "--  ") + f"{artist} - {title}" + (f"  -> {hit['youtubeId']} ({hit['youtubeChannel']})" if hit else ""), flush=True)
        time.sleep(2)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
