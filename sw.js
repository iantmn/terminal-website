// offline and installable: the network first, so a deploy shows up on the next load, but never a long wait for it:
// after a few seconds the cached copy answers and the network one goes into the cache for next time. Everything the
// terminal needs is cached on install, the commands that load later too.
// tests/ checks this list against the files in js/, so a new module cannot be forgotten.
// The deploy (.github/workflows) puts the commit in the name, so every deploy gets a fresh cache and the old one goes
const CACHE = 'terminal-dev';
const SLOW = 3000;
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'fonts/JetBrainsMono-Regular.woff2', 'fonts/JetBrainsMono-Bold.woff2',
  'js/achievements.js',
  'js/article.js',
  'js/boot.js',
  'js/commands/fun.js',
  'js/commands/guestbook.js',
  'js/commands/homelab.js',
  'js/commands/labstate.js',
  'js/commands/lazy.js',
  'js/commands/learn.js',
  'js/commands/linux.js',
  'js/commands/me.js',
  'js/commands/nav.js',
  'js/commands/nano.js',
  'js/commands/network.js',
  'js/commands/pbs.js',
  'js/commands/pve.js',
  'js/commands/python.js',
  'js/commands/qr.js',
  'js/commands/status.js',
  'js/commands/system.js',
  'js/commands/tools.js',
  'js/content.js',
  'js/core.js',
  'js/days.js',
  'js/desk.js',
  'js/feed.js',
  'js/fs/home.js',
  'js/fs/homelab.js',
  'js/fs/nodes.js',
  'js/fs/pbs.js',
  'js/fs/pve.js',
  'js/fs/system.js',
  'js/filesystem.js',
  'js/hash.js',
  'js/input.js',
  'js/jq.js',
  'js/main.js',
  'js/manuals.js',
  'js/pager.js',
  'js/printcv.js',
  'js/registry.js',
  'js/render.js',
  'js/session.js',
  'js/shell.js',
  'js/sound.js',
  'js/themes.js',
  'js/visits.js',
  'js/visuals.js',
];
self.addEventListener('install', e => {
  // past the browser's HTTP cache, so a new version never caches an old file
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  // only this site; analytics, GitHub and the feed go their own way
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // what the network brings goes into the cache, also when the cached copy answered first
  let saving = Promise.resolve();
  const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); saving = caches.open(CACHE).then(c => c.put(req, copy)); } return res; });
  e.waitUntil(net.then(() => saving, () => {}));
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // a page (a deep link like /#fortune) falls back on the terminal itself
    const cached = () => cache.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? cache.match('index.html') : undefined));
    // the network, unless it is slow or gone and the cache has it
    const slow = new Promise(r => setTimeout(r, SLOW)).then(cached);
    try {
      const first = await Promise.race([net, slow]);
      if (first) return first;
      return await net;
    } catch {
      return (await cached()) || Response.error();
    }
  })());
});
