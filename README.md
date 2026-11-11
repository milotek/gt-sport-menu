# GT Sport Top Screen

A fan-made recreation of the Gran Turismo Sport main menu (the Top Screen), built for personal nostalgia.
It is not affiliated with Sony Interactive Entertainment or Polyphony Digital.

The layout follows the annotated screenshot on the official [Top Screen manual page](https://www.gran-turismo.com/us/gtsport/manual/#!/top/content01): GT Menu button, mode menu, status window, function rail, GT LIVE tile, the four bottom panels and the Scapes pill.
The menu is for looks only: selecting anything shows a "Not available in this recreation" notice.

## Running

```sh
npm install
npm run serve      # http://localhost:4173
npm test           # Playwright suite against system Chrome
```

Set `CHROME_PATH` if Chrome is not at the NixOS profile path in `playwright.config.js`.

## Controls

Press Enter or click on the title screen to start.
Starting needs a gesture because browsers block audio until the user interacts.

| Key | Action |
| --- | --- |
| Arrow keys | Move focus around the menu |
| Enter | Select |
| S | Settings |
| F | Fullscreen |
| N | Next track |
| Space | Play or pause |
| Esc | Close panels |

## Seasons

Calendar mode switches to Christmas from 21 to 25 December, local time.
The start date comes from dated player reports and the dates of the holiday menu recordings.
No source shows when the Christmas playlist ended, so 25 December is an approximation.
The full evidence is in `site/data/catalog.json` and on `credits.html`.
Settings can force either season.

## Music

Music plays natively with HTML audio.
No audio is bundled in this repo.

- **Soundtrack:** `site/data/soundtrack.json` lists 62 menu tracks and 3 Christmas tracks. Each `src` points straight at a per-file link inside the anonymous archive.org upload [Gran Turismo Complete Soundtrack](https://archive.org/details/gran-turismo-complete-soundtrack), so the browser streams from archive.org. The uploader states no licence.
- **Missing:** four tracks from the GTPlanet community menu list are not in that upload and are listed in the manifest's `missing` field.
- **My files:** add audio in Settings. Files are stored in IndexedDB and stay in this browser.

To swap in your own recordings, such as MIDI remakes, put them under `site/media/` and change each track's `src` to the relative path.
Anything else in the entry (title, artist, season) drives the playlists and the now-playing banner.
`tools/build_soundtrack_manifest.py` regenerates the manifest from the soundtrack classification report.

To import a folder of your own audio or Scapes captures for local use only:

```sh
python3 tools/import_media.py ~/path/to/files --season christmas --dry-run
python3 tools/import_media.py ~/path/to/files --season christmas
```

Files are copied into `site/media/local/` with snake_case names, and a manifest is written next to them.
That folder is gitignored, so it stays on your machine.
Name audio `Artist - Title.ext` to get proper track info.

## Backgrounds

GT Sport's real Top Screen shows in-game clips and Scapes photos, and those are not published as standalone images.
Normal-season backgrounds are licensed Wikimedia Commons photos of Scapes-style locations, labelled as substitutes.
The Christmas set adds the official Holiday Season Update image, which is loaded from gran-turismo.com and not rehosted.
Your own images, added in Settings or imported with the tool, replace the built-in set.
Credits are on `credits.html`.
