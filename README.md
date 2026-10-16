# terminal.iantiemann.nl

A terminal version of [iantiemann.nl](https://www.iantiemann.nl). Type `help` to get started.

Live at [terminal.iantiemann.nl](https://terminal.iantiemann.nl).

## Running it

It's a single `index.html` without dependencies or a build step. Open it in a browser, or serve it with anything static:

```sh
python3 -m http.server 8000
```

## Updating content

Everything you see (about, experience, education, skills, posts) lives in the content block at the top of the script in `index.html`. New posts on the main site are also picked up from its RSS feed when it's reachable.

## whoami

`whoami` shows what the browser reports. If [traefik/whoami](https://github.com/traefik/whoami) is reachable at `/api/whoami`, it also shows the request headers. On GitHub Pages that endpoint doesn't exist, so set `whoamiApi: ''` in `PROFILE` to skip it.

## Easter eggs

There are a few. Good luck.
