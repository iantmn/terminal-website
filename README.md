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
- `js/commands/`: the commands, by topic (`me`, `nav`, `system`, `fun`, `linux`)
- `js/core.js`, `shell.js`, `input.js`: printing, parsing and running command lines, the keyboard
- `js/days.js`: the message of the day, for special days and every day of the week
- `js/filesystem.js`, `achievements.js`, `themes.js`, `sound.js`, `visuals.js`, `boot.js`: the rest

A new command is a `def(names, group, description, run, { usage, flags })` call in one of the command files. Every command gets `-h`/`--help` and `--version` from that.

## Updating content

Everything you see (about, experience, education, skills, posts) lives in `js/content.js`. New posts on the main site are also picked up from its RSS feed when it's reachable.

## whoami

`whoami` shows what the browser reports.

## Easter eggs

There are a few. Good luck.
