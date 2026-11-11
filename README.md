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
The GT Menu button (top left) or the sliders icon opens Options.

| Key | Action |
| --- | --- |
| Arrow keys | Move focus around the menu |
| Enter | Select |
| S | Options |
| F | Fullscreen |
| N | Next track |
| A | Ambience mode (any key, tap or pointer movement returns) |
| Space | Play or pause |
| Esc | Close panels |

Options also cover play order, repeat, a searchable track browser with favourites, slideshow interval, background motion (always off when the system asks for reduced motion), idle ambience and Reset options.
Reset options leaves imported files alone; "Remove my files" deletes them.

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

**Extended music** (Options > Extended music, off by default) adds opt-in packs from the same archive.org upload, built by `tools/build_extended_packs.py` into `site/data/extended.json`:

- **GT4:** 10 Isamu Ohira tracks from the GT4 Original Game Soundtrack. Ohira is credited as GT4's menu composer. The opening theme, the fusion-rock tracks and the vocal race tracks are excluded.
- **GT7:** 75 tracks whose ID3 album is "Gran Turismo 7 OST" and which the vgost.fandom.com GT7 table marks as Default BGM "Menu". Race, dual-use, untagged and GT5-tagged files are excluded.
- Neither pack has holiday tracks. In Christmas season, extended music stays holiday-only unless "Christmas: mix all" is chosen.

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

Backgrounds are official GT Sport images: a Scapes key image and promotional screenshots from PlayStation's GT Sport page, plus the Holiday Season Update image from gran-turismo.com.
They are hotlinked from Sony's and Polyphony's own hosts, not rehosted, and none of them are captures of the in-game Top Screen.
The May 2016 screenshots have a small GT SPORT watermark top-left, under the translucent top bar, and the Oct 2015 ones come from the reveal build.
Your own images, added in Settings or imported with the tool, replace the built-in set.
Credits are on `credits.html`.
