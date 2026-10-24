// nano: a real editor, full screen, for what you may write: anything in /tmp, and ~/.bashrc. Other files open too,
// to look at; saving those gives the error the real one would. The keys of the real one: ^O writes, ^X exits (and asks
// first when there are changes), ^K cuts a line, ^U pastes it, ^W searches, ^G helps. On a phone: the buttons below
import { print, span, esc, state, focusInput } from '../core.js';
import { resolve, cannotWrite, writeFile, isDevNull } from '../filesystem.js';
import { htmlToText } from '../shell.js';

const KEYS = [['^G', 'Help'], ['^O', 'Write Out'], ['^W', 'Where Is'], ['^K', 'Cut'], ['^U', 'Paste'], ['^X', 'Exit']];
const HELP = 'nano: ^O save · ^X exit · ^K cut line · ^U paste · ^W search · ^C where am I · arrows move · ^G this help';

export async function nano(args) {
  const path = args.find(a => !a.startsWith('-') || a === '-');
  if (state.capture) { state.failed = true; return print(span('e', 'nano: needs a screen, not a pipe')); }
  let text = '', note = path ? '' : '[ New Buffer ]';
  if (path) {
    const r = resolve(path);
    if (r.error === 'denied') note = `[ Error reading ${path}: Permission denied ]`;
    else if (!r.error && r.node.type === 'dir') { state.failed = true; return print(span('e', `nano: ${esc(path)} is a directory`)); }
    else if (!r.error) {
      state.silent = true;
      try { text = r.node.mine ? r.node.text : r.node.exec ? '' : htmlToText(r.node.read()).join('\n') + '\n'; } finally { state.silent = false; }
      const n = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
      note = cannotWrite(path) && !isDevNull(path) ? `[ Read ${n} lines (Warning: No write permission) ]` : `[ Read ${n} line${n === 1 ? '' : 's'} ]`;
    } else note = '[ New File ]';
  }
  return edit(path, text, note);
}

function edit(path, text, note) {
  return new Promise(done => {
    let name = path || '', saved = text, cut = '', asking = null;
    const el = document.createElement('div');
    el.id = 'nano';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<div class="top inv"><span>  GNU nano 7.2</span><span class="name"></span><span class="mod"></span></div>
      <textarea spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"></textarea>
      <div class="msg"></div><div class="ask"><span class="q"></span><input type="text" spellcheck="false" autocapitalize="off"></div>
      <div class="keys">${KEYS.map(([k, w]) => `<button type="button" data-k="${k}"><span class="inv">${k}</span> ${w}</button>`).join('')}</div>`;
    document.body.appendChild(el);
    const ta = el.querySelector('textarea'), msg = el.querySelector('.msg'), askRow = el.querySelector('.ask'), askQ = el.querySelector('.ask .q'), askIn = el.querySelector('.ask input');
    ta.value = text;
    const modified = () => ta.value !== saved;
    const top = () => {
      el.setAttribute('aria-label', 'nano ' + (name || 'New Buffer'));
      el.querySelector('.name').textContent = name || 'New Buffer';
      el.querySelector('.mod').textContent = modified() ? 'Modified  ' : '';
    };
    const say = t => { msg.textContent = t; };
    say(note); top();
    ta.focus(); ta.setSelectionRange(0, 0);

    const close = () => {
      removeEventListener('keydown', onKey, true);
      el.remove();
      focusInput();
      done();
    };
    // a question on the line above the keys: a file name, a search, or yes/no
    const ask = (q, value, then) => { asking = then; askQ.textContent = q; askIn.value = value; askRow.classList.add('on'); askIn.focus(); };
    const answered = v => { const then = asking; asking = null; askRow.classList.remove('on'); ta.focus(); then(v); };
    const write = (to, after) => {
      if (!to) return ask('File Name to Write: ', '', v => v === null ? say('[ Cancelled ]') : write(v, after));
      const content = ta.value && !ta.value.endsWith('\n') ? ta.value + '\n' : ta.value;
      const err = isDevNull(to) ? null : writeFile(to, content);
      if (err) return say(`[ Error writing ${to}: ${err} ]`);
      name = to; saved = ta.value; top();
      const n = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
      say(`[ Wrote ${n} line${n === 1 ? '' : 's'} ]`);
      after?.();
    };
    const exit = () => {
      if (!modified()) return close();
      ask('Save modified buffer?  (Y)es  (N)o  ^C Cancel ', '', v => {
        if (v === null) return say('[ Cancelled ]');
        if (/^n/i.test(v)) return close();
        if (/^y/i.test(v)) return write(name, close);
        exit();
      });
    };
    const line = () => { const p = ta.selectionStart, s = ta.value.lastIndexOf('\n', p - 1) + 1, e = ta.value.indexOf('\n', p); return [s, e < 0 ? ta.value.length : e + 1]; };
    const where = () => {
      const before = ta.value.slice(0, ta.selectionStart), l = before.split('\n').length, all = ta.value.split('\n').length;
      say(`[ line ${l}/${all} (${Math.round(l / all * 100)}%), col ${before.length - before.lastIndexOf('\n')} ]`);
    };
    const act = k => {
      if (k === '^O') return write(name);
      if (k === '^X') return exit();
      if (k === '^G') return say(HELP);
      if (k === '^K') { const [s, e] = line(); cut = ta.value.slice(s, e); ta.setRangeText('', s, e, 'start'); top(); return; }
      if (k === '^U') { if (cut) { ta.setRangeText(cut, ta.selectionStart, ta.selectionStart, 'end'); top(); } return; }
      if (k === '^W') return ask('Search: ', '', q => {
        if (!q) return say('[ Cancelled ]');
        let i = ta.value.indexOf(q, ta.selectionEnd);
        if (i < 0) { i = ta.value.indexOf(q); if (i >= 0) say('[ Search Wrapped ]'); }
        if (i < 0) return say(`[ "${q}" not found ]`);
        ta.setSelectionRange(i, i + q.length);
      });
      if (k === '^C') return where();
    };
    const onKey = e => {
      // everything stays inside the editor; the terminal underneath gets none of it
      e.stopPropagation();
      if (asking) {
        if (e.key === 'Enter') { e.preventDefault(); return answered(askIn.value); }
        if (e.key === 'Escape' || (e.ctrlKey && e.key.toLowerCase() === 'c')) { e.preventDefault(); return answered(null); }
        // yes/no answers do not need Enter
        if (askQ.textContent.startsWith('Save modified') && /^[yn]$/i.test(e.key)) { e.preventDefault(); return answered(e.key); }
        return;
      }
      const ctrl = e.ctrlKey && !e.altKey && !e.metaKey;
      if (!ctrl) { queueMicrotask(top); return; }
      const k = '^' + e.key.toUpperCase();
      // Ctrl+C with a selection copies, like everywhere else; without one it says where you are, like nano
      if (k === '^C' && ta.selectionStart !== ta.selectionEnd) return;
      if (k === '^S') { e.preventDefault(); return act('^O'); }
      if (['^O', '^X', '^G', '^K', '^U', '^W', '^C'].includes(k)) { e.preventDefault(); act(k); }
    };
    addEventListener('keydown', onKey, true);
    ta.addEventListener('input', top);
    el.querySelector('.keys').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { act(b.dataset.k); if (!asking) ta.focus(); } });
  });
}
