# terminal.iantiemann.nl

A terminal version of [iantiemann.nl](https://www.iantiemann.nl). Type `help` to get started.

Live at [terminal.iantiemann.nl](https://terminal.iantiemann.nl).

## Running it

Plain HTML, CSS and JavaScript modules, without dependencies or a build step. Browsers only load modules over http, so opening `index.html` from disk won't work; serve the folder with anything static:

```sh
docker compose up
```

That serves it on http://localhost:8080. Without Docker, `python3 -m http.server 8000` works too.

## Layout

- `index.html`: the page itself
- `css/style.css`: the themes and the terminal look
- `js/main.js`: the entry point, it loads the commands and boots
- `js/content.js`: everything the terminal tells about me
- `js/commands/`: the commands, by topic (`me`, `nav`, `system`, `fun`, `linux`), plus `homelab.js` (the Docker VM behind ssh), `pve.js` (the Proxmox host under it), and `python.js` (a tiny Python), `qr.js` (a QR encoder) and `guestbook.js`, which `lazy.js` loads the first time they run
- `js/core.js`, `shell.js`, `input.js`: printing, parsing and running command lines, the keyboard
- `js/days.js`: the message of the day, for special days and every day of the week
- `js/visits.js`: your visits, for `last` and `finger`
- `js/filesystem.js`, `achievements.js`, `themes.js`, `sound.js`, `visuals.js`, `boot.js`, `pager.js` (less): the rest
- `sw.js`, `manifest.webmanifest`, `icons/`: offline and installable. A new module in `js/` goes in the list in `sw.js` too

A new command is a `def(names, group, description, run, { usage, flags })` call in one of the command files. Every command gets `-h`/`--help` and `--version` from that, and `completes(name, fn)` adds Tab completion for its arguments.

## Tests

Every command and flag, and the interactive parts (keys, pager, the homelab), are checked in a headless browser. GitHub Actions runs them on every push (`.github/workflows/test-and-deploy.yml`), and deploys `main` to GitHub Pages only when they pass (Settings > Pages > Source: GitHub Actions). Locally:

```bash
npm install --no-save playwright@1.48.2
npx playwright install chromium
node tests/run.mjs
```

With Chrome or Edge installed, `CHANNEL=msedge node tests/run.mjs` skips the browser download. The suites also run from the browser console: `import('/tests/flags.js').then(m => m.runAll(m.T, 1))`.

## Guestbook

The page is static, so the guestbook needs a small backend. Set `PROFILE.guestbook` in `js/content.js` to a JSON endpoint (an n8n webhook works) that:

- `GET` returns `[{ "name": "...", "message": "...", "date": "ISO date" }]`, newest first, 20 at most
- `POST` takes `{ "name": "...", "message": "..." }` and answers `200 { "ok": true }`, or `4xx`/`429 { "error": "..." }`
- allows `https://terminal.iantiemann.nl` in CORS, checks the lengths again (30 and 200), rate-limits, and only returns messages you approved

Until it is set, `guestbook` says it is not open yet.

## Updating content

Everything you see (about, experience, education, skills, posts) lives in `js/content.js`. New posts on the main site are also picked up from its RSS feed when it's reachable.

## whoami

`whoami` shows what the browser reports.

## Easter eggs

There are a few. Good luck.
