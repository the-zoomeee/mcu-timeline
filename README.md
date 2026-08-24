# The Multiverse Ledger — MCU Timeline

A single-page, interactive MCU timeline: release order vs. chronological order, a
one-way story-connection graph, a "Road Mode" prerequisite tree, character-thread
tracing, and per-title detail panels (cast, languages, platform, inline trailer
playback, Hotstar deep link).

## Project structure

```
index.html    Markup only — page structure, no inline CSS or JS
style.css     All styling
app.js        All behavior/logic
data.json     All content: titles, links, cast, runtimes, character threads, trailer IDs
```

All four files must stay together in the same folder — `index.html` loads the other
three via relative paths.

## Running it

Browsers block local file reads (`fetch()` of `data.json`, and some iframe embeds)
when a page is opened directly via `file://`. You need to serve it over `http://`:

```bash
# from inside the folder containing all four files
python3 -m http.server 8000
```

Then visit `http://localhost:8000/` in your browser.

Any other local server works too (`npx serve`, VS Code's "Live Server" extension, etc.).

## Deploying it for real

Drop all four files onto any static host — no build step needed:

- **Netlify Drop** (netlify.com/drop) — drag the folder in, get a live URL instantly
- **GitHub Pages** — push the folder to a repo, enable Pages
- **Vercel** — same drag-and-drop deploy flow

## Editing content

Everything content-related lives in `data.json` — you shouldn't need to touch
`app.js` or `style.css` to add or change titles.

- **Add a trailer:** find the item by `"id"` and fill in `"trailer"` with either a
  bare YouTube video ID or a full URL (any common format — `watch?v=`, `youtu.be/`,
  `/embed/`). The app extracts the ID automatically.
- **Add a new title:** add an entry to `items`, then add its id to `releaseOrder`
  and `chronoOrder` in the position it belongs, and (optionally) to `links` to wire
  up its story connections.
- **Edit cast, runtime, languages, character threads:** edit the matching entry in
  `cast`, `runtime`, `languages`, or `charFocus`/`characters`.

If `data.json` is missing, malformed, or can't be fetched (e.g. you opened the file
directly instead of via a server), the page shows an on-screen explanation instead
of failing silently.
