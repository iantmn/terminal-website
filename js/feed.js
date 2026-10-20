// live articles from RSS. Posts from the feed are kept in the browser, so they show at once on the next visit
import { PROFILE, POSTS } from './content.js';
import { slugify, store } from './core.js';
import { FS } from './filesystem.js';
import { fmtPost } from './render.js';

// a post the built-in list does not have yet: into POSTS and the matching folder
function addPost(p) {
  if (!p.url || !p.title || POSTS.some(x => x.url === p.url)) return false;
  p.file = slugify(p.title) + '.md';
  POSTS.push(p);
  (p.type === 'guide' ? FS.children.articles : FS.children.projects).children[p.file] = { type: 'file', read: () => fmtPost(p) };
  return true;
}
const renumber = () => { POSTS.sort((a, b) => b.date.localeCompare(a.date)); POSTS.forEach((p, i) => p.n = i + 1); };

const CACHE = 'feed';
function loadCached() {
  const cached = store.get(CACHE, []);
  if (Array.isArray(cached) && cached.filter(p => p && typeof p === 'object' && addPost({ ...p, fromFeed: true })).length) renumber();
}

export async function refreshFeed() {
  try {
    const res = await fetch(PROFILE.rss, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw 0;
    const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
    const entries = [...xml.querySelectorAll('entry')];
    if (!entries.length) throw 0;
    const fresh = [];
    for (const e of entries) {
      const href = e.querySelector('link')?.getAttribute('href') || '';
      const path = href.replace(/^https?:\/\/[^/]+/, '');
      const title = (e.querySelector('title')?.textContent || '').trim();
      const emoji = title.match(/^(\p{Extended_Pictographic}️?)\s*/u);
      const cats = [...e.querySelectorAll('category')].map(c => c.getAttribute('term') || '').join(' ');
      fresh.push({
        date: (e.querySelector('published')?.textContent || '').slice(0, 10),
        type: /guide/i.test(cats) ? 'guide' : 'project', icon: emoji ? emoji[1] : '📝',
        title: emoji ? title.slice(emoji[0].length) : title,
        url: path,
        desc: (e.querySelector('summary')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220),
      });
    }
    // only what the built-in list lacks is worth keeping
    const builtIn = new Set(POSTS.filter(p => !p.fromFeed).map(p => p.url));
    const extra = fresh.filter(p => p.url && !builtIn.has(p.url));
    store.set(CACHE, extra);
    let added = 0;
    for (const p of extra) if (addPost({ ...p, fromFeed: true })) added++;
    renumber();
    return added;
  } catch { return -1; }
}

// started at boot; commands that list posts wait for it
export let feedReady = Promise.resolve();
export const startFeed = () => { loadCached(); feedReady = refreshFeed(); };
