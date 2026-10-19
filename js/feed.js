// live articles from RSS
import { PROFILE, POSTS } from './content.js';
import { slugify } from './core.js';
import { FS } from './filesystem.js';
import { fmtPost } from './render.js';

export async function refreshFeed() {
  try {
    const res = await fetch(PROFILE.rss, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw 0;
    const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
    const entries = [...xml.querySelectorAll('entry')];
    if (!entries.length) throw 0;
    let added = 0;
    for (const e of entries) {
      const href = e.querySelector('link')?.getAttribute('href') || '';
      const path = href.replace(/^https?:\/\/[^/]+/, '');
      if (!path || POSTS.some(p => p.url === path)) continue;
      const title = (e.querySelector('title')?.textContent || '').trim();
      const emoji = title.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*/u);
      const cats = [...e.querySelectorAll('category')].map(c => c.getAttribute('term') || '').join(' ');
      const p = {
        date: (e.querySelector('published')?.textContent || '').slice(0, 10),
        type: /guide/i.test(cats) ? 'guide' : 'project', icon: emoji ? emoji[1] : '📝',
        title: emoji ? title.slice(emoji[0].length) : title,
        url: path,
        desc: (e.querySelector('summary')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220),
      };
      p.file = slugify(p.title) + '.md';
      POSTS.push(p); added++;
      (p.type === 'guide' ? FS.children.articles : FS.children.projects).children[p.file] = { type:'file', read: () => fmtPost(p) };
    }
    POSTS.sort((a, b) => b.date.localeCompare(a.date));
    POSTS.forEach((p, i) => p.n = i + 1);
    return added;
  } catch { return -1; }
}

// started at boot; commands that list posts wait for it
export let feedReady = Promise.resolve();
export const startFeed = () => { feedReady = refreshFeed(); };
