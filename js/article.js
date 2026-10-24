// read -f: the whole article from iantiemann.nl, as terminal lines. The main site allows this one (CORS *), so the
// page is fetched and its article turned into text: headings, paragraphs, lists, code blocks, tables and quotes
import { esc, span, link, absUrl, h2 } from './core.js';

const cache = new Map();

// the inline parts of a block: links stay links, code stands out, bold stays bold
function inline(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += esc(n.textContent.replace(/\s+/g, ' ')); continue; }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName.toLowerCase(), text = n.textContent.replace(/\s+/g, ' ');
    if (tag === 'a') out += n.getAttribute('href') && !n.getAttribute('href').startsWith('#') ? link(absUrl(n.getAttribute('href')), text) : esc(text);
    else if (tag === 'code') out += span('a2', esc(text));
    else if (tag === 'strong' || tag === 'b') out += span('b', inline(n));
    else if (tag === 'br') out += '\n';
    else if (tag === 'img') out += span('m', `[image: ${esc(n.getAttribute('alt') || 'picture')}]`);
    else if (!['script', 'style', 'svg', 'button'].includes(tag)) out += inline(n);
  }
  return out;
}

function blocks(root, indent = '') {
  const out = [];
  const gap = () => { if (out.length && out.at(-1) !== '') out.push(''); };
  for (const n of root.children) {
    const tag = n.tagName.toLowerCase(), cls = n.className || '';
    if (/^h[1-6]$/.test(tag)) { gap(); out.push(tag === 'h2' ? h2(n.textContent.trim()) : span('w', '### ' + esc(n.textContent.trim()))); out.push(''); }
    else if (tag === 'p') { const t = inline(n).trim(); if (t) { out.push(indent + t); out.push(''); } }
    else if (tag === 'ul' || tag === 'ol') {
      [...n.children].filter(li => li.tagName === 'LI').forEach((li, i) => {
        const nested = [...li.children].filter(c => /^(UL|OL)$/.test(c.tagName));
        const own = li.cloneNode(true); own.querySelectorAll('ul, ol').forEach(x => x.remove());
        out.push(`${indent}  ${span('a', tag === 'ol' ? `${i + 1}.` : '•')} ${inline(own).trim()}`);
        nested.forEach(x => out.push(...blocks({ children: [x] }, indent + '    ').filter(Boolean)));
      });
      out.push('');
    }
    // code: Rouge puts line numbers in a table next to the code; only the code counts
    else if (tag === 'pre' || /highlight/.test(cls)) {
      const pre = n.querySelector('.rouge-code pre') || n.querySelector('pre') || n;
      gap();
      pre.textContent.replace(/\n$/, '').split('\n').forEach(l => out.push(indent + span('m', '│ ') + span('a2', esc(l))));
      out.push('');
    }
    else if (tag === 'blockquote') { blocks(n).filter(Boolean).forEach(l => out.push(indent + span('w', '▌ ') + l)); out.push(''); }
    else if (tag === 'table') {
      const rows = [...n.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim().replace(/\s+/g, ' ')));
      const w = rows[0]?.map((_, i) => Math.min(40, Math.max(...rows.map(r => (r[i] || '').length)))) || [];
      rows.forEach((r, ri) => { out.push(indent + r.map((c, i) => (ri ? esc : x => span('b', esc(x)))(c.padEnd(w[i]))).join(span('m', ' │ '))); if (!ri) out.push(indent + span('m', w.map(x => '─'.repeat(x)).join('─┼─'))); });
      out.push('');
    }
    else if (tag === 'hr') { out.push(span('m', '─'.repeat(40))); out.push(''); }
    else if (tag === 'img' || tag === 'figure' && !n.querySelector('pre')) { out.push(inline(n).trim() || span('m', '[image]')); out.push(''); }
    else if (n.children.length) out.push(...blocks(n, indent));
  }
  return out;
}

// the article of a post, or an error message to show instead
export async function fullPost(post) {
  if (cache.has(post.url)) return { lines: cache.get(post.url) };
  let html;
  try {
    const res = await fetch(absUrl(post.url), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    html = await res.text();
  } catch (e) { return { error: navigator.onLine ? `could not fetch it (${e.message})` : 'you are offline' }; }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('article[data-toc] .content') || doc.querySelector('article .content') || doc.querySelector('main article') || doc.querySelector('article');
  if (!root) return { error: 'the page has no article in it' };
  const lines = blocks(root);
  while (lines.at(-1) === '') lines.pop();
  if (!lines.length) return { error: 'the article came back empty' };
  cache.set(post.url, lines);
  return { lines };
}
