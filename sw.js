// offline and installable: network first, so a deploy shows up on the next load, and the cache answers when the
// network does not. Everything the terminal needs is cached on install, the commands that load later too.
// tests/ checks this list against the files in js/, so a new module cannot be forgotten
const CACHE = 'terminal-v1';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'js/achievements.js',
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
  'js/commands/network.js',
  'js/commands/pve.js',
  'js/commands/python.js',
  'js/commands/qr.js',
  'js/commands/status.js',
  'js/commands/system.js',
  'js/content.js',
  'js/core.js',
  'js/days.js',
  'js/feed.js',
  'js/fs/home.js',
  'js/fs/homelab.js',
  'js/fs/nodes.js',
  'js/fs/pve.js',
  'js/fs/system.js',
  'js/filesystem.js',
  'js/input.js',
  'js/main.js',
  'js/manuals.js',
  'js/pager.js',
  'js/registry.js',
  'js/render.js',
  'js/session.js',
  'js/shell.js',
  'js/sound.js',
  'js/themes.js',
  'js/visits.js',
  'js/visuals.js',
];
// the fonts never change: from the cache first. Everything else from elsewhere (analytics, GitHub, the feed) is not touched
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const same = new URL(req.url).origin === location.origin;
  if (!same && !FONTS.test(req.url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (!same) {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      // offline: the cached copy, and for a page (a deep link like /#fortune) the terminal itself
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' && await cache.match('index.html')) || Response.error();
    }
  })());
});
