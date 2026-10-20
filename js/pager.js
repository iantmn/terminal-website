// less: a full-screen pager over lines of html. The keys of the real one: space and b page, j and k scroll,
// g and G jump, /word searches, n and N find the next one, q leaves. On a phone it scrolls by touch and has a q button
import { esc, focusInput } from './core.js';

export function pager(lines, title, { numbers = false } = {}) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.id = 'pager';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', title);
    el.innerHTML = '<div class="body"></div><div class="status"><span class="msg"></span><button type="button" class="q" aria-label="quit">q</button></div>';
    const body = el.querySelector('.body'), msg = el.querySelector('.msg');
    const w = String(lines.length).length;
    body.innerHTML = lines.map((l, i) => `<div class="pl">${numbers ? `<span class="m">${String(i + 1).padStart(w)} </span>` : ''}${l || ' '}</div>`).join('');
    document.body.appendChild(el);
    const rows = [...body.children];
    let query = null, typing = null, note = '';

    const line = () => rows[0]?.offsetHeight || 22;
    const atEnd = () => body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
    const status = () => {
      if (typing !== null) { msg.innerHTML = '/' + esc(typing) + '<span class="cursor">█</span>'; return; }
      const where = atEnd() ? `${title} (END)` : body.scrollHeight > body.clientHeight ? `${title} ${Math.round((body.scrollTop + body.clientHeight) / body.scrollHeight * 100)}%` : title;
      msg.innerHTML = `<span class="inv">${esc(where)}</span> ` + (note ? `<span class="w">${esc(note)}</span>` : '<span class="m">space, b, /search, q</span>');
      note = '';
    };
    const by = px => { body.scrollTop += px; status(); };
    const jump = row => { body.scrollTop = row.offsetTop - body.offsetTop; status(); };

    // search: rows that match get marked, n and N walk them
    const search = q => {
      query = q;
      let re;
      try { re = new RegExp(q, q === q.toLowerCase() ? 'i' : ''); } catch { re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
      rows.forEach(r => r.classList.toggle('hit', !!q && re.test(r.textContent)));
      return next(1, true);
    };
    const next = (dir, fromTop = false) => {
      const hits = rows.filter(r => r.classList.contains('hit'));
      if (!hits.length) { note = 'Pattern not found'; return status(); }
      const top = body.scrollTop + body.offsetTop + (fromTop ? -1 : 1);
      const to = dir > 0 ? hits.find(r => r.offsetTop > top) : [...hits].reverse().find(r => r.offsetTop < top - 1);
      if (!to) { note = dir > 0 ? 'Pattern not found (press g to search from the top)' : 'Pattern not found'; return status(); }
      jump(to);
    };

    const close = () => {
      removeEventListener('keydown', onKey, true);
      el.remove();
      focusInput();
      resolve();
    };
    const onKey = e => {
      // browser shortcuts (Ctrl+Shift+I, Ctrl+R ...) stay the browser's; Ctrl+C leaves, like in a real terminal
      const ctrlC = e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c';
      if ((e.ctrlKey || e.metaKey || e.altKey) && !ctrlC) return;
      e.preventDefault(); e.stopPropagation();
      if (typing !== null) {
        if (e.key === 'Enter') { const q = typing; typing = null; return q ? search(q) : query ? next(1) : status(); }
        if (e.key === 'Escape' || ctrlC) { typing = null; return status(); }
        if (e.key === 'Backspace') { if (!typing) typing = null; else typing = typing.slice(0, -1); return status(); }
        if (e.key.length === 1) typing += e.key;
        return status();
      }
      const page = body.clientHeight - line();
      switch (e.key) {
        case 'q': case 'Q': case 'Escape': return close();
        case ' ': case 'f': case 'z': case 'PageDown': return by(page);
        case 'b': case 'w': case 'PageUp': return by(-page);
        case 'd': return by(page / 2);
        case 'u': return by(-page / 2);
        case 'j': case 'e': case 'ArrowDown': case 'Enter': return by(line());
        case 'k': case 'y': case 'ArrowUp': return by(-line());
        case 'g': case '<': case 'Home': body.scrollTop = 0; return status();
        case 'G': case '>': case 'End': body.scrollTop = body.scrollHeight; return status();
        case '/': typing = ''; return status();
        case 'n': return query ? next(1) : status();
        case 'N': return query ? next(-1) : status();
        default: if (ctrlC) return close();
      }
    };
    addEventListener('keydown', onKey, true);
    body.addEventListener('scroll', status, { passive: true });
    el.querySelector('.q').addEventListener('click', close);
    document.activeElement?.blur?.();
    status();
  });
}
